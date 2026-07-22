import type {
  AiAnalyzePromptData,
  AiFeatureAction,
  AiAnalyzePromptPayload,
  AiListProviderModelsData,
  AiOptimizePromptData,
  AiOptimizePromptPayload,
  AiReverseImagePromptData,
  AiReverseImagePromptPayload,
  AiSettingsTestData,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import { AppError } from "../ipc/errors";
import { readPrivateAiProviderSettings, resolveAiProviderSettingsForPayload } from "./aiSettingsStore";
import {
  resolveAiActionCustomInstructions,
  resolveAiProviderProfileForAction,
} from "./aiSettingsModel";
import {
  analyzePromptRemotely,
  listOpenAiCompatibleModels,
  optimizePromptRemotely,
  reverseImagePromptRemotely,
  testOpenAiCompatibleConnection,
  translatePromptRemotely,
} from "./remoteAiClient";

export async function analyzePromptWithRemoteAi(
  payload: AiAnalyzePromptPayload,
): Promise<AiAnalyzePromptData> {
  if (!isAnalyzePayload(payload)) {
    throw new AppError("AI_ANALYZE_PAYLOAD_INVALID", "AI 分析参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    payload.target,
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );
  const analysis = await analyzePromptRemotely(runtime.settings, {
    ...payload,
    customInstructions: runtime.customInstructions,
  });

  return { analysis };
}

export async function optimizePromptWithRemoteAi(
  payload: AiOptimizePromptPayload,
): Promise<AiOptimizePromptData> {
  if (!isOptimizePayload(payload)) {
    throw new AppError("AI_OPTIMIZE_PAYLOAD_INVALID", "AI 优化参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "prompt-optimization",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return {
    prompt: await optimizePromptRemotely(runtime.settings, payload.prompt, runtime.customInstructions),
  };
}

export async function translatePromptWithRemoteAi(
  payload: AiTranslatePromptPayload,
): Promise<AiTranslatePromptData> {
  if (!isTranslatePayload(payload)) {
    throw new AppError("AI_TRANSLATE_PAYLOAD_INVALID", "AI 翻译参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "prompt-translation",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return translatePromptRemotely(runtime.settings, payload, runtime.customInstructions);
}

export async function reverseImagePromptWithRemoteAi(
  payload: AiReverseImagePromptPayload,
): Promise<AiReverseImagePromptData> {
  if (!isReverseImagePayload(payload)) {
    throw new AppError("AI_REVERSE_IMAGE_PAYLOAD_INVALID", "图像反推参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "image-reverse",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return {
    prompt: await reverseImagePromptRemotely(runtime.settings, payload, runtime.customInstructions),
  };
}

export async function testAiProviderSettings(
  payload: SaveAiProviderSettingsPayload,
): Promise<AiSettingsTestData> {
  return testOpenAiCompatibleConnection(await resolveAiProviderSettingsForPayload(payload));
}

export async function listAiProviderModels(
  payload: SaveAiProviderSettingsPayload,
): Promise<AiListProviderModelsData> {
  return { models: await listOpenAiCompatibleModels(await resolveAiProviderSettingsForPayload(payload)) };
}

function isAnalyzePayload(input: unknown): input is AiAnalyzePromptPayload {
  return (
    isRecord(input) &&
    isAnalyzeTarget(input.target) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    typeof input.title === "string" &&
    isAnalyzeImagePayloadBoundaryValid(input.target, input.imageFileName) &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    typeof input.category === "string" &&
    (input.knownCategories === undefined ||
      (Array.isArray(input.knownCategories) && input.knownCategories.every((category) => typeof category === "string"))) &&
    isOptionalString(input.optionVariable) &&
    isOptionalString(input.optionLabel) &&
    isOptionalString(input.optionValue)
  );
}

function isAnalyzeImagePayloadBoundaryValid(target: AiAnalyzePromptPayload["target"], imageFileName: unknown): boolean {
  if (
    target === "prompt" ||
    target === "prompt-category" ||
    target === "prompt-tags" ||
    target === "prompt-options"
  ) {
    return imageFileName === undefined || imageFileName === "";
  }

  return typeof imageFileName === "string" && imageFileName.trim().length > 0;
}

function isAnalyzeTarget(input: unknown): input is AiAnalyzePromptPayload["target"] {
  return (
    input === "prompt" ||
    input === "prompt-category" ||
    input === "prompt-tags" ||
    input === "prompt-options" ||
    input === "image-category" ||
    input === "image-tags" ||
    input === "image-safety"
  );
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function isOptimizePayload(input: unknown): input is AiOptimizePromptPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions)
  );
}

function isTranslatePayload(input: unknown): input is AiTranslatePromptPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    (input.negativePrompt === undefined || typeof input.negativePrompt === "string") &&
    (input.sourceLanguage === undefined ||
      input.sourceLanguage === "auto" ||
      input.sourceLanguage === "zh" ||
      input.sourceLanguage === "en") &&
    (input.targetLanguage === "zh" || input.targetLanguage === "en") &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions)
  );
}

function isReverseImagePayload(input: unknown): input is AiReverseImagePromptPayload {
  return (
    isRecord(input) &&
    isOptionalString(input.imageFileName) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions)
  );
}

async function resolveAiRuntimeSettings(
  action: AiFeatureAction,
  profileId?: string,
  modelId?: string,
  customInstructions?: string,
) {
  const settings = await readPrivateAiProviderSettings();

  return {
    customInstructions: resolveAiActionCustomInstructions(settings, action, customInstructions),
    settings: resolveAiProviderProfileForAction(settings, action, profileId, modelId),
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
