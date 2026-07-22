import { dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { LibraryFile, LibraryItem } from "../../../src/features/library/types/library";
import {
  extractWordDocumentBlocks,
  extractWordImageRelationships,
  pairWordDocumentPrompts,
} from "../../../src/features/library/utils/wordDocumentImport";
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

  return {
    canceled: false,
    documentCount: result.filePaths.length,
    importedCount: importedItems.length,
    library,
    skippedImageCount,
  };
}

async function parseWordDocumentFile(filePath: string): Promise<WordDocumentImportFileResult> {
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
  const promptPairs = pairWordDocumentPrompts(extractWordDocumentBlocks(documentXml));
  const items: LibraryItem[] = [];
  let skippedImageCount = 0;

  // 按提示词组批量导入：多图共享同一提示词时使用相同 title/prompt，避免被拆成空提示词 + 有提示词两张。
  const pairsByGroup = new Map<string, typeof promptPairs>();
  for (const promptPair of promptPairs) {
    const group = pairsByGroup.get(promptPair.groupId) ?? [];
    group.push(promptPair);
    pairsByGroup.set(promptPair.groupId, group);
  }

  let groupOrdinal = 0;
  for (const groupPairs of pairsByGroup.values()) {
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

  return {
    items,
    skippedImageCount,
  };
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
