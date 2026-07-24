import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell, type IpcMainEvent } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { ipcChannels } from "../shared/ipcChannels";
import { isVideoMediaFile } from "../../src/features/library/utils/mediaFileTypes";
import {
  getFreshImageThumbnailPath,
  getFreshImageThumbnailPathForItem,
  warmImageThumbnails,
  warmLibraryItemThumbnails,
} from "./library/imageThumbnails";
import { getImagePath, getStartupGalleryImagePath } from "./library/libraryPaths";
import { readLibraryFile } from "./library/libraryStore";
import { resolveMediaAbsolutePath } from "./library/mediaPathResolver";
import { ensureStartupGalleryStorage, getFreshStartupThumbnailPath } from "./library/startupGalleryStore";
import { waitForImportedVideoNormalization } from "./library/videoImportNormalizer";
import { applyStoredProxySettings } from "./network/proxySettingsStore";
import { logStartupEvent } from "./startupLog";
import { migrateOldStartupLog, logger } from "./appLogger";
import {
  configureHardwareAccelerationForBoot,
  readAppAccelerationStatus,
} from "./app/gpuAccelerationSettings";
import { installGpuCrashGuard, watchWindowForGpuCrash } from "./app/gpuCrashGuard";
import { assertRuntimeIntegrityOrExit } from "./app/runtimeIntegrity";
import { startPerformanceMonitor } from "./performance/performanceMonitor";
import { readWindowState, watchWindowState } from "./window/windowStateStore";
import {
  restoreExternalLibraryWatchers,
  shutdownExternalLibraryWatchers,
} from "./library/externalLibraryWatcher";

app.setName("素言");

function migrateLegacyUserDataSync(legacyDir: string, currentDir: string): void {
  try {
    if (fsSync.existsSync(currentDir)) {
      return;
    }
    if (!fsSync.existsSync(legacyDir)) {
      return;
    }
    try {
      fsSync.renameSync(legacyDir, currentDir);
    } catch {
      fsSync.cpSync(legacyDir, currentDir, { recursive: true });
      fsSync.rmSync(legacyDir, { recursive: true, force: true });
    }
    logStartupEvent("main:userdata-migrated", { legacyDir, currentDir });
  } catch (error) {
    logStartupEvent("main:userdata-migrate-failed", {
      legacyDir,
      currentDir,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

const appDataDir = app.getPath("appData");
const legacyUserDataDir = path.join(appDataDir, "PromptImageLibrary");
const currentUserDataDir = path.join(appDataDir, "SuYan");
migrateLegacyUserDataSync(legacyUserDataDir, currentUserDataDir);
app.setPath("userData", currentUserDataDir);
const hardwareAccelerationBootDecision = configureHardwareAccelerationForBoot();
logStartupEvent("main:init", {
  effectiveHardwareAcceleration: hardwareAccelerationBootDecision.effectiveHardwareAcceleration,
  hardwareAccelerationMode: hardwareAccelerationBootDecision.settings.hardwareAccelerationMode,
  safeMode: hardwareAccelerationBootDecision.safeMode,
});

const maxInlineOriginalFallbackBytes = 768 * 1024;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app-image",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: "app-thumbnail",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: "app-startup",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

async function createWindow(): Promise<void> {
  logStartupEvent("window:create:start");
  const windowState = await readWindowState();
  logStartupEvent("window:state:read");
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(typeof windowState.x === "number" ? { x: windowState.x } : {}),
    ...(typeof windowState.y === "number" ? { y: windowState.y } : {}),
    minWidth: 1040,
    minHeight: 680,
    title: "素言",
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#f6f7f4",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  let isWindowShown = false;
  const showWindow = () => {
    if (isWindowShown || mainWindow.isDestroyed()) {
      return;
    }

    isWindowShown = true;
    clearTimeout(showFallbackTimer);
    logStartupEvent("window:show");

    if (windowState.isMaximized) {
      mainWindow.maximize();
    }

    mainWindow.show();
  };
  const showFallbackTimer = setTimeout(showWindow, 2000);
  const handleStartupScreenReady = (event: IpcMainEvent) => {
    if (event.sender !== mainWindow.webContents) {
      return;
    }

    logStartupEvent("renderer:startup-screen-ready");
    showWindow();
  };

  ipcMain.on(ipcChannels.appStartupScreenReady, handleStartupScreenReady);
  mainWindow.once("closed", () => {
    clearTimeout(showFallbackTimer);
    ipcMain.removeListener(ipcChannels.appStartupScreenReady, handleStartupScreenReady);
  });
  mainWindow.once("ready-to-show", () => {
    logStartupEvent("window:ready-to-show");
  });
  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    logStartupEvent("window:did-fail-load", { errorCode, errorDescription });
    showWindow();
  });

  watchWindowState(mainWindow);
  watchWindowForGpuCrash(mainWindow);
  configureExternalLinkHandling(mainWindow);
  blockPackagedDevToolsShortcuts(mainWindow);
  registerWindowControls(mainWindow);

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      logStartupEvent("window:load-url:start");
      await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      logStartupEvent("window:load-url:done");
      return;
    }

    logStartupEvent("window:load-file:start");
    await mainWindow.loadFile(path.join(__dirname, "../../../dist/index.html"));
    logStartupEvent("window:load-file:done");
  } catch {
    logStartupEvent("window:load:failed");
    showWindow();
  }
}

function blockPackagedDevToolsShortcuts(window: BrowserWindow): void {
  if (!app.isPackaged) {
    return;
  }

  window.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    const isDevToolsChord =
      key === "f12" ||
      ((input.control || input.meta) && input.shift && (key === "i" || key === "j" || key === "c"));

    if (isDevToolsChord) {
      event.preventDefault();
    }
  });
}

function configureExternalLinkHandling(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalNetworkUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isExternalNetworkUrl(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });
}

function isExternalNetworkUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    if (process.env.VITE_DEV_SERVER_URL) {
      const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL);
      return url.origin !== devServerUrl.origin;
    }

    return true;
  } catch {
    return false;
  }
}

const mediaContentTypeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".ogv": "video/ogg",
  ".ogg": "video/ogg",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".asf": "video/x-ms-asf",
  ".f4v": "video/x-f4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".opus": "audio/opus",
  ".oga": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".png": "image/png",
  ".apng": "image/apng",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function getMediaContentType(filePath: string): string {
  return mediaContentTypeByExtension[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function serveFileWithRange(
  filePath: string,
  rangeHeader: string | null,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const stats = await fs.stat(filePath).catch(() => null);

  if (!stats || !stats.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const totalSize = stats.size;
  const contentType = getMediaContentType(filePath);
  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

  if (rangeMatch && totalSize > 0) {
    const startRaw = rangeMatch[1];
    const endRaw = rangeMatch[2];
    let start = startRaw ? parseInt(startRaw, 10) : 0;
    let end = endRaw ? parseInt(endRaw, 10) : totalSize - 1;

    if (!startRaw && endRaw) {
      start = Math.max(0, totalSize - parseInt(endRaw, 10));
      end = totalSize - 1;
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= totalSize) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${totalSize}`, "Accept-Ranges": "bytes" },
      });
    }

    end = Math.min(end, totalSize - 1);
    const chunkSize = end - start + 1;
    const handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(chunkSize);
    await handle.read(buffer, 0, chunkSize, start);
    await handle.close();

    return new Response(new Uint8Array(buffer), {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        ...extraHeaders,
      },
    });
  }

  const buffer = await fs.readFile(filePath);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(totalSize),
      "Accept-Ranges": "bytes",
      ...extraHeaders,
    },
  });
}

app.whenReady().then(async () => {
  assertRuntimeIntegrityOrExit();
  logStartupEvent("app:ready");
  logger.info("main", "gpu:status", readAppAccelerationStatus());
  installGpuCrashGuard();
  await migrateOldStartupLog();
  startPerformanceMonitor();
  Menu.setApplicationMenu(null);
  try {
    await applyStoredProxySettings();
    logStartupEvent("proxy:applied");
  } catch {
    logStartupEvent("proxy:apply-failed");
  }

  protocol.handle("app-image", async (request) => {
    try {
      const url = new URL(request.url);
      const imageFileName = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const item = await findLibraryItemByImageFileName(imageFileName);
      const imagePath = item ? await resolveMediaAbsolutePath(item) : getImagePath(imageFileName);

      if (isVideoMediaFile(imageFileName) && (!item || !item.mediaStorage || item.mediaStorage === "managed")) {
        await waitForImportedVideoNormalization(imagePath);
      }

      return await serveFileWithRange(imagePath, request.headers.get("range"));
    } catch (error) {
      logger.error("media", "app-image:error", { message: String(error) });
      return new Response("Not found", { status: 404 });
    }
  });

  protocol.handle("app-startup", async (request) => {
    try {
      const url = new URL(request.url);
      const imageFileName = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const thumbnailPath = await getFreshStartupThumbnailPath(imageFileName);
      const targetPath = thumbnailPath ?? getStartupGalleryImagePath(imageFileName);
      return await serveFileWithRange(targetPath, request.headers.get("range"), {
        "Cache-Control": "no-store",
      });
    } catch (error) {
      logger.error("media", "app-startup:error", { message: String(error) });
      return new Response("Not found", { status: 404 });
    }
  });

  protocol.handle("app-thumbnail", async (request) => {
    try {
      const url = new URL(request.url);
      const imageFileName = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const item = await findLibraryItemByImageFileName(imageFileName);
      const thumbnailPath = item
        ? await getFreshImageThumbnailPathForItem(item)
        : await getFreshImageThumbnailPath(imageFileName);

      if (thumbnailPath) {
        return net.fetch(pathToFileURL(thumbnailPath).toString());
      }

      const imagePath = item ? await resolveMediaAbsolutePath(item) : getImagePath(imageFileName);

      if (item) {
        warmLibraryItemThumbnails([item]);
      } else {
        warmImageThumbnails([imageFileName], 1);
      }

      const imageStats = await fs.stat(imagePath).catch(() => null);

      if (imageStats && imageStats.size <= maxInlineOriginalFallbackBytes) {
        return net.fetch(pathToFileURL(imagePath).toString());
      }

      return new Response("", {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 404,
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  registerIpcHandlers();
  logStartupEvent("ipc:registered");

  try {
    await ensureStartupGalleryStorage();
    logStartupEvent("startup-gallery:ready");
  } catch {
    logStartupEvent("startup-gallery:ready-failed");
  }

  await createWindow();

  try {
    await restoreExternalLibraryWatchers();
    logStartupEvent("external-library-watchers:ready");
  } catch (error) {
    logger.warn("external-library", "watch:restore-failed", { message: String(error) });
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void shutdownExternalLibraryWatchers();
});

async function findLibraryItemByImageFileName(imageFileName: string) {
  const library = await readLibraryFile();
  return library.items.find((item) => item.imageFileName === imageFileName) ?? null;
}

function registerWindowControls(window: BrowserWindow): void {
  ipcMain.handle(ipcChannels.windowMinimize, () => {
    window.minimize();
    return { ok: true, data: { minimized: true } };
  });

  ipcMain.handle(ipcChannels.windowMaximizeToggle, () => {
    if (window.isMaximized()) {
      window.unmaximize();
      return { ok: true, data: { maximized: false } };
    }
    window.maximize();
    return { ok: true, data: { maximized: true } };
  });

  ipcMain.handle(ipcChannels.windowClose, () => {
    window.close();
    return { ok: true, data: { closed: true } };
  });

  ipcMain.handle(ipcChannels.windowIsMaximized, () => {
    return { ok: true, data: { maximized: window.isMaximized() } };
  });

  window.on("maximize", () => {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.windowMaximizeChange, true);
    }
  });

  window.on("unmaximize", () => {
    if (!window.isDestroyed()) {
      window.webContents.send(ipcChannels.windowMaximizeChange, false);
    }
  });
}
