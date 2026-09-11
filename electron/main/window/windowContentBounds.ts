import type { Rectangle } from "electron";

/** Must match the rendered AppTitleBar height and the renderer safe-area token. */
export const APP_TITLE_BAR_HEIGHT = 44;

type ContentSize = {
  height: number;
  width: number;
};

/**
 * Keep native WebContentsView instances below the custom title bar. The
 * renderer normally sends exact DOM bounds, but the main process is the final
 * boundary because a native view is composited above the renderer DOM.
 */
export function constrainWindowContentBounds(contentSize: ContentSize, bounds: Rectangle): Rectangle {
  const contentWidth = Math.max(1, Math.round(contentSize.width));
  const contentHeight = Math.max(1, Math.round(contentSize.height));
  const x = clamp(Math.round(bounds.x), 0, Math.max(0, contentWidth - 1));
  const y = clamp(Math.round(bounds.y), Math.min(APP_TITLE_BAR_HEIGHT, contentHeight - 1), Math.max(0, contentHeight - 1));
  const width = Math.min(Math.max(1, Math.round(bounds.width)), contentWidth - x);
  const height = Math.min(Math.max(1, Math.round(bounds.height)), contentHeight - y);

  return { x, y, width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
