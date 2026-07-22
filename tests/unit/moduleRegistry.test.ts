import { describe, expect, it } from "vitest";
import {
  canDisableBuiltinModule,
  hasBuiltinModuleCapability,
  isBuiltinModuleEnabled,
  isBuiltinModuleInstalled,
  resolveBuiltinModuleState,
} from "../../src/features/library/utils/moduleRegistry";

describe("module registry", () => {
  it("keeps image prompt cards as the required default module", () => {
    const state = resolveBuiltinModuleState({
      "image-prompt": { enabled: false, installed: false },
    });

    expect(canDisableBuiltinModule("image-prompt")).toBe(false);
    expect(isBuiltinModuleInstalled("image-prompt", state)).toBe(true);
    expect(isBuiltinModuleEnabled("image-prompt", state)).toBe(true);
    expect(hasBuiltinModuleCapability("image-prompt-card", state)).toBe(true);
  });

  it("keeps optional built-in modules installed and enabled by default", () => {
    const state = resolveBuiltinModuleState();

    expect(hasBuiltinModuleCapability("video-prompt-card", state)).toBe(true);
    expect(hasBuiltinModuleCapability("image-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("deduplicate-scan", state)).toBe(true);
  });

  it("enables optional modules after user installs and enables them", () => {
    const state = resolveBuiltinModuleState({
      "video-prompt": { installed: true, enabled: true },
      "video-runtime": { installed: true, enabled: true },
      "image-compression": { installed: true, enabled: true },
      "image-runtime": { installed: true, enabled: true },
      "video-compression": { installed: true, enabled: true },
      "deduplicate-scan": { installed: true, enabled: true },
    });

    expect(hasBuiltinModuleCapability("video-prompt-card", state)).toBe(true);
    expect(hasBuiltinModuleCapability("image-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("deduplicate-scan", state)).toBe(true);
  });

  it("ignores persisted disabled state and keeps all modules enabled by default", () => {
    const state = resolveBuiltinModuleState({
      "video-prompt": { installed: true, enabled: true },
      "video-runtime": { installed: false, enabled: false },
      "video-compression": { installed: true, enabled: true },
      "image-compression": { installed: false, enabled: false },
    });

    expect(isBuiltinModuleEnabled("video-runtime", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-prompt-card", state)).toBe(true);
    expect(hasBuiltinModuleCapability("video-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("image-compression", state)).toBe(true);
    expect(hasBuiltinModuleCapability("image-prompt-card", state)).toBe(true);
  });
});
