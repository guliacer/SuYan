import type { PromptGithubFile, PromptGithubProject, PromptGithubRelease, PromptGithubReleaseAsset } from "../../../src/features/prompts/types";
import { parseGithubRepositoryUrl } from "../../../src/features/prompts/utils/githubProject";
import { AppError } from "../ipc/errors";

const githubApiBase = "https://api.github.com";
const requestTimeoutMs = 20_000;
const maxJsonBytes = 8 * 1024 * 1024;
const maxReadmeChars = 1_000_000;
const maxFileCount = 2_500;
const maxReleaseCount = 30;
const maxReleaseAssetCount = 100;
const maxReleaseBodyChars = 200_000;

type JsonRecord = Record<string, unknown>;

/** 在主进程使用 Electron 网络栈，测试环境回退到全局 fetch。 */
async function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (process.env.NODE_ENV === "test") return globalThis.fetch(input, init);
  try {
    const electron = require("electron") as { net?: { fetch?: typeof fetch } } | undefined;
    if (typeof electron?.net?.fetch === "function") return electron.net.fetch(input, init);
  } catch {
    // 纯 Node 环境没有 Electron 时使用全局 fetch。
  }
  return globalThis.fetch(input, init);
}

export async function fetchGithubProject(input: string): Promise<PromptGithubProject> {
  const ref = parseGithubRepositoryUrl(input);
  if (!ref) throw new AppError("GITHUB_PROJECT_URL_INVALID", "请输入 GitHub 仓库根地址，例如 https://github.com/用户/项目。");

  const encodedRepository = `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}`;
  const repositoryData = await fetchGithubJson(
    `${githubApiBase}/repos/${encodedRepository}`,
    "项目",
  );
  const fullName = readText(repositoryData.full_name) || `${ref.owner}/${ref.repository}`;
  const owner = readText((repositoryData.owner as JsonRecord | undefined)?.login) || ref.owner;
  const repository = readText(repositoryData.name) || ref.repository;
  const name = readText(repositoryData.name) || repository;
  const defaultBranch = readText(repositoryData.default_branch) || "main";

  const readmeData = await fetchGithubJson(
    `${githubApiBase}/repos/${encodedRepository}/readme`,
    "README",
  );
  const readmeContent = decodeReadmeContent(readmeData);
  if (!readmeContent.trim()) throw new AppError("GITHUB_PROJECT_README_EMPTY", "这个 GitHub 项目的 README 为空，无法创建灵感卡片。");
  if (readmeContent.length > maxReadmeChars) throw new AppError("GITHUB_PROJECT_README_TOO_LARGE", "README 内容过大，暂时无法创建灵感卡片。");

  const treeData = await fetchGithubJson(
    `${githubApiBase}/repos/${encodedRepository}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    "项目文件",
  );
  const files = normalizeGithubTree(treeData.tree, fullName, defaultBranch);
  const apiTruncated = treeData.truncated === true;
  const treeTruncated = apiTruncated || Array.isArray(treeData.tree) && treeData.tree.length > maxFileCount;
  let releases: PromptGithubRelease[] = [];
  try {
    const releasesData = await fetchGithubJsonArray(
      `${githubApiBase}/repos/${encodedRepository}/releases?per_page=${maxReleaseCount}`,
      "Releases",
    );
    releases = normalizeGithubReleases(releasesData);
  } catch {
    // Releases 是详情页的增强信息；接口暂时不可用时仍允许导入 README 和仓库信息。
  }

  const project: PromptGithubProject = {
    owner,
    repository,
    fullName,
    name,
    url: ref.url,
    releasesUrl: `https://github.com/${fullName}/releases`,
    defaultBranch,
    readmeName: readText(readmeData.path) || readText(readmeData.name) || "README.md",
    readmeContent,
    files,
    releases,
    ...(treeTruncated ? { treeTruncated: true } : {}),
    readmeCollapsed: false,
  };
  return project;
}

async function fetchGithubJson(url: string, resourceLabel: string): Promise<JsonRecord> {
  const parsed = await fetchGithubJsonPayload(url, resourceLabel);
  if (!isRecord(parsed)) throw new AppError("GITHUB_PROJECT_RESPONSE_INVALID", `GitHub 返回的${resourceLabel}数据无效。`);
  return parsed;
}

async function fetchGithubJsonArray(url: string, resourceLabel: string): Promise<JsonRecord[]> {
  const parsed = await fetchGithubJsonPayload(url, resourceLabel);
  if (!Array.isArray(parsed)) throw new AppError("GITHUB_PROJECT_RESPONSE_INVALID", `GitHub 返回的${resourceLabel}数据无效。`);
  return parsed.filter(isRecord);
}

async function fetchGithubJsonPayload(url: string, resourceLabel: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await platformFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SuYan-Inspiration-Library",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throwGithubHttpError(response.status, resourceLabel);
    const text = await readResponseText(response, maxJsonBytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AppError("GITHUB_PROJECT_RESPONSE_INVALID", `GitHub 返回的${resourceLabel}数据无效。`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AppError("GITHUB_PROJECT_TIMEOUT", `读取 GitHub ${resourceLabel}超时，请检查网络后重试。`);
    throw new AppError("GITHUB_PROJECT_NETWORK_ERROR", `无法读取 GitHub ${resourceLabel}，请检查网络或代理设置。`);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeGithubReleases(input: JsonRecord[]): PromptGithubRelease[] {
  return input.slice(0, maxReleaseCount).map((release): PromptGithubRelease | null => {
    const id = readText(release.id) || (typeof release.id === "number" && Number.isFinite(release.id) ? String(Math.floor(release.id)) : "");
    const tagName = readText(release.tag_name);
    const htmlUrl = readText(release.html_url);
    if (!id || !tagName || !isGithubUrl(htmlUrl)) return null;
    const name = readText(release.name) || tagName;
    const assets = Array.isArray(release.assets)
      ? release.assets.filter(isRecord).slice(0, maxReleaseAssetCount).map((asset) => normalizeGithubReleaseAsset(asset, htmlUrl)).filter((asset): asset is PromptGithubReleaseAsset => Boolean(asset))
      : [];
    return {
      id,
      tagName,
      name,
      body: readText(release.body).slice(0, maxReleaseBodyChars),
      htmlUrl,
      ...(readIsoDate(release.published_at) ? { publishedAt: readIsoDate(release.published_at) } : {}),
      ...(readIsoDate(release.created_at) ? { createdAt: readIsoDate(release.created_at) } : {}),
      prerelease: release.prerelease === true,
      draft: release.draft === true,
      assets,
    };
  }).filter((release): release is PromptGithubRelease => Boolean(release));
}

function normalizeGithubReleaseAsset(input: JsonRecord, releaseHtmlUrl: string): PromptGithubReleaseAsset | null {
  const name = readText(input.name);
  const downloadUrl = readText(input.browser_download_url);
  const htmlUrl = isGithubUrl(readText(input.html_url)) ? readText(input.html_url) : releaseHtmlUrl;
  if (!name || !isGithubUrl(downloadUrl)) return null;
  const size = typeof input.size === "number" && Number.isFinite(input.size) && input.size >= 0 ? Math.floor(input.size) : undefined;
  const downloadCount = typeof input.download_count === "number" && Number.isFinite(input.download_count) && input.download_count >= 0 ? Math.floor(input.download_count) : undefined;
  return {
    name,
    ...(readText(input.label) ? { label: readText(input.label) } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(downloadCount !== undefined ? { downloadCount } : {}),
    ...(readText(input.content_type) ? { contentType: readText(input.content_type) } : {}),
    htmlUrl,
    downloadUrl,
  };
}

function readIsoDate(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value && Number.isFinite(Date.parse(value)) ? value.slice(0, 80) : undefined;
}

function isGithubUrl(input: string): boolean {
  if (!input) return false;
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && (hostname === "github.com" || hostname === "raw.githubusercontent.com");
  } catch {
    return false;
  }
}

function throwGithubHttpError(status: number, resourceLabel: string): never {
  if (status === 404) {
    if (resourceLabel === "README") throw new AppError("GITHUB_PROJECT_README_NOT_FOUND", "这个 GitHub 项目没有可读取的 README。 ");
    throw new AppError("GITHUB_PROJECT_NOT_FOUND", "GitHub 项目不存在、没有权限访问，或项目文件不可读取。");
  }
  if (status === 403 || status === 429) throw new AppError("GITHUB_PROJECT_RATE_LIMITED", "GitHub 请求受到限制，请稍后再试。");
  throw new AppError("GITHUB_PROJECT_HTTP_ERROR", `读取 GitHub ${resourceLabel}失败（HTTP ${status}）。`);
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) throw new AppError("GITHUB_PROJECT_RESPONSE_TOO_LARGE", "GitHub 返回内容过大，暂时无法导入。 ");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new AppError("GITHUB_PROJECT_RESPONSE_TOO_LARGE", "GitHub 返回内容过大，暂时无法导入。 ");
  return new TextDecoder("utf-8").decode(buffer);
}

function decodeReadmeContent(input: JsonRecord): string {
  const content = readText(input.content);
  if (!content) return "";
  if (String(input.encoding ?? "").toLowerCase() === "base64") {
    try {
      return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
    } catch {
      throw new AppError("GITHUB_PROJECT_README_INVALID", "GitHub README 编码无效。");
    }
  }
  return content;
}

function normalizeGithubTree(input: unknown, fullName: string, branch: string): PromptGithubFile[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(isRecord)
    .map((entry): PromptGithubFile | null => {
      const path = readText(entry.path);
      const isDirectory = entry.type === "tree";
      if (!path || (!isDirectory && entry.type !== "blob")) return null;
      const encodedPath = encodeURI(path).replace(/#/g, "%23").replace(/\?/g, "%3F");
      const branchPath = encodeURIComponent(branch);
      const baseUrl = `https://github.com/${fullName}/${isDirectory ? "tree" : "blob"}/${branchPath}/${encodedPath}`;
      const downloadUrl = isDirectory ? undefined : `https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(branch)}/${encodedPath}`;
      const size = typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size >= 0 ? Math.floor(entry.size) : undefined;
      return {
        path,
        type: isDirectory ? "directory" : "file",
        ...(size !== undefined ? { size } : {}),
        htmlUrl: baseUrl,
        ...(downloadUrl ? { downloadUrl } : {}),
      } satisfies PromptGithubFile;
    })
    .filter((file): file is PromptGithubFile => Boolean(file))
    .slice(0, maxFileCount);
}

function readText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function isRecord(input: unknown): input is JsonRecord {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}
