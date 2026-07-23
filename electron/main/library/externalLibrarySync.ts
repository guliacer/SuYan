import fs from "node:fs/promises";
import path from "node:path";
import type {
  ExternalMediaStorage,
  LibraryFile,
  LibraryItem,
  LibraryRoot,
} from "../../../src/features/library/types/library";
import { warmLibraryItemThumbnails } from "./imageThumbnails";
import { readLibraryFile, writeLibraryFile } from "./libraryStore";
import { createExternalLibraryItem, isSupportedExternalMediaPath } from "./externalLibraryScanner";

export type ExternalLibraryChangeSet = {
  addedOrChangedPaths: readonly string[];
  removedPaths: readonly string[];
};

export type ExternalLibraryReconcileResult = {
  library: LibraryFile;
  changedCount: number;
  importedCount: number;
  missingCount: number;
  renamedCount: number;
  importedItems: LibraryItem[];
};

type AvailableFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
};

export async function syncExternalLibraryRoot(
  root: LibraryRoot,
  changes: ExternalLibraryChangeSet,
): Promise<ExternalLibraryReconcileResult> {
  const library = await readLibraryFile();
  const result = await reconcileExternalLibraryEvents(library, root, changes);

  if (result.changedCount === 0) {
    return result;
  }

  const persisted = await writeLibraryFile(result.library, { skipNormalize: true });
  warmLibraryItemThumbnails(result.importedItems);
  return { ...result, library: persisted };
}

/** Reconciles only watcher-touched paths and never writes to the mounted source directory. */
export async function reconcileExternalLibraryEvents(
  library: LibraryFile,
  root: LibraryRoot,
  changes: ExternalLibraryChangeSet,
): Promise<ExternalLibraryReconcileResult> {
  const now = new Date().toISOString();
  const items = [...library.items];
  const indexByRelativePath = new Map<string, number>();

  items.forEach((item, index) => {
    const storage = getRootStorage(item, root.id);

    if (storage) {
      indexByRelativePath.set(storage.relativePath, index);
    }
  });

  const addedPaths = uniqueContainedMediaPaths(root, changes.addedOrChangedPaths);
  const removedPaths = uniqueContainedMediaPaths(root, changes.removedPaths);
  const addedRelativePaths = new Set(addedPaths.map((entry) => entry.relativePath));
  const removedItemIndices: number[] = [];
  let changedCount = 0;
  let missingCount = 0;
  let renamedCount = 0;

  for (const { relativePath } of removedPaths) {
    if (addedRelativePaths.has(relativePath)) {
      continue;
    }

    const itemIndex = indexByRelativePath.get(relativePath);

    if (itemIndex === undefined) {
      continue;
    }

    const item = items[itemIndex];
    const storage = getRootStorage(item, root.id);

    if (!storage) {
      continue;
    }

    if (storage.status !== "missing") {
      items[itemIndex] = {
        ...item,
        mediaStorage: { ...storage, status: "missing" },
        updatedAt: now,
      };
      changedCount += 1;
      missingCount += 1;
    }
    removedItemIndices.push(itemIndex);
  }

  const availableFiles = (
    await mapWithConcurrency(
      addedPaths,
      16,
      async ({ absolutePath, relativePath }): Promise<AvailableFile | null> => {
        const stats = await fs.lstat(absolutePath).catch(() => null);
        return stats?.isFile()
          ? { absolutePath, relativePath, size: stats.size, mtimeMs: stats.mtimeMs }
          : null;
      },
    )
  ).filter((entry): entry is AvailableFile => entry !== null);
  const newFiles: AvailableFile[] = [];

  for (const file of availableFiles) {
    const itemIndex = indexByRelativePath.get(file.relativePath);

    if (itemIndex === undefined) {
      newFiles.push(file);
      continue;
    }

    const item = items[itemIndex];
    const storage = getRootStorage(item, root.id);

    if (!storage) {
      continue;
    }

    if (
      storage.status !== "available" ||
      storage.size !== file.size ||
      storage.mtimeMs !== file.mtimeMs
    ) {
      items[itemIndex] = {
        ...item,
        mediaStorage: {
          ...storage,
          size: file.size,
          mtimeMs: file.mtimeMs,
          status: "available",
        },
        updatedAt: now,
      };
      changedCount += 1;
    }
  }

  const removedBySignature = groupRemovedItemsBySignature(items, removedItemIndices, root.id);
  const addedBySignature = groupFilesBySignature(newFiles);
  const renamedFilePaths = new Set<string>();

  for (const [signature, itemIndices] of removedBySignature) {
    const matchingFiles = addedBySignature.get(signature);

    if (itemIndices.length !== 1 || matchingFiles?.length !== 1) {
      continue;
    }

    const itemIndex = itemIndices[0];
    const file = matchingFiles[0];
    const item = items[itemIndex];
    const storage = getRootStorage(item, root.id);

    if (!storage) {
      continue;
    }

    items[itemIndex] = {
      ...item,
      mediaStorage: {
        ...storage,
        relativePath: file.relativePath,
        size: file.size,
        mtimeMs: file.mtimeMs,
        status: "available",
      },
      updatedAt: now,
    };
    indexByRelativePath.delete(storage.relativePath);
    indexByRelativePath.set(file.relativePath, itemIndex);
    renamedFilePaths.add(file.absolutePath);
    changedCount += 1;
    missingCount = Math.max(0, missingCount - 1);
    renamedCount += 1;
  }

  const importedItems = (
    await mapWithConcurrency(
      newFiles.filter((file) => !renamedFilePaths.has(file.absolutePath)),
      4,
      (file) => createExternalLibraryItem(root, file.absolutePath, now).catch(() => null),
    )
  ).filter((item): item is LibraryItem => item !== null);

  changedCount += importedItems.length;
  return {
    library:
      changedCount > 0
        ? { ...library, updatedAt: now, items: [...importedItems, ...items] }
        : library,
    changedCount,
    importedCount: importedItems.length,
    missingCount,
    renamedCount,
    importedItems,
  };
}

function uniqueContainedMediaPaths(
  root: LibraryRoot,
  filePaths: readonly string[],
): Array<{ absolutePath: string; relativePath: string }> {
  const rootPath = path.resolve(root.absolutePath);
  const entries = new Map<string, string>();

  for (const filePath of filePaths) {
    const absolutePath = path.resolve(filePath);
    const relativePath = path.relative(rootPath, absolutePath);

    if (
      !relativePath ||
      path.isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      !isSupportedExternalMediaPath(relativePath)
    ) {
      continue;
    }

    entries.set(relativePath, absolutePath);
  }

  return [...entries].map(([relativePath, absolutePath]) => ({ absolutePath, relativePath }));
}

function getRootStorage(item: LibraryItem, rootId: string): ExternalMediaStorage | null {
  const storage = item.mediaStorage;
  return storage && storage !== "managed" && storage.rootId === rootId ? storage : null;
}

function groupRemovedItemsBySignature(
  items: readonly LibraryItem[],
  indices: readonly number[],
  rootId: string,
): Map<string, number[]> {
  const grouped = new Map<string, number[]>();

  for (const index of indices) {
    const storage = getRootStorage(items[index], rootId);
    const signature = storage ? createFileSignature(storage.relativePath, storage.size, storage.mtimeMs) : null;

    if (signature) {
      grouped.set(signature, [...(grouped.get(signature) ?? []), index]);
    }
  }

  return grouped;
}

function groupFilesBySignature(files: readonly AvailableFile[]): Map<string, AvailableFile[]> {
  const grouped = new Map<string, AvailableFile[]>();

  for (const file of files) {
    const signature = createFileSignature(file.relativePath, file.size, file.mtimeMs);

    if (signature) {
      grouped.set(signature, [...(grouped.get(signature) ?? []), file]);
    }
  }

  return grouped;
}

function createFileSignature(
  filePath: string,
  size: number | null | undefined,
  mtimeMs: number | null | undefined,
): string | null {
  return typeof size === "number" && typeof mtimeMs === "number"
    ? `${path.extname(filePath).toLowerCase()}:${size}:${Math.round(mtimeMs)}`
    : null;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}
