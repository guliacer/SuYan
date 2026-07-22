import { nativeImage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { isAudioMediaFile, isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { logger } from "../appLogger";
import { getImagePath, getImageThumbnailPath, getImageThumbnailsDir } from "./libraryPaths";
import { extractVideoFrameToPath, probeVideoDuration } from "./videoFrameExtractor";
import { waitForImportedVideoNormalization } from "./videoImportNormalizer";

const maxThumbnailSide = 640;
const thumbnailJpegQuality = 76;
const pendingThumbnails = new Map<string, Promise<string>>();
const queuedThumbnailFileNames = new Set<string>();
const backgroundThumbnailConcurrency = 3;
let activeBackgroundThumbnailCount = 0;

export async function getOrCreateImageThumbnailPath(imageFileName: string): Promise<string> {
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

async function createImageThumbnailPath(imageFileName: string): Promise<string> {
  const imagePath = getImagePath(imageFileName);
  const thumbnailPath = getImageThumbnailPath(imageFileName);

  if (await isFreshThumbnail(imagePath, thumbnailPath)) {
    return thumbnailPath;
  }

  await fs.mkdir(getImageThumbnailsDir(), { recursive: true });

  if (isVideoMediaFile(imageFileName)) {
    return createVideoThumbnailPath(imagePath, thumbnailPath);
  }

  if (isAudioMediaFile(imageFileName)) {
    return imagePath;
  }

  const sourceImage = nativeImage.createFromPath(imagePath);

  if (sourceImage.isEmpty()) {
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

async function createVideoThumbnailPath(sourcePath: string, thumbnailPath: string): Promise<string> {
  const startedAt = Date.now();
  const tempPath = `${thumbnailPath}.${process.pid}.tmp.jpg`;

  await waitForImportedVideoNormalization(sourcePath);

  const durationSec = await probeVideoDuration(sourcePath).catch(() => 0);
  const seekSec = durationSec > 0 ? Math.min(1, durationSec * 0.1) : 0;

  try {
    await extractVideoFrameToPath(sourcePath, tempPath, {
      atSec: seekSec,
      maxWidth: maxThumbnailSide,
    });
  } catch {
    await extractVideoFrameToPath(sourcePath, tempPath, { atSec: 0, maxWidth: maxThumbnailSide }).catch(() => {
      throw new Error("VIDEO_THUMBNAIL_FAILED");
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
  try {
    const [imageStats, thumbnailStats] = await Promise.all([fs.stat(imagePath), fs.stat(thumbnailPath)]);

    return thumbnailStats.mtimeMs >= imageStats.mtimeMs && thumbnailStats.size > 0;
  } catch {
    return false;
  }
}
