import { net } from "electron";
import {
  Issuer,
  generators,
  type Client,
  type IdTokenClaims,
  type TokenSet,
} from "openid-client";
import {
  ACCOUNT_IDENTITY_PROVIDER_IDS,
  ACCOUNT_ERROR_CODES,
  type AccountErrorCode,
  type AccountIdentity,
  type AccountOAuthPrompt,
  type AccountLoginProviderId,
  type AccountSession,
  type AccountTokenPayload,
  type AccountUser,
} from "../../../../src/features/account/types/account";
import { AccountError } from "../errors";
import { readGuliIdentityConfigValue } from "./guliIdentityConfig";
import {
  cacheAccountAvatar,
  removeAccountAvatar,
} from "../accountAvatarCache";

export const GULI_IDENTITY_PROVIDER = "guli" as const;
export const DEFAULT_GULI_IDENTITY_ISSUER = "https://auth.guliacer.dpdns.org";
export const DEFAULT_GULI_IDENTITY_REDIRECT_URI = "suyan://oauth/callback";
export const DEFAULT_GULI_IDENTITY_SCOPES = "openid email profile offline_access";

const GULI_PROFILE_PATH = "/v1/account/profile";
const GULI_AVATAR_PATH = "/v1/account/avatar";
const GULI_AVATAR_IMAGE_PATH = "/v1/account/avatar/image";
const GULI_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

type GuliIdentityConfig = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
};

let cachedClient: Client | null = null;
let cachedConfigKey = "";
let discoveryInFlight: Promise<Client> | null = null;

export function getGuliIdentityConfig(): GuliIdentityConfig {
  const issuer =
    readGuliIdentityConfigValue("GULI_IDENTITY_ISSUER") ||
    DEFAULT_GULI_IDENTITY_ISSUER;
  const clientId = readGuliIdentityConfigValue("GULI_IDENTITY_CLIENT_ID");
  const redirectUri =
    readGuliIdentityConfigValue("GULI_IDENTITY_REDIRECT_URI") ||
    DEFAULT_GULI_IDENTITY_REDIRECT_URI;
  const scopes = normalizeScopes(
    readGuliIdentityConfigValue("GULI_IDENTITY_SCOPES") ||
      DEFAULT_GULI_IDENTITY_SCOPES,
  );

  if (!isHttpsUrl(issuer)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "登录服务 issuer 必须使用 HTTPS。",
    );
  }
  if (!clientId) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "尚未配置登录服务 client_id。",
    );
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "登录服务回调地址不合法。",
    );
  }

  return { issuer: trimTrailingSlash(issuer), clientId, redirectUri, scopes };
}

export function isGuliIdentityConfigured(): boolean {
  try {
    getGuliIdentityConfig();
    return true;
  } catch {
    return false;
  }
}

export async function buildGuliAuthorizationUrl(input: {
  state: string;
  nonce: string;
  codeChallenge: string;
  loginProvider?: AccountLoginProviderId;
  /** 邮箱提示；不包含密码或任何凭据。由 Guli Identity 登录页负责预填。 */
  emailHint?: string;
  /** 授权提示模式；交互式登录默认要求身份服务重新验证，不复用旧 SSO 账号。 */
  prompt?: AccountOAuthPrompt;
}): Promise<string> {
  const config = getGuliIdentityConfig();
  const client = await getGuliClient(config);
  const parameters: Record<string, string> = {
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    // OIDC prompt 是空格分隔的列表：重新登录/选账号后仍必须确认授权。
    prompt: [...new Set([input.prompt ?? "login", "consent"])].join(" "),
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  };
  if (input.loginProvider) {
    parameters.login_hint = input.loginProvider;
  }
  if (input.emailHint) {
    // Guli Identity 将 login_hint 保留为登录渠道枚举；邮箱预填使用独立扩展参数。
    parameters.email_hint = input.emailHint;
  }
  return client.authorizationUrl(parameters);
}

export async function exchangeGuliAuthorizationCode(
  rawUrl: string,
  checks: { state: string; nonce: string; codeVerifier: string },
): Promise<AccountSession> {
  const config = getGuliIdentityConfig();
  const client = await getGuliClient(config);
  let tokenSet: TokenSet;

  try {
    const parameters = client.callbackParams(rawUrl);
    tokenSet = await client.callback(config.redirectUri, parameters, {
      state: checks.state,
      nonce: checks.nonce,
      code_verifier: checks.codeVerifier,
    });
  } catch (error) {
    throw mapOidcError(error, "登录服务授权回调校验失败。");
  }

  return sessionFromValidatedTokens(client, tokenSet, config.issuer);
}

async function sessionFromValidatedTokens(client: Client, tokenSet: TokenSet, issuer: string): Promise<AccountSession> {
  const claims = readVerifiedClaims(tokenSet);
  const accessToken = tokenSet.access_token;
  if (!accessToken) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR,
      "登录服务未返回访问令牌。",
    );
  }

  const claimedUser = await claimsToUser(client, tokenSet, claims, issuer);
  let user = claimedUser;
  if (process.env.NODE_ENV !== "test") {
    try {
      user = await enrichGuliUserProfile(accessToken, claimedUser);
    } catch {
      // OIDC 已完成身份校验；资料同步失败不应阻断登录。头像仍尽力缓存。
      user = await cacheFallbackAvatar(claimedUser);
    }
  }

  return {
    user,
    accessToken,
    // 是否长期保持登录由服务端返回 refresh_token 决定；客户端不会自行生成会话。
    refreshToken: tokenSet.refresh_token ?? "",
    expiresAt: resolveExpiresAt(tokenSet),
  };
}

export async function startGuliDeviceAuthorization() {
  const config = getGuliIdentityConfig();
  const client = await getGuliClient(config);
  const endpoint = client.issuer.metadata.device_authorization_endpoint;
  if (typeof endpoint !== "string" || !isHttpsUrl(endpoint) || new URL(endpoint).origin !== new URL(config.issuer).origin) {
    throw new AccountError(ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE, "登录服务尚未启用设备验证码，请更新 Guli Identity 或使用浏览器登录。");
  }
  let handle: Awaited<ReturnType<Client["deviceAuthorization"]>>;
  try {
    handle = await client.deviceAuthorization({ scope: config.scopes, claims: JSON.stringify({ id_token: { amr: null } }) });
  } catch {
    throw new AccountError(ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE, "无法获取设备验证码，请检查网络及身份服务的设备授权配置。");
  }
  const uri = handle.verification_uri;
  if (!isHttpsUrl(uri) || new URL(uri).origin !== new URL(config.issuer).origin ||
      new URL(uri).username || new URL(uri).password || new URL(uri).hash ||
      !/^[A-Z0-9-]{4,32}$/.test(handle.user_code) ||
      !Number.isFinite(handle.expires_in) || handle.expires_in <= 0 || handle.expires_in > 1800) {
    handle.abort();
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "身份服务返回的设备授权信息无效。");
  }
  return {
    userCode: handle.user_code,
    verificationUri: uri,
    expiresAt: Date.now() + handle.expires_in * 1000,
    abort: () => handle.abort(),
    wait: async (): Promise<AccountSession> => {
      try {
        // openid-client handles pending/slow_down and verifies the ID token
        // signature, issuer, audience and expiry before returning it.
        const tokens = await handle.poll();
        if (!tokens.id_token) throw new Error("missing ID token");
        const session = await sessionFromValidatedTokens(client, tokens, config.issuer);
        const amr = tokens.claims().amr ?? [];
        const loginProvider = (["google", "linuxdo", "github"] as const).find((id) => amr.includes(id));
        return { ...session, loginProvider: loginProvider ?? "email" };
      } catch (error) {
        const code = (error as { error?: string })?.error;
        if (code === "access_denied") throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_CANCELLED, "你已在浏览器取消设备授权。");
        if (code === "expired_token" || handle.expired()) throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_EXPIRED, "设备验证码已过期，请重新获取。");
        // Library errors may include device_code; never propagate raw messages.
        throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "设备授权未完成，请重新获取验证码并在浏览器确认授权。");
      }
    },
  };
}

/**
 * 读取 Guli Identity 的正式账户资料，并把受保护头像下载到本地缓存。
 * Renderer 只收到 app-account-avatar:// 地址，不会拿到需要 Bearer 的图片 URL。
 */
export async function fetchGuliAccountUser(
  accessToken: string,
  fallbackUser: AccountUser,
): Promise<AccountUser> {
  if (!accessToken) {
    throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "缺少登录访问令牌。");
  }
  return enrichGuliUserProfile(accessToken, fallbackUser);
}

export async function updateGuliAccountProfile(
  accessToken: string,
  displayName: string | null,
): Promise<AccountUser> {
  if (!accessToken) {
    throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "缺少登录访问令牌。");
  }
  const config = getGuliIdentityConfig();
  const response = await requestGuliJson(config, GULI_PROFILE_PATH, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
  const user = readUserFromApiResponse(response);
  if (!user) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的资料更新结果不完整。",
    );
  }
  return user;
}

export async function uploadGuliAccountAvatar(
  accessToken: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (!accessToken) {
    throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "缺少登录访问令牌。");
  }
  const config = getGuliIdentityConfig();
  await requestGuliResponse(config, GULI_AVATAR_PATH, accessToken, {
    method: "PUT",
    body: bytes,
    contentType,
  });
}

export async function deleteGuliAccountAvatar(accessToken: string): Promise<void> {
  if (!accessToken) {
    throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "缺少登录访问令牌。");
  }
  const config = getGuliIdentityConfig();
  await requestGuliResponse(config, GULI_AVATAR_PATH, accessToken, { method: "DELETE" });
}

/** Main-process-only account backup key contract; never derive keys from public UID. */
export async function requestGuliBackupKey(accessToken: string, keyId?: string): Promise<{ uid: string; keyId: string; key: Buffer }> {
  if (keyId !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(keyId)) throw new AccountError(ACCOUNT_ERROR_CODES.INPUT_INVALID, "账户备份密钥标识无效。");
  const config = getGuliIdentityConfig();
  const response = await fetchWithTimeout(`${config.issuer}/v1/account/backup-keys${keyId ? `/${keyId}` : ""}`, {
    method: keyId ? "GET" : "POST", redirect: "error", cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    ...(!keyId ? { body: JSON.stringify({ purpose: "suyan-ai-settings" }) } : {}),
  });
  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw new AccountError(ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE, "Guli Identity 尚未启用账户加密备份，或此备份密钥不可用。请升级身份服务后重试；也可使用原有密码加密备份。");
  }
  if (!response.ok) throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "账户备份验证失败，请确认登录的是导出时的同一账户。");
  const data = readDataRecord(await response.json());
  if (!data || typeof data.subject !== "string" || !data.subject || typeof data.keyId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(data.keyId) || (keyId && data.keyId !== keyId) || typeof data.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(data.key)) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "账户备份密钥响应无效。");
  }
  return { uid: `${config.issuer}#${data.subject}`, keyId: data.keyId, key: Buffer.from(data.key, "base64") };
}

export async function startGuliIdentityLink(accessToken: string, provider: "google" | "linuxdo" | "github"): Promise<string> {
  const config = getGuliIdentityConfig();
  const response = await requestGuliJson(config, `/v1/account/link/${provider}/start`, accessToken, { method: "POST" });
  const value = (response as { data?: { linkUrl?: unknown } })?.data?.linkUrl;
  let url: URL;
  try { url = new URL(typeof value === "string" ? value : ""); } catch {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "关联授权地址无效。");
  }
  const issuer = new URL(config.issuer);
  const prefix = `${issuer.pathname.replace(/\/$/, "")}/v1/oauth/link/`;
  if (url.protocol !== "https:" || url.origin !== issuer.origin || url.username || url.password ||
      url.search || url.hash || !url.pathname.startsWith(prefix) || !/^[A-Za-z0-9_-]{20,128}$/.test(url.pathname.slice(prefix.length))) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "关联授权地址不属于身份服务。");
  }
  return url.href;
}

export async function readGuliLinkedAccount(accessToken: string): Promise<AccountUser> {
  const user = readUserFromApiResponse(await requestGuliJson(getGuliIdentityConfig(), GULI_PROFILE_PATH, accessToken, { method: "GET" }));
  if (!user) throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "无法读取账户关联状态。");
  return user;
}

export async function linkGuliIdentity(
  accessToken: string,
  linkedAccessToken: string,
  loginProvider: Exclude<AccountLoginProviderId, "email">,
): Promise<AccountUser> {
  if (!accessToken || !linkedAccessToken) {
    throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "绑定身份验证信息不完整。");
  }

  const config = getGuliIdentityConfig();
  const response = await requestGuliJson(
    config,
    `/v1/account/link/${encodeURIComponent(loginProvider)}`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ identityAccessToken: linkedAccessToken }),
    },
  );
  const user = readUserFromApiResponse(response);
  if (!user) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的绑定结果不完整。",
    );
  }
  return user;
}

export async function unlinkGuliIdentity(
  accessToken: string,
  loginProvider: Exclude<AccountLoginProviderId, "email">,
): Promise<AccountUser> {
  if (!accessToken) {
    throw new AccountError(ACCOUNT_ERROR_CODES.TOKEN_INVALID, "缺少登录访问令牌。");
  }

  const config = getGuliIdentityConfig();
  const response = await requestGuliJson(
    config,
    `/v1/account/link/${encodeURIComponent(loginProvider)}`,
    accessToken,
    { method: "DELETE" },
  );
  const user = readUserFromApiResponse(response);
  if (!user) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "账号服务返回的解绑结果不完整。",
    );
  }
  return user;
}

type GuliErrorResponse = {
  code: string;
  message: string;
};

export async function refreshGuliSession(
  refreshToken: string,
): Promise<AccountTokenPayload> {
  if (!refreshToken) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.REFRESH_FAILED,
      "当前登录没有可用的刷新令牌。",
    );
  }

  const config = getGuliIdentityConfig();
  const client = await getGuliClient(config);
  try {
    const tokenSet = await client.refresh(refreshToken);
    if (!tokenSet.access_token) {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.REFRESH_FAILED,
        "登录服务未返回新的访问令牌。",
      );
    }
    return {
      accessToken: tokenSet.access_token,
      refreshToken: tokenSet.refresh_token ?? refreshToken,
      expiresAt: resolveExpiresAt(tokenSet),
    };
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw mapOidcError(error, "登录已过期，请重新登录。");
  }
}

export async function revokeGuliSession(refreshToken: string): Promise<void> {
  if (!refreshToken) return;
  const config = getGuliIdentityConfig();
  const client = await getGuliClient(config);
  try {
    await client.revoke(refreshToken, "refresh_token");
  } catch (error) {
    throw mapOidcError(error, "登录会话撤销失败。");
  }
}

export function resetGuliIdentityClientForTests(): void {
  cachedClient = null;
  cachedConfigKey = "";
  discoveryInFlight = null;
}

async function getGuliClient(config: GuliIdentityConfig): Promise<Client> {
  const configKey = `${config.issuer}\u0000${config.clientId}\u0000${config.redirectUri}\u0000${config.scopes}`;
  if (cachedClient && cachedConfigKey === configKey) return cachedClient;
  if (discoveryInFlight) return discoveryInFlight;

  discoveryInFlight = (async () => {
    let issuer: Awaited<ReturnType<typeof Issuer.discover>>;
    try {
      issuer = await Issuer.discover(config.issuer);
    } catch (error) {
      throw mapOidcError(error, "无法读取登录服务配置。");
    }

    validateDiscovery(issuer.metadata, config.issuer);
    const client = new issuer.Client({
      client_id: config.clientId,
      redirect_uris: [config.redirectUri],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    cachedClient = client;
    cachedConfigKey = configKey;
    return client;
  })().finally(() => {
    discoveryInFlight = null;
  });

  return discoveryInFlight;
}

function validateDiscovery(
  metadata: Record<string, unknown>,
  expectedIssuer: string,
): void {
  if (metadata.issuer !== expectedIssuer) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR,
      "登录服务 issuer 校验失败。",
    );
  }

  for (const [name, value] of [
    ["authorization_endpoint", metadata.authorization_endpoint],
    ["token_endpoint", metadata.token_endpoint],
    ["userinfo_endpoint", metadata.userinfo_endpoint],
    ["jwks_uri", metadata.jwks_uri],
  ] as const) {
    if (typeof value !== "string" || !isHttpsUrl(value)) {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE,
        `登录服务 ${name} 必须使用 HTTPS。`,
      );
    }
  }

  const methods = Array.isArray(metadata.code_challenge_methods_supported)
    ? metadata.code_challenge_methods_supported
    : [];
  if (!methods.includes("S256")) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR,
      "登录服务不支持安全的 PKCE S256。",
    );
  }
}

// Only the library-validated, signed ID Token can authorize a subject-only
// account. Provider hints and unsigned userinfo must never bypass email proof.
function isSubjectAccount(claims: IdTokenClaims): boolean {
  return claims.guli_account_kind === "external_subject" &&
    claims.email === undefined && claims.email_verified === false;
}

function readVerifiedClaims(tokenSet: TokenSet): IdTokenClaims {
  try {
    const claims = tokenSet.claims();
    if (claims.email_verified !== true && !isSubjectAccount(claims)) {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.EMAIL_NOT_VERIFIED,
        "邮箱尚未验证，无法登录。",
      );
    }
    return claims;
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw mapOidcError(error, "登录凭证验证失败。");
  }
}

async function claimsToUser(
  client: Client,
  tokenSet: TokenSet,
  claims: IdTokenClaims,
  issuer: string,
): Promise<AccountUser> {
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!sub || claims.iss !== issuer) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR,
      "登录凭证中的用户身份无效。",
    );
  }

  let profile: Record<string, unknown> = {};
  if (tokenSet.access_token) {
    try {
      const result = await client.userinfo<Record<string, unknown>>(
        tokenSet.access_token,
      );
      profile = result as Record<string, unknown>;
    } catch {
      // ID Token 已完成身份验证；userinfo 只用于补充资料，失败不应阻断登录。
    }
  }

  if (profile.sub !== undefined && profile.sub !== sub) {
    throw new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, "账户资料与登录身份不一致。");
  }
  const email = isSubjectAccount(claims) ? undefined : readString(profile.email) || readString(claims.email);
  if (
    readBoolean(profile.email_verified) !== true &&
    claims.email_verified !== true && !isSubjectAccount(claims)
  ) {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.EMAIL_NOT_VERIFIED,
      "邮箱尚未验证，无法登录。",
    );
  }
  const username =
    readString(profile.name) ||
    readString(profile.preferred_username) ||
    readString(claims.name) ||
    deriveUsername(email ?? "");
  const avatarUrl = readString(profile.picture) || readString(claims.picture);
  const identityKey = `${issuer}#${sub}`;

  return {
    uid: identityKey,
    username,
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    identities: [
      { provider: GULI_IDENTITY_PROVIDER, issuer, providerUserId: sub },
    ],
  };
}

type GuliProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  identities: AccountIdentity[];
};

type GuliAvatarMetadata = {
  hasAvatar: boolean;
  contentType: string | null;
  avatarUrl: string | null;
};

async function enrichGuliUserProfile(
  accessToken: string,
  fallbackUser: AccountUser,
): Promise<AccountUser> {
  const config = getGuliIdentityConfig();
  const profile = parseGuliProfile(
    await requestGuliJson(config, GULI_PROFILE_PATH, accessToken, { method: "GET" }),
  );
  const user: AccountUser = {
    ...fallbackUser,
    ...(profile.displayName ? { username: profile.displayName } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.identities.length > 0
      ? { identities: mergeIdentities(fallbackUser.identities, profile.identities) }
      : {}),
  };

  try {
    const avatarMetadata = parseGuliAvatarMetadata(
      await requestGuliJson(config, GULI_AVATAR_PATH, accessToken, { method: "GET" }),
    );
    if (avatarMetadata?.hasAvatar) {
      if (avatarMetadata.avatarUrl) {
        user.avatarUrl = avatarMetadata.avatarUrl;
      }
      const image = await requestGuliImage(config, GULI_AVATAR_IMAGE_PATH, accessToken);
      const cachedUrl = await cacheAccountAvatar(user.uid, image.bytes, image.contentType);
      if (cachedUrl) {
        user.avatarUrl = cachedUrl;
      }
    } else if (avatarMetadata && isLocalAccountAvatarUrl(user.avatarUrl)) {
      await removeAccountAvatar(user.uid);
      delete user.avatarUrl;
    }
  } catch {
    // Profile data remains useful when the optional avatar endpoint is unavailable.
  }

  if (user.avatarUrl && !isLocalAccountAvatarUrl(user.avatarUrl)) {
    const cachedUser = await cacheFallbackAvatar(user);
    if (cachedUser.avatarUrl) {
      return cachedUser;
    }
  }
  return user;
}

async function cacheFallbackAvatar(user: AccountUser): Promise<AccountUser> {
  if (!user.avatarUrl || isLocalAccountAvatarUrl(user.avatarUrl)) {
    return user;
  }
  if (!isHttpsUrl(user.avatarUrl)) {
    return { ...user, avatarUrl: undefined };
  }

  try {
    const response = await requestPublicResponse(user.avatarUrl);
    if (!response.ok) {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.NETWORK_ERROR,
        "账号头像下载失败。",
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    const bytes = await readLimitedImageBytes(response);
    const cachedUrl = await cacheAccountAvatar(user.uid, bytes, contentType);
    return cachedUrl
      ? { ...user, avatarUrl: cachedUrl }
      : { ...user, avatarUrl: undefined };
  } catch {
    // Never expose an unverified/protected remote URL to Renderer. If the
    // previous value was local, the early return above preserves that cache;
    // otherwise fall back to the built-in avatar.
    return { ...user, avatarUrl: undefined };
  }
}

function parseGuliProfile(input: unknown): GuliProfile {
  const root = readDataRecord(input);
  const data =
    root?.user && typeof root.user === "object" && !Array.isArray(root.user)
      ? root.user as Record<string, unknown>
      : root;
  const displayName =
    data
      ? firstNonEmptyString(
          data.displayName,
          data.username,
          data.name,
          data.preferred_username,
          data.preferredUsername,
        )
      : null;
  return {
    displayName,
    avatarUrl: data
      ? firstHttpsUrl(data.avatarUrl, data.avatar, data.picture)
      : null,
    identities: data ? parseIdentityList(data.identities) : [],
  };
}

function parseGuliAvatarMetadata(input: unknown): GuliAvatarMetadata | null {
  const data = readDataRecord(input);
  if (!data || typeof data.hasAvatar !== "boolean") {
    const avatarUrl = data ? firstHttpsUrl(data.avatarUrl, data.url, data.picture) : null;
    return avatarUrl
      ? { hasAvatar: true, contentType: null, avatarUrl }
      : null;
  }
  return {
    hasAvatar: data.hasAvatar,
    contentType: typeof data.contentType === "string" ? data.contentType : null,
    avatarUrl: firstHttpsUrl(data.avatarUrl, data.url, data.picture),
  };
}

function parseIdentityList(input: unknown): AccountIdentity[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((item): AccountIdentity[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.provider !== "string" ||
      !(ACCOUNT_IDENTITY_PROVIDER_IDS as readonly string[]).includes(record.provider) ||
      typeof record.providerUserId !== "string" ||
      !record.providerUserId.trim()
    ) {
      return [];
    }
    return [{
      provider: record.provider as AccountIdentity["provider"],
      providerUserId: record.providerUserId.trim(),
      ...(typeof record.issuer === "string" && record.issuer.trim()
        ? { issuer: record.issuer.trim() }
        : {}),
      ...(typeof record.linkedAt === "string" && record.linkedAt.trim()
        ? { linkedAt: record.linkedAt.trim() }
        : {}),
    }];
  });
}

function mergeIdentities(
  existing: AccountIdentity[] | undefined,
  incoming: AccountIdentity[],
): AccountIdentity[] {
  const merged = new Map<string, AccountIdentity>();
  for (const identity of [...(existing ?? []), ...incoming]) {
    merged.set(
      `${identity.provider}\u0000${identity.issuer ?? ""}\u0000${identity.providerUserId}`,
      identity,
    );
  }
  return [...merged.values()];
}

function readUserFromApiResponse(input: unknown): AccountUser | null {
  const root = readDataRecord(input);
  const candidate =
    root?.user && typeof root.user === "object" && !Array.isArray(root.user)
      ? root.user
      : root;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const username = firstNonEmptyString(
    record.username,
    record.displayName,
    record.name,
    record.preferred_username,
    record.preferredUsername,
  );
  const avatarUrl = readString(record.avatarUrl);
  if (
    typeof record.uid !== "string" ||
    !record.uid.trim() ||
    !username
  ) {
    return null;
  }
  const identities = parseIdentityList(record.identities);
  return {
    uid: record.uid.trim(),
    username,
    // Link/unlink responses are not the avatar authority. Only preserve an
    // already-local URL; profile refresh handles protected remote avatars.
    ...(isLocalAccountAvatarUrl(avatarUrl) ? { avatarUrl } : {}),
    ...(typeof record.email === "string" && record.email.trim()
      ? { email: record.email.trim() }
      : {}),
    ...(typeof record.createdAt === "string" && record.createdAt.trim()
      ? { createdAt: record.createdAt.trim() }
      : {}),
    ...(typeof record.updatedAt === "string" && record.updatedAt.trim()
      ? { updatedAt: record.updatedAt.trim() }
      : {}),
    ...(identities.length > 0 ? { identities } : {}),
  };
}

function readDataRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const root = input as Record<string, unknown>;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    return root.data as Record<string, unknown>;
  }
  return root;
}

async function requestGuliJson(
  config: GuliIdentityConfig,
  apiPath: string,
  accessToken: string,
  init: { method: string; body?: string | Uint8Array; contentType?: string },
): Promise<unknown> {
  const response = await requestGuliResponse(config, apiPath, accessToken, init);
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "登录服务返回了无法解析的数据。",
    );
  }
}

async function requestGuliImage(
  config: GuliIdentityConfig,
  apiPath: string,
  accessToken: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await requestGuliResponse(config, apiPath, accessToken, { method: "GET" });
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = await readLimitedImageBytes(response);
  return { bytes, contentType };
}

async function requestGuliResponse(
  config: GuliIdentityConfig,
  apiPath: string,
  accessToken: string,
  init: { method: string; body?: string | Uint8Array; contentType?: string },
): Promise<Response> {
  const response = await fetchWithTimeout(`${config.issuer}${apiPath}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": init.contentType ?? "application/json" } : {}),
    },
    ...(init.body
      ? {
          body:
            typeof init.body === "string"
              ? init.body
              : (Buffer.from(init.body) as unknown as BodyInit),
        }
      : {}),
  });
  if (!response.ok) {
    const isLinkEndpoint = apiPath.startsWith("/v1/account/link/");
    const serverError = await readGuliErrorResponse(response);
    const code = mapGuliErrorCode(response.status, isLinkEndpoint, serverError?.code);
    throw new AccountError(
      code,
      serverError?.message ??
        (response.status === 404 && isLinkEndpoint
          ? "当前登录服务尚未提供账号绑定接口。"
          : response.status === 404
            ? "登录服务资料接口不可用。"
            : `登录服务请求失败（HTTP ${response.status}）。`),
    );
  }
  return response;
}

function mapGuliErrorCode(
  status: number,
  isLinkEndpoint: boolean,
  serverCode: string | undefined,
): AccountErrorCode {
  if (serverCode === "ACCOUNT_LINK_CONFLICT") {
    return ACCOUNT_ERROR_CODES.ALREADY_LINKED;
  }
  if (serverCode === "ACCOUNT_LINK_LAST_NOT_ALLOWED") {
    return ACCOUNT_ERROR_CODES.LINK_LAST_NOT_ALLOWED;
  }
  if (serverCode === "ACCOUNT_LINK_IDENTITY_NOT_FOUND") {
    return ACCOUNT_ERROR_CODES.INPUT_INVALID;
  }
  if (serverCode === "INSUFFICIENT_SCOPE") {
    return ACCOUNT_ERROR_CODES.LINK_SCOPE_INSUFFICIENT;
  }
  if (status === 401) {
    return ACCOUNT_ERROR_CODES.TOKEN_EXPIRED;
  }
  if (status === 404 && isLinkEndpoint) {
    return ACCOUNT_ERROR_CODES.LINK_NOT_SUPPORTED;
  }
  if (status === 400) {
    return ACCOUNT_ERROR_CODES.INPUT_INVALID;
  }
  return ACCOUNT_ERROR_CODES.NETWORK_ERROR;
}

async function readGuliErrorResponse(response: Response): Promise<GuliErrorResponse | null> {
  try {
    const payload = await response.clone().json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    const error = (payload as Record<string, unknown>).error;
    if (!error || typeof error !== "object" || Array.isArray(error)) {
      return null;
    }
    const record = error as Record<string, unknown>;
    return typeof record.code === "string" && typeof record.message === "string"
      ? { code: record.code, message: record.message }
      : null;
  } catch {
    return null;
  }
}

async function requestPublicResponse(url: string): Promise<Response> {
  return fetchWithTimeout(url, { method: "GET" });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const fetchImpl = process.env.NODE_ENV === "test"
      ? globalThis.fetch
      : typeof net?.fetch === "function"
        ? net.fetch.bind(net)
        : globalThis.fetch;
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AccountError(
        ACCOUNT_ERROR_CODES.NETWORK_ERROR,
        "登录服务请求超时，请稍后再试。",
      );
    }
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "无法连接登录服务，请检查网络与代理设置。",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function readLimitedImageBytes(response: Response): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > GULI_AVATAR_MAX_BYTES) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "账号头像文件过大，无法缓存。");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > GULI_AVATAR_MAX_BYTES) {
    throw new AccountError(ACCOUNT_ERROR_CODES.NETWORK_ERROR, "账号头像文件无效或过大。");
  }
  return bytes;
}

function isLocalAccountAvatarUrl(value: string | undefined): boolean {
  return Boolean(value?.startsWith("app-account-avatar://avatar/"));
}

function resolveExpiresAt(tokenSet: TokenSet): number {
  if (
    typeof tokenSet.expires_at === "number" &&
    Number.isFinite(tokenSet.expires_at)
  ) {
    return tokenSet.expires_at * 1000;
  }
  if (
    typeof tokenSet.expires_in === "number" &&
    Number.isFinite(tokenSet.expires_in)
  ) {
    return Date.now() + tokenSet.expires_in * 1000;
  }
  return Date.now() + 5 * 60 * 1000;
}

function mapOidcError(error: unknown, fallback: string): AccountError {
  if (error instanceof AccountError) return error;
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const name =
    typeof record.error === "string"
      ? record.error
      : typeof record.code === "string"
        ? record.code
        : "";
  const response = record.response as { statusCode?: number } | undefined;
  if (response?.statusCode === 530 || response?.statusCode === 502 || response?.statusCode === 503 || response?.statusCode === 504) {
    return new AccountError(
      ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE,
      `身份服务暂不可用（HTTP ${response.statusCode}），请管理员检查 Guli Identity 服务及 Cloudflare 隧道。尚未完成授权。`,
    );
  }
  if (name === "access_denied" || name === "login_required") {
    return new AccountError(
      ACCOUNT_ERROR_CODES.OAUTH_CANCELLED,
      "已取消授权。",
    );
  }
  if (name === "invalid_grant" || name === "invalid_token") {
    return new AccountError(
      ACCOUNT_ERROR_CODES.REFRESH_FAILED,
      "登录已失效，请重新登录。",
    );
  }
  return new AccountError(ACCOUNT_ERROR_CODES.OAUTH_PROVIDER_ERROR, fallback);
}

function deriveUsername(email: string): string {
  const localPart = email.split("@", 1)[0]?.trim();
  return localPart || "素言用户";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function firstHttpsUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = readString(value);
    if (candidate && isHttpsUrl(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeScopes(value: string): string {
  return [
    ...new Set(
      value
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ].join(" ");
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedRedirectUri(value: string): boolean {
  return value === DEFAULT_GULI_IDENTITY_REDIRECT_URI;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
