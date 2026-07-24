import path from "node:path";

/** Resolves a relative media path while preventing it from escaping its registered root. */
export function resolveExternalMediaPath(rootPath: string, relativePath: string): string {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedMediaPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedMediaPath);

  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("EXTERNAL_MEDIA_PATH_INVALID");
  }

  return resolvedMediaPath;
}

/** Verifies every stored relative path remains contained before a root is remapped. */
export function validateExternalRemap(rootPath: string, relativePaths: readonly string[]): void {
  for (const relativePath of relativePaths) {
    resolveExternalMediaPath(rootPath, relativePath);
  }
}
