import type {
  AccountExternalProviderId,
  AccountLoginProviderId,
  AccountLoginMethod,
  AccountOAuthProfileSelection,
  AccountOAuthPurpose,
  AccountOAuthConfirmation,
  AccountOAuthPrompt,
  AccountOAuthStartResult,
  AccountFile,
  AccountProviderId,
  AccountPublicStatus,
  AccountProfileSource,
  AccountProfileUpdateInput,
  AccountRegistrationResult,
  AccountSession,
  AccountTokenPayload,
  AccountUser,
  AuthorInfo,
  EmailLoginInput,
  EmailRegisterInput,
} from "../../../src/features/account/types/account";
import {
  ACCOUNT_ERROR_CODES,
  ACCOUNT_EXTERNAL_PROVIDER_IDS,
} from "../../../src/features/account/types/account";
import { AccountError } from "./errors";
import { logger } from "../appLogger";
import { decryptAccountTokenPayload, encryptAccountTokenPayload } from "./accountCrypto";
import { createEmptyAccountFile, readAccountFile, writeAccountFile } from "./accountStore";
import { StaleTokenRefreshError, tokenManager } from "./tokenManager";
import {
  fetchCurrentUser,
  getAccountApiBaseUrl,
  loginAccount,
  logoutAccountSession,
  refreshAccountSession,
  registerAccount,
} from "./accountApiClient";
import {
  cancelLogin as oauthCancelLogin,
  handleCallback as oauthHandleCallback,
  startBrowserLink,
  startLogin as oauthStartLogin,
  startDeviceLogin,
} from "./oauth/oauthService";
import {
  GULI_IDENTITY_PROVIDER,
  isGuliIdentityConfigured,
  refreshGuliSession,
  fetchGuliAccountUser,
  linkGuliIdentity,
  unlinkGuliIdentity,
  revokeGuliSession,
  updateGuliAccountProfile,
  uploadGuliAccountAvatar,
  deleteGuliAccountAvatar,
  requestGuliBackupKey,
} from "./oauth/guliIdentityClient";
import { isAccountErrorCode } from "./errors";
import { BrowserWindow, type OpenDialogOptions } from "electron";
import { dialog } from "../app/fileDialogs";
import { ipcChannels } from "../../shared/ipcChannels";
import {
  cacheAccountAvatar,
  readAccountAvatarFile,
  readCachedAccountAvatar,
  removeAccountAvatar,
} from "./accountAvatarCache";

/**
 * AccountService（方案 §五 / §十一）：
 * UI → Account IPC → AccountService → Provider / API → AccountStore。
 *
 * Phase 2 范围：登录态保存、读取、退出、恢复 + 邮箱注册/登录骨架（后端未配置时
 * 抛 ACCOUNT_BACKEND_NOT_CONFIGURED，绝不伪造本地登录）。OAuth 渠道见 Phase 4/5。
 */
let currentUser: AccountUser | null = null;
let currentProvider: AccountProviderId | null = null;
let currentLoginProvider: AccountLoginProviderId | null = null;
let lastLoginMethod: AccountLoginMethod | null = null;
/** Invalidates background profile/token work when the active local session changes. */
let accountSessionVersion = 0;
let accountWriteQueue: Promise<void> = Promise.resolve();
let tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
type PendingOAuthConfirmation = AccountOAuthConfirmation & {
  session: AccountSession;
  loginMethod: AccountLoginMethod;
  customAvatar?: { bytes: Uint8Array; contentType: string };
};
let pendingOAuthConfirmation: PendingOAuthConfirmation | null = null;
let oauthConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
const OAUTH_CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export function getAccountStatus(): AccountPublicStatus {
  const status = currentUser ? "authenticated" : "unauthenticated";
  return {
    status,
    user: currentUser,
    provider: currentProvider,
    loginProvider: currentLoginProvider,
    lastLoginMethod,
    ...(pendingOAuthConfirmation
      ? { pendingOAuthConfirmation: toPublicOAuthConfirmation(pendingOAuthConfirmation) }
      : {}),
  };
}

export function getCurrentUser(): AccountUser | null {
  return currentUser;
}

/** 导出系统统一消费的作者信息（方案 §十六）：未登录返回 null。 */
export function getAuthorInfo(): AuthorInfo | null {
  if (!currentUser) {
    return null;
  }
  return {
    uid: currentUser.uid,
    username: currentUser.username,
    ...(currentUser.avatarUrl ? { avatarUrl: currentUser.avatarUrl } : {}),
  };
}

export async function getAccountBackupKey(expectedUid: string, keyId?: string) {
  const requireSame = () => {
    const user = requireCurrentGuliAccount();
    if (user.uid !== expectedUid) throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "此备份仅允许导出时的同一账户导入，请切换账户。");
  };
  requireSame();
  if (tokenManager.isExpired()) await refreshLocalSession();
  requireSame();
  const version = accountSessionVersion;
  const result = await requestGuliBackupKey(tokenManager.getPayload()!.accessToken, keyId);
  try {
    requireSame();
    if (version !== accountSessionVersion || result.uid !== expectedUid) {
      throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "账户身份已变化，请重新验证备份。");
    }
    return result;
  } catch (error) {
    result.key.fill(0);
    throw error;
  }
}

/** 应用启动时恢复登录态（方案 §十一）：读取 account.json → 解密 token → 必要时刷新。 */
export async function initializeAccount(): Promise<AccountPublicStatus> {
  const file = await readAccountFile();
  lastLoginMethod = file?.lastLoginMethod
    ?? (file?.user ? file.loginProvider ?? (file.provider === "email" ? "email" : null) : null);

  if (!file || !file.user) {
    return getAccountStatus();
  }

  const payload = file.tokenEncrypted ? decryptAccountTokenPayload(file.tokenEncrypted) : null;

  if (!payload) {
    logger.warn("account", "session:restore-token-invalid", { uid: file.user.uid });
    await clearLocalSession();
    return getAccountStatus();
  }

  tokenManager.setPayload(payload);
  currentUser = file.user;
  currentProvider = file.provider;
  currentLoginProvider = file.loginProvider ?? null;
  accountSessionVersion += 1;
  logger.info("account", "session:restored", { uid: file.user.uid, provider: file.provider });

  if (tokenManager.isExpired()) {
    // 已过期：这里直接刷新一次，成功后由 persistSession 排定下一次续期。
    // 不能在此之前排定定时器：refresh token 是轮换的，重复刷新会用到已作废的旧值。
    try {
      await refreshLocalSession();
    } catch {
      // refreshLocalSession 只在真失效时清除登录态（网络故障保留会话）。
    }
    return getAccountStatus();
  }

  scheduleTokenRefresh(payload.expiresAt);

  if (currentProvider !== GULI_IDENTITY_PROVIDER && getAccountApiBaseUrl()) {
    // 有配置统一账号中心时，用 /auth/me 校验服务端会话并获取最新资料。
    // 网络暂时不可用不应阻塞本地素材库；只有明确的 token 失效才进入 refresh。
    try {
      const remoteUser = await fetchCurrentUser(payload.accessToken);
      currentUser = remoteUser;
      const version = accountSessionVersion;
      await enqueueAccountWrite(async () => {
        if (version !== accountSessionVersion) {
          return;
        }
        await writeAccountFile({
          ...file,
          lastLoginMethod,
          user: remoteUser,
          updatedAt: new Date().toISOString(),
        });
        broadcastAccountStatus();
      });
    } catch (error) {
      if (isTokenValidationFailure(error)) {
        try {
          await refreshLocalSession();
        } catch {
          // refreshLocalSession 失败时已清除本地登录态。
        }
      } else {
        logger.warn("account", "session:me-unavailable", {
          code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : undefined,
        });
      }
    }
  }

  if (currentProvider === GULI_IDENTITY_PROVIDER) {
    // 资料接口属于增强同步，不能阻塞本地素材库启动；完成后会推送最新昵称/头像。
    void refreshCurrentUserProfile().catch((error) => {
      logger.warn("account", "profile:restore-unavailable", {
        code: error instanceof Error && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined,
      });
    });
  }

  return getAccountStatus();
}

export async function loginWithEmail(input: unknown): Promise<AccountPublicStatus> {
  const normalized = normalizeEmailLogin(input);

  // 统一身份服务没有密码端点：邮箱+密码表单由浏览器里的授权页承载（同一套表单
  // 外加第三方按钮）。这里改为启动 PKCE 授权流，而不是去请求不存在的 legacy
  // /auth/login。会话在 suyan://oauth/callback 回调里落盘并广播。
  if (!process.env.SUYAN_ACCOUNT_API_URL?.trim() && isGuliIdentityConfigured()) {
    await oauthStartLogin("email", {
      prompt: "login",
      emailHint: normalized.email,
    });
    logger.info("account", "login-delegated-to-identity", { provider: "email" });
    return getAccountStatus();
  }

  const session = await loginAccount(normalized);
  await persistSession(session, "email", "email", { successfulLoginMethod: "email" });
  logger.info("account", "login-succeeded", { uid: session.user.uid, provider: "email" });
  return getAccountStatus();
}

export async function registerWithEmail(
  input: unknown,
): Promise<AccountPublicStatus | AccountRegistrationResult> {
  const normalized = normalizeEmailRegister(input);

  if (normalized.confirmPassword !== undefined && normalized.confirmPassword !== normalized.password) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "两次输入的密码不一致。");
  }

  const result = await registerAccount(normalized);
  if ("verificationRequired" in result) {
    logger.info("account", "registration-pending-email-verification", { provider: "email" });
    return result;
  }

  await persistSession(result, "email", "email", { successfulLoginMethod: "email" });
  logger.info("account", "register-succeeded", { uid: result.user.uid, provider: "email" });
  return getAccountStatus();
}

/** 用户主动退出：清除 token 与本地会话（方案 §二十五），幂等。 */
export async function logoutAccount(): Promise<AccountPublicStatus> {
  const wasLoggedIn = currentUser !== null;
  const payload = tokenManager.getPayload();

  // 先尽力吊销服务端 refresh token，再清理本地状态。即便网络失败，
  // 本机也必须完成退出，避免用户被“卡”在当前账号。
  if (wasLoggedIn && payload && currentProvider === GULI_IDENTITY_PROVIDER) {
    try {
      await revokeGuliSession(payload.refreshToken);
    } catch (error) {
      logger.warn("account", "logout:identity-revoke-failed", {
        code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : undefined,
      });
    }
  } else if (wasLoggedIn && payload && getAccountApiBaseUrl()) {
    try {
      await logoutAccountSession(payload.accessToken, payload.refreshToken);
    } catch (error) {
      logger.warn("account", "logout:remote-revoke-failed", {
        code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : undefined,
      });
    }
  }

  await clearLocalSession();

  if (wasLoggedIn) {
    logger.info("account", "logout", { reason: "user-initiated" });
  }

  return getAccountStatus();
}

/** 手动刷新（AccountRefresh IPC）：未登录报 ACCOUNT_NOT_LOGGED_IN；刷新失败清除登录态。 */
export async function refreshAccountSessionForced(): Promise<AccountPublicStatus> {
  if (!currentUser) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录，无法刷新登录状态。");
  }

  await refreshLocalSession();
  await refreshCurrentUserProfile();
  return getAccountStatus();
}

export async function updateCurrentAccountProfile(
  input: AccountProfileUpdateInput,
): Promise<AccountPublicStatus> {
  const current = requireCurrentGuliAccount();
  const version = accountSessionVersion;
  const displayName = normalizeProfileDisplayName(input?.displayName);
  const payload = tokenManager.getPayload();
  if (!payload) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录。");
  }

  const updated = await updateGuliAccountProfile(payload.accessToken, displayName);
  if (version !== accountSessionVersion || currentUser?.uid !== current.uid) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前账户已变化，请重新保存资料。");
  }
  const user = await fetchGuliAccountUser(payload.accessToken, {
    ...updated,
    identities: updated.identities ?? current.identities,
  });
  await persistCurrentUser(user, version);
  return getAccountStatus();
}

export async function chooseCurrentAccountAvatar(): Promise<AccountPublicStatus | null> {
  const current = requireCurrentGuliAccount();
  const version = accountSessionVersion;
  const selected = await chooseAvatarFile();
  if (!selected) {
    return null;
  }
  if (version !== accountSessionVersion) throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前账户已变化，请重新选择头像。");
  const payload = tokenManager.getPayload();
  if (!payload) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录。");
  }

  await uploadGuliAccountAvatar(payload.accessToken, selected.bytes, selected.contentType);
  if (version !== accountSessionVersion) throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前账户已变化，请刷新资料。");
  // The avatar endpoint may be eventually consistent. Cache the bytes we just
  // uploaded first, so the UI and local account remain correct even if an
  // immediate profile refresh still returns the previous remote avatar.
  const cachedUrl = await cacheAccountAvatar(current.uid, selected.bytes, selected.contentType);
  if (!cachedUrl) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "头像已上传，但本地头像缓存失败，请重试。");
  }
  const user = {
    ...current,
    avatarUrl: cachedUrl,
  };
  await persistCurrentUser(user, version);
  return getAccountStatus();
}

export async function removeCurrentAccountAvatar(): Promise<AccountPublicStatus> {
  const current = requireCurrentGuliAccount();
  const payload = tokenManager.getPayload();
  if (!payload) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录。");
  }

  await deleteGuliAccountAvatar(payload.accessToken);
  await removeAccountAvatar(current.uid);
  const user = await fetchGuliAccountUser(payload.accessToken, current);
  await persistCurrentUser(user);
  return getAccountStatus();
}

/** 在 OAuth 待确认阶段选择自定义头像；图片只留在主进程内存，不提前写入账户。 */
export async function choosePendingOAuthAvatar(): Promise<{
  selected: boolean;
  previewUrl?: string;
}> {
  const pending = pendingOAuthConfirmation;
  if (!pending) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "没有待确认的登录请求。");
  }
  const selected = await chooseAvatarFile();
  if (!selected) {
    return { selected: false };
  }
  pending.customAvatar = selected;
  return {
    selected: true,
    previewUrl: `data:${selected.contentType};base64,${Buffer.from(selected.bytes).toString("base64")}`,
  };
}

/** OAuth 渠道入口（方案 §六/§七/§八）：PKCE + state + 系统默认浏览器授权页。 */
export async function startOAuthLogin(
  input: unknown,
): Promise<AccountOAuthStartResult> {
  const normalized = normalizeOAuthStartInput(input);
  if (pendingOAuthConfirmation) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
      "已有一个登录待确认，请先确认或取消当前登录。",
    );
  }
  if (normalized.mode === "device") {
    if (normalized.provider !== "email") throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "请从设备验证码登录入口发起授权。");
    const version = accountSessionVersion;
    return startDeviceLogin((session) => {
      if (version !== accountSessionVersion) return;
      setPendingOAuthConfirmation(session, GULI_IDENTITY_PROVIDER, session.loginProvider ?? "email", "login", "device");
      broadcastAccountStatus();
    }, (error) => { if (version === accountSessionVersion) broadcastAccountStatus(error); });
  }
  return oauthStartLogin(
    normalized.provider,
    normalized.prompt || normalized.emailHint
      ? {
          ...(normalized.prompt ? { prompt: normalized.prompt } : {}),
          ...(normalized.emailHint ? { emailHint: normalized.emailHint } : {}),
        }
      : undefined,
  );
}

/** 已登录用户发起的独立关联事务：成功后只更新当前用户的身份清单，不切换账号。 */
export async function startOAuthLink(
  input: unknown,
): Promise<{ started: true; expiresAt: number }> {
  if (!currentUser || currentProvider !== GULI_IDENTITY_PROVIDER) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NOT_LOGGED_IN,
      "请先登录统一账号，再绑定其他登录方式。",
    );
  }

  const normalized = normalizeOAuthStartInput(input);
  if (normalized.mode === "device") throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "关联登录方式请使用浏览器授权。");
  if (!(ACCOUNT_EXTERNAL_PROVIDER_IDS as readonly string[]).includes(normalized.provider)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.INPUT_INVALID,
      "只能绑定 Google、Linux.do 或 GitHub。",
    );
  }
  if (pendingOAuthConfirmation) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
      "已有一个账号操作待确认，请先完成或取消当前操作。",
    );
  }

  const uid = currentUser.uid;
  const version = accountSessionVersion;
  const provider = normalized.provider as AccountExternalProviderId;
  if (currentUser.identities?.some((identity) => identity.provider === provider)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.ALREADY_LINKED, "该登录方式已经关联，请先刷新账户资料。");
  }
  return startBrowserLink(provider, uid, () => {
    const payload = tokenManager.getPayload();
    if (version !== accountSessionVersion || currentUser?.uid !== uid || !payload) {
      throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前账户已变化，请重新登录后关联。");
    }
    return payload.accessToken;
  }, async (user) => {
    if (version !== accountSessionVersion || currentUser?.uid !== uid) return;
    // Binding was explicitly confirmed in the browser. Keep the existing profile.
    await persistCurrentUser({ ...currentUser, identities: user.identities }, version);
    broadcastAccountStatus();
  }, (error) => { if (version === accountSessionVersion) broadcastAccountStatus(error); });
}

/** 解绑前由服务端再次校验当前身份；本地不会自行删除服务端身份关系。 */
export async function unlinkOAuthIdentity(
  provider: string,
): Promise<AccountPublicStatus> {
  if (!currentUser || !tokenManager.getPayload() || currentProvider !== GULI_IDENTITY_PROVIDER) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "请先登录统一账号。" );
  }
  if (!(ACCOUNT_EXTERNAL_PROVIDER_IDS as readonly string[]).includes(provider)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "不支持解绑该登录渠道。" );
  }

  const identities = currentUser.identities ?? [];
  if (!identities.some((identity) => identity.provider === provider)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "该登录方式尚未绑定。" );
  }
  if (identities.length <= 1) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.LINK_LAST_NOT_ALLOWED,
      "至少保留一种登录方式，不能解绑最后一个账号。",
    );
  }

  const payload = tokenManager.getPayload();
  let updatedUser = await unlinkGuliIdentity(
    payload!.accessToken,
    provider as Exclude<AccountLoginProviderId, "email">,
  );
  updatedUser = await fetchGuliAccountUser(payload!.accessToken, {
    ...updatedUser,
    identities: updatedUser.identities ?? identities,
  });
  await persistCurrentUser(updatedUser);
  return getAccountStatus();
}

export function normalizeOAuthStartInput(input: unknown): {
  provider: string;
  mode?: "browser" | "device";
  prompt?: AccountOAuthPrompt;
  emailHint?: string;
} {
  if (typeof input === "string") {
    return { provider: input };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "登录参数不正确。");
  }

  const record = input as Record<string, unknown>;
  if (record.mode !== undefined && record.mode !== "browser" && record.mode !== "device") {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "登录模式不正确。");
  }
  if (typeof record.provider !== "string") {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "登录渠道不正确。");
  }

  if (
    record.prompt !== undefined &&
    record.prompt !== "consent" &&
    record.prompt !== "login" &&
    record.prompt !== "select_account"
  ) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "登录提示模式不正确。");
  }

  const emailHint = typeof record.emailHint === "string" ? record.emailHint.trim() : "";
  if (record.emailHint !== undefined && (!emailHint || emailHint.length > 320)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "登录邮箱格式不正确。");
  }

  return {
    provider: record.provider,
    ...(record.mode ? { mode: record.mode } : {}),
    ...(record.prompt ? { prompt: record.prompt } : {}),
    ...(emailHint ? { emailHint } : {}),
  };
}

/** 确认 OAuth 身份后才写入 account.json，并切换当前登录用户。 */
export async function confirmOAuthLogin(
  selection?: AccountOAuthProfileSelection,
): Promise<AccountPublicStatus> {
  const pending = pendingOAuthConfirmation;
  if (!pending) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "没有待确认的登录请求。");
  }
  if (pending.expiresAt <= Date.now()) {
    clearPendingOAuthConfirmation();
    const error = new AccountError(ACCOUNT_ERROR_CODES.OAUTH_EXPIRED, "登录确认已过期，请重新登录。");
    broadcastAccountStatus(error);
    throw error;
  }

  const normalizedSelection = normalizeOAuthProfileSelection(selection, pending);

  if (pending.purpose === "link") {
    await confirmOAuthLink(pending);
    const linkedCurrent = requireCurrentGuliAccount();
    const payload = tokenManager.getPayload();
    if (!payload) {
      throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前登录账号已失效，请重新登录。 ");
    }
    const updatedUser = await applyOAuthProfileSelection(
      pending,
      normalizedSelection,
      payload.accessToken,
      linkedCurrent,
      linkedCurrent,
    );
    await persistCurrentUser(updatedUser);
    clearPendingOAuthConfirmation();
    logger.info("account", "oauth-link-succeeded", {
      uid: currentUser?.uid,
      provider: pending.loginProvider,
    });
    broadcastAccountStatus();
    return getAccountStatus();
  }

  // 先完成持久化，成功后再清理待确认事务；写盘失败时仍可重试确认。
  const updatedUser = await applyOAuthProfileSelection(
    pending,
    normalizedSelection,
    pending.session.accessToken,
    pending.session.user,
    currentUser,
  );
  await persistSession(
    { ...pending.session, user: updatedUser },
    pending.provider,
    pending.loginProvider,
    { broadcast: false, successfulLoginMethod: pending.loginMethod },
  );
  clearPendingOAuthConfirmation();
  logger.info("account", "oauth-login-succeeded", {
    uid: pending.session.user.uid,
    provider: pending.loginProvider,
  });
  broadcastAccountStatus();
  return getAccountStatus();
}

/** 取消当前 OAuth 事务或放弃待确认身份。 */
export function cancelOAuthLogin(): { cancelled: boolean } {
  if (pendingOAuthConfirmation) {
    clearPendingOAuthConfirmation();
    logger.info("account", "oauth-confirmation-cancelled", { provider: GULI_IDENTITY_PROVIDER });
    broadcastAccountStatus();
    return { cancelled: true };
  }
  return oauthCancelLogin();
}

/** suyan:// 回调处理器（方案 §八）：校验 → 后端代交换 → 等待用户确认。 */
export async function handleOAuthCallback(rawUrl: string): Promise<AccountPublicStatus> {
  const { session, provider, loginProvider, purpose, expectedUid } = await oauthHandleCallback(rawUrl);
  if (purpose === "link") {
    if (!currentUser || !tokenManager.getPayload() || expectedUid !== currentUser.uid) {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.NOT_LOGGED_IN,
        "当前登录账号已变化，无法继续绑定。",
      );
    }
  }
  setPendingOAuthConfirmation(session, provider, loginProvider, purpose);
  broadcastAccountStatus();
  return getAccountStatus();
}

async function confirmOAuthLink(pending: PendingOAuthConfirmation): Promise<void> {
  const current = currentUser;
  const payload = tokenManager.getPayload();
  const version = accountSessionVersion;
  if (
    !current ||
    !payload ||
    currentProvider !== GULI_IDENTITY_PROVIDER ||
    pending.loginProvider === "email"
  ) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NOT_LOGGED_IN,
      "当前登录账号已失效，请重新登录后再绑定。",
    );
  }

  let updatedUser: AccountUser;
  if (pending.session.user.uid === current.uid) {
    // 同一个统一 uid 说明该方式已经被身份服务绑定；不重复创建 identity。
    try {
      updatedUser = await fetchGuliAccountUser(payload.accessToken, current);
    } catch {
      updatedUser = current;
    }
  } else {
    // 只有服务端同时验证当前 token 与待绑定 token 后，才允许真正绑定。
    updatedUser = await linkGuliIdentity(
      payload.accessToken,
      pending.session.accessToken,
      pending.loginProvider as Exclude<AccountLoginProviderId, "email">,
    );
    try {
      updatedUser = await fetchGuliAccountUser(payload.accessToken, {
        ...updatedUser,
        identities: updatedUser.identities ?? current.identities,
      });
    } catch {
      // The link request has already been accepted. Keep its validated user
      // payload and let the next manual refresh fill in profile/avatar data.
      updatedUser = {
        ...updatedUser,
        identities: updatedUser.identities ?? current.identities,
      };
    }
  }

  await persistCurrentUser(updatedUser, version);
}

function requireCurrentGuliAccount(): AccountUser {
  if (!currentUser || !tokenManager.getPayload() || currentProvider !== GULI_IDENTITY_PROVIDER) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NOT_LOGGED_IN,
      "当前账号不支持资料编辑，请重新登录。",
    );
  }
  return currentUser;
}

async function chooseAvatarFile(): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const owner = BrowserWindow.getFocusedWindow() ?? undefined;
  const options: OpenDialogOptions = {
    title: "选择账户头像",
    properties: ["openFile"],
    filters: [{ name: "头像图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  try {
    return await readAccountAvatarFile(result.filePaths[0]);
  } catch (error) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.INPUT_INVALID,
      error instanceof Error ? error.message.trim() : "头像文件不合法。",
    );
  }
}

function normalizeOAuthProfileSelection(
  input: unknown,
  pending: PendingOAuthConfirmation,
): AccountOAuthProfileSelection {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const usernameSource = readProfileSource(record.usernameSource, "new");
  const avatarSource = readProfileSource(record.avatarSource, "new");
  const current = currentUser;

  if ((usernameSource === "current" || avatarSource === "current") && !current) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "当前账号资料不可用，请选择新登录资料。");
  }

  let customUsername: string | undefined;
  if (usernameSource === "custom") {
    const candidate = normalizeProfileDisplayName(record.customUsername);
    if (!candidate) {
      throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "请输入 1-64 个字符的自定义昵称。");
    }
    customUsername = candidate;
  }

  if (avatarSource === "custom" && !pending.customAvatar) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "请先选择自定义头像。");
  }

  return {
    usernameSource,
    avatarSource,
    ...(customUsername ? { customUsername } : {}),
  };
}

function readProfileSource(value: unknown, fallback: AccountProfileSource): AccountProfileSource {
  return value === "current" || value === "new" || value === "custom" ? value : fallback;
}

function normalizeProfileDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(trimmed)) {
    return null;
  }
  return trimmed;
}

async function applyOAuthProfileSelection(
  pending: PendingOAuthConfirmation,
  selection: AccountOAuthProfileSelection,
  accessToken: string,
  targetUser: AccountUser,
  currentProfile: AccountUser | null,
): Promise<AccountUser> {
  const username = selection.usernameSource === "current"
    ? currentProfile!.username
    : selection.usernameSource === "custom"
      ? selection.customUsername!
      : pending.user.username;
  let updatedUser = targetUser;

  if (username !== targetUser.username) {
    const profileUser = await updateGuliAccountProfile(accessToken, username);
    updatedUser = {
      ...updatedUser,
      ...profileUser,
      username,
      identities: profileUser.identities ?? updatedUser.identities,
    };
  }

  const avatar = selection.avatarSource === "custom"
    ? pending.customAvatar!
    : await readCachedAccountAvatar(
        selection.avatarSource === "current" ? currentProfile!.uid : pending.user.uid,
      );
  if (avatar) {
    await uploadGuliAccountAvatar(accessToken, avatar.bytes, avatar.contentType);
  } else {
    await deleteGuliAccountAvatar(accessToken);
  }

  return fetchGuliAccountUser(accessToken, {
    ...updatedUser,
    username,
  });
}

async function refreshCurrentUserProfile(): Promise<void> {
  const current = currentUser;
  const payload = tokenManager.getPayload();
  const version = accountSessionVersion;
  if (!current || !payload) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录。");
  }

  let updatedUser = current;
  if (currentProvider === GULI_IDENTITY_PROVIDER) {
    updatedUser = await fetchGuliAccountUser(payload.accessToken, current);
  } else if (getAccountApiBaseUrl()) {
    updatedUser = await fetchCurrentUser(payload.accessToken);
  }
  if (
    version !== accountSessionVersion ||
    currentUser?.uid !== current.uid ||
    tokenManager.getPayload()?.accessToken !== payload.accessToken
  ) {
    return;
  }
  await persistCurrentUser(updatedUser, version);
}

async function refreshLocalSession(): Promise<void> {
  const user = currentUser;
  const version = accountSessionVersion;
  if (!user) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录。");
  }

  let refreshedUser = user;
  try {
    const payload = await tokenManager.refreshIfNeeded(async () => {
      const refreshToken = tokenManager.getPayload()?.refreshToken;
      if (!refreshToken) {
        throw new AccountError(ACCOUNT_ERROR_CODES.REFRESH_FAILED, "缺少刷新令牌，无法续期登录状态。");
      }

      if (currentProvider === GULI_IDENTITY_PROVIDER) {
        return refreshGuliSession(refreshToken);
      }

      const session = await refreshAccountSession(refreshToken);
      refreshedUser = session.user;
      return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt };
    });

    if (
      version !== accountSessionVersion ||
      currentUser?.uid !== user.uid
    ) {
      return;
    }
    await persistSession(
      {
        user: refreshedUser,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        expiresAt: payload.expiresAt,
      },
      currentProvider ?? "email",
      currentLoginProvider,
    );
    logger.info("account", "session:refreshed", { uid: user.uid });
  } catch (error) {
    if (error instanceof StaleTokenRefreshError) {
      logger.info("account", "session:stale-refresh-ignored", {});
      throw error;
    }
    if (version !== accountSessionVersion || currentUser?.uid !== user.uid) {
      logger.info("account", "session:stale-refresh-failure-ignored", {});
      throw error;
    }
    const code = error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : "";
    logger.warn("account", "session:refresh-failed", {
      code,
      message: String(error),
    });
    // 只在真失效（invalid_grant / REFRESH_FAILED）时清除登录态；网络错误 / 服务暂时不可用
    // 时保留本地会话，让用户能继续使用素材库并在恢复后自动续期（R6 / P064）。
    if (isSessionInvalidated(code) && code !== "ACCOUNT_SESSION_CHANGED") {
      await clearLocalSession();
    }
    throw error;
  }
}

function isSessionInvalidated(code: string): boolean {
  return (
    code === ACCOUNT_ERROR_CODES.REFRESH_FAILED ||
    code === ACCOUNT_ERROR_CODES.TOKEN_EXPIRED ||
    code === ACCOUNT_ERROR_CODES.INVALID_CREDENTIALS ||
    code === ACCOUNT_ERROR_CODES.BACKEND_NOT_CONFIGURED ||
    code === ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE
  );
}

async function persistSession(
  session: AccountSession,
  provider: AccountProviderId,
  loginProvider: AccountLoginProviderId | null = null,
  options: { broadcast?: boolean; requireWorkProfileRefresh?: boolean; successfulLoginMethod?: AccountLoginMethod } = {},
): Promise<void> {
  accountSessionVersion += 1;
  const payload: AccountTokenPayload = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };

  const file: AccountFile = {
    schemaVersion: 1,
    user: session.user,
    provider,
    loginProvider,
    lastLoginMethod: options.successfulLoginMethod ?? lastLoginMethod,
    tokenEncrypted: encryptAccountTokenPayload(payload),
    updatedAt: new Date().toISOString(),
  };

  const writeVersion = accountSessionVersion;
  await enqueueAccountWrite(async () => {
    if (writeVersion !== accountSessionVersion) {
      return;
    }
    await writeAccountFile(file);
    if (writeVersion !== accountSessionVersion) {
      return;
    }
    tokenManager.setPayload(payload);
    currentUser = session.user;
    currentProvider = provider;
    currentLoginProvider = loginProvider;
    lastLoginMethod = file.lastLoginMethod ?? null;
    scheduleTokenRefresh(payload.expiresAt);
    // Update only already-owned works. Never claim older anonymous materials.
    try {
      const { refreshOwnedWorkProfile } = await import("../library/workAttribution");
      await refreshOwnedWorkProfile(session.user);
    } catch {
      logger.warn("account", "works:profile-refresh-failed", { code: "WORK_PROFILE_REFRESH_FAILED" });
      if (options.requireWorkProfileRefresh) {
        broadcastAccountStatus();
        throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "账户资料已保存，但本地作品头像更新失败。请检查数据目录可写后刷新账户资料。");
      }
    }
    if (options.broadcast !== false) {
      broadcastAccountStatus();
    }
  });
}

async function persistCurrentUser(
  user: AccountUser,
  expectedVersion = accountSessionVersion,
): Promise<void> {
  if (expectedVersion !== accountSessionVersion) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前登录账号已变化。");
  }
  const payload = tokenManager.getPayload();
  if (!currentProvider || !payload) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前未登录。");
  }
  if (expectedVersion !== accountSessionVersion) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前登录账号已变化。");
  }
  await persistSession(
    {
      user,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
    },
    currentProvider,
    currentLoginProvider,
    { requireWorkProfileRefresh: true },
  );
}

async function clearLocalSession(): Promise<void> {
  oauthCancelLogin();
  accountSessionVersion += 1;
  clearPendingOAuthConfirmation();
  tokenManager.clear();
  currentUser = null;
  currentProvider = null;
  currentLoginProvider = null;
  cancelTokenRefresh();
  const clearVersion = accountSessionVersion;
  await enqueueAccountWrite(async () => {
    if (clearVersion !== accountSessionVersion) {
      return;
    }
    await writeAccountFile({ ...createEmptyAccountFile(), lastLoginMethod });
    broadcastAccountStatus();
  });
}

function enqueueAccountWrite(task: () => Promise<void>): Promise<void> {
  const next = accountWriteQueue.then(task, task);
  accountWriteQueue = next.catch(() => undefined);
  return next;
}

function setPendingOAuthConfirmation(
  session: AccountSession,
  provider: AccountProviderId,
  loginProvider: AccountLoginProviderId,
  purpose: AccountOAuthPurpose,
  loginMethod: AccountLoginMethod = loginProvider,
): void {
  clearPendingOAuthConfirmation();
  const confirmation: PendingOAuthConfirmation = {
    session,
    loginMethod,
    user: session.user,
    provider,
    loginProvider,
    purpose,
    expiresAt: Date.now() + OAUTH_CONFIRMATION_TTL_MS,
  };
  pendingOAuthConfirmation = confirmation;
  oauthConfirmationTimer = setTimeout(() => {
    if (pendingOAuthConfirmation !== confirmation) {
      return;
    }
    pendingOAuthConfirmation = null;
    oauthConfirmationTimer = null;
    broadcastAccountStatus({
      code: ACCOUNT_ERROR_CODES.OAUTH_EXPIRED,
      message: "登录确认已过期，请重新登录。",
    });
  }, OAUTH_CONFIRMATION_TTL_MS);
  oauthConfirmationTimer.unref?.();
}

function clearPendingOAuthConfirmation(): void {
  if (oauthConfirmationTimer) {
    clearTimeout(oauthConfirmationTimer);
    oauthConfirmationTimer = null;
  }
  pendingOAuthConfirmation = null;
}

function toPublicOAuthConfirmation(
  pending: PendingOAuthConfirmation,
): AccountOAuthConfirmation {
  return {
    user: pending.user,
    provider: pending.provider,
    loginProvider: pending.loginProvider,
    purpose: pending.purpose,
    expiresAt: pending.expiresAt,
  };
}

/** 提前 2 分钟自动刷新 token，保证有效期内无需再次登录（方案 §十/§十一）。 */
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;
/**
 * 下限 30 秒：剩余寿命已经落在提前量之内时不能立即触发，否则新 token 若同样落在
 * 提前量内会形成热循环——而 refresh token 是轮换的，每转一圈都会烧掉一个。
 */
const TOKEN_REFRESH_MIN_DELAY_MS = 30 * 1000;

function scheduleTokenRefresh(expiresAt: number): void {
  cancelTokenRefresh();
  const delay = Math.max(
    TOKEN_REFRESH_MIN_DELAY_MS,
    expiresAt - Date.now() - TOKEN_REFRESH_MARGIN_MS,
  );

  tokenRefreshTimer = setTimeout(() => {
    void (async () => {
      try {
        await refreshLocalSession();
      } catch (error) {
        logger.warn("account", "auto-refresh-failed", {
          code: error instanceof Error && "code" in error ? String((error as { code?: unknown }).code) : undefined,
        });
        // refreshLocalSession 只在真失效时清会话；网络暂时不可用保留登录态，下次启动再续期。
      }
    })();
  }, delay);
  // 续期定时器不应拖住主进程退出。
  tokenRefreshTimer.unref?.();
}

function cancelTokenRefresh(): void {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

function normalizeEmailLogin(input: unknown): EmailLoginInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "邮箱或密码格式不正确。");
  }

  const record = input as Record<string, unknown>;
  if (typeof record.email !== "string" || typeof record.password !== "string") {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "邮箱或密码格式不正确。");
  }

  const email = record.email.trim();
  const password = record.password;

  if (!isEmail(email)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "邮箱格式不正确。");
  }
  if (!isPassword(password)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "密码长度需为 12-128 位。");
  }

  return { email, password };
}

function normalizeEmailRegister(input: unknown): EmailRegisterInput {
  const login = normalizeEmailLogin(input);
  const record = (input as Record<string, unknown>) ?? {};
  const confirmPassword = typeof record.confirmPassword === "string" ? record.confirmPassword : undefined;

  return { email: login.email, password: login.password, confirmPassword };
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 128;
}

function isTokenValidationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  return code === ACCOUNT_ERROR_CODES.INVALID_CREDENTIALS || code === ACCOUNT_ERROR_CODES.TOKEN_EXPIRED;
}

/** 登录态变化后向所有窗口广播公开状态（登录/退出/OAuth/刷新失败清除）。 */
function broadcastAccountStatus(error?: { code: string; message: string }): void {
  const status = error ? { ...getAccountStatus(), error } : getAccountStatus();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.accountStatusChanged, status);
    }
  }
}

/** OAuth 回调失败时也通知渲染层，让用户能直接看到可重试的结构化错误。 */
export function broadcastAccountError(error: unknown): void {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = isAccountErrorCode(record.code)
    ? record.code
    : ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR;
  const message = typeof record.message === "string" && record.message
    ? record.message
    : "第三方授权失败，请稍后重试。";
  broadcastAccountStatus({ code, message });
}

/** 仅供测试：清空模块内存状态（不触碰磁盘）。 */
export function resetAccountServiceForTests(): void {
  lastLoginMethod = null;
  tokenManager.clear();
  clearPendingOAuthConfirmation();
  currentUser = null;
  currentProvider = null;
  currentLoginProvider = null;
  accountSessionVersion += 1;
}
