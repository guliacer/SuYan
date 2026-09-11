import { clipboard, nativeImage } from "electron";
import fs from "node:fs/promises";
import { getSharp } from "../runtime/imageRuntime";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";

/** Chromium can display WebP/AVIF that nativeImage cannot decode. Normalize actual bytes first. */
export async function copyImageFileToClipboard(filePath: string, imageFileName: string): Promise<void> {
  let stage = "read";
  try {
    const bytes = await fs.readFile(filePath);
    stage = "decode";
    const png = await getSharp()(bytes).rotate().png({ compressionLevel: 6, palette: false, quality: 100 }).toBuffer();
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty()) throw new Error("Empty PNG image");
    stage = "write";
    clipboard.writeImage(image);
    logger.info("library", "copy:success", { imageFileName, decodeMode: "content-png", byteLength: bytes.length });
  } catch (error) {
    logger.warn("library", `copy:${stage}-failed`, {
      code: "IMAGE_COPY_FAILED", imageFileName,
      reason: (error as NodeJS.ErrnoException)?.code ?? "IMAGE_PROCESSING_FAILED",
    });
    throw new AppError("IMAGE_COPY_FAILED", stage === "read" ? "无法读取原图，请检查文件是否存在。"
      : stage === "decode" ? "原图无法解码，请检查图像文件是否完整。" : "系统剪贴板暂不可用，请重试。");
  }
}
