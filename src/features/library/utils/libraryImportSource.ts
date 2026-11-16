import type { LibraryImportSource, LibraryItem, LibraryRoot } from "../types/library";
export function normalizeLibraryImportSource(value: unknown): LibraryImportSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const rootId = typeof source.rootId === "string" ? source.rootId.trim() : "";
  const rootName = typeof source.rootName === "string" ? source.rootName.trim() : "";
  const relativePath = typeof source.relativePath === "string" ? source.relativePath.replaceAll("\\", "/").trim() : "";
  if (!rootId || !rootName || !relativePath || relativePath.startsWith("/") || /^[a-z]:/i.test(relativePath) || relativePath.split("/").some(part => !part || part === "." || part === "..")) return null;
  return { rootId, rootName, relativePath, ...(typeof source.size === "number" && Number.isFinite(source.size) && source.size >= 0 ? { size: source.size } : {}), ...(typeof source.mtimeMs === "number" && Number.isFinite(source.mtimeMs) ? { mtimeMs: source.mtimeMs } : {}) };
}

export function getLibraryItemSourcePath(item: LibraryItem, root: LibraryRoot | undefined, managedLabel: string): string {
  const storage = item.mediaStorage;
  if (storage && storage !== "managed") {
    const rootPath = root?.absolutePath.replace(/[\\/]+$/, "") ?? "";
    return rootPath + "/" + storage.relativePath;
  }
  const source = item.importSource;
  return source ? source.rootName + "/" + source.relativePath : managedLabel;
}
