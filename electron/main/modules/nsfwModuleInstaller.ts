import { basename } from "node:path";
import { shell } from "electron";
import { dialog } from "../app/fileDialogs";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { logger } from "../appLogger";
import {
  verifySha256,
} from "./componentSecurity";
import {
  COMPONENT_SIGNING_PUBLIC_KEY_PEM,
  NSFW_COMPONENT_ID,
  NSFW_COMPONENT_LIMITS,
  NSFW_COMPONENT_RELEASE_PAGE_URL,
  NSFW_COMPONENT_RELEASE_BASE_URL,
} from "./componentConfig";
import {
  createHttpsArtifactProvider,
  createLocalArtifactProvider,
  defaultZipLoader,
  installComponent,
  MANIFEST_FILE_NAME,
  SIGNATURE_FILE_NAME,
  type InstallProgress,
} from "./componentInstaller";
import {
  getComponentsBaseDir,
  getLocalNsfwModuleRoot,
  getLocalNsfwPlatformDir,
  LOCAL_NSFW_MODEL_RELATIVE_PATH,
  LOCAL_NSFW_MODEL_SHA256,
  LOCAL_NSFW_MODEL_SIZE,
  LOCAL_NSFW_MODULE_ID,
  LOCAL_NSFW_MODULE_VERSION,
  LOCAL_NSFW_PLATFORM,
  LOCAL_NSFW_RUNTIME_PACKAGE,
  LOCAL_NSFW_RUNTIME_VERSION,
} from "../ai/localNsfwPaths";

const NSFW_MODULE_LIMITS = NSFW_COMPONENT_LIMITS;

export async function checkNsfwModuleInstalled(): Promise<boolean> {
  try {
    const current = JSON.parse(await fs.readFile(path.join(getLocalNsfwModuleRoot(), "current.json"), "utf8")) as Partial<{
      version: string;
      platform: string;
    }>;
    if (current.version !== LOCAL_NSFW_MODULE_VERSION || current.platform !== LOCAL_NSFW_PLATFORM) {
      return false;
    }
    const modelPath = path.join(getLocalNsfwPlatformDir(), LOCAL_NSFW_MODEL_RELATIVE_PATH);
    const model = await fs.readFile(modelPath);
    if (model.length !== LOCAL_NSFW_MODEL_SIZE || !verifySha256(model, LOCAL_NSFW_MODEL_SHA256)) {
      return false;
    }
    const packageJsonPath = path.join(getLocalNsfwPlatformDir(), "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const runtimeVersion = packageJson.dependencies?.[LOCAL_NSFW_RUNTIME_PACKAGE];
    if (runtimeVersion !== LOCAL_NSFW_RUNTIME_VERSION) {
      return false;
    }
    const runtimeRequire = createRequire(packageJsonPath);
    runtimeRequire(LOCAL_NSFW_RUNTIME_PACKAGE);
    return true;
  } catch (error) {
    logger.warn("main", "nsfw:installation-check-failed", {
      code: (error as { code?: string }).code ?? "NSFW_COMPONENT_INVALID",
      reason: "模型或运行时缺失、无法读取或加载失败，请重新导入签名离线包。",
    });
    return false;
  }
}

export async function installNsfwModuleFromLocal(): Promise<{ installed: boolean; version?: string; canceled?: boolean }> {
  const picked = await selectLocalNsfwArtifacts();
  if (picked.canceled) {
    return { installed: false, canceled: true };
  }

  const result = await installComponent({
    provider: createLocalArtifactProvider(picked.paths),
    baseComponentsDir: getComponentsBaseDir(),
    publicKeyPem: COMPONENT_SIGNING_PUBLIC_KEY_PEM,
    limits: NSFW_MODULE_LIMITS,
    loadZip: defaultZipLoader,
    expected: {
      componentId: NSFW_COMPONENT_ID,
      version: LOCAL_NSFW_MODULE_VERSION,
      platform: LOCAL_NSFW_PLATFORM,
    },
    selfCheck: (stagingDir) => verifyNsfwPayload(stagingDir),
  });

  await resetNsfwSession();
  return { installed: await checkNsfwModuleInstalled(), version: result.version };
}

/** 离线导入必须同时选择已签名清单、签名和 ZIP，避免导入未验证的运行时代码。 */
async function selectLocalNsfwArtifacts(): Promise<
  | { canceled: true }
  | { canceled: false; paths: { manifestPath: string; signaturePath: string; zipPath: string } }
> {
  const selection = await dialog.showOpenDialog({
    title: "选择 NSFW 模块离线包（需同时选中 manifest.json、manifest.json.sig、nsfw-runtime-win32-x64.zip 三件）",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "NSFW 模块文件", extensions: ["json", "sig", "zip"] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return { canceled: true };
  }

  const paths = resolveLocalNsfwArtifactPaths(selection.filePaths);
  if (!paths) {
    throw new Error(
      "离线包不完整：需同时选择 manifest.json、manifest.json.sig 与 nsfw-runtime-win32-x64.zip 三个文件",
    );
  }
  return { canceled: false, paths };
}

/** 从用户选择的文件中按固定文件名归类出 NSFW 三件套。 */
export function resolveLocalNsfwArtifactPaths(
  files: readonly string[],
): { manifestPath: string; signaturePath: string; zipPath: string } | null {
  const pick = (match: (baseName: string) => boolean) =>
    files.find((file) => match(basename(file).toLowerCase()));
  const manifestPath = pick((baseName) => baseName === MANIFEST_FILE_NAME);
  const signaturePath = pick((baseName) => baseName === SIGNATURE_FILE_NAME);
  const zipPath = pick((baseName) => baseName === "nsfw-runtime-win32-x64.zip");
  if (!manifestPath || !signaturePath || !zipPath) {
    return null;
  }
  return { manifestPath, signaturePath, zipPath };
}

/**
 * 在线下载安装：固定 Release 地址 + Ed25519 清单签名 + ZIP/文件哈希校验。
 * NSFW 组件没有可执行文件，因此使用模型与 ONNX Runtime 自检替代 FFmpeg 自检。
 */
export async function installNsfwModuleFromDownload(
  onProgress?: InstallProgress,
): Promise<{ installed: boolean; version?: string }> {
  if (!NSFW_COMPONENT_RELEASE_BASE_URL || !COMPONENT_SIGNING_PUBLIC_KEY_PEM) {
    throw new Error("本地 NSFW 模块下载未配置（缺少固定 Release 地址或签名公钥）");
  }

  const result = await installComponent({
    provider: createHttpsArtifactProvider(NSFW_COMPONENT_RELEASE_BASE_URL, NSFW_COMPONENT_LIMITS),
    baseComponentsDir: getComponentsBaseDir(),
    publicKeyPem: COMPONENT_SIGNING_PUBLIC_KEY_PEM,
    limits: NSFW_COMPONENT_LIMITS,
    loadZip: defaultZipLoader,
    expected: {
      componentId: LOCAL_NSFW_MODULE_ID,
      version: LOCAL_NSFW_MODULE_VERSION,
      platform: LOCAL_NSFW_PLATFORM,
    },
    selfCheck: (stagingDir) => verifyNsfwPayload(stagingDir),
    onProgress,
  });

  await resetNsfwSession();
  return {
    installed: await checkNsfwModuleInstalled(),
    version: result.version,
  };
}

/** 在系统浏览器打开当前内置版本对应的 NSFW 模块 Release 页面。 */
export async function openNsfwModuleDownloadPage(): Promise<{ opened: true }> {
  await shell.openExternal(NSFW_COMPONENT_RELEASE_PAGE_URL);
  return { opened: true };
}

export async function removeNsfwModule(): Promise<{ removed: boolean }> {
  await resetNsfwSession();
  const moduleRoot = getLocalNsfwModuleRoot();
  try {
    await fs.lstat(moduleRoot);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return { removed: false };
    }
    throw error;
  }

  await removeWithRetry(moduleRoot);
  return { removed: true };
}

/** Windows 上卸载 native onnxruntime 文件时允许杀毒软件/文件索引短暂释放句柄。 */
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

/** 延迟加载分类器，避免模块管理/安装 IPC 在没有使用本地识别时加载 ONNX 运行时。 */
async function resetNsfwSession(): Promise<void> {
  const { resetLocalNsfwSession } = await import("../ai/localNsfwClassifier");
  await resetLocalNsfwSession();
}

async function verifyNsfwPayload(stagingDir: string): Promise<boolean> {
  const modelPath = path.resolve(
    stagingDir,
    LOCAL_NSFW_MODEL_RELATIVE_PATH,
  );
  const model = await fs.readFile(modelPath);
  if (model.length !== LOCAL_NSFW_MODEL_SIZE || !verifySha256(model, LOCAL_NSFW_MODEL_SHA256)) {
    throw new Error("NSFW 模型文件校验失败");
  }
  const packageJsonPath = path.join(stagingDir, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  if (packageJson.dependencies?.[LOCAL_NSFW_RUNTIME_PACKAGE] !== LOCAL_NSFW_RUNTIME_VERSION) {
    throw new Error(`NSFW 运行时清单缺少 ${LOCAL_NSFW_RUNTIME_PACKAGE}@${LOCAL_NSFW_RUNTIME_VERSION}`);
  }
  const runtimeRequire = createRequire(packageJsonPath);
  runtimeRequire("onnxruntime-node");
  return true;
}
