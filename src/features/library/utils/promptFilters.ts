import type {
  LibraryItem,
  MaterialBrowserSortDirection,
  MaterialBrowserSortMode,
  PromptContentType,
  ExternalMediaStatus,
  VideoKeyframe,
} from "../types/library";
import { resolveGenerationModelLabel } from "./generationModels";
import { prioritizeMissingMediaStatusItems } from "./externalMediaStatus";
import { normalizeNsfwRating } from "./nsfwRating";
import { isGenericPromptLabel, removeCategoryFromTags, suggestPromptCategories } from "./promptAnalysis";
import { normalizePromptType } from "./promptType";

export const allCategoriesValue = "all";

export const localImportAuthorName = "本地导入";

export type PromptSortMode = MaterialBrowserSortMode;
export type PromptSortDirection = MaterialBrowserSortDirection;

export type PromptCardData = {
  id: string;
  title: string;
  prompt: string;
  category: string;
  tags: string[];
  hot: number;
  createdAt: number;
  updatedAt: number;
  imageFileName: string;
  negativePrompt: string;
  author: string | null;
  authorUrl: string | null;
  authorAvatarUrl: string | null;
  sourceUrl: string | null;
  generationMethod: string;
  promptType: PromptContentType;
  nsfwRating: LibraryItem["nsfwRating"];
  mediaStatus: ExternalMediaStatus | null;
  videoDurationSec: number | null;
  videoPosterFileName: string | null;
  videoKeyframes: VideoKeyframe[];
  videoReferenceImages: string[];
  searchText: string;
};

export type PromptFilterOptions = {
  query: string;
  category: string;
  activeTag: string | null;
  sortMode: PromptSortMode;
  sortDirection: PromptSortDirection;
  imageSizeById?: ReadonlyMap<string, number>;
  randomSeed?: number;
  /** 刚导入的素材 id，按导入顺序置顶显示（第一张为刚导入的提示词组）。 */
  pinnedItemIds?: readonly string[];
};

export function toPromptCardData(item: LibraryItem): PromptCardData {
  const extendedItem = item as LibraryItem & {
    author?: unknown;
    authorName?: unknown;
    authorUrl?: unknown;
    authorAvatarUrl?: unknown;
    category?: unknown;
    generationMethod?: unknown;
    hot?: unknown;
    model?: unknown;
    promptType?: unknown;
  };
  const sourceUrl = typeof item.sourceUrl === "string" && item.sourceUrl.trim() ? item.sourceUrl.trim() : null;
  const tags = item.tags.map((tag) => tag.trim()).filter(Boolean);
  const category = resolvePromptCategory(extendedItem, tags);
  const createdAt = Date.parse(item.createdAt) || 0;
  const updatedAt = Date.parse(item.updatedAt) || createdAt;
  const hot = typeof extendedItem.hot === "number" ? extendedItem.hot : estimateHotScore(item);
  const derivedAuthor = deriveAuthorFromSourceUrl(sourceUrl);
  const author =
    (typeof extendedItem.author === "string" && extendedItem.author.trim() ? extendedItem.author.trim() : "") ||
    (typeof extendedItem.authorName === "string" && extendedItem.authorName.trim()
      ? extendedItem.authorName.trim()
      : "") ||
    derivedAuthor?.name ||
    deriveSiteNameFromUrl(sourceUrl) ||
    localImportAuthorName;
  const rawGenerationMethod = resolveRawGenerationMethod(extendedItem, sourceUrl);
  const generationMethod =
    resolveGenerationModelLabel({
      category,
      generationMethod: rawGenerationMethod,
      prompt: item.prompt,
      sourceUrl,
      tags,
      title: item.title,
    }) ?? rawGenerationMethod;
  const authorUrl = typeof item.authorUrl === "string" && item.authorUrl.trim() ? item.authorUrl.trim() : (derivedAuthor?.url ?? null);
  const authorAvatarUrl =
    typeof item.authorAvatarUrl === "string" && item.authorAvatarUrl.trim() ? item.authorAvatarUrl.trim() : null;
  const displayTags = removeCategoryFromTags(tags, category);
  const promptType = normalizePromptType(extendedItem.promptType, {
    category,
    generationMethod,
    imageFileName: item.imageFileName,
    prompt: item.prompt,
    tags,
    title: item.title,
  });

  return {
    id: item.id,
    title: item.title,
    prompt: item.prompt,
    category,
    tags: displayTags,
    hot,
    createdAt,
    updatedAt,
    imageFileName: item.imageFileName,
    negativePrompt: item.negativePrompt,
    author,
    authorUrl,
    authorAvatarUrl,
    sourceUrl,
    generationMethod,
    promptType,
    nsfwRating: normalizeNsfwRating(item.nsfwRating),
    mediaStatus:
      item.mediaStorage && item.mediaStorage !== "managed" ? (item.mediaStorage.status ?? "available") : null,
    videoDurationSec: typeof item.videoDurationSec === "number" && Number.isFinite(item.videoDurationSec) ? item.videoDurationSec : null,
    videoPosterFileName: typeof item.videoPosterFileName === "string" && item.videoPosterFileName ? item.videoPosterFileName : null,
    videoKeyframes: Array.isArray(item.videoKeyframes) ? item.videoKeyframes : [],
    videoReferenceImages: Array.isArray(item.videoReferenceImages) ? item.videoReferenceImages : [],
    searchText: buildPromptSearchText({
      author,
      authorUrl,
      category,
      generationMethod,
      id: item.id,
      imageFileName:
        item.mediaStorage && item.mediaStorage !== "managed"
          ? `${item.imageFileName} ${item.mediaStorage.relativePath}`
          : item.imageFileName,
      negativePrompt: item.negativePrompt,
      prompt: item.prompt,
      promptType,
      sourceUrl,
      tags: displayTags,
      title: item.title,
    }),
  };
}

export function filterPromptCards(cards: PromptCardData[], options: PromptFilterOptions): PromptCardData[] {
  const query = options.query.trim().toLowerCase();

  const filteredCards = cards.filter((card) => {
    const matchesQuery = query ? card.searchText.includes(query) : true;
    const matchesCategory = options.category === allCategoriesValue || card.category === options.category;
    const matchesTag = options.activeTag ? card.tags.includes(options.activeTag) : true;

    return matchesQuery && matchesCategory && matchesTag;
  });

  const sortedCards = sortPromptCards(
    filteredCards,
    options.sortMode,
    options.sortDirection,
    options.imageSizeById,
    options.randomSeed,
  );

  return pinPromptCards(prioritizeMissingMediaStatusItems(sortedCards), options.pinnedItemIds);
}

function buildPromptSearchText(input: {
  author: string | null;
  authorUrl: string | null;
  category: string;
  generationMethod: string;
  id: string;
  imageFileName: string;
  negativePrompt: string;
  prompt: string;
  promptType: PromptContentType;
  sourceUrl: string | null;
  tags: readonly string[];
  title: string;
}): string {
  return [
    input.title,
    input.prompt,
    input.negativePrompt,
    input.category,
    input.tags.join(" "),
    input.author ?? "",
    input.authorUrl ?? "",
    input.sourceUrl ?? "",
    input.generationMethod,
    input.promptType === "video" ? "视频 video" : "图片 image",
    input.imageFileName,
    input.id,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterFavoritePromptCards(
  cards: PromptCardData[],
  likedImageIds: readonly string[],
): PromptCardData[] {
  const likedImageIdSet = new Set(likedImageIds);

  return cards.filter((card) => likedImageIdSet.has(card.id));
}

function resolveRawGenerationMethod(item: { generationMethod?: unknown; model?: unknown }, sourceUrl: string | null): string {
  if (typeof item.generationMethod === "string" && item.generationMethod.trim()) {
    return item.generationMethod.trim();
  }

  if (typeof item.model === "string" && item.model.trim()) {
    return item.model.trim();
  }

  return sourceUrl ? "网络提示词" : "本地提示词";
}

function resolvePromptCategory(
  item: { category?: unknown; title?: unknown; prompt?: unknown },
  tags: readonly string[],
): string {
  if (typeof item.category === "string" && item.category.trim()) {
    return item.category.trim();
  }

  const tagCategory = tags.find((tag) => !isGenericPromptLabel(tag));

  if (tagCategory) {
    return tagCategory;
  }

  const title = typeof item.title === "string" ? item.title : "";
  const prompt = typeof item.prompt === "string" ? item.prompt : "";
  const suggestedCategory = suggestPromptCategories({
    title,
    prompt,
    tags: [...tags],
  }, { includeFallback: false, skipHeavyAnalysis: true }).find((category) => !isGenericPromptLabel(category));

  if (suggestedCategory) {
    return suggestedCategory;
  }

  return tags.find((tag) => !isGenericPromptLabel(tag)) ?? "未分类";
}

function deriveAuthorFromSourceUrl(sourceUrl: string | null): { name: string; url: string } | null {
  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const statusMatch = url.pathname.match(/^\/([^/]+)\/status(?:es)?\/\d+/i);

    if ((hostname === "x.com" || hostname === "twitter.com") && statusMatch?.[1]) {
      const username = statusMatch[1].replace(/^@/, "");

      return {
        name: `@${username}`,
        url: `https://x.com/${username}`,
      };
    }
  } catch {
    return null;
  }

  return null;
}

const siteNameByHostname: Record<string, string> = {
  "jimeng.jianying.com": "即梦AI",
  "aiart.pics": "AiArt",
  "webtomind.com": "WebToMind",
  "aipromptfill.com": "AiPromptFill",
  "x.com": "X",
  "twitter.com": "X",
};

function deriveSiteNameFromUrl(sourceUrl: string | null): string | null {
  if (!sourceUrl) {
    return null;
  }

  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");

    for (const [host, name] of Object.entries(siteNameByHostname)) {
      if (hostname === host || hostname.endsWith(`.${host}`)) {
        return name;
      }
    }

    const parts = hostname.split(".");
    const core = parts.length >= 2 ? parts[parts.length - 2] : parts[0];

    return core ? core.charAt(0).toUpperCase() + core.slice(1) : null;
  } catch {
    return null;
  }
}


/**
 * 将刚导入的素材固定到列表最前，其它项保持当前相对顺序。
 * 用于随机/时间/尺寸等所有排序模式下，导入后立刻反馈“第一张就是新素材”。
 */
export function pinPromptCards(
  cards: readonly PromptCardData[],
  pinnedItemIds: readonly string[] | undefined,
): PromptCardData[] {
  if (!pinnedItemIds || pinnedItemIds.length === 0 || cards.length === 0) {
    return cards as PromptCardData[];
  }

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const pinnedCards: PromptCardData[] = [];
  const pinnedIdSet = new Set<string>();

  for (const itemId of pinnedItemIds) {
    if (pinnedIdSet.has(itemId)) {
      continue;
    }

    const card = cardById.get(itemId);

    if (!card) {
      continue;
    }

    pinnedCards.push(card);
    pinnedIdSet.add(itemId);
  }

  if (pinnedCards.length === 0) {
    return cards as PromptCardData[];
  }

  const remainingCards = cards.filter((card) => !pinnedIdSet.has(card.id));
  return [...pinnedCards, ...remainingCards];
}

export function sortPromptCards(
  cards: PromptCardData[],
  sortMode: PromptSortMode,
  sortDirection: PromptSortDirection,
  imageSizeById: ReadonlyMap<string, number> = new Map(),
  randomSeed = 0,
): PromptCardData[] {
  if (sortMode === "random") {
    return shuffleArray(cards, randomSeed);
  }

  return [...cards].sort((first, second) => {
    const firstValue = getPromptSortValue(first, sortMode, imageSizeById);
    const secondValue = getPromptSortValue(second, sortMode, imageSizeById);
    const result = sortDirection === "asc" ? firstValue - secondValue : secondValue - firstValue;

    return result || second.createdAt - first.createdAt || first.id.localeCompare(second.id);
  });
}

function shuffleArray<T>(array: readonly T[], seed: number): T[] {
  const shuffled = [...array];
  const random = createSeededRandom(seed);

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function createSeededRandom(seed: number): () => number {
  let state = normalizeRandomSeed(seed) || 0x9e3779b9;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeRandomSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

function getPromptSortValue(
  card: PromptCardData,
  sortMode: PromptSortMode,
  imageSizeById: ReadonlyMap<string, number>,
): number {
  if (sortMode === "updatedAt") {
    return card.updatedAt;
  }

  if (sortMode === "imageSize") {
    return imageSizeById.get(card.id) ?? 0;
  }

  return card.createdAt;
}

export function getPromptCategories(cards: PromptCardData[]): string[] {
  return Array.from(new Set(cards.map((card) => card.category).filter(Boolean))).sort((first, second) =>
    first.localeCompare(second, "zh-CN"),
  );
}

export function getPopularTags(cards: PromptCardData[]): string[] {
  const tagCounts = new Map<string, number>();

  for (const card of cards) {
    for (const tag of card.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "zh-CN"))
    .map(([tag]) => tag);
}

function estimateHotScore(item: LibraryItem): number {
  const promptWeight = Math.min(60, Math.ceil(item.prompt.length / 24));
  const tagWeight = item.tags.length * 8;
  const titleWeight = item.title.trim() ? 12 : 0;

  return promptWeight + tagWeight + titleWeight;
}
