import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "../../src/features/library/types/library";
import type {
  UpscaleExportOptions,
  UpscaleExportRequest,
  UpscaleInputDescriptor,
} from "../../src/features/upscale/types";
import {
  buildUpscaleOutputName,
  defaultUpscaleExportOptions,
  normalizeUpscaleExportOptions,
} from "../../src/features/upscale/utils/upscaleExport";
import {
  clearUpscaleOutputDirectories,
  exportUpscaleResultWithDependencies,
  registerUpscaleOutputDirectory,
  resolveUpscaleOutputDirectory,
  type UpscaleExportDependencies,
} from "../../electron/main/upscale/upscaleExport";

const roots: string[] = [];

beforeEach(() => {
  clearUpscaleOutputDirectories();
});

afterEach(async () => {
  clearUpscaleOutputDirectories();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })));
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-upscale-export-"));
  roots.push(root);
  return root;
}

async function createPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 12,
      height: 8,
      channels: 4,
      background: { r: 80, g: 120, b: 160, alpha: 1 },
    },
  }).png().toBuffer();
}

describe("upscale export policy", () => {
  it("normalizes formats, destinations, quality, and PNG quality behavior", () => {
    expect(defaultUpscaleExportOptions).toMatchObject({
      saveToDirectory: true,
      addToLibrary: false,
      format: "png",
      quality: 92,
      conflictPolicy: "append-number",
      namingPattern: "{name}_{engine}_{scale}x",
      libraryMode: "new-group",
    });

    expect(normalizeUpscaleExportOptions({
      saveToDirectory: false,
      addToLibrary: false,
      format: "gif" as never,
      quality: 400,
    })).toMatchObject({ saveToDirectory: true, addToLibrary: false, format: "png", quality: 100 });
    expect(normalizeUpscaleExportOptions({ format: "jpeg", quality: 0 })).toMatchObject({
      format: "jpeg",
      quality: 1,
    });
    expect(normalizeUpscaleExportOptions({ format: "webp", quality: 86.7 })).toMatchObject({
      format: "webp",
      quality: 87,
    });
  });

  it("expands only controlled variables and sanitizes Windows file names", () => {
    expect(buildUpscaleOutputName(
      "CON:<portrait>.png",
      "esrgan-animevideov3-3x",
      "{name}_{engine}_{model}_{scale}x_{unknown}",
    )).toBe("CON__portrait__real-esrgan_esrgan-animevideov3-3x_3x");
    expect(buildUpscaleOutputName("...", "cugan-2x-no-denoise", "{name}")).toBe("upscaled");
    expect(buildUpscaleOutputName("NUL.png", "cugan-2x-no-denoise", "{name}")).toBe("_NUL");
  });

  it("registers opaque directory tokens without returning an absolute path", async () => {
    const root = await makeRoot();
    const descriptor = await registerUpscaleOutputDirectory(root);

    expect(descriptor.token).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(descriptor.displayName).toBe(path.basename(root));
    expect(JSON.stringify(descriptor)).not.toContain(root);
    expect(resolveUpscaleOutputDirectory(descriptor.token)).toBe(path.resolve(root));
    expect(() => resolveUpscaleOutputDirectory(root)).toThrow("UPSCALE_EXPORT_FAILED");
  });
});

describe("upscale export transaction", () => {
  it("uses append-number, overwrite, and skip conflict policies", async () => {
    const root = await makeRoot();
    const png = await createPng();
    await fs.writeFile(path.join(root, "sample_real-cugan_2x.png"), Buffer.from("old"));
    const append = makeDependencies(root, png);

    const appended = await exportUpscaleResultWithDependencies(
      makeRequest({ conflictPolicy: "append-number" }),
      append,
    );
    expect(appended).toMatchObject({ savedFileName: "sample_real-cugan_2x (1).png", skipped: false });
    await expect(fs.readFile(path.join(root, "sample_real-cugan_2x (1).png"))).resolves.toEqual(png);

    const overwritten = await exportUpscaleResultWithDependencies(
      makeRequest({ conflictPolicy: "overwrite" }),
      makeDependencies(root, png),
    );
    expect(overwritten.savedFileName).toBe("sample_real-cugan_2x.png");
    await expect(fs.readFile(path.join(root, "sample_real-cugan_2x.png"))).resolves.toEqual(png);

    await fs.writeFile(path.join(root, "sample_real-cugan_2x.png"), Buffer.from("keep"));
    const skipped = await exportUpscaleResultWithDependencies(
      makeRequest({ conflictPolicy: "skip" }),
      makeDependencies(root, png),
    );
    expect(skipped).toMatchObject({ savedFileName: null, importedItemIds: [], skipped: true });
    await expect(fs.readFile(path.join(root, "sample_real-cugan_2x.png"), "utf8")).resolves.toBe("keep");
  });

  it("encodes JPEG and WebP with quality while PNG ignores the quality slider", async () => {
    const root = await makeRoot();
    const png = await createPng();
    const encodeResult = vi.fn(async (_bytes, options) => {
      const pipeline = sharp(png);
      if (options.format === "jpeg") return pipeline.jpeg({ quality: options.quality }).toBuffer();
      if (options.format === "webp") return pipeline.webp({ quality: options.quality }).toBuffer();
      return pipeline.png().toBuffer();
    });

    for (const format of ["png", "jpeg", "webp"] as const) {
      await exportUpscaleResultWithDependencies(
        makeRequest({ format, quality: 61, namingPattern: `{name}-${format}` }),
        makeDependencies(root, png, { encodeResult }),
      );
    }

    expect(encodeResult.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ format: "png", quality: null }),
      expect.objectContaining({ format: "jpeg", quality: 61 }),
      expect.objectContaining({ format: "webp", quality: 61 }),
    ]);
    await expect(sharp(await fs.readFile(path.join(root, "sample-png.png"))).metadata())
      .resolves.toMatchObject({ format: "png" });
    await expect(sharp(await fs.readFile(path.join(root, "sample-jpeg.jpg"))).metadata())
      .resolves.toMatchObject({ format: "jpeg" });
    await expect(sharp(await fs.readFile(path.join(root, "sample-webp.webp"))).metadata())
      .resolves.toMatchObject({ format: "webp" });
  });

  it("supports library-only and inherits source metadata when appending", async () => {
    const root = await makeRoot();
    const png = await createPng();
    const importToLibrary = vi.fn(async () => ["upscaled-item"]);
    const sourceItem = makeSourceItem();
    const dependencies = makeDependencies(root, png, {
      findSourceItem: async () => sourceItem,
      importToLibrary,
    });

    const result = await exportUpscaleResultWithDependencies(
      makeRequest({
        saveToDirectory: false,
        addToLibrary: true,
        libraryMode: "append-source",
      }),
      dependencies,
    );

    expect(result).toEqual({ savedFileName: null, importedItemIds: ["upscaled-item"], skipped: false });
    expect(importToLibrary).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        title: sourceItem.title,
        prompt: sourceItem.prompt,
        negativePrompt: sourceItem.negativePrompt,
        tags: sourceItem.tags,
        categoryId: sourceItem.categoryId,
      }),
    }));
  });

  it("rolls back a new file and restores an overwritten file when library import fails", async () => {
    const root = await makeRoot();
    const png = await createPng();
    const importFailure = async () => {
      throw new Error("library unavailable");
    };

    await expect(exportUpscaleResultWithDependencies(
      makeRequest({ saveToDirectory: true, addToLibrary: true, conflictPolicy: "append-number" }),
      makeDependencies(root, png, { importToLibrary: importFailure }),
    )).rejects.toThrow("UPSCALE_LIBRARY_IMPORT_FAILED");
    await expect(fs.readdir(root)).resolves.toEqual([]);

    const existingPath = path.join(root, "sample_real-cugan_2x.png");
    await fs.writeFile(existingPath, Buffer.from("original"));
    await expect(exportUpscaleResultWithDependencies(
      makeRequest({ saveToDirectory: true, addToLibrary: true, conflictPolicy: "overwrite" }),
      makeDependencies(root, png, { importToLibrary: importFailure }),
    )).rejects.toThrow("UPSCALE_LIBRARY_IMPORT_FAILED");
    await expect(fs.readFile(existingPath, "utf8")).resolves.toBe("original");
    expect((await fs.readdir(root)).some((name) => name.includes(".backup"))).toBe(false);
  });

  it("rejects an unregistered output directory token", async () => {
    const root = await makeRoot();
    const png = await createPng();
    await expect(exportUpscaleResultWithDependencies(
      makeRequest({ outputDirectoryToken: "missing-token" }),
      makeDependencies(root, png, {
        resolveOutputDirectory: resolveUpscaleOutputDirectory,
      }),
    )).rejects.toThrow("UPSCALE_EXPORT_FAILED");
  });
});

function makeRequest(options: Partial<UpscaleExportOptions> = {}): UpscaleExportRequest {
  return {
    jobId: "job-1",
    inputToken: "input-token",
    resultToken: "result-token",
    modelId: "cugan-2x-no-denoise",
    options: {
      ...defaultUpscaleExportOptions,
      outputDirectoryToken: "directory-token",
      ...options,
    },
  };
}

function makeInput(): UpscaleInputDescriptor {
  return {
    token: "input-token",
    displayName: "sample.png",
    width: 12,
    height: 8,
    byteSize: 4,
    mediaType: "image/png",
    sourceItemId: "source-item",
    previewDataUrl: "data:image/webp;base64,AAAA",
  };
}

function makeSourceItem(): LibraryItem {
  return {
    id: "source-item",
    title: "来源作品",
    imageFileName: "source.png",
    prompt: "湖边日出",
    negativePrompt: "文字，水印",
    category: "风光摄影",
    categoryId: "system:landscape",
    tags: ["湖泊", "日出"],
    generationMethod: "original-model",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeDependencies(
  outputDirectory: string,
  resultBytes: Buffer,
  overrides: Partial<UpscaleExportDependencies> = {},
): UpscaleExportDependencies {
  return {
    getInputDescriptor: () => makeInput(),
    readResult: async () => resultBytes,
    resolveOutputDirectory: () => outputDirectory,
    findSourceItem: async () => null,
    encodeResult: async () => resultBytes,
    importToLibrary: async () => [],
    pathExists: async (filePath) => fs.stat(filePath).then(() => true, () => false),
    writeFile: (filePath, bytes) => fs.writeFile(filePath, bytes, { flag: "wx" }),
    rename: (source, target) => fs.rename(source, target),
    remove: (filePath) => fs.rm(filePath, { force: true }),
    ...overrides,
  };
}
