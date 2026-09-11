import { AppError } from "../ipc/errors";
import { ACCOUNT_ERROR_CODES, type AccountErrorCode } from "../../../src/features/account/types/account";

/** 账号系统统一错误：code 必须是 ACCOUNT_* 结构化错误码（方案 §二十二）。 */
export class AccountError extends AppError {
  constructor(
    code: AccountErrorCode,
    message: string,
  ) {
    super(code, message);
    this.name = "AccountError";
  }
}

const ACCOUNT_ERROR_CODE_VALUES = new Set<string>(Object.values(ACCOUNT_ERROR_CODES));

/** 校验外部（后端 / 配置 / IPC）提供的错误码是否属于账号系统白名单。 */
export function isAccountErrorCode(value: unknown): value is AccountErrorCode {
  return typeof value === "string" && ACCOUNT_ERROR_CODE_VALUES.has(value);
}

export { ACCOUNT_ERROR_CODES };
