import { dialog } from "../app/fileDialogs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { TodoImportFileSummary, TodoImportFilesData } from "../../../src/features/prompts/types";
import { parseTodoImportText } from "../../../src/features/prompts/todos/utils/todoImportParser";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { readTodoExchange } from "./todoExchange";

type JSZipConstructor = { loadAsync(data: Buffer): Promise<JSZip> };

const JSZipRuntime = loadJSZipConstructor();
const supportedExtensions = new Set(["txt", "log", "md", "markdown", "csv", "tsv", "json", "docx", "html", "htm", "xml", "svg"]);

export async function importTodoFiles(): Promise<TodoImportFilesData> {
  const result = await dialog.showOpenDialog({
    title: "导入待办事项",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "待办文档", extensions: ["txt", "log", "md", "markdown", "csv", "tsv", "json", "docx", "html", "htm", "xml", "svg"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, files: [], candidates: [], warnings: [] };
  }

  const startedAt = Date.now();
  const files: TodoImportFileSummary[] = [];
  const candidates = [] as TodoImportFilesData["candidates"];
  const warnings: string[] = [];
  const libraries: NonNullable<TodoImportFilesData["libraries"]> = [];

  for (const filePath of result.filePaths) {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).slice(1).toLowerCase();
    try {
      if (!supportedExtensions.has(extension)) {
        warnings.push(`${fileName}：暂不支持此文件格式。`);
        continue;
      }

      const text = extension === "docx"
        ? await readDocxText(filePath)
        : stripMarkup(await fs.readFile(filePath, "utf8"), extension);
      if (extension === "json") {
        const value: unknown = JSON.parse(text);
        if (value && typeof value === "object" && "kind" in value && value.kind === "suyan-todo-library") {
          const library = readTodoExchange(value);
          libraries.push(library);
          files.push({ fileName, format: "json", candidateCount: library.tasks.length, warnings: [] });
          continue;
        }
      }
      const parsed = parseTodoImportText(text, { format: extension, sourceLabel: fileName });
      candidates.push(...parsed.candidates);
      files.push({ fileName, format: parsed.format, candidateCount: parsed.candidates.length, warnings: parsed.warnings });
      warnings.push(...parsed.warnings.map((warning) => `${fileName}：${warning}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件读取失败。";
      warnings.push(`${fileName}：${message}`);
      logger.warn("todo", "import:file-failed", { file: fileName, extension, message });
    }
  }

  logger.info("todo", "import:complete", {
    fileCount: result.filePaths.length,
    parsedFileCount: files.length,
    candidateCount: candidates.length,
    warningCount: warnings.length,
    durationMs: Date.now() - startedAt,
  });

  return { canceled: false, files, candidates, warnings, ...(libraries.length ? { libraries } : {}) };
}

async function readDocxText(filePath: string): Promise<string> {
  const zip = await JSZipRuntime.loadAsync(await fs.readFile(filePath));
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new AppError("TODO_IMPORT_DOCX_INVALID", "Word 文档缺少正文，无法读取。 ");
  const xml = await documentFile.async("string");
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match) => {
    return [...match[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
      .map((textMatch) => decodeXmlText(textMatch[1] ?? ""))
      .join("")
      .trim();
  });
  return paragraphs.filter(Boolean).join("\n");
}

function stripMarkup(value: string, extension: string): string {
  if (!["html", "htm", "xml", "svg"].includes(extension)) return value;
  return value
    .replace(/<style\b[\s\S]*?<\/style>/giu, "")
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/[ \t]+/gu, " ");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/gu, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&#(\d+);/gu, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
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
