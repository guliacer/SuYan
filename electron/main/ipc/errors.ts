export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: "UNKNOWN_ERROR", message: error.message };
  }

  return { code: "UNKNOWN_ERROR", message: "未知错误" };
}
