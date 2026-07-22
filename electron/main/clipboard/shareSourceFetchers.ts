import { net } from "electron";
import { inflateSync } from "node:zlib";
import {
  extractAiartPromptId,
  extractAipromptfillShareCode,
  extractGptImage2GalleryInfo,
  extractJimengWorkInfo,
  extractKnownPromptSiteInfo,
  extractWebToMindPromptInfo,
  extractXmiaomPromptInfo,
  extractXStatusInfo,
  mergePromptImportDrafts,
  parseAiartPromptPayload,
  parseAipromptfillSharePayload,
  parseFxTwitterTweetPayload,
  parseGptImage2GalleryMarkdown,
  parseJimengItemInfoPayload,
  parseKnownPromptSiteHtml,
  parseJimengWorkHtml,
  parsePromptDraftFromHtml,
  parsePromptShareUrl,
  parsePromptText,
  parseWebToMindPromptCaseApiPayload,
  parseWebToMindPromptHtml,
  parseXmiaomPromptHtml,
  parseXStatusSyndicationPayload,
  type GptImage2GalleryInfo,
  type JimengWorkInfo,
  type KnownPromptSiteInfo,
  type PromptImportDraft,
  type WebToMindPromptInfo,
  type XmiaomPromptInfo,
  type XStatusInfo,
} from "../../shared/promptImportParser";
import { logger } from "../appLogger";
import { AppError } from "../ipc/errors";
import { captureJimengItemInfo } from "./jimengHiddenFetch";

export type ImportDeadline = {
  expiresAtMs: number;
};

export function createImportDeadline(timeoutMs: number): ImportDeadline {
  return { expiresAtMs: Date.now() + timeoutMs };
}

export function createImportAbortTimeout(
  controller: AbortController,
  deadline: ImportDeadline,
  maxTimeoutMs: number,
): ReturnType<typeof setTimeout> {
  const timeoutMs = Math.min(maxTimeoutMs, deadline.expiresAtMs - Date.now());

  if (timeoutMs <= 0) {
    controller.abort();
    throwImportTimeoutError();
  }

  return setTimeout(() => controller.abort(), timeoutMs);
}

export function assertImportNotTimedOut(deadline: ImportDeadline): void {
  if (Date.now() >= deadline.expiresAtMs) {
    throwImportTimeoutError();
  }
}

export function rethrowIfImportTimedOut(deadline: ImportDeadline): void {
  if (Date.now() >= deadline.expiresAtMs) {
    throwImportTimeoutError();
  }
}

function throwImportTimeoutError(): never {
  throw new AppError("IMPORT_TIMEOUT", "导入素材超时，请检查网络或代理设置后重试。");
}

export async function resolvePromptDraftFromText(
  text: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft> {
  const knownShareDrafts = await resolveKnownShareDraftsFromText(text, deadline);

  if (knownShareDrafts?.[0]) {
    return knownShareDrafts[0];
  }

  const shareDraft = parsePromptShareUrl(text);

  if (!shareDraft?.sourceUrl) {
    return parsePromptText(text);
  }

  const htmlDraft = await fetchPromptDraftFromUrl(shareDraft.sourceUrl, deadline);

  return mergePromptImportDrafts(htmlDraft ?? {}, shareDraft);
}

export async function resolveKnownShareDraftsFromText(
  text: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft[] | null> {
  assertImportNotTimedOut(deadline);
  const gptImage2GalleryInfo = extractGptImage2GalleryInfo(text);

  if (gptImage2GalleryInfo) {
    const galleryDrafts = await fetchGptImage2GalleryDrafts(gptImage2GalleryInfo, deadline);

    if (galleryDrafts.length > 0) {
      return galleryDrafts;
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "GPT-Image-2 图库解析失败，请检查网络后重试。");
  }

  const xmiaomPromptInfo = extractXmiaomPromptInfo(text);

  if (xmiaomPromptInfo) {
    const xmiaomDraft = await fetchXmiaomPromptDraft(xmiaomPromptInfo, deadline);

    if (xmiaomDraft) {
      return [xmiaomDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "哗啦哗啦链接解析失败，请检查网络后重试。");
  }

  const webToMindPromptInfo = extractWebToMindPromptInfo(text);

  if (webToMindPromptInfo) {
    const webToMindDraft = await fetchWebToMindPromptDraft(webToMindPromptInfo, deadline);

    if (webToMindDraft) {
      return [webToMindDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "WebToMind 链接解析失败，请检查网络后重试。");
  }

  const aiartPromptId = extractAiartPromptId(text);

  if (aiartPromptId) {
    const aiartDraft = await fetchAiartPromptDraft(aiartPromptId, text.trim(), deadline);

    if (aiartDraft) {
      return [aiartDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "AIART.PICS 链接解析失败，请检查网络后重试。");
  }

  const aipromptfillShareCode = extractAipromptfillShareCode(text);

  if (aipromptfillShareCode) {
    const aipromptfillDraft = await fetchAipromptfillShareDraft(aipromptfillShareCode, text.trim(), deadline);

    if (aipromptfillDraft) {
      return [aipromptfillDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "Prompt Fill 链接解析失败，请检查网络后重试。");
  }

  const jimengWorkInfo = extractJimengWorkInfo(text);

  if (jimengWorkInfo) {
    const jimengDraft = await fetchJimengWorkDraft(jimengWorkInfo, deadline);

    if (jimengDraft) {
      return [jimengDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "即梦AI 链接解析失败，请检查网络后重试。");
  }

  const knownPromptSiteInfo = extractKnownPromptSiteInfo(text);

  if (knownPromptSiteInfo) {
    const knownPromptSiteDraft = await fetchKnownPromptSiteDraft(knownPromptSiteInfo, deadline);

    if (knownPromptSiteDraft) {
      return [knownPromptSiteDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", `${knownPromptSiteInfo.siteName} 链接解析失败，请检查网络或代理后重试。`);
  }

  const xStatusInfo = extractXStatusInfo(text);

  if (xStatusInfo) {
    const xStatusDraft = await fetchXStatusDraft(xStatusInfo, deadline);

    if (xStatusDraft) {
      return [xStatusDraft];
    }

    throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "X 链接解析失败，请检查网络后重试。");
  }

  return null;
}

export async function fetchHtmlUntilMarker(
  url: string,
  headers: Record<string, string>,
  deadline: ImportDeadline,
  options: { anchor: string; stopAfter: string; maxBytes?: number },
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 12_000);
  const maxBytes = options.maxBytes ?? 512 * 1024;

  try {
    const response = await net.fetch(url, { headers, signal: controller.signal, cache: "no-store" });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const body = response.body;
    if (!body) {
      return await response.text();
    }

    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let html = "";
    let bytesRead = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });

      const anchorIndex = html.indexOf(options.anchor);
      if (anchorIndex >= 0 && isBalancedJsonObjectAfter(html, anchorIndex)) {
        void reader.cancel().catch(() => undefined);
        break;
      }

      if (bytesRead >= maxBytes) {
        void reader.cancel().catch(() => undefined);
        break;
      }
    }

    html += decoder.decode();
    return html;
  } catch {
    rethrowIfImportTimedOut(deadline);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}

function isBalancedJsonObjectAfter(html: string, anchorIndex: number): boolean {
  const startIndex = html.indexOf("{", anchorIndex);
  if (startIndex < 0) {
    return false;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < html.length; i += 1) {
    const char = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return true;
      }
    }
  }

  return false;
}

async function fetchWebToMindPromptDraft(
  promptInfo: WebToMindPromptInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const htmlDraft = await fetchWebToMindPromptHtmlDraft(promptInfo, deadline);
  const apiDraft = await fetchWebToMindPromptCaseApiDraft(htmlDraft?.sourceUrl ?? promptInfo.sourceUrl, deadline);
  const merged = mergePromptImportDrafts(apiDraft ?? {}, htmlDraft ?? {});

  return merged.prompt ? merged : null;
}

async function fetchWebToMindPromptHtmlDraft(
  promptInfo: WebToMindPromptInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 10_000);

  try {
    const response = await net.fetch(promptInfo.sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "user-agent": "Suyan/0.1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    return parseWebToMindPromptHtml(await response.text(), promptInfo.sourceUrl);
  } catch {
    rethrowIfImportTimedOut(deadline);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWebToMindPromptCaseApiDraft(
  sourceUrl: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const apiUrl = buildWebToMindPromptCaseApiUrl(sourceUrl);

  if (!apiUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 8_000);

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
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return null;
    }

    const draft = parseWebToMindPromptCaseApiPayload(await response.text(), sourceUrl);

    const mediaUrls = draft?.sourceImageUrls ?? (draft?.sourceImageUrl ? [draft.sourceImageUrl] : []);
    logger.info("webtomind-import", "api:parsed", {
      parsed: Boolean(draft),
      mediaCount: mediaUrls.length,
      hasVideo: mediaUrls.some((url) =>
        /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:$|[?#])/i.test(url),
      ),
    });

    return draft;
  } catch {
    rethrowIfImportTimedOut(deadline);
    return null;
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
    const locale = /^[a-z]{2}-[A-Z]{2}$/.test(localeCandidate) ? localeCandidate : "zh-CN";
    const apiUrl = new URL("/api/content/prompt-cases", url.origin);

    apiUrl.searchParams.set("slug", slug);
    apiUrl.searchParams.set("includePrompt", "1");
    apiUrl.searchParams.set("locale", locale);

    return apiUrl.href;
  } catch {
    return null;
  }
}

async function fetchXmiaomPromptDraft(
  promptInfo: XmiaomPromptInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 15_000);
  const startedAt = Date.now();

  try {
    const response = await net.fetch(promptInfo.sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        referer: "https://img.xmiaom.com/",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("xmiaom-import", "fetch:http-error", {
        imageId: promptInfo.imageId,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      logger.warn("xmiaom-import", "fetch:content-type-invalid", {
        imageId: promptInfo.imageId,
        contentType,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const html = await response.text();
    const draft = parseXmiaomPromptHtml(html, promptInfo.sourceUrl);

    if (!draft) {
      logger.warn("xmiaom-import", "fetch:parse-empty", {
        imageId: promptInfo.imageId,
        durationMs: Date.now() - startedAt,
        htmlLength: html.length,
        hasNextFlight: html.includes("self.__next_f.push"),
      });
      return null;
    }

    logger.info("xmiaom-import", "fetch:ok", {
      imageId: promptInfo.imageId,
      durationMs: Date.now() - startedAt,
      promptLength: draft.prompt.length,
      mediaCount: draft.sourceImageUrls?.length ?? (draft.sourceImageUrl ? 1 : 0),
    });

    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("xmiaom-import", "fetch:failed", {
      imageId: promptInfo.imageId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// 日志实测：hidden-fetch 常稳定超时 20s 且 ok=false；HTML 解析约 0.8-1.3s 即可拿到提示词/作者/封面。
// 因此导入以 HTML 快路径优先，hidden-fetch 仅在 HTML 不足时短超时兜底。
const jimengHiddenFetchTimeoutMs = 6_000;
const jimengHtmlFetchTimeoutMs = 12_000;

async function fetchJimengWorkDraft(
  workInfo: JimengWorkInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  assertImportNotTimedOut(deadline);

  const htmlDraft = await fetchJimengWorkDraftFromHtml(workInfo, deadline);

  if (htmlDraft && isSufficientJimengDraft(htmlDraft)) {
    return htmlDraft;
  }

  const remainingMs = deadline.expiresAtMs - Date.now();
  const budgetMs = Math.min(jimengHiddenFetchTimeoutMs, remainingMs);

  if (budgetMs <= 800) {
    return htmlDraft;
  }

  const capture = await captureJimengItemInfo(workInfo.sourceUrl, budgetMs);

  if (!capture) {
    logger.info("jimeng-import", "fetch:no-capture", { workId: workInfo.workId });
    return htmlDraft;
  }

  const captureDraft = parseJimengItemInfoPayload(capture.body, workInfo.sourceUrl);

  logger.info("jimeng-import", "fetch:parsed", {
    workId: workInfo.workId,
    bodyLen: capture.body.length,
    parsed: Boolean(captureDraft),
    hasVideo: Boolean(captureDraft?.sourceImageUrls?.some((url) => /\bvideo\b|vlabvod|\.mp4/i.test(url))),
  });

  return mergePromptImportDrafts(captureDraft ?? {}, htmlDraft ?? {});
}

async function fetchJimengWorkDraftFromHtml(
  workInfo: JimengWorkInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, jimengHtmlFetchTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await net.fetch(workInfo.sourceUrl, {
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
      logger.warn("jimeng-import", "html-fetch:http-error", {
        workId: workInfo.workId,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const finalUrl = response.url || workInfo.sourceUrl;
    const html = await response.text();
    const draft =
      parseJimengWorkHtml(html, finalUrl) ??
      parseJimengWorkHtml(html, workInfo.sourceUrl) ??
      (() => {
        const siteInfo = extractKnownPromptSiteInfo(finalUrl) ?? extractKnownPromptSiteInfo(workInfo.sourceUrl);
        return siteInfo ? parseKnownPromptSiteHtml(html, { ...siteInfo, sourceUrl: finalUrl }) : null;
      })();

    logger.info("jimeng-import", "html-fetch:parsed", {
      workId: workInfo.workId,
      durationMs: Date.now() - startedAt,
      parsed: Boolean(draft),
      promptLength: draft?.prompt.length ?? 0,
      authorName: draft?.authorName ?? null,
      mediaCount: draft?.sourceImageUrls?.length ?? (draft?.sourceImageUrl ? 1 : 0),
    });

    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("jimeng-import", "html-fetch:failed", {
      workId: workInfo.workId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isSufficientJimengDraft(draft: PromptImportDraft): boolean {
  const prompt = draft.prompt?.trim() ?? "";
  const mediaCount = draft.sourceImageUrls?.length ?? (draft.sourceImageUrl ? 1 : 0);

  if (!prompt || prompt.startsWith("来源链接：") || mediaCount <= 0) {
    return false;
  }

  // 视频条目若只有封面没有视频 URL，继续尝试 hidden-fetch 补视频直链。
  const wantsVideo =
    draft.tags?.includes("视频提示词") ||
    /workDetailType=AiVideo|itemType=53|AiVideo/i.test(draft.sourceUrl ?? "");
  const hasVideo = (draft.sourceImageUrls ?? []).some((url) => /\bvideo\b|vlabvod|\.mp4/i.test(url));

  if (wantsVideo && !hasVideo) {
    return false;
  }

  return true;
}

async function fetchKnownPromptSiteDraft(
  siteInfo: KnownPromptSiteInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 12_000);
  const startedAt = Date.now();

  try {
    const response = await net.fetch(siteInfo.sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        referer: siteInfo.siteUrl,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("known-site-import", "fetch:http-error", {
        siteName: siteInfo.siteName,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const html = await response.text();
    const draft = parseKnownPromptSiteHtml(html, siteInfo);

    if (!draft) {
      logger.warn("known-site-import", "fetch:parse-empty", {
        siteName: siteInfo.siteName,
        durationMs: Date.now() - startedAt,
        htmlLength: html.length,
      });
      return null;
    }

    const mediaUrls = draft.sourceImageUrls ?? (draft.sourceImageUrl ? [draft.sourceImageUrl] : []);
    logger.info("known-site-import", "fetch:ok", {
      siteName: siteInfo.siteName,
      durationMs: Date.now() - startedAt,
      promptLength: draft.prompt.length,
      mediaCount: mediaUrls.length,
      videoCount: mediaUrls.filter((url) =>
        /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:$|[?#])/i.test(url),
      ).length,
    });

    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("known-site-import", "fetch:failed", {
      siteName: siteInfo.siteName,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPromptDraftFromUrl(sourceUrl: string, deadline: ImportDeadline): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 8_000);

  try {
    const response = await net.fetch(sourceUrl, {
      headers: {
        "user-agent": "Suyan/0.1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    return parsePromptDraftFromHtml(await response.text(), sourceUrl);
  } catch {
    rethrowIfImportTimedOut(deadline);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGptImage2GalleryDrafts(
  galleryInfo: GptImage2GalleryInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft[]> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 12_000);

  try {
    const response = await net.fetch(galleryInfo.rawUrl, {
      headers: {
        accept: "text/markdown,text/plain,*/*",
        "user-agent": "Suyan/0.1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    return parseGptImage2GalleryMarkdown(await response.text(), galleryInfo);
  } catch {
    rethrowIfImportTimedOut(deadline);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAiartPromptDraft(
  promptId: string,
  sourceUrl: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const normalizedSourceUrl = normalizeAiartSourceUrl(sourceUrl, promptId);
  // api.aiart.pics 目前常返回 Cloudflare 525；同域 /api 可正常返回。
  const endpoints = [
    `https://aiart.pics/api/prompts/${encodeURIComponent(promptId)}`,
    `https://api.aiart.pics/api/prompts/${encodeURIComponent(promptId)}`,
  ];

  for (const endpoint of endpoints) {
    const draft = await fetchAiartPromptDraftFromEndpoint(endpoint, normalizedSourceUrl, deadline);

    if (draft) {
      return draft;
    }
  }

  return null;
}

async function fetchAiartPromptDraftFromEndpoint(
  endpoint: string,
  sourceUrl: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 8_000);
  const startedAt = Date.now();

  try {
    const response = await net.fetch(endpoint, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        origin: "https://aiart.pics",
        referer: "https://aiart.pics/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      logger.warn("aiart-import", "fetch:http-error", {
        endpoint,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const payload = (await response.json()) as unknown;
    const draft = parseAiartPromptPayload(payload, sourceUrl);

    if (!draft) {
      logger.warn("aiart-import", "fetch:parse-empty", {
        endpoint,
        durationMs: Date.now() - startedAt,
        payloadKeys: isRecord(payload) ? Object.keys(payload).slice(0, 12) : [],
      });
      return null;
    }

    const mediaUrls = draft.sourceImageUrls ?? (draft.sourceImageUrl ? [draft.sourceImageUrl] : []);
    logger.info("aiart-import", "fetch:ok", {
      endpoint,
      durationMs: Date.now() - startedAt,
      mediaCount: mediaUrls.length,
      videoCount: mediaUrls.filter((url) =>
        /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:$|[?#])/i.test(url),
      ).length,
      promptLength: draft.prompt.length,
    });

    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("aiart-import", "fetch:failed", {
      endpoint,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAiartSourceUrl(sourceUrl: string, promptId: string): string {
  const trimmed = sourceUrl.trim();

  try {
    const url = new URL(trimmed);

    if (url.hostname.toLowerCase().includes("aiart.pics")) {
      return trimmed;
    }
  } catch {
  }

  return `https://aiart.pics/prompts/${encodeURIComponent(promptId)}`;
}

async function fetchAipromptfillShareDraft(
  code: string,
  sourceUrl: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 8_000);
  const endpoint = `https://data.tanshilong.com/api/share/${encodeURIComponent(code)}`;
  const startedAt = Date.now();

  try {
    const response = await net.fetch(endpoint, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        origin: "https://aipromptfill.com",
        referer: "https://aipromptfill.com/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      logger.warn("aipromptfill-import", "fetch:http-error", {
        code,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return fetchAipromptfillShareDraftFromReader(endpoint, sourceUrl, deadline);
    }

    const payload = (await response.json()) as unknown;

    if (!isRecord(payload) || typeof payload.data !== "string") {
      logger.warn("aipromptfill-import", "fetch:payload-invalid", {
        code,
        durationMs: Date.now() - startedAt,
        payloadKeys: isRecord(payload) ? Object.keys(payload).slice(0, 12) : [],
      });
      return fetchAipromptfillShareDraftFromReader(endpoint, sourceUrl, deadline);
    }

    const decoded = decodeAipromptfillShareData(payload.data);
    const draft = parseAipromptfillSharePayload(decoded, sourceUrl);

    if (!draft) {
      logger.warn("aipromptfill-import", "fetch:parse-empty", {
        code,
        durationMs: Date.now() - startedAt,
        decodedKeys: isRecord(decoded) ? Object.keys(decoded).slice(0, 16) : [],
      });
      return null;
    }

    const mediaUrls = draft.sourceImageUrls ?? (draft.sourceImageUrl ? [draft.sourceImageUrl] : []);
    logger.info("aipromptfill-import", "fetch:ok", {
      code,
      durationMs: Date.now() - startedAt,
      promptLength: draft.prompt.length,
      mediaCount: mediaUrls.length,
      videoCount: mediaUrls.filter((url) =>
        /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:$|[?#])/i.test(url),
      ).length,
      imageCount: mediaUrls.filter(
        (url) =>
          !/\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:$|[?#])/i.test(url),
      ).length,
    });

    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("aipromptfill-import", "fetch:failed", {
      code,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return fetchAipromptfillShareDraftFromReader(endpoint, sourceUrl, deadline);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchXStatusDraft(statusInfo: XStatusInfo, deadline: ImportDeadline): Promise<PromptImportDraft | null> {
  return (
    (await fetchFxTwitterStatusDraft(statusInfo, deadline)) ??
    (await fetchVxTwitterStatusDraft(statusInfo, deadline)) ??
    (await fetchXStatusSyndicationDraft(statusInfo, deadline))
  );
}

async function fetchFxTwitterStatusDraft(
  statusInfo: XStatusInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  if (!statusInfo.username) {
    return null;
  }

  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 10_000);
  const startedAt = Date.now();

  try {
    const response = await net.fetch(
      `https://api.fxtwitter.com/${encodeURIComponent(statusInfo.username)}/status/${encodeURIComponent(
        statusInfo.statusId,
      )}`,
      {
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      logger.warn("x-import", "fxtwitter:http-error", {
        statusId: statusInfo.statusId,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const draft = parseFxTwitterTweetPayload((await response.json()) as unknown, statusInfo.sourceUrl);
    logXImportDraft("fxtwitter", statusInfo.statusId, draft, Date.now() - startedAt);
    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("x-import", "fxtwitter:failed", {
      statusId: statusInfo.statusId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchVxTwitterStatusDraft(
  statusInfo: XStatusInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 10_000);
  const startedAt = Date.now();
  const username = statusInfo.username || "Twitter";

  try {
    const response = await net.fetch(
      `https://api.vxtwitter.com/${encodeURIComponent(username)}/status/${encodeURIComponent(statusInfo.statusId)}`,
      {
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      logger.warn("x-import", "vxtwitter:http-error", {
        statusId: statusInfo.statusId,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const draft = parseFxTwitterTweetPayload((await response.json()) as unknown, statusInfo.sourceUrl);
    logXImportDraft("vxtwitter", statusInfo.statusId, draft, Date.now() - startedAt);
    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("x-import", "vxtwitter:failed", {
      statusId: statusInfo.statusId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchXStatusSyndicationDraft(
  statusInfo: XStatusInfo,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 10_000);
  const startedAt = Date.now();
  const query = new URLSearchParams({
    id: statusInfo.statusId,
    token: getXStatusSyndicationToken(statusInfo.statusId),
    lang: "en",
  });

  try {
    const response = await net.fetch(`https://cdn.syndication.twimg.com/tweet-result?${query.toString()}`, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("x-import", "syndication:http-error", {
        statusId: statusInfo.statusId,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    const draft = parseXStatusSyndicationPayload((await response.json()) as unknown, statusInfo.sourceUrl);
    logXImportDraft("syndication", statusInfo.statusId, draft, Date.now() - startedAt);
    return draft;
  } catch (error) {
    rethrowIfImportTimedOut(deadline);
    logger.warn("x-import", "syndication:failed", {
      statusId: statusInfo.statusId,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function logXImportDraft(
  source: string,
  statusId: string,
  draft: PromptImportDraft | null,
  durationMs: number,
): void {
  if (!draft) {
    logger.warn("x-import", `${source}:parse-empty`, { statusId, durationMs });
    return;
  }

  const mediaUrls = draft.sourceImageUrls ?? (draft.sourceImageUrl ? [draft.sourceImageUrl] : []);
  logger.info("x-import", `${source}:ok`, {
    statusId,
    durationMs,
    promptLength: draft.prompt.length,
    mediaCount: mediaUrls.length,
    videoCount: mediaUrls.filter((url) =>
      /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|avi|wmv|flv|3gp|3g2|ts|mts|m2ts|mpeg|mpg|asf|f4v)(?:$|[?#])/i.test(url),
    ).length,
  });
}

function getXStatusSyndicationToken(statusId: string): string {
  return ((Number(statusId) / 1e15) * Math.PI).toString(36);
}

async function fetchAipromptfillShareDraftFromReader(
  endpoint: string,
  sourceUrl: string,
  deadline: ImportDeadline,
): Promise<PromptImportDraft | null> {
  const controller = new AbortController();
  const timeout = createImportAbortTimeout(controller, deadline, 8_000);

  try {
    const readerUrl = `https://r.jina.ai/http://${endpoint.replace(/^https?:\/\//, "")}`;
    const response = await net.fetch(readerUrl, {
      headers: {
        accept: "text/plain",
        "user-agent": "Suyan/0.1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const jsonStartIndex = text.indexOf("{");

    if (jsonStartIndex < 0) {
      return null;
    }

    const payload = JSON.parse(text.slice(jsonStartIndex)) as unknown;

    if (!isRecord(payload) || typeof payload.data !== "string") {
      return null;
    }

    return parseAipromptfillSharePayload(decodeAipromptfillShareData(payload.data), sourceUrl);
  } catch {
    rethrowIfImportTimedOut(deadline);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeAipromptfillShareData(input: string): unknown {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");

  while (base64.length % 4) {
    base64 += "=";
  }

  return JSON.parse(inflateSync(Buffer.from(base64, "base64")).toString("utf8")) as unknown;
}
