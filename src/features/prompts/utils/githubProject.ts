import type { PromptGithubFile, PromptGithubProject, PromptGithubRelease, PromptGithubReleaseAsset } from "../types";

export type GithubRepositoryRef = {
  owner: string;
  repository: string;
  url: string;
};

const githubNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const maxReadmeLength = 1_000_000;
const maxFileCount = 2_500;
const maxPathLength = 1_000;
const maxReleaseCount = 30;
const maxReleaseAssetCount = 100;
const maxReleaseBodyLength = 200_000;

/** 从粘贴内容中提取 GitHub 仓库根地址，目录、Issue 和 PR 地址不会被误识别。 */
export function parseGithubRepositoryUrl(input: string): GithubRepositoryRef | null {
  const candidate = extractHttpUrl(input);
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean).map(decodePathPart);
  if (parts.length !== 2) return null;

  const owner = parts[0] ?? "";
  const repository = (parts[1] ?? "").replace(/\.git$/i, "");
  if (!githubNamePattern.test(owner) || !githubNamePattern.test(repository)) return null;

  return {
    owner,
    repository,
    url: `https://github.com/${owner}/${repository}`,
  };
}

/** 归一化来自 IPC 的 GitHub 元数据，渲染层也会再次执行以隔离不可信输入。 */
export function normalizeGithubProject(input: unknown): PromptGithubProject | undefined {
  if (!isRecord(input)) return undefined;
  const owner = normalizeName(input.owner);
  const repository = normalizeName(input.repository);
  const name = normalizeText(input.name, 200);
  const readmeContent = normalizeText(input.readmeContent, maxReadmeLength);
  if (!owner || !repository || !name || !readmeContent) return undefined;

  const fallbackUrl = `https://github.com/${owner}/${repository}`;
  const files = Array.isArray(input.files)
    ? input.files.map(normalizeGithubFile).filter((file): file is PromptGithubFile => Boolean(file)).slice(0, maxFileCount)
    : [];
  const hasReleases = Array.isArray(input.releases);
  const rawReleases: unknown[] = hasReleases ? input.releases as unknown[] : [];
  const releases = hasReleases
    ? rawReleases.map((release) => normalizeGithubRelease(release)).filter((release): release is PromptGithubRelease => Boolean(release)).slice(0, maxReleaseCount)
    : [];
  return {
    owner,
    repository,
    fullName: normalizeText(input.fullName, 220) || `${owner}/${repository}`,
    name,
    url: normalizeGithubUrl(input.url) ?? fallbackUrl,
    releasesUrl: normalizeGithubUrl(input.releasesUrl) ?? `${fallbackUrl}/releases`,
    defaultBranch: normalizeText(input.defaultBranch, 200) || "main",
    readmeName: normalizeText(input.readmeName, 200) || "README.md",
    readmeContent,
    files,
    ...(hasReleases ? { releases } : {}),
    ...(input.treeTruncated === true ? { treeTruncated: true } : {}),
    ...(input.readmeCollapsed === true ? { readmeCollapsed: true } : {}),
  };
}

export function getGithubProjectTitle(project: Pick<PromptGithubProject, "name" | "repository">): string {
  return `Github-${project.name.trim() || project.repository.trim()}`;
}

export function getGithubReadmeRawUrl(project: Pick<PromptGithubProject, "owner" | "repository" | "fullName" | "defaultBranch" | "readmeName">): string {
  const fullName = project.fullName.trim() || `${project.owner}/${project.repository}`;
  const readmePath = project.readmeName.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
  return `https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(project.defaultBranch)}/${readmePath || "README.md"}`;
}

function normalizeGithubFile(input: unknown): PromptGithubFile | undefined {
  if (!isRecord(input)) return undefined;
  const path = normalizeText(input.path, maxPathLength);
  const type = input.type === "directory" ? "directory" : input.type === "file" ? "file" : undefined;
  if (!path || !type) return undefined;
  const size = typeof input.size === "number" && Number.isFinite(input.size) && input.size >= 0
    ? Math.min(Math.floor(input.size), 10_000_000_000)
    : undefined;
  const htmlUrl = normalizeGithubUrl(input.htmlUrl);
  const downloadUrl = normalizeGithubUrl(input.downloadUrl);
  return {
    path,
    type,
    ...(size !== undefined ? { size } : {}),
    ...(htmlUrl ? { htmlUrl } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
  };
}

function normalizeGithubRelease(input: unknown): PromptGithubRelease | undefined {
  if (!isRecord(input)) return undefined;
  const id = normalizeText(input.id, 120) || (typeof input.id === "number" && Number.isFinite(input.id) ? String(Math.floor(input.id)) : "");
  const tagName = normalizeText(input.tagName, 200);
  const name = normalizeText(input.name, 300) || tagName;
  const htmlUrl = normalizeGithubUrl(input.htmlUrl);
  if (!id || !tagName || !htmlUrl) return undefined;
  const assets = Array.isArray(input.assets)
    ? input.assets.map(normalizeGithubReleaseAsset).filter((asset): asset is PromptGithubReleaseAsset => Boolean(asset)).slice(0, maxReleaseAssetCount)
    : [];
  return {
    id,
    tagName,
    name,
    body: normalizeText(input.body, maxReleaseBodyLength),
    htmlUrl,
    ...(normalizeIsoDate(input.publishedAt) ? { publishedAt: normalizeIsoDate(input.publishedAt) } : {}),
    ...(normalizeIsoDate(input.createdAt) ? { createdAt: normalizeIsoDate(input.createdAt) } : {}),
    prerelease: input.prerelease === true,
    draft: input.draft === true,
    assets,
  };
}

function normalizeGithubReleaseAsset(input: unknown): PromptGithubReleaseAsset | undefined {
  if (!isRecord(input)) return undefined;
  const name = normalizeText(input.name, 300);
  const downloadUrl = normalizeGithubUrl(input.downloadUrl);
  const htmlUrl = normalizeGithubUrl(input.htmlUrl);
  if (!name || (!downloadUrl && !htmlUrl)) return undefined;
  const size = typeof input.size === "number" && Number.isFinite(input.size) && input.size >= 0
    ? Math.min(Math.floor(input.size), 10_000_000_000)
    : undefined;
  const downloadCount = typeof input.downloadCount === "number" && Number.isFinite(input.downloadCount) && input.downloadCount >= 0
    ? Math.min(Math.floor(input.downloadCount), 2_000_000_000)
    : undefined;
  return {
    name,
    ...(normalizeText(input.label, 300) ? { label: normalizeText(input.label, 300) } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(downloadCount !== undefined ? { downloadCount } : {}),
    ...(normalizeText(input.contentType, 160) ? { contentType: normalizeText(input.contentType, 160) } : {}),
    ...(htmlUrl ? { htmlUrl } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
  };
}

function normalizeIsoDate(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value && Number.isFinite(Date.parse(value)) ? value.slice(0, 80) : undefined;
}

function extractHttpUrl(input: string): string | null {
  const match = input.match(/https:\/\/[^\s<>"']+/i)?.[0] ?? input.trim();
  const cleaned = match.replace(/[),.;!?\]}]+$/g, "");
  return cleaned || null;
}

function decodePathPart(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeName(input: unknown): string {
  const value = normalizeText(input, 100);
  return githubNamePattern.test(value) ? value : "";
}

function normalizeText(input: unknown, maxLength: number): string {
  return typeof input === "string" ? input.trim().slice(0, maxLength) : "";
}

function normalizeGithubUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.protocol !== "https:" || (hostname !== "github.com" && hostname !== "raw.githubusercontent.com")) return undefined;
    return value.slice(0, 2_000);
  } catch {
    return undefined;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}
