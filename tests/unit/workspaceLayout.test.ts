import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceWidthPercent,
  maxWorkspaceWidthPercent,
  minWorkspaceWidthPercent,
  normalizeWorkspaceWidthPercent,
} from "../../src/features/library/types/library";
import { normalizeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";

describe("workspace layout settings", () => {
  it("uses the default and clamps persisted width values", () => {
    expect(normalizeWorkspaceWidthPercent(undefined)).toBe(defaultWorkspaceWidthPercent);
    expect(normalizeWorkspaceWidthPercent(minWorkspaceWidthPercent - 1)).toBe(minWorkspaceWidthPercent);
    expect(normalizeWorkspaceWidthPercent(maxWorkspaceWidthPercent + 1)).toBe(maxWorkspaceWidthPercent);
    expect(normalizeWorkspaceWidthPercent(84.6)).toBe(85);
  });

  it("keeps the workspace width in the view-settings contract", () => {
    expect(normalizeLibraryViewSettings({ workspaceWidthPercent: 76 }).workspaceWidthPercent).toBe(76);
    expect(normalizeLibraryViewSettings({}).workspaceWidthPercent).toBe(defaultWorkspaceWidthPercent);
  });

  it("defaults the interface language to Chinese and preserves English", () => {
    expect(normalizeLibraryViewSettings({}).language).toBe("zh-CN");
    expect(normalizeLibraryViewSettings({ language: "en-US" }).language).toBe("en-US");
    expect(normalizeLibraryViewSettings({ language: "fr-FR" }).language).toBe("zh-CN");
  });

  it("keeps a valid theme preset and defaults legacy settings to Proof", () => {
    expect(normalizeLibraryViewSettings({ themePreset: "xcode" }).themePreset).toBe("xcode");
    expect(normalizeLibraryViewSettings({}).themePreset).toBe("proof");
    expect(normalizeLibraryViewSettings({ themePreset: "not-a-theme" }).themePreset).toBe("proof");
  });

  it("keeps button accent settings compatible with legacy view settings", () => {
    expect(normalizeLibraryViewSettings({}).themeAccent).toBe("sage");
    expect(normalizeLibraryViewSettings({}).themeCustomAccent).toBe("#ff6363");
    expect(normalizeLibraryViewSettings({ themeAccent: "sage" }).themeAccent).toBe("sage");
    expect(normalizeLibraryViewSettings({ themeAccent: "custom", themeCustomAccent: "#A1B2C3" })).toMatchObject({
      themeAccent: "custom",
      themeCustomAccent: "#a1b2c3",
    });
    expect(normalizeLibraryViewSettings({ themeAccent: "unknown", themeCustomAccent: "not-hex" })).toMatchObject({
      themeAccent: "sage",
      themeCustomAccent: "#ff6363",
    });
    expect(normalizeLibraryViewSettings({
      themeCustomAccents: ["#A1B2C3", "#D4E5F6", "bad"],
      themeOpacity: 68,
      themeNavigationOpacity: 68,
      themeBackgroundOpacity: 68,
      themeWorkspaceOpacity: 68,
      themeAccentOpacity: 44,
    })).toMatchObject({
      themeCustomAccent: "#a1b2c3",
      themeCustomAccents: ["#a1b2c3", "#d4e5f6", "#0f766e"],
      themeOpacity: 68,
      themeNavigationOpacity: 68,
      themeBackgroundOpacity: 68,
      themeWorkspaceOpacity: 68,
      themeAccentOpacity: 44,
    });
    expect(normalizeLibraryViewSettings({ themeOpacity: 4, themeAccentOpacity: 140 })).toMatchObject({
      themeOpacity: 15,
      themeNavigationOpacity: 15,
      themeBackgroundOpacity: 15,
      themeWorkspaceOpacity: 15,
      themeAccentOpacity: 100,
    });
    expect(normalizeLibraryViewSettings({ themeNavigationOpacity: 22, themeBackgroundOpacity: 44, themeWorkspaceOpacity: 66 })).toMatchObject({
      themeNavigationOpacity: 22,
      themeBackgroundOpacity: 44,
      themeWorkspaceOpacity: 66,
      themeOpacity: 22,
    });
    expect(normalizeLibraryViewSettings({
      themePreset: "custom",
      customTheme: {
        navigationColor: "#112233",
        backgroundColor: "#223344",
        workspaceColor: "#334455",
        accentColor: "#AABBCC",
        backgroundImageFileName: "theme-background-demo.webp",
      },
    })).toMatchObject({
      themePreset: "custom",
      themeAccent: "custom",
      customTheme: {
        navigationColor: "#112233",
        backgroundColor: "#223344",
        workspaceColor: "#334455",
        accentColor: "#aabbcc",
        backgroundImageFileName: "theme-background-demo.webp",
      },
    });
    expect(normalizeLibraryViewSettings({ customTheme: { backgroundImageFileName: "..\\outside.png" } }).customTheme.backgroundImageFileName).toBeNull();
    expect(normalizeLibraryViewSettings({
      themePreset: "raycast",
      themeAccent: "sage",
      themeCustomAccents: ["#111111", "#222222", "#333333"],
      themeAccentMemory: { notion: { accent: "rose", customAccents: ["#444444", "#555555", "#666666"] } },
    })).toMatchObject({
      themeAccent: "sage",
      themeAccentMemory: {
        notion: { accent: "rose", customAccents: ["#444444", "#555555", "#666666"] },
        raycast: { accent: "sage", customAccents: ["#111111", "#222222", "#333333"] },
      },
    });
  });
});
