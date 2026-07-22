import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../ipc/errors";
import { compressImageBufferForImport } from "./imageCompression";
import { normalizeImportImageExtension, type ImportImageExtension } from "./imageCompressionPolicy";
import { getImagePath } from "./libraryPaths";
import { scheduleImportedVideoNormalization } from "./videoImportNormalizer";

export type ImportVideoExtension =
  | ".mp4"
  | ".webm"
  | ".mov"
  | ".m4v"
  | ".ogv"
  | ".ogg"
  | ".mkv"
  | ".avi"
  | ".wmv"
  | ".flv"
  | ".3gp"
  | ".3g2"
  | ".ts"
  | ".mts"
  | ".m2ts"
  | ".mpeg"
  | ".mpg"
  | ".asf"
  | ".f4v";

export type ImportAudioExtension = ".mp3" | ".wav" | ".m4a" | ".aac" | ".flac" | ".opus" | ".oga";
export type ImportMediaExtension = ImportImageExtension | ImportVideoExtension | ImportAudioExtension;

export const supportedImportImageExtensions = [
  "png",
  "jpg",
  "jpeg",
  "jfif",
  "webp",
  "gif",
  "bmp",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "svg",
  "ico",
  "apng",
] as const;

export const supportedImportVideoExtensions = [
  "mp4",
  "webm",
  "mov",
  "m4v",
  "ogv",
  "ogg",
  "mkv",
  "avi",
  "wmv",
  "flv",
  "3gp",
  "3g2",
  "ts",
  "mts",
  "m2ts",
  "mpeg",
  "mpg",
  "asf",
  "f4v",
] as const;

export const supportedImportAudioExtensions = ["mp3", "wav", "m4a", "aac", "flac", "opus", "oga"] as const;
export const supportedImportVisualMediaExtensions = [
  ...supportedImportImageExtensions,
  ...supportedImportVideoExtensions,
] as const;
export const supportedImportMediaExtensions = [
  ...supportedImportVisualMediaExtensions,
  ...supportedImportAudioExtensions,
] as const;

const allowedImportVideoExtensions = new Set<ImportVideoExtension>(
  supportedImportVideoExtensions.map((extension) => `.${extension}` as ImportVideoExtension),
);
const allowedImportAudioExtensions = new Set<ImportAudioExtension>(
  supportedImportAudioExtensions.map((extension) => `.${extension}` as ImportAudioExtension),
);

export async function writeImportImageBuffer(
  imageId: string,
  sourceBuffer: Buffer,
  sourceExtension: string,
): Promise<string> {
  const extension = getSafeImportImageExtension(sourceExtension);
  const image = compressImageBufferForImport(sourceBuffer, extension);
  const imageFileName = `${imageId}${image.extension}`;

  await fs.writeFile(getImagePath(imageFileName), image.buffer);

  return imageFileName;
}

export async function writeImportMediaBuffer(
  imageId: string,
  sourceBuffer: Buffer,
  sourceExtension: string,
): Promise<string> {
  const extension = getSafeImportMediaExtension(sourceExtension);

  if (isImportVideoExtension(extension) || isImportAudioExtension(extension)) {
    const imageFileName = `${imageId}${extension}`;
    const mediaPath = getImagePath(imageFileName);

    await fs.writeFile(mediaPath, sourceBuffer);
    if (isImportVideoExtension(extension)) {
      scheduleImportedVideoNormalization(mediaPath);
    }

    return imageFileName;
  }

  return writeImportImageBuffer(imageId, sourceBuffer, extension);
}

export async function writeImportMediaFile(imageId: string, sourcePath: string): Promise<string> {
  const extension = getSafeImportMediaExtensionFromPath(sourcePath);

  if (!isImportVideoExtension(extension) && !isImportAudioExtension(extension)) {
    return writeImportImageBuffer(imageId, await fs.readFile(sourcePath), extension);
  }

  const imageFileName = `${imageId}${extension}`;
  const mediaPath = getImagePath(imageFileName);

  if (path.resolve(sourcePath) !== path.resolve(mediaPath)) {
    await fs.copyFile(sourcePath, mediaPath);
  }

  if (isImportVideoExtension(extension)) {
    scheduleImportedVideoNormalization(mediaPath);
  }

  return imageFileName;
}

const imageExtensionByMime: Record<string, string> = {
  "image/png": ".png",
  "image/x-png": ".png",
  "image/apng": ".apng",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/jfif": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/x-ms-bmp": ".bmp",
  "image/x-windows-bmp": ".bmp",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/tiff": ".tiff",
  "image/x-tiff": ".tiff",
  "image/svg+xml": ".svg",
  "image/svg": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "image/ico": ".ico",
};

const videoExtensionByMime: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/mpeg4": ".mp4",
  "video/x-m4v": ".m4v",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/mov": ".mov",
  "video/ogg": ".ogv",
  "application/ogg": ".ogv",
  "video/x-matroska": ".mkv",
  "video/mkv": ".mkv",
  "video/x-msvideo": ".avi",
  "video/avi": ".avi",
  "video/msvideo": ".avi",
  "video/x-ms-wmv": ".wmv",
  "video/x-ms-asf": ".asf",
  "video/x-flv": ".flv",
  "video/flv": ".flv",
  "video/3gpp": ".3gp",
  "video/3gpp2": ".3g2",
  "video/mp2t": ".ts",
  "video/MP2T": ".ts",
  "video/vnd.dlna.mpeg-tts": ".ts",
  "video/mpeg": ".mpeg",
  "video/mpg": ".mpg",
  "video/x-mpeg": ".mpeg",
  "video/x-f4v": ".f4v",
};

const audioExtensionByMime: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/ogg": ".oga",
  "audio/opus": ".opus",
};

export function getImageExtensionFromMime(mime: string): string | null {
  const normalized = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return imageExtensionByMime[normalized] ?? null;
}

export function getMediaExtensionFromMime(mime: string): string | null {
  const normalized = mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return (
    imageExtensionByMime[normalized] ??
    videoExtensionByMime[normalized] ??
    videoExtensionByMime[mime.split(";", 1)[0]?.trim() ?? ""] ??
    audioExtensionByMime[normalized] ??
    null
  );
}

export function getSafeImportImageExtensionFromPath(sourcePath: string): ImportImageExtension {
  return getSafeImportImageExtension(path.extname(sourcePath));
}

export function getSafeImportMediaExtensionFromPath(sourcePath: string): ImportMediaExtension {
  return getSafeImportMediaExtension(path.extname(sourcePath));
}

export function getSafeImportImageExtension(extension: string): ImportImageExtension {
  const normalized = normalizeImportImageExtension(extension);

  if (!normalized) {
    throw new AppError(
      "IMAGE_TYPE_UNSUPPORTED",
      "仅支持 png、jpg、jpeg、webp、gif、bmp、avif、heic、tiff、svg、ico 等常见图片格式。",
    );
  }

  return normalized;
}

export function getSafeImportMediaExtension(extension: string): ImportMediaExtension {
  const imageExtension = normalizeImportImageExtension(extension);

  if (imageExtension) {
    return imageExtension;
  }

  const videoExtension = normalizeImportVideoExtension(extension);

  if (videoExtension) {
    return videoExtension;
  }

  const audioExtension = normalizeImportAudioExtension(extension);

  if (audioExtension) {
    return audioExtension;
  }

  throw new AppError("IMAGE_TYPE_UNSUPPORTED", "仅支持常见图片、视频和音频素材格式。");
}

export function normalizeImportVideoExtension(input: string): ImportVideoExtension | null {
  const normalized = input.trim().toLowerCase();

  return allowedImportVideoExtensions.has(normalized as ImportVideoExtension)
    ? (normalized as ImportVideoExtension)
    : null;
}

export function normalizeImportAudioExtension(input: string): ImportAudioExtension | null {
  const normalized = input.trim().toLowerCase();

  return allowedImportAudioExtensions.has(normalized as ImportAudioExtension)
    ? (normalized as ImportAudioExtension)
    : null;
}

export function isImportVideoExtension(extension: ImportMediaExtension): extension is ImportVideoExtension {
  return allowedImportVideoExtensions.has(extension as ImportVideoExtension);
}

export function isImportAudioExtension(extension: ImportMediaExtension): extension is ImportAudioExtension {
  return allowedImportAudioExtensions.has(extension as ImportAudioExtension);
}

/** 远程下载时从 URL 路径识别扩展名。 */
export function getMediaExtensionFromUrlPath(sourceUrl: string): string | null {
  try {
    const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();

    if (!extension) {
      return null;
    }

    if (extension === ".jpeg" || extension === ".jpe" || extension === ".jfif") {
      return ".jpg";
    }

    if (normalizeImportImageExtension(extension)) {
      return normalizeImportImageExtension(extension);
    }

    if (normalizeImportVideoExtension(extension)) {
      return extension;
    }

    if (normalizeImportAudioExtension(extension)) {
      return extension;
    }

    return null;
  } catch {
    return null;
  }
}

export function isVideoMediaExtension(extension: string): boolean {
  return allowedImportVideoExtensions.has(extension.trim().toLowerCase() as ImportVideoExtension);
}
