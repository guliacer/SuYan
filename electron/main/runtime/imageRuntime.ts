import { createRequire } from "node:module";
import path from "node:path";

type Sharp = {
  (buffer: Buffer): SharpPipeline;
};

type SharpPipeline = {
  jpeg(options: { quality: number; mozjpeg?: boolean }): SharpPipeline;
  png(options: { compressionLevel: number; palette: boolean; quality: number }): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  metadata(): Promise<unknown>;
  toBuffer(): Promise<Buffer>;
};

export type { Sharp, SharpPipeline };

let sharpCache: Sharp | null = null;

export function getSharp(): Sharp {
  if (sharpCache) return sharpCache;

  const runtimeRequire = createRequire(__filename);
  try {
    sharpCache = runtimeRequire("sharp") as Sharp;
    return sharpCache;
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    sharpCache = vendorRequire("sharp") as Sharp;
    return sharpCache;
  }
}

export function isSharpAvailable(): boolean {
  try {
    getSharp();
    return true;
  } catch {
    return false;
  }
}
