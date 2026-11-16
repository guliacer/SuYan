import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { sampleImagePaletteFromBuffer } from "../../electron/main/library/imagePalette";
import { getSharp } from "../../electron/main/runtime/imageRuntime";
import { extractImagePalette, formatImagePaletteColor } from "../../src/features/library/utils/imagePalette";
const pixels = (...colors: number[][]) => new Uint8ClampedArray(colors.flat());
describe("bounded image palette extraction", () => {
  it("returns actual averaged colors rather than quantization-grid placeholders", () => {
    const result = extractImagePalette(pixels([238,130,90,255], [242,134,94,255], [0,80,160,255]));
    expect(result[0]).toMatchObject({ hex: "#F0845C", count: 2 });
    expect(result[0].ratio).toBeCloseTo(2 / 3);
  });
  it("ignores transparent pixels and merges nearly-identical dominant bins", () => {
    const result = extractImagePalette(pixels([255,0,0,0], [30,90,120,255], [33,92,123,255]));
    expect(result).toHaveLength(1); expect(result[0].count).toBe(2);
    expect(extractImagePalette(pixels([255,0,0,0]))).toEqual([]);
  });
  it("caps colors and deterministically resolves equal-count colors", () => {
    const input = pixels([255,0,0,255], [0,255,0,255], [0,0,255,255]);
    expect(extractImagePalette(input, 2)).toHaveLength(2);
    expect(extractImagePalette(input)).toEqual(extractImagePalette(input));
    expect(extractImagePalette(new Uint8ClampedArray())).toEqual([]);
  });
  it("copies complete HEX, RGB and CSS code strings", () => {
    expect(formatImagePaletteColor("#abc", "hex")).toBe("#AABBCC");
    expect(formatImagePaletteColor("#3a5c7e", "rgb")).toBe("rgb(58, 92, 126)");
    expect(formatImagePaletteColor("#3a5c7e", "css")).toBe("color: #3A5C7E;");
    expect(formatImagePaletteColor("invalid", "hex")).toBe("");
  });
  it("loads palette pixels through the main-process image API instead of a renderer canvas", () => {
    const source = fs.readFileSync("src/features/library/components/LibraryAssetInfo.tsx", "utf8");
    expect(source).toContain("window.suyanApi.getImagePaletteSample(item.imageFileName)");
    expect(source).not.toContain('document.createElement("canvas")');
  });
  it("decodes a real PNG into a bounded RGBA sample in the main process", async () => {
    const pixels = Buffer.from([220, 40, 60, 255, 30, 100, 170, 255]);
    const png = await getSharp()(pixels, { raw: { width: 2, height: 1, channels: 4 } })
      .png({ compressionLevel: 6, palette: false, quality: 100 }).toBuffer();
    const sample = await sampleImagePaletteFromBuffer(png);
    expect(sample).toMatchObject({ width: 2, height: 1 });
    expect(extractImagePalette(sample.pixels).map(color => color.hex)).toEqual(expect.arrayContaining(["#DC283C", "#1E64AA"]));
    expect(sample.pixels.length).toBe(8);
  });
});
