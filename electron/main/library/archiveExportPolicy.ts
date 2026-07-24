import type { LibraryItem } from "../../../src/features/library/types/library";
import { AppError } from "../ipc/errors";

export async function collectArchiveExportEntries(
  items: readonly LibraryItem[],
  resolvePath: (item: Pick<LibraryItem, "imageFileName" | "mediaStorage">) => Promise<string>,
  readFile: (filePath: string) => Promise<Buffer>,
): Promise<Array<{ item: LibraryItem; imageBuffer: Buffer }>> {
  const entries: Array<{ item: LibraryItem; imageBuffer: Buffer }> = [];

  for (const item of items) {
    try {
      const imageBuffer = await readFile(await resolvePath(item));
      entries.push({ item, imageBuffer });
    } catch {
      throw new AppError("ZIP_MEDIA_MISSING", `源文件缺失，无法导出：${item.title || item.imageFileName}`);
    }
  }

  return entries;
}

export function toPortableArchiveItem(item: LibraryItem): LibraryItem {
  return { ...item, mediaStorage: "managed" };
}
