import { describe, expect, it } from "vitest";
import { canvasBackgroundImageUrl, isDarkCanvasColor, normalizeCanvasBackground } from "../../src/features/library/utils/canvasBackground";

describe("canvas background settings", () => {
  it("migrates missing settings and rejects unsafe colors and image references", () => {
    expect(normalizeCanvasBackground(undefined)).toEqual({ mode: "mist", color: null, imageFileName: null });
    for (const imageFileName of ["../private.png", "C:\\private.png", "https://site/image.png", 'a.png");url(bad)']) {
      expect(normalizeCanvasBackground({ mode: "invalid", color: "url(bad)", imageFileName })).toEqual({ mode: "mist", color: null, imageFileName: null });
      expect(canvasBackgroundImageUrl(imageFileName)).toBe("");
    }
    expect(normalizeCanvasBackground({ mode: "color", color: "#ABCDEF" }).color).toBe("#abcdef");
    expect(canvasBackgroundImageUrl("theme-background-123.png")).toBe("app-theme://local/theme-background-123.png");
  });
  it("chooses readable text for light and dark custom colors", () => {
    expect(isDarkCanvasColor("#ffffff")).toBe(false);
    expect(isDarkCanvasColor("#ffff00")).toBe(false);
    expect(isDarkCanvasColor("#000000")).toBe(true);
    expect(isDarkCanvasColor("#173754")).toBe(true);
  });
});
