import { app, safeStorage } from "electron";
import fs from "node:fs/promises";
import type {
  AiActionPreference,
  AiFeatureAction,
  AiProviderModelSettings,
  AiProviderSettings,
  AiRecognitionSourcePreferences,
  PublicAiProviderSettings,
  SaveAiProviderProfilePayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import { aiFeatureActions } from "../../../src/features/library/types/ai";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { getAiSettingsPath, getLibraryDataDir } from "../library/libraryPaths";
import {
  type AiProviderSettingsCollection,
  mergeAiProviderSettingsPayload,
  normalizeAiProviderSettings,
  resolveAiProviderProfile,
  toPersistedAiSettingsFile,
  toPublicAiProviderSettings,
} from "./aiSettingsModel";

type AiSettingsFile = {
  activeProfileId?: string;
  actionPreferences?: Partial<Record<AiFeatureAction, AiActionPreference>>;
  actionOrder?: string[];
  recognitionSourcePreferences?: AiRecognitionSourcePreferences;
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  models?: AiProviderModelSettings[];
  apiKey?: string;
  apiKeyEncrypted?: string;
  profiles?: AiSettingsProfileFile[];
};

type AiSettingsProfileFile = {
  id?: string;
  name?: string;
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  models?: AiProviderModelSettings[];
  apiKey?: string;
  apiKeyEncrypted?: string;
};

let aiSettingsWriteChain: Promise<void> = Promise.resolve();

export async function readPublicAiProviderSettings(): Promise<PublicAiProviderSettings> {
  const settings = toPublicAiProviderSettings(await readPrivateAiProviderSettings());

  logger.info("ai", "ai-settings:read", {
    activeProfileId: settings.activeProfileId,
    actionPreferenceCount: Object.keys(settings.actionPreferences).length,
    profileCount: settings.profiles.length,
  });

  return settings;
}

export async function readPrivateAiProviderSettings(): Promise<AiProviderSettingsCollection> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  let content: string;

  try {
    content = await fs.readFile(getAiSettingsPath(), "utf8");
  } catch {
    return normalizeAiProviderSettings(null);
  }

  try {
    const file = JSON.parse(content) as unknown;
    return normalizeAiProviderSettings(readSettingsFileWithApiKeys(file));
  } catch {
    return normalizeAiProviderSettings(null);
  }
}

export async function readPrivateAiProviderProfile(profileId?: string, modelId?: string): Promise<AiProviderSettings> {
  return resolveAiProviderProfile(await readPrivateAiProviderSettings(), profileId, modelId);
}

export async function readPrivateAiProviderProfileById(profileId: string): Promise<AiProviderSettings> {
  const settings = await readPrivateAiProviderSettings();
  const normalizedProfileId = profileId.trim();
  const profile = settings.profiles.find((item) => item.id === normalizedProfileId);

  if (!profile) {
    throw new AppError("AI_SETTINGS_INVALID", "未找到这个 API。");
  }

  return profile;
}

export function writeAiProviderSettings(
  payload: SaveAiProviderSettingsPayload,
  beforeCommit?: () => void,
): Promise<PublicAiProviderSettings> {
  // Serialize read/merge/write cycles. Without this queue, two rapid model
  // selections can both read the same old file and the later rename can erase
  // the preference written by the first request.
  const task = aiSettingsWriteChain.then(() => writeAiProviderSettingsNow(payload, beforeCommit));
  aiSettingsWriteChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function writeAiProviderSettingsNow(
  payload: SaveAiProviderSettingsPayload,
  beforeCommit?: () => void,
): Promise<PublicAiProviderSettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  if (!isSavePayload(payload)) {
    throw new AppError("AI_SETTINGS_INVALID", "AI 设置结构不合法。");
  }

  const current = await readPrivateAiProviderSettings();
  const nextSettings = mergeAiProviderSettingsPayload(current, payload);
  const tempPath = `${getAiSettingsPath()}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(toSettingsFile(nextSettings), null, 2), "utf8");
  try { beforeCommit?.(); } catch (error) { await fs.rm(tempPath, { force: true }); throw error; }
  await fs.rename(tempPath, getAiSettingsPath());

  const publicSettings = toPublicAiProviderSettings(nextSettings);
  logger.info("ai", "ai-settings:write-persisted", {
    activeProfileId: publicSettings.activeProfileId,
    actionPreferenceCount: Object.keys(publicSettings.actionPreferences).length,
    profileCount: publicSettings.profiles.length,
  });

  return publicSettings;
}

export async function resolveAiProviderSettingsForPayload(
  payload: SaveAiProviderSettingsPayload,
  modelId?: string,
): Promise<AiProviderSettings> {
  if (!isSavePayload(payload)) {
    throw new AppError("AI_SETTINGS_INVALID", "AI 设置结构不合法。");
  }

  return resolveAiProviderProfile(
    mergeAiProviderSettingsPayload(await readPrivateAiProviderSettings(), payload),
    payload.activeProfileId,
    modelId,
  );
}

function toSettingsFile(settings: AiProviderSettingsCollection): AiSettingsFile {
  return toPersistedAiSettingsFile(settings, encryptApiKey);
}

function encryptApiKey(apiKey: string): string {
  const value = apiKey.trim();
  if (!value) {
    return "";
  }

  // Prefer OS-backed encryption when available (production / normal Windows installs).
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.encryptString(value).toString("base64");
    } catch {
      // Fall through to local development fallback below.
    }
  }

  // Development / restricted environments: still persist the key so API settings
  // remain usable. Packaged GitHub releases never ship this file (empty-shell).
  if (app?.isPackaged) {
    throw new AppError("AI_SETTINGS_ENCRYPTION_UNAVAILABLE", "系统加密不可用，无法安全保存 API Key。请检查系统账户凭据后重试。");
  }

  return encodeLocalDevApiKey(value);
}

function encodeLocalDevApiKey(apiKey: string): string {
  return `dev1:${Buffer.from(apiKey, "utf8").toString("base64")}`;
}

function decodeLocalDevApiKey(encoded: string): string | null {
  if (!encoded.startsWith("dev1:")) {
    return null;
  }

  try {
    return Buffer.from(encoded.slice("dev1:".length), "base64").toString("utf8").trim();
  } catch {
    return null;
  }
}

function readSettingsFileWithApiKeys(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const file = input as AiSettingsFile;

  if (Array.isArray(file.profiles)) {
    return {
      ...file,
      profiles: file.profiles.map((profile) => ({
        ...profile,
        apiKey: readStoredApiKey(profile),
      })),
    };
  }

  return {
    ...file,
    apiKey: readStoredApiKey(file),
  };
}

function readStoredApiKey(input: unknown): string {
  if (!isRecord(input)) {
    return "";
  }

  const file = input as AiSettingsFile | AiSettingsProfileFile;

  if (typeof file.apiKeyEncrypted === "string" && file.apiKeyEncrypted) {
    const localDevKey = decodeLocalDevApiKey(file.apiKeyEncrypted);
    if (localDevKey) {
      return localDevKey;
    }

    try {
      return safeStorage.decryptString(Buffer.from(file.apiKeyEncrypted, "base64")).trim();
    } catch {
      return "";
    }
  }

  return typeof file.apiKey === "string" ? file.apiKey.trim() : "";
}

function isSavePayload(input: unknown): input is SaveAiProviderSettingsPayload {
  return (
    isRecord(input) &&
    typeof input.activeProfileId === "string" &&
    Array.isArray(input.profiles) &&
    input.profiles.length > 0 &&
    input.profiles.every(isSaveProfilePayload) &&
    (typeof input.actionPreferences === "undefined" || isActionPreferences(input.actionPreferences)) &&
    (typeof input.actionOrder === "undefined" || isStringList(input.actionOrder)) &&
    (typeof input.recognitionSourcePreferences === "undefined" ||
      isRecognitionSourcePreferences(input.recognitionSourcePreferences))
  );
}

function isSaveProfilePayload(input: unknown): input is SaveAiProviderProfilePayload {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.name === "string" &&
    typeof input.enabled === "boolean" &&
    typeof input.baseUrl === "string" &&
    typeof input.model === "string" &&
    (typeof input.models === "undefined" || isModelList(input.models)) &&
    (typeof input.apiKey === "undefined" || typeof input.apiKey === "string") &&
    (typeof input.clearApiKey === "undefined" || typeof input.clearApiKey === "boolean")
  );
}

function isActionPreferences(input: unknown): input is Partial<Record<AiFeatureAction, AiActionPreference>> {
  if (!isRecord(input)) {
    return false;
  }

  return Object.entries(input).every(
    ([action, preference]) =>
      aiFeatureActions.includes(action as AiFeatureAction) &&
      isRecord(preference) &&
      (typeof preference.source === "undefined" || preference.source === "remote" || preference.source === "local") &&
      (typeof preference.profileId === "undefined" || typeof preference.profileId === "string") &&
      (typeof preference.modelId === "undefined" || typeof preference.modelId === "string") &&
      (typeof preference.rulePresetIds === "undefined" ||
        (Array.isArray(preference.rulePresetIds) &&
          preference.rulePresetIds.every((rulePresetId) => typeof rulePresetId === "string"))) &&
      (typeof preference.rules === "undefined" ||
        (Array.isArray(preference.rules) &&
          preference.rules.every(
            (rule) =>
              isRecord(rule) &&
              typeof rule.id === "string" &&
              typeof rule.label === "string" &&
              typeof rule.instructions === "string",
          ))) &&
      (typeof preference.customInstructions === "undefined" || typeof preference.customInstructions === "string"),
  );
}

function isRecognitionSourcePreferences(input: unknown): input is AiRecognitionSourcePreferences {
  if (!isRecord(input)) {
    return false;
  }

  return Object.entries(input).every(
    ([kind, source]) =>
      (kind === "category" || kind === "tags") &&
      (source === "image" || source === "prompt"),
  );
}

function isStringList(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function isModelList(input: unknown): input is AiProviderModelSettings[] {
  return (
    Array.isArray(input) &&
    input.every(
      (model) =>
        isRecord(model) &&
        typeof model.id === "string" &&
        typeof model.label === "string" &&
        Array.isArray(model.capabilities) &&
        model.capabilities.every(
          (capability) =>
            capability === "text" || capability === "vision" || capability === "image-generation" || capability === "video-generation",
        ),
    )
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
