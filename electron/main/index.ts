import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, type IpcMainEvent } from "electron";
import { release as osRelease } from "node:os";
import { supportsWindowAcrylic } from "./window/windowMaterial";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc/registerIpcHandlers";
import { registerWindowResize } from "./window/windowResize";
import { ipcChannels } from "../shared/ipcChannels";
import { isVideoMediaFile } from "../../src/features/library/utils/mediaFileTypes";
import {
  getFreshImageThumbnailPath,
  getFreshImageThumbnailPathForItem,
  getOrCreateImageThumbnailPath,
  getOrCreateImageThumbnailPathForItem,
} from "./library/imageThumbnails";
import { getImagePath, getPromptContentImagePath, getStartupGalleryImagePath, getThemeBackgroundPath } from "./library/libraryPaths";
import { findLibraryItemByImageFileName } from "./library/libraryStore";
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
import { isLocalPackageIterationRoot, prepareAppUserDataSync } from "./app/appStoragePath";
import {
  listLeftoverLocalIterationDataDirs,
  migrateWebAssistantPartitions,
} from "./webAssistant/webAssistantPartitionMigration";
import { installGpuCrashGuard, watchWindowForGpuCrash } from "./app/gpuCrashGuard";
import { assertRuntimeIntegrityOrExit } from "./app/runtimeIntegrity";
import { startPerformanceMonitor } from "./performance/performanceMonitor";
import { rustCoreRuntime } from "./runtime/rustCoreRuntime";
import { readWindowState, watchWindowState } from "./window/windowStateStore";
import { constrainWindowContentBounds } from "./window/windowContentBounds";
import {
  restoreExternalLibraryWatchers,
  shutdownExternalLibraryWatchers,
} from "./library/externalLibraryWatcher";
import { startImportReceiver, stopImportReceiver } from "./library/importReceiver";
import {
  broadcastAccountError,
  getAccountStatus,
  handleOAuthCallback,
  initializeAccount,
} from "./account/accountService";
import { OAuthCallbackDispatcher } from "./account/oauth/oauthCallbackDispatcher";
import { findOAuthDeeplink, isOAuthDeeplink } from "./account/oauth/oauthDeeplink";
import { minimumWindowSize } from "./window/windowStateModel";
import { resetFfmpegPathCache } from "./runtime/videoRuntime";
import {
  ACCOUNT_AVATAR_PROTOCOL,
  findCachedAccountAvatarPath,
  getAccountAvatarContentType,
} from "./account/accountAvatarCache";

app.setName("素言");
if (process.platform === "win32") {
  app.setAppUserModelId("local.suyan");
}

/**
 * 开发/便携模式（electron . / pnpm dev）直接跑在 node_modules 的 Electron 里，
 * 窗口不会沿用打包 exe 内嵌的图标，需要显式给 BrowserWindow 设置品牌 logo。
 * 打包产物（resources/app.asar 内）不包含 build/ 目录，故只在非打包态使用。
 */
function resolveWindowIconPath(): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }
  const logoPath = path.join(app.getAppPath(), "build", "logo-source.png");
  return existsSync(logoPath) ? logoPath : undefined;
}

// Only one main process should own the UI. A second double-click must focus the
// existing window instead of starting another invisible cold-start sequence.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// Official installed / portable builds store library/settings under <root>\data.
// `electron .` and local rebuilds reuse the live portable profile at
// release\win-unpacked\data — the directory the user actually opens. Do not
// switch those runs onto %APPDATA%\SuYan (that is a stale separate library).
const appUserDataPreparation = prepareAppUserDataSync({
  isPackaged: app.isPackaged,
  execPath: process.execPath,
  appDataPath: app.getPath("appData"),
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
  cwd: process.cwd(),
});
if (appUserDataPreparation.reason === "not-writable") {
  // Data lives next to the executable by design. When that directory is read-only
  // (Program Files without elevation, read-only media, locked-down policy), fail loudly
  // instead of crashing before any window exists.
  const detail = [
    `数据目录：${appUserDataPreparation.userDataPath}`,
    appUserDataPreparation.writeErrorCode ? `错误代码：${appUserDataPreparation.writeErrorCode}` : null,
    "",
    "素言把素材库保存在软件所在目录，因此该目录必须可写。",
    "请把软件安装或解压到有写入权限的位置（例如 D:\\Apps\\SuYan 或用户目录），然后重新启动。",
  ]
    .filter((line) => line !== null)
    .join("\n");

  logStartupEvent("main:userdata-not-writable", {
    userDataPath: appUserDataPreparation.userDataPath,
    packagedRoot: appUserDataPreparation.packagedRoot,
    code: appUserDataPreparation.writeErrorCode,
    message: appUserDataPreparation.errorMessage,
  });

  app.whenReady().then(() => {
    dialog.showErrorBox("素言无法写入数据目录", detail);
    app.exit(1);
  });
} else {
  app.setPath("userData", appUserDataPreparation.userDataPath);
  // userData 重定向后清掉 ffmpeg 探测缓存：若引导期有过早期探测（旧 userData），
  // 直接命中旧路径会把已安装的按需组件误报为未安装。
  resetFfmpegPathCache();
  const usesSharedDevProfile =
    !app.isPackaged
    || (appUserDataPreparation.packagedRoot !== null
      && isLocalPackageIterationRoot(appUserDataPreparation.packagedRoot));
  const partitionMigration = migrateWebAssistantPartitions({
    userDataPath: appUserDataPreparation.userDataPath,
    leftoverDataDirs: usesSharedDevProfile
      ? listLeftoverLocalIterationDataDirs({
        cwd: process.cwd(),
        packagedRoot: appUserDataPreparation.packagedRoot,
      })
      : [],
  });
  if (partitionMigration.recoveredFrom.length > 0 || partitionMigration.renamed.length > 0) {
    logStartupEvent("main:web-assistant-partitions-migrated", partitionMigration);
  }
}

const canStartApp = appUserDataPreparation.reason !== "not-writable";

if (appUserDataPreparation.migrated) {
  logStartupEvent("main:userdata-migrated", {
    from: appUserDataPreparation.from,
    to: appUserDataPreparation.userDataPath,
    reason: appUserDataPreparation.reason,
  });
} else if (appUserDataPreparation.reason === "migrate-failed") {
  logStartupEvent("main:userdata-migrate-failed", {
    from: appUserDataPreparation.from,
    to: appUserDataPreparation.userDataPath,
    message: appUserDataPreparation.errorMessage,
  });
}
logStartupEvent("main:userdata-ready", {
  isPackaged: app.isPackaged,
  userDataPath: appUserDataPreparation.userDataPath,
  packagedRoot: appUserDataPreparation.packagedRoot,
  reason: appUserDataPreparation.reason,
});

const hardwareAccelerationBootDecision = configureHardwareAccelerationForBoot();
logStartupEvent("main:init", {
  effectiveHardwareAcceleration: hardwareAccelerationBootDecision.effectiveHardwareAcceleration,
  hardwareAccelerationMode: hardwareAccelerationBootDecision.settings.hardwareAccelerationMode,
  safeMode: hardwareAccelerationBootDecision.safeMode,
  userDataPath: app.getPath("userData"),
});
app.once("gpu-info-update", () => {
  logger.info("main", "gpu:status-ready", readAppAccelerationStatus());
});

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
  {
    scheme: "app-theme",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: ACCOUNT_AVATAR_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    // OAuth 回调协议（方案 §八）：只此一处，绝不加入宽泛外部协议白名单。
    scheme: "suyan",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: false,
      corsEnabled: false,
    },
  },
]);

let mainWindowRef: BrowserWindow | null = null;
let queuedOAuthDeeplink = findOAuthDeeplink(process.argv);
const oauthCallbackDispatcher = new OAuthCallbackDispatcher({
  handleCallback: handleOAuthCallback,
  onError: (error) => {
    broadcastAccountError(error);
    logger.warn("account", "oauth-deeplink-failed", { message: String(error) });
  },
  onSettled: () => focusMainWindow(),
});

function focusMainWindow(window: BrowserWindow | null = mainWindowRef): void {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (!window.isVisible()) {
    window.show();
  }

  window.focus();
  if (process.platform === "win32") {
    // Flash briefly so a second double-click is noticeable even if already focused.
    window.flashFrame(true);
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.flashFrame(false);
      }
    }, 800);
  }
  logStartupEvent("window:focus-existing");
}

function routeOAuthDeeplink(rawUrl: unknown): void {
  if (!isOAuthDeeplink(rawUrl)) {
    return;
  }

  if (!app.isReady()) {
    // Windows cold-start and macOS open-url can arrive before app.whenReady.
    // Keep only the newest valid callback until the main process is initialized.
    queuedOAuthDeeplink = rawUrl;
    return;
  }

  void oauthCallbackDispatcher.dispatch(rawUrl);
  logStartupEvent("app:oauth-deeplink", { url: "suyan://oauth/callback..." });
}

function dispatchQueuedOAuthDeeplink(): void {
  const deeplink = queuedOAuthDeeplink;
  queuedOAuthDeeplink = null;
  if (deeplink) {
    routeOAuthDeeplink(deeplink);
  }
}

// Register before app.whenReady so macOS does not lose a callback delivered
// while the application is still creating its first window.
app.on("open-url", (event, url) => {
  event.preventDefault();
  routeOAuthDeeplink(url);
});

app.on("second-instance", (_event, argv) => {
  logStartupEvent("app:second-instance");
  const deeplink = Array.isArray(argv) ? findOAuthDeeplink(argv) : null;
  if (deeplink) {
    routeOAuthDeeplink(deeplink);
  }
  const existing = mainWindowRef && !mainWindowRef.isDestroyed()
    ? mainWindowRef
    : BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null;

  if (existing) {
    focusMainWindow(existing);
    return;
  }

  // Rare: lock held but no window (mid-quit or crash recovery). Create one.
  if (app.isReady()) {
    void createWindow();
  }
});

async function createWindow(): Promise<void> {
  logStartupEvent("window:create:start");
  const windowState = await readWindowState();
  logStartupEvent("window:state:read");
  const windowIconPath = resolveWindowIconPath();
  const nativeAcrylic = supportsWindowAcrylic(process.platform, osRelease());
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    ...(typeof windowState.x === "number" ? { x: windowState.x } : {}),
    ...(typeof windowState.y === "number" ? { y: windowState.y } : {}),
    // Keep in sync with minimumWindowSize (supports small / high-DPI laptops).
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    title: "素言",
    // The React title bar owns all window controls. Keeping Electron's native
    // controls hidden prevents the Windows close button from painting over the
    // custom close button in the renderer.
    frame: false,
    roundedCorners: true,
    // A native frame supplies the resize edge, rounded corners and shadow for
    // Acrylic. Older systems retain the existing transparent CSS shell.
    thickFrame: nativeAcrylic,
    transparent: !nativeAcrylic,
    ...(nativeAcrylic ? { backgroundMaterial: "acrylic" as const } : {}),
    autoHideMenuBar: true,
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      additionalArguments: nativeAcrylic ? ["--suyan-native-acrylic"] : [],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  mainWindowRef = mainWindow;
  logger.info("window", "material:configured", { material: nativeAcrylic ? "acrylic" : "css-fallback" });
  mainWindow.on("closed", () => {
    if (mainWindowRef === mainWindow) {
      mainWindowRef = null;
    }
  });

  let isWindowShown = false;
  let showFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  const showWindow = (reason: string) => {
    if (isWindowShown || mainWindow.isDestroyed()) {
      return;
    }

    isWindowShown = true;
    if (showFallbackTimer !== null) {
      clearTimeout(showFallbackTimer);
      showFallbackTimer = null;
    }
    logStartupEvent("window:show", { reason });

    if (windowState.isMaximized) {
      mainWindow.maximize();
    }

    mainWindow.show();
    mainWindow.focus();
  };
  const armShowFallback = (delayMs: number, reason: string) => {
    if (isWindowShown || showFallbackTimer !== null) {
      return;
    }

    showFallbackTimer = setTimeout(() => {
      showFallbackTimer = null;
      showWindow(reason);
    }, delayMs);
  };
  const handleStartupScreenReady = (event: IpcMainEvent) => {
    if (event.sender !== mainWindow.webContents) {
      return;
    }

    logStartupEvent("renderer:startup-screen-ready");
    showWindow("startup-screen-ready");
  };

  ipcMain.on(ipcChannels.appStartupScreenReady, handleStartupScreenReady);
  mainWindow.once("closed", () => {
    if (showFallbackTimer !== null) {
      clearTimeout(showFallbackTimer);
      showFallbackTimer = null;
    }
    ipcMain.removeListener(ipcChannels.appStartupScreenReady, handleStartupScreenReady);
  });
  // Show as soon as Chromium has the first document paint (HTML loading shell).
  // Waiting for startup-gallery IPC made double-click feel like "nothing opens"
  // for 3-4s on large libraries. startup-screen-ready still upgrades content later.
  mainWindow.once("ready-to-show", () => {
    logStartupEvent("window:ready-to-show");
    showWindow("ready-to-show");
  });
  // Safety only: if ready-to-show never arrives after load, force show.
  armShowFallback(5000, "load-timeout-fallback");
  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    logStartupEvent("window:did-fail-load", { errorCode, errorDescription });
    showWindow("did-fail-load");
  });

  watchWindowState(mainWindow);
  watchWindowForGpuCrash(mainWindow);
  watchRendererDiagnostics(mainWindow);
  configureExternalLinkHandling(mainWindow);
  blockPackagedDevToolsShortcuts(mainWindow);
  registerWindowControls(mainWindow);
  registerWindowResize(mainWindow);

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
    showWindow("load-failed");
  }
}

function watchRendererDiagnostics(window: BrowserWindow): void {
  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const details = {
      consoleLevel: level,
      message: message.slice(0, 500),
      line,
      sourceId: sourceId.slice(0, 300),
    };

    if (level >= 3) {
      logger.error("renderer", "console-error", {
        ...details,
        code: "RENDERER_CONSOLE_ERROR",
      });
      return;
    }

    if (level >= 2) {
      logger.warn("renderer", "console-warning", details);
    }
  });

  window.webContents.on("unresponsive", () => {
    logger.warn("renderer", "unresponsive", { code: "RENDERER_UNRESPONSIVE" });
  });

  window.webContents.on("responsive", () => {
    logger.info("renderer", "responsive");
  });
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
  if (!canStartApp) {
    // The unwritable-data-directory handler above owns the error dialog and exit.
    return;
  }

  assertRuntimeIntegrityOrExit();
  logStartupEvent("app:ready");
  installGpuCrashGuard();
  await migrateOldStartupLog();
  startPerformanceMonitor();
  Menu.setApplicationMenu(null);
  // OAuth 回调深链（方案 §八）：注册为默认协议处理程序（Windows/包装版 OS 级路由）。
  // 开发模式（electron .）必须带上进程与 app 路径，否则系统回跳 suyan:// 时
  // 第二个 electron 实例不会加载应用，深链会丢失（见 Electron 文档 defaultApp 示例）。
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("suyan", process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient("suyan");
    }
    logStartupEvent("oauth:protocol-client-registered");
  } catch (error) {
    logger.warn("account", "oauth:set-default-protocol-failed", { message: String(error) });
  }
  try {
    await applyStoredProxySettings();
    logStartupEvent("proxy:applied");
  } catch {
    logStartupEvent("proxy:apply-failed");
  }

  // 启动 Rust Core Sidecar（骨架阶段，不阻塞其它初始化）。
  void rustCoreRuntime.start().then(() => {
    logStartupEvent("rust-core:startup", rustCoreRuntime.getStatus());
  });

  protocol.handle("app-image", async (request) => {
    try {
      const url = new URL(request.url);
      const imageFileName = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (url.hostname === "prompt") {
        return await serveFileWithRange(getPromptContentImagePath(imageFileName), request.headers.get("range"));
      }
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

  protocol.handle("app-theme", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "local") {
        return new Response("Not found", { status: 404 });
      }
      const imageFileName = decodeURIComponent(url.pathname.replace(/^\//, ""));
      return await net.fetch(pathToFileURL(getThemeBackgroundPath(imageFileName)).toString());
    } catch (error) {
      logger.warn("theme", "background:serve-failed", { message: String(error) });
      return new Response("Not found", { status: 404 });
    }
  });

  protocol.handle(ACCOUNT_AVATAR_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "avatar") {
        return new Response("Not found", { status: 404 });
      }
      const key = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const filePath = await findCachedAccountAvatarPath(key);
      if (!filePath) {
        return new Response("Not found", { status: 404 });
      }
      return await serveFileWithRange(filePath, request.headers.get("range"), {
        "Cache-Control": "no-store",
        "Content-Type": getAccountAvatarContentType(filePath),
      });
    } catch (error) {
      logger.warn("account", "avatar:serve-failed", { message: String(error) });
      return new Response("Not found", { status: 404 });
    }
  });

  protocol.handle("suyan", async (request) => {
    const callbackResult = await oauthCallbackDispatcher.dispatch(request.url);
    const callbackSucceeded = callbackResult.status === "succeeded";
    const pageMessage = callbackSucceeded
      ? "身份验证完成，请回到素言确认登录。"
      : "登录未完成，请返回素言查看提示并重新尝试。";
    const pageColor = callbackSucceeded ? "#176b45" : "#a63e3e";
    return new Response(`<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>素言登录</title></head><body style='background:#f6f5f1;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:${pageColor}'><main style='padding:32px;text-align:center'><strong style='font-size:18px'>${pageMessage}</strong></main></body></html>`, {
      headers: { "Content-Type": "text/html" },
    });
  });

  protocol.handle("app-thumbnail", async (request) => {
    const startedAt = Date.now();
    let source: "thumbnail" | "original" | "missing" = "missing";
    let generationAttempted = false;
    let imageFileName = "";

    try {
      const url = new URL(request.url);
      imageFileName = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const item = await findLibraryItemByImageFileName(imageFileName);
      let thumbnailPath = item
        ? await getFreshImageThumbnailPathForItem(item)
        : await getFreshImageThumbnailPath(imageFileName);

      if (!thumbnailPath) {
        generationAttempted = true;
        try {
          thumbnailPath = item
            ? await getOrCreateImageThumbnailPathForItem(item)
            : await getOrCreateImageThumbnailPath(imageFileName);
        } catch (error) {
          logger.warn("media-thumbnail", "serve:generate-failed", {
            file: imageFileName,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (thumbnailPath) {
        source = "thumbnail";
        return net.fetch(pathToFileURL(thumbnailPath).toString());
      }

      const imagePath = item ? await resolveMediaAbsolutePath(item) : getImagePath(imageFileName);
      const imageStats = await fs.stat(imagePath).catch(() => null);

      if (imageStats) {
        source = "original";
        return net.fetch(pathToFileURL(imagePath).toString());
      }

      return new Response("", {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 404,
      });
    } catch (error) {
      logger.warn("media-thumbnail", "serve:failed", {
        file: imageFileName,
        message: error instanceof Error ? error.message : String(error),
      });
      return new Response("Not found", { status: 404 });
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs >= 350) {
        logger.info("media-thumbnail", "serve:slow", {
          file: imageFileName,
          durationMs,
          source,
          generationAttempted,
        });
      }
    }
  });

  registerIpcHandlers();
  logStartupEvent("ipc:registered");

  // 恢复账号登录态（方案 §十一）：失败只回到未登录，不阻塞主流程。
  try {
    await initializeAccount();
    const accountStatus = getAccountStatus();
    logStartupEvent("account:initialized", {
      status: accountStatus.status,
      provider: accountStatus.provider ?? null,
      uid: accountStatus.user?.uid ?? null,
    });
  } catch (error) {
    logger.warn("account", "init-failed", { message: String(error) });
  }

  // A protocol launch may be the first process instance. Dispatch it only
  // after account initialization so the callback can safely persist and
  // broadcast the resulting session.
  dispatchQueuedOAuthDeeplink();

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

  // 本地收件服务（127.0.0.1，供 ComfyUI 等推送素材用）。启动失败不阻塞主流程。
  try {
    startImportReceiver();
    logStartupEvent("import-receiver:ready");
  } catch (error) {
    logger.warn("import-receiver", "start-failed", { message: String(error) });
  }

app.on("activate", () => {
    const existing = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null;
    if (existing) {
      focusMainWindow(existing);
      return;
    }
    void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void shutdownExternalLibraryWatchers();
  stopImportReceiver();
  void rustCoreRuntime.stop();
});

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

  ipcMain.handle(ipcChannels.windowAlwaysOnTopToggle, () => {
    const alwaysOnTop = !window.isAlwaysOnTop();
    window.setAlwaysOnTop(alwaysOnTop);
    return { ok: true, data: { alwaysOnTop } };
  });

  ipcMain.handle(ipcChannels.windowIsAlwaysOnTop, () => {
    return { ok: true, data: { alwaysOnTop: window.isAlwaysOnTop() } };
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
