const masonryColumnGapWeight = 0.08;

export function distributeItemsByTopEdge<T>(
  items: readonly T[],
  columnCount: number,
  estimateHeight: (item: T) => number = () => 1,
): T[][] {
  if (items.length === 0) {
    return [];
  }

  const safeColumnCount = Math.max(1, Math.floor(columnCount));
  const activeColumnCount = Math.min(items.length, safeColumnCount);
  const columns: T[][] = Array.from({ length: activeColumnCount }, () => []);
  const columnHeights = Array.from({ length: activeColumnCount }, () => 0);

  items.forEach((item, index) => {
    // The first row always follows the source order from left to right. After
    // that, place each tile in the shortest column to keep the waterfall even.
    const columnIndex = index < activeColumnCount ? index : findShortestColumnIndex(columnHeights);
    const estimatedHeight = normalizeEstimatedHeight(estimateHeight(item));

    if (columns[columnIndex].length > 0) {
      columnHeights[columnIndex] += masonryColumnGapWeight;
    }

    columns[columnIndex].push(item);
    columnHeights[columnIndex] += estimatedHeight;
  });

  return columns;
}

function findShortestColumnIndex(columnHeights: readonly number[]): number {
  let shortestIndex = 0;

  for (let index = 1; index < columnHeights.length; index += 1) {
    if (columnHeights[index] < columnHeights[shortestIndex]) {
      shortestIndex = index;
    }
  }

  return shortestIndex;
}

function normalizeEstimatedHeight(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
