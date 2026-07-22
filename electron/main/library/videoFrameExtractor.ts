import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { AppError } from "../ipc/errors";
import { getFfmpegPath } from "../runtime/videoRuntime";

const defaultProbeTimeoutMs = 30 * 1000;
const defaultExtractTimeoutMs = 60 * 1000;
const defaultJpegQuality = 3;

export type FfmpegRunResult = { code: number | null; stderr: string };

export function runFfmpeg(args: string[], timeoutMs: number): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFfmpegPath();

    if (!ffmpegPath) {
      reject(new AppError("FFMPEG_BINARY_NOT_FOUND", "ffmpeg 可执行文件不可用。"));
      return;
    }

    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = "";

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new AppError("VIDEO_FRAME_EXTRACT_TIMEOUT", "抽取视频关键帧超时。"));
    }, timeoutMs);

    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

export async function probeVideoDuration(
  sourcePath: string,
  timeoutMs = defaultProbeTimeoutMs,
): Promise<number> {
  const result = await runFfmpeg(["-i", sourcePath], timeoutMs).catch(() => null);

  if (!result) {
    return 0;
  }

  const match = result.stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    return 0;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseFloat(match[3]);

  return hours * 3600 + minutes * 60 + seconds;
}

export type ExtractVideoFrameOptions = {
  atSec?: number;
  maxWidth?: number;
  jpegQuality?: number;
  timeoutMs?: number;
};

export async function extractVideoFrameToPath(
  sourcePath: string,
  outputPath: string,
  options: ExtractVideoFrameOptions = {},
): Promise<void> {
  const {
    atSec = 0,
    maxWidth = 640,
    jpegQuality = defaultJpegQuality,
    timeoutMs = defaultExtractTimeoutMs,
  } = options;
  const seek = Math.max(0, atSec);
  const args = [
    "-ss",
    seek.toFixed(3),
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-q:v",
    String(jpegQuality),
    "-vf",
    `scale='min(${maxWidth},iw)':-2`,
    "-y",
    outputPath,
  ];

  const result = await runFfmpeg(args, timeoutMs);

  if (result.code !== 0) {
    throw new AppError("VIDEO_FRAME_EXTRACT_FAILED", "抽取视频关键帧失败。");
  }

  const stats = await fs.stat(outputPath).catch(() => null);

  if (!stats || stats.size === 0) {
    throw new AppError("VIDEO_FRAME_EXTRACT_FAILED", "抽取视频关键帧失败。");
  }
}
