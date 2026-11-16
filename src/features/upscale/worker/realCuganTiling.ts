import { MAX_REAL_CUGAN_OUTPUT_PIXELS } from "../utils/upscaleModels";

export const REAL_CUGAN_TILE_SIZE = 512;
export const REAL_CUGAN_OVERLAP = 32;
export const REAL_CUGAN_TILE_STRIDE = REAL_CUGAN_TILE_SIZE - REAL_CUGAN_OVERLAP * 2;

export type RealCuganTileRegion = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  outputX: number;
  outputY: number;
  outputWidth: number;
  outputHeight: number;
  scale: number;
};

export function buildTilePositions(
  size: number,
  tileSize = REAL_CUGAN_TILE_SIZE,
  stride = REAL_CUGAN_TILE_STRIDE,
): number[] {
  assertPositiveInteger(size, "图片尺寸");
  assertPositiveInteger(tileSize, "切片尺寸");
  assertPositiveInteger(stride, "切片步长");
  if (stride > tileSize) {
    throw new Error("UPSCALE_INPUT_UNSUPPORTED: 切片步长不得大于切片尺寸");
  }
  if (size <= tileSize) return [0];

  const positions: number[] = [];
  for (let position = 0; position + tileSize < size; position += stride) {
    positions.push(position);
  }
  const finalPosition = size - tileSize;
  if (positions.at(-1) !== finalPosition) {
    positions.push(finalPosition);
  }
  return positions;
}

export function buildTileRegions(
  width: number,
  height: number,
  scale: number,
): RealCuganTileRegion[] {
  const output = validateUpscaleOutputSize(width, height, scale);
  const xPositions = buildTilePositions(width);
  const yPositions = buildTilePositions(height);
  const xSegments = buildAxisSegments(width, xPositions, scale);
  const ySegments = buildAxisSegments(height, yPositions, scale);
  const regions: RealCuganTileRegion[] = [];

  for (const y of ySegments) {
    for (const x of xSegments) {
      regions.push({
        sourceX: x.position,
        sourceY: y.position,
        sourceWidth: x.sourceExtent,
        sourceHeight: y.sourceExtent,
        cropLeft: x.cropBefore,
        cropTop: y.cropBefore,
        cropRight: x.cropAfter,
        cropBottom: y.cropAfter,
        outputX: x.outputStart,
        outputY: y.outputStart,
        outputWidth: x.outputExtent,
        outputHeight: y.outputExtent,
        scale,
      });
    }
  }

  const finalRegion = regions.at(-1);
  if (!finalRegion || finalRegion.outputX + finalRegion.outputWidth !== output.width ||
      finalRegion.outputY + finalRegion.outputHeight !== output.height) {
    throw new Error("UPSCALE_INPUT_UNSUPPORTED: 切片区域未覆盖完整输出");
  }
  return regions;
}

export function validateUpscaleOutputSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  assertPositiveInteger(width, "图片宽度");
  assertPositiveInteger(height, "图片高度");
  assertPositiveInteger(scale, "超分倍率");
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight) ||
      outputWidth * outputHeight > MAX_REAL_CUGAN_OUTPUT_PIXELS) {
    throw new Error("UPSCALE_OUTPUT_TOO_LARGE: 超分结果超过 1.2 亿像素");
  }
  return { width: outputWidth, height: outputHeight };
}

type AxisSegment = {
  position: number;
  sourceExtent: number;
  cropBefore: number;
  cropAfter: number;
  outputStart: number;
  outputExtent: number;
};

function buildAxisSegments(length: number, positions: readonly number[], scale: number): AxisSegment[] {
  return positions.map((position, index) => {
    const sourceEnd = Math.min(length, position + REAL_CUGAN_TILE_SIZE);
    const previousPosition = positions[index - 1];
    const nextPosition = positions[index + 1];
    const contentStart = previousPosition === undefined
      ? 0
      : Math.floor((Math.min(length, previousPosition + REAL_CUGAN_TILE_SIZE) + position) / 2);
    const contentEnd = nextPosition === undefined
      ? length
      : Math.floor((sourceEnd + nextPosition) / 2);
    return {
      position,
      sourceExtent: sourceEnd - position,
      cropBefore: contentStart - position,
      cropAfter: sourceEnd - contentEnd,
      outputStart: contentStart * scale,
      outputExtent: (contentEnd - contentStart) * scale,
    };
  });
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`UPSCALE_INPUT_UNSUPPORTED: ${label}无效`);
  }
}
