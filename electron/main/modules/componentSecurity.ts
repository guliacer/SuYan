// 按需组件的安全核心：签名校验、哈希校验、Zip-Slip/ZIP-Bomb 防护、原子安装、自检。
// 纯逻辑模块：不导入 electron、加载时无副作用；JSZip 与命令执行均可注入，便于单元测试。
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type ComponentExtractLimits,
  type ComponentFileEntry,
  type ComponentManifest,
} from "./componentConfig";

/** current.json 内容：记录某组件当前启用的版本与平台。 */
export type CurrentComponent = {
  version: string;
  platform: string;
  installedAt: string;
};

/** safeExtractZip 需要的最小 ZIP 抽象，避免直接耦合 JSZip 的导出细节。 */
export type SafeZipEntry = {
  name: string;
  dir: boolean;
  async: (type: "nodebuffer") => Promise<Buffer>;
};

export type SafeZipArchive = { files: Record<string, SafeZipEntry> };

export type ZipArchiveLoader = (data: Buffer) => Promise<SafeZipArchive>;

/** 自检命令执行抽象：默认用 execFile（数组传参，绝不拼接 shell），测试可注入假实现。 */
export type CommandRunner = (
  exePath: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string; code: number | null }>;

/** 计算 SHA-256（小写十六进制）。 */
export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
/** 恒定时间比较 SHA-256；长度不符直接判否，避免抛异常与计时侧信道。 */
export function verifySha256(data: Buffer, expectedHex: string): boolean {
  const actual = Buffer.from(sha256Hex(data), "hex");
  const expected = Buffer.from(expectedHex.trim().toLowerCase(), "hex");
  if (actual.length !== expected.length || expected.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

/** 用内置 Ed25519 公钥校验签名；公钥为空时 fail-closed（拒绝一切）。 */
export function verifyEd25519Signature(
  data: Buffer,
  signature: Buffer,
  publicKeyPem: string,
): boolean {
  if (!publicKeyPem || publicKeyPem.trim().length === 0) {
    return false;
  }
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, data, key, signature);
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseFileEntry(value: unknown, context: string): ComponentFileEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`清单 ${context} 不是对象`);
  }
  const entry = value as Record<string, unknown>;
  if (!isNonEmptyString(entry.name)) throw new Error(`清单 ${context}.name 无效`);
  if (!isNonEmptyString(entry.sha256)) throw new Error(`清单 ${context}.sha256 无效`);
  if (typeof entry.size !== "number" || !Number.isInteger(entry.size) || entry.size < 0) {
    throw new Error(`清单 ${context}.size 无效`);
  }
  return { name: entry.name, sha256: entry.sha256.toLowerCase(), size: entry.size };
}
/** 解析并强校验组件清单结构；字段缺失/类型错误即抛错（边界校验）。 */
export function parseComponentManifest(raw: string | Buffer): ComponentManifest {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!isNonEmptyString(parsed.componentId)) throw new Error("清单 componentId 无效");
  if (!isNonEmptyString(parsed.version)) throw new Error("清单 version 无效");
  if (!isNonEmptyString(parsed.platform)) throw new Error("清单 platform 无效");
  const archive = parseFileEntry(parsed.archive, "archive");
  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error("清单 files 为空");
  }
  const files = parsed.files.map((file, index) => parseFileEntry(file, `files[${index}]`));
  const manifest: ComponentManifest = {
    componentId: parsed.componentId,
    version: parsed.version,
    platform: parsed.platform,
    archive,
    files,
  };
  if (isNonEmptyString(parsed.createdAt)) {
    manifest.createdAt = parsed.createdAt;
  }
  return manifest;
}

/** 校验 ZIP 条目相对路径，阻断 Zip-Slip：拒绝绝对路径、盘符、`..` 段。返回规范化相对路径。 */
export function assertSafeRelativePath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, "/").trim();
  if (normalized.length === 0) throw new Error("ZIP 条目路径为空");
  if (normalized.startsWith("/")) throw new Error(`ZIP 条目为绝对路径: ${entryName}`);
  if (/^[a-zA-Z]:/.test(normalized)) throw new Error(`ZIP 条目含盘符: ${entryName}`);
  const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`ZIP 条目包含路径穿越: ${entryName}`);
  }
  if (segments.length === 0) throw new Error(`ZIP 条目路径无效: ${entryName}`);
  return segments.join("/");
}
/** 解压 ZIP 到 destDir，防 Zip-Slip 与 ZIP-Bomb（条目数/单条目/总解压上限）。返回写入的相对路径。 */
export async function safeExtractZip(
  zipBuffer: Buffer,
  destDir: string,
  limits: ComponentExtractLimits,
  loadZip: ZipArchiveLoader,
): Promise<{ files: string[]; totalBytes: number }> {
  if (zipBuffer.length > limits.maxArchiveBytes) {
    throw new Error(`ZIP 体积超过上限: ${zipBuffer.length} > ${limits.maxArchiveBytes}`);
  }
  const archive = await loadZip(zipBuffer);
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  if (entries.length > limits.maxEntries) {
    throw new Error(`ZIP 条目数超过上限: ${entries.length} > ${limits.maxEntries}`);
  }
  const destResolved = path.resolve(destDir);
  await fs.mkdir(destResolved, { recursive: true });
  const written: string[] = [];
  const exactPaths = new Set<string>();
  const foldedPaths = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries) {
    const relativePath = assertSafeRelativePath(entry.name);
    const foldedPath = relativePath.toLowerCase();
    if (exactPaths.has(relativePath) || foldedPaths.has(foldedPath)) {
      throw new Error(`ZIP 条目路径重复或大小写冲突: ${entry.name}`);
    }
    exactPaths.add(relativePath);
    foldedPaths.add(foldedPath);
    const permissions = entry as SafeZipEntry & { unixPermissions?: number };
    if (((permissions.unixPermissions ?? 0) & 0o170000) === 0o120000) {
      throw new Error(`ZIP 条目为符号链接: ${entry.name}`);
    }
    const target = path.resolve(destResolved, relativePath);
    if (target !== destResolved && !target.startsWith(destResolved + path.sep)) {
      throw new Error(`ZIP 条目逃逸目标目录: ${entry.name}`);
    }
    const content = await entry.async("nodebuffer");
    if (content.length > limits.maxEntryBytes) {
      throw new Error(`ZIP 条目超过单文件上限: ${entry.name}`);
    }
    totalBytes += content.length;
    if (totalBytes > limits.maxTotalUncompressedBytes) {
      throw new Error("ZIP 解压总量超过上限");
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    written.push(relativePath);
  }
  return { files: written, totalBytes };
}
/** 逐个校验解压后的文件大小与 SHA-256，与已验签清单比对；缺失或不符即抛错。 */
export async function verifyExtractedFiles(
  destDir: string,
  files: ComponentFileEntry[],
): Promise<void> {
  for (const file of files) {
    const relativePath = assertSafeRelativePath(file.name);
    const target = path.resolve(destDir, relativePath);
    const content = await fs.readFile(target);
    if (content.length !== file.size) {
      throw new Error(`文件大小不符: ${file.name}`);
    }
    if (!verifySha256(content, file.sha256)) {
      throw new Error(`文件 SHA-256 不符: ${file.name}`);
    }
  }
}

/** 组件某版本某平台的安装目录：<base>/<componentId>/<version>/<platform>。 */
export function getComponentPlatformDir(
  baseComponentsDir: string,
  componentId: string,
  version: string,
  platform: string,
): string {
  return path.join(baseComponentsDir, componentId, version, platform);
}

function currentComponentPath(baseComponentsDir: string, componentId: string): string {
  return path.join(baseComponentsDir, componentId, "current.json");
}
/** 读取 current.json；缺失或格式非法时返回 null（视为未安装）。 */
export async function readCurrentComponent(
  baseComponentsDir: string,
  componentId: string,
): Promise<CurrentComponent | null> {
  let text: string;
  try {
    text = await fs.readFile(currentComponentPath(baseComponentsDir, componentId), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!isNonEmptyString(parsed.version) || !isNonEmptyString(parsed.platform)) {
      return null;
    }
    return {
      version: parsed.version,
      platform: parsed.platform,
      installedAt: isNonEmptyString(parsed.installedAt) ? parsed.installedAt : "",
    };
  } catch {
    return null;
  }
}

/** 原子写入 current.json（先写临时文件再 rename）。 */
export async function writeCurrentComponent(
  baseComponentsDir: string,
  componentId: string,
  current: CurrentComponent,
): Promise<void> {
  const target = currentComponentPath(baseComponentsDir, componentId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(temp, JSON.stringify(current, null, 2), "utf8");
  await fs.rename(temp, target);
}
/** 在 Windows 上，刚自检执行过的 exe 可能被杀软/系统短暂占用镜像句柄，令紧随其后的 rename 报
 *  EPERM/EACCES/EBUSY。对这类瞬时占用做有限次退避重试；其它错误立即抛出。 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const transientCodes = new Set(["EPERM", "EACCES", "EBUSY"]);
  const backoffMs = [50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(from, to);
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

/** 原子安装：将暂存目录提升为最终版本目录。同卷 rename 保证原子；已存在先清理。 */
export async function promoteComponentDir(stagingDir: string, finalDir: string): Promise<void> {
  await fs.mkdir(path.dirname(finalDir), { recursive: true });
  await fs.rm(finalDir, { recursive: true, force: true });
  await renameWithRetry(stagingDir, finalDir);
}

const defaultCommandRunner: CommandRunner = (exePath, args) =>
  new Promise((resolve) => {
    execFile(
      exePath,
      args,
      { timeout: 15_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const rawCode = (error as { code?: number | string }).code;
          resolve({
            stdout: String(stdout),
            stderr: String(stderr),
            code: typeof rawCode === "number" ? rawCode : 1,
          });
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr), code: 0 });
      },
    );
  });

/** 自检：执行 `<ffmpeg> -version`，命令成功且输出含版本标识才通过；命令执行可注入。 */
export async function selfCheckFfmpeg(
  exePath: string,
  runner: CommandRunner = defaultCommandRunner,
): Promise<boolean> {
  try {
    const { stdout, code } = await runner(exePath, ["-version"]);
    return code === 0 && /ffmpeg version/i.test(stdout);
  } catch {
    return false;
  }
}
