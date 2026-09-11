import { isThemeBackgroundFileName, isThemeCustomAccent } from "./themeMode";

export type CanvasBackgroundMode = "mist" | "white" | "color" | "image";
export type CanvasBackgroundSettings = {
  mode: CanvasBackgroundMode;
  color: string | null;
  imageFileName: string | null;
};

export function normalizeCanvasBackground(value: unknown): CanvasBackgroundSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    mode: input.mode === "white" || input.mode === "color" || input.mode === "image" ? input.mode : "mist",
    color: isThemeCustomAccent(input.color) ? input.color.toLowerCase() : null,
    imageFileName: isThemeBackgroundFileName(input.imageFileName) ? input.imageFileName : null,
  };
}

export function canvasBackgroundImageUrl(fileName: string): string {
  return isThemeBackgroundFileName(fileName) ? `app-theme://local/${encodeURIComponent(fileName)}` : "";
}

export function isDarkCanvasColor(color: string | null): boolean {
  if (!color || !isThemeCustomAccent(color)) return false;
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 < 0.179;
}
