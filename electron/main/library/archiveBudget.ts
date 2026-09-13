import { AppError } from "../ipc/errors";

export const archiveLimits = {
  maxEntries: 10_000,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalUncompressedBytes: 2 * 1024 * 1024 * 1024,
} as const;

export type ArchiveEntryLike = {
  dir?: boolean;
  name: string;
  async: (type: "nodebuffer") => Promise<Buffer>;
  _data?: { uncompressedSize?: number };
};

export function validateArchiveEntryBudget(
  // 保留压缩包大小参数以兼容现有调用方；分享包不再按压缩后体积设置固定上限。
  archiveBytes: number,
  entryCount: number,
  entries: ArchiveEntryLike[] = [],
): void {
  void archiveBytes;
  if (entryCount > archiveLimits.maxEntries) {
    throw new AppError("ZIP_TOO_MANY_ENTRIES", `分享包条目超过 ${archiveLimits.maxEntries} 项上限。`);
  }
  let declaredTotal = 0;
  for (const entry of entries) {
    const size = entry._data?.uncompressedSize;
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) continue;
    if (size > archiveLimits.maxEntryBytes) {
      throw new AppError("ZIP_ENTRY_TOO_LARGE", `分享包条目 ${entry.name} 超过单文件上限。`);
    }
    declaredTotal += size;
    if (declaredTotal > archiveLimits.maxTotalUncompressedBytes) {
      throw new AppError("ZIP_UNCOMPRESSED_TOO_LARGE", "分享包解压总量超过安全上限。");
    }
  }
}

export async function readArchiveEntry(
  entry: ArchiveEntryLike,
  label: string,
  getTotal: () => number,
  setTotal: (value: number) => void,
): Promise<Buffer> {
  const buffer = await entry.async("nodebuffer");
  if (buffer.length > archiveLimits.maxEntryBytes) {
    throw new AppError("ZIP_ENTRY_TOO_LARGE", `分享包条目 ${label} 超过单文件上限。`);
  }
  const total = getTotal() + buffer.length;
  if (total > archiveLimits.maxTotalUncompressedBytes) {
    throw new AppError("ZIP_UNCOMPRESSED_TOO_LARGE", "分享包解压总量超过安全上限。");
  }
  setTotal(total);
  return buffer;
}
