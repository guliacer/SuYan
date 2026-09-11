import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../ipc/errors";
import { getAccountBackupKey, getAuthorInfo } from "../account/accountService";
import { parseBackupFile, serializePlainBackup } from "./aiSettingsBackup";
import { normalizeAiProviderSettings, type AiProviderSettingsCollection } from "./aiSettingsModel";

export type AccountBackupEnvelope = { format: "suyan-ai-settings"; formatVersion: 3; ownerUid: string;
  keyId: string; algorithm: "aes-256-gcm"; exportedAt: string; iv: string; authTag: string; ciphertext: string };
function aad(e: Pick<AccountBackupEnvelope, "ownerUid" | "keyId" | "exportedAt">) {
  return Buffer.from(JSON.stringify(["suyan-ai-settings", 3, e.ownerUid, e.keyId, e.exportedAt, "aes-256-gcm"]), "utf8");
}
export async function serializeAccountBackup(settings: AiProviderSettingsCollection): Promise<AccountBackupEnvelope> {
  const user = getAuthorInfo();
  if (!user) throw new AppError("AI_BACKUP_LOGIN_REQUIRED", "请先登录再导出账户加密备份。");
  const material = await getAccountBackupKey(user.uid);
  try {
    const normalized = normalizeAiProviderSettings(settings);
    const payload = { ...serializePlainBackup(normalized), activeProfileId: normalized.activeProfileId,
      profiles: normalized.profiles.map(profile => ({ ...profile, hasApiKey: Boolean(profile.apiKey) })) };
    const meta = { format: "suyan-ai-settings" as const, formatVersion: 3 as const, ownerUid: user.uid,
      keyId: material.keyId, algorithm: "aes-256-gcm" as const, exportedAt: new Date().toISOString() };
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", material.key, iv);
    cipher.setAAD(aad(meta));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return { ...meta, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  } finally { material.key.fill(0); }
}

export async function parseAccountBackup(value: unknown) {
  const e = value as AccountBackupEnvelope;
  if (!e || e.format !== "suyan-ai-settings" || e.formatVersion !== 3 || e.algorithm !== "aes-256-gcm" || typeof e.ownerUid !== "string" || e.ownerUid.length > 2048 || typeof e.keyId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(e.keyId) || typeof e.exportedAt !== "string" || e.exportedAt.length > 64 || typeof e.iv !== "string" || typeof e.authTag !== "string" || typeof e.ciphertext !== "string" || e.ciphertext.length > 32 * 1024 * 1024) {
    throw new AppError("AI_BACKUP_INVALID", "账户加密备份格式无效。");
  }
  const user = getAuthorInfo();
  if (!user) throw new AppError("AI_BACKUP_LOGIN_REQUIRED", "请先登录导出此备份的账户。");
  if (user.uid !== e.ownerUid) throw new AppError("AI_BACKUP_WRONG_ACCOUNT", "此备份属于另一个账户，请登录导出时的同一账户。");
  const material = await getAccountBackupKey(e.ownerUid, e.keyId);
  try {
    const iv = Buffer.from(e.iv, "base64");
    const tag = Buffer.from(e.authTag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid envelope");
    const cipher = createDecipheriv("aes-256-gcm", material.key, iv);
    cipher.setAAD(aad(e)); cipher.setAuthTag(tag);
    const plaintext = Buffer.concat([cipher.update(Buffer.from(e.ciphertext, "base64")), cipher.final()]).toString("utf8");
    const parsed = parseBackupFile(plaintext);
    if (!parsed.ok) throw new Error("invalid payload");
    return { payload: parsed.data, ownerUid: e.ownerUid, keyId: e.keyId };
  } catch {
    throw new AppError("AI_BACKUP_DECRYPT_FAILED", "账户备份解密失败，文件可能已被修改或损坏。");
  } finally { material.key.fill(0); }
}
