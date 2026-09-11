// FFmpeg 等按需组件的安全安装编排：验签 → 校验 ZIP → 安全解压 → 校验文件 → 自检 → 原子提升 → 写 current.json。
// 核心 installComponent 全部依赖可注入，便于单测；生产包装器懒加载 electron，保持模块可被测试导入。
import crypto from "node:crypto";
import fs from "node:fs/promises";
import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import {
  COMPONENT_RELEASE_BASE_URL,
  COMPONENT_SIGNING_PUBLIC_KEY_PEM,
  CURRENT_COMPONENT_PLATFORM,
  DEFAULT_COMPONENT_LIMITS,
  FFMPEG_COMPONENT_ID,
  FFMPEG_COMPONENT_VERSION,
  FFMPEG_EXECUTABLE_NAME,
  type ComponentExtractLimits,
} from "./componentConfig";
import {
  getComponentPlatformDir,
  parseComponentManifest,
  promoteComponentDir,
  safeExtractZip,
  selfCheckFfmpeg,
  verifyEd25519Signature,
  verifyExtractedFiles,
  verifySha256,
  writeCurrentComponent,
  type CommandRunner,
  type ZipArchiveLoader,
} from "./componentSecurity";

export const MANIFEST_FILE_NAME = "manifest.json";
export const SIGNATURE_FILE_NAME = "manifest.json.sig";

export type ComponentArtifactProvider = {
  fetchManifest: () => Promise<Buffer>;
  fetchSignature: () => Promise<Buffer>;
  fetchArchive: (archiveName: string) => Promise<Buffer>;
};

export type InstallPhase = "verifying" | "downloading" | "extracting" | "self-check" | "done";
export type InstallProgress = (phase: InstallPhase, message: string) => void;
export type InstallComponentDeps = {
  provider: ComponentArtifactProvider;
  baseComponentsDir: string;
  publicKeyPem: string;
  limits: ComponentExtractLimits;
  loadZip: ZipArchiveLoader;
  expected: { componentId: string; version: string; platform: string; exeName?: string };
  selfCheckRunner?: CommandRunner;
  /** 非可执行组件（例如 NSFW 模型）可提供自己的暂存目录自检。 */
  selfCheck?: (stagingDir: string) => Promise<boolean>;
  onProgress?: InstallProgress;
};

export type InstallComponentResult = { installedDir: string; version: string; platform: string };

/** 安全安装编排核心：全部依赖可注入。任一步失败都会清理暂存目录，不影响已安装旧版本（天然回滚）。 */
export async function installComponent(deps: InstallComponentDeps): Promise<InstallComponentResult> {
  const { provider, baseComponentsDir, publicKeyPem, limits, loadZip, expected, onProgress } = deps;

  onProgress?.("verifying", "校验清单签名...");
  const manifestBytes = await provider.fetchManifest();
  const signatureBytes = await provider.fetchSignature();
  if (!verifyEd25519Signature(manifestBytes, signatureBytes, publicKeyPem)) {
    throw new Error("组件清单签名校验失败");
  }
  const manifest = parseComponentManifest(manifestBytes);
  if (manifest.componentId !== expected.componentId) throw new Error("组件 ID 不匹配");
  if (manifest.platform !== expected.platform) throw new Error("组件平台不匹配");
  if (manifest.version !== expected.version) throw new Error("组件版本不匹配");

  onProgress?.("downloading", "下载组件包...");
  const archiveBytes = await provider.fetchArchive(manifest.archive.name);
  if (archiveBytes.length !== manifest.archive.size) throw new Error("组件包大小不符");
  if (!verifySha256(archiveBytes, manifest.archive.sha256)) throw new Error("组件包 SHA-256 不符");

  const componentRoot = path.join(baseComponentsDir, expected.componentId);
  const stagingDir = path.join(componentRoot, `.staging-${crypto.randomBytes(6).toString("hex")}`);
  try {
    onProgress?.("extracting", "解压并校验组件...");
    await safeExtractZip(archiveBytes, stagingDir, limits, loadZip);
    await verifyExtractedFiles(stagingDir, manifest.files);

    onProgress?.("self-check", "运行自检...");
    const selfCheckPassed = deps.selfCheck
      ? await deps.selfCheck(stagingDir)
      : expected.exeName
        ? await selfCheckFfmpeg(path.join(stagingDir, expected.exeName), deps.selfCheckRunner)
        : false;
    if (!selfCheckPassed) {
      throw new Error("组件自检失败");
    }
    const finalDir = getComponentPlatformDir(
      baseComponentsDir,
      expected.componentId,
      manifest.version,
      manifest.platform,
    );
    await promoteComponentDir(stagingDir, finalDir);
    await writeCurrentComponent(baseComponentsDir, expected.componentId, {
      version: manifest.version,
      platform: manifest.platform,
      installedAt: new Date().toISOString(),
    });
    onProgress?.("done", "组件安装完成");
    return { installedDir: finalDir, version: manifest.version, platform: manifest.platform };
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function downloadBuffer(url: string, limitBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode ?? 0;
      if (status === 301 || status === 302 || status === 307 || status === 308) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          reject(new Error("重定向缺少 location 头"));
          return;
        }
        downloadBuffer(location, limitBytes).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`下载失败：HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > limitBytes) {
          request.destroy();
          reject(new Error("下载超过体积上限"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
  });
}

function joinUrl(baseUrl: string, name: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${name}`;
}

/** 生产下载源：从固定内置 Release 基址拉取清单/签名/组件包，均带体积上限。 */
export function createHttpsArtifactProvider(
  baseUrl: string,
  limits: ComponentExtractLimits,
): ComponentArtifactProvider {
  return {
    fetchManifest: () => downloadBuffer(joinUrl(baseUrl, MANIFEST_FILE_NAME), 1024 * 1024),
    fetchSignature: () => downloadBuffer(joinUrl(baseUrl, SIGNATURE_FILE_NAME), 64 * 1024),
    fetchArchive: (archiveName) => downloadBuffer(joinUrl(baseUrl, archiveName), limits.maxArchiveBytes),
  };
}

/** 离线导入源：从用户选择的本地文件读取清单/签名/组件包。 */
export function createLocalArtifactProvider(paths: {
  manifestPath: string;
  signaturePath: string;
  zipPath: string;
}): ComponentArtifactProvider {
  return {
    fetchManifest: () => fs.readFile(paths.manifestPath),
    fetchSignature: () => fs.readFile(paths.signaturePath),
    fetchArchive: () => fs.readFile(paths.zipPath),
  };
}
/** 生产用 JSZip 加载器：优先常规 require，回退到 vendor/package.cjs。 */
export const defaultZipLoader: ZipArchiveLoader = async (data) => {
  const runtimeRequire = createRequire(__filename);
  let jszipModule: typeof import("jszip");
  try {
    jszipModule = runtimeRequire("jszip");
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    jszipModule = vendorRequire("jszip");
  }
  return jszipModule.loadAsync(data);
};

function getElectronComponentsBaseDir(): string {
  const runtimeRequire = createRequire(__filename);
  const electron = runtimeRequire("electron") as { app: { getPath: (name: string) => string } };
  return path.join(electron.app.getPath("userData"), "components");
}

const FFMPEG_EXPECTED = {
  componentId: FFMPEG_COMPONENT_ID,
  version: FFMPEG_COMPONENT_VERSION,
  platform: CURRENT_COMPONENT_PLATFORM,
  exeName: FFMPEG_EXECUTABLE_NAME,
};

/**
 * 仅定位应用受管的 FFmpeg 组件根目录。组件 ID 是内置常量，且必须是 components 的直接子目录，
 * 防止删除逻辑因路径拼接或未来调用方变化而越出 userData/components。
 */
function getManagedFfmpegComponentRoot(baseComponentsDir: string): string {
  const baseDir = path.resolve(baseComponentsDir);
  const componentRoot = path.resolve(baseDir, FFMPEG_COMPONENT_ID);
  if (path.dirname(componentRoot) !== baseDir) {
    throw new Error("FFmpeg 组件目录不在受管 components 目录内");
  }
  return componentRoot;
}

async function removeWithRetry(target: string): Promise<void> {
  const transientCodes = new Set(["EPERM", "EACCES", "EBUSY"]);
  const backoffMs = [50, 100, 200, 400, 800];

  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= backoffMs.length || !code || !transientCodes.has(code)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
    }
  }
}

/**
 * 删除指定 userData/components 根目录下受管的 FFmpeg。不会解析或触碰系统 PATH 中的 FFmpeg。
 * 导出纯路径入口便于单测；生产调用应使用 removeInstalledFfmpegComponent。
 */
export async function removeFfmpegComponentFromBaseDir(baseComponentsDir: string): Promise<boolean> {
  const componentRoot = getManagedFfmpegComponentRoot(baseComponentsDir);
  try {
    await fs.lstat(componentRoot);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return false;
    }
    throw error;
  }

  await removeWithRetry(componentRoot);
  return true;
}

/** 生产删除入口：只删除 app userData 下由素言安装的 FFmpeg 组件。 */
export async function removeInstalledFfmpegComponent(): Promise<{ removed: boolean }> {
  return { removed: await removeFfmpegComponentFromBaseDir(getElectronComponentsBaseDir()) };
}

/** 生产入口（下载）：固定 URL/公钥来自 componentConfig；未配置时 fail-closed 拒绝。 */
export async function installFfmpegFromDownload(
  onProgress?: InstallProgress,
): Promise<InstallComponentResult> {
  if (!COMPONENT_RELEASE_BASE_URL || !COMPONENT_SIGNING_PUBLIC_KEY_PEM) {
    throw new Error("按需组件下载未配置（缺少固定 Release 地址或签名公钥），已 fail-closed 拒绝");
  }
  return installComponent({
    provider: createHttpsArtifactProvider(COMPONENT_RELEASE_BASE_URL, DEFAULT_COMPONENT_LIMITS),
    baseComponentsDir: getElectronComponentsBaseDir(),
    publicKeyPem: COMPONENT_SIGNING_PUBLIC_KEY_PEM,
    limits: DEFAULT_COMPONENT_LIMITS,
    loadZip: defaultZipLoader,
    expected: FFMPEG_EXPECTED,
    onProgress,
  });
}

/** 生产入口（离线导入）：从本地文件安装；未配置公钥时 fail-closed 拒绝。 */
export async function installFfmpegFromLocal(
  paths: { manifestPath: string; signaturePath: string; zipPath: string },
  onProgress?: InstallProgress,
): Promise<InstallComponentResult> {
  if (!COMPONENT_SIGNING_PUBLIC_KEY_PEM) {
    throw new Error("离线安装未配置签名公钥，已 fail-closed 拒绝");
  }
  return installComponent({
    provider: createLocalArtifactProvider(paths),
    baseComponentsDir: getElectronComponentsBaseDir(),
    publicKeyPem: COMPONENT_SIGNING_PUBLIC_KEY_PEM,
    limits: DEFAULT_COMPONENT_LIMITS,
    loadZip: defaultZipLoader,
    expected: FFMPEG_EXPECTED,
    onProgress,
  });
}
