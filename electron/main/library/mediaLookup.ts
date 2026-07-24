import { getImagePath } from "./libraryPaths";
import { readLibraryFile } from "./libraryStore";
import { resolveMediaAbsolutePath } from "./mediaPathResolver";

export async function resolveLibraryMediaPath(imageFileName: string): Promise<string> {
  const library = await readLibraryFile();
  const item = library.items.find((candidate) => candidate.imageFileName === imageFileName);
  return item ? resolveMediaAbsolutePath(item) : getImagePath(imageFileName);
}
