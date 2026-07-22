import type { LibraryFile, LibraryItem, VideoKeyframe } from "../types/library";
import { normalizeNsfwRating } from "./nsfwRating";
import { normalizePromptType } from "./promptType";

export function buildLibraryFile(items: LibraryItem[]): LibraryFile {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: items.map((item) => {
      const remoteImageUrl = normalizeOptionalString(item.remoteImageUrl);

      return {
        ...item,
        title: item.title.trim(),
        prompt: item.prompt.trim(),
        negativePrompt: item.negativePrompt.trim(),
        category: normalizeOptionalString(item.category),
        tags: uniqueTags(item.tags),
        generationMethod: normalizeOptionalString(item.generationMethod),
        promptType: normalizePromptType(item.promptType, item),
        sourceUrl: normalizeOptionalString(item.sourceUrl),
        remoteImageUrl,
        remoteImageStatus: remoteImageUrl ? normalizeRemoteImageStatus(item.remoteImageStatus) : null,
        authorName: normalizeOptionalString(item.authorName),
        authorUrl: normalizeOptionalString(item.authorUrl),
        authorAvatarUrl: normalizeOptionalString(item.authorAvatarUrl),
        nsfwRating: normalizeNsfwRating(item.nsfwRating),
        nsfwCheckedAt: normalizeOptionalString(item.nsfwCheckedAt),
        videoDurationSec: normalizeOptionalNumber(item.videoDurationSec),
        videoPosterFileName: normalizeOptionalString(item.videoPosterFileName),
        videoKeyframes: normalizeVideoKeyframes(item.videoKeyframes),
        videoReferenceImages: normalizeStringArray(item.videoReferenceImages),
        videoFramesGeneratedAt: normalizeOptionalString(item.videoFramesGeneratedAt),
        updatedAt: item.updatedAt,
      };
    }),
  };
}

function normalizeVideoKeyframes(input: VideoKeyframe[] | undefined): VideoKeyframe[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(
      (entry) =>
        entry &&
        typeof entry.imageFileName === "string" &&
        entry.imageFileName.trim().length > 0 &&
        typeof entry.atSec === "number" &&
        Number.isFinite(entry.atSec) &&
        typeof entry.label === "string",
    )
    .map((entry) => ({
      imageFileName: entry.imageFileName.trim(),
      atSec: Math.max(0, entry.atSec),
      label: entry.label.trim(),
    }));
}

function normalizeStringArray(input: string[] | undefined): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(input.filter((entry) => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))];
}

function normalizeOptionalNumber(input: number | null | undefined): number | null {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
}

export function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function normalizeOptionalString(input: string | null | undefined): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function normalizeRemoteImageStatus(input: LibraryItem["remoteImageStatus"]): LibraryItem["remoteImageStatus"] {
  return input === "pending" || input === "downloaded" ? input : null;
}
