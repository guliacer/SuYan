import fs from "node:fs/promises";
import path from "node:path";
import { getUpscalePaths, type UpscalePaths } from "./upscalePaths";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export async function cleanupUpscaleCache(
  now: Date | number = Date.now(),
  paths: UpscalePaths = getUpscalePaths(),
): Promise<{ removed: number }> {
  const cacheRoot = path.resolve(paths.cacheRoot);
  const cutoff = (now instanceof Date ? now.getTime() : now) - CACHE_MAX_AGE_MS;
  const entries = await fs.readdir(cacheRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const target = resolveDirectChild(cacheRoot, entry.name);
    const stats = await fs.lstat(target).catch(() => null);
    if (!stats?.isDirectory() || stats.isSymbolicLink() || stats.mtimeMs >= cutoff) {
      continue;
    }
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    removed += 1;
  }

  return { removed };
}

function resolveDirectChild(cacheRoot: string, childName: string): string {
  if (path.basename(childName) !== childName) {
    throw new Error("UPSCALE_CACHE_CLEANUP_FAILED: 缓存目录名称无效");
  }
  const target = path.resolve(cacheRoot, childName);
  if (path.dirname(target) !== cacheRoot) {
    throw new Error("UPSCALE_CACHE_CLEANUP_FAILED: 缓存目录逃逸");
  }
  return target;
}
