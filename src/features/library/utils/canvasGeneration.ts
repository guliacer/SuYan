import type { AiImageGenerationPayload, AiImageGenerationSize } from "../types/ai";
import type {
  CanvasAspectRatio,
  CanvasBaseResolution,
  CanvasDraftSettings,
  CanvasPromptOrigin,
  CanvasReferenceImage,
  CanvasSizeMode,
} from "../types/canvas";

export const defaultPositivePromptHeight = 340;

export const defaultCanvasDraftSettings: CanvasDraftSettings = {
  generationProvider: "api",
  creationPanelCollapsed: false,
  prompt: "一间临水而建的新中式茶室，午后阳光穿过竹影，室内摆放陶瓷茶具，安静、温暖、高级感，电影感构图",  positivePromptHeight: defaultPositivePromptHeight,
  referenceImages: [],
  negativePrompt: "低清晰度、模糊、文字水印、畸形手指、过度饱和",
  negativePromptHidden: false,
  positivePromptHidden: false,
  sizePanelHidden: false,
  advancedSettingsOpen: false,
  doubaoModelHidden: true,
  doubaoStyleHidden: true,
  sizeMode: "ratio",
  baseResolution: "1k",
  aspectRatio: "1:1",
  customWidth: 1024,
  customHeight: 1024,
  quality: "auto",
  outputFormat: "png",
  count: 1,
  videoSeconds: 5,
  videoSize: "720P",
  transparentBackground: false,
  notificationEnabled: false,
  autoArchiveEnabled: false,
  doubaoModel: "",
  doubaoStyle: "",
  promptOrigin: null,
};

/**
 * 豆包网页画布的模型 / 风格预设。value 是主进程在豆包页面上按可见文本匹配点击的目标，
 * 空串表示「跟随网页默认」不做任何自动切换。
 *
 * 真实页面结构（playwright 快照 2026-08-02）：
 *   - 模型触发器是 `button` 文本「模型 Seedream 4.5」（以「模型」开头，后跟当前模型名）
 *   - 风格触发器是 `button` 文本「风格」（以「风格」开头）
 *   - 比例触发器是 `button` 文本「比例 自动」
 * 因此模型 value 用豆包显示的模型名（如 `Seedream 4.5`），与按钮里第二段文本匹配。
 * 风格下拉的真实可选文本快照未捕获，先列常见项；点不中只记 WARN 不阻塞生成，
 * 真机确认后在此集中调整。
 */
export const doubaoModelOptions: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "跟随网页默认" },
  { value: "Seedream 4.5", label: "Seedream 4.5" },
  { value: "Seedream 4.0", label: "Seedream 4.0" },
  { value: "Seedream 3.0", label: "Seedream 3.0" },
];

export const doubaoStyleOptions: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "跟随网页默认" },
  { value: "写实", label: "写实" },
  { value: "动漫", label: "动漫" },
  { value: "3D", label: "3D" },
  { value: "油画", label: "油画" },
  { value: "水彩", label: "水彩" },
  { value: "国风", label: "国风" },
  { value: "赛博朋克", label: "赛博朋克" },
];

export const canvasAspectRatioOptions: ReadonlyArray<{
  value: CanvasAspectRatio;
  label: string;
  orientation: "square" | "landscape" | "portrait";
}> = [
  { value: "1:1", label: "1:1", orientation: "square" },
  { value: "3:2", label: "3:2", orientation: "landscape" },
  { value: "2:3", label: "2:3", orientation: "portrait" },
  { value: "16:9", label: "16:9", orientation: "landscape" },
  { value: "9:16", label: "9:16", orientation: "portrait" },
  { value: "4:3", label: "4:3", orientation: "landscape" },
  { value: "3:4", label: "3:4", orientation: "portrait" },
  { value: "21:9", label: "21:9", orientation: "landscape" },
];

/** Agnes Image 2.x 的原生输出尺寸表。尺寸档位必须与比例一起使用，
 * 否则服务会把非原生宽高标准化，甚至在高分辨率请求中长时间不返回。 */
const agnesOutputDimensions: Readonly<Record<CanvasAspectRatio, Readonly<Record<CanvasBaseResolution, readonly [number, number]>>>> = {
  "1:1": {
    "1k": [1024, 1024],
    "2k": [2048, 2048],
    "3k": [3072, 3072],
    "4k": [4096, 4096],
  },
  "3:4": {
    "1k": [864, 1152],
    "2k": [1728, 2304],
    "3k": [2592, 3456],
    "4k": [3456, 4608],
  },
  "4:3": {
    "1k": [1152, 864],
    "2k": [2304, 1728],
    "3k": [3456, 2592],
    "4k": [4608, 3456],
  },
  "16:9": {
    "1k": [1312, 736],
    "2k": [2624, 1472],
    "3k": [3936, 2208],
    "4k": [5248, 2944],
  },
  "9:16": {
    "1k": [736, 1312],
    "2k": [1472, 2624],
    "3k": [2208, 3936],
    "4k": [2944, 5248],
  },
  "2:3": {
    "1k": [832, 1248],
    "2k": [1664, 2496],
    "3k": [2496, 3744],
    "4k": [3328, 4992],
  },
  "3:2": {
    "1k": [1248, 832],
    "2k": [2496, 1664],
    "3k": [3744, 2496],
    "4k": [4992, 3328],
  },
  "21:9": {
    "1k": [1568, 672],
    "2k": [3136, 1344],
    "3k": [4704, 2016],
    "4k": [6272, 2688],
  },
};

export function normalizeCanvasDraftSettings(input: unknown): CanvasDraftSettings {
  if (!isRecord(input)) {
    return { ...defaultCanvasDraftSettings };
  }

  const transparentBackground = input.transparentBackground === true;
  const outputFormat = isOutputFormat(input.outputFormat) ? input.outputFormat : defaultCanvasDraftSettings.outputFormat;

  return {
    // 豆包网页画布已下线（回归默认 API 生图）。强制 provider 为 api，
    // 防止旧草稿里残留的 "doubao-web" 仍触发豆包后台逻辑。
    generationProvider: "api",
    creationPanelCollapsed: input.creationPanelCollapsed === true,
    prompt: typeof input.prompt === "string" ? input.prompt : defaultCanvasDraftSettings.prompt,
    positivePromptHeight: normalizePositivePromptHeight(input.positivePromptHeight),
    referenceImages: normalizeReferenceImages(input.referenceImages),
    negativePrompt: typeof input.negativePrompt === "string" ? input.negativePrompt : defaultCanvasDraftSettings.negativePrompt,
    negativePromptHidden: input.negativePromptHidden === true,
    positivePromptHidden: input.positivePromptHidden === true,
    sizePanelHidden: input.sizePanelHidden === true,
    advancedSettingsOpen: input.advancedSettingsOpen === true,
    doubaoModelHidden: input.doubaoModelHidden !== false,
    doubaoStyleHidden: input.doubaoStyleHidden !== false,
    sizeMode: isSizeMode(input.sizeMode) ? input.sizeMode : defaultCanvasDraftSettings.sizeMode,
    baseResolution: isBaseResolution(input.baseResolution)
      ? input.baseResolution
      : defaultCanvasDraftSettings.baseResolution,
    aspectRatio: isAspectRatio(input.aspectRatio) ? input.aspectRatio : defaultCanvasDraftSettings.aspectRatio,
    customWidth: normalizeDimension(input.customWidth, defaultCanvasDraftSettings.customWidth),
    customHeight: normalizeDimension(input.customHeight, defaultCanvasDraftSettings.customHeight),
    quality: isQuality(input.quality) ? input.quality : defaultCanvasDraftSettings.quality,
    outputFormat: transparentBackground && outputFormat === "jpeg" ? "png" : outputFormat,
    count: normalizeCount(input.count),
    videoSeconds: normalizeVideoSeconds(input.videoSeconds),
    videoSize: isVideoSize(input.videoSize) ? input.videoSize : defaultCanvasDraftSettings.videoSize,
    transparentBackground,
    notificationEnabled: input.notificationEnabled === true,
    autoArchiveEnabled: input.autoArchiveEnabled === true,
    doubaoModel: normalizeDoubaoOption(input.doubaoModel, doubaoModelOptions),
    doubaoStyle: normalizeDoubaoOption(input.doubaoStyle, doubaoStyleOptions),
    // 只在持久化时剥离，见 buildLibraryViewSettings。
    promptOrigin: normalizeCanvasPromptOrigin(input.promptOrigin),
  };
}

/**
 * 校验「传送到画布」带来的来源血缘。形状不完整就整体丢弃，
 * 宁可退化成「自由创作」新建一组，也不要拿半个身份去污染已有提示词组。
 */
export function normalizeCanvasPromptOrigin(input: unknown): CanvasPromptOrigin | null {
  if (!isRecord(input)) {
    return null;
  }

  const itemId = typeof input.itemId === "string" ? input.itemId.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt : "";

  // 没有来源 id 或没有比对基准，血缘无从校验。
  if (!itemId || !prompt.trim()) {
    return null;
  }

  return {
    itemId,
    prompt,
    negativePrompt: typeof input.negativePrompt === "string" ? input.negativePrompt : "",
    title: typeof input.title === "string" ? input.title : "",
    tags: normalizeOriginStringArray(input.tags),
    category: typeof input.category === "string" && input.category.trim() ? input.category : null,
    categoryId: typeof input.categoryId === "string" && input.categoryId.trim() ? input.categoryId : null,
    genreIds: normalizeOriginStringArray(input.genreIds),
    categoryConfidence:
      typeof input.categoryConfidence === "number" && Number.isFinite(input.categoryConfidence)
        ? input.categoryConfidence
        : null,
    categorySource:
      input.categorySource === "system" || input.categorySource === "user" || input.categorySource === "ai" || input.categorySource === "local"
        ? input.categorySource
        : null,
  };
}

/**
 * 判断当前草稿是否仍忠于来源提示词组：正负提示词都与传送那一刻一致才算。
 * 一致 → 新图继承来源组身份，归入原组；不一致 → 视为新创作，另立一组。
 */
export function shouldInheritCanvasPromptOrigin(
  origin: CanvasPromptOrigin | null,
  prompt: string,
  negativePrompt: string,
): boolean {
  if (!origin) {
    return false;
  }

  return (
    normalizePromptIdentityText(origin.prompt) === normalizePromptIdentityText(prompt) &&
    normalizePromptIdentityText(origin.negativePrompt) === normalizePromptIdentityText(negativePrompt)
  );
}

/** 与 getPromptImageGroupKey 的 normalizeGroupText 保持一致，避免仅空白/大小写差异被判成改动。 */
function normalizePromptIdentityText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeReferenceImages(input: unknown): CanvasReferenceImage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const entries: CanvasReferenceImage[] = [];
  for (const entry of input) {
    if (!isRecord(entry)) {
      continue;
    }
    const fileName = typeof entry.fileName === "string" ? entry.fileName.trim() : "";
    const title = typeof entry.title === "string" ? entry.title : "";
    const dataUrl = typeof entry.dataUrl === "string" ? entry.dataUrl : "";
    if (!fileName && !dataUrl) {
      continue;
    }
    entries.push({ dataUrl, fileName, title });
  }
  return entries;
}

function normalizeOriginStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveCanvasGenerationSize(settings: Pick<
  CanvasDraftSettings,
  "sizeMode" | "baseResolution" | "aspectRatio" | "customWidth" | "customHeight"
>): AiImageGenerationSize {
  if (settings.sizeMode === "auto") {
    return "auto";
  }

  if (settings.sizeMode === "custom") {
    return `${normalizeDimension(settings.customWidth, 1024)}x${normalizeDimension(settings.customHeight, 1024)}`;
  }

  const [width, height] = agnesOutputDimensions[settings.aspectRatio][settings.baseResolution];
  return `${width}x${height}`;
}

export function buildCanvasImageGenerationPayload(
  settings: CanvasDraftSettings,
  runtime: {
    apiModelId?: string;
    apiProfileId?: string;
    negativePrompt?: string;
    prompt?: string;
    mediaType?: "image" | "video";
  } = {},
): AiImageGenerationPayload {
  const outputFormat =
    settings.transparentBackground && settings.outputFormat === "jpeg"
      ? "png"
      : settings.outputFormat;
  const isDoubaoWeb = settings.generationProvider === "doubao-web";

  return {
    apiModelId: runtime.apiModelId,
    apiProfileId: runtime.apiProfileId,
    background: settings.transparentBackground ? "transparent" : "opaque",
    doubaoModel: isDoubaoWeb ? settings.doubaoModel : undefined,
    doubaoStyle: isDoubaoWeb ? settings.doubaoStyle : undefined,
    generationProvider: settings.generationProvider,
    ...(runtime.mediaType === "video" ? { mediaType: "video" as const } : {}),
    n: settings.count,
    negativePrompt: (runtime.negativePrompt ?? settings.negativePrompt).trim(),
    notificationEnabled: settings.notificationEnabled,
    outputFormat,
    prompt: (runtime.prompt ?? settings.prompt).trim(),
    quality: settings.quality,
    referenceImageDataUrls: settings.referenceImages.map((r) => r.dataUrl).filter(Boolean) || undefined,
    referenceImageFileNames: settings.referenceImages.map((r) => r.fileName).filter(Boolean) || undefined,
    ...(settings.sizeMode === "ratio" ? { ratio: settings.aspectRatio } : {}),
    size: resolveCanvasGenerationSize(settings),
    ...(runtime.mediaType === "video"
      ? { videoSeconds: settings.videoSeconds, videoSize: settings.videoSize }
      : {}),
  };
}

export function getCanvasGenerationSizeLabel(size: AiImageGenerationSize): string {
  if (size === "auto") {
    return "由模型自动决定";
  }

  const [width, height] = size.split("x").map(Number);
  const direction = width === height ? "方形" : width > height ? "横向" : "竖向";
  return `${direction} ${width} × ${height}`;
}

/**
 * 从提示词本地抽取关键词，用于「Prompt Evolution」展示。纯前端切分，不请求 AI，
 * 也不参与生成逻辑。按中英文常见分隔符切分、去重、按长度过滤，最多取 5 个。
 */
export function extractPromptKeywords(prompt: string, limit = 5): string[] {
  const segments = prompt
    .split(/[，,、。.!！?？;；\n\r]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment.length <= 24);

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keywords.push(segment);
    if (keywords.length >= limit) {
      break;
    }
  }
  return keywords;
}

function normalizePositivePromptHeight(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return defaultCanvasDraftSettings.positivePromptHeight;
  }
  return Math.max(192, Math.min(720, Math.round(input)));
}

function normalizeDimension(input: unknown, fallback: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return fallback;
  }
  return Math.max(256, Math.min(4096, Math.round(input)));
}

function normalizeCount(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return defaultCanvasDraftSettings.count;
  }
  return Math.max(1, Math.min(4, Math.round(input)));
}

function normalizeVideoSeconds(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return defaultCanvasDraftSettings.videoSeconds;
  }
  return Math.max(4, Math.min(12, Math.round(input)));
}

function normalizeDoubaoOption(
  input: unknown,
  options: ReadonlyArray<{ value: string }>,
): string {
  return typeof input === "string" && options.some((option) => option.value === input) ? input : "";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isSizeMode(input: unknown): input is CanvasSizeMode {
  return input === "auto" || input === "ratio" || input === "custom";
}

function isBaseResolution(input: unknown): input is CanvasBaseResolution {
  return input === "1k" || input === "2k" || input === "3k" || input === "4k";
}

function isAspectRatio(input: unknown): input is CanvasAspectRatio {
  return canvasAspectRatioOptions.some((option) => option.value === input);
}

function isQuality(input: unknown): input is CanvasDraftSettings["quality"] {
  return input === "auto" || input === "low" || input === "medium" || input === "high";
}

function isOutputFormat(input: unknown): input is CanvasDraftSettings["outputFormat"] {
  return input === "png" || input === "jpeg" || input === "webp";
}

function isVideoSize(input: unknown): input is CanvasDraftSettings["videoSize"] {
  return input === "720P" || input === "960P" || input === "2K";
}
