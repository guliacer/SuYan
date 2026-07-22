import type { LibraryFile, LibraryItem, VideoKeyframe } from "../types/library";
import { normalizeNsfwRating } from "./nsfwRating";
import { normalizePromptType } from "./promptType";

export function migrateLibrary(input: unknown): LibraryFile {
  if (isLibraryFile(input)) {
    return {
      ...input,
      items: input.items.map(normalizeItem),
    };
  }

  throw new Error("Unsupported library schemaVersion");
}

export function isLibraryFile(input: unknown): input is LibraryFile {
  if (!isRecord(input)) {
    return false;
  }

  return (
    input.schemaVersion === 1 &&
    typeof input.updatedAt === "string" &&
    Array.isArray(input.items) &&
    input.items.every(isLibraryItem)
  );
}

function isLibraryItem(input: unknown): input is LibraryItem {
  if (!isRecord(input)) {
    return false;
  }

  return (
    typeof input.id === "string" &&
    typeof input.title === "string" &&
    typeof input.imageFileName === "string" &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    isOptionalString(input.category) &&
    isOptionalString(input.generationMethod) &&
    isOptionalPromptType(input.promptType) &&
    isOptionalString(input.sourceUrl) &&
    isOptionalString(input.authorName) &&
    isOptionalString(input.authorUrl) &&
    isOptionalString(input.authorAvatarUrl) &&
    isOptionalNsfwRating(input.nsfwRating) &&
    isOptionalString(input.nsfwCheckedAt) &&
    isOptionalNumber(input.videoDurationSec) &&
    isOptionalString(input.videoPosterFileName) &&
    isOptionalVideoKeyframes(input.videoKeyframes) &&
    isOptionalStringArray(input.videoReferenceImages) &&
    isOptionalString(input.videoFramesGeneratedAt) &&
    typeof input.createdAt === "string" &&
    typeof input.updatedAt === "string"
  );
}

function normalizeItem(item: LibraryItem): LibraryItem {
  return {
    id: item.id,
    title: item.title,
    imageFileName: item.imageFileName,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    category: normalizeOptionalString(item.category),
    tags: item.tags,
    generationMethod: normalizeOptionalString(item.generationMethod),
    promptType: normalizePromptType(item.promptType, item),
    sourceUrl: normalizeOptionalString(item.sourceUrl),
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
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function isOptionalNsfwRating(input: unknown): boolean {
  return input === undefined || input === "unknown" || input === "safe" || input === "nsfw";
}

function isOptionalNumber(input: unknown): boolean {
  return input === undefined || input === null || (typeof input === "number" && Number.isFinite(input));
}

function isOptionalStringArray(input: unknown): boolean {
  return input === undefined || (Array.isArray(input) && input.every((entry) => typeof entry === "string"));
}

function isOptionalVideoKeyframes(input: unknown): boolean {
  if (input === undefined) {
    return true;
  }

  return (
    Array.isArray(input) &&
    input.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.imageFileName === "string" &&
        typeof entry.atSec === "number" &&
        Number.isFinite(entry.atSec) &&
        typeof entry.label === "string",
    )
  );
}

function normalizeVideoKeyframes(input: unknown): VideoKeyframe[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter(
      (entry): entry is VideoKeyframe =>
        isRecord(entry) &&
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

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return [
    ...new Set(
      input
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeOptionalNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || input === null || typeof input === "string";
}

function isOptionalPromptType(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function normalizeOptionalString(input: string | null | undefined): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
