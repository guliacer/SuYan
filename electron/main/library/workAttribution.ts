import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { dialog } from "electron";
import type { AuthorInfo } from "../../../src/features/account/types/account";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { attributeWork, hasWorkAuthor } from "../../../src/features/library/utils/workAttribution";
import { getAuthorInfo } from "../account/accountService";
import { cacheAccountAvatar, findCachedAccountAvatarPath, getAccountAvatarContentType } from "../account/accountAvatarCache";
import { updateLibraryFile } from "./libraryStore";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";

/** A content-addressed snapshot survives account avatar changes and logouts. */
export async function snapshotWorkAuthor(author = getAuthorInfo()): Promise<AuthorInfo | null> {
  if (!author) return null;
  const snapshot = { ...author };
  const match = /^app-account-avatar:\/\/avatar\/([a-f0-9]{64})(?:\?.*)?$/.exec(author.avatarUrl ?? "");
  if (match) {
    const file = await findCachedAccountAvatarPath(match[1]);
    if (!file) throw new AppError("WORK_AVATAR_MISSING", "账户头像缓存缺失，请先刷新账户资料再同步作品。");
    const bytes = await fs.readFile(file);
    snapshot.avatarUrl = await cacheAccountAvatar(`work:${createHash("sha256").update(bytes).digest("hex")}`, bytes, getAccountAvatarContentType(file)) ?? undefined;
    if (!snapshot.avatarUrl) throw new AppError("WORK_AVATAR_SAVE_FAILED", "作品头像保存失败，请重试。");
  }
  return snapshot;
}

export async function attributeLocalImports(items: LibraryItem[], author: AuthorInfo | null): Promise<LibraryItem[]> {
  const snapshot = await snapshotWorkAuthor(author);
  return items.map(item => snapshot && item.accountOwnerUid === snapshot.uid
    ? { ...item, authorName: snapshot.username, authorAvatarUrl: snapshot.avatarUrl ?? null }
    : attributeWork(item, snapshot));
}

export async function refreshOwnedWorkProfile(author: AuthorInfo): Promise<void> {
  const snapshot = await snapshotWorkAuthor(author);
  await updateLibraryFile(current => {
    let changed = false;
    const items = current.items.map(item => {
      if (item.accountOwnerUid !== snapshot!.uid || (item.authorAvatarUrl === (snapshot!.avatarUrl ?? null) && item.authorName === snapshot!.username)) return item;
      changed = true;
      return { ...item, authorAvatarUrl: snapshot!.avatarUrl ?? null, authorName: snapshot!.username };
    });
    return changed ? { ...current, items } : null;
  });
  for (const previous of generatedAuthors.values()) if (previous.author?.uid === author.uid) previous.author = snapshot;
}

// Generation receipts are kept only in main, bound to image content and the
// account at request start. Saving later must never use the newly logged-in user.
const generatedAuthors = new Map<string, { hash: string; author: AuthorInfo | null }>();
export async function generateWithWorkAuthor<T extends { images: Array<{ dataUrl: string; attributionId?: string }> }>(generate: () => Promise<T>): Promise<T> {
  const author = await snapshotWorkAuthor();
  const result = await generate();
  const latest = getAuthorInfo();
  let completedAuthor = author;
  if (author && latest?.uid === author.uid) {
    try { completedAuthor = await snapshotWorkAuthor(latest); }
    catch { logger.warn("library", "generation:author-refresh-failed", { code: "WORK_PROFILE_REFRESH_FAILED" }); }
  }
  for (const image of result.images) {
    image.attributionId = randomUUID();
    generatedAuthors.set(image.attributionId, { hash: createHash("sha256").update(image.dataUrl).digest("hex"), author: completedAuthor });
    if (generatedAuthors.size > 500) generatedAuthors.delete(generatedAuthors.keys().next().value!);
  }
  return result;
}
export function attributeGeneratedWork(item: LibraryItem, dataUrl: string, attributionId?: string): LibraryItem {
  const receipt = attributionId ? generatedAuthors.get(attributionId) : null;
  return attributeWork(item, receipt && receipt.hash === createHash("sha256").update(dataUrl).digest("hex") ? receipt.author : null);
}

export async function syncWorksToAccount(input: { itemIds: string[]; expectedUid: string; force?: boolean }) {
  if (!input || !Array.isArray(input.itemIds) || input.itemIds.length > 100000 || input.itemIds.some(id => typeof id !== "string")) {
    throw new AppError("WORK_SYNC_INVALID", "请选择要同步的作品。");
  }
  const assertAccount = () => {
    const user = getAuthorInfo();
    if (!user || user.uid !== input.expectedUid) throw new AppError("WORK_ACCOUNT_CHANGED", "登录账户已变化，请重新确认作品归属。");
    return user;
  };
  const author = await snapshotWorkAuthor(assertAccount());
  const ids = new Set(input.itemIds);
  if (input.force === true) {
    const result = await dialog.showMessageBox({ type: "warning", title: "再次确认作品归属",
      message: `强制将所选 ${ids.size} 张素材关联到「${author!.username}」？`,
      detail: "已有作者昵称、头像和账户归属将被替换。请确认这些作品属于你或已获作者授权。此操作不会上传图像。",
      buttons: ["取消", "确认替换归属"], defaultId: 0, cancelId: 0, noLink: true });
    if (result.response !== 1) return { canceled: true, changedCount: 0, skippedCount: 0, library: null };
  }
  let changedCount = 0;
  let skippedCount = 0;
  const library = await updateLibraryFile(current => {
    assertAccount();
    const items = current.items.map(item => {
      if (!ids.has(item.id)) return item;
      if (!input.force && hasWorkAuthor(item)) { skippedCount++; return item; }
      changedCount++;
      return { ...attributeWork(item, author, input.force === true), updatedAt: new Date().toISOString() };
    });
    return changedCount ? { ...current, items } : null;
  });
  logger.info("library", "works:attributed", { changedCount, skippedCount, force: input.force === true });
  return { canceled: false, library, changedCount, skippedCount };
}
