export type AppOverlayBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function readCssPixelValue(propertyName: string, fallback: number): number {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallback;
  }

  const value = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(propertyName));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Returns the visible application area available to fixed overlays.
 * The title bar and the floating-window gutter are outside this area, so
 * menus and guide cards cannot be rendered underneath either one.
 */
export function getAppOverlayBounds(padding = 12): AppOverlayBounds {
  const width = typeof window === "undefined" ? 0 : window.innerWidth;
  const height = typeof window === "undefined" ? 0 : window.innerHeight;
  const gutter = Math.max(0, readCssPixelValue("--app-window-gutter", 0));
  const contentTop = Math.max(
    readCssPixelValue("--app-titlebar-height", 44) + gutter,
    readCssPixelValue("--app-window-content-top", 44 + gutter),
  );
  const horizontalPadding = gutter + padding;
  const top = contentTop + padding;
  const bottom = Math.max(top, height - gutter - padding);
  const left = Math.min(horizontalPadding, Math.max(0, width - padding));
  const right = Math.max(left, width - horizontalPadding);

  return { bottom, left, right, top };
}

export function clampOverlayPosition(value: number, size: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), Math.max(min, max - size));
}
