import { createRequire } from "node:module";
import path from "node:path";

type Sharp = {
  (buffer: Buffer, options?: { failOn?: "none" | "truncated" | "error" | "warning" }): SharpPipeline;
};

type SharpPipeline = {
  rotate(): SharpPipeline;
  /** 超分导出要保持原图 EXIF/ICC，需要显式透传元数据。 */
  withMetadata(): SharpPipeline;
  jpeg(options: { quality: number; mozjpeg?: boolean }): SharpPipeline;
  png(options: { compressionLevel: number; palette: boolean; quality?: number }): SharpPipeline;
  webp(options: { quality: number; effort?: number }): SharpPipeline;
  resize(options: { width?: number; height?: number; fit?: string; withoutEnlargement?: boolean }): SharpPipeline;
  /** format 由 sharp 从字节流嗅探，扩展名不可信时以此为准。
   *  orientation 来自 EXIF（1-8），5-8 表示需要旋转 90°，宽高要互换。 */
  metadata(): Promise<{ width?: number; height?: number; format?: string; orientation?: number }>;
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
