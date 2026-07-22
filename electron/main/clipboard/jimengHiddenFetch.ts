import { BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { logger } from "../appLogger";

const CAPTURE_CHANNEL = "jimeng-capture:item-info";
const capturePreloadPath = path.join(__dirname, "..", "..", "preload", "jimengCapture.js");

const browserUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export type JimengItemInfoCapture = {
  url: string;
  body: string;
};

export async function captureJimengItemInfo(
  sourceUrl: string,
  timeoutMs: number,
): Promise<JimengItemInfoCapture | null> {
  const startedAtMs = Date.now();
  let win: BrowserWindow | null = null;
  let captured: JimengItemInfoCapture | null = null;
  let settled = false;

  return new Promise<JimengItemInfoCapture | null>((resolve) => {
    const cleanup = (): void => {
      ipcMain.removeListener(CAPTURE_CHANNEL, onCapture);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (win && !win.isDestroyed()) {
        win.destroy();
      }
      win = null;
    };

    const finish = (result: JimengItemInfoCapture | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      logger.info("jimeng-import", "hidden-fetch:done", {
        ok: Boolean(result),
        durationMs: Date.now() - startedAtMs,
      });
      resolve(result);
    };

    const onCapture = (event: Electron.IpcMainEvent, payload: unknown): void => {
      if (!win || win.isDestroyed() || event.sender !== win.webContents) {
        return;
      }
      if (
        typeof payload === "object" &&
        payload !== null &&
        typeof (payload as JimengItemInfoCapture).body === "string" &&
        (payload as JimengItemInfoCapture).body.length > 0
      ) {
        captured = payload as JimengItemInfoCapture;
        finish(captured);
      }
    };

    ipcMain.on(CAPTURE_CHANNEL, onCapture);

    const timeoutHandle = setTimeout(() => {
      finish(captured);
    }, timeoutMs);

    try {
      win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        webPreferences: {
          offscreen: true,
          javascript: true,
          images: false,
          contextIsolation: false,
          nodeIntegration: false,
          sandbox: false,
          preload: capturePreloadPath,
          backgroundThrottling: false,
        },
      });

      win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        if (validatedURL === sourceUrl) {
          logger.warn("jimeng-import", "hidden-fetch:load-failed", {
            errorCode,
            errorDescription,
          });
        }
      });

      void win
        .loadURL(sourceUrl, { userAgent: browserUserAgent })
        .catch((error: unknown) => {
          logger.warn("jimeng-import", "hidden-fetch:load-url-error", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
    } catch (error) {
      logger.error("jimeng-import", "hidden-fetch:create-window-error", {
        message: error instanceof Error ? error.message : String(error),
      });
      finish(null);
    }
  });
}
