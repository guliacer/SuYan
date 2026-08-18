export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const AI_SETTINGS_BACKUP_INVALID = "AI_SETTINGS_BACKUP_INVALID";
export const AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION = "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION";
export const AI_SETTINGS_BACKUP_DECRYPT_FAILED = "AI_SETTINGS_BACKUP_DECRYPT_FAILED";
export const AI_SETTINGS_BACKUP_PASSWORD_REQUIRED = "AI_SETTINGS_BACKUP_PASSWORD_REQUIRED";
export const AI_SETTINGS_BACKUP_FILE_READ_FAILED = "AI_SETTINGS_BACKUP_FILE_READ_FAILED";
export const AI_SETTINGS_BACKUP_FILE_WRITE_FAILED = "AI_SETTINGS_BACKUP_FILE_WRITE_FAILED";
export const AI_SETTINGS_BACKUP_VALIDATION_FAILED = "AI_SETTINGS_BACKUP_VALIDATION_FAILED";

export function toErrorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: "UNKNOWN_ERROR", message: error.message };
  }

  return { code: "UNKNOWN_ERROR", message: "未知错误" };
}
