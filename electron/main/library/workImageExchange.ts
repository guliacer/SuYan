import { crc32 } from "node:zlib";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { cacheAccountAvatar, findCachedAccountAvatarPath, getAccountAvatarContentType } from "../account/accountAvatarCache";
import { AppError } from "../ipc/errors";

const keyword = "suyan-work";
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxMetadata = 4 * 1024 * 1024;
/** Skip image pixels with positioned reads; never load a video or large IDAT just to check authorship. */
export async function readWorkFromImageFile(filePath: string): Promise<Partial<LibraryItem> | null> {
  const file = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(8);
    if ((await file.read(header, 0, 8, 0)).bytesRead !== 8 || !header.equals(signature)) return null;
    const size = (await file.stat()).size;
    for (let offset = 8; offset + 12 <= size;) {
      if ((await file.read(header, 0, 8, offset)).bytesRead !== 8) return null;
      const length = header.readUInt32BE(0);
      if (offset + length + 12 > size) return null;
      if (header.toString("ascii", 4, 8) === "iTXt" && length <= maxMetadata + 100) {
        const chunk = Buffer.alloc(length + 12);
        if ((await file.read(chunk, 0, chunk.length, offset)).bytesRead !== chunk.length) return null;
        const result = await readWorkFromImage(Buffer.concat([signature, chunk]));
        if (result) return result;
      }
      offset += length + 12;
    }
    return null;
  } finally { await file.close(); }
}
export async function embedWorkInPng(png: Buffer, item: LibraryItem): Promise<Buffer> {
  if (!png.subarray(0, 8).equals(signature)) throw new AppError("WORK_EXPORT_INVALID", "作品导出需要有效的 PNG 图片。");
  const { id: _id, imageFileName: _image, mediaStorage: _storage, videoKeyframes: _frames, videoReferenceImages: _references, videoPosterFileName: _poster, ...metadata } = item;
  let avatar: { base64: string; contentType: string } | undefined;
  const match = /^app-account-avatar:\/\/avatar\/([a-f0-9]{64})(?:\?.*)?$/.exec(metadata.authorAvatarUrl ?? "");
  if (match) {
    const file = await findCachedAccountAvatarPath(match[1]);
    if (!file) throw new AppError("WORK_AVATAR_MISSING", "作品头像缺失，请刷新账户资料后重新导出。");
    const bytes = await fs.readFile(file);
    if (bytes.length > 2 * 1024 * 1024) throw new AppError("WORK_AVATAR_INVALID", "作品头像过大。");
    avatar = { base64: bytes.toString("base64"), contentType: getAccountAvatarContentType(file) };
    metadata.authorAvatarUrl = null;
  }
  const value = Buffer.from(JSON.stringify({ format: "suyan-image-work", version: 1, item: metadata, avatar }), "utf8");
  if (value.length > maxMetadata) throw new AppError("WORK_EXPORT_TOO_LARGE", "作品资料过大，请使用 ZIP 分享包导出。");
  const body = Buffer.concat([Buffer.from(`${keyword}\0\0\0\0\0`, "ascii"), value]);
  const chunk = Buffer.alloc(body.length + 12);
  chunk.writeUInt32BE(body.length, 0); chunk.write("iTXt", 4, "ascii"); body.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  const output: Buffer[] = [signature];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset); const end = offset + length + 12;
    if (end > png.length) break;
    const type = png.toString("ascii", offset + 4, offset + 8);
    const existing = png.toString("ascii", offset + 8, offset + 8 + keyword.length + 1);
    if (type === "IEND") { output.push(chunk, png.subarray(offset, end)); return Buffer.concat(output); }
    if (!(type === "iTXt" && existing === `${keyword}\0`)) output.push(png.subarray(offset, end));
    offset = end;
  }
  throw new AppError("WORK_EXPORT_INVALID", "图片文件不完整，无法导出。");
}

export async function readWorkFromImage(bytes: Uint8Array): Promise<Partial<LibraryItem> | null> {
  const png = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!png.subarray(0, 8).equals(signature)) return null;
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset); const end = offset + length + 12;
    if (end > png.length) return null;
    if (length <= maxMetadata + 100 && png.toString("ascii", offset + 4, offset + 8) === "iTXt" && png.toString("ascii", offset + 8, offset + 8 + keyword.length + 5) === `${keyword}\0\0\0\0\0`) {
      if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) throw new AppError("WORK_IMPORT_INVALID", "作品资料校验失败。");
      let payload;
      try { payload = JSON.parse(png.toString("utf8", offset + 8 + keyword.length + 5, end - 4)); } catch { throw new AppError("WORK_IMPORT_INVALID", "作品资料无法解析。"); }
      const item = payload?.item;
      if (payload?.format !== "suyan-image-work" || payload.version !== 1 || !item || typeof item !== "object") throw new AppError("WORK_IMPORT_INVALID", "作品资料格式无效。");
      const result: Partial<LibraryItem> = {};
      for (const key of ["title", "prompt", "negativePrompt", "generationMethod", "accountOwnerUid", "authorName", "authorUrl", "sourceUrl", "authorAvatarUrl"] as const) {
        if (typeof item[key] === "string") result[key] = item[key];
      }
      if (Array.isArray(item.tags)) result.tags = item.tags.filter((tag: unknown): tag is string => typeof tag === "string");
      for (const key of ["authorUrl", "sourceUrl"] as const) if (result[key] && !/^https?:\/\//.test(result[key]!)) result[key] = null;
      if (result.authorAvatarUrl && !result.authorAvatarUrl.startsWith("https://")) result.authorAvatarUrl = null;
      if (payload.avatar) {
        if (typeof payload.avatar.base64 !== "string" || payload.avatar.base64.length > 3 * 1024 * 1024 || typeof payload.avatar.contentType !== "string") throw new AppError("WORK_IMPORT_INVALID", "作品头像格式无效。");
        const data = Buffer.from(payload.avatar.base64, "base64");
        result.authorAvatarUrl = await cacheAccountAvatar(`work:${createHash("sha256").update(data).digest("hex")}`, data, payload.avatar.contentType);
        if (!result.authorAvatarUrl) throw new AppError("WORK_IMPORT_INVALID", "作品头像无法保存。");
      }
      return result;
    }
    offset = end;
  }
  return null;
}
