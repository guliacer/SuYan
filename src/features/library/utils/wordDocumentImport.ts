export type WordDocumentBlock = {
  imageRelationshipIds: string[];
  pageBreakAfter: boolean;
  pageBreakBefore: boolean;
  text: string;
};

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

type WordDocumentPage = {
  imageRelationshipIds: string[];
  textParts: string[];
};

const pageBreakPattern =
  /<w:br\b[^>]*\bw:type=(?:"page"|'page')[^>]*\/>|<w:lastRenderedPageBreak\b[^>]*\/>/g;

export function extractWordDocumentBlocks(documentXml: string): WordDocumentBlock[] {
  const bodyXml = documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? documentXml;
  const blocks = [...bodyXml.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g)].map((match) =>
    parseWordDocumentBlock(match[0]),
  );

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
  const pages = groupWordDocumentPages(blocks);

  if (pages.length > 1) {
    return pairWordDocumentPages(pages);
  }

  return pairWordDocumentFlow(blocks);
}

function parseWordDocumentBlock(blockXml: string): WordDocumentBlock {
  const textIndex = blockXml.search(/<w:t\b/);
  const imageIndex = blockXml.search(/\br:(?:embed|link)=/);
  const contentIndexes = [textIndex, imageIndex].filter((index) => index >= 0);
  const firstContentIndex = contentIndexes.length > 0 ? Math.min(...contentIndexes) : -1;
  const lastContentIndex = Math.max(lastIndexOfPattern(blockXml, /<w:t\b/g), lastIndexOfPattern(blockXml, /\br:(?:embed|link)=/g));
  const pageBreakIndexes = [...blockXml.matchAll(pageBreakPattern)].map((match) => match.index ?? -1);

  return {
    imageRelationshipIds: extractImageRelationshipIds(blockXml),
    pageBreakBefore:
      firstContentIndex >= 0 && pageBreakIndexes.some((pageBreakIndex) => pageBreakIndex >= 0 && pageBreakIndex < firstContentIndex),
    pageBreakAfter:
      (firstContentIndex < 0 && pageBreakIndexes.length > 0) ||
      pageBreakIndexes.some((pageBreakIndex) => pageBreakIndex >= 0 && pageBreakIndex > lastContentIndex),
    text: extractWordText(blockXml),
  };
}

function extractImageRelationshipIds(blockXml: string): string[] {
  return [
    ...new Set(
      [...blockXml.matchAll(/\br:(?:embed|link)=["']([^"']+)["']/g)]
        .map((match) => decodeXmlText(match[1]).trim())
        .filter(Boolean),
    ),
  ];
}

function extractWordText(blockXml: string): string {
  const normalizedXml = blockXml
    .replace(/<w:tab\b[^>]*\/>/g, " ")
    .replace(/<w:br\b(?![^>]*\bw:type=(?:"page"|'page'))[^>]*\/>/g, "\n");
  const text = [...normalizedXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlText(match[1]))
    .join("");

  return normalizeWordPromptText(text);
}

function groupWordDocumentPages(blocks: readonly WordDocumentBlock[]): WordDocumentPage[] {
  const pages: WordDocumentPage[] = [];
  let currentPage = createEmptyPage();

  for (const block of blocks) {
    if (block.pageBreakBefore && hasPageContent(currentPage)) {
      pages.push(currentPage);
      currentPage = createEmptyPage();
    }

    currentPage.imageRelationshipIds.push(...block.imageRelationshipIds);

    if (block.text) {
      currentPage.textParts.push(block.text);
    }

    if (block.pageBreakAfter && hasPageContent(currentPage)) {
      pages.push(currentPage);
      currentPage = createEmptyPage();
    }
  }

  if (hasPageContent(currentPage)) {
    pages.push(currentPage);
  }

  return pages;
}

function pairWordDocumentPages(pages: readonly WordDocumentPage[]): WordDocumentPromptPair[] {
  const pairs: WordDocumentPromptPair[] = [];
  let index = 0;
  let groupSerial = 0;

  while (index < pages.length) {
    const page = pages[index];

    if (page.imageRelationshipIds.length === 0) {
      index += 1;
      continue;
    }

    const samePagePrompt = normalizeWordPromptText(page.textParts.join("\n"));

    // 本页已有提示词：仅绑定本页图片（默认 图像-提示词 一组）。
    if (samePagePrompt) {
      groupSerial += 1;
      const groupId = `page-group-${groupSerial}`;
      appendPageImagePairs(pairs, page, {
        groupId,
        pageIndex: index,
        pairingMode: "same-page",
        prompt: samePagePrompt,
      });
      index += 1;
      continue;
    }

    // 本页只有图：向后寻找提示词页。支持：
    // 1) 下一页纯文字（经典跨页）
    // 2) 后面连续多张纯图 + 最终一页文字/图文（多图同一提示词组）
    // 3) 下一页图文混排（左图右文/多图+共用提示词）——多图共享该提示词，避免前图空提示词。
    let promptPageIndex = index + 1;
    while (promptPageIndex < pages.length && !pageHasPromptText(pages[promptPageIndex])) {
      promptPageIndex += 1;
    }

    if (promptPageIndex < pages.length) {
      const promptPage = pages[promptPageIndex];
      const prompt = normalizeWordPromptText(promptPage.textParts.join("\n"));
      const lastImagePageIndex = promptPage.imageRelationshipIds.length > 0 ? promptPageIndex : promptPageIndex - 1;
      const spansMultiplePages = lastImagePageIndex > index || promptPage.imageRelationshipIds.length > 0;
      const pairingMode =
        promptPage.imageRelationshipIds.length === 0
          ? "next-page"
          : spansMultiplePages
            ? "shared-run"
            : "same-page";

      groupSerial += 1;
      const groupId = `page-group-${groupSerial}`;

      for (let pageIndex = index; pageIndex <= lastImagePageIndex; pageIndex += 1) {
        const imagePage = pages[pageIndex];
        if (imagePage.imageRelationshipIds.length === 0) {
          continue;
        }

        appendPageImagePairs(pairs, imagePage, {
          groupId,
          pageIndex,
          pairingMode,
          prompt,
        });
      }

      index = lastImagePageIndex + 1;
      continue;
    }

    // 找不到后续提示词：仍导入图片，提示词留空。
    groupSerial += 1;
    const groupId = `page-group-${groupSerial}`;
    appendPageImagePairs(pairs, page, {
      groupId,
      pageIndex: index,
      pairingMode: "same-page",
      prompt: "",
    });
    index += 1;
  }

  return pairs;
}

function pageHasPromptText(page: WordDocumentPage): boolean {
  return normalizeWordPromptText(page.textParts.join("\n")).length > 0;
}

function appendPageImagePairs(
  pairs: WordDocumentPromptPair[],
  page: WordDocumentPage,
  meta: {
    groupId: string;
    pageIndex: number;
    pairingMode: WordDocumentPromptPair["pairingMode"];
    prompt: string;
  },
): void {
  for (const imageRelationshipId of page.imageRelationshipIds) {
    pairs.push({
      imageRelationshipId,
      groupId: meta.groupId,
      pageIndex: meta.pageIndex,
      pairingMode: meta.pairingMode,
      prompt: meta.prompt,
    });
  }
}

function pairWordDocumentFlow(blocks: readonly WordDocumentBlock[]): WordDocumentPromptPair[] {
  const pairs: WordDocumentPromptPair[] = [];
  let pendingImageRelationshipIds: string[] = [];
  let pendingTextParts: string[] = [];
  let groupSerial = 0;

  function flushPending() {
    if (pendingImageRelationshipIds.length === 0) {
      pendingTextParts = [];
      return;
    }

    const prompt = normalizeWordPromptText(pendingTextParts.join("\n"));
    groupSerial += 1;
    const groupId = `flow-group-${groupSerial}`;

    // 多张图后跟同一段提示词：全部作为同一提示词组的多张效果图。
    for (const imageRelationshipId of pendingImageRelationshipIds) {
      pairs.push({
        imageRelationshipId,
        groupId,
        pageIndex: 0,
        pairingMode: "flow",
        prompt,
      });
    }

    pendingImageRelationshipIds = [];
    pendingTextParts = [];
  }

  for (const block of blocks) {
    if (block.imageRelationshipIds.length > 0) {
      if (pendingImageRelationshipIds.length > 0 && pendingTextParts.length > 0) {
        flushPending();
      }

      pendingImageRelationshipIds.push(...block.imageRelationshipIds);
    }

    if (block.text && pendingImageRelationshipIds.length > 0) {
      pendingTextParts.push(block.text);
    }
  }

  flushPending();

  return pairs;
}

function createEmptyPage(): WordDocumentPage {
  return {
    imageRelationshipIds: [],
    textParts: [],
  };
}

function hasPageContent(page: WordDocumentPage): boolean {
  return page.imageRelationshipIds.length > 0 || page.textParts.some((text) => text.trim());
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
