import { app, net } from "electron";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import {
  buildUpdateCheckResult,
  normalizeVersion,
  parseGithubLatestReleaseJson,
  parseGithubReleasesAtom,
  SUYAN_GITHUB_LATEST_API_URL,
  SUYAN_GITHUB_RELEASES_ATOM_URL,
  SUYAN_GITHUB_RELEASES_URL,
  type AppUpdateCheckData,
  type RemoteReleaseInfo,
} from "./updateCheckerModel";

export type { AppUpdateCheckData, AppUpdateStatus } from "./updateCheckerModel";

const UPDATE_CHECK_TIMEOUT_MS = 12_000;

export async function checkForAppUpdates(): Promise<AppUpdateCheckData> {
  const currentVersion = normalizeVersion(app.getVersion() || "0.1.0");
  const startedAt = Date.now();

  try {
    const release = await fetchLatestRelease();
    const result = buildUpdateCheckResult(currentVersion, release);
    logger.info("network", "update-check:success", {
      status: result.status,
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      source: result.source,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "检查更新失败。";

    logger.warn("network", "update-check:failed", {
      currentVersion,
      message,
      durationMs: Date.now() - startedAt,
    });

    return {
      status: "network_error",
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseUrl: SUYAN_GITHUB_RELEASES_URL,
      publishedAt: null,
      message: message.includes("超时") ? message : "无法连接 GitHub 检查更新，请稍后重试。",
      source: "none",
    };
  }
}

async function fetchLatestRelease(): Promise<RemoteReleaseInfo | null> {
  try {
    const apiText = await fetchText(SUYAN_GITHUB_LATEST_API_URL, {
      Accept: "application/vnd.github+json",
      "User-Agent": "SuYan-UpdateChecker",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    const apiPayload = JSON.parse(apiText) as unknown;
    const fromApi = parseGithubLatestReleaseJson(apiPayload);
    if (fromApi) {
      return fromApi;
    }
  } catch (error) {
    logger.info("network", "update-check:api-fallback", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const atomText = await fetchText(SUYAN_GITHUB_RELEASES_ATOM_URL, {
    Accept: "application/atom+xml, application/xml, text/xml, */*",
    "User-Agent": "SuYan-UpdateChecker",
  });

  if (!atomText.trim() || !/<entry\b/i.test(atomText)) {
    return null;
  }

  return parseGithubReleasesAtom(atomText);
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await net.fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return "";
      }

      throw new AppError(
        "UPDATE_CHECK_HTTP_ERROR",
        `GitHub 返回 ${response.status}，暂时无法检查更新。`,
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("UPDATE_CHECK_TIMEOUT", "检查更新超时，请检查网络后重试。");
    }

    throw new AppError("UPDATE_CHECK_NETWORK_ERROR", "无法连接 GitHub 检查更新，请稍后重试。");
  } finally {
    clearTimeout(timeout);
  }
}
