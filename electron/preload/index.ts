import { contextBridge, ipcRenderer } from "electron";
import type {
  AiAnalyzePromptPayload,
  AiImageGenerationPayload,
  AiOptimizePromptPayload,
  AiSummarizePromptTitlePayload,
  AiReverseImagePromptPayload,
  AiTranslatePromptPayload,
  SaveAiProviderSettingsPayload,
} from "../../src/features/library/types/ai";
import type {
  LibraryFile,
  LibraryViewSettings,
  PromptLexiconEntry,
  PromptLexiconKind,
} from "../../src/features/library/types/library";
import type { ProxySettings } from "../../src/features/library/types/proxy";
import type {
  CompressProgress,
  ExternalLibrarySyncData,
  FfmpegInstallProgress,
  ImportProgress,
  IpcResult,
  ModuleInstallProgress,
  SuyanApi,
} from "../../src/types/suyanApi";
import { IpcChannelName } from "../shared/ipcChannels";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
};

const suyanApi: SuyanApi = {
  notifyRendererReady: () => ipcRenderer.send(IpcChannelName.AppRendererReady),
  notifyStartupScreenReady: () => ipcRenderer.send(IpcChannelName.AppStartupScreenReady),
  logStartupEvent: (event, details = {}) => ipcRenderer.send(IpcChannelName.AppStartupLog, event, details),
  openExternalUrl: (url: string) => invoke(IpcChannelName.AppOpenExternalUrl, url),
  openDataDirectory: () => invoke(IpcChannelName.AppOpenDataDirectory),
  checkForUpdates: () => invoke(IpcChannelName.AppUpdateCheck),
  readAccelerationStatus: () => invoke(IpcChannelName.AppAccelerationStatusRead),
  saveAccelerationSettings: (settings) => invoke(IpcChannelName.AppAccelerationSettingsSave, settings),
  readLibrary: () => invoke(IpcChannelName.LibraryRead),
  saveLibrary: (library: LibraryFile) => invoke(IpcChannelName.LibrarySave, library),
  readLibraryViewSettings: () => invoke(IpcChannelName.LibraryViewSettingsRead),
  saveLibraryViewSettings: (settings: LibraryViewSettings) =>
    invoke(IpcChannelName.LibraryViewSettingsSave, settings),
  listLibraryRoots: () => invoke(IpcChannelName.LibraryRootsList),
  reorderLibraryRoots: (rootIds: string[]) => invoke(IpcChannelName.LibraryRootOrderSet, rootIds),
  chooseAndScanLibraryRoot: () => invoke(IpcChannelName.LibraryRootChooseAndScan),
  chooseAndImportLibraryDirectory: () => invoke(IpcChannelName.LibraryDirectoryChooseAndImport),
  scanLibraryRoot: (rootId: string) => invoke(IpcChannelName.LibraryRootScan, rootId),
  remapLibraryRoot: (rootId: string) => invoke(IpcChannelName.LibraryRootRemap, rootId),
  removeLibraryRoot: (rootId: string) => invoke(IpcChannelName.LibraryRootRemove, rootId),
  purgeMissingLibraryRootItems: (rootId: string) => invoke(IpcChannelName.LibraryRootPurgeMissing, rootId),
  setLibraryRootWatch: (rootId: string, enabled: boolean) =>
    invoke(IpcChannelName.LibraryRootWatchSet, rootId, enabled),
  onExternalLibraryChanged: (callback) => {
    const handler = (_event: unknown, data: unknown) => callback(data as ExternalLibrarySyncData);
    ipcRenderer.on(IpcChannelName.LibraryExternalChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.LibraryExternalChanged, handler);
  },
  validateExternalLibrary: () => invoke(IpcChannelName.LibraryExternalValidate),
  listStartupGalleryImages: () => invoke(IpcChannelName.StartupGalleryList),
  importStartupGalleryImages: () => invoke(IpcChannelName.StartupGalleryImport),
  importStartupGalleryImageFromClipboard: () => invoke(IpcChannelName.StartupGalleryImportFromClipboard),
  removeStartupGalleryImage: (fileName: string) => invoke(IpcChannelName.StartupGalleryRemove, fileName),
  resetStartupGallery: () => invoke(IpcChannelName.StartupGalleryReset),
  importImageFiles: () => invoke(IpcChannelName.ImageImportFiles),
  importImageBuffers: (images) => invoke(IpcChannelName.ImageImportBuffers, images),
  importGeneratedImages: (payload) => invoke(IpcChannelName.ImageImportGenerated, payload),
  importImageFilesForItem: (itemId: string) => invoke(IpcChannelName.ImageImportFilesForItem, itemId),
  onImportProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as ImportProgress);
    ipcRenderer.on(IpcChannelName.ImageImportProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.ImageImportProgress, handler);
  },
  cancelImport: () => invoke(IpcChannelName.ImageImportCancel),
  importWordDocument: () => invoke(IpcChannelName.WordDocumentImport),
  importClipboardImage: () => invoke(IpcChannelName.ImageImportFromClipboard),
  importClipboardImageForItem: (itemId: string) => invoke(IpcChannelName.ImageImportClipboardForItem, itemId),
  downloadRemoteMaterial: (itemId: string) => invoke(IpcChannelName.ImageRemoteMaterialDownload, itemId),
  copyImage: (imageFileName: string) => invoke(IpcChannelName.ImageCopy, imageFileName),
  exportImage: (imageFileName: string) => invoke(IpcChannelName.ImageExport, imageFileName),
  getImageFileSize: (imageFileName: string) => invoke(IpcChannelName.ImageGetFileSize, imageFileName),
  resolveImageThumbnail: (imageFileName: string) => invoke(IpcChannelName.ImageThumbnailResolve, imageFileName),
  resolveImageThumbnails: (imageFileNames: string[]) =>
    invoke(IpcChannelName.ImageThumbnailsResolve, imageFileNames),
  writeClipboardText: (text: string) => invoke(IpcChannelName.ClipboardWriteText, text),
  readClipboardText: () => invoke(IpcChannelName.ClipboardReadText),
  readClipboardImage: () => invoke(IpcChannelName.ClipboardReadImage),
  saveCanvasReferenceImage: (dataUrl: string, sourceFileName?: string, previousFileName?: string) =>
    invoke(IpcChannelName.CanvasReferenceImageSave, dataUrl, sourceFileName, previousFileName),
  readCanvasReferenceImage: (fileName: string) => invoke(IpcChannelName.CanvasReferenceImageRead, fileName),
  removeCanvasReferenceImage: (fileName: string) => invoke(IpcChannelName.CanvasReferenceImageRemove, fileName),
  importPromptLexiconImage: () => invoke(IpcChannelName.LexiconImageImport),
  exportPromptLexicon: (kind: PromptLexiconKind, items: PromptLexiconEntry[]) =>
    invoke(IpcChannelName.LexiconExport, kind, items),
  importPromptLexicon: (kind: PromptLexiconKind) => invoke(IpcChannelName.LexiconImport, kind),
  deleteItems: (itemIds: string[], deleteImages: boolean) =>
    invoke(IpcChannelName.ItemDelete, itemIds, deleteImages),
  generateVideoFrames: (itemId: string) => invoke(IpcChannelName.VideoFramesGenerate, itemId),
  importVideoReferenceImages: (itemId: string) => invoke(IpcChannelName.VideoReferenceImagesImport, itemId),
  deleteVideoReferenceImage: (itemId: string, imageFileName: string) =>
    invoke(IpcChannelName.VideoReferenceImageDelete, itemId, imageFileName),
  importClipboardReferenceImage: (itemId: string) =>
    invoke(IpcChannelName.VideoReferenceImageImportClipboard, itemId),
  importReferenceImageFromUrl: (itemId: string, url: string) =>
    invoke(IpcChannelName.VideoReferenceImageImportUrl, itemId, url),
  exportZip: (itemIds: string[]) => invoke(IpcChannelName.ArchiveExportZip, itemIds),
  importZip: () => invoke(IpcChannelName.ArchiveImportZip),
  readAiSettings: () => invoke(IpcChannelName.AiSettingsRead),
  saveAiSettings: (settings: SaveAiProviderSettingsPayload) => invoke(IpcChannelName.AiSettingsSave, settings),
  exportAiSettings: (payload: { type: "plain" | "full"; password?: string }) =>
    invoke(IpcChannelName.AiSettingsExport, payload),
  importAiSettingsPreview: (payload: { password?: string }) =>
    invoke(IpcChannelName.AiSettingsImport, payload),
  importAiSettingsApply: (payload: { token: string; mode: "merge" | "replace" | "add-new" }) =>
    invoke(IpcChannelName.AiSettingsImportApply, payload),
  copyAiApiKey: (profileId: string) => invoke(IpcChannelName.AiApiKeyCopy, profileId),
  readAiApiKey: (profileId: string) => invoke(IpcChannelName.AiApiKeyRead, profileId),
  testAiSettings: (settings: SaveAiProviderSettingsPayload) => invoke(IpcChannelName.AiSettingsTest, settings),
  listAiModels: (settings: SaveAiProviderSettingsPayload) => invoke(IpcChannelName.AiModelsList, settings),
  analyzePromptWithAi: (payload: AiAnalyzePromptPayload) => invoke(IpcChannelName.AiAnalyzePrompt, payload),
  optimizePromptWithAi: (payload: AiOptimizePromptPayload) => invoke(IpcChannelName.AiOptimizePrompt, payload),
  summarizePromptTitleWithAi: (payload: AiSummarizePromptTitlePayload) =>
    invoke(IpcChannelName.AiSummarizePromptTitle, payload),
  translatePromptWithAi: (payload: AiTranslatePromptPayload) => invoke(IpcChannelName.AiTranslatePrompt, payload),
  reverseImagePromptWithAi: (payload: AiReverseImagePromptPayload) =>
    invoke(IpcChannelName.AiReverseImagePrompt, payload),
  generateImagesWithAi: (payload: AiImageGenerationPayload) =>
    invoke(IpcChannelName.AiGenerateImages, payload),
  prepareDoubaoWebCanvas: () => invoke(IpcChannelName.DoubaoWebCanvasPrepare),
  refreshDoubaoWebCanvasAuth: () => invoke(IpcChannelName.DoubaoWebCanvasAuth),
  setDoubaoWebCanvasBounds: (bounds) => invoke(IpcChannelName.DoubaoWebCanvasBounds, bounds),
  showDoubaoWebCanvas: () => invoke(IpcChannelName.DoubaoWebCanvasShow),
  hideDoubaoWebCanvas: () => invoke(IpcChannelName.DoubaoWebCanvasHide),
  generateImagesWithDoubaoWeb: (payload: AiImageGenerationPayload) =>
    invoke(IpcChannelName.DoubaoWebCanvasGenerate, payload),
  prepareWebAssistant: (input) => invoke(IpcChannelName.WebAssistantPrepare, input),
  setWebAssistantBounds: (payload) => invoke(IpcChannelName.WebAssistantBounds, payload),
  showWebAssistant: (platform, customUrl) => invoke(IpcChannelName.WebAssistantShow, platform, customUrl),
  hideWebAssistant: (platform) => invoke(IpcChannelName.WebAssistantHide, platform),
  disposeWebAssistant: () => invoke(IpcChannelName.WebAssistantDispose),
  readProxySettings: () => invoke(IpcChannelName.ProxySettingsRead),
  saveProxySettings: (settings: ProxySettings) => invoke(IpcChannelName.ProxySettingsSave, settings),
  testProxySettings: (settings: ProxySettings) => invoke(IpcChannelName.ProxySettingsTest, settings),
  detectProxySettings: () => invoke(IpcChannelName.ProxySettingsDetect),
  deduplicateScan: () => invoke(IpcChannelName.BatchDeduplicateScan),
  compressImages: (options) => invoke(IpcChannelName.BatchCompressImages, options),
  onCompressImagesProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as CompressProgress);
    ipcRenderer.on(IpcChannelName.BatchCompressProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.BatchCompressProgress, handler);
  },
  compressVideos: (options) => invoke(IpcChannelName.BatchCompressVideos, options),
  onCompressVideosProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as CompressProgress);
    ipcRenderer.on(IpcChannelName.BatchCompressVideoProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.BatchCompressVideoProgress, handler);
  },
  cancelCompress: () => invoke(IpcChannelName.BatchCancelCompress),
  checkModuleInstalled: (moduleId: string) => invoke(IpcChannelName.ModuleCheckInstalled, moduleId),
  installModuleFromLocal: (moduleId: string) => invoke(IpcChannelName.ModuleInstallLocal, moduleId),
  installModuleFromGithub: (moduleId: string, githubOwner: string) =>
    invoke(IpcChannelName.ModuleInstallGithub, moduleId, githubOwner),
  onModuleInstallProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as ModuleInstallProgress);
    ipcRenderer.on(IpcChannelName.ModuleInstallProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.ModuleInstallProgress, handler);
  },
  installFfmpegComponentFromDownload: () => invoke(IpcChannelName.ComponentFfmpegInstallDownload),
  installFfmpegComponentFromLocal: () => invoke(IpcChannelName.ComponentFfmpegInstallLocal),
  onFfmpegInstallProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as FfmpegInstallProgress);
    ipcRenderer.on(IpcChannelName.ComponentFfmpegInstallProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.ComponentFfmpegInstallProgress, handler);
  },
  minimizeWindow: () => invoke(IpcChannelName.WindowMinimize),
  toggleMaximizeWindow: () => invoke(IpcChannelName.WindowMaximizeToggle),
  closeWindow: () => invoke(IpcChannelName.WindowClose),
  isWindowMaximized: () => invoke<IpcResult<{ maximized: boolean }>>(IpcChannelName.WindowIsMaximized),
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on(IpcChannelName.WindowMaximizeChange, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.WindowMaximizeChange, handler);
  },
  exportLogs: (options?: import("../../src/types/suyanApi").LogExportOptions) => invoke(IpcChannelName.LogExport, options),
};

contextBridge.exposeInMainWorld("suyanApi", suyanApi);
