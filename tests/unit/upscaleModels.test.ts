import { describe, expect, it } from "vitest";
import {
  MAX_REAL_CUGAN_OUTPUT_PIXELS,
  estimateUpscaleOutput,
  getUpscaleModelDefinition,
  isUpscaleModelId,
  upscaleModelDefinitions,
} from "../../src/features/upscale/utils/upscaleModels";

describe("upscale model catalog", () => {
  it("describes the default Real-CUGAN and Real-ESRGAN models", () => {
    expect(getUpscaleModelDefinition("cugan-2x-no-denoise")).toMatchObject({
      engine: "real-cugan",
      scale: 2,
      modelFileName: "up2x-latest-no-denoise-fixed512.onnx",
    });
    expect(getUpscaleModelDefinition("esrgan-x4plus")).toMatchObject({
      engine: "real-esrgan",
      scale: 4,
      nativeModelName: "realesrgan-x4plus",
    });
  });

  it("keeps every model id unique and validates known ids", () => {
    const ids = upscaleModelDefinitions.map((model) => model.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(isUpscaleModelId("esrgan-animevideov3-3x")).toBe(true);
    expect(isUpscaleModelId("../../realesrgan.exe")).toBe(false);
  });

  it("exposes only scales supported by the packaged Real-ESRGAN models", () => {
    expect(getUpscaleModelDefinition("esrgan-x4plus").scale).toBe(4);
    expect(getUpscaleModelDefinition("esrgan-x4plus-anime").scale).toBe(4);
    expect(getUpscaleModelDefinition("esrgan-animevideov3-2x").scale).toBe(2);
    expect(getUpscaleModelDefinition("esrgan-animevideov3-3x").scale).toBe(3);
    expect(getUpscaleModelDefinition("esrgan-animevideov3-4x").scale).toBe(4);
  });
});

describe("upscale output estimate", () => {
  it("computes target dimensions and pixels", () => {
    expect(estimateUpscaleOutput(1000, 750, 4)).toEqual({
      allowed: true,
      outputHeight: 3000,
      outputPixels: 12_000_000,
      outputWidth: 4000,
    });
  });

  it("rejects Real-CUGAN outputs above the 120 MP limit", () => {
    expect(MAX_REAL_CUGAN_OUTPUT_PIXELS).toBe(120_000_000);
    expect(estimateUpscaleOutput(6000, 5000, 4).allowed).toBe(false);
  });

  it("rejects invalid dimensions and scales", () => {
    expect(() => estimateUpscaleOutput(0, 100, 2)).toThrow("width");
    expect(() => estimateUpscaleOutput(100, Number.NaN, 2)).toThrow("height");
    expect(() => estimateUpscaleOutput(100, 100, 1.5)).toThrow("scale");
  });
});
