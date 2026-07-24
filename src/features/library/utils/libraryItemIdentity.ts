import type { LibraryItem, MediaStorage } from "../types/library";

export type LibraryItemReconcileStats = {
  reused: number;
  changed: number;
  added: number;
};

export function reconcileItemsByIdentity(
  previousItems: readonly LibraryItem[],
  nextItems: readonly LibraryItem[],
  stats?: LibraryItemReconcileStats,
): LibraryItem[] {
  if (previousItems.length === 0) {
    if (stats) {
      stats.added = nextItems.length;
    }
    return nextItems as LibraryItem[];
  }

  const previousById = new Map<string, LibraryItem>();
  for (const item of previousItems) {
    previousById.set(item.id, item);
  }

  let reusedCount = 0;
  const reconciled = nextItems.map((nextItem) => {
    const previousItem = previousById.get(nextItem.id);

    if (!previousItem) {
      if (stats) {
        stats.added += 1;
      }
      return nextItem;
    }

    if (previousItem !== nextItem && isSameLibraryItem(previousItem, nextItem)) {
      reusedCount += 1;
      return previousItem;
    }

    if (previousItem === nextItem) {
      reusedCount += 1;
      return previousItem;
    }

    if (stats) {
      stats.changed += 1;
    }
    return nextItem;
  });

  if (stats) {
    stats.reused = reusedCount;
  }

  if (reusedCount === nextItems.length && nextItems.length === previousItems.length) {
    return previousItems as LibraryItem[];
  }

  return reconciled;
}

export function isSameLibraryItem(a: LibraryItem, b: LibraryItem): boolean {
  if (a === b) {
    return true;
  }

  if (
    a.id !== b.id ||
    a.updatedAt !== b.updatedAt ||
    a.createdAt !== b.createdAt ||
    a.imageFileName !== b.imageFileName ||
    !areMediaStorageEqual(a.mediaStorage, b.mediaStorage) ||
    a.title !== b.title ||
    a.prompt !== b.prompt ||
    a.negativePrompt !== b.negativePrompt ||
    a.category !== b.category ||
    a.generationMethod !== b.generationMethod ||
    a.promptType !== b.promptType ||
    a.sourceUrl !== b.sourceUrl ||
    a.remoteImageUrl !== b.remoteImageUrl ||
    a.remoteImageStatus !== b.remoteImageStatus ||
    a.authorName !== b.authorName ||
    a.authorUrl !== b.authorUrl ||
    a.authorAvatarUrl !== b.authorAvatarUrl ||
    a.nsfwRating !== b.nsfwRating ||
    a.nsfwCheckedAt !== b.nsfwCheckedAt ||
    a.videoDurationSec !== b.videoDurationSec ||
    a.videoPosterFileName !== b.videoPosterFileName ||
    a.videoFramesGeneratedAt !== b.videoFramesGeneratedAt
  ) {
    return false;
  }

  if (!areStringArraysEqual(a.tags, b.tags)) {
    return false;
  }

  if (!areStringArraysEqual(a.videoReferenceImages, b.videoReferenceImages)) {
    return false;
  }

  return areVideoKeyframesEqual(a.videoKeyframes, b.videoKeyframes);
}

function areMediaStorageEqual(left: MediaStorage | undefined, right: MediaStorage | undefined): boolean {
  const leftIsManaged = !left || left === "managed";
  const rightIsManaged = !right || right === "managed";

  if (leftIsManaged || rightIsManaged) {
    return leftIsManaged === rightIsManaged;
  }

  return (
    left.rootId === right.rootId &&
    left.relativePath === right.relativePath &&
    (left.size ?? null) === (right.size ?? null) &&
    (left.mtimeMs ?? null) === (right.mtimeMs ?? null) &&
    (left.status ?? "available") === (right.status ?? "available")
  );
}

function areStringArraysEqual(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areVideoKeyframesEqual(
  left: LibraryItem["videoKeyframes"],
  right: LibraryItem["videoKeyframes"],
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftFrame = left[index];
    const rightFrame = right[index];

    if (
      leftFrame.imageFileName !== rightFrame.imageFileName ||
      leftFrame.atSec !== rightFrame.atSec ||
      leftFrame.label !== rightFrame.label
    ) {
      return false;
    }
  }

  return true;
}
