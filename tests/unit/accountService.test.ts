import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "" }));
const guliMock = vi.hoisted(() => ({
  GULI_IDENTITY_PROVIDER: "guli",
  refreshGuliSession: vi.fn(),
  revokeGuliSession: vi.fn(),
  getGuliIdentityConfig: vi.fn(() => {
    throw { code: "ACCOUNT_PROVIDER_UNAVAILABLE", message: "尚未配置" };
  }),
  buildGuliAuthorizationUrl: vi.fn(),
  exchangeGuliAuthorizationCode: vi.fn(),
  startGuliDeviceAuthorization: vi.fn(),
  fetchGuliAccountUser: vi.fn(),
  updateGuliAccountProfile: vi.fn(),
  uploadGuliAccountAvatar: vi.fn(),
  deleteGuliAccountAvatar: vi.fn(),
  linkGuliIdentity: vi.fn(),
  unlinkGuliIdentity: vi.fn(),
  isGuliIdentityConfigured: vi.fn(() => false),
}));

vi.mock("electron", () => ({
  app: { getPath: () => state.dataDir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: () => "",
    encryptString: (value: string) => Buffer.from(value, "utf8"),
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openExternal: async () => undefined },
}));
vi.mock("../../electron/main/account/oauth/guliIdentityClient", () => guliMock);

import type { AccountFile, AccountSession } from "../../src/features/account/types/account";
import { encryptAccountTokenPayload } from "../../electron/main/account/accountCrypto";
import { putPendingOAuthSession, resetOAuthStateForTests } from "../../electron/main/account/oauth/oauthState";
import {
  confirmOAuthLogin,
  getAuthorInfo,
  getCurrentUser,
  getAccountStatus,
  cancelOAuthLogin,
  handleOAuthCallback,
  initializeAccount,
  loginWithEmail,
  logoutAccount,
  refreshAccountSessionForced,
  registerWithEmail,
  normalizeOAuthStartInput,
  resetAccountServiceForTests,
  startOAuthLogin,
} from "../../electron/main/account/accountService";

const temporaryDirectories: string[] = [];

beforeEach(async () => {
  delete process.env.SUYAN_ACCOUNT_API_URL;
  resetAccountServiceForTests();
  guliMock.refreshGuliSession.mockReset();
  guliMock.revokeGuliSession.mockReset();
  guliMock.exchangeGuliAuthorizationCode.mockReset();
  guliMock.fetchGuliAccountUser.mockReset();
  guliMock.updateGuliAccountProfile.mockReset();
  guliMock.uploadGuliAccountAvatar.mockReset();
  guliMock.deleteGuliAccountAvatar.mockReset();
  guliMock.linkGuliIdentity.mockReset();
  guliMock.unlinkGuliIdentity.mockReset();
  guliMock.fetchGuliAccountUser.mockImplementation(async (_token: string, user: AccountSession["user"]) => user);
  guliMock.updateGuliAccountProfile.mockImplementation(
    async (token: string, displayName: string | null) => ({
      uid: token === "guli-at"
        ? "https://auth.example.test#subject-1"
        : "https://auth.example.test#subject-2",
      username: displayName ?? "第二个账号",
    }),
  );
  guliMock.uploadGuliAccountAvatar.mockResolvedValue(undefined);
  guliMock.deleteGuliAccountAvatar.mockResolvedValue(undefined);
  resetOAuthStateForTests();
  guliMock.getGuliIdentityConfig.mockImplementation(() => {
    throw { code: "ACCOUNT_PROVIDER_UNAVAILABLE", message: "尚未配置" };
  });
  guliMock.isGuliIdentityConfigured.mockReturnValue(false);
  state.dataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "suyan-account-service-"),
  );
  temporaryDirectories.push(state.dataDir);
  const testConfigPath = path.join(state.dataDir, "empty-guli-identity.env");
  await fs.writeFile(testConfigPath, "GULI_IDENTITY_CLIENT_ID=\n", "utf8");
  process.env.SUYAN_GULI_IDENTITY_CONFIG = testConfigPath;
});

afterEach(async () => {
  resetAccountServiceForTests();
  resetOAuthStateForTests();
  vi.unstubAllGlobals();
  delete process.env.SUYAN_GULI_IDENTITY_CONFIG;
  state.dataDir = "";
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

const accountPath = () => path.join(state.dataDir, "library", "account.json");

async function writeAccountFileOnDisk(file: AccountFile): Promise<void> {
  await fs.mkdir(path.dirname(accountPath()), { recursive: true });
  await fs.writeFile(accountPath(), JSON.stringify(file, null, 2), "utf8");
}

async function readAccountFileOnDisk(): Promise<AccountFile | null> {
  try {
    return JSON.parse(await fs.readFile(accountPath(), "utf8")) as AccountFile;
  } catch {
    return null;
  }
}

function loggedInFile(): AccountFile {
  return {
    schemaVersion: 1,
    user: {
      uid: "u-1",
      username: "素言用户",
      avatarUrl: "https://example.com/a.png",
    },
    provider: "guli",
    tokenEncrypted: encryptAccountTokenPayload({
      accessToken: "at-valid",
      refreshToken: "rt-valid",
      expiresAt: Date.now() + 60_000,
    }),
    updatedAt: new Date().toISOString(),
  };
}

function guliLoggedInFile(expiresAt = Date.now() + 60_000): AccountFile {
  return {
    schemaVersion: 1,
    user: {
      uid: "https://auth.example.test#subject-1",
      username: "Guli 用户",
      email: "user@example.com",
      identities: [
        {
          provider: "guli",
          issuer: "https://auth.example.test",
          providerUserId: "subject-1",
        },
      ],
    },
    provider: "guli",
    tokenEncrypted: encryptAccountTokenPayload({
      accessToken: "guli-at",
      refreshToken: "guli-rt",
      expiresAt,
    }),
    updatedAt: new Date().toISOString(),
  };
}

describe("accountService（Phase 2 本地 session）", () => {
  it.each(["email", "google", "linuxdo", "github", "device"] as const)(
    "%s 成功确认后才记录入口，退出和重启仍保留提示但不保留凭据",
    async (method) => {
      await writeAccountFileOnDisk({ schemaVersion: 1, user: null, provider: null,
        lastLoginMethod: "linuxdo", updatedAt: new Date().toISOString() });
      await initializeAccount();
      const session: AccountSession = { user: { uid: "history-user", username: "测试用户" },
        loginProvider: "github", accessToken: "fixture-access", refreshToken: "fixture-refresh",
        expiresAt: Date.now() + 600000 };
      if (method === "device") {
        let finish!: (value: AccountSession) => void;
        const pending = new Promise<AccountSession>((resolve) => { finish = resolve; });
        guliMock.startGuliDeviceAuthorization.mockResolvedValue({
          userCode: "ABCD-EFGH", verificationUri: "https://auth.example.test/device",
          expiresAt: Date.now() + 600000, abort: vi.fn(), wait: () => pending,
        });
        await startOAuthLogin({ provider: "email", mode: "device" });
        expect(getAccountStatus().lastLoginMethod).toBe("linuxdo");
        finish(session);
        await vi.waitFor(() => expect(getAccountStatus().pendingOAuthConfirmation).toBeDefined());
      } else {
        putPendingOAuthSession({ provider: "guli", loginProvider: method,
          state: "history-state", nonce: "history-nonce", codeVerifier: "history-verifier",
          redirectUri: "suyan://oauth/callback", issuer: "https://auth.example.test" });
        guliMock.exchangeGuliAuthorizationCode.mockResolvedValue(session);
        await handleOAuthCallback("suyan://oauth/callback?state=history-state&code=fixture-code");
      }
      expect(getAccountStatus().lastLoginMethod).toBe("linuxdo");
      expect((await readAccountFileOnDisk())?.lastLoginMethod).toBe("linuxdo");
      expect((await confirmOAuthLogin()).lastLoginMethod).toBe(method);
      expect((await readAccountFileOnDisk())?.lastLoginMethod).toBe(method);
      expect((await logoutAccount()).lastLoginMethod).toBe(method);
      expect(await readAccountFileOnDisk()).toMatchObject({ user: null, provider: null, lastLoginMethod: method });
      expect((await readAccountFileOnDisk())?.tokenEncrypted).toBeUndefined();
      resetAccountServiceForTests();
      expect(await initializeAccount()).toMatchObject({ status: "unauthenticated", user: null, lastLoginMethod: method });
    },
  );

  it("旧缓存按实际登录渠道恢复提示，失效凭据清理后仍保留", async () => {
    await writeAccountFileOnDisk({ ...guliLoggedInFile(), loginProvider: "google", tokenEncrypted: "invalid" });
    expect(await initializeAccount()).toMatchObject({ status: "unauthenticated", lastLoginMethod: "google" });
    expect((await readAccountFileOnDisk())?.lastLoginMethod).toBe("google");
  });

  it("未记录登录渠道时不按关联身份猜测；失败登录不更改历史", async () => {
    await writeAccountFileOnDisk({ ...guliLoggedInFile(), tokenEncrypted: "invalid" });
    expect((await initializeAccount()).lastLoginMethod).toBeNull();
    await writeAccountFileOnDisk({ schemaVersion: 1, user: null, provider: null,
      lastLoginMethod: "github", updatedAt: new Date().toISOString() });
    await initializeAccount();
    await expect(loginWithEmail({ email: "fixture@example.test", password: "fixture-password" })).rejects.toThrow();
    expect(getAccountStatus().lastLoginMethod).toBe("github");
    expect((await readAccountFileOnDisk())?.lastLoginMethod).toBe("github");
  });

  it("device authorization stays unpersisted until local profile confirmation", async () => {
    let finish!: (session: AccountSession) => void;
    const wait = new Promise<AccountSession>((resolve) => { finish = resolve; });
    guliMock.startGuliDeviceAuthorization.mockResolvedValue({
      userCode: "ABCD-EFGH", verificationUri: "https://auth.example.test/device", expiresAt: Date.now() + 600000,
      abort: vi.fn(), wait: () => wait,
    });
    await startOAuthLogin({ provider: "email", mode: "device" });
    expect(getCurrentUser()).toBeNull();
    finish({ user: { uid: "device-user", username: "设备用户" }, loginProvider: "github",
      accessToken: "device-access", refreshToken: "device-refresh", expiresAt: Date.now() + 600000 });
    await vi.waitFor(() => expect(getAccountStatus().pendingOAuthConfirmation?.user.uid).toBe("device-user"));
    expect(getAccountStatus().pendingOAuthConfirmation?.loginProvider).toBe("github");
    expect(getAccountStatus().lastLoginMethod).toBeNull();
    expect(getCurrentUser()).toBeNull();
    await expect(fs.access(accountPath())).rejects.toThrow();
    cancelOAuthLogin();
    expect(getAccountStatus().pendingOAuthConfirmation).toBeUndefined();
    expect(getAccountStatus().lastLoginMethod).toBeNull();
  });
  it("OAuth 启动参数只接受已知渠道、prompt 和账号提示，拒绝任意对象字段", () => {
    expect(normalizeOAuthStartInput("google")).toEqual({ provider: "google" });
    expect(
      normalizeOAuthStartInput({
        provider: "email",
        prompt: "login",
        emailHint: " user@example.com ",
      }),
    ).toEqual({
      provider: "email",
      prompt: "login",
      emailHint: "user@example.com",
    });
    expect(
      normalizeOAuthStartInput({ provider: "github", prompt: "select_account" }),
    ).toEqual({ provider: "github", prompt: "select_account" });
    expect(() =>
      normalizeOAuthStartInput({ provider: "github", prompt: "none" }),
    ).toThrowError(/提示模式/);
    expect(() => normalizeOAuthStartInput({ prompt: "login" })).toThrowError(
      /登录渠道/,
    );
    expect(() => normalizeOAuthStartInput({ provider: "email", emailHint: " " })).toThrowError(
      /登录邮箱/,
    );
  });

  it("OAuth 回调只展示待确认身份，确认后才写入本地会话", async () => {
    const session: AccountSession = {
      user: {
        uid: "https://auth.example.test#subject-2",
        username: "第二个账号",
        email: "second@example.com",
      },
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 120_000,
    };
    putPendingOAuthSession({
      provider: "guli",
      loginProvider: "github",
      state: "state-confirm",
      nonce: "nonce-confirm",
      codeVerifier: "verifier-confirm",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    guliMock.exchangeGuliAuthorizationCode.mockResolvedValue(session);

    const pending = await handleOAuthCallback(
      "suyan://oauth/callback?state=state-confirm&code=code-confirm",
    );

    expect(pending.status).toBe("unauthenticated");
    expect(pending.pendingOAuthConfirmation).toMatchObject({
      user: session.user,
      provider: "guli",
      loginProvider: "github",
    });
    expect(getCurrentUser()).toBeNull();
    expect(await readAccountFileOnDisk()).toBeNull();

    const confirmed = await confirmOAuthLogin();
    expect(confirmed.status).toBe("authenticated");
    expect(confirmed.user).toEqual(session.user);
    expect(confirmed.pendingOAuthConfirmation).toBeUndefined();
    expect((await readAccountFileOnDisk())?.user).toEqual(session.user);
  });

  it("关联 OAuth 确认后只更新当前用户身份，不切换 uid", async () => {
    await writeAccountFileOnDisk({ ...guliLoggedInFile(), lastLoginMethod: "device" });
    await initializeAccount();
    const currentUser = getCurrentUser()!;
    const linkedUser: AccountSession["user"] = {
      ...currentUser,
      identities: [
        ...(currentUser.identities ?? []),
        { provider: "google", providerUserId: "google-user-1" },
      ],
    };
    const linkedSession: AccountSession = {
      user: { uid: "https://auth.example.test#google-user-1", username: "Google 用户" },
      accessToken: "linked-at",
      refreshToken: "linked-rt",
      expiresAt: Date.now() + 120_000,
    };
    putPendingOAuthSession({
      provider: "guli",
      loginProvider: "google",
      purpose: "link",
      expectedUid: currentUser.uid,
      state: "state-link",
      nonce: "nonce-link",
      codeVerifier: "verifier-link",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    guliMock.exchangeGuliAuthorizationCode.mockResolvedValue(linkedSession);
    guliMock.linkGuliIdentity.mockResolvedValue(linkedUser);

    const pending = await handleOAuthCallback(
      "suyan://oauth/callback?state=state-link&code=code-link",
    );
    expect(pending.status).toBe("authenticated");
    expect(pending.pendingOAuthConfirmation?.purpose).toBe("link");

    const confirmed = await confirmOAuthLogin({
      usernameSource: "current",
      avatarSource: "current",
    });
    expect(confirmed.user?.uid).toBe(currentUser.uid);
    expect(confirmed.user?.identities).toContainEqual({
      provider: "google",
      providerUserId: "google-user-1",
    });
    expect(guliMock.linkGuliIdentity).toHaveBeenCalledWith(
      "guli-at",
      "linked-at",
      "google",
    );
    expect((await readAccountFileOnDisk())?.user?.uid).toBe(currentUser.uid);
    expect(confirmed.lastLoginMethod).toBe("device");
    expect((await readAccountFileOnDisk())?.lastLoginMethod).toBe("device");
  });

  it("OAuth 登录确认支持自定义昵称，确认前不写入本地会话", async () => {
    const session: AccountSession = {
      user: {
        uid: "https://auth.example.test#subject-2",
        username: "GitHub 原昵称",
        email: "custom@example.com",
      },
      accessToken: "access-custom",
      refreshToken: "refresh-custom",
      expiresAt: Date.now() + 120_000,
    };
    putPendingOAuthSession({
      provider: "guli",
      loginProvider: "github",
      state: "state-custom-profile",
      nonce: "nonce-custom-profile",
      codeVerifier: "verifier-custom-profile",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    guliMock.exchangeGuliAuthorizationCode.mockResolvedValue(session);

    await handleOAuthCallback(
      "suyan://oauth/callback?state=state-custom-profile&code=code-custom-profile",
    );
    expect(getCurrentUser()).toBeNull();
    expect(await readAccountFileOnDisk()).toBeNull();

    const confirmed = await confirmOAuthLogin({
      usernameSource: "custom",
      avatarSource: "new",
      customUsername: "我的自定义昵称",
    });

    expect(guliMock.updateGuliAccountProfile).toHaveBeenCalledWith(
      "access-custom",
      "我的自定义昵称",
    );
    expect(confirmed.user).toMatchObject({
      uid: session.user.uid,
      username: "我的自定义昵称",
    });
    expect((await readAccountFileOnDisk())?.user?.username).toBe("我的自定义昵称");
  });

  it("无 account.json 启动 → 未登录，不抛错", async () => {
    const status = await initializeAccount();
    expect(status.status).toBe("unauthenticated");
    expect(status.user).toBeNull();
    expect(getCurrentUser()).toBeNull();
    expect(getAuthorInfo()).toBeNull();
  });

  it("有效本地会话启动 → 恢复登录态与作者信息", async () => {
    await writeAccountFileOnDisk(loggedInFile());

    const status = await initializeAccount();
    expect(status.status).toBe("authenticated");
    expect(status.user?.uid).toBe("u-1");
    expect(status.provider).toBe("guli");

    expect(getAuthorInfo()).toEqual({
      uid: "u-1",
      username: "素言用户",
      avatarUrl: "https://example.com/a.png",
    });
  });

  it("Guli Identity 会话启动可恢复，过期后使用轮换 refresh token", async () => {
    await writeAccountFileOnDisk(guliLoggedInFile(Date.now() - 1_000));
    guliMock.refreshGuliSession.mockResolvedValue({
      accessToken: "guli-at-2",
      refreshToken: "guli-rt-2",
      expiresAt: Date.now() + 120_000,
    });

    const status = await initializeAccount();
    expect(status.provider).toBe("guli");
    expect(status.user?.uid).toBe("https://auth.example.test#subject-1");
    expect(guliMock.refreshGuliSession).toHaveBeenCalledWith("guli-rt");
    expect((await readAccountFileOnDisk())?.provider).toBe("guli");
  });

  it("Guli Identity 退出时吊销 refresh token，但网络失败仍清理本地会话", async () => {
    await writeAccountFileOnDisk(guliLoggedInFile());
    await initializeAccount();
    guliMock.revokeGuliSession.mockRejectedValue(new Error("identity offline"));

    const status = await logoutAccount();
    expect(status.status).toBe("unauthenticated");
    expect(guliMock.revokeGuliSession).toHaveBeenCalledWith("guli-rt");
    // 退出必须清除本地会话，即便吊销失败（避免用户被"卡"在当前账号）。
    expect(await readAccountFileOnDisk()).toMatchObject({
      user: null,
      provider: null,
    });
  });

  it("配置账号中心时启动会用 /auth/me 更新最新用户资料", async () => {
    process.env.SUYAN_ACCOUNT_API_URL = "https://auth.example.test";
    await writeAccountFileOnDisk({ ...loggedInFile(), provider: "email" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://auth.example.test/auth/me");
      return new Response(
        JSON.stringify({
          user: {
            uid: "u-1",
            username: "云端新昵称",
            avatarUrl: "https://example.com/new.png",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await initializeAccount();

    expect(status.user).toMatchObject({ uid: "u-1", username: "云端新昵称" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await readAccountFileOnDisk())?.user?.username).toBe("云端新昵称");
  });

  it("过期会话且后端未配置 → 刷新失败自动退出登录并清空文件", async () => {
    await writeAccountFileOnDisk({
      schemaVersion: 1,
      user: { uid: "u-1", username: "素言用户" },
      provider: "email",
      tokenEncrypted: encryptAccountTokenPayload({
        accessToken: "at-expired",
        refreshToken: "rt-expired",
        expiresAt: Date.now() - 1_000,
      }),
      updatedAt: new Date().toISOString(),
    });

    const status = await initializeAccount();
    expect(status.status).toBe("unauthenticated");

    const disk = await readAccountFileOnDisk();
    expect(disk?.user).toBeNull();
    expect(disk?.tokenEncrypted).toBeUndefined();
  });

  it("损坏 token 密文 → 无法恢复，回到未登录", async () => {
    await writeAccountFileOnDisk({
      schemaVersion: 1,
      user: { uid: "u-1", username: "素言用户" },
      provider: "guli",
      tokenEncrypted: "definitely-not-valid",
      updatedAt: new Date().toISOString(),
    });

    const status = await initializeAccount();
    expect(status.status).toBe("unauthenticated");
  });

  it("邮箱登录：后端未配置时返回 ACCOUNT_BACKEND_NOT_CONFIGURED，不伪造本地登录", async () => {
    await expect(
      loginWithEmail({ email: "user@example.com", password: "correct horse" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_BACKEND_NOT_CONFIGURED" });
    expect(getCurrentUser()).toBeNull();
    // 未成功登录前不得落盘任何账号文件
    expect(await readAccountFileOnDisk()).toBeNull();
  });

  it("邮箱输入校验：非法邮箱 / 短密码 → ACCOUNT_INPUT_INVALID", async () => {
    await expect(
      loginWithEmail({ email: "not-an-email", password: "secret123" }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
    await expect(
      loginWithEmail({ email: "user@example.com", password: "123" }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
    await expect(
      registerWithEmail({
        email: "a@b.com",
        password: "123456",
        confirmPassword: "654321",
      }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
  });

  it("退出登录：清除 token 与会话，文件回到空状态，幂等", async () => {
    await writeAccountFileOnDisk(loggedInFile());
    await initializeAccount();
    expect(getCurrentUser()).not.toBeNull();

    const status = await logoutAccount();
    expect(status.status).toBe("unauthenticated");
    expect(getCurrentUser()).toBeNull();
    expect(getAuthorInfo()).toBeNull();

    const disk = await readAccountFileOnDisk();
    expect(disk?.user).toBeNull();
    expect(disk?.tokenEncrypted).toBeUndefined();

    // 幂等：再次退出不报错
    const again = await logoutAccount();
    expect(again.status).toBe("unauthenticated");
  });

  it("退出登录时尽力调用账号中心吊销 refresh token", async () => {
    process.env.SUYAN_ACCOUNT_API_URL = "https://auth.example.test";
    await writeAccountFileOnDisk({ ...loggedInFile(), provider: "email" });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/auth/me")) {
          return new Response(
            JSON.stringify({ user: { uid: "u-1", username: "素言用户" } }),
            { status: 200 },
          );
        }
        expect(String(input)).toBe("https://auth.example.test/auth/logout");
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ loggedOut: true }), {
          status: 200,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    await initializeAccount();

    await logoutAccount();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://auth.example.test/auth/logout",
    );
  });

  it("未登录时手动刷新 → ACCOUNT_NOT_LOGGED_IN", async () => {
    await expect(refreshAccountSessionForced()).rejects.toMatchObject({
      code: "ACCOUNT_NOT_LOGGED_IN",
    });
  });

  it("OAuth 渠道：用户渠道需要身份服务配置，内部渠道和未知渠道均拒绝", async () => {
    await expect(startOAuthLogin("email")).rejects.toMatchObject({
      code: "ACCOUNT_PROVIDER_UNAVAILABLE",
    });
    await expect(startOAuthLogin("google")).rejects.toMatchObject({
      code: "ACCOUNT_PROVIDER_UNAVAILABLE",
    });
    await expect(startOAuthLogin("guli")).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
    await expect(startOAuthLogin("wechat")).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
    await expect(startOAuthLogin("myspace")).rejects.toMatchObject({
      code: "ACCOUNT_INPUT_INVALID",
    });
  });
});
