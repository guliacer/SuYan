import { archiveLimits } from "./archiveBudget";

/**
 * Large library exports use independent ZIP volumes instead of a multi-disk ZIP.
 * Each volume stays below the import decompression budget with room for metadata.
 */
export const ARCHIVE_VOLUME_TARGET_BYTES = Math.floor(1.5 * 1024 * 1024 * 1024);
export const ARCHIVE_VOLUME_MAX_MEDIA_ENTRIES = archiveLimits.maxEntries - 1;

export type SizedArchiveEntry<T> = {
  entry: T;
  size: number;
};

/**
 * Keep entry order stable while grouping by source size. The shared entries
 * (metadata, avatars, and knowledge covers) are present in every volume.
 */
export function planArchiveVolumes<T>(
  entries: readonly SizedArchiveEntry<T>[],
  sharedBytes = 0,
  targetBytes = ARCHIVE_VOLUME_TARGET_BYTES,
  maxEntries = ARCHIVE_VOLUME_MAX_MEDIA_ENTRIES,
): T[][] {
  const capacity = Math.max(1, targetBytes - Math.max(0, sharedBytes));
  const entryCapacity = Math.max(1, maxEntries);
  const volumes: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const { entry, size } of entries) {
    const entryBytes = Number.isFinite(size) && size > 0 ? size : 0;
    if (current.length > 0 && (currentBytes + entryBytes > capacity || current.length >= entryCapacity)) {
      volumes.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(entry);
    currentBytes += entryBytes;
  }

  if (current.length > 0 || volumes.length === 0) {
    volumes.push(current);
  }
  return volumes;
}
