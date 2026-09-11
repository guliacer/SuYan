import type {
  AiAnalyzePromptData,
  AiImageGenerationData,
  RemotePromptAnalysisV2,
  AiImageGenerationPayload,
  AiFeatureAction,
  AiAnalyzePromptPayload,
  AiPreparePromptEntryData,
  AiPreparePromptEntryPayload,
  AiListProviderModelsData,
  AiOptimizePromptData,
  AiOptimizePromptPayload,
  AiReverseImagePromptData,
  AiReverseImagePromptPayload,
  AiSettingsTestData,
  AiSummarizePromptTitleData,
  AiSummarizePromptTitlePayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import type { PromptType } from "../../../src/features/prompts/types";
import { extractPromptVariables } from "../../../src/features/prompts/utils/promptVariables";
import { derivePromptTitle } from "../../../src/features/prompts/utils/promptClipboardParser";
import { detectAccountType } from "../../../src/features/prompts/utils/promptAccount";
import { classifyPromptContent } from "../../../src/features/prompts/utils/promptClassification";
import { isCommandPrompt } from "../../../src/features/prompts/utils/promptRichText";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import {
  readPrivateAiProviderSettings,
  resolveAiProviderSettingsForPayload,
  writeAiProviderSettings,
} from "./aiSettingsStore";
import {
  resolveAiActionCustomInstructions,
  resolveAiProviderProfileForAction,
} from "./aiSettingsModel";
import {
  analyzePromptRemotely,
  generateImagesWithRemoteApi,
  generateVideosWithRemoteApi,
  isAgnesBaseUrl,
  listRemoteModels,
  optimizePromptRemotely,
  reverseImagePromptRemotely,
  summarizeTitleRemotely,
  testRemoteConnection,
  translatePromptRemotely,
} from "./remoteAiClient";

export async function analyzePromptWithRemoteAi(
  payload: AiAnalyzePromptPayload,
): Promise<AiAnalyzePromptData> {
  if (!isAnalyzePayload(payload)) {
    throw new AppError("AI_ANALYZE_PAYLOAD_INVALID", "AI 分析参数不合法。");
  }

  const settings = await readPrivateAiProviderSettings();
  const selectedProfileId = payload.apiProfileId ?? settings.actionPreferences[payload.target]?.profileId;
  const selectedModelId = payload.apiModelId ?? settings.actionPreferences[payload.target]?.modelId;

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
    prompt: await optimizePromptRemotely(
      runtime.settings,
      payload.prompt,
      runtime.customInstructions,
      payload.promptKind,
    ),
  };
}

export async function summarizePromptTitleWithRemoteAi(
  payload: AiSummarizePromptTitlePayload,
): Promise<AiSummarizePromptTitleData> {
  if (!isSummarizeTitlePayload(payload)) {
    throw new AppError("AI_SUMMARIZE_TITLE_PAYLOAD_INVALID", "AI 标题总结参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "prompt-optimization",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  return {
    title: await summarizeTitleRemotely(runtime.settings, payload.prompt, runtime.customInstructions),
  };
}

/** 统一的新建提示词归档管线；远程 AI 的任何单项失败都会降级为本地结果。 */
export async function preparePromptEntryWithAi(
  payload: AiPreparePromptEntryPayload,
): Promise<AiPreparePromptEntryData> {
  if (!isPreparePromptEntryPayload(payload)) {
    throw new AppError("AI_PREPARE_PROMPT_PAYLOAD_INVALID", "提示词自动整理参数不合法。");
  }

  const prompt = payload.prompt.trim();
  const categories = payload.knownCategories;
  const warnings: string[] = [];
  const local = createLocalPromptEntryData(prompt, categories);
  const base = {
    title: local.title,
    description: local.description,
    categoryId: local.categoryId,
    categoryName: local.categoryName,
    categoryConfidence: local.categoryConfidence,
    tagIds: local.tagIds,
    variables: local.variables,
    type: local.type,
    confidence: 0.35,
    source: "local" as const,
    warnings,
  };
  // 终端命令属于可直接执行的原始内容，不调用标题/分类/标签生成链路，
  // 避免把命令文档改写成说明性文本。
  if (isCommandPrompt(prompt) && local.type === "text") {
    return base;
  }

  const categoryPayload: AiAnalyzePromptPayload = {
    target: "prompt-category",
    apiProfileId: payload.apiProfileId,
    apiModelId: payload.apiModelId,
    customInstructions: payload.customInstructions,
    title: "",
    prompt,
    negativePrompt: "",
    tags: [],
    category: "",
    knownCategories: categories.map((category) => category.name),
  };
  const tagsPayload: AiAnalyzePromptPayload = { ...categoryPayload, target: "prompt-tags" };
  const [categoryResult, tagsResult, titleResult] = await Promise.allSettled([
    analyzePromptWithRemoteAi(categoryPayload),
    analyzePromptWithRemoteAi(tagsPayload),
    summarizePromptTitleWithRemoteAi({
      prompt,
      apiProfileId: payload.apiProfileId,
      apiModelId: payload.apiModelId,
      customInstructions: payload.customInstructions,
    }),
  ]);

  let source: "ai" | "local" = "local";
  if (titleResult.status === "fulfilled" && titleResult.value.title.trim()) {
    base.title = clampTitle(titleResult.value.title);
    source = "ai";
  } else {
    warnings.push("标题未能通过 AI 整理，已使用本地标题。");
  }
  if (categoryResult.status === "fulfilled") {
    const candidate = [...categoryResult.value.analysis.categories]
      .sort((a, b) => b.confidence - a.confidence)
      .find((item) => categories.some((category) => category.name === item.label || category.id === item.categoryId));
    if (candidate) {
      const matched = categories.find((category) => category.id === candidate.categoryId || category.name === candidate.label);
      if (matched) {
        base.categoryId = matched.id;
        base.categoryName = matched.name;
        base.categoryConfidence = clampConfidence(candidate.confidence);
        source = "ai";
      }
    }
    const summary = categoryResult.value.analysis.summary.trim();
    if (summary) base.description = summary.slice(0, 240);
  } else {
    warnings.push("分类和说明未能通过 AI 整理，已使用本地结果。");
  }
  if (tagsResult.status === "fulfilled") {
    base.tagIds = normalizeTags(tagsResult.value.analysis.tags.map((tag) => tag.normalizedLabel || tag.label));
    source = "ai";
  } else {
    warnings.push("标签未能通过 AI 整理，已使用本地结果。");
  }
  base.confidence = source === "ai" ? 0.8 : 0.35;
  base.warnings = warnings;
  return { ...base, source };
}

function isPreparePromptEntryPayload(input: unknown): input is AiPreparePromptEntryPayload {
  return isRecord(input) && typeof input.prompt === "string" && input.prompt.trim().length > 0 &&
    Array.isArray(input.knownCategories) && input.knownCategories.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.name === "string") &&
    isOptionalString(input.apiProfileId) && isOptionalString(input.apiModelId) && isOptionalString(input.customInstructions);
}

function createLocalPromptEntryData(prompt: string, categories: AiPreparePromptEntryPayload["knownCategories"]): AiPreparePromptEntryData {
  const lower = prompt.toLocaleLowerCase();
const type: PromptType = /视频|video|镜头运动|时长|秒/.test(lower) ? "video"
    : /工作流|workflow|comfyui|节点/.test(lower) ? "workflow"
    : /api.key|api_key|apikey|endpoint|base.url|base_url|大模型|大语言模型|llm|openai|claude|deepseek|gemini|groq|通义千问|文心一言|glm|模型配置|密钥|api接口|接口配置|端点配置|sk-[a-zA-Z\d]|bearer|token\s*[:=]/.test(lower) ? "api-config"
    : /邮箱|email|smtp|imap|pop3|邮件|mail|@.*\.com/.test(lower) ? "email-config"
    : /写一篇|文章|代码|函数|翻译|总结|write|code|translate/.test(lower) ? "text" : "image";
  const matched = categories.find((category) => /摄影|portrait|photo|cinematic|镜头|画面/.test(category.name) && /人像|portrait|摄影|photo|镜头|cinematic/.test(lower));
  const localClassification = classifyPromptContent(prompt);
  return { type: localClassification.type || type, title: localClassification.title || derivePromptTitle(prompt), description: "", categoryId: matched?.id, categoryName: matched?.name, categoryConfidence: matched ? 0.45 : undefined, tagIds: [], variables: extractPromptVariables(prompt), confidence: 0.35, source: "local", warnings: [] };
}

function clampTitle(input: string): string {
  return input.replace(/[\r\n"“”「」。，、.!！?？:：]+/g, " ").trim().slice(0, 50) || "未命名提示词";
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 10);
}

function clampConfidence(input: number): number {
  return Number.isFinite(input) ? Math.max(0, Math.min(1, input)) : 0;
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


export async function generateImagesWithRemoteAi(
  payload: AiImageGenerationPayload,
): Promise<AiImageGenerationData> {
  if (!isImageGenerationPayload(payload)) {
    throw new AppError("AI_IMAGE_GENERATION_PAYLOAD_INVALID", "图像生成参数不合法。");
  }

  const runtime = await resolveAiRuntimeSettings(
    "image-generation",
    payload.apiProfileId,
    payload.apiModelId,
    payload.customInstructions,
  );

  const startedAt = Date.now();
  const notifyEnabled = payload.notificationEnabled === true;
  // Keep the route correct even for older renderer payloads that predate the
  // explicit mediaType field. Agnes video model IDs are unambiguous and must
  // never be sent to /v1/images/generations.
  const isVideo = payload.mediaType === "video" || isAgnesVideoModel(runtime.settings.model);
  try {
    const data = isVideo
      ? await generateVideosWithRemoteApi(runtime.settings, payload, runtime.customInstructions)
      : isAgnesBaseUrl(runtime.settings.baseUrl)
      ? await generateImagesWithRemoteApi(
          runtime.settings,
          payload,
          runtime.customInstructions,
          (endpoint) => persistResolvedImageEndpoint(runtime.settings.id, endpoint),
        )
      : await generateImagesWithRemoteApi(
          runtime.settings,
          payload,
          runtime.customInstructions,
        );
    const durationMs = Date.now() - startedAt;
    const promptPreview = truncateText(payload.prompt, 60);
    if (notifyEnabled) {
      const message =
        `${isVideo ? "视频" : "图像"}生成完成（${data.model}）\n` +
        `耗时 ${(durationMs / 1000).toFixed(1)} 秒，共 ${data.images.length} 个\n` +
        `提示词：${promptPreview}`;
      void notifyTapRelay(message, {
        event: isVideo ? "video-generation-success" : "image-generation-success",
        status: "completed",
        taskId: `image-generation-${startedAt}`,
        durationMs,
        model: data.model,
        imageCount: data.images.length,
        prompt: promptPreview,
      });
    }
    return data;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorCode = error instanceof AppError ? error.code : "AI_IMAGE_GENERATION_FAILED";
    const errorMessage = error instanceof Error ? error.message : String(error);
    const promptPreview = truncateText(payload.prompt, 60);
    if (notifyEnabled) {
      const message =
        `${isVideo ? "视频" : "图像"}生成失败（${errorCode}）\n` +
        `耗时 ${(durationMs / 1000).toFixed(1)} 秒\n` +
        `错误：${truncateText(errorMessage, 120)}\n` +
        `提示词：${promptPreview}`;
      void notifyTapRelay(message, {
        event: isVideo ? "video-generation-failed" : "image-generation-failed",
        status: "failed",
        taskId: `image-generation-${startedAt}`,
        durationMs,
        errorCode,
        error: truncateText(errorMessage, 200),
        prompt: promptPreview,
      });
    }
    throw error;
  }
}

/** Persist a successfully discovered Agnes image endpoint without changing the
 * user's selected model, action preferences, or encrypted API key. */
async function persistResolvedImageEndpoint(profileId: string, endpoint: string): Promise<void> {
  const current = await readPrivateAiProviderSettings();
  const target = current.profiles.find((profile) => profile.id === profileId);
  if (!target || target.baseUrl.trim().replace(/\/+$/, "") === endpoint.trim().replace(/\/+$/, "")) {
    return;
  }

  await writeAiProviderSettings({
    activeProfileId: current.activeProfileId,
    ...(current.actionOrder?.length ? { actionOrder: current.actionOrder } : {}),
    actionPreferences: current.actionPreferences,
    recognitionSourcePreferences: current.recognitionSourcePreferences,
    profiles: current.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled,
      baseUrl: profile.id === profileId ? endpoint : profile.baseUrl,
      model: profile.model,
      models: profile.models,
    })),
  });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

const tapRelayHookUrl = "http://localhost:1122/send";
const tapRelayHookTimeoutMs = 3_000;

async function notifyTapRelay(
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tapRelayHookTimeoutMs);
  const logContext = sanitizeTapRelayLogContext(context);
  try {
    const response = await fetch(tapRelayHookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        source: "suyan",
        status: typeof context.status === "string" ? context.status : "completed",
        taskId: typeof context.taskId === "string" ? context.taskId : `suyan-${Date.now()}`,
        cwd: process.cwd(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn("ai", "tap-relay-hook-non-ok", {
        ...logContext,
        httpStatus: response.status,
      });
    } else {
      logger.info("ai", "tap-relay-hook-sent", {
        ...logContext,
        httpStatus: response.status,
      });
    }
  } catch (error) {
    logger.warn("ai", "tap-relay-hook-failed", {
      error: error instanceof Error ? error.message : String(error),
      ...logContext,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeTapRelayLogContext(context: Record<string, unknown>): Record<string, unknown> {
  const safeKeys = [
    "durationMs",
    "errorCode",
    "event",
    "imageCount",
    "model",
    "status",
    "taskId",
  ] as const;
  return Object.fromEntries(
    safeKeys.flatMap((key) => context[key] === undefined ? [] : [[key, context[key]]]),
  );
}

export async function testAiProviderSettings(
  payload: SaveAiProviderSettingsPayload,
): Promise<AiSettingsTestData> {
  return testRemoteConnection(await resolveAiProviderSettingsForPayload(payload));
}

export async function listAiProviderModels(
  payload: SaveAiProviderSettingsPayload,
): Promise<AiListProviderModelsData> {
  return { models: await listRemoteModels(await resolveAiProviderSettingsForPayload(payload)) };
}


function isImageGenerationPayload(input: unknown): input is AiImageGenerationPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    (input.mediaType === undefined || input.mediaType === "image" || input.mediaType === "video") &&
    input.prompt.trim().length > 0 &&
    isOptionalString(input.negativePrompt) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalStringArray(input.referenceImageFileNames) &&
    isOptionalStringArray(input.referenceImageDataUrls) &&
    isOptionalString(input.doubaoModel) &&
    isOptionalString(input.doubaoStyle) &&
    (input.generationProvider === undefined ||
      input.generationProvider === "api" ||
      input.generationProvider === "doubao-web") &&
    (input.size === undefined || isImageGenerationSize(input.size)) &&
    (input.ratio === undefined || isImageGenerationRatio(input.ratio)) &&
    (input.quality === undefined || input.quality === "auto" || input.quality === "low" || input.quality === "medium" || input.quality === "high") &&
    (input.outputFormat === undefined || input.outputFormat === "png" || input.outputFormat === "jpeg" || input.outputFormat === "webp") &&
    (input.background === undefined || input.background === "auto" || input.background === "opaque" || input.background === "transparent") &&
    (input.notificationEnabled === undefined || typeof input.notificationEnabled === "boolean") &&
    (input.n === undefined || (typeof input.n === "number" && Number.isInteger(input.n) && input.n >= 1 && input.n <= 4))
    && (input.videoSeconds === undefined || (typeof input.videoSeconds === "number" && Number.isFinite(input.videoSeconds) && input.videoSeconds >= 1 && input.videoSeconds <= 30))
    && (input.videoSize === undefined || input.videoSize === "720P" || input.videoSize === "960P" || input.videoSize === "2K")
  );
}

function isImageGenerationSize(input: unknown): input is AiImageGenerationPayload["size"] {
  if (input === "auto") {
    return true;
  }
  if (typeof input !== "string") {
    return false;
  }

  const match = /^(\d{3,4})x(\d{3,4})$/.exec(input);
  if (!match) {
    return false;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  // Agnes 4K landscape/portrait tiers reach 6272x2688 and 2944x5248.
  return width >= 256 && width <= 8192 && height >= 256 && height <= 8192;
}

function isImageGenerationRatio(input: unknown): input is NonNullable<AiImageGenerationPayload["ratio"]> {
  return input === "1:1" || input === "3:4" || input === "4:3" || input === "16:9" ||
    input === "9:16" || input === "2:3" || input === "3:2" || input === "21:9";
}

function isAnalyzePayload(input: unknown): input is AiAnalyzePromptPayload {
  return (
    isRecord(input) &&
    isAnalyzeTarget(input.target) &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
    isOptionalString(input.customInstructions) &&
    typeof input.title === "string" &&
    isAnalyzeImagePayloadBoundaryValid(input.target, input.imageFileName) &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    typeof input.category === "string" &&
    (input.knownCategories === undefined ||
      (Array.isArray(input.knownCategories) && input.knownCategories.every((category) => typeof category === "string")))
  );
}

function isAnalyzeImagePayloadBoundaryValid(target: AiAnalyzePromptPayload["target"], imageFileName: unknown): boolean {
  if (
    target === "prompt-category" ||
    target === "prompt-tags"
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

function isOptionalStringArray(input: unknown): boolean {
  return (
    input === undefined ||
    (Array.isArray(input) && input.every((value) => typeof value === "string"))
  );
}

function isOptimizePayload(input: unknown): input is AiOptimizePromptPayload {
  return (
    isRecord(input) &&
    typeof input.prompt === "string" &&
    (input.promptKind === undefined || input.promptKind === "positive" || input.promptKind === "negative") &&
    isOptionalString(input.apiProfileId) &&
    isOptionalString(input.apiModelId) &&
    isOptionalString(input.customInstructions)
  );
}

function isSummarizeTitlePayload(input: unknown): input is AiSummarizePromptTitlePayload {
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
    isOptionalString(input.customInstructions) &&
    isOptionalString(input.referenceImageFileName) &&
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

function isAgnesVideoModel(model: string): boolean {
  return /^agnes-video-(?:v2\.0|2\.5(?:-flash)?)$/i.test(model.trim());
}
