import { dialog } from "../app/fileDialogs";
import { formatExportFileName } from "../app/exportFileName";
import { reportExportProgress } from "../app/exportTask";
import { writeZipInBackground } from "../app/exportZipWorker";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { LibraryFile, LibraryItem, LibraryViewSettings } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { normalizeNsfwRating } from "../../../src/features/library/utils/nsfwRating";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { createZipViaRust } from "../runtime/rustFileOps";
import { assertZipIntegrity, ZipCorruptError } from "./zipIntegrity";
import { snapshotWorkAuthor } from "./workAttribution";
import { attributeWork, hasWorkAuthor } from "../../../src/features/library/utils/workAttribution";
import { collectAuthorAvatars, restoreAuthorAvatar } from "./archiveAuthors";
import type { AuthorInfo } from "../../../src/features/account/types/account";
import { prepareImageThumbnails } from "./imageThumbnails";
import { writeImportImageBuffer, writeImportMediaBuffer } from "./importedImageWriter";
import { appendLibraryItems, readLibraryFile } from "./libraryStore";
import { resolveMediaAbsolutePath } from "./mediaPathResolver";
import { getImagePath, getImageThumbnailPath } from "./libraryPaths";
import { toPortableArchiveItem } from "./archiveExportPolicy";
import { readArchiveEntry, validateArchiveEntryBudget } from "./archiveBudget";
import { archiveKnowledgeImageNames, collectArchiveAnalyzedLibraries, readArchiveAnalyzedLibraries, remapArchiveKnowledgeImages, type ArchiveAnalyzedLibraries } from "./archiveKnowledge";
import { appendArchiveWithKnowledge, archiveTaxonomy } from "./archiveKnowledgeStore";
import { readLibraryViewSettings, withViewSettingsWriteLock } from "./viewSettingsStore";

type JSZipConstructor = {
  new (): JSZip;
  loadAsync(data: Buffer): Promise<JSZip>;
};

const JSZipRuntime = loadJSZipConstructor();

type ArchiveResult = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
  requiresAuthorChoice?: boolean;
  unownedCount?: number;
  authorName?: string;
  categoryCount?: number;
  tagCount?: number;
};

/** 分享包 data.json 结构（方案 §十七）：v2 起携带可选 author，旧版导入器可忽略。 */
export type ArchiveManifest = Omit<LibraryFile, "schemaVersion"> & {
  schemaVersion: 1 | 2;
  author?: AuthorInfo;
  analyzedLibraries?: ArchiveAnalyzedLibraries;
};

/** 构建分享包清单：登录用户导出时注入 author，未登录则省略（旧版导入器不受影响）。 */
export function buildArchiveManifest(items: LibraryItem[], author: AuthorInfo | null, analyzedLibraries?: ArchiveAnalyzedLibraries): ArchiveManifest {
  const manifest: ArchiveManifest = {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    items: items.map(toPortableArchiveItem),
  };
  if (author) {
    manifest.author = author;
  }
  if (analyzedLibraries) manifest.analyzedLibraries = analyzedLibraries;
  return manifest;
}

export async function exportLibraryZip(itemIds: string[], authorChoice?: "keep" | "associate"): Promise<ArchiveResult> {
  const exportAuthor = await snapshotWorkAuthor();
  const { library, settings } = await withViewSettingsWriteLock(async () => ({
    library: await readLibraryFile(), settings: await readLibraryViewSettings(),
  }));
  const selectedIds = new Set(itemIds);
  let items = itemIds.length > 0 ? library.items.filter((item) => selectedIds.has(item.id)) : library.items;
  const unownedCount = items.filter(item => !hasWorkAuthor(item)).length;
  if (exportAuthor && unownedCount && !authorChoice) {
    return {
      canceled: false,
      filePath: null,
      exportedCount: 0,
      requiresAuthorChoice: true,
      unownedCount,
      authorName: exportAuthor.username,
    };
  }
  if (exportAuthor && unownedCount && authorChoice === "associate") {
    items = items.map(item => attributeWork(item, exportAuthor));
  }
  const defaultFileName = formatExportFileName("提示词", "zip");
  const result = await dialog.showSaveDialog({
    title: "导出分享包",
    defaultPath: defaultFileName,
    filters: [{ name: "ZIP 分享包", extensions: ["zip"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null, exportedCount: 0 };
  }

  // 方案 §十七：v2 携带导出作者（登录用户）；author 缺省时旧版导入器仍可读。
  reportExportProgress("正在整理作者、分类与标签…");
  const avatars = await collectAuthorAvatars(items);
  const knowledge = collectArchiveAnalyzedLibraries(items, archiveTaxonomy(library, settings), settings.promptLexicons);
  const coverEntries: Array<{ zipPath: string; sourcePath: string }> = [];
  const itemImageNames = new Set(items.map(item => item.imageFileName));
  const libraryImages = new Map(library.items.map(item => [item.imageFileName, item]));
  for (const name of archiveKnowledgeImageNames(knowledge)) {
    if (itemImageNames.has(name)) continue;
    const coverItem = libraryImages.get(name);
    const sourcePath = coverItem ? await resolveMediaAbsolutePath(coverItem) : getImagePath(name);
    await fs.access(sourcePath).catch(() => {
      throw new AppError("ZIP_KNOWLEDGE_IMAGE_MISSING", "分类或标签的封面图已丢失，请重新设置对应封面后导出。");
    });
    coverEntries.push({ zipPath: `knowledge-images/${name}`, sourcePath });
  }
  const extraEntries = [...avatars.entries, ...coverEntries];
  const counts = { categoryCount: knowledge.categories.length, tagCount: knowledge.tags.length };
  const exportFile = buildArchiveManifest(avatars.items, exportAuthor, knowledge);
  // Root author identifies the exporter, never overrides individual ownership.
  if (exportFile.author?.avatarUrl?.startsWith("app-account-avatar:")) delete exportFile.author.avatarUrl;
  const dataJson = JSON.stringify(exportFile, null, 2);

  const mediaEntries: Array<{ zipPath: string; sourcePath: string }> = [];
  reportExportProgress("正在检查素材文件…", 0, { completed: 0, total: items.length });
  for (const item of items) {
    try {
      const sourcePath = await resolveMediaAbsolutePath(item);
      await fs.access(sourcePath);
      mediaEntries.push({ zipPath: `images/${item.imageFileName}`, sourcePath });
    } catch {
      throw new AppError("ZIP_MEDIA_MISSING", `源文件缺失，无法导出：${item.title || item.imageFileName}`);
    }
    reportExportProgress("正在检查素材文件…", mediaEntries.length / items.length * 100,
      { completed: mediaEntries.length, total: items.length });
  }
  const entries = [...extraEntries, ...mediaEntries];
  await writeZipInBackground(result.filePath, [{ zipPath: "data.json", text: dataJson }, ...entries],
    temporaryPath => exportViaRust(temporaryPath, dataJson, entries));

  return { canceled: false, filePath: result.filePath, exportedCount: items.length, ...counts };
}

export async function importLibraryZip(): Promise<{
  canceled: boolean;
  library: LibraryFile;
  importedCount: number;
  settings?: LibraryViewSettings;
}> {
  const result = await dialog.showOpenDialog({
    title: "导入分享包",
    properties: ["openFile"],
    filters: [{ name: "ZIP 分享包", extensions: ["zip"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, library: await readLibraryFile(), importedCount: 0 };
  }

  const currentAuthor = await snapshotWorkAuthor();
  const filePath = result.filePaths[0];

  // 整包读入内存前先做结构预检，截断/损坏文件会在毫秒级失败，避免
  // JSZip 加载数分钟后才抛 `Corrupted zip: missing N bytes` 的底层错误。
  await assertZipIntegrity(filePath);

  const fileStat = await fs.stat(filePath).catch((error: unknown) => {
    throw new AppError("ZIP_READ_FAILED", `读取分享包文件失败：${describeError(error)}`);
  });
  validateArchiveEntryBudget(fileStat.size, 0);

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (error) {
    throw new AppError("ZIP_READ_FAILED", `读取分享包文件失败：${describeError(error)}`);
  }

  let zip: JSZip;
  try {
    zip = await JSZipRuntime.loadAsync(buffer);
  } catch (error) {
    throw new ZipCorruptError(`分享包文件无法解析（${describeError(error)}），可能已损坏，请让发送方重新导出后再导入。`);
  }

  const archiveEntries = Object.values(zip.files).filter(entry => !entry.dir);
  validateArchiveEntryBudget(buffer.length, archiveEntries.length, archiveEntries);

  const dataFile = zip.file("data.json");

  if (!dataFile) {
    throw new AppError("ZIP_DATA_MISSING", "分享包缺少 data.json。");
  }

  let dataJsonText: string;
  let extractedBytes = 0;
  try {
    const dataBuffer = await readArchiveEntry(dataFile, "data.json", () => extractedBytes, next => {
      extractedBytes = next;
    });
    dataJsonText = dataBuffer.toString("utf8");
  } catch (error) {
    throw new ZipCorruptError(`分享包 data.json 读取失败（${describeError(error)}），文件可能已损坏。`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataJsonText);
  } catch {
    throw new AppError("ZIP_SCHEMA_INVALID", "分享包数据结构不合法。");
  }

  if (!isArchiveLibrary(parsed)) {
    throw new AppError("ZIP_SCHEMA_INVALID", "分享包数据结构不合法。");
  }

  const knowledge = readArchiveAnalyzedLibraries(parsed.analyzedLibraries);
  const importedItems: LibraryItem[] = [];
  const writtenMediaNames: string[] = [];
  const imageNames = new Map<string, string>();

  try {
    for (const item of parsed.items) {
      const sourceImage = zip.file(`images/${item.imageFileName}`);

      if (!sourceImage) {
        throw new AppError("ZIP_IMAGE_MISSING", `分享包缺少素材 ${item.imageFileName}。`);
      }

      const nextId = randomUUID();
      const extension = path.extname(item.imageFileName) || ".png";
      let imageBuffer: Buffer;
      try {
        imageBuffer = await readArchiveEntry(sourceImage, item.imageFileName, () => extractedBytes, next => {
          extractedBytes = next;
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new ZipCorruptError(
          `分享包内素材 ${item.imageFileName} 读取失败（${describeError(error)}），文件可能已损坏，请让发送方重新导出后再导入。`,
        );
      }
      const imageFileName = await writeImportMediaBuffer(nextId, imageBuffer, extension);
      writtenMediaNames.push(imageFileName);
      imageNames.set(item.imageFileName, imageFileName);
      const now = new Date().toISOString();
      const authorAvatarUrl = await restoreAuthorAvatar(item.authorAvatarUrl, async entry => {
        const avatar = zip.file(entry);
        if (!avatar) throw new AppError("ZIP_AVATAR_MISSING", "分享包缺少作者头像。");
        return readArchiveEntry(avatar, entry, () => extractedBytes, next => {
          extractedBytes = next;
        });
      });

      importedItems.push({
        ...item,
        authorAvatarUrl,
        ...(currentAuthor && item.accountOwnerUid === currentAuthor.uid
          ? { authorName: currentAuthor.username, authorAvatarUrl: currentAuthor.avatarUrl ?? null }
          : {}),
        id: nextId,
        imageFileName,
        mediaStorage: "managed",
        promptType: normalizePromptType(item.promptType, { ...item, imageFileName }),
        nsfwRating: normalizeNsfwRating(item.nsfwRating),
        nsfwCheckedAt: null,
        // Keep the original/additional image order even when the ZIP lists newest first.
        createdAt: Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : now,
        updatedAt: Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : now,
      });
    }

    if (knowledge) {
      for (const name of archiveKnowledgeImageNames(knowledge)) {
        if (imageNames.has(name)) continue;
        const cover = zip.file(`knowledge-images/${name}`);
        if (!cover) throw new AppError("ZIP_KNOWLEDGE_IMAGE_MISSING", "分享包缺少分类或标签封面，请重新导出。");
        const coverBuffer = await readArchiveEntry(cover, `knowledge-images/${name}`, () => extractedBytes, next => { extractedBytes = next; });
        const imageFileName = await writeImportImageBuffer(randomUUID(), coverBuffer, path.extname(name));
        writtenMediaNames.push(imageFileName);
        imageNames.set(name, imageFileName);
      }
    }
    await prepareImageThumbnails(writtenMediaNames.filter(name => !isVideoMediaFile(name)));
    const saved = knowledge
      ? await appendArchiveWithKnowledge(importedItems, remapArchiveKnowledgeImages(knowledge, imageNames))
      : { library: await appendLibraryItems(importedItems) };

    return { canceled: false, ...saved, importedCount: importedItems.length };
  } catch (error) {
    if (error instanceof AppError && error.code === "ZIP_IMPORT_ROLLBACK_FAILED") throw error;
    await Promise.allSettled(
      writtenMediaNames.flatMap(imageFileName => [
        fs.rm(getImagePath(imageFileName), { force: true }),
        fs.rm(getImageThumbnailPath(imageFileName), { force: true }),
      ]),
    );
    throw error;
  }
}


/** 优先用 Rust 流式导出 ZIP；返回 false 表示未启用或失败，调用方回退 JSZip。 */
async function exportViaRust(
  outputPath: string,
  dataJson: string,
  mediaEntries: Array<{ zipPath: string; sourcePath: string }>,
): Promise<boolean> {
  const dataFilePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "suyan-archive-")), "data.json");
  const tempDir = path.dirname(dataFilePath);

  try {
    await fs.writeFile(dataFilePath, dataJson, "utf8");

    const entries: Array<{ zipPath: string; sourcePath: string }> = [
      { zipPath: "data.json", sourcePath: dataFilePath },
      ...mediaEntries,
    ];

    const result = await createZipViaRust(outputPath, entries);
    return result !== null;
  } catch {
    // 源文件缺失或 Sidecar 不可用，回退 JSZip（其内部会抛出 ZIP_MEDIA_MISSING）。
    return false;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isArchiveLibrary(input: unknown): input is ArchiveManifest {
  if (!isRecord(input)) {
    return false;
  }

  // 兼容 v1（无 author）与 v2（携带 author）两种分享包（方案 §十七）。
  return (
    (input.schemaVersion === 1 || input.schemaVersion === 2) &&
    Array.isArray(input.items) &&
    input.items.every(isArchiveItem)
  );
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
    isOptionalString(input.categoryId) &&
    (input.genreIds == null || (Array.isArray(input.genreIds) && input.genreIds.every(id => typeof id === "string"))) &&
    isOptionalString(input.generationMethod) &&
    isOptionalPromptType(input.promptType) &&
    isOptionalString(input.sourceUrl) &&
    isOptionalString(input.authorName) &&
    isOptionalString(input.authorUrl) &&
    isOptionalString(input.authorAvatarUrl) &&
    isOptionalString(input.accountOwnerUid) &&
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
