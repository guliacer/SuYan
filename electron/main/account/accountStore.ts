import fs from "node:fs/promises";
import type {
  AccountLoginProviderId,
  AccountIdentityProviderId,
  AccountFile,
  AccountIdentity,
  AccountUser,
} from "../../../src/features/account/types/account";
import { ACCOUNT_ERROR_CODES } from "../../../src/features/account/types/account";
import { ACCOUNT_IDENTITY_PROVIDER_IDS } from "../../../src/features/account/types/account";
import { AccountError } from "./errors";
import { logger } from "../appLogger";
import { getAccountPath, getLibraryDataDir } from "../library/libraryPaths";

/**
 * account.json 持久化（方案 §九 / §二十八）：
 * - 非敏感字段明文 JSON，token 以 safeStorage 加密 payload（accountCrypto）落盘；
 * - 原子写（临时文件 + rename）；
 * - 缺失 → null（未登录）；损坏 → 隔离为 account.json.corrupt-* 后回到 null，
 *   绝不导致素材库打不开、绝不抛给启动流程。
 */

export const ACCOUNT_SCHEMA_VERSION = 1 as const;

export function createEmptyAccountFile(): AccountFile {
  return {
    schemaVersion: ACCOUNT_SCHEMA_VERSION,
    user: null,
    provider: null,
    loginProvider: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function readAccountFile(): Promise<AccountFile | null> {
  let content: string;

  try {
    content = await fs.readFile(getAccountPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    logger.error("account", "store:read-failed", { message: String(error) });
    return null;
  }

  // 旧版第三方 provider 的账号文件不再兼容，直接删除，
  // 避免旧 token 在升级后被误恢复为当前身份。
  if (isLegacyAccountFile(content)) {
    await deleteLegacyAccountFile();
    return null;
  }

  const parsed = parseAccountFile(content);
  if (parsed) {
    return parsed;
  }

  await quarantineCorruptAccountFile();
  return null;
}

export async function writeAccountFile(file: AccountFile): Promise<void> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  const accountPath = getAccountPath();
  const tempPath = `${accountPath}.tmp`;

  try {
    await fs.writeFile(tempPath, JSON.stringify(file, null, 2), "utf8");
    await fs.rename(tempPath, accountPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw new AccountError(ACCOUNT_ERROR_CODES.STORAGE_ERROR, "账号数据保存失败，请检查数据目录是否可写。");
  }
}

export function parseAccountFile(content: string): AccountFile | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== ACCOUNT_SCHEMA_VERSION) {
    return null;
  }

  const user = normalizeStoredUser(record.user);
  if (record.provider !== null && record.provider !== undefined && !isAccountProviderId(record.provider)) {
    return null;
  }
  if (
    record.loginProvider !== null &&
    record.loginProvider !== undefined &&
    !isAccountLoginProviderId(record.loginProvider)
  ) {
    return null;
  }
  const provider = isAccountProviderId(record.provider) ? record.provider : null;
  const loginProvider = isAccountLoginProviderId(record.loginProvider) ? record.loginProvider : null;
  // 提示字段异常只忽略提示，不影响有效会话；旧缓存由服务层按可靠渠道补全。
  const lastLoginMethod = record.lastLoginMethod === "device" || isAccountLoginProviderId(record.lastLoginMethod)
    ? record.lastLoginMethod : undefined;
  const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString();
  const tokenEncrypted =
    typeof record.tokenEncrypted === "string" && record.tokenEncrypted.trim()
      ? record.tokenEncrypted
      : undefined;

  return { schemaVersion: ACCOUNT_SCHEMA_VERSION, user, provider, loginProvider, updatedAt, tokenEncrypted,
    ...(lastLoginMethod ? { lastLoginMethod } : {}),
  };
}

async function quarantineCorruptAccountFile(): Promise<void> {
  const accountPath = getAccountPath();
  const quarantinePath = `${accountPath}.corrupt-${Date.now()}`;

  try {
    await fs.rename(accountPath, quarantinePath);
    logger.warn("account", "store:quarantined-corrupt", { quarantinePath });
  } catch (error) {
    logger.error("account", "store:quarantine-failed", { message: String(error) });
  }
}

function isAccountUser(input: unknown): input is AccountUser {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return typeof record.uid === "string" && typeof record.username === "string";
}

function normalizeStoredUser(input: unknown): AccountUser | null {
  if (!isAccountUser(input)) {
    return null;
  }

  const identities = Array.isArray(input.identities)
    ? input.identities.filter(isSupportedIdentity)
    : [];

  return {
    ...input,
    ...(identities.length > 0 ? { identities } : {}),
  };
}

function isSupportedIdentity(input: unknown): input is AccountIdentity {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return (
    isAccountIdentityProviderId(record.provider) &&
    typeof record.providerUserId === "string" &&
    record.providerUserId.trim().length > 0
  );
}

function isAccountIdentityProviderId(input: unknown): input is AccountIdentityProviderId {
  return (ACCOUNT_IDENTITY_PROVIDER_IDS as readonly string[]).includes(String(input));
}

function isAccountProviderId(input: unknown): input is AccountFile["provider"] {
  return input === "email" || input === "guli";
}

function isAccountLoginProviderId(input: unknown): input is AccountLoginProviderId {
  return input === "email" || input === "google" || input === "linuxdo" || input === "github";
}

function isLegacyAccountFile(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (isUnsupportedStoredProvider(parsed.provider)) {
      return true;
    }
    const user = parsed.user;
    if (!user || typeof user !== "object" || Array.isArray(user)) return false;
    const identities = (user as Record<string, unknown>).identities;
    return Array.isArray(identities) && identities.some((identity) => {
      if (!identity || typeof identity !== "object" || Array.isArray(identity)) return false;
      const provider = (identity as Record<string, unknown>).provider;
      return isUnsupportedStoredProvider(provider);
    });
  } catch {
    return false;
  }
}

function isUnsupportedStoredProvider(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !(ACCOUNT_IDENTITY_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

async function deleteLegacyAccountFile(): Promise<void> {
  try {
    await fs.rm(getAccountPath(), { force: true });
    logger.info("account", "store:legacy-account-deleted");
  } catch (error) {
    logger.error("account", "store:legacy-account-delete-failed", { message: String(error) });
  }
}
