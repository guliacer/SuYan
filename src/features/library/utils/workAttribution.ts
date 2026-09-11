import type { LibraryItem } from "../types/library";
import type { AuthorInfo } from "../../account/types/account";

/** Existing web attribution is protected too, even if it predates account UID support. */
export function hasWorkAuthor(item: Pick<LibraryItem, "accountOwnerUid" | "authorName" | "authorUrl" | "authorAvatarUrl" | "sourceUrl">): boolean {
  return Boolean(item.accountOwnerUid || (item.authorName && item.authorName !== "本地导入") || item.authorUrl || item.authorAvatarUrl || item.sourceUrl);
}

export function attributeWork(item: LibraryItem, author: AuthorInfo | null, force = false): LibraryItem {
  if (!author || (!force && hasWorkAuthor(item))) return item;
  return { ...item, accountOwnerUid: author.uid, authorName: author.username,
    authorAvatarUrl: author.avatarUrl ?? null, authorUrl: null };
}
