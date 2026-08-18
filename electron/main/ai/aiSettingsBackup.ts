import type { AiProviderSettingsCollection } from "./aiSettingsModel";
import {
  normalizeAiProviderSettings,
} from "./aiSettingsModel";
import {
  encryptBackup,
  decryptBackup,
} from "./aiSettingsBackupCrypto";

type PlainBackupProfile = {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly hasApiKey: boolean;
  readonly model: string;
  readonly models: readonly { readonly id: string; readonly label: string; readonly capabilities: readonly string[] }[];
};

export type AiSettingsBackupPayload = {
  readonly format: "suyan-ai-settings";
  readonly formatVersion: 1;
  readonly exportedAt: string;
  readonly profiles: readonly PlainBackupProfile[];
  readonly actionPreferences: Record<string, unknown>;
  readonly recognitionSourcePreferences: Record<string, unknown>;
  readonly actionOrder?: readonly string[];
};

export type AiSettingsBackupEnvelope = {
  readonly format: "suyan-ai-settings";
  readonly formatVersion: 2;
  readonly kdf: "scrypt";
  readonly kdfParams: { readonly N: number; readonly r: number; readonly p: number; readonly keylen: number };
  readonly salt: string;
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
  readonly exportedAt: string;
};

export type ParseBackupResult =
  | { ok: true; data: AiSettingsBackupPayload }
  | { ok: false; error: { code: string; message: string } };

export function serializePlainBackup(
  settings: AiProviderSettingsCollection,
): AiSettingsBackupPayload {
  const normalized = normalizeAiProviderSettings(settings);

  return {
    format: "suyan-ai-settings",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    profiles: normalized.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      baseUrl: profile.baseUrl,
      hasApiKey: Boolean(profile.apiKey),
      model: profile.model,
      models: profile.models,
    })),
    actionPreferences: normalized.actionPreferences,
    recognitionSourcePreferences: normalized.recognitionSourcePreferences,
    ...(normalized.actionOrder?.length ? { actionOrder: normalized.actionOrder } : {}),
  };
}

export async function serializeFullBackup(
  settings: AiProviderSettingsCollection,
  password: string,
): Promise<AiSettingsBackupEnvelope> {
  const plainPayload = serializePlainBackup(settings);
  const plainText = JSON.stringify(plainPayload);
  const envelope = encryptBackup(plainText, password);

  return {
    format: "suyan-ai-settings",
    formatVersion: 2,
    kdf: "scrypt",
    kdfParams: { N: 16384, r: 8, p: 1, keylen: 32 },
    salt: envelope.salt.toString("base64"),
    iv: envelope.iv.toString("base64"),
    authTag: envelope.authTag.toString("base64"),
    ciphertext: envelope.ciphertext.toString("base64"),
    exportedAt: new Date().toISOString(),
  };
}

export function parseBackupFile(
  text: string,
  password?: string,
): ParseBackupResult {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    if (parsed.format !== "suyan-ai-settings") {
      return {
        ok: false,
        error: {
          code: "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
          message: "不支持的备份格式。",
        },
      };
    }

    const version = parsed.formatVersion;

    if (version !== 1 && version !== 2) {
      return {
        ok: false,
        error: {
          code: "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
          message: "不支持的备份版本。",
        },
      };
    }

    let plainPayload: AiSettingsBackupPayload;

    if (version === 2) {
      if (!password) {
        return {
          ok: false,
          error: {
            code: "AI_SETTINGS_BACKUP_DECRYPT_FAILED",
            message: "加密备份需要密码。",
          },
        };
      }

      const envelope = {
        salt: Buffer.from(parsed.salt as string, "base64"),
        iv: Buffer.from(parsed.iv as string, "base64"),
        authTag: Buffer.from(parsed.authTag as string, "base64"),
        ciphertext: Buffer.from(parsed.ciphertext as string, "base64"),
      };

      const decrypted = decryptBackup(envelope, password);
      const innerParsed = JSON.parse(decrypted) as Record<string, unknown>;

      if (innerParsed.format !== "suyan-ai-settings" || innerParsed.formatVersion !== 1) {
        return {
          ok: false,
          error: {
            code: "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
            message: "加密备份内部格式不匹配。",
          },
        };
      }

      plainPayload = innerParsed as unknown as AiSettingsBackupPayload;
    } else {
      plainPayload = parsed as unknown as AiSettingsBackupPayload;
    }

    const migrated = migrateBackupPayload(plainPayload);
    const settings = normalizeAiProviderSettings(
      migrated as unknown as AiProviderSettingsCollection,
    );

    if (settings.profiles.length === 0) {
      return {
        ok: false,
        error: {
          code: "AI_SETTINGS_INVALID",
          message: "备份文件中没有有效的 API 配置。",
        },
      };
    }

    return { ok: true, data: migrateBackupPayload(migrated) };
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };

    if (err.code === "AI_SETTINGS_BACKUP_DECRYPT_FAILED") {
      return {
        ok: false,
        error: {
          code: "AI_SETTINGS_BACKUP_DECRYPT_FAILED",
          message: "密码错误或备份文件已损坏。",
        },
      };
    }

    return {
      ok: false,
      error: {
        code: "AI_SETTINGS_BACKUP_UNSUPPORTED_VERSION",
        message: "备份文件解析失败。",
      },
    };
  }
}

export function migrateBackupPayload(
  payload: Record<string, unknown>,
): AiSettingsBackupPayload {
  return {
    format: "suyan-ai-settings",
    formatVersion: 1,
    exportedAt:
      typeof payload.exportedAt === "string"
        ? payload.exportedAt
        : new Date().toISOString(),
    profiles: Array.isArray(payload.profiles)
      ? (payload.profiles as AiSettingsBackupPayload["profiles"])
      : [],
    actionPreferences: isRecord(payload.actionPreferences)
      ? payload.actionPreferences
      : {},
    recognitionSourcePreferences: isRecord(payload.recognitionSourcePreferences)
      ? payload.recognitionSourcePreferences
      : {},
    actionOrder: Array.isArray(payload.actionOrder)
      ? (payload.actionOrder as readonly string[])
      : undefined,
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
