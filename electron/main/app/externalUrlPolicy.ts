import { AppError } from "../ipc/errors";

export function normalizeExternalUrl(input: unknown): string {
  if (typeof input !== "string") {
    throw new AppError("EXTERNAL_URL_INVALID", "网页地址不合法。");
  }

  const value = input.trim();

  if (!value) {
    throw new AppError("EXTERNAL_URL_INVALID", "网页地址不合法。");
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new AppError("EXTERNAL_URL_INVALID", "只能打开 http 或 https 网页。");
    }

    return url.toString();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("EXTERNAL_URL_INVALID", "网页地址不合法。");
  }
}
