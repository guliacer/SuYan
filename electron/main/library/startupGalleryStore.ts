import { app, clipboard, nativeImage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StartupGalleryImage } from "../../../src/types/suyanApi";
import { logger } from "../appLogger";
import { readClipboardFilePaths } from "../clipboard/readClipboardFilePaths";
import { AppError } from "../ipc/errors";
import {
  getLibraryDataDir,
  getStartupGalleryDir,
  getStartupGalleryImagePath,
  getStartupGalleryThumbnailPath,
  getStartupGalleryThumbnailsDir,
} from "./libraryPaths";

const startupGalleryManifestFileName = "manifest.json";
const startupGallerySeedMarkerFileName = ".startup-gallery-seeded";

const defaultStartupAssetFileNames = [
  "startup-default-1.png",
  "startup-default-2.png",
  "startup-default-3.png",
  "startup-default-4.png",
  "startup-default-5.png",
  "startup-default-6.png",
] as const;

const supportedStartupImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

type StartupGalleryManifest = {
  images: StartupGalleryImage[];
};

function getDefaultStartupAssetsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "startup-assets");
  }

  return path.join(__dirname, "../../../../electron/assets/startup-gallery");
}

function getStartupGalleryManifestPath(): string {
  return path.join(getStartupGalleryDir(), startupGalleryManifestFileName);
}

function getStartupGallerySeedMarkerPath(): string {
  return path.join(getStartupGalleryDir(), startupGallerySeedMarkerFileName);
}

function isSupportedStartupImage(fileName: string): boolean {
  return supportedStartupImageExtensions.has(path.extname(fileName).toLowerCase());
}

async function hasSeedMarker(): Promise<boolean> {
  try {
    await fs.access(getStartupGallerySeedMarkerPath());
    return true;
  } catch {
    return false;
  }
}

async function seedDefaultStartupImages(): Promise<void> {
  await fs.mkdir(getStartupGalleryDir(), { recursive: true });

  if (await hasSeedMarker()) {
    return;
  }

  const sourceDir = getDefaultStartupAssetsDir();

  await Promise.all(
    defaultStartupAssetFileNames.map(async (fileName) => {
      const destination = path.join(getStartupGalleryDir(), fileName);

      try {
        await fs.access(destination);
        return;
      } catch {
      }

      try {
        await fs.copyFile(path.join(sourceDir, fileName), destination);
      } catch {
      }
    }),
  );

  await fs.writeFile(getStartupGallerySeedMarkerPath(), new Date().toISOString(), "utf8");
}

function isDefaultStartupFile(fileName: string): boolean {
  return (defaultStartupAssetFileNames as readonly string[]).includes(fileName);
}

async function readManifest(): Promise<StartupGalleryManifest | null> {
  try {
    const content = await fs.readFile(getStartupGalleryManifestPath(), "utf8");
    const parsed = JSON.parse(content) as unknown;

    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as StartupGalleryManifest).images)) {
      return null;
    }

    return parsed as StartupGalleryManifest;
  } catch {
    return null;
  }
}

async function writeManifest(images: StartupGalleryImage[]): Promise<void> {
  await fs.mkdir(getStartupGalleryDir(), { recursive: true });
  const manifestPath = getStartupGalleryManifestPath();
  const tempPath = `${manifestPath}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify({ images } satisfies StartupGalleryManifest, null, 2), "utf8");
  await fs.rename(tempPath, manifestPath);
}

async function reconcileImages(): Promise<StartupGalleryImage[]> {
  await fs.mkdir(getStartupGalleryDir(), { recursive: true });

  const entries = await fs.readdir(getStartupGalleryDir(), { withFileTypes: true });
  const diskFileNames = entries
    .filter((entry) => entry.isFile() && isSupportedStartupImage(entry.name))
    .map((entry) => entry.name);
  const diskFileSet = new Set(diskFileNames);

  const manifest = await readManifest();
  const orderedFromManifest = manifest
    ? manifest.images.map((image) => image.fileName).filter((fileName) => diskFileSet.has(fileName))
    : [];
  const seen = new Set(orderedFromManifest);
  const appended = diskFileNames.filter((fileName) => !seen.has(fileName)).sort((a, b) => a.localeCompare(b));
  const orderedFileNames = [...orderedFromManifest, ...appended];

  const images = orderedFileNames.map((fileName, index) => ({
    fileName,
    isDefault: isDefaultStartupFile(fileName),
    order: index,
  }));

  await writeManifest(images);

  return images;
}

const maxStartupThumbnailSide = 1600;
const startupThumbnailJpegQuality = 88;
const startupThumbnailConcurrency = 3;

async function isFreshStartupThumbnail(imagePath: string, thumbnailPath: string): Promise<boolean> {
  try {
    const [imageStats, thumbnailStats] = await Promise.all([fs.stat(imagePath), fs.stat(thumbnailPath)]);

    return thumbnailStats.mtimeMs >= imageStats.mtimeMs && thumbnailStats.size > 0;
  } catch {
    return false;
  }
}

async function createStartupThumbnail(fileName: string): Promise<void> {
  const imagePath = getStartupGalleryImagePath(fileName);
  const thumbnailPath = getStartupGalleryThumbnailPath(fileName);

  if (await isFreshStartupThumbnail(imagePath, thumbnailPath)) {
    return;
  }

  const sourceImage = nativeImage.createFromPath(imagePath);

  if (sourceImage.isEmpty()) {
    return;
  }

  const size = sourceImage.getSize();
  const maxSide = Math.max(size.width, size.height);
  const scale = maxSide > 0 ? Math.min(1, maxStartupThumbnailSide / maxSide) : 1;
  const thumbnailImage =
    scale < 1
      ? sourceImage.resize({
          height: Math.max(1, Math.round(size.height * scale)),
          quality: "good",
          width: Math.max(1, Math.round(size.width * scale)),
        })
      : sourceImage;

  await fs.mkdir(getStartupGalleryThumbnailsDir(), { recursive: true });
  const tempPath = `${thumbnailPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, thumbnailImage.toJPEG(startupThumbnailJpegQuality));
  await fs.rename(tempPath, thumbnailPath);
}

export async function getFreshStartupThumbnailPath(fileName: string): Promise<string | null> {
  try {
    const imagePath = getStartupGalleryImagePath(fileName);
    const thumbnailPath = getStartupGalleryThumbnailPath(fileName);

    return (await isFreshStartupThumbnail(imagePath, thumbnailPath)) ? thumbnailPath : null;
  } catch {
    return null;
  }
}

async function warmStartupThumbnails(fileNames: readonly string[]): Promise<void> {
  const targets = [...new Set(fileNames.filter(Boolean))];

  if (targets.length === 0) {
    return;
  }

  const startedAt = Date.now();
  let nextIndex = 0;
  let generatedCount = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < targets.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        await createStartupThumbnail(targets[currentIndex]);
        generatedCount += 1;
      } catch {
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(startupThumbnailConcurrency, targets.length) }, () => runWorker()),
  );

  logger.info("startup-gallery", "thumbnails:warm", {
    requested: targets.length,
    generated: generatedCount,
    durationMs: Date.now() - startedAt,
  });
}

async function removeStartupThumbnail(fileName: string): Promise<void> {
  try {
    await fs.rm(getStartupGalleryThumbnailPath(fileName), { force: true });
  } catch {
  }
}

export function warmStartupGalleryThumbnailsInBackground(images: readonly StartupGalleryImage[]): void {
  const fileNames = images.map((image) => image.fileName);

  void warmStartupThumbnails(fileNames).catch(() => undefined);
}

export async function ensureStartupGalleryStorage(): Promise<void> {
  await seedDefaultStartupImages();
  const images = await reconcileImages();
  warmStartupGalleryThumbnailsInBackground(images);
}

export async function listStartupGalleryImages(): Promise<StartupGalleryImage[]> {
  await seedDefaultStartupImages();
  return reconcileImages();
}

export async function importStartupGalleryImages(filePaths: string[]): Promise<StartupGalleryImage[]> {
  await fs.mkdir(getStartupGalleryDir(), { recursive: true });

  for (const sourcePath of filePaths) {
    const extension = path.extname(sourcePath).toLowerCase();

    if (!supportedStartupImageExtensions.has(extension)) {
      continue;
    }

    const targetFileName = `custom-${randomUUID()}${extension}`;

    await fs.copyFile(sourcePath, path.join(getStartupGalleryDir(), targetFileName));
  }

  const images = await reconcileImages();
  warmStartupGalleryThumbnailsInBackground(images);
  return images;
}

export async function importStartupGalleryImageFromClipboard(): Promise<{
  images: StartupGalleryImage[];
  importedCount: number;
}> {
  const image = clipboard.readImage();

  if (!image.isEmpty()) {
    await fs.mkdir(getStartupGalleryDir(), { recursive: true });

    const targetFileName = `clipboard-${randomUUID()}.png`;
    await fs.writeFile(path.join(getStartupGalleryDir(), targetFileName), image.toPNG());

    const images = await reconcileImages();
    warmStartupGalleryThumbnailsInBackground(images);

    return { images, importedCount: 1 };
  }

  const clipboardFilePaths = await readClipboardFilePaths();
  const importableFilePaths = clipboardFilePaths.filter((filePath) => isSupportedStartupImage(filePath));

  if (importableFilePaths.length === 0) {
    throw new AppError("STARTUP_GALLERY_CLIPBOARD_EMPTY", "剪贴板中没有可用图片。请先复制图片后再粘贴。");
  }

  const images = await importStartupGalleryImages(importableFilePaths);

  return { images, importedCount: importableFilePaths.length };
}

export async function removeStartupGalleryImage(fileName: string): Promise<StartupGalleryImage[]> {
  const targetPath = getStartupGalleryImagePath(fileName);

  try {
    await fs.rm(targetPath, { force: true });
  } catch (error) {
    throw new AppError("STARTUP_GALLERY_DELETE_FAILED", `无法删除启动页图片：${String(error)}`);
  }

  await removeStartupThumbnail(fileName);

  return reconcileImages();
}

export async function resetStartupGalleryToDefault(): Promise<StartupGalleryImage[]> {
  await fs.mkdir(getStartupGalleryDir(), { recursive: true });

  const entries = await fs.readdir(getStartupGalleryDir(), { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => fs.rm(path.join(getStartupGalleryDir(), entry.name), { force: true }).catch(() => undefined)),
  );

  await fs.rm(getStartupGalleryThumbnailsDir(), { recursive: true, force: true }).catch(() => undefined);

  await fs.rm(getStartupGallerySeedMarkerPath(), { force: true }).catch(() => undefined);
  await seedDefaultStartupImages();

  const images = await reconcileImages();
  warmStartupGalleryThumbnailsInBackground(images);
  return images;
}

export function getStartupGalleryDataDirForDialog(): string {
  return getLibraryDataDir();
}
