import {
  ACCOUNT_ERROR_CODES,
  ACCOUNT_LOGIN_PROVIDER_IDS,
  ACCOUNT_EXTERNAL_PROVIDER_IDS,
  type AccountOAuthPurpose,
  type AccountOAuthPrompt,
  type AccountLoginProviderId,
  type AccountProviderId,
  type AccountSession,
  type AccountOAuthStartResult,
} from "../../../../src/features/account/types/account";
import { AccountError } from "../errors";
import { logger } from "../../appLogger";
import { generateCodeChallenge, generateCodeVerifier, generateOAuthState, safeEqual } from "./pkce";
import {
  cancelActivePendingOAuthSession,
  consumePendingOAuthSession,
  getPendingOAuthSession,
  peekPendingOAuthSession,
  putPendingOAuthSession,
} from "./oauthState";
import {
  buildGuliAuthorizationUrl,
  exchangeGuliAuthorizationCode,
  getGuliIdentityConfig,
  GULI_IDENTITY_PROVIDER,
  isGuliIdentityConfigured,
  startGuliDeviceAuthorization,
  startGuliIdentityLink,
  readGuliLinkedAccount,
} from "./guliIdentityClient";
import { isOAuthDeeplink } from "./oauthDeeplink";
import { openOAuthAuthorizationWindow } from "./oauthWindow";

/**
 * OAuth 编排：素言只作为统一身份服务的公共 PKCE 客户端。
 * 各第三方平台的 client_id / client_secret 只保留在服务端，本地只传递
 * 用户选择的平台标识和一次性 PKCE 事务。
 */
export function isOAuthProviderId(value: string): value is AccountLoginProviderId {
  return (ACCOUNT_LOGIN_PROVIDER_IDS as readonly string[]).includes(value);
}

export function listOAuthProvidersPublic(): { id: string; label: string; configured: boolean }[] {
  const configured = isGuliIdentityConfigured();
  const labels: Record<AccountLoginProviderId, string> = {
    email: "邮箱",
    google: "Google",
    linuxdo: "Linux.do",
    github: "GitHub",
  };
  return ACCOUNT_LOGIN_PROVIDER_IDS.map((id) => ({ id, label: labels[id], configured }));
}

export type OAuthAuthorizationWindowOpener = (authorizeUrl: string) => Promise<void>;

export type OAuthLoginStartResult = AccountOAuthStartResult;

let loginStartInFlight: Promise<OAuthLoginStartResult> | null = null;
let activeDevice: { cancel: () => void } | null = null;
let activeBrowserLink: { cancel: () => void } | null = null;

/** A bearer-bound link transaction belongs to the current account from the start. */
export async function startBrowserLink(
  provider: "google" | "linuxdo" | "github",
  expectedUid: string,
  accessToken: () => string,
  onSuccess: (user: AccountSession["user"]) => Promise<void>,
  onError: (error: AccountError) => void,
): Promise<OAuthLoginStartResult> {
  if (activeBrowserLink || activeDevice || loginStartInFlight || getPendingOAuthSession()) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS, "已有账号操作正在进行，请先完成或取消。");
  }
  const expiresAt = Date.now() + 10 * 60 * 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const job = { cancel: () => { clearTimeout(timer); clearTimeout(deadline); if (activeBrowserLink === job) activeBrowserLink = null; } };
  activeBrowserLink = job;
  const active = () => activeBrowserLink === job && Date.now() < expiresAt;
  const poll = async () => {
    if (!active()) return;
    try {
      const user = await readGuliLinkedAccount(accessToken());
      if (!active()) return;
      if (user.uid !== expectedUid) throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "当前账户已变化，请重新关联。");
      if (user.identities?.some((identity) => identity.provider === provider)) {
        await onSuccess(user);
        job.cancel();
        return;
      }
    } catch (error) {
      if (!active()) return;
      if (!(error instanceof AccountError) || error.code !== ACCOUNT_ERROR_CODES.NETWORK_ERROR) {
        job.cancel();
        onError(error instanceof AccountError ? error : new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "关联状态同步失败，请刷新账户资料。"));
        return;
      }
    }
    if (active()) { timer = setTimeout(() => void poll(), 3000); timer.unref?.(); }
  };
  try {
    const url = await startGuliIdentityLink(accessToken(), provider);
    if (!active()) throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_CANCELLED, "已取消等待关联。");
    await openOAuthAuthorizationWindow(url);
    if (!active()) throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_CANCELLED, "已取消等待关联。");
    deadline = setTimeout(() => { job.cancel(); onError(new AccountError(ACCOUNT_ERROR_CODES.OAUTH_EXPIRED, "等待关联已超时，请刷新账户资料查看结果。")); }, Math.max(0, expiresAt - Date.now()));
    deadline.unref?.();
    timer = setTimeout(() => void poll(), 3000);
    timer.unref?.();
    return { started: true, expiresAt };
  } catch (error) { job.cancel(); throw error; }
}

export async function startDeviceLogin(
  onSuccess: (session: AccountSession) => void,
  onError: (error: AccountError) => void,
): Promise<OAuthLoginStartResult> {
  if (activeBrowserLink || activeDevice || loginStartInFlight || getPendingOAuthSession()) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS, "已有账号操作正在进行，请先完成或取消。");
  }
  let cancelled = false;
  let flow: Awaited<ReturnType<typeof startGuliDeviceAuthorization>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const job = { cancel: () => {
    cancelled = true;
    flow?.abort();
    clearTimeout(timer);
    if (activeDevice === job) activeDevice = null;
  } };
  activeDevice = job;
  try {
    flow = await startGuliDeviceAuthorization();
    if (cancelled) {
      flow.abort();
      throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_CANCELLED, "设备授权已取消。");
    }
    let browserOpened = false;
    try {
      await openOAuthAuthorizationWindow(flow.verificationUri);
      browserOpened = true;
    } catch { /* The visible address lets the user open it manually. */ }
    if (cancelled) throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_CANCELLED, "设备授权已取消。");
    const expiresAt = flow.expiresAt;
    timer = setTimeout(() => {
      job.cancel();
      onError(new AccountError(ACCOUNT_ERROR_CODES.OAUTH_EXPIRED, "设备验证码已过期，请重新获取。"));
    }, Math.max(0, expiresAt - Date.now()));
    timer.unref?.();
    void flow.wait().then((session) => {
      if (cancelled || activeDevice !== job || Date.now() >= expiresAt) return;
      job.cancel();
      onSuccess(session);
    }, (error: AccountError) => {
      if (cancelled || activeDevice !== job) return;
      job.cancel();
      onError(error);
    });
    logger.info("account", "device-authorization-started");
    return { started: true, expiresAt, device: { userCode: flow.userCode, verificationUri: flow.verificationUri, browserOpened } };
  } catch (error) {
    job.cancel();
    throw error;
  }
}

export async function startLogin(
  providerId: string,
  options?: {
    openAuthorizationWindow?: OAuthAuthorizationWindowOpener;
    /** 授权提示模式；第三方登录默认强制重新进入真实授权流程。 */
    prompt?: AccountOAuthPrompt;
    /** 非敏感的邮箱提示，由 Guli Identity 登录页决定是否采纳。 */
    emailHint?: string;
  },
): Promise<OAuthLoginStartResult> {
  return startOAuth(providerId, "login", undefined, options);
}

export async function startLink(
  providerId: string,
  expectedUid: string,
  options?: {
    openAuthorizationWindow?: OAuthAuthorizationWindowOpener;
    prompt?: AccountOAuthPrompt;
  },
): Promise<OAuthLoginStartResult> {
  if (!(ACCOUNT_EXTERNAL_PROVIDER_IDS as readonly string[]).includes(providerId)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "不支持绑定该登录渠道。");
  }
  if (!expectedUid.trim()) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NOT_LOGGED_IN, "当前用户身份无效。");
  }
  return startOAuth(providerId, "link", expectedUid, options);
}

async function startOAuth(
  providerId: string,
  purpose: AccountOAuthPurpose,
  expectedUid: string | undefined,
  options?: {
    openAuthorizationWindow?: OAuthAuthorizationWindowOpener;
    prompt?: AccountOAuthPrompt;
    emailHint?: string;
  },
): Promise<OAuthLoginStartResult> {
  if (!isOAuthProviderId(providerId)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "不支持的登录渠道。");
  }

  if (loginStartInFlight || activeDevice || activeBrowserLink) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
      "已有一个账号操作正在启动，请稍候。",
    );
  }

  if (getPendingOAuthSession()) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_IN_PROGRESS,
      "已有一个账号操作正在浏览器授权页中进行，请完成或取消当前操作。",
    );
  }

  const operation = startLoginInternal(providerId, purpose, expectedUid, options);
  loginStartInFlight = operation;
  try {
    return await operation;
  } finally {
    if (loginStartInFlight === operation) {
      loginStartInFlight = null;
    }
  }
}

async function startLoginInternal(
  providerId: AccountLoginProviderId,
  purpose: AccountOAuthPurpose,
  expectedUid: string | undefined,
  options?: {
    openAuthorizationWindow?: OAuthAuthorizationWindowOpener;
    prompt?: AccountOAuthPrompt;
    /** 非敏感的邮箱提示，由 Guli Identity 登录页决定是否采纳。 */
    emailHint?: string;
  },
): Promise<OAuthLoginStartResult> {
  const config = getGuliIdentityConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateOAuthState();
  const nonce = generateOAuthState();

  putPendingOAuthSession({
    provider: GULI_IDENTITY_PROVIDER,
    loginProvider: providerId,
    purpose,
    ...(expectedUid ? { expectedUid } : {}),
    state,
    nonce,
    codeVerifier,
    redirectUri: config.redirectUri,
    issuer: config.issuer,
  });

  try {
    // 选择渠道进入真实登录页；URL 构建器同时要求 consent，避免静默授权。
    const prompt = options?.prompt ?? (providerId === "email" ? undefined : "login");
    const authorizeUrl = await buildGuliAuthorizationUrl({
      state,
      nonce,
      codeChallenge,
      loginProvider: providerId,
      ...(prompt ? { prompt } : {}),
      emailHint: options?.emailHint,
    });
    const openAuthorizationWindow =
      options?.openAuthorizationWindow ?? openOAuthAuthorizationWindow;
    await openAuthorizationWindow(authorizeUrl);
  } catch (error) {
    // 浏览器未成功打开时作废 state，避免留下可用授权事务。
    consumePendingOAuthSession(state);
    if (error instanceof AccountError) throw error;
    throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "无法打开登录页面。");
  }

  logger.info("account", purpose === "link" ? "oauth-link-started" : "oauth-started", {
    provider: GULI_IDENTITY_PROVIDER,
    loginProvider: providerId,
    purpose,
  });
  const pending = peekPendingOAuthSession(state);
  if (!pending) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID,
      "登录事务已过期，请重新尝试。",
    );
  }
  return { started: true, expiresAt: pending.expiresAt };
}

/** 用户明确取消当前安全授权后，允许下一次授权重新建立事务。 */
export function cancelLogin(): { cancelled: boolean } {
  if (activeBrowserLink) { activeBrowserLink.cancel(); return { cancelled: true }; }
  if (activeDevice) {
    activeDevice.cancel();
    logger.info("account", "device-authorization-cancelled");
    return { cancelled: true };
  }
  const cancelled = cancelActivePendingOAuthSession();
  if (cancelled) {
    logger.info("account", "oauth-cancelled", { provider: GULI_IDENTITY_PROVIDER });
  }
  return { cancelled };
}

export async function handleCallback(
  rawUrl: string,
): Promise<{
  session: AccountSession;
  provider: AccountProviderId;
  loginProvider: AccountLoginProviderId;
  purpose: AccountOAuthPurpose;
  expectedUid?: string;
}> {
  const url = parseOAuthCallbackUrl(rawUrl);
  const callbackError = url.searchParams.get("error");
  if (callbackError) {
    // 错误回调同样消费 state，避免用户取消后该授权事务继续可用。
    const errorState = url.searchParams.get("state");
    const failedTransaction = errorState ? peekPendingOAuthSession(errorState) : null;
    if (errorState) {
      consumePendingOAuthSession(errorState);
    }
    const isDenied = callbackError === "access_denied" || callbackError === "user_cancelled";
    const isProviderUnavailable = callbackError === "temporarily_unavailable";
    logger.warn("account", "oauth-callback-error", {
      error: ["access_denied", "user_cancelled", "temporarily_unavailable", "server_error", "login_required"].includes(callbackError)
        ? callbackError : "unknown_oauth_error",
      loginProvider: failedTransaction?.loginProvider ?? null,
      purpose: failedTransaction?.purpose ?? null,
      code: isProviderUnavailable ? ACCOUNT_ERROR_CODES.OAUTH_SERVICE_UNAVAILABLE : ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR,
    });
    throw new AccountError(
      isDenied
        ? ACCOUNT_ERROR_CODES.OAUTH_CANCELLED
        : isProviderUnavailable
          ? ACCOUNT_ERROR_CODES.OAUTH_SERVICE_UNAVAILABLE
          : ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR,
      isDenied
        ? "授权已取消。"
        : isProviderUnavailable
          ? "登录服务暂时无法连接第三方平台，请稍后重试或选择其他登录方式。"
          : "第三方登录失败。",
    );
  }

  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || !code) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "OAuth 回调缺少必要参数（state/code）。");
  }

  // 单次使用：取出的瞬间即删除，重复回调或重放无法再次消费。
  const pending = consumePendingOAuthSession(state);
  if (!pending || !safeEqual(pending.state, state)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "OAuth 回调不合法：state 缺失、过期或已被使用。");
  }

  const callbackIssuer = url.searchParams.get("iss");
  if (callbackIssuer && !safeEqual(callbackIssuer, pending.issuer)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_STATE_INVALID, "OAuth 回调 issuer 校验失败。");
  }

  const session = await exchangeGuliAuthorizationCode(rawUrl, {
    state,
    nonce: pending.nonce,
    codeVerifier: pending.codeVerifier,
  });
  logger.info("account", "oauth-completed", {
    provider: GULI_IDENTITY_PROVIDER,
    loginProvider: pending.loginProvider ?? "email",
    purpose: pending.purpose ?? "login",
    uid: session.user.uid,
  });
  return {
    session,
    provider: GULI_IDENTITY_PROVIDER,
    loginProvider: pending.loginProvider ?? "email",
    purpose: pending.purpose ?? "login",
    ...(pending.expectedUid ? { expectedUid: pending.expectedUid } : {}),
  };
}

function parseOAuthCallbackUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "OAuth 回调地址无法解析。");
  }

  if (!isOAuthDeeplink(rawUrl)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "OAuth 回调协议不匹配（须为 suyan://oauth/callback）。");
  }
  return url;
}

export { parseOAuthCallbackUrl };
