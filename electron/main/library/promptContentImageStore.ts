import { nativeImage } from "electron";
import { dialog } from "../app/fileDialogs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../ipc/errors";
import {
  getPromptContentImagePath,
  getPromptContentImagesDir,
  getPromptContentImagesTrashDir,
  getPromptContentImageTrashPath,
} from "./libraryPaths";

export type PromptContentImageResult = {
  canceled: boolean;
  imageFileName: string | null;
  width: number;
  height: number;
};

export async function choosePromptContentImage(): Promise<PromptContentImageResult> {
  const result = await dialog.showOpenDialog({
    title: "插入图片",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic", "heif", "tiff", "svg", "ico"] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, imageFileName: null, width: 0, height: 0 };
  }
  return savePromptContentImage(await fs.readFile(result.filePaths[0]));
}

export async function savePromptContentImageFromDataUrl(dataUrl: string): Promise<PromptContentImageResult> {
  if (!/^data:image\/(?:png|jpeg|jpg|webp|gif|bmp|avif|heic|heif|tiff|svg\+xml);base64,/i.test(dataUrl)) {
    throw new AppError("PROMPT_IMAGE_INVALID", "剪贴板中没有可用的图片。");
  }
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) throw new AppError("PROMPT_IMAGE_INVALID", "图片无法读取，请重试。");
  return savePromptContentImage(image.toPNG());
}

async function savePromptContentImage(buffer: Buffer): Promise<PromptContentImageResult> {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new AppError("PROMPT_IMAGE_INVALID", "图片无法读取，请重试。");
  const encodedPng = image.toPNG();
  const directory = getPromptContentImagesDir();
  await fs.mkdir(directory, { recursive: true });
  const imageFileName = await resolvePromptContentImageFileName(directory, encodedPng);
  const targetPath = getPromptContentImagePath(imageFileName);
  try {
    const existing = await fs.readFile(targetPath);
    if (existing.equals(encodedPng)) {
      const size = image.getSize();
      return { canceled: false, imageFileName, width: size.width, height: size.height };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const tempPath = path.join(directory, `.${randomUUID()}.tmp`);
  try {
    // Content-addressed names make repeated paste/import operations reuse the
    // same owned file while preserving old UUID-named files for compatibility.
    await fs.writeFile(tempPath, encodedPng);
    await fs.rename(tempPath, targetPath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const existing = await fs.readFile(targetPath).catch(() => null);
      if (existing?.equals(encodedPng)) {
        const size = image.getSize();
        return { canceled: false, imageFileName, width: size.width, height: size.height };
      }
    }
    throw new AppError("PROMPT_IMAGE_SAVE_FAILED", "图片保存失败，请重试。");
  }
  const size = image.getSize();
  return { canceled: false, imageFileName, width: size.width, height: size.height };
}

/** Exposed for deterministic tests and kept independent from Electron APIs. */
export function getPromptContentImageFileName(buffer: Uint8Array): string {
  const digest = createHash("sha256").update(buffer).digest("hex");
  return `prompt-${digest}.png`;
}

async function resolvePromptContentImageFileName(directory: string, buffer: Buffer): Promise<string> {
  const baseName = getPromptContentImageFileName(buffer);
  const extension = ".png";
  const stem = baseName.slice(0, -extension.length);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const imageFileName = suffix === 0 ? baseName : `${stem}-${suffix}${extension}`;
    const candidatePath = path.join(directory, imageFileName);
    try {
      const existing = await fs.readFile(candidatePath);
      if (existing.equals(buffer)) return imageFileName;
      // A user or a previous interrupted write occupied the hash name with
      // different bytes. Never overwrite it; probe a collision-safe suffix.
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return imageFileName;
      throw error;
    }
  }
  throw new AppError("PROMPT_IMAGE_SAVE_FAILED", "图片保存失败，请重试。");
}

export async function removePromptContentImages(imageFileNames: readonly string[]): Promise<void> {
  await Promise.all(imageFileNames.map(async (fileName) => {
    if (!isOwnedPromptContentImageFileName(fileName)) return;
    try {
      await fs.mkdir(getPromptContentImagesTrashDir(), { recursive: true });
      await fs.rename(getPromptContentImagePath(fileName), getPromptContentImageTrashPath(fileName));
    } catch {
      // 回收失败不应阻塞灵感正文保存；文件会保留在原目录。
    }
  }));
}

function isOwnedPromptContentImageFileName(fileName: string): boolean {
  return /^prompt-[a-f0-9]{64}(?:-\d+)?\.png$/i.test(fileName);
}
