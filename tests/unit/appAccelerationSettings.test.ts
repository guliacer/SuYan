import { describe, expect, it } from "vitest";
import {
  defaultAppAccelerationSettings,
  normalizeAppAccelerationSettings,
  resolveAppAccelerationRestartRequired,
  resolveEffectiveHardwareAcceleration,
  shouldUseHardwareAcceleration,
} from "@/features/library/types/appAcceleration";

describe("appAccelerationSettings", () => {
  it("defaults to gpu-experimental mode with no crash downgrade", () => {
    expect(defaultAppAccelerationSettings.hardwareAccelerationMode).toBe("gpu-experimental");
    expect(defaultAppAccelerationSettings.gpuAutoDisabledByCrash).toBe(false);
    expect(defaultAppAccelerationSettings.lastGpuCrashAt).toBeNull();
  });

  it("falls back to defaults for invalid input", () => {
    expect(normalizeAppAccelerationSettings(null)).toEqual(defaultAppAccelerationSettings);
    expect(normalizeAppAccelerationSettings({ hardwareAccelerationMode: "turbo" })).toEqual(
      defaultAppAccelerationSettings,
    );
  });

  it("accepts the stable mode", () => {
    const settings = normalizeAppAccelerationSettings({ hardwareAccelerationMode: "stable" });

    expect(settings.hardwareAccelerationMode).toBe("stable");
    expect(shouldUseHardwareAcceleration(settings)).toBe(false);
  });

  it("preserves crash downgrade flag and timestamp", () => {
    const settings = normalizeAppAccelerationSettings({
      hardwareAccelerationMode: "gpu-experimental",
      gpuAutoDisabledByCrash: true,
      lastGpuCrashAt: "2026-07-16T00:00:00.000Z",
    });

    expect(settings.gpuAutoDisabledByCrash).toBe(true);
    expect(settings.lastGpuCrashAt).toBe("2026-07-16T00:00:00.000Z");
  });

  it("ignores non-boolean downgrade flag and blank timestamp", () => {
    const settings = normalizeAppAccelerationSettings({
      hardwareAccelerationMode: "gpu-experimental",
      gpuAutoDisabledByCrash: "yes",
      lastGpuCrashAt: "   ",
    });

    expect(settings.gpuAutoDisabledByCrash).toBe(false);
    expect(settings.lastGpuCrashAt).toBeNull();
  });

  it("treats gpu mode as effective only when not downgraded by crash", () => {
    expect(
      resolveEffectiveHardwareAcceleration({
        hardwareAccelerationMode: "gpu-experimental",
        gpuAutoDisabledByCrash: false,
        lastGpuCrashAt: null,
      }),
    ).toBe(true);

    expect(
      resolveEffectiveHardwareAcceleration({
        hardwareAccelerationMode: "gpu-experimental",
        gpuAutoDisabledByCrash: true,
        lastGpuCrashAt: "2026-07-16T00:00:00.000Z",
      }),
    ).toBe(false);

    expect(
      resolveEffectiveHardwareAcceleration({
        hardwareAccelerationMode: "stable",
        gpuAutoDisabledByCrash: false,
        lastGpuCrashAt: null,
      }),
    ).toBe(false);
  });

  it("marks restart required when effective acceleration differs from the running session", () => {
    expect(
      resolveAppAccelerationRestartRequired({
        effectiveHardwareAcceleration: false,
        settings: {
          hardwareAccelerationMode: "gpu-experimental",
          gpuAutoDisabledByCrash: false,
          lastGpuCrashAt: null,
        },
      }),
    ).toBe(true);

    expect(
      resolveAppAccelerationRestartRequired({
        effectiveHardwareAcceleration: false,
        settings: {
          hardwareAccelerationMode: "gpu-experimental",
          gpuAutoDisabledByCrash: true,
          lastGpuCrashAt: "2026-07-16T00:00:00.000Z",
        },
      }),
    ).toBe(false);

    expect(
      resolveAppAccelerationRestartRequired({
        effectiveHardwareAcceleration: false,
        settings: {
          hardwareAccelerationMode: "stable",
          gpuAutoDisabledByCrash: false,
          lastGpuCrashAt: null,
        },
      }),
    ).toBe(false);
  });
});
