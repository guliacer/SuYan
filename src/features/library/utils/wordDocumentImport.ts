export type WordDocumentBlock = {
  /** Paragraph-local content order prevents a whole page/table from becoming one prompt. */
  content: WordDocumentBlockContent[];
  imageRelationshipIds: string[];
  pageBreakAfter: boolean;
  pageBreakBefore: boolean;
  text: string;
};

export type WordDocumentBlockContent =
  | { kind: "image"; imageRelationshipId: string }
  | { kind: "text"; text: string };

export type WordDocumentImageRelationship = {
  id: string;
  target: string;
};

export type WordDocumentPromptPair = {
  imageRelationshipId: string;
  /** 同一组提示词下的多张效果图共享同一 groupId，便于导入后归为同一提示词组。 */
  groupId: string;
  pageIndex: number;
  pairingMode: "flow" | "next-page" | "same-page" | "shared-run";
  prompt: string;
};

type WordDocumentFlowToken =
  | { kind: "image"; imageRelationshipId: string; pageIndex: number }
  | { kind: "text"; pageIndex: number; text: string };

type WordDocumentFlowRun =
  | { kind: "images"; images: Array<Extract<WordDocumentFlowToken, { kind: "image" }>> }
  | { kind: "text"; text: Extract<WordDocumentFlowToken, { kind: "text" }> };

const pageBreakPattern =
  /<w:br\b[^>]*\bw:type=(?:"page"|'page')[^>]*\/>|<w:lastRenderedPageBreak\b[^>]*\/>/g;

export function extractWordDocumentBlocks(documentXml: string): WordDocumentBlock[] {
  const bodyXml = documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? documentXml;
  // Parse paragraphs inside tables individually. Treating a whole table as one block
  // loses the order between image cells and prompt cells and merges unrelated prompts.
  const blocks = [...bodyXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => parseWordDocumentBlock(match[0]));

  return blocks.length > 0 ? blocks : [parseWordDocumentBlock(bodyXml)];
}

export function extractWordImageRelationships(relsXml: string): WordDocumentImageRelationship[] {
  return [...relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)]
    .map((match) => {
      const relationshipXml = match[0];
      const id = getXmlAttribute(relationshipXml, "Id");
      const type = getXmlAttribute(relationshipXml, "Type");
      const target = getXmlAttribute(relationshipXml, "Target");
      const targetMode = getXmlAttribute(relationshipXml, "TargetMode");

      if (!id || !target || !type.includes("/image") || targetMode === "External") {
        return null;
      }

      return {
        id,
        target: normalizeWordRelationshipTarget(target),
      };
    })
    .filter((relationship): relationship is WordDocumentImageRelationship => relationship !== null);
}

export function pairWordDocumentPrompts(blocks: readonly WordDocumentBlock[]): WordDocumentPromptPair[] {
  return pairWordDocumentFlow(blocks);
}

function parseWordDocumentBlock(blockXml: string): WordDocumentBlock {
  const content = extractWordBlockContent(blockXml);
  const textIndex = blockXml.search(/<w:t\b/);
  const imageIndex = blockXml.search(/\br:(?:embed|link)=/);
  const contentIndexes = [textIndex, imageIndex].filter((index) => index >= 0);
  const firstContentIndex = contentIndexes.length > 0 ? Math.min(...contentIndexes) : -1;
  const lastContentIndex = Math.max(lastIndexOfPattern(blockXml, /<w:t\b/g), lastIndexOfPattern(blockXml, /\br:(?:embed|link)=/g));
  const pageBreakIndexes = [...blockXml.matchAll(pageBreakPattern)].map((match) => match.index ?? -1);
  const imageRelationshipIds = uniqueStrings(
    content
      .filter((part): part is Extract<WordDocumentBlockContent, { kind: "image" }> => part.kind === "image")
      .map((part) => part.imageRelationshipId),
  );

  return {
    content,
    imageRelationshipIds,
    pageBreakBefore:
      firstContentIndex >= 0 && pageBreakIndexes.some((pageBreakIndex) => pageBreakIndex >= 0 && pageBreakIndex < firstContentIndex),
    pageBreakAfter:
      (firstContentIndex < 0 && pageBreakIndexes.length > 0) ||
      pageBreakIndexes.some((pageBreakIndex) => pageBreakIndex >= 0 && pageBreakIndex > lastContentIndex),
    text: content
      .filter((part): part is Extract<WordDocumentBlockContent, { kind: "text" }> => part.kind === "text")
      .map((part) => part.text)
      .join(""),
  };
}

function extractWordBlockContent(blockXml: string): WordDocumentBlockContent[] {
  const content: WordDocumentBlockContent[] = [];
  let textBuffer = "";
  const tokenPattern =
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|\br:(?:embed|link)=["']([^"']+)["']|<w:tab\b[^>]*\/>|<w:br\b(?![^>]*\bw:type=(?:"page"|'page'))[^>]*\/>/g;

  const flushText = () => {
    const text = normalizeWordPromptText(textBuffer);
    if (text) {
      content.push({ kind: "text", text });
    }
    textBuffer = "";
  };

  for (const match of blockXml.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      textBuffer += decodeXmlText(match[1]);
      continue;
    }

    if (match[2] !== undefined) {
      flushText();
      content.push({ kind: "image", imageRelationshipId: decodeXmlText(match[2]).trim() });
      continue;
    }

    textBuffer += "\n";
  }

  flushText();

  return content;
}

function pairWordDocumentFlow(blocks: readonly WordDocumentBlock[]): WordDocumentPromptPair[] {
  const tokens = createWordDocumentFlowTokens(blocks);
  const runs = createWordDocumentFlowRuns(tokens);
  const imageFirst = shouldUseAfterImagePrompt(runs);
  const pairs: WordDocumentPromptPair[] = [];
  let groupSerial = 0;

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (run.kind !== "images") {
      continue;
    }

    // The document's first content direction determines whether a prompt follows
    // its images or precedes them. Either way, only one adjacent text block can be
    // selected; a second prompt can never be concatenated into this group.
    const adjacentRun = imageFirst ? runs[runIndex + 1] : runs[runIndex - 1];
    const promptRun = adjacentRun?.kind === "text" ? adjacentRun : null;
    const prompt = promptRun?.text.text ?? "";
    const imagePageIndexes = new Set(run.images.map((image) => image.pageIndex));
    const promptPageIndex = promptRun?.text.pageIndex ?? null;
    const crossesPage =
      promptPageIndex !== null && [...imagePageIndexes].some((pageIndex) => pageIndex !== promptPageIndex);
    const promptPageHasImage = promptPageIndex !== null && imagePageIndexes.has(promptPageIndex);
    const pairingMode: WordDocumentPromptPair["pairingMode"] = crossesPage
      ? promptPageHasImage
        ? "shared-run"
        : "next-page"
      : "flow";
    const groupPrefix = crossesPage ? "page-group" : "flow-group";
    const groupId = `${groupPrefix}-${++groupSerial}`;

    for (const image of run.images) {
      pairs.push({
        imageRelationshipId: image.imageRelationshipId,
        groupId,
        pageIndex: image.pageIndex,
        pairingMode,
        prompt,
      });
    }
  }

  return pairs;
}

function shouldUseAfterImagePrompt(runs: readonly WordDocumentFlowRun[]): boolean {
  let afterCount = 0;
  let beforeCount = 0;
  let afterLength = 0;
  let beforeLength = 0;

  for (let index = 0; index < runs.length; index += 1) {
    if (runs[index]?.kind !== "images") {
      continue;
    }

    const previous = runs[index - 1];
    const next = runs[index + 1];
    if (previous?.kind === "text") {
      beforeCount += 1;
      beforeLength += previous.text.text.length;
    }
    if (next?.kind === "text") {
      afterCount += 1;
      afterLength += next.text.text.length;
    }
  }

  if (afterCount !== beforeCount) {
    return afterCount > beforeCount;
  }

  if (afterLength !== beforeLength) {
    return afterLength > beforeLength;
  }

  return runs[0]?.kind === "images";
}

function createWordDocumentFlowTokens(blocks: readonly WordDocumentBlock[]): WordDocumentFlowToken[] {
  const tokens: WordDocumentFlowToken[] = [];
  let pageIndex = 0;

  for (const block of blocks) {
    if (block.pageBreakBefore) {
      pageIndex += 1;
    }

    const content = block.content.length > 0 ? block.content : createFallbackBlockContent(block);
    for (const part of content) {
      if (part.kind === "image") {
        tokens.push({ kind: "image", imageRelationshipId: part.imageRelationshipId, pageIndex });
      } else if (part.text) {
        tokens.push({ kind: "text", pageIndex, text: part.text });
      }
    }

    if (block.pageBreakAfter) {
      pageIndex += 1;
    }
  }

  return tokens;
}

function createFallbackBlockContent(block: WordDocumentBlock): WordDocumentBlockContent[] {
  return [
    ...block.imageRelationshipIds.map((imageRelationshipId) => ({
      kind: "image" as const,
      imageRelationshipId,
    })),
    ...(block.text ? [{ kind: "text" as const, text: block.text }] : []),
  ];
}

function createWordDocumentFlowRuns(tokens: readonly WordDocumentFlowToken[]): WordDocumentFlowRun[] {
  const runs: WordDocumentFlowRun[] = [];

  for (const token of tokens) {
    const previous = runs[runs.length - 1];
    if (token.kind === "image") {
      if (previous?.kind === "images") {
        previous.images.push(token);
      } else {
        runs.push({ kind: "images", images: [token] });
      }
      continue;
    }

    // Keep adjacent paragraph text as separate prompt candidates. Combining them
    // would recreate the bug where two prompts on one page are stored together.
    runs.push({ kind: "text", text: token });
  }

  return runs;
}

function normalizeWordRelationshipTarget(target: string): string {
  const decodedTarget = decodeUriComponentSafe(decodeXmlText(target)).replace(/\\/g, "/");
  const sourceParts = decodedTarget.startsWith("/") ? [] : ["word"];
  const parts = decodedTarget.replace(/^\/+/, "").split("/");
  const normalizedParts = [...sourceParts];

  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      normalizedParts.pop();
      continue;
    }

    normalizedParts.push(part);
  }

  return normalizedParts.join("/");
}

function normalizeWordPromptText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getXmlAttribute(xml: string, attributeName: string): string {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`\\b${escapedName}=["']([^"']*)["']`));

  return match ? decodeXmlText(match[1]).trim() : "";
}

function lastIndexOfPattern(value: string, pattern: RegExp): number {
  let lastIndex = -1;

  for (const match of value.matchAll(pattern)) {
    lastIndex = match.index ?? lastIndex;
  }

  return lastIndex;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
