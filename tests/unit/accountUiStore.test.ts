import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountStore } from "../../src/features/account/store/useAccountStore";

const api = vi.hoisted(() => ({
  accountGetStatus: vi.fn(),
  accountRegisterEmail: vi.fn(),
  accountStartOAuth: vi.fn(),
  accountStartOAuthLink: vi.fn(),
  accountConfirmOAuth: vi.fn(),
  accountCancelOAuth: vi.fn(),
  accountRefresh: vi.fn(),
  accountUnlinkIdentity: vi.fn(),
  accountLogout: vi.fn(),
  accountUpdateProfile: vi.fn(),
  accountChooseAvatar: vi.fn(),
  accountRemoveAvatar: vi.fn(),
  accountSelectOAuthAvatar: vi.fn(),
  onAccountStatusChanged: vi.fn(),
}));

vi.stubGlobal("window", { suyanApi: api });

function resetStore(): void {
  useAccountStore.setState({
    status: "unauthenticated",
    user: null,
    provider: null,
    loginProvider: null,
    lastLoginMethod: null,
    activeOAuthProvider: null,
    oauthPurpose: null,
    oauthPendingProvider: null,
    oauthExpiresAt: null,
    oauthDevice: null,
    oauthConfirmation: null,
    error: null,
    isSubmitting: false,
    submittingAction: null,
    dialogOpen: false,
  });
}

beforeEach(() => {
  resetStore();
  api.accountStartOAuth.mockReset();
  api.accountStartOAuthLink.mockReset();
  api.accountRegisterEmail.mockReset();
  api.accountConfirmOAuth.mockReset();
  api.accountCancelOAuth.mockReset();
  api.accountRefresh.mockReset();
  api.accountUnlinkIdentity.mockReset();
  api.accountGetStatus.mockReset();
  api.onAccountStatusChanged.mockReset();
  api.accountStartOAuth.mockResolvedValue({
    ok: true,
    data: { started: true, expiresAt: Date.now() + 10 * 60 * 1000 },
  });
  api.accountStartOAuthLink.mockResolvedValue({
    ok: true,
    data: { started: true, expiresAt: Date.now() + 10 * 60 * 1000 },
  });
  api.accountRegisterEmail.mockResolvedValue({
    ok: true,
    data: {
      verificationRequired: true,
      email: "new@example.com",
      message: "验证邮件已发送。",
      deliveryStatus: "accepted",
    },
  });
  api.accountConfirmOAuth.mockResolvedValue({
    ok: true,
    data: { status: "authenticated", user: null, provider: null, loginProvider: null },
  });
  api.accountCancelOAuth.mockResolvedValue({ ok: true, data: { cancelled: true } });
  api.accountRefresh.mockResolvedValue({
    ok: true,
    data: { status: "authenticated", user: null, provider: null, loginProvider: null },
  });
  api.accountUnlinkIdentity.mockResolvedValue({
    ok: true,
    data: { status: "authenticated", user: null, provider: "guli", loginProvider: "email" },
  });
  api.accountGetStatus.mockResolvedValue({
    ok: true,
    data: {
      status: "unauthenticated",
      user: null,
      provider: null,
      loginProvider: null,
    },
  });
  api.onAccountStatusChanged.mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAccountStore OAuth interaction", () => {
  it("读取上次登录提示，取消或失败授权不覆盖，确认登录和退出采用主进程历史", async () => {
    const history = { status: "unauthenticated", user: null, provider: null, lastLoginMethod: "github" };
    api.accountGetStatus.mockResolvedValueOnce({ ok: true, data: history });
    await useAccountStore.getState().initialize();
    expect(useAccountStore.getState().lastLoginMethod).toBe("github");
    await useAccountStore.getState().loginOAuth("google");
    await useAccountStore.getState().cancelOAuth();
    expect(useAccountStore.getState().lastLoginMethod).toBe("github");
    api.accountStartOAuth.mockResolvedValueOnce({ ok: false, error: { code: "ACCOUNT_NETWORK_ERROR", message: "测试失败" } });
    await useAccountStore.getState().loginOAuth("linuxdo");
    expect(useAccountStore.getState().lastLoginMethod).toBe("github");
    const user = { uid: "fixture-user", username: "测试用户" };
    useAccountStore.setState({ oauthConfirmation: { user, provider: "guli", loginProvider: "google", purpose: "login", expiresAt: Date.now() + 60000 } });
    api.accountConfirmOAuth.mockResolvedValueOnce({ ok: true, data: { status: "authenticated", user, provider: "guli", lastLoginMethod: "google" } });
    await useAccountStore.getState().confirmOAuth();
    expect(useAccountStore.getState().lastLoginMethod).toBe("google");
    api.accountLogout.mockResolvedValueOnce({ ok: true, data: { ...history, lastLoginMethod: "google" } });
    await useAccountStore.getState().logout();
    expect(useAccountStore.getState()).toMatchObject({ user: null, lastLoginMethod: "google" });
  });
  it.each([
    ["linkOAuth", "accountStartOAuthLink", ["linuxdo"]],
    ["refreshAccount", "accountRefresh", []],
    ["updateProfile", "accountUpdateProfile", [{ displayName: "测试昵称" }]],
    ["chooseAvatar", "accountChooseAvatar", []],
    ["removeAvatar", "accountRemoveAvatar", []],
    ["unlinkIdentity", "accountUnlinkIdentity", ["github"]],
    ["logout", "accountLogout", []],
    ["registerEmail", "accountRegisterEmail", [{ email: "test@example.test", password: "fixture-only" }]],
    ["confirmOAuth", "accountConfirmOAuth", []],
    ["selectOAuthAvatar", "accountSelectOAuthAvatar", []],
    ["cancelOAuth", "accountCancelOAuth", []],
  ] as const)("%s 只标记自身操作；失败后清理状态，不误标为退出", async (action, method, args) => {
    const user = { uid: "fixture-user", username: "测试用户" };
    useAccountStore.setState({ status: "authenticated", user, provider: "guli",
      ...(action === "confirmOAuth" || action === "selectOAuthAvatar" || action === "cancelOAuth" ? {
        oauthConfirmation: { user, provider: "guli", loginProvider: "github", purpose: "login", expiresAt: Date.now() + 60000 },
      } : {}),
    });
    let finish!: (value: unknown) => void;
    api[method].mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const run = (useAccountStore.getState()[action] as (...input: unknown[]) => Promise<unknown>)(...args);
    expect(useAccountStore.getState()).toMatchObject({ isSubmitting: true, submittingAction: action });
    finish({ ok: false, error: { code: "ACCOUNT_NETWORK_ERROR", message: "测试失败" } });
    await run;
    expect(useAccountStore.getState()).toMatchObject({ isSubmitting: false, submittingAction: null });
  });
  it("shows a device code while waiting and clears it when cancelled", async () => {
    const device = { userCode: "ABCD-EFGH", verificationUri: "https://auth.example.test/device", browserOpened: true };
    api.accountStartOAuth.mockResolvedValue({ ok: true, data: { started: true, expiresAt: Date.now() + 600000, device } });
    await useAccountStore.getState().loginOAuth("email", { mode: "device" });
    expect(useAccountStore.getState()).toMatchObject({ status: "unauthenticated", oauthDevice: device, oauthPendingProvider: "email" });
    await useAccountStore.getState().cancelOAuth();
    expect(useAccountStore.getState()).toMatchObject({ oauthDevice: null, oauthPendingProvider: null });
  });
  it("does not restore the waiting panel if confirmation arrives before the start response", async () => {
    api.accountStartOAuth.mockImplementation(async () => {
      useAccountStore.setState({ oauthConfirmation: { user: { uid: "verified", username: "用户" } } as never });
      return { ok: true, data: { started: true, expiresAt: Date.now() + 600000, device: { userCode: "ABCD-EFGH" } } };
    });
    await useAccountStore.getState().loginOAuth("email", { mode: "device" });
    expect(useAccountStore.getState().oauthPendingProvider).toBeNull();
    expect(useAccountStore.getState().oauthDevice).toBeNull();
  });
  it("注册成功但需要邮箱验证时保持未登录，并返回验证结果", async () => {
    const result = await useAccountStore.getState().registerEmail({
      email: "new@example.com",
      password: "long-enough-password",
      confirmPassword: "long-enough-password",
    });

    expect(api.accountRegisterEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "long-enough-password",
      confirmPassword: "long-enough-password",
    });
    expect(result).toEqual({
      verificationRequired: true,
      email: "new@example.com",
      message: "验证邮件已发送。",
      deliveryStatus: "accepted",
    });
    expect(useAccountStore.getState()).toMatchObject({
      status: "unauthenticated",
      user: null,
      isSubmitting: false,
      error: null,
    });
  });

  it("授权页打开后再次点击不会清空等待态或启动第二个事务", async () => {
    await useAccountStore.getState().loginOAuth("google");
    expect(useAccountStore.getState().oauthPendingProvider).toBe("google");

    await useAccountStore.getState().loginOAuth("github");

    expect(api.accountStartOAuth).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState().oauthPendingProvider).toBe("google");
    expect(useAccountStore.getState().error).toMatchObject({
      code: "ACCOUNT_OAUTH_IN_PROGRESS",
    });
  });

  it("重新验证登录会把 prompt=login 传给主进程", async () => {
    await useAccountStore.getState().loginOAuth("google", { prompt: "login" });

    expect(api.accountStartOAuth).toHaveBeenCalledWith("google", {
      prompt: "login",
    });
  });

  it("邮箱登录会把用户输入的账号提示传给主进程", async () => {
    await useAccountStore.getState().loginOAuth("email", {
      prompt: "login",
      emailHint: "user@example.com",
    });

    expect(api.accountStartOAuth).toHaveBeenCalledWith("email", {
      prompt: "login",
      emailHint: "user@example.com",
    });
  });

  it("关联 OAuth 使用独立事务，浏览器等待期间不切换当前用户", async () => {
    const currentUser = {
      uid: "guli#current",
      username: "当前账号",
      identities: [{ provider: "guli" as const, providerUserId: "current" }],
    };
    useAccountStore.setState({
      status: "authenticated",
      user: currentUser,
      provider: "guli",
      loginProvider: "email",
    });

    await useAccountStore.getState().linkOAuth("google", { prompt: "login" });

    expect(api.accountStartOAuthLink).toHaveBeenCalledWith("google", {
      prompt: "login",
    });
    expect(useAccountStore.getState()).toMatchObject({
      status: "authenticated",
      user: currentUser,
      oauthPurpose: "link",
      oauthPendingProvider: "google",
    });
  });

  it("确认关联后保留当前账号 uid，并更新身份清单", async () => {
    const currentUser = {
      uid: "guli#current",
      username: "当前账号",
      identities: [{ provider: "guli" as const, providerUserId: "current" }],
    };
    const linkedUser = {
      ...currentUser,
      identities: [
        ...currentUser.identities,
        { provider: "google" as const, providerUserId: "google-1" },
      ],
    };
    useAccountStore.setState({
      status: "authenticated",
      user: currentUser,
      provider: "guli",
      loginProvider: "email",
      oauthPurpose: "link",
      oauthConfirmation: {
        user: { uid: "guli#google", username: "Google 用户" },
        provider: "guli",
        loginProvider: "google",
        purpose: "link",
        expiresAt: Date.now() + 60_000,
      },
    });
    api.accountConfirmOAuth.mockResolvedValueOnce({
      ok: true,
      data: {
        status: "authenticated",
        user: linkedUser,
        provider: "guli",
        loginProvider: "email",
      },
    });

    await useAccountStore.getState().confirmOAuth();

    expect(useAccountStore.getState()).toMatchObject({
      status: "authenticated",
      user: linkedUser,
      oauthPurpose: null,
      oauthConfirmation: null,
    });
  });

  it("OAuth 回调身份必须点击确认后才更新当前用户", async () => {
    const user = {
      uid: "guli#user-2",
      username: "第二个账号",
      email: "second@example.com",
    };
    useAccountStore.setState({
      status: "authenticated",
      user: { uid: "guli#user-1", username: "当前账号" },
      provider: "guli",
      loginProvider: "github",
      oauthConfirmation: {
        user,
        provider: "guli",
        loginProvider: "github",
        purpose: "login",
        expiresAt: Date.now() + 60_000,
      },
    });
    api.accountConfirmOAuth.mockResolvedValueOnce({
      ok: true,
      data: { status: "authenticated", user, provider: "guli", loginProvider: "github" },
    });

    await useAccountStore.getState().confirmOAuth();

    expect(api.accountConfirmOAuth).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState().user).toEqual(user);
    expect(useAccountStore.getState().oauthConfirmation).toBeNull();
  });

  it("用户取消后清除等待态，允许重新选择登录方式", async () => {
    await useAccountStore.getState().loginOAuth("google");
    await useAccountStore.getState().cancelOAuth();

    expect(api.accountCancelOAuth).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState().oauthPendingProvider).toBeNull();
    expect(useAccountStore.getState().isSubmitting).toBe(false);
  });

  it("授权事务到期后自动释放登录入口并提示用户重新选择", async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 1_000;
    api.accountStartOAuth.mockResolvedValueOnce({
      ok: true,
      data: { started: true, expiresAt },
    });

    await useAccountStore.getState().loginOAuth("google");
    expect(useAccountStore.getState().oauthExpiresAt).toBe(expiresAt);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(api.accountCancelOAuth).toHaveBeenCalledTimes(1);
    expect(useAccountStore.getState()).toMatchObject({
      oauthPendingProvider: null,
      oauthExpiresAt: null,
      error: {
        code: "ACCOUNT_OAUTH_EXPIRED",
      },
    });
    vi.useRealTimers();
  });

  it("重复初始化只注册一次账号状态监听", async () => {
    vi.resetModules();
    const { useAccountStore: freshStore } = await import("../../src/features/account/store/useAccountStore");
    await freshStore.getState().initialize();
    await freshStore.getState().initialize();

    expect(api.onAccountStatusChanged).toHaveBeenCalledTimes(1);
    api.onAccountStatusChanged.mock.calls[0][0]({
      status: "unauthenticated", user: null, provider: null, lastLoginMethod: "device",
    });
    expect(freshStore.getState().lastLoginMethod).toBe("device");
  });
});
