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
import { appendLibraryItems, readLibraryFile } from "./libraryStore";
import { readLibraryRoots, updateLibraryRoot } from "./libraryRoots";

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

const supportedExtensions = new Set<string>(supportedImportVisualMediaExtensions.map((extension) => `.${extension}`));

export function isSupportedExternalMediaPath(filePath: string): boolean {
  return supportedExtensions.has(path.extname(filePath).toLowerCase());
}

export async function createExternalLibraryItem(
  root: LibraryRoot,
  absolutePath: string,
  now = new Date().toISOString(),
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
  const fileStats = await fs.stat(resolvedPath);
  const imageFileName = `${id}${extension}`;

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
    createdAt: now,
    updatedAt: now,
  };
}

/** Indexes files in a registered root. It intentionally never writes the source media files. */
export async function scanExternalLibraryRoot(
  rootId: string,
  onProgress?: (progress: ExternalScanProgress) => void,
): Promise<ExternalScanResult> {
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

  const mediaPaths = await collectMediaPaths(rootPath, root.recursive);
  const library = await readLibraryFile({ refreshExternalHealth: true });
  const knownPaths = new Set(
    library.items
      .flatMap((item) => {
        const storage = item.mediaStorage;
        return storage && storage !== "managed" && storage.rootId === root.id ? [storage.relativePath] : [];
      }),
  );
  const now = new Date().toISOString();
  const items: LibraryItem[] = [];
  let skippedCount = 0;

  for (let index = 0; index < mediaPaths.length; index += 1) {
    const absolutePath = mediaPaths[index];
    const relativePath = path.relative(rootPath, absolutePath);
    onProgress?.({ current: index + 1, total: mediaPaths.length, currentFile: relativePath });

    if (!relativePath || knownPaths.has(relativePath)) {
      skippedCount += 1;
      continue;
    }

    items.push(await createExternalLibraryItem(root, absolutePath, now));
  }

  const nextLibrary = items.length > 0 ? await appendLibraryItems(items) : library;
  const updatedRoot = await updateLibraryRoot({ ...root, lastScanAt: new Date().toISOString() });
  warmLibraryItemThumbnails(items);
  logger.info("external-library", "scan:complete", {
    rootId: root.id,
    importedCount: items.length,
    skippedCount,
    total: mediaPaths.length,
  });

  return { library: nextLibrary, root: updatedRoot, importedCount: items.length, skippedCount };
}

async function collectMediaPaths(rootPath: string, recursive: boolean): Promise<string[]> {
  const paths: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (recursive) {
          await visit(entryPath);
        }
        continue;
      }

      if (entry.isFile() && isSupportedExternalMediaPath(entry.name)) {
        paths.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return paths.sort((left, right) => left.localeCompare(right));
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
