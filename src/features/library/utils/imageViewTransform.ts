import type { ImageViewTransform } from "../types/library";

export const DEFAULT_IMAGE_VIEW_TRANSFORM: ImageViewTransform = { rotation: 0, flipHorizontal: false, flipVertical: false };
const ROTATIONS = [0, 90, 180, 270] as const;

export function normalizeImageViewTransform(input: unknown): ImageViewTransform {
  if (!isRecord(input)) return { ...DEFAULT_IMAGE_VIEW_TRANSFORM };
  return {
    rotation: ROTATIONS.includes(input.rotation as ImageViewTransform["rotation"])
      ? input.rotation as ImageViewTransform["rotation"]
      : 0,
    flipHorizontal: input.flipHorizontal === true,
    flipVertical: input.flipVertical === true,
  };
}

export function normalizeImageViewTransforms(input: unknown): Record<string, ImageViewTransform> {
  if (!isRecord(input)) return {};
  const result: Record<string, ImageViewTransform> = {};
  for (const [itemId, value] of Object.entries(input).slice(0, 50_000)) {
    if (!itemId.trim() || itemId.length > 256 || !isRecord(value)) continue;
    if (!ROTATIONS.includes(value.rotation as ImageViewTransform["rotation"]) || typeof value.flipHorizontal !== "boolean" || (value.flipVertical !== undefined && typeof value.flipVertical !== "boolean")) continue;
    const transform = normalizeImageViewTransform(value);
    if (transform.rotation !== 0 || transform.flipHorizontal || transform.flipVertical) result[itemId] = transform;
  }
  return result;
}

export function rotateImageViewTransform(transform: ImageViewTransform): ImageViewTransform {
  return { ...transform, rotation: ((transform.rotation + 90) % 360) as ImageViewTransform["rotation"] };
}

export function toggleImageViewVerticalFlip(transform: ImageViewTransform): ImageViewTransform {
  return { ...transform, flipVertical: !transform.flipVertical };
}

export function toggleImageViewHorizontalFlip(transform: ImageViewTransform): ImageViewTransform {
  return { ...transform, flipHorizontal: !transform.flipHorizontal };
}

export function getImageViewOrientedSize<T extends { width: number; height: number }>(size: T, rotation: number): T {
  return rotation === 90 || rotation === 270
    ? { ...size, width: size.height, height: size.width }
    : size;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
