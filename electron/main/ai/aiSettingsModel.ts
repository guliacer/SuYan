import type {
  AiActionPreference,
  AiFeatureAction,
  AiProviderModelCapability,
  AiProviderModelSettings,
  AiProviderSettings,
  PublicAiProviderProfile,
  PublicAiProviderSettings,
  SaveAiProviderProfilePayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import {
  AI_RULE_INSTRUCTIONS_MAX_LENGTH,
  aiFeatureActions,
  buildAiActionInstructions,
  normalizeAiActionRules,
  normalizeAiRulePresetIds,
} from "../../../src/features/library/types/ai";
import { AppError } from "../ipc/errors";

export type AiProviderSettingsCollection = {
  activeProfileId: string;
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>;
  profiles: AiProviderSettings[];
};

type PersistedAiProviderProfile = {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  models?: AiProviderModelSettings[];
  apiKeyEncrypted?: string;
};

export type PersistedAiSettingsFile = {
  schemaVersion: 3;
  activeProfileId: string;
  actionPreferences?: Partial<Record<AiFeatureAction, AiActionPreference>>;
  profiles: PersistedAiProviderProfile[];
};

export const defaultAiProviderProfile: AiProviderSettings = {
  id: "default",
  name: "默认 API",
  enabled: false,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  models: [
    {
      id: "gpt-4.1-mini",
      label: "gpt-4.1-mini",
      capabilities: ["text", "vision"],
    },
  ],
};

export const defaultAiProviderSettings: AiProviderSettingsCollection = {
  activeProfileId: defaultAiProviderProfile.id,
  actionPreferences: {},
  profiles: [{ ...defaultAiProviderProfile }],
};

export function toPublicAiProviderSettings(
  settings: AiProviderSettingsCollection,
): PublicAiProviderSettings {
  const normalizedSettings = normalizeAiProviderSettings(settings);
  const activeProfile = resolveAiProviderProfile(normalizedSettings);

  return {
    activeProfileId: activeProfile.id,
    actionPreferences: normalizedSettings.actionPreferences,
    profiles: normalizedSettings.profiles.map(toPublicAiProviderProfile),
    enabled: activeProfile.enabled,
    baseUrl: activeProfile.baseUrl,
    hasApiKey: Boolean(activeProfile.apiKey),
    apiKeyPreview: maskApiKeyPreview(activeProfile.apiKey),
    model: activeProfile.model,
  };
}

export function normalizeAiProviderSettings(input: unknown): AiProviderSettingsCollection {
  if (!isRecord(input)) {
    return createDefaultAiProviderSettings();
  }

  if (Array.isArray(input.profiles)) {
    const profiles = normalizeProfileList(input.profiles);
    const activeProfileId = resolveActiveProfileId(normalizeString(input.activeProfileId), profiles);

    return {
      activeProfileId,
      actionPreferences: normalizeActionPreferences(input.actionPreferences, profiles),
      profiles,
    };
  }

  const legacyProfile = normalizeAiProviderProfile({
    id: defaultAiProviderProfile.id,
    name: defaultAiProviderProfile.name,
    enabled: input.enabled,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    models: input.model
      ? [
          {
            id: input.model,
            label: input.model,
            capabilities: ["text", "vision"],
          },
        ]
      : undefined,
  }, 0);

  return {
    activeProfileId: legacyProfile.id,
    actionPreferences: {},
    profiles: [legacyProfile],
  };
}

export function mergeAiProviderSettingsPayload(
  current: AiProviderSettingsCollection,
  payload: SaveAiProviderSettingsPayload,
): AiProviderSettingsCollection {
  const currentSettings = normalizeAiProviderSettings(current);
  const currentById = new Map(currentSettings.profiles.map((profile) => [profile.id, profile]));
  const payloadProfiles = payload.profiles.map((profile, index) =>
    mergeAiProviderProfilePayload(currentById.get(normalizeProfileId(profile.id, index)), profile, index),
  );
  const profiles = normalizeProfileList(payloadProfiles);
  const nextSettings: AiProviderSettingsCollection = {
    activeProfileId: resolveActiveProfileId(payload.activeProfileId, profiles),
    actionPreferences: normalizeActionPreferences(payload.actionPreferences ?? currentSettings.actionPreferences, profiles),
    profiles,
  };

  validateAiProviderSettingsCollection(nextSettings);

  return nextSettings;
}

export function toPersistedAiSettingsFile(
  settings: AiProviderSettingsCollection,
  encryptApiKey: (apiKey: string) => string,
): PersistedAiSettingsFile {
  const normalizedSettings = normalizeAiProviderSettings(settings);

  return {
    schemaVersion: 3,
    activeProfileId: resolveActiveProfileId(normalizedSettings.activeProfileId, normalizedSettings.profiles),
    actionPreferences: normalizedSettings.actionPreferences,
    profiles: normalizedSettings.profiles.map((profile) => {
      const fileProfile: PersistedAiProviderProfile = {
        id: profile.id,
        name: profile.name,
        enabled: profile.enabled,
        baseUrl: profile.baseUrl,
        model: profile.model,
        models: profile.models,
      };

      if (!profile.apiKey) {
        return fileProfile;
      }

      const apiKeyEncrypted = encryptApiKey(profile.apiKey);

      if (!apiKeyEncrypted) {
        throw new AppError("AI_KEY_ENCRYPTION_UNAVAILABLE", "当前系统无法安全保存 API Key，请检查系统加密能力。");
      }

      return {
        ...fileProfile,
        apiKeyEncrypted,
      };
    }),
  };
}

export function resolveAiProviderProfile(
  settings: AiProviderSettingsCollection,
  profileId?: string,
  modelId?: string,
): AiProviderSettings {
  const normalizedSettings = normalizeAiProviderSettings(settings);
  const requestedProfileId = normalizeString(profileId);
  const requestedProfile = requestedProfileId
    ? normalizedSettings.profiles.find((profile) => profile.id === requestedProfileId)
    : null;

  const profile = requestedProfile ?? (
    normalizedSettings.profiles.find((profile) => profile.id === normalizedSettings.activeProfileId) ??
    normalizedSettings.profiles[0] ??
    { ...defaultAiProviderProfile }
  );
  const requestedModelId = normalizeString(modelId);
  const requestedModel = requestedModelId ? profile.models.find((model) => model.id === requestedModelId) : null;

  return {
    ...profile,
    model: requestedModel?.id || profile.model,
  };
}

export function resolveAiProviderProfileForAction(
  settings: AiProviderSettingsCollection,
  action: AiFeatureAction,
  profileId?: string,
  modelId?: string,
): AiProviderSettings {
  const normalizedSettings = normalizeAiProviderSettings(settings);
  const preference = normalizedSettings.actionPreferences[action];

  return resolveAiProviderProfile(
    normalizedSettings,
    profileId || preference?.profileId,
    modelId || preference?.modelId,
  );
}

export function resolveAiActionCustomInstructions(
  settings: AiProviderSettingsCollection,
  action: AiFeatureAction,
  override?: string,
): string {
  if (typeof override === "string") {
    return normalizeCustomInstructions(override);
  }

  return normalizeCustomInstructions(
    buildAiActionInstructions(action, normalizeAiProviderSettings(settings).actionPreferences[action]),
  );
}

export function validateAiProviderSettings(settings: AiProviderSettings): void {
  if (!settings.enabled) {
    return;
  }

  if (!settings.baseUrl || !settings.model || !settings.apiKey) {
    throw new AppError("AI_SETTINGS_INCOMPLETE", "请先填写接口地址、模型和 API Key。");
  }
}

export function validateAiProviderSettingsCollection(settings: AiProviderSettingsCollection): void {
  if (settings.profiles.length === 0) {
    throw new AppError("AI_SETTINGS_INVALID", "至少需要保留一个 API 配置。");
  }

  for (const profile of settings.profiles) {
    validateAiProviderSettings(profile);
  }
}

function toPublicAiProviderProfile(profile: AiProviderSettings): PublicAiProviderProfile {
  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    baseUrl: profile.baseUrl,
    hasApiKey: Boolean(profile.apiKey),
    apiKeyPreview: maskApiKeyPreview(profile.apiKey),
    model: profile.model,
    models: profile.models,
  };
}

function mergeAiProviderProfilePayload(
  currentProfile: AiProviderSettings | undefined,
  payload: SaveAiProviderProfilePayload,
  index: number,
): AiProviderSettings {
  const nextApiKey = payload.clearApiKey ? "" : normalizeString(payload.apiKey) || currentProfile?.apiKey || "";

  return normalizeAiProviderProfile(
    {
      id: payload.id || currentProfile?.id,
      name: payload.name,
      enabled: payload.enabled,
      baseUrl: payload.baseUrl,
      apiKey: nextApiKey,
      model: payload.model,
      models: payload.models,
    },
    index,
  );
}

function normalizeProfileList(input: readonly unknown[]): AiProviderSettings[] {
  const usedIds = new Set<string>();
  const profiles: AiProviderSettings[] = [];

  input.forEach((profile, index) => {
    const normalizedProfile = normalizeAiProviderProfile(profile, index);
    const baseId = normalizedProfile.id;
    let nextId = baseId;
    let suffix = 2;

    while (usedIds.has(nextId)) {
      nextId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(nextId);
    profiles.push({ ...normalizedProfile, id: nextId });
  });

  return profiles.length > 0 ? profiles : [{ ...defaultAiProviderProfile }];
}

function normalizeAiProviderProfile(input: unknown, index: number): AiProviderSettings {
  const source = isRecord(input) ? input : {};
  const id = normalizeProfileId(source.id, index);
  const model = normalizeString(source.model) || defaultAiProviderProfile.model;
  const models = normalizeAiProviderModels(source.models, model);

  return {
    id,
    name: normalizeString(source.name) || (index === 0 ? defaultAiProviderProfile.name : `API ${index + 1}`),
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaultAiProviderProfile.enabled,
    baseUrl: normalizeString(source.baseUrl) || defaultAiProviderProfile.baseUrl,
    apiKey: normalizeString(source.apiKey),
    model: models.some((item) => item.id === model) ? model : models[0]?.id || defaultAiProviderProfile.model,
    models,
  };
}

export function normalizeAiProviderModels(
  input: unknown,
  fallbackModelId = defaultAiProviderProfile.model,
): AiProviderModelSettings[] {
  const models: AiProviderModelSettings[] = [];
  const usedIds = new Set<string>();
  const values = Array.isArray(input) ? input : [];

  for (const value of values) {
    const model = normalizeAiProviderModel(value);

    if (!model || usedIds.has(model.id)) {
      continue;
    }

    usedIds.add(model.id);
    models.push(model);
  }

  const fallbackModel = normalizeString(fallbackModelId) || defaultAiProviderProfile.model;

  if (models.length === 0 || !usedIds.has(fallbackModel)) {
    models.unshift({
      id: fallbackModel,
      label: fallbackModel,
      capabilities: ["text", "vision"],
    });
  }

  return models.slice(0, 80);
}

export function normalizeAiProviderModel(input: unknown): AiProviderModelSettings | null {
  if (!isRecord(input)) {
    const id = normalizeString(input);

    return id ? { id, label: id, capabilities: ["text"] } : null;
  }

  const id = normalizeString(input.id) || normalizeString(input.label);

  if (!id) {
    return null;
  }

  return {
    id,
    label: normalizeString(input.label) || id,
    capabilities: normalizeModelCapabilities(input.capabilities),
  };
}

export function normalizeModelCapabilities(input: unknown): AiProviderModelCapability[] {
  const capabilities = Array.isArray(input)
    ? input.filter((capability): capability is AiProviderModelCapability =>
        capability === "text" || capability === "vision",
      )
    : [];

  return capabilities.length > 0 ? [...new Set(capabilities)] : ["text"];
}

function createDefaultAiProviderSettings(): AiProviderSettingsCollection {
  return {
    activeProfileId: defaultAiProviderProfile.id,
    actionPreferences: {},
    profiles: [{ ...defaultAiProviderProfile }],
  };
}

function normalizeActionPreferences(
  input: unknown,
  profiles: readonly AiProviderSettings[],
): Partial<Record<AiFeatureAction, AiActionPreference>> {
  if (!isRecord(input)) {
    return {};
  }

  const preferences: Partial<Record<AiFeatureAction, AiActionPreference>> = {};

  for (const action of aiFeatureActions) {
    const rawPreference = input[action];

    if (!isRecord(rawPreference)) {
      continue;
    }

    const profileId = normalizeString(rawPreference.profileId);
    const profile = profileId ? profiles.find((item) => item.id === profileId) : null;
    const modelId = normalizeString(rawPreference.modelId);
    const hasRules = Array.isArray(rawPreference.rules);
    const rules = hasRules ? normalizeAiActionRules(action, rawPreference.rules) : undefined;
    const rulePresetIds = normalizeAiRulePresetIds(action, rawPreference.rulePresetIds, rules);
    const customInstructions = normalizeCustomInstructions(rawPreference.customInstructions);
    const preference: AiActionPreference = {};

    if (profile) {
      preference.profileId = profile.id;

      if (modelId && profile.models.some((model) => model.id === modelId)) {
        preference.modelId = modelId;
      }
    }

    if (hasRules) {
      preference.rules = rules;
    }

    if (rulePresetIds.length > 0) {
      preference.rulePresetIds = rulePresetIds;
    }

    if (customInstructions) {
      preference.customInstructions = customInstructions;
    }

    if (Object.keys(preference).length > 0) {
      preferences[action] = preference;
    }
  }

  return preferences;
}

function resolveActiveProfileId(activeProfileId: string, profiles: readonly AiProviderSettings[]): string {
  const normalizedActiveProfileId = normalizeString(activeProfileId);

  if (normalizedActiveProfileId && profiles.some((profile) => profile.id === normalizedActiveProfileId)) {
    return normalizedActiveProfileId;
  }

  return profiles[0]?.id ?? defaultAiProviderProfile.id;
}

function normalizeProfileId(input: unknown, index: number): string {
  const value = normalizeString(input)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);

  return value || (index === 0 ? defaultAiProviderProfile.id : `api-${index + 1}`);
}

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeCustomInstructions(input: unknown): string {
  return normalizeString(input).slice(0, AI_RULE_INSTRUCTIONS_MAX_LENGTH);
}

function maskApiKeyPreview(apiKey: string): string {
  const value = normalizeString(apiKey);

  if (!value) {
    return "";
  }

  if (value.length <= 4) {
    return `${value.slice(0, 1)}****${value.slice(-1)}`;
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}****${value.slice(-4)}`;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
