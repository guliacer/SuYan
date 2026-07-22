import { nativeImage } from "electron";
import {
  normalizeImportImageExtension,
  selectCompressedImageCandidate,
  type ImageCompressionCandidate,
  type ImportImageExtension,
} from "./imageCompressionPolicy";

export type CompressedImportImage = {
  buffer: Buffer;
  extension: ImportImageExtension;
  wasCompressed: boolean;
  originalSize: number;
  outputSize: number;
};

const jpegQualityCandidates = [82, 74] as const;
const maxCompressiblePixels = 48_000_000;

const passthroughImageExtensions = new Set<ImportImageExtension>([
  ".gif",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".svg",
  ".ico",
  ".apng",
]);

export function compressImageBufferForImport(buffer: Buffer, extension: string): CompressedImportImage {
  const normalizedExtension = normalizeImportImageExtension(extension);

  if (!normalizedExtension) {
    return createOriginalImage(buffer, ".png");
  }

  // 这些格式要么带动画/矢量，要么 Electron nativeImage 解码不稳定，直接原样入库。
  if (buffer.length === 0 || passthroughImageExtensions.has(normalizedExtension)) {
    return createOriginalImage(buffer, normalizedExtension);
  }

  try {
    const image = nativeImage.createFromBuffer(buffer);

    if (image.isEmpty()) {
      return createOriginalImage(buffer, normalizedExtension);
    }

    const size = image.getSize();
    const pixelCount = size.width * size.height;

    if (size.width <= 0 || size.height <= 0 || pixelCount > maxCompressiblePixels) {
      return createOriginalImage(buffer, normalizedExtension);
    }

    const candidates: ImageCompressionCandidate[] = [];

    if (normalizedExtension !== ".jpg") {
      candidates.push({ buffer: image.toPNG(), extension: ".png" });
    }

    if (!hasTransparentPixels(image)) {
      for (const quality of jpegQualityCandidates) {
        candidates.push({ buffer: image.toJPEG(quality), extension: ".jpg" });
      }
    }

    const selected = selectCompressedImageCandidate(
      { buffer, extension: normalizedExtension },
      candidates,
    );

    return {
      buffer: Buffer.from(selected.buffer),
      extension: selected.extension,
      wasCompressed: selected.wasCompressed,
      originalSize: buffer.length,
      outputSize: selected.buffer.length,
    };
  } catch {
    return createOriginalImage(buffer, normalizedExtension);
  }
}

function hasTransparentPixels(image: ReturnType<typeof nativeImage.createFromBuffer>): boolean {
  const bitmap = image.toBitmap();

  for (let index = 3; index < bitmap.length; index += 4) {
    if (bitmap[index] !== 255) {
      return true;
    }
  }

  return false;
}

function createOriginalImage(buffer: Buffer, extension: ImportImageExtension): CompressedImportImage {
  return {
    buffer,
    extension,
    wasCompressed: false,
    originalSize: buffer.length,
    outputSize: buffer.length,
  };
}
