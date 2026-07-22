import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { getImagePath } from "../library/libraryPaths";
import { readLibraryFile, writeLibraryFile } from "../library/libraryStore";
import { getFfmpegPath } from "../runtime/videoRuntime";
import { resolveVideoEncoderPlans } from "../runtime/ffmpegEncoders";
import {
  isCompressCanceled,
  resetCompressCancellation,
  type CompressProgress,
  type CompressResult,
} from "./shared";

function logCompressEvent(event: string, details: Record<string, unknown>): Promise<void> {
  return import("../appLogger")
    .then(({ logger }) => logger.info("library", event, details))
    .catch(() => undefined);
}

export type VideoCompressOptions = {
  resolution: "original" | "1080p" | "720p" | "480p";
  crf: number;
  codec: "h264" | "h265";
  itemIds?: string[];
};

const maxVideoBytes = 500 * 1024 * 1024;
const ffmpegTimeoutMs = 10 * 60 * 1000;
const probeTimeoutMs = 30 * 1000;

export async function compressVideos(
  options: VideoCompressOptions,
  onProgress?: (progress: CompressProgress) => void,
): Promise<CompressResult> {
  resetCompressCancellation();

  const library = await readLibraryFile();
  const targetItems = selectVideoTargetItems(library.items, options.itemIds);
  const total = targetItems.length;

  let processedCount = 0;
  let totalOriginalBytes = 0;
  let totalCompressedBytes = 0;
  const failedItems: { itemId: string; reason: string }[] = [];
  const compressedItemIds = new Set<string>();

  for (let index = 0; index < targetItems.length; index += 1) {
    if (isCompressCanceled()) {
      break;
    }

    const item = targetItems[index];
    const reportProgress = (fraction: number) => {
      onProgress?.({
        current: Math.min(index + fraction, total),
        total,
        currentItem: item.imageFileName,
        savedBytes: totalOriginalBytes - totalCompressedBytes,
      });
    };

    reportProgress(0);

    try {
      const result = await compressSingleVideo(item, options, reportProgress);

      if (result) {
        totalOriginalBytes += result.originalSize;
        totalCompressedBytes += result.compressedSize;
        processedCount += 1;
        compressedItemIds.add(item.id);
      }
    } catch (error) {
      failedItems.push({ itemId: item.id, reason: toReason(error) });
    }

    reportProgress(1);
  }

  if (compressedItemIds.size > 0) {
    const compressedAt = new Date().toISOString();

    await writeLibraryFile({
      ...library,
      items: library.items.map((item) =>
        compressedItemIds.has(item.id) ? { ...item, updatedAt: compressedAt } : item,
      ),
    });
  }

  return { processedCount, totalOriginalBytes, totalCompressedBytes, failedItems };
}

export function selectVideoTargetItems(
  items: readonly LibraryItem[],
  itemIds: string[] | undefined,
): LibraryItem[] {
  if (itemIds && itemIds.length > 0) {
    const idSet = new Set(itemIds);

    return items.filter((item) => idSet.has(item.id) && isVideoMediaFile(item.imageFileName));
  }

  return items.filter((item) => item.promptType === "video" || isVideoMediaFile(item.imageFileName));
}

async function compressSingleVideo(
  item: LibraryItem,
  options: VideoCompressOptions,
  reportProgress: (fraction: number) => void,
): Promise<{ originalSize: number; compressedSize: number } | null> {
  const sourcePath = getImagePath(item.imageFileName);
  const stats = await fs.stat(sourcePath);

  if (stats.size === 0 || stats.size > maxVideoBytes) {
    return null;
  }

  const ext = path.extname(item.imageFileName).toLowerCase() || ".mp4";
  const tempPath = path.join(os.tmpdir(), `prompt-lib-${item.id}${ext}`);

  try {
    const duration = await probeVideoDuration(sourcePath);
    const plans = await resolveVideoEncoderPlans(options.codec, options.crf);

    let produced = false;

    for (let index = 0; index < plans.length; index += 1) {
      const args = buildFfmpegArgs(sourcePath, tempPath, options, plans[index].videoArgs);
      const runResult = await runFfmpegCompression(args, duration, reportProgress).then(
        () => true,
        () => false,
      );

      if (runResult) {
        produced = true;
        break;
      }

      await removeFile(tempPath);

      if (index < plans.length - 1) {
        void logCompressEvent("compress:encoder-fallback", {
          itemId: item.id,
          failedEncoder: plans[index].encoder,
        });
      }
    }

    if (!produced) {
      return null;
    }

    const tempStats = await fs.stat(tempPath).catch(() => null);

    if (!tempStats || tempStats.size === 0 || tempStats.size >= stats.size) {
      return null;
    }

    await validateVideoFile(tempPath);
    await replaceFileFromPathSafely(sourcePath, tempPath);

    return { originalSize: stats.size, compressedSize: tempStats.size };
  } finally {
    await removeFile(tempPath);
  }
}

export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  options: VideoCompressOptions,
  videoEncoderArgs?: string[],
): string[] {
  const args = ["-i", inputPath];

  if (options.resolution === "1080p") {
    args.push("-vf", "scale=-2:1080");
  } else if (options.resolution === "720p") {
    args.push("-vf", "scale=-2:720");
  } else if (options.resolution === "480p") {
    args.push("-vf", "scale=-2:480");
  }

  if (videoEncoderArgs && videoEncoderArgs.length > 0) {
    args.push(...videoEncoderArgs);
  } else {
    args.push("-c:v", options.codec === "h265" ? "libx265" : "libx264");
    args.push("-crf", String(options.crf));
    args.push("-preset", "medium");
  }

  args.push("-c:a", "aac");
  args.push("-b:a", "128k");
  args.push("-y", outputPath);

  return args;
}

async function probeVideoDuration(inputPath: string): Promise<number> {
  const result = await runFfmpeg(["-i", inputPath], probeTimeoutMs);
  const match = result.stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    return 0;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);

  return hours * 3600 + minutes * 60 + seconds;
}

async function runFfmpegCompression(
  args: string[],
  duration: number,
  reportProgress: (fraction: number) => void,
): Promise<void> {
  let lastFraction = 0;

  const result = await runFfmpeg(args, ffmpegTimeoutMs, (text) => {
    if (duration > 0) {
      const fraction = parseProgressFraction(text, duration);

      if (fraction > lastFraction) {
        lastFraction = fraction;
        reportProgress(fraction);
      }
    }
  });

  if (result.code !== 0) {
    throw new Error(`视频压缩失败，ffmpeg 退出码 ${result.code}`);
  }
}

async function validateVideoFile(inputPath: string): Promise<void> {
  const result = await runFfmpeg(["-v", "error", "-i", inputPath, "-t", "1", "-f", "null", "-"], probeTimeoutMs);

  if (result.code !== 0) {
    throw new Error("压缩后的视频文件不可读取。");
  }
}

export function parseProgressFraction(text: string, duration: number): number {
  if (duration <= 0) {
    return 0;
  }

  const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    return 0;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);
  const current = hours * 3600 + minutes * 60 + seconds;

  return Math.min(current / duration, 1);
}

type FfmpegRunResult = { code: number | null; stderr: string };

function runFfmpeg(
  args: string[],
  timeoutMs: number,
  onStderr?: (chunk: string) => void,
): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();
    if (!ffmpegPath || typeof ffmpegPath !== "string") {
      reject(new Error("ffmpeg 可执行文件不可用。"));
      return;
    }

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";
    let canceled = false;

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      onStderr?.(text);
    });

    const cancelTimer = setInterval(() => {
      if (!isCompressCanceled()) {
        return;
      }

      canceled = true;
      proc.kill("SIGKILL");
    }, 250);

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg 执行超时。"));
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      clearInterval(cancelTimer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(cancelTimer);
      if (canceled) {
        reject(new Error("已取消视频压缩。"));
        return;
      }
      resolve({ code, stderr });
    });
  });
}

async function replaceFileFromPathSafely(filePath: string, replacementPath: string): Promise<void> {
  const backupPath = `${filePath}.${Date.now()}.${process.pid}.bak`;

  await fs.rename(filePath, backupPath);

  try {
    await fs.copyFile(replacementPath, filePath);
  } catch (error) {
    await restoreBackup(backupPath, filePath);
    throw error;
  }

  await removeFile(backupPath);
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

  return "视频压缩失败";
}
