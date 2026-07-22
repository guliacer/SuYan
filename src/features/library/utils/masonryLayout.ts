export function distributeItemsByTopEdge<T>(items: readonly T[], columnCount: number): T[][] {
  if (items.length === 0) {
    return [];
  }

  const safeColumnCount = Math.max(1, Math.floor(columnCount));
  const activeColumnCount = Math.min(items.length, safeColumnCount);
  const columns: T[][] = Array.from({ length: activeColumnCount }, () => []);

  items.forEach((item, index) => {
    columns[index % activeColumnCount].push(item);
  });

  return columns;
}
