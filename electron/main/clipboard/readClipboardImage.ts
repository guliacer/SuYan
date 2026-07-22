import { clipboard, net } from "electron";
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import type { LibraryItem, NetworkMaterialImportMode } from "../../../src/features/library/types/library";
import { normalizePromptType } from "../../../src/features/library/utils/promptType";
import {
  createEmptyPromptImportDraft,
  createPromptImportDuplicateKey,
  getImportableRemoteMediaUrls,
  mergePromptImportDrafts,
  parsePromptDraftFromImageMetadata,
  type PromptImportDraft,
} from "../../shared/promptImportParser";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { createImportedPromptPlaceholderImage } from "../library/defaultLibrarySeed";
import { warmImageThumbnails } from "../library/imageThumbnails";
import { importImageFilePaths } from "../library/imageFiles";
import { readClipboardFilePaths } from "./readClipboardFilePaths";
import {
  getMediaExtensionFromMime,
  getMediaExtensionFromUrlPath,
  isVideoMediaExtension,
  writeImportImageBuffer,
  writeImportMediaBuffer,
} from "../library/importedImageWriter";
import { getImagePath } from "../library/libraryPaths";
import { appendLibraryItems, readLibraryFile } from "../library/libraryStore";
import {
  createImportAbortTimeout,
  createImportDeadline,
  resolveKnownShareDraftsFromText,
  resolvePromptDraftFromText,
  rethrowIfImportTimedOut,
  assertImportNotTimedOut,
  type ImportDeadline,
} from "./shareSourceFetchers";

const promptImportTotalTimeoutMs = 90_000;

export async function importClipboardImage(): Promise<{
  library: Awaited<ReturnType<typeof readLibraryFile>>;
  importedCount: number;
  importedPromptCount?: number;
  importedImageCount?: number;
  skippedDuplicateCount?: number;
  canceled?: boolean;
}> {
  const image = clipboard.readImage();
  const clipboardText = clipboard.readText().trim();

  if (image.isEmpty() && !clipboardText) {
    const clipboardFilePaths = await readClipboardFilePaths();

    if (clipboardFilePaths.length > 0) {
      const result = await importImageFilePaths(clipboardFilePaths);

      if (result.importedCount === 0) {
        throw new AppError("CLIPBOARD_EMPTY", "剪切板中没有可用图片或文本。");
      }

      warmImageThumbnails(result.library.items.slice(0, result.importedCount).map((item) => item.imageFileName));

      return {
        library: result.library,
        importedCount: result.importedCount,
        importedPromptCount: result.importedCount,
        importedImageCount: result.importedCount,
        skippedDuplicateCount: 0,
      };
    }

    throw new AppError("CLIPBOARD_EMPTY", "剪切板中没有可用图片或文本。");
  }

  const now = new Date().toISOString();
  let draft = createEmptyPromptImportDraft();
  let items: LibraryItem[] = [];
  let importedPromptCount = 0;
  let skippedDuplicateCount = 0;
  const importDeadline = createImportDeadline(promptImportTotalTimeoutMs);
  const startedAtMs = Date.now();
  let parsedAtMs = startedAtMs;
  let imagesReadyAtMs = startedAtMs;
  const knownShareDrafts = clipboardText ? await resolveKnownShareDraftsFromText(clipboardText, importDeadline) : null;
  parsedAtMs = Date.now();

  if (knownShareDrafts) {
    const networkImportMode = await resolveNetworkMaterialImportMode(knownShareDrafts);

    if (networkImportMode === null) {
      return {
        library: await readLibraryFile(),
        importedCount: 0,
        importedPromptCount: 0,
        importedImageCount: 0,
        skippedDuplicateCount: 0,
        canceled: true,
      };
    }

    if (knownShareDrafts.length > 1) {
      const result = await createUniqueItemsFromRemoteDrafts(knownShareDrafts, now, importDeadline, networkImportMode);

      items = result.items;
      importedPromptCount = result.importedPromptCount;
      skippedDuplicateCount = result.skippedDuplicateCount;
    } else {
      draft = knownShareDrafts[0] ?? createEmptyPromptImportDraft();
      items = await createItemsFromRemoteDraftImages(draft, now, importDeadline, networkImportMode);

      // 分享链接可能只有提示词、没有可下载效果图；仍应入库，避免“没有新增提示词”。
      // 若有远程图但下载失败，保留 pending 链接，后续可刷新签名后再补下。
      if (items.length === 0 && draft.prompt.trim()) {
        const fallbackRemoteUrl =
          getDraftSourceImageUrls(draft)[0] ?? draft.sourceImageUrl ?? draft.sourceImageUrls?.[0] ?? null;
        const id = randomUUID();
        const imageFileName = `${id}.png`;
        await fs.writeFile(
          getImagePath(imageFileName),
          createImportedPromptPlaceholderImage(
            `${draft.title}\n${draft.prompt}\n${draft.sourceUrl ?? clipboardText}`,
          ),
        );
        items = [
          createLibraryItemFromDraft(draft, id, imageFileName, now, {
            remoteImageStatus: fallbackRemoteUrl ? "pending" : null,
            remoteImageUrl: fallbackRemoteUrl,
          }),
        ];
      }

      importedPromptCount = items.length > 0 ? 1 : 0;
    }

    const sourceImageUrlCount = knownShareDrafts.reduce((total, item) => total + getDraftSourceImageUrls(item).length, 0);

    if (items.length === 0 && sourceImageUrlCount > 0 && skippedDuplicateCount === 0) {
      throw new AppError("PROMPT_SHARE_IMAGE_IMPORT_FAILED", "已识别分享提示词，但效果图下载失败。");
    }

    if (items.length === 0 && skippedDuplicateCount === 0 && knownShareDrafts.some((item) => item.prompt.trim())) {
      throw new AppError("PROMPT_SHARE_IMPORT_FAILED", "分享链接已识别，但未能导入提示词，请重试。");
    }
  } else if (!image.isEmpty()) {
    const id = randomUUID();
    const encodedClipboardImage = readClipboardEncodedImage();
    const imageBuffer = encodedClipboardImage ? Buffer.from(encodedClipboardImage) : image.toPNG();
    const metadataDraft = encodedClipboardImage
      ? parsePromptDraftFromImageMetadata(encodedClipboardImage)
      : createEmptyPromptImportDraft();
    const textDraft = clipboardText
      ? await resolvePromptDraftFromText(clipboardText, importDeadline)
      : createEmptyPromptImportDraft();

    draft = mergePromptImportDrafts(metadataDraft, textDraft);
    const imageFileName = await writeImportImageBuffer(id, imageBuffer, ".png");
    items = [createLibraryItemFromDraft(draft, id, imageFileName, now)];
    importedPromptCount = 1;
  } else {
    draft = await resolvePromptDraftFromText(clipboardText, importDeadline);
    const networkImportMode = await resolveNetworkMaterialImportMode([draft]);

    if (networkImportMode === null) {
      return {
        library: await readLibraryFile(),
        importedCount: 0,
        importedPromptCount: 0,
        importedImageCount: 0,
        skippedDuplicateCount: 0,
        canceled: true,
      };
    }

    items = await createItemsFromRemoteDraftImages(draft, now, importDeadline, networkImportMode);

    if (items.length === 0) {
      const id = randomUUID();
      const imageFileName = `${id}.png`;
      await fs.writeFile(
        getImagePath(imageFileName),
        createImportedPromptPlaceholderImage(`${draft.title}\n${draft.prompt}\n${clipboardText}`),
      );
      items = [createLibraryItemFromDraft(draft, id, imageFileName, now)];
    }

    importedPromptCount = items.length > 0 ? 1 : 0;
  }

  imagesReadyAtMs = Date.now();

  warmImageThumbnails(items.map((item) => item.imageFileName));
  const library = items.length > 0 ? await appendLibraryItems(items) : await readLibraryFile();

  const finishedAtMs = Date.now();
  logger.info("main", "import:timing", {
    totalMs: finishedAtMs - startedAtMs,
    parseMs: parsedAtMs - startedAtMs,
    downloadImagesMs: imagesReadyAtMs - parsedAtMs,
    writeStoreMs: finishedAtMs - imagesReadyAtMs,
    itemCount: items.length,
  });

  return {
    library,
    importedCount: items.length,
    importedPromptCount,
    importedImageCount: items.length,
    skippedDuplicateCount,
  };
}

async function createUniqueItemsFromRemoteDrafts(
  drafts: PromptImportDraft[],
  now: string,
  deadline: ImportDeadline,
  networkImportMode: Exclude<NetworkMaterialImportMode, "ask">,
): Promise<{ items: LibraryItem[]; importedPromptCount: number; skippedDuplicateCount: number }> {
  assertImportNotTimedOut(deadline);
  const library = await readLibraryFile();
  const existingPromptKeys = new Set(
    library.items.map((item) => createPromptImportDuplicateKey(item.prompt)).filter(Boolean),
  );
  const existingSourceUrls = new Set(
    library.items.map((item) => normalizeImportSourceUrl(item.sourceUrl)).filter(Boolean),
  );
  const pendingDrafts: PromptImportDraft[] = [];
  let skippedDuplicateCount = 0;

  for (const draft of drafts) {
    const promptKey = createPromptImportDuplicateKey(draft.prompt);
    const sourceUrl = normalizeImportSourceUrl(draft.sourceUrl);

    if ((promptKey && existingPromptKeys.has(promptKey)) || (sourceUrl && existingSourceUrls.has(sourceUrl))) {
      skippedDuplicateCount += 1;
      continue;
    }

    pendingDrafts.push(draft);

    if (promptKey) {
      existingPromptKeys.add(promptKey);
    }

    if (sourceUrl) {
      existingSourceUrls.add(sourceUrl);
    }
  }

  const itemGroups = await mapWithConcurrency(pendingDrafts, 4, (draft) =>
    createItemsFromRemoteDraftImages(draft, now, deadline, networkImportMode),
  );

  return {
    items: itemGroups.flat(),
    importedPromptCount: itemGroups.filter((group) => group.length > 0).length,
    skippedDuplicateCount,
  };
}

async function createItemsFromRemoteDraftImages(
  draft: PromptImportDraft,
  now: string,
  deadline: ImportDeadline,
  networkImportMode: Exclude<NetworkMaterialImportMode, "ask">,
): Promise<LibraryItem[]> {
  const sourceImageUrls = getDraftSourceImageUrls(draft);
  const items: LibraryItem[] = [];
  const seenImageHashes = new Set<string>();
  const seenImageUrls = new Set<string>();

  for (const sourceImageUrl of sourceImageUrls) {
    assertImportNotTimedOut(deadline);

    if (networkImportMode === "link") {
      const normalizedSourceImageUrl = sourceImageUrl.trim();

      if (!normalizedSourceImageUrl || seenImageUrls.has(normalizedSourceImageUrl)) {
        continue;
      }

      seenImageUrls.add(normalizedSourceImageUrl);
      items.push(await createRemoteLinkLibraryItemFromDraft(draft, normalizedSourceImageUrl, now));
      continue;
    }

    const remoteImage = await fetchRemoteImage(sourceImageUrl, deadline);

    if (!remoteImage) {
      continue;
    }

    const imageHash = await hashImageBuffer(remoteImage.buffer);
    if (seenImageHashes.has(imageHash)) {
      continue;
    }
    seenImageHashes.add(imageHash);

    const id = randomUUID();
    const imageFileName = await writeImportMediaBuffer(id, remoteImage.buffer, remoteImage.extension);

    items.push(createLibraryItemFromDraft(draft, id, imageFileName, now, {
      remoteImageStatus: "downloaded",
      remoteImageUrl: sourceImageUrl,
    }));
  }

  return items;
}

async function resolveNetworkMaterialImportMode(
  _drafts: PromptImportDraft[],
): Promise<Exclude<NetworkMaterialImportMode, "ask"> | null> {
  return "download";
}

async function createRemoteLinkLibraryItemFromDraft(
  draft: PromptImportDraft,
  sourceImageUrl: string,
  now: string,
): Promise<LibraryItem> {
  const id = randomUUID();
  const imageFileName = `${id}.png`;

  await fs.writeFile(
    getImagePath(imageFileName),
    createImportedPromptPlaceholderImage(`${draft.title}\n${draft.prompt}\n${sourceImageUrl}`),
  );

  return createLibraryItemFromDraft(draft, id, imageFileName, now, {
    remoteImageStatus: "pending",
    remoteImageUrl: sourceImageUrl,
  });
}

function getDraftSourceImageUrls(draft: PromptImportDraft): string[] {
  return getImportableRemoteMediaUrls([...(draft.sourceImageUrls ?? []), draft.sourceImageUrl ?? ""]);
}

function hashImageBuffer(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
}

function normalizeImportSourceUrl(input: string | null | undefined): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      const item = items[currentIndex];
      nextIndex += 1;

      if (item !== undefined) {
        results[currentIndex] = await mapper(item);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  return results;
}

function createLibraryItemFromDraft(
  draft: PromptImportDraft,
  id: string,
  imageFileName: string,
  now: string,
  remoteImage?: Pick<LibraryItem, "remoteImageStatus" | "remoteImageUrl">,
): LibraryItem {
  return {
    id,
    title: draft.title || `剪切板素材 ${new Date().toLocaleString("zh-CN")}`,
    imageFileName,
    prompt: draft.prompt,
    negativePrompt: draft.negativePrompt,
    tags: draft.tags,
    generationMethod: draft.generationMethod,
    promptType: normalizePromptType(undefined, {
      imageFileName,
      prompt: draft.prompt,
      tags: draft.tags,
      generationMethod: draft.generationMethod,
      title: draft.title,
    }),
    sourceUrl: draft.sourceUrl,
    remoteImageUrl: remoteImage?.remoteImageUrl ?? null,
    remoteImageStatus: remoteImage?.remoteImageStatus ?? null,
    authorName: draft.authorName,
    authorUrl: draft.authorUrl,
    authorAvatarUrl: draft.authorAvatarUrl ?? getSiteLogoUrl(draft.authorUrl ?? draft.sourceUrl),
    createdAt: now,
    updatedAt: now,
  };
}

function getSiteLogoUrl(input: string | null | undefined): string | null {
  if (!input?.trim()) {
    return null;
  }

  try {
    const url = new URL(input.trim());

    return url.protocol === "https:" ? `${url.origin}/favicon.ico` : null;
  } catch {
    return null;
  }
}

async function fetchRemoteImage(
  sourceUrl: string,
  deadline: ImportDeadline,
): Promise<{ buffer: Buffer; extension: string } | null> {
  const headerVariants = getRemoteImageHeaderVariants(sourceUrl);

  for (const headers of headerVariants) {
    const controller = new AbortController();
    const timeout = createImportAbortTimeout(controller, deadline, 45_000);

    try {
      const response = await net.fetch(sourceUrl, {
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const extension = getRemoteMediaExtension(sourceUrl, contentType);

      if (!extension) {
        continue;
      }

      const isVideo = isVideoMediaExtension(extension);
      const maxSize = isVideo ? 80 * 1024 * 1024 : 24 * 1024 * 1024;
      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0 || buffer.length > maxSize) {
        continue;
      }

      return { buffer, extension };
    } catch {
      rethrowIfImportTimedOut(deadline);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function getRemoteImageHeaderVariants(sourceUrl: string): Array<Record<string, string>> {
  const pathExtension = getMediaExtensionFromUrlPath(sourceUrl);
  const isVideoUrl = (pathExtension ? isVideoMediaExtension(pathExtension) : false) || /[/?&=]video/i.test(sourceUrl);
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

    if (hostname.includes("byteimg.com") || hostname.includes("jimeng.jianying.com")) {
      return "https://jimeng.jianying.com/";
    }
  } catch {
  }

  return "https://aipromptfill.com/";
}

function getRemoteMediaExtension(sourceUrl: string, contentType: string): string | null {
  return getMediaExtensionFromMime(contentType) ?? getMediaExtensionFromUrlPath(sourceUrl);
}

function readClipboardEncodedImage(): Uint8Array | null {
  const imageFormat = clipboard
    .availableFormats()
    .find((format) => ["png", "image/png"].includes(format.toLowerCase()) || format.toLowerCase().includes("png"));

  if (!imageFormat) {
    return null;
  }

  const buffer = clipboard.readBuffer(imageFormat);

  return buffer.length > 0 ? buffer : null;
}
