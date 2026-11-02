import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REAL_CUGAN_ARTIFACTS,
  REAL_ESRGAN_ARTIFACT,
} from "../../electron/main/upscale/upscaleManifest";
import { resolveUpscalePaths } from "../../electron/main/upscale/upscalePaths";

describe("upscale artifact manifest", () => {
  it("pins every Real-CUGAN model to an immutable HTTPS artifact", () => {
    expect(REAL_CUGAN_ARTIFACTS).toHaveLength(11);
    expect(new Set(REAL_CUGAN_ARTIFACTS.map((artifact) => artifact.modelId)).size).toBe(11);

    for (const artifact of REAL_CUGAN_ARTIFACTS) {
      expect(artifact.url.startsWith("https://")).toBe(true);
      expect(artifact.fileName).toBe(path.basename(artifact.fileName));
      expect(artifact.byteSize).toBeGreaterThan(4_000_000);
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });

  it("pins the official Real-ESRGAN Windows archive", () => {
    expect(REAL_ESRGAN_ARTIFACT).toEqual({
      version: "0.2.5.0",
      fileName: "realesrgan-ncnn-vulkan-20220424-windows.zip",
      byteSize: 45_474_481,
      sha256: "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d",
      url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip",
    });
  });
});

describe("upscale portable paths", () => {
  it("keeps components and cache under the supplied user-data directory", () => {
    const paths = resolveUpscalePaths(path.join("C:\\", "Portable", "SuYan", "data"));

    expect(paths.realCuganRoot).toBe(path.join(paths.userDataRoot, "components", "upscale-cugan"));
    expect(paths.realEsrganRoot).toBe(path.join(paths.userDataRoot, "components", "upscale-realesrgan"));
    expect(paths.cacheRoot).toBe(path.join(paths.userDataRoot, "cache", "upscale"));
  });
});
