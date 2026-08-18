import { clipboard, dialog, nativeImage, net } from "electron";
import type { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { isAudioMediaFile, isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import {
  buildImportedPromptPlaceholderSeed,
  createImportedPromptPlaceholderImage,
} from "./defaultLibrarySeed";
import { getDeletableImageFileNames } from "./imageDeletion";
import { prepareImageThumbnails, warmImageThumbnails } from "./imageThumbnails";
import {
  getMediaExtensionFromMime,
  supportedImportImageExtensions,
  supportedImportMediaExtensions,
  supportedImportVisualMediaExtensions,
  supportedImportVideoExtensions,
  writeImportImageBuffer,
  writeImportMediaBuffer,
  writeImportMediaFile,
} from "./importedImageWriter";
import { getImagePath, getImageThumbnailPath } from "./libraryPaths";
import {
  appendLibraryItems,
  findLibraryItemById,
  findLibraryItemByImageFileName,
  readLibraryFile,
  updateLibraryFile,
  writeLibraryFile,
} from "./libraryStore";
import { resolveMediaAbsolutePath } from "./mediaPathResolver";
import {
  createEmptyPromptImportDraft,
  mergePromptImportDrafts,
  parsePromptDraftFromImageMetadata,
  type PromptImportDraft,
} from "../../shared/promptImportParser";
import {
  planImportImageGroups,
  summarizeImportPromptGroups,
  type ImportPromptGroupSummary,
} from "./imageImportGrouping";
import { mapWithConcurrency } from "./asyncMap";
import { decodeGeneratedImageDataUrl } from "./generatedImageData";

export type ImportProgress = {
  current: number;
  total: number;
  currentFile: string;
};

let importAbortController = new AbortController();
let lastMediaImportDirectory: string | null = null;

export function cancelImport(): void {
  importAbortController.abort();
}

export function resetImportCancellation(): void {
  importAbortController = new AbortController();
}

export function isImportCanceled(): boolean {
  return importAbortController.signal.aborted;
}

export async function importImageFiles(
  onProgress?: (progress: ImportProgress) => void,
  ownerWindow?: BrowserWindow | null,
): Promise<{ library: Awaited<ReturnType<typeof readLibraryFile>>; importedCount: number; canceled: boolean }> {
  resetImportCancellation();
  const operationStartedAt = Date.now();
  const dialogPathReused = lastMediaImportDirectory !== null;

  const result = await showMediaImportDialog(ownerWindow, {
    title: "导入素材",
    properties: ["openFile", "multiSelections"],
    filters: getMediaImportDialogFilters(),
  });
  const dialogCompletedAt = Date.now();

  if (result.canceled || result.filePaths.length === 0) {
    return { library: await readLibraryFile(), importedCount: 0, canceled: false };
  }

  const now = new Date().toISOString();
  const startedAt = dialogCompletedAt;
  const filePaths = result.filePaths;
  const total = filePaths.length;
  const importedItems = await mapWithConcurrency(filePaths, 3, async (sourcePath, index) => {
    if (isImportCanceled()) {
      return null;
    }

    onProgress?.({
      current: index + 1,
      total,
      currentFile: path.basename(sourcePath),
    });

    return copyMediaFileToBlankLibraryItem(sourcePath, now);
  });
  const items = importedItems.filter((item): item is LibraryItem => item !== null);

  if (isImportCanceled()) {
    return { library: await readLibraryFile(), importedCount: 0, canceled: true };
  }

  const mediaReadyAt = Date.now();
  const library = await appendLibraryItems(items);
  warmImageThumbnails(items.map((item) => item.imageFileName));

  logger.info("media-import", "files:timing", {
    copyMs: mediaReadyAt - startedAt,
    dialogMs: startedAt - operationStartedAt,
    dialogPathReused,
    itemCount: items.length,
    storeMs: Date.now() - mediaReadyAt,
    totalMs: Date.now() - startedAt,
    videoCount: items.filter((item) => isVideoMediaFile(item.imageFileName)).length,
  });

  return { library, importedCount: items.length, canceled: false };
}

export async function importImageFilesForItem(
  itemId: string,
  ownerWindow?: BrowserWindow | null,
): Promise<{
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  importedCount: number;
  importedItemId: string | null;
  mode: "added" | "replaced" | "canceled";
}> {
  const operationStartedAt = Date.now();
  const dialogPathReused = lastMediaImportDirectory !== null;
  const result = await showMediaImportDialog(ownerWindow, {
    title: "导入素材",
    properties: ["openFile", "multiSelections"],
    filters: getMediaImportDialogFilters(),
  });
  const dialogCompletedAt = Date.now();

  if (result.canceled || result.filePaths.length === 0) {
    return { library: await readLibraryFile(), importedCount: 0, importedItemId: null, mode: "canceled" };
  }

  const startedAt = Date.now();
  const library = await readLibraryFile();
  const baseItem = await findLibraryItemById(itemId);

  if (!baseItem) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  const now = new Date().toISOString();
  const sourcePaths = [...result.filePaths];
  const shouldReplaceCurrentImage = await isGeneratedPlaceholderImage(baseItem);
  let nextItems = library.items;
  let importedItemId: string | null = null;
  let mode: "added" | "replaced" = "added";

  if (shouldReplaceCurrentImage && sourcePaths.length > 0) {
    const sourcePath = sourcePaths.shift() as string;
    const imageFileName = await writeImportMediaFile(baseItem.id, sourcePath);

    nextItems = library.items.map((item) =>
      item.id === baseItem.id
        ? {
            ...item,
            imageFileName,
            promptType: normalizePromptType(undefined, { ...item, imageFileName }),
            updatedAt: now,
          }
        : item,
    );
    await removeImageIfUnused(baseItem.imageFileName, nextItems);

    importedItemId = baseItem.id;
    mode = "replaced";
  }

  const addedItems = await mapWithConcurrency(
    sourcePaths,
    3,
    (sourcePath) => copyMediaFileAsItemVariant(sourcePath, baseItem, now),
  );
  const importedImageFileNames = [
    importedItemId ? nextItems.find((item) => item.id === importedItemId)?.imageFileName : "",
    ...addedItems.map((item) => item.imageFileName),
  ].filter((imageFileName): imageFileName is string => typeof imageFileName === "string" && imageFileName.length > 0);

  const mediaReadyAt = Date.now();
  const nextLibrary = await writeLibraryFile({
    ...library,
    items: [...addedItems, ...nextItems],
  });
  warmImageThumbnails(importedImageFileNames);

  logger.info("media-import", "files-for-item:timing", {
    copyMs: mediaReadyAt - startedAt,
    dialogMs: dialogCompletedAt - operationStartedAt,
    dialogPathReused,
    itemCount: result.filePaths.length,
    mode,
    storeMs: Date.now() - mediaReadyAt,
    totalMs: Date.now() - startedAt,
    videoCount: importedImageFileNames.filter(isVideoMediaFile).length,
  });

  return {
    library: nextLibrary,
    importedCount: result.filePaths.length,
    importedItemId: importedItemId ?? addedItems[0]?.id ?? null,
    mode,
  };
}

export async function importVideoReferenceImagesForItem(
  itemId: string,
  ownerWindow?: BrowserWindow | null,
): Promise<{
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  itemId: string;
  importedCount: number;
  referenceImages: string[];
  canceled: boolean;
}> {
  const operationStartedAt = Date.now();
  const dialogPathReused = lastMediaImportDirectory !== null;
  const result = await showMediaImportDialog(ownerWindow, {
    title: "导入素材",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "图片和视频",
        extensions: [...supportedImportMediaExtensions],
      },
    ],
  });
  const dialogCompletedAt = Date.now();
  const library = await readLibraryFile();
  const baseItem = await findLibraryItemById(itemId);

  if (!baseItem) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  if (result.canceled || result.filePaths.length === 0) {
    return {
      library,
      itemId,
      importedCount: 0,
      referenceImages: baseItem.videoReferenceImages ?? [],
      canceled: true,
    };
  }

  const startedAt = Date.now();
  const fileTimings = await mapWithConcurrency(
    result.filePaths,
    4,
    async (sourcePath) => {
      const fileStartedAt = Date.now();
      const importedFileName = await writeImportMediaFile(randomUUID(), sourcePath);
      const outputStats = await fs.stat(getImagePath(importedFileName)).catch(() => null);

      return {
        durationMs: Date.now() - fileStartedAt,
        fileName: importedFileName,
        mediaType: isVideoMediaFile(importedFileName) ? "video" : isAudioMediaFile(importedFileName) ? "audio" : "image",
        sizeBytes: outputStats?.size ?? null,
      };
    },
  );
  const importedFileNames = fileTimings.map((timing) => timing.fileName);

  const applied = await appendVideoReferenceImages(itemId, importedFileNames);

  logger.info("media-import", "video-references:timing", {
    dialogMs: dialogCompletedAt - operationStartedAt,
    dialogPathReused,
    fileTimings,
    itemCount: importedFileNames.length,
    totalMs: Date.now() - startedAt,
    audioCount: importedFileNames.filter(isAudioMediaFile).length,
    videoCount: importedFileNames.filter(isVideoMediaFile).length,
  });

  return {
    library: applied.library,
    itemId,
    importedCount: importedFileNames.length,
    referenceImages: applied.referenceImages,
    canceled: false,
  };
}

async function appendVideoReferenceImages(
  itemId: string,
  newFileNames: readonly string[],
): Promise<{ library: Awaited<ReturnType<typeof readLibraryFile>>; referenceImages: string[] }> {
  const library = await readLibraryFile();
  const baseItem = await findLibraryItemById(itemId);

  if (!baseItem) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  const now = new Date().toISOString();
  const nextReferenceImages = [...(baseItem.videoReferenceImages ?? []), ...newFileNames];
  const nextLibrary = await writeLibraryFile({
    ...library,
    items: library.items.map((item) =>
      item.id === baseItem.id
        ? { ...item, videoReferenceImages: nextReferenceImages, updatedAt: now }
        : item,
    ),
  });

  warmImageThumbnails([...newFileNames]);

  return { library: nextLibrary, referenceImages: nextReferenceImages };
}

export async function importClipboardReferenceImageForItem(itemId: string): Promise<{
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  itemId: string;
  importedCount: number;
  referenceImages: string[];
}> {
  const image = clipboard.readImage();

  if (image.isEmpty()) {
    throw new AppError("CLIPBOARD_EMPTY", "剪切板里没有可用的图片。");
  }

  const imageBuffer = readClipboardPngBuffer() ?? image.toPNG();
  const imageFileName = await writeImportImageBuffer(randomUUID(), imageBuffer, ".png");
  const applied = await appendVideoReferenceImages(itemId, [imageFileName]);

  return {
    library: applied.library,
    itemId,
    importedCount: 1,
    referenceImages: applied.referenceImages,
  };
}

export async function importReferenceImageFromUrlForItem(
  itemId: string,
  rawUrl: string,
): Promise<{
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  itemId: string;
  importedCount: number;
  referenceImages: string[];
}> {
  const trimmedUrl = rawUrl.trim();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new AppError("REFERENCE_URL_INVALID", "链接格式不正确，请输入完整的图片网址。");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AppError("REFERENCE_URL_INVALID", "仅支持 http/https 链接。");
  }

  let response: Awaited<ReturnType<typeof net.fetch>>;
  try {
    response = await net.fetch(trimmedUrl, { method: "GET" });
  } catch {
    throw new AppError("REFERENCE_URL_FETCH_FAILED", "下载失败，请检查网络或链接是否可访问。");
  }

  if (!response.ok) {
    throw new AppError("REFERENCE_URL_FETCH_FAILED", `下载失败（HTTP ${response.status}）。`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const extension =
    getMediaExtensionFromMime(contentType) ??
    (() => {
      const pathExtension = path.extname(parsedUrl.pathname).toLowerCase().replace(/^\./, "");
      return (supportedImportMediaExtensions as readonly string[]).includes(pathExtension)
        ? `.${pathExtension}`
        : null;
    })();

  if (!extension) {
    throw new AppError(
      "REFERENCE_URL_TYPE_UNSUPPORTED",
      "该链接不是受支持的素材（图片、视频或音频）。",
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength === 0) {
    throw new AppError("REFERENCE_URL_FETCH_FAILED", "下载到的素材内容为空。");
  }

  const imageFileName = await writeImportMediaBuffer(randomUUID(), buffer, extension);
  const applied = await appendVideoReferenceImages(itemId, [imageFileName]);

  return {
    library: applied.library,
    itemId,
    importedCount: 1,
    referenceImages: applied.referenceImages,
  };
}

export async function deleteVideoReferenceImageForItem(
  itemId: string,
  imageFileName: string,
): Promise<{
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  itemId: string;
  referenceImages: string[];
}> {
  const library = await readLibraryFile();
  const baseItem = await findLibraryItemById(itemId);

  if (!baseItem) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  const currentReferenceImages = baseItem.videoReferenceImages ?? [];
  const nextReferenceImages = currentReferenceImages.filter(
    (fileName) => fileName !== imageFileName,
  );

  if (nextReferenceImages.length === currentReferenceImages.length) {
    return { library, itemId, referenceImages: currentReferenceImages };
  }

  const now = new Date().toISOString();
  const nextLibrary = await writeLibraryFile({
    ...library,
    items: library.items.map((item) =>
      item.id === baseItem.id
        ? {
            ...item,
            videoReferenceImages: nextReferenceImages,
            updatedAt: now,
          }
        : item,
    ),
  });

  const stillReferenced = nextLibrary.items.some(
    (item) =>
      item.imageFileName === imageFileName ||
      (item.videoReferenceImages ?? []).includes(imageFileName) ||
      (item.videoKeyframes ?? []).some((keyframe) => keyframe.imageFileName === imageFileName),
  );

  if (!stillReferenced) {
    try {
      await fs.unlink(getImagePath(imageFileName));
    } catch {
    }
  }

  return { library: nextLibrary, itemId, referenceImages: nextReferenceImages };
}

export async function copyImageFileToLibrary(sourcePath: string): Promise<LibraryItem> {
  const id = randomUUID();
  const now = new Date().toISOString();

  return copyMediaFileToBlankLibraryItem(sourcePath, now, id);
}

async function readImportImageMetadataDraft(sourcePath: string): Promise<PromptImportDraft> {
  if (path.extname(sourcePath).toLowerCase() !== ".png") {
    return createEmptyPromptImportDraft();
  }

  try {
    const buffer = await fs.readFile(sourcePath);

    return parsePromptDraftFromImageMetadata(new Uint8Array(buffer));
  } catch (error) {
    logger.warn("media-import", "png-metadata:read-failed", {
      file: path.basename(sourcePath),
      message: error instanceof Error ? error.message : String(error),
    });

    return createEmptyPromptImportDraft();
  }
}

async function copyMediaFileToBlankLibraryItem(
  sourcePath: string,
  now: string,
  id = randomUUID(),
): Promise<LibraryItem> {
  const imageFileName = await writeImportMediaFile(id, sourcePath);

  const draft = await readImportImageMetadataDraft(sourcePath);

  return buildImportedMediaItem(draft, id, imageFileName, now);
}

function buildImportedMediaItem(
  draft: PromptImportDraft,
  id: string,
  imageFileName: string,
  now: string,
): LibraryItem {
  return {
    id,
    title: draft.title,
    imageFileName,
    prompt: draft.prompt,
    negativePrompt: draft.negativePrompt,
    category: null,
    tags: draft.tags,
    generationMethod: draft.generationMethod,
    promptType: normalizePromptType(undefined, {
      imageFileName,
      prompt: draft.prompt,
      tags: draft.tags,
      generationMethod: draft.generationMethod ?? "",
      title: draft.title,
    }),
    sourceUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

function readImportImageBufferMetadataDraft(
  fileName: string,
  data: Uint8Array,
  fallbackDraft?: PromptImportDraft,
): PromptImportDraft {
  if (path.extname(fileName).toLowerCase() !== ".png") {
    return fallbackDraft ?? createEmptyPromptImportDraft();
  }

  try {
    const parsed = parsePromptDraftFromImageMetadata(data);
    if (!fallbackDraft) return parsed;
    // 内嵌元数据优先；外置字段仅在 PNG 未嵌入该字段时补充（如 JPEG/WEBP 或压缩保存未带 prompt 的场景）。
    return mergePromptImportDrafts(parsed, fallbackDraft);
  } catch (error) {
    logger.warn("media-import", "png-metadata:buffer-read-failed", {
      file: fileName,
      message: error instanceof Error ? error.message : String(error),
    });

    return fallbackDraft ?? createEmptyPromptImportDraft();
  }
}

export type ImportImageBufferInput = {
  name: string;
  data: Uint8Array;
};

export type ImportImageBuffersResult = {
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  importedCount: number;
  importedImageCount: number;
  importedPromptCount: number;
  importGroups: ImportPromptGroupSummary[];
  canceled: boolean;
};

export type GeneratedImageImportPayload = {
  images: Array<{ dataUrl: string; revisedPrompt?: string | null }>;
  metadata: {
    title: string;
    prompt: string;
    negativePrompt: string;
    generationMethod: string;
    /**
     * 继承来源提示词组的身份字段（「传送到画布」且提示词未改动时由渲染层带上）。
     * 有值时原样写入新条目，让分组键与原组一致；缺省则按独立新组处理。
     */
    tags?: string[];
    category?: string | null;
    categoryId?: string | null;
    genreIds?: string[];
    categoryConfidence?: number | null;
    categorySource?: "system" | "user" | "ai" | null;
  };
};

export type GeneratedImageImportResult = ImportImageBuffersResult & {
  importedItemIds: string[];
};

/**
 * Import images from memory (drag-drop / clipboard paths).
 * Each image is parsed independently; identical embedded prompts are grouped
 * into the same prompt card group (shared title/prompt/negative/tags).
 */
export async function importImageBuffers(
  images: ImportImageBufferInput[],
  options?: { fallbackDraft?: PromptImportDraft },
): Promise<ImportImageBuffersResult> {
  const validImages = images.filter((image) => image.data && image.data.byteLength > 0);

  if (validImages.length === 0) {
    return {
      library: await readLibraryFile(),
      importedCount: 0,
      importedImageCount: 0,
      importedPromptCount: 0,
      importGroups: [],
      canceled: false,
    };
  }

  const fallbackDraft = options?.fallbackDraft;
  const prepared = validImages.map((image) => ({
    name: image.name,
    data: image.data,
    draft: readImportImageBufferMetadataDraft(image.name, image.data, fallbackDraft),
  }));
  const plans = planImportImageGroups(prepared);
  const baseTime = Date.now();
  const items: LibraryItem[] = [];

  for (let planIndex = 0; planIndex < plans.length; planIndex += 1) {
    const plan = plans[planIndex];
    // Same createdAt within a group so blank multi-image groups stay together in the UI.
    const groupCreatedAt = new Date(baseTime - planIndex).toISOString();

    for (const image of plan.images) {
      const id = randomUUID();
      const extension = path.extname(image.name) || ".png";

      try {
        const imageFileName = await writeImportMediaBuffer(id, Buffer.from(image.data), extension);
        items.push(buildImportedMediaItem(plan.draft, id, imageFileName, groupCreatedAt));
      } catch (error) {
        logger.warn("media-import", "buffer-import:write-failed", {
          file: image.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (items.length === 0) {
    return {
      library: await readLibraryFile(),
      importedCount: 0,
      importedImageCount: 0,
      importedPromptCount: 0,
      importGroups: [],
      canceled: false,
    };
  }

  const library = await appendLibraryItems(items);
  warmImageThumbnails(items.map((item) => item.imageFileName));
  const importGroups = summarizeImportPromptGroups(plans).filter((group) => group.imageCount > 0);

  logger.info("media-import", "buffers:grouped", {
    imageCount: items.length,
    promptGroupCount: importGroups.length,
    withPrompt: importGroups.filter((group) => group.hasPromptContent).length,
    blankGroups: importGroups.filter((group) => !group.hasPromptContent).length,
  });

  return {
    library,
    importedCount: items.length,
    importedImageCount: items.length,
    importedPromptCount: importGroups.length,
    importGroups,
    canceled: false,
  };
}

export async function importGeneratedImages(
  payload: GeneratedImageImportPayload,
): Promise<GeneratedImageImportResult> {
  const startedAt = Date.now();
  const images = payload.images.filter((image) => typeof image.dataUrl === "string" && image.dataUrl.trim());
  const metadata = {
    title: payload.metadata.title.trim(),
    prompt: payload.metadata.prompt.trim(),
    negativePrompt: payload.metadata.negativePrompt.trim(),
    generationMethod: payload.metadata.generationMethod.trim(),
  };
  // 继承来源提示词组身份：渲染层只在「传送到画布 + 提示词未改动」时带上这些字段，
  // 原样写入后新图的分组键与原组完全一致，从而追加到原组的效果图列表而非另立新组。
  const inherited = {
    tags: Array.isArray(payload.metadata.tags) ? payload.metadata.tags.map((tag) => tag.trim()).filter(Boolean) : null,
    category: typeof payload.metadata.category === "string" && payload.metadata.category.trim()
      ? payload.metadata.category.trim()
      : null,
    categoryId: typeof payload.metadata.categoryId === "string" && payload.metadata.categoryId.trim()
      ? payload.metadata.categoryId.trim()
      : null,
    genreIds: Array.isArray(payload.metadata.genreIds)
      ? payload.metadata.genreIds.map((id) => id.trim()).filter(Boolean)
      : null,
    categoryConfidence:
      typeof payload.metadata.categoryConfidence === "number" && Number.isFinite(payload.metadata.categoryConfidence)
        ? payload.metadata.categoryConfidence
        : null,
    categorySource:
      payload.metadata.categorySource === "system" ||
      payload.metadata.categorySource === "user" ||
      payload.metadata.categorySource === "ai"
        ? payload.metadata.categorySource
        : null,
  };
  const inheritsGroup = inherited.tags !== null;
  const promptHash = createHash("sha256").update(metadata.prompt).digest("hex").slice(0, 12);

  logger.info("image-generation", "library-import-start", {
    imageCount: images.length,
    promptHash,
    promptLength: metadata.prompt.length,
    inheritsGroup,
  });

  if (images.length === 0 || !metadata.prompt) {
    throw new AppError("GENERATED_IMAGE_IMPORT_INVALID", "生成图片或提示词为空，无法保存到素材库。");
  }

  const createdAt = new Date().toISOString();
  const draft: PromptImportDraft = {
    title: metadata.title || "AI 生成图片",
    prompt: metadata.prompt,
    negativePrompt: metadata.negativePrompt,
    tags: inherited.tags ?? [],
    generationMethod: metadata.generationMethod || null,
    sourceUrl: null,
    sourceImageUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
  };
  const items: LibraryItem[] = [];
  const writtenImageFileNames: string[] = [];

  try {
    for (const image of images) {
      const id = randomUUID();
      const decoded = decodeGeneratedImageDataUrl(image.dataUrl);
      const imageFileName = await writeImportImageBuffer(id, decoded.buffer, decoded.extension);
      writtenImageFileNames.push(imageFileName);
      items.push({
        ...buildImportedMediaItem(draft, id, imageFileName, createdAt),
        promptType: "image",
        // 命中血缘时补上分类身份（buildImportedMediaItem 固定 category: null），
        // 让新图与来源提示词组的分组键完全一致；分类元数据原样继承，不伪造来源。
        ...(inheritsGroup
          ? {
              category: inherited.category,
              categoryId: inherited.categoryId,
              genreIds: inherited.genreIds && inherited.genreIds.length > 0 ? inherited.genreIds : null,
              categoryConfidence: inherited.categoryConfidence,
              categorySource: inherited.categorySource,
            }
          : {}),
      });
    }

    const library = await appendLibraryItems(items);
    warmImageThumbnails(items.map((item) => item.imageFileName));
    const importGroups: ImportPromptGroupSummary[] = [
      {
        groupKey: promptHash,
        title: draft.title,
        promptPreview: draft.prompt.slice(0, 80),
        imageCount: items.length,
        hasPromptContent: true,
      },
    ];

    logger.info("image-generation", "library-import-success", {
      imageCount: images.length,
      importedCount: items.length,
      promptHash,
      durationMs: Date.now() - startedAt,
    });

    return {
      library,
      importedCount: items.length,
      importedImageCount: items.length,
      importedPromptCount: 1,
      importGroups,
      importedItemIds: items.map((item) => item.id),
      canceled: false,
    };
  } catch (error) {
    await Promise.all(
      writtenImageFileNames.map((imageFileName) => fs.rm(getImagePath(imageFileName), { force: true }).catch(() => undefined)),
    );
    logger.error("image-generation", "library-import-failed", {
      imageCount: images.length,
      writtenCount: writtenImageFileNames.length,
      promptHash,
      durationMs: Date.now() - startedAt,
      code: error instanceof AppError ? error.code : "GENERATED_IMAGE_IMPORT_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "GENERATED_IMAGE_IMPORT_FAILED",
      error instanceof Error ? `生成图片保存失败：${error.message}` : "生成图片保存失败，请重试。",
    );
  }
}

export async function importImageFilePaths(
  filePaths: string[],
): Promise<{ library: Awaited<ReturnType<typeof readLibraryFile>>; importedCount: number; canceled: boolean }> {
  const imagePaths = filePaths.filter((filePath) =>
    (supportedImportImageExtensions as readonly string[]).includes(
      path.extname(filePath).replace(/^\./, "").toLowerCase(),
    ),
  );

  if (imagePaths.length === 0) {
    return { library: await readLibraryFile(), importedCount: 0, canceled: false };
  }

  const loadedImages = await mapWithConcurrency(filePaths, 4, async (filePath): Promise<ImportImageBufferInput | null> => {
    try {
      const buffer = await fs.readFile(filePath);

      return { name: path.basename(filePath), data: new Uint8Array(buffer) };
    } catch (error) {
      logger.warn("media-import", "clipboard-file-import:read-failed", {
        file: path.basename(filePath),
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  return importImageBuffers(loadedImages.filter((image): image is ImportImageBufferInput => image !== null));
}

async function copyMediaFileAsItemVariant(
  sourcePath: string,
  baseItem: LibraryItem,
  now: string,
): Promise<LibraryItem> {
  const id = randomUUID();
  const imageFileName = await writeImportMediaFile(id, sourcePath);

  return {
    ...baseItem,
    id,
    imageFileName,
    mediaStorage: "managed",
    promptType: normalizePromptType(undefined, { ...baseItem, imageFileName }),
    createdAt: isBlankPromptItem(baseItem) ? baseItem.createdAt : now,
    updatedAt: now,
  };
}

export async function importClipboardImageForItem(
  itemId: string,
): Promise<{ library: Awaited<ReturnType<typeof readLibraryFile>>; importedItemId: string; mode: "added" | "replaced" }> {
  const image = clipboard.readImage();

  if (image.isEmpty()) {
    throw new AppError("CLIPBOARD_EMPTY", "剪切板中没有可用图片或文本。");
  }

  const library = await readLibraryFile();
  const baseItem = await findLibraryItemById(itemId);

  if (!baseItem) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  const now = new Date().toISOString();
  const shouldReplaceCurrentImage = await isGeneratedPlaceholderImage(baseItem);
  const imageBuffer = readClipboardPngBuffer() ?? image.toPNG();
  const importedItemId = shouldReplaceCurrentImage ? baseItem.id : randomUUID();
  const imageFileName = await writeImportImageBuffer(importedItemId, imageBuffer, ".png");
  await prepareImageThumbnails([imageFileName]);

  if (shouldReplaceCurrentImage) {
    const nextLibrary = await writeLibraryFile({
      ...library,
      items: library.items.map((item) =>
        item.id === baseItem.id
          ? {
              ...item,
              imageFileName,
              updatedAt: now,
            }
          : item,
      ),
    });

    await removeImageIfUnused(baseItem.imageFileName, nextLibrary.items);

    return { library: nextLibrary, importedItemId: baseItem.id, mode: "replaced" };
  }

  const nextItem: LibraryItem = {
    ...baseItem,
    id: importedItemId,
    imageFileName,
    mediaStorage: "managed",
    createdAt: now,
    updatedAt: now,
  };
  const nextLibrary = await writeLibraryFile({
    ...library,
    items: [nextItem, ...library.items],
  });

  return { library: nextLibrary, importedItemId: nextItem.id, mode: "added" };
}

export async function copyImageToClipboard(imageFileName: string): Promise<void> {
  const mediaPath = await resolveMediaPathByImageFileName(imageFileName);
  let imageBuffer: Buffer | null = null;
  let image = nativeImage.createFromPath(mediaPath);
  let decodeMode = "path";

  // 外部素材可能存在“扩展名是 jpg、实际内容是 webp”等情况。按文件内容
  // 解码可以绕开扩展名误导，路径解码仍作为 Electron 特殊格式的兜底。
  if (image.isEmpty()) {
    try {
      imageBuffer = await fs.readFile(mediaPath);
      image = nativeImage.createFromBuffer(imageBuffer);
      decodeMode = "buffer";
    } catch (error) {
      logger.warn("media-clipboard", "copy:read-failed", {
        imageFileName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (image.isEmpty()) {
    logger.warn("media-clipboard", "copy:decode-failed", {
      imageFileName,
      byteLength: imageBuffer?.byteLength ?? null,
    });
    throw new AppError("IMAGE_COPY_FAILED", "复制图片失败，请重试。");
  }

  try {
    // 统一写入 PNG，避免系统剪贴板对原始 WebP/异常扩展名的兼容问题。
    const pngImage = nativeImage.createFromBuffer(image.toPNG());
    clipboard.writeImage(pngImage.isEmpty() ? image : pngImage);
  } catch (error) {
    logger.warn("media-clipboard", "copy:write-failed", {
      imageFileName,
      decodeMode,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("IMAGE_COPY_FAILED", "复制图片失败，请重试。");
  }

  logger.info("media-clipboard", "copy:success", {
    imageFileName,
    decodeMode,
    byteLength: imageBuffer?.byteLength ?? null,
    width: image.getSize().width,
    height: image.getSize().height,
  });
}

export async function exportImageToLocal(imageFileName: string): Promise<{ canceled: boolean; filePath: string | null }> {
  const sourcePath = await resolveMediaPathByImageFileName(imageFileName);
  const extension = getExportImageExtension(imageFileName);
  const result = await dialog.showSaveDialog({
    title: "导出媒体文件",
    defaultPath: path.basename(imageFileName),
    filters: [
      {
        name: "媒体文件",
        extensions: [extension],
      },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null };
  }

  if (path.resolve(sourcePath) !== path.resolve(result.filePath)) {
    await fs.copyFile(sourcePath, result.filePath);
  }

  return { canceled: false, filePath: result.filePath };
}

function getExportImageExtension(imageFileName: string): string {
  const extension = path.extname(imageFileName).replace(/^\./, "").toLowerCase();

  return extension || "png";
}

async function resolveMediaPathByImageFileName(imageFileName: string): Promise<string> {
  const item = await findLibraryItemByImageFileName(imageFileName);
  return item ? resolveMediaAbsolutePath(item) : getImagePath(imageFileName);
}

async function isGeneratedPlaceholderImage(item: LibraryItem): Promise<boolean> {
  let currentImageBuffer: Buffer;

  try {
    currentImageBuffer = await fs.readFile(getImagePath(item.imageFileName));
  } catch {
    return false;
  }

  return getPlaceholderSeedCandidates(item).some((seedText) =>
    currentImageBuffer.equals(createImportedPromptPlaceholderImage(seedText)),
  );
}

function getPlaceholderSeedCandidates(item: LibraryItem): string[] {
  const sourceUrl = extractSourceUrl(item.prompt);
  return [
    buildImportedPromptPlaceholderSeed(item.title, item.prompt),
    sourceUrl ? `${item.title}\n${item.prompt}\n${sourceUrl}` : "",
  ].filter(Boolean);
}

function extractSourceUrl(prompt: string): string | null {
  const match = prompt.match(/(?:来源链接|来源|source)\s*[:：]\s*(https?:\/\/\S+)/i);

  return match?.[1] ?? null;
}

async function removeImageIfUnused(imageFileName: string, items: LibraryItem[]): Promise<void> {
  if (!imageFileName || items.some((item) => item.imageFileName === imageFileName)) {
    return;
  }

  try {
    await fs.unlink(getImagePath(imageFileName));
  } catch {
  }
}

export async function deleteLibraryItems(
  itemIds: string[],
  deleteImages: boolean,
): Promise<{ library: Awaited<ReturnType<typeof readLibraryFile>>; deletedCount: number }> {
  const startedAt = Date.now();
  const ids = new Set(itemIds);
  let deletedItems: LibraryItem[] = [];
  let remainingItems: LibraryItem[] = [];
  let readDoneAt = startedAt;
  // 删除与读取最新库放在同一个队列操作中，避免覆盖目录监控或并发导入的新条目。
  const nextLibrary = await updateLibraryFile((library) => {
    readDoneAt = Date.now();
    deletedItems = library.items.filter((item) => ids.has(item.id));
    remainingItems = library.items.filter((item) => !ids.has(item.id));
    return {
      ...library,
      items: remainingItems,
    };
  }, { skipNormalize: true });
  const writeDoneAt = Date.now();

  let cleanupFileCount = 0;
  const externalThumbnailFileNames = deletedItems
    .filter((item) => item.mediaStorage && item.mediaStorage !== "managed")
    .map((item) => item.imageFileName);

  if (deleteImages) {
    const deletableFileNames = getDeletableImageFileNames(deletedItems, remainingItems);
    cleanupFileCount = deletableFileNames.length;
    // 媒体清理放到写库返回之后异步执行，避免大视频/多文件删除阻塞 UI。
    void cleanupDeletedMediaFiles(deletableFileNames).then((removedCount) => {
      logger.info("item-delete", "cleanup:done", {
        deletedCount: deletedItems.length,
        requestedFileCount: deletableFileNames.length,
        removedCount,
      });
    });
  }

  // External media remains user-owned even when the user chooses "delete media". Only the app cache is removed.
  if (externalThumbnailFileNames.length > 0) {
    cleanupFileCount += externalThumbnailFileNames.length;
    void cleanupExternalThumbnailFiles(externalThumbnailFileNames);
  }

  logger.info("item-delete", "timing", {
    cleanupDeferred: deleteImages,
    cleanupFileCount,
    deletedCount: deletedItems.length,
    readMs: readDoneAt - startedAt,
    totalMs: Date.now() - startedAt,
    writeMs: writeDoneAt - readDoneAt,
  });

  return { library: nextLibrary, deletedCount: deletedItems.length };
}

async function cleanupDeletedMediaFiles(fileNames: readonly string[]): Promise<number> {
  if (fileNames.length === 0) {
    return 0;
  }

  const results = await Promise.all(
    fileNames.map(async (fileName) => {
      const removed = await Promise.all([
        unlinkQuietly(getImagePath(fileName)),
        unlinkQuietly(getImageThumbnailPath(fileName)),
      ]);

      return removed.some(Boolean);
    }),
  );

  return results.filter(Boolean).length;
}

async function cleanupExternalThumbnailFiles(fileNames: readonly string[]): Promise<void> {
  await Promise.all(fileNames.map((fileName) => unlinkQuietly(getImageThumbnailPath(fileName))));
}

async function unlinkQuietly(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

function getMediaImportDialogFilters(): Electron.FileFilter[] {
  return [
    {
      name: "素材",
      extensions: [...supportedImportVisualMediaExtensions],
    },
    {
      name: "图片",
      extensions: [...supportedImportImageExtensions],
    },
    {
      name: "视频",
      extensions: [...supportedImportVideoExtensions],
    },
  ];
}

async function showMediaImportDialog(
  ownerWindow: BrowserWindow | null | undefined,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  const dialogOptions = lastMediaImportDirectory
    ? { ...options, defaultPath: lastMediaImportDirectory }
    : options;
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (!result.canceled && result.filePaths.length > 0) {
    lastMediaImportDirectory = path.dirname(result.filePaths[0]);
  }

  return result;
}

function isBlankPromptItem(item: LibraryItem): boolean {
  return Boolean(
    !item.title.trim() &&
      !item.prompt.trim() &&
      !item.negativePrompt.trim() &&
      item.tags.length === 0 &&
      (!item.category || !item.category.trim()),
  );
}

function readClipboardPngBuffer(): Buffer | null {
  const imageFormat = clipboard
    .availableFormats()
    .find((format) => ["png", "image/png"].includes(format.toLowerCase()) || format.toLowerCase().includes("png"));

  if (!imageFormat) {
    return null;
  }

  const buffer = clipboard.readBuffer(imageFormat);

  return buffer.length > 0 ? buffer : null;
}
