import { safeStorage } from "electron";
import fs from "node:fs/promises";
import type {
  AiActionPreference,
  AiFeatureAction,
  AiProviderModelSettings,
  AiProviderSettings,
  PublicAiProviderSettings,
  SaveAiProviderProfilePayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import { aiFeatureActions } from "../../../src/features/library/types/ai";
import { AppError } from "../ipc/errors";
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

export async function readPublicAiProviderSettings(): Promise<PublicAiProviderSettings> {
  return toPublicAiProviderSettings(await readPrivateAiProviderSettings());
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

export async function writeAiProviderSettings(
  payload: SaveAiProviderSettingsPayload,
): Promise<PublicAiProviderSettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  if (!isSavePayload(payload)) {
    throw new AppError("AI_SETTINGS_INVALID", "AI 设置结构不合法。");
  }

  const current = await readPrivateAiProviderSettings();
  const nextSettings = mergeAiProviderSettingsPayload(current, payload);
  const tempPath = `${getAiSettingsPath()}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(toSettingsFile(nextSettings), null, 2), "utf8");
  await fs.rename(tempPath, getAiSettingsPath());

  return toPublicAiProviderSettings(nextSettings);
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
  if (!apiKey || !safeStorage.isEncryptionAvailable()) {
    return "";
  }

  try {
    return safeStorage.encryptString(apiKey).toString("base64");
  } catch {
    return "";
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
    (typeof input.actionPreferences === "undefined" || isActionPreferences(input.actionPreferences))
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

function isModelList(input: unknown): input is AiProviderModelSettings[] {
  return (
    Array.isArray(input) &&
    input.every(
      (model) =>
        isRecord(model) &&
        typeof model.id === "string" &&
        typeof model.label === "string" &&
        Array.isArray(model.capabilities) &&
        model.capabilities.every((capability) => capability === "text" || capability === "vision"),
    )
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
