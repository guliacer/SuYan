import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  UpscaleComponentStatus,
  UpscaleEngine,
  UpscaleModelId,
} from "../../../src/features/upscale/types";
import { assertSafeRelativePath, safeExtractZip, verifySha256 } from "../modules/componentSecurity";
import {
  REAL_CUGAN_ARTIFACTS,
  REAL_ESRGAN_ARTIFACT,
  REAL_ESRGAN_REQUIRED_FILES,
  type UpscaleArtifact,
} from "./upscaleManifest";
import { getUpscalePaths, type UpscalePaths } from "./upscalePaths";

export type UpscaleInstallProgress = (progress: {
  phase: "downloading" | "verifying" | "installing" | "ready";
  bytesDownloaded: number;
  totalBytes: number;
  message: string;
}) => void;

export type UpscaleDownload = (
  url: string,
  expectedBytes: number,
  onProgress?: UpscaleInstallProgress,
) => Promise<Buffer>;

type RealEsrganArtifact = typeof REAL_ESRGAN_ARTIFACT | {
  version: string;
  fileName: string;
  byteSize: number;
  sha256: string;
  url: string;
};

type RealCuganInstallManifest = {
  version: 1;
  installedAt: string;
  models: Array<Pick<UpscaleArtifact, "modelId" | "fileName" | "byteSize" | "sha256">>;
};

type RealEsrganInstallManifest = {
  version: string;
  installedAt: string;
  archiveSha256: string;
};

const extractLimits = {
  maxArchiveBytes: 80 * 1024 * 1024,
  maxEntries: 128,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 160 * 1024 * 1024,
};

export async function getUpscaleComponentStatus(
  engine: UpscaleEngine,
): Promise<UpscaleComponentStatus> {
  return getUpscaleComponentStatusInPaths(getUpscalePaths(), engine);
}

export async function getUpscaleComponentStatusInPaths(
  paths: UpscalePaths,
  engine: UpscaleEngine,
  expected: readonly UpscaleArtifact[] | RealEsrganArtifact =
    engine === "real-cugan" ? REAL_CUGAN_ARTIFACTS : REAL_ESRGAN_ARTIFACT,
): Promise<UpscaleComponentStatus> {
  if (engine === "real-cugan") {
    const artifacts = isArtifactArray(expected) ? expected : REAL_CUGAN_ARTIFACTS;
    const installedModelIds: UpscaleModelId[] = [];
    for (const artifact of artifacts) {
      if (await isValidFile(path.join(paths.realCuganModelsRoot, artifact.fileName), artifact)) {
        installedModelIds.push(artifact.modelId);
      }
    }
    return {
      engine,
      installed: installedModelIds.length > 0,
      phase: installedModelIds.length > 0 ? "ready" : "not-installed",
      version: installedModelIds.length > 0 ? "1" : null,
      installedModelIds,
      bytesDownloaded: 0,
      totalBytes: 0,
      message: installedModelIds.length > 0 ? "Real-CUGAN 模型已就绪" : "尚未安装 Real-CUGAN 模型",
    };
  }

  const artifact = isArtifactArray(expected) ? REAL_ESRGAN_ARTIFACT : expected;
  const valid = await isRealEsrganInstallValid(paths, artifact);
  return {
    engine,
    installed: valid,
    phase: valid ? "ready" : "not-installed",
    version: valid ? artifact.version : null,
    installedModelIds: valid
      ? [
          "esrgan-x4plus",
          "esrgan-x4plus-anime",
          "esrgan-animevideov3-2x",
          "esrgan-animevideov3-3x",
          "esrgan-animevideov3-4x",
        ]
      : [],
    bytesDownloaded: 0,
    totalBytes: 0,
    message: valid ? "Real-ESRGAN 组件已就绪" : "尚未安装 Real-ESRGAN 组件",
  };
}

export async function installRealCuganModel(
  modelId: UpscaleModelId,
  onProgress?: UpscaleInstallProgress,
): Promise<UpscaleComponentStatus> {
  const artifact = REAL_CUGAN_ARTIFACTS.find((entry) => entry.modelId === modelId);
  if (!artifact) {
    throw new Error(`UPSCALE_MODEL_UNKNOWN: ${modelId}`);
  }
  const paths = getUpscalePaths();
  await installRealCuganModelInPaths(paths, artifact, downloadArtifact, onProgress);
  return getUpscaleComponentStatusInPaths(paths, "real-cugan");
}

export async function installRealCuganModelInPaths(
  paths: UpscalePaths,
  artifact: UpscaleArtifact,
  download: UpscaleDownload,
  onProgress?: UpscaleInstallProgress,
): Promise<void> {
  await fs.mkdir(paths.realCuganModelsRoot, { recursive: true });
  const target = managedChild(paths.realCuganModelsRoot, artifact.fileName);
  const partial = `${target}.${crypto.randomBytes(6).toString("hex")}.partial`;
  try {
    const data = await download(artifact.url, artifact.byteSize, onProgress);
    onProgress?.({
      phase: "verifying",
      bytesDownloaded: data.length,
      totalBytes: artifact.byteSize,
      message: "正在校验 Real-CUGAN 模型",
    });
    verifyArtifact(data, artifact);
    await fs.writeFile(partial, data, { flag: "wx" });
    await replaceFile(partial, target);
    await updateRealCuganManifest(paths, artifact);
    onProgress?.({
      phase: "ready",
      bytesDownloaded: data.length,
      totalBytes: artifact.byteSize,
      message: "Real-CUGAN 模型安装完成",
    });
  } finally {
    await fs.rm(partial, { force: true }).catch(() => undefined);
  }
}

export async function installRealEsrgan(
  onProgress?: UpscaleInstallProgress,
): Promise<UpscaleComponentStatus> {
  const paths = getUpscalePaths();
  await installRealEsrganInPaths(paths, REAL_ESRGAN_ARTIFACT, downloadArtifact, onProgress);
  return getUpscaleComponentStatusInPaths(paths, "real-esrgan");
}

export async function installRealEsrganInPaths(
  paths: UpscalePaths,
  artifact: RealEsrganArtifact,
  download: UpscaleDownload,
  onProgress?: UpscaleInstallProgress,
): Promise<void> {
  await fs.mkdir(paths.componentsRoot, { recursive: true });
  const suffix = crypto.randomBytes(6).toString("hex");
  const staging = managedChild(paths.componentsRoot, `.upscale-realesrgan-staging-${suffix}`);
  const backup = managedChild(paths.componentsRoot, `.upscale-realesrgan-backup-${suffix}`);
  let movedExisting = false;
  try {
    const archive = await download(artifact.url, artifact.byteSize, onProgress);
    onProgress?.({
      phase: "verifying",
      bytesDownloaded: archive.length,
      totalBytes: artifact.byteSize,
      message: "正在校验 Real-ESRGAN 组件",
    });
    verifyArchive(archive, artifact);
    onProgress?.({
      phase: "installing",
      bytesDownloaded: archive.length,
      totalBytes: artifact.byteSize,
      message: "正在安装 Real-ESRGAN 组件",
    });
    await extractRealEsrganArchive(archive, staging);
    await verifyRequiredFiles(staging);
    const manifest: RealEsrganInstallManifest = {
      version: artifact.version,
      installedAt: new Date().toISOString(),
      archiveSha256: artifact.sha256,
    };
    await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    if (await pathExists(paths.realEsrganRoot)) {
      await fs.rename(paths.realEsrganRoot, backup);
      movedExisting = true;
    }
    await fs.rename(staging, paths.realEsrganRoot);
    if (movedExisting) {
      await fs.rm(backup, { recursive: true, force: true });
    }
    onProgress?.({
      phase: "ready",
      bytesDownloaded: archive.length,
      totalBytes: artifact.byteSize,
      message: "Real-ESRGAN 组件安装完成",
    });
  } catch (error) {
    if (movedExisting && !(await pathExists(paths.realEsrganRoot)) && (await pathExists(backup))) {
      await fs.rename(backup, paths.realEsrganRoot).catch(() => undefined);
    }
    throw error;
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function removeUpscaleComponent(engine: UpscaleEngine): Promise<{ removed: boolean }> {
  const paths = getUpscalePaths();
  const target = engine === "real-cugan" ? paths.realCuganRoot : paths.realEsrganRoot;
  assertManagedComponentTarget(paths, target);
  if (!(await pathExists(target))) {
    return { removed: false };
  }
  await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  return { removed: true };
}

export async function readRealCuganModel(modelId: UpscaleModelId): Promise<Buffer> {
  const artifact = REAL_CUGAN_ARTIFACTS.find((entry) => entry.modelId === modelId);
  if (!artifact) {
    throw new Error(`UPSCALE_MODEL_UNKNOWN: ${modelId}`);
  }
  const paths = getUpscalePaths();
  const modelPath = managedChild(paths.realCuganModelsRoot, artifact.fileName);
  const data = await fs.readFile(modelPath);
  verifyArtifact(data, artifact);
  return data;
}

async function downloadArtifact(
  url: string,
  expectedBytes: number,
  onProgress?: UpscaleInstallProgress,
): Promise<Buffer> {
  const runtimeRequire = createRequire(__filename);
  const electron = runtimeRequire("electron") as { net: { fetch: typeof fetch } };
  onProgress?.({
    phase: "downloading",
    bytesDownloaded: 0,
    totalBytes: expectedBytes,
    message: "正在下载超分组件",
  });
  const response = await electron.net.fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`UPSCALE_MODEL_DOWNLOAD_FAILED: HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > expectedBytes) {
    throw new Error("UPSCALE_MODEL_DOWNLOAD_FAILED: 响应体积超过清单");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  onProgress?.({
    phase: "downloading",
    bytesDownloaded: buffer.length,
    totalBytes: expectedBytes,
    message: "超分组件下载完成",
  });
  return buffer;
}

async function extractRealEsrganArchive(archive: Buffer, staging: string): Promise<void> {
  const runtimeRequire = createRequire(__filename);
  const JSZip = runtimeRequire("jszip") as typeof import("jszip");
  const parsed = await JSZip.loadAsync(archive);
  for (const entry of Object.values(parsed.files)) {
    if (entry.dir) {
      continue;
    }
    const unsafeOriginalName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName;
    assertSafeRelativePath(unsafeOriginalName || entry.name);
  }
  await safeExtractZip(archive, staging, extractLimits, async () => parsed);
}

async function verifyRequiredFiles(root: string): Promise<void> {
  for (const relativePath of REAL_ESRGAN_REQUIRED_FILES) {
    const safeRelativePath = assertSafeRelativePath(relativePath);
    const filePath = path.resolve(root, safeRelativePath);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) {
      throw new Error(`UPSCALE_COMPONENT_CORRUPTED: 缺少 ${relativePath}`);
    }
  }
}

async function isRealEsrganInstallValid(paths: UpscalePaths, artifact: RealEsrganArtifact): Promise<boolean> {
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(paths.realEsrganRoot, "manifest.json"), "utf8"),
    ) as Partial<RealEsrganInstallManifest>;
    if (manifest.version !== artifact.version || manifest.archiveSha256 !== artifact.sha256) {
      return false;
    }
    await verifyRequiredFiles(paths.realEsrganRoot);
    return true;
  } catch {
    return false;
  }
}

async function updateRealCuganManifest(paths: UpscalePaths, installed: UpscaleArtifact): Promise<void> {
  const manifestPath = path.join(paths.realCuganRoot, "manifest.json");
  const current = await readJson<RealCuganInstallManifest>(manifestPath);
  const models = (current?.models ?? []).filter((entry) => entry.modelId !== installed.modelId);
  models.push({
    modelId: installed.modelId,
    fileName: installed.fileName,
    byteSize: installed.byteSize,
    sha256: installed.sha256,
  });
  const next: RealCuganInstallManifest = {
    version: 1,
    installedAt: new Date().toISOString(),
    models,
  };
  await atomicWriteJson(manifestPath, next);
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await replaceFile(temp, filePath);
}

async function replaceFile(source: string, target: string): Promise<void> {
  await fs.rm(target, { force: true });
  await fs.rename(source, target);
}

function verifyArtifact(data: Buffer, artifact: Pick<UpscaleArtifact, "byteSize" | "sha256">): void {
  if (data.length !== artifact.byteSize) {
    throw new Error(`UPSCALE_MODEL_HASH_MISMATCH: SHA-256 校验前发现体积 ${data.length} != ${artifact.byteSize}`);
  }
  if (!verifySha256(data, artifact.sha256)) {
    throw new Error("UPSCALE_MODEL_HASH_MISMATCH: SHA-256 不匹配");
  }
}

function verifyArchive(data: Buffer, artifact: Pick<RealEsrganArtifact, "byteSize" | "sha256">): void {
  if (data.length !== artifact.byteSize || !verifySha256(data, artifact.sha256)) {
    throw new Error("UPSCALE_MODEL_HASH_MISMATCH: Real-ESRGAN 组件校验失败");
  }
}

async function isValidFile(filePath: string, artifact: UpscaleArtifact): Promise<boolean> {
  try {
    const data = await fs.readFile(filePath);
    return data.length === artifact.byteSize && verifySha256(data, artifact.sha256);
  } catch {
    return false;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then(() => true, () => false);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function managedChild(parent: string, childName: string): string {
  if (path.basename(childName) !== childName) {
    throw new Error(`受管文件名无效: ${childName}`);
  }
  const resolvedParent = path.resolve(parent);
  const target = path.resolve(resolvedParent, childName);
  if (path.dirname(target) !== resolvedParent) {
    throw new Error("目标不在受管目录内");
  }
  return target;
}

function assertManagedComponentTarget(paths: UpscalePaths, target: string): void {
  const componentsRoot = path.resolve(paths.componentsRoot);
  if (path.dirname(path.resolve(target)) !== componentsRoot) {
    throw new Error("组件目录不在受管 components 目录内");
  }
}

function isArtifactArray(
  value: readonly UpscaleArtifact[] | RealEsrganArtifact,
): value is readonly UpscaleArtifact[] {
  return Array.isArray(value);
}
