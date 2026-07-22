import fs from "node:fs/promises";
import path from "node:path";
import type {
  AiAnalyzePromptPayload,
  AiProviderModelSettings,
  AiProviderSettings,
  AiReverseImagePromptPayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  RemotePromptAnalysis,
  RemotePromptAnalysisSection,
} from "../../../src/features/library/types/ai";
import {
  normalizePromptSectionValue,
  promptSectionMeta,
  splitPromptToTemplate,
  type PromptSplitSectionKey,
} from "../../../src/features/library/utils/promptSplit";
import {
  photographyCategoryGroups,
  photographyCategoryLabels,
} from "../../../src/features/library/utils/photographyCategories";
import { AppError } from "../ipc/errors";
import { getImagePath } from "../library/libraryPaths";

const requestTimeoutMs = 20_000;
const analysisRequestTimeoutMs = 24_000;
const generationRequestTimeoutMs = 45_000;
const maxRetries = 1;
const retryBaseDelayMs = 400;
const maxVisionImageBytes = 8 * 1024 * 1024;
const maxVisionInlineOriginalBytes = 768 * 1024;
const visionThumbnailMaxSize = 960;
const visionThumbnailQuality = 72;
const safetyVisionThumbnailMaxSize = 640;
const safetyVisionThumbnailQuality = 65;
const tagsVisionThumbnailMaxSize = 768;
const tagsVisionThumbnailQuality = 70;
const categoryVisionThumbnailMaxSize = 768;
const categoryVisionThumbnailQuality = 70;
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
const reliablePromptAnalysisSectionGuide = [
  "你是提示词参数胶囊分析器。只分析用户提供的当前提示词文本，不根据图片、历史上下文或想象补内容。",
  "只返回 JSON 对象，不返回 Markdown 或解释。字段必须为 title、category、tags、sections、template、summary。",
  "sections 最多 10 项；复杂提示词最多 14 项。每项包含 key、label、variable、values。",
  "只提取可替换短参数：主体/产品、场景、风格媒介、画幅构图、主体位置、镜头视角、光影、色彩、材质、文案、负面约束。",
  "values 必须是最短可替换短语，通常不超过 12 个汉字或 6 个英文单词；不要完整句子、因果说明、保护性要求或操作指令。",
  "忽略模型名、平台名、SEO、Prompt Gallery、上传说明、代码字段、教程文字和分析文档字段。",
  "常用 key：identity_attribute、product_identity、food_specific_identity、scene_identity、background_view、image_style、photography_style、commercial_visual_style、aspect_ratio、composition、subject_position、camera_angle、lens_equipment、depth_of_field、light_source、light_shadow、scene_color_palette、color_detail、material_texture、product_material、text_content、typography、negative。",
  "如果没有足够可替换参数，sections 可以少于 6 项。不要为了数量臆造内容。",
].join("\n");
const reliablePromptAnalysisKeys = [
  "identity_attribute",
  "product_identity",
  "food_specific_identity",
  "scene_identity",
  "background_view",
  "image_style",
  "photography_style",
  "commercial_visual_style",
  "aspect_ratio",
  "composition",
  "subject_position",
  "camera_angle",
  "lens_equipment",
  "depth_of_field",
  "light_source",
  "light_shadow",
  "scene_color_palette",
  "color_detail",
  "material_texture",
  "product_material",
  "text_content",
  "typography",
  "negative",
].join("、");


function logAiEvent(level: "info" | "error", event: string, details: Record<string, unknown> = {}): void {
  void import("../appLogger")
    .then(({ logger }) => {
      if (level === "error") {
        logger.error("ai", event, details);
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
): Promise<RemotePromptAnalysis> {
  assertRemoteSettings(settings);
  const startedAt = Date.now();
  const budget = getAnalysisRequestBudget(payload.target);

  try {
    const bodyReadyAt = Date.now();
    const body = await buildAnalysisBody(settings, payload);
    const response = await requestChatCompletions(settings, body, true, budget.timeoutMs);
    const content = readAssistantContent(response);
    const analysis = parseRemotePromptAnalysisContent(content);
    logAiEvent("info", "analyze:done", {
      durationMs: Date.now() - startedAt,
      maxTokens: budget.maxTokens,
      ok: true,
      prepareMs: bodyReadyAt - startedAt,
      target: payload.target,
      timeoutMs: budget.timeoutMs,
    });
    return analysis;
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
            content: appendCustomInstructions(reliablePromptOptimizationSystemContent, customInstructions),
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
      capabilities: guessModelCapabilities(id),
    });
  }

  if (models.length === 0) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "模型列表中没有可用模型。");
  }

  return models.slice(0, 120);
}

export function parseRemotePromptAnalysisContent(content: string): RemotePromptAnalysis {
  const parsed = parseJsonObject(stripJsonFence(content));

  if (!isRecord(parsed)) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回结构不合法。");
  }

  const sections = normalizeRemoteSections(parsed.sections);
  const template = normalizeString(parsed.template) || buildTemplateFromSections(sections);
  const categoryValues = Array.isArray(parsed.category)
    ? uniqueStrings(parsed.category)
    : uniqueStrings([parsed.category]);
  const rawCategory = categoryValues[0] ?? "";
  const tags = uniqueStrings([...(Array.isArray(parsed.tags) ? parsed.tags : []), ...categoryValues.slice(1)]);
  const category = rawCategory || tags[0] || "图像生成";
  const analysis: RemotePromptAnalysis = {
    title: normalizeString(parsed.title),
    category,
    tags,
    sections,
    template,
    summary: normalizeString(parsed.summary),
  };

  if (analysis.sections.length === 0 && !analysis.template && analysis.tags.length === 0 && !rawCategory) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 没有返回可用分析结果。");
  }

  return analysis;
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


async function requestChatCompletions(
  settings: AiProviderSettings,
  body: Record<string, unknown>,
  allowResponseFormatRetry: boolean,
  timeoutMs = requestTimeoutMs,
): Promise<unknown> {
  const endpoint = normalizeOpenAiCompatibleEndpoint(settings.baseUrl);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
          return requestChatCompletions(settings, bodyWithoutResponseFormat, false, timeoutMs);
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
        if (attempt < maxRetries) {
          await sleep(retryBaseDelayMs * (attempt + 1));
          continue;
        }

        throw new AppError("AI_REMOTE_TIMEOUT", "远程 AI 响应超时，请稍后重试。");
      }

      if (attempt < maxRetries && isTransientNetworkError(error)) {
        await sleep(retryBaseDelayMs * (attempt + 1));
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
    message.includes("network")
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
      return { maxTokens: 180, temperature: 0, timeoutMs: 16_000 };
    case "prompt-category":
    case "image-category":
      return { maxTokens: 420, temperature: 0.1, timeoutMs: 18_000 };
    case "prompt-tags":
    case "image-tags":
      return { maxTokens: 700, temperature: 0.15, timeoutMs: 20_000 };
    case "prompt-options":
      return { maxTokens: 480, temperature: 0.55, timeoutMs: 16_000 };
    case "prompt":
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
  if (payload.target === "prompt") {
    return [
      `提示词：\n${payload.prompt}`,
      payload.negativePrompt ? `负向提示词：\n${payload.negativePrompt}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (payload.target === "prompt-category") {
    return buildPromptCategoryAnalysisUserText(payload);
  }

  if (payload.target === "prompt-tags") {
    return buildPromptTagsAnalysisUserText(payload);
  }

  if (payload.target === "prompt-options") {
    return [
      `当前提示词：\n${payload.prompt}`,
      payload.negativePrompt ? `负向提示词：\n${payload.negativePrompt}` : "",
      `需要扩展的胶囊：${payload.optionLabel || payload.optionVariable || "提示词参数"}`,
      `变量名：${payload.optionVariable || "textContent"}`,
      `当前词条：${payload.optionValue || ""}`,
      "任务：只基于“当前词条”和“变量名”扩写 3-5 个同类型但不同内容的可替换参数。",
      "要求：不要重新分析整段提示词，不要总结上下文，不要返回当前词条本身。",
      "示例：如果变量是 imageStyle 且当前词条是 Pixar 卡通渲染风格，可返回手稿风格、二次元风格、写实风格、水彩手绘风格等。",
    ]
      .filter(Boolean)
      .join("\n\n");
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

  return [
    { type: "text", text },
    { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
  ];
}

function buildPromptCategoryAnalysisUserText(payload: AiAnalyzePromptPayload): string {
  return [
    "请只根据当前提示词判断分类，不要参考效果图、缩略图、文件名或已有标签。",
    `提示词：\n${payload.prompt}`,
    payload.negativePrompt ? `负向提示词：\n${payload.negativePrompt}` : "",
    "可选细分类如下（只能从中选择，不得新增/缩写/翻译）：",
    buildCompactCategoryCatalog(payload),
    "如果提示词同时匹配多个细分类，请按匹配度从高到低返回，最多 8 个。",
    "返回时 category 必须是最匹配的一个细分类名称；tags 返回其余匹配分类，也必须完全等于上面的细分类名称。",
    "不要返回上级类目、近义词或自造类目；不要输出普通标签、sections 或 template。",
  ]
    .filter(Boolean)
    .join("\n\n");
}


function buildPromptTagsAnalysisUserText(payload: AiAnalyzePromptPayload): string {
  return [
    "请只根据当前提示词生成标签，不要参考效果图、缩略图、文件名或已有标签。",
    `提示词：\n${payload.prompt}`,
    payload.negativePrompt ? `负向提示词：\n${payload.negativePrompt}` : "",
    "只提取文本中明确写出的具体视觉结果标签，最多 12 个。",
    "不要输出维度名/菜单名（如“摄影风格”“景别”“构图逻辑”），应输出落地值（如“近景”“中心构图”“紫色霓虹光”）。",
    "标签不是参数：不得输出位置关系句、生成要求、参考图说明、变量名或完整提示词片段。",
    "不得输出模型名、平台名、SEO 词或营销元信息。标签必须是简体中文短词或短语。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildImageAnalysisUserText(payload: AiAnalyzePromptPayload): string {
  if (payload.target === "image-category") {
    return [
      "请只根据参考图判断图片分类，不要分析提示词或现有标签。",
      "可选细分类如下（只能从中选择，不得新增/缩写/翻译）：",
      buildCompactCategoryCatalog(payload),
      "如果参考图同时匹配多个细分类，请按匹配度从高到低返回，最多 8 个。",
      "返回时 category 必须是最匹配的一个细分类名称；tags 返回其余匹配分类，也必须完全等于上面的细分类名称。",
      "不要返回上级类目、近义词或自造类目。",
    ].join("\n");
  }

  if (payload.target === "image-safety") {
    return [
      "请只根据参考图进行 NSFW 安全分级，不要参考标题、提示词或已有标签。",
      "分级只能是 SFW、NSFW 或 UNKNOWN。",
      "明显裸露、成人色情、强性暗示或限制级内容判为 NSFW；普通人像、时尚穿搭、泳装、情侣合影、室内外日常照如果没有明显成人露骨内容判为 SFW。",
    ].join("\n");
  }

  return [
    "请只根据参考图生成图片标签，不要分析分类或提示词。",
    "必须先观察画面事实，再输出具体结果标签。",
    "不要输出维度名或菜单名，例如不要输出“摄影风格”“景别”“构图逻辑”“图像风格”“镜头器材”“光影表现”。",
    "应该输出实际判断值，例如“杂志封面摄影”“近景”“低角度仰拍”“中心构图”“紫色霓虹光”“丝绸长裙”。",
    "标签不是参数：不得输出位置关系句、生成要求、参考图说明、保留/避免约束、画面目标、变量名或完整提示词片段。",
    "不得输出模型名、平台名、SEO 词、prompt/gallery/ecommerce 等不可见来源或营销元信息；截图里真实可见的站点标识可作为短标签保留。",
    "标签必须是简体中文短词或短语，最多 12 个。",
  ].join("\n");
}


function buildSystemAnalysisContent(target: AiAnalyzePromptPayload["target"]): string {
  const analysisKeys = Object.keys(promptSectionMeta).filter((key) => key !== "other").join("、");
  const base = [
    "只返回一个 JSON 对象，不要返回 Markdown，不要解释。",
    "JSON 字段必须为：title、category、tags、sections、template、summary。",
    "sections 是数组，每项必须包含 key、label、variable、values。",
  ];


  if (target === "image-category") {
    return [
      ...base,
      "你是图片分类识别器。只能根据参考图判断 category 和分类候选。",
      "category 必须从用户提供的固定细分类中原文选择最匹配的一个；严禁新增、缩写、翻译或返回上级类目。",
      "若还匹配其他细分类，tags 返回其余匹配分类，按匹配度排序；category + tags 合计最多 8 个。",
      "不要分析提示词；不要输出普通标签、sections 或 template；sections 空数组，template 空字符串。",
    ].join("\n");
  }


  if (target === "prompt-category") {
    return [
      ...base,
      "你是提示词分类识别器。只能根据提示词文本判断 category 和分类候选。",
      "category 必须从用户提供的固定细分类中原文选择最匹配的一个；严禁新增、缩写、翻译或返回上级类目。",
      "若还匹配其他细分类，tags 返回其余匹配分类，按匹配度排序；category + tags 合计最多 8 个。",
      "不要推断效果图；不要输出普通标签、sections 或 template；sections 空数组，template 空字符串。",
    ].join("\n");
  }


  if (target === "image-tags") {
    return [
      ...base,
      "你是图片标签识别器。只能根据参考图生成 tags。",
      "不要分析分类或提示词；不要输出 sections/template。",
      "tags 返回明确匹配的简体中文短标签，最多 12 个；category 空字符串，sections 空数组，template 空字符串。",
      "禁止返回维度名/菜单名（摄影风格、景别、构图逻辑等）；应输出落地值（近景、中心构图、紫色霓虹光等）。",
      "优先主体、主题、景别、角度、构图、材质、色彩、光影、媒介等可检索视觉结果。",
      "标签不是参数：不得输出位置关系句、生成要求、变量名或完整提示词片段。",
      "不得输出模型名、平台名、SEO 词；截图可见站点标识可作短标签保留。",
    ].join("\n");
  }


  if (target === "prompt-tags") {
    return [
      ...base,
      "你是提示词标签识别器。只能根据提示词文本生成 tags。",
      "不要推断效果图；不要输出分类、sections 或 template。",
      "tags 返回明确来自提示词的简体中文短标签，最多 12 个；category 空字符串，sections 空数组，template 空字符串。",
      "禁止返回维度名/菜单名；应输出落地值（近景、中心构图、紫色霓虹光等）。",
      "标签不是参数：不得输出位置关系句、生成要求、变量名或完整提示词片段。",
      "不得输出模型名、平台名、SEO 词或营销元信息。",
    ].join("\n");
  }


  if (target === "image-safety") {
    return [
      ...base,
      "你是图片 NSFW 安全分级器。只能根据参考图判断安全分级。",
      "category 必须且只能返回 SFW、NSFW 或 UNKNOWN。",
      "tags 必须返回一个数组，只包含与 category 相同的一个值。",
      "summary 用一句简短中文说明依据；sections 返回空数组，template 返回空字符串。",
      "不要输出具体露骨细节，不要生成标签、提示词胶囊或普通分类。",
    ].join("\n");
  }

  if (target === "prompt-options") {
    return [
      ...base,
      "你是提示词胶囊参数扩写器，不是提示词整体分析器。",
      "你的任务是：根据用户给出的变量名、胶囊标签、当前词条，生成 3-5 个同类型但内容不同的可替换参数。",
      `key 只能从这些值中选择：${analysisKeys}。`,
      "sections 只能返回一项，variable 必须完全等于用户给出的变量名，label 使用用户给出的胶囊标签，values 返回 3-5 个短词条。",
      "values 必须全部是同一个参数类型的候选值，例如 imageStyle 只能返回风格类词条，cameraAngle 只能返回拍摄角度类词条。",
      "不要返回当前词条本身，不要返回整句提示词，不要带解释、序号、标点包装或上下文描述。",
      "不要改写整段提示词，不要输出图片分类或图片标签。tags 返回空数组，category 返回空字符串，template 返回空字符串。",
    ].join("\n");
  }

  return [
    reliablePromptAnalysisSectionGuide,
    `key 优先从这些稳定字段中选择：${reliablePromptAnalysisKeys}。如果确实不匹配，可使用系统已有的更精确 key。`,
    "用户用括号或引号明确标记的短词，优先作为胶囊；但仍要过滤指令词、模型名、平台名、教程字段和不可见来源信息。",
    "tags 返回空数组，category 返回空字符串。template 必须使用 {{variable: value}} 占位符，适合用户直接复制后编辑。",
  ].join("\n");
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

  if (knownSet) {
    // 自定义/子集分类：扁平短列表即可，避免无分组信息时再附带完整描述。
    return Array.from(knownSet).join("，");
  }

  // 默认完整摄影细分类：只保留分组 + 名称，去掉冗长描述（通常可减少约一半输入 token）。
  return photographyCategoryGroups
    .map((group) => {
      const labels = group.categories.map(([label]) => label).join("，");
      return `【${group.group}】${labels}`;
    })
    .join("\n");
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
    const imageBuffer = await fs.readFile(getImagePath(imageFileName));
    const policy = resolveVisionImagePayloadPolicy(imageBuffer.byteLength, options);

    if (imageBuffer.byteLength > maxVisionImageBytes) {
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

    if (policy.useOriginal) {
      return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
    }

    return null;
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

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回内容为空。");
  }

  const content = firstChoice.message.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回内容为空。");
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
        throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回的分析结果不是有效 JSON。");
      }
    }

    throw new AppError("AI_REMOTE_RESPONSE_INVALID", "远程 AI 返回的分析结果不是有效 JSON。");
  }
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

function normalizeRemoteSections(input: unknown): RemotePromptAnalysisSection[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.reduce<RemotePromptAnalysisSection[]>((sections, section) => {
      if (!isRecord(section)) {
        return sections;
      }

      const key = normalizeSectionKey(section.key);

      if (!key) {
        return sections;
      }

      const meta = promptSectionMeta[key];
      const values = uniqueStrings(Array.isArray(section.values) ? section.values : []).slice(0, 8);

      if (values.length === 0) {
        return sections;
      }

      for (const value of values) {
        const splitSections = splitPromptToTemplate(value).sections.filter(
          (splitSection) => splitSection.key !== "negative" && splitSection.key !== "other",
        );

        if (splitSections.length > 0) {
          for (const splitSection of splitSections) {
            const splitMeta = promptSectionMeta[splitSection.key];

            upsertRemoteSection(sections, {
              key: splitMeta.key,
              label: splitMeta.label,
              variable: splitMeta.variable,
              values: splitSection.values,
            });
          }

          continue;
        }

        upsertRemoteSection(sections, {
          key: meta.key,
          label: normalizeString(section.label) || meta.label,
          variable: normalizeVariable(section.variable) || meta.variable,
          values: [normalizePromptSectionValue(key, value)],
        });
      }

      return sections;
    }, []);
}

function upsertRemoteSection(
  sections: RemotePromptAnalysisSection[],
  section: RemotePromptAnalysisSection,
): void {
  const values = uniqueStrings(section.values).slice(0, 8);

  if (values.length === 0) {
    return;
  }

  const existingSection = sections.find(
    (existing) => existing.key === section.key && existing.variable === section.variable,
  );

  if (existingSection) {
    existingSection.values = uniqueStrings([...existingSection.values, ...values]).slice(0, 8);
    return;
  }

  sections.push({
    ...section,
    values,
  });
}

function buildTemplateFromSections(sections: RemotePromptAnalysisSection[]): string {
  return sections.map((section) => `${section.label}：{{${section.variable}: ${section.values.join("，")}}}`).join("\n");
}

function normalizeSectionKey(input: unknown): PromptSplitSectionKey | null {
  const key = normalizeString(input);

  if (!Object.prototype.hasOwnProperty.call(promptSectionMeta, key) || key === "other") {
    return null;
  }

  return key as PromptSplitSectionKey;
}

function normalizeVariable(input: unknown): string {
  return normalizeString(input)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32);
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

function guessModelCapabilities(modelId: string): AiProviderModelSettings["capabilities"] {
  const normalizedModelId = modelId.toLowerCase();
  const visionPattern =
    /(?:vision|vl|visual|omni|gpt-4o|gpt-4\.1|gpt-5|o3|o4|gemini|pixtral|llava|qwen[^/]*vl|glm-4v|internvl|minicpm-v)/i;

  return visionPattern.test(normalizedModelId) ? ["text", "vision"] : ["text"];
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
