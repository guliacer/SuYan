import { BrowserWindow } from "electron";
import { dialog } from "../app/fileDialogs";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ThemeBackgroundSelectionData } from "../../../src/types/suyanApi";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { getSharp } from "../runtime/imageRuntime";
import { getThemeBackgroundPath, getThemeBackgroundsDir } from "./libraryPaths";

const maxThemeBackgroundBytes = 50 * 1024 * 1024;
const maxThemeBackgroundSide = 4096;
const supportedThemeBackgroundExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

export async function chooseThemeBackgroundImage(ownerWindow?: BrowserWindow | null): Promise<ThemeBackgroundSelectionData> {
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, {
      title: "选择主题背景图片",
      properties: ["openFile"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    })
    : await dialog.showOpenDialog({
      title: "选择主题背景图片",
      properties: ["openFile"],
      filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, imageFileName: null };
  }

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).toLowerCase();
  if (!supportedThemeBackgroundExtensions.has(extension)) {
    throw new AppError("THEME_BACKGROUND_IMAGE_INVALID", "主题背景仅支持 PNG、JPEG、WebP、GIF 或 BMP 图片。");
  }

  const sourceBytes = await fs.readFile(sourcePath);
  if (sourceBytes.byteLength === 0 || sourceBytes.byteLength > maxThemeBackgroundBytes) {
    throw new AppError("THEME_BACKGROUND_IMAGE_TOO_LARGE", "主题背景图片不能超过 50 MB。");
  }

  const startedAt = Date.now();
  let normalizedBytes: Buffer;
  let metadata: { format?: string; width?: number; height?: number };

  try {
    const sharp = getSharp();
    metadata = await sharp(sourceBytes).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("图片缺少有效尺寸");
    }

    normalizedBytes = await sharp(sourceBytes)
      .rotate()
      .resize({
        width: maxThemeBackgroundSide,
        height: maxThemeBackgroundSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9, palette: false, quality: 100 })
      .toBuffer();

    if (normalizedBytes.byteLength === 0) {
      throw new Error("图片转换结果为空");
    }
  } catch (error) {
    logger.warn("theme", "background:decode-failed", {
      durationMs: Date.now() - startedAt,
      extension,
      sourceBytes: sourceBytes.byteLength,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError("THEME_BACKGROUND_IMAGE_INVALID", "主题背景图片无法解码，请重新选择图片。");
  }

  await fs.mkdir(getThemeBackgroundsDir(), { recursive: true });
  const imageFileName = `theme-background-${randomUUID()}.png`;
  const targetPath = getThemeBackgroundPath(imageFileName);
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  try {
    await fs.writeFile(tempPath, normalizedBytes);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    logger.warn("theme", "background:save-failed", {
      durationMs: Date.now() - startedAt,
      extension,
      sourceBytes: sourceBytes.byteLength,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logger.info("theme", "background:decoded", {
    durationMs: Date.now() - startedAt,
    format: metadata.format ?? "unknown",
    sourceExtension: extension,
    sourceBytes: sourceBytes.byteLength,
    outputBytes: normalizedBytes.byteLength,
    width: metadata.width,
    height: metadata.height,
  });

  return { canceled: false, imageFileName };
}

export async function removeThemeBackgroundImage(imageFileName: string | null): Promise<{ removed: boolean }> {
  if (typeof imageFileName !== "string" || path.basename(imageFileName) !== imageFileName) {
    return { removed: false };
  }

  try {
    await fs.rm(getThemeBackgroundPath(imageFileName), { force: true });
    return { removed: true };
  } catch {
    return { removed: false };
  }
}

export function isThemeBackgroundImageFileName(imageFileName: string): boolean {
  return path.basename(imageFileName) === imageFileName
    && imageFileName.startsWith("theme-background-")
    && supportedThemeBackgroundExtensions.has(path.extname(imageFileName).toLowerCase());
}
