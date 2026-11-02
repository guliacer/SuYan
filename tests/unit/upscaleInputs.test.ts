import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearUpscaleSession,
  createUpscaleResult,
  readUpscaleInput,
  readUpscaleResult,
  registerUpscalePaths,
} from "../../electron/main/upscale/upscaleInputs";
import { cleanupUpscaleCache } from "../../electron/main/upscale/upscaleCache";
import { resolveUpscalePaths } from "../../electron/main/upscale/upscalePaths";

const roots: string[] = [];

beforeEach(() => {
  clearUpscaleSession();
});

afterEach(async () => {
  clearUpscaleSession();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-upscale-inputs-"));
  roots.push(root);
  return root;
}

async function writeImage(
  filePath: string,
  format: "png" | "jpeg" | "webp",
  width = 24,
  height = 16,
): Promise<Buffer> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 27, g: 94, b: 132, alpha: 1 },
    },
  });
  const bytes = format === "png"
    ? await pipeline.png().toBuffer()
    : format === "jpeg"
      ? await pipeline.jpeg().toBuffer()
      : await pipeline.webp().toBuffer();
  await fs.writeFile(filePath, bytes);
  return bytes;
}

describe("upscale input registry", () => {
  it("expands directories recursively, filters extensions, and removes duplicate paths", async () => {
    const root = await makeRoot();
    const pngPath = path.join(root, "first.png");
    const jpegPath = path.join(root, "nested", "second.JPEG");
    const webpPath = path.join(root, "nested", "deep", "third.webp");
    await writeImage(pngPath, "png");
    await writeImage(jpegPath, "jpeg");
    await writeImage(webpPath, "webp");
    await fs.writeFile(path.join(root, "nested", "ignored.txt"), "not an image", "utf8");

    const descriptors = await registerUpscalePaths([root, pngPath]);

    expect(descriptors.map((entry) => entry.displayName)).toEqual([
      "first.png",
      "second.JPEG",
      "third.webp",
    ]);
    expect(new Set(descriptors.map((entry) => entry.token)).size).toBe(3);
    expect(descriptors.map((entry) => entry.mediaType)).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("returns opaque tokens and bounded WebP previews without exposing local paths", async () => {
    const root = await makeRoot();
    const imagePath = path.join(root, "wide-source.png");
    const original = await writeImage(imagePath, "png", 1200, 700);

    const [descriptor] = await registerUpscalePaths([{ filePath: imagePath, sourceItemId: "item-42" }]);

    expect(descriptor).toMatchObject({
      displayName: "wide-source.png",
      width: 1200,
      height: 700,
      byteSize: original.length,
      mediaType: "image/png",
      sourceItemId: "item-42",
    });
    expect(descriptor.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    expect(descriptor.previewDataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(JSON.stringify(descriptor)).not.toContain(root);

    const preview = Buffer.from(descriptor.previewDataUrl.split(",")[1], "base64");
    const previewMetadata = await sharp(preview).metadata();
    expect(previewMetadata.format).toBe("webp");
    expect(previewMetadata.width).toBeLessThanOrEqual(640);
    expect(previewMetadata.height).toBeLessThanOrEqual(640);
    await expect(readUpscaleInput(descriptor.token)).resolves.toEqual(original);
  });

  it("rejects unsupported direct files and unregistered or invalidated tokens", async () => {
    const root = await makeRoot();
    const unsupportedPath = path.join(root, "notes.txt");
    await fs.writeFile(unsupportedPath, "text", "utf8");

    await expect(registerUpscalePaths([unsupportedPath])).rejects.toThrow("UPSCALE_INPUT_UNSUPPORTED");
    await expect(readUpscaleInput(unsupportedPath)).rejects.toThrow("UPSCALE_INPUT_MISSING");

    const imagePath = path.join(root, "valid.png");
    await writeImage(imagePath, "png");
    const [descriptor] = await registerUpscalePaths([imagePath]);
    clearUpscaleSession();

    await expect(readUpscaleInput(descriptor.token)).rejects.toThrow("UPSCALE_INPUT_MISSING");
  });

  it("stores result bytes in the managed cache behind a separate opaque token", async () => {
    const root = await makeRoot();
    const paths = resolveUpscalePaths(root);
    const bytes = await writeImage(path.join(root, "source.png"), "png", 40, 30);

    const descriptor = await createUpscaleResult("job-1", bytes, "png", paths);

    expect(descriptor).toMatchObject({
      width: 40,
      height: 30,
      byteSize: bytes.length,
      mediaType: "image/png",
    });
    expect(descriptor.previewDataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(JSON.stringify(descriptor)).not.toContain(paths.cacheRoot);
    await expect(readUpscaleResult(descriptor.token)).resolves.toEqual(bytes);
    await expect(fs.readdir(path.join(paths.cacheRoot, "job-1"))).resolves.toHaveLength(1);
  });
});

describe("upscale cache cleanup", () => {
  it("deletes only direct child job directories older than 24 hours", async () => {
    const root = await makeRoot();
    const paths = resolveUpscalePaths(root);
    const oldJob = path.join(paths.cacheRoot, "old-job");
    const freshJob = path.join(paths.cacheRoot, "fresh-job");
    const directFile = path.join(paths.cacheRoot, "keep.txt");
    await fs.mkdir(oldJob, { recursive: true });
    await fs.mkdir(freshJob, { recursive: true });
    await fs.writeFile(path.join(oldJob, "result.png"), "old", "utf8");
    await fs.writeFile(path.join(freshJob, "result.png"), "fresh", "utf8");
    await fs.writeFile(directFile, "keep", "utf8");
    const now = new Date("2026-11-02T12:00:00.000Z");
    const oldTime = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const freshTime = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    await fs.utimes(oldJob, oldTime, oldTime);
    await fs.utimes(freshJob, freshTime, freshTime);

    const result = await cleanupUpscaleCache(now, paths);

    expect(result).toEqual({ removed: 1 });
    await expect(fs.stat(oldJob)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(freshJob)).resolves.toBeDefined();
    await expect(fs.readFile(directFile, "utf8")).resolves.toBe("keep");
  });
});
