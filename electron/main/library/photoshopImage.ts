import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { getSharp } from "../runtime/imageRuntime";
import { getImageThumbnailsDir } from "./libraryPaths";

export type PhotoshopComposite = { width: number; height: number; channels: 3 | 4; data: Buffer };
export function isPhotoshopImageBuffer(bytes: Buffer): boolean { return bytes.length >= 6 && bytes.toString("ascii", 0, 4) === "8BPS" && (bytes.readUInt16BE(4) === 1 || bytes.readUInt16BE(4) === 2); }

/** Read the saved merged image; source layers and original bytes remain untouched. */
export function decodePhotoshopComposite(bytes: Buffer): PhotoshopComposite {
  if (bytes.length < 40 || !isPhotoshopImageBuffer(bytes)) throw new Error("PSD 文件头不完整。");
  const version = bytes.readUInt16BE(4), channels = bytes.readUInt16BE(12), height = bytes.readUInt32BE(14), width = bytes.readUInt32BE(18), depth = bytes.readUInt16BE(22), colorMode = bytes.readUInt16BE(24);
  if (!width || !height || width * height > 100_000_000 || channels < 1 || channels > 56) throw new Error("PSD 图像尺寸或通道无效。");
  if (![8, 16, 32].includes(depth) || ![1, 2, 3, 4].includes(colorMode)) throw new Error("此 PSD 的颜色模式或位深尚不支持合成预览。");
  const bytesPerSample = depth / 8, rowBytes = width * bytesPerSample, planeBytes = rowBytes * height, totalBytes = planeBytes * channels;
  if (totalBytes > 512 * 1024 * 1024) throw new Error("PSD 合成图像数据过大。");
  let offset = 26;
  const requireBytes = (length: number) => { if (!Number.isSafeInteger(length) || length < 0 || offset + length > bytes.length) throw new Error("PSD 文件数据不完整。"); };
  const readSection = (wide = false): Buffer => {
    requireBytes(wide ? 8 : 4);
    const length = wide ? Number(bytes.readBigUInt64BE(offset)) : bytes.readUInt32BE(offset); offset += wide ? 8 : 4; requireBytes(length);
    const section = bytes.subarray(offset, offset + length); offset += length; return section;
  };
  const palette = readSection(); readSection(); readSection(version === 2);
  requireBytes(2); const compression = bytes.readUInt16BE(offset); offset += 2;
  let planar: Buffer;
  if (compression === 0) { requireBytes(totalBytes); planar = bytes.subarray(offset, offset + totalBytes); }
  else if (compression === 1) {
    const lengthBytes = version === 2 ? 4 : 2, rowCount = channels * height;
    requireBytes(rowCount * lengthBytes); const lengthsOffset = offset; offset += rowCount * lengthBytes;
    planar = Buffer.alloc(totalBytes);
    for (let row = 0; row < rowCount; row += 1) {
      const length = lengthBytes === 4 ? bytes.readUInt32BE(lengthsOffset + row * 4) : bytes.readUInt16BE(lengthsOffset + row * 2); requireBytes(length);
      const end = offset + length, destinationStart = row * rowBytes, destinationEnd = destinationStart + rowBytes;
      let destination = destinationStart;
      while (offset < end) {
        const control = bytes.readInt8(offset++);
        if (control >= 0) { const count = control + 1; if (offset + count > end || destination + count > destinationEnd) throw new Error("PSD RLE 行损坏。"); bytes.copy(planar, destination, offset, offset + count); offset += count; destination += count; }
        else if (control !== -128) { const count = 1 - control; if (offset >= end || destination + count > destinationEnd) throw new Error("PSD RLE 行损坏。"); planar.fill(bytes[offset++], destination, destination + count); destination += count; }
      }
      if (destination !== destinationEnd) throw new Error("PSD RLE 行数据缺失。");
    }
  } else if (compression === 2 || compression === 3) {
    planar = inflateSync(bytes.subarray(offset), { maxOutputLength: totalBytes });
    if (planar.length !== totalBytes) throw new Error("PSD ZIP 合成数据不完整。");
    if (compression === 3) {
      if (depth !== 8) throw new Error("此 PSD ZIP 预测位深暂不支持合成预览。");
      for (let row = 0; row < channels * height; row += 1) for (let column = 1; column < rowBytes; column += 1) { const index = row * rowBytes + column; planar[index] = (planar[index] + planar[index - 1]) & 255; }
    }
  } else throw new Error("PSD 压缩格式不支持。");
  const hasAlpha = colorMode === 3 && channels > 3 || colorMode === 1 && channels > 1;
  const outputChannels: 3 | 4 = hasAlpha ? 4 : 3;
  const result = Buffer.alloc(width * height * outputChannels);
  const sample = (channel: number, pixel: number): number => {
    const index = channel * planeBytes + pixel * bytesPerSample;
    if (depth === 8) return planar[index];
    if (depth === 16) return planar[index];
    return Math.max(0, Math.min(255, Math.round(planar.readFloatBE(index) * 255)));
  };
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    let red: number, green: number, blue: number;
    if (colorMode === 1) red = green = blue = sample(0, pixel);
    else if (colorMode === 2) { if (palette.length < 768) throw new Error("PSD 索引调色板不完整。"); const index = sample(0, pixel); red = palette[index]; green = palette[index + 256]; blue = palette[index + 512]; }
    else if (colorMode === 4) { if (channels < 4) throw new Error("PSD CMYK 通道缺失。"); const black = sample(3, pixel) / 255; red = Math.round(sample(0, pixel) * black); green = Math.round(sample(1, pixel) * black); blue = Math.round(sample(2, pixel) * black); }
    else { if (channels < 3) throw new Error("PSD RGB 通道缺失。"); red = sample(0, pixel); green = sample(1, pixel); blue = sample(2, pixel); }
    const destination = pixel * outputChannels; result[destination] = red; result[destination + 1] = green; result[destination + 2] = blue;
    if (hasAlpha) result[destination + 3] = sample(colorMode === 1 ? 1 : 3, pixel);
  }
  return { width, height, channels: outputChannels, data: result };
}

/** Detect actual contents, including a PSD/WebP with a misleading extension. */
export function createSharpImageFromBuffer(bytes: Buffer) {
  const sharp = getSharp();
  if (!isPhotoshopImageBuffer(bytes)) return sharp(bytes);
  const decoded = decodePhotoshopComposite(bytes);
  return sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: decoded.channels } });
}

const displayImageTasks = new Map<string, Promise<string>>();
export async function getDisplayableImagePath(sourcePath: string): Promise<string> {
  if (path.extname(sourcePath).toLowerCase() !== ".psd") return sourcePath;
  const existing = displayImageTasks.get(sourcePath); if (existing) return existing;
  const task = createDisplayablePhotoshopImage(sourcePath).finally(() => displayImageTasks.delete(sourcePath)); displayImageTasks.set(sourcePath, task); return task;
}
async function createDisplayablePhotoshopImage(sourcePath: string): Promise<string> {
  const stats = await fs.stat(sourcePath);
  const key = createHash("sha256").update(path.resolve(sourcePath)).update(String(stats.size)).update(String(stats.mtimeMs)).digest("hex");
  const cachePath = path.join(getImageThumbnailsDir(), "psd-preview-" + key + ".png");
  const existing = await fs.stat(cachePath).catch(() => null); if (existing && existing.size > 0) return cachePath;
  await fs.mkdir(getImageThumbnailsDir(), { recursive: true });
  const png = await createSharpImageFromBuffer(await fs.readFile(sourcePath)).png({ compressionLevel: 6, palette: false, quality: 100 }).toBuffer();
  const tempPath = cachePath + "." + process.pid + ".tmp";
  await fs.writeFile(tempPath, png); await fs.rename(tempPath, cachePath); return cachePath;
}
