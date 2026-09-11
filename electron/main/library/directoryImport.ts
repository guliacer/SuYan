import { dialog } from "../app/fileDialogs";
import type { BrowserWindow } from "electron";
import path from "node:path";
import type { LibraryFile, LibraryItem } from "../../../src/features/library/types/library";
import { logger } from "../appLogger";
import { collectMediaPaths } from "./externalLibraryScanner";
import { copyImageFileToLibrary, isImportCanceled, resetImportCancellation } from "./imageFiles";
import { warmLibraryItemThumbnails } from "./imageThumbnails";
import { appendLibraryItems, readLibraryFile } from "./libraryStore";

export type ManagedDirectoryImportProgress = {
  current: number;
  total: number;
  currentFile: string;
};

export type ManagedDirectoryImportResult = {
  canceled: boolean;
  directoryLabel: string | null;
  importedCount: number;
  skippedCount: number;
  library: LibraryFile;
};

/** Copies supported visual media into the managed library without modifying source files. */
export async function chooseAndImportManagedDirectory(
  onProgress?: (progress: ManagedDirectoryImportProgress) => void,
  ownerWindow?: BrowserWindow | null,
): Promise<ManagedDirectoryImportResult> {
  resetImportCancellation();
  const options: Electron.OpenDialogOptions = {
    title: "选择要复制到软件目录的素材文件夹",
    properties: ["openDirectory"],
  };
  const selection = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);

  if (selection.canceled || selection.filePaths.length === 0) {
    return {
      canceled: true,
      directoryLabel: null,
      importedCount: 0,
      skippedCount: 0,
      library: await readLibraryFile(),
    };
  }

  const directoryPath = path.resolve(selection.filePaths[0]);
  const directoryLabel = path.basename(directoryPath) || directoryPath;
  const mediaPaths = await collectMediaPaths(directoryPath, true);
  const items: LibraryItem[] = [];
  let skippedCount = 0;

  for (let index = 0; index < mediaPaths.length; index += 1) {
    if (isImportCanceled()) {
      break;
    }

    const sourcePath = mediaPaths[index];
    onProgress?.({
      current: index + 1,
      total: mediaPaths.length,
      currentFile: path.relative(directoryPath, sourcePath),
    });

    try {
      const item = await copyImageFileToLibrary(sourcePath);
      items.push({
        ...item,
        title: item.title.trim() || path.basename(sourcePath, path.extname(sourcePath)),
        mediaStorage: "managed",
      });
    } catch (error) {
      skippedCount += 1;
      logger.warn("managed-directory-import", "file:skipped", {
        file: path.relative(directoryPath, sourcePath),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const library = items.length > 0 ? await appendLibraryItems(items) : await readLibraryFile();
  warmLibraryItemThumbnails(items);

  logger.info("managed-directory-import", "complete", {
    canceled: isImportCanceled(),
    directory: directoryLabel,
    importedCount: items.length,
    skippedCount,
    total: mediaPaths.length,
  });

  return {
    canceled: isImportCanceled(),
    directoryLabel,
    importedCount: items.length,
    skippedCount,
    library,
  };
}
