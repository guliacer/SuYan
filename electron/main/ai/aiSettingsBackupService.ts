import { dialog } from "../app/fileDialogs";
import { formatExportFileName } from "../app/exportFileName";
import { reportExportProgress } from "../app/exportTask";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import type { PublicAiProviderSettings } from "../../../src/features/library/types/ai";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { readPrivateAiProviderSettings, writeAiProviderSettings } from "./aiSettingsStore";
import {
  toPublicAiProviderSettings,
  normalizeAiProviderSettings,
} from "./aiSettingsModel";
import {
  serializePlainBackup,
  serializeFullBackup,
  parseBackupFile,
  migrateBackupPayload,
} from "./aiSettingsBackup";
import { mergeBackupIntoCurrent, type MergeBackupMode } from "./aiSettingsMerge";
import type { AiSettingsBackupPayload } from "./aiSettingsBackup";
import { parseAccountBackup, serializeAccountBackup } from "./aiSettingsAccountBackup";
import { getAccountBackupKey, getAuthorInfo } from "../account/accountService";

type ImportCacheEntry = {
  payload: AiSettingsBackupPayload;
  expiresAt: number;
  ownerUid?: string;
  keyId?: string;
};

type ExportResult = { canceled: true; filePath?: undefined } | { canceled: false; filePath: string };

const IMPORT_TOKEN_TTL_MS = 10 * 60 * 1000;

const importTokenCache = new Map<string, ImportCacheEntry>();

const PLAIN_BACKUP_FILTER = { name: "AI 设置备份（明文）", extensions: ["suyan-ai.json"] };
const FULL_BACKUP_FILTER = { name: "AI 设置备份（加密）", extensions: ["suyan-ai"] };

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

async function atomicWriteJson(filePath: string, data: string): Promise<void> {
  reportExportProgress("正在保存 AI 设置备份…");
  const tmpPath = `${filePath}.tmp.${crypto.randomBytes(8).toString("hex")}`;
  await fs.writeFile(tmpPath, data, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function exportSettingsBackup(options: {
  type: "plain" | "full" | "account";
  password?: string;
}): Promise<ExportResult> {
  if (!options || !["plain", "full", "account"].includes(options.type)) throw new AppError("AI_SETTINGS_BACKUP_INVALID", "请选择有效的导出方式。");
  const exportUid = getAuthorInfo()?.uid;
  if (options.type === "account" && !exportUid) throw new AppError("AI_BACKUP_LOGIN_REQUIRED", "请先登录再导出账户加密备份。");
  const settings = await readPrivateAiProviderSettings();

  const backupLabels = { plain: "AI设置-普通", full: "AI设置-密码加密", account: "AI设置-账户加密" };
  const defaultPath = formatExportFileName(backupLabels[options.type], options.type === "plain" ? "suyan-ai.json" : "suyan-ai");
  const filters =
    options.type === "plain"
      ? [PLAIN_BACKUP_FILTER, FULL_BACKUP_FILTER]
      : [FULL_BACKUP_FILTER, PLAIN_BACKUP_FILTER];

  const result = await dialog.showSaveDialog({
    title: options.type === "plain" ? "导出 AI 设置（明文）" : "导出 AI 设置（加密）",
    defaultPath,
    filters,
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const filePath = result.filePath;

  try {
    if (options.type === "account") {
      reportExportProgress("正在验证账户并加密设置…");
      if (getAuthorInfo()?.uid !== exportUid) throw new AppError("AI_BACKUP_ACCOUNT_CHANGED", "账户已变化，请重新导出。");
      const envelope = await serializeAccountBackup(settings);
      if (getAuthorInfo()?.uid !== exportUid) throw new AppError("AI_BACKUP_ACCOUNT_CHANGED", "账户已变化，请重新导出。");
      await atomicWriteJson(filePath, JSON.stringify(envelope, null, 2));
    } else if (options.type === "plain") {
      reportExportProgress("正在整理 AI 设置…");
      const payload = serializePlainBackup(settings);
      await atomicWriteJson(filePath, JSON.stringify(payload, null, 2));
    } else {
      if (!options.password) {
        throw new AppError("AI_SETTINGS_BACKUP_INVALID", "加密导出需要提供密码。");
      }
      reportExportProgress("正在加密 AI 设置…");
      const envelope = await serializeFullBackup(settings, options.password);
      await atomicWriteJson(filePath, JSON.stringify(envelope, null, 2));
    }

    logger.info("ai", "ai-settings-export:done", {
      type: options.type,
      filePath,
    });

    return { canceled: false, filePath };
  } catch (error) {
    logger.error("ai", "ai-settings-export:error", {
      type: options.type,
      message: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

export async function importSettingsPreview(options: {
  password?: string;
} = {}): Promise<{
  token: string;
  fileName: string;
  formatVersion: number;
  providerCount: number;
  newProviderCount: number;
  modelCount: number;
  hasApiKeyProfiles: boolean;
  actionPreferencesCount: number;
  errors?: string[];
}> {
  const result = await dialog.showOpenDialog({
    title: "导入 AI 设置备份",
    properties: ["openFile"],
    filters: [
      { name: "AI 设置备份", extensions: ["suyan-ai", "suyan-ai.json"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    throw new AppError("AI_SETTINGS_BACKUP_INVALID", "用户取消了导入操作。");
  }

  const filePath = result.filePaths[0];
  if ((await fs.stat(filePath)).size > 32 * 1024 * 1024) throw new AppError("AI_SETTINGS_BACKUP_INVALID", "备份文件超过 32 MiB，无法导入。");
  const content = await fs.readFile(filePath, "utf8");
  let envelope: unknown;
  try { envelope = JSON.parse(content); } catch { throw new AppError("AI_SETTINGS_BACKUP_INVALID", "备份文件不是有效的 JSON。"); }
  const accountBackup = (envelope as { formatVersion?: number } | null)?.formatVersion === 3 ? await parseAccountBackup(envelope) : null;
  const parsed = accountBackup ? { ok: true as const, data: accountBackup.payload } : parseBackupFile(content, options.password);

  if (!parsed.ok) {
    logger.warn("ai", "ai-settings-import:parse-error", {
      code: parsed.error.code,
      fileName: filePath,
    });
    throw new AppError("AI_SETTINGS_BACKUP_VALIDATION_FAILED", parsed.error.message);
  }

  const payload = parsed.data;
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  const providerCount = payload.profiles.length;
  const modelCount = payload.profiles.reduce(
    (sum, p) => sum + (p.models?.length ?? 0),
    0,
  );
  const hasApiKeyProfiles = payload.profiles.some((p) => p.hasApiKey);
  const actionPreferencesCount = Object.keys(payload.actionPreferences).length;

  const token = generateToken();
  importTokenCache.set(token, {
    payload,
    expiresAt: Date.now() + IMPORT_TOKEN_TTL_MS,
    ...(accountBackup ? { ownerUid: accountBackup.ownerUid, keyId: accountBackup.keyId } : {}),
  });

  logger.info("ai", "ai-settings-import:preview", {
    fileName,
    formatVersion: accountBackup ? 3 : payload.formatVersion,
    providerCount,
    modelCount,
    hasApiKeyProfiles,
    actionPreferencesCount,
  });

  return {
    token,
    fileName,
    formatVersion: accountBackup ? 3 : payload.formatVersion,
    providerCount,
    newProviderCount: providerCount,
    modelCount,
    hasApiKeyProfiles,
    actionPreferencesCount,
  };
}

export async function importSettingsApply(
  token: string,
  mode: MergeBackupMode,
): Promise<PublicAiProviderSettings> {
  if (!["merge", "replace", "add-new"].includes(mode)) throw new AppError("AI_SETTINGS_BACKUP_INVALID", "导入方式无效。");
  const cacheEntry = importTokenCache.get(token);

  if (!cacheEntry) {
    throw new AppError("AI_SETTINGS_BACKUP_INVALID", "导入令牌无效或已过期。");
  }

  if (Date.now() > cacheEntry.expiresAt) {
    importTokenCache.delete(token);
    throw new AppError("AI_SETTINGS_BACKUP_INVALID", "导入令牌已过期，请重新选择文件。");
  }

  importTokenCache.delete(token);
  if (cacheEntry.ownerUid) {
    const material = await getAccountBackupKey(cacheEntry.ownerUid, cacheEntry.keyId);
    material.key.fill(0);
  }
  const assertSameAccount = () => {
    if (cacheEntry.ownerUid && getAuthorInfo()?.uid !== cacheEntry.ownerUid) throw new AppError("AI_BACKUP_ACCOUNT_CHANGED", "账户已变化，请重新验证备份。");
  };

  const backupPayload = cacheEntry.payload;
  const current = await readPrivateAiProviderSettings();

  const backupAsSettings = normalizeAiProviderSettings(
    migrateBackupPayload(backupPayload as unknown as Record<string, unknown>),
  );

  const merged = mergeBackupIntoCurrent(current, backupAsSettings, mode);

  assertSameAccount();
  const publicResult = await writeAiProviderSettings({
    activeProfileId: merged.activeProfileId,
    profiles: merged.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      baseUrl: p.baseUrl,
      model: p.model,
      models: p.models,
      apiKey: p.apiKey,
    })),
    actionPreferences: merged.actionPreferences,
    ...(merged.actionOrder?.length ? { actionOrder: merged.actionOrder } : {}),
    recognitionSourcePreferences: merged.recognitionSourcePreferences,
  }, assertSameAccount);

  logger.info("ai", "ai-settings-import:applied", {
    mode,
    profileCount: merged.profiles.length,
  });

  return publicResult;
}
