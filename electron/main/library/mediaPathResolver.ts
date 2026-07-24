import type { LibraryItem } from "../../../src/features/library/types/library";
import { resolveExternalMediaPath } from "../../../src/features/library/utils/externalMediaPath";
import { AppError } from "../ipc/errors";
import { getImagePath } from "./libraryPaths";
import { readLibraryRoots } from "./libraryRoots";

/** Resolves a LibraryItem to a readable path without exposing absolute paths to the renderer. */
export async function resolveMediaAbsolutePath(item: Pick<LibraryItem, "imageFileName" | "mediaStorage">): Promise<string> {
  if (!item.mediaStorage || item.mediaStorage === "managed") {
    return getImagePath(item.imageFileName);
  }

  const storage = item.mediaStorage;
  const root = (await readLibraryRoots()).find((candidate) => candidate.id === storage.rootId);

  if (!root) {
    throw new AppError("LIBRARY_ROOT_NOT_FOUND", "素材目录已移除，请重新添加目录。");
  }

  try {
    return resolveExternalMediaPath(root.absolutePath, storage.relativePath);
  } catch {
    throw new AppError("EXTERNAL_MEDIA_PATH_INVALID", "外链素材路径不在已注册目录内。");
  }
}
