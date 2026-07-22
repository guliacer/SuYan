import type { LibraryItem } from "../types/library";
import { uniqueTags } from "./buildLibraryFile";

export type TagConfigurationDraft = {
  originalTag: string;
  label: string;
};

export type AppliedTagConfiguration = {
  items: LibraryItem[];
  tagOrder: string[];
};

export function normalizeTagOrder(tags: readonly string[]): string[] {
  return uniqueTags([...tags]);
}

export function orderTagsWithPreference(tags: readonly string[], preferredOrder: readonly string[]): string[] {
  const normalizedTags = normalizeTagOrder(tags);
  const tagSet = new Set(normalizedTags);
  const preferredTags = normalizeTagOrder(preferredOrder).filter((tag) => tagSet.has(tag));
  const remainingTags = normalizedTags.filter((tag) => !preferredTags.includes(tag));

  return [...preferredTags, ...remainingTags];
}

export function applyTagConfigurationToItems(
  items: readonly LibraryItem[],
  originalTags: readonly string[],
  drafts: readonly TagConfigurationDraft[],
  updatedAt: string,
): AppliedTagConfiguration {
  const normalizedOriginalTags = normalizeTagOrder(originalTags);
  const originalTagSet = new Set(normalizedOriginalTags);
  const replacementByOriginal = new Map<string, string>();
  const tagOrder: string[] = [];

  for (const draft of drafts) {
    const originalTag = draft.originalTag.trim();
    const label = draft.label.trim();

    if (!originalTagSet.has(originalTag) || !label) {
      continue;
    }

    replacementByOriginal.set(originalTag, label);

    if (!tagOrder.includes(label)) {
      tagOrder.push(label);
    }
  }

  return {
    items: items.map((item) => applyTagConfigurationToItem(item, originalTagSet, replacementByOriginal, updatedAt)),
    tagOrder,
  };
}

function applyTagConfigurationToItem(
  item: LibraryItem,
  originalTagSet: Set<string>,
  replacementByOriginal: Map<string, string>,
  updatedAt: string,
): LibraryItem {
  const nextTags: string[] = [];

  for (const tag of item.tags) {
    const normalizedTag = tag.trim();

    if (!originalTagSet.has(normalizedTag)) {
      nextTags.push(normalizedTag);
      continue;
    }

    const replacement = replacementByOriginal.get(normalizedTag);

    if (replacement) {
      nextTags.push(replacement);
    }
  }

  const uniqueNextTags = uniqueTags(nextTags);

  if (areTagsEqual(item.tags, uniqueNextTags)) {
    return item;
  }

  return {
    ...item,
    tags: uniqueNextTags,
    updatedAt,
  };
}

function areTagsEqual(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((tag, index) => tag === second[index]);
}
