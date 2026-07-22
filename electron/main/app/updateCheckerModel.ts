export type AppUpdateStatus =
  | "up_to_date"
  | "update_available"
  | "no_releases"
  | "network_error";

export type AppUpdateCheckData = {
  status: AppUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  message: string;
  source: "github-api" | "github-atom" | "none";
};

export type RemoteReleaseInfo = {
  version: string;
  releaseName: string | null;
  releaseUrl: string;
  publishedAt: string | null;
  source: "github-api" | "github-atom";
};

export const SUYAN_GITHUB_OWNER = "guliacer";
export const SUYAN_GITHUB_REPO = "SuYan";
export const SUYAN_GITHUB_REPO_URL = `https://github.com/${SUYAN_GITHUB_OWNER}/${SUYAN_GITHUB_REPO}`;
export const SUYAN_GITHUB_RELEASES_URL = `${SUYAN_GITHUB_REPO_URL}/releases`;
export const SUYAN_GITHUB_LATEST_API_URL = `https://api.github.com/repos/${SUYAN_GITHUB_OWNER}/${SUYAN_GITHUB_REPO}/releases/latest`;
export const SUYAN_GITHUB_RELEASES_ATOM_URL = `${SUYAN_GITHUB_RELEASES_URL}.atom`;

export function normalizeVersion(input: string): string {
  return input.trim().replace(/^v/i, "");
}

export function compareSemver(leftInput: string, rightInput: string): number {
  const leftParts = normalizeVersion(leftInput)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10));
  const rightParts = normalizeVersion(rightInput)
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

export function parseGithubLatestReleaseJson(payload: unknown): RemoteReleaseInfo | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const tagName = typeof record.tag_name === "string" ? record.tag_name.trim() : "";
  if (!tagName) {
    return null;
  }

  const htmlUrl =
    typeof record.html_url === "string" && record.html_url.trim().length > 0
      ? record.html_url.trim()
      : `${SUYAN_GITHUB_RELEASES_URL}/tag/${encodeURIComponent(tagName)}`;
  const releaseName = typeof record.name === "string" && record.name.trim().length > 0 ? record.name.trim() : null;
  const publishedAt =
    typeof record.published_at === "string" && record.published_at.trim().length > 0
      ? record.published_at.trim()
      : null;

  return {
    version: normalizeVersion(tagName),
    releaseName,
    releaseUrl: htmlUrl,
    publishedAt,
    source: "github-api",
  };
}

export function parseGithubReleasesAtom(xml: string): RemoteReleaseInfo | null {
  const entryMatch = xml.match(/<entry\b[\s\S]*?<\/entry>/i);
  if (!entryMatch) {
    return null;
  }

  const entry = entryMatch[0];
  const title = extractXmlTag(entry, "title");
  const link = extractAtomLink(entry) ?? extractXmlTag(entry, "id");
  const updated = extractXmlTag(entry, "updated") ?? extractXmlTag(entry, "published");
  const version = extractVersionToken(title ?? "") ?? extractVersionToken(link ?? "");

  if (!version) {
    return null;
  }

  return {
    version: normalizeVersion(version),
    releaseName: title,
    releaseUrl: link && /^https?:\/\//i.test(link) ? link : `${SUYAN_GITHUB_RELEASES_URL}/tag/v${normalizeVersion(version)}`,
    publishedAt: updated,
    source: "github-atom",
  };
}

export function buildUpdateCheckResult(
  currentVersionInput: string,
  release: RemoteReleaseInfo | null,
): AppUpdateCheckData {
  const currentVersion = normalizeVersion(currentVersionInput) || "0.0.0";

  if (!release) {
    return {
      status: "no_releases",
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseUrl: SUYAN_GITHUB_RELEASES_URL,
      publishedAt: null,
      message: "GitHub 上暂无发布版本，当前已是本地可用版本。",
      source: "none",
    };
  }

  const comparison = compareSemver(release.version, currentVersion);
  if (comparison > 0) {
    return {
      status: "update_available",
      currentVersion,
      latestVersion: release.version,
      releaseName: release.releaseName,
      releaseUrl: release.releaseUrl,
      publishedAt: release.publishedAt,
      message: `发现新版本 v${release.version}，可前往 GitHub 下载。`,
      source: release.source,
    };
  }

  return {
    status: "up_to_date",
    currentVersion,
    latestVersion: release.version,
    releaseName: release.releaseName,
    releaseUrl: release.releaseUrl,
    publishedAt: release.publishedAt,
    message: `当前已是最新版本 v${currentVersion}。`,
    source: release.source,
  };
}

function extractXmlTag(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return null;
  }

  return decodeXmlEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
}

function extractAtomLink(entryXml: string): string | null {
  const matches = entryXml.matchAll(/<link\b([^>]*)\/?>/gi);
  for (const match of matches) {
    const attrs = match[1] ?? "";
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "alternate";
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (href && (rel === "alternate" || rel === "self" || !/rel\s*=/i.test(attrs))) {
      return decodeXmlEntities(href.trim());
    }
  }

  return null;
}

function extractVersionToken(input: string): string | null {
  const match = input.match(/v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/i);
  return match ? match[1] : null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
