export const automaticPromptTitleLimits = {
  cjk: 25,
  latin: 40,
} as const;

/**
 * Keep generated titles compact without changing user-authored titles.
 * CJK titles are denser in the card header, so they use the shorter limit.
 */
export function compactAutomaticPromptTitle(value: string, fallback = "未命名提示词"): string {
  const firstLine = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  const cleaned = firstLine.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return fallback;
  }

  const limit = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(cleaned)
    ? automaticPromptTitleLimits.cjk
    : automaticPromptTitleLimits.latin;
  const characters = Array.from(cleaned);

  return characters.length <= limit
    ? cleaned
    : `${characters.slice(0, limit - 1).join("")}…`;
}
