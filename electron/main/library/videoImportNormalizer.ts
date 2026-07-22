import fs from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "./videoFrameExtractor";
import { resolveVideoEncoderPlans } from "../runtime/ffmpegEncoders";
import { getVideoNormalizationPlan, type VideoCodecInfo } from "./videoImportPolicy";

const probeTimeoutMs = 30 * 1000;
const transcodeTimeoutMs = 10 * 60 * 1000;
const pendingVideoNormalizations = new Map<string, Promise<void>>();
const checkedVideoPaths = new Set<string>();
let videoNormalizationQueue: Promise<void> = Promise.resolve();

async function probeVideoCodecs(sourcePath: string): Promise<VideoCodecInfo | null> {
  const result = await runFfmpeg(["-i", sourcePath], probeTimeoutMs).catch(() => null);

  if (!result) {
    return null;
  }

  const videoMatch = result.stderr.match(/Stream #\d+:\d+.*: Video:\s*([a-z0-9]+)/i);
  const audioMatch = result.stderr.match(/Stream #\d+:\d+.*: Audio:\s*([a-z0-9]+)/i);

  return {
    videoCodec: videoMatch ? videoMatch[1].toLowerCase() : null,
    audioCodec: audioMatch ? audioMatch[1].toLowerCase() : null,
    hasAudio: Boolean(audioMatch),
  };
}

export function scheduleImportedVideoNormalization(imagePath: string): void {
  const normalizedPath = path.resolve(imagePath);

  checkedVideoPaths.delete(normalizedPath);
  void ensureImportedVideoNormalized(normalizedPath).catch((error) => {
    logVideoImport("warn", "normalization:background-failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      fileName: path.basename(normalizedPath),
    });
  });
}

export async function waitForImportedVideoNormalization(imagePath: string): Promise<void> {
  await ensureImportedVideoNormalized(path.resolve(imagePath));
}

function ensureImportedVideoNormalized(imagePath: string): Promise<void> {
  if (checkedVideoPaths.has(imagePath)) {
    return Promise.resolve();
  }

  const pending = pendingVideoNormalizations.get(imagePath);

  if (pending) {
    return pending;
  }

  const task = videoNormalizationQueue
    .catch(() => undefined)
    .then(() => normalizeImportedVideoIfNeeded(imagePath))
    .finally(() => {
      checkedVideoPaths.add(imagePath);
      pendingVideoNormalizations.delete(imagePath);
    });

  pendingVideoNormalizations.set(imagePath, task);
  videoNormalizationQueue = task.catch(() => undefined);

  return task;
}

export async function normalizeImportedVideoIfNeeded(imagePath: string): Promise<void> {
  const startedAt = Date.now();
  const fileName = path.basename(imagePath);
  const info = await probeVideoCodecs(imagePath);

  if (!info || !info.videoCodec) {
    logVideoImport("warn", "normalization:probe-failed", {
      durationMs: Date.now() - startedAt,
      fileName,
    });
    return;
  }

  const { needsAudioTranscode, needsVideoTranscode } = getVideoNormalizationPlan(info);

  if (!needsVideoTranscode && !needsAudioTranscode) {
    logVideoImport("info", "normalization:skipped", {
      audioCodec: info.audioCodec,
      durationMs: Date.now() - startedAt,
      fileName,
      videoCodec: info.videoCodec,
    });
    return;
  }

  logVideoImport("info", "normalization:transcode-start", {
    audioCodec: info.audioCodec,
    fileName,
    needsAudioTranscode,
    needsVideoTranscode,
    videoCodec: info.videoCodec,
  });

  const extension = path.extname(imagePath) || ".mp4";
  const tempPath = `${imagePath}.${process.pid}.transcode${extension}`;

  const buildArgs = (videoEncoderArgs: string[]): string[] => {
    const args = ["-i", imagePath, "-map", "0:v:0", "-map", "0:a?", ...videoEncoderArgs];

    if (info.hasAudio) {
      args.push("-c:a", needsAudioTranscode ? "aac" : "copy");
      if (needsAudioTranscode) {
        args.push("-b:a", "128k");
      }
    }

    args.push("-movflags", "+faststart", "-y", tempPath);
    return args;
  };

  let videoEncoderArgVariants: string[][];

  if (needsVideoTranscode) {
    const plans = await resolveVideoEncoderPlans("h264", 23);
    videoEncoderArgVariants = plans.map((plan) => [...plan.videoArgs, "-pix_fmt", "yuv420p"]);
  } else {
    videoEncoderArgVariants = [["-c:v", "copy"]];
  }

  let result: { code: number | null; stderr: string } | null = null;

  for (let index = 0; index < videoEncoderArgVariants.length; index += 1) {
    result = await runFfmpeg(buildArgs(videoEncoderArgVariants[index]), transcodeTimeoutMs).catch(() => null);

    if (result && result.code === 0) {
      break;
    }

    await fs.unlink(tempPath).catch(() => undefined);

    if (index < videoEncoderArgVariants.length - 1) {
      logVideoImport("warn", "normalization:encoder-fallback", {
        fileName,
        failedVariant: index,
      });
    }
  }

  if (!result || result.code !== 0) {
    logVideoImport("warn", "normalization:transcode-failed", {
      durationMs: Date.now() - startedAt,
      fileName,
    });
    return;
  }

  const tempStats = await fs.stat(tempPath).catch(() => null);

  if (!tempStats || tempStats.size === 0) {
    await fs.unlink(tempPath).catch(() => undefined);
    logVideoImport("warn", "normalization:transcode-empty", {
      durationMs: Date.now() - startedAt,
      fileName,
    });
    return;
  }

  await fs.rename(tempPath, imagePath).catch(async () => {
    await fs.copyFile(tempPath, imagePath);
    await fs.unlink(tempPath).catch(() => undefined);
  });

  logVideoImport("info", "normalization:transcode-done", {
    durationMs: Date.now() - startedAt,
    fileName,
    outputSizeBytes: tempStats.size,
  });
}

function logVideoImport(
  level: "info" | "warn",
  event: string,
  details: Record<string, unknown>,
): void {
  void import("../appLogger")
    .then(({ logger }) => logger[level]("video-import", event, details))
    .catch(() => undefined);
}
