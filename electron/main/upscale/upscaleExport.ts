import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { LibraryItem } from "../../../src/features/library/types/library";
import type {
  UpscaleExportOptions,
  UpscaleExportRequest,
  UpscaleExportResult,
  UpscaleExportTargetDescriptor,
  UpscaleInputDescriptor,
  UpscaleOutputDirectoryDescriptor,
  UpscaleOutputFormat,
  UpscaleReplaceSourceRequest,
  UpscaleReplaceSourceResult,
} from "../../../src/features/upscale/types";
import { getUpscaleModelDefinition } from "../../../src/features/upscale/utils/upscaleModels";
import {
  buildUpscaleOutputName,
  normalizeUpscaleExportOptions,
} from "../../../src/features/upscale/utils/upscaleExport";
import { dialog } from "../app/fileDialogs";
import type { GeneratedImageImportPayload } from "../library/imageFiles";
// sharp 是 native 模块，装在 resources/vendor/node_modules 下，
// 无法通过 asar 内的裸 require("sharp") 解析。必须走带 vendor 回退的懒加载，
// 否则主进程一加载本文件就抛 "Cannot find module 'sharp'"。
import { getSharp } from "../runtime/imageRuntime";
import {
  getUpscaleInputDescriptor,
  readUpscaleResult,
} from "./upscaleInputs";

type EncodeOptions = {
  format: UpscaleOutputFormat;
  quality: number | null;
  preserveMetadata: boolean;
};

type LibraryImportRequest = {
  dataUrl: string;
  metadata: GeneratedImageImportPayload["metadata"];
};

type ReplaceSourceImageRequest = {
  sourceItemId: string;
  expectedImageFileName: string;
  bytes: Buffer;
  mediaType: UpscaleInputDescriptor["mediaType"];
};

export type UpscaleExportDependencies = {
  getInputDescriptor(token: string): UpscaleInputDescriptor;
  readResult(token: string): Promise<Buffer>;
  resolveOutputDirectory(token: string): string;
  findSourceItem(itemId: string): Promise<LibraryItem | null>;
  encodeResult(bytes: Buffer, options: EncodeOptions): Promise<Buffer>;
  importToLibrary(payload: LibraryImportRequest): Promise<string[]>;
  replaceSourceImage(payload: ReplaceSourceImageRequest): Promise<UpscaleReplaceSourceResult>;
  pathExists(filePath: string): Promise<boolean>;
  writeFile(filePath: string, bytes: Buffer): Promise<unknown>;
  /** 「另存为」覆盖写。未注入时回退到 fs.writeFile。 */
  writeFileReplace?(filePath: string, bytes: Buffer): Promise<unknown>;
  rename(source: string, target: string): Promise<unknown>;
  remove(filePath: string): Promise<unknown>;
};

type FileCommit = {
  fileName: string;
  skipped: false;
  finalize(): Promise<void>;
  rollback(): Promise<void>;
} | {
  fileName: null;
  skipped: true;
  finalize(): Promise<void>;
  rollback(): Promise<void>;
};

const outputDirectories = new Map<string, string>();

export async function pickUpscaleOutputDirectory(): Promise<UpscaleOutputDirectoryDescriptor | null> {
  const selection = await dialog.showOpenDialog({
    title: "选择超分图片保存目录",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  return registerUpscaleOutputDirectory(selection.filePaths[0]);
}

export async function registerUpscaleOutputDirectory(
  directoryPath: string,
): Promise<UpscaleOutputDirectoryDescriptor> {
  const resolved = path.resolve(directoryPath);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error("UPSCALE_EXPORT_FAILED: 保存目录不存在");
  }
  const token = randomUUID();
  outputDirectories.set(token, resolved);
  return {
    token,
    displayName: path.basename(resolved) || "已选择目录",
  };
}

export function resolveUpscaleOutputDirectory(token: string): string {
  const directory = typeof token === "string" ? outputDirectories.get(token) : undefined;
  if (!directory) {
    throw new Error("UPSCALE_EXPORT_FAILED: 保存目录令牌无效或已过期");
  }
  return directory;
}

/**
 * 一次性选定导出目标，系统对话框只弹一次，之后逐条提交导出。
 * - library：收录进素材库，不需要任何系统对话框
 * - directory：选目录，批量写盘
 * - file：另存为指定文件路径（画布结果 hover 的单张导出）
 *
 * 用户取消时返回 null，调用方据此保持任务状态不变。
 */
export async function pickUpscaleExportTarget(
  mode: "library" | "directory" | "file",
  options: { fileName: string; format: UpscaleOutputFormat },
): Promise<UpscaleExportTargetDescriptor | null> {
  if (mode === "library") {
    return { mode: "library", directoryToken: null, filePath: null };
  }
  if (mode === "directory") {
    const selection = await dialog.showOpenDialog({
      title: "选择超分图片保存目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (selection.canceled || !selection.filePaths[0]) return null;
    const descriptor = await registerUpscaleOutputDirectory(selection.filePaths[0]);
    return { mode: "directory", directoryToken: descriptor.token, filePath: null };
  }
  const selection = await dialog.showSaveDialog({
    title: "导出超分结果",
    defaultPath: options.fileName,
    filters: [
      { name: `${options.format.toUpperCase()} 图片`, extensions: [extensionFor(options.format)] },
    ],
  });
  if (selection.canceled || !selection.filePath) return null;
  const directory = await registerUpscaleOutputDirectory(path.dirname(selection.filePath));
  return { mode: "file", directoryToken: directory.token, filePath: selection.filePath };
}

export function clearUpscaleOutputDirectories(): void {
  outputDirectories.clear();
}

export function exportUpscaleResult(request: UpscaleExportRequest): Promise<UpscaleExportResult> {
  return exportUpscaleResultWithDependencies(request, createDefaultDependencies());
}

export async function exportUpscaleResultWithDependencies(
  request: UpscaleExportRequest,
  dependencies: UpscaleExportDependencies,
): Promise<UpscaleExportResult> {
  const options = normalizeUpscaleExportOptions(request.options);
  const input = dependencies.getInputDescriptor(request.inputToken);
  const resultBytes = await dependencies.readResult(request.resultToken).catch(() => {
    throw new Error("UPSCALE_RESULT_MISSING: 超分结果已过期");
  });
  const encoded = await dependencies.encodeResult(resultBytes, {
    format: options.format,
    quality: options.format === "png" ? null : options.quality,
    preserveMetadata: options.preserveMetadata,
  }).catch((error: unknown) => {
    throw new Error(`UPSCALE_EXPORT_FAILED: ${errorMessage(error, "图片编码失败")}`);
  });

  let fileCommit: FileCommit | null = null;
  if (options.saveToDirectory) {
    if (options.targetFilePath) {
      // 「另存为」：用户已在系统对话框里选定完整路径，直接落盘，
      // 不再套命名模板与同名策略。
      fileCommit = await commitExactFile(options.targetFilePath, encoded, dependencies);
    } else {
      if (!options.outputDirectoryToken) {
        throw new Error("UPSCALE_EXPORT_FAILED: 尚未选择保存目录");
      }
      const directory = dependencies.resolveOutputDirectory(options.outputDirectoryToken);
      const outputName = buildUpscaleOutputName(input.displayName, request.modelId, options.namingPattern);
      fileCommit = await commitOutputFile(
        directory,
        outputName,
        extensionFor(options.format),
        encoded,
        options.conflictPolicy,
        dependencies,
      ).catch((error: unknown) => {
        throw new Error(`UPSCALE_EXPORT_FAILED: ${errorMessage(error, "文件保存失败")}`);
      });
    }
  }

  let importedItemIds: string[] = [];
  if (options.addToLibrary) {
    try {
      const sourceItem = input.sourceItemId
        ? await dependencies.findSourceItem(input.sourceItemId)
        : null;
      importedItemIds = await dependencies.importToLibrary({
        dataUrl: `data:${mimeFor(options.format)};base64,${encoded.toString("base64")}`,
        metadata: buildLibraryMetadata(input, request.modelId, options, sourceItem),
      });
    } catch (error) {
      await fileCommit?.rollback();
      throw new Error(`UPSCALE_LIBRARY_IMPORT_FAILED: ${errorMessage(error, "加入素材库失败")}`);
    }
  }

  await fileCommit?.finalize();
  return {
    savedFileName: fileCommit && !fileCommit.skipped ? fileCommit.fileName : null,
    importedItemIds,
    skipped: fileCommit?.skipped ?? false,
  };
}

export function replaceUpscaleSource(
  request: UpscaleReplaceSourceRequest,
): Promise<UpscaleReplaceSourceResult> {
  return replaceUpscaleSourceWithDependencies(request, createDefaultDependencies());
}

export async function replaceUpscaleSourceWithDependencies(
  request: UpscaleReplaceSourceRequest,
  dependencies: UpscaleExportDependencies,
): Promise<UpscaleReplaceSourceResult> {
  const input = dependencies.getInputDescriptor(request.inputToken);
  if (!input.sourceItemId || !input.sourceImageFileName) {
    throw new Error("UPSCALE_SOURCE_REPLACE_FAILED: 输入未从素材详情注册");
  }

  const resultBytes = await dependencies.readResult(request.resultToken).catch(() => {
    throw new Error("UPSCALE_RESULT_MISSING: 超分结果已过期");
  });
  const format = formatFor(input.mediaType);
  const encoded = await dependencies.encodeResult(resultBytes, {
    format,
    quality: format === "png" ? null : 92,
    preserveMetadata: true,
  }).catch((error: unknown) => {
    throw new Error(`UPSCALE_SOURCE_REPLACE_FAILED: ${errorMessage(error, "图片编码失败")}`);
  });

  return dependencies.replaceSourceImage({
    sourceItemId: input.sourceItemId,
    expectedImageFileName: input.sourceImageFileName,
    bytes: encoded,
    mediaType: mimeFor(format),
  }).catch((error: unknown) => {
    const message = errorMessage(error, "替换原图失败");
    if (message.startsWith("UPSCALE_SOURCE_REPLACE_FAILED")) throw error;
    throw new Error(`UPSCALE_SOURCE_REPLACE_FAILED: ${message}`);
  });
}

async function commitOutputFile(
  directory: string,
  baseName: string,
  extension: "png" | "jpg" | "webp",
  bytes: Buffer,
  conflictPolicy: UpscaleExportOptions["conflictPolicy"],
  dependencies: UpscaleExportDependencies,
): Promise<FileCommit> {
  const resolvedDirectory = path.resolve(directory);
  let fileName = `${baseName}.${extension}`;
  let target = managedFile(resolvedDirectory, fileName);
  const targetExists = await dependencies.pathExists(target);

  if (targetExists && conflictPolicy === "skip") {
    return {
      fileName: null,
      skipped: true,
      finalize: async () => undefined,
      rollback: async () => undefined,
    };
  }
  if (targetExists && conflictPolicy === "append-number") {
    let suffix = 1;
    while (suffix <= 10_000) {
      fileName = `${baseName} (${suffix}).${extension}`;
      target = managedFile(resolvedDirectory, fileName);
      if (!(await dependencies.pathExists(target))) break;
      suffix += 1;
    }
    if (await dependencies.pathExists(target)) {
      throw new Error("可用文件名已耗尽");
    }
  }

  const temporary = managedFile(resolvedDirectory, `.${fileName}.${randomUUID()}.tmp`);
  const backup = targetExists && conflictPolicy === "overwrite"
    ? managedFile(resolvedDirectory, `.${fileName}.${randomUUID()}.backup`)
    : null;
  let targetWritten = false;
  let backupCreated = false;
  try {
    await dependencies.writeFile(temporary, bytes);
    if (backup) {
      await dependencies.rename(target, backup);
      backupCreated = true;
    }
    await dependencies.rename(temporary, target);
    targetWritten = true;
  } catch (error) {
    await dependencies.remove(temporary).catch(() => undefined);
    if (backupCreated) {
      await dependencies.rename(backup!, target).catch(() => undefined);
    }
    throw error;
  }

  return {
    fileName,
    skipped: false,
    finalize: async () => {
      if (backupCreated && backup) await dependencies.remove(backup).catch(() => undefined);
    },
    rollback: async () => {
      if (targetWritten) await dependencies.remove(target).catch(() => undefined);
      if (backupCreated && backup) await dependencies.rename(backup, target).catch(() => undefined);
    },
  };
}

/**
 * 「另存为」的落盘提交：写到用户指定的完整路径。
 * 目标已存在时先备份，失败或回滚时恢复，避免把用户原文件弄丢。
 */
async function commitExactFile(
  targetFilePath: string,
  bytes: Buffer,
  dependencies: UpscaleExportDependencies,
): Promise<FileCommit> {
  const resolved = path.resolve(targetFilePath);
  const fileName = path.basename(resolved);
  if (!fileName) {
    throw new Error("UPSCALE_EXPORT_FAILED: 输出文件名无效");
  }
  const existed = await dependencies.pathExists(resolved);
  const backup = existed ? `${resolved}.${randomUUID()}.backup` : null;
  try {
    if (backup) await dependencies.rename(resolved, backup);
    if (dependencies.writeFileReplace) {
      await dependencies.writeFileReplace(resolved, bytes);
    } else {
      await fs.writeFile(resolved, bytes);
    }
  } catch (error) {
    if (backup) await dependencies.rename(backup, resolved).catch(() => undefined);
    throw new Error(`UPSCALE_EXPORT_FAILED: ${errorMessage(error, "文件保存失败")}`);
  }
  return {
    fileName,
    skipped: false,
    finalize: async () => {
      if (backup) await dependencies.remove(backup).catch(() => undefined);
    },
    rollback: async () => {
      await dependencies.remove(resolved).catch(() => undefined);
      if (backup) await dependencies.rename(backup, resolved).catch(() => undefined);
    },
  };
}

function buildLibraryMetadata(
  input: UpscaleInputDescriptor,
  modelId: UpscaleExportRequest["modelId"],
  options: UpscaleExportOptions,
  sourceItem: LibraryItem | null,
): GeneratedImageImportPayload["metadata"] {
  const model = getUpscaleModelDefinition(modelId);
  const appendSource = options.libraryMode === "append-source" && sourceItem !== null;
  const inputTitle = path.basename(input.displayName, path.extname(input.displayName));
  const sourceTitle = sourceItem?.title.trim() || inputTitle || "超分图片";
  return {
    title: appendSource
      ? sourceTitle
      : options.title || `${sourceTitle} 超分`,
    prompt: sourceItem?.prompt.trim() || "图片超分",
    negativePrompt: sourceItem?.negativePrompt.trim() || "",
    generationMethod: `图片超分 · ${model.label}`,
    tags: appendSource ? sourceItem?.tags ?? [] : options.tags.length > 0 ? options.tags : sourceItem?.tags ?? [],
    category: sourceItem?.category ?? null,
    categoryId: appendSource ? sourceItem?.categoryId ?? null : options.categoryId ?? sourceItem?.categoryId ?? null,
    genreIds: sourceItem?.genreIds ?? [],
    categoryConfidence: sourceItem?.categoryConfidence ?? null,
    categorySource: sourceItem?.categorySource ?? null,
  };
}

function createDefaultDependencies(): UpscaleExportDependencies {
  return {
    getInputDescriptor: getUpscaleInputDescriptor,
    readResult: readUpscaleResult,
    resolveOutputDirectory: resolveUpscaleOutputDirectory,
    findSourceItem: async (itemId) => {
      const { findLibraryItemById } = await import("../library/libraryStore");
      return findLibraryItemById(itemId);
    },
    encodeResult,
    importToLibrary: async (payload) => {
      const { importGeneratedImages } = await import("../library/imageFiles");
      const result = await importGeneratedImages({
        images: [{ dataUrl: payload.dataUrl }],
        metadata: payload.metadata,
      });
      return result.importedItemIds;
    },
    replaceSourceImage: async (payload) => {
      const { replaceLibrarySourceImage } = await import("../library/upscaleSourceReplacement");
      return replaceLibrarySourceImage(payload);
    },
    pathExists: (filePath) => fs.stat(filePath).then(() => true, () => false),
    writeFile: (filePath, bytes) => fs.writeFile(filePath, bytes, { flag: "wx" }),
    writeFileReplace: (filePath, bytes) => fs.writeFile(filePath, bytes),
    rename: (source, target) => fs.rename(source, target),
    remove: (filePath) => fs.rm(filePath, { force: true }),
  };
}

async function encodeResult(bytes: Buffer, options: EncodeOptions): Promise<Buffer> {
  const sharp = getSharp();
  let pipeline = sharp(bytes, { failOn: "error" }).rotate();
  if (options.preserveMetadata) {
    pipeline = pipeline.withMetadata();
  }
  if (options.format === "jpeg") {
    return pipeline.jpeg({ quality: options.quality ?? 92, mozjpeg: true }).toBuffer();
  }
  if (options.format === "webp") {
    return pipeline.webp({ quality: options.quality ?? 92, effort: 4 }).toBuffer();
  }
  return pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
}

function managedFile(directory: string, fileName: string): string {
  if (!fileName || path.basename(fileName) !== fileName) {
    throw new Error("输出文件名无效");
  }
  const target = path.resolve(directory, fileName);
  if (path.dirname(target) !== directory) {
    throw new Error("输出路径逃逸");
  }
  return target;
}

function extensionFor(format: UpscaleOutputFormat): "png" | "jpg" | "webp" {
  return format === "jpeg" ? "jpg" : format;
}

function mimeFor(format: UpscaleOutputFormat): "image/png" | "image/jpeg" | "image/webp" {
  return format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
}

function formatFor(mediaType: UpscaleInputDescriptor["mediaType"]): UpscaleOutputFormat {
  if (mediaType === "image/jpeg") return "jpeg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}
