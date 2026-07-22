import { describe, expect, it } from "vitest";
import {
  applyThemeModeToRoot,
  finishThemeModeSwitch,
  getThemeModeLabel,
  resolveThemeMode,
  type ThemeRoot,
} from "@/features/library/utils/themeMode";

describe("themeMode", () => {
  it("keeps explicit theme mode", () => {
    expect(resolveThemeMode("light")).toBe("light");
    expect(resolveThemeMode("dark")).toBe("dark");
  });

  it("returns Chinese labels for the theme switcher", () => {
    expect(getThemeModeLabel("light")).toBe("浅色");
    expect(getThemeModeLabel("dark")).toBe("深色");
  });

  it("commits theme tokens synchronously and suppresses transitions for the switching frame", () => {
    const root = createThemeRoot();

    applyThemeModeToRoot("dark", root, { suppressTransitions: true });

    expect(root.dataset).toEqual({
      theme: "dark",
      themeMode: "dark",
      themeSwitching: "true",
    });
    expect(root.style.colorScheme).toBe("dark");

    finishThemeModeSwitch("dark", root);
    expect(root.dataset.themeSwitching).toBeUndefined();
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

function createThemeRoot(): ThemeRoot {
  return {
    dataset: {},
    style: { colorScheme: "" },
  };
}
