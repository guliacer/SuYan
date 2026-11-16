import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { LibraryImportSource } from "../../../src/features/library/types/library";
import { normalizeLibraryImportSource } from "../../../src/features/library/utils/libraryImportSource";
export async function getCopiedImportSource(sourcePath: string, sourceRoot = path.dirname(sourcePath)): Promise<LibraryImportSource> {
  const root = path.resolve(sourceRoot); const source = path.resolve(sourcePath); const stat = await fs.stat(source);
  const metadata = normalizeLibraryImportSource({ rootId: createHash("sha256").update(root.toLowerCase()).digest("hex").slice(0,24), rootName: path.basename(root) || "导入素材", relativePath: path.relative(root, source).replaceAll("\\", "/"), size: stat.size, mtimeMs: stat.mtimeMs });
  if (!metadata) throw new Error("导入素材不在指定目录内。");
  return metadata;
}
