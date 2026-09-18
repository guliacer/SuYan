import type { PromptClipboardCreateInput } from "../types";
import { compactAutomaticPromptTitle } from "./promptTitle";

export function derivePromptTitle(content: string): string {
  return compactAutomaticPromptTitle(content);
}

export function parseClipboardPromptText(text: string): PromptClipboardCreateInput[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((content) => ({ title: derivePromptTitle(content), content }));
}
