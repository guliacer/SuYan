import { describe, expect, it } from "vitest";
import { normalizeImageOrientationSize } from "../../src/features/upscale/utils/upscaleOrientation";

describe("upscale orientation size", () => {
  it("keeps raw width/height for upright orientations", () => {
    expect(normalizeImageOrientationSize(1080, 1620, 1)).toEqual({ width: 1080, height: 1620 });
    expect(normalizeImageOrientationSize(1080, 1620, 2)).toEqual({ width: 1080, height: 1620 });
    expect(normalizeImageOrientationSize(1080, 1620, 3)).toEqual({ width: 1080, height: 1620 });
    expect(normalizeImageOrientationSize(1080, 1620, 4)).toEqual({ width: 1080, height: 1620 });
  });

  it("swaps width/height for the four 90-degree orientations", () => {
    // 竖拍的手机照片：文件里存 1620x1080，EXIF 说转 90°，屏幕上看到的是 1080x1620。
    for (const orientation of [5, 6, 7, 8]) {
      expect(normalizeImageOrientationSize(1620, 1080, orientation)).toEqual({
        width: 1080,
        height: 1620,
      });
    }
  });

  it("treats a missing orientation as upright", () => {
    expect(normalizeImageOrientationSize(1080, 1620, undefined)).toEqual({ width: 1080, height: 1620 });
  });

  it("ignores invalid dimensions instead of producing negative sizes", () => {
    expect(normalizeImageOrientationSize(0, 1620, 6)).toEqual({ width: 0, height: 1620 });
    expect(normalizeImageOrientationSize(1080, Number.NaN, 6)).toEqual({
      width: 1080,
      height: Number.NaN,
    });
  });
});
