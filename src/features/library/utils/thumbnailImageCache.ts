const loadedImageSrcs = new Set<string>();
const resolvedThumbnailSrcs = new Map<string, string>();
const maxResolvedThumbnailCacheSize = 600;
const thumbnailCacheListeners = new Set<() => void>();
let thumbnailCacheVersion = 0;

export function getResolvedThumbnailSrc(imageFileName: string): string {
  return resolvedThumbnailSrcs.get(imageFileName) ?? "";
}

export function getThumbnailCacheVersion(): number {
  return thumbnailCacheVersion;
}

export function subscribeThumbnailCache(listener: () => void): () => void {
  thumbnailCacheListeners.add(listener);

  return () => {
    thumbnailCacheListeners.delete(listener);
  };
}

export function isImageSrcLoaded(src: string): boolean {
  return loadedImageSrcs.has(src);
}

export function rememberLoadedImageSrc(src: string): void {
  if (src) {
    loadedImageSrcs.add(src);
  }
}

export function rememberResolvedThumbnailSrc(imageFileName: string, src: string): void {
  const previousSrc = resolvedThumbnailSrcs.get(imageFileName);

  if (previousSrc === src) {
    return;
  }

  resolvedThumbnailSrcs.set(imageFileName, src);

  if (resolvedThumbnailSrcs.size <= maxResolvedThumbnailCacheSize) {
    notifyThumbnailCacheListeners();
    return;
  }

  const oldestKey = resolvedThumbnailSrcs.keys().next().value;

  if (typeof oldestKey === "string") {
    resolvedThumbnailSrcs.delete(oldestKey);
  }

  notifyThumbnailCacheListeners();
}

export function rememberResolvedThumbnailSrcs(sources: Record<string, { src: string }>): void {
  let hasChanged = false;

  for (const [imageFileName, source] of Object.entries(sources)) {
    const previousSrc = resolvedThumbnailSrcs.get(imageFileName);

    if (previousSrc === source.src) {
      continue;
    }

    resolvedThumbnailSrcs.set(imageFileName, source.src);
    hasChanged = true;
  }

  trimResolvedThumbnailCache();

  if (hasChanged) {
    notifyThumbnailCacheListeners();
  }
}

function trimResolvedThumbnailCache(): void {
  while (resolvedThumbnailSrcs.size > maxResolvedThumbnailCacheSize) {
    const oldestKey = resolvedThumbnailSrcs.keys().next().value;

    if (typeof oldestKey !== "string") {
      return;
    }

    resolvedThumbnailSrcs.delete(oldestKey);
  }
}

function notifyThumbnailCacheListeners(): void {
  thumbnailCacheVersion += 1;

  for (const listener of thumbnailCacheListeners) {
    listener();
  }
}
