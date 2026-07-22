import { describe, expect, it } from "vitest";
import {
  createDefaultLibrary,
  createDefaultSeedImage,
  getDefaultSeedImageFileNames,
} from "../../electron/main/library/defaultLibrarySeed";

describe("defaultLibrarySeed", () => {
  it("creates a browsable Chinese prompt library for first launch", () => {
    const library = createDefaultLibrary();

    expect(library.schemaVersion).toBe(1);
    expect(library.items).toHaveLength(12);
    expect(library.items[0].title).toContain("品牌营销");
    expect(library.items.flatMap((item) => item.tags)).toContain("写作指南");
    expect(library.items.every((item) => item.imageFileName.endsWith(".png"))).toBe(true);
  });

  it("generates valid PNG thumbnails for the seeded cards", () => {
    const [firstImageFileName] = getDefaultSeedImageFileNames();
    const image = createDefaultSeedImage(firstImageFileName);

    expect(Array.from(image.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
