import { dialog } from "../app/fileDialogs";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { LibraryFile, LibraryItem } from "../../../src/features/library/types/library";
import {
  extractWordDocumentBlocks,
  extractWordImageRelationships,
  pairWordDocumentPrompts,
  type WordDocumentPromptPair,
} from "../../../src/features/library/utils/wordDocumentImport";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { prepareImageThumbnails } from "./imageThumbnails";
import { normalizeImportImageExtension } from "./imageCompressionPolicy";
import { writeImportImageBuffer } from "./importedImageWriter";
import { appendLibraryItems, readLibraryFile } from "./libraryStore";

type JSZipConstructor = {
  new (): JSZip;
  loadAsync(data: Buffer): Promise<JSZip>;
};

type WordDocumentImportFileResult = {
  items: LibraryItem[];
  skippedImageCount: number;
};

export type WordDocumentImportResult = {
  canceled: boolean;
  documentCount: number;
  importedCount: number;
  library: LibraryFile;
  skippedImageCount: number;
};

const JSZipRuntime = loadJSZipConstructor();

export async function importWordDocument(): Promise<WordDocumentImportResult> {
  const result = await dialog.showOpenDialog({
    title: "导入 Word 文档",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return {
      canceled: true,
      documentCount: 0,
      importedCount: 0,
      library: await readLibraryFile(),
      skippedImageCount: 0,
    };
  }

  const importedItems: LibraryItem[] = [];
  let skippedImageCount = 0;
  const startedAt = Date.now();

  for (const filePath of result.filePaths) {
    const fileResult = await parseWordDocumentFile(filePath);

    importedItems.push(...fileResult.items);
    skippedImageCount += fileResult.skippedImageCount;
  }

  if (importedItems.length === 0) {
    throw new AppError("WORD_IMPORT_EMPTY", "未从 Word 文档中识别到可导入的图片与提示词。");
  }

  await prepareImageThumbnails(importedItems.map((item) => item.imageFileName));
  const library = await appendLibraryItems(importedItems);

  logger.info("library", "word-import:complete", {
    documentCount: result.filePaths.length,
    importedCount: importedItems.length,
    skippedImageCount,
    durationMs: Date.now() - startedAt,
  });

  return {
    canceled: false,
    documentCount: result.filePaths.length,
    importedCount: importedItems.length,
    library,
    skippedImageCount,
  };
}

async function parseWordDocumentFile(filePath: string): Promise<WordDocumentImportFileResult> {
  const startedAt = Date.now();
  const zip = await JSZipRuntime.loadAsync(await fs.readFile(filePath));
  const documentFile = zip.file("word/document.xml");
  const relationshipFile = zip.file("word/_rels/document.xml.rels");

  if (!documentFile || !relationshipFile) {
    throw new AppError("WORD_IMPORT_INVALID", "Word 文档结构不完整，无法识别正文图片。");
  }

  const documentXml = await documentFile.async("string");
  const relationshipXml = await relationshipFile.async("string");
  const relationships = new Map(
    extractWordImageRelationships(relationshipXml).map((relationship) => [relationship.id, relationship.target]),
  );
  const blocks = extractWordDocumentBlocks(documentXml);
  const promptPairs = pairWordDocumentPrompts(blocks);
  const promptGroups = groupWordPromptPairs(promptPairs);
  const items: LibraryItem[] = [];
  let skippedImageCount = 0;

  logger.info("library", "word-import:parsed", {
    file: path.basename(filePath),
    blockCount: blocks.length,
    relationshipCount: relationships.size,
    imagePairCount: promptPairs.length,
    groupCount: promptGroups.length,
    groups: promptGroups.slice(0, 200).map((group, index) => ({
      index: index + 1,
      imageCount: group.length,
      promptFingerprint: createPromptFingerprint(group[0]?.prompt ?? ""),
      promptLength: group[0]?.prompt.length ?? 0,
      pageIndexes: [...new Set(group.map((pair) => pair.pageIndex))],
      pairingMode: group[0]?.pairingMode ?? "flow",
    })),
  });

  let groupOrdinal = 0;
  for (const groupPairs of promptGroups) {
    groupOrdinal += 1;
    const sharedPrompt = groupPairs.find((pair) => pair.prompt.trim())?.prompt ?? groupPairs[0]?.prompt ?? "";
    const sharedTitle = createWordImportTitle(filePath, groupOrdinal, sharedPrompt);
    const createdAt = new Date().toISOString();

    for (const promptPair of groupPairs) {
      const target = relationships.get(promptPair.imageRelationshipId);
      const extension = target ? normalizeImportImageExtension(path.extname(target)) : null;
      const imageFile = target ? zip.file(target) : null;

      if (!target || !extension || !imageFile) {
        skippedImageCount += 1;
        continue;
      }

      const id = randomUUID();
      const imageBuffer = await imageFile.async("nodebuffer");
      const imageFileName = await writeImportImageBuffer(id, imageBuffer, extension);

      items.push({
        id,
        title: sharedTitle,
        imageFileName,
        prompt: sharedPrompt,
        negativePrompt: "",
        tags: [],
        generationMethod: "Word 文档导入",
        promptType: "image",
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  logger.info("library", "word-import:file-complete", {
    file: path.basename(filePath),
    importedCount: items.length,
    skippedImageCount,
    durationMs: Date.now() - startedAt,
  });

  return {
    items,
    skippedImageCount,
  };
}

function groupWordPromptPairs(promptPairs: readonly WordDocumentPromptPair[]): WordDocumentPromptPair[][] {
  const groups: WordDocumentPromptPair[][] = [];

  for (const promptPair of promptPairs) {
    const previous = groups[groups.length - 1];
    const previousPair = previous?.[previous.length - 1];
    if (
      previous &&
      previousPair &&
      previousPair.groupId === promptPair.groupId &&
      previousPair.prompt === promptPair.prompt
    ) {
      previous.push(promptPair);
      continue;
    }

    // Never use a global map here. A group is valid only while its image run is
    // still contiguous in document order, even when a future parser reuses IDs.
    groups.push([promptPair]);
  }

  return groups;
}

function createPromptFingerprint(prompt: string): string | null {
  const normalized = prompt.trim();
  return normalized
    ? createHash("sha256").update(normalized).digest("hex").slice(0, 12)
    : null;
}

function createWordImportTitle(filePath: string, index: number, prompt: string): string {
  const fileName = path.parse(filePath).name.trim() || "Word 文档";
  const firstPromptLine = prompt.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const promptHint = firstPromptLine
    .replace(/[，。；;,.].*$/u, "")
    .replace(/\s+/g, " ")
    .slice(0, 18)
    .trim();

  return promptHint ? `${fileName} ${index} - ${promptHint}` : `${fileName} ${index}`;
}

function loadJSZipConstructor(): JSZipConstructor {
  const runtimeRequire = createRequire(__filename);

  try {
    return normalizeJSZipModule(runtimeRequire("jszip"));
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    return normalizeJSZipModule(vendorRequire("jszip"));
  }
}

function normalizeJSZipModule(input: unknown): JSZipConstructor {
  const candidate = (input as { default?: JSZipConstructor }).default ?? input;
  return candidate as JSZipConstructor;
}
