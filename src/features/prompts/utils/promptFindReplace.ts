export type PromptTextMatch = {
  start: number;
  end: number;
};

/**
 * Finds non-overlapping literal matches while keeping offsets in the original
 * UTF-16 string. The offsets are consumed by DOM Range, so this deliberately
 * avoids replacing the source with a normalized or folded copy.
 */
export function findPromptTextMatches(text: string, query: string, caseSensitive = false): PromptTextMatch[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  if (!needle) return [];

  const matches: PromptTextMatch[] = [];
  let cursor = 0;
  while (cursor <= text.length - query.length) {
    const candidate = text.slice(cursor, cursor + query.length);
    const comparable = caseSensitive ? candidate : candidate.toLocaleLowerCase();
    if (comparable === needle) {
      matches.push({ start: cursor, end: cursor + query.length });
      cursor += query.length;
    } else {
      cursor += 1;
    }
  }
  return matches;
}

/** Builds one replacement result so Replace All becomes one editor mutation. */
export function replacePromptText(
  text: string,
  query: string,
  replacement: string,
  caseSensitive = false,
): { text: string; count: number } {
  const matches = findPromptTextMatches(text, query, caseSensitive);
  if (!matches.length) return { text, count: 0 };

  let output = "";
  let cursor = 0;
  for (const match of matches) {
    output += text.slice(cursor, match.start);
    output += replacement;
    cursor = match.end;
  }
  output += text.slice(cursor);
  return { text: output, count: matches.length };
}
