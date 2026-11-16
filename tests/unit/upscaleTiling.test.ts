import { describe, expect, it } from "vitest";
import {
  buildTilePositions,
  buildTileRegions,
  validateUpscaleOutputSize,
} from "../../src/features/upscale/worker/realCuganTiling";

describe("Real-CUGAN tile positions", () => {
  it("uses 512px tiles with a 448px stride and right-aligns the final tile", () => {
    expect(buildTilePositions(512)).toEqual([0]);
    expect(buildTilePositions(960)).toEqual([0, 448]);
    expect(buildTilePositions(1000)).toEqual([0, 448, 488]);
    expect(buildTilePositions(100)).toEqual([0]);
  });

  it("rejects invalid image dimensions", () => {
    expect(() => buildTilePositions(0)).toThrow("UPSCALE_INPUT_UNSUPPORTED");
    expect(() => buildTilePositions(20.5)).toThrow("UPSCALE_INPUT_UNSUPPORTED");
  });
});

describe("Real-CUGAN tile regions", () => {
  it("builds a Cartesian grid for non-multiple image dimensions", () => {
    const regions = buildTileRegions(1000, 700, 2);

    expect(regions).toHaveLength(6);
    expect(new Set(regions.map((region) => region.sourceX))).toEqual(new Set([0, 448, 488]));
    expect(new Set(regions.map((region) => region.sourceY))).toEqual(new Set([0, 188]));
  });

  it("crops overlaps at shared midpoints without output gaps or duplicate coverage", () => {
    const regions = buildTileRegions(1000, 300, 2).sort((left, right) => left.sourceX - right.sourceX);

    expect(regions[0]).toMatchObject({ cropLeft: 0, cropRight: 32, outputX: 0, outputWidth: 960 });
    expect(regions[1]).toMatchObject({ cropLeft: 32, cropRight: 236, outputX: 960, outputWidth: 488 });
    expect(regions[2]).toMatchObject({ cropLeft: 236, cropRight: 0, outputX: 1448, outputWidth: 552 });
    expect(regions[0].outputX + regions[0].outputWidth).toBe(regions[1].outputX);
    expect(regions[1].outputX + regions[1].outputWidth).toBe(regions[2].outputX);
    expect(regions[2].outputX + regions[2].outputWidth).toBe(2000);
  });

  it("scales output rectangles while preserving source crop bounds", () => {
    const [region] = buildTileRegions(320, 240, 4);

    expect(region).toMatchObject({
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 320,
      sourceHeight: 240,
      outputX: 0,
      outputY: 0,
      outputWidth: 1280,
      outputHeight: 960,
      scale: 4,
    });
  });
});

describe("Real-CUGAN output limits", () => {
  it("accepts exactly 120MP and rejects larger outputs", () => {
    expect(validateUpscaleOutputSize(6000, 5000, 2)).toEqual({ width: 12000, height: 10000 });
    expect(() => validateUpscaleOutputSize(6001, 5000, 2)).toThrow("UPSCALE_OUTPUT_TOO_LARGE");
  });
});
