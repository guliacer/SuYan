import type { PromptVariable } from "../types";

const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function extractPromptVariables(content: string): PromptVariable[] {
  const seen = new Set<string>();
  const variables: PromptVariable[] = [];

  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    const name = match[1]?.trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    variables.push({ name });
  }

  return variables;
}

export function renderPromptVariables(
  content: string,
  values: Record<string, string> = {},
  variables: PromptVariable[] = [],
): string {
  const defaults = new Map(variables.map((variable) => [variable.name, variable.defaultValue ?? ""]));
  return content.replace(VARIABLE_PATTERN, (_match, rawName: string) => {
    const name = rawName.trim();
    return values[name] ?? defaults.get(name) ?? "";
  });
}
