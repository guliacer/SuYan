import fs from "node:fs/promises";
import type { LibraryItem, VideoKeyframe } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { AppError } from "../ipc/errors";
import { prepareImageThumbnails } from "./imageThumbnails";
import { getImagePath } from "./libraryPaths";
import { readLibraryFile, writeLibraryFile } from "./libraryStore";
import { computeKeyframeTimings } from "./videoKeyframeTiming";
import { extractVideoFrameToPath, probeVideoDuration } from "./videoFrameExtractor";

export type GenerateVideoFramesResult = {
  itemId: string;
  durationSec: number | null;
  posterFileName: string | null;
  keyframes: VideoKeyframe[];
  framesGeneratedAt: string;
};

const extractTimeoutMs = 60 * 1000;

export async function generateVideoFramesForItem(itemId: string): Promise<GenerateVideoFramesResult> {
  const library = await readLibraryFile();
  const item = library.items.find((entry) => entry.id === itemId);

  if (!item) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  if (!item.imageFileName || !isVideoMediaFile(item.imageFileName)) {
    throw new AppError("VIDEO_FRAMES_UNSUPPORTED", "这条素材不是视频，无法生成关键帧。");
  }

  const sourcePath = getImagePath(item.imageFileName);

  await fs.access(sourcePath).catch(() => {
    throw new AppError("VIDEO_SOURCE_MISSING", "找不到视频源文件，无法生成关键帧。");
  });

  const durationSec = await probeVideoDuration(sourcePath);
  const generatedFileNames: string[] = [];

  const posterFileName = await extractFrame(sourcePath, buildFrameFileName(item.id, "poster"), 0).catch(() => null);

  if (posterFileName) {
    generatedFileNames.push(posterFileName);
  }

  const timings = computeKeyframeTimings(durationSec);
  const keyframes: VideoKeyframe[] = [];

  for (let index = 0; index < timings.length; index += 1) {
    const timing = timings[index];
    const keyframeFileName = await extractFrame(
      sourcePath,
      buildFrameFileName(item.id, `kf${index + 1}`),
      timing.atSec,
    ).catch(() => null);

    if (keyframeFileName) {
      generatedFileNames.push(keyframeFileName);
      keyframes.push({ ...timing, imageFileName: keyframeFileName });
    }
  }

  const framesGeneratedAt = new Date().toISOString();
  const previousFrameFileNames = collectItemFrameFileNames(item);

  const nextLibrary = await writeLibraryFile({
    ...library,
    items: library.items.map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            videoDurationSec: durationSec > 0 ? Number(durationSec.toFixed(3)) : null,
            videoPosterFileName: posterFileName,
            videoKeyframes: keyframes,
            videoFramesGeneratedAt: framesGeneratedAt,
            updatedAt: framesGeneratedAt,
          }
        : entry,
    ),
  });

  await removeStaleFrameFiles(previousFrameFileNames, generatedFileNames, nextLibrary.items);
  await prepareImageThumbnails(generatedFileNames);

  return {
    itemId: item.id,
    durationSec: durationSec > 0 ? Number(durationSec.toFixed(3)) : null,
    posterFileName,
    keyframes,
    framesGeneratedAt,
  };
}

export function collectItemFrameFileNames(item: Pick<LibraryItem, "videoPosterFileName" | "videoKeyframes">): string[] {
  const fileNames: string[] = [];

  if (item.videoPosterFileName) {
    fileNames.push(item.videoPosterFileName);
  }

  for (const keyframe of item.videoKeyframes ?? []) {
    if (keyframe.imageFileName) {
      fileNames.push(keyframe.imageFileName);
    }
  }

  return [...new Set(fileNames.filter(Boolean))];
}

function buildFrameFileName(itemId: string, suffix: string): string {
  return `${itemId}.${suffix}.jpg`;
}

async function extractFrame(sourcePath: string, outputFileName: string, atSec: number): Promise<string> {
  const outputPath = getImagePath(outputFileName);
  await extractVideoFrameToPath(sourcePath, outputPath, { atSec, timeoutMs: extractTimeoutMs });
  return outputFileName;
}

async function removeStaleFrameFiles(
  previousFileNames: readonly string[],
  keepFileNames: readonly string[],
  remainingItems: readonly LibraryItem[],
): Promise<void> {
  const keepSet = new Set(keepFileNames);
  const referencedSet = new Set<string>();

  for (const item of remainingItems) {
    for (const fileName of collectItemFrameFileNames(item)) {
      referencedSet.add(fileName);
    }
  }

  const staleFileNames = previousFileNames.filter(
    (fileName) => fileName && !keepSet.has(fileName) && !referencedSet.has(fileName),
  );

  await Promise.all(
    staleFileNames.map(async (fileName) => {
      try {
        await fs.unlink(getImagePath(fileName));
      } catch {
      }
    }),
  );
}
