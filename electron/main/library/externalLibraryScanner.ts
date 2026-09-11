import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryItem, LibraryRoot } from "../../../src/features/library/types/library";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import {
  createEmptyPromptImportDraft,
  parsePromptDraftFromImageMetadata,
  type PromptImportDraft,
} from "../../shared/promptImportParser";
import { supportedImportVisualMediaExtensions } from "./importedImageWriter";
import { warmLibraryItemThumbnails } from "./imageThumbnails";
import { readLibraryFile, updateLibraryFile } from "./libraryStore";
import { getAuthorInfo } from "../account/accountService";
import { attributeLocalImports } from "./workAttribution";
import { readWorkFromImageFile } from "./workImageExchange";
import { readLibraryRoots, updateLibraryRoot } from "./libraryRoots";
import { mapWithConcurrency } from "./asyncMap";
import { scanMediaFilesViaRustStream } from "../runtime/rustFileOps";

export type ExternalScanProgress = {
  current: number;
  total: number;
  currentFile: string;
};

export type ExternalScanResult = {
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  root: LibraryRoot;
  importedCount: number;
  skippedCount: number;
};

export type ScannedExternalMediaFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
};

const supportedExtensions = new Set<string>(supportedImportVisualMediaExtensions.map((extension) => `.${extension}`));

export function isSupportedExternalMediaPath(filePath: string): boolean {
  return supportedExtensions.has(path.extname(filePath).toLowerCase());
}

export async function createExternalLibraryItem(
  root: LibraryRoot,
  absolutePath: string,
  now = new Date().toISOString(),
  knownStats?: Pick<ScannedExternalMediaFile, "size" | "mtimeMs">,
): Promise<LibraryItem> {
  const rootPath = path.resolve(root.absolutePath);
  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(rootPath, resolvedPath);

  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    throw new AppError("EXTERNAL_MEDIA_PATH_INVALID", "外链素材路径不在已注册目录内。");
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const id = randomUUID();
  const draft = await readPngMetadataDraft(resolvedPath);
  const fileStats = knownStats ?? await fs.stat(resolvedPath);
  const imageFileName = `${id}${extension}`;
  const work = await readWorkFromImageFile(resolvedPath);

  return {
    id,
    title: draft.title.trim() || path.basename(resolvedPath, extension),
    imageFileName,
    mediaStorage: {
      kind: "external",
      rootId: root.id,
      relativePath,
      size: fileStats.size,
      mtimeMs: fileStats.mtimeMs,
      status: "available",
    },
    prompt: draft.prompt,
    negativePrompt: draft.negativePrompt,
    category: null,
    tags: draft.tags,
    generationMethod: draft.generationMethod,
    promptType: normalizePromptType(undefined, {
      imageFileName,
      prompt: draft.prompt,
      tags: draft.tags,
      generationMethod: draft.generationMethod ?? "",
      title: draft.title,
    }),
    sourceUrl: null,
    authorName: null,
    authorUrl: null,
    authorAvatarUrl: null,
    ...work,
    createdAt: now,
    updatedAt: now,
  };
}

/** Indexes files in a registered root. It intentionally never writes the source media files. */
export async function scanExternalLibraryRoot(
  rootId: string,
  onProgress?: (progress: ExternalScanProgress) => void,
): Promise<ExternalScanResult> {
  const importAuthor = getAuthorInfo();
  const roots = await readLibraryRoots();
  const root = roots.find((candidate) => candidate.id === rootId);

  if (!root) {
    throw new AppError("LIBRARY_ROOT_NOT_FOUND", "素材目录不存在。请重新添加目录。");
  }

  const rootPath = path.resolve(root.absolutePath);
  const stats = await fs.stat(rootPath).catch(() => null);

  if (!stats?.isDirectory()) {
    throw new AppError("LIBRARY_ROOT_UNAVAILABLE", "素材目录不可访问，请检查磁盘或目录权限。");
  }

  const mediaFiles = await collectMediaFiles(rootPath, root.recursive);
  const library = await readLibraryFile({ refreshExternalHealth: true });
  const knownPaths = new Set(
    library.items
      .flatMap((item) => {
        const storage = item.mediaStorage;
        return storage && storage !== "managed" && storage.rootId === root.id ? [storage.relativePath] : [];
      }),
  );
  const now = new Date().toISOString();
  const candidates: ScannedExternalMediaFile[] = [];
  let skippedCount = 0;

  for (let index = 0; index < mediaFiles.length; index += 1) {
    const mediaFile = mediaFiles[index];
    onProgress?.({ current: index + 1, total: mediaFiles.length, currentFile: mediaFile.relativePath });

    if (!mediaFile.relativePath || knownPaths.has(mediaFile.relativePath)) {
      skippedCount += 1;
      continue;
    }

    candidates.push(mediaFile);
  }

  const scannedItems = await mapWithConcurrency(candidates, 4, (mediaFile) =>
    createExternalLibraryItem(root, mediaFile.absolutePath, now, mediaFile),
  );
  const items = await attributeLocalImports(scannedItems, importAuthor);

  let importedItems: LibraryItem[] = [];
  const nextLibrary = items.length > 0
    ? await updateLibraryFile((current) => {
        const latestKnownPaths = new Set(
          current.items.flatMap((item) => {
            const storage = item.mediaStorage;
            return storage && storage !== "managed" && storage.rootId === root.id ? [storage.relativePath] : [];
          }),
        );
        importedItems = items.filter((item) => {
          const storage = item.mediaStorage;
          return Boolean(storage && storage !== "managed" && !latestKnownPaths.has(storage.relativePath));
        });
        skippedCount += items.length - importedItems.length;
        return importedItems.length > 0
          ? { ...current, items: [...importedItems, ...current.items] }
          : null;
      })
    : library;
  const updatedRoot = await updateLibraryRoot({ ...root, lastScanAt: new Date().toISOString() });
  warmLibraryItemThumbnails(importedItems);
  logger.info("external-library", "scan:complete", {
    rootId: root.id,
    importedCount: importedItems.length,
    skippedCount,
    total: mediaFiles.length,
  });

  return { library: nextLibrary, root: updatedRoot, importedCount: importedItems.length, skippedCount };
}

export async function collectMediaPaths(rootPath: string, recursive: boolean): Promise<string[]> {
  const paths: string[] = [];
  const directoryConcurrency = recursive ? 8 : 1;
  let directories = [rootPath];

  while (directories.length > 0) {
    const currentDirectories = directories;
    directories = [];
    const batches = await mapWithConcurrency(currentDirectories, directoryConcurrency, async (directory) => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const childDirectories: string[] = [];
      const mediaPaths: string[] = [];

      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          if (recursive) {
            childDirectories.push(entryPath);
          }
          continue;
        }

        if (entry.isFile() && isSupportedExternalMediaPath(entry.name)) {
          mediaPaths.push(entryPath);
        }
      }

      return { childDirectories, mediaPaths };
    });

    for (const batch of batches) {
      paths.push(...batch.mediaPaths);
      directories.push(...batch.childDirectories);
    }
  }

  return paths.sort((left, right) => left.localeCompare(right));
}

export async function collectMediaFiles(rootPath: string, recursive: boolean): Promise<ScannedExternalMediaFile[]> {
  // Rust 实现启用时优先走 Sidecar（流式分页，避免单条 NDJSON 超 4MB 上限）；
  // 不可用则回退 Node。
  const rustResult = await scanMediaFilesViaRustStream(rootPath, recursive, supportedImportVisualMediaExtensions);
  if (rustResult) {
    return rustResult.files.map((file) => ({
      absolutePath: file.absolutePath,
      relativePath: file.relativePath,
      size: file.size,
      mtimeMs: file.mtimeMs,
    }));
  }

  const mediaPaths = await collectMediaPaths(rootPath, recursive);
  const scanned = await mapWithConcurrency(mediaPaths, 8, async (absolutePath) => {
    const stats = await fs.stat(absolutePath).catch(() => null);
    if (!stats?.isFile()) {
      return null;
    }

    return {
      absolutePath,
      relativePath: path.relative(path.resolve(rootPath), absolutePath),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    } satisfies ScannedExternalMediaFile;
  });

  return scanned.filter((entry): entry is ScannedExternalMediaFile => entry !== null);
}

async function readPngMetadataDraft(filePath: string): Promise<PromptImportDraft> {
  if (path.extname(filePath).toLowerCase() !== ".png") {
    return createEmptyPromptImportDraft();
  }

  try {
    return parsePromptDraftFromImageMetadata(new Uint8Array(await fs.readFile(filePath)));
  } catch (error) {
    logger.warn("external-library", "png-metadata:read-failed", {
      file: path.basename(filePath),
      message: error instanceof Error ? error.message : String(error),
    });
    return createEmptyPromptImportDraft();
  }
}
