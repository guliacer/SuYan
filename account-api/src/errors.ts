/**
 * 结构化错误（方案 §二十二）：错误响应统一为 { code, message }，
 * code 必须是 ACCOUNT_* 白名单，Electron 客户端按 code 处理。
 */

export const ACCOUNT_ERROR_CODES = {
  NOT_LOGGED_IN: "ACCOUNT_NOT_LOGGED_IN",
  INVALID_CREDENTIALS: "ACCOUNT_INVALID_CREDENTIALS",
  EMAIL_NOT_VERIFIED: "ACCOUNT_EMAIL_NOT_VERIFIED",
  TOKEN_EXPIRED: "ACCOUNT_TOKEN_EXPIRED",
  REFRESH_FAILED: "ACCOUNT_REFRESH_FAILED",
  NETWORK_ERROR: "ACCOUNT_NETWORK_ERROR",
  OAUTH_CANCELLED: "ACCOUNT_OAUTH_CANCELLED",
  OAUTH_STATE_INVALID: "ACCOUNT_OAUTH_STATE_INVALID",
  OAUTH_PROVIDER_ERROR: "ACCOUNT_OAUTH_PROVIDER_ERROR",
  PROVIDER_UNAVAILABLE: "ACCOUNT_PROVIDER_UNAVAILABLE",
  ALREADY_LINKED: "ACCOUNT_ALREADY_LINKED",
  LINK_CONFIRM_REQUIRED: "ACCOUNT_LINK_CONFIRM_REQUIRED",
  STORAGE_ERROR: "ACCOUNT_STORAGE_ERROR",
  INPUT_INVALID: "ACCOUNT_INPUT_INVALID",
  TOKEN_INVALID: "ACCOUNT_TOKEN_INVALID",
} as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[keyof typeof ACCOUNT_ERROR_CODES];

export class ApiError extends Error {
  readonly code: AccountErrorCode;
  readonly status: number;

  constructor(code: AccountErrorCode, message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  toPayload(): { code: AccountErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export function badRequest(message = "请求参数不合法。"): ApiError {
  return new ApiError(ACCOUNT_ERROR_CODES.INPUT_INVALID, message, 400);
}

export function unauthorized(message = "凭证无效或已过期。"): ApiError {
  return new ApiError(ACCOUNT_ERROR_CODES.INVALID_CREDENTIALS, message, 401);
}

export function notFound(message = "资源不存在。"): ApiError {
  return new ApiError(ACCOUNT_ERROR_CODES.INPUT_INVALID, message, 404);
}
