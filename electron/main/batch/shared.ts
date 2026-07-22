export type CompressProgress = {
  current: number;
  total: number;
  currentItem: string;
  savedBytes: number;
};

export type CompressResult = {
  processedCount: number;
  totalOriginalBytes: number;
  totalCompressedBytes: number;
  failedItems: { itemId: string; reason: string }[];
};

let compressAbortController = new AbortController();

export function cancelCompress(): void {
  compressAbortController.abort();
}

export function resetCompressCancellation(): void {
  compressAbortController = new AbortController();
}

export function isCompressCanceled(): boolean {
  return compressAbortController.signal.aborted;
}
