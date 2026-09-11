import fs from "node:fs/promises";
import { AppError } from "../ipc/errors";

/**
 * ZIP 结构完整性预检。
 *
 * 背景：JSZip 在读取截断/损坏的 ZIP 时，会先在内部抛出类似
 * `Corrupted zip: missing N bytes.` 的底层错误，且加载巨大文件时整个 Buffer
 * 会先读入内存，耗时可达数分钟后才失败。
 *
 * 这里只读取文件尾部（End of Central Directory 及 ZIP64 记录区），在整包读入
 * 内存之前快速判断文件是否被截断：
 * - 从尾部回扫 EOCD 签名 `PK\x05\x06`（含注释长度校验）；
 * - 解析其中的中央目录大小与偏移，与磁盘文件实际大小比对；
 * - 不一致（目录末尾超出文件末尾）说明文件不完整，立即抛 `ZIP_CORRUPTED`。
 *
 * ZIP64 归档同样支持：当 EOCD 的目录偏移/大小为 0xFFFFFFFF 时，按
 * ZIP64 EOCD 定位器与 ZIP64 EOCD 记录读取 64 位值。ZIP64 EOCD 记录紧邻
 * 定位器之前、定位器紧邻 EOCD 之前，因此三者都在我们读取的尾部范围内。
 */

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const EOCD_MIN_LENGTH = 22;
const MAX_COMMENT_LENGTH = 0xffff;
/** EOCD(22) + 注释(64KB) + 定位器(20) + ZIP64 EOCD 记录(56)。 */
const TAIL_READ_SIZE = 128 * 1024;

export type ZipTailInfo = {
  /** 中央目录在文件中的起始偏移。 */
  centralDirectoryOffset: number;
  /** 中央目录总字节数。 */
  centralDirectorySize: number;
  /** 条目总数（供调用方做进一步校验/日志）。 */
  entryCount: number;
  /** 是否 ZIP64 归档。 */
  zip64: boolean;
};

export class ZipCorruptError extends AppError {
  constructor(message: string) {
    super("ZIP_CORRUPTED", message);
  }
}

/**
 * 读取 ZIP 文件尾部并解析 EOCD，返回中央目录布局信息。
 * 文件过小、缺少 EOCD、或声明尺寸超出磁盘实际大小时抛 `ZIP_CORRUPTED`。
 */
export async function readZipTail(filePath: string): Promise<{ fileSize: number; tail: Buffer; info: ZipTailInfo }> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    throw new AppError("ZIP_READ_FAILED", `无法读取分享包文件：${describeError(error)}`);
  }
  const fileSize = stat.size;
  if (fileSize < EOCD_MIN_LENGTH) {
    throw new ZipCorruptError("分享包文件过小，不是有效的 ZIP 文件。");
  }

  const tailLength = Math.min(fileSize, TAIL_READ_SIZE);
  const tailStart = fileSize - tailLength;
  const handle = await fs.open(filePath, "r");
  try {
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, tailStart);
    const info = parseEndOfCentralDirectory(tail, fileSize);
    return { fileSize, tail, info };
  } finally {
    await handle.close();
  }
}

/**
 * 从尾部 Buffer 中解析 EOCD（含 ZIP64 回退），并校验声明范围未超出文件实际大小。
 * `fileSize` 用于把定位器中的绝对偏移换算成尾部 Buffer 内的相对下标。
 */
export function parseEndOfCentralDirectory(tail: Buffer, fileSize: number): ZipTailInfo {
  const eocdIndex = findEocdIndex(tail);
  if (eocdIndex < 0) {
    throw new ZipCorruptError("分享包缺少 ZIP 结束记录，文件可能不完整或不是有效的 ZIP 文件。");
  }

  const diskNumber = tail.readUInt16LE(eocdIndex + 4);
  const centralDirStartDisk = tail.readUInt16LE(eocdIndex + 6);
  if (diskNumber !== 0 || centralDirStartDisk !== 0) {
    throw new ZipCorruptError("分享包是分卷 ZIP，暂不支持导入。");
  }

  let entryCount = tail.readUInt16LE(eocdIndex + 10);
  let centralDirectorySize = tail.readUInt32LE(eocdIndex + 12);
  let centralDirectoryOffset = tail.readUInt32LE(eocdIndex + 16);
  let zip64 = false;

  const looksZip64 =
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    entryCount === 0xffff;

  if (looksZip64) {
    const zip64Info = tryParseZip64(tail, eocdIndex, fileSize);
    if (zip64Info) {
      zip64 = true;
      entryCount = zip64Info.entryCount;
      centralDirectorySize = zip64Info.centralDirectorySize;
      centralDirectoryOffset = zip64Info.centralDirectoryOffset;
    }
  }

  if (centralDirectoryOffset + centralDirectorySize > fileSize) {
    const missingBytes = centralDirectoryOffset + centralDirectorySize - fileSize;
    throw new ZipCorruptError(
      `分享包文件不完整，缺少约 ${formatBytes(missingBytes)} 数据（可能导出中断或传输未完成），请让发送方重新导出后再导入。`,
    );
  }

  return { centralDirectoryOffset, centralDirectorySize, entryCount, zip64 };
}

/**
 * 校验磁盘文件与尾部声明一致。
 * 仅当文件大小、EOCD、中央目录声明均一致时返回 true；异常抛 `ZIP_CORRUPTED`。
 */
export async function assertZipIntegrity(filePath: string): Promise<ZipTailInfo> {
  const { fileSize, info } = await readZipTail(filePath);
  if (fileSize <= 0) {
    throw new ZipCorruptError("分享包文件为空。");
  }
  if (info.centralDirectorySize <= 0) {
    throw new ZipCorruptError("分享包中央目录为空，文件可能不完整。");
  }
  return info;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function findEocdIndex(tail: Buffer): number {
  const maxStart = Math.max(0, tail.length - EOCD_MIN_LENGTH);
  const minStart = Math.max(0, tail.length - (EOCD_MIN_LENGTH + MAX_COMMENT_LENGTH));
  for (let index = maxStart; index >= minStart; index -= 1) {
    if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
      // 校验注释长度字段与尾部剩余空间一致，避免误命中任意 `PK\x05\x06` 字节。
      const commentLength = tail.readUInt16LE(index + 20);
      if (index + EOCD_MIN_LENGTH + commentLength <= tail.length) {
        return index;
      }
    }
  }
  return -1;
}

function tryParseZip64(tail: Buffer, eocdIndex: number, fileSize: number): {
  entryCount: number;
  centralDirectorySize: number;
  centralDirectoryOffset: number;
} | null {
  // ZIP64 EOCD 定位器紧邻 EOCD 之前：签名 + 磁盘号(4) + ZIP64 EOCD 偏移(8) + 总磁盘数(4)。
  const locatorIndex = eocdIndex - 20;
  if (locatorIndex < 0 || tail.readUInt32LE(locatorIndex) !== ZIP64_LOCATOR_SIGNATURE) {
    return null;
  }
  // 定位器中的偏移是相对于文件开头的绝对偏移，需要换算成尾部 Buffer 下标。
  const tailStart = fileSize - tail.length;
  const zip64EocdAbsolute = Number(readUInt64LE(tail, locatorIndex + 8));
  const recordIndex = zip64EocdAbsolute - tailStart;
  if (recordIndex < 0 || recordIndex + 56 > tail.length) {
    return null;
  }
  if (tail.readUInt32LE(recordIndex) !== ZIP64_EOCD_SIGNATURE) {
    return null;
  }
  const entryCount = Number(readUInt64LE(tail, recordIndex + 32));
  const centralDirectorySize = Number(readUInt64LE(tail, recordIndex + 40));
  const centralDirectoryOffset = Number(readUInt64LE(tail, recordIndex + 48));
  return { entryCount, centralDirectorySize, centralDirectoryOffset };
}

function readUInt64LE(buffer: Buffer, offset: number): bigint {
  return buffer.readBigUInt64LE(offset);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}