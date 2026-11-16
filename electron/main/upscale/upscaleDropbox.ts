import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type {
  UpscaleDropboxEntry,
  UpscaleDropboxScanResult,
  UpscaleModelId,
} from "../../../src/features/upscale/types";
import { assertSafeRelativePath, safeExtractZip, verifySha256 } from "../modules/componentSecurity";
import {
  REAL_CUGAN_ARTIFACTS,
  REAL_ESRGAN_ARTIFACT,
  REAL_ESRGAN_REQUIRED_FILES,
  type UpscaleArtifact,
} from "./upscaleManifest";
import type { UpscalePaths } from "./upscalePaths";

/**
 * 超分模型收件目录。
 *
 * 用户自己从网上下的模型丢进这个目录，主进程自动识别 → 校验 → 落盘 → 登记，
 * 不需要再点安装、不需要选路径、不需要改文件名。设计目标是「丢进去就完事」。
 *
 * 支持三类东西：
 *   1. Real-CUGAN 的 .onnx 模型 —— 按文件名 + 体积 + SHA-256 三重匹配；
 *   2. Real-ESRGAN 的官方 zip  —— 按整包 SHA-256 匹配，解压后校验必需文件；
 *   3. Real-ESRGAN 的散件模型  —— .bin / .param 按文件名匹配，凑齐 12 个必需文件即可用。
 *
 * 识别不出的文件原地不动，报告里写清楚为什么，避免误删用户的东西。
 */

const DROPBOX_DIR_NAME = "model-dropbox";
const DROPBOX_README_NAME = "放这里就行.txt";

const extractLimits = {
  maxArchiveBytes: 80 * 1024 * 1024,
  maxEntries: 128,
  maxEntryBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 160 * 1024 * 1024,
};

export function resolveUpscaleDropboxDir(userDataRoot: string): string {
  return path.join(path.resolve(userDataRoot), DROPBOX_DIR_NAME);
}

export function getUpscaleDropboxDir(): string {
  // 和 upscalePaths 一样从 Electron 的 userData 取，保持「便携版数据在软件目录」的约定。
  // 这里不能直接 import electron，测试环境拿不到 runtime。
  const electron = createRequire(__filename)("electron") as {
    app?: { getPath?: (name: string) => string };
  };
  const userDataRoot = electron.app?.getPath?.("userData");
  if (!userDataRoot) {
    throw new Error("Electron userData path is unavailable");
  }
  return resolveUpscaleDropboxDir(userDataRoot);
}

/** 建目录并放一份说明文件，用户第一次打开就知道该往里丢什么。 */
export async function ensureUpscaleDropboxDir(dropboxDir: string): Promise<void> {
  await fs.mkdir(dropboxDir, { recursive: true });
  const readmePath = path.join(dropboxDir, DROPBOX_README_NAME);
  if (!(await pathExists(readmePath))) {
    await fs.writeFile(readmePath, buildDropboxReadme(), "utf8");
  }
}

function buildDropboxReadme(): string {
  return [
    "这里是超分模型的收件目录。",
    "",
    "把下载好的模型文件丢进这个文件夹，软件会自动识别并装好，",
    "不需要点安装按钮、不需要改文件名、不需要手动挪位置。",
    "",
    "支持丢进来的东西：",
    "  1. Real-CUGAN 模型（.onnx）",
    "     文件名必须是下面这些之一：",
    ...REAL_CUGAN_ARTIFACTS.map((entry) => `       ${entry.fileName}`),
    "",
    "  2. Real-ESRGAN 官方压缩包",
    `       ${REAL_ESRGAN_ARTIFACT.fileName}`,
    "",
    "  3. Real-ESRGAN 散件模型（.bin / .param）",
    "     把 models\\ 下的 .bin 和 .param 一起丢进来，凑齐后自动装好。",
    "",
    "识别成功的文件会装到 data\\components\\ 下，原文件仍留在这里。",
    "识别不出的文件会原地不动，并在软件里说明原因，不会被删。",
  ].join("\n");
}

export async function scanUpscaleDropboxInPaths(
  paths: UpscalePaths,
  dropboxDir: string,
  options: { artifacts?: readonly UpscaleArtifact[] } = {},
): Promise<UpscaleDropboxScanResult> {
  const artifacts = options.artifacts ?? REAL_CUGAN_ARTIFACTS;
  await ensureUpscaleDropboxDir(dropboxDir);

  const entries: UpscaleDropboxEntry[] = [];
  const names = await fs.readdir(dropboxDir).catch(() => [] as string[]);

  for (const name of names) {
    if (name === DROPBOX_README_NAME) continue;
    const sourcePath = path.join(dropboxDir, name);
    const stat = await fs.stat(sourcePath).catch(() => null);
    // 目录不递归处理：收件目录就是「丢文件进来」，递归反而容易误伤用户自己整理的子目录。
    if (!stat?.isFile()) continue;
    entries.push(await processFile(paths, sourcePath, name, stat.size, artifacts));
  }

  // 无论这轮装了什么，都按磁盘上的真实状态重建清单，
  // 这样手工放进去的文件只要校验通过就会被登记（之前漏登记就是这么来的）。
  await rebuildRealCuganManifest(paths, artifacts);
  const realCuganInstalledModelIds = await listInstalledCuganModels(paths, artifacts);
  const realEsrganInstalled = await isRealEsrganReady(paths);

  return {
    dropboxDir,
    scanned: entries.length,
    installedCount: entries.filter((entry) => entry.state === "installed").length,
    alreadyCount: entries.filter((entry) => entry.state === "already").length,
    rejectedCount: entries.filter((entry) => entry.state === "rejected").length,
    entries,
    realCuganInstalledModelIds,
    realEsrganInstalled,
  };
}

/** 在资源管理器里打开收件目录，用户找不到目录时一键直达。 */
export async function openUpscaleDropboxFolder(dropboxDir: string): Promise<{ opened: true; path: string }> {
  await ensureUpscaleDropboxDir(dropboxDir);
  const electron = createRequire(__filename)("electron") as {
    shell?: { openPath: (target: string) => Promise<string> };
  };
  const failure = await electron.shell?.openPath?.(dropboxDir);
  if (failure) {
    throw new Error(`UPSCALE_DROPBOX_OPEN_FAILED: 无法打开收件目录：${failure}`);
  }
  return { opened: true, path: dropboxDir };
}

export type UpscaleDropboxWatcher = {
  /** 停掉监听并释放句柄。 */
  close(): Promise<void>;
};

/**
 * 盯着收件目录，文件一落地就自动扫描安装。
 * 用 debounce 合并连发事件（浏览器下载经常是先建 .part 再改名），
 * 避免扫到写了一半的文件误判成「校验失败」。
 */
export function watchUpscaleDropbox(
  dropboxDir: string,
  onChange: (result: UpscaleDropboxScanResult) => void,
  options: { debounceMs?: number; onError?: (error: unknown) => void } = {},
): UpscaleDropboxWatcher {
  const debounceMs = options.debounceMs ?? 1200;
  const chokidar = createRequire(__filename)("chokidar") as typeof import("chokidar");
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  let scanning = false;
  let pending = false;

  const runScan = async () => {
    if (closed) return;
    if (scanning) {
      pending = true;
      return;
    }
    scanning = true;
    try {
      const result = await scanUpscaleDropboxInPaths(getUpscalePathsFromDropbox(dropboxDir), dropboxDir);
      if (!closed) onChange(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      scanning = false;
      if (pending && !closed) {
        pending = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runScan();
    }, debounceMs);
  };

  const watcher = chokidar.watch(dropboxDir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 120 },
  });
  watcher.on("add", schedule);
  watcher.on("change", schedule);

  return {
    async close() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await watcher.close();
    },
  };
}

/**
 * 从收件目录路径反推 UpscalePaths。
 * 收件目录固定在 <userData>/model-dropbox，所以向上一层就是 userData 根。
 */
function getUpscalePathsFromDropbox(dropboxDir: string): UpscalePaths {
  const userDataRoot = path.dirname(path.resolve(dropboxDir));
  return {
    userDataRoot,
    componentsRoot: path.join(userDataRoot, "components"),
    realCuganRoot: path.join(userDataRoot, "components", "upscale-cugan"),
    realCuganModelsRoot: path.join(userDataRoot, "components", "upscale-cugan", "models"),
    realEsrganRoot: path.join(userDataRoot, "components", "upscale-realesrgan"),
    cacheRoot: path.join(userDataRoot, "cache", "upscale"),
  };
}

async function processFile(
  paths: UpscalePaths,
  sourcePath: string,
  name: string,
  byteSize: number,
  artifacts: readonly UpscaleArtifact[],
): Promise<UpscaleDropboxEntry> {
  // 1) Real-CUGAN .onnx
  const cugan = artifacts.find((entry) => entry.fileName === name);
  if (cugan) {
    return installCuganArtifact(paths, sourcePath, name, byteSize, cugan);
  }

  // 2) Real-ESRGAN 官方 zip
  if (/^realesrgan-ncnn-vulkan-.*\.zip$/iu.test(name)) {
    return installEsrganArchive(paths, sourcePath, name);
  }

  // 3) Real-ESRGAN 散件模型
  const esrganRelative = REAL_ESRGAN_REQUIRED_FILES.find((entry) => entry === `models/${name}` && /\.(bin|param)$/u.test(name));
  if (esrganRelative) {
    return installEsrganLooseFile(paths, sourcePath, name, esrganRelative);
  }

  return {
    fileName: name,
    state: "rejected",
    detail: `不认识这个文件（${byteSize.toLocaleString()} 字节）。收件目录只认 Real-CUGAN 的 .onnx、Real-ESRGAN 的 .zip，以及 models\\ 下的 .bin / .param。`,
  };
}

async function installCuganArtifact(
  paths: UpscalePaths,
  sourcePath: string,
  name: string,
  byteSize: number,
  artifact: UpscaleArtifact,
): Promise<UpscaleDropboxEntry> {
  const targetPath = managedChild(paths.realCuganModelsRoot, artifact.fileName);

  const data = await fs.readFile(sourcePath);
  if (data.length !== artifact.byteSize) {
    return {
      fileName: name,
      state: "rejected",
      detail: `体积 ${data.length} 字节，与 ${artifact.modelId} 期望的 ${artifact.byteSize} 字节不符，可能是下载不完整或不是这个模型。`,
    };
  }
  if (!verifySha256(data, artifact.sha256)) {
    return {
      fileName: name,
      state: "rejected",
      detail: `SHA-256 校验不通过，文件已损坏或被改动过。期望 ${artifact.sha256.slice(0, 12)}…`,
    };
  }

  // 已经装过且内容一致就不重复写盘，保证反复丢同一个文件是幂等的。
  if (await fileMatches(targetPath, data)) {
    return {
      fileName: name,
      state: "already",
      detail: `${artifact.modelId} 已安装，跳过。`,
      targetPath,
      modelId: artifact.modelId,
    };
  }

  await fs.mkdir(paths.realCuganModelsRoot, { recursive: true });
  await atomicWriteFile(targetPath, data);
  return {
    fileName: name,
    state: "installed",
    detail: `已安装 ${artifact.modelId}。`,
    targetPath,
    modelId: artifact.modelId,
  };
}

async function installEsrganArchive(
  paths: UpscalePaths,
  sourcePath: string,
  name: string,
): Promise<UpscaleDropboxEntry> {
  const data = await fs.readFile(sourcePath);
  if (data.length !== REAL_ESRGAN_ARTIFACT.byteSize || !verifySha256(data, REAL_ESRGAN_ARTIFACT.sha256)) {
    return {
      fileName: name,
      state: "rejected",
      detail: `整包 SHA-256 校验不通过，期望 ${REAL_ESRGAN_ARTIFACT.sha256.slice(0, 12)}…（体积应为 ${REAL_ESRGAN_ARTIFACT.byteSize.toLocaleString()} 字节）。`,
    };
  }

  await fs.mkdir(paths.componentsRoot, { recursive: true });
  const suffix = crypto.randomBytes(6).toString("hex");
  const staging = managedChild(paths.componentsRoot, `.upscale-realesrgan-dropbox-${suffix}`);
  const backup = managedChild(paths.componentsRoot, `.upscale-realesrgan-backup-${suffix}`);
  let movedExisting = false;
  try {
    await extractRealEsrganArchive(data, staging);
    await verifyRequiredFiles(staging);
    await writeEsrganManifest(staging, REAL_ESRGAN_ARTIFACT.version, REAL_ESRGAN_ARTIFACT.sha256);

    if (await pathExists(paths.realEsrganRoot)) {
      await fs.rename(paths.realEsrganRoot, backup);
      movedExisting = true;
    }
    await fs.rename(staging, paths.realEsrganRoot);
    if (movedExisting) {
      await fs.rm(backup, { recursive: true, force: true });
    }
    return {
      fileName: name,
      state: "installed",
      detail: "Real-ESRGAN 组件已整包安装。",
      targetPath: paths.realEsrganRoot,
    };
  } catch (error) {
    if (movedExisting && !(await pathExists(paths.realEsrganRoot)) && (await pathExists(backup))) {
      await fs.rename(backup, paths.realEsrganRoot).catch(() => undefined);
    }
    return {
      fileName: name,
      state: "rejected",
      detail: `解压或校验失败：${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(backup, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function installEsrganLooseFile(
  paths: UpscalePaths,
  sourcePath: string,
  name: string,
  relativePath: string,
): Promise<UpscaleDropboxEntry> {
  const targetPath = path.resolve(paths.realEsrganRoot, assertSafeRelativePath(relativePath));
  const data = await fs.readFile(sourcePath);
  if (data.length === 0) {
    return { fileName: name, state: "rejected", detail: "文件是空的。" };
  }

  if (await fileMatches(targetPath, data)) {
    return {
      fileName: name,
      state: "already",
      detail: `${relativePath} 已就位，跳过。`,
      targetPath,
    };
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await atomicWriteFile(targetPath, data);

  // 散件装完后重新判定：12 个必需文件齐了才算可用，并补写清单。
  const ready = await isRealEsrganReady(paths);
  return {
    fileName: name,
    state: "installed",
    detail: ready
      ? `${relativePath} 已就位，Real-ESRGAN 组件现已可用。`
      : `${relativePath} 已就位，还需补齐其余必需文件后才能用。`,
    targetPath,
  };
}

/** 按磁盘上真实存在的文件重建 Real-CUGAN 清单，把校验通过的都登记进去。 */
async function rebuildRealCuganManifest(
  paths: UpscalePaths,
  artifacts: readonly UpscaleArtifact[],
): Promise<void> {
  const installed: Array<Pick<UpscaleArtifact, "modelId" | "fileName" | "byteSize" | "sha256">> = [];
  for (const artifact of artifacts) {
    const filePath = managedChild(paths.realCuganModelsRoot, artifact.fileName);
    const data = await fs.readFile(filePath).catch(() => null);
    if (data && data.length === artifact.byteSize && verifySha256(data, artifact.sha256)) {
      installed.push({
        modelId: artifact.modelId,
        fileName: artifact.fileName,
        byteSize: artifact.byteSize,
        sha256: artifact.sha256,
      });
    }
  }
  const manifest = {
    version: 1 as const,
    installedAt: new Date().toISOString(),
    models: installed,
  };
  await atomicWriteJson(path.join(paths.realCuganRoot, "manifest.json"), manifest);
}

async function listInstalledCuganModels(
  paths: UpscalePaths,
  artifacts: readonly UpscaleArtifact[],
): Promise<UpscaleModelId[]> {
  const ids: UpscaleModelId[] = [];
  for (const artifact of artifacts) {
    const filePath = managedChild(paths.realCuganModelsRoot, artifact.fileName);
    const data = await fs.readFile(filePath).catch(() => null);
    if (data && data.length === artifact.byteSize && verifySha256(data, artifact.sha256)) {
      ids.push(artifact.modelId);
    }
  }
  return ids;
}

/**
 * Real-ESRGAN 是否可用：整包安装看清单比对，散件安装看 12 个必需文件是否齐。
 * 两条路都要走 verifyRequiredFiles，光有清单没有文件不算数。
 */
export async function isRealEsrganReady(paths: UpscalePaths): Promise<boolean> {
  try {
    await verifyRequiredFiles(paths.realEsrganRoot);
    const manifest = await readJson<{ version?: string; archiveSha256?: string; source?: string }>(
      path.join(paths.realEsrganRoot, "manifest.json"),
    );
    if (!manifest) {
      // 文件齐但清单缺失（用户纯手工放的），补一份标记为 manual 的清单。
      await writeEsrganManifest(paths.realEsrganRoot, REAL_ESRGAN_ARTIFACT.version, "manual");
      return true;
    }
    const archiveMatch =
      manifest.version === REAL_ESRGAN_ARTIFACT.version && manifest.archiveSha256 === REAL_ESRGAN_ARTIFACT.sha256;
    return archiveMatch || manifest.source === "manual" || manifest.archiveSha256 === "manual";
  } catch {
    return false;
  }
}

async function writeEsrganManifest(root: string, version: string, archiveSha256: string): Promise<void> {
  await atomicWriteJson(path.join(root, "manifest.json"), {
    version,
    installedAt: new Date().toISOString(),
    archiveSha256,
    source: archiveSha256 === "manual" ? "manual" : "archive",
  });
}

async function verifyRequiredFiles(root: string): Promise<void> {
  for (const relativePath of REAL_ESRGAN_REQUIRED_FILES) {
    const filePath = path.resolve(root, assertSafeRelativePath(relativePath));
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) {
      throw new Error(`缺少 ${relativePath}`);
    }
  }
}

async function extractRealEsrganArchive(archive: Buffer, staging: string): Promise<void> {
  const JSZip = createRequire(__filename)("jszip") as typeof import("jszip");
  const parsed = await JSZip.loadAsync(archive);
  for (const entry of Object.values(parsed.files)) {
    if (entry.dir) continue;
    const unsafeOriginalName = (entry as typeof entry & { unsafeOriginalName?: string }).unsafeOriginalName;
    assertSafeRelativePath(unsafeOriginalName || entry.name);
  }
  await safeExtractZip(archive, staging, extractLimits, async () => parsed);
}

async function fileMatches(filePath: string, data: Buffer): Promise<boolean> {
  const existing = await fs.readFile(filePath).catch(() => null);
  return existing !== null && existing.length === data.length && verifySha256(existing, sha256Hex(data));
}

function sha256Hex(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function atomicWriteFile(filePath: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temp, data, { flag: "wx" });
  await replaceFile(temp, filePath);
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
