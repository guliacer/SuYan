import type { LibraryItem } from "../../../src/features/library/types/library";

export function getDeletableImageFileNames(
  deletedItems: LibraryItem[],
  remainingItems: LibraryItem[],
): string[] {
  const remainingImageFileNames = new Set(
    remainingItems.flatMap((item) => collectLibraryMediaFileNames(item)).filter(Boolean),
  );

  return Array.from(
    new Set(
      deletedItems
        .flatMap((item) => collectLibraryMediaFileNames(item))
        .filter((imageFileName) => imageFileName && !remainingImageFileNames.has(imageFileName)),
    ),
  );
}

export function collectLibraryMediaFileNames(
  item: Pick<LibraryItem, "imageFileName" | "videoPosterFileName" | "videoKeyframes" | "videoReferenceImages">,
): string[] {
  const fileNames: string[] = [];

  if (item.imageFileName) {
    fileNames.push(item.imageFileName);
  }

  if (item.videoPosterFileName) {
    fileNames.push(item.videoPosterFileName);
  }

  for (const keyframe of item.videoKeyframes ?? []) {
    if (keyframe.imageFileName) {
      fileNames.push(keyframe.imageFileName);
    }
  }

  for (const reference of item.videoReferenceImages ?? []) {
    if (reference) {
      fileNames.push(reference);
    }
  }

  return Array.from(new Set(fileNames.filter(Boolean)));
}
