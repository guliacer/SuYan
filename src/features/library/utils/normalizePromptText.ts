export function normalizePromptText(value: string): string {
  const normalizedLines = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  // 真实换行属于提示词内容，不能像普通空白一样压平；只移除首尾多余空行。
  return normalizedLines.join("\n").replace(/^\n+|\n+$/g, "");
}

export function normalizeDescriptionText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
