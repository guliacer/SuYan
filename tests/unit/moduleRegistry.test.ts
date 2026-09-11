import { describe, expect, it } from "vitest";
import {
  canDeleteBuiltinModule,
  canDisableBuiltinModule,
  hasBuiltinModuleCapability,
  isBuiltinModuleEnabled,
  isBuiltinModuleInstalled,
  resolveBuiltinModuleState,
} from "../../src/features/library/utils/moduleRegistry";

describe("module registry", () => {
  it("keeps required modules installed and enabled even when patched off", () => {
    const state = resolveBuiltinModuleState({
      "image-prompt": { enabled: false, installed: false },
      "core-library": { enabled: false, installed: false },
    });

    expect(canDisableBuiltinModule("image-prompt")).toBe(false);
    expect(canDisableBuiltinModule("core-library")).toBe(false);
    expect(canDeleteBuiltinModule("image-prompt")).toBe(false);
    expect(canDeleteBuiltinModule("core-library")).toBe(false);
    expect(canDeleteBuiltinModule("video-compression")).toBe(true);
    expect(isBuiltinModuleInstalled("image-prompt", state)).toBe(true);
    expect(isBuiltinModuleEnabled("image-prompt", state)).toBe(true);
    expect(isBuiltinModuleEnabled("core-library", state)).toBe(true);
    expect(hasBuiltinModuleCapability("image-prompt-card", state)).toBe(true);
  });

  it("leaves video-runtime uninstalled by default; video-prompt-card stays available", () => {
    const state = resolveBuiltinModuleState();

    expect(isBuiltinModuleInstalled("video-runtime", state)).toBe(false);
    expect(isBuiltinModuleEnabled("video-runtime", state)).toBe(false);
    expect(hasBuiltinModuleCapability("video-runtime", state)).toBe(false);
    // video-prompt-card (viewing prompt text) does not require ffmpeg, so it stays on.
    expect(hasBuiltinModuleCapability("video-prompt-card", state)).toBe(true);
    // video-compression needs the runtime, so it cascades off.
    expect(hasBuiltinModuleCapability("video-compression", state)).toBe(false);
    // Non-video optional modules remain available out of the box.
    expect(hasBuiltinModuleCapability("image-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("deduplicate-scan", state)).toBe(true);
  });

  it("keeps local NSFW recognition optional and disabled by default", () => {
    const state = resolveBuiltinModuleState();

    expect(isBuiltinModuleInstalled("nsfw-runtime", state)).toBe(false);
    expect(isBuiltinModuleEnabled("nsfw-runtime", state)).toBe(false);
    expect(hasBuiltinModuleCapability("nsfw-local-classification", state)).toBe(false);

    const installed = resolveBuiltinModuleState({
      "nsfw-runtime": { installed: true, enabled: true },
    });
    expect(hasBuiltinModuleCapability("nsfw-local-classification", installed)).toBe(true);
  });

  it("enables ffmpeg-dependent capabilities after the runtime is installed and enabled", () => {
    const state = resolveBuiltinModuleState({
      "video-runtime": { installed: true, enabled: true },
    });

    expect(isBuiltinModuleInstalled("video-runtime", state)).toBe(true);
    expect(isBuiltinModuleEnabled("video-runtime", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-runtime", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-prompt-card", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-compression", state)).toBe(true);
  });

  it("honors a persisted disabled state for optional modules", () => {
    const state = resolveBuiltinModuleState({
      "video-runtime": { installed: true, enabled: true },
      "video-compression": { installed: false, enabled: false },
      "image-compression": { installed: false, enabled: false },
    });

    expect(isBuiltinModuleEnabled("video-runtime", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-prompt-card", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-compression", state)).toBe(false);
    expect(hasBuiltinModuleCapability("image-compression", state)).toBe(false);
    // Required modules stay unaffected by optional-module patches.
    expect(hasBuiltinModuleCapability("image-prompt-card", state)).toBe(true);
  });

  it("falls back to defaults for fields missing from a partial patch", () => {
    const state = resolveBuiltinModuleState({
      "video-runtime": { installed: true },
    });

    expect(isBuiltinModuleInstalled("video-runtime", state)).toBe(true);
    // enabled omitted -> falls back to the (off) default.
    expect(isBuiltinModuleEnabled("video-runtime", state)).toBe(false);
  });
});
