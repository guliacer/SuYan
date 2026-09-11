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
    expect(settings.sidebarEntryVisibility.systemPreferences).toBe(true);
  });

  it("names the appearance entry as the theme settings entry", () => {
    expect(sidebarEntryMeta.appearance).toEqual({
      label: "主题",
      description: "选择主题与浅色或深色模式",
    });
  });
});
