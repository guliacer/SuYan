import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryFile, LibraryItem, MediaStorage, VideoKeyframe } from "../../../src/features/library/types/library";
import type { CategoryAssignmentSource } from "../../../src/features/library/types/category";
import { normalizeNsfwRating } from "../../../src/features/library/utils/nsfwRating";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { createEmptyCategoryTaxonomy } from "../../../src/features/library/utils/categoryTaxonomy";
import { migrateLibraryFileCategories, LIBRARY_SCHEMA_VERSION_V2 } from "../../../src/features/library/utils/categoryMigration";
import { AppError } from "../ipc/errors";
import { getImagesDir, getLibraryDataDir, getLibraryPath } from "./libraryPaths";
import {
  readLibraryJsonWithBackupRestore,
  writeLibraryJsonAtomically,
} from "./libraryJsonPersistence";
import { createDefaultLibrary, createDefaultSeedImage, getDefaultSeedImageFileNames, shouldEnableDefaultLibrarySeed } from "./defaultLibrarySeed";
import { refreshExternalMediaHealth } from "./externalMediaHealth";

const schemaVersion = LIBRARY_SCHEMA_VERSION_V2;
const defaultSeedMarkerFileName = ".default-library-seeded";
let libraryMutationQueue: Promise<void> = Promise.resolve();
let cachedLibraryPath: string | null = null;
let cachedLibrary: LibraryFile | null = null;
let cachedItemsById: Map<string, LibraryItem> | null = null;
let cachedItemsByImageFileName: Map<string, LibraryItem> | null = null;
let cachedItemsByExternalPath: Map<string, LibraryItem> | null = null;

export function createEmptyLibrary(): LibraryFile {
  return {
    schemaVersion,
    updatedAt: new Date().toISOString(),
    items: [],
    categoryTaxonomy: createEmptyCategoryTaxonomy(),
  };
}

function enqueueLibraryMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = libraryMutationQueue.then(operation, operation);
  libraryMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function ensureLibraryStorage(): Promise<void> {
  await enqueueLibraryMutation(ensureLibraryStorageUnlocked);
}

async function ensureLibraryStorageUnlocked(): Promise<void> {
  await fs.mkdir(getImagesDir(), { recursive: true });

  try {
    await fs.access(getLibraryPath());
  } catch {
    await writeInitialLibraryUnlocked();
    return;
  }

  if (await hasDefaultSeedMarker()) {
    return;
  }

  const content = await fs.readFile(getLibraryPath(), "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return;
  }

  if (isLibraryFile(parsed) && parsed.items.length === 0) {
    if (shouldWriteDefaultSeed()) {
      await writeDefaultSeedLibraryUnlocked();
      return;
    }

    await markDefaultSeeded();
    return;
  }

  if (isLibraryFile(parsed)) {
    await markDefaultSeeded();
  }
}

export async function readLibraryFile(options?: { refreshExternalHealth?: boolean }): Promise<LibraryFile> {
  if (options?.refreshExternalHealth) {
    return updateLibraryFile(async (library) => {
      const healthyLibrary = await refreshExternalMediaHealth(library);
      return healthyLibrary === library ? null : healthyLibrary;
    }, { skipNormalize: true });
  }

  return enqueueLibraryMutation(async () => {
    await ensureLibraryStorageUnlocked();
    return readLibraryFileUnlocked();
  });
}

async function readLibraryFileUnlocked(): Promise<LibraryFile> {
  const libraryPath = getLibraryPath();

  if (cachedLibraryPath === libraryPath && cachedLibrary) {
    return cachedLibrary;
  }

  invalidateLibraryLookupCacheIfPathChanged(libraryPath);
  const loaded = await loadLibraryJsonContent(libraryPath);
  const parsed = loaded.parsed;

  if (!isLibraryFile(parsed)) {
    throw new AppError("LIBRARY_SCHEMA_INVALID", "素材库文件结构不合法。");
  }

  const normalizedLibrary: LibraryFile = {
    ...parsed,
    items: parsed.items.map(normalizeItem),
  };
  const taxonomy = normalizedLibrary.categoryTaxonomy ?? createEmptyCategoryTaxonomy();
  const migrated = migrateLibraryFileCategories(normalizedLibrary, taxonomy);

  if (migrated.changed || parsed.schemaVersion !== schemaVersion || loaded.restoredFromBackup) {
    return writeLibraryFileUnlocked(migrated.library, { skipNormalize: false });
  }

  refreshLibraryLookupCache(migrated.library);
  return migrated.library;
}

async function loadLibraryJsonContent(libraryPath: string): Promise<{
  parsed: unknown;
  restoredFromBackup: boolean;
}> {
  const primaryResult = await readLibraryJsonWithBackupRestore(libraryPath);
  if (!primaryResult.ok) {
    throw primaryResult.error;
  }

  try {
    return {
      parsed: JSON.parse(primaryResult.content) as unknown,
      restoredFromBackup: primaryResult.restoredFromBackup !== null,
    };
  } catch (primaryParseError) {
    if (primaryResult.restoredFromBackup !== null) {
      throw new AppError("LIBRARY_SCHEMA_INVALID", "素材库备份文件无法解析。");
    }

    // Primary file exists but is corrupt: try bak slots directly, skipping the empty primary.
    for (const backupPath of [
      `${libraryPath}.bak`,
      `${libraryPath}.bak.1`,
      `${libraryPath}.bak.2`,
    ]) {
      try {
        const backupContent = await fs.readFile(backupPath, "utf8");
        if (!backupContent.trim()) {
          continue;
        }
        const parsed = JSON.parse(backupContent) as unknown;
        await writeLibraryJsonAtomically(libraryPath, backupContent);
        return { parsed, restoredFromBackup: true };
      } catch {
        // try next slot
      }
    }

    throw primaryParseError;
  }
}

export async function writeLibraryFile(library: LibraryFile, options?: { skipNormalize?: boolean }): Promise<LibraryFile> {
  return enqueueLibraryMutation(async () => {
    await ensureLibraryStorageUnlocked();
    return writeLibraryFileUnlocked(library, options);
  });
}

async function writeLibraryFileUnlocked(
  library: LibraryFile,
  options?: { skipNormalize?: boolean },
): Promise<LibraryFile> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });
  await fs.mkdir(getImagesDir(), { recursive: true });

  const taxonomy = library.categoryTaxonomy ?? createEmptyCategoryTaxonomy();
  const migrated = migrateLibraryFileCategories(
    {
      ...library,
      schemaVersion: library.schemaVersion === 1 || library.schemaVersion === 2 ? library.schemaVersion : 1,
      categoryTaxonomy: taxonomy,
    },
    taxonomy,
  );

  const normalized: LibraryFile = options?.skipNormalize
    ? {
        schemaVersion,
        updatedAt: new Date().toISOString(),
        items: migrated.library.items,
        categoryTaxonomy: migrated.taxonomy,
      }
    : {
        schemaVersion,
        updatedAt: new Date().toISOString(),
        items: migrated.library.items.map(normalizeItem),
        categoryTaxonomy: migrated.taxonomy,
      };

  if (!isLibraryFile(normalized)) {
    throw new AppError("LIBRARY_SCHEMA_INVALID", "素材库文件结构不合法。");
  }

  // 紧凑 JSON 比 pretty-print 更小、更快；先写临时文件并滚动 .bak 再原子替换。
  await writeLibraryJsonAtomically(getLibraryPath(), JSON.stringify(normalized));
  refreshLibraryLookupCache(normalized);

  return normalized;
}

export async function updateLibraryFile(
  updater: (library: LibraryFile) => Promise<LibraryFile | null> | LibraryFile | null,
  options?: { skipNormalize?: boolean },
): Promise<LibraryFile> {
  return enqueueLibraryMutation(async () => {
    await ensureLibraryStorageUnlocked();
    const current = await readLibraryFileUnlocked();
    const next = await updater(current);
    return next ? writeLibraryFileUnlocked(next, options) : current;
  });
}

/**
 * Renderer saves are metadata edits based on a possibly stale snapshot. Merge them
 * with the latest disk state so watcher/import additions are retained and external
 * path health cannot be overwritten by an older renderer copy.
 */
export async function saveLibraryFileFromRenderer(library: LibraryFile): Promise<LibraryFile> {
  return updateLibraryFile((current) => {
    const incomingById = new Map(library.items.map((item) => [item.id, normalizeItem(item)]));
    const items = current.items.map((currentItem) => {
      const incoming = incomingById.get(currentItem.id);

      if (!incoming) {
        return currentItem;
      }

      return {
        ...incoming,
        mediaStorage: currentItem.mediaStorage,
        accountOwnerUid: currentItem.accountOwnerUid,
        ...(currentItem.accountOwnerUid ? { authorName: currentItem.authorName,
          authorAvatarUrl: currentItem.authorAvatarUrl, authorUrl: currentItem.authorUrl } : {}),
      };
    });

    return { ...current, items };
  });
}

export async function appendLibraryItems(items: LibraryItem[]): Promise<LibraryFile> {
  return updateLibraryFile((library) => ({
    ...library,
    items: [...items, ...library.items],
  }));
}

export async function findLibraryItemByImageFileName(imageFileName: string): Promise<LibraryItem | null> {
  await ensureLookupCacheLoaded();
  return cachedItemsByImageFileName?.get(imageFileName) ?? null;
}

export async function findLibraryItemById(itemId: string): Promise<LibraryItem | null> {
  await ensureLookupCacheLoaded();
  return cachedItemsById?.get(itemId) ?? null;
}

export async function findExternalLibraryItem(
  rootId: string,
  relativePath: string,
): Promise<LibraryItem | null> {
  await ensureLookupCacheLoaded();
  return cachedItemsByExternalPath?.get(makeExternalPathKey(rootId, relativePath)) ?? null;
}

async function ensureLookupCacheLoaded(): Promise<void> {
  const libraryPath = getLibraryPath();
  invalidateLibraryLookupCacheIfPathChanged(libraryPath);

  if (!cachedLibrary) {
    await readLibraryFile();
  }
}

function refreshLibraryLookupCache(library: LibraryFile): void {
  cachedLibraryPath = getLibraryPath();
  cachedLibrary = library;
  cachedItemsById = new Map(library.items.map((item) => [item.id, item]));
  cachedItemsByImageFileName = new Map(library.items.map((item) => [item.imageFileName, item]));
  cachedItemsByExternalPath = new Map(
    library.items.flatMap((item) => {
      const storage = item.mediaStorage;
      return storage && storage !== "managed"
        ? [[makeExternalPathKey(storage.rootId, storage.relativePath), item] as const]
        : [];
    }),
  );
}

function invalidateLibraryLookupCacheIfPathChanged(libraryPath: string): void {
  if (cachedLibraryPath === libraryPath) {
    return;
  }

  cachedLibraryPath = null;
  cachedLibrary = null;
  cachedItemsById = null;
  cachedItemsByImageFileName = null;
  cachedItemsByExternalPath = null;
}

function makeExternalPathKey(rootId: string, relativePath: string): string {
  return `${rootId}\u0000${relativePath}`;
}

export function normalizeItem(item: LibraryItem): LibraryItem {
  const remoteImageUrl = normalizeOptionalString(item.remoteImageUrl);

  return {
    id: item.id,
    title: item.title,
    imageFileName: item.imageFileName,
    mediaStorage: normalizeMediaStorage(item.mediaStorage),
    prompt: item.prompt,
    negativePrompt: item.negativePrompt,
    category: normalizeOptionalString(item.category),
    categoryId: normalizeOptionalString(item.categoryId),
    genreIds: normalizeOptionalStringArray(item.genreIds),
    categoryConfidence: normalizeOptionalConfidence(item.categoryConfidence),
    categorySource: normalizeCategorySource(item.categorySource),
    legacyCategory: normalizeOptionalString(item.legacyCategory),
    tags: item.tags,
    generationMethod: normalizeOptionalString(item.generationMethod),
    promptType: normalizePromptType(item.promptType, item),
    sourceUrl: normalizeOptionalString(item.sourceUrl),
    remoteImageUrl,
    remoteImageStatus: remoteImageUrl ? normalizeRemoteImageStatus(item.remoteImageStatus) : null,
    authorName: normalizeOptionalString(item.authorName),
    authorUrl: normalizeOptionalString(item.authorUrl),
    authorAvatarUrl: normalizeOptionalString(item.authorAvatarUrl),
    accountOwnerUid: normalizeOptionalString(item.accountOwnerUid),
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

function isLibraryFile(input: unknown): input is LibraryFile {
  if (!isRecord(input)) {
    return false;
  }

  return (
    (input.schemaVersion === 1 || input.schemaVersion === 2) &&
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
    isOptionalMediaStorage(input.mediaStorage) &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    isOptionalString(input.category) &&
    isOptionalString(input.categoryId) &&
    isOptionalStringArray(input.genreIds) &&
    isOptionalConfidence(input.categoryConfidence) &&
    isOptionalCategorySource(input.categorySource) &&
    isOptionalString(input.legacyCategory) &&
    isOptionalString(input.generationMethod) &&
    isOptionalPromptType(input.promptType) &&
    isOptionalString(input.sourceUrl) &&
    isOptionalString(input.remoteImageUrl) &&
    isOptionalRemoteImageStatus(input.remoteImageStatus) &&
    isOptionalString(input.authorName) &&
    isOptionalString(input.authorUrl) &&
    isOptionalString(input.authorAvatarUrl) &&
    isOptionalString(input.accountOwnerUid) &&
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

function isOptionalNsfwRating(input: unknown): boolean {
  return input === undefined || input === "unknown" || input === "safe" || input === "nsfw";
}

function isOptionalCategorySource(input: unknown): boolean {
  return input === undefined || input === null || input === "system" || input === "user" || input === "ai" || input === "local";
}

function isOptionalConfidence(input: unknown): boolean {
  return input === undefined || input === null || (typeof input === "number" && Number.isFinite(input));
}

function normalizeCategorySource(input: CategoryAssignmentSource | null | undefined): CategoryAssignmentSource | null {
  return input === "system" || input === "user" || input === "ai" || input === "local" ? input : null;
}

function normalizeOptionalConfidence(input: number | null | undefined): number | null {
  return typeof input === "number" && Number.isFinite(input) ? Math.min(1, Math.max(0, input)) : null;
}

function isOptionalRemoteImageStatus(input: unknown): boolean {
  return input === undefined || input === null || input === "pending" || input === "downloaded";
}

function isOptionalMediaStorage(input: unknown): boolean {
  return (
    input === undefined ||
    input === "managed" ||
    (isRecord(input) &&
      input.kind === "external" &&
      typeof input.rootId === "string" &&
      typeof input.relativePath === "string" &&
      (input.size === undefined || input.size === null || (typeof input.size === "number" && Number.isFinite(input.size))) &&
      (input.mtimeMs === undefined || input.mtimeMs === null || (typeof input.mtimeMs === "number" && Number.isFinite(input.mtimeMs))) &&
      (input.status === undefined || input.status === "available" || input.status === "missing"))
  );
}

function normalizeMediaStorage(input: LibraryItem["mediaStorage"]): MediaStorage {
  if (
    input &&
    typeof input === "object" &&
    input.kind === "external" &&
    input.rootId.trim() &&
    input.relativePath.trim()
  ) {
    return {
      kind: "external",
      rootId: input.rootId.trim(),
      relativePath: input.relativePath.trim(),
      size: normalizeOptionalNumber(input.size),
      mtimeMs: normalizeOptionalNumber(input.mtimeMs),
      status: input.status === "missing" ? "missing" : "available",
    };
  }

  return "managed";
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || input === null || typeof input === "string";
}

function isOptionalNumber(input: unknown): boolean {
  return input === undefined || input === null || (typeof input === "number" && Number.isFinite(input));
}

function isOptionalStringArray(input: unknown): boolean {
  return input === undefined || input === null || (Array.isArray(input) && input.every((entry) => typeof entry === "string"));
}

function normalizeOptionalStringArray(input: unknown): string[] | null {
  if (input === undefined || input === null) {
    return null;
  }

  return normalizeStringArray(input);
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

function isOptionalPromptType(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function normalizeOptionalNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : null;
}

function normalizeOptionalString(input: string | null | undefined): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function normalizeRemoteImageStatus(input: LibraryItem["remoteImageStatus"]): LibraryItem["remoteImageStatus"] {
  return input === "pending" || input === "downloaded" ? input : null;
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

async function writeDefaultSeedLibraryUnlocked(): Promise<void> {
  await ensureDefaultSeedImages();
  await writeLibraryFileUnlocked(createDefaultLibrary());
  await markDefaultSeeded();
}

async function writeInitialLibraryUnlocked(): Promise<void> {
  // 默认写入空素材库，避免演示提示词组进入开源包/正式包。
  // 仅当显式设置 PROMPT_LIBRARY_ENABLE_SEED=true 时写入内置演示种子。
  if (shouldWriteDefaultSeed()) {
    await writeDefaultSeedLibraryUnlocked();
    return;
  }

  await writeLibraryFileUnlocked(createEmptyLibrary());
  await markDefaultSeeded();
}

export function shouldWriteDefaultSeed(options?: {
  enableSeedEnv?: string | undefined;
}): boolean {
  return shouldEnableDefaultLibrarySeed(options?.enableSeedEnv);
}

async function ensureDefaultSeedImages(): Promise<void> {
  await fs.mkdir(getImagesDir(), { recursive: true });

  await Promise.all(
    getDefaultSeedImageFileNames().map(async (imageFileName) => {
      const imagePath = path.join(getImagesDir(), imageFileName);

      try {
        await fs.access(imagePath);
      } catch {
        await fs.writeFile(imagePath, createDefaultSeedImage(imageFileName));
      }
    }),
  );
}

async function hasDefaultSeedMarker(): Promise<boolean> {
  try {
    await fs.access(getDefaultSeedMarkerPath());
    return true;
  } catch {
    return false;
  }
}

async function markDefaultSeeded(): Promise<void> {
  await fs.writeFile(getDefaultSeedMarkerPath(), new Date().toISOString(), "utf8");
}

function getDefaultSeedMarkerPath(): string {
  return path.join(getLibraryDataDir(), defaultSeedMarkerFileName);
}
