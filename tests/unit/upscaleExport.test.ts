import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryFile, LibraryItem } from "../../src/features/library/types/library";
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
  pickUpscaleExportTarget,
  replaceUpscaleSourceWithDependencies,
  registerUpscaleOutputDirectory,
  resolveUpscaleOutputDirectory,
  type UpscaleExportDependencies,
} from "../../electron/main/upscale/upscaleExport";
import {
  replaceLibrarySourceImageWithDependencies,
  type ReplacementDependencies,
} from "../../electron/main/library/upscaleSourceReplacement";

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

describe("upscale export target", () => {
  it("returns the library target without touching the file system", async () => {
    await expect(pickUpscaleExportTarget("library", { fileName: "x.png", format: "png" }))
      .resolves.toEqual({ mode: "library", directoryToken: null, filePath: null });
  });

  it("writes to the exact path chosen by the user", async () => {
    const root = await makeRoot();
    const png = await createPng();
    const target = path.join(root, "我的 导出.png");
    await fs.writeFile(target, Buffer.from("old"));

    const result = await exportUpscaleResultWithDependencies(
      makeRequest({ saveToDirectory: true, targetFilePath: target }),
      makeDependencies(root, png),
    );

    expect(result).toMatchObject({ savedFileName: "我的 导出.png", skipped: false });
    await expect(fs.readFile(target)).resolves.toEqual(png);
  });

  it("restores the original file when the save-as write fails", async () => {
    const root = await makeRoot();
    const png = await createPng();
    const target = path.join(root, "keep.png");
    await fs.writeFile(target, Buffer.from("keep"));

    await expect(exportUpscaleResultWithDependencies(
      makeRequest({ saveToDirectory: true, targetFilePath: target }),
      makeDependencies(root, png, {
        writeFileReplace: async () => {
          throw new Error("磁盘不可写");
        },
      }),
    )).rejects.toThrow("磁盘不可写");

    await expect(fs.readFile(target, "utf8")).resolves.toBe("keep");
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

  it("replaces a registered source only through the explicit replacement operation", async () => {
    const root = await makeRoot();
    const png = await createPng();
    const replaceSourceImage = vi.fn(async () => ({
      sourceItemId: "source-item",
      imageFileName: "replacement.png",
    }));
    const dependencies = makeDependencies(root, png, { replaceSourceImage });

    await exportUpscaleResultWithDependencies(makeRequest({
      saveToDirectory: false,
      addToLibrary: true,
    }), dependencies);
    expect(replaceSourceImage).not.toHaveBeenCalled();

    const result = await replaceUpscaleSourceWithDependencies({
      inputToken: "input-token",
      resultToken: "result-token",
    }, dependencies);

    expect(result).toEqual({ sourceItemId: "source-item", imageFileName: "replacement.png" });
    expect(replaceSourceImage).toHaveBeenCalledWith({
      sourceItemId: "source-item",
      expectedImageFileName: "source.png",
      bytes: png,
      mediaType: "image/png",
    });
  });

  it("refuses replacement when the input was not registered from a library detail image", async () => {
    const root = await makeRoot();
    const png = await createPng();
    await expect(replaceUpscaleSourceWithDependencies({
      inputToken: "input-token",
      resultToken: "result-token",
    }, makeDependencies(root, png, {
      getInputDescriptor: () => ({
        ...makeInput(),
        sourceItemId: null,
        sourceImageFileName: null,
      }),
    }))).rejects.toThrow("UPSCALE_SOURCE_REPLACE_FAILED");
  });
});

describe("upscale source replacement transaction", () => {
  it("rolls back the new managed image when the registered source is stale", async () => {
    const removeManagedImage = vi.fn(async () => undefined);
    const dependencies = makeReplacementDependencies({
      removeManagedImage,
      updateLibrary: async (updater) => updater(makeLibrary({ imageFileName: "changed.png" }))!,
    });

    await expect(replaceLibrarySourceImageWithDependencies({
      sourceItemId: "source-item",
      expectedImageFileName: "source.png",
      bytes: Buffer.from("replacement"),
      mediaType: "image/png",
    }, dependencies)).rejects.toMatchObject({ code: "UPSCALE_SOURCE_REPLACE_FAILED" });

    expect(removeManagedImage).toHaveBeenCalledTimes(1);
    expect(removeManagedImage).toHaveBeenCalledWith("replacement.png");
    expect(dependencies.removeThumbnail).not.toHaveBeenCalled();
  });

  it("preserves metadata and never removes a user-owned external source", async () => {
    let persisted: LibraryFile | null = null;
    const dependencies = makeReplacementDependencies({
      updateLibrary: async (updater) => {
        const next = updater(makeLibrary({
          mediaStorage: { kind: "external", rootId: "root-1", relativePath: "source.png" },
          remoteImageUrl: "https://example.test/source.png",
          remoteImageStatus: "downloaded",
        }));
        if (!next) throw new Error("expected replacement update");
        persisted = next;
        return next;
      },
    });

    await expect(replaceLibrarySourceImageWithDependencies({
      sourceItemId: "source-item",
      expectedImageFileName: "source.png",
      bytes: Buffer.from("replacement"),
      mediaType: "image/png",
    }, dependencies)).resolves.toEqual({
      sourceItemId: "source-item",
      imageFileName: "replacement.png",
    });

    expect((persisted as LibraryFile | null)?.items[0]).toMatchObject({
      id: "source-item",
      title: "来源作品",
      prompt: "湖边日出",
      imageFileName: "replacement.png",
      mediaStorage: "managed",
      remoteImageUrl: null,
      remoteImageStatus: null,
    });
    expect(dependencies.removeManagedImage).not.toHaveBeenCalled();
    expect(dependencies.removeThumbnail).toHaveBeenCalledWith("source.png");
  });

  it("keeps old managed media and its thumbnail while another item references it", async () => {
    const dependencies = makeReplacementDependencies({
      updateLibrary: async (updater) => {
        const library = makeLibrary();
        library.items.push({ ...library.items[0], id: "shared-item" });
        return updater(library)!;
      },
    });

    await replaceLibrarySourceImageWithDependencies({
      sourceItemId: "source-item",
      expectedImageFileName: "source.png",
      bytes: Buffer.from("replacement"),
      mediaType: "image/png",
    }, dependencies);

    expect(dependencies.removeManagedImage).not.toHaveBeenCalled();
    expect(dependencies.removeThumbnail).not.toHaveBeenCalled();
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
    sourceImageFileName: "source.png",
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

function makeLibrary(overrides: Partial<LibraryItem> = {}) {
  return {
    schemaVersion: 2 as const,
    updatedAt: "2026-01-01T00:00:00.000Z",
    items: [{ ...makeSourceItem(), mediaStorage: "managed" as const, ...overrides }],
  };
}

function makeReplacementDependencies(
  overrides: Partial<ReplacementDependencies> = {},
): ReplacementDependencies {
  return {
    writeManagedImage: async () => "replacement.png",
    updateLibrary: async (updater) => updater(makeLibrary())!,
    removeManagedImage: vi.fn(async () => undefined),
    removeThumbnail: vi.fn(async () => undefined),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    ...overrides,
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
    replaceSourceImage: async () => {
      throw new Error("replacement not configured");
    },
    pathExists: async (filePath) => fs.stat(filePath).then(() => true, () => false),
    writeFile: (filePath, bytes) => fs.writeFile(filePath, bytes, { flag: "wx" }),
    rename: (source, target) => fs.rename(source, target),
    remove: (filePath) => fs.rm(filePath, { force: true }),
    ...overrides,
  };
}
