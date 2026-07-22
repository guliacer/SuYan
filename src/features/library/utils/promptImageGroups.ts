import type { LibraryItem } from "../types/library";
import { isVideoMediaFile } from "./mediaFileTypes";
import type { PromptCardData } from "./promptFilters";
import { toPromptCardData } from "./promptFilters";

export type PromptImageGroup = {
  id: string;
  primaryItem: PromptCardData;
  items: PromptCardData[];
  previewItems: PromptCardData[];
};

export function groupPromptImages(cards: PromptCardData[], likedImageIds: readonly string[]): PromptImageGroup[] {
  const likedImageIdSet = new Set(likedImageIds);
  const groupedCards = new Map<string, PromptCardData[]>();
  const groupOrder = new Map<string, number>();

  for (const card of cards) {
    const groupKey = getPromptImageGroupKey(card);
    if (!groupOrder.has(groupKey)) {
      groupOrder.set(groupKey, groupOrder.size);
    }
    const group = groupedCards.get(groupKey);

    if (group) {
      group.push(card);
    } else {
      groupedCards.set(groupKey, [card]);
    }
  }

  return Array.from(groupedCards.entries())
    .map(([groupKey, groupCards]) => {
      const items = sortPromptGroupImages(groupCards, likedImageIdSet);

      return {
        id: groupKey,
        primaryItem: items[0],
        items,
        previewItems: items.slice(0, 4),
      };
    })
    .sort((first, second) => (groupOrder.get(first.id) ?? 0) - (groupOrder.get(second.id) ?? 0));
}

export function getPromptImageGroupItems(
  currentItem: PromptCardData,
  cards: PromptCardData[],
  likedImageIds: readonly string[],
): PromptCardData[] {
  const currentGroupKey = getPromptImageGroupKey(currentItem);
  const likedImageIdSet = new Set(likedImageIds);
  const groupItems = cards.filter((card) => getPromptImageGroupKey(card) === currentGroupKey);

  return sortPromptGroupImages(groupItems, likedImageIdSet);
}

export function spreadPromptGroupImages(groups: PromptImageGroup[]): PromptCardData[] {
  const spreadItems: PromptCardData[] = [];
  const maxGroupLength = Math.max(0, ...groups.map((group) => group.items.length));

  for (let imageIndex = 0; imageIndex < maxGroupLength; imageIndex += 1) {
    for (const group of groups) {
      const item = group.items[imageIndex];

      if (item) {
        spreadItems.push(item);
      }
    }
  }

  return spreadItems;
}

export function resolvePromptGroupPatchItemIds(
  items: readonly LibraryItem[],
  itemId: string,
  patch: Partial<LibraryItem>,
): string[] {
  if (!shouldSyncPromptGroupPatch(patch)) {
    return [itemId];
  }

  const baseItem = items.find((item) => item.id === itemId);

  if (!baseItem) {
    return [itemId];
  }

  const baseGroupKey = getPromptImageGroupKey(toPromptCardData(baseItem));

  return items
    .filter((item) => getPromptImageGroupKey(toPromptCardData(item)) === baseGroupKey)
    .map((item) => item.id);
}

function sortPromptGroupImages(items: PromptCardData[], likedImageIdSet: ReadonlySet<string>): PromptCardData[] {
  return [...items].sort((first, second) => sortByPromptCardOrder(first, second, likedImageIdSet));
}

function sortByPromptCardOrder(
  first: PromptCardData,
  second: PromptCardData,
  likedImageIdSet: ReadonlySet<string>,
): number {
  const firstLikedWeight = likedImageIdSet.has(first.id) ? 1 : 0;
  const secondLikedWeight = likedImageIdSet.has(second.id) ? 1 : 0;
  const shouldPreferVideoMedia = first.promptType === "video" && second.promptType === "video";
  const firstVideoMediaWeight = shouldPreferVideoMedia && isVideoMediaFile(first.imageFileName) ? 1 : 0;
  const secondVideoMediaWeight = shouldPreferVideoMedia && isVideoMediaFile(second.imageFileName) ? 1 : 0;

  return (
    secondLikedWeight - firstLikedWeight ||
    secondVideoMediaWeight - firstVideoMediaWeight ||
    second.createdAt - first.createdAt ||
    first.title.localeCompare(second.title, "zh-CN") ||
    first.id.localeCompare(second.id)
  );
}

export function getPromptImageGroupKey(card: PromptCardData): string {
  const title = normalizeGroupText(card.title);
  const prompt = normalizeGroupText(card.prompt);
  const negativePrompt = normalizeGroupText(card.negativePrompt);
  const tags = card.tags.map(normalizeGroupText).filter(Boolean).sort().join("|");
  const category = normalizeGroupText(card.category);

  if (!title && !prompt && !negativePrompt && !tags && (!category || category === "未分类")) {
    return `blank:${card.createdAt}`;
  }

  return [title, prompt, negativePrompt, tags, category].join("\n");
}

function shouldSyncPromptGroupPatch(patch: Partial<LibraryItem>): boolean {
  return ["title", "prompt", "negativePrompt", "category", "tags", "generationMethod", "promptType"].some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
}

function normalizeGroupText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
