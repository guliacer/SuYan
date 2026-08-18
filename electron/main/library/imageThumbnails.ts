import { nativeImage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { isAudioMediaFile, isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { logger } from "../appLogger";
import { getImagePath, getImageThumbnailPath, getImageThumbnailsDir } from "./libraryPaths";
import { resolveMediaAbsolutePath } from "./mediaPathResolver";
import { extractVideoFrameToPath, probeVideoDuration } from "./videoFrameExtractor";
import { waitForImportedVideoNormalization } from "./videoImportNormalizer";

const maxThumbnailSide = 640;
const thumbnailJpegQuality = 76;
const pendingThumbnails = new Map<string, Promise<string>>();
const queuedThumbnailFileNames = new Set<string>();
const backgroundThumbnailConcurrency = 3;
let activeBackgroundThumbnailCount = 0;

export async function getOrCreateImageThumbnailPath(imageFileName: string): Promise<string> {
  // An explicit request takes ownership of the queued item so the background
  // scheduler does not perform a redundant freshness check afterwards.
  queuedThumbnailFileNames.delete(imageFileName);
  const existingTask = pendingThumbnails.get(imageFileName);

  if (existingTask) {
    return existingTask;
  }

  const task = createImageThumbnailPath(imageFileName).finally(() => {
    pendingThumbnails.delete(imageFileName);
  });

  pendingThumbnails.set(imageFileName, task);

  return task;
}

export function warmImageThumbnails(imageFileNames: readonly string[], limit = 80): void {
  const uniqueImageFileNames = [...new Set(imageFileNames.filter(Boolean))].slice(0, limit);

  for (const imageFileName of uniqueImageFileNames) {
    if (!pendingThumbnails.has(imageFileName)) {
      queuedThumbnailFileNames.add(imageFileName);
    }
  }

  scheduleBackgroundThumbnailWarmup();
}

export async function prepareImageThumbnails(imageFileNames: readonly string[], limit = 200): Promise<void> {
  const uniqueImageFileNames = [...new Set(imageFileNames.filter(Boolean))].slice(0, limit);

  await runThumbnailWarmup(uniqueImageFileNames);
}

export async function getFreshImageThumbnailPath(imageFileName: string): Promise<string | null> {
  const imagePath = getImagePath(imageFileName);
  const thumbnailPath = getImageThumbnailPath(imageFileName);

  return (await isFreshThumbnail(imagePath, thumbnailPath)) ? thumbnailPath : null;
}

export async function getFreshImageThumbnailPathForItem(
  item: Pick<LibraryItem, "imageFileName" | "mediaStorage">,
): Promise<string | null> {
  const imagePath = await resolveMediaAbsolutePath(item);
  const thumbnailPath = getImageThumbnailPath(item.imageFileName);
  return (await isFreshThumbnail(imagePath, thumbnailPath)) ? thumbnailPath : null;
}

export async function getOrCreateImageThumbnailPathForItem(
  item: Pick<LibraryItem, "imageFileName" | "mediaStorage">,
): Promise<string> {
  queuedThumbnailFileNames.delete(item.imageFileName);
  const existingTask = pendingThumbnails.get(item.imageFileName);

  if (existingTask) {
    return existingTask;
  }

  const task = resolveMediaAbsolutePath(item)
    .then((imagePath) =>
      createImageThumbnailPathFromSource(item.imageFileName, imagePath, {
        normalizeVideo: !item.mediaStorage || item.mediaStorage === "managed",
      }),
    )
    .finally(() => {
      pendingThumbnails.delete(item.imageFileName);
    });
  pendingThumbnails.set(item.imageFileName, task);
  return task;
}

export function warmLibraryItemThumbnails(
  items: readonly Pick<LibraryItem, "imageFileName" | "mediaStorage">[],
  limit = 80,
): void {
  const uniqueItems = Array.from(
    new Map(items.filter((item) => item.imageFileName).map((item) => [item.imageFileName, item])).values(),
  ).slice(0, limit);
  let nextIndex = 0;

  async function warmNext(): Promise<void> {
    while (nextIndex < uniqueItems.length) {
      const item = uniqueItems[nextIndex];
      nextIndex += 1;
      await getOrCreateImageThumbnailPathForItem(item).catch((error) => {
        logger.warn("media-thumbnail", "warm:failed", {
          file: item.imageFileName,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  void Promise.all(Array.from({ length: Math.min(backgroundThumbnailConcurrency, uniqueItems.length) }, () => warmNext()));
}

async function createImageThumbnailPath(imageFileName: string): Promise<string> {
  return createImageThumbnailPathFromSource(imageFileName, getImagePath(imageFileName), { normalizeVideo: true });
}

async function createImageThumbnailPathFromSource(
  imageFileName: string,
  imagePath: string,
  options: { normalizeVideo: boolean },
): Promise<string> {
  // Audio files are already represented by their source path and never need a
  // thumbnail freshness check or thumbnail directory creation.
  if (isAudioMediaFile(imageFileName)) {
    return imagePath;
  }

  const thumbnailPath = getImageThumbnailPath(imageFileName);

  if (await isFreshThumbnail(imagePath, thumbnailPath)) {
    return thumbnailPath;
  }

  await fs.mkdir(getImageThumbnailsDir(), { recursive: true });

  if (isVideoMediaFile(imageFileName)) {
    return createVideoThumbnailPath(imagePath, thumbnailPath, options.normalizeVideo);
  }

  const sourceImage = nativeImage.createFromPath(imagePath);

  if (sourceImage.isEmpty()) {
    // nativeImage 无法解码（常见于超大图片或特殊格式），尝试用 sharp 创建缩略图。
    const sharpThumbnailPath = await createThumbnailWithSharp(imagePath, thumbnailPath);
    if (sharpThumbnailPath) {
      return sharpThumbnailPath;
    }
    return imagePath;
  }

  const size = sourceImage.getSize();
  const maxSide = Math.max(size.width, size.height);
  const scale = maxSide > 0 ? Math.min(1, maxThumbnailSide / maxSide) : 1;
  const thumbnailImage =
    scale < 1
      ? sourceImage.resize({
          height: Math.max(1, Math.round(size.height * scale)),
          quality: "good",
          width: Math.max(1, Math.round(size.width * scale)),
        })
      : sourceImage;
  const tempPath = `${thumbnailPath}.${process.pid}.tmp`;

  await fs.writeFile(tempPath, thumbnailImage.toJPEG(thumbnailJpegQuality));
  await fs.rename(tempPath, thumbnailPath);

  return thumbnailPath;
}

async function createThumbnailWithSharp(imagePath: string, thumbnailPath: string): Promise<string | null> {
  try {
    const { isSharpAvailable, getSharp } = await import("../runtime/imageRuntime");
    if (!isSharpAvailable()) {
      logger.warn("media-thumbnail", "sharp-unavailable", { file: imagePath });
      return null;
    }

    const sharp = getSharp();
    const tempPath = `${thumbnailPath}.${process.pid}.tmp`;
    const buffer = await fs.readFile(imagePath);

    await sharp(buffer)
      .resize({
        width: maxThumbnailSide,
        height: maxThumbnailSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: thumbnailJpegQuality })
      .toFile(tempPath);

    await fs.rename(tempPath, thumbnailPath);
    logger.info("media-thumbnail", "sharp-thumbnail-created", { file: imagePath });
    return thumbnailPath;
  } catch (error) {
    logger.warn("media-thumbnail", "sharp-thumbnail-failed", {
      file: imagePath,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function createVideoThumbnailPath(
  sourcePath: string,
  thumbnailPath: string,
  normalizeSource: boolean,
): Promise<string> {
  const startedAt = Date.now();
  const tempPath = `${thumbnailPath}.${process.pid}.tmp.jpg`;

  if (normalizeSource) {
    await waitForImportedVideoNormalization(sourcePath);
  }

  const durationSec = await probeVideoDuration(sourcePath).catch(() => 0);
  const seekSec = durationSec > 0 ? Math.min(1, durationSec * 0.1) : 0;

  try {
    await extractVideoFrameToPath(sourcePath, tempPath, {
      atSec: seekSec,
      maxWidth: maxThumbnailSide,
    });
  } catch {
    await extractVideoFrameToPath(sourcePath, tempPath, { atSec: 0, maxWidth: maxThumbnailSide }).catch(() => {
      throw new Error("视频缩略图生成失败。");
    });
  }

  await fs.rename(tempPath, thumbnailPath);

  logger.info("video-import", "thumbnail:done", {
    durationMs: Date.now() - startedAt,
    fileName: path.basename(sourcePath),
  });

  return thumbnailPath;
}

async function runThumbnailWarmup(imageFileNames: readonly string[]): Promise<void> {
  const concurrency = 4;
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < imageFileNames.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await getOrCreateImageThumbnailPath(imageFileNames[currentIndex]).catch(() => undefined);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, imageFileNames.length) }, () => runWorker()));
}

function scheduleBackgroundThumbnailWarmup(): void {
  while (
    activeBackgroundThumbnailCount < backgroundThumbnailConcurrency &&
    queuedThumbnailFileNames.size > 0
  ) {
    const nextImageFileName = queuedThumbnailFileNames.values().next().value;

    if (typeof nextImageFileName !== "string") {
      return;
    }

    queuedThumbnailFileNames.delete(nextImageFileName);
    activeBackgroundThumbnailCount += 1;

    void getOrCreateImageThumbnailPath(nextImageFileName)
      .catch(() => undefined)
      .finally(() => {
        activeBackgroundThumbnailCount -= 1;
        setTimeout(scheduleBackgroundThumbnailWarmup, 50);
      });
  }
}

async function isFreshThumbnail(imagePath: string, thumbnailPath: string): Promise<boolean> {
  let thumbnailStats;

  try {
    thumbnailStats = await fs.stat(thumbnailPath);
  } catch {
    // Missing thumbnails are the common first-run path; avoid stat-ing the source
    // when there is no thumbnail that could possibly be fresh.
    return false;
  }

  if (thumbnailStats.size <= 0) {
    return false;
  }

  try {
    const imageStats = await fs.stat(imagePath);
    return thumbnailStats.mtimeMs >= imageStats.mtimeMs;
  } catch {
    return false;
  }
}
