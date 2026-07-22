import { net } from "electron";
import fs from "node:fs/promises";
import type { LibraryItem } from "../../../src/features/library/types/library";
import {
  extractJimengWorkInfo,
  extractKnownPromptSiteInfo,
  extractWebToMindPromptInfo,
  getImportableRemoteMediaUrls,
  isSourceOnlyPrompt,
  parseJimengItemInfoPayload,
  parseJimengWorkHtml,
  parseKnownPromptSiteHtml,
  parseWebToMindPromptCaseApiPayload,
  type PromptImportDraft,
} from "../../shared/promptImportParser";
import { captureJimengItemInfo } from "../clipboard/jimengHiddenFetch";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { prepareImageThumbnails } from "./imageThumbnails";
import {
  getMediaExtensionFromMime,
  getMediaExtensionFromUrlPath,
  isVideoMediaExtension,
  writeImportMediaBuffer,
} from "./importedImageWriter";
import { getImagePath } from "./libraryPaths";
import { readLibraryFile, writeLibraryFile } from "./libraryStore";

// 与导入链路一致：HTML 快路径优先，hidden-fetch 仅作短超时兜底。
const jimengHiddenFetchTimeoutMs = 6_000;
const webToMindRefreshTimeoutMs = 12_000;

type DownloadRemoteMaterialResult = {
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  itemId: string;
  downloaded: boolean;
  updated?: boolean;
};

const inFlightDownloads = new Map<string, Promise<DownloadRemoteMaterialResult>>();

export function downloadRemoteMaterialForItem(itemId: string): Promise<DownloadRemoteMaterialResult> {
  const existing = inFlightDownloads.get(itemId);

  if (existing) {
    logger.info("jimeng-import", "remote-download:dedup", { itemId });
    return existing;
  }

  const download = runRemoteMaterialDownload(itemId).finally(() => {
    inFlightDownloads.delete(itemId);
  });

  inFlightDownloads.set(itemId, download);
  return download;
}

async function runRemoteMaterialDownload(itemId: string): Promise<DownloadRemoteMaterialResult> {
  const library = await readLibraryFile();
  const item = library.items.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new AppError("LIBRARY_ITEM_NOT_FOUND", "没有找到这条提示词。");
  }

  const needsImageDownload = item.remoteImageStatus === "pending" && Boolean(item.remoteImageUrl?.trim());
  const draft = await resolveFreshImportDraft(item);
  const needsMetadataRefresh = shouldRefreshImportMetadata(item, draft);

  if (!needsImageDownload && !needsMetadataRefresh) {
    return { library, itemId, downloaded: false, updated: false };
  }

  let imageFileName = item.imageFileName;
  let downloadUrl = item.remoteImageUrl?.trim() || "";
  let downloaded = false;

  if (needsImageDownload) {
    downloadUrl = pickRefreshedUrl(draft, downloadUrl) || downloadUrl || (await resolveFreshDownloadUrl(item));
    const remoteImage = await fetchRemoteImage(downloadUrl);
    imageFileName = await writeImportMediaBuffer(item.id, remoteImage.buffer, remoteImage.extension);
    downloaded = true;
  }

  const now = new Date().toISOString();
  const metadataPatch = needsMetadataRefresh ? buildMetadataPatchFromDraft(item, draft) : {};
  const nextLibrary = await writeLibraryFile({
    ...library,
    items: library.items.map((candidate) =>
      candidate.id === item.id
        ? {
            ...candidate,
            ...metadataPatch,
            imageFileName,
            remoteImageStatus: downloaded ? "downloaded" : candidate.remoteImageStatus,
            remoteImageUrl: downloadUrl || candidate.remoteImageUrl,
            updatedAt: now,
          }
        : candidate,
    ),
  });

  if (downloaded) {
    await prepareImageThumbnails([imageFileName]);
    await removePlaceholderIfUnused(item.imageFileName, imageFileName, nextLibrary.items);
  }

  return { library: nextLibrary, itemId, downloaded, updated: true };
}

async function resolveFreshDownloadUrl(item: LibraryItem): Promise<string> {
  const savedUrl = item.remoteImageUrl?.trim() ?? "";
  const sourceUrl = item.sourceUrl?.trim() ?? "";
  const workInfo = sourceUrl ? extractJimengWorkInfo(sourceUrl) : null;

  if (workInfo) {
    const draft = await resolveFreshImportDraft(item);
    const freshUrl = pickRefreshedUrl(draft, savedUrl);

    logger.info("jimeng-import", "remote-refresh:done", {
      workId: workInfo.workId,
      refreshed: Boolean(freshUrl && freshUrl !== savedUrl),
      via: draft ? "draft" : "saved",
    });

    if (freshUrl && getImportableRemoteMediaUrls([freshUrl]).length > 0) {
      return freshUrl;
    }

    return savedUrl;
  }

  const webToMindInfo = sourceUrl ? extractWebToMindPromptInfo(sourceUrl) : null;

  if (webToMindInfo) {
    try {
      const freshUrl = await refreshWebToMindDownloadUrl(webToMindInfo.sourceUrl, savedUrl);

      logger.info("webtomind-import", "remote-refresh:done", {
        refreshed: Boolean(freshUrl && freshUrl !== savedUrl),
        sourceUrl: webToMindInfo.sourceUrl,
      });

      return freshUrl || savedUrl;
    } catch (error) {
      logger.warn("webtomind-import", "remote-refresh:error", {
        sourceUrl: webToMindInfo.sourceUrl,
        message: error instanceof Error ? error.message : String(error),
      });
      return savedUrl;
    }
  }

  return savedUrl;
}

async function resolveFreshImportDraft(item: LibraryItem): Promise<PromptImportDraft | null> {
  const sourceUrl = item.sourceUrl?.trim() ?? "";
  const workInfo = sourceUrl ? extractJimengWorkInfo(sourceUrl) : null;

  if (workInfo) {
    const htmlDraft = await refreshJimengImportDraftFromHtml(workInfo.sourceUrl);

    if (htmlDraft && isSufficientJimengDraft(htmlDraft)) {
      return htmlDraft;
    }

    try {
      const capture = await captureJimengItemInfo(workInfo.sourceUrl, jimengHiddenFetchTimeoutMs);

      if (!capture) {
        logger.info("jimeng-import", "remote-refresh:no-capture", { workId: workInfo.workId });
        return htmlDraft;
      }

      const captureDraft = parseJimengItemInfoPayload(capture.body, workInfo.sourceUrl);
      return captureDraft ?? htmlDraft;
    } catch (error) {
      logger.warn("jimeng-import", "remote-refresh:error", {
        workId: workInfo.workId,
        message: error instanceof Error ? error.message : String(error),
      });
      return htmlDraft;
    }
  }

  const webToMindInfo = sourceUrl ? extractWebToMindPromptInfo(sourceUrl) : null;

  if (webToMindInfo) {
    try {
      const apiUrl = buildWebToMindPromptCaseApiUrl(webToMindInfo.sourceUrl);

      if (!apiUrl) {
        return null;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webToMindRefreshTimeoutMs);

      try {
        const response = await net.fetch(apiUrl, {
          headers: {
            accept: "application/json,*/*;q=0.8",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            referer: webToMindInfo.sourceUrl,
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          return null;
        }

        return parseWebToMindPromptCaseApiPayload(await response.text(), webToMindInfo.sourceUrl);
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return null;
    }
  }

  const knownSiteInfo = sourceUrl ? extractKnownPromptSiteInfo(sourceUrl) : null;

  if (knownSiteInfo) {
    return refreshKnownSiteImportDraftFromHtml(knownSiteInfo);
  }

  return null;
}

function shouldRefreshImportMetadata(item: LibraryItem, draft: PromptImportDraft | null): boolean {
  if (!draft) {
    return false;
  }

  if (isSourceOnlyPrompt(item.prompt || "")) {
    return true;
  }

  const currentAuthor = (item.authorName || "").trim();
  const draftAuthor = (draft.authorName || "").trim();

  if (draftAuthor && (!currentAuthor || currentAuthor === "即梦AI" || currentAuthor === draft.generationMethod)) {
    return true;
  }

  if (draft.authorAvatarUrl && (!item.authorAvatarUrl || /favicon\.ico$/i.test(item.authorAvatarUrl))) {
    return true;
  }

  if (draft.prompt && draft.prompt.length > (item.prompt || "").length + 20 && isSourceOnlyPrompt(item.prompt || "")) {
    return true;
  }

  return false;
}

function buildMetadataPatchFromDraft(
  item: LibraryItem,
  draft: PromptImportDraft | null,
): Partial<LibraryItem> {
  if (!draft) {
    return {};
  }

  const patch: Partial<LibraryItem> = {};

  if (draft.prompt && (!item.prompt?.trim() || isSourceOnlyPrompt(item.prompt))) {
    patch.prompt = draft.prompt;
    patch.negativePrompt = draft.negativePrompt || item.negativePrompt || "";
  }

  if (draft.title && (!item.title?.trim() || item.title === "Dreamina" || item.title === "网页提示词")) {
    patch.title = draft.title;
  }

  if (draft.authorName) {
    patch.authorName = draft.authorName;
  }

  if (draft.authorUrl) {
    patch.authorUrl = draft.authorUrl;
  }

  if (draft.authorAvatarUrl) {
    patch.authorAvatarUrl = draft.authorAvatarUrl;
  }

  if (draft.generationMethod) {
    patch.generationMethod = draft.generationMethod;
  }

  if (draft.tags?.length) {
    const mergedTags = Array.from(new Set([...(item.tags || []), ...draft.tags]));
    patch.tags = mergedTags;
  }

  return patch;
}

async function refreshJimengImportDraftFromHtml(sourceUrl: string): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), jimengHiddenFetchTimeoutMs);

  try {
    const response = await net.fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        referer: "https://jimeng.jianying.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const finalUrl = response.url || sourceUrl;
    const html = await response.text();

    return (
      parseJimengWorkHtml(html, finalUrl) ??
      parseJimengWorkHtml(html, sourceUrl) ??
      (() => {
        const siteInfo = extractKnownPromptSiteInfo(finalUrl) ?? extractKnownPromptSiteInfo(sourceUrl);
        return siteInfo ? parseKnownPromptSiteHtml(html, { ...siteInfo, sourceUrl: finalUrl }) : null;
      })()
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshKnownSiteImportDraftFromHtml(
  siteInfo: NonNullable<ReturnType<typeof extractKnownPromptSiteInfo>>,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), jimengHiddenFetchTimeoutMs);

  try {
    const response = await net.fetch(siteInfo.sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        referer: siteInfo.siteUrl,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const finalUrl = response.url || siteInfo.sourceUrl;
    return parseKnownPromptSiteHtml(await response.text(), {
      ...siteInfo,
      sourceUrl: finalUrl,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshJimengDownloadUrlFromHtml(sourceUrl: string, savedUrl: string): Promise<string> {
  const draft = await refreshJimengImportDraftFromHtml(sourceUrl);
  return pickRefreshedUrl(draft, savedUrl);
}

function isSufficientJimengDraft(draft: PromptImportDraft): boolean {
  const prompt = draft.prompt?.trim() ?? "";
  const mediaCount = draft.sourceImageUrls?.length ?? (draft.sourceImageUrl ? 1 : 0);

  if (!prompt || prompt.startsWith("来源链接：") || mediaCount <= 0) {
    return false;
  }

  const wantsVideo =
    draft.tags?.includes("视频提示词") ||
    /workDetailType=AiVideo|itemType=53|AiVideo/i.test(draft.sourceUrl ?? "");
  const hasVideo = (draft.sourceImageUrls ?? []).some((url) => /\bvideo\b|vlabvod|\.mp4/i.test(url));

  if (wantsVideo && !hasVideo) {
    return false;
  }

  return true;
}

async function refreshWebToMindDownloadUrl(sourceUrl: string, savedUrl: string): Promise<string> {
  const apiUrl = buildWebToMindPromptCaseApiUrl(sourceUrl);

  if (!apiUrl) {
    return savedUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), webToMindRefreshTimeoutMs);

  try {
    const response = await net.fetch(apiUrl, {
      headers: {
        accept: "application/json,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        referer: sourceUrl,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return savedUrl;
    }

    const draft = parseWebToMindPromptCaseApiPayload(await response.text(), sourceUrl);
    return pickRefreshedUrl(draft, savedUrl);
  } finally {
    clearTimeout(timeout);
  }
}

function buildWebToMindPromptCaseApiUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const promptIndex = segments.findIndex((segment) => segment.toLowerCase() === "prompts");
    const slug = promptIndex >= 0 ? segments[promptIndex + 1] : "";

    if (!slug) {
      return null;
    }

    const localeCandidate = promptIndex > 0 ? segments[promptIndex - 1] : "";
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(localeCandidate ?? "") ? localeCandidate : "zh-CN";
    const apiUrl = new URL("/api/content/prompt-cases", url.origin);

    apiUrl.searchParams.set("slug", slug);
    apiUrl.searchParams.set("includePrompt", "1");
    apiUrl.searchParams.set("locale", locale);

    return apiUrl.href;
  } catch {
    return null;
  }
}

function pickRefreshedUrl(draft: PromptImportDraft | null, savedUrl: string): string {
  if (!draft) {
    return savedUrl;
  }

  const candidates = getImportableRemoteMediaUrls([...(draft.sourceImageUrls ?? []), draft.sourceImageUrl ?? ""]);
  const savedLooksVideo = isLikelyVideoUrl(savedUrl);

  const matched = candidates.find((url) => isLikelyVideoUrl(url) === savedLooksVideo);

  return matched || draft.sourceImageUrl || savedUrl;
}

function isLikelyVideoUrl(url: string): boolean {
  const pathExtension = getMediaExtensionFromUrlPath(url);
  if (pathExtension && isVideoMediaExtension(pathExtension)) {
    return true;
  }

  return /vlabvod|video/i.test(url);
}

async function fetchRemoteImage(sourceUrl: string): Promise<{ buffer: Buffer; extension: string }> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUrl.trim());
  } catch {
    throw new AppError("REMOTE_MATERIAL_URL_INVALID", "远程素材链接格式不正确。");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AppError("REMOTE_MATERIAL_URL_INVALID", "远程素材仅支持 http/https 链接。");
  }

  for (const headers of getRemoteImageHeaderVariants(sourceUrl)) {
    try {
      const response = await net.fetch(sourceUrl, { headers });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const extension = resolveRemoteMediaExtension(sourceUrl, contentType);

      if (!extension) {
        continue;
      }

      const isVideo = isVideoMediaExtension(extension);
      const maxSize = isVideo ? 80 * 1024 * 1024 : 24 * 1024 * 1024;
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0) {
        throw new AppError("REMOTE_MATERIAL_EMPTY", "下载到的远程素材内容为空。");
      }

      if (buffer.length > maxSize) {
        throw new AppError("REMOTE_MATERIAL_TOO_LARGE", "远程素材体积过大，暂不支持自动下载。");
      }

      return { buffer, extension };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
    }
  }

  throw new AppError("REMOTE_MATERIAL_DOWNLOAD_FAILED", "远程素材下载失败，请检查网络或链接是否可访问。");
}

function getRemoteImageHeaderVariants(sourceUrl: string): Array<Record<string, string>> {
  const isVideoUrl = isLikelyVideoUrl(sourceUrl);
  const acceptHeader = isVideoUrl
    ? "video/mp4,video/webm,video/quicktime,video/x-matroska,video/*;q=0.9,*/*;q=0.5"
    : "image/avif,image/webp,image/apng,image/heic,image/heif,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5";
  const referer = getImageReferer(sourceUrl);
  const browserUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

  return [
    {
      accept: acceptHeader,
      "user-agent": browserUserAgent,
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      referer,
    },
    {
      accept: acceptHeader,
      "user-agent": browserUserAgent,
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache",
      referer,
      origin: new URL(referer).origin,
    },
    {
      accept: acceptHeader,
      "user-agent": "Suyan/0.1.0",
      referer,
    },
  ];
}

function getImageReferer(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();

    if (hostname.includes("aiart.pics")) {
      return "https://aiart.pics/";
    }

    if (hostname.includes("twimg.com") || hostname.includes("twitter.com") || hostname.includes("x.com")) {
      return "https://x.com/";
    }

    if (hostname.includes("webtomind.com") || hostname.includes("supabase.co")) {
      return "https://webtomind.com/";
    }

    if (hostname.includes("xmiaom.com")) {
      return "https://img.xmiaom.com/";
    }

    if (hostname.includes("bmp.ovh") || hostname.includes("wjwj.top")) {
      return "https://aipromptfill.com/";
    }

    if (hostname.includes("byteimg.com") || hostname.includes("vlabvod.com") || hostname.includes("jimeng.jianying.com")) {
      return "https://jimeng.jianying.com/";
    }
  } catch {
  }

  return "https://aipromptfill.com/";
}

function resolveRemoteMediaExtension(sourceUrl: string, contentType: string): string | null {
  return (
    getMediaExtensionFromMime(contentType) ??
    getMediaExtensionFromUrlPath(sourceUrl) ??
    (isLikelyVideoUrl(sourceUrl) ? ".mp4" : null)
  );
}

async function removePlaceholderIfUnused(
  previousImageFileName: string,
  nextImageFileName: string,
  items: LibraryItem[],
): Promise<void> {
  if (
    !previousImageFileName ||
    previousImageFileName === nextImageFileName ||
    items.some((item) => item.imageFileName === previousImageFileName)
  ) {
    return;
  }

  try {
    await fs.unlink(getImagePath(previousImageFileName));
  } catch {
  }
}
