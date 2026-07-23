import type { LibraryItem, NsfwRating } from "../types/library";
import type { RemotePromptAnalysis } from "../types/ai";
import { isVideoMediaFile } from "./mediaFileTypes";

const exactNsfwLabels = new Set(["nsfw", "unsafe", "adult", "explicit", "porn", "色情", "情色", "成人", "限制级", "不安全"]);
const exactSafeLabels = new Set(["sfw", "safe", "normal", "clean", "安全", "正常", "普通", "非限制级", "非色情"]);
const exactUnknownLabels = new Set(["unknown", "uncertain", "未知", "无法判断", "不确定"]);
const safeNegationPattern =
  /(?:无|没有|未见|非|不是|不属于|not|non)[^，。,.；;\n]{0,16}(?:nsfw|成人|色情|裸露|裸体|性暗示|限制级|露骨|explicit|sexual|nudity|nude|porn)/giu;
const nsfwTextPattern =
  /nsfw|unsafe|adult|explicit|porn|sexual|nudity|nude|色情|情色|成人|裸露|裸体|性暗示|限制级|不安全/iu;
const safeTextPattern =
  /sfw|safe|normal|clean|安全|正常|普通|日常|时尚|非限制级|非色情|无明显成人|无明显裸露|没有明显成人|没有明显裸露|非\s*nsfw|不是\s*nsfw|not\s+nsfw|non\s+nsfw/iu;

export function normalizeNsfwRating(input: unknown): NsfwRating {
  return input === "safe" || input === "nsfw" || input === "unknown" ? input : "unknown";
}

export function isNsfwItem(item: Pick<LibraryItem, "nsfwRating">): boolean {
  return normalizeNsfwRating(item.nsfwRating) === "nsfw";
}

export function shouldGradeNsfwItem(
  item: Pick<LibraryItem, "imageFileName" | "mediaStorage" | "nsfwRating">,
  options: { force?: boolean } = {},
): boolean {
  if (!item.imageFileName) {
    return false;
  }

  if (item.mediaStorage && item.mediaStorage !== "managed" && item.mediaStorage.status === "missing") {
    return false;
  }

  if (isVideoMediaFile(item.imageFileName)) {
    return false;
  }

  return options.force === true || normalizeNsfwRating(item.nsfwRating) === "unknown";
}

export function resolveNsfwRatingFromRemoteAnalysis(analysis: RemotePromptAnalysis): NsfwRating {
  const categoryRating = resolveExactSafetyLabel(analysis.category);

  if (categoryRating) {
    return categoryRating;
  }

  const tagRatings = analysis.tags.map(resolveExactSafetyLabel).filter((rating): rating is NsfwRating => Boolean(rating));

  if (tagRatings.includes("nsfw")) {
    return "nsfw";
  }

  if (tagRatings.includes("safe")) {
    return "safe";
  }

  const text = [analysis.summary, analysis.title].join(" ").trim();

  if (!text) {
    return "unknown";
  }

  const textWithoutSafeNegations = text.replace(safeNegationPattern, " ");

  if (nsfwTextPattern.test(textWithoutSafeNegations)) {
    return "nsfw";
  }

  if (safeTextPattern.test(text)) {
    return "safe";
  }

  return "unknown";
}

function resolveExactSafetyLabel(input: string): NsfwRating | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/\\|()[\]{}"'`.,，。；;!?！？]+/g, "");

  if (!normalized) {
    return null;
  }

  if (exactNsfwLabels.has(normalized)) {
    return "nsfw";
  }

  if (exactSafeLabels.has(normalized)) {
    return "safe";
  }

  if (exactUnknownLabels.has(normalized)) {
    return "unknown";
  }

  return null;
}
