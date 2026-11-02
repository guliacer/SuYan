import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getUpscaleComponentStatusInPaths,
  installRealCuganModelInPaths,
  installRealEsrganInPaths,
} from "../../electron/main/upscale/upscaleInstaller";
import { resolveUpscalePaths } from "../../electron/main/upscale/upscalePaths";
import type { UpscaleArtifact } from "../../electron/main/upscale/upscaleManifest";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function makePaths() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-upscale-install-"));
  roots.push(root);
  return resolveUpscalePaths(root);
}

function artifactFor(data: Buffer): UpscaleArtifact {
  return {
    modelId: "cugan-2x-no-denoise",
    fileName: "up2x-latest-no-denoise-fixed512.onnx",
    byteSize: data.length,
    sha256: crypto.createHash("sha256").update(data).digest("hex"),
    url: "https://example.test/model.onnx",
  };
}

async function makeRealEsrganZip(extra: Record<string, Buffer> = {}): Promise<Buffer> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const required = [
    "realesrgan-ncnn-vulkan.exe",
    "vcomp140.dll",
    "models/realesrgan-x4plus.bin",
    "models/realesrgan-x4plus.param",
    "models/realesrgan-x4plus-anime.bin",
    "models/realesrgan-x4plus-anime.param",
    "models/realesr-animevideov3-x2.bin",
    "models/realesr-animevideov3-x2.param",
    "models/realesr-animevideov3-x3.bin",
    "models/realesr-animevideov3-x3.param",
    "models/realesr-animevideov3-x4.bin",
    "models/realesr-animevideov3-x4.param",
  ];
  for (const fileName of required) {
    zip.file(fileName, Buffer.from(`fixture:${fileName}`));
  }
  for (const [fileName, data] of Object.entries(extra)) {
    zip.file(fileName, data);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("upscale component installer", () => {
  it("installs and verifies one Real-CUGAN model atomically", async () => {
    const paths = await makePaths();
    const data = Buffer.from("real cugan model fixture");
    const artifact = artifactFor(data);

    await installRealCuganModelInPaths(paths, artifact, async () => data);

    const status = await getUpscaleComponentStatusInPaths(paths, "real-cugan", [artifact]);
    expect(status.installed).toBe(true);
    expect(status.installedModelIds).toEqual(["cugan-2x-no-denoise"]);
    await expect(fs.readFile(path.join(paths.realCuganModelsRoot, artifact.fileName))).resolves.toEqual(data);
  });

  it("rejects a Real-CUGAN hash mismatch without replacing a valid model", async () => {
    const paths = await makePaths();
    const original = Buffer.from("valid model");
    const artifact = artifactFor(original);
    await installRealCuganModelInPaths(paths, artifact, async () => original);

    await expect(
      installRealCuganModelInPaths(paths, artifact, async () => Buffer.from("tampered model")),
    ).rejects.toThrow("SHA-256");

    await expect(fs.readFile(path.join(paths.realCuganModelsRoot, artifact.fileName))).resolves.toEqual(original);
    expect((await fs.readdir(paths.realCuganModelsRoot)).some((name) => name.endsWith(".partial"))).toBe(false);
  });

  it("installs the Real-ESRGAN archive only when every required file exists", async () => {
    const paths = await makePaths();
    const zip = await makeRealEsrganZip();
    const artifact = {
      version: "fixture",
      fileName: "realesrgan.zip",
      byteSize: zip.length,
      sha256: crypto.createHash("sha256").update(zip).digest("hex"),
      url: "https://example.test/realesrgan.zip",
    } as const;

    await installRealEsrganInPaths(paths, artifact, async () => zip);

    const status = await getUpscaleComponentStatusInPaths(paths, "real-esrgan", artifact);
    expect(status).toMatchObject({ installed: true, phase: "ready", version: "fixture" });
    await expect(fs.stat(path.join(paths.realEsrganRoot, "realesrgan-ncnn-vulkan.exe"))).resolves.toBeDefined();
  });

  it("rejects ZIP path traversal and preserves the previous component", async () => {
    const paths = await makePaths();
    await fs.mkdir(paths.realEsrganRoot, { recursive: true });
    await fs.writeFile(path.join(paths.realEsrganRoot, "keep.txt"), "old component", "utf8");
    const zip = await makeRealEsrganZip({ "../outside.txt": Buffer.from("escape") });
    const artifact = {
      version: "fixture",
      fileName: "realesrgan.zip",
      byteSize: zip.length,
      sha256: crypto.createHash("sha256").update(zip).digest("hex"),
      url: "https://example.test/realesrgan.zip",
    } as const;

    await expect(installRealEsrganInPaths(paths, artifact, async () => zip)).rejects.toThrow(/路径穿越|逃逸/u);

    await expect(fs.readFile(path.join(paths.realEsrganRoot, "keep.txt"), "utf8")).resolves.toBe("old component");
  });
});
