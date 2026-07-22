import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import https from "node:https";
import { dialog } from "electron";
import type { BuiltinModuleId } from "../../../src/features/library/utils/moduleRegistry";
import { getModuleRuntimeDependencies, getBuiltinModuleDefinition } from "../../../src/features/library/utils/moduleRegistry";

export type ModuleInstallProgress = {
  moduleId: string;
  phase: "downloading" | "extracting" | "verifying" | "done" | "failed";
  bytesDownloaded: number;
  totalBytes: number;
  message: string;
};

type InstallProgressCallback = (progress: ModuleInstallProgress) => void;

const GITHUB_MODULE_VERSION = "v1.0.0";
const GITHUB_REPO_NAME = "prompt-library-modules";

export async function checkModuleInstalled(moduleId: BuiltinModuleId): Promise<boolean> {
  const runtimeDeps = getModuleRuntimeDependencies(moduleId);
  if (runtimeDeps.length === 0) {
    return true;
  }

  for (const depId of runtimeDeps) {
    const isAvailable = await checkRuntimeDependencyAvailable(depId);
    if (!isAvailable) {
      return false;
    }
  }

  return true;
}

export async function installModuleFromLocal(
  moduleId: BuiltinModuleId,
  onProgress?: InstallProgressCallback,
): Promise<boolean> {
  onProgress?.({
    moduleId,
    phase: "verifying",
    bytesDownloaded: 0,
    totalBytes: 0,
    message: "请选择本地模块安装包...",
  });

  const result = await dialog.showOpenDialog({
    title: `选择 ${getBuiltinModuleDefinition(moduleId).label} 模块安装包`,
    properties: ["openFile"],
    filters: [{ name: "模块安装包", extensions: ["zip"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    onProgress?.({
      moduleId,
      phase: "failed",
      bytesDownloaded: 0,
      totalBytes: 0,
      message: "已取消选择安装包",
    });
    return false;
  }

  const zipPath = result.filePaths[0];
  const runtimeDeps = getModuleRuntimeDependencies(moduleId);

  try {
    onProgress?.({
      moduleId,
      phase: "extracting",
      bytesDownloaded: 0,
      totalBytes: 0,
      message: "正在读取模块包...",
    });

    const zipBuffer = await fs.readFile(zipPath);

    if (runtimeDeps.length > 0) {
      onProgress?.({
        moduleId,
        phase: "extracting",
        bytesDownloaded: zipBuffer.length,
        totalBytes: zipBuffer.length,
        message: "正在解压模块包...",
      });

      await extractModuleZip(zipBuffer);
      await clearRequireCacheForModule(moduleId);
    }

    onProgress?.({
      moduleId,
      phase: "verifying",
      bytesDownloaded: zipBuffer.length,
      totalBytes: zipBuffer.length,
      message: "正在校验依赖...",
    });

    const installed = await checkModuleInstalled(moduleId);

    if (!installed) {
      onProgress?.({
        moduleId,
        phase: "failed",
        bytesDownloaded: zipBuffer.length,
        totalBytes: zipBuffer.length,
        message: "依赖校验失败，模块包可能不完整",
      });
      return false;
    }

    onProgress?.({
      moduleId,
      phase: "done",
      bytesDownloaded: zipBuffer.length,
      totalBytes: zipBuffer.length,
      message: "模块安装成功",
    });

    return true;
  } catch (error) {
    onProgress?.({
      moduleId,
      phase: "failed",
      bytesDownloaded: 0,
      totalBytes: 0,
      message: `安装失败：${error instanceof Error ? error.message : String(error)}`,
    });
    return false;
  }
}

export async function installModuleFromGithub(
  moduleId: BuiltinModuleId,
  githubOwner: string,
  onProgress?: InstallProgressCallback,
): Promise<boolean> {
  if (!githubOwner) {
    onProgress?.({
      moduleId,
      phase: "failed",
      bytesDownloaded: 0,
      totalBytes: 0,
      message: "未配置 GitHub 仓库 owner",
    });
    return false;
  }

  const zipUrl = `https://github.com/${githubOwner}/${GITHUB_REPO_NAME}/releases/download/${GITHUB_MODULE_VERSION}/${moduleId}-windows-x64.zip`;

  try {
    const zipBuffer = await downloadZip(zipUrl, moduleId, onProgress);
    onProgress?.({
      moduleId,
      phase: "extracting",
      bytesDownloaded: zipBuffer.length,
      totalBytes: zipBuffer.length,
      message: "正在解压模块包...",
    });

    await extractModuleZip(zipBuffer);
    await clearRequireCacheForModule(moduleId);

    onProgress?.({
      moduleId,
      phase: "verifying",
      bytesDownloaded: zipBuffer.length,
      totalBytes: zipBuffer.length,
      message: "正在校验依赖...",
    });

    const installed = await checkModuleInstalled(moduleId);

    if (!installed) {
      onProgress?.({
        moduleId,
        phase: "failed",
        bytesDownloaded: zipBuffer.length,
        totalBytes: zipBuffer.length,
        message: "依赖校验失败",
      });
      return false;
    }

    onProgress?.({
      moduleId,
      phase: "done",
      bytesDownloaded: zipBuffer.length,
      totalBytes: zipBuffer.length,
      message: "模块安装成功",
    });

    return true;
  } catch (error) {
    onProgress?.({
      moduleId,
      phase: "failed",
      bytesDownloaded: 0,
      totalBytes: 0,
      message: `安装失败：${error instanceof Error ? error.message : String(error)}`,
    });
    return false;
  }
}

async function checkRuntimeDependencyAvailable(runtimeModuleId: BuiltinModuleId): Promise<boolean> {
  if (runtimeModuleId === "video-runtime") {
    const { getFfmpegPath } = await import("../runtime/videoRuntime");
    return getFfmpegPath() !== null;
  }

  if (runtimeModuleId === "image-runtime") {
    const { isSharpAvailable } = await import("../runtime/imageRuntime");
    return isSharpAvailable();
  }

  return true;
}

async function downloadZip(
  url: string,
  moduleId: string,
  onProgress?: InstallProgressCallback,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let downloadedBytes = 0;

    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error("GitHub 重定向缺少 location 头"));
          return;
        }
        downloadZip(redirectUrl, moduleId, onProgress).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`GitHub 下载失败：HTTP ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers["content-length"] ?? "0", 10) || 0;

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        downloadedBytes += chunk.length;
        onProgress?.({
          moduleId,
          phase: "downloading",
          bytesDownloaded: downloadedBytes,
          totalBytes,
          message: "正在下载模块包...",
        });
      });

      response.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      response.on("error", reject);
    });

    request.on("error", reject);
  });
}

type ModulePackageManifest = {
  moduleId: string;
  version: string;
  runtimeDependencies: string[];
};

async function extractModuleZip(zipBuffer: Buffer): Promise<ModulePackageManifest | null> {
  const vendorDir = path.join(process.resourcesPath, "vendor");
  const vendorNodeModulesDir = path.join(vendorDir, "node_modules");

  await fs.mkdir(vendorNodeModulesDir, { recursive: true });

  const jszip = await loadJszip();
  const zip = await jszip.loadAsync(zipBuffer);

  let manifest: ModulePackageManifest | null = null;
  const manifestFile = zip.file("module.json");
  if (manifestFile) {
    manifest = JSON.parse(await manifestFile.async("string")) as ModulePackageManifest;
  }

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;

    const entryPath = path.normalize(entry.name).replace(/^[/\\]+/, "");

    if (entryPath === "module.json") continue;

    if (entryPath.startsWith("node_modules/")) {
      const targetPath = path.join(vendorDir, entryPath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const content = await entry.async("nodebuffer");
      await fs.writeFile(targetPath, content);
    }
  }

  return manifest;
}

async function loadJszip(): Promise<typeof import("jszip")> {
  const runtimeRequire = createRequire(__filename);
  try {
    return runtimeRequire("jszip");
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    return vendorRequire("jszip");
  }
}

async function clearRequireCacheForModule(moduleId: BuiltinModuleId): Promise<void> {
  const runtimeDeps = getModuleRuntimeDependencies(moduleId);

  for (const depId of runtimeDeps) {
    if (depId === "video-runtime") {
      const { getFfmpegPath } = await import("../runtime/videoRuntime");
      getFfmpegPath();
    }
  }
}
