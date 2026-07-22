import { dialog } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type {
  PromptImageLexiconEntry,
  PromptLexiconEntry,
  PromptLexiconKind,
  PromptParameterLexiconEntry,
} from "../../../src/features/library/types/library";
import { AppError } from "../ipc/errors";
import { getSafeImportImageExtensionFromPath, writeImportImageBuffer } from "./importedImageWriter";
import { getImagesDir } from "./libraryPaths";

const lexiconKinds = new Set<PromptLexiconKind>(["parameters", "categories", "tags"]);

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
    defaultPath: `${getLexiconKindLabel(kind)}.json`,
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

  if (kind === "parameters") {
    return input.map(normalizeParameterEntry).filter(isPromptParameterLexiconEntry);
  }

  return input.map(normalizeImageEntry).filter(isPromptImageLexiconEntry);
}

function normalizeParameterEntry(input: unknown): PromptParameterLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = normalizeRequiredString(input.id) || randomUUID();
  const label = normalizeRequiredString(input.label);
  const variable = normalizeRequiredString(input.variable);

  if (!label || !variable) {
    return null;
  }

  return {
    id,
    group: normalizeOptionalString(input.group),
    label,
    sourcePromptId: normalizeOptionalString(input.sourcePromptId) || null,
    sourcePromptTitle: normalizeOptionalString(input.sourcePromptTitle) || null,
    variable,
    value: normalizeOptionalString(input.value),
  };
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
  if (kind === "parameters") {
    return "参数词库";
  }

  if (kind === "categories") {
    return "分类词库";
  }

  return "标签词库";
}

function isPromptParameterLexiconEntry(input: unknown): input is PromptParameterLexiconEntry {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.group === "string" &&
    typeof input.label === "string" &&
    (input.sourcePromptId === null || typeof input.sourcePromptId === "string" || input.sourcePromptId === undefined) &&
    (input.sourcePromptTitle === null || typeof input.sourcePromptTitle === "string" || input.sourcePromptTitle === undefined) &&
    typeof input.variable === "string" &&
    typeof input.value === "string"
  );
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
