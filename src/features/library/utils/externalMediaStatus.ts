import type { ExternalMediaStatus, LibraryItem } from "../types/library";

type MediaStatusItem = {
  mediaStatus?: ExternalMediaStatus | null;
};

export function prioritizeMissingLibraryItems<T extends Pick<LibraryItem, "mediaStorage">>(items: readonly T[]): T[] {
  return prioritizeMissingItems(items, (item) => {
    const storage = item.mediaStorage;
    return Boolean(storage && storage !== "managed" && storage.status === "missing");
  });
}

export function prioritizeMissingMediaStatusItems<T extends MediaStatusItem>(items: readonly T[]): T[] {
  return prioritizeMissingItems(items, (item) => item.mediaStatus === "missing");
}

function prioritizeMissingItems<T>(items: readonly T[], isMissing: (item: T) => boolean): T[] {
  const missingItems: T[] = [];
  const availableItems: T[] = [];

  for (const item of items) {
    (isMissing(item) ? missingItems : availableItems).push(item);
  }

  return [...missingItems, ...availableItems];
}
