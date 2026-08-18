import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AiAnalyzePromptPayload,
  AiImageGenerationData,
  AiImageGenerationPayload,
  AiOptimizePromptPayload,
  AiProviderModelSettings,
  AiProviderSettings,
  AiReverseImagePromptPayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  RemotePromptAnalysis,
  RemotePromptAnalysisV2,
} from "../../../src/features/library/types/ai";
import {
  photographyCategoryGroups,
  photographyCategoryLabels,
} from "../../../src/features/library/utils/photographyCategories";
import {
  normalizeRemotePromptAnalysisV2,
  remoteAnalysisV2FromLegacy,
} from "../../../src/features/library/utils/remoteAnalysisV2";
import { AppError } from "../ipc/errors";
import { resolveLibraryMediaPath } from "../library/mediaLookup";
import { getSharp } from "../runtime/imageRuntime";

const requestTimeoutMs = 20_000;
const analysisRequestTimeoutMs = 24_000;
const generationRequestTimeoutMs = 45_000;
const titleSummaryRequestTimeoutMs = 30_000;
// 图像生成（含图生图）通常需要 30-120 秒，部分高画质模型更长；
// 文本类操作（优化/翻译/反推）继续使用 generationRequestTimeoutMs 保持快速失败。
const imageGenerationRequestTimeoutMs = 320_000;
// 推理型模型（如 glm-5.2、deepseek-v4-pro 思考系）会把大量补全预算耗在内部推理上，
// 分类/标签这类结构化任务因此需要更宽裕的超时，否则频繁 finish_reason:length（空内容）或直接超时。
// 这些值只是上限：快速响应仍立即返回，仅慢推理才用满预算。
const reasoningCategoryTimeoutMs = 90_000;
const reasoningTagsTimeoutMs = 75_000;
// 兜底重试的最后时限：重试会大幅放宽 max_tokens，需要更长时间让推理跑完再吐出结构化 JSON。
const reasoningRetryTimeoutMs = 120_000;
const maxReferenceImageBytes = 50 * 1024 * 1024;
const maxRetries = 1;
// 图像生成链路更易遇到 “other side closed” 等瞬时网络错误，
// 单次重试在长耗时请求下成功率高，且仍受 imageGenerationRequestTimeoutMs 总截止时间约束。
const imageGenerationMaxRetries = 2;
const retryBaseDelayMs = 400;
const maxVisionImageBytes = 8 * 1024 * 1024;
const maxVisionInlineOriginalBytes = 768 * 1024;
const visionThumbnailMaxSize = 960;
const visionThumbnailQuality = 72;
const safetyVisionThumbnailMaxSize = 640;
const safetyVisionThumbnailQuality = 65;
const tagsVisionThumbnailMaxSize = 768;
const tagsVisionThumbnailQuality = 70;
// 分类识别对画面细节最敏感（古风写真 vs 人物艺术、厚涂插画 vs 写实 CG 都靠材质与笔触区分），
// 因此比标签/安全分级保留更高的分辨率与画质。
const categoryVisionThumbnailMaxSize = 1024;
const categoryVisionThumbnailQuality = 82;
const reliablePromptOptimizationSystemContent = [
  "你是图像生成提示词优化器。任务：把用户输入改写成更清晰、更稳定、可直接用于图像或视频生成模型的提示词正文。",
  "只输出优化后的提示词正文，不输出解释、标题、Markdown、参数胶囊、JSON 或多个版本。",
  "只优化用户提供的当前文本提示词，不读取、不反推、不描述效果图、参考图或历史图片内容。",
  "必须保留原始核心主体、题材方向、用途、文字内容和明确限制；不得新增无关主体或改变图片类型。",
  "按题材自适应补齐必要控制：作品类型/风格、核心主体、主体细节、场景空间、构图画幅、镜头视角、光影色彩、材质细节、质量与负面约束。",
  "人像不要套产品规则；产品/食品不要套人像情绪；插画/3D/概念艺术不要误写成真实摄影；视频必须包含主体、场景、运动、镜头运动和风格。",
  "短提示词输出 2-3 个自然段，复杂提示词输出 4-6 个自然段。段落之间用空行分隔，段内使用自然语言长句。",
  "输出正文首尾必须干净：不得以逗号、顿号、句号、冒号、分号、项目符号、破折号、序号或其它孤立符号开头或结尾。",
].join("\n");
const promptTranslationSystemContent = [
  "你是图像与视频生成提示词翻译器。任务：把用户提供的提示词忠实翻译成目标语言。",
  "只做翻译，不做优化、扩写、总结、删减或重排。必须保留原始提示词的生成意图、视觉元素、参数顺序、换行层次和正负向提示词边界。",
  "保留 LoRA、Checkpoint、模型名、权重括号、变量占位符、URL、品牌名、文件名、比例参数、特殊符号和代码样式参数，不要意译破坏。",
  "只返回 JSON 对象，字段必须为 prompt 和 negativePrompt。没有负向提示词时 negativePrompt 返回空字符串。",
].join("\n");
function logAiEvent(level: "info" | "warn" | "error", event: string, details: Record<string, unknown> = {}): void {
  void import("../appLogger")
    .then(({ logger }) => {
      if (level === "error") {
        logger.error("ai", event, details);
        return;
      }

      if (level === "warn") {
        logger.warn("ai", event, details);
        return;
      }

      logger.info("ai", event, details);
    })
    .catch(() => undefined);
}


export type VisionImagePayloadPolicy = {
  useOriginal: boolean;
  useThumbnail: boolean;
  thumbnailMaxSize: number;
  thumbnailQuality: number;
};

export async function analyzePromptRemotely(
  settings: AiProviderSettings,
  payload: AiAnalyzePromptPayload,
): Promise<RemotePromptAnalysisV2> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();
  const budget = getAnalysisRequestBudget(payload.target);

  try {
    const bodyReadyAt = Date.now();
    const body = await buildAnalysisBody(settings, payload);
    let response = await requestChatCompletions(settings, body, true, budget.timeoutMs);
    let parsedAnalysis: RemotePromptAnalysisV2;
    try {
      const content = readAssistantContent(response);
      parsedAnalysis = parseRemotePromptAnalysisV2Content(content);
    } catch (contentError) {
      // 以下两种情况都会触发重试：
      // 1. 某些模型对 response_format: json_object 支持不佳，返回 200 但 content 为 null。
      // 2. max_tokens 不足导致 finish_reason: length，content 被截断为空或无效 JSON。
      // 策略：去掉 response_format + 翻倍 max_tokens 重试一次。
      if (
        contentError instanceof AppError &&
        contentError.code === "AI_REMOTE_RESPONSE_INVALID"
      ) {
        const { response_format: _omit, ...bodyWithoutResponseFormat } = body;
        // 重试时大幅放宽 max_tokens 与超时，避免再次因 length 截断或超时。
        // 触发本重试的主因是推理型模型（glm/deepseek 思考系）把整份补全预算耗在内部推理上，
        // finish_reason=length 却吐回空 content。实测重试给到 6000 仍会被吃满，故进一步抬到
        // 12000 兜底、16000 上限，并用 reasoningRetryTimeoutMs 给足推理跑完再吐结构化 JSON 的
        // 时间（否则会把 length 失败换成 35s/45s 超时）；max_tokens 只是天花板，正常短响应不受影响。
        const originalMaxTokens = typeof bodyWithoutResponseFormat.max_tokens === "number"
          ? bodyWithoutResponseFormat.max_tokens
          : budget.maxTokens;
        const retryMaxTokens = Math.min(Math.max(originalMaxTokens * 2, 12_000), 16_000);
        bodyWithoutResponseFormat.max_tokens = retryMaxTokens;
        const retryTimeoutMs = Math.max(budget.timeoutMs, reasoningRetryTimeoutMs);
        logAiEvent("warn", "analyze:retry-without-response-format", {
          target: payload.target,
          reason: contentError.message,
          retryMaxTokens,
        });
        response = await requestChatCompletions(
          settings,
          bodyWithoutResponseFormat,
          false,
          retryTimeoutMs,
        );
        const retryContent = readAssistantContent(response);
        parsedAnalysis = parseRemotePromptAnalysisV2Content(retryContent);
      } else {
        throw contentError;
      }
    }
    logAiEvent("info", "analyze:done", {
      durationMs: Date.now() - startedAt,
      maxTokens: budget.maxTokens,
      ok: true,
      prepareMs: bodyReadyAt - startedAt,
      target: payload.target,
      timeoutMs: budget.timeoutMs,
    });
    return parsedAnalysis;
  } catch (error) {
    logAiEvent("error", "analyze:failed", {
      code: error instanceof AppError ? error.code : "AI_REMOTE_REQUEST_FAILED",
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
      target: payload.target,
      timeoutMs: budget.timeoutMs,
    });
    throw error;
  }
}

export async function optimizePromptRemotely(
  settings: AiProviderSettings,
  prompt: string,
  customInstructions = "",
  promptKind: AiOptimizePromptPayload["promptKind"] = "positive",
): Promise<string> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();

  try {
    const response = await requestChatCompletions(
      settings,
      {
        model: settings.model,
        messages: [
          {
            role: "system",
            content: appendCustomInstructions(
              reliablePromptOptimizationSystemContent,
              [customInstructions, buildPromptOptimizationScopeInstructions(promptKind)].filter(Boolean).join("\n\n"),
            ),
          },
          {
            role: "user",
            content: `待优化提示词：\n${prompt}`,
          },
        ],
        temperature: 0.35,
        max_tokens: 1800,
      },
      false,
      generationRequestTimeoutMs,
    );
    const content = readAssistantContent(response);
    const result = parseRemoteOptimizedPromptContent(content);
    logAiEvent("info", "optimize:done", {
      durationMs: Date.now() - startedAt,
      maxTokens: 1800,
      ok: true,
      promptChars: prompt.length,
      timeoutMs: generationRequestTimeoutMs,
    });
    return result;
  } catch (error) {
    logAiEvent("error", "optimize:failed", {
      code: error instanceof AppError ? error.code : "AI_REMOTE_REQUEST_FAILED",
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


const promptTitleSummarySystemContent = [
  "你是资深图库编辑，负责为 AI 绘画作品起标题。",
  "根据用户给出的绘画提示词，用一个简短、贴切的中文标题概括画面主题。",
  "要求：不超过 16 个汉字；突出画面主体与风格；只输出标题本身，不要引号、书名号、标点、序号或任何解释。",
].join("\n");

export async function summarizeTitleRemotely(
  settings: AiProviderSettings,
  prompt: string,
  customInstructions = "",
): Promise<string> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();

  try {
    const response = await requestChatCompletions(
      settings,
      {
        model: settings.model,
        messages: [
          {
            role: "system",
            content: appendCustomInstructions(promptTitleSummarySystemContent, customInstructions),
          },
          {
            role: "user",
            content: `提示词：\n${prompt}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 64,
      },
      false,
      titleSummaryRequestTimeoutMs,
    );
    const content = readAssistantContent(response);
    const result = parseRemotePromptTitleContent(content);
    logAiEvent("info", "summarize-title:done", {
      durationMs: Date.now() - startedAt,
      ok: true,
      promptChars: prompt.length,
    });
    return result;
  } catch (error) {
    logAiEvent("error", "summarize-title:failed", {
      code: error instanceof AppError ? error.code : "AI_REMOTE_REQUEST_FAILED",
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function parseRemotePromptTitleContent(content: string): string {
  const firstLine = stripTextFence(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
  const title = firstLine
    .replace(/^[「『"'“”《【\[]+/u, "")
    .replace(/[」』"'“”》】\]]+$/u, "")
    .replace(/^(标题|title)\s*[:：]\s*/iu, "")
    .trim()
    .slice(0, 40);

  if (!title) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 没有返回可用标题。");
  }

  return title;
}

export function buildPromptOptimizationScopeInstructions(
  promptKind: AiOptimizePromptPayload["promptKind"],
): string {
  if (promptKind !== "negative") {
    return "";
  }

  return [
    "当前输入是负向提示词，只描述生成时应避免的缺陷、元素与风格。",
    "优化时保留负向语义，合并重复项，去除互相冲突或会误伤主体的限制，不得改写成正向画面描述。",
    "只输出优化后的负向提示词正文，不添加标题、解释、Markdown 或正向提示词。",
  ].join("\n");
}


export async function translatePromptRemotely(
  settings: AiProviderSettings,
  payload: AiTranslatePromptPayload,
  customInstructions = "",
): Promise<AiTranslatePromptData> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();

  try {
    const targetLanguageLabel = payload.targetLanguage === "zh" ? "简体中文" : "English";
    const sourceLanguageLabel =
      payload.sourceLanguage === "zh" ? "简体中文" : payload.sourceLanguage === "en" ? "English" : "自动识别";
    const response = await requestChatCompletions(
      settings,
      {
        model: settings.model,
        messages: [
          {
            role: "system",
            content: appendCustomInstructions(promptTranslationSystemContent, customInstructions),
          },
          {
            role: "user",
            content: [
              `源语言：${sourceLanguageLabel}`,
              `目标语言：${targetLanguageLabel}`,
              `正向提示词：\n${payload.prompt}`,
              payload.negativePrompt ? `负向提示词：\n${payload.negativePrompt}` : "负向提示词：",
            ].join("\n\n"),
          },
        ],
        temperature: 0.15,
        max_tokens: 2200,
        response_format: { type: "json_object" },
      },
      true,
      generationRequestTimeoutMs,
    );
    const content = readAssistantContent(response);
    const result = parseRemoteTranslatedPromptContent(content);
    logAiEvent("info", "translate:done", {
      durationMs: Date.now() - startedAt,
      maxTokens: 2200,
      ok: true,
      promptChars: payload.prompt.length,
      targetLanguage: payload.targetLanguage,
      timeoutMs: generationRequestTimeoutMs,
    });
    return result;
  } catch (error) {
    logAiEvent("error", "translate:failed", {
      code: error instanceof AppError ? error.code : "AI_REMOTE_REQUEST_FAILED",
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


export async function reverseImagePromptRemotely(
  settings: AiProviderSettings,
  payload: AiReverseImagePromptPayload,
  customInstructions = "",
): Promise<string> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();

  try {
    const imageDataUrl = await readPayloadImageDataUrl(payload.imageFileName, { compact: true, purpose: "reverse" });
    if (!imageDataUrl) {
      throw new AppError("AI_IMAGE_REQUIRED", "需要可用参考图才能进行图像识别。");
    }

    const response = await requestChatCompletions(
      settings,
      {
        model: settings.model,
        messages: [
          {
            role: "system",
            content: appendCustomInstructions(imagePromptReverseSystemContent, customInstructions),
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请严格基于这张参考图进行提示词反推，包括图中真实可见的来源头像、站点标识、域名卡片等 UI 浮层；只输出最终提示词正文。",
              },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1400,
      },
      false,
      generationRequestTimeoutMs,
    );
    const content = readAssistantContent(response);
    const result = parseRemoteReversedImagePromptContent(content);
    logAiEvent("info", "reverse:done", {
      durationMs: Date.now() - startedAt,
      maxTokens: 1400,
      ok: true,
      timeoutMs: generationRequestTimeoutMs,
    });
    return result;
  } catch (error) {
    logAiEvent("error", "reverse:failed", {
      code: error instanceof AppError ? error.code : "AI_REMOTE_REQUEST_FAILED",
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


export async function testOpenAiCompatibleConnection(settings: AiProviderSettings): Promise<{ connected: true }> {
  assertRemoteSettings(settings);

  await requestChatCompletions(
    settings,
    {
      model: settings.model,
      messages: [
        { role: "system", content: "你只需要返回一句中文确认。不要返回 Markdown。" },
        { role: "user", content: "请回复：连接成功" },
      ],
      temperature: 0,
      max_tokens: 16,
    },
    false,
  );

  return { connected: true };
}

export async function listOpenAiCompatibleModels(settings: AiProviderSettings): Promise<AiProviderModelSettings[]> {
  assertModelListSettings(settings);

  const endpoint = normalizeOpenAiCompatibleModelsEndpoint(settings.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
      method: "GET",
      signal: controller.signal,
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new AppError("AI_MODELS_REQUEST_FAILED", `模型列表查询失败，状态码 ${response.status}。`);
    }

    try {
      return parseOpenAiCompatibleModels(JSON.parse(responseText) as unknown);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("AI_REMOTE_RESPONSE_INVALID", "模型列表返回的响应不是有效 JSON。");
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("AI_REMOTE_TIMEOUT", "模型列表查询超时，请稍后重试。");
    }

    throw new AppError("AI_MODELS_REQUEST_FAILED", "模型列表查询失败，请检查网络或接口配置。");
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeOpenAiCompatibleEndpoint(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址不合法。");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedBaseUrl);
  } catch {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址不合法。");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址必须以 http 或 https 开头。");
  }

  if (parsedUrl.pathname.endsWith("/chat/completions")) {
    return parsedUrl.toString();
  }

  return `${parsedUrl.toString().replace(/\/+$/, "")}/chat/completions`;
}

export function normalizeOpenAiCompatibleModelsEndpoint(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址不合法。");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedBaseUrl);
  } catch {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址不合法。");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址必须以 http 或 https 开头。");
  }

  if (parsedUrl.pathname.endsWith("/models")) {
    return parsedUrl.toString();
  }

  if (parsedUrl.pathname.endsWith("/chat/completions")) {
    return `${parsedUrl.toString().replace(/\/chat\/completions\/?$/i, "")}/models`;
  }

  return `${parsedUrl.toString().replace(/\/+$/, "")}/models`;
}

export function parseOpenAiCompatibleModels(input: unknown): AiProviderModelSettings[] {
  if (!isRecord(input) || !Array.isArray(input.data)) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "模型列表返回结构不合法。");
  }

  const models: AiProviderModelSettings[] = [];
  const usedIds = new Set<string>();

  for (const item of input.data) {
    const id = isRecord(item) ? normalizeString(item.id) : normalizeString(item);

    if (!id || usedIds.has(id)) {
      continue;
    }

    usedIds.add(id);
    models.push({
      id,
      label: id,
      capabilities: parseModelCapabilities(item, id),
    });
  }

  if (models.length === 0) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "模型列表中没有可用模型。");
  }

  return models.slice(0, 120);
}

/**
 * Read the flat V1 analysis shape. `category` may arrive as a string or an
 * array; when it is an array the leading value wins and the rest are folded
 * into `tags` (callers decide whether those are secondary genres or features).
 */
function legacyAnalysisFromRecord(parsed: Record<string, unknown>): RemotePromptAnalysis {
  const categoryValues = Array.isArray(parsed.category)
    ? uniqueStrings(parsed.category)
    : uniqueStrings([parsed.category]);
  const rawCategory = categoryValues[0] ?? "";
  const secondaryCategories = categoryValues.slice(1);
  const tags = uniqueStrings([
    ...(Array.isArray(parsed.tags) ? parsed.tags : []),
    ...secondaryCategories,
  ]);
  // Never invent a non-ontology genre fallback like「图像生成」.
  const analysis: RemotePromptAnalysis = {
    title: normalizeString(parsed.title),
    category: rawCategory,
    tags,
    summary: normalizeString(parsed.summary),
  };

  if (analysis.tags.length === 0 && !rawCategory) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 没有返回可用分析结果。");
  }

  return analysis;
}

/**
 * Parse model output into the structured V2 shape for the adjudication
 * pipeline. A genuine V2 payload is normalized directly; a flat V1 payload is
 * read then lifted to V2 at reduced confidence so downstream scoring can tell
 * verified structure apart from legacy guesses.
 */
export function parseRemotePromptAnalysisV2Content(content: string): RemotePromptAnalysisV2 {
  const parsed = parseJsonObject(stripJsonFence(content));

  if (!isRecord(parsed)) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回结构不合法。");
  }

  return (
    normalizeRemotePromptAnalysisV2(parsed) ??
    remoteAnalysisV2FromLegacy(legacyAnalysisFromRecord(parsed))
  );
}

export function parseRemoteOptimizedPromptContent(content: string): string {
  const optimizedPrompt = normalizeOptimizedPromptBody(extractOptimizedPromptBody(stripTextFence(content)));

  if (!optimizedPrompt) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 没有返回可用优化结果。");
  }

  return optimizedPrompt;
}

function extractOptimizedPromptBody(content: string): string {
  const normalizedContent = content.trim();
  const firstSectionMatch = normalizedContent.match(
    /(?:^|\n)\s*【一】\s*优化后提示词\s*[:：]?\s*\n*([\s\S]*?)(?:\n\s*【二】|$)/u,
  );

  if (firstSectionMatch?.[1]) {
    return firstSectionMatch[1].trim();
  }

  return normalizedContent
    .replace(/\n\s*【二】\s*参数胶囊结构[\s\S]*$/u, "")
    .replace(/^\s*【一】\s*优化后提示词\s*[:：]?\s*/u, "")
    .replace(/^\s*(?:优化后提示词|优化提示词|最终提示词|提示词正文)\s*[:：]\s*/u, "")
    .trim();
}

function normalizeOptimizedPromptBody(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => stripOptimizedPromptLineNoise(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^[\s,，、;；:：]+(?=\S)/u, "")
    .replace(/[\s,，、;；:：]+$/u, "")
    .trim();
}

function stripOptimizedPromptLineNoise(line: string): string {
  return line
    .trim()
    .replace(/^(?:[-*•·]\s+|\d+[.)、]\s*)+/u, "")
    .replace(/^[,，、;；:：]+(?=\S)/u, "")
    .trim();
}

export function parseRemoteReversedImagePromptContent(content: string): string {
  const reversedPrompt = stripTextFence(content)
    .replace(/^\s*(?:图像反推提示词|反推提示词|最终提示词|提示词正文)\s*[:：]\s*/u, "")
    .trim();

  if (!reversedPrompt) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 没有返回可用图像反推结果。");
  }

  return reversedPrompt;
}

export function parseRemoteTranslatedPromptContent(content: string): AiTranslatePromptData {
  const strippedContent = stripJsonFence(content);

  try {
    const parsed = JSON.parse(strippedContent) as unknown;

    if (isRecord(parsed)) {
      const prompt = normalizeString(parsed.prompt);
      const negativePrompt = normalizeString(parsed.negativePrompt);

      if (prompt || negativePrompt) {
        return { prompt, negativePrompt };
      }
    }
  } catch {
  }

  const fallbackPrompt = stripTextFence(content)
    .replace(/^\s*(?:翻译结果|译文|提示词翻译)\s*[:：]\s*/u, "")
    .trim();

  if (!fallbackPrompt) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 没有返回可用翻译结果。");
  }

  return { prompt: fallbackPrompt, negativePrompt: "" };
}

type VisionImagePurpose = "default" | "safety" | "category" | "tags" | "reverse";

function getVisionThumbnailSettings(purpose: VisionImagePurpose): { maxSize: number; quality: number } {
  switch (purpose) {
    case "safety":
      return { maxSize: safetyVisionThumbnailMaxSize, quality: safetyVisionThumbnailQuality };
    case "category":
      return { maxSize: categoryVisionThumbnailMaxSize, quality: categoryVisionThumbnailQuality };
    case "tags":
      return { maxSize: tagsVisionThumbnailMaxSize, quality: tagsVisionThumbnailQuality };
    case "reverse":
      return { maxSize: 896, quality: 70 };
    case "default":
    default:
      return { maxSize: visionThumbnailMaxSize, quality: visionThumbnailQuality };
  }
}

export function resolveVisionImagePayloadPolicy(
  sourceByteLength: number,
  options: { compact?: boolean; purpose?: VisionImagePurpose } = {},
): VisionImagePayloadPolicy {
  const purpose = options.purpose ?? (options.compact ? "safety" : "default");
  const shouldCompact = Boolean(options.compact) || purpose !== "default";
  const useOriginal = !shouldCompact && sourceByteLength <= maxVisionInlineOriginalBytes;
  const thumbnail = getVisionThumbnailSettings(purpose);

  return {
    useOriginal,
    useThumbnail: shouldCompact || !useOriginal,
    thumbnailMaxSize: thumbnail.maxSize,
    thumbnailQuality: thumbnail.quality,
  };
}


export async function requestChatCompletions(
  settings: AiProviderSettings,
  body: Record<string, unknown>,
  allowResponseFormatRetry: boolean,
  timeoutMs = requestTimeoutMs,
  deadlineMs = Date.now() + timeoutMs,
): Promise<unknown> {
  const endpoint = normalizeOpenAiCompatibleEndpoint(settings.baseUrl);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw new AppError("AI_REMOTE_TIMEOUT", "远程 AI 响应超时，请稍后重试。");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);

    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });
      const responseText = await response.text();

      if (!response.ok) {
        if (allowResponseFormatRetry && shouldRetryWithoutResponseFormat(response.status, responseText)) {
          const { response_format: _responseFormat, ...bodyWithoutResponseFormat } = body;
          return requestChatCompletions(settings, bodyWithoutResponseFormat, false, timeoutMs, deadlineMs);
        }

        throw new AppError("AI_REMOTE_REQUEST_FAILED", buildRemoteRequestFailureMessage(response.status, responseText));
      }

      try {
        return JSON.parse(responseText) as unknown;
      } catch {
        throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回的响应不是有效 JSON。");
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const isAbort = error instanceof Error && error.name === "AbortError";

      if (isAbort) {
        // An aborted request has already consumed the entire time budget.
        // Retrying here used to turn a 22s/26s timeout into 44s/52s waits.
        throw new AppError("AI_REMOTE_TIMEOUT", "远程 AI 响应超时，请稍后重试。");
      }

      if (attempt < maxRetries && isTransientNetworkError(error)) {
        const retryDelayMs = Math.min(retryBaseDelayMs * (attempt + 1), Math.max(0, deadlineMs - Date.now()));
        if (retryDelayMs <= 0) {
          throw new AppError("AI_REMOTE_TIMEOUT", "远程 AI 响应超时，请稍后重试。");
        }
        await sleep(retryDelayMs);
        continue;
      }

      throw new AppError("AI_REMOTE_REQUEST_FAILED", buildRemoteNetworkFailureMessage(error));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AppError("AI_REMOTE_REQUEST_FAILED", "远程 AI 请求失败，已达最大重试次数。");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("socket disconnected") ||
    message.includes("tls connection") ||
    message.includes("connect timeout") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("epipe") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("other side closed") ||
    message.includes("socket hang up") ||
    message.includes("connection reset")
  );
}

export function buildRemoteRequestFailureMessage(status: number, responseText: string): string {
  const detail = extractRemoteErrorDetail(responseText);

  return detail
    ? `远程 AI 请求失败，状态码 ${status}。原因：${detail}`
    : `远程 AI 请求失败，状态码 ${status}。请检查接口地址、模型 ID 或 API Key。`;
}

export function buildRemoteNetworkFailureMessage(error: unknown): string {
  const detail = extractNetworkErrorDetail(error);

  return detail
    ? `远程 AI 请求失败，网络原因：${detail}`
    : "远程 AI 请求失败，请检查网络、代理或接口配置。";
}

function extractRemoteErrorDetail(responseText: string): string {
  const text = responseText.trim();

  if (!text) {
    return "";
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const jsonDetail = readRemoteErrorField(payload);

    if (jsonDetail) {
      return normalizeFailureDetail(jsonDetail);
    }
  } catch {
  }

  return normalizeFailureDetail(text);
}

function readRemoteErrorField(input: unknown): string {
  if (!isRecord(input)) {
    return typeof input === "string" ? input : "";
  }

  const error = input.error;

  if (typeof error === "string") {
    return error;
  }

  if (isRecord(error)) {
    const errorMessage = pickFirstString(error, ["message", "detail", "reason", "code", "type"]);

    if (errorMessage) {
      return errorMessage;
    }
  }

  return pickFirstString(input, ["message", "msg", "detail", "reason", "error_description"]);
}

function extractNetworkErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return "";
  }

  const cause = (error as Error & { cause?: unknown }).cause;

  if (cause instanceof Error && cause.message) {
    return normalizeFailureDetail(cause.message);
  }

  if (isRecord(cause)) {
    const causeMessage = pickFirstString(cause, ["message", "code", "reason"]);

    if (causeMessage) {
      return normalizeFailureDetail(causeMessage);
    }
  }

  return normalizeFailureDetail(error.message);
}

function pickFirstString(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function normalizeFailureDetail(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-****")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

async function buildAnalysisBody(
  settings: AiProviderSettings,
  payload: AiAnalyzePromptPayload,
): Promise<Record<string, unknown>> {
  const budget = getAnalysisRequestBudget(payload.target);

  return {
    model: settings.model,
    messages: [
      {
        role: "system",
        content: appendCustomInstructions(buildSystemAnalysisContent(payload.target), payload.customInstructions),
      },
      {
        role: "user",
        content: await buildUserAnalysisContent(payload),
      },
    ],
    temperature: budget.temperature,
    max_tokens: budget.maxTokens,
    response_format: { type: "json_object" },
  };
}

function getAnalysisRequestBudget(target: AiAnalyzePromptPayload["target"]): {
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
} {
  switch (target) {
    case "image-safety":
      // V2 结构化安全：safety:{rating,confidence,evidence} 比 V1 单字段更长，
      // 放宽 token 以免结构化输出被截断。
      return { maxTokens: 320, temperature: 0, timeoutMs: 16_000 };
    case "prompt-category":
    case "image-category":
      // V2 结构化输出：每个分类除 label 外还带 confidence/evidence/primary，3-10 个分类 + summary。
      // 实测 glm-5.2/deepseek-v4-pro 等推理模型把补全预算大量花在内部推理上，旧值 3000 token 常被
      // 推理吃满 → finish_reason:length、content 为空 → 几乎每次都要重试。放宽到 8000 让首轮就能
      // 推理完并吐出完整 JSON（多数情况免去重试），超时同步放宽以匹配更长的推理生成时长。
      return { maxTokens: 8000, temperature: 0.1, timeoutMs: reasoningCategoryTimeoutMs };
    case "prompt-tags":
    case "image-tags":
      // V2 结构化输出：最多 15 个标签，每个带 dimension/confidence/evidence。同理，推理模型下 2000 token
      // 易被推理耗尽（曾观测到重试仍 length 截断，甚至 35s 超时），放宽 token 与超时以匹配真实生成耗时。
      return { maxTokens: 6000, temperature: 0.15, timeoutMs: reasoningTagsTimeoutMs };
    default:
      return { maxTokens: 1400, temperature: 0.2, timeoutMs: analysisRequestTimeoutMs };
  }
}

function appendCustomInstructions(baseContent: string, customInstructions: string | undefined): string {
  const normalizedCustomInstructions = customInstructions?.trim();

  if (!normalizedCustomInstructions) {
    return baseContent;
  }

  return [
    baseContent,
    "用户在 AI 设置中为此功能配置了以下补充规则，必须在不破坏系统输出格式的前提下优先遵守：",
    normalizedCustomInstructions,
  ].join("\n\n");
}

async function buildUserAnalysisContent(payload: AiAnalyzePromptPayload): Promise<unknown> {
  if (payload.target === "prompt-category") {
    return buildPromptCategoryAnalysisUserText(payload);
  }

  if (payload.target === "prompt-tags") {
    return buildPromptTagsAnalysisUserText(payload);
  }

  const imageDataUrl = await readPayloadImageDataUrl(payload.imageFileName, {
    compact: true,
    purpose:
      payload.target === "image-safety"
        ? "safety"
        : payload.target === "image-category"
          ? "category"
          : payload.target === "image-tags"
            ? "tags"
            : "default",
  });
  if (!imageDataUrl) {
    throw new AppError("AI_IMAGE_REQUIRED", "需要可用参考图才能进行图像识别。");
  }

  const text = buildImageAnalysisUserText(payload);
  // 分类识别需要看清材质/笔触/景别，low 档会把写真人像和插画压成同一种模糊图。
  const imageDetail = payload.target === "image-category" ? "high" : "low";

  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: imageDataUrl, detail: imageDetail } },
  ];
}

/**
 * 分类 / 标签分析一律不读负向提示词。
 *
 * 负向提示词描述的是「要避免的内容」，一旦进入分析就会被反向当成画面事实：
 * 写了「不要出现食物、产品」反而会被判成 食品摄影 / 产品摄影，
 * 「避免模糊」也会变成画质类标签。
 *
 * 因此这两类分析的用户消息里根本不携带负向文本，而不是依赖模型自觉忽略。
 * 唯一需要负向原文的是提示词翻译（buildTranslationBody），那里必须原样翻译。
 */
const negativePromptExclusionNotice =
  "本次分析不提供负向提示词，也不需要考虑任何负向/排除内容。";

/**
 * 场景类型与光线条件必须分开判断：有受控布光不等于拍摄地点就是影棚。
 * 这段边界同时发给视觉模型的 user/system message，避免模型只记住“棚拍光”
 * 而把真实室内的主题布置一并归为「专业影棚」。
 */
const sceneAuthenticityBoundary = [
  "【场景真实性与专业影棚边界，优先级高于通用规则】",
  "「专业影棚」只在画面出现明确的棚拍证据时使用：无缝纯色/渐变背景延伸到地面、背景纸或背景板边界、可见摄影灯/柔光箱/灯架/摄影台，或主体被孤立在没有建筑连续性的棚内空间。",
  "红色或黑色幕布、帷幔、屏风、桌面摆台、主题道具、古装造型、摆拍姿态、商业布光、画面像样片等，单独都不能证明是专业影棚；有幕布不等于有无缝背景，有布景不等于影棚。",
  "如果能看到真实室内的墙面、门窗、梁柱、地面、固定装饰、家具陈设、连续透视或明确空间纵深，按真实室内环境归类；真实庭院、园林、街巷、古建筑同理。人物被安排在真实场景中摆拍，仍不是专业影棚。",
  "「棚拍光」只描述光源性质，可以与室内居家、室内商业、庭院园林、古镇建筑等真实场景并存；不能因为选了棚拍光就追加「专业影棚」。",
  "无法确认是影棚时，不得猜选「专业影棚」；只保留有直接证据的真实场景类型/场景细分，真实环境也无法确认时跳过场景类型。",
].join("\n");

const portraitCategoryBoundary =
  "【肖像摄影边界】「肖像摄影」只用于人物面部/身份肖像本身是画面主旨、人物被当作被摄者突出呈现的情况；人物只是古装、仪式、故事或真实场景中的角色，且画面同样强调空间、道具和叙事时，不得仅凭出现人脸就判为「肖像摄影」，应优先选择更能说明场景/叙事的内容类型。";

const beverageCategoryBoundary = [
  "【饮品摄影分类边界，优先级高于泛食品/产品分类】",
  "一级分组「饮品摄影」下只能选择二级叶子：咖啡摄影、茶饮摄影、酒精饮品摄影、非酒精饮品摄影、饮品制作过程摄影、饮品与场景结合摄影；不要返回一级分组名「饮品摄影」。",
  "优先级：①画面重点是冲泡、萃取、调酒、倒液、打奶泡、搅拌、装杯或封口等动作时选「饮品制作过程摄影」；②饮品类型明确时按类型选咖啡摄影/茶饮摄影/酒精饮品摄影/非酒精饮品摄影；③饮品类型不明确但饮品与咖啡馆、酒吧、餐桌、厨房、户外或生活方式环境形成明显关系时选「饮品与场景结合摄影」。",
  "明确饮品主体时，不要用「食品摄影」或「产品摄影」替代饮品二级分类；商业广告、品牌宣传、海报版式、自然光、棚拍光、色调和情绪是用途/属性，不能覆盖饮品主体分类。只有画面本质是平面设计稿并满足海报边界时，才额外选择「海报设计」。",
  "饮品类型无法从画面或提示词直接确认时，不要猜具体饮品；可选择「饮品与场景结合摄影」，否则返回空分类。",
].join("\n");

const bridalCategoryBoundary = [
  "【婚纱摄影分类边界】",
  "「婚纱摄影」用于婚前/婚纱照服务与成片：包括室内或外景婚纱拍摄、礼服租赁或造型、选片修片、相册/成片交付等线索；这些服务线索只是判定依据，不单独建立服务分类。",
  "「婚礼摄影」只用于婚礼仪式、婚宴、接亲和婚礼当天的现场纪实；有婚礼现场证据时优先婚礼摄影。仅出现婚纱、礼服、新娘肖像、外景婚照或婚前拍摄，不要归入婚礼摄影。",
  "「婚纱造型」是服饰造型维度，可与婚纱摄影同时出现；「新娘写真」是人物题材维度，不替代婚纱摄影。婚礼服务、摄影摄像等服务行业通称不作为图像内容分类，除非画面本身确实是相应摄影成片。",
].join("\n");

const aiCategoryDisplayBoundary =
  "【分类展示范围】AI 分类只返回内容类型、人物题材、服饰造型、场景类型、场景细分、主题领域、风格流派、应用场景、文化语境、时代风格等稳定检索维度；不要返回「光线条件」「色彩体系」「技术手法」「情绪氛围」中的任何分类（包括柔光、棚拍光、红色主导、暖色主导、浅景深、深景深、浪漫唯美等），这些属于画面属性，不在分类区展示。";

export function buildPromptCategoryAnalysisUserText(payload: AiAnalyzePromptPayload): string {
  return [
    "请只根据当前提示词判断分类，不要参考效果图、缩略图或已有标签。",
    `提示词：\n${payload.prompt}`,
    negativePromptExclusionNotice,
    payload.title ? `素材标题（辅助参考）：${payload.title}` : "",
    payload.title
      ? "标题里的日期、序号、文件编号一律忽略；平台名（小红书/Instagram 等）只能作为「发布媒介」的参考，不得据此判断题材。"
      : "",
    "按以下四步分析，再输出结果：",
    "第一步 通读全文：先确定这段提示词要生成的是照片、绘画、3D 还是设计稿，以及整体题材方向。",
    "第二步 要素抽取：逐句抽出主体（人物年龄/关系/服饰、物体品类、动物）、场景（室内外/地域/时代）、光线色彩、镜头与画质描述、用途说明。",
    "第三步 多维归类：把抽出的要素分别落到下列各维度组，每个能判断的维度组各取 1 个叶子；提示词没写到的维度直接跳过，不要推断。",
    "第四步 交叉验证：逐条检查每个分类能否在提示词原文里找到对应词句；找不到出处的一律删掉。",
    "可选细分类如下（只能从中选择，不得新增/缩写/翻译）：",
    buildCompactCategoryCatalog(payload),
    "人像域区分依据：肖像摄影＝以人物面部、气质与写真造型为核心（含古风、汉服、时装写真）；人物艺术摄影＝人体、舞蹈、运动等以肢体艺术表达为主。以写真造型为主的人像优先归「肖像摄影」。",
    "判定依据只能是提示词描述的题材与媒介，与素材由谁生成无关；描述真实摄影效果的提示词必须归入摄影细分类，「AI艺术」「生成艺术」只用于提示词本身描述抽象生成美学时。",
    portraitCategoryBoundary,
    beverageCategoryBoundary,
    bridalCategoryBoundary,
    aiCategoryDisplayBoundary,
    sceneAuthenticityBoundary,
    "把第一、二步的结论写进 summary（一句话：主体、场景、媒介、色调与光线）。",
    "内容类型取 1-2 个；人物题材/服饰造型/场景类型/场景细分/季节时令/光线条件/主题领域/风格流派/情绪氛围/色彩体系/技术手法/应用场景/发布媒介/文化语境/时代风格各取 0 或 1 个，提示词没写到的维度直接跳过。",
    "提示词描述了人物时，人物题材（少女/少年/情侣/亲子/职场…）与服饰造型（汉服/旗袍/JK制服/婚纱…）要一并给出。",
    "categories 数组合计 5-15 个元素，每个 label 都必须能在提示词文本里找到依据。",
    "严禁凑数：提示词里没写的题材一律不得返回。提示词为空或过短无法判断时，categories 必须返回空数组，不要猜测。",
    "categories 数组第一个元素（primary 为 true）必须是最匹配的那个内容类型分类名称；其余分类依次排在后面，label 也必须完全等于上面的名称。",
    "不要返回上级类目、近义词或自造类目；不要输出普通标签。",
  ]
    .filter(Boolean)
    .join("\n\n");
}


export function buildPromptTagsAnalysisUserText(payload: AiAnalyzePromptPayload): string {
  return [
    "请只根据当前提示词生成标签，不要参考效果图、缩略图或已有标签。",
    `提示词：\n${payload.prompt}`,
    negativePromptExclusionNotice,
    payload.title ? `素材标题（辅助参考，其中的日期与编号忽略）：${payload.title}` : "",
    "先逐句通读提示词，把明确写出的画面事实抽出来，再归入下列几类，只保留原文写到的：",
    "① 景别：特写、近景、中景、全景、远景、半身、七分身",
    "② 机位角度：平视、俯拍、仰拍、侧面、背影、过肩、低角度、高角度",
    "③ 构图：三分构图、中心构图、对称构图、引导线、框架构图、留白",
    "④ 光学产物：自然光斑、丁达尔光、轮廓光、光晕、镜头耀斑、斑驳树影、剪影（光源方向与性质属于分类维度「光线条件」，不要在标签里重复）",
    "⑤ 具体事物：道具、场景元素、单件衣物与配饰、可见文字与品牌标识",
    "风格、情绪、色彩体系、技术手法、应用场景、发布媒介、文化语境、时代风格、人物题材、服饰造型由分类识别负责，标签不要重复这些维度。",
    "标签必须是原子词：不要把上述维度加形容词拼成复合标签（如「柔和暖调自然光」「低饱和暖色调」「极致高级感」「浓厚复古风」），维度交分类，标签只写原文写明的具体事物。",
    "事物类标签（衣物、场景、道具、器物、家具、陈设、背景、台面、餐具等）用不带修饰的核心名词：不要在名词上叠加颜色、材质、风格、年代、状态等修饰（不写「红色丝绸连衣裙」「现代简约客厅」「水泥质感台面」，写「连衣裙」「客厅」「台面」），被剥离的颜色/材质/风格交对应分类维度，不要再作为该事物的附属标签重复；绿叶、白花、红唇这类颜色即主体特征的词保留原样。",
    "只提取文本中明确写出的内容，提示词没写的不要补充推断，最多 15 个。",
    "不要输出维度名/菜单名（如“摄影风格”“景别”“构图逻辑”），应输出该维度下的实际取值（如“近景”“中心构图”“紫色霓虹光”）。",
    "标签不是参数：不得输出位置关系句、生成要求、参考图说明、变量名或完整提示词片段。",
    "不得输出模型名、平台名、SEO 词或营销元信息。标签必须是简体中文短词或短语。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildImageAnalysisUserText(payload: AiAnalyzePromptPayload): string {
  if (payload.target === "image-category") {
    return [
      "请只根据参考图判断图片分类，不要分析提示词或现有标签。",
      "先判断图像属于哪种大类型（摄影、插画绘画、动漫二次元、3D与CG、概念设计、平面设计、UI界面、传统艺术、像素与复古、游戏美术、影视媒体、表情包与网络文化、字体与排版、产品与电商视觉、科学与医疗视觉、建筑与空间视觉、时尚与美妆视觉、混合与实验媒介），再从该类型下的细分类中选择。",
      "可选细分类如下（只能从中选择，不得新增/缩写/翻译）：",
      buildCompactCategoryCatalog(payload),
      "判定依据只能是画面本身呈现的题材、媒介与拍摄/绘制方式，与素材由谁生成无关。",
      "即使参考图是 AI 生成的，只要画面呈现为真实摄影效果，就必须归入对应的摄影细分类；「AI艺术」「生成艺术」只用于画面本身以算法纹理、抽象生成美学为主体、无法归入任何具体题材时。",
      "摄影人像域区分依据：肖像摄影＝以人物面部、气质与写真造型为核心（含古风、汉服、时装写真等）；人物艺术摄影＝人体、舞蹈、运动等以肢体艺术表达为主。以写真造型为主的人像应优先归「肖像摄影」。",
      portraitCategoryBoundary,
      beverageCategoryBoundary,
      bridalCategoryBoundary,
      aiCategoryDisplayBoundary,
      "按以下四步分析，再输出结果：",
      "第一步 全局感知：整体色调（暖/冷/高对比/低饱和）、光线条件（自然光/人工光/逆光/侧光）、构图方式（对称/三分/引导线/框架）、空间层次（前景-中景-背景）。",
      "第二步 主体识别：人物（数量/关系/年龄段/姿态/表情/服饰）、物体（品类/材质/用途）、场景（室内外/自然人造/城乡）、动物（物种/行为）、文字（语言/含义）。",
      "第三步 多维分类：把上面两步的观察分别落到下列各个维度组，每个能判断的维度组各取 1 个最贴切的叶子；判断不了的维度组直接跳过，不要硬填。",
      "画面里有人物时，必须判断「人物题材」（拍的是谁：少女/少年/情侣/亲子/职场/群像…）与「服饰造型」（穿的是什么：汉服/旗袍/JK制服/婚纱/长裙连衣裙/休闲穿搭…）这两个维度；画面里没有人物时跳过这两个维度。",
      "只要画面能看出拍摄环境，就必须判断「场景类型」（户外自然/户外城市/室内居家/专业影棚…）与「场景细分」（森林树木/草地原野/街道巷弄/咖啡馆…）；能看出时令时判断「季节时令」（春夏秋冬/清晨/黄昏/夜晚/雨雪天候）。",
      "当内容类型只说明形式而未表明主题时（App界面/信息图表/海报设计/插画/UI 等），必须给出「主题领域」（建筑空间/历史文化/美食餐饮/健康医疗/教育学习/家居园艺…）；摄影类内容若主题已由内容类型隐含（食品摄影/建筑摄影），可跳过该维度。",
      "只要能判断光源方向或性质，就必须给出「光线条件」（自然光/逆光/侧光/顺光/顶光/柔光/硬光/棚拍光/窗边光/黄昏金光/夜间人工光/混合光）。注意：具体的光斑、丁达尔光、轮廓光、剪影属于标签，不要写进分类。",
      "场景细分最多取 2 个（例如庭院园林+古镇建筑），其余稳定检索维度各取 1 个；光线、色彩、景深/技法和情绪不属于本次分类输出。",
      "关键边界判断（第三步内必须遵守，优先级高于通用规则）：",
      "①「海报设计」须同时出现主标题+正文/卖点文案块+品牌标识+版权或联系信息四要素才触发；单一 Logo、摄影水印、装饰性挂牌文字均不触发。",
      "②食品实拍 vs CG分界：画面可见食材纹理/景深过渡/气孔/光泽等真实质感→「食品摄影」；完美几何体+连续流体飘带+失重悬浮+纯色虚空背景→「产品CG渲染」；以 CG 媒介呈现食品题材时必须补主题领域「美食餐饮」。",
      "③礼盒与食品主体作用域：礼盒/包装外观为视觉主体时取「产品摄影」并补主题领域「美食餐饮」；菜品/糕点/饮品本身为主体时取「食品摄影」并跳过主题领域。",
      "④主题领域作用域：食品摄影/建筑摄影/风光摄影/肖像摄影/宠物摄影等摄影类内容类型已隐含主题，跳过主题领域；产品摄影（腕表/珠宝→时尚美妆，宠物设备→宠物动物）、产品CG渲染、海报设计、App界面、信息图表、插画等内容类型不隐含主题，必须给出主题领域。",
      sceneAuthenticityBoundary,
      "⑥菜单/包装/电商详情边界：图片适合用于上述用途≠该内容类型；菜单设计需有价目表或点餐栏目结构；包装设计需有刀模/展开图/设计规范；电商详情需有价格标注或购买入口。",
      "⑦应用场景区分：有明确转化卖点/促销/行动号召→「商业广告」；以品牌形象/工作室样片展示为主、无价格促销→「品牌宣传」。",
      "第四步 交叉验证：逐条检查每个分类是否都能在第一、二步的观察里找到直接依据；找不到依据的一律删掉。",
      "把第一、二步的观察结论写进 summary（一句话，说明主体、场景、媒介、色调与光线）。",
      "categories 数组合计返回 3-10 个稳定分类：内容类型最多 2 个，其余只保留有直接证据的检索维度。",
      "严禁凑数：画面里没有的题材一律不得返回。例如画面是人像时，不得返回产品摄影、食品摄影、风光摄影等与主体无关的内容类型。",
      "如果参考图不可见或无法辨认内容，categories 必须返回空数组，不要猜测。",
      "categories 数组第一个元素（primary 为 true）必须是最匹配的那个内容类型分类名称；其余分类依次排在后面，label 也必须完全等于上面列表里的名称。",
      "不要返回上级类目、维度组名（如「情绪氛围」「色彩体系」）、近义词或自造类目。",
    ].join("\n");
  }

  if (payload.target === "image-safety") {
    return [
      "请只根据参考图进行 NSFW 安全分级，不要参考标题、提示词或已有标签。",
      "把分级结果写进 safety.rating，只能是 safe、nsfw 或 unknown。",
      "明显裸露、成人色情、强性暗示或限制级内容判为 nsfw；普通人像、时尚穿搭、泳装、情侣合影、室内外日常照如果没有明显成人露骨内容判为 safe；看不清或无法判断判为 unknown。",
    ].join("\n");
  }

  return [
    "请只根据参考图生成图片标签，不要分析分类或提示词。",
    "必须先观察画面事实，再输出具体结果标签。",
    "人物题材、服饰造型、场景、季节、光线条件、风格、情绪、色彩体系、技术手法、应用场景、发布媒介、文化语境、时代风格由分类识别负责，标签不要重复这些维度。",
    "标签必须是原子词：不要把上述维度加形容词拼成复合标签（如「柔和暖调自然光」「低饱和暖色调」「极致高级感」「浓厚复古风」），维度交分类，标签只写画面里能指出的具体事物。",
    "事物类标签（衣物、场景、道具、器物、家具、陈设、背景、台面、餐具等）用不带修饰的核心名词：不要在名词上叠加颜色、材质、风格、年代、状态等修饰（不写「红色丝绸连衣裙」「现代简约客厅」「水泥质感台面」，写「连衣裙」「客厅」「台面」），被剥离的颜色/材质/风格交对应分类维度，不要再作为该事物的附属标签重复；绿叶、白花、红唇这类颜色即主体特征的词保留原样。",
    "标签写画面执行层面的具体事实：景别（特写/近景/中景/全景/远景）、机位角度（平视/俯拍/仰拍/侧面/背影）、构图（三分构图/中心构图/对称构图/引导线/留白）、光学产物（自然光斑/丁达尔光/轮廓光/剪影），以及道具、场景元素、单件衣物与配饰、可见文字。",
    "关键边界（必须遵守）：",
    "①食品/CG动态质感：芝士拉丝/奶浆流动/融化流体等可摆拍的黏滞延展→输出具体描述标签（如「芝士拉丝」「融化芝士」），不触发技术手法分类「高速凝固」；「高速凝固」由分类识别决定，标签不输出该维度叶子名本身。",
    "②CG/合成悬浮元素：3D或合成画面中的飘带/悬浮食材/失重组合→输出事实标签（如「悬浮构图」「奶浆飘带」「失重悬浮」），不视为真实拍摄动态。",
    "③局部手部入画：手持道具/局部手部动作→输出动作事实标签（如「手持餐铲」「手持团扇」），不触发人物题材分类，不重复到分类维度。",
    "④食品/产品剖面细节：剖面/切面/内馅/流心→输出质感标签（如「剖面展示」「流心馅」「夹心层次」「气孔纹理」）；颜色/材质等修饰不写进食品名词（写「流心馅」而非「琥珀色流心馅」），但剖面/流心/拉丝/融化/悬浮等动态或结构描述是内容本身、无对应分类维度可归，予以保留；不新增内容类型分类。",
    "⑤画面版式与多品陈列：海报版式→「竖版海报」「横版海报」；多件商品/多杯同框→「多产品组合」「三款同框」「阶梯式陈列」；均为标签，不影响分类。",
    "⑥商业布景道具：合成/模拟布景元素（模拟水面/假球场线/合成天空）→以真实可见的具体物品为标签（如「模拟水面」「同心水波纹」「荷叶」），不误写成真实户外场景词汇。",
    "不要输出维度名或菜单名，例如不要输出”摄影风格””景别””构图逻辑””图像风格””镜头器材””光影表现”，而要输出这些维度下的实际取值。",
    "应该输出实际观察到的取值，例如“近景”“仰拍”“三分构图”“逆光”“长裙”“团扇”“栈道”“湖水”。",
    "标签不是参数：不得输出位置关系句、生成要求、参考图说明、保留/避免约束、画面目标、变量名或完整提示词片段。",
    "不得输出模型名、平台名、SEO 词、prompt/gallery/ecommerce 等不可见来源或营销元信息；截图里真实可见的站点标识可作为短标签保留。",
    "标签必须是简体中文短词或短语，最多 15 个。",
  ].join("\n");
}


const v1JsonContract = [
  "只返回一个 JSON 对象，不要返回 Markdown，不要解释。",
  "JSON 字段必须为：title、category、tags、summary。",
];

const v2JsonContractBase = [
  "只返回一个 JSON 对象，不要返回 Markdown，不要解释。",
  "顶层字段：schemaVersion（数字，恒为 2）、title（字符串，可留空）、summary（字符串）、categories（数组）、tags（数组）、safety（对象）。",
];

const v2CategoryOutputSpec = [
  '每个 categories 元素形如 {"label":"分类名","confidence":0.82,"evidence":["支撑该分类的画面或原文依据短语"],"primary":false}。',
  "confidence 取 0-1 小数表示把握程度；evidence 填 1-3 条能在画面/原文里核对的依据短语；categories 中有且仅有主分类的 primary 为 true。",
  '本任务只输出分类：tags 必须为空数组 []，safety 固定为 {"rating":"unknown","confidence":0,"evidence":[]}。',
];

const v2TagOutputSpec = [
  '每个 tags 元素形如 {"label":"标签","dimension":"composition","confidence":0.7,"evidence":["依据短语"]}。',
  "dimension 从 subject、scene、style、composition、lighting、color、mood、technique、era、other 中选最贴切的一个，拿不准填 other；confidence 取 0-1 小数；evidence 填 1-2 条原文/画面依据短语。",
  '本任务只输出标签：categories 必须为空数组 []，safety 固定为 {"rating":"unknown","confidence":0,"evidence":[]}。',
];

const v2SafetyOutputSpec = [
  "本任务只做安全分级：categories 与 tags 必须为空数组 []，判定结果写进 safety 对象。",
  'safety 形如 {"rating":"safe","confidence":0.9,"evidence":["支撑分级的画面依据短语"]}。',
  "rating 只能是 safe、nsfw 或 unknown：safe＝普通人像/时尚穿搭/泳装/情侣合影/日常照等无明显成人露骨内容；nsfw＝明显裸露、成人色情、强性暗示或限制级；看不清或无法判断＝unknown。",
  "confidence 取 0-1 小数表示把握程度；evidence 填 1-2 条能在画面里核对的依据短语，不要写露骨细节。",
];

export function buildSystemAnalysisContent(target: AiAnalyzePromptPayload["target"]): string {
  if (target === "image-category") {
    return [
      ...v2JsonContractBase,
      "你是图像分类识别器。根据参考图判断这张图片属于哪种图像类型和具体分类。",
      "图像类型涵盖摄影、插画绘画、动漫二次元、3D与CG、概念设计、平面设计、UI界面、传统艺术、像素与复古、游戏美术、影视媒体、表情包与网络文化、字体与排版、产品与电商视觉、科学与医疗视觉、建筑与空间视觉、时尚与美妆视觉、混合与实验媒介等。",
      "categories 数组第一个元素（primary 为 true）的 label 必须从用户提供的固定分类列表中原文选择最匹配的一个作为主分类；严禁新增、缩写、翻译或返回一级大类。",
      "分类目录含内容类型组与稳定检索维度组（人物题材/服饰造型/场景类型/场景细分/主题领域/风格流派/应用场景/文化语境/时代风格）。",
      "categories 数组共 3-10 个元素（含主分类）：内容类型取 1-2 个；上述稳定检索维度各取 0 或 1 个，场景细分最多取 2 个，判断不了的维度直接跳过。宁少勿滥。",
      "画面中出现人物时，人物题材与服饰造型这两个维度必须给出判断，不得跳过。",
      sceneAuthenticityBoundary,
      portraitCategoryBoundary,
      beverageCategoryBoundary,
      bridalCategoryBoundary,
      "categories 数组中主分类之后按此顺序排列其余检索分类：内容类型 → 主题领域 → 人物题材 → 场景类型 → 场景细分 → 服饰造型 → 风格流派 → 应用场景 → 时代风格 → 文化语境。",
      "分类必须由画面证据支撑：先在 summary 里写出看到的主体、场景、媒介与叙事重点，再让每个分类的 evidence 都能对应到这句描述。找不到依据的分类一律删掉。",
      "看不到参考图、图片无法辨认时，categories 返回空数组，不要用分类列表里的词猜测。",
      "素材是否由 AI 生成不是分类依据。写实摄影效果的 AI 图必须归入摄影分类；「AI艺术」「生成艺术」仅用于画面本身是抽象生成美学、无具体题材时。",
      aiCategoryDisplayBoundary,
      "不要分析提示词；不要输出普通特征标签。",
      ...v2CategoryOutputSpec,
    ].join("\n");
  }

  if (target === "prompt-category") {
    return [
      ...v2JsonContractBase,
      "你是提示词分类识别器。根据提示词文本判断这段提示词对应的图像类型和具体分类。",
      "图像类型涵盖摄影、插画绘画、动漫二次元、3D与CG、概念设计、平面设计、UI界面、传统艺术、像素与复古、游戏美术、影视媒体、表情包与网络文化、字体与排版、产品与电商视觉、科学与医疗视觉、建筑与空间视觉、时尚与美妆视觉、混合与实验媒介等。",
      "categories 数组第一个元素（primary 为 true）的 label 必须从用户提供的固定分类列表中原文选择最匹配的一个；严禁新增、缩写、翻译或返回一级大类。",
      "分类目录含内容类型组与稳定检索维度组（人物题材/服饰造型/场景类型/场景细分/主题领域/风格流派/应用场景/文化语境/时代风格）。",
      "categories 数组共 3-10 个元素（含主分类）：内容类型取 1-2 个；上述稳定检索维度各取 0 或 1 个，场景细分最多取 2 个，判断不了的维度直接跳过。宁少勿滥。",
      "提示词描述了人物时，人物题材与服饰造型这两个维度必须给出判断，不得跳过。",
      "categories 数组中主分类之后按此顺序排列其余检索分类：内容类型 → 主题领域 → 人物题材 → 场景类型 → 场景细分 → 服饰造型 → 风格流派 → 应用场景 → 时代风格 → 文化语境。",
      "分类必须由提示词文本支撑：先在 summary 里概括主体、场景、媒介与叙事重点，再让每个分类的 evidence 都能在原文里找到对应词句。找不到出处的一律删掉，宁可少也不许凑数。",
      "负向提示词只说明要避免什么，绝不能作为任何分类的依据。",
      "提示词为空或过短无法判断时，categories 返回空数组，不要用分类列表里的词猜测。",
      "素材是否由 AI 生成不是分类依据。描述写实摄影效果的提示词必须归入摄影分类；「AI艺术」「生成艺术」仅用于提示词本身描述抽象生成美学时。",
      portraitCategoryBoundary,
      aiCategoryDisplayBoundary,
      "不要推断效果图；不要输出普通特征标签。",
      ...v2CategoryOutputSpec,
    ].join("\n");
  }

  if (target === "image-tags") {
    return [
      ...v2JsonContractBase,
      "你是图片标签识别器。只能根据参考图生成特征标签（tags），不生成分类。",
      "分工：人物题材、服饰造型、场景类型、场景细分、季节时令、光线条件、风格流派、情绪氛围、色彩体系、技术手法、应用场景、发布媒介、文化语境、时代风格这 14 个维度已由分类识别负责，标签不要再输出这些维度的词（如少女写真、汉服造型、写实主义、宁静平和、暖色主导、浅景深、商业广告、中式国风、复古怀旧）。",
      "标签负责画面执行层面的具体事实，必须覆盖这几类：",
      "① 景别：特写、近景、中景、全景、远景、半身、七分身",
      "② 机位角度：平视、俯拍、仰拍、侧面、背影、过肩、低角度、高角度",
      "③ 构图：三分构图、中心构图、对称构图、引导线、框架构图、留白",
      "④ 光学产物：自然光斑、丁达尔光、轮廓光、光晕、镜头耀斑、斑驳树影、剪影（光源方向与性质属于分类维度「光线条件」，不要在标签里重复）",
      "⑤ 具体事物：道具、场景元素、单件衣物与配饰、可见文字与品牌标识",
      "⑥ 商业画面专项：画面版式（竖版海报/横版海报）、多品陈列（多产品组合/三款同框/阶梯式陈列）、食品动态质感（芝士拉丝/剖面展示/流心/奶浆飘带）、CG悬浮元素（悬浮构图/失重悬浮）、局部手部动作（手持餐铲/持团扇）、商业布景道具（模拟水面/同心水波纹/荷叶）",
      "「高速凝固」是技术手法的分类维度叶子，由分类识别负责；标签只写具体动态事实（如「芝士拉丝」「牛奶飞溅」），不输出「高速凝固」本身。",
      "示例：近景、仰拍、三分构图、轮廓光、长裙、团扇、发簪、栈道、湖水、绿叶、芝士拉丝、竖版海报、模拟水面、手持餐铲。",
      "禁止返回图像分类名（如产品摄影、数字插画、3D角色），也禁止红色产品摄影、咖啡摄影等伪分类；颜色+物体应拆成「红色」「产品主体」而不是新类型。",
      "标签必须是不可再拆的原子词：不要把光线/色彩/风格/情绪/技术手法/时代/文化/季节等分类维度加形容词拼成复合标签（如「柔和暖调自然光」「低饱和暖色调」「极致高级感」「浓厚复古风」「宁静温柔氛围」）；这些维度一律交分类识别，标签只写画面里能指出的具体事物、单件衣饰配饰、动作与可见文字。",
      "事物类标签（衣物、场景、道具、器物、家具、陈设、背景、台面、餐具等）一律用不带修饰的核心名词：不要在名词上叠加颜色、材质、风格、年代、状态等修饰（不写「红色丝绸连衣裙」「现代简约客厅」「水泥质感台面」，写「连衣裙」「客厅」「台面」）；被剥离的颜色、材质、风格等交对应分类维度识别，不要再作为该事物的附属标签重复。绿叶、白花、红唇这类颜色本身即主体特征的词保留原样。",
      "tags 数组最多 15 个元素，label 用简体中文短标签。",
      "禁止维度名本身（不要返回「光影」「风格」当标签）；禁止模型名、平台名、SEO 词。",
      ...v2TagOutputSpec,
    ].join("\n");
  }

  if (target === "prompt-tags") {
    return [
      ...v2JsonContractBase,
      "你是提示词标签识别器。只能根据提示词文本生成特征标签（tags），不生成分类。",
      "分工：人物题材、服饰造型、场景类型、场景细分、季节时令、光线条件、风格流派、情绪氛围、色彩体系、技术手法、应用场景、发布媒介、文化语境、时代风格这 14 个维度已由分类识别负责，标签不要再输出这些维度的词（如少女写真、汉服造型、写实主义、宁静平和、暖色主导、浅景深、商业广告、中式国风、复古怀旧）。",
      "标签负责提示词里写明的画面事实，覆盖这几类：景别（特写/近景/中景/全景/远景）、机位角度（平视/俯拍/仰拍/侧面/背影）、构图（三分构图/中心构图/对称构图/引导线/留白）、光学产物（自然光斑/丁达尔光/轮廓光/剪影），以及道具、场景元素、单件衣物与配饰、可见文字。",
      "只抽取原文明确写出的内容，不要补充推断；颜色+物体拆开写。",
      "禁止伪分类（红色产品摄影、高级感摄影等）；禁止返回图像分类名；禁止模型名、平台名、变量名、整句提示词。",
      "标签必须是不可再拆的原子词：不要把光线/色彩/风格/情绪/技术手法/时代/文化/季节等分类维度加形容词拼成复合标签（如「柔和暖调自然光」「低饱和暖色调」「极致高级感」「浓厚复古风」「宁静温柔氛围」）；这些维度一律交分类识别，标签只写原文写明的具体事物、单件衣饰配饰、动作与可见文字。",
      "事物类标签（衣物、场景、道具、器物、家具、陈设、背景、台面、餐具等）一律用不带修饰的核心名词：不要在名词上叠加颜色、材质、风格、年代、状态等修饰（不写「红色丝绸连衣裙」「现代简约客厅」「水泥质感台面」，写「连衣裙」「客厅」「台面」）；被剥离的颜色、材质、风格等交对应分类维度识别，不要再作为该事物的附属标签重复。绿叶、白花、红唇这类颜色本身即主体特征的词保留原样。",
      "tags 数组最多 15 个元素。",
      ...v2TagOutputSpec,
    ].join("\n");
  }


  if (target === "image-safety") {
    return [
      ...v2JsonContractBase,
      "你是图片 NSFW 安全分级器。只能根据参考图判断安全分级，判定结果写进 safety 对象。",
      "不要输出具体露骨细节，不要生成标签、提示词胶囊或普通分类。",
      ...v2SafetyOutputSpec,
    ].join("\n");
  }

  // prompt 参数分析已删除
  return v1JsonContract.join("\n");
}

function getPromptCategoryLabels(payload: AiAnalyzePromptPayload): string[] {
  const labels = Array.isArray(payload.knownCategories)
    ? payload.knownCategories.map((category) => category.trim()).filter(Boolean)
    : [];

  return labels.length > 0 ? [...new Set(labels)] : photographyCategoryLabels;
}

/**
 * 分类任务只发送细分类名称分组清单，避免 labels 与完整描述各发一遍导致提示词膨胀。
 * 若调用方提供 knownCategories，则仅发送该子集。
 */
function buildCompactCategoryCatalog(payload: AiAnalyzePromptPayload): string {
  const known = Array.isArray(payload.knownCategories)
    ? payload.knownCategories.map((category) => category.trim()).filter(Boolean)
    : [];
  const knownSet = known.length > 0 ? new Set(known) : null;

  // 始终保留「一级大类 → 细分类」结构：用户侧提示要求模型先判大类再选叶子，
  // 旧实现在传入 knownCategories 时退化成扁平逗号串，模型失去大类锚点后
  // 会跳选风格化叶子（例如把 AI 生成的古风写真判成「AI艺术」）。
  const grouped = photographyCategoryGroups
    .map((group) => {
      const labels = group.categories
        .map(([label]) => label)
        .filter((label) => !knownSet || knownSet.has(label));

      return labels.length > 0 ? `【${group.group}】${labels.join("，")}` : "";
    })
    .filter(Boolean);

  if (!knownSet) {
    return grouped.join("\n");
  }

  // 用户自定义 / AI 新增的分类不在本体里，单独挂一个分组，避免被整段丢弃。
  const ontologyLabels = new Set(
    photographyCategoryGroups.flatMap((group) => group.categories.map(([label]) => label as string)),
  );
  const customLabels = [...new Set(known.filter((label) => !ontologyLabels.has(label)))];

  if (customLabels.length > 0) {
    grouped.push(`【自定义分类】${customLabels.join("，")}`);
  }

  return grouped.join("\n");
}

async function readPayloadImageDataUrl(
  imageFileName: string | undefined,
  options: { compact?: boolean; purpose?: VisionImagePurpose } = {},
): Promise<string | null> {
  if (!imageFileName) {
    return null;
  }

  const mimeType = getImageMimeType(imageFileName);

  if (!mimeType) {
    return null;
  }

  try {
    const imageBuffer = await fs.readFile(await resolveLibraryMediaPath(imageFileName));
    const policy = resolveVisionImagePayloadPolicy(imageBuffer.byteLength, options);

    // 原图超过 8MB 时不能直接内联，但可以尝试创建缩略图。
    // 缩略图通常远小于 8MB，能正常用于视觉分析。
    if (imageBuffer.byteLength > maxVisionImageBytes) {
      const thumbnailDataUrl = await createVisionThumbnailDataUrl(imageBuffer, {
        maxSize: policy.thumbnailMaxSize,
        quality: policy.thumbnailQuality,
      });

      if (thumbnailDataUrl) {
        return thumbnailDataUrl;
      }

      // 缩略图也失败时（如 nativeImage 无法解码），只能放弃。
      return null;
    }

    if (policy.useThumbnail) {
      const thumbnailDataUrl = await createVisionThumbnailDataUrl(imageBuffer, {
        maxSize: policy.thumbnailMaxSize,
        quality: policy.thumbnailQuality,
      });

      if (thumbnailDataUrl) {
        return thumbnailDataUrl;
      }
    }

    // 缩略图解码失败时回退到内联原图，避免"有效果图却报缺图"（AI_IMAGE_REQUIRED）。
    // 常见于 nativeImage 无法解码的部分 JPEG。buffer 已在上方确认 ≤ maxVisionImageBytes(8MB)，可安全内联。
    return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function createVisionThumbnailDataUrl(
  imageBuffer: Buffer,
  options: { maxSize: number; quality: number },
): Promise<string | null> {
  try {
    const { nativeImage } = await import("electron");
    const image = nativeImage.createFromBuffer(imageBuffer);

    if (image.isEmpty()) {
      return null;
    }

    const size = image.getSize();
    const longestSide = Math.max(size.width, size.height);

    if (longestSide <= 0) {
      return null;
    }

    const scale = Math.min(1, options.maxSize / longestSide);
    const thumbnail =
      scale < 1
        ? image.resize({
            height: Math.max(1, Math.round(size.height * scale)),
            quality: "good",
            width: Math.max(1, Math.round(size.width * scale)),
          })
        : image;
    const jpegBuffer = thumbnail.toJPEG(options.quality);

    if (jpegBuffer.byteLength === 0 || jpegBuffer.byteLength > maxVisionImageBytes) {
      return null;
    }

    return `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function getImageMimeType(imageFileName: string): string | null {
  const extension = path.extname(imageFileName).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return null;
}

function readAssistantContent(input: unknown): string {
  if (!isRecord(input) || !Array.isArray(input.choices)) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回结构不合法。");
  }

  const firstChoice = input.choices[0] as unknown;

  if (!isRecord(firstChoice)) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回内容为空。");
  }

  // 某些模型（如 DeepSeek-R1）把正文放在 reasoning_content 里，message.content 可能为 null。
  const message = isRecord(firstChoice.message) ? firstChoice.message : null;
  const finishReason = normalizeString(firstChoice.finish_reason);

  const rawContent = message?.content;
  const reasoningContent = message?.reasoning_content;

  let content = "";

  if (typeof rawContent === "string") {
    content = rawContent;
  } else if (Array.isArray(rawContent)) {
    content = rawContent
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  // content 为空时回退到 reasoning_content（兼容 DeepSeek 等 R 系列模型）。
  if (!content && typeof reasoningContent === "string") {
    content = reasoningContent;
  } else if (!content && Array.isArray(reasoningContent)) {
    content = reasoningContent
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  if (!content) {
    const detail = finishReason ? `（finish_reason: ${finishReason}）` : "";
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", `远程 AI 返回内容为空${detail}。`);
  }

  return content;
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const startIndex = content.indexOf("{");
    const endIndex = content.lastIndexOf("}");

    if (startIndex >= 0 && endIndex > startIndex) {
      try {
        return JSON.parse(content.slice(startIndex, endIndex + 1)) as unknown;
      } catch {
        // 尝试修复被 max_tokens 截断的 JSON。
        const repaired = repairTruncatedJson(content.slice(startIndex));
        if (repaired) {
          return repaired;
        }
      }
    }

    // 最后尝试：即使没有 } 也尝试修复截断内容。
    if (startIndex >= 0) {
      const repaired = repairTruncatedJson(content.slice(startIndex));
      if (repaired) {
        return repaired;
      }
    }

    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回的分析结果不是有效 JSON。");
  }
}

/**
 * 修复被 max_tokens 截断的 JSON 字符串。
 * 策略：先尝试直接补全括号；若失败，回退到最后一个安全断点（逗号/引号/闭合括号）再补全。
 */
function repairTruncatedJson(text: string): unknown | null {
  const trimmed = text.trimEnd();
  if (!trimmed.startsWith("{")) return null;

  // 第一次尝试：直接在末尾补全。
  const directRepair = closeJsonBrackets(trimmed);
  if (directRepair !== null) {
    try {
      return JSON.parse(directRepair) as unknown;
    } catch {
      // 继续尝试回退。
    }
  }

  // 第二次尝试：回退到最后一个安全断点（", " 或 "]," 或 "}" 等后面）。
  // 匹配逗号后、闭合引号后、闭合括号后的位置。
  const safeBreakPattern = /["'\]},]\s*/g;
  let lastSafeIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = safeBreakPattern.exec(trimmed)) !== null) {
    lastSafeIndex = match.index + match[0].length;
  }

  if (lastSafeIndex > 0) {
    const candidate = trimmed.slice(0, lastSafeIndex).trimEnd().replace(/,\s*$/, "");
    const repaired = closeJsonBrackets(candidate);
    if (repaired !== null) {
      try {
        return JSON.parse(repaired) as unknown;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * 对可能截断的 JSON 字符串补全缺失的闭合符号。
 */
function closeJsonBrackets(text: string): string | null {
  let result = text.trimEnd();

  // 移除末尾悬垂的逗号。
  result = result.replace(/,\s*$/, "");

  // 统计未闭合的括号。
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < result.length; i++) {
    const ch = result[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      const expected = stack.pop();
      if (expected !== ch) return null; // 括号不匹配，放弃。
    }
  }

  // 如果字符串未闭合，补一个引号。
  if (inString) {
    result += '"';
  }

  // 移除补引号后可能悬垂的逗号。
  result = result.replace(/,\s*$/, "");

  // 按栈逆序补全闭合符号。
  while (stack.length > 0) {
    result += stack.pop();
  }

  return result;
}

function stripJsonFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function stripTextFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:text|txt|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

function shouldRetryWithoutResponseFormat(status: number, responseText: string): boolean {
  return status >= 400 && status < 500 && /response_format|json_object/i.test(responseText);
}

function assertRemoteSettings(settings: AiProviderSettings): void {
  if (!settings.enabled || !settings.baseUrl || !settings.model || !settings.apiKey) {
    throw new AppError("AI_SETTINGS_INCOMPLETE", "请先填写接口地址、模型和 API Key。");
  }
}

function assertModelListSettings(settings: AiProviderSettings): void {
  if (!settings.baseUrl || !settings.apiKey) {
    throw new AppError("AI_SETTINGS_INCOMPLETE", "请先填写接口地址和 API Key。");
  }
}

const visionModelPattern =
  /(?:vision|vl|visual|omni|gpt-4o|gpt-4\.1|gpt-5|o3|o4|gemini|pixtral|llava|qwen[^/]*vl|glm-4v|internvl|minicpm-v)/i;
const imageGenerationModelPattern =
  /(?:dall-?e|gpt-image|flux|sdxl|stable-diffusion|\bsd[-_]|midjourney|ideogram|playground|recraft|kolors|hidream|cogview|wanxiang|tongyiwan|emi)/i;

/**
 * 解析平台 /models 返回的单条模型，优先读取平台声明的模态字段，
 * 字段缺失或无法判定时回退到按模型名称正则猜测。
 */
function parseModelCapabilities(item: Record<string, unknown>, modelId: string): AiProviderModelSettings["capabilities"] {
  const fieldCapabilities = parseModelCapabilitiesFromFields(item);

  return fieldCapabilities.length > 0 ? fieldCapabilities : guessModelCapabilities(modelId);
}

/**
 * 优先依据平台返回的真实模态字段判定能力；无法从字段判定时返回空数组，
 * 由调用方回退到名称正则。
 */
function parseModelCapabilitiesFromFields(item: Record<string, unknown>): AiProviderModelSettings["capabilities"] {
  const inputModalities = uniqueStrings(asStringArray(item.input_modalities));
  const outputModalities = uniqueStrings(asStringArray(item.output_modalities));
  const modalities = uniqueStrings(asStringArray(item.modalities));
  const visionField = asTruthy(item.vision);
  const supportsImageField = asTruthy(item.supports_image);

  const declared = inputModalities.length > 0 || outputModalities.length > 0 || modalities.length > 0;
  // 图片「输入」只来自 input_modalities / modalities 或显式视觉字段，不把 output_modalities 的 image 误判为视觉输入。
  const hasImageInput = inputModalities.includes("image") || modalities.includes("image") || visionField || supportsImageField;
  // 图片「输出」只来自 output_modalities，用于判定纯生图模型。
  const hasImageOutput = outputModalities.includes("image");

  if (!declared && !hasImageInput && !hasImageOutput) {
    return [];
  }

  // 纯生图模型（仅图片输出、无视觉输入）与现有名称正则的约定一致：只标 image-generation。
  if (!hasImageInput && hasImageOutput) {
    return ["image-generation"];
  }

  return hasImageInput ? ["text", "vision"] : ["text"];
}

function guessModelCapabilities(modelId: string): AiProviderModelSettings["capabilities"] {
  const normalizedModelId = modelId.toLowerCase();

  if (imageGenerationModelPattern.test(normalizedModelId)) {
    return ["image-generation"];
  }

  return visionModelPattern.test(normalizedModelId) ? ["text", "vision"] : ["text"];
}

/** 将值规整为字符串数组（数组保留元素，非数组按整串处理）。 */
function asStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((value) => (typeof value === "string" ? value : "")).filter(Boolean);
  }

  return typeof input === "string" ? [input] : [];
}

/** 布尔/字符串真值判定：布尔 true 或非空非假字符串。 */
function asTruthy(input: unknown): boolean {
  if (typeof input === "boolean") {
    return input;
  }

  return typeof input === "string" && input.length > 0 && input.toLowerCase() !== "false";
}

const imagePromptReverseSystemContent = `===== 全局像素级图像反推规则（EcomPhotoForge · 最终优化执行版）=====

【核心宗旨】
将参考图转化为可直接用于AI绘画的像素级结构化提示词，强调真实还原、细节密度、逻辑清晰，避免画面元素缺失、结构混乱或视觉失真。

==================================================
一、输出结构强制顺序（不可调整）
==================================================
必须严格按照以下顺序输出：
1. 画面基础信息
2. 人物主体像素级拆解
3. 场景分层像素级拆解（前景→中景→背景）
4. 光影与色彩像素级拆解
5. 整体氛围与情绪总结

==================================================
二、段落与排版规则（新增强化核心）
==================================================
- 每个模块必须独立成段输出
- 每个段落之间必须使用**空行分隔**
- 禁止列表、编号、分点结构
- 每个模块内部必须使用3–6句自然连续描述
- 不得将信息拆成字段式短句堆叠，必须自然融入语句逻辑中
- 输出必须保持“段落级信息流”，而非结构化说明

==================================================
三、画面基础信息（全局框架）
==================================================
必须融合描述以下内容：景别与覆盖范围、宽高比（末尾必须附 --ar X:Y）、拍摄角度、构图方式、人物在画面中的位置比例、景深类型及虚化范围。若参考图是网页或应用截图，或图片上叠有来源浮层，必须识别可见的作者头像、站点 logo、来源卡片、域名标签、关闭按钮、底部工具条等 UI 元素。

要求：必须说明主体占画面比例；必须说明前后景虚化关系；必须包含构图逻辑与视觉重心。

==================================================
四、人物主体像素级拆解（核心模块）
==================================================
必须自然融合以下内容：

1. 面部与妆容
肤色（色调+质感）、五官结构细节、妆容层次（底妆/眼妆/腮红/修容）、表情与情绪表达。

2. 发型与头饰
发色、发型结构、发丝动态、碎发细节；头饰材质、位置与整体风格关系。

3. 服装细节（四维融合表达）
- 形制与风格定位（传统/现代/文化归类）
- 色彩与面料质感（主/辅/点缀色+材质+光泽/垂感）
- 纹样与剪裁细节（工艺+结构+设计）
- 配饰系统（材质+颜色+呼应关系）

4. 动作与姿态
必须明确“正在做什么”，包括：身体姿态、重心变化、头部视线方向、核心行为动作，以及动作与情绪的关系。

5. 手部与道具（含乐器精确识别）
左右手分别描述，包含手指状态、力度与姿态；道具必须包含材质、结构、使用方式；乐器必须具体到准确名称与结构形态。

==================================================
五、场景分层（前景→中景→背景）
==================================================
前景：描述遮挡物、材质、虚化程度及其构图作用（引导/框景/氛围营造）。

中景：人物与主要元素关系、空间比例、清晰度与交互关系。

背景：环境结构、材质细节、远近层次、虚化程度及其对主体的衬托关系。

==================================================
六、光影与色彩系统（人物受光强化）
==================================================
1. 光影结构
光源类型、方向、色温、高光位置、阴影过渡方式与整体明暗层次。

2. 人物受光（强制重点）
必须表达人物皮肤整体均匀受光、明亮通透：
- 面部与身体暴露区域均被柔和光覆盖
- 高光分布自然（额头、鼻梁、脸颊、锁骨等）
- 阴影必须柔和渐变，无硬边界
- 环境反光或补光增强通透感

3. 色彩系统
整体色调、主辅点色占比、饱和度与对比度、色彩呼应逻辑及情绪表达。

==================================================
七、整体氛围与情绪总结
==================================================
综合光影、色彩、人物与环境，描述整体视觉氛围与情绪表达，突出画面风格与情绪统一性。

==================================================
八、核心约束（强制执行）
==================================================
1. 严格基于图像真实内容，不得虚构
2. 不清晰信息必须标注“不可见/无法确认”
3. 必须严格按结构顺序输出，不可跳跃
4. 每个模块必须独立成段，并使用空行分隔（新增强制规则）
5. 人物皮肤必须保持“明亮、通透、均匀受光”表达体系
6. 结尾必须附 --ar X:Y 参数
7. 只排除不可见的生成平台元信息和纯水印说明；截图或画面里真实可见的来源卡片、作者头像、站点 logo、域名标签必须作为画面元素识别到位`;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}


export async function generateImagesWithOpenAiCompatible(
  settings: AiProviderSettings,
  payload: AiImageGenerationPayload,
  resolvedCustomInstructions = payload.customInstructions ?? "",
): Promise<AiImageGenerationData> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();
  const batchId = randomUUID();
  const requestedCount = normalizeImageGenerationCount(payload.n);
  const referenceImage = await resolveImageGenerationReference(payload);
  const endpoint = referenceImage
    ? normalizeOpenAiCompatibleImageEditsEndpoint(settings.baseUrl)
    : normalizeOpenAiCompatibleImagesEndpoint(settings.baseUrl);
  const endpointUrl = new URL(endpoint);
  const initialBody = buildImageGenerationRequestBody(settings, payload, {
    customInstructions: resolvedCustomInstructions,
    requestedCount,
  });
  const requestContext: ImageGenerationRequestContext = {
    background: String(initialBody.background ?? "auto"),
    batchId,
    customInstructionsChars: resolvedCustomInstructions.trim().length,
    endpointHost: endpointUrl.host,
    endpointPath: endpointUrl.pathname,
    hasReference: Boolean(referenceImage),
    generationProvider: payload.generationProvider ?? "api",
    model: String(initialBody.model),
    negativePromptChars: payload.negativePrompt?.trim().length ?? 0,
    notificationEnabled: payload.notificationEnabled === true,
    outputFormat: String(initialBody.output_format),
    promptChars: payload.prompt.trim().length,
    quality: String(initialBody.quality),
    referenceImageBytes: referenceImage?.bytes.byteLength,
    referenceImageMime: referenceImage?.mime,
    requestedCount,
    size: String(initialBody.size),
  };
  const resolvedImages: ResolvedGeneratedImage[] = [];
  let requestCount = 0;

  try {
    while (resolvedImages.length < requestedCount && requestCount < requestedCount) {
      const remainingCount = requestedCount - resolvedImages.length;
      requestCount += 1;
      const body = buildImageGenerationRequestBody(settings, payload, {
        customInstructions: resolvedCustomInstructions,
        requestedCount: remainingCount,
      });
      const currentRequestContext = {
        ...requestContext,
        accumulatedCount: resolvedImages.length,
        requestImageCount: remainingCount,
        requestIndex: requestCount,
      };

      logAiEvent("info", "image-generation:request", currentRequestContext);
      const response = await requestImageGenerations(
        endpoint,
        settings.apiKey,
        () => referenceImage
          ? buildImageEditRequestForm(settings, payload, referenceImage, {
              customInstructions: resolvedCustomInstructions,
              requestedCount: remainingCount,
            })
          : JSON.stringify(body),
        currentRequestContext,
      );
      const responseImages = await resolveGeneratedImages(response);
      if (responseImages.length === 0) {
        logAiEvent("warn", "image-generation:response-empty", {
          ...currentRequestContext,
          accumulatedCount: resolvedImages.length,
        });
        continue;
      }

      const acceptedImages = responseImages.slice(0, remainingCount);
      for (const image of acceptedImages) {
        try {
          validateGeneratedImageSettings(image.inspection, payload);
        } catch (error) {
          logAiEvent("warn", "image-generation:settings-mismatch", {
            ...currentRequestContext,
            actualFormat: image.inspection.format,
            actualHasAlpha: image.inspection.hasAlpha,
            actualHasTransparency: image.inspection.hasTransparency,
            actualSize: `${image.inspection.width}x${image.inspection.height}`,
            code: error instanceof AppError ? error.code : "AI_IMAGE_OUTPUT_MISMATCH",
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }
      resolvedImages.push(...acceptedImages);

      logAiEvent("info", "image-generation:response", {
        ...currentRequestContext,
        acceptedCount: acceptedImages.length,
        actualFormats: acceptedImages.map((image) => image.inspection.format),
        actualHasAlpha: acceptedImages.map((image) => image.inspection.hasAlpha),
        actualHasTransparency: acceptedImages.map((image) => image.inspection.hasTransparency),
        actualSizes: acceptedImages.map((image) => `${image.inspection.width}x${image.inspection.height}`),
        accumulatedCount: resolvedImages.length,
        returnedCount: responseImages.length,
      });

      if (resolvedImages.length < requestedCount) {
        logAiEvent("warn", "image-generation:supplement-requested", {
          ...requestContext,
          accumulatedCount: resolvedImages.length,
          nextRequestImageCount: requestedCount - resolvedImages.length,
          requestCount,
        });
      }
    }

    if (resolvedImages.length < requestedCount) {
      throw new AppError(
        "AI_IMAGE_COUNT_MISMATCH",
        `图像接口返回数量不足，期望 ${requestedCount} 张，实际仅获得 ${resolvedImages.length} 张。`,
      );
    }

    logAiEvent("info", "image-generation:done", {
      ...requestContext,
      actualFormats: resolvedImages.map((image) => image.inspection.format),
      actualHasAlpha: resolvedImages.map((image) => image.inspection.hasAlpha),
      actualHasTransparency: resolvedImages.map((image) => image.inspection.hasTransparency),
      actualSizes: resolvedImages.map((image) => `${image.inspection.width}x${image.inspection.height}`),
      durationMs: Date.now() - startedAt,
      imageCount: resolvedImages.length,
      ok: true,
      requestCount,
    });
    return {
      images: resolvedImages.map(({ dataUrl, revisedPrompt }) => ({ dataUrl, revisedPrompt })),
      model: String(initialBody.model),
    };
  } catch (error) {
    logAiEvent("error", "image-generation:failed", {
      ...requestContext,
      code: error instanceof AppError ? error.code : "AI_IMAGE_GENERATION_FAILED",
      durationMs: Date.now() - startedAt,
      imageCount: resolvedImages.length,
      message: error instanceof Error ? error.message : String(error),
      requestCount,
    });
    throw error;
  }
}


export function buildImageGenerationRequestBody(
  settings: AiProviderSettings,
  payload: AiImageGenerationPayload,
  options: { customInstructions?: string; requestedCount?: number } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: settings.model,
    prompt: buildImageGenerationPrompt(
      payload.prompt,
      payload.negativePrompt,
      options.customInstructions ?? payload.customInstructions,
    ),
    n: normalizeImageGenerationCount(options.requestedCount ?? payload.n),
    size: payload.size ?? "auto",
    quality: payload.quality ?? "auto",
    output_format: payload.outputFormat ?? "png",
  };

  if (payload.background && payload.background !== "auto") {
    body.background = payload.background;
  }

  return body;
}

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";
type SupportedReferenceImageMime = SupportedImageMime;

export type GeneratedImageInspection = {
  format: "jpeg" | "png" | "webp";
  hasAlpha: boolean;
  hasTransparency: boolean;
  height: number;
  mime: SupportedImageMime;
  width: number;
};

type ResolvedGeneratedImage = {
  dataUrl: string;
  inspection: GeneratedImageInspection;
  revisedPrompt: string | null;
};

async function resolveImageGenerationReference(
  payload: Pick<AiImageGenerationPayload, "referenceImageDataUrl" | "referenceImageFileName">,
): Promise<ReferenceImageUpload | null> {
  const dataUrl = payload.referenceImageDataUrl?.trim();
  if (dataUrl) {
    return parseReferenceImageDataUrl(dataUrl, payload.referenceImageFileName);
  }

  const fileName = payload.referenceImageFileName?.trim();
  if (!fileName) {
    return null;
  }

  const { readCanvasReferenceImage } = await import("../library/canvasReferenceImages");
  const restored = await readCanvasReferenceImage(fileName);
  return parseReferenceImageDataUrl(restored.dataUrl, restored.fileName);
}

export type ReferenceImageUpload = {
  bytes: Buffer;
  fileName: string;
  mime: SupportedReferenceImageMime;
};

type ImageGenerationRequestContext = {
  background: string;
  batchId: string;
  customInstructionsChars: number;
  endpointHost: string;
  endpointPath: string;
  generationProvider: string;
  hasReference: boolean;
  model: string;
  negativePromptChars: number;
  notificationEnabled: boolean;
  outputFormat: string;
  promptChars: number;
  quality: string;
  referenceImageBytes?: number;
  referenceImageMime?: SupportedReferenceImageMime;
  requestedCount: number;
  size: string;
};

async function resolveGeneratedImages(response: unknown): Promise<ResolvedGeneratedImage[]> {
  const data = isRecord(response) && Array.isArray(response.data) ? response.data : [];
  const images = await Promise.all(
    data.slice(0, 4).map(async (entry): Promise<ResolvedGeneratedImage | null> => {
      if (!isRecord(entry)) {
        return null;
      }

      const revisedPrompt = typeof entry.revised_prompt === "string" ? entry.revised_prompt : null;
      const base64 = typeof entry.b64_json === "string" ? entry.b64_json.trim() : "";
      if (base64) {
        return resolveGeneratedImageBytes(decodeGeneratedImageBase64(base64), revisedPrompt);
      }

      const url = typeof entry.url === "string" ? entry.url.trim() : "";
      if (!url) {
        return null;
      }

      return resolveGeneratedImageBytes(await fetchGeneratedImageBytes(url), revisedPrompt);
    }),
  );
  return images.filter((image): image is ResolvedGeneratedImage => Boolean(image));
}

function decodeGeneratedImageBase64(base64: string): Buffer {
  const normalized = base64.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new AppError("AI_IMAGE_OUTPUT_INVALID", "图像接口返回了无效的 base64 图片内容。");
  }

  const bytes = Buffer.from(normalized, "base64");
  if (bytes.byteLength === 0) {
    throw new AppError("AI_IMAGE_OUTPUT_INVALID", "图像接口返回了空图片内容。");
  }
  return bytes;
}

async function resolveGeneratedImageBytes(
  bytes: Buffer,
  revisedPrompt: string | null,
): Promise<ResolvedGeneratedImage> {
  const inspection = await inspectGeneratedImage(bytes);
  return {
    dataUrl: `data:${inspection.mime};base64,${bytes.toString("base64")}`,
    inspection,
    revisedPrompt,
  };
}

export async function inspectGeneratedImage(bytes: Buffer): Promise<GeneratedImageInspection> {
  const mime = detectImageMimeFromBytes(bytes);
  if (!mime) {
    throw new AppError(
      "AI_IMAGE_OUTPUT_FORMAT_UNSUPPORTED",
      "图像接口返回的内容不是可识别的 PNG、JPEG 或 WebP 图片。",
    );
  }

  try {
    const metadata = await getSharp()(bytes).metadata() as {
      channels?: number;
      format?: string;
      hasAlpha?: boolean;
      height?: number;
      width?: number;
    };
    if (!metadata.width || !metadata.height) {
      throw new Error("缺少图片尺寸信息。");
    }
    const hasAlpha = mime !== "image/jpeg" &&
      (metadata.hasAlpha === true || metadata.channels === 2 || metadata.channels === 4);
    let hasTransparency = false;
    if (hasAlpha) {
      const stats = await getSharp()(bytes).stats();
      const alphaIndex = metadata.channels === 2 ? 1 : 3;
      hasTransparency = (stats.channels[alphaIndex]?.min ?? 255) < 255;
    }

    return {
      format: mime === "image/jpeg" ? "jpeg" : mime === "image/webp" ? "webp" : "png",
      hasAlpha,
      hasTransparency,
      height: metadata.height,
      mime,
      width: metadata.width,
    };
  } catch (error) {
    throw new AppError(
      "AI_IMAGE_OUTPUT_INVALID",
      `图像接口返回了无法解码的 ${mime.replace("image/", "").toUpperCase()} 图片。`,
    );
  }
}

export function validateGeneratedImageSettings(
  inspection: GeneratedImageInspection,
  payload: Pick<AiImageGenerationPayload, "background" | "outputFormat" | "size">,
): void {
  if (payload.outputFormat && inspection.format !== payload.outputFormat) {
    throw new AppError(
      "AI_IMAGE_OUTPUT_FORMAT_MISMATCH",
      `服务商未应用输出格式设置：请求 ${payload.outputFormat.toUpperCase()}，实际返回 ${inspection.format.toUpperCase()}。`,
    );
  }

  const requestedSize = parseExplicitImageGenerationSize(payload.size);
  if (requestedSize) {
    // 各图像模型会把任意 WxH 就近吸附到自己的原生尺寸桶（gpt-image-2 尤其如此），
    // 逐像素精确匹配会把「比例已正确执行」的返回误判为失败。这里只校验比例口径：
    // 1) 请求与返回的宽高比误差超过容差 → 视为比例没落实；
    // 2) 返回分辨率不足请求短边一半 → 视为服务商无视尺寸明显降级。
    const requestedRatio = requestedSize.width / requestedSize.height;
    const actualRatio = inspection.width / inspection.height;
    const ratioDrift = Math.abs(actualRatio - requestedRatio) / requestedRatio;
    const halfScaleDropped =
      Math.min(inspection.width, inspection.height) * 2 < Math.min(requestedSize.width, requestedSize.height);

    if (ratioDrift > IMAGE_SIZE_RATIO_TOLERANCE || halfScaleDropped) {
      throw new AppError(
        "AI_IMAGE_OUTPUT_SIZE_MISMATCH",
        `服务商未应用尺寸设置：请求 ${requestedSize.width}x${requestedSize.height}，实际返回 ${inspection.width}x${inspection.height}。`,
      );
    }
  }

  if (payload.background === "transparent" && !inspection.hasTransparency) {
    throw new AppError(
      "AI_IMAGE_OUTPUT_ALPHA_MISMATCH",
      "服务商未应用透明背景设置：返回图片没有透明像素。",
    );
  }

  if (payload.background === "opaque" && inspection.hasTransparency) {
    throw new AppError(
      "AI_IMAGE_OUTPUT_OPACITY_MISMATCH",
      "服务商未应用不透明背景设置：返回图片仍包含透明像素。",
    );
  }
}

function parseExplicitImageGenerationSize(
  size: AiImageGenerationPayload["size"],
): { height: number; width: number } | null {
  if (!size || size === "auto") {
    return null;
  }
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return null;
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

const IMAGE_SIZE_RATIO_TOLERANCE = 0.03;

function normalizeImageGenerationCount(count: number | undefined): number {
  return Math.max(1, Math.min(4, Math.floor(count ?? 1)));
}

export function parseReferenceImageDataUrl(
  dataUrl: string,
  sourceFileName?: string,
): ReferenceImageUpload {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw createReferenceImageError(
      "AI_REFERENCE_IMAGE_INVALID",
      "参考图数据无效，请重新选择 PNG、JPEG 或 WebP 图片后重试。",
      { dataUrlChars: dataUrl.length },
    );
  }

  const declaredMime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw createReferenceImageError(
      "AI_REFERENCE_IMAGE_INVALID",
      "参考图 base64 编码无效，请重新选择图片后重试。",
      { declaredMime, encodedChars: base64.length },
    );
  }

  const paddingLength = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const estimatedBytes = (base64.length * 3) / 4 - paddingLength;
  if (estimatedBytes > maxReferenceImageBytes) {
    throwReferenceImageTooLarge(estimatedBytes);
  }

  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== base64) {
    throw createReferenceImageError(
      "AI_REFERENCE_IMAGE_INVALID",
      "参考图内容已损坏，请重新导出或重新选择图片后重试。",
      { declaredMime, referenceImageBytes: bytes.byteLength },
    );
  }
  if (bytes.byteLength > maxReferenceImageBytes) {
    throwReferenceImageTooLarge(bytes.byteLength);
  }

  const mime = detectImageMimeFromBytes(bytes);
  if (!mime) {
    throw createReferenceImageError(
      "AI_REFERENCE_IMAGE_FORMAT_UNSUPPORTED",
      "参考图格式不受支持，请转换为 PNG、JPEG 或 WebP 后重试。",
      { declaredMime, referenceImageBytes: bytes.byteLength },
    );
  }

  const extension = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
  const sourceStem = path.parse(path.basename(sourceFileName?.trim() || "reference-image")).name;
  const safeStem = sourceStem.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "reference-image";
  return { bytes, fileName: `${safeStem}${extension}`, mime };
}

export function buildImageEditRequestForm(
  settings: AiProviderSettings,
  payload: AiImageGenerationPayload,
  referenceImage = parseReferenceImageDataUrl(
    payload.referenceImageDataUrl ?? "",
    payload.referenceImageFileName,
  ),
  options: { customInstructions?: string; requestedCount?: number } = {},
): FormData {
  const body = buildImageGenerationRequestBody(settings, payload, options);
  const form = new FormData();

  for (const key of ["model", "prompt", "n", "size", "quality", "output_format", "background"] as const) {
    const value = body[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      form.append(key, String(value));
    }
  }

  form.append(
    "image",
    new Blob([new Uint8Array(referenceImage.bytes)], { type: referenceImage.mime }),
    referenceImage.fileName,
  );
  return form;
}

export function detectImageMimeFromBytes(bytes: Buffer): SupportedImageMime | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function throwReferenceImageTooLarge(byteLength: number): never {
  const sizeMb = Math.ceil((byteLength / (1024 * 1024)) * 10) / 10;
  throw createReferenceImageError(
    "AI_REFERENCE_IMAGE_TOO_LARGE",
    `参考图大小约 ${sizeMb} MB，超过 50 MB 上限。请压缩或缩小图片后重试。`,
    { referenceImageBytes: byteLength },
  );
}

function createReferenceImageError(
  code: string,
  message: string,
  details: Record<string, unknown>,
): AppError {
  logAiEvent("error", "image-generation:reference-invalid", { code, message, ...details });
  return new AppError(code, message);
}


export function normalizeOpenAiCompatibleImagesEndpoint(baseUrl: string): string {
  return normalizeOpenAiCompatibleImageEndpoint(baseUrl, "generations");
}

export function normalizeOpenAiCompatibleImageEditsEndpoint(baseUrl: string): string {
  return normalizeOpenAiCompatibleImageEndpoint(baseUrl, "edits");
}

function normalizeOpenAiCompatibleImageEndpoint(
  baseUrl: string,
  action: "edits" | "generations",
): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

  if (!normalizedBaseUrl) {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址不合法。");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedBaseUrl);
  } catch {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址不合法。");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AppError("AI_BASE_URL_INVALID", "AI 接口地址必须以 http 或 https 开头。");
  }

  if (/\/images\/(?:generations|edits)\/?$/i.test(parsedUrl.pathname)) {
    parsedUrl.pathname = parsedUrl.pathname.replace(
      /\/images\/(?:generations|edits)\/?$/i,
      `/images/${action}`,
    );
    return parsedUrl.toString();
  }

  if (parsedUrl.pathname.endsWith("/chat/completions")) {
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/chat\/completions\/?$/i, `/images/${action}`);
    return parsedUrl.toString();
  }

  parsedUrl.pathname = `${parsedUrl.pathname.replace(/\/+$/, "")}/images/${action}`;
  return parsedUrl.toString();
}

async function requestImageGenerations(
  endpoint: string,
  apiKey: string,
  buildBody: () => BodyInit,
  context: ImageGenerationRequestContext,
): Promise<unknown> {
  const deadlineMs = Date.now() + imageGenerationRequestTimeoutMs;

  for (let attempt = 0; attempt <= imageGenerationMaxRetries; attempt += 1) {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw createImageGenerationTimeoutError(context.hasReference);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);

    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
      if (!context.hasReference) {
        headers["Content-Type"] = "application/json";
      }
      const response = await fetch(endpoint, {
        body: buildBody(),
        headers,
        method: "POST",
        signal: controller.signal,
      });
      const responseText = await response.text();

      if (!response.ok) {
        throw buildImageGenerationRequestError(response.status, responseText, context.hasReference);
      }

      try {
        return JSON.parse(responseText) as unknown;
      } catch {
        throw new AppError("AI_REMOTE_RESPONSE_INVALID", "图像接口返回的响应不是有效 JSON。");
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const isAbort = error instanceof Error && error.name === "AbortError";
      if (isAbort) {
        throw createImageGenerationTimeoutError(context.hasReference);
      }

      // 瞬时网络错误（如 "other side closed"）可重试
      if (attempt < imageGenerationMaxRetries && isTransientNetworkError(error)) {
        const retryDelayMs = Math.min(
          retryBaseDelayMs * (attempt + 1),
          Math.max(0, deadlineMs - Date.now()),
        );
        if (retryDelayMs <= 0) {
          throw createImageGenerationTimeoutError(context.hasReference);
        }
        await sleep(retryDelayMs);
        continue;
      }

      const networkMessage = buildRemoteNetworkFailureMessage(error);
      throw new AppError(
        context.hasReference ? "AI_REFERENCE_IMAGE_NETWORK_FAILED" : "AI_REMOTE_REQUEST_FAILED",
        context.hasReference
          ? `${networkMessage} 请检查网络、代理，并确认接口支持 /images/edits。`
          : networkMessage,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AppError("AI_REMOTE_REQUEST_FAILED", "图像生成失败，已达最大重试次数。");
}

function createImageGenerationTimeoutError(hasReference: boolean): AppError {
  return hasReference
    ? new AppError(
        "AI_REFERENCE_IMAGE_TIMEOUT",
        "参考图生成请求超时。请先压缩参考图后重试，并确认当前接口支持 /images/edits 图生图。",
      )
    : new AppError("AI_REMOTE_TIMEOUT", "图像生成超时，请稍后重试。");
}

function buildImageGenerationRequestError(
  status: number,
  responseText: string,
  hasReference: boolean,
): AppError {
  if (!hasReference) {
    return new AppError("AI_REMOTE_REQUEST_FAILED", buildRemoteRequestFailureMessage(status, responseText));
  }

  const detail = extractRemoteErrorDetail(responseText);
  if (status === 413) {
    return new AppError(
      "AI_REFERENCE_IMAGE_TOO_LARGE",
      "参考图被接口判定为过大。请压缩图片、降低分辨率后重试。",
    );
  }
  if (status === 404 || status === 405 || status === 501) {
    return new AppError(
      "AI_REFERENCE_IMAGE_EDIT_UNSUPPORTED",
      `当前接口不支持参考图生成（状态码 ${status}）。请改用支持 /images/edits 的模型或 API。`,
    );
  }
  if (status === 415) {
    return new AppError(
      "AI_REFERENCE_IMAGE_FORMAT_UNSUPPORTED",
      "接口不接受当前参考图格式。请转换为 PNG 或 JPEG 后重试。",
    );
  }

  return new AppError(
    "AI_REFERENCE_IMAGE_REQUEST_FAILED",
    detail
      ? `参考图生成失败，状态码 ${status}。原因：${detail}`
      : `参考图生成失败，状态码 ${status}。请检查模型是否支持图生图，或压缩参考图后重试。`,
  );
}

async function fetchGeneratedImageBytes(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), imageGenerationRequestTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new AppError("AI_REMOTE_REQUEST_FAILED", `图像下载失败，状态码 ${response.status}。`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) {
      throw new AppError("AI_IMAGE_OUTPUT_INVALID", "图像下载结果为空。");
    }
    return buffer;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("AI_REMOTE_TIMEOUT", "图像下载超时，请稍后重试。");
    }

    throw new AppError("AI_REMOTE_REQUEST_FAILED", "图像下载失败，请检查网络或服务商返回的图片地址。");
  } finally {
    clearTimeout(timer);
  }
}

function buildImageGenerationPrompt(
  prompt: string,
  negativePrompt?: string,
  customInstructions?: string,
): string {
  const positive = prompt.trim();
  const negative = negativePrompt?.trim() ?? "";
  const custom = customInstructions?.trim() ?? "";
  if (!positive) {
    throw new AppError("AI_PROMPT_EMPTY", "请输入图像提示词。");
  }

  return [
    positive,
    custom ? `Additional generation instructions / 附加生成规则：${custom}` : "",
    negative ? `Negative prompt / 反向约束：${negative}` : "",
  ].filter(Boolean).join("\n\n");
}
