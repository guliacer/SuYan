import { describe, expect, it } from "vitest";
import {
  selectRandomStartupGalleryImages,
  startupGalleryDisplayCount,
} from "../../src/features/library/utils/startupGallerySelection";

describe("startup gallery selection", () => {
  it("selects six unique images when the gallery has enough entries", () => {
    const images = ["a", "b", "c", "d", "e", "f", "g"];
    const selected = selectRandomStartupGalleryImages(images, startupGalleryDisplayCount, () => 0);

    expect(selected).toHaveLength(6);
    expect(new Set(selected)).toHaveLength(6);
    expect(selected.every((image) => images.includes(image))).toBe(true);
  });

  it("fills all six positions when the gallery has fewer images", () => {
    const selected = selectRandomStartupGalleryImages(["a", "b", "c"], 6, () => 0.5);

    expect(selected).toHaveLength(6);
    expect(new Set(selected)).toEqual(new Set(["a", "b", "c"]));
  });

  it("uses the random source to change image placement", () => {
    const images = ["a", "b", "c", "d", "e", "f"];
    const lowRandom = selectRandomStartupGalleryImages(images, 6, () => 0);
    const highRandom = selectRandomStartupGalleryImages(images, 6, () => 0.999999);

    expect(lowRandom).not.toEqual(highRandom);
  });

  it("returns an empty selection for an empty gallery", () => {
    expect(selectRandomStartupGalleryImages([], 6)).toEqual([]);
  });
});
