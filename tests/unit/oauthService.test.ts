import { beforeEach, describe, expect, it, vi } from "vitest";

const openAuthorizationWindowMock = vi.hoisted(() => vi.fn());
const guliMock = vi.hoisted(() => ({
  buildGuliAuthorizationUrl: vi.fn(),
  exchangeGuliAuthorizationCode: vi.fn(),
  getGuliIdentityConfig: vi.fn(),
  isGuliIdentityConfigured: vi.fn(),
  GULI_IDENTITY_PROVIDER: "guli",
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("../../electron/main/account/oauth/guliIdentityClient", () => guliMock);

import {
  handleCallback,
  isOAuthProviderId,
  listOAuthProvidersPublic,
  cancelLogin,
  startLogin,
} from "../../electron/main/account/oauth/oauthService";
import {
  peekPendingOAuthSession,
  putPendingOAuthSession,
  resetOAuthStateForTests,
} from "../../electron/main/account/oauth/oauthState";
import type { AccountSession } from "../../src/features/account/types/account";

const sampleSession: AccountSession = {
  user: { uid: "u-1", username: "素言用户" },
  accessToken: "at-1",
  refreshToken: "rt-1",
  expiresAt: Date.now() + 60_000,
};

beforeEach(() => {
  resetOAuthStateForTests();
  openAuthorizationWindowMock.mockReset();
  openAuthorizationWindowMock.mockResolvedValue(undefined);
  guliMock.buildGuliAuthorizationUrl.mockReset();
  guliMock.exchangeGuliAuthorizationCode.mockReset();
  guliMock.getGuliIdentityConfig.mockReset();
  guliMock.isGuliIdentityConfigured.mockReset();
  guliMock.getGuliIdentityConfig.mockReturnValue({
    issuer: "https://auth.example.test",
    clientId: "client-1",
    redirectUri: "suyan://oauth/callback",
    scopes: "openid email",
  });
  guliMock.isGuliIdentityConfigured.mockReturnValue(true);
  guliMock.buildGuliAuthorizationUrl.mockResolvedValue(
    "https://auth.example.test/authorize?response_type=code&client_id=client-1&code_challenge_method=S256&state=s&redirect_uri=suyan%3A%2F%2Foauth%2Fcallback",
  );
});

describe("oauthService.startLogin", () => {
  it("未知渠道 → ACCOUNT_INPUT_INVALID", async () => {
    await expect(startLogin("myspace")).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
  });

  it("邮箱登录 → 交给系统默认浏览器并返回 started", async () => {
    const result = await startLogin("email", {
      openAuthorizationWindow: openAuthorizationWindowMock,
    });
    expect(result).toMatchObject({ started: true, expiresAt: expect.any(Number) });
    expect(openAuthorizationWindowMock).toHaveBeenCalledTimes(1);
    const url = openAuthorizationWindowMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("https://auth.example.test/authorize");
    expect(openAuthorizationWindowMock).toHaveBeenCalledWith(url);
    const state = guliMock.buildGuliAuthorizationUrl.mock.calls[0]?.[0]?.state as string;
    expect(peekPendingOAuthSession(state)).toMatchObject({
      state,
      loginProvider: "email",
    });
    expect(guliMock.buildGuliAuthorizationUrl).toHaveBeenCalledWith({
      state: expect.any(String),
      nonce: expect.any(String),
      codeChallenge: expect.any(String),
      loginProvider: "email",
    });
  });

  it("第三方登录 → 将实际渠道写入统一身份服务的 login_hint", async () => {
    await startLogin("google", {
      openAuthorizationWindow: openAuthorizationWindowMock,
    });

    expect(guliMock.buildGuliAuthorizationUrl).toHaveBeenCalledWith({
      state: expect.any(String),
      nonce: expect.any(String),
      codeChallenge: expect.any(String),
      loginProvider: "google",
      prompt: "login",
    });
  });

  it("第三方登录默认进入真实的交互式授权流程", async () => {
    await startLogin("github", {
      openAuthorizationWindow: openAuthorizationWindowMock,
    });

    expect(guliMock.buildGuliAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        loginProvider: "github",
        prompt: "login",
      }),
    );
  });

  it("切换账号可显式要求身份服务重新验证", async () => {
    await startLogin("google", {
      openAuthorizationWindow: openAuthorizationWindowMock,
      prompt: "login",
    });

    expect(guliMock.buildGuliAuthorizationUrl).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "login" }),
    );
  });

  it("未配置渠道 → ACCOUNT_PROVIDER_UNAVAILABLE", async () => {
    guliMock.getGuliIdentityConfig.mockImplementation(() => {
      throw { code: "ACCOUNT_PROVIDER_UNAVAILABLE", message: "尚未配置" };
    });
    await expect(
      startLogin("email"),
    ).rejects.toMatchObject({ code: "ACCOUNT_PROVIDER_UNAVAILABLE" });
    await expect(
      startLogin("google"),
    ).rejects.toMatchObject({ code: "ACCOUNT_PROVIDER_UNAVAILABLE" });
    await expect(
      startLogin("guli"),
    ).rejects.toMatchObject({ code: "ACCOUNT_INPUT_INVALID" });
  });

  it("系统浏览器打开失败 → 作废 pending state", async () => {
    openAuthorizationWindowMock.mockRejectedValue(new Error("browser unavailable"));

    await expect(
      startLogin("google", { openAuthorizationWindow: openAuthorizationWindowMock }),
    ).rejects.toMatchObject({ code: "ACCOUNT_NETWORK_ERROR" });

    const state = guliMock.buildGuliAuthorizationUrl.mock.calls[0]?.[0]?.state as string;
    expect(peekPendingOAuthSession(state)).toBeNull();
  });

  it("浏览器事务进行中再次点击 → 保留第一次 state，不让第二次覆盖", async () => {
    await startLogin("google", {
      openAuthorizationWindow: openAuthorizationWindowMock,
    });
    const firstState = guliMock.buildGuliAuthorizationUrl.mock.calls[0]?.[0]?.state as string;

    await expect(
      startLogin("github", { openAuthorizationWindow: openAuthorizationWindowMock }),
    ).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_IN_PROGRESS" });

    expect(peekPendingOAuthSession(firstState)).toMatchObject({
      state: firstState,
      loginProvider: "google",
    });
    expect(guliMock.buildGuliAuthorizationUrl).toHaveBeenCalledTimes(1);
  });

  it("明确取消后可以重新发起浏览器事务", async () => {
    await startLogin("google", {
      openAuthorizationWindow: openAuthorizationWindowMock,
    });
    expect(cancelLogin()).toEqual({ cancelled: true });
    expect(cancelLogin()).toEqual({ cancelled: false });

    await expect(
      startLogin("github", { openAuthorizationWindow: openAuthorizationWindowMock }),
    ).resolves.toMatchObject({ started: true, expiresAt: expect.any(Number) });
    expect(guliMock.buildGuliAuthorizationUrl).toHaveBeenCalledTimes(2);
  });

  it("isOAuthProviderId / 公开列表正确", () => {
    expect(isOAuthProviderId("email")).toBe(true);
    expect(isOAuthProviderId("google")).toBe(true);
    expect(isOAuthProviderId("linuxdo")).toBe(true);
    expect(isOAuthProviderId("github")).toBe(true);
    expect(isOAuthProviderId("guli")).toBe(false);
    expect(isOAuthProviderId("wechat")).toBe(false);
    const list = listOAuthProvidersPublic();
    expect(list.map((p) => p.id)).toEqual([
      "email",
      "google",
      "linuxdo",
      "github",
    ]);
  });
});

describe("oauthService.handleCallback", () => {
  it("非 suyan 协议 / 错误 host / 错误 path → ACCOUNT_OAUTH_PROVIDER_ERROR", async () => {
    await expect(
      handleCallback("https://evil.example.com/cb?code=x"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_PROVIDER_ERROR",
    });
    await expect(
      handleCallback("suyan://wronghost/callback?code=x"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_PROVIDER_ERROR",
    });
    await expect(
      handleCallback("suyan://oauth/other?code=x"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_PROVIDER_ERROR",
    });
  });

  it("error 参数 → 按 access_denied 判 ACCOUNT_OAUTH_CANCELLED，其余判 PROVIDER_ERROR", async () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "cancel-state",
      nonce: "nonce",
      codeVerifier: "verifier",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    await expect(
      handleCallback("suyan://oauth/callback?error=access_denied"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_CANCELLED",
    });
    await expect(
      handleCallback(
        "suyan://oauth/callback?error=access_denied&state=cancel-state",
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_CANCELLED" });
    await expect(
      handleCallback("suyan://oauth/callback?state=cancel-state&code=late"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_STATE_INVALID",
    });
    await expect(
      handleCallback(
        "suyan://oauth/callback?error=server_error&error_description=oops",
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_PROVIDER_ERROR" });

    putPendingOAuthSession({
      provider: "guli",
      loginProvider: "github",
      state: "temporarily-unavailable-state",
      nonce: "temporarily-unavailable-nonce",
      codeVerifier: "temporarily-unavailable-verifier",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    await expect(
      handleCallback(
        "suyan://oauth/callback?error=temporarily_unavailable&state=temporarily-unavailable-state",
      ),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_SERVICE_UNAVAILABLE",
      message: expect.stringContaining("第三方平台"),
    });
  });

  it("缺少 state/code → ACCOUNT_OAUTH_STATE_INVALID", async () => {
    await expect(
      handleCallback("suyan://oauth/callback?code=z"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_STATE_INVALID",
    });
    await expect(
      handleCallback("suyan://oauth/callback?state=s"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_STATE_INVALID",
    });
  });

  it("未知 / 已过期 / 已消费 state → ACCOUNT_OAUTH_STATE_INVALID", async () => {
    await expect(
      handleCallback("suyan://oauth/callback?state=nope&code=z"),
    ).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_STATE_INVALID" });
  });

  it("合法回调 → 单次消费 state → 后端代交换 → 返回 session + provider", async () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "known-state",
      nonce: "known-nonce",
      codeVerifier: "known-verifier",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    guliMock.exchangeGuliAuthorizationCode.mockResolvedValue(sampleSession);

    const result = await handleCallback(
      "suyan://oauth/callback?state=known-state&code=the-code&iss=https%3A%2F%2Fauth.example.test",
    );
    expect(result.provider).toBe("guli");
    expect(result.session.accessToken).toBe("at-1");
    expect(guliMock.exchangeGuliAuthorizationCode).toHaveBeenCalledWith(
      expect.stringContaining("code=the-code"),
      {
        state: "known-state",
        nonce: "known-nonce",
        codeVerifier: "known-verifier",
      },
    );
  });

  it("issuer 不匹配 → ACCOUNT_OAUTH_STATE_INVALID 且不交换授权码", async () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "issuer-state",
      nonce: "nonce",
      codeVerifier: "verifier",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });

    await expect(
      handleCallback(
        "suyan://oauth/callback?state=issuer-state&code=the-code&iss=https%3A%2F%2Fevil.example.test",
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_STATE_INVALID" });
    expect(guliMock.exchangeGuliAuthorizationCode).not.toHaveBeenCalled();
  });

  it("重复回调（state 已消费）→ ACCOUNT_OAUTH_STATE_INVALID，且只交换一次", async () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "s-dup",
      nonce: "n-dup",
      codeVerifier: "v-dup",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    guliMock.exchangeGuliAuthorizationCode.mockResolvedValue(sampleSession);

    await handleCallback("suyan://oauth/callback?state=s-dup&code=c1");
    await expect(
      handleCallback("suyan://oauth/callback?state=s-dup&code=c1"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_OAUTH_STATE_INVALID",
    });
    expect(guliMock.exchangeGuliAuthorizationCode).toHaveBeenCalledTimes(1);
  });

  it("代交换失败（网络/后端）→ 原样抛出 AccountError", async () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "s-net",
      nonce: "n-net",
      codeVerifier: "v-net",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    guliMock.exchangeGuliAuthorizationCode.mockRejectedValue({
      code: "ACCOUNT_NETWORK_ERROR",
      message: "超时",
    });

    await expect(
      handleCallback("suyan://oauth/callback?state=s-net&code=c"),
    ).rejects.toMatchObject({ code: "ACCOUNT_NETWORK_ERROR" });
  });
});
