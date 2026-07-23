import path from "node:path";
import fs from "node:fs/promises";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { getImagePath, getImageThumbnailPath } from "../library/libraryPaths";
import { readLibraryFile, writeLibraryFile } from "../library/libraryStore";
import { getSharp, type Sharp, type SharpPipeline } from "../runtime/imageRuntime";
import {
  cancelCompress,
  isCompressCanceled,
  resetCompressCancellation,
  type CompressProgress,
  type CompressResult,
} from "./shared";

export { cancelCompress, type CompressProgress, type CompressResult };

export type ImageCompressOptions = {
  quality: number;
  format: "keep" | "webp";
  itemIds?: string[];
};

const maxImageBytes = 50 * 1024 * 1024;

type SingleImageResult = {
  originalSize: number;
  compressedSize: number;
  newImageFileName: string | null;
};

export async function compressImages(
  options: ImageCompressOptions,
  onProgress?: (progress: CompressProgress) => void,
): Promise<CompressResult> {
  resetCompressCancellation();

  const library = await readLibraryFile();
  const targetItems = selectTargetItems(library.items, options.itemIds);
  const total = targetItems.length;

  let processedCount = 0;
  let totalOriginalBytes = 0;
  let totalCompressedBytes = 0;
  const failedItems: { itemId: string; reason: string }[] = [];
  const compressedItemIds = new Set<string>();
  const renamedItems = new Map<string, string>();

  for (let index = 0; index < targetItems.length; index += 1) {
    if (isCompressCanceled()) {
      break;
    }

    const item = targetItems[index];

    try {
      const result = await compressSingleImage(item, options);

      if (result) {
        totalOriginalBytes += result.originalSize;
        totalCompressedBytes += result.compressedSize;
        processedCount += 1;
        compressedItemIds.add(item.id);

        if (result.newImageFileName) {
          renamedItems.set(item.id, result.newImageFileName);
        }
      }
    } catch (error) {
      failedItems.push({ itemId: item.id, reason: toReason(error) });
    }

    onProgress?.({
      current: index + 1,
      total,
      currentItem: renamedItems.get(item.id) ?? item.imageFileName,
      savedBytes: totalOriginalBytes - totalCompressedBytes,
    });
  }

  if (compressedItemIds.size > 0) {
    const compressedAt = new Date().toISOString();

    await writeLibraryFile({
      ...library,
      items: library.items.map((item) => {
        const newFileName = renamedItems.get(item.id);

        return compressedItemIds.has(item.id)
          ? { ...item, imageFileName: newFileName ?? item.imageFileName, updatedAt: compressedAt }
          : item;
      }),
    });
  }

  return { processedCount, totalOriginalBytes, totalCompressedBytes, failedItems };
}

export function selectTargetItems(
  items: readonly LibraryItem[],
  itemIds: string[] | undefined,
): LibraryItem[] {
  if (itemIds && itemIds.length > 0) {
    const idSet = new Set(itemIds);

    return items.filter(
      (item) => idSet.has(item.id) && isManagedMedia(item) && !isVideoMediaFile(item.imageFileName),
    );
  }

  return items.filter((item) => isManagedMedia(item) && !isVideoMediaFile(item.imageFileName));
}

function isManagedMedia(item: LibraryItem): boolean {
  return !item.mediaStorage || item.mediaStorage === "managed";
}

async function compressSingleImage(
  item: LibraryItem,
  options: ImageCompressOptions,
): Promise<SingleImageResult | null> {
  const sourcePath = getImagePath(item.imageFileName);
  const buffer = await fs.readFile(sourcePath);

  if (buffer.length === 0 || buffer.length > maxImageBytes) {
    return null;
  }

  const ext = path.extname(item.imageFileName).toLowerCase();
  const output = await compressBuffer(buffer, ext, options);

  if (!output || output.length >= buffer.length) {
    return null;
  }

  await validateCompressedImage(output);

  const newExt = options.format === "webp" ? ".webp" : ext;
  const baseName = item.imageFileName.slice(0, item.imageFileName.length - ext.length);
  const newImageFileName = newExt !== ext ? `${baseName}${newExt}` : null;

  if (newImageFileName) {
    await replaceWithRenamedFile(getImagePath(item.imageFileName), getImagePath(newImageFileName), output);
  } else {
    await replaceFileSafely(getImagePath(item.imageFileName), output);
  }

  await removeFile(getImageThumbnailPath(item.imageFileName));
  if (newImageFileName) {
    await removeFile(getImageThumbnailPath(newImageFileName));
  }

  return {
    originalSize: buffer.length,
    compressedSize: output.length,
    newImageFileName,
  };
}

async function compressBuffer(
  buffer: Buffer,
  ext: string,
  options: ImageCompressOptions,
): Promise<Buffer | null> {
  const { quality, format } = options;

  const sharp = getSharp();

  if (format === "webp") {
    return sharp(buffer).webp({ quality }).toBuffer();
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return sharp(buffer).jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (ext === ".png") {
    return sharp(buffer).png({ compressionLevel: 9, palette: true, quality }).toBuffer();
  }

  return null;
}

async function validateCompressedImage(buffer: Buffer): Promise<void> {
  await getSharp()(buffer).metadata();
}

async function replaceFileSafely(filePath: string, content: Buffer): Promise<void> {
  const { backupPath, tempPath } = buildReplacementPaths(filePath);

  await fs.writeFile(tempPath, content);

  try {
    await fs.rename(filePath, backupPath);
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await restoreBackup(backupPath, filePath);
      throw error;
    }
  } catch (error) {
    await removeFile(tempPath);
    throw error;
  }

  await removeFile(backupPath);
}

async function replaceWithRenamedFile(sourcePath: string, targetPath: string, content: Buffer): Promise<void> {
  const { backupPath } = buildReplacementPaths(sourcePath);
  const tempTargetPath = `${targetPath}.${Date.now()}.${process.pid}.tmp`;

  await fs.writeFile(tempTargetPath, content);

  try {
    await fs.rename(sourcePath, backupPath);
    try {
      await removeFile(targetPath);
      await fs.rename(tempTargetPath, targetPath);
    } catch (error) {
      await restoreBackup(backupPath, sourcePath);
      throw error;
    }
  } catch (error) {
    await removeFile(tempTargetPath);
    throw error;
  }

  await removeFile(backupPath);
}

function buildReplacementPaths(filePath: string): { backupPath: string; tempPath: string } {
  const suffix = `${Date.now()}.${process.pid}`;

  return {
    backupPath: `${filePath}.${suffix}.bak`,
    tempPath: `${filePath}.${suffix}.tmp`,
  };
}

async function restoreBackup(backupPath: string, filePath: string): Promise<void> {
  await removeFile(filePath);
  await fs.rename(backupPath, filePath);
}

async function removeFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
  }
}

function toReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "压缩失败";
}
