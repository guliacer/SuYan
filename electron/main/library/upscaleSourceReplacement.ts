import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { LibraryFile } from "../../../src/features/library/types/library";
import type { UpscaleReplaceSourceResult } from "../../../src/features/upscale/types";
import { AppError } from "../ipc/errors";
import { getImagePath, getImageThumbnailPath, getImagesDir } from "./libraryPaths";
import { updateLibraryFile } from "./libraryStore";

export type ReplaceLibrarySourceImageRequest = {
  sourceItemId: string;
  expectedImageFileName: string;
  bytes: Buffer;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
};

export type ReplacementDependencies = {
  writeManagedImage(bytes: Buffer, mediaType: ReplaceLibrarySourceImageRequest["mediaType"]): Promise<string>;
  updateLibrary(
    updater: (library: LibraryFile) => LibraryFile | null,
  ): Promise<LibraryFile>;
  removeManagedImage(imageFileName: string): Promise<void>;
  removeThumbnail(imageFileName: string): Promise<void>;
  logInfo(event: string, details: Record<string, unknown>): void;
  logWarn(event: string, details: Record<string, unknown>): void;
};

export function replaceLibrarySourceImage(
  request: ReplaceLibrarySourceImageRequest,
): Promise<UpscaleReplaceSourceResult> {
  return replaceLibrarySourceImageWithDependencies(request, createDefaultDependencies());
}

export async function replaceLibrarySourceImageWithDependencies(
  request: ReplaceLibrarySourceImageRequest,
  dependencies: ReplacementDependencies,
): Promise<UpscaleReplaceSourceResult> {
  assertReplacementRequest(request);
  const newImageFileName = await dependencies.writeManagedImage(request.bytes, request.mediaType).catch((error) => {
    throw replacementError(error, "新图片写入失败");
  });
  let oldManaged = false;

  try {
    const updated = await dependencies.updateLibrary((library) => {
      const itemIndex = library.items.findIndex((item) => item.id === request.sourceItemId);
      if (itemIndex < 0) {
        throw new AppError("UPSCALE_SOURCE_REPLACE_FAILED", "来源素材不存在或已被删除。");
      }
      const current = library.items[itemIndex];
      if (current.imageFileName !== request.expectedImageFileName) {
        throw new AppError("UPSCALE_SOURCE_REPLACE_FAILED", "来源图片已发生变化，请重新发送到超分。");
      }

      oldManaged = !current.mediaStorage || current.mediaStorage === "managed";
      const items = [...library.items];
      items[itemIndex] = {
        ...current,
        imageFileName: newImageFileName,
        mediaStorage: "managed",
        remoteImageUrl: null,
        remoteImageStatus: null,
        updatedAt: new Date().toISOString(),
      };
      return { ...library, items };
    });

    const oldStillReferenced = updated.items.some(
      (item) => item.imageFileName === request.expectedImageFileName,
    );
    if (!oldStillReferenced) {
      if (oldManaged) {
        await dependencies.removeManagedImage(request.expectedImageFileName).catch((error) => {
          dependencies.logWarn("source-replace-old-image-cleanup-failed", {
            imageFileName: request.expectedImageFileName,
            message: errorMessage(error),
          });
        });
      }
      await dependencies.removeThumbnail(request.expectedImageFileName).catch((error) => {
        dependencies.logWarn("source-replace-thumbnail-cleanup-failed", {
          imageFileName: request.expectedImageFileName,
          message: errorMessage(error),
        });
      });
    }

    dependencies.logInfo("source-replaced", {
      sourceItemId: request.sourceItemId,
      imageFileName: newImageFileName,
      replacedManagedMedia: oldManaged,
    });
    return { sourceItemId: request.sourceItemId, imageFileName: newImageFileName };
  } catch (error) {
    await dependencies.removeManagedImage(newImageFileName).catch((rollbackError) => {
      dependencies.logWarn("source-replace-rollback-failed", {
        imageFileName: newImageFileName,
        message: errorMessage(rollbackError),
      });
    });
    throw replacementError(error, "素材库更新失败");
  }
}

function createDefaultDependencies(): ReplacementDependencies {
  return {
    writeManagedImage: async (bytes, mediaType) => {
      await fs.mkdir(getImagesDir(), { recursive: true });
      const imageFileName = `${randomUUID()}${extensionFor(mediaType)}`;
      await fs.writeFile(getImagePath(imageFileName), bytes, { flag: "wx" });
      return imageFileName;
    },
    updateLibrary: (updater) => updateLibraryFile(updater),
    removeManagedImage: (imageFileName) => fs.rm(getImagePath(imageFileName), { force: true }),
    removeThumbnail: (imageFileName) => fs.rm(getImageThumbnailPath(imageFileName), { force: true }),
    logInfo: (event, details) => {
      void import("../appLogger")
        .then(({ logger }) => logger.info("library", event, details))
        .catch(() => undefined);
    },
    logWarn: (event, details) => {
      void import("../appLogger")
        .then(({ logger }) => logger.warn("library", event, details))
        .catch(() => undefined);
    },
  };
}

function assertReplacementRequest(request: ReplaceLibrarySourceImageRequest): void {
  if (!request.sourceItemId.trim() || !request.expectedImageFileName.trim()) {
    throw new AppError("UPSCALE_SOURCE_REPLACE_FAILED", "来源素材标识无效。");
  }
  if (request.bytes.length === 0) {
    throw new AppError("UPSCALE_SOURCE_REPLACE_FAILED", "超分结果为空。");
  }
}

function replacementError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError && error.code === "UPSCALE_SOURCE_REPLACE_FAILED") {
    return error;
  }
  return new AppError("UPSCALE_SOURCE_REPLACE_FAILED", `${fallback}：${errorMessage(error)}`);
}

function extensionFor(mediaType: ReplaceLibrarySourceImageRequest["mediaType"]): ".png" | ".jpg" | ".webp" {
  if (mediaType === "image/jpeg") return ".jpg";
  if (mediaType === "image/webp") return ".webp";
  return ".png";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message.trim() : "未知错误";
}
