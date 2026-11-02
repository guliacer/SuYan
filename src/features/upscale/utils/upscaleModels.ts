import type { UpscaleEngine, UpscaleModelId } from "../types";

export const MAX_REAL_CUGAN_OUTPUT_PIXELS = 120_000_000;

export type UpscaleModelDefinition = {
  id: UpscaleModelId;
  engine: UpscaleEngine;
  label: string;
  description: string;
  scale: 2 | 3 | 4;
  modelFileName: string | null;
  nativeModelName: string | null;
  denoiseLevel: -1 | 0 | 1 | 2 | 3 | null;
};

export const upscaleModelDefinitions: readonly UpscaleModelDefinition[] = [
  {
    id: "cugan-2x-no-denoise",
    engine: "real-cugan",
    label: "2x 无降噪",
    description: "保留原画细节",
    scale: 2,
    modelFileName: "up2x-latest-no-denoise-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: -1,
  },
  {
    id: "cugan-2x-conservative",
    engine: "real-cugan",
    label: "2x 保守降噪",
    description: "温和去噪，不改变画风",
    scale: 2,
    modelFileName: "up2x-latest-conservative-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 0,
  },
  {
    id: "cugan-2x-denoise1",
    engine: "real-cugan",
    label: "2x 轻度降噪",
    description: "轻度去除噪点",
    scale: 2,
    modelFileName: "up2x-latest-denoise1x-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 1,
  },
  {
    id: "cugan-2x-denoise2",
    engine: "real-cugan",
    label: "2x 中度降噪",
    description: "处理中等噪点与压缩痕迹",
    scale: 2,
    modelFileName: "up2x-latest-denoise2x-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 2,
  },
  {
    id: "cugan-2x-denoise3",
    engine: "real-cugan",
    label: "2x 强力降噪",
    description: "强力清理噪点与压缩痕迹",
    scale: 2,
    modelFileName: "up2x-latest-denoise3x-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 3,
  },
  {
    id: "cugan-3x-no-denoise",
    engine: "real-cugan",
    label: "3x 无降噪",
    description: "三倍放大，保留原画细节",
    scale: 3,
    modelFileName: "up3x-latest-no-denoise-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: -1,
  },
  {
    id: "cugan-3x-conservative",
    engine: "real-cugan",
    label: "3x 保守降噪",
    description: "三倍放大并温和修复",
    scale: 3,
    modelFileName: "up3x-latest-conservative-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 0,
  },
  {
    id: "cugan-3x-denoise3",
    engine: "real-cugan",
    label: "3x 强力降噪",
    description: "三倍放大并强力去噪",
    scale: 3,
    modelFileName: "up3x-latest-denoise3x-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 3,
  },
  {
    id: "cugan-4x-no-denoise",
    engine: "real-cugan",
    label: "4x 无降噪",
    description: "四倍放大，保留原画细节",
    scale: 4,
    modelFileName: "up4x-latest-no-denoise-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: -1,
  },
  {
    id: "cugan-4x-conservative",
    engine: "real-cugan",
    label: "4x 保守降噪",
    description: "四倍放大并温和修复",
    scale: 4,
    modelFileName: "up4x-latest-conservative-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 0,
  },
  {
    id: "cugan-4x-denoise3",
    engine: "real-cugan",
    label: "4x 强力降噪",
    description: "四倍放大并强力去噪",
    scale: 4,
    modelFileName: "up4x-latest-denoise3x-fixed512.onnx",
    nativeModelName: null,
    denoiseLevel: 3,
  },
  {
    id: "esrgan-x4plus",
    engine: "real-esrgan",
    label: "Real-ESRGAN 通用 4x",
    description: "真实照片与通用图像修复",
    scale: 4,
    modelFileName: null,
    nativeModelName: "realesrgan-x4plus",
    denoiseLevel: null,
  },
  {
    id: "esrgan-x4plus-anime",
    engine: "real-esrgan",
    label: "Real-ESRGAN 动漫 4x",
    description: "动漫插画四倍增强",
    scale: 4,
    modelFileName: null,
    nativeModelName: "realesrgan-x4plus-anime",
    denoiseLevel: null,
  },
  {
    id: "esrgan-animevideov3-2x",
    engine: "real-esrgan",
    label: "AnimeVideo v3 2x",
    description: "轻量动漫模型，两倍放大",
    scale: 2,
    modelFileName: null,
    nativeModelName: "realesr-animevideov3",
    denoiseLevel: null,
  },
  {
    id: "esrgan-animevideov3-3x",
    engine: "real-esrgan",
    label: "AnimeVideo v3 3x",
    description: "轻量动漫模型，三倍放大",
    scale: 3,
    modelFileName: null,
    nativeModelName: "realesr-animevideov3",
    denoiseLevel: null,
  },
  {
    id: "esrgan-animevideov3-4x",
    engine: "real-esrgan",
    label: "AnimeVideo v3 4x",
    description: "轻量动漫模型，四倍放大",
    scale: 4,
    modelFileName: null,
    nativeModelName: "realesr-animevideov3",
    denoiseLevel: null,
  },
];

const modelDefinitionById = new Map(upscaleModelDefinitions.map((definition) => [definition.id, definition]));

export function isUpscaleModelId(input: unknown): input is UpscaleModelId {
  return typeof input === "string" && modelDefinitionById.has(input as UpscaleModelId);
}

export function getUpscaleModelDefinition(modelId: UpscaleModelId): UpscaleModelDefinition {
  const definition = modelDefinitionById.get(modelId);
  if (!definition) {
    throw new Error(`Unknown upscale model: ${modelId}`);
  }
  return definition;
}

export function estimateUpscaleOutput(
  width: number,
  height: number,
  scale: number,
): { allowed: boolean; outputHeight: number; outputPixels: number; outputWidth: number } {
  assertPositiveInteger(width, "width");
  assertPositiveInteger(height, "height");
  assertPositiveInteger(scale, "scale");

  const outputWidth = width * scale;
  const outputHeight = height * scale;
  const outputPixels = outputWidth * outputHeight;

  return {
    allowed: outputPixels <= MAX_REAL_CUGAN_OUTPUT_PIXELS,
    outputHeight,
    outputPixels,
    outputWidth,
  };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}
