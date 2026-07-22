import { dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { LibraryFile, LibraryItem } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { normalizeNsfwRating } from "../../../src/features/library/utils/nsfwRating";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { prepareImageThumbnails } from "./imageThumbnails";
import { writeImportMediaBuffer } from "./importedImageWriter";
import { getImagePath } from "./libraryPaths";
import { appendLibraryItems, readLibraryFile } from "./libraryStore";

type JSZipConstructor = {
  new (): JSZip;
  loadAsync(data: Buffer): Promise<JSZip>;
};

const JSZipRuntime = loadJSZipConstructor();

type ArchiveResult = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
};

export async function exportLibraryZip(itemIds: string[]): Promise<ArchiveResult> {
  const library = await readLibraryFile();
  const selectedIds = new Set(itemIds);
  const items = itemIds.length > 0 ? library.items.filter((item) => selectedIds.has(item.id)) : library.items;
  const result = await dialog.showSaveDialog({
    title: "导出分享包",
    defaultPath: `素言-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: "ZIP 分享包", extensions: ["zip"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null, exportedCount: 0 };
  }

  const zip = new JSZipRuntime();
  const exportFile: LibraryFile = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items,
  };

  zip.file("data.json", JSON.stringify(exportFile, null, 2));

  for (const item of items) {
    const imageBuffer = await fs.readFile(getImagePath(item.imageFileName));
    zip.file(`images/${item.imageFileName}`, imageBuffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(result.filePath, buffer);

  return { canceled: false, filePath: result.filePath, exportedCount: items.length };
}

export async function importLibraryZip(): Promise<{
  canceled: boolean;
  library: LibraryFile;
  importedCount: number;
}> {
  const result = await dialog.showOpenDialog({
    title: "导入分享包",
    properties: ["openFile"],
    filters: [{ name: "ZIP 分享包", extensions: ["zip"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, library: await readLibraryFile(), importedCount: 0 };
  }

  const buffer = await fs.readFile(result.filePaths[0]);
  const zip = await JSZipRuntime.loadAsync(buffer);
  const dataFile = zip.file("data.json");

  if (!dataFile) {
    throw new AppError("ZIP_DATA_MISSING", "分享包缺少 data.json。");
  }

  const parsed = JSON.parse(await dataFile.async("string")) as unknown;

  if (!isArchiveLibrary(parsed)) {
    throw new AppError("ZIP_SCHEMA_INVALID", "分享包数据结构不合法。");
  }

  const importedItems: LibraryItem[] = [];

  for (const item of parsed.items) {
    const sourceImage = zip.file(`images/${item.imageFileName}`);

    if (!sourceImage) {
      throw new AppError("ZIP_IMAGE_MISSING", `分享包缺少素材 ${item.imageFileName}。`);
    }

    const nextId = randomUUID();
    const extension = path.extname(item.imageFileName) || ".png";
    const imageBuffer = await sourceImage.async("nodebuffer");
    const imageFileName = await writeImportMediaBuffer(nextId, imageBuffer, extension);
    const now = new Date().toISOString();

    importedItems.push({
      ...item,
      id: nextId,
      imageFileName,
      promptType: normalizePromptType(item.promptType, { ...item, imageFileName }),
      nsfwRating: normalizeNsfwRating(item.nsfwRating),
      nsfwCheckedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await prepareImageThumbnails(importedItems.map((item) => item.imageFileName).filter((imageFileName) => !isVideoMediaFile(imageFileName)));
  const library = await appendLibraryItems(importedItems);

  return { canceled: false, library, importedCount: importedItems.length };
}

function isArchiveLibrary(input: unknown): input is LibraryFile {
  if (!isRecord(input)) {
    return false;
  }

  return input.schemaVersion === 1 && Array.isArray(input.items) && input.items.every(isArchiveItem);
}

function isArchiveItem(input: unknown): input is LibraryItem {
  if (!isRecord(input)) {
    return false;
  }

  return (
    typeof input.id === "string" &&
    typeof input.title === "string" &&
    typeof input.imageFileName === "string" &&
    typeof input.prompt === "string" &&
    typeof input.negativePrompt === "string" &&
    Array.isArray(input.tags) &&
    input.tags.every((tag) => typeof tag === "string") &&
    isOptionalString(input.category) &&
    isOptionalString(input.generationMethod) &&
    isOptionalPromptType(input.promptType) &&
    isOptionalString(input.sourceUrl) &&
    isOptionalString(input.authorName) &&
    isOptionalString(input.authorUrl) &&
    isOptionalString(input.authorAvatarUrl) &&
    isOptionalNsfwRating(input.nsfwRating) &&
    isOptionalString(input.nsfwCheckedAt) &&
    typeof input.createdAt === "string" &&
    typeof input.updatedAt === "string"
  );
}

function isOptionalNsfwRating(input: unknown): boolean {
  return input === undefined || input === "unknown" || input === "safe" || input === "nsfw";
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || input === null || typeof input === "string";
}

function isOptionalPromptType(input: unknown): boolean {
  return input === undefined || typeof input === "string";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function loadJSZipConstructor(): JSZipConstructor {
  const runtimeRequire = createRequire(__filename);

  try {
    return normalizeJSZipModule(runtimeRequire("jszip"));
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    return normalizeJSZipModule(vendorRequire("jszip"));
  }
}

function normalizeJSZipModule(input: unknown): JSZipConstructor {
  const candidate = (input as { default?: JSZipConstructor }).default ?? input;
  return candidate as JSZipConstructor;
}
