import { clipboard, nativeImage } from "electron";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { decodeGeneratedImageDataUrl } from "../library/generatedImageData";
import { getSharp } from "../runtime/imageRuntime";

/** 复制尚未收录的生成结果；仅处理内存图片，不导入素材库。 */
export async function copyGeneratedImageToClipboard(dataUrl: string): Promise<void> {
  try {
    if (typeof dataUrl !== "string" || dataUrl.length > 96 * 1024 * 1024) {
      throw new Error("Invalid image size");
    }
    const { buffer } = decodeGeneratedImageDataUrl(dataUrl);
    // 按实际内容解码并转换 PNG，兼容 MIME 不符及 WebP。
    const png = await getSharp()(buffer).png({ compressionLevel: 6, palette: false, quality: 100 }).toBuffer();
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty()) throw new Error("Empty native image");
    clipboard.writeImage(image);
    logger.info("library", "generated-image:copied", { byteLength: png.byteLength });
  } catch {
    logger.warn("library", "generated-image:copy-failed", { code: "IMAGE_COPY_FAILED" });
    throw new AppError("IMAGE_COPY_FAILED", "复制图片失败，图片数据无效或剪贴板暂不可用，请重试。");
  }
}
