import { nativeImage } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CanvasReferenceImageData } from "../../../src/types/suyanApi";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import {
  getCanvasReferenceImagePath,
  getCanvasReferenceImagesDir,
} from "./libraryPaths";

const managedReferencePrefix = "canvas-reference-";
const maxReferenceImageBytes = 50 * 1024 * 1024;
const maxReferenceDataUrlChars = Math.ceil((maxReferenceImageBytes * 4) / 3) + 1024;

export async function saveCanvasReferenceImage(
  dataUrl: string,
  sourceFileName = "reference-image",
): Promise<CanvasReferenceImageData> {
  const sourceBytes = decodeImageDataUrl(dataUrl);
  const image = nativeImage.createFromBuffer(sourceBytes);

  if (image.isEmpty()) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_INVALID",
      "参考图无法解码，请改用 PNG、JPEG 或 WebP 图片。",
    );
  }

  const pngBytes = image.toPNG();
  if (pngBytes.byteLength === 0 || pngBytes.byteLength > maxReferenceImageBytes) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_TOO_LARGE",
      "参考图转换后超过 50 MB，请压缩或缩小图片后重试。",
    );
  }

  await fs.mkdir(getCanvasReferenceImagesDir(), { recursive: true });
  const fileName = `${managedReferencePrefix}${randomUUID()}.png`;
  const targetPath = getCanvasReferenceImagePath(fileName);
  const tempPath = `${targetPath}.${process.pid}.tmp`;

  await fs.writeFile(tempPath, pngBytes);
  await fs.rename(tempPath, targetPath);

  const size = image.getSize();
  const result = buildReferenceImageData(fileName, sourceFileName, pngBytes, size.width, size.height);
  logger.info("library", "canvas-reference:saved", {
    bytes: pngBytes.byteLength,
    height: result.height,
    width: result.width,
  });
  return result;
}

export async function readCanvasReferenceImage(fileName: string): Promise<CanvasReferenceImageData> {
  const imagePath = isManagedCanvasReferenceImage(fileName)
    ? getCanvasReferenceImagePath(fileName)
    : await resolveExistingLibraryReferencePath(fileName);

  let sourceBytes: Buffer;
  try {
    sourceBytes = await fs.readFile(imagePath);
  } catch {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_MISSING",
      "参考图文件已不存在，请重新选择图片。",
    );
  }

  if (sourceBytes.byteLength === 0 || sourceBytes.byteLength > maxReferenceImageBytes) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_TOO_LARGE",
      "参考图为空或超过 50 MB，请重新选择图片。",
    );
  }

  const image = nativeImage.createFromBuffer(sourceBytes);
  if (image.isEmpty()) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_INVALID",
      "参考图无法解码，请重新选择 PNG、JPEG 或 WebP 图片。",
    );
  }

  const pngBytes = image.toPNG();
  if (pngBytes.byteLength === 0 || pngBytes.byteLength > maxReferenceImageBytes) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_TOO_LARGE",
      "参考图转换后超过 50 MB，请压缩或缩小图片后重试。",
    );
  }

  const size = image.getSize();
  return buildReferenceImageData(fileName, fileName, pngBytes, size.width, size.height);
}

async function resolveExistingLibraryReferencePath(fileName: string): Promise<string> {
  const { resolveLibraryMediaPath } = await import("./mediaLookup");
  return resolveLibraryMediaPath(fileName);
}

export async function removeCanvasReferenceImage(fileName: string): Promise<{ removed: boolean }> {
  return { removed: await removeManagedCanvasReferenceImage(fileName) };
}

export function isManagedCanvasReferenceImage(fileName: string): boolean {
  return (
    path.basename(fileName) === fileName &&
    fileName.startsWith(managedReferencePrefix) &&
    fileName.toLowerCase().endsWith(".png")
  );
}

function decodeImageDataUrl(dataUrl: string): Buffer {
  if (typeof dataUrl !== "string" || dataUrl.length === 0 || dataUrl.length > maxReferenceDataUrlChars) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_TOO_LARGE",
      "参考图为空或超过 50 MB，请压缩后重试。",
    );
  }

  const match = /^data:[^;,]+;base64,([\s\S]+)$/i.exec(dataUrl.trim());
  const encoded = match?.[1]?.replace(/\s+/g, "") ?? "";
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_INVALID",
      "参考图数据无效，请重新选择图片。",
    );
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > maxReferenceImageBytes) {
    throw new AppError(
      "CANVAS_REFERENCE_IMAGE_TOO_LARGE",
      "参考图为空或超过 50 MB，请压缩后重试。",
    );
  }
  return bytes;
}

async function removeManagedCanvasReferenceImage(fileName: string): Promise<boolean> {
  if (!isManagedCanvasReferenceImage(fileName)) {
    return false;
  }

  try {
    await fs.rm(getCanvasReferenceImagePath(fileName), { force: true });
    return true;
  } catch {
    return false;
  }
}

function buildReferenceImageData(
  fileName: string,
  sourceFileName: string,
  pngBytes: Buffer,
  width: number,
  height: number,
): CanvasReferenceImageData {
  const title = path.parse(path.basename(sourceFileName.trim() || "reference-image")).name.trim();
  return {
    dataUrl: `data:image/png;base64,${pngBytes.toString("base64")}`,
    fileName,
    height,
    title: title || "参考图",
    width,
  };
}
