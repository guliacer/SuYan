import {
  PROMPT_CARD_DEFAULT_HEIGHT,
  PROMPT_CARD_DEFAULT_WIDTH,
  PROMPT_CARD_MIN_WIDTH,
  clampPromptCardHeight,
  clampPromptCardWidth,
} from "./promptCardSizing";

export type PromptMasonryItem = {
  cardHeight?: number;
  cardWidth?: number;
};

export type PromptMasonryColumn<T> = {
  height: number;
  items: T[];
  width: number;
};

const defaultMasonryGap = 12;

/**
 * Packs resizable prompt cards into independent columns so one tall card
 * cannot stretch the row height of its shorter neighbours.
 */
export function distributePromptMasonryItems<T extends PromptMasonryItem>(
  items: readonly T[],
  containerWidth: number,
  gap = defaultMasonryGap,
): PromptMasonryColumn<T>[] {
  if (items.length === 0) {
    return [];
  }

  const safeGap = normalizeGap(gap);
  const safeContainerWidth = normalizeContainerWidth(containerWidth);
  const maximumColumnCount = Math.max(
    1,
    Math.min(
      items.length,
      Math.floor((safeContainerWidth + safeGap) / (PROMPT_CARD_MIN_WIDTH + safeGap)),
    ),
  );

  for (let columnCount = maximumColumnCount; columnCount >= 1; columnCount -= 1) {
    const columns = createColumns<T>(columnCount);
    let canFit = true;

    for (const item of items) {
      const itemWidth = getPromptMasonryItemWidth(item);
      const itemHeight = getPromptMasonryItemHeight(item);
      const candidates = columns
        .map((column, index) => ({ index, nextWidth: Math.max(column.width, itemWidth) }))
        .filter(({ index, nextWidth }) =>
          getTotalColumnWidth(columns, index, nextWidth, safeGap) <= safeContainerWidth,
        )
        .sort((left, right) =>
          columns[left.index].height - columns[right.index].height || left.index - right.index,
        );

      const selected = candidates[0];
      if (!selected) {
        canFit = false;
        break;
      }

      const column = columns[selected.index];
      column.items.push(item);
      column.width = selected.nextWidth;
      column.height += (column.items.length > 1 ? safeGap : 0) + itemHeight;
    }

    if (canFit && columns.every((column) => column.items.length > 0)) {
      return columns;
    }
  }

  // A single card can be wider than the viewport. Keep one column and let the
  // card's max-width rule shrink it to the available content width.
  const column = createColumns<T>(1)[0];
  for (const item of items) {
    const itemHeight = getPromptMasonryItemHeight(item);
    column.items.push(item);
    column.width = Math.min(
      safeContainerWidth,
      Math.max(column.width, getPromptMasonryItemWidth(item)),
    );
    column.height += (column.items.length > 1 ? safeGap : 0) + itemHeight;
  }
  return [column];
}

function createColumns<T>(count: number): PromptMasonryColumn<T>[] {
  return Array.from({ length: count }, () => ({ height: 0, items: [], width: 0 }));
}

function getTotalColumnWidth<T>(
  columns: readonly PromptMasonryColumn<T>[],
  changedIndex: number,
  changedWidth: number,
  gap: number,
): number {
  const total = columns.reduce(
    (sum, column, index) => sum + (index === changedIndex ? changedWidth : column.width),
    0,
  );
  return total + gap * Math.max(0, columns.length - 1);
}

export function getPromptMasonryItemWidth(item: PromptMasonryItem): number {
  return clampPromptCardWidth(item.cardWidth ?? PROMPT_CARD_DEFAULT_WIDTH);
}

export function getPromptMasonryItemHeight(item: PromptMasonryItem): number {
  return clampPromptCardHeight(item.cardHeight ?? PROMPT_CARD_DEFAULT_HEIGHT);
}

function normalizeContainerWidth(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : PROMPT_CARD_DEFAULT_WIDTH;
}

function normalizeGap(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : defaultMasonryGap;
}
