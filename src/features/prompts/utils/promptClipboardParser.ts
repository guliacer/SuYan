import type { PromptClipboardCreateInput } from "../types";

export function derivePromptTitle(content: string): string {
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "未命名提示词";
  return firstLine.length > 50 ? `${firstLine.slice(0, 50)}…` : firstLine;
}

export function parseClipboardPromptText(text: string): PromptClipboardCreateInput[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((content) => ({ title: derivePromptTitle(content), content }));
}
