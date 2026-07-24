import type { BrowserWindow } from "electron";
import type { LibraryFile, LibraryRoot } from "../../../src/features/library/types/library";
import { refreshExternalMediaHealth } from "./externalMediaHealth";
import { readLibraryFile, writeLibraryFile } from "./libraryStore";
import { chooseAndRemapLibraryRoot, removeLibraryRoot } from "./libraryRoots";
import { deleteLibraryItems } from "./imageFiles";

export type ExternalValidationResult = {
  library: LibraryFile;
  missingCount: number;
  changedCount: number;
};

export async function validateExternalLibrary(): Promise<ExternalValidationResult> {
  const library = await readLibraryFile();
  const refreshed = await refreshExternalMediaHealth(library);
  const changedCount = countHealthChanges(library, refreshed);
  const nextLibrary = refreshed === library ? library : await writeLibraryFile(refreshed, { skipNormalize: true });

  return {
    library: nextLibrary,
    missingCount: countMissingItems(nextLibrary),
    changedCount,
  };
}

export async function remapExternalLibraryRoot(
  rootId: string,
  ownerWindow?: BrowserWindow | null,
): Promise<ExternalValidationResult & { root: LibraryRoot | null; canceled: boolean }> {
  const library = await readLibraryFile();
  const relativePaths = library.items.flatMap((item) => {
    const storage = item.mediaStorage;
    return storage && storage !== "managed" && storage.rootId === rootId ? [storage.relativePath] : [];
  });
  const selection = await chooseAndRemapLibraryRoot(rootId, relativePaths, ownerWindow);

  if (selection.canceled) {
    return {
      canceled: true,
      root: null,
      library,
      missingCount: countMissingItems(library),
      changedCount: 0,
    };
  }

  return { ...(await validateExternalLibrary()), canceled: false, root: selection.root };
}

export async function detachExternalLibraryRoot(
  rootId: string,
): Promise<ExternalValidationResult & { roots: LibraryRoot[]; removedItemCount: number }> {
  const library = await readLibraryFile();
  const itemIds = library.items.flatMap((item) => {
    const storage = item.mediaStorage;
    return storage && storage !== "managed" && storage.rootId === rootId ? [item.id] : [];
  });
  const deleteResult = itemIds.length > 0 ? await deleteLibraryItems(itemIds, true) : { library, deletedCount: 0 };
  const roots = await removeLibraryRoot(rootId);
  const validation = await validateExternalLibrary();

  return {
    ...validation,
    roots,
    removedItemCount: deleteResult.deletedCount,
  };
}

/** Removes library indexes (and app thumbnail cache) for missing external files under one root. Never deletes source media. */
export async function purgeMissingExternalLibraryItems(
  rootId: string,
): Promise<ExternalValidationResult & { removedItemCount: number }> {
  const validation = await validateExternalLibrary();
  const missingItemIds = validation.library.items.flatMap((item) => {
    const storage = item.mediaStorage;
    return storage &&
      storage !== "managed" &&
      storage.rootId === rootId &&
      storage.status === "missing"
      ? [item.id]
      : [];
  });

  if (missingItemIds.length === 0) {
    return {
      ...validation,
      removedItemCount: 0,
    };
  }

  // deleteImages=true only removes app-owned cache/managed files; external sources are not unlinked.
  const deleteResult = await deleteLibraryItems(missingItemIds, true);
  const nextValidation = await validateExternalLibrary();

  return {
    ...nextValidation,
    library: deleteResult.library,
    removedItemCount: deleteResult.deletedCount,
  };
}

function countMissingItems(library: LibraryFile): number {
  return library.items.filter((item) => {
    const storage = item.mediaStorage;
    return storage && storage !== "managed" && storage.status === "missing";
  }).length;
}

function countHealthChanges(before: LibraryFile, after: LibraryFile): number {
  const previousById = new Map(before.items.map((item) => [item.id, item.mediaStorage]));

  return after.items.filter((item) => {
    const previous = previousById.get(item.id);
    const current = item.mediaStorage;

    if (!previous || previous === "managed" || !current || current === "managed") {
      return false;
    }

    return (
      previous.status !== current.status ||
      (previous.size ?? null) !== (current.size ?? null) ||
      (previous.mtimeMs ?? null) !== (current.mtimeMs ?? null)
    );
  }).length;
}
