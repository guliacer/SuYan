import { matchGenerationModelLabel } from "../../src/features/library/utils/generationModels";

export type PromptImportDraft = {
  title: string;
  prompt: string;
  negativePrompt: string;
  tags: string[];
  generationMethod: string | null;
  sourceUrl: string | null;
  sourceImageUrl: string | null;
  sourceImageUrls?: string[];
  authorName: string | null;
  authorUrl: string | null;
  authorAvatarUrl: string | null;
};

export type PngTextChunk = {
  keyword: string;
  text: string;
};

type DraftPatch = Partial<PromptImportDraft>;

export type XStatusInfo = {
  sourceUrl: string;
  statusId: string;
  username: string | null;
};

export type GptImage2GalleryInfo = {
  sourceUrl: string;
  rawUrl: string;
  owner: string;
  repo: string;
  ref: string;
  path: string;
};

export type WebToMindPromptInfo = {
  sourceUrl: string;
};

export type XmiaomPromptInfo = {
  sourceUrl: string;
  imageId: string;
};

export type JimengWorkInfo = {
  sourceUrl: string;
  workId: string;
};

export type KnownPromptSiteInfo = {
  sourceUrl: string;
  siteName: string;
  siteUrl: string;
  siteIconUrl: string;
  tags: string[];
};

type KnownPromptSiteDefinition = {
  hosts: string[];
  siteName: string;
  siteUrl: string;
  siteIconUrl?: string;
  tags: string[];
};

const maxTitleLength = 42;
const maxTagCount = 12;
const maxTagLength = 24;

const titleKeys = ["title", "name", "promptTitle", "prompt_title", "标题", "名称"];
const promptKeys = ["prompt", "positivePrompt", "positive_prompt", "content", "text", "description", "正向提示词", "提示词"];
const negativeKeys = ["negativePrompt", "negative_prompt", "negative", "反向提示词", "负向提示词"];
const tagKeys = ["tags", "tag", "category", "categories", "keywords", "标签", "分类"];
const generationMethodKeys = ["generationMethod", "model", "engine", "generator", "生成方式", "模型"];
const authorNameKeys = ["authorName", "author", "creator", "user", "username", "作者"];
const authorUrlKeys = ["authorUrl", "profileUrl", "userUrl", "creatorUrl", "originUrl", "作者网址"];
const authorAvatarUrlKeys = ["authorAvatarUrl", "avatar", "avatarUrl", "userAvatar", "profileImageUrl", "头像"];
const imageUrlKeys = [
  "image",
  "images",
  "imageUrl",
  "image_url",
  "imageUrls",
  "image_urls",
  "cover",
  "coverUrl",
  "cover_url",
  "poster",
  "posterUrl",
  "poster_url",
  "thumbnail",
  "thumbnailUrl",
  "thumbnail_url",
  "resultImage",
  "result_image",
  "outputImage",
  "output_image",
  "outputs",
  "media",
  "photos",
  "picture",
  "pictures",
  "src",
];

const knownPromptSiteDefinitions: KnownPromptSiteDefinition[] = [
  {
    hosts: ["motionsites.ai"],
    siteName: "MotionSites",
    siteUrl: "https://motionsites.ai",
    tags: ["网页灵感", "动效参考", "交互设计"],
  },
  {
    hosts: ["tusi.cn"],
    siteName: "吐司 Tusi",
    siteUrl: "https://tusi.cn",
    tags: ["中文社区", "模型广场", "AI 绘画"],
  },
  {
    hosts: ["promptmart.cn"],
    siteName: "谱码 PromptMart",
    siteUrl: "https://www.promptmart.cn",
    tags: ["中文 Prompt", "提示词市场", "模板参考"],
  },
  {
    hosts: ["jimeng.jianying.com"],
    siteName: "即梦AI",
    siteUrl: "https://jimeng.jianying.com/ai-tool/home",
    tags: ["中文工具", "图像视频", "创作灵感"],
  },
  {
    hosts: ["civitai.red", "civitai.com"],
    siteName: "Civitai",
    siteUrl: "https://civitai.red/images",
    tags: ["模型社区", "SD 生态", "图片案例"],
  },
  {
    hosts: ["liblib.art"],
    siteName: "LibLibAI",
    siteUrl: "https://www.liblib.art/inspiration",
    tags: ["中文灵感", "图像案例", "模型参考"],
  },
  {
    hosts: ["youmind.com"],
    siteName: "YouMind",
    siteUrl: "https://youmind.com/zh-CN/gpt-image-2-prompts",
    tags: ["GPT Image 2", "案例合集", "中文页面"],
  },
  {
    hosts: ["gpt-image2.canghe.ai"],
    siteName: "awesome-gpt-image-2",
    siteUrl: "https://gpt-image2.canghe.ai",
    tags: ["GPT Image 2", "案例导航", "图像生成"],
  },
  {
    hosts: ["aiart.pics"],
    siteName: "AIART.PICS",
    siteUrl: "https://aiart.pics",
    tags: ["AI 艺术", "提示词案例", "视觉参考"],
  },
  {
    hosts: ["promptfill.tanshilong.com", "aipromptfill.com"],
    siteName: "提示词填空器",
    siteUrl: "https://promptfill.tanshilong.com/explore",
    tags: ["参数填空", "提示词拆解", "案例探索"],
  },
  {
    hosts: ["webtomind.com"],
    siteName: "WebToMind",
    siteUrl: "https://webtomind.com/zh-CN/prompts",
    siteIconUrl: "https://webtomind.com/icons/logo-icon.svg",
    tags: ["中文案例库", "图像 Prompt", "题材分类"],
  },
  {
    hosts: ["img.xmiaom.com"],
    siteName: "哗啦哗啦广场",
    siteUrl: "https://img.xmiaom.com",
    siteIconUrl: "https://img.xmiaom.com/logo.webp",
    tags: ["中文图片广场", "热门作品", "提示词灵感"],
  },
  {
    hosts: ["prompt.newzone.top"],
    siteName: "IMGPrompt",
    siteUrl: "https://prompt.newzone.top/zh",
    tags: ["中文词典", "可视化组词", "AI 绘画"],
  },
  {
    hosts: ["upma.cn"],
    siteName: "上码 UPMA 图片提示词",
    siteUrl: "https://www.upma.cn/image-prompts",
    tags: ["GPT Image 2", "中文案例", "图片 Prompt"],
  },
  {
    hosts: ["seaart.ai"],
    siteName: "SeaArt AI",
    siteUrl: "https://www.seaart.ai/explore",
    tags: ["创作社区", "图片探索", "模型案例"],
  },
];

export function createEmptyPromptImportDraft(): PromptImportDraft {
  return {
    title: "",
    prompt: "",
    negativePrompt: "",
    tags: [],
    generationMethod: null,
    sourceUrl: null,
    sourceImageUrl: null,
    sourceImageUrls: [],
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
  };
}

export function mergePromptImportDrafts(...drafts: DraftPatch[]): PromptImportDraft {
  const merged = createEmptyPromptImportDraft();

  for (const draft of drafts) {
    if (!merged.title && draft.title) {
      merged.title = cleanSingleLine(draft.title).slice(0, maxTitleLength);
    }

    if (!merged.prompt && draft.prompt) {
      merged.prompt = normalizeImportText(draft.prompt);
    }

    if (!merged.negativePrompt && draft.negativePrompt) {
      merged.negativePrompt = normalizeImportText(draft.negativePrompt);
    }

    if (!merged.generationMethod && draft.generationMethod) {
      const generationMethod = cleanSingleLine(draft.generationMethod);

      merged.generationMethod = matchGenerationModelLabel(generationMethod) ?? generationMethod;
    }

    if (!merged.sourceUrl && draft.sourceUrl) {
      merged.sourceUrl = draft.sourceUrl;
    }

    if (!merged.sourceImageUrl && draft.sourceImageUrl) {
      merged.sourceImageUrl = draft.sourceImageUrl;
    }

    if (!merged.authorName && draft.authorName) {
      merged.authorName = cleanSingleLine(draft.authorName);
    }

    if (!merged.authorUrl && draft.authorUrl) {
      merged.authorUrl = draft.authorUrl;
    }

    if (!merged.authorAvatarUrl && draft.authorAvatarUrl) {
      merged.authorAvatarUrl = draft.authorAvatarUrl;
    }

    merged.sourceImageUrls = preferFresherRemoteMediaUrls([
      ...(merged.sourceImageUrls ?? []),
      ...(draft.sourceImageUrls ?? []),
      ...(draft.sourceImageUrl ? [draft.sourceImageUrl] : []),
    ]);
    merged.tags = uniqueTags([...merged.tags, ...(draft.tags ?? [])]);
  }

  if (merged.sourceImageUrls?.length) {
    merged.sourceImageUrl = merged.sourceImageUrls[0] ?? merged.sourceImageUrl;
  }

  if (!merged.title && merged.prompt) {
    merged.title = createTitleFromPrompt(merged.prompt);
  }

  return merged;
}

/** 同一资源路径的签名链接只保留较新 token；无 token 的稳定 URL 优先。 */
function preferFresherRemoteMediaUrls(values: string[]): string[] {
  const ordered: string[] = [];
  const indexByKey = new Map<string, number>();

  for (const raw of values) {
    const value = raw.trim();

    if (!value) {
      continue;
    }

    const key = getRemoteMediaIdentityKey(value) ?? value;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, ordered.length);
      ordered.push(value);
      continue;
    }

    const existing = ordered[existingIndex] ?? "";

    if (compareRemoteMediaFreshness(value, existing) > 0) {
      ordered[existingIndex] = value;
    }
  }

  return ordered;
}

function getRemoteMediaIdentityKey(value: string): string | null {
  try {
    const url = new URL(value);
    return `${normalizeHostname(url.hostname)}${url.pathname.toLowerCase()}`;
  } catch {
    return null;
  }
}

function compareRemoteMediaFreshness(left: string, right: string): number {
  const leftScore = getRemoteMediaFreshnessScore(left);
  const rightScore = getRemoteMediaFreshnessScore(right);

  if (leftScore !== rightScore) {
    return leftScore - rightScore;
  }

  return left.length - right.length;
}

function getRemoteMediaFreshnessScore(value: string): number {
  try {
    const url = new URL(value);
    const token = url.searchParams.get("token") ?? "";

    if (!token) {
      // 稳定公开链接优先于签名链接。
      return Number.MAX_SAFE_INTEGER;
    }

    const payload = token.split(".")[1] ?? "";

    if (!payload) {
      return 0;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { exp?: number; iat?: number };

    return typeof parsed.exp === "number" ? parsed.exp : typeof parsed.iat === "number" ? parsed.iat : 0;
  } catch {
    return 0;
  }
}

export function createPromptImportDuplicateKey(prompt: string): string {
  return normalizeImportText(prompt).toLowerCase();
}

export function parsePromptText(input: string): PromptImportDraft {
  const text = normalizeImportText(input);

  if (!text) {
    return createEmptyPromptImportDraft();
  }

  const jsonDraft = parseJsonPromptText(text);

  if (hasPromptContent(jsonDraft)) {
    return fillPromptDraftFallback(jsonDraft, text);
  }

  const labeledDraft = parseLabeledPromptText(text);

  if (hasPromptContent(labeledDraft)) {
    return fillPromptDraftFallback(labeledDraft, text);
  }

  const stableDiffusionDraft = parseStableDiffusionText(text);

  if (hasPromptContent(stableDiffusionDraft)) {
    return fillPromptDraftFallback(stableDiffusionDraft, text);
  }

  return {
    title: createTitleFromPrompt(text),
    prompt: text,
    negativePrompt: "",
    tags: [],
    generationMethod: null,
    sourceUrl: null,
    sourceImageUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
  };
}

export function parsePromptShareUrl(input: string): PromptImportDraft | null {
  const value = input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const tags = ["网页分享"];
  const category = getUrlParameter(url, "category");
  const tag = getUrlParameter(url, "tag");
  const title = getShareUrlTitle(hostname);
  const promptCandidate =
    getUrlParameter(url, "promptText") ??
    getUrlParameter(url, "prompt_text") ??
    getUrlParameter(url, "content") ??
    getUrlParameter(url, "text") ??
    getUrlParameter(url, "prompt") ??
    "";

  if (category) {
    tags.push(category);
  }

  if (tag) {
    tags.push(tag);
  }

  return {
    title,
    prompt: isPromptCandidate(promptCandidate) ? normalizeImportText(promptCandidate) : buildSourcePrompt(url.href),
    negativePrompt: "",
    tags: uniqueTags(tags),
    generationMethod: null,
    sourceUrl: url.href,
    sourceImageUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
  };
}

export function extractAipromptfillShareCode(input: string): string | null {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (!url.hostname.toLowerCase().includes("aipromptfill.com")) {
    return null;
  }

  const shareCode = getUrlParameter(url, "share") ?? "";
  const normalizedCode = shareCode.trim();

  if (!/^[a-z0-9_-]{2,32}$/i.test(normalizedCode)) {
    return null;
  }

  return normalizedCode;
}

export function extractAiartPromptId(input: string): string | null {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (!url.hostname.toLowerCase().includes("aiart.pics")) {
    return null;
  }

  const promptId = getUrlParameter(url, "prompt") ?? url.pathname.match(/\/prompts\/([^/?#]+)/i)?.[1] ?? "";
  const normalizedId = promptId.trim();

  if (!/^[a-z0-9-]{8,64}$/i.test(normalizedId)) {
    return null;
  }

  return normalizedId;
}

export function extractGptImage2GalleryInfo(input: string): GptImage2GalleryInfo | null {
  const value = extractFirstHttpUrl(input) ?? input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let owner = "";
  let repo = "";
  let ref = "";
  let markdownPath = "";

  if (hostname === "github.com") {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeUrlPathPart);
    const kind = parts[2]?.toLowerCase();

    if (parts.length < 5 || (kind !== "blob" && kind !== "raw")) {
      return null;
    }

    owner = parts[0] ?? "";
    repo = parts[1] ?? "";
    ref = parts[3] ?? "";
    markdownPath = parts.slice(4).join("/");
  } else if (hostname === "raw.githubusercontent.com") {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeUrlPathPart);

    if (parts.length < 4) {
      return null;
    }

    owner = parts[0] ?? "";
    repo = parts[1] ?? "";
    ref = parts[2] ?? "";
    markdownPath = parts.slice(3).join("/");
  } else {
    return null;
  }

  if (
    owner.toLowerCase() !== "freestylefly" ||
    repo.toLowerCase() !== "awesome-gpt-image-2" ||
    !ref ||
    !isGptImage2GalleryMarkdownPath(markdownPath)
  ) {
    return null;
  }

  const sourceUrl = `https://github.com/${owner}/${repo}/blob/${ref}/${markdownPath}`;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${markdownPath}`;

  return {
    sourceUrl,
    rawUrl,
    owner,
    repo,
    ref,
    path: markdownPath,
  };
}

export function extractWebToMindPromptInfo(input: string): WebToMindPromptInfo | null {
  const value = extractFirstHttpUrl(input) ?? input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  if (!isWebToMindHostname(url.hostname)) {
    return null;
  }

  if (!isWebToMindPromptPath(url.pathname)) {
    return null;
  }

  return {
    sourceUrl: url.href,
  };
}

export function extractXmiaomPromptInfo(input: string): XmiaomPromptInfo | null {
  const value = extractFirstHttpUrl(input) ?? input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  if (!isXmiaomHostname(url.hostname)) {
    return null;
  }

  const imageId = url.pathname.match(/^\/p\/([a-z0-9_-]{8,80})\/?$/i)?.[1] ?? "";

  if (!imageId) {
    return null;
  }

  return {
    sourceUrl: `https://img.xmiaom.com/p/${imageId}`,
    imageId,
  };
}

function isJimengHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "jimeng.jianying.com" || normalized.endsWith(".jimeng.jianying.com");
}

export function extractJimengWorkInfo(input: string): JimengWorkInfo | null {
  const value = extractFirstHttpUrl(input) ?? input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  if (!isJimengHostname(url.hostname)) {
    return null;
  }

  const workIdMatch = url.pathname.match(/\/work-detail\/([a-z0-9]{8,})/i);
  const shareCodeMatch = url.pathname.match(/^\/s\/([a-z0-9_-]{4,80})\/?$/i);
  const workId = workIdMatch?.[1] ?? shareCodeMatch?.[1] ?? "";

  if (!workId) {
    return null;
  }

  return {
    sourceUrl: url.href,
    workId,
  };
}

export function extractKnownPromptSiteInfo(input: string): KnownPromptSiteInfo | null {
  const value = extractFirstHttpUrl(input) ?? input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return null;
  }

  const hostname = normalizeHostname(url.hostname);
  const definition = knownPromptSiteDefinitions.find((site) =>
    site.hosts.some((host) => hostname === normalizeHostname(host) || hostname.endsWith(`.${normalizeHostname(host)}`)),
  );

  if (!definition) {
    return null;
  }

  return {
    sourceUrl: url.href,
    siteName: definition.siteName,
    siteUrl: definition.siteUrl,
    siteIconUrl: definition.siteIconUrl ?? createSiteIconUrl(definition.siteUrl),
    tags: definition.tags,
  };
}

export function extractXStatusInfo(input: string): XStatusInfo | null {
  const value =
    input
      .trim()
      .match(/https?:\/\/(?:www\.)?(?:x|twitter|mobile\.twitter|fxtwitter|vxtwitter)\.com\/\S+/i)?.[0] ??
    input.trim();
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  if (!["x.com", "twitter.com", "mobile.twitter.com", "fxtwitter.com", "vxtwitter.com"].includes(hostname)) {
    return null;
  }

  const statusMatch = url.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d{8,24})/i);
  const webStatusMatch = url.pathname.match(/^\/i\/web\/status\/(\d{8,24})/i);
  const statusId = statusMatch?.[2] ?? webStatusMatch?.[1] ?? "";

  if (!statusId) {
    return null;
  }

  const username = statusMatch?.[1] && statusMatch[1].toLowerCase() !== "i" ? statusMatch[1] : null;
  const sourceUrl = username
    ? `https://x.com/${username}/status/${statusId}`
    : `https://x.com/i/web/status/${statusId}`;

  return { sourceUrl, statusId, username };
}

export function parseFxTwitterTweetPayload(input: unknown, sourceUrl: string): PromptImportDraft | null {
  const tweet = isRecord(input) && isRecord(input.tweet) ? input.tweet : input;

  if (!isRecord(tweet)) {
    return null;
  }

  const prompt = cleanTweetPromptText(getTweetText(tweet));

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const author = getXAuthorInfo(tweet);
  const mediaUrls = extractTweetMediaUrls(tweet);
  const videoUrls = mediaUrls.filter(isImportableRemoteVideoUrl);
  const imageUrls = mediaUrls.filter((url) => !isImportableRemoteVideoUrl(url));
  const isVideoTweet = videoUrls.length > 0;
  const sourceImageUrls = isVideoTweet
    ? collapseRemoteVideoUrls(videoUrls)
    : imageUrls;
  const tags = uniqueTags([
    "网页分享",
    "X",
    ...(isVideoTweet ? ["视频提示词"] : ["图像提示词"]),
    ...firstTagValues(tweet, ["hashtags", "tags"]),
  ]);

  return {
    title: createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod: guessGenerationMethodFromText(prompt) ?? "X",
    sourceUrl,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName: author.authorName,
    authorUrl: author.authorUrl,
    authorAvatarUrl: author.authorAvatarUrl,
  };
}

export function parseXStatusSyndicationPayload(input: unknown, sourceUrl: string): PromptImportDraft | null {
  if (!isRecord(input)) {
    return null;
  }

  const prompt = cleanTweetPromptText(getTweetText(input));

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const author = getXAuthorInfo(input);
  const mediaUrls = extractTweetMediaUrls(input);
  const videoUrls = mediaUrls.filter(isImportableRemoteVideoUrl);
  const imageUrls = mediaUrls.filter((url) => !isImportableRemoteVideoUrl(url));
  const isVideoTweet = videoUrls.length > 0;
  const sourceImageUrls = isVideoTweet
    ? collapseRemoteVideoUrls(videoUrls)
    : imageUrls;
  const tags = uniqueTags([
    "网页分享",
    "X",
    ...(isVideoTweet ? ["视频提示词"] : ["图像提示词"]),
  ]);

  return {
    title: createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod: guessGenerationMethodFromText(prompt) ?? "X",
    sourceUrl,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName: author.authorName,
    authorUrl: author.authorUrl,
    authorAvatarUrl: author.authorAvatarUrl,
  };
}

export function parseAipromptfillSharePayload(input: unknown, sourceUrl: string): PromptImportDraft | null {
  if (!isRecord(input)) {
    return null;
  }

  const title = getLocalizedString(input.n ?? input.name ?? input.title);
  const content = getLocalizedString(input.c ?? input.content ?? input.prompt ?? input.text);

  if (!content || !isPromptCandidate(content)) {
    return null;
  }

  const selections = isRecord(input.s)
    ? input.s
    : isRecord(input.selections)
      ? input.selections
      : isRecord(input.vars)
        ? input.vars
        : {};
  const prompt = expandAipromptfillTemplate(content, selections);
  const imageUrl =
    getRemoteImageUrl(input.i ?? input.imageUrl ?? input.image ?? input.cover ?? input.thumb ?? input.thumbnail) ??
    null;
  // Prompt Fill 视频分享用 vu（video url）字段；i 可能为空字符串。
  const videoUrl =
    getRemoteImageUrl(input.vu ?? input.videoUrl ?? input.video_url ?? input.video ?? input.v) ?? null;
  const mediaType = getLocalizedString(input.ty ?? input.type ?? input.mediaType).toLowerCase();
  const author = cleanSingleLine(getLocalizedString(input.a ?? input.author ?? input.user));
  const typeTag = getAipromptfillTypeTag(mediaType);
  const tags = uniqueTags([
    "网页分享",
    "Prompt Fill",
    ...firstTagValues(input, ["t", "tags"]),
    ...(typeTag ? [typeTag] : []),
  ]);
  // 视频条目优先放视频 URL，便于 getImportableRemoteMediaUrls 正确选择媒体。
  const sourceMediaUrls =
    mediaType === "video" || Boolean(videoUrl)
      ? uniqueStrings([...(videoUrl ? [videoUrl] : []), ...(imageUrl ? [imageUrl] : [])])
      : uniqueStrings([...(imageUrl ? [imageUrl] : []), ...(videoUrl ? [videoUrl] : [])]);

  return {
    title: title || createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod: "Prompt Fill",
    sourceUrl,
    sourceImageUrl: sourceMediaUrls[0] ?? null,
    sourceImageUrls: sourceMediaUrls,
    authorName: author || null,
    authorUrl: null,
    authorAvatarUrl: null,
  };
}

export function parseAiartPromptPayload(input: unknown, sourceUrl: string): PromptImportDraft | null {
  const record = isRecord(input) && isRecord(input.data) ? input.data : input;

  if (!isRecord(record)) {
    return null;
  }

  const promptLines = Array.isArray(record.prompts)
    ? record.prompts.filter((item): item is string => typeof item === "string")
    : [];
  const prompt = normalizeImportText(promptLines.join("\n\n"));

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const title = getLocalizedString(record.title);
  const model = cleanSingleLine(getLocalizedString(record.model));
  const author = getAiartAuthorName(record.author);
  const authorUrl = getAiartAuthorUrl(record);
  const authorAvatarUrl = getAiartAuthorAvatarUrl(record.author);
  const mediaType = getLocalizedString(record.mediaType).toLowerCase();
  const videoUrls = extractAiartVideoUrls(record.videos);
  const imageUrls = extractAiartImageUrls(record.images);
  const coverUrls = extractAiartVideoCoverUrls(record.videos);
  // 以 mediaType 为准：图片条目即使附带视频也不优先下载视频。
  const isVideoPrompt = mediaType === "video" || (mediaType !== "image" && videoUrls.length > 0);
  const sourceMediaUrls = uniqueStrings(
    isVideoPrompt
      ? [...videoUrls, ...coverUrls, ...imageUrls]
      : [...imageUrls, ...coverUrls],
  );
  const tags = uniqueTags([
    "网页分享",
    "AIART.PICS",
    ...(isVideoPrompt ? ["视频提示词"] : ["图像提示词"]),
    ...firstTagValues(record, ["tags"]),
  ]);

  return {
    title: title || createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod: matchGenerationModelLabel(model) ?? (model || "AIART.PICS"),
    sourceUrl,
    sourceImageUrl: sourceMediaUrls[0] ?? null,
    sourceImageUrls: sourceMediaUrls,
    authorName: author || null,
    authorUrl,
    authorAvatarUrl,
  };
}

export function parseGptImage2GalleryMarkdown(markdown: string, galleryInfo: GptImage2GalleryInfo): PromptImportDraft[] {
  const drafts: PromptImportDraft[] = [];
  const caseRegex =
    /<a\s+name=["']case-(\d+)["']\s*><\/a>\s*###\s*例\s*\d+\s*[:：]\s*([^\n\r]+)([\s\S]*?)(?=\n<a\s+name=["']case-\d+["']\s*><\/a>|\n<!-- AI_GENERATED_CONTENT_END|\s*$)/gi;
  let match: RegExpExecArray | null;

  while ((match = caseRegex.exec(markdown))) {
    const caseNumber = match[1] ?? "";
    const caseTitle = decodeMarkdownEscapes(cleanSingleLine(match[2] ?? ""));
    const body = match[3] ?? "";
    const imageMatch = body.match(/!\[([^\]]*)\]\(([^)\n]+)\)/);
    const imageUrl = resolveGptImage2GalleryAssetUrl(imageMatch?.[2] ?? "", galleryInfo);
    const sourceMatch = body.match(/\*\*来源：\*\*\s*([^\n\r]+)/);
    const author = parseGptImage2GalleryAuthor(sourceMatch?.[1] ?? "");
    const promptMatch = body.match(/\*\*提示词：\*\*[\s\S]*?```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```/);
    const prompt = normalizeImportText(promptMatch?.[1] ?? "");

    if (!caseNumber || !prompt) {
      continue;
    }

    drafts.push({
      title: cleanSingleLine(`例 ${caseNumber}：${caseTitle || imageMatch?.[1] || "GPT-Image-2 提示词"}`).slice(
        0,
        maxTitleLength,
      ),
      prompt,
      negativePrompt: "",
      tags: uniqueTags(["网页分享", "GPT-Image-2", "图像提示词", caseTitle]),
      generationMethod: "GPT-Image-2",
      sourceUrl: `${galleryInfo.sourceUrl}#case-${caseNumber}`,
      sourceImageUrl: imageUrl,
      sourceImageUrls: imageUrl ? [imageUrl] : [],
      authorName: author.authorName,
      authorUrl: author.authorUrl,
      authorAvatarUrl: null,
    });
  }

  return drafts;
}

export function parseWebToMindPromptHtml(html: string, sourceUrl: string): PromptImportDraft | null {
  const sourceInfo = extractWebToMindPromptInfo(sourceUrl);

  if (!sourceInfo) {
    return null;
  }

  const jsonLd = extractWebToMindCreativeWork(html);
  const canonicalUrl = extractWebToMindCanonicalUrl(html, sourceInfo.sourceUrl);
  const title =
    getLocalizedString(jsonLd?.name) ||
    cleanWebToMindTitle(extractHtmlTitle(html)) ||
    getShareUrlTitle("webtomind.com");
  const prompt =
    extractWebToMindSsrPrompt(html) ||
    cleanWebToMindDescription(getLocalizedString(jsonLd?.description), title) ||
    "";

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const keywordTags = uniqueTags([
    ...extractWebToMindKeywords(jsonLd),
    ...extractKeywords(html),
    ...extractWebToMindMetaTags(html),
  ]);
  const generationMethod = guessWebToMindGenerationMethod(
    [canonicalUrl, title, prompt, keywordTags.join(" ")].join("\n"),
  );
  const jsonImageUrls = extractWebToMindJsonImageUrls(jsonLd);
  const isVideoPrompt = isWebToMindVideoPrompt(html, jsonLd);
  const fallbackImageUrls =
    jsonImageUrls.length > 0
      ? []
      : [
          ...extractWebToMindVideoPosterUrls(html),
          ...extractWebToMindGalleryImageUrls(html),
          getRemoteImageUrl(extractMetaPropertyContent(html, "og:image")) ?? "",
          getRemoteImageUrl(extractMetaContent(html, "twitter:image")) ?? "",
          getRemoteImageUrl(extractMetaPropertyContent(html, "twitter:image")) ?? "",
        ];
  const sourceImageUrls = uniqueStrings([...jsonImageUrls, ...fallbackImageUrls]);
  const sourceMediaUrls = isVideoPrompt
    ? uniqueStrings([...extractWebToMindVideoUrls(html, jsonLd, sourceImageUrls), ...sourceImageUrls])
    : sourceImageUrls;
  const author = extractWebToMindAuthor(jsonLd, canonicalUrl);

  return {
    title: cleanSingleLine(title).slice(0, maxTitleLength),
    prompt: normalizeImportText(prompt),
    negativePrompt: "",
    tags: uniqueTags([
      "网页分享",
      "WebToMind",
      isVideoPrompt ? "视频提示词" : "图像提示词",
      generationMethod ?? "",
      ...keywordTags,
    ]),
    generationMethod: generationMethod ?? "WebToMind",
    sourceUrl: canonicalUrl,
    sourceImageUrl: sourceMediaUrls[0] ?? null,
    sourceImageUrls: sourceMediaUrls,
    authorName: author.authorName,
    authorUrl: author.authorUrl,
    authorAvatarUrl: author.authorAvatarUrl,
  };
}

export function parseWebToMindPromptCaseApiPayload(payload: string, sourceUrl: string): PromptImportDraft | null {
  const sourceInfo = extractWebToMindPromptInfo(sourceUrl);

  if (!sourceInfo) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }

  const record = findWebToMindPromptCaseRecord(parsed);

  if (!record) {
    return null;
  }

  const title =
    getLocalizedString(record.titleZh) ||
    getLocalizedString(record.title) ||
    getLocalizedString(record.name) ||
    cleanWebToMindTitle(extractHtmlTitle("")) ||
    getShareUrlTitle("webtomind.com");
  // 会员锁定案例常返回空 prompt，但会提供 promptPreview / commercialIntent 与可下载封面。
  const prompt =
    getLocalizedString(record.promptZh) ||
    getLocalizedString(record.prompt) ||
    getLocalizedString(record.fullPrompt) ||
    getLocalizedString(record.promptPreviewZh) ||
    getLocalizedString(record.promptPreview) ||
    getLocalizedString(record.commercialIntent) ||
    getLocalizedString(record.description) ||
    "";

  const canonicalUrl =
    resolveRemoteUrl(firstStringValue(record, ["url", "sourceUrl", "canonicalUrl"]), sourceInfo.sourceUrl) ??
    sourceInfo.sourceUrl;
  const keywordTags = uniqueTags([
    ...parseUnknownTags(record.tags),
    ...parseUnknownTags(record.keywords),
    getLocalizedString(record.category),
  ]);
  const generationMethod = guessWebToMindGenerationMethod(
    [
      getLocalizedString(record.modelLabel),
      getLocalizedString(record.modelName),
      getLocalizedString(record.model),
      canonicalUrl,
      title,
      prompt,
      keywordTags.join(" "),
    ].join("\n"),
  );
  const imageUrls = extractWebToMindPromptCaseImageUrls(record, canonicalUrl);
  const videoUrls = extractWebToMindPromptCaseVideoUrls(record, canonicalUrl);
  const isVideoPrompt =
    getLocalizedString(record.mediaType).toLowerCase() === "video" ||
    getLocalizedString(record.type).toLowerCase() === "video" ||
    videoUrls.length > 0 ||
    keywordTags.some((tag) => /视频|video|motion/i.test(tag));
  const sourceMediaUrls = isVideoPrompt
    ? uniqueStrings([...(videoUrls.length > 0 ? videoUrls : deriveWebToMindVideoUrlsFromImageUrls(imageUrls)), ...imageUrls])
    : imageUrls;
  const author = extractWebToMindAuthor(record, canonicalUrl);
  const normalizedPrompt = normalizeImportText(prompt);
  const hasUsablePrompt = Boolean(normalizedPrompt && isPromptCandidate(normalizedPrompt));

  // 即使完整 Prompt 被锁定，只要有封面图也要返回 draft，便于导入效果图并刷新签名链接。
  if (!hasUsablePrompt && sourceMediaUrls.length === 0) {
    return null;
  }

  return {
    title: cleanSingleLine(title).slice(0, maxTitleLength) || createTitleFromPrompt(normalizedPrompt || "WebToMind 案例"),
    prompt: hasUsablePrompt ? normalizedPrompt : normalizeImportText(title || "WebToMind 案例"),
    negativePrompt: "",
    tags: uniqueTags([
      "网页分享",
      "WebToMind",
      isVideoPrompt ? "视频提示词" : "图像提示词",
      generationMethod ?? "",
      ...keywordTags,
    ]),
    generationMethod: generationMethod ?? "WebToMind",
    sourceUrl: canonicalUrl,
    sourceImageUrl: sourceMediaUrls[0] ?? null,
    sourceImageUrls: sourceMediaUrls,
    authorName: author.authorName,
    authorUrl: author.authorUrl,
    authorAvatarUrl: author.authorAvatarUrl,
  };
}

export function parseXmiaomPromptHtml(html: string, sourceUrl: string): PromptImportDraft | null {
  const sourceInfo = extractXmiaomPromptInfo(sourceUrl);

  if (!sourceInfo) {
    return null;
  }

  const flightText = extractNextFlightText(html);
  const record = extractXmiaomPromptRecord(flightText, sourceInfo.imageId) ?? {};
  // 新版 RSC 页面会把长提示词放进 flight slot，record.prompt 仅是 "$17" 这类引用。
  const prompt = resolveXmiaomFlightValue(flightText, record.prompt);

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const model = cleanSingleLine(resolveXmiaomFlightValue(flightText, record.model) || getLocalizedString(record.model));
  const generationMethod = matchGenerationModelLabel(model) ?? (model || "哗啦哗啦");
  const authorName = cleanSingleLine(
    resolveXmiaomFlightValue(flightText, record.nickname) ||
      getLocalizedString(record.nickname) ||
      getLocalizedString(record.username),
  );
  const authorUsername = cleanSingleLine(
    resolveXmiaomFlightValue(flightText, record.authorUsername) ||
      getLocalizedString(record.authorUsername) ||
      getLocalizedString(record.username),
  ).replace(/^@/, "");
  const authorId = cleanSingleLine(
    resolveXmiaomFlightValue(flightText, record.authorId) || getLocalizedString(record.authorId),
  );
  const sourceImageUrls = extractXmiaomSourceImageUrls(html, record, sourceInfo.sourceUrl, flightText);
  const tags = uniqueTags([
    "网页分享",
    "哗啦哗啦",
    "图像提示词",
    generationMethod,
    ...parseUnknownTags(record.tags),
    ...extractXmiaomTagLabels(flightText),
    ...extractKeywords(html),
  ]);

  return {
    title: createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod,
    sourceUrl: sourceInfo.sourceUrl,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName: authorName || authorUsername || "哗啦哗啦用户",
    authorUrl: authorUsername ? `https://img.xmiaom.com/u/${encodeURIComponent(authorUsername)}` : null,
    authorAvatarUrl: extractXmiaomAuthorAvatarUrl(html, authorId, sourceInfo.sourceUrl),
  };
}

function extractJimengRouterData(html: string): unknown | null {
  const assignMatch = html.match(/window\._ROUTER_DATA\s*=\s*/i);
  if (!assignMatch) {
    return null;
  }
  const startIndex = html.indexOf("{", assignMatch.index! + assignMatch[0].length);
  if (startIndex < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;

  for (let i = startIndex; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex < 0) {
    return null;
  }

  try {
    return JSON.parse(html.slice(startIndex, endIndex + 1));
  } catch {
    return null;
  }
}

function extractJimengWorkDetail(routerData: unknown): unknown | null {
  if (!isRecord(routerData)) {
    return null;
  }
  const loaderData = (routerData as { loaderData?: unknown }).loaderData;
  if (!isRecord(loaderData)) {
    return null;
  }
  for (const key of Object.keys(loaderData)) {
    if (key.includes("work-detail") || key.includes("workDetail")) {
      const pageData = (loaderData as Record<string, unknown>)[key];
      if (isRecord(pageData) && isRecord((pageData as { workDetail?: unknown }).workDetail)) {
        const workDetail = (pageData as { workDetail: { ok?: boolean; value?: unknown } }).workDetail;
        if (workDetail.ok && workDetail.value) {
          return workDetail.value;
        }
      }
    }
  }
  return null;
}

function getJimengImageUrls(workDetail: unknown): string[] {
  const urls: string[] = [];
  if (!isRecord(workDetail)) {
    return urls;
  }
  const detail = workDetail as Record<string, unknown>;
  const commonAttr = isRecord(detail.commonAttr) ? (detail.commonAttr as Record<string, unknown>) : {};
  const coverUrlMap = commonAttr.coverUrlMap;
  if (isRecord(coverUrlMap)) {
    const map = coverUrlMap as Record<string, unknown>;
    const sortedKeys = Object.keys(map).sort((a, b) => {
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      return bNum - aNum;
    });
    if (sortedKeys.length > 0) {
      const bestUrl = map[sortedKeys[0]];
      if (typeof bestUrl === "string" && bestUrl && bestUrl.startsWith("http")) {
        urls.push(bestUrl);
        return urls;
      }
    }
  }
  if (typeof commonAttr.coverUrl === "string" && commonAttr.coverUrl && commonAttr.coverUrl.startsWith("http")) {
    urls.push(commonAttr.coverUrl);
  }
  const itemUrls = commonAttr.itemUrls;
  if (Array.isArray(itemUrls)) {
    for (const url of itemUrls) {
      if (typeof url === "string" && url && url.startsWith("http") && !urls.includes(url)) {
        urls.push(url);
      }
    }
  }
  if (urls.length === 0) {
    const video = isRecord(detail.video) ? (detail.video as Record<string, unknown>) : {};
    const aigcImageParams = isRecord(detail.aigcImageParams) ? (detail.aigcImageParams as Record<string, unknown>) : {};
    const nestedT2v = isRecord(aigcImageParams.text2videoParams) ? (aigcImageParams.text2videoParams as Record<string, unknown>) : {};
    const videoGenInputs = Array.isArray(nestedT2v.videoGenInputs) ? nestedT2v.videoGenInputs : [];
    const firstInput = isRecord(videoGenInputs[0]) ? (videoGenInputs[0] as Record<string, unknown>) : {};
    const firstFrameImage = isRecord(firstInput.firstFrameImage) ? (firstInput.firstFrameImage as Record<string, unknown>) : {};
    const videoCoverCandidates = [
      video.coverUrl,
      firstFrameImage.imageUrl,
    ];
    for (const url of videoCoverCandidates) {
      if (typeof url === "string" && url && url.startsWith("http") && !urls.includes(url)) {
        urls.push(url);
        break;
      }
    }
  }
  return urls;
}

function getJimengVideoUrl(workDetail: unknown): string | null {
  if (!isRecord(workDetail)) {
    return null;
  }
  const detail = workDetail as Record<string, unknown>;
  const video = isRecord(detail.video) ? (detail.video as Record<string, unknown>) : null;
  if (!video) {
    return null;
  }
  const originVideo = isRecord(video.originVideo) ? (video.originVideo as Record<string, unknown>) : {};
  if (typeof originVideo.videoUrl === "string" && originVideo.videoUrl.startsWith("http")) {
    return originVideo.videoUrl;
  }
  return null;
}

function getJimengPromptTexts(detail: Record<string, unknown>): { prompt: string; negativePrompt: string } {
  const commonAttr = isRecord(detail.commonAttr) ? (detail.commonAttr as Record<string, unknown>) : {};
  const text2imageParams = isRecord(detail.text2imageParams)
    ? (detail.text2imageParams as Record<string, unknown>)
    : {};
  const aigcImageParams = isRecord(detail.aigcImageParams)
    ? (detail.aigcImageParams as Record<string, unknown>)
    : {};
  const nestedText2imageParams = isRecord(aigcImageParams.text2imageParams)
    ? (aigcImageParams.text2imageParams as Record<string, unknown>)
    : {};
  const nestedText2videoParams = isRecord(aigcImageParams.text2videoParams)
    ? (aigcImageParams.text2videoParams as Record<string, unknown>)
    : {};
  const videoGenInputs = Array.isArray(nestedText2videoParams.videoGenInputs) ? nestedText2videoParams.videoGenInputs : [];
  const firstVideoInput = isRecord(videoGenInputs[0]) ? (videoGenInputs[0] as Record<string, unknown>) : {};
  const topText2videoParams = isRecord(detail.text2videoParams)
    ? (detail.text2videoParams as Record<string, unknown>)
    : {};

  const promptCandidates = [
    nestedText2imageParams.prompt,
    text2imageParams.prompt,
    aigcImageParams.referencePrompt,
    firstVideoInput.prompt,
    topText2videoParams.prompt,
    commonAttr.description,
  ];
  const negativeCandidates = [
    nestedText2imageParams.userNegativePrompt,
    text2imageParams.userNegativePrompt,
    topText2videoParams.userNegativePrompt,
    commonAttr.negativePrompt,
  ];

  const prompt = promptCandidates.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? "";
  const negativePrompt =
    negativeCandidates.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? "";

  return { prompt, negativePrompt };
}

function getJimengAuthor(detail: Record<string, unknown>): {
  authorName: string | null;
  authorAvatarUrl: string | null;
} {
  const author = isRecord(detail.author) ? (detail.author as Record<string, unknown>) : {};
  const name = typeof author.name === "string" ? cleanSingleLine(author.name) : "";
  const avatarUrl =
    typeof author.avatarUrl === "string" && author.avatarUrl.startsWith("http") ? author.avatarUrl : "";

  return {
    authorName: name || null,
    authorAvatarUrl: avatarUrl || null,
  };
}

export function parseJimengWorkHtml(html: string, sourceUrl: string): PromptImportDraft | null {
  const sourceInfo = extractJimengWorkInfo(sourceUrl);
  if (!sourceInfo) {
    return null;
  }
  const routerData = extractJimengRouterData(html);
  const workDetail = extractJimengWorkDetail(routerData);
  if (!workDetail || !isRecord(workDetail)) {
    return null;
  }
  const detail = workDetail as Record<string, unknown>;
  const commonAttr = isRecord(detail.commonAttr) ? (detail.commonAttr as Record<string, unknown>) : {};
  const title = typeof commonAttr.title === "string" ? cleanSingleLine(commonAttr.title) : "";
  const promptTexts = getJimengPromptTexts(detail);
  const prompt = normalizeImportText(promptTexts.prompt);
  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }
  const negativePrompt = normalizeImportText(promptTexts.negativePrompt);
  const aigcImageParams = isRecord(detail.aigcImageParams) ? (detail.aigcImageParams as Record<string, unknown>) : {};
  const isVideoWork =
    sourceInfo.sourceUrl.includes("AiVideo") ||
    isRecord(detail.video) ||
    isRecord(aigcImageParams.text2videoParams) ||
    (typeof commonAttr.itemType === "number" && commonAttr.itemType === 53);
  const videoUrl = getJimengVideoUrl(detail);
  const coverImageUrls = getJimengImageUrls(workDetail).filter((url) => !isLikelyAvatarOrIconUrl(url));
  const sourceImageUrls = isVideoWork && videoUrl
    ? [videoUrl, ...coverImageUrls]
    : coverImageUrls;
  const contentTag = isVideoWork ? "视频提示词" : "图像提示词";
  const nestedT2v = isRecord(aigcImageParams.text2videoParams) ? (aigcImageParams.text2videoParams as Record<string, unknown>) : {};
  const modelConfig = isRecord(nestedT2v.modelConfig) ? (nestedT2v.modelConfig as Record<string, unknown>) : {};
  const nestedT2i = isRecord(aigcImageParams.text2imageParams)
    ? (aigcImageParams.text2imageParams as Record<string, unknown>)
    : {};
  const modelInfo = isRecord(nestedT2i.modelInfo) ? (nestedT2i.modelInfo as Record<string, unknown>) : {};
  const modelNameCandidates = [
    modelConfig.modelName,
    modelInfo.modelName,
    modelInfo.rawModelSource,
    modelInfo.modelSource,
    nestedT2i.modelName,
  ];
  const modelName =
    modelNameCandidates
      .map((value) => (typeof value === "string" ? cleanSingleLine(value) : ""))
      .find((value) => value.length > 0) ?? "";
  const generationMethod = modelName || "即梦AI";
  const tags = uniqueTags(["网页分享", "即梦AI", contentTag, ...extractKeywords(html)]);
  const author = getJimengAuthor(detail);
  return {
    title: title || createTitleFromPrompt(prompt),
    prompt,
    negativePrompt,
    tags,
    generationMethod,
    sourceUrl: sourceInfo.sourceUrl,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName: author.authorName ?? "即梦AI用户",
    authorUrl: sourceInfo.sourceUrl,
    authorAvatarUrl: author.authorAvatarUrl,
  };
}

const jimengVideoDefinitionOrder = ["4k", "2160p", "1080p", "720p", "540p", "480p", "360p"];

function pickBestJimengVideoUrl(video: Record<string, unknown>): string | null {
  const transcoded = isRecord(video.transcoded_video)
    ? (video.transcoded_video as Record<string, unknown>)
    : {};

  for (const definition of jimengVideoDefinitionOrder) {
    const entry = transcoded[definition];
    if (isRecord(entry) && typeof entry.video_url === "string" && entry.video_url.startsWith("http")) {
      return entry.video_url;
    }
  }

  let bestUrl: string | null = null;
  let bestBitrate = -1;
  for (const value of Object.values(transcoded)) {
    if (!isRecord(value) || typeof value.video_url !== "string" || !value.video_url.startsWith("http")) {
      continue;
    }
    const bitrate = typeof value.bitrate === "number" ? value.bitrate : 0;
    if (bitrate > bestBitrate) {
      bestBitrate = bitrate;
      bestUrl = value.video_url;
    }
  }

  if (bestUrl) {
    return bestUrl;
  }

  const originVideo = isRecord(video.origin_video) ? (video.origin_video as Record<string, unknown>) : {};
  if (typeof originVideo.video_url === "string" && originVideo.video_url.startsWith("http")) {
    return originVideo.video_url;
  }

  return null;
}

function pickBestJimengCoverUrl(commonAttr: Record<string, unknown>): string | null {
  const coverUrlMap = commonAttr.cover_url_map;
  if (isRecord(coverUrlMap)) {
    const sortedKeys = Object.keys(coverUrlMap).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    for (const key of sortedKeys) {
      const url = coverUrlMap[key];
      if (typeof url === "string" && url.startsWith("http")) {
        return url;
      }
    }
  }

  if (typeof commonAttr.cover_url === "string" && commonAttr.cover_url.startsWith("http")) {
    return commonAttr.cover_url;
  }

  return null;
}

function extractJimengPromptFromDraftContent(draftContent: unknown): string {
  if (typeof draftContent !== "string" || !draftContent.trim()) {
    return "";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftContent);
  } catch {
    return "";
  }

  const textFragments: string[] = [];
  const directPrompts: string[] = [];

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    if (Array.isArray(node.meta_list)) {
      for (const meta of node.meta_list) {
        if (isRecord(meta) && meta.meta_type === "text" && typeof meta.text === "string" && meta.text) {
          textFragments.push(meta.text);
        }
      }
    }

    if (typeof node.prompt === "string" && node.prompt.trim()) {
      directPrompts.push(node.prompt);
    }

    for (const value of Object.values(node)) {
      if (isRecord(value) || Array.isArray(value)) {
        visit(value);
      }
    }
  };

  visit(parsed);

  const joined = textFragments.join("");
  if (joined.trim()) {
    return joined;
  }

  return directPrompts[0] ?? "";
}

function extractJimengModelName(itemData: Record<string, unknown>): string {
  const aigcImageParams = isRecord(itemData.aigc_image_params)
    ? (itemData.aigc_image_params as Record<string, unknown>)
    : {};
  const text2videoParams = isRecord(aigcImageParams.text2video_params)
    ? (aigcImageParams.text2video_params as Record<string, unknown>)
    : {};
  const modelConfig = isRecord(text2videoParams.model_config)
    ? (text2videoParams.model_config as Record<string, unknown>)
    : {};

  return typeof modelConfig.model_name === "string" ? cleanSingleLine(modelConfig.model_name) : "";
}

export function parseJimengItemInfoPayload(payload: unknown, sourceUrl: string): PromptImportDraft | null {
  const root = typeof payload === "string" ? safeJsonParse(payload) : payload;

  if (!isRecord(root)) {
    return null;
  }

  if (typeof root.ret === "string" && root.ret !== "0") {
    return null;
  }

  const data = isRecord(root.data) ? (root.data as Record<string, unknown>) : null;
  if (!data) {
    return null;
  }

  const commonAttr = isRecord(data.common_attr) ? (data.common_attr as Record<string, unknown>) : {};
  const video = isRecord(data.video) ? (data.video as Record<string, unknown>) : null;
  const isVideoWork =
    Boolean(video) ||
    sourceUrl.includes("AiVideo") ||
    (typeof commonAttr.effect_type === "number" && commonAttr.effect_type === 53);

  const draftContent = isRecord(data.aigc_draft)
    ? (data.aigc_draft as Record<string, unknown>).content
    : undefined;
  const rebuiltPrompt = extractJimengPromptFromDraftContent(draftContent);
  const descriptionPrompt = typeof commonAttr.description === "string" ? commonAttr.description : "";
  const prompt = normalizeImportText(rebuiltPrompt || descriptionPrompt);

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const title = typeof commonAttr.title === "string" ? cleanSingleLine(commonAttr.title) : "";
  const videoUrl = video ? pickBestJimengVideoUrl(video) : null;
  const coverUrl = pickBestJimengCoverUrl(commonAttr);

  const sourceImageUrls = uniqueStrings(
    [isVideoWork ? videoUrl : null, coverUrl].filter((url): url is string => Boolean(url)),
  );

  if (sourceImageUrls.length === 0) {
    return null;
  }

  const modelName = extractJimengModelName(data);
  const generationMethod = modelName || "即梦AI";
  const contentTag = isVideoWork ? "视频提示词" : "图像提示词";
  const tags = uniqueTags(["网页分享", "即梦AI", contentTag]);

  const author = isRecord(data.author) ? (data.author as Record<string, unknown>) : {};
  const authorName = typeof author.name === "string" ? cleanSingleLine(author.name) : "";
  const authorAvatarUrl =
    typeof author.avatar_url === "string" && author.avatar_url.startsWith("http") ? author.avatar_url : null;

  return {
    title: title || createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod,
    sourceUrl,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName: authorName || "即梦AI用户",
    authorUrl: sourceUrl,
    authorAvatarUrl,
  };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseKnownPromptSiteHtml(html: string, siteInfo: KnownPromptSiteInfo): PromptImportDraft | null {
  if (isPromptMartSite(siteInfo)) {
    const promptMartDraft = parsePromptMartHtml(html, siteInfo);

    if (promptMartDraft) {
      return promptMartDraft;
    }
  }

  if (isJimengSite(siteInfo)) {
    const jimengDraft = parseJimengWorkHtml(html, siteInfo.sourceUrl);

    if (jimengDraft) {
      return jimengDraft;
    }
  }

  const canonicalUrl = extractKnownSiteCanonicalUrl(html, siteInfo.sourceUrl);
  const genericDraft = parsePromptDraftFromHtml(html, canonicalUrl);
  const sourceImageUrls = filterKnownPromptSiteImageUrls(
    siteInfo,
    dedupeDerivedRemoteMediaUrls([
      ...(genericDraft.sourceImageUrls ?? []),
      genericDraft.sourceImageUrl ?? "",
      ...extractPreloadImageUrls(html, canonicalUrl),
    ]).filter((url) => !isLikelyAvatarOrIconUrl(url)),
  );
  const prompt = normalizeImportText(genericDraft.prompt);

  if (!prompt || !isPromptCandidate(prompt) || isSourceOnlyPrompt(prompt)) {
    return null;
  }

  return {
    title: cleanKnownSiteTitle(genericDraft.title, siteInfo),
    prompt,
    negativePrompt: genericDraft.negativePrompt,
    tags: uniqueTags(["网页分享", siteInfo.siteName, ...siteInfo.tags, ...genericDraft.tags]),
    generationMethod: genericDraft.generationMethod ?? guessGenerationMethodFromText(prompt) ?? siteInfo.siteName,
    sourceUrl: canonicalUrl,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName: genericDraft.authorName ?? siteInfo.siteName,
    authorUrl: genericDraft.authorUrl ?? siteInfo.siteUrl,
    authorAvatarUrl: genericDraft.authorAvatarUrl ?? siteInfo.siteIconUrl,
  };
}

function isPromptMartSite(siteInfo: KnownPromptSiteInfo): boolean {
  return siteInfo.siteName === "谱码 PromptMart" || /promptmart\.cn/i.test(siteInfo.sourceUrl);
}

function isJimengSite(siteInfo: KnownPromptSiteInfo): boolean {
  try {
    return siteInfo.siteName === "即梦AI" || isJimengHostname(new URL(siteInfo.sourceUrl).hostname);
  } catch {
    return siteInfo.siteName === "即梦AI";
  }
}

/**
 * PromptMart 页面主数据在 Nuxt `__NUXT_DATA__` 中。
 * 视频作品：img=mp4，coverImg=封面；promptText 才是正文，不能用 meta description 营销文案。
 */
function parsePromptMartHtml(html: string, siteInfo: KnownPromptSiteInfo): PromptImportDraft | null {
  const payload = extractNuxtDataPayload(html);

  if (!payload) {
    return null;
  }

  const record = findPromptMartPromptRecord(payload);

  if (!record) {
    return null;
  }

  const canonicalUrl = extractKnownSiteCanonicalUrl(html, siteInfo.sourceUrl);
  const title = cleanKnownSiteTitle(getLocalizedString(record.title), siteInfo);
  const promptHtml = getLocalizedString(record.promptText ?? record.content ?? record.prompt);
  const prompt = normalizeImportText(stripHtmlToPlainText(promptHtml));

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  const isVideo =
    record.isVideo === true ||
    getLocalizedString(record.mediaType).toLowerCase() === "video" ||
    isImportableRemoteVideoUrl(resolveRemoteUrl(getLocalizedString(record.img), canonicalUrl) ?? "");
  const videoUrl = resolveRemoteUrl(
    getLocalizedString(record.img) ||
      getLocalizedString(record.videoUrl) ||
      getLocalizedString(record.mediaUrl) ||
      extractPromptMartMainVideoSrc(html),
    canonicalUrl,
  );
  const coverUrl = resolveRemoteUrl(
    getLocalizedString(record.coverImg) ||
      getLocalizedString(record.cover) ||
      getLocalizedString(record.poster) ||
      extractMetaPropertyContent(html, "og:image"),
    canonicalUrl,
  );
  const sourceMediaUrls = uniqueStrings(
    isVideo
      ? [videoUrl ?? "", coverUrl ?? ""].filter(Boolean)
      : [coverUrl ?? "", videoUrl ?? "", getLocalizedString(record.img)].filter(Boolean),
  ).filter((url) => {
    // 过滤站点二维码/静态资源。
    return !/\/_nuxt\/|wechatcode|qrcode|avatar\//i.test(url);
  });
  // 视频条目只导入主视频，不把封面拆成第二条素材。
  const importMediaUrls = isVideo
    ? sourceMediaUrls.filter((url) => isImportableRemoteVideoUrl(url)).slice(0, 1)
    : sourceMediaUrls.filter((url) => !isImportableRemoteVideoUrl(url)).slice(0, 3);
  const tags = uniqueTags([
    "网页分享",
    siteInfo.siteName,
    ...siteInfo.tags,
    isVideo ? "视频提示词" : "图像提示词",
    ...parseUnknownTags(record.tags),
    ...parseUnknownTags(record.categoryLabels),
  ]);
  const authorName = cleanSingleLine(getLocalizedString(record.authorName) || getLocalizedString(record.author));
  const generationMethod =
    guessGenerationMethodFromText([title, prompt, tags.join(" ")].join("\n")) ?? siteInfo.siteName;

  return {
    title: title || createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: "",
    tags,
    generationMethod,
    sourceUrl: canonicalUrl,
    sourceImageUrl: (importMediaUrls[0] ?? sourceMediaUrls[0] ?? null) as string | null,
    sourceImageUrls: importMediaUrls.length > 0 ? importMediaUrls : sourceMediaUrls.slice(0, 1),
    authorName: authorName || siteInfo.siteName,
    authorUrl: siteInfo.siteUrl,
    authorAvatarUrl:
      resolveRemoteUrl(getLocalizedString(record.authorAvatar), canonicalUrl) ?? siteInfo.siteIconUrl ?? null,
  };
}

function extractNuxtDataPayload(html: string): unknown | null {
  const match =
    html.match(/<script[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i) ??
    html.match(/window\.__NUXT__\s*=\s*([\s\S]*?);\s*<\/script>/i);

  if (!match?.[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1].trim()) as unknown;
  } catch {
    return null;
  }
}

function findPromptMartPromptRecord(payload: unknown): Record<string, unknown> | null {
  if (!Array.isArray(payload)) {
    return isRecord(payload) ? payload : null;
  }

  // Nuxt 3 payload: 索引数组，对象字段值是指向数组下标的 number。
  for (const value of payload) {
    if (!isRecord(value)) {
      continue;
    }

    const hasPromptTextRef = typeof value.promptText === "number" || typeof value.promptText === "string";
    const hasMediaRef =
      typeof value.img === "number" ||
      typeof value.img === "string" ||
      typeof value.coverImg === "number" ||
      typeof value.coverImg === "string";
    const hasTitleRef = typeof value.title === "number" || typeof value.title === "string";

    if ((hasPromptTextRef || hasTitleRef) && hasMediaRef) {
      return resolveNuxtRecord(payload, value);
    }
  }

  return null;
}

function resolveNuxtRecord(
  payload: unknown[],
  record: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 4) {
    return record;
  }

  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    resolved[key] = resolveNuxtValue(payload, value, depth + 1);
  }

  return resolved;
}

function resolveNuxtValue(payload: unknown[], value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return value;
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < payload.length) {
    return resolveNuxtValue(payload, payload[value], depth + 1);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveNuxtValue(payload, item, depth + 1));
  }

  if (isRecord(value)) {
    return resolveNuxtRecord(payload, value, depth + 1);
  }

  return value;
}

function extractPromptMartMainVideoSrc(html: string): string {
  const match = html.match(
    /<video\b[^>]*\bsrc=["']([^"']+\.(?:mp4|webm|mov)[^"']*)["'][^>]*\bposter=["'][^"']+["']/i,
  );

  return match?.[1] ?? "";
}

function stripHtmlToPlainText(input: string): string {
  if (!input) {
    return "";
  }

  return decodeHtmlEntities(
    input
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n")
      .replace(/<\s*\/\s*div\s*>/gi, "\n")
      .replace(/<\s*\/\s*li\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/ /g, " "),
  );
}

function filterKnownPromptSiteImageUrls(siteInfo: KnownPromptSiteInfo, urls: string[]): string[] {
  const importableUrls = getImportableRemoteMediaUrls(urls);

  if (siteInfo.siteName === "LibLibAI") {
    return importableUrls.filter((url) => !isLibLibWatermarkedImageUrl(url));
  }

  return importableUrls;
}

function isLibLibWatermarkedImageUrl(value: string): boolean {
  try {
    const hostname = normalizeHostname(new URL(value).hostname);

    return hostname === "images-wm.liblib.cloud" || hostname.endsWith(".images-wm.liblib.cloud");
  } catch {
    return false;
  }
}

export function parsePromptDraftFromHtml(html: string, sourceUrl: string): PromptImportDraft {
  const base = parsePromptShareUrl(sourceUrl) ?? {
    ...createEmptyPromptImportDraft(),
    title: "网页提示词",
    prompt: buildSourcePrompt(sourceUrl),
    tags: ["网页分享"],
    sourceUrl,
  };
  const title = extractHtmlTitle(html) || base.title;
  const description = extractMetaContent(html, "description") || extractMetaPropertyContent(html, "og:description");
  const authorName = extractHtmlAuthorName(html);
  const authorUrl = extractHtmlAuthorUrl(html);
  const authorAvatarUrl = extractHtmlAuthorAvatarUrl(html);
  const generationMethod = extractMetaContent(html, "generator") || extractMetaPropertyContent(html, "ai:model");
  const imageUrl =
    extractMetaPropertyContent(html, "og:image") ||
    extractMetaContent(html, "twitter:image") ||
    extractMetaPropertyContent(html, "twitter:image");
  const jsonDraft = pickBestDraft(extractPromptDraftsFromHtmlJson(html, sourceUrl));
  const embeddedDraft = pickBestDraft(extractPromptDraftsFromInlineFields(html, sourceUrl));
  const parsedDraft = mergePromptImportDrafts(jsonDraft ?? {}, embeddedDraft ?? {});
  const sourceImageUrls = uniqueStrings([
    ...(parsedDraft.sourceImageUrls ?? []),
    parsedDraft.sourceImageUrl ?? "",
    resolveRemoteUrl(imageUrl, sourceUrl) ?? "",
  ]);

  return mergePromptImportDrafts(
    parsedDraft,
    {
      title: parsedDraft.title || title,
      prompt: parsedDraft.prompt ? "" : buildSourcePrompt(sourceUrl, description),
      tags: extractKeywords(html),
      generationMethod,
      sourceUrl,
      sourceImageUrl: sourceImageUrls[0] ?? null,
      sourceImageUrls,
      authorName,
      authorUrl,
      authorAvatarUrl,
    },
    base,
  );
}

type ComfyPromptNode = {
  class_type?: unknown;
  inputs?: Record<string, unknown>;
  _meta?: { title?: unknown };
};

const comfySamplerClassTypes = [
  "ksampler",
  "ksampleradvanced",
  "samplercustom",
  "samplercustomadvanced",
  "ksampler (efficient)",
  "ksampler_a1111",
];

const comfyTextEncodeClassTypes = ["cliptextencode", "cliptextencodesdxl", "cliptextencodeflux", "bnk_cliptextencodeadvanced"];

const comfyModelInputKeys = ["ckpt_name", "unet_name", "model_name", "model"];

function parseComfyUiPromptChunks(chunks: PngTextChunk[]): PromptImportDraft {
  const promptChunk = chunks.find((chunk) => chunk.keyword.toLowerCase() === "prompt");
  const workflowChunk = chunks.find((chunk) => chunk.keyword.toLowerCase() === "workflow");

  const graph = parseComfyPromptGraph(promptChunk?.text) ?? parseComfyPromptGraphFromWorkflow(workflowChunk?.text);

  if (!graph) {
    return createEmptyPromptImportDraft();
  }

  const { positive, negative } = extractComfyPromptTexts(graph);
  const prompt = normalizeImportText(positive);

  if (!prompt || !isPromptCandidate(prompt)) {
    return createEmptyPromptImportDraft();
  }

  const generationMethod = extractComfyModelName(graph);

  return mergePromptImportDrafts({
    title: createTitleFromPrompt(prompt),
    prompt,
    negativePrompt: normalizeImportText(negative),
    tags: uniqueTags(["ComfyUI", ...(generationMethod ? [generationMethod] : [])]),
    generationMethod: generationMethod ?? "ComfyUI",
    sourceUrl: null,
    sourceImageUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
  });
}

function parseComfyPromptGraph(text: string | undefined): Record<string, ComfyPromptNode> | null {
  if (!text || !looksLikeJson(text)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const nodes = Object.values(parsed).filter(isRecord);
  const hasClassType = nodes.some((node) => typeof (node as ComfyPromptNode).class_type === "string");

  if (!hasClassType) {
    return null;
  }

  return parsed as Record<string, ComfyPromptNode>;
}

function parseComfyPromptGraphFromWorkflow(text: string | undefined): Record<string, ComfyPromptNode> | null {
  if (!text || !looksLikeJson(text)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.nodes)) {
    return null;
  }

  const graph: Record<string, ComfyPromptNode> = {};

  for (const node of parsed.nodes) {
    if (!isRecord(node)) {
      continue;
    }

    const id = node.id;
    const classType = typeof node.type === "string" ? node.type : undefined;

    if ((typeof id !== "number" && typeof id !== "string") || !classType) {
      continue;
    }

    const widgetValues = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    const textValue = widgetValues.find((value): value is string => typeof value === "string");
    const title = isRecord(node.title) ? undefined : typeof node.title === "string" ? node.title : undefined;

    graph[String(id)] = {
      class_type: classType,
      inputs: textValue !== undefined ? { text: textValue } : {},
      _meta: title ? { title } : undefined,
    };
  }

  return Object.keys(graph).length > 0 ? graph : null;
}

function extractComfyPromptTexts(graph: Record<string, ComfyPromptNode>): { positive: string; negative: string } {
  const sampler = findComfySamplerNode(graph);

  if (sampler) {
    const positive = resolveComfyTextFromLink(graph, sampler.inputs?.positive);
    const negative = resolveComfyTextFromLink(graph, sampler.inputs?.negative);

    if (positive) {
      return { positive, negative };
    }
  }

  return guessComfyPromptTextsByHeuristic(graph);
}

function findComfySamplerNode(graph: Record<string, ComfyPromptNode>): ComfyPromptNode | null {
  for (const node of Object.values(graph)) {
    const classType = getComfyClassType(node);

    if (comfySamplerClassTypes.includes(classType) && isRecord(node.inputs) && "positive" in node.inputs) {
      return node;
    }
  }

  return null;
}

function resolveComfyTextFromLink(graph: Record<string, ComfyPromptNode>, link: unknown, depth = 0): string {
  if (depth > 8) {
    return "";
  }

  if (typeof link === "string") {
    return link;
  }

  if (!Array.isArray(link) || link.length === 0) {
    return "";
  }

  const targetId = link[0];

  if (typeof targetId !== "string" && typeof targetId !== "number") {
    return "";
  }

  const node = graph[String(targetId)];

  if (!node || !isRecord(node.inputs)) {
    return "";
  }

  const text = node.inputs.text;

  if (typeof text === "string") {
    return text;
  }

  if (Array.isArray(text)) {
    return resolveComfyTextFromLink(graph, text, depth + 1);
  }

  return "";
}

function guessComfyPromptTextsByHeuristic(graph: Record<string, ComfyPromptNode>): { positive: string; negative: string } {
  const textNodes = Object.values(graph).filter(
    (node) => comfyTextEncodeClassTypes.includes(getComfyClassType(node)) && typeof node.inputs?.text === "string",
  );

  let positive = "";
  let negative = "";

  for (const node of textNodes) {
    const text = typeof node.inputs?.text === "string" ? node.inputs.text : "";
    const title = getComfyNodeTitle(node);
    const isNegative = /negative|负向|反向|neg\b/i.test(title);

    if (isNegative) {
      if (!negative) {
        negative = text;
      }
      continue;
    }

    if (!positive) {
      positive = text;
    }
  }

  if (!positive && textNodes.length > 0) {
    positive = typeof textNodes[0].inputs?.text === "string" ? textNodes[0].inputs.text : "";

    if (!negative && textNodes.length > 1) {
      negative = typeof textNodes[1].inputs?.text === "string" ? textNodes[1].inputs.text : "";
    }
  }

  return { positive, negative };
}

function extractComfyModelName(graph: Record<string, ComfyPromptNode>): string | null {
  for (const node of Object.values(graph)) {
    const classType = getComfyClassType(node);

    if (!classType.includes("loader") || !isRecord(node.inputs)) {
      continue;
    }

    for (const key of comfyModelInputKeys) {
      const value = node.inputs[key];

      if (typeof value === "string" && value.trim()) {
        const cleaned = cleanSingleLine(value).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "").replace(/^.*[/\\]/, "");

        if (cleaned) {
          return cleaned;
        }
      }
    }
  }

  return null;
}

function getComfyClassType(node: ComfyPromptNode): string {
  return typeof node.class_type === "string" ? node.class_type.toLowerCase() : "";
}

function getComfyNodeTitle(node: ComfyPromptNode): string {
  const title = node._meta?.title;

  return typeof title === "string" ? title : "";
}

export function parsePromptDraftFromImageMetadata(input: Uint8Array): PromptImportDraft {
  const chunks = extractPngTextChunks(input);

  const comfyDraft = parseComfyUiPromptChunks(chunks);

  if (hasPromptContent(comfyDraft)) {
    return comfyDraft;
  }

  const priority = ["parameters", "prompt", "positive", "description", "comment", "workflow"];
  const sortedChunks = [...chunks].sort((left, right) => {
    const leftIndex = priority.findIndex((keyword) => left.keyword.toLowerCase().includes(keyword));
    const rightIndex = priority.findIndex((keyword) => right.keyword.toLowerCase().includes(keyword));
    return normalizePriorityIndex(leftIndex) - normalizePriorityIndex(rightIndex);
  });

  for (const chunk of sortedChunks) {
    const draft = parsePromptText(chunk.text);

    if (hasPromptContent(draft)) {
      return draft;
    }
  }

  return createEmptyPromptImportDraft();
}

export function extractPngTextChunks(input: Uint8Array): PngTextChunk[] {
  if (!isPng(input)) {
    return [];
  }

  const chunks: PngTextChunk[] = [];
  let offset = 8;

  while (offset + 12 <= input.length) {
    const length = readUInt32BE(input, offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const nextOffset = dataEnd + 4;

    if (length < 0 || dataEnd > input.length || nextOffset > input.length) {
      break;
    }

    const type = decodeAscii(input.subarray(typeStart, typeStart + 4));
    const data = input.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const chunk = parseTextChunk(data);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    if (type === "iTXt") {
      const chunk = parseInternationalTextChunk(data);
      if (chunk) {
        chunks.push(chunk);
      }
    }

    if (type === "IEND") {
      break;
    }

    offset = nextOffset;
  }

  return chunks;
}

function parseStableDiffusionText(text: string): PromptImportDraft {
  const negativeMatch = matchLabelPosition(text, ["Negative prompt", "negative prompt", "反向提示词", "负向提示词"]);
  const paramsMatch = matchParameterPosition(text);

  if (negativeMatch) {
    const prompt = stripPromptLabel(text.slice(0, negativeMatch.index));
    const negativeStart = negativeMatch.index + negativeMatch.label.length;
    const rest = text.slice(negativeStart).replace(/^\s*[:：]\s*/, "");
    const restParamsMatch = matchParameterPosition(rest);
    const negativePrompt = restParamsMatch ? rest.slice(0, restParamsMatch.index) : rest;
    const parameterText = restParamsMatch ? rest.slice(restParamsMatch.index) : "";

    return {
      title: createTitleFromPrompt(prompt),
      prompt: normalizeImportText(prompt),
      negativePrompt: normalizeImportText(negativePrompt),
      tags: extractTagsFromParameterText(parameterText),
      generationMethod: null,
      sourceUrl: null,
      sourceImageUrl: null,
      authorName: null,
      authorUrl: null,
      authorAvatarUrl: null,
    };
  }

  if (paramsMatch) {
    const prompt = stripPromptLabel(text.slice(0, paramsMatch.index));

    return {
      title: createTitleFromPrompt(prompt),
      prompt: normalizeImportText(prompt),
      negativePrompt: "",
      tags: extractTagsFromParameterText(text.slice(paramsMatch.index)),
      generationMethod: null,
      sourceUrl: null,
      sourceImageUrl: null,
      authorName: null,
      authorUrl: null,
      authorAvatarUrl: null,
    };
  }

  return createEmptyPromptImportDraft();
}

function parseLabeledPromptText(text: string): PromptImportDraft {
  const blocks: Record<"title" | "prompt" | "negativePrompt" | "tags", string[]> = {
    title: [],
    prompt: [],
    negativePrompt: [],
    tags: [],
  };
  let current: keyof typeof blocks | null = null;

  for (const line of text.split("\n")) {
    const label = classifyLabelLine(line);

    if (label) {
      current = label.kind;
      if (label.value) {
        blocks[current].push(label.value);
      }
      continue;
    }

    if (current) {
      blocks[current].push(line);
    }
  }

  return {
    title: cleanSingleLine(blocks.title.join(" ")),
    prompt: normalizeImportText(blocks.prompt.join("\n")),
    negativePrompt: normalizeImportText(blocks.negativePrompt.join("\n")),
    tags: parseTags(blocks.tags.join("\n")),
    generationMethod: null,
    sourceUrl: null,
    sourceImageUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
  };
}

function parseJsonPromptText(text: string): PromptImportDraft {
  if (!looksLikeJson(text)) {
    return createEmptyPromptImportDraft();
  }

  try {
    return pickBestDraft(extractPromptDraftsFromUnknown(JSON.parse(text))) ?? createEmptyPromptImportDraft();
  } catch {
    return createEmptyPromptImportDraft();
  }
}

function extractPromptDraftsFromHtmlJson(html: string, baseUrl = ""): PromptImportDraft[] {
  const drafts: PromptImportDraft[] = [];
  const scriptRegex = /<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;

  while ((scriptMatch = scriptRegex.exec(html))) {
    const content = decodeHtmlEntities(scriptMatch[1] ?? "").trim();

    if (!content) {
      continue;
    }

    try {
      drafts.push(...extractPromptDraftsFromUnknown(JSON.parse(content), 0, baseUrl));
    } catch {
    }
  }

  drafts.push(...extractPromptDraftsFromNextFlight(html, baseUrl));

  return drafts;
}

function extractPromptDraftsFromInlineFields(html: string, baseUrl = ""): PromptImportDraft[] {
  const drafts: PromptImportDraft[] = [];
  const fieldRegex =
    /["'](title|name|prompt|positivePrompt|positive_prompt|content|description|negativePrompt|negative_prompt|tags|category|image|images|imageUrl|image_url|cover|coverUrl|thumbnail|thumbnailUrl|author|authorName|authorUrl|authorAvatarUrl|avatar|avatarUrl|model|generationMethod)["']\s*:\s*(["'])(.*?)\2/gi;
  const records: Record<string, string>[] = [];
  const aggregateRecord: Record<string, string> = {};
  let match: RegExpExecArray | null;

  while ((match = fieldRegex.exec(html))) {
    const key = match[1] ?? "";
    const value = decodeEscapedString(match[3] ?? "");

    records.push({ [key]: value });

    if (!aggregateRecord[key]) {
      aggregateRecord[key] = value;
    }
  }

  if (Object.keys(aggregateRecord).length > 0) {
    records.unshift(aggregateRecord);
  }

  for (const record of records) {
    drafts.push(...extractPromptDraftsFromUnknown(record, 0, baseUrl));
  }

  return drafts;
}

function extractPromptDraftsFromNextFlight(html: string, baseUrl: string): PromptImportDraft[] {
  const flightText = extractNextFlightText(html);
  const drafts: PromptImportDraft[] = [];
  const promptRegex =
    /"(?:prompt|positivePrompt|positive_prompt|content|description|text)"\s*:\s*"([\s\S]{8,4000}?)"/gi;
  let match: RegExpExecArray | null;

  while ((match = promptRegex.exec(flightText))) {
    const index = match.index;
    const objectText = extractJsonObjectAroundIndex(flightText, index);

    if (!objectText) {
      continue;
    }

    try {
      drafts.push(...extractPromptDraftsFromUnknown(JSON.parse(objectText), 0, baseUrl));
    } catch {
    }
  }

  return drafts;
}

function extractPromptDraftsFromUnknown(input: unknown, depth = 0, baseUrl = ""): PromptImportDraft[] {
  if (depth > 8) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => extractPromptDraftsFromUnknown(item, depth + 1, baseUrl));
  }

  if (!isRecord(input)) {
    return [];
  }

  const drafts: PromptImportDraft[] = [];
  const recordDraft = draftFromRecord(input, baseUrl);

  if (recordDraft && hasPromptContent(recordDraft)) {
    drafts.push(recordDraft);
  }

  for (const value of Object.values(input)) {
    if (Array.isArray(value) || isRecord(value)) {
      drafts.push(...extractPromptDraftsFromUnknown(value, depth + 1, baseUrl));
    }
  }

  return drafts;
}

function draftFromRecord(record: Record<string, unknown>, baseUrl = ""): PromptImportDraft | null {
  const title = firstStringValue(record, titleKeys);
  const prompt = firstStringValue(record, promptKeys);
  const negativePrompt = firstStringValue(record, negativeKeys);
  const tags = firstTagValues(record, tagKeys);
  const generationMethod = firstStringValue(record, generationMethodKeys);
  const authorName = getRecordAuthorName(record);
  const authorUrl = getRecordAuthorUrl(record, baseUrl);
  const authorAvatarUrl = getRecordAuthorAvatarUrl(record, baseUrl);
  const sourceImageUrls = extractRecordImageUrls(record, baseUrl);

  if (!prompt || !isPromptCandidate(prompt)) {
    return null;
  }

  return {
    title: title ? cleanSingleLine(title) : createTitleFromPrompt(prompt),
    prompt: normalizeImportText(prompt),
    negativePrompt: negativePrompt ? normalizeImportText(negativePrompt) : "",
    tags,
    generationMethod: generationMethod ? cleanSingleLine(generationMethod) : null,
    sourceUrl: null,
    sourceImageUrl: sourceImageUrls[0] ?? null,
    sourceImageUrls,
    authorName,
    authorUrl,
    authorAvatarUrl,
  };
}

function pickBestDraft(drafts: PromptImportDraft[]): PromptImportDraft | null {
  const sorted = drafts
    .filter(hasPromptContent)
    .sort((left, right) => scoreDraft(right) - scoreDraft(left));

  return sorted[0] ?? null;
}

function scoreDraft(draft: PromptImportDraft): number {
  let score = draft.prompt.length;

  if (draft.title) {
    score += 24;
  }

  if (draft.negativePrompt) {
    score += 16;
  }

  score += draft.tags.length * 4;

  return score;
}

function fillPromptDraftFallback(draft: PromptImportDraft, rawText: string): PromptImportDraft {
  return mergePromptImportDrafts(draft, {
    title: draft.title || createTitleFromPrompt(draft.prompt || rawText),
  });
}

function hasPromptContent(draft: PromptImportDraft | null | undefined): draft is PromptImportDraft {
  return Boolean(draft?.prompt && isPromptCandidate(draft.prompt));
}

function classifyLabelLine(line: string): { kind: "title" | "prompt" | "negativePrompt" | "tags"; value: string } | null {
  const match = line.match(/^\s*([^:：]{1,36})\s*[:：]\s*(.*)$/);

  if (!match) {
    return null;
  }

  const label = match[1].trim().toLowerCase();
  const value = match[2] ?? "";

  if (["标题", "名称", "title", "name"].includes(label)) {
    return { kind: "title", value };
  }

  if (["反向提示词", "负向提示词", "negative prompt", "negative", "negative_prompt"].includes(label)) {
    return { kind: "negativePrompt", value };
  }

  if (["标签", "分类", "tags", "tag", "category", "categories", "keywords"].includes(label)) {
    return { kind: "tags", value };
  }

  if (["提示词", "正向提示词", "prompt", "positive prompt", "positive", "content"].includes(label)) {
    return { kind: "prompt", value };
  }

  return null;
}

function matchLabelPosition(text: string, labels: string[]): { index: number; label: string } | null {
  const lowerText = text.toLowerCase();
  let best: { index: number; label: string } | null = null;

  for (const label of labels) {
    const index = lowerText.search(new RegExp(`(^|\\n)\\s*${escapeRegExp(label.toLowerCase())}\\s*[:：]`, "i"));

    if (index >= 0 && (!best || index < best.index)) {
      const matched = text.slice(index).match(new RegExp(`^\\s*${escapeRegExp(label)}\\s*[:：]`, "i"));
      best = { index, label: matched?.[0] ?? label };
    }
  }

  return best;
}

function matchParameterPosition(text: string): { index: number } | null {
  const match = text.match(/(^|\n)\s*(Steps|Sampler|CFG scale|Seed|Size|Model hash|Model|Clip skip|ENSD|Version)\s*[:：]/i);

  if (!match || match.index === undefined) {
    return null;
  }

  return { index: match.index };
}

function stripPromptLabel(text: string): string {
  return text.replace(/^\s*(Prompt|Positive prompt|正向提示词|提示词)\s*[:：]\s*/i, "");
}

function extractTagsFromParameterText(text: string): string[] {
  const tags: string[] = [];
  const model = text.match(/(?:^|,\s*)Model\s*[:：]\s*([^,\n]+)/i)?.[1];

  if (model) {
    tags.push(model);
  }

  return uniqueTags(tags);
}

function isXmiaomHostname(hostname: string): boolean {
  return hostname.toLowerCase().replace(/^www\./, "") === "img.xmiaom.com";
}

function extractNextFlightText(html: string): string {
  const chunks: string[] = [];
  const scriptRegex = /<script\b[^>]*>\s*self\.__next_f\.push\(([\s\S]*?)\)\s*<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html))) {
    const payloadText = decodeHtmlEntities(match[1] ?? "").trim();

    if (!payloadText) {
      continue;
    }

    try {
      const payload = JSON.parse(payloadText) as unknown;

      if (Array.isArray(payload)) {
        chunks.push(...payload.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      const stringMatch = payloadText.match(/^\[\s*\d+\s*,\s*"([\s\S]*)"\s*\]$/);

      if (stringMatch) {
        chunks.push(decodeEscapedString(stringMatch[1] ?? ""));
      }
    }
  }

  if (chunks.length > 0) {
    return chunks.join("\n");
  }

  return decodeHtmlEntities(html).replace(/\\\//g, "/").replace(/\\"/g, "\"");
}

function extractXmiaomPromptRecord(text: string, imageId: string): Record<string, unknown> | null {
  const escapedImageId = escapeRegExp(imageId);
  const targetRegex = imageId
    ? new RegExp(`"imageId"\\s*:\\s*"${escapedImageId}"`, "i")
    : /"imageId"\s*:\s*"[^"]+"/i;
  const targetIndex = text.search(targetRegex);
  const candidateIndexes = targetIndex >= 0 ? [targetIndex] : getXmiaomPromptCandidateIndexes(text);

  for (const index of candidateIndexes) {
    const objectText = extractJsonObjectAroundIndex(text, index);

    if (!objectText) {
      continue;
    }

    try {
      const record = JSON.parse(objectText) as unknown;

      if (!isRecord(record)) {
        continue;
      }

      // 新版页面 prompt 可能是 "$17" 引用，只要有 imageId/href/model 就接受。
      if (
        getRecordStringField(record, "prompt") ||
        getRecordStringField(record, "imageId") ||
        getRecordStringField(record, "href") ||
        getRecordStringField(record, "model")
      ) {
        return record;
      }
    } catch {
    }
  }

  return null;
}

function getXmiaomPromptCandidateIndexes(text: string): number[] {
  const indexes: number[] = [];
  const regex = /"prompt"\s*:\s*"/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index !== undefined) {
      indexes.push(match.index);
    }
  }

  // 兼容 "prompt":"$17" 与 imageId 定位失败时的侧栏对象。
  const imageIdRegex = /"imageId"\s*:\s*"/gi;
  while ((match = imageIdRegex.exec(text))) {
    if (match.index !== undefined) {
      indexes.push(match.index);
    }
  }

  return indexes;
}

function resolveXmiaomFlightValue(flightText: string, value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : getLocalizedString(value);

  if (!raw) {
    return "";
  }

  // RSC 引用：prompt:"$17" / "$L17" / "$1b" / "$L1b"（槽位 id 为十六进制）
  const refMatch = raw.match(/^\$L?([0-9a-f]+)$/i);

  if (refMatch?.[1]) {
    const resolved = extractNextFlightSlotText(flightText, refMatch[1]);

    if (resolved) {
      return normalizeImportText(resolved);
    }
  }

  // 直接文本，或意外混入引用前缀时的兜底。
  if (!raw.startsWith("$")) {
    return normalizeImportText(raw);
  }

  return "";
}

/**
 * Next.js flight 文本槽位形如：
 * 17:T442,        （十进制长度）
 * 1b:Tdac,        （十六进制槽位 id + 十六进制长度）
 * <text...>
 *
 * 结束条件优先匹配下一个真正的 flight 槽位头；
 * 否则回退到声明长度。不能用裸 `\d+:`，提示词里常见 `3:4`。
 */
function extractNextFlightSlotText(flightText: string, slotId: string): string {
  const escapedSlotId = escapeRegExp(slotId);
  // 长度字段可能是十进制（442）或十六进制（dac）
  const headerRegex = new RegExp(`(?:^|\\n)${escapedSlotId}:T([0-9a-fA-F]+),\\n`, "i");
  const match = headerRegex.exec(flightText);

  if (!match || match.index === undefined) {
    return "";
  }

  const lengthToken = match[1] ?? "0";
  const claimedLength = parseFlightLengthToken(lengthToken);
  const start = match.index + match[0].length;
  const rest = flightText.slice(start);
  // 真实 flight 槽位头：15:T442, / 1b:Tdac, / 5:I[... / 0:{"P"... / 7:null / 16:["$
  const nextHeader = rest.search(/(?:^|\n)[0-9a-fA-F]+:(?:T[0-9a-fA-F]+,|[A-Z]|\[["$]|\{|null\b)/i);

  if (nextHeader >= 0) {
    return rest.slice(0, nextHeader).replace(/^\n+|\n+$/g, "");
  }

  if (claimedLength > 0) {
    // 声明长度常包含结尾换行后的下一个槽位前缀，优先去掉尾部槽位头。
    const claimed = rest.slice(0, claimedLength);
    const claimedNext = claimed.search(/(?:^|\n)[0-9a-fA-F]+:(?:T[0-9a-fA-F]+,|[A-Z]|\[["$]|\{|null\b)/i);
    if (claimedNext >= 0) {
      return claimed.slice(0, claimedNext).replace(/^\n+|\n+$/g, "");
    }
    return claimed.replace(/^\n+|\n+$/g, "");
  }

  return rest.trim();
}

function parseFlightLengthToken(token: string): number {
  const value = token.trim();

  if (!value) {
    return 0;
  }

  // 含 a-f 时按十六进制；纯数字优先十进制（保持 442 这类旧格式兼容）。
  if (/[a-f]/i.test(value)) {
    const hex = Number.parseInt(value, 16);
    return Number.isFinite(hex) ? hex : 0;
  }

  const decimal = Number.parseInt(value, 10);
  return Number.isFinite(decimal) ? decimal : 0;
}

function extractJsonObjectAroundIndex(text: string, index: number): string | null {
  const start = text.lastIndexOf("{", index);

  if (start < 0) {
    return null;
  }

  return extractJsonObjectFromStart(text, start);
}

function extractJsonObjectFromStart(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function getRecordStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];

  return typeof value === "string" ? value : getLocalizedString(value);
}

function extractXmiaomSourceImageUrls(
  html: string,
  record: Record<string, unknown>,
  baseUrl: string,
  flightText = "",
): string[] {
  const href = resolveRemoteUrl(
    resolveXmiaomFlightValue(flightText, record.href) || getRecordStringField(record, "href"),
    baseUrl,
  );
  const uuid = cleanSingleLine(
    resolveXmiaomFlightValue(flightText, record.uuid) || getRecordStringField(record, "uuid"),
  );
  const uuidUrl = uuid ? `https://img.xmiaom.com/api/img/${encodeURIComponent(uuid)}` : null;
  const metaImageUrl = resolveRemoteUrl(
    extractMetaPropertyContent(html, "og:image") ||
      extractMetaContent(html, "twitter:image") ||
      extractMetaPropertyContent(html, "twitter:image"),
    baseUrl,
  );

  // 详情页 HTML/flight 里会混入推荐流的大量 /api/img/*；单条导入只取当前作品主图。
  const primaryCandidates = uniqueStrings([href ?? "", uuidUrl ?? "", metaImageUrl ?? ""]).filter((url) =>
    isXmiaomApiUrl(url, "/api/img/"),
  );

  if (primaryCandidates.length > 0) {
    return primaryCandidates.slice(0, 1);
  }

  // 极少数页面没有 href/og 时，再回退 preload，并限制数量，避免把推荐图整页导入。
  return uniqueStrings([
    ...extractXmiaomPreloadImageUrls(html, baseUrl, "/api/img/"),
    ...extractXmiaomInlineApiUrls(html, baseUrl, "/api/img/"),
  ])
    .filter((url) => isXmiaomApiUrl(url, "/api/img/"))
    .slice(0, 1);
}

function extractXmiaomAuthorAvatarUrl(html: string, authorId: string, baseUrl: string): string {
  if (authorId) {
    return `https://img.xmiaom.com/api/avatar/${encodeURIComponent(authorId)}`;
  }

  return (
    extractXmiaomPreloadImageUrls(html, baseUrl, "/api/avatar/")[0] ??
    extractXmiaomInlineApiUrls(html, baseUrl, "/api/avatar/")[0] ??
    "https://img.xmiaom.com/logo.webp"
  );
}

function extractXmiaomPreloadImageUrls(html: string, baseUrl: string, pathPrefix: string): string[] {
  const urls: string[] = [];
  const linkRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html))) {
    const tag = match[0] ?? "";
    const asValue = getHtmlTagAttribute(tag, "as").toLowerCase();

    if (asValue !== "image") {
      continue;
    }

    const href = resolveRemoteUrl(getHtmlTagAttribute(tag, "href"), baseUrl);
    const srcset = getHtmlTagAttribute(tag, "imagesrcset");

    if (href) {
      urls.push(href);
    }

    if (srcset) {
      urls.push(...parseSrcSetUrls(srcset).map((url) => resolveRemoteUrl(url, baseUrl) ?? ""));
    }
  }

  return uniqueStrings(urls).filter((url) => isXmiaomApiUrl(url, pathPrefix));
}

function extractXmiaomInlineApiUrls(html: string, baseUrl: string, pathPrefix: string): string[] {
  const urls: string[] = [];
  const normalizedHtml = decodeHtmlEntities(html).replace(/\\\//g, "/");
  const regex = /(?:https?:\/\/img\.xmiaom\.com)?\/api\/(?:img|avatar)\/[a-z0-9_-]+/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalizedHtml))) {
    const url = resolveRemoteUrl(match[0] ?? "", baseUrl);

    if (url && isXmiaomApiUrl(url, pathPrefix)) {
      urls.push(url);
    }
  }

  return uniqueStrings(urls);
}

function extractXmiaomTagLabels(text: string): string[] {
  const tags: string[] = [];
  const regex = /"href"\s*:\s*"\/\?tag=([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    tags.push(decodeUrlComponent(match[1] ?? ""));
  }

  return uniqueTags(tags);
}

function isXmiaomApiUrl(url: string, pathPrefix: string): boolean {
  try {
    const parsedUrl = new URL(url);

    return isXmiaomHostname(parsedUrl.hostname) && parsedUrl.pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}

function decodeUrlComponent(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function isWebToMindHostname(hostname: string): boolean {
  return hostname.toLowerCase().replace(/^www\./, "") === "webtomind.com";
}

function isWebToMindPromptPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  return (
    /^\/(?:(?:zh-CN|en-US)\/)?prompts(?:\/[^/]+)?$/i.test(path) ||
    /^\/(?:(?:zh-CN|en-US)\/)?create\/prompts\/share\/[^/]+$/i.test(path)
  );
}

function extractWebToMindCreativeWork(html: string): Record<string, unknown> | null {
  const candidates: unknown[] = [];
  const seoJsonLd = html.match(
    /<script\b(?=[^>]*\bid=["']webtomind-seo-jsonld["'])[^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];

  if (seoJsonLd) {
    const payload = parseJsonScriptPayload(seoJsonLd);

    if (payload) {
      candidates.push(payload);
    }
  }

  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html))) {
    const payload = parseJsonScriptPayload(match[1] ?? "");

    if (payload) {
      candidates.push(payload);
    }
  }

  for (const candidate of candidates) {
    const creativeWork = findWebToMindCreativeWork(candidate);

    if (creativeWork) {
      return creativeWork;
    }
  }

  return null;
}

function parseJsonScriptPayload(content: string): unknown | null {
  try {
    return JSON.parse(decodeHtmlEntities(content).trim()) as unknown;
  } catch {
    return null;
  }
}

function findWebToMindPromptCaseRecord(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) {
    return null;
  }

  const cases = Array.isArray(input.cases) ? input.cases : [];
  const firstCase = cases.find(isRecord);

  if (firstCase) {
    return firstCase;
  }

  if (isRecord(input.case)) {
    return input.case;
  }

  if (typeof input.prompt === "string" || typeof input.promptZh === "string") {
    return input;
  }

  return null;
}

function findWebToMindCreativeWork(input: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 5) {
    return null;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const record = findWebToMindCreativeWork(item, depth + 1);

      if (record) {
        return record;
      }
    }

    return null;
  }

  if (!isRecord(input)) {
    return null;
  }

  const type = getJsonLdType(input["@type"]).toLowerCase();
  const url = getRemoteUrl(input.url);

  if (
    type.includes("creativework") ||
    (typeof input.name === "string" && Boolean(input.image) && Boolean(url?.includes("webtomind.com")))
  ) {
    return input;
  }

  for (const value of Object.values(input)) {
    if (Array.isArray(value) || isRecord(value)) {
      const record = findWebToMindCreativeWork(value, depth + 1);

      if (record) {
        return record;
      }
    }
  }

  return null;
}

function getJsonLdType(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.filter((item): item is string => typeof item === "string").join(" ");
  }

  return "";
}

function extractWebToMindCanonicalUrl(html: string, sourceUrl: string): string {
  const canonicalUrl = resolveRemoteUrl(extractLinkHref(html, "canonical"), sourceUrl);

  if (!canonicalUrl) {
    return sourceUrl;
  }

  try {
    return isWebToMindHostname(new URL(canonicalUrl).hostname) ? canonicalUrl : sourceUrl;
  } catch {
    return sourceUrl;
  }
}

function cleanWebToMindTitle(input: string): string {
  return cleanSingleLine(input).replace(/\s*\|\s*WebToMind\s+Prompts\s*$/i, "");
}

function extractWebToMindSsrPrompt(html: string): string {
  const preRegex = /<pre\b(?=[^>]*class=["'][^"']*prompt-detail-ssr-prompt[^"']*["'])[^>]*>([\s\S]*?)<\/pre>/i;
  const content = html.match(preRegex)?.[1] ?? "";

  if (!content) {
    return "";
  }

  return normalizeImportText(stripHtmlTags(content.replace(/<br\s*\/?>/gi, "\n")));
}

function cleanWebToMindDescription(description: string, title: string): string {
  let text = cleanSingleLine(description);
  const cleanTitle = cleanSingleLine(title);

  if (!text) {
    return "";
  }

  if (cleanTitle && text.startsWith(`${cleanTitle} ·`)) {
    text = text.slice(`${cleanTitle} ·`.length).trim();
  }

  return text;
}

function extractWebToMindKeywords(jsonLd: Record<string, unknown> | null): string[] {
  if (!jsonLd) {
    return [];
  }

  return parseUnknownTags(jsonLd.keywords ?? jsonLd.tags ?? jsonLd.category);
}

function extractWebToMindMetaTags(html: string): string[] {
  const tags: string[] = [];
  const metaRegex =
    /<meta\b(?=[^>]*property=["']article:tag["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaRegex.exec(html))) {
    tags.push(...parseTags(decodeHtmlEntities(match[1] ?? "")));
  }

  return uniqueTags(tags);
}

function parseUnknownTags(input: unknown): string[] {
  if (typeof input === "string") {
    return parseTags(input);
  }

  if (Array.isArray(input)) {
    return uniqueTags(input.flatMap((item) => parseUnknownTags(item)));
  }

  if (isRecord(input)) {
    return parseTags(getLocalizedString(input));
  }

  return [];
}

function guessWebToMindGenerationMethod(text: string): string | null {
  return matchGenerationModelLabel(text);
}

function extractWebToMindJsonImageUrls(jsonLd: Record<string, unknown> | null): string[] {
  if (!jsonLd) {
    return [];
  }

  return uniqueStrings([
    ...extractRemoteImageUrlsFromUnknown(jsonLd.image),
    ...extractRemoteImageUrlsFromUnknown(jsonLd.images),
    ...extractRemoteImageUrlsFromUnknown(jsonLd.thumbnail),
    ...extractRemoteImageUrlsFromUnknown(jsonLd.thumbnailUrl),
    ...extractRemoteImageUrlsFromUnknown(jsonLd.video),
  ]);
}

function extractWebToMindPromptCaseImageUrls(record: Record<string, unknown>, baseUrl: string): string[] {
  return uniqueStrings([
    ...extractRemoteImageUrlsFromUnknown(record.imageUrl),
    ...extractRemoteImageUrlsFromUnknown(record.imageUrls),
    ...extractRemoteImageUrlsFromUnknown(record.image),
    ...extractRemoteImageUrlsFromUnknown(record.images),
    ...extractRemoteImageUrlsFromUnknown(record.thumbnailUrl),
    ...extractRemoteImageUrlsFromUnknown(record.coverUrl),
  ]).map((url) => resolveRemoteUrl(url, baseUrl) ?? url);
}

function extractWebToMindPromptCaseVideoUrls(record: Record<string, unknown>, baseUrl: string): string[] {
  // videoUrl 是主站成品；videoUrls 常夹带 Twitter 多清晰度副本，后续统一折叠。
  return collapseRemoteVideoUrls(
    uniqueStrings([
      ...extractRemoteVideoUrlsFromUnknown(record.videoUrl, baseUrl),
      ...extractRemoteVideoUrlsFromUnknown(record.videoUrls, baseUrl),
      ...extractRemoteVideoUrlsFromUnknown(record.video, baseUrl),
      ...extractRemoteVideoUrlsFromUnknown(record.videos, baseUrl),
      ...extractRemoteVideoUrlsFromUnknown(record.media, baseUrl),
    ]),
  );
}

function extractWebToMindVideoUrls(
  html: string,
  jsonLd: Record<string, unknown> | null,
  imageUrls: readonly string[],
): string[] {
  return uniqueStrings([
    ...extractRemoteVideoUrlsFromUnknown(jsonLd?.video),
    ...extractRemoteVideoUrlsFromUnknown(jsonLd?.contentUrl),
    ...extractRemoteVideoUrlsFromUnknown(jsonLd?.embedUrl),
    ...extractWebToMindVideoTagUrls(html),
    ...extractWebToMindInlineRemoteVideoUrls(html),
    ...deriveWebToMindVideoUrlsFromImageUrls(imageUrls),
  ]);
}

function extractRemoteVideoUrlsFromUnknown(input: unknown, baseUrl = "", depth = 0): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof input === "string") {
    const videoUrl = resolveRemoteUrl(input, baseUrl);

    return videoUrl && isImportableRemoteVideoUrl(videoUrl) ? [videoUrl] : [];
  }

  if (Array.isArray(input)) {
    return uniqueStrings(input.flatMap((item) => extractRemoteVideoUrlsFromUnknown(item, baseUrl, depth + 1)));
  }

  if (!isRecord(input)) {
    return [];
  }

  return uniqueStrings([
    ...extractRemoteVideoUrlsFromUnknown(input.url, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.contentUrl, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.content_url, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.videoUrl, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.video_url, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.videoUrls, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.video_urls, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.embedUrl, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.embed_url, baseUrl, depth + 1),
    ...extractRemoteVideoUrlsFromUnknown(input.src, baseUrl, depth + 1),
  ]);
}

function extractWebToMindVideoTagUrls(html: string): string[] {
  const urls: string[] = [];
  const videoRegex = /<video\b[^>]*>/gi;
  const sourceRegex = /<source\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = videoRegex.exec(html))) {
    urls.push(getHtmlTagAttribute(match[0] ?? "", "src"));
  }

  while ((match = sourceRegex.exec(html))) {
    urls.push(getHtmlTagAttribute(match[0] ?? "", "src"));
  }

  return uniqueStrings(
    urls
      .map((url) => getRemoteUrl(url))
      .filter((url): url is string => Boolean(url && isImportableRemoteVideoUrl(url))),
  );
}

function extractWebToMindInlineRemoteVideoUrls(html: string): string[] {
  const normalizedHtml = html.replace(/\\\//g, "/");
  const urls: string[] = [];
  const urlRegex =
    /https?:\/\/[^\s"'<>\\]+\.(?:mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:\?[^\s"'<>\\]*)?/gi;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(normalizedHtml))) {
    urls.push(decodeHtmlEntities(match[0] ?? ""));
  }

  return uniqueStrings(urls.filter(isImportableRemoteVideoUrl));
}

function extractRemoteImageUrlsFromUnknown(input: unknown, depth = 0): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof input === "string") {
    const imageUrl = getRemoteImageUrl(input);

    return imageUrl && isImportableRemoteImageUrl(imageUrl) ? [imageUrl] : [];
  }

  if (Array.isArray(input)) {
    return uniqueStrings(input.flatMap((item) => extractRemoteImageUrlsFromUnknown(item, depth + 1)));
  }

  if (!isRecord(input)) {
    return [];
  }

  return uniqueStrings([
    ...extractRemoteImageUrlsFromUnknown(input.url, depth + 1),
    ...extractRemoteImageUrlsFromUnknown(input.contentUrl, depth + 1),
    ...extractRemoteImageUrlsFromUnknown(input.thumbnail, depth + 1),
    ...extractRemoteImageUrlsFromUnknown(input.thumbnailUrl, depth + 1),
    ...extractRemoteImageUrlsFromUnknown(input.poster, depth + 1),
    ...extractRemoteImageUrlsFromUnknown(input.image, depth + 1),
  ]);
}

function extractWebToMindVideoPosterUrls(html: string): string[] {
  const urls: string[] = [];
  const videoRegex = /<video\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = videoRegex.exec(html))) {
    const poster = getHtmlTagAttribute(match[0] ?? "", "poster");
    const imageUrl = poster ? getRemoteImageUrl(poster) : null;

    if (imageUrl && isImportableRemoteImageUrl(imageUrl)) {
      urls.push(imageUrl);
    }
  }

  return uniqueStrings(urls);
}

function extractWebToMindGalleryImageUrls(html: string): string[] {
  const urls: string[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html))) {
    const tag = match[0] ?? "";
    const src = getHtmlTagAttribute(tag, "src");
    const srcset = getHtmlTagAttribute(tag, "srcset");

    if (src) {
      urls.push(src);
    }

    if (srcset) {
      urls.push(...parseSrcSetUrls(srcset));
    }
  }

  return uniqueStrings([...urls, ...extractWebToMindInlineRemoteImageUrls(html)])
    .map((value) => getRemoteImageUrl(value))
    .filter((value): value is string => Boolean(value && isImportableRemoteImageUrl(value)))
    .filter(isLikelyWebToMindEffectImageUrl)
    .slice(0, 12);
}

function extractWebToMindInlineRemoteImageUrls(html: string): string[] {
  const normalizedHtml = html.replace(/\\\//g, "/");
  const urls: string[] = [];
  const urlRegex =
    /https?:\/\/[^\s"'<>\\]+\.(?:png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico|apng)(?:\?[^\s"'<>\\]*)?/gi;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(normalizedHtml))) {
    urls.push(decodeHtmlEntities(match[0] ?? ""));
  }

  return urls;
}

function getHtmlTagAttribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i"));

  return decodeHtmlEntities(match?.[2] ?? "");
}

function parseSrcSetUrls(srcset: string): string[] {
  return srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

function isImportableRemoteImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();

    return /\.(png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico|apng)$/i.test(pathname);
  } catch {
    return false;
  }
}

function isImportableRemoteVideoUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = normalizeHostname(parsedUrl.hostname);
    const pathname = parsedUrl.pathname.toLowerCase();
    const mediaHint = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();

    return (
      /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)$/i.test(pathname) ||
      hostname === "vlabvod.com" ||
      hostname.endsWith(".vlabvod.com") ||
      mediaHint.includes("video_mp4") ||
      mediaHint.includes("mime_type=video") ||
      /[?&](?:type|mime|format)=video(?:\/|\b)/i.test(mediaHint) ||
      mediaHint.includes("content-type=video")
    );
  } catch {
    return false;
  }
}

function deriveWebToMindVideoUrlsFromImageUrls(imageUrls: readonly string[]): string[] {
  return uniqueStrings(
    imageUrls
      .map((url) => {
        try {
          const parsedUrl = new URL(url);
          const hostname = parsedUrl.hostname.toLowerCase();
          const pathname = parsedUrl.pathname;

          if (
            !hostname.includes("supabase.co") ||
            !pathname.includes("/prompt-case-covers/") ||
            !/\.(png|jpe?g|webp)$/i.test(pathname)
          ) {
            return null;
          }

          parsedUrl.pathname = pathname.replace(/\.(png|jpe?g|webp)$/i, ".mp4");

          return parsedUrl.href;
        } catch {
          return null;
        }
      })
      .filter((url): url is string => Boolean(url)),
  );
}

function isLikelyWebToMindEffectImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    return (
      hostname.includes("supabase.co") ||
      pathname.includes("/generated-images/") ||
      pathname.includes("/prompt-case-covers/")
    );
  } catch {
    return false;
  }
}

function isWebToMindVideoPrompt(html: string, jsonLd: Record<string, unknown> | null): boolean {
  const text = [
    html.match(/<video\b/i)?.[0] ?? "",
    getJsonLdType(jsonLd?.["@type"]),
    getLocalizedString(jsonLd?.description),
    extractWebToMindKeywords(jsonLd).join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return text.includes("视频") || text.includes("动画") || /\b(video|mp4|motion)\b/i.test(text);
}

function extractWebToMindAuthor(
  jsonLd: Record<string, unknown> | null,
  baseUrl: string,
): { authorName: string | null; authorUrl: string | null; authorAvatarUrl: string | null } {
  const author = jsonLd?.author ?? jsonLd?.creator ?? jsonLd?.publisher;
  let authorName = "";
  let authorUrl: string | null = null;
  let authorAvatarUrl: string | null = null;

  if (typeof author === "string") {
    authorName = cleanSingleLine(author);
  } else if (isRecord(author)) {
    authorName = getRecordAuthorName(author) ?? "";
    authorUrl = resolveRemoteUrl(firstStringValue(author, ["url", "sameAs", "authorUrl"]), baseUrl);
    authorAvatarUrl = resolveRemoteUrl(firstStringValue(author, ["image", "avatar", "avatarUrl", "logo"]), baseUrl);
  }

  return {
    authorName: authorName || "WebToMind",
    authorUrl: authorUrl ?? "https://webtomind.com/",
    authorAvatarUrl: authorAvatarUrl ?? "https://webtomind.com/icons/logo-icon.svg",
  };
}

function resolveRemoteUrl(input: unknown, baseUrl: string): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, baseUrl);

    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function stripHtmlTags(input: string): string {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ""));
}

function extractHtmlTitle(html: string): string {
  return decodeHtmlEntities(
    extractMetaPropertyContent(html, "og:title") ||
      extractMetaContent(html, "twitter:title") ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      "",
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractMetaContent(html: string, name: string): string {
  const regex = new RegExp(`<meta\\b[^>]*name=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
  return decodeHtmlEntities(html.match(regex)?.[1] ?? "");
}

function extractMetaPropertyContent(html: string, property: string): string {
  const regex = new RegExp(`<meta\\b[^>]*property=["']${escapeRegExp(property)}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
  return decodeHtmlEntities(html.match(regex)?.[1] ?? "");
}

function extractKeywords(html: string): string[] {
  return parseTags(extractMetaContent(html, "keywords"));
}

function extractHtmlAuthorName(html: string): string | null {
  return (
    extractMetaContent(html, "author") ||
    extractMetaPropertyContent(html, "article:author") ||
    extractMetaPropertyContent(html, "profile:username") ||
    null
  );
}

function extractHtmlAuthorUrl(html: string): string | null {
  return getRemoteUrl(
    extractMetaPropertyContent(html, "article:author:url") ||
      extractMetaPropertyContent(html, "profile:url") ||
      extractLinkHref(html, "author"),
  );
}

function extractHtmlAuthorAvatarUrl(html: string): string | null {
  return getRemoteImageUrl(
    extractMetaPropertyContent(html, "profile:image") ||
      extractMetaContent(html, "twitter:creator:image") ||
      extractMetaPropertyContent(html, "og:profile:image"),
  );
}

function extractLinkHref(html: string, rel: string): string {
  const regex = new RegExp(`<link\\b[^>]*rel=["'][^"']*${escapeRegExp(rel)}[^"']*["'][^>]*href=["']([^"']*)["'][^>]*>`, "i");

  return decodeHtmlEntities(html.match(regex)?.[1] ?? "");
}

function extractKnownSiteCanonicalUrl(html: string, sourceUrl: string): string {
  return (
    resolveRemoteUrl(extractLinkHref(html, "canonical"), sourceUrl) ??
    resolveRemoteUrl(extractMetaPropertyContent(html, "og:url"), sourceUrl) ??
    sourceUrl
  );
}

function extractPreloadImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const linkRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html))) {
    const tag = match[0] ?? "";
    const relValue = getHtmlTagAttribute(tag, "rel").toLowerCase();
    const asValue = getHtmlTagAttribute(tag, "as").toLowerCase();

    if (!relValue.includes("preload") && asValue !== "image") {
      continue;
    }

    const href = resolveRemoteUrl(getHtmlTagAttribute(tag, "href"), baseUrl);
    const srcset = getHtmlTagAttribute(tag, "imagesrcset");

    if (href) {
      urls.push(href);
    }

    if (srcset) {
      urls.push(...parseSrcSetUrls(srcset).map((url) => resolveRemoteUrl(url, baseUrl) ?? ""));
    }
  }

  return uniqueStrings(urls);
}

function cleanKnownSiteTitle(title: string, siteInfo: KnownPromptSiteInfo): string {
  const cleanedTitle = cleanSingleLine(title)
    .replace(new RegExp(`\\s*[-|｜]\\s*${escapeRegExp(siteInfo.siteName)}\\s*$`, "i"), "")
    .replace(/\s*[-|｜]\s*(AI|Prompt|Prompts|提示词|灵感库|案例库)\s*$/i, "")
    .trim();

  return (cleanedTitle || siteInfo.siteName).slice(0, maxTitleLength);
}

function isLikelyAvatarOrIconUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const value = `${url.hostname}${url.pathname}`.toLowerCase();

    return /(?:avatar|profile|logo|favicon|icon|author|userpic|headimg)/i.test(value);
  } catch {
    return false;
  }
}

function createSiteIconUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);

    return `${url.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function getShareUrlTitle(hostname: string): string {
  if (hostname.includes("aiart.pics")) {
    return "AIArt 分享提示词";
  }

  if (hostname.includes("promptfill.tanshilong.com")) {
    return "PromptFill 分享提示词";
  }

  if (hostname.includes("aipromptfill.com")) {
    return "Prompt Fill 分享模板";
  }

  return "网页提示词";
}

function buildSourcePrompt(sourceUrl: string, description = ""): string {
  const lines = [`来源链接：${sourceUrl}`];

  if (description.trim()) {
    lines.push(`页面描述：${normalizeImportText(description)}`);
  }

  return lines.join("\n");
}

export function isSourceOnlyPrompt(value: string): boolean {
  const text = normalizeImportText(value);

  if (!text) {
    return true;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return true;
  }

  return lines.every((line) => /^(?:来源链接|页面描述)\s*[:：]/u.test(line));
}

function firstStringValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const exact = record[key];

    if (typeof exact === "string" && exact.trim()) {
      return exact;
    }

    const matchedKey = Object.keys(record).find((recordKey) => recordKey.toLowerCase() === key.toLowerCase());
    const matchedValue = matchedKey ? record[matchedKey] : undefined;

    if (typeof matchedValue === "string" && matchedValue.trim()) {
      return matchedValue;
    }
  }

  return "";
}

function firstTagValues(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const exact = record[key];
    const matchedKey = Object.keys(record).find((recordKey) => recordKey.toLowerCase() === key.toLowerCase());
    const matchedValue = matchedKey ? record[matchedKey] : undefined;
    const value = exact ?? matchedValue;

    if (typeof value === "string" && value.trim()) {
      return parseTags(value);
    }

    if (Array.isArray(value)) {
      return uniqueTags(value.flatMap((item) => (typeof item === "string" ? parseTags(item) : [])));
    }
  }

  return [];
}

function expandAipromptfillTemplate(content: string, selections: Record<string, unknown>): string {
  return normalizeImportText(
    content.replace(/\{\{\s*([^}:]+)(?:\s*:\s*([^}]+?))?\s*\}\}/g, (_match, key: string, fallback = "") => {
      const selection = selections[key.trim()];
      const value = getLocalizedString(selection);

      return value || String(fallback).trim() || key.trim();
    }),
  );
}

function getLocalizedString(input: unknown): string {
  if (typeof input === "string") {
    return cleanSingleLine(input);
  }

  if (!isRecord(input)) {
    return "";
  }

  const preferred = input.cn ?? input.zh ?? input["zh-CN"] ?? input.en;

  if (typeof preferred === "string") {
    return cleanSingleLine(preferred);
  }

  const fallback = Object.values(input).find((value) => typeof value === "string");

  return typeof fallback === "string" ? cleanSingleLine(fallback) : "";
}

function getRemoteImageUrl(input: unknown, baseUrl = ""): string | null {
  return getRemoteUrl(input, baseUrl);
}

function getRemoteUrl(input: unknown, baseUrl = ""): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();

  if (!value) {
    return null;
  }

  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);

    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function getAipromptfillTypeTag(type: string): string {
  if (type === "image") {
    return "图像提示词";
  }

  if (type === "video") {
    return "视频提示词";
  }

  return "";
}

function isGptImage2GalleryMarkdownPath(input: string): boolean {
  return /^docs\/gallery(?:-part-\d+)?\.md$/i.test(input);
}

function resolveGptImage2GalleryAssetUrl(input: string, galleryInfo: GptImage2GalleryInfo): string | null {
  const value = input.trim().replace(/\s+["'][^"']+["']$/, "");

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return getRemoteImageUrl(value);
  }

  try {
    return getRemoteImageUrl(new URL(value, galleryInfo.rawUrl).href);
  } catch {
    return null;
  }
}

function parseGptImage2GalleryAuthor(input: string): { authorName: string | null; authorUrl: string | null } {
  const value = decodeMarkdownEscapes(cleanSingleLine(input));

  if (!value || value === "未提供") {
    return { authorName: null, authorUrl: null };
  }

  const linkMatch = value.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);

  if (linkMatch) {
    return {
      authorName: decodeMarkdownEscapes(cleanSingleLine(linkMatch[1] ?? "")) || null,
      authorUrl: getRemoteUrl(linkMatch[2]),
    };
  }

  return { authorName: value, authorUrl: null };
}

function getAiartAuthorName(input: unknown): string {
  if (typeof input === "string") {
    return cleanSingleLine(input);
  }

  if (!isRecord(input)) {
    return "";
  }

  return cleanSingleLine(getLocalizedString(input.name) || getLocalizedString(input.username));
}

function getAiartAuthorUrl(record: Record<string, unknown>): string | null {
  const author = isRecord(record.author) ? record.author : {};
  const explicitUrl = getRemoteUrl(author.url);

  if (explicitUrl) {
    return explicitUrl;
  }

  const username = getLocalizedString(author.username);
  const platform = getLocalizedString(record.platform).toLowerCase();

  if (username && (platform === "x" || platform === "twitter")) {
    return `https://x.com/${username.replace(/^@/, "")}`;
  }

  return getRemoteUrl(record.originUrl);
}

function getAiartAuthorAvatarUrl(input: unknown): string | null {
  if (!isRecord(input)) {
    return null;
  }

  return getRemoteImageUrl(input.avatar ?? input.avatarUrl ?? input.profileImageUrl);
}

function getRecordAuthorName(record: Record<string, unknown>): string | null {
  const directAuthor = firstStringValue(record, authorNameKeys);

  if (directAuthor) {
    return cleanSingleLine(directAuthor);
  }

  const author = record.author ?? record.creator ?? record.user;

  if (!isRecord(author)) {
    return null;
  }

  const nestedName = getLocalizedString(author.name) || getLocalizedString(author.username) || getLocalizedString(author.id);

  return nestedName ? cleanSingleLine(nestedName) : null;
}

function getRecordAuthorUrl(record: Record<string, unknown>, baseUrl = ""): string | null {
  const directUrl = getRemoteUrl(firstStringValue(record, authorUrlKeys), baseUrl);

  if (directUrl) {
    return directUrl;
  }

  const author = record.author ?? record.creator ?? record.user ?? record.publisher;

  if (!isRecord(author)) {
    return null;
  }

  return getRemoteUrl(firstStringValue(author, ["url", "sameAs", "authorUrl", "profileUrl", "userUrl"]), baseUrl);
}

function getRecordAuthorAvatarUrl(record: Record<string, unknown>, baseUrl = ""): string | null {
  const directAvatar = getRemoteImageUrl(firstStringValue(record, authorAvatarUrlKeys), baseUrl);

  if (directAvatar) {
    return directAvatar;
  }

  const author = record.author ?? record.creator ?? record.user ?? record.publisher;

  if (!isRecord(author)) {
    return null;
  }

  return getRemoteImageUrl(
    firstStringValue(author, ["image", "avatar", "avatarUrl", "profileImageUrl", "profile_image_url", "logo"]),
    baseUrl,
  );
}

function extractRecordImageUrls(input: unknown, baseUrl = "", depth = 0, imageContext = false): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof input === "string") {
    const imageUrl = imageContext ? getRemoteImageUrl(input, baseUrl) : null;

    return imageUrl && !isLikelyAvatarOrIconUrl(imageUrl) ? [imageUrl] : [];
  }

  if (Array.isArray(input)) {
    return uniqueStrings(input.flatMap((item) => extractRecordImageUrls(item, baseUrl, depth + 1, imageContext)));
  }

  if (!isRecord(input)) {
    return [];
  }

  const jsonLdType = getJsonLdType(input["@type"]).toLowerCase();
  const isImageObject = jsonLdType.includes("imageobject");
  const urls: string[] = [];

  if (isImageObject || imageContext) {
    urls.push(
      ...[
        input.url,
        input.contentUrl,
        input.content_url,
        input.src,
        input.href,
        input.imageUrl,
        input.image_url,
        input.originalUrl,
        input.original_url,
      ]
        .map((value) => getRemoteImageUrl(getLocalizedString(value) || (typeof value === "string" ? value : ""), baseUrl))
        .filter((value): value is string => Boolean(value)),
    );
  }

  for (const [key, value] of Object.entries(input)) {
    const nextImageContext = imageContext || isImageKey(key);

    if (nextImageContext || Array.isArray(value) || isRecord(value)) {
      urls.push(...extractRecordImageUrls(value, baseUrl, depth + 1, nextImageContext));
    }
  }

  return uniqueStrings(urls).filter((url) => !isLikelyAvatarOrIconUrl(url));
}

function isImageKey(key: string): boolean {
  const normalizedKey = key.replace(/[-_\s]/g, "").toLowerCase();

  return imageUrlKeys.some((imageKey) => normalizedKey === imageKey.replace(/[-_\s]/g, "").toLowerCase());
}

function getTweetText(tweet: Record<string, unknown>): string {
  const candidates = [
    ...getTweetTextCandidates(tweet),
    ...getTweetTextCandidatesFromContainer(tweet.raw_text),
    ...getTweetTextCandidatesFromContainer(tweet.legacy),
    ...getTweetTextCandidatesFromContainer(tweet.extended_tweet),
    ...getTweetTextCandidatesFromContainer(tweet.note),
    ...getTweetTextCandidatesFromContainer(tweet.note_tweet),
    ...getTweetTextCandidatesFromContainer(tweet.noteTweet),
    ...getTweetTextCandidatesFromContainer(tweet.note_tweet_results),
    ...getTweetTextCandidatesFromContainer(tweet.longform_notetweet_results),
    ...getTweetTextCandidatesFromContainer(tweet.tweet_results),
  ];
  const sortedCandidates = uniqueStrings(candidates)
    .map((candidate) => normalizeImportText(candidate))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return sortedCandidates[0] ?? "";
}

function cleanTweetPromptText(input: string): string {
  return normalizeImportText(
    input
      .replace(/(?:\s|\n)*(?:https:\/\/t\.co\/\S+|pic\.x\.com\/\S+)\s*$/i, "")
      .replace(/(?:\s|\n)*(?:https:\/\/t\.co\/\S+|pic\.x\.com\/\S+)\s*$/i, ""),
  );
}

function getTweetTextCandidates(tweet: Record<string, unknown>): string[] {
  return uniqueStrings([
    getTweetString(tweet.full_text),
    getTweetString(tweet.fullText),
    getTweetString(tweet.text),
    getTweetString(tweet.body),
    getTweetString(tweet.note_text),
    getTweetString(tweet.noteText),
  ]);
}

function getTweetTextCandidatesFromContainer(input: unknown, depth = 0): string[] {
  if (depth > 5) {
    return [];
  }

  if (typeof input === "string") {
    return [input];
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => getTweetTextCandidatesFromContainer(item, depth + 1));
  }

  if (!isRecord(input)) {
    return [];
  }

  const result = input.result;
  const tweet = input.tweet;

  return uniqueStrings([
    ...getTweetTextCandidates(input),
    ...(isRecord(result) ? getTweetTextCandidatesFromContainer(result, depth + 1) : []),
    ...(isRecord(tweet) ? getTweetTextCandidatesFromContainer(tweet, depth + 1) : []),
    ...(isRecord(input.legacy) ? getTweetTextCandidatesFromContainer(input.legacy, depth + 1) : []),
    ...(isRecord(input.note_tweet_results)
      ? getTweetTextCandidatesFromContainer(input.note_tweet_results, depth + 1)
      : []),
    ...(isRecord(input.longform_notetweet_results)
      ? getTweetTextCandidatesFromContainer(input.longform_notetweet_results, depth + 1)
      : []),
    ...(isRecord(input.extended_tweet) ? getTweetTextCandidatesFromContainer(input.extended_tweet, depth + 1) : []),
  ]);
}

function getTweetString(input: unknown): string {
  return typeof input === "string" ? input : "";
}

function extractTweetImageUrls(input: Record<string, unknown>): string[] {
  // 兼容旧调用：默认返回图片；视频帖请走 extractTweetMediaUrls。
  return extractTweetMediaUrls(input).filter((url) => !isImportableRemoteVideoUrl(url));
}

function extractTweetMediaUrls(input: Record<string, unknown>): string[] {
  const media = isRecord(input.media) ? input.media : {};
  const entities = isRecord(input.entities) ? input.entities : {};
  const extendedEntities = isRecord(input.extended_entities) ? input.extended_entities : {};
  const legacy = isRecord(input.legacy) ? input.legacy : {};
  const legacyEntities = isRecord(legacy.entities) ? legacy.entities : {};
  const legacyExtendedEntities = isRecord(legacy.extended_entities) ? legacy.extended_entities : {};
  const videoNode = isRecord(input.video) ? input.video : null;

  const collected = uniqueStrings([
    // 顶层/扩展媒体列表
    ...extractMediaUrlsFromArray(media.photos),
    ...extractMediaUrlsFromArray(media.all),
    ...extractMediaUrlsFromArray(media.media_extended),
    ...extractMediaUrlsFromArray(media.videos),
    ...extractMediaUrlsFromArray(input.photos),
    ...extractMediaUrlsFromArray(input.mediaDetails),
    ...extractMediaUrlsFromArray(input.media_details),
    ...extractMediaUrlsFromArray(input.mediaURLs),
    ...extractMediaUrlsFromArray(input.media_urls),
    ...extractMediaUrlsFromArray(entities.media),
    ...extractMediaUrlsFromArray(extendedEntities.media),
    ...extractMediaUrlsFromArray(legacyEntities.media),
    ...extractMediaUrlsFromArray(legacyExtendedEntities.media),
    // syndication 顶层 video.variants
    ...extractVideoVariantUrls(videoNode),
    ...extractVideoVariantUrls(isRecord(media.video) ? media.video : null),
  ]);

  return collected;
}

function extractMediaUrlsFromArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return typeof input === "string" ? [normalizeTweetMediaUrl(input)].filter((value): value is string => Boolean(value)) : [];
  }

  return input.flatMap((item) => {
    if (typeof item === "string") {
      return normalizeTweetMediaUrl(item) ?? [];
    }

    if (!isRecord(item)) {
      return [];
    }

    const typeHint = getLocalizedString(item.type).toLowerCase();
    const candidateUrls = [
      // 视频优先字段
      ...extractVideoVariantUrls(isRecord(item.video_info) ? item.video_info : null),
      ...extractVideoVariantUrls(isRecord(item.videoInfo) ? item.videoInfo : null),
      ...extractVideoVariantUrls(isRecord(item.video) ? item.video : null),
      normalizeTweetMediaUrl(item.url),
      normalizeTweetMediaUrl(item.src),
      normalizeTweetMediaUrl(item.contentUrl),
      normalizeTweetMediaUrl(item.content_url),
      normalizeTweetMediaUrl(item.video_url),
      normalizeTweetMediaUrl(item.videoUrl),
      // 图片/封面字段
      normalizeTweetMediaUrl(item.media_url_https),
      normalizeTweetMediaUrl(item.media_url),
      normalizeTweetMediaUrl(item.thumbnail_url),
      normalizeTweetMediaUrl(item.thumbnailUrl),
      normalizeTweetMediaUrl(item.preview_image_url),
      normalizeTweetMediaUrl(item.previewImageUrl),
      normalizeTweetMediaUrl(item.poster),
      normalizeTweetMediaUrl(item.cover),
      normalizeTweetMediaUrl(item.coverUrl),
      normalizeTweetMediaUrl(item.image_url),
      normalizeTweetMediaUrl(item.imageUrl),
    ].filter((value): value is string => Boolean(value));

    if (typeHint.includes("video") || typeHint.includes("animated_gif") || typeHint.includes("gif")) {
      const videoOnly = candidateUrls.filter(isImportableRemoteVideoUrl);
      return videoOnly.length > 0 ? videoOnly : candidateUrls;
    }

    return candidateUrls;
  });
}

function extractVideoVariantUrls(input: Record<string, unknown> | null): string[] {
  if (!input) {
    return [];
  }

  const variants = Array.isArray(input.variants) ? input.variants : [];
  const scored: Array<{ url: string; score: number }> = [];

  for (const variant of variants) {
    if (!isRecord(variant)) {
      continue;
    }

    const contentType = getLocalizedString(variant.content_type || variant.contentType || variant.type).toLowerCase();
    const url =
      normalizeTweetMediaUrl(variant.url) ||
      normalizeTweetMediaUrl(variant.src) ||
      normalizeTweetMediaUrl(variant.href);

    if (!url || contentType.includes("mpegurl") || contentType.includes("m3u8") || url.includes(".m3u8")) {
      continue;
    }

    if (!isImportableRemoteVideoUrl(url) && !contentType.includes("mp4") && !contentType.includes("video")) {
      continue;
    }

    const bitrate =
      typeof variant.bitrate === "number"
        ? variant.bitrate
        : typeof variant.bit_rate === "number"
          ? variant.bit_rate
          : 0;
    scored.push({ url, score: bitrate });
  }

  // 顶层可能直接给 url
  const direct =
    normalizeTweetMediaUrl(input.url) ||
    normalizeTweetMediaUrl(input.src) ||
    normalizeTweetMediaUrl(input.contentUrl) ||
    normalizeTweetMediaUrl(input.content_url);
  if (direct && isImportableRemoteVideoUrl(direct)) {
    scored.push({ url: direct, score: 0 });
  }

  scored.sort((a, b) => b.score - a.score);
  return uniqueStrings(scored.map((item) => item.url));
}

function normalizeTweetMediaUrl(input: unknown): string | null {
  const remoteUrl = getRemoteImageUrl(input);

  if (!remoteUrl) {
    return null;
  }

  try {
    const url = new URL(remoteUrl);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    if (hostname.includes("pbs.twimg.com") && pathname.includes("/media/")) {
      if (!url.searchParams.has("name") && !url.searchParams.has("format")) {
        url.searchParams.set("name", "orig");
      }

      return url.href;
    }

    // 视频直链 / amplify / 常规图片扩展
    if (
      isImportableRemoteVideoUrl(url.href) ||
      hostname.includes("video.twimg.com") ||
      pathname.includes("/amplify_video/") ||
      pathname.includes("/ext_tw_video/") ||
      /\.(png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico|apng)$/i.test(pathname)
    ) {
      return url.href;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeTweetMediaImageUrl(input: unknown): string | null {
  // 兼容旧命名：仅返回图片 URL。
  const url = normalizeTweetMediaUrl(input);
  return url && !isImportableRemoteVideoUrl(url) ? url : null;
}

function getXAuthorInfo(input: Record<string, unknown>): {
  authorName: string | null;
  authorUrl: string | null;
  authorAvatarUrl: string | null;
} {
  const candidates = getXAuthorCandidates(input);
  let authorName = "";
  let screenName = "";
  let authorUrl: string | null = null;
  let authorAvatarUrl: string | null = null;

  for (const candidate of candidates) {
    authorName ||= getLocalizedString(candidate.name) || getLocalizedString(candidate.display_name);
    screenName ||=
      getLocalizedString(candidate.screen_name) ||
      getLocalizedString(candidate.username) ||
      getLocalizedString(candidate.userName) ||
      getLocalizedString(candidate.handle);
    authorUrl ||= getRemoteUrl(candidate.url);
    authorAvatarUrl ||=
      getRemoteImageUrl(candidate.avatar_url) ||
      getRemoteImageUrl(candidate.profile_image_url_https) ||
      getRemoteImageUrl(candidate.profile_image_url) ||
      getRemoteImageUrl(candidate.avatar) ||
      getRemoteImageUrl(candidate.avatarUrl) ||
      getRemoteImageUrl(candidate.profileImageUrl);

    const legacy = isRecord(candidate.legacy) ? candidate.legacy : null;

    if (legacy) {
      authorName ||= getLocalizedString(legacy.name);
      screenName ||= getLocalizedString(legacy.screen_name);
      authorUrl ||= getRemoteUrl(legacy.url);
      authorAvatarUrl ||= getRemoteImageUrl(legacy.profile_image_url_https) || getRemoteImageUrl(legacy.profile_image_url);
    }
  }

  if (!authorUrl && screenName) {
    authorUrl = `https://x.com/${screenName.replace(/^@/, "")}`;
  }

  return {
    authorName: authorName || screenName || null,
    authorUrl,
    authorAvatarUrl,
  };
}

function getXAuthorCandidates(input: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const directCandidates = [input.author, input.user, input.creator, input.publisher];

  for (const candidate of directCandidates) {
    if (isRecord(candidate)) {
      candidates.push(candidate);
    }
  }

  const core = isRecord(input.core) ? input.core : null;
  const userResults = isRecord(core?.user_results) ? core.user_results : isRecord(input.user_results) ? input.user_results : null;
  const result = isRecord(userResults?.result) ? userResults.result : null;

  if (result) {
    candidates.push(result);

    if (isRecord(result.legacy)) {
      candidates.push(result.legacy);
    }
  }

  return candidates;
}

function guessGenerationMethodFromText(text: string): string | null {
  return matchGenerationModelLabel(text);
}

function extractAiartImageUrls(input: unknown): string[] {
  const items = normalizeAiartMediaList(input);

  return uniqueStrings(
    items
      .flatMap((item) => {
        if (typeof item === "string") {
          return [resolveAiartImageUrl(item)];
        }

        if (!isRecord(item)) {
          return [];
        }

        return [
          resolveAiartImageUrl(item.path),
          resolveAiartImageUrl(item.sPath),
          resolveAiartImageUrl(item.url),
          resolveAiartImageUrl(item.src),
          resolveAiartImageUrl(item.image),
          resolveAiartImageUrl(item.imageUrl),
        ];
      })
      .filter((value): value is string => Boolean(value)),
  );
}

function extractAiartVideoCoverUrls(input: unknown): string[] {
  const items = normalizeAiartMediaList(input);

  return uniqueStrings(
    items
      .flatMap((item) => {
        if (!isRecord(item)) {
          return [];
        }

        return [
          resolveAiartImageUrl(item.cover),
          resolveAiartImageUrl(item.coverUrl),
          resolveAiartImageUrl(item.poster),
          resolveAiartImageUrl(item.thumbnail),
          resolveAiartImageUrl(item.thumb),
          resolveAiartImageUrl(item.preview),
        ];
      })
      .filter((value): value is string => Boolean(value)),
  );
}

function extractAiartVideoUrls(input: unknown): string[] {
  const items = normalizeAiartMediaList(input);

  return uniqueStrings(
    items
      .flatMap((item) => {
        if (typeof item === "string") {
          return [resolveAiartMediaUrl(item)];
        }

        if (!isRecord(item)) {
          return [];
        }

        return [
          resolveAiartMediaUrl(item.url),
          resolveAiartMediaUrl(item.src),
          resolveAiartMediaUrl(item.video),
          resolveAiartMediaUrl(item.videoUrl),
          resolveAiartMediaUrl(item.path),
          resolveAiartMediaUrl(item.sPath),
        ];
      })
      .filter((value): value is string => Boolean(value) && isImportableRemoteVideoUrl(value!)),
  );
}

function normalizeAiartMediaList(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (typeof input === "string" || isRecord(input)) {
    return [input];
  }

  return [];
}

function resolveAiartImageUrl(input: unknown): string | null {
  return resolveAiartMediaUrl(input);
}

function resolveAiartMediaUrl(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const value = input.trim();

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return getRemoteUrl(value);
  }

  if (value.startsWith("//")) {
    return getRemoteUrl(`https:${value}`);
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) {
    return getRemoteUrl(`https://${value}`);
  }

  return getRemoteUrl(`https://img1.aiart.pics/${value.replace(/^\/+/, "")}`);
}

function getUrlParameter(url: URL, name: string): string | null {
  const directValue = url.searchParams.get(name);

  if (directValue) {
    return directValue;
  }

  const hashQuery = url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?") + 1) : url.hash.replace(/^#/, "");
  const hashValue = new URLSearchParams(hashQuery).get(name);

  if (hashValue) {
    return hashValue;
  }

  const match = url.hash.match(new RegExp(`[?&#]${escapeRegExp(name)}=([^&#]+)`, "i"));

  return match ? decodeURIComponent(match[1]) : null;
}

function parseTags(input: string): string[] {
  return uniqueTags(
    input
      .replace(/[\[\]"']/g, "")
      .split(/[#,，、;；|\n]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const tag of tags) {
    const normalized = cleanSingleLine(tag).replace(/^#/, "");

    if (!normalized || normalized.length > maxTagLength || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);

    if (output.length >= maxTagCount) {
      break;
    }
  }

  return output;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function dedupeDerivedRemoteMediaUrls(values: string[]): string[] {
  const byKey = new Map<string, string>();

  for (const value of uniqueStrings(values)) {
    const key = getDerivedRemoteMediaKey(value) ?? value;
    const current = byKey.get(key);

    if (!current || getRemoteMediaVariantScore(value) > getRemoteMediaVariantScore(current)) {
      byKey.set(key, value);
    }
  }

  return Array.from(byKey.values());
}

export function getImportableRemoteMediaUrls(values: string[]): string[] {
  const urls = dedupeDerivedRemoteMediaUrls(values);
  if (urls.length === 0) {
    return [];
  }

  const videoUrls = collapseRemoteVideoUrls(urls.filter(isImportableRemoteVideoUrl));
  const imageUrls = urls.filter((url) => !isImportableRemoteVideoUrl(url) && !isLikelyNonMediaAssetUrl(url));

  // 视频条目：只保留视频本体（封面仅作回退），并折叠多清晰度副本。
  if (videoUrls.length > 0 && imageUrls.length === 0) {
    return videoUrls;
  }

  // 纯图片条目：保留图片。
  if (imageUrls.length > 0 && videoUrls.length === 0) {
    return imageUrls;
  }

  // 混合媒体：默认优先图片，避免图片条目被附带视频“顶替”。
  // 若调用方已将视频放在第一位（视频条目），则仍优先视频。
  const firstUrl = urls[0];
  if (firstUrl && isImportableRemoteVideoUrl(firstUrl)) {
    return videoUrls;
  }

  return imageUrls;
}

function isLikelyNonMediaAssetUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const pathname = url.pathname.toLowerCase();

    return /\.(?:js|mjs|css|map|json|wasm|woff2?|ttf|otf|eot|txt|xml|html?)(?:$|[?#])/i.test(pathname);
  } catch {
    return true;
  }
}

/**
 * 折叠“同一视频的多清晰度/镜像副本”。
 * - Twitter amplify 的 720p/360p/270p 视为同一组，保留最高分
 * - 若存在 WebToMind/R2/Supabase 主站成品，优先只保留主站视频，丢弃 Twitter 镜像
 */
export function collapseRemoteVideoUrls(videoUrls: string[]): string[] {
  const candidates = uniqueStrings(videoUrls).filter(isImportableRemoteVideoUrl);

  if (candidates.length <= 1) {
    return candidates;
  }

  const bestByGroup = new Map<string, string>();

  for (const url of candidates) {
    const groupKey = getRemoteVideoGroupKey(url) ?? url;
    const current = bestByGroup.get(groupKey);

    if (!current || getRemoteVideoPreferenceScore(url) > getRemoteVideoPreferenceScore(current)) {
      bestByGroup.set(groupKey, url);
    }
  }

  const collapsed = Array.from(bestByGroup.values()).sort(
    (left, right) => getRemoteVideoPreferenceScore(right) - getRemoteVideoPreferenceScore(left),
  );
  const primaryHostVideos = collapsed.filter(isPreferredPrimaryVideoHost);

  // 主站成品存在时，不再同时导入 Twitter 多码率镜像。
  if (primaryHostVideos.length > 0) {
    return primaryHostVideos;
  }

  return collapsed;
}

function getRemoteVideoGroupKey(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = normalizeHostname(url.hostname);
    const pathname = url.pathname;

    const amplifyMatch = pathname.match(/\/amplify_video\/(\d+)\//i);
    if (amplifyMatch?.[1] && (hostname === "video.twimg.com" || hostname.endsWith(".twimg.com"))) {
      return `twimg-amplify:${amplifyMatch[1]}`;
    }

    const extMatch = pathname.match(/\/([^/]+)\.(mp4|webm|mov|m4v)(?:$|\/)/i);
    if (extMatch?.[1] && (hostname.includes("cloudflarestorage.com") || hostname.includes("supabase.co"))) {
      return `${hostname}:${extMatch[1].toLowerCase()}`;
    }

    return `${hostname}${pathname.toLowerCase()}`;
  } catch {
    return null;
  }
}

function isPreferredPrimaryVideoHost(value: string): boolean {
  try {
    const hostname = normalizeHostname(new URL(value).hostname);

    return (
      hostname.includes("cloudflarestorage.com") ||
      hostname.includes("webtomind") ||
      hostname.includes("supabase.co") ||
      hostname.includes("vlabvod.com") ||
      hostname.includes("wjwj.top") ||
      hostname.includes("aiart.pics")
    );
  } catch {
    return false;
  }
}

function getRemoteVideoPreferenceScore(value: string): number {
  try {
    const url = new URL(value);
    const hostname = normalizeHostname(url.hostname);
    const pathname = url.pathname.toLowerCase();
    let score = 0;

    if (hostname.includes("cloudflarestorage.com") || hostname.includes("webtomind-media")) {
      score += 10_000;
    } else if (hostname.includes("supabase.co")) {
      score += 9_000;
    } else if (hostname.includes("vlabvod.com") || hostname.includes("aiart.pics") || hostname.includes("wjwj.top")) {
      score += 8_000;
    } else if (hostname.includes("twimg.com") || hostname.includes("twitter.com") || hostname.includes("x.com")) {
      score += 1_000;
    } else {
      score += 3_000;
    }

    const resolutionMatch = pathname.match(/\/(\d{2,5})x(\d{2,5})\//i);
    if (resolutionMatch) {
      const width = Number(resolutionMatch[1]);
      const height = Number(resolutionMatch[2]);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        score += width * height;
      }
    }

    if (pathname.endsWith(".m3u8")) {
      score -= 50_000;
    }

    return score;
  } catch {
    return 0;
  }
}

function getDerivedRemoteMediaKey(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = normalizeHostname(url.hostname);
    const pathname = url.pathname;
    const markerIndex = pathname.indexOf("~");

    if (
      !isByteDanceDerivedMediaHost(hostname) ||
      markerIndex < 0 ||
      !/\.(?:png|jpe?g|jfif|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico|apng)$/i.test(pathname)
    ) {
      return null;
    }

    const sourcePath = pathname.slice(0, markerIndex).toLowerCase();

    return sourcePath.length > 1 ? `bytedance:${sourcePath}` : null;
  } catch {
    return null;
  }
}

function isByteDanceDerivedMediaHost(hostname: string): boolean {
  return hostname === "byteimg.com" || hostname.endsWith(".byteimg.com");
}

function getRemoteMediaVariantScore(value: string): number {
  try {
    const url = new URL(value);
    const text = `${url.pathname}${url.search}`;
    let bestScore = 0;
    let match: RegExpExecArray | null;
    const sizePattern = /(\d{2,5})[:x](\d{2,5})/gi;

    while ((match = sizePattern.exec(text))) {
      const width = Number(match[1]);
      const height = Number(match[2]);

      if (Number.isFinite(width) && Number.isFinite(height)) {
        bestScore = Math.max(bestScore, width * height);
      }
    }

    const edgeMatch = text.match(/[._-]c(\d{3,5})(?:[._-]|\b)/i);
    if (edgeMatch) {
      const edge = Number(edgeMatch[1]);

      if (Number.isFinite(edge)) {
        bestScore = Math.max(bestScore, edge * edge);
      }
    }

    return bestScore || 1;
  } catch {
    return 1;
  }
}

function createTitleFromPrompt(prompt: string): string {
  const line = normalizeImportText(prompt).split("\n").find((item) => item.trim()) ?? "未命名提示词";
  const cleaned = cleanSingleLine(line)
    .replace(/^来源链接[:：]\s*/u, "")
    .replace(/^https?:\/\//i, "");

  if (cleaned.length <= maxTitleLength) {
    return cleaned || "未命名提示词";
  }

  return `${cleaned.slice(0, maxTitleLength - 1)}…`;
}

function normalizeImportText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function cleanSingleLine(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function isPromptCandidate(value: string): boolean {
  const text = normalizeImportText(value);

  if (text.length < 8) {
    return false;
  }

  if (isSourceOnlyPrompt(text)) {
    return false;
  }

  if (/^[0-9a-f]{8}-[0-9a-f-]{12,}$/i.test(text)) {
    return false;
  }

  if (/^[a-z0-9_-]{12,}$/i.test(text) && !/[\s,，。.!！?？]/.test(text)) {
    return false;
  }

  return true;
}

function extractFirstHttpUrl(input: string): string | null {
  return input.trim().match(/https?:\/\/[^\s<>)\]]+/i)?.[0]?.replace(/[.,;]+$/, "") ?? null;
}

function decodeUrlPathPart(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function decodeMarkdownEscapes(input: string): string {
  return input.replace(/\\([\\`*_{}\[\]()#+\-.!|>])/g, "$1");
}

function decodeEscapedString(input: string): string {
  try {
    return JSON.parse(`"${input.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return decodeHtmlEntities(input);
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 10)));
}

function parseTextChunk(data: Uint8Array): PngTextChunk | null {
  const separator = data.indexOf(0);

  if (separator <= 0) {
    return null;
  }

  return {
    keyword: decodeUtf8(data.subarray(0, separator)),
    text: decodeUtf8(data.subarray(separator + 1)),
  };
}

function parseInternationalTextChunk(data: Uint8Array): PngTextChunk | null {
  const keywordEnd = data.indexOf(0);

  if (keywordEnd <= 0 || keywordEnd + 5 >= data.length) {
    return null;
  }

  const compressionFlag = data[keywordEnd + 1];

  if (compressionFlag !== 0) {
    return null;
  }

  let offset = keywordEnd + 3;
  const languageEnd = data.indexOf(0, offset);

  if (languageEnd < 0) {
    return null;
  }

  offset = languageEnd + 1;
  const translatedKeywordEnd = data.indexOf(0, offset);

  if (translatedKeywordEnd < 0) {
    return null;
  }

  return {
    keyword: decodeUtf8(data.subarray(0, keywordEnd)),
    text: decodeUtf8(data.subarray(translatedKeywordEnd + 1)),
  };
}

function isPng(input: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((byte, index) => input[index] === byte);
}

function readUInt32BE(input: Uint8Array, offset: number): number {
  return (
    ((input[offset] ?? 0) * 0x1000000) +
    ((input[offset + 1] ?? 0) << 16) +
    ((input[offset + 2] ?? 0) << 8) +
    (input[offset + 3] ?? 0)
  );
}

function decodeAscii(input: Uint8Array): string {
  return String.fromCharCode(...input);
}

function decodeUtf8(input: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(input);
}

function normalizePriorityIndex(index: number): number {
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
