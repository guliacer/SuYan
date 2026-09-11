/**
 * 账号系统共享类型（渲染层与主进程共用，主进程经相对路径 import）。
 *
 * 设计遵循 docs/账号登录实施总方案.md：
 * - 统一 User + 多 Identity 模型；
 * - token 只以 safeStorage 加密 payload 落盘，绝不明文写入当前 account.json；
 * - 渲染层只消费 AccountPublicStatus / AccountUser / AuthorInfo，
 *   不接触 accessToken / refreshToken / PKCE / HTTP。
 */

/** 内部会话仍由 Guli Identity 承载，email 仅保留现有主进程接口的类型兼容。 */
export type AccountProviderId = "email" | "guli";

/** 用户在登录窗口中可以直接选择的第三方账号平台。 */
export const ACCOUNT_EXTERNAL_PROVIDER_IDS = [
  "google",
  "linuxdo",
  "github",
] as const;
export type AccountExternalProviderId =
  (typeof ACCOUNT_EXTERNAL_PROVIDER_IDS)[number];

/** 服务端返回的统一身份清单中的 provider。 */
export const ACCOUNT_IDENTITY_PROVIDER_IDS = [
  "email",
  ...ACCOUNT_EXTERNAL_PROVIDER_IDS,
  "guli",
] as const;
export type AccountIdentityProviderId =
  (typeof ACCOUNT_IDENTITY_PROVIDER_IDS)[number];

/** 用户可选择的登录方式；邮箱登录仍由统一身份服务承载。 */
export const ACCOUNT_LOGIN_PROVIDER_IDS = [
  "email",
  ...ACCOUNT_EXTERNAL_PROVIDER_IDS,
] as const;
export type AccountLoginProviderId =
  (typeof ACCOUNT_LOGIN_PROVIDER_IDS)[number];

/** 本机上次成功登录使用的入口；设备验证码与浏览器登录分别记录。 */
export type AccountLoginMethod = AccountLoginProviderId | "device";

/** OIDC 交互提示：第三方登录先让用户确认要使用哪个外部账户。 */
export type AccountOAuthPrompt = "consent" | "login" | "select_account";

export interface AccountOAuthStartOptions {
  mode?: "browser" | "device";
  prompt?: AccountOAuthPrompt;
  /** 邮箱提示，仅作为非敏感账号标识传给 Guli Identity。 */
  emailHint?: string;
}

/** 仅包含供用户核对的短码与公开地址，绝不包含 device_code 或令牌。 */
export interface AccountDeviceAuthorization {
  userCode: string;
  verificationUri: string;
  browserOpened: boolean;
}

export interface AccountOAuthStartResult {
  started: true;
  expiresAt: number;
  device?: AccountDeviceAuthorization;
}

export const ACCOUNT_LOGIN_PROVIDER_LABELS: Record<
  AccountLoginProviderId,
  string
> = {
  email: "邮箱账号",
  google: "Google",
  linuxdo: "Linux.do",
  github: "GitHub",
};

export const ACCOUNT_IDENTITY_PROVIDER_LABELS: Record<
  AccountIdentityProviderId,
  string
> = {
  email: "邮箱账号",
  google: "Google",
  linuxdo: "Linux.do",
  github: "GitHub",
  guli: "Guli Identity",
};

export type AccountStatus =
  "initializing" | "authenticated" | "unauthenticated";

export type AccountOAuthPurpose = "login" | "link";

/** OAuth 完成后，用户决定把哪一份资料写入当前 Guli Identity 账户。 */
export type AccountProfileSource = "current" | "new" | "custom";

export interface AccountOAuthProfileSelection {
  usernameSource: AccountProfileSource;
  avatarSource: AccountProfileSource;
  customUsername?: string;
}

export interface AccountProfileUpdateInput {
  displayName: string | null;
}

export interface AccountIdentity {
  provider: AccountIdentityProviderId;
  providerUserId: string;
  /** OIDC 身份必须按 issuer + sub 识别，不能只按邮箱合并。 */
  issuer?: string;
  linkedAt?: string;
}

export interface AccountUser {
  /** SuYan 自己的用户 ID（第三方 provider 的用户 ID 只属于 identity）。 */
  uid: string;
  username: string;
  avatarUrl?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  identities?: AccountIdentity[];
}

/** OAuth 已完成身份验证，但必须由用户确认后才能切换本地登录态。 */
export interface AccountOAuthConfirmation {
  user: AccountUser;
  provider: AccountProviderId;
  loginProvider: AccountLoginProviderId;
  purpose: AccountOAuthPurpose;
  /** 待确认会话的内存失效时间，不包含任何凭据。 */
  expiresAt: number;
}

/** 登录成功后由后端返回的完整会话，只在主进程内存中流转。 */
export interface AccountSession {
  /** 设备登录由服务端签名的 amr 声明确认实际登录渠道。 */
  loginProvider?: AccountLoginProviderId;
  user: AccountUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** 渲染层可见的最小登录态。 */
export interface AccountPublicStatus {
  status: AccountStatus;
  user: AccountUser | null;
  provider: AccountProviderId | null;
  /** 用户实际选择的登录方式；内部 guli provider 不向用户展示。 */
  loginProvider?: AccountLoginProviderId | null;
  /** 退出登录后仍保留的非敏感提示，不用于恢复或授权会话。 */
  lastLoginMethod?: AccountLoginMethod | null;
  /** OAuth 回调完成后的待确认身份；确认前不会写入本地登录态。 */
  pendingOAuthConfirmation?: AccountOAuthConfirmation | null;
  /** 仅用于回调失败时的瞬时 UI 提示，不包含凭据。 */
  error?: { code: string; message: string };
}

/** 导出系统统一消费的作者信息（方案 §十六）。 */
export interface AuthorInfo {
  uid: string;
  username: string;
  avatarUrl?: string;
}

export interface EmailLoginInput {
  email: string;
  password: string;
}

export interface EmailRegisterInput {
  email: string;
  password: string;
  confirmPassword?: string;
}

/** 注册接口已创建待验证账号，但尚未签发登录会话。 */
export interface AccountRegistrationResult {
  verificationRequired: true;
  email: string;
  message: string;
  /** Guli Identity 返回 202，表示请求已受理，不等于收件箱已投递。 */
  deliveryStatus: "accepted";
}

/** 当前 account.json 磁盘结构：非敏感字段明文，token 以 safeStorage 加密 payload 落盘。 */
export interface AccountFile {
  schemaVersion: 1;
  user: AccountUser | null;
  provider: AccountProviderId | null;
  /** 公开的登录方式标识，不包含任何凭据。 */
  loginProvider?: AccountLoginProviderId | null;
  lastLoginMethod?: AccountLoginMethod | null;
  /** safeStorage 加密后的 base64（内容为 AccountTokenPayload JSON），见 electron/main/account/accountCrypto.ts。 */
  tokenEncrypted?: string;
  updatedAt: string;
}

/** 进入 safeStorage 的敏感载荷，只在主进程内存中解密（方案 §九/§十）。 */
export interface AccountTokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** 账号系统结构化错误码（方案 §二十二）。UI 必须按 code 处理，不得按 message 猜测。 */
export const ACCOUNT_ERROR_CODES = {
  NOT_LOGGED_IN: "ACCOUNT_NOT_LOGGED_IN",
  INVALID_CREDENTIALS: "ACCOUNT_INVALID_CREDENTIALS",
  EMAIL_NOT_VERIFIED: "ACCOUNT_EMAIL_NOT_VERIFIED",
  TOKEN_EXPIRED: "ACCOUNT_TOKEN_EXPIRED",
  REFRESH_FAILED: "ACCOUNT_REFRESH_FAILED",
  NETWORK_ERROR: "ACCOUNT_NETWORK_ERROR",
  OAUTH_CANCELLED: "ACCOUNT_OAUTH_CANCELLED",
  OAUTH_IN_PROGRESS: "ACCOUNT_OAUTH_IN_PROGRESS",
  OAUTH_EXPIRED: "ACCOUNT_OAUTH_EXPIRED",
  OAUTH_STATE_INVALID: "ACCOUNT_OAUTH_STATE_INVALID",
  OAUTH_PROVIDER_ERROR: "ACCOUNT_OAUTH_PROVIDER_ERROR",
  PROVIDER_UNAVAILABLE: "ACCOUNT_PROVIDER_UNAVAILABLE",
  OAUTH_SERVICE_UNAVAILABLE: "ACCOUNT_OAUTH_SERVICE_UNAVAILABLE",
  ALREADY_LINKED: "ACCOUNT_ALREADY_LINKED",
  LINK_CONFIRM_REQUIRED: "ACCOUNT_LINK_CONFIRM_REQUIRED",
  STORAGE_ERROR: "ACCOUNT_STORAGE_ERROR",
  STORAGE_ENCRYPTION_UNAVAILABLE: "ACCOUNT_STORAGE_ENCRYPTION_UNAVAILABLE",
  /** 账号后端未配置（BLOCKED_EXTERNAL_DEPENDENCIES，见方案 §三十三）。 */
  BACKEND_NOT_CONFIGURED: "ACCOUNT_BACKEND_NOT_CONFIGURED",
  EMAIL_NOT_CONFIGURED: "ACCOUNT_EMAIL_NOT_CONFIGURED",
  EMAIL_DELIVERY_FAILED: "ACCOUNT_EMAIL_DELIVERY_FAILED",
  INPUT_INVALID: "ACCOUNT_INPUT_INVALID",
  TOKEN_INVALID: "ACCOUNT_TOKEN_INVALID",
  LINK_NOT_SUPPORTED: "ACCOUNT_LINK_NOT_SUPPORTED",
  LINK_LAST_NOT_ALLOWED: "ACCOUNT_LINK_LAST_NOT_ALLOWED",
  LINK_SCOPE_INSUFFICIENT: "ACCOUNT_LINK_SCOPE_INSUFFICIENT",
} as const;

export type AccountErrorCode =
  (typeof ACCOUNT_ERROR_CODES)[keyof typeof ACCOUNT_ERROR_CODES];

export const ACCOUNT_PROVIDER_IDS: readonly AccountProviderId[] = [
  "email",
  "guli",
] as const;
