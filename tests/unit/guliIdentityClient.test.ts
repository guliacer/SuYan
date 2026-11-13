import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Issuer, custom } from "openid-client";

const avatarState = vi.hoisted(() => ({ dataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => avatarState.dataDir },
  net: {},
}));

const networkLogs = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("../../electron/main/appLogger", () => ({ logger: networkLogs }));

const oidcMock = vi.hoisted(() => {
  const httpOptions = Symbol("http_options");
  const clients: FakeClient[] = [];
  const discovery = vi.fn();
  const clientMethods = {
    authorizationUrl: vi.fn(),
    callbackParams: vi.fn(),
    callback: vi.fn(),
    userinfo: vi.fn(),
    refresh: vi.fn(),
    revoke: vi.fn(),
    deviceAuthorization: vi.fn(),
  };

  class FakeClient {
    issuer = { metadata: { device_authorization_endpoint: "https://auth.example.test/device/auth" } };
    deviceAuthorization(...args: unknown[]) { return clientMethods.deviceAuthorization(...args); }
    public readonly options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      clients.push(this);
    }

    authorizationUrl(...args: unknown[]): string {
      return clientMethods.authorizationUrl(...args) as string;
    }

    callbackParams(...args: unknown[]): Record<string, string> {
      return clientMethods.callbackParams(...args) as Record<string, string>;
    }

    callback(...args: unknown[]): Promise<unknown> {
      return clientMethods.callback(...args) as Promise<unknown>;
    }

    userinfo(...args: unknown[]): Promise<unknown> {
      return clientMethods.userinfo(...args) as Promise<unknown>;
    }

    refresh(...args: unknown[]): Promise<unknown> {
      return clientMethods.refresh(...args) as Promise<unknown>;
    }

    revoke(...args: unknown[]): Promise<unknown> {
      return clientMethods.revoke(...args) as Promise<unknown>;
    }
  }

  return { discovery, clientMethods, FakeClient, httpOptions, clients };
});

vi.mock("openid-client", () => ({
  Issuer: { discover: oidcMock.discovery },
  generators: {},
  custom: { http_options: oidcMock.httpOptions },
}));

import {
  buildGuliAuthorizationUrl,
  exchangeGuliAuthorizationCode,
  fetchGuliAccountUser,
  getGuliIdentityConfig,
  linkGuliIdentity,
  refreshGuliSession,
  requestGuliBackupKey,
  resetGuliIdentityClientForTests,
  startGuliDeviceAuthorization,
  startGuliIdentityLink,
  unlinkGuliIdentity,
} from "../../electron/main/account/oauth/guliIdentityClient";

const discoveryMetadata = {
  issuer: "https://auth.example.test",
  authorization_endpoint: "https://auth.example.test/authorize",
  token_endpoint: "https://auth.example.test/token",
  userinfo_endpoint: "https://auth.example.test/userinfo",
  jwks_uri: "https://auth.example.test/jwks",
  code_challenge_methods_supported: ["S256"],
};

const temporaryDirectories: string[] = [];

describe("device token boundary", () => {
  function device(overrides: Record<string, unknown> = {}) {
    return { user_code: "ABCD-EFGH", verification_uri: "https://auth.example.test/device", expires_in: 600,
      abort: vi.fn(), expired: () => false,
      poll: vi.fn().mockResolvedValue(tokenSet({ id_token: "validated-by-client", claims: () => claims({ amr: ["federated", "github"] }) })), ...overrides };
  }
  it("maps validated identity and actual login channel without exporting the handle", async () => {
    oidcMock.clientMethods.deviceAuthorization.mockResolvedValue(device());
    const flow = await startGuliDeviceAuthorization();
    expect(flow).not.toHaveProperty("device_code");
    expect(await flow.wait()).toMatchObject({ loginProvider: "github", accessToken: "access-1" });
  });
  it.each(["https://evil.test/device", "http://auth.example.test/device", "https://user:pass@auth.example.test/device"])("rejects an unsafe verification URI %s", async (uri) => {
    const handle = device({ verification_uri: uri });
    oidcMock.clientMethods.deviceAuthorization.mockResolvedValue(handle);
    await expect(startGuliDeviceAuthorization()).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_PROVIDER_ERROR" });
    expect(handle.abort).toHaveBeenCalled();
  });
  it("rejects tokens without an ID token", async () => {
    oidcMock.clientMethods.deviceAuthorization.mockResolvedValue(device({ poll: vi.fn().mockResolvedValue(tokenSet()) }));
    await expect((await startGuliDeviceAuthorization()).wait()).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_PROVIDER_ERROR" });
  });
  it.each([['access_denied', 'ACCOUNT_OAUTH_CANCELLED'], ['expired_token', 'ACCOUNT_OAUTH_EXPIRED'], ['invalid_grant', 'ACCOUNT_OAUTH_PROVIDER_ERROR']])("sanitizes %s including any raw device secret", async (code, expected) => {
    oidcMock.clientMethods.deviceAuthorization.mockResolvedValue(device({ poll: vi.fn().mockRejectedValue({ error: code, message: "private-device-secret" }) }));
    try { await (await startGuliDeviceAuthorization()).wait(); throw new Error("expected rejection"); }
    catch (error) {
      expect(error).toMatchObject({ code: expected });
      expect(String(error)).not.toContain("private-device-secret");
    }
  });
});

function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://auth.example.test",
    sub: "subject-1",
    email: "user@example.com",
    email_verified: true,
    name: "Guli 用户",
    ...overrides,
  };
}

function tokenSet(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_at: 1_900_000_000,
    claims: () => claims(),
    ...overrides,
  };
}

beforeEach(() => {
  oidcMock.clientMethods.deviceAuthorization.mockReset();
  avatarState.dataDir = "";
  process.env.GULI_IDENTITY_ISSUER = "https://auth.example.test";
  process.env.GULI_IDENTITY_CLIENT_ID = "client-1";
  process.env.GULI_IDENTITY_REDIRECT_URI = "suyan://oauth/callback";
  process.env.GULI_IDENTITY_SCOPES = "openid email";
  resetGuliIdentityClientForTests();
  oidcMock.clients.length = 0;
  networkLogs.warn.mockClear();
  networkLogs.error.mockClear();
  oidcMock.discovery.mockReset();
  oidcMock.discovery.mockResolvedValue({
    metadata: { ...discoveryMetadata },
    Client: oidcMock.FakeClient,
  });
  oidcMock.clientMethods.authorizationUrl.mockReset();
  oidcMock.clientMethods.callbackParams.mockReset();
  oidcMock.clientMethods.callback.mockReset();
  oidcMock.clientMethods.userinfo.mockReset();
  oidcMock.clientMethods.refresh.mockReset();
  oidcMock.clientMethods.revoke.mockReset();
  oidcMock.clientMethods.authorizationUrl.mockReturnValue(
    "https://auth.example.test/authorize?state=s",
  );
  oidcMock.clientMethods.callbackParams.mockReturnValue({ code: "code-1" });
  oidcMock.clientMethods.callback.mockResolvedValue(tokenSet());
  oidcMock.clientMethods.userinfo.mockResolvedValue({
    email: "user@example.com",
    email_verified: true,
    name: "Guli 用户",
    picture: "https://auth.example.test/avatar.png",
  });
  oidcMock.clientMethods.refresh.mockResolvedValue({
    access_token: "access-2",
    refresh_token: "refresh-2",
    expires_at: 1_900_000_100,
  });
});

afterEach(async () => {
  delete process.env.GULI_IDENTITY_ISSUER;
  delete process.env.GULI_IDENTITY_CLIENT_ID;
  delete process.env.GULI_IDENTITY_REDIRECT_URI;
  delete process.env.GULI_IDENTITY_SCOPES;
  delete process.env.SUYAN_GULI_IDENTITY_CONFIG;
  resetGuliIdentityClientForTests();
  avatarState.dataDir = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("guliIdentityClient", () => {
  it("备份密钥接口带真实 Bearer，GET 绑定指定 keyId；旧服务明确拒绝", async () => {
    const data = { subject: "fixture-account", keyId: "test-backup-key-0001", key: Buffer.alloc(32, 7).toString("base64") };
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const created = await requestGuliBackupKey("fixture-token");
      expect(created.uid).toBe("https://auth.example.test#fixture-account");
      expect(created.key.length).toBe(32);
      expect(fetchMock.mock.calls[0]).toEqual(["https://auth.example.test/v1/account/backup-keys", expect.objectContaining({ method: "POST", redirect: "error", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer fixture-token" }), body: JSON.stringify({ purpose: "suyan-ai-settings" }) })]);
      await requestGuliBackupKey("fixture-token", data.keyId);
      expect(fetchMock.mock.calls[1][0]).toBe(`https://auth.example.test/v1/account/backup-keys/${data.keyId}`);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...data, keyId: "test-backup-key-0002" } }), { status: 200 }));
      await expect(requestGuliBackupKey("fixture-token", data.keyId)).rejects.toThrow(/响应无效/);
      fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
      await expect(requestGuliBackupKey("fixture-token")).rejects.toThrow(/尚未启用/);
    } finally { vi.unstubAllGlobals(); }
  });

  it("读取公共 PKCE 客户端配置并规范化 scope", () => {
    process.env.GULI_IDENTITY_SCOPES = "openid email email";
    expect(getGuliIdentityConfig()).toEqual({
      issuer: "https://auth.example.test",
      clientId: "client-1",
      redirectUri: "suyan://oauth/callback",
      scopes: "openid email",
    });
  });

  it("缺少 client_id 或使用不安全配置时拒绝", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-guli-config-test-"));
    temporaryDirectories.push(directory);
    const explicitConfigPath = path.join(directory, "guli-identity.env");
    await fs.writeFile(explicitConfigPath, "GULI_IDENTITY_CLIENT_ID=\n", "utf8");
    process.env.SUYAN_GULI_IDENTITY_CONFIG = explicitConfigPath;
    delete process.env.GULI_IDENTITY_CLIENT_ID;
    expect(() => getGuliIdentityConfig()).toThrowError(/client_id/);

    process.env.GULI_IDENTITY_CLIENT_ID = "client-1";
    process.env.GULI_IDENTITY_ISSUER = "http://auth.example.test";
    expect(() => getGuliIdentityConfig()).toThrowError(/HTTPS/);
  });

  it("Discovery 自动读取端点并固定使用 S256 + public none 客户端", async () => {
    const url = await buildGuliAuthorizationUrl({
      state: "state-1",
      nonce: "nonce-1",
      codeChallenge: "challenge-1",
    });
    expect(url).toContain("authorize");
    expect(oidcMock.discovery).toHaveBeenCalledWith(
      "https://auth.example.test",
    );
    const client = oidcMock.clientMethods.authorizationUrl;
    expect(client).toHaveBeenCalledWith({
      response_type: "code",
      client_id: "client-1",
      redirect_uri: "suyan://oauth/callback",
      scope: "openid email",
      prompt: "login consent",
      state: "state-1",
      nonce: "nonce-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
    });
  });

  it("明确请求 consent 时不重复拼接，并保留用户确认要求", async () => {
    await buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c", prompt: "consent" });
    expect(oidcMock.clientMethods.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ prompt: "consent" }));
  });

  it("隧道不可用时报告服务不可用，不生成授权地址", async () => {
    oidcMock.discovery.mockRejectedValue({ response: { statusCode: 530 } });
    await expect(buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" }))
      .rejects.toMatchObject({ code: "ACCOUNT_PROVIDER_UNAVAILABLE", message: expect.stringContaining("530") });
    expect(oidcMock.clientMethods.authorizationUrl).not.toHaveBeenCalled();
  });

  it("Discovery、密钥和令牌请求都等待 15 秒，保留已有请求头", async () => {
    await buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" });
    const issuer = await oidcMock.discovery.mock.results[0].value;
    const options = { timeout: 3500, headers: { accept: "application/json" } };
    for (const target of [Issuer, issuer, oidcMock.clients[0]]) {
      const hook = Reflect.get(target, custom.http_options);
      expect(hook).toBeTypeOf("function");
      expect(hook(new URL("https://auth.example.test"), options)).toEqual({ ...options, timeout: 15000 });
    }
  });

  it.each([
    { code: "ECONNRESET" },
    { code: "EAI_AGAIN" },
    { response: { statusCode: 530 } },
    { response: { statusCode: 503 } },
    { name: "RPError", message: "outgoing request timed out after 3500ms" },
  ])("首次连接抖动后自动恢复：%j", async (error) => {
    oidcMock.discovery.mockRejectedValueOnce(error);
    await expect(buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" })).resolves.toContain("authorize");
    expect(oidcMock.discovery).toHaveBeenCalledTimes(2);
    expect(networkLogs.warn).toHaveBeenCalledWith("main", "oauth:discovery-retry", expect.objectContaining({ attempt: 1, maxAttempts: 2 }));
    expect(networkLogs.error).not.toHaveBeenCalled();
  });

  it("并发登录共用恢复任务，成功后复用缓存", async () => {
    oidcMock.discovery.mockRejectedValueOnce({ code: "ECONNRESET" });
    const input = { state: "s", nonce: "n", codeChallenge: "c" };
    await Promise.all([buildGuliAuthorizationUrl(input), buildGuliAuthorizationUrl(input)]);
    await buildGuliAuthorizationUrl(input);
    expect(oidcMock.discovery).toHaveBeenCalledTimes(2);
    expect(oidcMock.clients).toHaveLength(1);
  });

  it("持续超时只尝试两次，错误明确且日志不含原始凭据", async () => {
    const secret = "fixture-private-authorization-code";
    oidcMock.discovery.mockRejectedValue(Object.assign(new Error("outgoing request timed out after 3500ms"), { response: undefined, authorization: secret, name: "RPError" }));
    await expect(buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" }))
      .rejects.toMatchObject({ code: "ACCOUNT_NETWORK_ERROR", message: expect.stringContaining("超时") });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(2);
    expect(oidcMock.clientMethods.authorizationUrl).not.toHaveBeenCalled();
    expect(networkLogs.error).toHaveBeenCalledWith("main", "oauth:discovery-failed", expect.objectContaining({ attempts: 2, code: "ACCOUNT_NETWORK_ERROR" }));
    expect(JSON.stringify([networkLogs.warn.mock.calls, networkLogs.error.mock.calls])).not.toContain(secret);
  });

  it("连接故障最终失败后仍可再次发起登录", async () => {
    oidcMock.discovery.mockRejectedValueOnce({ code: "ECONNREFUSED" }).mockRejectedValueOnce({ code: "ECONNREFUSED" });
    const input = { state: "s", nonce: "n", codeChallenge: "c" };
    await expect(buildGuliAuthorizationUrl(input)).rejects.toMatchObject({ code: "ACCOUNT_NETWORK_ERROR" });
    await expect(buildGuliAuthorizationUrl(input)).resolves.toContain("authorize");
    expect(oidcMock.discovery).toHaveBeenCalledTimes(3);
  });

  it("证书错误不重试，不关闭证书校验", async () => {
    oidcMock.discovery.mockRejectedValueOnce({ code: "CERT_HAS_EXPIRED" });
    await expect(buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" }))
      .rejects.toMatchObject({ code: "ACCOUNT_PROVIDER_UNAVAILABLE", message: expect.stringContaining("证书") });
    expect(oidcMock.discovery).toHaveBeenCalledTimes(1);
    expect(oidcMock.clientMethods.authorizationUrl).not.toHaveBeenCalled();
  });

  it("将用户选择的登录方式写入 login_hint", async () => {
    await buildGuliAuthorizationUrl({
      state: "state-google",
      nonce: "nonce-google",
      codeChallenge: "challenge-google",
      loginProvider: "google",
    });

    expect(oidcMock.clientMethods.authorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ login_hint: "google" }),
    );
  });

  it("将登录渠道与邮箱提示分开传递，且不携带密码", async () => {
    await buildGuliAuthorizationUrl({
      state: "state-email",
      nonce: "nonce-email",
      codeChallenge: "challenge-email",
      loginProvider: "email",
      emailHint: "user@example.com",
    });

    expect(oidcMock.clientMethods.authorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ login_hint: "email", email_hint: "user@example.com" }),
    );
    expect(oidcMock.clientMethods.authorizationUrl.mock.calls[0]?.[0]).not.toHaveProperty(
      "password",
    );
  });

  it("切换第三方账号使用登录服务支持的 prompt=select_account", async () => {
    await buildGuliAuthorizationUrl({
      state: "state-switch",
      nonce: "nonce-switch",
      codeChallenge: "challenge-switch",
      prompt: "select_account",
    });

    expect(oidcMock.clientMethods.authorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "select_account consent" }),
    );
  });

  it("Discovery 返回 HTTP 端点、错误 issuer 或不支持 S256 时拒绝", async () => {
    oidcMock.discovery.mockResolvedValueOnce({
      metadata: {
        ...discoveryMetadata,
        token_endpoint: "http://auth.example.test/token",
      },
      Client: oidcMock.FakeClient,
    });
    await expect(
      buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" }),
    ).rejects.toThrowError(/token_endpoint.*HTTPS/);

    resetGuliIdentityClientForTests();
    oidcMock.discovery.mockResolvedValueOnce({
      metadata: { ...discoveryMetadata, issuer: "https://evil.example.test" },
      Client: oidcMock.FakeClient,
    });
    await expect(
      buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" }),
    ).rejects.toThrowError(/issuer/);

    resetGuliIdentityClientForTests();
    oidcMock.discovery.mockResolvedValueOnce({
      metadata: {
        ...discoveryMetadata,
        code_challenge_methods_supported: ["plain"],
      },
      Client: oidcMock.FakeClient,
    });
    await expect(
      buildGuliAuthorizationUrl({ state: "s", nonce: "n", codeChallenge: "c" }),
    ).rejects.toThrowError(/S256/);
  });

  it("交换授权码时校验 state、nonce、verifier，并使用 issuer + sub 生成稳定身份", async () => {
    const session = await exchangeGuliAuthorizationCode(
      "suyan://oauth/callback?code=code-1",
      { state: "state-1", nonce: "nonce-1", codeVerifier: "verifier-1" },
    );
    expect(session.user).toMatchObject({
      uid: "https://auth.example.test#subject-1",
      username: "Guli 用户",
      email: "user@example.com",
      avatarUrl: "https://auth.example.test/avatar.png",
      identities: [
        {
          provider: "guli",
          issuer: "https://auth.example.test",
          providerUserId: "subject-1",
        },
      ],
    });
    expect(oidcMock.clientMethods.callback).toHaveBeenCalledWith(
      "suyan://oauth/callback",
      { code: "code-1" },
      { state: "state-1", nonce: "nonce-1", code_verifier: "verifier-1" },
    );
    expect(oidcMock.clientMethods.userinfo).toHaveBeenCalledWith("access-1");
  });

  it("资料刷新使用服务端昵称和完整身份清单，并把头像缓存为本地协议地址", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-avatar-client-"));
    temporaryDirectories.push(dataDir);
    avatarState.dataDir = dataDir;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              displayName: "服务端昵称",
              identities: [
                { provider: "guli", providerUserId: "subject-1" },
                { provider: "email", providerUserId: "user@example.com" },
                { provider: "google", providerUserId: "google-1" },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: { hasAvatar: true, contentType: "image/png" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const user = await fetchGuliAccountUser("access-1", {
      uid: "https://auth.example.test#subject-1",
      username: "旧昵称",
    });

    expect(user).toMatchObject({
      uid: "https://auth.example.test#subject-1",
      username: "服务端昵称",
      identities: [
        { provider: "guli", providerUserId: "subject-1" },
        { provider: "email", providerUserId: "user@example.com" },
        { provider: "google", providerUserId: "google-1" },
      ],
    });
    expect(user.avatarUrl).toMatch(/^app-account-avatar:\/\/avatar\/[a-f0-9]{64}\?v=[a-f0-9]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("email_verified 非 true 时拒绝，userinfo 失败不阻断已验证 ID Token", async () => {
    oidcMock.clientMethods.callback.mockResolvedValueOnce(
      tokenSet({ claims: () => claims({ email_verified: false }) }),
    );
    await expect(
      exchangeGuliAuthorizationCode("suyan://oauth/callback?code=code-1", {
        state: "state-1",
        nonce: "nonce-1",
        codeVerifier: "verifier-1",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_EMAIL_NOT_VERIFIED" });

    resetGuliIdentityClientForTests();
    oidcMock.clientMethods.callback.mockResolvedValueOnce(tokenSet());
    oidcMock.clientMethods.userinfo.mockRejectedValueOnce(
      new Error("userinfo offline"),
    );
    const session = await exchangeGuliAuthorizationCode(
      "suyan://oauth/callback?code=code-1",
      {
        state: "state-1",
        nonce: "nonce-1",
        codeVerifier: "verifier-1",
      },
    );
    expect(session.user.email).toBe("user@example.com");
  });

  it("仅接受已签名的无邮箱主体账户标记，不导入上游未验证邮箱", async () => {
    oidcMock.clientMethods.callback.mockResolvedValueOnce(tokenSet({ claims: () => claims({ email: undefined, email_verified: false, guli_account_kind: "external_subject" }) }));
    const result = await exchangeGuliAuthorizationCode("suyan://oauth/callback?code=code-1", { state: "s", nonce: "n", codeVerifier: "v" });
    expect(result.user.uid).toBe("https://auth.example.test#subject-1");
    expect(result.user.email).toBeUndefined();
  });

  it.each([
    { email: undefined, email_verified: false, amr: ["federated", "linuxdo"] },
    { email: "unverified@example.com", email_verified: false, guli_account_kind: "external_subject" },
    { email: undefined, email_verified: false, guli_account_kind: "unknown" },
  ])("主体账户例外不能由提示或用户资料伪造：%j", async (invalid) => {
    oidcMock.clientMethods.callback.mockResolvedValueOnce(tokenSet({ claims: () => claims(invalid) }));
    oidcMock.clientMethods.userinfo.mockResolvedValueOnce({ guli_account_kind: "external_subject", email_verified: true });
    await expect(exchangeGuliAuthorizationCode("suyan://oauth/callback?code=c", { state: "s", nonce: "n", codeVerifier: "v" })).rejects.toMatchObject({ code: "ACCOUNT_EMAIL_NOT_VERIFIED" });
  });

  it("刷新令牌支持轮换，缺少 refresh token 时明确失败", async () => {
    await expect(refreshGuliSession("refresh-1")).resolves.toEqual({
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: 1_900_000_100_000,
    });
    expect(oidcMock.clientMethods.refresh).toHaveBeenCalledWith("refresh-1");
    await expect(refreshGuliSession("")).rejects.toMatchObject({
      code: "ACCOUNT_REFRESH_FAILED",
    });
  });

  it("通过当前令牌创建浏览器绑定事务，只打开同源固定路由", async () => {
    const linkUrl = "https://auth.example.test/v1/oauth/link/abcdefghijklmnopqrstuvwxyz123456";
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, data: { linkUrl } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await startGuliIdentityLink("current-token", "linuxdo")).toBe(linkUrl);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://auth.example.test/v1/account/link/linuxdo/start");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer current-token" }) });
    for (const invalid of ["https://evil.example/link", "https://auth.example.test@evil.example/link", linkUrl + "?token=bad", "https://auth.example.test/logout"]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { linkUrl: invalid } }), { status: 200 }));
      await expect(startGuliIdentityLink("current-token", "linuxdo")).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_PROVIDER_ERROR" });
    }
  });

  it("保留服务端绑定冲突和最后方式错误，不把它们误报为网络错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "ACCOUNT_LINK_CONFLICT", message: "该登录方式已经绑定到其他账号" },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(linkGuliIdentity("current-token", "target-token", "google")).rejects.toMatchObject({
      code: "ACCOUNT_ALREADY_LINKED",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "ACCOUNT_LINK_LAST_NOT_ALLOWED", message: "不能解绑最后一个账号" },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(unlinkGuliIdentity("current-token", "google")).rejects.toMatchObject({
      code: "ACCOUNT_LINK_LAST_NOT_ALLOWED",
    });
  });
});
