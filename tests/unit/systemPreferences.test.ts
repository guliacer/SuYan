import { describe, expect, it } from "vitest";
import {
  defaultSystemPreferenceSection,
  isSystemPreferenceSection,
  systemPreferenceSectionMeta,
  systemPreferenceSections,
} from "../../src/features/library/utils/systemPreferences";

describe("systemPreferences", () => {
  it("lists the consolidated preference sections in stable order", () => {
    expect(systemPreferenceSections).toEqual(["proxy", "appearance", "visualLife", "canvasBackground", "layout", "sidebar", "modules", "startupGallery"]);
    expect(defaultSystemPreferenceSection).toBe("proxy");
  });

  it("exposes labels for every section", () => {
    for (const section of systemPreferenceSections) {
      expect(systemPreferenceSectionMeta[section].label.length).toBeGreaterThan(0);
      expect(systemPreferenceSectionMeta[section].description.length).toBeGreaterThan(0);
    }
  });

  it("type-guards known section ids", () => {
    expect(isSystemPreferenceSection("modules")).toBe(true);
    expect(isSystemPreferenceSection("sidebar")).toBe(true);
    expect(isSystemPreferenceSection("appearance")).toBe(true);
    expect(isSystemPreferenceSection("performance")).toBe(false);
    expect(isSystemPreferenceSection("aiSettings")).toBe(false);
  });
});
