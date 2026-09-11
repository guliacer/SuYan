import { createRequire } from "node:module";
import path from "node:path";

type Sharp = {
  (buffer: Buffer): SharpPipeline;
};

type SharpPipeline = {
  rotate(): SharpPipeline;
  jpeg(options: { quality: number; mozjpeg?: boolean }): SharpPipeline;
  png(options: { compressionLevel: number; palette: boolean; quality: number }): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  resize(options: { width?: number; height?: number; fit?: string; withoutEnlargement?: boolean }): SharpPipeline;
  metadata(): Promise<{ width?: number; height?: number }>;
  stats(): Promise<{ channels: Array<{ max: number; min: number }> }>;
  toBuffer(): Promise<Buffer>;
  toFile(path: string): Promise<unknown>;
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
