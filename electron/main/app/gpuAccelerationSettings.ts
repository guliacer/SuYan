import { app } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  normalizeAppAccelerationSettings,
  resolveAppAccelerationRestartRequired,
  resolveEffectiveHardwareAcceleration,
  shouldUseHardwareAcceleration,
  type AppAccelerationSettings,
  type AppAccelerationStatus,
} from "../../../src/features/library/types/appAcceleration";

const settingsFileName = "acceleration-settings.json";
const safeModeFlags = new Set(["--safe-mode", "--disable-gpu-acceleration", "--disable-hardware-acceleration"]);

export type HardwareAccelerationBootDecision = {
  effectiveHardwareAcceleration: boolean;
  safeMode: boolean;
  autoDisabledByCrash: boolean;
  settings: AppAccelerationSettings;
};

let bootDecision: HardwareAccelerationBootDecision | null = null;

export function configureHardwareAccelerationForBoot(): HardwareAccelerationBootDecision {
  const settings = readAppAccelerationSettingsSync();
  const safeMode = process.argv.some((argument) => safeModeFlags.has(argument));
  const shouldEnableHardwareAcceleration = resolveEffectiveHardwareAcceleration(settings) && !safeMode;

  if (shouldEnableHardwareAcceleration) {
    app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
  } else {
    app.disableHardwareAcceleration();
  }

  bootDecision = {
    effectiveHardwareAcceleration: app.isHardwareAccelerationEnabled(),
    safeMode,
    autoDisabledByCrash: settings.gpuAutoDisabledByCrash,
    settings,
  };

  return bootDecision;
}

export function readAppAccelerationStatus(): AppAccelerationStatus {
  const settings = readAppAccelerationSettingsSync();
  const effectiveHardwareAcceleration = app.isHardwareAccelerationEnabled();

  return {
    effectiveHardwareAcceleration,
    gpuFeatureStatus: readGpuFeatureStatus(),
    restartRequired: resolveAppAccelerationRestartRequired({
      effectiveHardwareAcceleration,
      settings,
    }),
    safeMode: bootDecision?.safeMode ?? process.argv.some((argument) => safeModeFlags.has(argument)),
    autoDisabledByCrash: settings.gpuAutoDisabledByCrash,
    settings,
  };
}

export async function writeAppAccelerationSettings(input: unknown): Promise<AppAccelerationStatus> {
  const settings = normalizeAppAccelerationSettings(input);
  await persistAppAccelerationSettings({
    ...settings,
    gpuAutoDisabledByCrash: false,
    lastGpuCrashAt: null,
  });

  return readAppAccelerationStatus();
}

export async function recordGpuAutoDisable(): Promise<AppAccelerationSettings> {
  const settings = readAppAccelerationSettingsSync();
  const nextSettings: AppAccelerationSettings = {
    ...settings,
    gpuAutoDisabledByCrash: true,
    lastGpuCrashAt: new Date().toISOString(),
  };

  await persistAppAccelerationSettings(nextSettings);

  return nextSettings;
}

export async function clearGpuAutoDisable(): Promise<void> {
  const settings = readAppAccelerationSettingsSync();

  if (!settings.gpuAutoDisabledByCrash && !settings.lastGpuCrashAt) {
    return;
  }

  await persistAppAccelerationSettings({
    ...settings,
    gpuAutoDisabledByCrash: false,
    lastGpuCrashAt: null,
  });
}

export function isGpuAutoDisabledThisBoot(): boolean {
  return bootDecision?.autoDisabledByCrash ?? false;
}

export function isGpuModeSelected(): boolean {
  return shouldUseHardwareAcceleration(readAppAccelerationSettingsSync());
}

async function persistAppAccelerationSettings(settings: AppAccelerationSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  const tempPath = `${settingsPath}.${process.pid}.tmp`;

  await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
  await fsp.writeFile(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await fsp.rename(tempPath, settingsPath);
}

function readAppAccelerationSettingsSync(): AppAccelerationSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf8");
    return normalizeAppAccelerationSettings(JSON.parse(raw));
  } catch {
    return normalizeAppAccelerationSettings(null);
  }
}

function readGpuFeatureStatus(): Record<string, string> {
  try {
    return Object.fromEntries(
      Object.entries(app.getGPUFeatureStatus()).map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return {};
  }
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), settingsFileName);
}
