import fs from "node:fs/promises";
import type { LibraryFile, LibraryItem, ExternalMediaStatus } from "../../../src/features/library/types/library";
import { resolveExternalMediaPath } from "../../../src/features/library/utils/externalMediaPath";
import { readLibraryRoots } from "./libraryRoots";

export type ExternalMediaHealth = {
  status: ExternalMediaStatus;
  size: number | null;
  mtimeMs: number | null;
};

/** Reads external sources without touching them and returns a normalized health snapshot. */
export async function inspectExternalMedia(
  item: Pick<LibraryItem, "mediaStorage">,
  roots?: Awaited<ReturnType<typeof readLibraryRoots>>,
): Promise<ExternalMediaHealth | null> {
  const storage = item.mediaStorage;

  if (!storage || storage === "managed") {
    return null;
  }

  const availableRoots = roots ?? (await readLibraryRoots());
  const root = availableRoots.find((candidate) => candidate.id === storage.rootId);

  if (!root) {
    return { status: "missing", size: null, mtimeMs: null };
  }

  if (root.status === "missing") {
    return { status: "missing", size: null, mtimeMs: null };
  }

  let sourcePath: string;

  try {
    sourcePath = resolveExternalMediaPath(root.absolutePath, storage.relativePath);
  } catch {
    return { status: "missing", size: null, mtimeMs: null };
  }

  try {
    const stats = await fs.stat(sourcePath);

    if (!stats.isFile()) {
      return { status: "missing", size: null, mtimeMs: null };
    }

    return { status: "available", size: stats.size, mtimeMs: stats.mtimeMs };
  } catch {
    return { status: "missing", size: null, mtimeMs: null };
  }
}

/** Refreshes external health while preserving object identity when nothing changed. */
export async function refreshExternalMediaHealth(library: LibraryFile): Promise<LibraryFile> {
  const externalItems = library.items.filter((item) => item.mediaStorage && item.mediaStorage !== "managed");

  if (externalItems.length === 0) {
    return library;
  }

  const roots = await readLibraryRoots();
  const healthEntries = await mapWithConcurrency(externalItems, 32, async (item) => {
    return [item.id, await inspectExternalMedia(item, roots)] as const;
  });
  const healthById = new Map(healthEntries);
  let changed = false;

  const items = library.items.map((item) => {
    const health = healthById.get(item.id);

    if (!health || !item.mediaStorage || item.mediaStorage === "managed") {
      return item;
    }

    const current = item.mediaStorage;

    if (
      current.status === health.status &&
      (current.size ?? null) === health.size &&
      (current.mtimeMs ?? null) === health.mtimeMs
    ) {
      return item;
    }

    changed = true;
    return {
      ...item,
      mediaStorage: { ...current, ...health },
    };
  });

  return changed ? { ...library, items } : library;
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
