import type {
  ThemeAccent,
  ThemeAccentMemoryByPreset,
  ThemeCustomAccentSlot,
  ThemeCustomTheme,
  ThemeMode,
  ThemePreset,
} from "../types/library";

export type ResolvedThemeMode = "light" | "dark";
export const DEFAULT_THEME_PRESET = "proof" as const;
export const DEFAULT_THEME_ACCENT = "sage" as const;
export const DEFAULT_THEME_CUSTOM_ACCENT = "#ff6363" as const;
export const DEFAULT_THEME_OPACITY = 100 as const;
export const DEFAULT_THEME_ACCENT_OPACITY = 100 as const;
export const MIN_THEME_OPACITY = 15 as const;
export const MIN_THEME_ACCENT_OPACITY = 30 as const;
export const DEFAULT_THEME_CUSTOM_ACCENTS = ["#ff6363", "#7357e8", "#0f766e"] as const;
export const DEFAULT_THEME_CUSTOM_THEME: ThemeCustomTheme = {
  navigationColor: "#e7e8ec",
  backgroundColor: "#f6f6f7",
  workspaceColor: "#ffffff",
  accentColor: "#ff6363",
  backgroundImageFileName: null,
};

export type ThemeAccentOption = {
  value: Exclude<ThemeAccent, "custom">;
  label: string;
  description: string;
  lightColor: string;
  darkColor: string;
};

/** 与资源推荐卡片的 capsule tone 对齐，颜色本身使用卡片的前景色保证按钮文字对比度。 */
export const themeAccentOptions: readonly ThemeAccentOption[] = [
  { value: "coral", label: "珊瑚", description: "默认推荐色", lightColor: "#ff6363", darkColor: "#ff7a7a" },
  { value: "sage", label: "鼠尾草", description: "清新自然", lightColor: "#42594d", darkColor: "#c7dbc9" },
  { value: "mist", label: "雾蓝", description: "冷静清爽", lightColor: "#435663", darkColor: "#c2d7e3" },
  { value: "clay", label: "陶土", description: "温暖沉稳", lightColor: "#665048", darkColor: "#e3cbbf" },
  { value: "lavender", label: "薰衣草", description: "柔和灵感", lightColor: "#574f68", darkColor: "#d7cbe5" },
  { value: "rose", label: "玫瑰", description: "柔和醒目", lightColor: "#664d55", darkColor: "#e5c8d0" },
  { value: "sand", label: "沙砾", description: "温和克制", lightColor: "#625846", darkColor: "#e4d4b8" },
];

const defaultThemeAccents: Record<ThemePreset, ThemeAccent> = {
  custom: "custom",
  raycast: "coral",
  notion: "sand",
  one: "mist",
  proof: "sage",
  "rose-pine": "rose",
  solarized: "sand",
  vercel: "stone",
  "vs-code-plus": "mist",
  xcode: "mist",
};

export function getDefaultThemeAccentForPreset(themePreset: ThemePreset): ThemeAccent {
  return defaultThemeAccents[themePreset] ?? DEFAULT_THEME_ACCENT;
}

export function normalizeThemeAccentMemory(value: unknown): ThemeAccentMemoryByPreset {
  if (!isRecord(value)) {
    return {};
  }

  const memory: ThemeAccentMemoryByPreset = {};
  for (const option of themePresetOptions) {
    const candidate = value[option.value];
    if (!isRecord(candidate)) {
      continue;
    }
    const customAccents = normalizeThemeCustomAccents(candidate.customAccents, candidate.customAccent);
    memory[option.value] = {
      accent: resolveThemeAccent(candidate.accent),
      customAccents,
    };
  }
  return memory;
}

export function createDefaultThemeAccentMemory(): ThemeAccentMemoryByPreset {
  return Object.fromEntries(themePresetOptions.map((option) => [
    option.value,
    {
      accent: getDefaultThemeAccentForPreset(option.value),
      customAccents: [...DEFAULT_THEME_CUSTOM_ACCENTS] as [string, string, string],
    },
  ])) as ThemeAccentMemoryByPreset;
}

// Removed from the visible palette because they were too close to other neutrals.
// Keep their values available so existing settings continue to render correctly.
const legacyThemeAccentColors: Record<"fog" | "stone", { lightColor: string; darkColor: string }> = {
  fog: { lightColor: "#515a54", darkColor: "#d0d9d2" },
  stone: { lightColor: "#59554d", darkColor: "#d8d1c5" },
};

export type ThemeCustomAccentOption = {
  value: ThemeCustomAccentSlot;
  label: string;
  description: string;
};

export const themeCustomAccentOptions: readonly ThemeCustomAccentOption[] = [
  { value: "custom1", label: "自定义 1", description: "自定义按钮色 1" },
  { value: "custom2", label: "自定义 2", description: "自定义按钮色 2" },
  { value: "custom3", label: "自定义 3", description: "自定义按钮色 3" },
];

const themeAccentValues = [
  ...themeAccentOptions.map((option) => option.value),
  "custom",
  ...themeCustomAccentOptions.map((option) => option.value),
  ...Object.keys(legacyThemeAccentColors),
] as const;

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return themeAccentValues.includes(value as ThemeAccent);
}

export function resolveThemeAccent(value: unknown): ThemeAccent {
  return isThemeAccent(value) ? value : DEFAULT_THEME_ACCENT;
}

export function isThemeCustomAccentSlot(value: unknown): value is ThemeCustomAccentSlot {
  return value === "custom1" || value === "custom2" || value === "custom3";
}

export function isThemeCustomAccent(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeThemeCustomAccent(value: unknown): string {
  return isThemeCustomAccent(value) ? value.toLowerCase() : DEFAULT_THEME_CUSTOM_ACCENT;
}

export function isThemeBackgroundFileName(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 180
    && value === value.split(/[\\/]/).pop()
    && /^[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp|gif|bmp)$/i.test(value);
}

export function normalizeThemeCustomTheme(value: unknown): ThemeCustomTheme {
  const input = isRecord(value) ? value : {};
  return {
    navigationColor: normalizeHexWithFallback(input.navigationColor, DEFAULT_THEME_CUSTOM_THEME.navigationColor),
    secondaryColor: isThemeCustomAccent(input.secondaryColor) ? input.secondaryColor.toLowerCase() : null,
    tertiaryColor: isThemeCustomAccent(input.tertiaryColor) ? input.tertiaryColor.toLowerCase() : null,
    backgroundColor: normalizeHexWithFallback(input.backgroundColor, DEFAULT_THEME_CUSTOM_THEME.backgroundColor),
    workspaceColor: normalizeHexWithFallback(input.workspaceColor, DEFAULT_THEME_CUSTOM_THEME.workspaceColor),
    accentColor: normalizeHexWithFallback(input.accentColor, DEFAULT_THEME_CUSTOM_THEME.accentColor),
    backgroundImageFileName: isThemeBackgroundFileName(input.backgroundImageFileName)
      ? input.backgroundImageFileName
      : null,
  };
}

function normalizeHexWithFallback(value: unknown, fallback: string): string {
  return isThemeCustomAccent(value) ? value.toLowerCase() : fallback;
}

export function normalizeThemeOpacity(value: unknown): number {
  return normalizeOpacity(value, DEFAULT_THEME_OPACITY, MIN_THEME_OPACITY);
}

export function normalizeThemeAccentOpacity(value: unknown): number {
  return normalizeOpacity(value, DEFAULT_THEME_ACCENT_OPACITY, MIN_THEME_ACCENT_OPACITY);
}

function normalizeOpacity(value: unknown, fallback: number, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(minimum, Math.round(value)));
}

export function normalizeThemeCustomAccents(
  value: unknown,
  legacyFirstAccent: unknown = DEFAULT_THEME_CUSTOM_ACCENT,
): [string, string, string] {
  if (!Array.isArray(value)) {
    return [
      normalizeThemeCustomAccent(legacyFirstAccent),
      DEFAULT_THEME_CUSTOM_ACCENTS[1],
      DEFAULT_THEME_CUSTOM_ACCENTS[2],
    ];
  }

  return [
    isThemeCustomAccent(value[0]) ? value[0].toLowerCase() : normalizeThemeCustomAccent(legacyFirstAccent),
    isThemeCustomAccent(value[1]) ? value[1].toLowerCase() : DEFAULT_THEME_CUSTOM_ACCENTS[1],
    isThemeCustomAccent(value[2]) ? value[2].toLowerCase() : DEFAULT_THEME_CUSTOM_ACCENTS[2],
  ];
}

export function getThemeAccentColor(
  themeAccent: ThemeAccent,
  themeMode: ThemeMode,
  themeCustomAccent: string | readonly string[] = DEFAULT_THEME_CUSTOM_ACCENT,
  themeCustomAccents: readonly string[] = DEFAULT_THEME_CUSTOM_ACCENTS,
): string {
  const legacyCustomAccent = Array.isArray(themeCustomAccent) ? themeCustomAccent[0] : themeCustomAccent;
  const resolvedCustomAccents = Array.isArray(themeCustomAccent) ? themeCustomAccent : themeCustomAccents;

  if (themeAccent === "custom") {
    return normalizeThemeCustomAccent(legacyCustomAccent);
  }

  if (isThemeCustomAccentSlot(themeAccent)) {
    const slotIndex = themeAccent === "custom2" ? 1 : themeAccent === "custom3" ? 2 : 0;
    if (slotIndex === 0 && legacyCustomAccent !== DEFAULT_THEME_CUSTOM_ACCENT && resolvedCustomAccents === DEFAULT_THEME_CUSTOM_ACCENTS) {
      return normalizeThemeCustomAccent(legacyCustomAccent);
    }
    const slotValue = resolvedCustomAccents[slotIndex] ?? (slotIndex === 0 ? legacyCustomAccent : undefined);
    return normalizeThemeCustomAccent(slotValue);
  }

  const option = themeAccentOptions.find((candidate) => candidate.value === themeAccent);
  const legacyOption = themeAccent === "fog" || themeAccent === "stone" ? legacyThemeAccentColors[themeAccent] : undefined;
  return option?.[themeMode === "dark" ? "darkColor" : "lightColor"]
    ?? legacyOption?.[themeMode === "dark" ? "darkColor" : "lightColor"]
    ?? DEFAULT_THEME_CUSTOM_ACCENT;
}

export type ThemePresetOption = {
  value: ThemePreset;
  label: string;
  description: string;
};

export const themePresetOptions: readonly ThemePresetOption[] = [
  { value: "custom", label: "自定义主题", description: "自由组合颜色与背景图" },
  { value: "raycast", label: "Raycast", description: "轻盈中性，珊瑚色强调" },
  { value: "notion", label: "Notion", description: "温和纸张，适合长时间整理" },
  { value: "one", label: "One", description: "清爽高亮，突出重点操作" },
  { value: "proof", label: "Proof", description: "冷静青绿，适合专注工作" },
  { value: "rose-pine", label: "Rose Pine", description: "柔和玫瑰，低对比阅读" },
  { value: "solarized", label: "Solarized", description: "经典护眼，暖冷平衡" },
  { value: "vercel", label: "Vercel", description: "纯净黑白，强调内容层级" },
  { value: "vs-code-plus", label: "VS Code+", description: "开发工具风格，信息密度高" },
  { value: "xcode", label: "Xcode", description: "清晰蓝色，强调可操作状态" },
];

const themePresetValues = themePresetOptions.map((option) => option.value);

export function isThemePreset(value: unknown): value is ThemePreset {
  return themePresetValues.includes(value as ThemePreset);
}

export function resolveThemePreset(value: unknown): ThemePreset {
  return isThemePreset(value) ? value : DEFAULT_THEME_PRESET;
}

export function getThemePresetLabel(themePreset: ThemePreset): string {
  return themePresetOptions.find((option) => option.value === themePreset)?.label ?? "Proof";
}

export type ThemeRoot = {
  dataset: Record<string, string | undefined>;
  style: {
    colorScheme: string;
    setProperty: (property: string, value: string) => void;
  };
};

export function resolveThemeMode(themeMode: ThemeMode): ResolvedThemeMode {
  return themeMode;
}

export function applyThemeModeToRoot(
  themeMode: ThemeMode,
  root: ThemeRoot = document.documentElement,
  options: {
    suppressTransitions?: boolean;
    themePreset?: ThemePreset;
    themeAccent?: ThemeAccent;
    themeCustomAccent?: string;
    themeCustomAccents?: readonly string[];
    themeOpacity?: number;
    themeAccentOpacity?: number;
    themeNavigationOpacity?: number;
    themeBackgroundOpacity?: number;
    themeWorkspaceOpacity?: number;
    customTheme?: Partial<ThemeCustomTheme>;
  } = {},
): void {
  const resolvedTheme = resolveThemeMode(themeMode);
  const themePreset = resolveThemePreset(options.themePreset ?? root.dataset.themePreset);
  const themeAccent = resolveThemeAccent(options.themeAccent ?? root.dataset.themeAccent);
  const legacyCustomAccent = normalizeThemeCustomAccent(options.themeCustomAccent ?? root.dataset.themeCustomAccent);
  const persistedCustomAccents = options.themeCustomAccents ?? (
    options.themeCustomAccent === undefined && (root.dataset.themeCustomAccent1 || root.dataset.themeCustomAccent2 || root.dataset.themeCustomAccent3)
      ? [root.dataset.themeCustomAccent1, root.dataset.themeCustomAccent2, root.dataset.themeCustomAccent3]
      : undefined
  );
  const themeCustomAccents = normalizeThemeCustomAccents(persistedCustomAccents, legacyCustomAccent);
  const themeCustomAccent = themeCustomAccents[0];
  const legacyThemeOpacity = normalizeThemeOpacity(options.themeOpacity ?? Number(root.dataset.themeOpacity));
  const hasLegacyOpacityOption = options.themeOpacity !== undefined;
  const themeNavigationOpacity = normalizeThemeOpacity(options.themeNavigationOpacity ?? (hasLegacyOpacityOption ? legacyThemeOpacity : (Number.isFinite(Number(root.dataset.themeNavigationOpacity)) ? Number(root.dataset.themeNavigationOpacity) : legacyThemeOpacity)));
  const themeBackgroundOpacity = normalizeThemeOpacity(options.themeBackgroundOpacity ?? (hasLegacyOpacityOption ? legacyThemeOpacity : (Number.isFinite(Number(root.dataset.themeBackgroundOpacity)) ? Number(root.dataset.themeBackgroundOpacity) : legacyThemeOpacity)));
  const themeWorkspaceOpacity = normalizeThemeOpacity(options.themeWorkspaceOpacity ?? (hasLegacyOpacityOption ? legacyThemeOpacity : (Number.isFinite(Number(root.dataset.themeWorkspaceOpacity)) ? Number(root.dataset.themeWorkspaceOpacity) : legacyThemeOpacity)));
  const themeAccentOpacity = normalizeThemeAccentOpacity(options.themeAccentOpacity ?? Number(root.dataset.themeAccentOpacity));
  const customTheme = normalizeThemeCustomTheme({
    secondaryColor: options.customTheme !== undefined ? options.customTheme.secondaryColor : root.dataset.themeSecondaryColor,
    tertiaryColor: options.customTheme !== undefined ? options.customTheme.tertiaryColor : root.dataset.themeTertiaryColor,
    navigationColor: options.customTheme?.navigationColor ?? root.dataset.themeCustomNavigation,
    backgroundColor: options.customTheme?.backgroundColor ?? root.dataset.themeCustomBackground,
    workspaceColor: options.customTheme?.workspaceColor ?? root.dataset.themeCustomWorkspace,
    accentColor: options.customTheme?.accentColor ?? root.dataset.themeCustomAccentColor,
    backgroundImageFileName: options.customTheme?.backgroundImageFileName ?? root.dataset.themeCustomBackgroundImage,
  });

  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = themeMode;
  root.dataset.themePreset = themePreset;
  root.dataset.themeAccent = themeAccent;
  root.dataset.themeCustomAccent = themeCustomAccent;
  root.dataset.themeCustomAccent1 = themeCustomAccents[0];
  root.dataset.themeCustomAccent2 = themeCustomAccents[1];
  root.dataset.themeCustomAccent3 = themeCustomAccents[2];
  root.dataset.themeOpacity = String(themeNavigationOpacity);
  root.dataset.themeNavigationOpacity = String(themeNavigationOpacity);
  root.dataset.themeBackgroundOpacity = String(themeBackgroundOpacity);
  root.dataset.themeWorkspaceOpacity = String(themeWorkspaceOpacity);
  root.dataset.themeAccentOpacity = String(themeAccentOpacity);
  root.dataset.themeCustomNavigation = customTheme.navigationColor;
  root.dataset.themeCustomBackground = customTheme.backgroundColor;
  root.dataset.themeCustomWorkspace = customTheme.workspaceColor;
  root.dataset.themeCustomAccentColor = customTheme.accentColor;
  for (const role of ["secondary", "tertiary"] as const) {
    const color = customTheme[`${role}Color`];
    const key = role === "secondary" ? "themeSecondaryColor" : "themeTertiaryColor";
    if (color) root.dataset[key] = color;
    else delete root.dataset[key];
    root.style.setProperty(`--theme-role-${role}`, color ?? "initial");
    root.style.setProperty(`--theme-role-${role}-foreground`, color ? getAccentForeground(color) : "initial");
  }
  if (customTheme.backgroundImageFileName) {
    root.dataset.themeCustomBackgroundImage = customTheme.backgroundImageFileName;
  } else {
    delete root.dataset.themeCustomBackgroundImage;
  }
  root.style.colorScheme = resolvedTheme;
  root.style.setProperty("--theme-opacity", `${themeNavigationOpacity}%`);
  root.style.setProperty("--theme-navigation-opacity", `${themeNavigationOpacity}%`);
  root.style.setProperty("--theme-background-opacity", `${themeBackgroundOpacity}%`);
  root.style.setProperty("--theme-workspace-opacity", `${themeWorkspaceOpacity}%`);
  root.style.setProperty("--theme-accent-opacity", `${themeAccentOpacity}%`);
  root.style.setProperty("--theme-custom-navigation", customTheme.navigationColor);
  root.style.setProperty("--theme-custom-background", customTheme.backgroundColor);
  root.style.setProperty("--theme-custom-workspace", customTheme.workspaceColor);
  root.style.setProperty("--theme-custom-foreground", getAccentForeground(customTheme.workspaceColor));
  root.style.setProperty("--theme-custom-navigation-foreground", getAccentForeground(customTheme.navigationColor));
  root.style.setProperty("--theme-role-ink-override", themePreset === "custom" ? getAccentForeground(customTheme.workspaceColor) : "initial");
  root.style.setProperty("--theme-custom-accent", customTheme.accentColor);
  const customBackgroundImage = themePreset === "custom" && customTheme.backgroundImageFileName
    ? `url("app-theme://local/${encodeURIComponent(customTheme.backgroundImageFileName)}")`
    : "none";
  root.style.setProperty(
    "--theme-custom-background-image",
    customBackgroundImage,
  );
  const accentValue = themePreset === "custom" && themeAccent === "custom"
    ? customTheme.accentColor
    : themeCustomAccent;
  applyThemeAccentToRoot(themeAccent, resolvedTheme, root, accentValue, themeCustomAccents, themeAccentOpacity);

  if (options.suppressTransitions) {
    root.dataset.themeSwitching = "true";
  }
}

export function applyThemePresetToRoot(
  themePreset: ThemePreset,
  root: ThemeRoot = document.documentElement,
  options: {
    suppressTransitions?: boolean;
    themeAccent?: ThemeAccent;
    themeCustomAccent?: string;
    themeCustomAccents?: readonly string[];
    themeOpacity?: number;
    themeAccentOpacity?: number;
    themeNavigationOpacity?: number;
    themeBackgroundOpacity?: number;
    themeWorkspaceOpacity?: number;
    customTheme?: Partial<ThemeCustomTheme>;
  } = {},
): void {
  const themeMode = root.dataset.themeMode === "dark" ? "dark" : "light";
  applyThemeModeToRoot(themeMode, root, { ...options, themePreset });
}

export function applyThemeAccentToRoot(
  themeAccent: ThemeAccent,
  themeMode: ThemeMode,
  root: ThemeRoot = document.documentElement,
  themeCustomAccent: string = DEFAULT_THEME_CUSTOM_ACCENT,
  themeCustomAccents: readonly string[] = DEFAULT_THEME_CUSTOM_ACCENTS,
  themeAccentOpacity: number = DEFAULT_THEME_ACCENT_OPACITY,
): void {
  const accent = getThemeAccentColor(themeAccent, themeMode, themeCustomAccent, themeCustomAccents);
  const foreground = getAccentForeground(accent);
  const opacity = normalizeThemeAccentOpacity(themeAccentOpacity);
  const primary = applyColorOpacity(accent, opacity);
  const primaryStrong = opacity === 100
    ? `color-mix(in srgb, ${accent} 80%, #000000)`
    : applyColorOpacity(`color-mix(in srgb, ${accent} 80%, #000000)`, opacity);
  const primarySoft = opacity === 100
    ? `color-mix(in srgb, ${accent} 14%, var(--color-panel))`
    : `color-mix(in srgb, ${accent} ${Math.max(2, Math.round(14 * opacity / 100))}%, var(--color-panel))`;

  root.style.setProperty("--color-primary", primary);
  root.style.setProperty("--color-primary-strong", primaryStrong);
  root.style.setProperty("--color-primary-soft", primarySoft);
  root.style.setProperty("--color-primary-foreground", foreground);
  root.style.setProperty("--color-progress", primary);
  root.style.setProperty("--color-ring", primary);
}

function applyColorOpacity(color: string, opacity: number): string {
  return opacity === 100 ? color : `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
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

function getAccentForeground(hexColor: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const darkLuminance = ((23 / 255 + 0.055) / 1.055) ** 2.4;
  return (luminance + 0.05) / (darkLuminance + 0.05) > 1.05 / (luminance + 0.05) ? "#171717" : "#ffffff";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
