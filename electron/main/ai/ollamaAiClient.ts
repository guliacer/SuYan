import type {
  AiAnalyzePromptPayload,
  AiOptimizePromptPayload,
  AiProviderModelSettings,
  AiProviderSettings,
  AiReverseImagePromptPayload,
  AiSummarizePromptTitlePayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  RemotePromptAnalysisV2,
} from "../../../src/features/library/types/ai";
import { normalizeAiBaseUrlForProvider } from "../../../src/features/library/utils/aiBaseUrl";
import { AppError } from "../ipc/errors";
import {
  buildImageAnalysisUserText,
  buildPromptCategoryAnalysisUserText,
  buildPromptOptimizationScopeInstructions,
  buildPromptTagsAnalysisUserText,
  buildSystemAnalysisContent,
  parseRemoteOptimizedPromptContent,
  parseRemotePromptAnalysisV2Content,
  parseRemotePromptTitleContent,
  parseRemoteTranslatedPromptContent,
  readPayloadImageDataUrl,
} from "./remoteAiClient";

type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
};

type OllamaChatOptions = {
  format?: "json";
  /** Disable Ollama thinking output when the feature requires a clean user-facing result. */
  think?: boolean;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
};

const ollamaRequestTimeoutMs = 120_000;
const ollamaModelShowConcurrency = 4;
const ollamaVisionModelPattern = /(?:llava|bakllava|mllama|llama3\.2[-_:]?vision|qwen(?:2(?:\.5)?|3)?[-_.]?vl|minicpm[-_]?v|moondream|internvl|phi[-_.]?3\.5[-_.]?vision|pixtral|gemma3:(?:4b|12b|27b)|glm[-_]?4v|vision|visual|multimodal)/i;

/** Use Electron's network stack in production, but keep pure unit tests on the global fetch. */
async function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (process.env.NODE_ENV === "test") {
    return globalThis.fetch(input, init);
  }

  try {
    // Dynamic require keeps this module importable from Vitest without loading Electron.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron") as { net?: { fetch?: typeof fetch } } | undefined;
    if (typeof electron?.net?.fetch === "function") {
      return electron.net.fetch(input, init);
    }
  } catch {
    // Fall back to the runtime fetch in non-Electron environments.
  }

  return globalThis.fetch(input, init);
}

/** Ollama uses its native /api endpoints and must never inherit OpenAI's /v1 suffix. */
export function normalizeOllamaBaseUrl(input: string): string {
  const normalized = normalizeAiBaseUrlForProvider(input, "ollama");

  if (!normalized) {
    throw new AppError("AI_BASE_URL_INVALID", "Ollama 地址不合法。");
  }

  return normalized;
}

export function parseOllamaTags(input: unknown): Array<{
  id: string;
  label: string;
  capabilities?: AiProviderModelSettings["capabilities"];
}> {
  if (!isRecord(input) || !Array.isArray(input.models)) {
    throw new AppError("AI_OLLAMA_RESPONSE_INVALID", "Ollama 模型列表返回结构不合法。");
  }

  const seen = new Set<string>();
  const models: Array<{ id: string; label: string }> = [];
  for (const value of input.models) {
    if (!isRecord(value)) {
      continue;
    }

    const id = normalizeString(value.name) || normalizeString(value.model);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    const capabilities = parseOllamaModelCapabilities(value, id);
    models.push({
      id,
      label: id,
      ...(capabilities.includes("vision") ? { capabilities } : {}),
    });
  }

  if (models.length === 0) {
    throw new AppError("AI_OLLAMA_RESPONSE_INVALID", "Ollama 中没有已安装模型，请先执行 ollama pull。 ".trim());
  }

  return models.slice(0, 120);
}

export function parseOllamaModelCapabilities(input: unknown, modelId: string): AiProviderModelSettings["capabilities"] {
  const isVision = hasOllamaVisionCapability(input) || ollamaVisionModelPattern.test(modelId);

  return isVision ? ["text", "vision"] : ["text"];
}

export function parseOllamaChatResponse(input: unknown): string {
  if (!isRecord(input) || !isRecord(input.message)) {
    throw new AppError("AI_OLLAMA_RESPONSE_INVALID", "Ollama 返回结构不合法。");
  }

  const message = input.message;
  // `thinking` is an internal reasoning channel. It must never be promoted to
  // visible content when the model leaves `message.content` empty.
  const content = stripOllamaThinking(normalizeString(message.content));
  if (!content) {
    throw new AppError("AI_OLLAMA_RESPONSE_INVALID", "Ollama 没有返回可用内容。");
  }

  return content;
}

export async function listOllamaModels(settings: AiProviderSettings): Promise<AiProviderModelSettings[]> {
  const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
  const tags = parseOllamaTags(await requestOllamaJson(baseUrl, "/api/tags", { method: "GET" }));
  const models: AiProviderModelSettings[] = [];

  for (let index = 0; index < tags.length; index += ollamaModelShowConcurrency) {
    const batch = tags.slice(index, index + ollamaModelShowConcurrency);
    const described = await Promise.all(batch.map(async (model) => {
      try {
        const detail = await requestOllamaJson(baseUrl, "/api/show", {
          body: JSON.stringify({ model: model.id }),
          method: "POST",
        });
        return {
          id: model.id,
          label: model.label,
          capabilities: parseOllamaModelCapabilities(
            model.capabilities ? { detail, capabilities: model.capabilities } : detail,
            model.id,
          ),
        } satisfies AiProviderModelSettings;
      } catch {
        // A single model can disappear during a refresh. Keep it visible as a
        // text model so the user can remove it or retry without losing the list.
        return {
          id: model.id,
          label: model.label,
          capabilities: model.capabilities ?? ["text"],
        } satisfies AiProviderModelSettings;
      }
    }));
    models.push(...described);
  }

  return models;
}

export async function testOllamaConnection(settings: AiProviderSettings): Promise<{ connected: true }> {
  await requestOllamaChat(settings, [
    { role: "user", content: "请只回复：连接成功" },
  ], { temperature: 0, numPredict: 16, timeoutMs: 30_000 });
  return { connected: true };
}

export async function analyzePromptWithOllama(
  settings: AiProviderSettings,
  payload: AiAnalyzePromptPayload,
): Promise<RemotePromptAnalysisV2> {
  const system = appendCustomInstructions(buildSystemAnalysisContent(payload.target), payload.customInstructions);
  const user = await buildOllamaAnalysisMessage(payload);
  const content = await requestOllamaChat(settings, [
    { role: "system", content: system },
    user,
  ], { format: "json", temperature: 0.1, numPredict: 6000 });

  return parseRemotePromptAnalysisV2Content(content, payload.target);
}

export async function optimizePromptWithOllama(
  settings: AiProviderSettings,
  prompt: string,
  customInstructions = "",
  promptKind: AiOptimizePromptPayload["promptKind"] = "positive",
): Promise<string> {
  const system = appendCustomInstructions([
    "你是图像生成提示词优化器。只输出优化后的提示词正文，不输出解释、标题、Markdown、JSON 或参数胶囊。",
    "保留用户的主体、题材、用途和限制，不得凭空增加无关主体。按需要补齐风格、构图、光影、材质与质量约束。",
    buildPromptOptimizationScopeInstructions(promptKind),
  ].join("\n"), customInstructions);
  const content = await requestOllamaChat(settings, [
    { role: "system", content: system },
    { role: "user", content: `待优化提示词：\n${prompt}` },
  ], { temperature: 0.35, numPredict: 1800 });

  return parseRemoteOptimizedPromptContent(content);
}

export async function summarizeTitleWithOllama(
  settings: AiProviderSettings,
  payload: AiSummarizePromptTitlePayload,
): Promise<string> {
  const system = appendCustomInstructions(
    "你是图库编辑。根据提示词生成简短、贴切的作品标题。只输出标题本身，不要解释、引号或标点。中文或中日韩混合不超过25个字符，纯英文不超过40个字符。",
    payload.customInstructions,
  );
  const content = await requestOllamaChat(settings, [
    { role: "system", content: system },
    { role: "user", content: payload.prompt },
  ], { temperature: 0.2, numPredict: 120 });

  return parseRemotePromptTitleContent(content);
}

export async function translatePromptWithOllama(
  settings: AiProviderSettings,
  payload: AiTranslatePromptPayload,
  customInstructions = "",
): Promise<AiTranslatePromptData> {
  const target = payload.targetLanguage === "zh" ? "简体中文" : "English";
  const source = payload.sourceLanguage === "zh" ? "简体中文" : payload.sourceLanguage === "en" ? "English" : "自动识别";
  const system = appendCustomInstructions(
    "你是图像与视频提示词翻译器。只做忠实翻译，不优化、不扩写、不删减。保留模型名、权重、变量、URL、参数和换行层次。只返回 JSON 对象，字段必须为 prompt 和 negativePrompt。",
    customInstructions,
  );
  const content = await requestOllamaChat(settings, [
    { role: "system", content: system },
    { role: "user", content: [`源语言：${source}`, `目标语言：${target}`, `正向提示词：\n${payload.prompt}`, `负向提示词：\n${payload.negativePrompt ?? ""}`].join("\n\n") },
  ], { format: "json", temperature: 0.15, numPredict: 2200 });

  return parseRemoteTranslatedPromptContent(content);
}

export async function reverseImagePromptWithOllama(
  settings: AiProviderSettings,
  payload: AiReverseImagePromptPayload,
  customInstructions = "",
): Promise<string> {
  const imageDataUrl = await readPayloadImageDataUrl(payload.imageFileName, { compact: true, purpose: "reverse" });
  if (!imageDataUrl) {
    throw new AppError("AI_IMAGE_REQUIRED", "需要可用参考图才能进行图像识别。");
  }

  const system = [
    appendCustomInstructions(
      "你是图像反推提示词助手。只根据图片中真实可见内容生成一段可用于生成相似图像的提示词正文，不要解释，不要臆测不可见内容。",
      customInstructions,
    ),
    "【最终输出硬约束】",
    "你可以在内部完成分析，但不得把思考过程、Role、Background、Attention、Profile、Skills、Goals、Constraints、Workflow、Suggestions、Examples、步骤、编号或分析标题输出给用户。",
    "最终只返回一个 JSON 对象，格式必须是 {\"prompt\":\"最终提示词正文\"}，不要 Markdown 代码块，不要额外字段，不要 JSON 之外的文字。prompt 只能放最终可直接用于生图的提示词正文。",
  ].join("\n\n");
  const messages: OllamaMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: "请严格基于这张参考图进行提示词反推。",
      images: [extractBase64(imageDataUrl)],
    },
  ];
  const content = await requestOllamaChat(settings, messages, { format: "json", think: false, temperature: 0.2, numPredict: 1400 });

  return parseOllamaReverseImagePromptContent(content);
}

async function buildOllamaAnalysisMessage(payload: AiAnalyzePromptPayload): Promise<OllamaMessage> {
  if (payload.target === "prompt-category") {
    return { role: "user", content: buildPromptCategoryAnalysisUserText(payload) };
  }

  if (payload.target === "prompt-tags") {
    return { role: "user", content: buildPromptTagsAnalysisUserText(payload) };
  }

  const imageDataUrl = await readPayloadImageDataUrl(payload.imageFileName, {
    compact: true,
    purpose: payload.target === "image-safety" ? "safety" : payload.target === "image-category" ? "category" : "tags",
  });
  if (!imageDataUrl) {
    throw new AppError("AI_IMAGE_REQUIRED", "需要可用参考图才能进行图像识别。");
  }

  return {
    role: "user",
    content: buildImageAnalysisUserText(payload),
    images: [extractBase64(imageDataUrl)],
  };
}

async function requestOllamaChat(
  settings: AiProviderSettings,
  messages: OllamaMessage[],
  options: OllamaChatOptions = {},
): Promise<string> {
  const model = settings.model.trim();
  if (!model) {
    throw new AppError("AI_MODEL_MISSING", "当前 Ollama 没有选择模型，请先查询并选择一个本地模型。");
  }

  const baseUrl = normalizeOllamaBaseUrl(settings.baseUrl);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
    ...(options.format ? { format: options.format } : {}),
    ...(typeof options.think === "boolean" ? { think: options.think } : {}),
    options: {
      temperature: options.temperature ?? 0.2,
      num_predict: options.numPredict ?? 2000,
    },
  };

  const response = await requestOllamaJson(baseUrl, "/api/chat", {
    body: JSON.stringify(body),
    method: "POST",
    timeoutMs: options.timeoutMs,
  });

  return parseOllamaChatResponse(response);
}

/**
 * Ollama thinking models may put visible reasoning in either a separate
 * `thinking` field or `<think>...</think>` inside `message.content`. Only the
 * final content channel is allowed to reach feature-specific parsers.
 */
function stripOllamaThinking(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

export function parseOllamaReverseImagePromptContent(content: string): string {
  const normalized = stripOllamaThinking(content).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let prompt = "";

  if (looksLikeVisibleAnalysis(normalized)) {
    throw new AppError(
      "AI_OLLAMA_RESPONSE_INVALID",
      "Ollama 输出了分析过程而不是最终提示词，请关闭模型思考输出或更换视觉模型后重试。",
    );
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (isRecord(parsed) && typeof parsed.prompt === "string") {
      prompt = parsed.prompt.trim();
    }
  } catch {
    // Do not accept a plain-text fallback here. A model that ignores the JSON
    // contract may have mixed its reasoning into the prompt; failing closed
    // prevents that analysis from being saved as a user-facing result.
  }

  if (!prompt) {
    throw new AppError("AI_OLLAMA_RESPONSE_INVALID", "Ollama 未按要求返回最终图像反推提示词，请重试或更换视觉模型。 ".trim());
  }

  if (looksLikeVisibleAnalysis(prompt)) {
    throw new AppError(
      "AI_OLLAMA_RESPONSE_INVALID",
      "Ollama 输出了分析过程而不是最终提示词，请关闭模型思考输出或更换视觉模型后重试。",
    );
  }

  return prompt;
}

function looksLikeVisibleAnalysis(content: string): boolean {
  const normalized = content.toLocaleLowerCase();
  const markers = [
    "角色分析",
    "背景分析",
    "注意力分析",
    "画像分析",
    "能力分析",
    "目标分析",
    "约束分析",
    "工作流分析",
    "建议分析",
    "示例分析",
    "role analysis",
    "background analysis",
    "workflow analysis",
  ];
  const markerCount = markers.filter((marker) => normalized.includes(marker.toLocaleLowerCase())).length;
  const numberedSections = /(?:^|\n)\s*(?:\d+|[一二三四五六七八九十]+)[.、)]\s*\*{0,2}[^\n]{2,}(?:分析|analysis)/iu.test(content);
  return markerCount >= 2 || numberedSections;
}

async function requestOllamaJson(
  baseUrl: string,
  pathname: string,
  init: { body?: string; method: "GET" | "POST"; timeoutMs?: number },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? ollamaRequestTimeoutMs);
  try {
    const response = await platformFetch(`${baseUrl}${pathname}`, {
      body: init.body,
      headers: { "Content-Type": "application/json" },
      method: init.method,
      signal: controller.signal,
    });
    const responseText = await response.text();
    const payload = parseResponseJson(responseText, response.ok);

    if (!response.ok) {
      const detail = extractOllamaError(payload);
      if (response.status === 404 && /model|not found|pull/i.test(detail)) {
        throw new AppError("AI_OLLAMA_MODEL_NOT_FOUND", `Ollama 未找到模型「${detail || "当前模型"}」，请先安装该模型。`);
      }
      throw new AppError("AI_OLLAMA_REQUEST_FAILED", detail ? `Ollama 请求失败：${detail}` : `Ollama 请求失败，状态码 ${response.status}。`);
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("AI_OLLAMA_TIMEOUT", "Ollama 响应超时，请检查本地模型是否仍在运行。 ".trim());
    }
    throw new AppError("AI_OLLAMA_UNAVAILABLE", "无法连接 Ollama，请确认 Ollama 已启动并监听当前地址。 ");
  } finally {
    clearTimeout(timer);
  }
}

function parseResponseJson(responseText: string, responseOk = true): unknown {
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    if (!responseOk) {
      return { error: responseText.trim().slice(0, 240) };
    }
    throw new AppError("AI_OLLAMA_RESPONSE_INVALID", "Ollama 返回的响应不是有效 JSON。");
  }
}

function hasOllamaVisionCapability(input: unknown): boolean {
  const visit = (value: unknown, key = ""): boolean => {
    if (typeof value === "boolean") {
      return value && isVisionField(key);
    }

    if (typeof value === "string") {
      return isVisionField(key) && /vision|visual|multimodal|image(?:[_-]?(?:input|understanding|modality))?|projector|mmproj/i.test(value) ||
        isVisionFamilyField(key) && /llava|bakllava|mllama|qwen(?:2(?:\.5)?|3)?[-_.]?vl|minicpm[-_]?v|internvl|pixtral|glm[-_]?4v/i.test(value);
    }

    if (typeof value === "number") {
      return /(?:^|[._-])(?:vision|projector|mmproj)(?:[._-]|$)/i.test(key);
    }

    if (Array.isArray(value)) {
      return value.some((item) => visit(item, key));
    }

    if (!isRecord(value)) {
      return false;
    }

    return Object.entries(value).some(([nestedKey, nestedValue]) => visit(nestedValue, nestedKey));
  };

  return visit(input);
}

function isVisionField(key: string): boolean {
  return /capabil|modalit|vision|visual|multimodal|image|projector|mmproj/i.test(key);
}

function isVisionFamilyField(key: string): boolean {
  return /(?:^|\.)(?:family|families|architecture)$/i.test(key);
}

function extractOllamaError(input: unknown): string {
  if (isRecord(input) && typeof input.error === "string") {
    return input.error.trim().slice(0, 240);
  }
  return "";
}

function extractBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function appendCustomInstructions(base: string, customInstructions?: string): string {
  const custom = customInstructions?.trim();
  return custom ? `${base}\n\n用户配置的补充规则：\n${custom}` : base;
}

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function isRecord(input: unknown): input is Record<string, any> {
  return typeof input === "object" && input !== null;
}
