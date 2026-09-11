import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";

/**
 * 端到端冒烟测试：真实 HTTP 服务（127.0.0.1 随机端口，内存 SQLite），
 * 覆盖方案 §二十九 的账号/导出验收链路：register → verify → login →
 * me → refresh → logout，以及 OAuth Mock 全流程（PKCE + state + 代交换 + 账号切换 + 拒绝）。
 */

const REDIRECT_URI = "suyan://oauth/callback";

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

type ApiClient = {
  baseUrl: string;
  post: (path: string, body: unknown, token?: string) => Promise<{ status: number; json: any }>;
  get: (path: string, token?: string) => Promise<{ status: number; json: any }>;
};

let server: Server | null = null;
let client: ApiClient;

beforeEach(async () => {
  const app = buildApp({
    env: {
      ...process.env,
      DB_PATH: ":memory:",
      JWT_SECRET: "smoke-test-secret",
      MOCK_OAUTH: "1",
      EMAIL_VERIFY_MODE: "auto",
      PORT: "0",
    },
    dbPath: ":memory:",
  });
  server = app.createServer();
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  client = {
    baseUrl,
    post: async (path, body, token) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: await response.json().catch(() => null) };
    },
    get: async (path, token) => {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { status: response.status, json: await response.json().catch(() => null) };
    },
  };
});

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = null;
});

describe("邮箱全链路", () => {
  it("register → login → me → refresh（轮换）→ logout 完整可用", async () => {
    const registered = await client.post("/auth/register", { email: "alice@example.com", password: "secret123" });
    expect(registered.status).toBe(200);
    const session = registered.json.session;
    expect(session.user.email).toBe("alice@example.com");
    expect(session.user.emailVerified).toBe(true);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(typeof session.expiresAt).toBe("number");

    // 登录
    const loggedIn = await client.post("/auth/login", { email: "alice@example.com", password: "secret123" });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.json.session.user.uid).toBe(session.user.uid);

    // 密码错误
    const wrong = await client.post("/auth/login", { email: "alice@example.com", password: "wrong-pass" });
    expect(wrong.status).toBe(401);
    expect(wrong.json.code).toBe("ACCOUNT_INVALID_CREDENTIALS");

    // me
    const me = await client.get("/auth/me", loggedIn.json.session.accessToken);
    expect(me.status).toBe(200);
    expect(me.json.user.uid).toBe(session.user.uid);

    // refresh 轮换：旧 refreshToken 立即失效
    const refreshed = await client.post("/auth/refresh", { refreshToken: loggedIn.json.session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.json.session.refreshToken).not.toBe(loggedIn.json.session.refreshToken);

    const replay = await client.post("/auth/refresh", { refreshToken: loggedIn.json.session.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.json.code).toBe("ACCOUNT_REFRESH_FAILED");

    // 新 accessToken 有效
    const meAfter = await client.get("/auth/me", refreshed.json.session.accessToken);
    expect(meAfter.status).toBe(200);

    // 无 token 访问 me
    const anonymous = await client.get("/auth/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.json.code).toBe("ACCOUNT_NOT_LOGGED_IN");

    // logout 后旧 accessToken 不再可 me（用户仍存在，但会话已清）
    const loggedOut = await client.post("/auth/logout", { refreshToken: refreshed.json.session.refreshToken }, refreshed.json.session.accessToken);
    expect(loggedOut.status).toBe(200);
  });

  it("重复注册返回 ACCOUNT_INVALID_CREDENTIALS（409）", async () => {
    await client.post("/auth/register", { email: "bob@example.com", password: "secret123" });
    const again = await client.post("/auth/register", { email: "bob@example.com", password: "secret123" });
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("ACCOUNT_INVALID_CREDENTIALS");
  });
});

describe("邮件验证占位（EMAIL_VERIFY_MODE=token）", () => {
  it("注册返回 verificationRequired，验证后可登录；未验证登录被拒", async () => {
    const app = buildApp({
      env: {
        ...process.env,
        DB_PATH: ":memory:",
        JWT_SECRET: "smoke-test-secret",
        MOCK_OAUTH: "1",
        EMAIL_VERIFY_MODE: "token",
      },
      dbPath: ":memory:",
    });
    const srv = app.createServer();
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const port = (srv.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;

    const registered = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@example.com", password: "secret123" }),
    });
    const registeredJson = (await registered.json()) as any;
    expect(registeredJson.verificationRequired).toBe(true);
    const verifyUrl = registeredJson.devVerifyUrl as string;
    expect(verifyUrl.startsWith("/auth/verify-email?token=")).toBe(true);

    const token = new URL(verifyUrl, base).searchParams.get("token")!;

    // 未验证登录被拒
    const loginBefore = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@example.com", password: "secret123" }),
    });
    expect(loginBefore.status).toBe(403);
    expect((await loginBefore.json() as any).code).toBe("ACCOUNT_EMAIL_NOT_VERIFIED");

    // 验证后可登录
    const verify = await fetch(`${base}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(verify.status).toBe(200);

    const loginAfter = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "carol@example.com", password: "secret123" }),
    });
    expect(loginAfter.status).toBe(200);

    await new Promise<void>((resolve) => srv.close(() => resolve()));
    app.close();
  });
});

describe("OAuth Mock 全流程（PKCE + state + 代交换）", () => {
  async function runMockOAuth(provider: string, mockUser: string, challenge: string, state: string) {
    const authorize = await fetch(
      `${client.baseUrl}/oauth/mock/${provider}/authorize?client_id=test-app&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`,
    );
    expect(authorize.status).toBe(200);
    const html = await authorize.text();
    expect(html).toContain("模拟授权");

    const form = new URLSearchParams({
      client_id: "test-app",
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      mock_user: mockUser,
    });
    const confirm = await fetch(`${client.baseUrl}/oauth/mock/${provider}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });
    expect(confirm.status).toBe(302);
    const location = confirm.headers.get("location")!;
    expect(location.startsWith(REDIRECT_URI)).toBe(true);
    const callback = new URL(location);
    expect(callback.searchParams.get("state")).toBe(state);
    const code = callback.searchParams.get("code")!;
    expect(code).toBeTruthy();

    return code;
  }

  it("exchange 登录/自动注册 + 账号切换（user-1 → user-2）", async () => {
    const state1 = "state-1";
    const { verifier: v1, challenge: c1 } = pkcePair();
    const code1 = await runMockOAuth("google", "user-1", c1, state1);

    const exchanged1 = await client.post("/auth/oauth/exchange", {
      provider: "google",
      code: code1,
      verifier: v1,
      redirectUri: REDIRECT_URI,
      state: state1,
    });
    expect(exchanged1.status).toBe(200);
    const session1 = exchanged1.json.session;
    expect(session1.user.username).toContain("user-1");
    expect(session1.user.identities).toHaveLength(1);
    expect(session1.user.identities[0].providerUserId).toBe("user-1");

    // 同一 identity 再次登录 → 同一 uid（不产生新用户）
    const state1b = "state-1b";
    const { verifier: v1b, challenge: c1b } = pkcePair();
    const code1b = await runMockOAuth("google", "user-1", c1b, state1b);
    const exchanged1b = await client.post("/auth/oauth/exchange", {
      provider: "google",
      code: code1b,
      verifier: v1b,
      redirectUri: REDIRECT_URI,
      state: state1b,
    });
    expect(exchanged1b.json.session.user.uid).toBe(session1.user.uid);

    // 账号切换：user-2 是新用户
    const state2 = "state-2";
    const { verifier: v2, challenge: c2 } = pkcePair();
    const code2 = await runMockOAuth("google", "user-2", c2, state2);
    const exchanged2 = await client.post("/auth/oauth/exchange", {
      provider: "google",
      code: code2,
      verifier: v2,
      redirectUri: REDIRECT_URI,
      state: state2,
    });
    expect(exchanged2.json.session.user.uid).not.toBe(session1.user.uid);
  });

  it("PKCE 不匹配 / code 重放 / 非法回调地址被拒", async () => {
    const state = "state-bad";
    const { verifier, challenge } = pkcePair();
    const code = await runMockOAuth("google", "user-1", challenge, state);

    // verifier 不匹配
    const wrongVerifier = await client.post("/auth/oauth/exchange", {
      provider: "google",
      code,
      verifier: base64Url(randomBytes(32)),
      redirectUri: REDIRECT_URI,
      state,
    });
    expect(wrongVerifier.status).toBe(400);
    expect(wrongVerifier.json.code).toBe("ACCOUNT_OAUTH_STATE_INVALID");

    // 重放：code 已消费
    const replay = await client.post("/auth/oauth/exchange", {
      provider: "google",
      code,
      verifier,
      redirectUri: REDIRECT_URI,
      state,
    });
    expect(replay.status).toBe(400);
    expect(replay.json.code).toBe("ACCOUNT_OAUTH_STATE_INVALID");

    // 非法回调地址
    const state2 = "state-bad2";
    const { verifier: v2, challenge: c2 } = pkcePair();
    const code2 = await runMockOAuth("google", "user-1", c2, state2);
    const evilRedirect = await client.post("/auth/oauth/exchange", {
      provider: "google",
      code: code2,
      verifier: v2,
      redirectUri: "https://evil.example.com/cb",
      state: state2,
    });
    expect(evilRedirect.status).toBe(400);
  });

  it("拒绝授权 → 回调带 error=access_denied（供客户端 OAUTH_CANCELLED）", async () => {
    const state = "state-deny";
    const { challenge } = pkcePair();
    const form = new URLSearchParams({
      redirect_uri: REDIRECT_URI,
      state,
      code_challenge: challenge,
    });
    const deny = await fetch(`${client.baseUrl}/oauth/mock/google/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      redirect: "manual",
    });
    expect(deny.status).toBe(302);
    const callback = new URL(deny.headers.get("location")!);
    expect(callback.searchParams.get("state")).toBe(state);
    expect(callback.searchParams.get("error")).toBe("access_denied");
  });

  it("link：已登录用户绑定第三方身份；已属他人时拒绝", async () => {
    const emailSession = (await client.post("/auth/register", { email: "link@example.com", password: "secret123" })).json.session;
    const token = emailSession.accessToken;

    const state = "state-link";
    const { verifier, challenge } = pkcePair();
    const code = await runMockOAuth("linuxdo", "linuxdo-user-1", challenge, state);

    const linked = await client.post(
      "/auth/link",
      { provider: "linuxdo", code, verifier, redirectUri: REDIRECT_URI, state },
      token,
    );
    expect(linked.status).toBe(200);
    expect(linked.json.user.identities.some((identity: any) => identity.provider === "linuxdo")).toBe(true);

    // 同一 identity 绑定到另一用户 → LINK_CONFIRM_REQUIRED
    const other = (await client.post("/auth/register", { email: "other@example.com", password: "secret123" })).json.session;
    const state2 = "state-link2";
    const { verifier: v2, challenge: c2 } = pkcePair();
    const code2 = await runMockOAuth("linuxdo", "linuxdo-user-1", c2, state2);
    const conflict = await client.post(
      "/auth/link",
      { provider: "linuxdo", code: code2, verifier: v2, redirectUri: REDIRECT_URI, state: state2 },
      other.accessToken,
    );
    expect(conflict.status).toBe(409);
    expect(conflict.json.code).toBe("ACCOUNT_LINK_CONFIRM_REQUIRED");

    // unlink 后 identity 消失
    const unlinked = await client.post("/auth/unlink", { provider: "linuxdo" }, token);
    expect(unlinked.status).toBe(200);
    expect(unlinked.json.user.identities.some((identity: any) => identity.provider === "linuxdo")).toBe(false);
  });
});
