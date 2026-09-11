import { describe, expect, it } from "vitest";
import {
  applyThemePresetToRoot,
  applyThemeModeToRoot,
  getThemeAccentColor,
  getThemePresetLabel,
  finishThemeModeSwitch,
  getThemeModeLabel,
  isThemeAccent,
  isThemeCustomAccentSlot,
  normalizeThemeAccentOpacity,
  normalizeThemeCustomAccent,
  normalizeThemeCustomTheme,
  normalizeThemeCustomAccents,
  normalizeThemeOpacity,
  resolveThemePreset,
  resolveThemeAccent,
  resolveThemeMode,
  themePresetOptions,
  type ThemeRoot,
} from "@/features/library/utils/themeMode";

describe("themeMode", () => {
  it("migrates old themes and validates independently saved role colors", () => {
    expect(normalizeThemeCustomTheme({})).toMatchObject({ secondaryColor: null, tertiaryColor: null });
    expect(normalizeThemeCustomTheme({ secondaryColor: "#AABBCC", tertiaryColor: "url(bad)" })).toMatchObject({ secondaryColor: "#aabbcc", tertiaryColor: null });
  });

  it("keeps role colors across mode/preset switches and clears overrides on automatic reset", () => {
    const root = createThemeRoot();
    applyThemeModeToRoot("light", root, { customTheme: { secondaryColor: "#EEDDCC", tertiaryColor: "#334455" } });
    expect(root.customProperties["--theme-role-secondary"]).toBe("#eeddcc");
    expect(root.customProperties["--theme-role-secondary-foreground"]).toBe("#171717");
    expect(root.customProperties["--theme-role-tertiary-foreground"]).toBe("#ffffff");
    applyThemePresetToRoot("proof", root);
    applyThemeModeToRoot("dark", root);
    expect(root.customProperties["--theme-role-secondary"]).toBe("#eeddcc");
    expect(root.customProperties["--theme-role-tertiary"]).toBe("#334455");
    applyThemeModeToRoot("dark", root, { customTheme: { secondaryColor: null, tertiaryColor: null } });
    expect(root.customProperties["--theme-role-secondary"]).toBe("initial");
    expect(root.customProperties["--theme-role-tertiary"]).toBe("initial");
    expect(root.dataset.themeSecondaryColor).toBeUndefined();
  });

  it("uses the chosen custom surface to keep text legible even in the opposite display mode", () => {
    const root = createThemeRoot();
    applyThemeModeToRoot("dark", root, { themePreset: "custom", customTheme: { workspaceColor: "#ffffff", navigationColor: "#111111" } });
    expect(root.customProperties["--theme-role-ink-override"]).toBe("#171717");
    expect(root.customProperties["--theme-custom-foreground"]).toBe("#171717");
    expect(root.customProperties["--theme-custom-navigation-foreground"]).toBe("#ffffff");
    applyThemePresetToRoot("proof", root);
    expect(root.customProperties["--theme-role-ink-override"]).toBe("initial");
  });
  it("keeps explicit theme mode", () => {
    expect(resolveThemeMode("light")).toBe("light");
    expect(resolveThemeMode("dark")).toBe("dark");
  });

  it("returns Chinese labels for the theme switcher", () => {
    expect(getThemeModeLabel("light")).toBe("浅色");
    expect(getThemeModeLabel("dark")).toBe("深色");
  });

  it("provides Codex-style presets and falls back to Raycast", () => {
    expect(themePresetOptions.map((option) => option.value)).toEqual([
      "custom",
      "raycast",
      "notion",
      "one",
      "proof",
      "rose-pine",
      "solarized",
      "vercel",
      "vs-code-plus",
      "xcode",
    ]);
    expect(resolveThemePreset(undefined)).toBe("raycast");
    expect(resolveThemePreset("solarized")).toBe("solarized");
    expect(resolveThemePreset("unknown")).toBe("raycast");
    expect(getThemePresetLabel("raycast")).toBe("Raycast");
  });

  it("provides recommendation card accents and normalizes custom colors", () => {
    expect(isThemeAccent("sage")).toBe(true);
    expect(isThemeAccent("custom")).toBe(true);
    expect(isThemeAccent("custom1")).toBe(true);
    expect(isThemeCustomAccentSlot("custom3")).toBe(true);
    expect(isThemeAccent("unknown")).toBe(false);
    expect(resolveThemeAccent(undefined)).toBe("coral");
    expect(resolveThemeAccent("mist")).toBe("mist");
    expect(normalizeThemeCustomAccent("#A1B2C3")).toBe("#a1b2c3");
    expect(normalizeThemeCustomAccent("red")).toBe("#ff6363");
    expect(getThemeAccentColor("sage", "light")).toBe("#42594d");
    expect(getThemeAccentColor("sage", "dark")).toBe("#c7dbc9");
    expect(getThemeAccentColor("custom", "light", "#A1B2C3")).toBe("#a1b2c3");
    expect(getThemeAccentColor("custom2", "light", "#ff6363", ["#111111", "#A1B2C3", "#333333"])).toBe("#a1b2c3");
    expect(getThemeAccentColor("custom3", "light", ["#111111", "#222222", "#A1B2C3"])).toBe("#a1b2c3");
    expect(normalizeThemeCustomAccents(undefined)).toEqual(["#ff6363", "#7357e8", "#0f766e"]);
    expect(normalizeThemeCustomAccents(["#A1B2C3", "bad", "#D4E5F6"])).toEqual(["#a1b2c3", "#7357e8", "#d4e5f6"]);
    expect(normalizeThemeOpacity(undefined)).toBe(100);
    expect(normalizeThemeOpacity(10)).toBe(15);
    expect(normalizeThemeOpacity(120)).toBe(100);
    expect(normalizeThemeAccentOpacity(10)).toBe(30);
  });

  it("commits theme tokens synchronously and suppresses transitions for the switching frame", () => {
    const root = createThemeRoot();

    applyThemeModeToRoot("dark", root, { suppressTransitions: true });

    expect(root.dataset).toEqual({
      theme: "dark",
      themeMode: "dark",
      themePreset: "raycast",
      themeAccent: "coral",
      themeCustomAccent: "#ff6363",
      themeCustomAccent1: "#ff6363",
      themeCustomAccent2: "#7357e8",
      themeCustomAccent3: "#0f766e",
      themeOpacity: "100",
      themeNavigationOpacity: "100",
      themeBackgroundOpacity: "100",
      themeWorkspaceOpacity: "100",
      themeAccentOpacity: "100",
      themeCustomNavigation: "#e7e8ec",
      themeCustomBackground: "#f6f6f7",
      themeCustomWorkspace: "#ffffff",
      themeCustomAccentColor: "#ff6363",
      themeSwitching: "true",
    });
    expect(root.style.colorScheme).toBe("dark");

    finishThemeModeSwitch("dark", root);
    expect(root.dataset.themeSwitching).toBeUndefined();
  });

  it("applies a selected preset without changing the current mode", () => {
    const root = createThemeRoot();
    root.dataset.themeMode = "dark";

    applyThemePresetToRoot("solarized", root, { suppressTransitions: true });

    expect(root.dataset.themeMode).toBe("dark");
    expect(root.dataset.themePreset).toBe("solarized");
    expect(root.dataset.themeSwitching).toBe("true");
  });

  it("applies preset and custom accent variables immediately", () => {
    const root = createThemeRoot();

    applyThemeModeToRoot("light", root, { themeAccent: "mist" });
    expect(root.dataset.themeAccent).toBe("mist");
    expect(root.customProperties["--color-primary"]).toBe("#435663");
    expect(root.customProperties["--color-primary-foreground"]).toBe("#ffffff");
    expect(root.customProperties["--color-progress"]).toBe("#435663");

    applyThemeModeToRoot("light", root, { themeAccent: "custom", themeCustomAccent: "#A1B2C3" });
    expect(root.dataset.themeAccent).toBe("custom");
    expect(root.dataset.themeCustomAccent).toBe("#a1b2c3");
    expect(root.customProperties["--color-primary"]).toBe("#a1b2c3");
    expect(root.customProperties["--color-ring"]).toBe("#a1b2c3");

    applyThemeModeToRoot("light", root, {
      themeAccent: "custom3",
      themeCustomAccents: ["#111111", "#222222", "#A1B2C3"],
      themeOpacity: 72,
      themeAccentOpacity: 55,
    });
    expect(root.dataset.themeCustomAccent3).toBe("#a1b2c3");
    expect(root.customProperties["--theme-opacity"]).toBe("72%");
    expect(root.customProperties["--theme-navigation-opacity"]).toBe("72%");
    expect(root.customProperties["--theme-background-opacity"]).toBe("72%");
    expect(root.customProperties["--theme-workspace-opacity"]).toBe("72%");
    expect(root.customProperties["--theme-accent-opacity"]).toBe("55%");
    expect(root.customProperties["--color-primary"]).toContain("55%");
  });

  it("applies custom theme colors and background image variables", () => {
    const root = createThemeRoot();

    applyThemeModeToRoot("light", root, {
      themePreset: "custom",
      themeAccent: "custom",
      customTheme: {
        navigationColor: "#112233",
        backgroundColor: "#223344",
        workspaceColor: "#334455",
        accentColor: "#AABBCC",
        backgroundImageFileName: "theme-background-demo.webp",
      },
      themeNavigationOpacity: 40,
      themeBackgroundOpacity: 50,
      themeWorkspaceOpacity: 60,
    });

    expect(root.dataset.themePreset).toBe("custom");
    expect(root.customProperties["--theme-custom-navigation"]).toBe("#112233");
    expect(root.customProperties["--theme-custom-background"]).toBe("#223344");
    expect(root.customProperties["--theme-custom-workspace"]).toBe("#334455");
    expect(root.customProperties["--theme-custom-accent"]).toBe("#aabbcc");
    expect(root.customProperties["--theme-custom-background-image"]).toContain("app-theme://local/theme-background-demo.webp");
    expect(root.customProperties["--theme-navigation-opacity"]).toBe("40%");
    expect(root.customProperties["--theme-background-opacity"]).toBe("50%");
    expect(root.customProperties["--theme-workspace-opacity"]).toBe("60%");
    expect(root.customProperties["--color-primary"]).toContain("#aabbcc");

    applyThemePresetToRoot("raycast", root);
    expect(root.dataset.themePreset).toBe("raycast");
    expect(root.customProperties["--theme-custom-background-image"]).toBe("none");
    expect(root.dataset.themeCustomBackgroundImage).toBe("theme-background-demo.webp");

    applyThemePresetToRoot("custom", root);
    expect(root.customProperties["--theme-custom-background-image"]).toContain("app-theme://local/theme-background-demo.webp");
  });

  it("does not let an older switch clear transition suppression for a newer theme", () => {
    const root = createThemeRoot();

    applyThemeModeToRoot("dark", root, { suppressTransitions: true });
    applyThemeModeToRoot("light", root, { suppressTransitions: true });
    finishThemeModeSwitch("dark", root);

    expect(root.dataset.themeSwitching).toBe("true");

    finishThemeModeSwitch("light", root);
    expect(root.dataset.themeSwitching).toBeUndefined();
  });
});

function createThemeRoot(): ThemeRoot & { customProperties: Record<string, string> } {
  const customProperties: Record<string, string> = {};

  return {
    dataset: {},
    customProperties,
    style: {
      colorScheme: "",
      setProperty: (property, value) => {
        customProperties[property] = value;
      },
    },
  };
}
