import { createRequire } from "node:module";
import path from "node:path";

let ffmpegPathCache: string | null | undefined;

export function resolveAsarUnpackedPath(resolvedPath: string | null): string | null {
  return resolvedPath ? resolvedPath.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked") : null;
}

export function getFfmpegPath(): string | null {
  if (ffmpegPathCache !== undefined) {
    return ffmpegPathCache;
  }

  const runtimeRequire = createRequire(__filename);
  ffmpegPathCache = resolveFfmpegPathFromRequire(runtimeRequire) ?? resolveFfmpegPathFromVendor();

  return ffmpegPathCache;
}

function resolveFfmpegPathFromRequire(runtimeRequire: ReturnType<typeof createRequire>): string | null {
  try {
    const mod = runtimeRequire("ffmpeg-static") as { default?: string } | string;
    const resolved = typeof mod === "string" ? mod : mod.default ?? null;

    return resolveAsarUnpackedPath(resolved);
  } catch {
    return null;
  }
}

function resolveFfmpegPathFromVendor(): string | null {
  if (!process.resourcesPath) {
    return null;
  }

  try {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));

    return resolveFfmpegPathFromRequire(vendorRequire);
  } catch {
    return null;
  }
}
