export function invertVisibleSelection(selectedIds: Set<string>, visibleIds: string[]): Set<string> {
  const next = new Set(selectedIds);
  for (const id of visibleIds) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}
