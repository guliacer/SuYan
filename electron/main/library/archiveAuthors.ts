import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { cacheAccountAvatar, findCachedAccountAvatarPath, getAccountAvatarContentType, matchAccountAvatarContentType } from "../account/accountAvatarCache";
import { AppError } from "../ipc/errors";

export async function collectAuthorAvatars(items: LibraryItem[]) {
  const entries = new Map<string, { zipPath: string; sourcePath: string }>();
  const portableItems: LibraryItem[] = [];
  for (const item of items) {
    const match = /^app-account-avatar:\/\/avatar\/([a-f0-9]{64})(?:\?.*)?$/.exec(item.authorAvatarUrl ?? "");
    if (!match) { portableItems.push(item); continue; }
    const sourcePath = await findCachedAccountAvatarPath(match[1]);
    if (!sourcePath) throw new AppError("ZIP_AUTHOR_AVATAR_MISSING", "作品头像缺失，请先刷新资料或重新同步作品后导出。");
    const zipPath = `avatars/${match[1]}${path.extname(sourcePath)}`;
    entries.set(zipPath, { zipPath, sourcePath });
    portableItems.push({ ...item, authorAvatarUrl: zipPath });
  }
  return { items: portableItems, entries: [...entries.values()] };
}

export async function restoreAuthorAvatar(url: string | null | undefined, read: (entry: string) => Promise<Buffer>): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("https://")) return url;
  if (!/^avatars\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif)$/.test(url)) return null;
  const bytes = await read(url);
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new AppError("ZIP_AVATAR_INVALID", "分享包头像过大或为空。");
  const mime = matchAccountAvatarContentType(bytes) ?? getAccountAvatarContentType(url);
  const cached = await cacheAccountAvatar(`work:${createHash("sha256").update(bytes).digest("hex")}`, bytes, mime);
  if (!cached) throw new AppError("ZIP_AVATAR_INVALID", "无法保存分享包头像。");
  return cached;
}
