import { createSharpImageFromBuffer } from "./photoshopImage";

export type ImagePaletteSample = { width: number; height: number; pixels: Uint8Array };

/** Decode and bound an image to a small RGBA sample for deterministic palette extraction. */
export async function sampleImagePaletteFromBuffer(bytes: Buffer): Promise<ImagePaletteSample> {
  const metadata = await createSharpImageFromBuffer(bytes).metadata();
  const { data, info } = await createSharpImageFromBuffer(bytes)
    .rotate()
    .resize({ width: 32, height: 32, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.channels !== 4 || data.length !== info.width * info.height * 4) {
    throw new Error("图像色卡采样数据无效。");
  }
  return {
    width: metadata.width ?? info.width,
    height: metadata.height ?? info.height,
    pixels: new Uint8Array(data),
  };
}
