import { app, safeStorage } from "electron";
import { AppError } from "../ipc/errors";

/**
 * 灵感库「账号」条目的密码加解密，与 API Key（aiSettingsStore）同一套策略：
 * 优先使用操作系统级加密（safeStorage），受限环境退化为 dev1: 前缀的本地编码。
 */

const DEV_PREFIX = "dev1:";

export function encryptPromptPassword(password: string): string {
  const value = password.trim();
  if (!value) {
    return "";
  }

  if (safeStorage?.isEncryptionAvailable?.()) {
    try {
      return safeStorage.encryptString(value).toString("base64");
    } catch {
      // Fall through to local development fallback below.
    }
  }

  if (app?.isPackaged) {
    throw new AppError("ACCOUNT_STORAGE_ENCRYPTION_UNAVAILABLE", "系统加密不可用，无法安全保存账户密码。");
  }

  return `${DEV_PREFIX}${Buffer.from(value, "utf8").toString("base64")}`;
}

export function decryptPromptPassword(encoded: string): string {
  const value = encoded.trim();
  if (!value) {
    return "";
  }

  if (value.startsWith(DEV_PREFIX)) {
    try {
      return Buffer.from(value.slice(DEV_PREFIX.length), "base64").toString("utf8").trim();
    } catch {
      return "";
    }
  }

  try {
    return safeStorage?.decryptString(Buffer.from(value, "base64")).trim() ?? "";
  } catch {
    return "";
  }
}
