import { app, safeStorage } from "electron";
import { ACCOUNT_ERROR_CODES, type AccountTokenPayload } from "../../../src/features/account/types/account";
import { AccountError } from "./errors";

/**
 * 账号 token payload 加解密，与 API Key / 灵感库密码同一套策略（方案 §九）：
 * 优先操作系统级加密（safeStorage），受限环境退化为 dev1: 前缀的本地 base64。
 * 解密只在主进程内存中进行，绝不落盘明文、不打印日志。
 */

const DEV_PREFIX = "dev1:";

export function encryptAccountTokenPayload(payload: AccountTokenPayload): string {
  const json = JSON.stringify(payload);

  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.encryptString(json).toString("base64");
    } catch {
      // Fall through to local development fallback below.
    }
  }

  if (app?.isPackaged) {
    throw new AccountError(ACCOUNT_ERROR_CODES.STORAGE_ENCRYPTION_UNAVAILABLE, "系统加密不可用，无法安全保存登录状态。请检查系统账户凭据后重试。");
  }

  return `${DEV_PREFIX}${Buffer.from(json, "utf8").toString("base64")}`;
}

export function decryptAccountTokenPayload(encoded: string): AccountTokenPayload | null {
  const value = encoded.trim();
  if (!value) {
    return null;
  }

  let json: string;

  if (value.startsWith(DEV_PREFIX)) {
    try {
      json = Buffer.from(value.slice(DEV_PREFIX.length), "base64").toString("utf8");
    } catch {
      return null;
    }
  } else {
    try {
      json = safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (
      typeof record.accessToken !== "string" ||
      typeof record.refreshToken !== "string" ||
      typeof record.expiresAt !== "number" ||
      !Number.isFinite(record.expiresAt)
    ) {
      return null;
    }

    return {
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      expiresAt: record.expiresAt,
    };
  } catch {
    return null;
  }
}
