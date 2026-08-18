import type {
  AiActionPreference,
  AiFeatureAction,
  AiProviderModelCapability,
  AiProviderModelSettings,
  AiRecognitionKind,
  AiRecognitionSource,
  AiRecognitionSourcePreferences,
  PublicAiProviderProfile,
  PublicAiProviderSettings,
  SaveAiProviderProfilePayload,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import { aiFeatureActionMeta } from "../types/ai";
import { normalizeActionPreferencesDraft } from "../utils/aiSettingsDraft";
import { normalizeAiBaseUrl } from "../utils/aiBaseUrl";
import type { StatusFeedbackMessage } from "../utils/statusFeedback";

export type AiSettingsDialogProps = {
  isBusy: boolean;
  settings: PublicAiProviderSettings;
  onClose: () => void;
  onSave: (settings: SaveAiProviderSettingsPayload) => Promise<boolean | string>;
  onSaveAiRecognitionSourcePreferences: (preferences: AiRecognitionSourcePreferences) => Promise<boolean>;
  onTest: (settings: SaveAiProviderSettingsPayload) => Promise<{ message: string; ok: boolean }>;
  onListModels: (settings: SaveAiProviderSettingsPayload) => Promise<AiProviderModelSettings[] | null>;
  onCopyApiKey: (profileId: string, draftApiKey?: string) => Promise<boolean>;
  onReadApiKey: (profileId: string) => Promise<string | null>;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

export type AiProviderProfileDraft = {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  models: AiProviderModelSettings[];
  hasApiKey: boolean;
  apiKeyPreview: string;
  apiKey: string;
  clearApiKey: boolean;
};

export type ModelPickerState = {
  profileId: string;
  query: string;
  models: AiProviderModelSettings[];
  selectedModelIds: string[];
};

export type RuleEditorState = {
  editingRuleId: string | null;
  instructions: string;
  label: string;
};

export type AiSettingsActionEntry = {
  actions: readonly [AiFeatureAction, ...AiFeatureAction[]];
  description?: string;
  id: string;
  label?: string;
};

export const aiSettingsActionEntries: readonly AiSettingsActionEntry[] = [
  {
    id: "category-recognition",
    label: "分类识别",
    description: "分类识别可分别配置文本/图片来源。",
    actions: ["prompt-category", "image-category"],
  },
  {
    id: "tag-recognition",
    label: "标签识别",
    description: "标签识别可分别配置文本/图片来源。",
    actions: ["prompt-tags", "image-tags"],
  },
  { id: "prompt-optimization", actions: ["prompt-optimization"] },
  { id: "prompt-translation", actions: ["prompt-translation"] },
  { id: "image-reverse", actions: ["image-reverse"] },
  { id: "image-generation", actions: ["image-generation"] },
];

export const defaultAiSettingsActionOrder = aiSettingsActionEntries.map((entry) => entry.id);

export function normalizeAiSettingsActionOrder(input: readonly string[] | undefined): string[] {
  const knownIds = new Set(defaultAiSettingsActionOrder);
  const ordered = (input ?? []).filter((id, index, values) => knownIds.has(id) && values.indexOf(id) === index);
  const missing = defaultAiSettingsActionOrder.filter((id) => !ordered.includes(id));
  return [...ordered, ...missing];
}

export function moveItemBefore<T>(items: readonly T[], sourceIndex: number, targetIndex: number): T[] {
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex || sourceIndex >= items.length || targetIndex >= items.length) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) {
    return next;
  }

  // The target index refers to the original list. Removing an item above the
  // target shifts that target one slot to the left before insertion.
  const insertionIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(insertionIndex, 0, moved);
  return next;
}

export function resolveAiSettingsActionEntry(action: AiFeatureAction): AiSettingsActionEntry {
  return aiSettingsActionEntries.find((entry) => isAiSettingsActionEntrySelected(entry, action)) ?? aiSettingsActionEntries[0]!;
}

export function resolveAiSettingsEntryAction(entry: AiSettingsActionEntry, selectedAction: AiFeatureAction): AiFeatureAction {
  return isAiSettingsActionEntrySelected(entry, selectedAction) ? selectedAction : entry.actions[0];
}

export function isAiSettingsActionEntrySelected(entry: AiSettingsActionEntry, action: AiFeatureAction): boolean {
  return entry.actions.some((entryAction) => entryAction === action);
}

export function getAiSettingsActionEntryLabel(entry: AiSettingsActionEntry): string {
  return entry.label ?? aiFeatureActionMeta[entry.actions[0]].label;
}

export function getAiSettingsActionEntryDescription(entry: AiSettingsActionEntry): string {
  return entry.description ?? aiFeatureActionMeta[entry.actions[0]].description;
}

export function getAiActionCapabilityLabel(action: AiFeatureAction): string {
  const capability = aiFeatureActionMeta[action].capability;
  if (capability === "vision") return "图片";
  if (capability === "image-generation") return "生图";
  return "文本";
}

export function getAiActionSourceLabel(action: AiFeatureAction): string {
  if (action === "prompt-category" || action === "prompt-tags") {
    return "从提示词分析";
  }

  if (action === "image-category" || action === "image-tags") {
    return "从效果图分析";
  }

  return getAiActionCapabilityLabel(action);
}

export function getAiActionRecognitionKind(action: AiFeatureAction): AiRecognitionKind | null {
  if (action === "prompt-category" || action === "image-category") {
    return "category";
  }

  if (action === "prompt-tags" || action === "image-tags") {
    return "tags";
  }

  return null;
}

export function getAiActionRecognitionSource(action: AiFeatureAction): AiRecognitionSource | null {
  if (action === "prompt-category" || action === "prompt-tags") {
    return "prompt";
  }

  if (action === "image-category" || action === "image-tags") {
    return "image";
  }

  return null;
}

export function buildPayload({
  actionPreferences,
  actionOrder,
  activeProfileId,
  profiles,
}: {
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>;
  actionOrder?: readonly string[];
  activeProfileId: string;
  profiles: readonly AiProviderProfileDraft[];
}): SaveAiProviderSettingsPayload {
  return {
    ...(actionOrder?.length ? { actionOrder: [...actionOrder] } : {}),
    actionPreferences: normalizeActionPreferencesDraft(actionPreferences, profiles, activeProfileId),
    activeProfileId,
    profiles: profiles.map(toSaveProfilePayload),
  };
}

export function buildConnectionTestPayload({
  actionPreferences,
  activeProfileId,
  profileId,
  profiles,
}: {
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>;
  activeProfileId: string;
  profileId: string;
  profiles: readonly AiProviderProfileDraft[];
}): SaveAiProviderSettingsPayload {
  return {
    activeProfileId: profileId,
    actionPreferences: normalizeActionPreferencesDraft(actionPreferences, profiles, profileId),
    profiles: buildPayload({ actionPreferences, activeProfileId, profiles }).profiles.map((profile) =>
      profile.id === profileId ? { ...profile, enabled: true } : profile,
    ),
  };
}

export function toSaveProfilePayload(profile: AiProviderProfileDraft): SaveAiProviderProfilePayload {
  const trimmedApiKey = profile.apiKey.trim();

  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    baseUrl: normalizeAiBaseUrl(profile.baseUrl),
    model: profile.model,
    models: profile.models,
    ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
    ...(profile.clearApiKey ? { clearApiKey: true } : {}),
  };
}

export function createProfileDrafts(settings: PublicAiProviderSettings): AiProviderProfileDraft[] {
  const profiles = settings.profiles.length > 0 ? settings.profiles : [toFallbackProfile(settings)];

  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    baseUrl: profile.baseUrl,
    model: profile.model,
    models: normalizeProfileModels(profile.models, profile.model),
    hasApiKey: profile.hasApiKey,
    apiKeyPreview: profile.apiKeyPreview,
    apiKey: "",
    clearApiKey: false,
  }));
}

export function toFallbackProfile(settings: PublicAiProviderSettings): PublicAiProviderProfile {
  return {
    id: settings.activeProfileId || "default",
    name: "默认 API",
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    hasApiKey: settings.hasApiKey,
    apiKeyPreview: settings.apiKeyPreview,
    model: settings.model,
    models: normalizeProfileModels(settings.profiles[0]?.models, settings.model),
  };
}

export function createNewProfileDraft(index: number): AiProviderProfileDraft {
  const id = `api-${Date.now().toString(36)}-${index + 1}`;

  return {
    id,
    name: `API ${index + 1}`,
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    models: [
      {
        id: "gpt-4.1-mini",
        label: "gpt-4.1-mini",
        capabilities: ["text", "vision"],
      },
    ],
    hasApiKey: false,
    apiKeyPreview: "",
    apiKey: "",
    clearApiKey: false,
  };
}

export function resolveSelectedProfileId(
  preferredProfileId: string,
  profiles: readonly AiProviderProfileDraft[],
): string {
  return profiles.find((profile) => profile.id === preferredProfileId)?.id ?? profiles[0]?.id ?? "default";
}

export function resolveDraftApiKeyState(profile: AiProviderProfileDraft): { willHaveApiKey: boolean } {
  return {
    willHaveApiKey: Boolean(profile.apiKey.trim()) || (!profile.clearApiKey && profile.hasApiKey),
  };
}

export function resolveDraftApiKeyPreview(profile: AiProviderProfileDraft): string {
  if (profile.apiKey.trim()) {
    return maskApiKeyPreview(profile.apiKey);
  }

  if (profile.clearApiKey) {
    return "";
  }

  return profile.apiKeyPreview;
}

export function maskApiKeyPreview(apiKey: string): string {
  const value = apiKey.trim();

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

export function ensureProfileSelectedModel(profile: AiProviderProfileDraft): AiProviderProfileDraft {
  const selectedModelId = profile.model.trim();
  if (!selectedModelId) {
    return profile;
  }

  if (profile.models.some((model) => model.id === selectedModelId)) {
    return profile;
  }

  // Typed/current model IDs must always be part of the models list; otherwise
  // enabled profiles look complete in the UI but fail isProfileComplete forever.
  return {
    ...profile,
    models: [
      {
        id: selectedModelId,
        label: selectedModelId,
        capabilities: ["text", "vision"],
      },
      ...profile.models,
    ],
  };
}

export function isProfileComplete(profile: AiProviderProfileDraft): boolean {
  const normalized = ensureProfileSelectedModel(profile);

  return Boolean(
    normalized.baseUrl.trim() &&
      normalized.model.trim() &&
      normalized.models.some((model) => model.id === normalized.model) &&
      resolveDraftApiKeyState(normalized).willHaveApiKey,
  );
}

export function canTestProfile(profile: AiProviderProfileDraft): boolean {
  return Boolean(profile.baseUrl.trim() && profile.model.trim() && resolveDraftApiKeyState(profile).willHaveApiKey);
}

export function buildModelQueryPayload({
  profiles,
  selectedProfileId,
}: {
  profiles: readonly AiProviderProfileDraft[];
  selectedProfileId: string;
}): SaveAiProviderSettingsPayload {
  return {
    activeProfileId: selectedProfileId,
    profiles: profiles.map((profile) => ({
      ...toSaveProfilePayload(profile),
      enabled: profile.id === selectedProfileId,
      model: profile.model || profile.models[0]?.id || "gpt-4.1-mini",
    })),
  };
}

export function canQueryModels(profile: AiProviderProfileDraft): boolean {
  return Boolean(profile.baseUrl.trim() && resolveDraftApiKeyState(profile).willHaveApiKey);
}

export function addUniqueModels(
  currentModels: readonly AiProviderModelSettings[],
  nextModels: readonly AiProviderModelSettings[],
): AiProviderModelSettings[] {
  const models: AiProviderModelSettings[] = [];

  for (const model of [...currentModels, ...nextModels]) {
    const normalizedModel = normalizeModelDraft(model);

    if (!normalizedModel || models.some((item) => item.id === normalizedModel.id)) {
      continue;
    }

    models.push(normalizedModel);
  }

  return models.length > 0 ? models : normalizeProfileModels([], "gpt-4.1-mini");
}

export function normalizeProfileModels(input: unknown, fallbackModelId: string): AiProviderModelSettings[] {
  const values = Array.isArray(input) ? input : [];
  const models = values
    .map(normalizeModelDraft)
    .filter((model): model is AiProviderModelSettings => model !== null);
  const fallbackModel = fallbackModelId.trim() || "gpt-4.1-mini";

  if (!models.some((model) => model.id === fallbackModel)) {
    models.unshift({
      id: fallbackModel,
      label: fallbackModel,
      capabilities: ["text", "vision"],
    });
  }

  return addUniqueModels([], models).slice(0, 80);
}

export function normalizeModelDraft(input: unknown): AiProviderModelSettings | null {
  if (typeof input === "string") {
    const id = input.trim();

    return id ? { id, label: id, capabilities: ["text"] } : null;
  }

  if (!isRecord(input)) {
    return null;
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";

  if (!id) {
    return null;
  }

  return {
    id,
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : id,
    capabilities: normalizeCapabilities(input.capabilities),
  };
}

export function normalizeCapabilities(input: unknown): AiProviderModelCapability[] {
  const capabilities = Array.isArray(input)
    ? input.filter((capability): capability is AiProviderModelCapability =>
        capability === "text" || capability === "vision" || capability === "image-generation",
      )
    : [];

  return capabilities.length > 0 ? [...new Set(capabilities)] : ["text"];
}

export function toggleCapability(
  capabilities: readonly AiProviderModelCapability[],
  capability: AiProviderModelCapability,
): AiProviderModelCapability[] {
  const capabilitySet = new Set(capabilities);

  if (capabilitySet.has(capability)) {
    capabilitySet.delete(capability);
  } else {
    capabilitySet.add(capability);
  }

  return capabilitySet.size > 0 ? [...capabilitySet] : [capability];
}

export function toggleStringSelection(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function normalizeModelSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff._/-]+/g, "");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}