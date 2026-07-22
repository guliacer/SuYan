export type HardwareAccelerationMode = "stable" | "gpu-experimental";

export type AppAccelerationSettings = {
  hardwareAccelerationMode: HardwareAccelerationMode;
  gpuAutoDisabledByCrash: boolean;
  lastGpuCrashAt: string | null;
};

export type AppAccelerationStatus = {
  effectiveHardwareAcceleration: boolean;
  gpuFeatureStatus: Record<string, string>;
  restartRequired: boolean;
  safeMode: boolean;
  autoDisabledByCrash: boolean;
  settings: AppAccelerationSettings;
};

export const defaultAppAccelerationSettings: AppAccelerationSettings = {
  hardwareAccelerationMode: "gpu-experimental",
  gpuAutoDisabledByCrash: false,
  lastGpuCrashAt: null,
};

const hardwareAccelerationModes: HardwareAccelerationMode[] = ["stable", "gpu-experimental"];

export function normalizeAppAccelerationSettings(input: unknown): AppAccelerationSettings {
  if (!isRecord(input)) {
    return { ...defaultAppAccelerationSettings };
  }

  return {
    hardwareAccelerationMode: isHardwareAccelerationMode(input.hardwareAccelerationMode)
      ? input.hardwareAccelerationMode
      : defaultAppAccelerationSettings.hardwareAccelerationMode,
    gpuAutoDisabledByCrash:
      typeof input.gpuAutoDisabledByCrash === "boolean"
        ? input.gpuAutoDisabledByCrash
        : defaultAppAccelerationSettings.gpuAutoDisabledByCrash,
    lastGpuCrashAt:
      typeof input.lastGpuCrashAt === "string" && input.lastGpuCrashAt.trim()
        ? input.lastGpuCrashAt
        : defaultAppAccelerationSettings.lastGpuCrashAt,
  };
}

export function shouldUseHardwareAcceleration(settings: AppAccelerationSettings): boolean {
  return settings.hardwareAccelerationMode === "gpu-experimental";
}

export function resolveEffectiveHardwareAcceleration(settings: AppAccelerationSettings): boolean {
  return shouldUseHardwareAcceleration(settings) && !settings.gpuAutoDisabledByCrash;
}

export function resolveAppAccelerationRestartRequired(input: {
  effectiveHardwareAcceleration: boolean;
  settings: AppAccelerationSettings;
}): boolean {
  return resolveEffectiveHardwareAcceleration(input.settings) !== input.effectiveHardwareAcceleration;
}

function isHardwareAccelerationMode(input: unknown): input is HardwareAccelerationMode {
  return typeof input === "string" && hardwareAccelerationModes.includes(input as HardwareAccelerationMode);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
