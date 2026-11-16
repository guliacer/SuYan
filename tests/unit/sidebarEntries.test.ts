import { describe, expect, it } from "vitest";
import { normalizeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";
import {
  defaultSidebarEntryVisibility,
  isSidebarEntryVisibility,
  normalizeSidebarEntryVisibility,
  sidebarEntryMeta,
} from "../../src/features/library/utils/sidebarEntries";

describe("sidebar entry visibility", () => {
  it("enables every entry by default", () => {
    const visibility = normalizeSidebarEntryVisibility(undefined);

    expect(visibility).toEqual(defaultSidebarEntryVisibility);
  });

  it("preserves optional choices while forcing core entries on", () => {
    const visibility = normalizeSidebarEntryVisibility({
      home: false,
      systemPreferences: false,
      todo: false,
      about: false,
    });

    expect(visibility.home).toBe(true);
    expect(visibility.systemPreferences).toBe(true);
    expect(visibility.todo).toBe(false);
    expect(visibility.about).toBe(false);
    expect(isSidebarEntryVisibility(visibility)).toBe(true);
  });

  it("migrates missing persisted settings without changing old preferences", () => {
    const settings = normalizeLibraryViewSettings({
      themeMode: "dark",
      sidebarEntryVisibility: { todo: false, appearance: false },
    });

    expect(settings.sidebarEntryVisibility.todo).toBe(false);
    expect(settings.sidebarEntryVisibility.appearance).toBe(false);
    expect(settings.sidebarEntryVisibility.home).toBe(true);
    expect(settings.sidebarEntryVisibility.imageUpscale).toBe(true);
    expect(settings.sidebarEntryVisibility.systemPreferences).toBe(true);
  });

  it("places image upscale before prompt creation in the inspiration group", async () => {
    const { sidebarEntryGroups, sidebarEntryMeta } = await import(
      "../../src/features/library/utils/sidebarEntries"
    );
    const materialEntries = sidebarEntryGroups.find((group) => group.id === "materials")?.entries ?? [];

    const inspirationEntries = sidebarEntryGroups.find((group) => group.id === "inspiration")?.entries ?? [];

    expect(materialEntries).not.toContain("imageUpscale");
    expect(inspirationEntries.slice(0, 2)).toEqual(["imageUpscale", "textPrompts"]);
    expect(sidebarEntryMeta.imageUpscale).toEqual({
      label: "图片超分",
      description: "使用本地双引擎放大并修复图片",
    });
  });

  it("names the appearance entry as the theme settings entry", () => {
    expect(sidebarEntryMeta.appearance).toEqual({
      label: "主题",
      description: "选择主题与浅色或深色模式",
    });
  });
});
