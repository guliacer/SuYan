import type {
  AiActionPreference,
  AiFeatureAction,
  AiModelSelection,
  AiProviderModelSettings,
  AiProviderKind,
  AiRecognitionSourcePreferences,
  AiRulePreset,
  PublicAiProviderSettings,
  SaveAiProviderProfilePayload,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import {
  AI_RULE_INSTRUCTIONS_MAX_LENGTH,
  aiFeatureActionMeta,
  aiFeatureActions,
  normalizeAiRecognitionSourcePreferences,
  normalizeAiActionRules,
  normalizeAiRulePresetIds,
  resolveAiActionRules,
} from "../types/ai";

export type AiActionProfileDraft = {
  id: string;
  name: string;
  enabled: boolean;
  provider?: AiProviderKind;
  baseUrl: string;
  model: string;
  models: AiProviderModelSettings[];
};

export const nsfwAiAction: AiFeatureAction = "image-safety";
export const aiSettingsGeneralActions = aiFeatureActions.filter((action) => action !== nsfwAiAction);

export type AiActionModelSelection = AiModelSelection;

/**
 * Apply the quick-switch provider/model selection to the persistent action preference.
 * Existing rule presets and custom instructions for the action must remain untouched.
 */
export function updateAiActionModelPreference(
  settings: PublicAiProviderSettings,
  action: AiFeatureAction,
  selection: AiActionModelSelection,
): PublicAiProviderSettings | null {
  const profile = settings.profiles.find(
    (candidate) => candidate.id === selection.profileId && candidate.enabled,
  );
  const model = profile?.models.find(
    (candidate) =>
      candidate.id === selection.modelId &&
      candidate.capabilities.includes(aiFeatureActionMeta[action].capability),
  );

  if (!profile || !model) {
    return null;
  }

  const nextPreference = { ...settings.actionPreferences[action] };
  delete nextPreference.source;
  nextPreference.profileId = profile.id;
  nextPreference.modelId = model.id;

  return {
    ...settings,
    actionPreferences: {
      ...settings.actionPreferences,
      [action]: nextPreference,
    },
  };
}

export function buildPublicAiSettingsPayload(
  settings: PublicAiProviderSettings,
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>,
  recognitionSourcePreferences: AiRecognitionSourcePreferences = settings.recognitionSourcePreferences,
): SaveAiProviderSettingsPayload {
  return {
    activeProfileId: settings.activeProfileId,
    ...(settings.actionOrder?.length ? { actionOrder: settings.actionOrder } : {}),
    actionPreferences,
    recognitionSourcePreferences: normalizeAiRecognitionSourcePreferences(recognitionSourcePreferences),
    profiles: settings.profiles.map(toPublicProfilePayload),
  };
}

export function normalizeActionPreferencesDraft(
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>,
  profiles: readonly AiActionProfileDraft[],
  activeProfileId: string,
): Partial<Record<AiFeatureAction, AiActionPreference>> {
  const normalizedPreferences: Partial<Record<AiFeatureAction, AiActionPreference>> = {};

  for (const action of aiFeatureActions) {
    const preference = normalizeActionPreferenceDraft(actionPreferences[action], profiles, activeProfileId, action);

    if (Object.keys(preference).length > 0) {
      normalizedPreferences[action] = preference;
    }
  }

  return normalizedPreferences;
}

export function normalizeActionPreferenceDraft(
  preference: AiActionPreference | undefined,
  profiles: readonly AiActionProfileDraft[],
  activeProfileId: string,
  action: AiFeatureAction,
): AiActionPreference {
  const meta = aiFeatureActionMeta[action];

  const fallbackProfile =
    profiles.find(
      (profile) =>
        profile.id === activeProfileId &&
        profile.models.some((model) => model.capabilities.includes(meta.capability)),
    ) ?? profiles.find((profile) => profile.models.some((model) => model.capabilities.includes(meta.capability))) ?? profiles[0];
  const preferredProfile = preference?.profileId
    ? profiles.find((profile) => profile.id === preference.profileId)
    : null;
  const profile = preferredProfile?.models.some((model) => model.capabilities.includes(meta.capability))
    ? preferredProfile
    : fallbackProfile;
  const compatibleModels = profile?.models.filter((model) => model.capabilities.includes(meta.capability)) ?? [];
  const preferredModel = preference?.modelId
    ? compatibleModels.find((model) => model.id === preference.modelId)
    : null;
  const fallbackModel = compatibleModels.find((model) => model.id === profile?.model) ?? compatibleModels[0];
  const hasRules = Array.isArray(preference?.rules);
  const rules = hasRules ? normalizeAiActionRules(action, preference?.rules) : undefined;
  const rulePresetIds = normalizeAiRulePresetIds(action, preference?.rulePresetIds, rules);
  const customInstructions = preference?.customInstructions?.trim().slice(0, AI_RULE_INSTRUCTIONS_MAX_LENGTH) ?? "";
  const normalizedPreference: AiActionPreference = {};

  if (profile) {
    normalizedPreference.profileId = profile.id;
  }

  if (preferredModel ?? fallbackModel) {
    normalizedPreference.modelId = (preferredModel ?? fallbackModel)?.id;
  }

  if (hasRules) {
    normalizedPreference.rules = rules;
  }

  if (rulePresetIds.length > 0) {
    normalizedPreference.rulePresetIds = rulePresetIds;
  }

  if (customInstructions) {
    normalizedPreference.customInstructions = customInstructions;
  }

  return normalizedPreference;
}

export function resolveActionRulesForDraft(
  action: AiFeatureAction,
  preference: AiActionPreference | undefined,
): AiRulePreset[] {
  const rules = resolveAiActionRules(action, preference);
  const customInstructions = preference?.customInstructions?.trim();

  if (Array.isArray(preference?.rules) || !customInstructions) {
    return rules;
  }

  return [
    ...rules,
    {
      id: "custom-instructions",
      label: "自定义规则",
      instructions: customInstructions,
    },
  ];
}

function toPublicProfilePayload(profile: AiActionProfileDraft): SaveAiProviderProfilePayload {
  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    ...(profile.provider ? { provider: profile.provider } : {}),
    baseUrl: profile.baseUrl,
    model: profile.model,
    models: profile.models,
  };
}
