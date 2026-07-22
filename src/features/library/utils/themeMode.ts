import type { ThemeMode } from "../types/library";

export type ResolvedThemeMode = "light" | "dark";

export type ThemeRoot = {
  dataset: Record<string, string | undefined>;
  style: {
    colorScheme: string;
  };
};

export function resolveThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  return themeMode;
}

export function applyThemeModeToRoot(
  themeMode: ThemeMode,
  root: ThemeRoot = document.documentElement,
  options: { suppressTransitions?: boolean } = {},
): void {
  const resolvedTheme = resolveThemeMode(themeMode);

  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = themeMode;
  root.style.colorScheme = resolvedTheme;

  if (options.suppressTransitions) {
    root.dataset.themeSwitching = "true";
  }
}

export function finishThemeModeSwitch(themeMode: ThemeMode, root: ThemeRoot = document.documentElement): void {
  if (root.dataset.themeMode === themeMode) {
    delete root.dataset.themeSwitching;
  }
}

export function getThemeModeLabel(themeMode: ThemeMode): string {
  const labels: Record<ThemeMode, string> = {
    light: "浅色",
    dark: "深色",
  };

  return labels[themeMode];
}
