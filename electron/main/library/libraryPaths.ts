import { app } from "electron";
import path from "node:path";
import { AppError } from "../ipc/errors";

export function getLibraryDataDir(): string {
  return path.join(app.getPath("userData"), "library");
}

export function getImagesDir(): string {
  return path.join(getLibraryDataDir(), "images");
}

export function getStartupGalleryDir(): string {
  return path.join(getLibraryDataDir(), "startup-gallery");
}

export function getCanvasReferenceImagesDir(): string {
  return path.join(getLibraryDataDir(), "canvas-references");
}

export function getPromptContentImagesDir(): string {
  return path.join(getLibraryDataDir(), "prompt-images");
}

export function getPromptContentImagesTrashDir(): string {
  return path.join(getPromptContentImagesDir(), ".trash");
}

export function getThemeBackgroundsDir(): string {
  return path.join(getLibraryDataDir(), "theme-backgrounds");
}

export function getThemeBackgroundPath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "主题背景图片文件名不合法。");
  }

  return path.join(getThemeBackgroundsDir(), safeFileName);
}

export function getPromptContentImagePath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "灵感图片文件名不合法。");
  }

  return path.join(getPromptContentImagesDir(), safeFileName);
}

export function getPromptContentImageTrashPath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "灵感图片文件名不合法。");
  }

  return path.join(getPromptContentImagesTrashDir(), safeFileName);
}

export function getCanvasReferenceImagePath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "画布参考图文件名不合法。");
  }

  return path.join(getCanvasReferenceImagesDir(), safeFileName);
}

export function getStartupGalleryImagePath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "启动页图片文件名不合法。");
  }

  return path.join(getStartupGalleryDir(), safeFileName);
}

export function getStartupGalleryThumbnailsDir(): string {
  return path.join(getStartupGalleryDir(), "thumbnails");
}

export function getStartupGalleryThumbnailPath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "启动页图片文件名不合法。");
  }

  return path.join(getStartupGalleryThumbnailsDir(), `${safeFileName}.w1600.jpg`);
}

export function getImageThumbnailsDir(): string {
  return path.join(getLibraryDataDir(), "thumbnails");
}

export function getLibraryPath(): string {
  return path.join(getLibraryDataDir(), "library.json");
}

export function getPromptsPath(): string {
  return path.join(getLibraryDataDir(), "prompts.json");
}

export function getTodosPath(): string {
  return path.join(getLibraryDataDir(), "todos.json");
}

export function getLibraryRootsPath(): string {
  return path.join(getLibraryDataDir(), "library-roots.json");
}

export function getLibraryViewSettingsPath(): string {
  return path.join(getLibraryDataDir(), "view-settings.json");
}

export function getCategoryLexiconPath(): string {
  return path.join(getLibraryDataDir(), "category-lexicon.json");
}

export function getTagLexiconPath(): string {
  return path.join(getLibraryDataDir(), "tag-lexicon.json");
}

export function getLexiconPathForKind(kind: "categories" | "tags"): string {
  return kind === "categories" ? getCategoryLexiconPath() : getTagLexiconPath();
}

export function getAiSettingsPath(): string {
  return path.join(getLibraryDataDir(), "ai-settings.json");
}

export function getAccountPath(): string {
  return path.join(getLibraryDataDir(), "account.json");
}

export function getProxySettingsPath(): string {
  return path.join(getLibraryDataDir(), "proxy-settings.json");
}

export function getWindowStatePath(): string {
  return path.join(getLibraryDataDir(), "window-state.json");
}

export function getImagePath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "图片文件名不合法。");
  }

  return path.join(getImagesDir(), safeFileName);
}

export function getImageThumbnailPath(imageFileName: string): string {
  const safeFileName = path.basename(imageFileName);

  if (safeFileName !== imageFileName || !safeFileName) {
    throw new AppError("INVALID_IMAGE_FILE_NAME", "图片文件名不合法。");
  }

  return path.join(getImageThumbnailsDir(), `${safeFileName}.w640.jpg`);
}
