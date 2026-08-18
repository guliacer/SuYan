import { BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import type {
  AiAnalyzePromptPayload,
  AiImageGenerationPayload,
  AiOptimizePromptPayload,
  AiSummarizePromptTitlePayload,
  AiReverseImagePromptPayload,
  AiTranslatePromptPayload,
  SaveAiProviderSettingsPayload,
} from "../../../src/features/library/types/ai";
import type {
  LibraryFile,
  LibraryViewSettings,
  PromptLexiconEntry,
  PromptLexiconKind,
} from "../../../src/features/library/types/library";
import type { ProxySettings } from "../../../src/features/library/types/proxy";
import { IpcChannelName, ipcChannels } from "../../shared/ipcChannels";
import { openExternalUrl } from "../app/externalUrl";
import { openAppDataDirectory } from "../app/dataDirectory";
import { checkForAppUpdates } from "../app/updateChecker";
import {
  readAppAccelerationStatus,
  writeAppAccelerationSettings,
} from "../app/gpuAccelerationSettings";
import {
  readPrivateAiProviderProfileById,
  readPublicAiProviderSettings,
  writeAiProviderSettings,
} from "../ai/aiSettingsStore";
import {
  exportSettingsBackup,
  importSettingsApply,
  importSettingsPreview,
} from "../ai/aiSettingsBackupService";
import {
  analyzePromptWithRemoteAi,
  generateImagesWithRemoteAi,
  listAiProviderModels,
  optimizePromptWithRemoteAi,
  reverseImagePromptWithRemoteAi,
  summarizePromptTitleWithRemoteAi,
  testAiProviderSettings,
  translatePromptWithRemoteAi,
} from "../ai/promptAnalysisService";
import {
  generateImagesWithDoubaoWeb,
  hideDoubaoWebCanvas,
  prepareDoubaoWebCanvas,
  refreshDoubaoWebCanvasAuth,
  setDoubaoWebCanvasBounds,
  showDoubaoWebCanvas,
} from "../ai/doubaoWebCanvas";
import {
  disposeWebAssistant,
  hideWebAssistant,
  prepareWebAssistant,
  setWebAssistantBounds,
  showWebAssistant,
} from "../webAssistant/webAssistantView";
import {
  type WebAssistantBounds,
  type WebAssistantPlatform,
  type WebAssistantPrepareInput,
  type WebAssistantTargetId,
} from "../../../src/features/library/types/webAssistant";
import { importClipboardImage } from "../clipboard/readClipboardImage";
import { exportLibraryZip, importLibraryZip } from "../library/archiveStore";
import { chooseAndImportManagedDirectory } from "../library/directoryImport";
import {
  readCanvasReferenceImage,
  removeCanvasReferenceImage,
  saveCanvasReferenceImage,
} from "../library/canvasReferenceImages";
import {
  cancelImport,
  copyImageToClipboard,
  deleteLibraryItems,
  exportImageToLocal,
  importClipboardImageForItem,
  importImageFilesForItem,
  importImageFiles,
  importImageBuffers,
  importGeneratedImages,
  type GeneratedImageImportPayload,
  type ImportImageBufferInput,
  importVideoReferenceImagesForItem,
  deleteVideoReferenceImageForItem,
  importClipboardReferenceImageForItem,
  importReferenceImageFromUrlForItem,
} from "../library/imageFiles";
import { generateVideoFramesForItem } from "../library/videoFrames";
import { getOrCreateImageThumbnailPath, getOrCreateImageThumbnailPathForItem } from "../library/imageThumbnails";
import {
  exportPromptLexicon,
  importPromptLexicon,
  importPromptLexiconImage,
} from "../library/lexiconFiles";
import { getImageThumbnailPath, getImagePath } from "../library/libraryPaths";
import { resolveMediaAbsolutePath } from "../library/mediaPathResolver";
import {
  findLibraryItemByImageFileName,
  readLibraryFile,
  saveLibraryFileFromRenderer,
} from "../library/libraryStore";
import { chooseAndAddLibraryRoot, readLibraryRoots, reorderLibraryRoots } from "../library/libraryRoots";
import { scanExternalLibraryRoot } from "../library/externalLibraryScanner";
import {
  detachExternalLibraryRoot,
  remapExternalLibraryRoot,
  purgeMissingExternalLibraryItems,
  validateExternalLibrary,
} from "../library/externalLibraryManager";
import {
  refreshExternalLibraryRootWatcher,
  setExternalLibraryRootWatch,
  stopExternalLibraryRootWatcher,
} from "../library/externalLibraryWatcher";
import { downloadRemoteMaterialForItem } from "../library/remoteMaterialDownload";
import { readLibraryViewSettings, writeLibraryViewSettings } from "../library/viewSettingsStore";
import {
  importStartupGalleryImages,
  importStartupGalleryImageFromClipboard,
  listStartupGalleryImages,
  removeStartupGalleryImage,
  resetStartupGalleryToDefault,
} from "../library/startupGalleryStore";
import { importWordDocument } from "../library/wordDocumentImport";
import {
  detectProxySettings,
  readProxySettings,
  testProxySettings,
  writeProxySettings,
} from "../network/proxySettingsStore";
import { logStartupEvent, logger } from "../startupLog";
import { exportLogs } from "../appLogger";
import { reportLibrarySize } from "../performance/performanceMonitor";
import {
  cancelCompress,
  compressImages,
  compressVideos,
  scanDuplicates,
  type ImageCompressOptions,
  type VideoCompressOptions,
} from "../batch";
import {
  checkModuleInstalled,
  installModuleFromGithub,
  installModuleFromLocal,
} from "../modules/moduleInstaller";
import {
  installFfmpegComponentFromDownload,
  installFfmpegComponentFromLocal,
} from "../modules/ffmpegComponentInstall";
import { AppError, toErrorPayload } from "./errors";

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export function registerIpcHandlers(): void {
  ipcMain.on(ipcChannels.appRendererReady, () => {
    logStartupEvent("renderer:ready");
  });
  ipcMain.on(ipcChannels.appStartupLog, (_event, event, details) => {
    if (typeof event !== "string" || event.trim().length === 0) {
      return;
    }

    logStartupEvent(`renderer:${event.trim().slice(0, 80)}`, isPlainRecord(details) ? details : {});
  });
  ipcMain.handle(ipcChannels.appOpenExternalUrl, (_event, url: string) =>
    handleResult("app:open-external-url", () => openExternalUrl(url)),
  );
  ipcMain.handle(ipcChannels.appOpenDataDirectory, () =>
    handleResult("app:open-data-directory", () => openAppDataDirectory()),
  );
  ipcMain.handle(ipcChannels.appUpdateCheck, () =>
    handleResult("app:update-check", () => checkForAppUpdates()),
  );
  ipcMain.handle(ipcChannels.appAccelerationStatusRead, () =>
    handleResult("app:acceleration-status-read", async () => readAppAccelerationStatus()),
  );
  ipcMain.handle(ipcChannels.appAccelerationSettingsSave, (_event, settings: unknown) =>
    handleResult("app:acceleration-settings-save", () => writeAppAccelerationSettings(settings)),
  );

  ipcMain.handle(ipcChannels.libraryRead, () =>
    handleResult("library:read", async () => {
      const library = await readLibraryFile({ refreshExternalHealth: true });
      reportLibrarySize(library.items.length);
      return library;
    }),
  );
  ipcMain.handle(ipcChannels.librarySave, (_event, library: LibraryFile) =>
    handleResult("library:save", () => saveLibraryFileFromRenderer(library)),
  );
  ipcMain.handle(ipcChannels.libraryViewSettingsRead, () =>
    handleResult("library:view-settings-read", () => readLibraryViewSettings()),
  );
  ipcMain.handle(ipcChannels.libraryViewSettingsSave, (_event, settings: LibraryViewSettings) =>
    handleResult("library:view-settings-save", () => writeLibraryViewSettings(settings)),
  );
  ipcMain.handle(ipcChannels.libraryRootsList, () => handleResult("library:roots-list", () => readLibraryRoots()));
  ipcMain.handle(ipcChannels.libraryRootOrderSet, (_event, rootIds: unknown) =>
    handleResult("library:root-order-set", () => {
      if (!Array.isArray(rootIds) || !rootIds.every((rootId) => typeof rootId === "string")) {
        throw new Error("素材目录顺序数据无效。");
      }

      return reorderLibraryRoots(rootIds);
    }),
  );
  ipcMain.handle(ipcChannels.libraryDirectoryChooseAndImport, (event) =>
    handleResult("library:directory-choose-and-import", () =>
      chooseAndImportManagedDirectory(
        (progress) => event.sender.send(IpcChannelName.ImageImportProgress, progress),
        BrowserWindow.fromWebContents(event.sender),
      ),
    ),
  );
  ipcMain.handle(ipcChannels.libraryRootChooseAndScan, (event) =>
    handleResult("library:root-choose-and-scan", async () => {
      const selection = await chooseAndAddLibraryRoot(BrowserWindow.fromWebContents(event.sender));

      if (!selection.root) {
        return {
          canceled: true,
          library: await readLibraryFile(),
          root: null,
          importedCount: 0,
          skippedCount: 0,
        };
      }

      const result = await scanExternalLibraryRoot(selection.root.id, (progress) => {
        event.sender.send(IpcChannelName.ImageImportProgress, progress);
      });
      return { ...result, canceled: false };
    }),
  );
  ipcMain.handle(ipcChannels.libraryRootScan, (event, rootId: string) =>
    handleResult("library:root-scan", async () => {
      const result = await scanExternalLibraryRoot(rootId, (progress) => {
        event.sender.send(IpcChannelName.ImageImportProgress, progress);
      });
      return { ...result, canceled: false };
    }),
  );
  ipcMain.handle(ipcChannels.libraryRootRemap, (event, rootId: string) =>
    handleResult("library:root-remap", async () => {
      await stopExternalLibraryRootWatcher(rootId);

      try {
        return await remapExternalLibraryRoot(rootId, BrowserWindow.fromWebContents(event.sender));
      } finally {
        await refreshExternalLibraryRootWatcher(rootId);
      }
    }),
  );
  ipcMain.handle(ipcChannels.libraryRootRemove, (_event, rootId: string) =>
    handleResult("library:root-remove", async () => {
      await stopExternalLibraryRootWatcher(rootId);

      try {
        return await detachExternalLibraryRoot(rootId);
      } catch (error) {
        await refreshExternalLibraryRootWatcher(rootId);
        throw error;
      }
    }),
  );
  ipcMain.handle(ipcChannels.libraryRootPurgeMissing, (_event, rootId: string) =>
    handleResult("library:root-purge-missing", () => purgeMissingExternalLibraryItems(rootId)),
  );
  ipcMain.handle(ipcChannels.libraryRootWatchSet, (_event, rootId: string, enabled: boolean) =>
    handleResult("library:root-watch-set", () => setExternalLibraryRootWatch(rootId, enabled)),
  );
  ipcMain.handle(ipcChannels.libraryExternalValidate, () =>
    handleResult("library:external-validate", () => validateExternalLibrary()),
  );
  ipcMain.handle(ipcChannels.startupGalleryList, () =>
    handleResult("startup-gallery:list", () => listStartupGalleryImages()),
  );
  ipcMain.handle(ipcChannels.startupGalleryImport, () =>
    handleResult("startup-gallery:import", async () => {
      const result = await dialog.showOpenDialog({
        title: "添加启动页图片",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { images: await listStartupGalleryImages(), importedCount: 0, canceled: true };
      }

      const images = await importStartupGalleryImages(result.filePaths);

      return { images, importedCount: result.filePaths.length, canceled: false };
    }),
  );
  ipcMain.handle(ipcChannels.startupGalleryImportFromClipboard, () =>
    handleResult("startup-gallery:import-from-clipboard", async () => {
      const result = await importStartupGalleryImageFromClipboard();

      return { ...result, canceled: false };
    }),
  );
  ipcMain.handle(ipcChannels.startupGalleryRemove, (_event, fileName: string) =>
    handleResult("startup-gallery:remove", () => removeStartupGalleryImage(fileName)),
  );
  ipcMain.handle(ipcChannels.startupGalleryReset, () =>
    handleResult("startup-gallery:reset", () => resetStartupGalleryToDefault()),
  );
  ipcMain.handle(ipcChannels.imageImportFiles, (event) =>
    handleResult("image:import-files", () =>
      importImageFiles((progress) => {
        event.sender.send(IpcChannelName.ImageImportProgress, progress);
      }, BrowserWindow.fromWebContents(event.sender)),
    ),
  );
  ipcMain.handle(ipcChannels.imageImportCancel, () => {
    cancelImport();
    return { ok: true, data: { canceled: true } };
  });
  ipcMain.handle(ipcChannels.imageImportBuffers, (_event, images: unknown) =>
    handleResult("image:import-buffers", () => importImageBuffers(normalizeImportImageBuffers(images))),
  );
  ipcMain.handle(ipcChannels.imageImportGenerated, (_event, payload: unknown) =>
    handleResult("image:import-generated", () => importGeneratedImages(normalizeGeneratedImageImportPayload(payload))),
  );
  ipcMain.handle(ipcChannels.imageImportFilesForItem, (event, itemId: string) =>
    handleResult("image:import-files-for-item", () =>
      importImageFilesForItem(itemId, BrowserWindow.fromWebContents(event.sender)),
    ),
  );
  ipcMain.handle(ipcChannels.wordDocumentImport, () => handleResult("word:import-document", () => importWordDocument()));
  ipcMain.handle(ipcChannels.imageImportFromClipboard, () =>
    handleResult("image:import-from-clipboard", () => importClipboardImage()),
  );
  ipcMain.handle(ipcChannels.imageImportClipboardForItem, (_event, itemId: string) =>
    handleResult("image:import-clipboard-for-item", () => importClipboardImageForItem(itemId)),
  );
  ipcMain.handle(ipcChannels.imageRemoteMaterialDownload, (_event, itemId: string) =>
    handleResult("image:remote-material-download", () => downloadRemoteMaterialForItem(itemId)),
  );
  ipcMain.handle(ipcChannels.imageCopy, (_event, imageFileName: string) =>
    handleResult("image:copy", async () => {
      const hydratedImageFileName = await hydrateRemoteMaterialByImageFileName(imageFileName);
      await copyImageToClipboard(hydratedImageFileName);
      return { copied: true };
    }),
  );
  ipcMain.handle(ipcChannels.imageExport, (_event, imageFileName: string) =>
    handleResult("image:export", async () => exportImageToLocal(await hydrateRemoteMaterialByImageFileName(imageFileName))),
  );
  ipcMain.handle(ipcChannels.imageThumbnailResolve, (_event, imageFileName: string) =>
    handleResult("image:thumbnail-resolve", async () => {
      return resolveImageThumbnailSourceWithRetry(imageFileName);
    }),
  );
  ipcMain.handle(ipcChannels.imageThumbnailsResolve, (_event, imageFileNames: string[]) =>
    handleResult("image:thumbnails-resolve", async () => {
      const uniqueImageFileNames = [...new Set(imageFileNames.filter(Boolean))].slice(0, 80);
      const entries = await mapWithConcurrency(uniqueImageFileNames, 6, async (imageFileName) => {
        try {
          return [imageFileName, await resolveImageThumbnailSourceWithRetry(imageFileName)] as const;
        } catch {
          return null;
        }
      });
      const sources: Record<string, Awaited<ReturnType<typeof resolveImageThumbnailSource>>> = {};

      for (const entry of entries) {
        if (entry) {
          sources[entry[0]] = entry[1];
        }
      }

      return { sources };
    }),
  );
  ipcMain.handle(ipcChannels.imageGetFileSize, (_event, imageFileName: string) =>
    handleResult("image:get-file-size", async () => {
      const item = await findLibraryItemByImageFileName(imageFileName);
      const imagePath = item ? await resolveMediaAbsolutePath(item) : getImagePath(imageFileName);
      const stats = await fs.stat(imagePath).catch(() => null);
      return { size: stats?.size ?? 0 };
    }),
  );
  ipcMain.handle(ipcChannels.clipboardWriteText, (_event, text: string) =>
    handleResult("clipboard:write-text", async () => {
      clipboard.writeText(text);
      return { copied: true };
    }),
  );
  ipcMain.handle(ipcChannels.clipboardReadText, () =>
    handleResult("clipboard:read-text", async () => ({ text: clipboard.readText() })),
  );
  ipcMain.handle(ipcChannels.clipboardReadImage, () =>
    handleResult("clipboard:read-image", async () => {
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        throw new AppError("CLIPBOARD_EMPTY", "剪切板中没有可用图片。");
      }
      const dataUrl = image.toDataURL();
      return { dataUrl, width: image.getSize().width, height: image.getSize().height };
    }),
  );
  ipcMain.handle(
    ipcChannels.canvasReferenceImageSave,
    (_event, dataUrl: string, sourceFileName?: string, previousFileName?: string) =>
      handleResult("canvas:reference-image-save", () =>
        saveCanvasReferenceImage(dataUrl, sourceFileName, previousFileName),
      ),
  );
  ipcMain.handle(ipcChannels.canvasReferenceImageRead, (_event, fileName: string) =>
    handleResult("canvas:reference-image-read", () => readCanvasReferenceImage(fileName)),
  );
  ipcMain.handle(ipcChannels.canvasReferenceImageRemove, (_event, fileName: string) =>
    handleResult("canvas:reference-image-remove", () => removeCanvasReferenceImage(fileName)),
  );
  ipcMain.handle(ipcChannels.lexiconImageImport, () =>
    handleResult("lexicon:image-import", () => importPromptLexiconImage()),
  );
  ipcMain.handle(ipcChannels.lexiconExport, (_event, kind: PromptLexiconKind, items: PromptLexiconEntry[]) =>
    handleResult("lexicon:export-json", () => exportPromptLexicon(kind, items)),
  );
  ipcMain.handle(ipcChannels.lexiconImport, (_event, kind: PromptLexiconKind) =>
    handleResult("lexicon:import-json", () => importPromptLexicon(kind)),
  );
  ipcMain.handle(ipcChannels.itemDelete, (_event, itemIds: string[], deleteImages: boolean) =>
    handleResult("item:delete", () => deleteLibraryItems(itemIds, deleteImages)),
  );
  ipcMain.handle(ipcChannels.videoFramesGenerate, (_event, itemId: string) =>
    handleResult("video:frames-generate", () => generateVideoFramesForItem(itemId)),
  );
  ipcMain.handle(ipcChannels.videoReferenceImagesImport, (event, itemId: string) =>
    handleResult("video:reference-images-import", () =>
      importVideoReferenceImagesForItem(itemId, BrowserWindow.fromWebContents(event.sender)),
    ),
  );
  ipcMain.handle(ipcChannels.videoReferenceImageDelete, (_event, itemId: string, imageFileName: string) =>
    handleResult("video:reference-image-delete", () => deleteVideoReferenceImageForItem(itemId, imageFileName)),
  );
  ipcMain.handle(ipcChannels.videoReferenceImageImportClipboard, (_event, itemId: string) =>
    handleResult("video:reference-image-import-clipboard", () => importClipboardReferenceImageForItem(itemId)),
  );
  ipcMain.handle(ipcChannels.videoReferenceImageImportUrl, (_event, itemId: string, url: string) =>
    handleResult("video:reference-image-import-url", () => importReferenceImageFromUrlForItem(itemId, url)),
  );
  ipcMain.handle(ipcChannels.archiveExportZip, (_event, itemIds: string[]) =>
    handleResult("archive:export-zip", () => exportLibraryZip(itemIds)),
  );
  ipcMain.handle(ipcChannels.archiveImportZip, () => handleResult("archive:import-zip", () => importLibraryZip()));
  ipcMain.handle(ipcChannels.aiSettingsRead, () => handleResult("ai:settings-read", () => readPublicAiProviderSettings()));
  ipcMain.handle(ipcChannels.aiSettingsSave, (_event, settings: SaveAiProviderSettingsPayload) =>
    handleResult("ai:settings-save", () => writeAiProviderSettings(settings)),
  );
  ipcMain.handle(ipcChannels.aiSettingsExport, (_event, payload: { type: "plain" | "full"; password?: string }) =>
    handleResult("ai:settings-export", () => exportSettingsBackup(payload)),
  );
  ipcMain.handle(ipcChannels.aiSettingsImport, (_event, payload: { password?: string }) =>
    handleResult("ai:settings-import", () => importSettingsPreview(payload)),
  );
  ipcMain.handle(
    ipcChannels.aiSettingsImportApply,
    (_event, payload: { token: string; mode: "merge" | "replace" | "add-new" }) =>
      handleResult("ai:settings-import-apply", () => importSettingsApply(payload.token, payload.mode)),
  );
  ipcMain.handle(ipcChannels.aiApiKeyCopy, (_event, profileId: string) =>
    handleResult("ai:api-key-copy", async () => {
      const profile = await readPrivateAiProviderProfileById(profileId);

      if (!profile.apiKey) {
        throw new AppError("AI_SETTINGS_INCOMPLETE", "这个 API 还没有可复制的密钥。");
      }

      clipboard.writeText(profile.apiKey);
      return { copied: true };
    }),
  );
  ipcMain.handle(ipcChannels.aiApiKeyRead, (_event, profileId: string) =>
    handleResult("ai:api-key-read", async () => {
      const profile = await readPrivateAiProviderProfileById(profileId);

      if (!profile.apiKey) {
        throw new AppError("AI_SETTINGS_INCOMPLETE", "\u8fd9\u4e2a API \u8fd8\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u5bc6\u94a5\u3002");
      }

      return { apiKey: profile.apiKey };
    }),
  );
  ipcMain.handle(ipcChannels.aiSettingsTest, (_event, settings: SaveAiProviderSettingsPayload) =>
    handleResult("ai:settings-test", () => testAiProviderSettings(settings)),
  );
  ipcMain.handle(ipcChannels.aiModelsList, (_event, settings: SaveAiProviderSettingsPayload) =>
    handleResult("ai:models-list", () => listAiProviderModels(settings)),
  );
  ipcMain.handle(ipcChannels.aiAnalyzePrompt, (_event, payload: AiAnalyzePromptPayload) =>
    handleResult("ai:analyze-prompt", () => analyzePromptWithRemoteAi(payload)),
  );
  ipcMain.handle(ipcChannels.aiOptimizePrompt, (_event, payload: AiOptimizePromptPayload) =>
    handleResult("ai:optimize-prompt", () => optimizePromptWithRemoteAi(payload)),
  );
  ipcMain.handle(ipcChannels.aiSummarizePromptTitle, (_event, payload: AiSummarizePromptTitlePayload) =>
    handleResult("ai:summarize-prompt-title", () => summarizePromptTitleWithRemoteAi(payload)),
  );
  ipcMain.handle(ipcChannels.aiTranslatePrompt, (_event, payload: AiTranslatePromptPayload) =>
    handleResult("ai:translate-prompt", () => translatePromptWithRemoteAi(payload)),
  );
  ipcMain.handle(ipcChannels.aiReverseImagePrompt, (_event, payload: AiReverseImagePromptPayload) =>
    handleResult("ai:reverse-image-prompt", () => reverseImagePromptWithRemoteAi(payload)),
  );
  ipcMain.handle(ipcChannels.aiGenerateImages, (_event, payload: AiImageGenerationPayload) =>
    handleResult("ai:generate-images", () => generateImagesWithRemoteAi(payload)),
  );
  ipcMain.handle(ipcChannels.doubaoWebCanvasPrepare, (event) =>
    handleResult("doubao-web:prepare", () => prepareDoubaoWebCanvas(requireOwnerWindow(event))),
  );
  ipcMain.handle(ipcChannels.doubaoWebCanvasAuth, (event) =>
    handleResult("doubao-web:auth", () => refreshDoubaoWebCanvasAuth(requireOwnerWindow(event))),
  );
  ipcMain.handle(ipcChannels.doubaoWebCanvasBounds, (event, bounds: unknown) =>
    handleResult("doubao-web:bounds", () =>
      Promise.resolve(setDoubaoWebCanvasBounds(requireOwnerWindow(event), normalizeDoubaoWebCanvasBounds(bounds))),
    ),
  );
  ipcMain.handle(ipcChannels.doubaoWebCanvasShow, (event) =>
    handleResult("doubao-web:show", () => Promise.resolve(showDoubaoWebCanvas(requireOwnerWindow(event)))),
  );
  ipcMain.handle(ipcChannels.doubaoWebCanvasHide, (event) =>
    handleResult("doubao-web:hide", () => Promise.resolve(hideDoubaoWebCanvas(requireOwnerWindow(event)))),
  );
  ipcMain.handle(ipcChannels.doubaoWebCanvasGenerate, (event, payload: AiImageGenerationPayload) =>
    handleResult("doubao-web:generate", () => generateImagesWithDoubaoWeb(requireOwnerWindow(event), payload)),
  );
  ipcMain.handle(ipcChannels.webAssistantPrepare, (event, input: unknown) =>
    handleResult("web-assistant:prepare", () =>
      Promise.resolve(
        prepareWebAssistant(requireOwnerWindow(event), normalizeWebAssistantPrepareInput(input)),
      ),
    ),
  );
  ipcMain.handle(ipcChannels.webAssistantBounds, (event, payload: unknown) =>
    handleResult("web-assistant:bounds", () => {
      const boundsPayload = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
      return Promise.resolve(
        setWebAssistantBounds(
          requireOwnerWindow(event),
          normalizeWebAssistantPlatform(boundsPayload.platform),
          normalizeWebAssistantBounds(boundsPayload.bounds),
          normalizeWebAssistantCustomUrl(boundsPayload.customUrl),
        ),
      );
    }),
  );
  ipcMain.handle(ipcChannels.webAssistantShow, (event, platform?: unknown, customUrl?: unknown) =>
    handleResult("web-assistant:show", () =>
      Promise.resolve(
        showWebAssistant(
          requireOwnerWindow(event),
          normalizeWebAssistantPlatform(platform),
          normalizeWebAssistantCustomUrl(customUrl),
        ),
      ),
    ),
  );
  ipcMain.handle(ipcChannels.webAssistantHide, (event, platform?: unknown) =>
    handleResult("web-assistant:hide", () =>
      Promise.resolve(hideWebAssistant(requireOwnerWindow(event), normalizeWebAssistantPlatform(platform))),
    ),
  );
  ipcMain.handle(ipcChannels.webAssistantDispose, (event) =>
    handleResult("web-assistant:dispose", () => Promise.resolve(disposeWebAssistant(requireOwnerWindow(event)))),
  );
  ipcMain.handle(ipcChannels.proxySettingsRead, () =>
    handleResult("proxy:settings-read", () => readProxySettings()),
  );
  ipcMain.handle(ipcChannels.proxySettingsSave, (_event, settings: ProxySettings) =>
    handleResult("proxy:settings-save", () => writeProxySettings(settings)),
  );
  ipcMain.handle(ipcChannels.proxySettingsTest, (_event, settings: ProxySettings) =>
    handleResult("proxy:settings-test", () => testProxySettings(settings)),
  );
  ipcMain.handle(ipcChannels.proxySettingsDetect, () =>
    handleResult("proxy:settings-detect", () => detectProxySettings()),
  );

  ipcMain.handle(ipcChannels.batchDeduplicateScan, () =>
    handleResult("batch:deduplicate-scan", () => scanDuplicates()),
  );
  ipcMain.handle(ipcChannels.batchCompressImages, (event, options: ImageCompressOptions) =>
    handleResult("batch:compress-images", () =>
      compressImages(options, (progress) => {
        event.sender.send(IpcChannelName.BatchCompressProgress, progress);
      }),
    ),
  );
  ipcMain.handle(ipcChannels.batchCompressVideos, (event, options: VideoCompressOptions) =>
    handleResult("batch:compress-videos", () =>
      compressVideos(options, (progress) => {
        event.sender.send(IpcChannelName.BatchCompressVideoProgress, progress);
      }),
    ),
  );
  ipcMain.handle(ipcChannels.batchCancelCompress, () => {
    cancelCompress();
    return { ok: true, data: { canceled: true } };
  });

  ipcMain.handle(ipcChannels.moduleCheckInstalled, (_event, moduleId: string) =>
    handleResult("module:check-installed", () => checkModuleInstalled(moduleId as never)),
  );

  ipcMain.handle(ipcChannels.moduleInstallLocal, (event, moduleId: string) =>
    handleResult("module:install-local", () =>
      installModuleFromLocal(moduleId as never, (progress) => {
        event.sender.send(IpcChannelName.ModuleInstallProgress, progress);
      }),
    ),
  );

  ipcMain.handle(
    ipcChannels.moduleInstallGithub,
    (event, moduleId: string, githubOwner: string) =>
      handleResult("module:install-github", () =>
        installModuleFromGithub(moduleId as never, githubOwner, (progress) => {
          event.sender.send(IpcChannelName.ModuleInstallProgress, progress);
        }),
      ),
  );

  ipcMain.handle(ipcChannels.componentFfmpegInstallDownload, (event) =>
    handleResult("component:ffmpeg-install-download", () =>
      installFfmpegComponentFromDownload((progress) => {
        event.sender.send(IpcChannelName.ComponentFfmpegInstallProgress, progress);
      }),
    ),
  );

  ipcMain.handle(ipcChannels.componentFfmpegInstallLocal, (event) =>
    handleResult("component:ffmpeg-install-local", () =>
      installFfmpegComponentFromLocal((progress) => {
        event.sender.send(IpcChannelName.ComponentFfmpegInstallProgress, progress);
      }),
    ),
  );

  ipcMain.handle(ipcChannels.logExport, (_event, options?: unknown) =>
    handleResult("log:export", () => exportLogs(normalizeLogExportOptions(options))),
  );
}


function normalizeLogExportOptions(input: unknown): {
  minLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  range?: "today" | "7d" | "all";
  format?: "txt" | "zip";
  purpose?: "save" | "feedback";
} {
  if (!input || typeof input !== "object") {
    return {};
  }

  const record = input as Record<string, unknown>;
  const minLevel =
    record.minLevel === "DEBUG" ||
    record.minLevel === "INFO" ||
    record.minLevel === "WARN" ||
    record.minLevel === "ERROR"
      ? record.minLevel
      : undefined;
  const range = record.range === "today" || record.range === "7d" || record.range === "all" ? record.range : undefined;
  const format = record.format === "txt" || record.format === "zip" ? record.format : undefined;
  const purpose = record.purpose === "feedback" || record.purpose === "save" ? record.purpose : undefined;

  return { minLevel, range, format, purpose };
}

async function handleResult<T>(channel: string, operation: () => Promise<T>): Promise<IpcResult<T>> {
  const startedAt = Date.now();

  try {
    const data = await operation();
    logSlowIpc(channel, startedAt, true);
    return { ok: true, data };
  } catch (error) {
    logSlowIpc(channel, startedAt, false);
    const payload = toErrorPayload(error);
    logger.error("ipc", "handler-error", {
      channel,
      code: payload.code,
      message: payload.message,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, error: payload };
  }
}

function requireOwnerWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow || ownerWindow.isDestroyed()) {
    throw new AppError("DOUBAO_OWNER_WINDOW_MISSING", "找不到当前画布窗口，请重新打开画布。");
  }
  return ownerWindow;
}

function normalizeDoubaoWebCanvasBounds(input: unknown): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError("DOUBAO_BOUNDS_INVALID", "画布区域尺寸无效。");
  }

  const record = input as Record<string, unknown>;
  const values = [record.x, record.y, record.width, record.height].map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    throw new AppError("DOUBAO_BOUNDS_INVALID", "画布区域尺寸无效。");
  }

  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function normalizeWebAssistantPlatform(input: unknown): WebAssistantTargetId | undefined {
  if (typeof input !== "string" || input.length === 0) {
    return undefined;
  }
  return input;
}

function normalizeWebAssistantCustomUrl(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeWebAssistantBounds(input: unknown): WebAssistantBounds {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError("WEB_ASSISTANT_BOUNDS_INVALID", "网页助手区域尺寸无效。");
  }

  const record = input as Record<string, unknown>;
  const values = [record.x, record.y, record.width, record.height].map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    throw new AppError("WEB_ASSISTANT_BOUNDS_INVALID", "网页助手区域尺寸无效。");
  }

  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function normalizeWebAssistantPrepareInput(input: unknown): WebAssistantPrepareInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError("WEB_ASSISTANT_PREPARE_INVALID", "网页助手参数无效。");
  }
  const record = input as Record<string, unknown>;
  const platform = normalizeWebAssistantPlatform(record.platform);
  if (!platform) {
    throw new AppError("WEB_ASSISTANT_PREPARE_INVALID", "网页助手平台不支持。");
  }
  const customUrl = typeof record.customUrl === "string" ? record.customUrl : null;
  return { platform, customUrl: customUrl || null, reload: record.reload === true };
}

function logSlowIpc(channel: string, startedAt: number, ok: boolean): void {
  const durationMs = Date.now() - startedAt;

  if (durationMs < 120) {
    return;
  }

  logStartupEvent("ipc:slow", { channel, durationMs, ok });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeGeneratedImageImportPayload(input: unknown): GeneratedImageImportPayload {
  const record = isPlainRecord(input) ? input : {};
  const rawImages = Array.isArray(record.images) ? record.images : [];
  const metadata = isPlainRecord(record.metadata) ? record.metadata : {};

  return {
    images: rawImages
      .filter(isPlainRecord)
      .map((image) => ({
        dataUrl: typeof image.dataUrl === "string" ? image.dataUrl : "",
        revisedPrompt: typeof image.revisedPrompt === "string" ? image.revisedPrompt : null,
      }))
      .filter((image) => image.dataUrl.trim().length > 0),
    metadata: {
      title: typeof metadata.title === "string" ? metadata.title : "",
      prompt: typeof metadata.prompt === "string" ? metadata.prompt : "",
      negativePrompt: typeof metadata.negativePrompt === "string" ? metadata.negativePrompt : "",
      generationMethod: typeof metadata.generationMethod === "string" ? metadata.generationMethod : "",
      // 血缘继承字段：仅透传合法形状，undefined 表示「不继承、按新组处理」。
      tags: Array.isArray(metadata.tags)
        ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined,
      category: typeof metadata.category === "string" ? metadata.category : undefined,
      categoryId: typeof metadata.categoryId === "string" ? metadata.categoryId : undefined,
      genreIds: Array.isArray(metadata.genreIds)
        ? metadata.genreIds.filter((id): id is string => typeof id === "string")
        : undefined,
      categoryConfidence: typeof metadata.categoryConfidence === "number" ? metadata.categoryConfidence : undefined,
      categorySource:
        metadata.categorySource === "system" || metadata.categorySource === "user" || metadata.categorySource === "ai"
          ? metadata.categorySource
          : undefined,
    },
  };
}

function normalizeImportImageBuffers(input: unknown): ImportImageBufferInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const images: ImportImageBufferInput[] = [];

  for (const entry of input) {
    if (!isPlainRecord(entry)) {
      continue;
    }

    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name : "image.png";
    const rawData = entry.data;
    let data: Uint8Array | null = null;

    if (rawData instanceof Uint8Array) {
      data = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      data = new Uint8Array(rawData);
    } else if (ArrayBuffer.isView(rawData)) {
      data = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    }

    if (data && data.byteLength > 0) {
      images.push({ name, data });
    }
  }

  return images;
}

function toImageProtocolSrc(imageFileName: string, source: "thumbnail" | "original"): string {
  const scheme = source === "thumbnail" ? "app-thumbnail" : "app-image";

  return `${scheme}://local/${encodeURIComponent(imageFileName)}`;
}

async function hydrateRemoteMaterialByImageFileName(imageFileName: string): Promise<string> {
  const item = await findLibraryItemByImageFileName(imageFileName);

  if (!item || item.remoteImageStatus !== "pending") {
    return imageFileName;
  }

  const result = await downloadRemoteMaterialForItem(item.id);
  return result.library.items.find((candidate) => candidate.id === item.id)?.imageFileName ?? imageFileName;
}

async function resolveImageThumbnailSource(imageFileName: string): Promise<{
  source: "thumbnail" | "original";
  src: string;
}> {
  const item = await findLibraryItemByImageFileName(imageFileName);
  const thumbnailPath = item
    ? await getOrCreateImageThumbnailPathForItem(item)
    : await getOrCreateImageThumbnailPath(imageFileName);
  const source = thumbnailPath === getImageThumbnailPath(imageFileName) ? "thumbnail" : "original";

  return {
    source,
    src: toImageProtocolSrc(imageFileName, source),
  };
}

async function resolveImageThumbnailSourceWithRetry(imageFileName: string): Promise<{
  source: "thumbnail" | "original";
  src: string;
}> {
  try {
    return await resolveImageThumbnailSource(imageFileName);
  } catch (error) {
    await delay(120);
    try {
      return await resolveImageThumbnailSource(imageFileName);
    } catch {
      throw error;
    }
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));

  return results;
}
