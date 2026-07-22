export type ImportImageExtension =
  | ".png"
  | ".jpg"
  | ".webp"
  | ".gif"
  | ".bmp"
  | ".avif"
  | ".heic"
  | ".heif"
  | ".tif"
  | ".tiff"
  | ".svg"
  | ".ico"
  | ".apng";

export type ImageCompressionCandidate = {
  buffer: Uint8Array;
  extension: ImportImageExtension;
};

export type ImageCompressionSelection = {
  buffer: Uint8Array;
  extension: ImportImageExtension;
  wasCompressed: boolean;
};

const minimumSavingBytes = 1024;
const minimumSavingRatio = 0.98;

const allowedImportImageExtensions = new Set<ImportImageExtension>([
  ".png",
  ".jpg",
  ".webp",
  ".gif",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
  ".svg",
  ".ico",
  ".apng",
]);

export function normalizeImportImageExtension(input: string): ImportImageExtension | null {
  const normalized = input.trim().toLowerCase();

  if (normalized === ".jpeg" || normalized === ".jpe" || normalized === ".jfif") {
    return ".jpg";
  }

  return allowedImportImageExtensions.has(normalized as ImportImageExtension)
    ? (normalized as ImportImageExtension)
    : null;
}

export function selectCompressedImageCandidate(
  original: ImageCompressionCandidate,
  candidates: readonly ImageCompressionCandidate[],
): ImageCompressionSelection {
  for (const candidate of candidates) {
    if (isUsefulCompressionCandidate(original.buffer.length, candidate.buffer.length)) {
      return {
        buffer: candidate.buffer,
        extension: candidate.extension,
        wasCompressed: true,
      };
    }
  }

  return {
    buffer: original.buffer,
    extension: original.extension,
    wasCompressed: false,
  };
}

function isUsefulCompressionCandidate(originalSize: number, candidateSize: number): boolean {
  if (originalSize <= 0 || candidateSize <= 0 || candidateSize >= originalSize) {
    return false;
  }

  return originalSize - candidateSize >= minimumSavingBytes || candidateSize <= originalSize * minimumSavingRatio;
}
