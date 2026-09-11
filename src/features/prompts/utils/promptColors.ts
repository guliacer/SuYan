import type { PromptColorId } from "../types";

export type PromptPaletteColorId = "sage" | "mist" | "clay" | "lavender" | "fog" | "rose" | "sand" | "stone";

export const PROMPT_CARD_COLORS: readonly PromptPaletteColorId[] = [
  "sage", "mist", "clay", "lavender", "fog", "rose", "sand", "stone",
];

export const PROMPT_CARD_COLOR_LABELS: Record<PromptPaletteColorId, string> = {
  sage: "鼠尾草",
  mist: "雾蓝",
  clay: "陶土",
  lavender: "薰衣草",
  fog: "雾灰",
  rose: "柔玫瑰",
  sand: "砂岩",
  stone: "石墨",
};

export const LEGACY_PROMPT_COLOR_MAP: Record<Exclude<PromptColorId, PromptPaletteColorId>, PromptPaletteColorId> = {
  blue: "mist",
  violet: "lavender",
  amber: "sand",
  emerald: "sage",
  cyan: "fog",
  indigo: "stone",
  orange: "clay",
};

export function isPromptPaletteColorId(value: unknown): value is PromptPaletteColorId {
  return typeof value === "string" && (PROMPT_CARD_COLORS as readonly string[]).includes(value);
}

export function getPromptColor(promptId: string, customColor?: PromptColorId): PromptPaletteColorId {
  if (customColor) {
    return isPromptPaletteColorId(customColor) ? customColor : LEGACY_PROMPT_COLOR_MAP[customColor];
  }
  let hash = 0;
  for (const char of promptId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PROMPT_CARD_COLORS[hash % PROMPT_CARD_COLORS.length];
}
