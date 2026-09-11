export type GithubMarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "code"; language: string; code: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "thematic-break" };

const fencePattern = /^\s*(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const headingPattern = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const unorderedItemPattern = /^\s*[-+*]\s+(.+)$/;
const orderedItemPattern = /^\s*\d+[.)]\s+(.+)$/;

/** 解析 GitHub README 常用的 Markdown 区块，不执行 HTML 或脚本。 */
export function parseGithubMarkdown(markdown: string): GithubMarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: GithubMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(fencePattern);
    if (fence) {
      const marker = fence[1] ?? "```";
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${escapeRegExp(marker[0])}{${marker.length},}\\s*$`).test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: (fence[2] ?? "").trim().toLowerCase(), code: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(headingPattern);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]?.length ?? 1, text: heading[2]?.trim() ?? "" });
      index += 1;
      continue;
    }

    if (/^\s*(?:\*\s*){3,}$/.test(line) || /^\s*(?:-\s*){3,}$/.test(line) || /^\s*_{3,}\s*$/.test(line)) {
      blocks.push({ kind: "thematic-break" });
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index] ?? "")) {
        quoteLines.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join("\n").trim() });
      continue;
    }

    const unordered = line.match(unorderedItemPattern);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(unorderedItemPattern);
        if (!match) break;
        items.push(match[1]?.trim() ?? "");
        index += 1;
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    const ordered = line.match(orderedItemPattern);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = (lines[index] ?? "").match(orderedItemPattern);
        if (!match) break;
        items.push(match[1]?.trim() ?? "");
        index += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]?.trim()) {
      const next = lines[index] ?? "";
      if (fencePattern.test(next) || headingPattern.test(next) || /^\s*>/.test(next) || unorderedItemPattern.test(next) || orderedItemPattern.test(next)) break;
      paragraphLines.push(next.trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

function parseTable(lines: string[], index: number): { block: Extract<GithubMarkdownBlock, { kind: "table" }>; nextIndex: number } | null {
  const header = lines[index] ?? "";
  const separator = lines[index + 1] ?? "";
  if (!header.includes("|") || !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(separator)) return null;
  const headers = splitTableRow(header);
  const rows: string[][] = [];
  let nextIndex = index + 2;
  while (nextIndex < lines.length && (lines[nextIndex] ?? "").includes("|")) {
    rows.push(splitTableRow(lines[nextIndex] ?? ""));
    nextIndex += 1;
  }
  return { block: { kind: "table", headers, rows }, nextIndex };
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
