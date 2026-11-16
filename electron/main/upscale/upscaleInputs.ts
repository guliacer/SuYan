import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  UpscaleInputDescriptor,
  UpscaleOutputFormat,
  UpscaleResultDescriptor,
} from "../../../src/features/upscale/types";
import type { LibraryItem } from "../../../src/features/library/types/library";
import { isVideoMediaFile } from "../../../src/features/library/utils/mediaFileTypes";
import { normalizeImageOrientationSize } from "../../../src/features/upscale/utils/upscaleOrientation";
import { AppError } from "../ipc/errors";
import { dialog } from "../app/fileDialogs";
// 与 upscaleExport 同因：native sharp 只在 resources/vendor 下，
// 顶层 require("sharp") 在主进程启动阶段必崩。
import { getSharp } from "../runtime/imageRuntime";
import { getUpscalePaths, type UpscalePaths } from "./upscalePaths";

type UpscaleMediaType = UpscaleInputDescriptor["mediaType"];

export type UpscalePathInput =
  | string
  | {
      filePath: string;
      sourceItemId?: string | null;
      sourceImageFileName?: string | null;
    };

export type UpscaleInputPickKind = "files" | "directory";

export type UpscaleLibraryItemRegistrationDependencies = {
  findItem(itemId: string): Promise<Pick<LibraryItem, "id" | "imageFileName" | "mediaStorage"> | null>;
  resolveMediaPath(item: Pick<LibraryItem, "imageFileName" | "mediaStorage">): Promise<string>;
  stat(filePath: string): Promise<{ isFile(): boolean } | null>;
  registerPaths(inputs: readonly UpscalePathInput[]): Promise<UpscaleInputDescriptor[]>;
};

type InputRecord = {
  descriptor: UpscaleInputDescriptor;
  filePath: string;
};

type ResultRecord = {
  descriptor: UpscaleResultDescriptor;
  filePath: string;
};

const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const inputRecords = new Map<string, InputRecord>();
const resultRecords = new Map<string, ResultRecord>();
const inputTokensBySource = new Map<string, string>();

export async function registerUpscalePaths(
  inputs: readonly UpscalePathInput[],
): Promise<UpscaleInputDescriptor[]> {
  const expanded = await expandInputs(inputs);
  const descriptors: UpscaleInputDescriptor[] = [];

  for (const entry of expanded) {
    const key = sourceKey(entry);
    const existingToken = inputTokensBySource.get(key);
    const existing = existingToken ? inputRecords.get(existingToken) : undefined;
    if (existing) {
      descriptors.push(existing.descriptor);
      continue;
    }

    const bytes = await readSourceFile(entry.filePath);
    const metadata = await readImageMetadata(bytes, "UPSCALE_INPUT_UNSUPPORTED");
    const descriptor: UpscaleInputDescriptor = {
      token: randomUUID(),
      displayName: path.basename(entry.filePath),
      width: metadata.width,
      height: metadata.height,
      byteSize: bytes.length,
      mediaType: metadata.mediaType,
      sourceItemId: entry.sourceItemId,
      sourceImageFileName: entry.sourceImageFileName,
      previewDataUrl: await createPreviewDataUrl(bytes),
    };
    inputRecords.set(descriptor.token, { descriptor, filePath: entry.filePath });
    inputTokensBySource.set(key, descriptor.token);
    descriptors.push(descriptor);
  }

  return descriptors;
}

export async function pickUpscaleInputs(
  kind: UpscaleInputPickKind,
): Promise<UpscaleInputDescriptor[]> {
  const selection = await dialog.showOpenDialog({
    title: kind === "directory" ? "选择超分图片目录" : "选择要超分的图片",
    properties: kind === "directory" ? ["openDirectory"] : ["openFile", "multiSelections"],
    filters: kind === "directory"
      ? undefined
      : [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return [];
  }
  return registerUpscalePaths(selection.filePaths);
}

export async function registerUpscaleLibraryItem(
  itemId: string,
  dependencies: UpscaleLibraryItemRegistrationDependencies = defaultLibraryItemRegistrationDependencies,
): Promise<UpscaleInputDescriptor> {
  const item = await dependencies.findItem(itemId);
  if (!item) {
    throw new AppError("UPSCALE_INPUT_MISSING", "来源素材不存在或已被删除。");
  }
  if (isVideoMediaFile(item.imageFileName)) {
    throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "视频素材不能发送到图片超分。");
  }

  const filePath = await dependencies.resolveMediaPath(item).catch(() => {
    throw new AppError("UPSCALE_INPUT_MISSING", "来源图片不可用。");
  });
  const stats = await dependencies.stat(filePath).catch(() => null);
  if (!stats?.isFile()) {
    throw new AppError("UPSCALE_INPUT_MISSING", "来源图片不可用。");
  }
  const [descriptor] = await dependencies.registerPaths([{
    filePath,
    sourceItemId: item.id,
    sourceImageFileName: item.imageFileName,
  }]);
  return descriptor;
}

const defaultLibraryItemRegistrationDependencies: UpscaleLibraryItemRegistrationDependencies = {
  async findItem(itemId) {
    const { findLibraryItemById } = await import("../library/libraryStore");
    return findLibraryItemById(itemId);
  },
  async resolveMediaPath(item) {
    const { resolveMediaAbsolutePath } = await import("../library/mediaPathResolver");
    return resolveMediaAbsolutePath(item);
  },
  stat: (filePath) => fs.stat(filePath).catch(() => null),
  registerPaths: (inputs) => registerUpscalePaths(inputs),
};

export async function readUpscaleInput(token: string): Promise<Buffer> {
  return readRegisteredFile(inputRecords, token, "UPSCALE_INPUT_MISSING");
}

export function getUpscaleInputDescriptor(token: string): UpscaleInputDescriptor {
  const record = inputRecords.get(token);
  if (!record) {
    throw new Error("UPSCALE_INPUT_MISSING: 令牌无效或已过期");
  }
  return { ...record.descriptor };
}

export function resolveUpscaleInputPath(token: string): string {
  return resolveRegisteredPath(inputRecords, token, "UPSCALE_INPUT_MISSING");
}

export async function createUpscaleResult(
  jobId: string,
  bytes: Uint8Array,
  extension: UpscaleOutputFormat | "jpg",
  paths: UpscalePaths = getUpscalePaths(),
): Promise<UpscaleResultDescriptor> {
  assertSafeJobId(jobId);
  const normalizedExtension = normalizeResultExtension(extension);
  const buffer = Buffer.from(bytes);
  const metadata = await readImageMetadata(buffer, "UPSCALE_RESULT_MISSING");
  const jobRoot = directChild(paths.cacheRoot, jobId);
  await fs.mkdir(jobRoot, { recursive: true });

  const fileName = `${randomUUID()}.${normalizedExtension}`;
  const targetPath = directChild(jobRoot, fileName);
  const temporaryPath = directChild(jobRoot, `${fileName}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, buffer, { flag: "wx" });
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  const descriptor: UpscaleResultDescriptor = {
    token: randomUUID(),
    previewDataUrl: await createPreviewDataUrl(buffer),
    width: metadata.width,
    height: metadata.height,
    byteSize: buffer.length,
    mediaType: metadata.mediaType,
  };
  resultRecords.set(descriptor.token, { descriptor, filePath: targetPath });
  return descriptor;
}

export async function readUpscaleResult(token: string): Promise<Buffer> {
  return readRegisteredFile(resultRecords, token, "UPSCALE_RESULT_MISSING");
}

export function resolveUpscaleResultPath(token: string): string {
  return resolveRegisteredPath(resultRecords, token, "UPSCALE_RESULT_MISSING");
}

export function clearUpscaleSession(): void {
  inputRecords.clear();
  resultRecords.clear();
  inputTokensBySource.clear();
}

async function expandInputs(inputs: readonly UpscalePathInput[]): Promise<Array<{
  filePath: string;
  sourceItemId: string | null;
  sourceImageFileName: string | null;
}>> {
  const expanded: Array<{
    filePath: string;
    sourceItemId: string | null;
    sourceImageFileName: string | null;
  }> = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const filePath = path.resolve(typeof input === "string" ? input : input.filePath);
    const sourceItemId = typeof input === "string" ? null : input.sourceItemId ?? null;
    const sourceImageFileName = typeof input === "string" ? null : input.sourceImageFileName ?? null;
    const stats = await fs.lstat(filePath).catch(() => null);
    if (!stats || stats.isSymbolicLink()) {
      throw new Error("UPSCALE_INPUT_MISSING: 输入文件不存在");
    }
    if (stats.isDirectory()) {
      const files = await collectSupportedFiles(filePath);
      for (const nestedPath of files) {
        appendUnique(expanded, seen, nestedPath, null, null);
      }
      continue;
    }
    if (!stats.isFile()) {
      throw new Error("UPSCALE_INPUT_UNSUPPORTED: 输入不是常规文件");
    }
    if (!isSupportedPath(filePath)) {
      throw new Error("UPSCALE_INPUT_UNSUPPORTED: 仅支持 PNG、JPEG 和 WebP");
    }
    appendUnique(expanded, seen, filePath, sourceItemId, sourceImageFileName);
  }

  return expanded;
}

async function collectSupportedFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const candidate = path.join(root, entry.name);
    if (isSupportedPath(candidate)) {
      files.push(candidate);
    }
  }
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    files.push(...await collectSupportedFiles(path.join(root, entry.name)));
  }
  return files;
}

function appendUnique(
  entries: Array<{
    filePath: string;
    sourceItemId: string | null;
    sourceImageFileName: string | null;
  }>,
  seen: Set<string>,
  filePath: string,
  sourceItemId: string | null,
  sourceImageFileName: string | null,
): void {
  const resolved = path.resolve(filePath);
  const entry = { filePath: resolved, sourceItemId, sourceImageFileName };
  const key = sourceKey(entry);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  entries.push(entry);
}

async function readSourceFile(filePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(filePath);
  } catch {
    throw new Error("UPSCALE_INPUT_MISSING: 输入文件无法读取");
  }
}

async function readImageMetadata(
  bytes: Buffer,
  errorCode: "UPSCALE_INPUT_UNSUPPORTED" | "UPSCALE_RESULT_MISSING",
): Promise<{ width: number; height: number; mediaType: UpscaleMediaType }> {
  try {
    const metadata = await getSharp()(bytes, { failOn: "error" }).metadata();
    const mediaType = mediaTypeForFormat(metadata.format);
    if (!metadata.width || !metadata.height || !mediaType) {
      throw new Error("missing metadata");
    }
    // metadata() 返回的是文件里存的原始像素尺寸，不含 EXIF 方向；
    // 而预览图经 .rotate() 摆正过。竖拍照片（orientation 5-8）必须交换宽高，
    // 否则会出现「左栏写着 1080x1620、预览却是横图」。
    const size = normalizeImageOrientationSize(
      metadata.width,
      metadata.height,
      metadata.orientation,
    );
    return { width: size.width, height: size.height, mediaType };
  } catch {
    throw new Error(`${errorCode}: 图片无法解码`);
  }
}

async function createPreviewDataUrl(bytes: Buffer): Promise<string> {
  const preview = await getSharp()(bytes, { failOn: "error" })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76, effort: 3 })
    .toBuffer();
  return `data:image/webp;base64,${preview.toString("base64")}`;
}

async function readRegisteredFile<T extends { filePath: string }>(
  registry: Map<string, T>,
  token: string,
  errorCode: "UPSCALE_INPUT_MISSING" | "UPSCALE_RESULT_MISSING",
): Promise<Buffer> {
  const filePath = resolveRegisteredPath(registry, token, errorCode);
  try {
    return await fs.readFile(filePath);
  } catch {
    throw new Error(`${errorCode}: 注册文件已不存在`);
  }
}

function resolveRegisteredPath<T extends { filePath: string }>(
  registry: Map<string, T>,
  token: string,
  errorCode: "UPSCALE_INPUT_MISSING" | "UPSCALE_RESULT_MISSING",
): string {
  const record = typeof token === "string" ? registry.get(token) : undefined;
  if (!record) {
    throw new Error(`${errorCode}: 令牌无效或已过期`);
  }
  return record.filePath;
}

function mediaTypeForFormat(format: string | undefined): UpscaleMediaType | null {
  if (format === "png") return "image/png";
  if (format === "jpeg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return null;
}

function isSupportedPath(filePath: string): boolean {
  return supportedExtensions.has(path.extname(filePath).toLowerCase());
}

function pathKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function sourceKey(entry: {
  filePath: string;
  sourceItemId: string | null;
  sourceImageFileName: string | null;
}): string {
  return `${pathKey(entry.filePath)}\u0000${entry.sourceItemId ?? ""}\u0000${entry.sourceImageFileName ?? ""}`;
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/iu.test(jobId)) {
    throw new Error("UPSCALE_RESULT_MISSING: 任务 ID 无效");
  }
}

function normalizeResultExtension(extension: UpscaleOutputFormat | "jpg"): "png" | "jpg" | "webp" {
  if (extension === "png" || extension === "webp") return extension;
  if (extension === "jpeg" || extension === "jpg") return "jpg";
  throw new Error("UPSCALE_RESULT_MISSING: 输出格式不受支持");
}

function directChild(parent: string, childName: string): string {
  if (path.basename(childName) !== childName) {
    throw new Error("UPSCALE_RESULT_MISSING: 缓存路径无效");
  }
  const resolvedParent = path.resolve(parent);
  const target = path.resolve(resolvedParent, childName);
  if (path.dirname(target) !== resolvedParent) {
    throw new Error("UPSCALE_RESULT_MISSING: 缓存路径逃逸");
  }
  return target;
}
