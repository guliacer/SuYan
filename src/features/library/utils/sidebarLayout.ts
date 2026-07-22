export const minSidebarWidth = 72;
export const compactSidebarBreakpoint = 112;
export const fittedSidebarWidth = 168;
export const defaultSidebarWidth = fittedSidebarWidth;
export const maxSidebarWidth = 280;
const legacyWideSidebarWidth = 240;

export function clampSidebarWidth(width: number): number {
  const safeWidth = Number.isFinite(width) ? width : defaultSidebarWidth;

  return Math.min(maxSidebarWidth, Math.max(minSidebarWidth, Math.round(safeWidth)));
}

export function normalizeSidebarWidth(width: number): number {
  const clampedWidth = clampSidebarWidth(width);

  if (clampedWidth <= compactSidebarBreakpoint) {
    return minSidebarWidth;
  }

  if (clampedWidth === legacyWideSidebarWidth) {
    return fittedSidebarWidth;
  }

  return clampedWidth;
}

export function resizeSidebarWidthBy(width: number, delta: number): number {
  const currentWidth = normalizeSidebarWidth(width);

  if (currentWidth === minSidebarWidth && delta > 0) {
    return compactSidebarBreakpoint + 1;
  }

  return normalizeSidebarWidth(currentWidth + delta);
}
