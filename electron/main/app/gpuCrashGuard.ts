import { app, type BrowserWindow } from "electron";
import { logger } from "../appLogger";
import {
  clearGpuAutoDisable,
  isGpuAutoDisabledThisBoot,
  isGpuModeSelected,
  recordGpuAutoDisable,
} from "./gpuAccelerationSettings";

const crashWindowMs = 90_000;
const crashThreshold = 2;
const stableUptimeMs = 5 * 60 * 1000;

let crashTimestamps: number[] = [];
let downgradeTriggered = false;
let stableTimer: ReturnType<typeof setTimeout> | null = null;

export function installGpuCrashGuard(): void {
  app.on("child-process-gone", (_event, details) => {
    if (details.type !== "GPU") {
      return;
    }

    logger.warn("main", "gpu:process-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });

    registerCrash("gpu-process-gone");
  });

  stableTimer = setTimeout(() => {
    void clearGpuAutoDisable().catch(() => undefined);
    logger.info("main", "gpu:stable-uptime-reached", { uptimeMs: stableUptimeMs });
  }, stableUptimeMs);
}

export function watchWindowForGpuCrash(window: BrowserWindow): void {
  const contents = window.webContents;

  contents.on("render-process-gone", (_event, details) => {
    logger.warn("main", "gpu:render-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });

    if (details.reason === "clean-exit" || details.reason === "killed") {
      return;
    }

    const downgraded = registerCrash("render-process-gone");

    if (!downgraded && !contents.isDestroyed()) {
      logger.info("main", "gpu:render-reload", {});
      try {
        contents.reload();
      } catch {
      }
    }
  });
}

function registerCrash(source: string): boolean {
  if (downgradeTriggered) {
    return true;
  }

  const now = Date.now();
  crashTimestamps = crashTimestamps.filter((timestamp) => now - timestamp <= crashWindowMs);
  crashTimestamps.push(now);

  if (!isGpuModeSelected() || isGpuAutoDisabledThisBoot()) {
    return false;
  }

  if (crashTimestamps.length < crashThreshold) {
    return false;
  }

  downgradeTriggered = true;
  logger.error("main", "gpu:auto-downgrade", {
    code: "GPU_CRASH_AUTO_DOWNGRADE",
    message: "GPU 反复崩溃，自动降级为软件渲染并重启。",
    source,
    crashCount: crashTimestamps.length,
    windowMs: crashWindowMs,
  });

  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimer = null;
  }

  void triggerDowngradeAndRelaunch();
  return true;
}

async function triggerDowngradeAndRelaunch(): Promise<void> {
  try {
    await recordGpuAutoDisable();
  } catch (error) {
    logger.error("main", "gpu:auto-downgrade-persist-failed", {
      code: "GPU_DOWNGRADE_PERSIST_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  app.relaunch();
  app.exit(0);
}
