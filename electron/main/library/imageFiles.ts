import { clipboard, dialog, nativeImage, net } from "electron";
import type { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { isAudioMediaFile, isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { createImportedPromptPlaceholderImage } from "./defaultLibrarySeed";
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
import { appendLibraryItems, readLibraryFile, writeLibraryFile } from "./libraryStore";
import {
  createEmptyPromptImportDraft,
  parsePromptDraftFromImageMetadata,
  type PromptImportDraft,
} from "../../shared/promptImportParser";

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
  const items: LibraryItem[] = [];

  for (let index = 0; index < filePaths.length; index += 1) {
    if (isImportCanceled()) {
      break;
    }

    const sourcePath = filePaths[index];
    onProgress?.({
      current: index + 1,
      total,
      currentFile: path.basename(sourcePath),
    });

    items.push(await copyMediaFileToBlankLibraryItem(sourcePath, now));
  }

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
  const baseItem = library.items.find((item) => item.id === itemId);

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

  const addedItems = await Promise.all(
    sourcePaths.map((sourcePath) => copyMediaFileAsItemVariant(sourcePath, baseItem, now)),
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
  const baseItem = library.items.find((item) => item.id === itemId);

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
  const fileTimings = await Promise.all(
    result.filePaths.map(async (sourcePath) => {
      const fileStartedAt = Date.now();
      const importedFileName = await writeImportMediaFile(randomUUID(), sourcePath);
      const outputStats = await fs.stat(getImagePath(importedFileName)).catch(() => null);

      return {
        durationMs: Date.now() - fileStartedAt,
        fileName: importedFileName,
        mediaType: isVideoMediaFile(importedFileName) ? "video" : isAudioMediaFile(importedFileName) ? "audio" : "image",
        sizeBytes: outputStats?.size ?? null,
      };
    }),
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
  const baseItem = library.items.find((item) => item.id === itemId);

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
  const baseItem = library.items.find((item) => item.id === itemId);

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

function hasDraftPromptContent(draft: PromptImportDraft): boolean {
  return Boolean(draft.prompt.trim() || draft.title.trim());
}

function readImportImageBufferMetadataDraft(fileName: string, data: Uint8Array): PromptImportDraft {
  if (path.extname(fileName).toLowerCase() !== ".png") {
    return createEmptyPromptImportDraft();
  }

  try {
    return parsePromptDraftFromImageMetadata(data);
  } catch (error) {
    logger.warn("media-import", "png-metadata:buffer-read-failed", {
      file: fileName,
      message: error instanceof Error ? error.message : String(error),
    });

    return createEmptyPromptImportDraft();
  }
}

export type ImportImageBufferInput = {
  name: string;
  data: Uint8Array;
};

export async function importImageBuffers(
  images: ImportImageBufferInput[],
): Promise<{ library: Awaited<ReturnType<typeof readLibraryFile>>; importedCount: number; canceled: boolean }> {
  const validImages = images.filter((image) => image.data && image.data.byteLength > 0);

  if (validImages.length === 0) {
    return { library: await readLibraryFile(), importedCount: 0, canceled: false };
  }

  const now = new Date().toISOString();
  const drafts = validImages.map((image) => readImportImageBufferMetadataDraft(image.name, image.data));

  const sharedDraft =
    validImages.length > 1
      ? (drafts.find(hasDraftPromptContent) ?? createEmptyPromptImportDraft())
      : null;

  const items: LibraryItem[] = [];

  for (let index = 0; index < validImages.length; index += 1) {
    const image = validImages[index];
    const draft = sharedDraft ?? drafts[index];
    const id = randomUUID();
    const extension = path.extname(image.name) || ".png";

    try {
      const imageFileName = await writeImportMediaBuffer(id, Buffer.from(image.data), extension);

      items.push(buildImportedMediaItem(draft, id, imageFileName, now));
    } catch (error) {
      logger.warn("media-import", "buffer-import:write-failed", {
        file: image.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (items.length === 0) {
    return { library: await readLibraryFile(), importedCount: 0, canceled: false };
  }

  const library = await appendLibraryItems(items);
  warmImageThumbnails(items.map((item) => item.imageFileName));

  return { library, importedCount: items.length, canceled: false };
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

  const images: ImportImageBufferInput[] = [];

  for (const filePath of imagePaths) {
    try {
      const buffer = await fs.readFile(filePath);

      images.push({ name: path.basename(filePath), data: new Uint8Array(buffer) });
    } catch (error) {
      logger.warn("media-import", "clipboard-file-import:read-failed", {
        file: path.basename(filePath),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return importImageBuffers(images);
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
  const baseItem = library.items.find((item) => item.id === itemId);

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
  const image = nativeImage.createFromPath(getImagePath(imageFileName));

  if (image.isEmpty()) {
    throw new AppError("IMAGE_COPY_FAILED", "复制图片失败，请重试。");
  }

  clipboard.writeImage(image);
}

export async function exportImageToLocal(imageFileName: string): Promise<{ canceled: boolean; filePath: string | null }> {
  const sourcePath = getImagePath(imageFileName);
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
  const candidates = [
    `${item.title}\n${item.prompt}\n${item.prompt}`,
    sourceUrl ? `${item.title}\n${item.prompt}\n${sourceUrl}` : "",
  ];

  return Array.from(new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)));
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
  const library = await readLibraryFile();
  const readDoneAt = Date.now();
  const deletedItems = library.items.filter((item) => ids.has(item.id));
  const remainingItems = library.items.filter((item) => !ids.has(item.id));
  // 删除只是过滤已有合法条目，可跳过全量 normalize，减少卡顿。
  const nextLibrary = await writeLibraryFile(
    {
      ...library,
      items: remainingItems,
    },
    { skipNormalize: true },
  );
  const writeDoneAt = Date.now();

  let cleanupFileCount = 0;

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
