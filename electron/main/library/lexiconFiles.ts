import { dialog } from "../app/fileDialogs";
import { formatExportFileName } from "../app/exportFileName";
import { reportExportProgress } from "../app/exportTask";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { normalizeTagKnowledge } from "../../../src/features/library/utils/tagKnowledge";
import type {
  PromptImageLexiconEntry,
  PromptLexiconEntry,
  PromptLexiconKind,
} from "../../../src/features/library/types/library";
import { AppError } from "../ipc/errors";
import { getSafeImportImageExtensionFromPath, writeImportImageBuffer } from "./importedImageWriter";
import { getImagesDir } from "./libraryPaths";

const lexiconKinds = new Set<PromptLexiconKind>(["categories", "tags"]);

type PromptLexiconExportPayload = {
  schemaVersion: 1;
  kind: PromptLexiconKind;
  exportedAt: string;
  items: PromptLexiconEntry[];
};

export async function importPromptLexiconImage(): Promise<{
  canceled: boolean;
  imageFileName: string | null;
}> {
  const result = await dialog.showOpenDialog({
    title: "上传词库图像",
    properties: ["openFile"],
    filters: [
      {
        name: "图片",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, imageFileName: null };
  }

  await fs.mkdir(getImagesDir(), { recursive: true });

  const sourcePath = result.filePaths[0] as string;
  const imageFileName = await writeImportImageBuffer(
    randomUUID(),
    await fs.readFile(sourcePath),
    getSafeImportImageExtensionFromPath(sourcePath),
  );

  return { canceled: false, imageFileName };
}

export async function exportPromptLexicon(
  kind: PromptLexiconKind,
  items: PromptLexiconEntry[],
): Promise<{
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
}> {
  assertLexiconKind(kind);

  const normalizedItems = normalizeLexiconEntries(kind, items);
  const result = await dialog.showSaveDialog({
    title: `导出${getLexiconKindLabel(kind)}`,
    defaultPath: formatExportFileName(getLexiconKindLabel(kind), "json"),
    filters: [{ name: "JSON 词库", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null, exportedCount: 0 };
  }

  const payload: PromptLexiconExportPayload = {
    schemaVersion: 1,
    kind,
    exportedAt: new Date().toISOString(),
    items: normalizedItems,
  };

  reportExportProgress(`正在保存 ${normalizedItems.length} 条词库记录…`);
  await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    canceled: false,
    filePath: result.filePath,
    exportedCount: normalizedItems.length,
  };
}

export async function importPromptLexicon(kind: PromptLexiconKind): Promise<{
  canceled: boolean;
  items: PromptLexiconEntry[];
  importedCount: number;
}> {
  assertLexiconKind(kind);

  const result = await dialog.showOpenDialog({
    title: `导入${getLexiconKindLabel(kind)}`,
    properties: ["openFile"],
    filters: [{ name: "JSON 词库", extensions: ["json"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, items: [], importedCount: 0 };
  }

  const content = await fs.readFile(result.filePaths[0] as string, "utf8");
  const parsed = JSON.parse(content) as unknown;
  const payload = readLexiconPayload(parsed);

  if (payload.kind && payload.kind !== kind) {
    throw new AppError("LEXICON_KIND_MISMATCH", "导入文件的词库类型与当前模块不一致。");
  }

  const items = normalizeLexiconEntries(kind, payload.items);

  return {
    canceled: false,
    items,
    importedCount: items.length,
  };
}

function readLexiconPayload(input: unknown): {
  kind: PromptLexiconKind | null;
  items: unknown;
} {
  if (Array.isArray(input)) {
    return { kind: null, items: input };
  }

  if (!isRecord(input)) {
    throw new AppError("LEXICON_IMPORT_INVALID", "词库文件结构不合法。");
  }

  const kind = typeof input.kind === "string" && lexiconKinds.has(input.kind as PromptLexiconKind)
    ? (input.kind as PromptLexiconKind)
    : null;

  return {
    kind,
    items: input.items,
  };
}

function normalizeLexiconEntries(kind: PromptLexiconKind, input: unknown): PromptLexiconEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map(normalizeImageEntry).filter(isPromptImageLexiconEntry);
}

function normalizeImageEntry(input: unknown): PromptImageLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = normalizeRequiredString(input.id) || randomUUID();
  const label = normalizeRequiredString(input.label);

  if (!label) {
    return null;
  }

  return {
    id,
    group: normalizeOptionalString(input.group),
    label,
    description: normalizeOptionalString(input.description),
    ...normalizeTagKnowledge(input),
    parentId: normalizeOptionalString(input.parentId) || null,
    imageFileName: normalizeOptionalString(input.imageFileName) || null,
  };
}

function assertLexiconKind(kind: PromptLexiconKind): void {
  if (!lexiconKinds.has(kind)) {
    throw new AppError("LEXICON_KIND_INVALID", "词库类型不合法。");
  }
}

function getLexiconKindLabel(kind: PromptLexiconKind): string {
  if (kind === "categories") {
    return "分类词库";
  }

  return "标签词库";
}

function isPromptImageLexiconEntry(input: unknown): input is PromptImageLexiconEntry {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.group === "string" &&
    typeof input.label === "string" &&
    typeof input.description === "string" &&
    (input.parentId === null || typeof input.parentId === "string") &&
    (input.imageFileName === null || typeof input.imageFileName === "string")
  );
}

function normalizeRequiredString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeOptionalString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
