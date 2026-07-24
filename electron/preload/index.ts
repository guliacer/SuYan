import { contextBridge, ipcRenderer } from "electron";
import type {
  AiAnalyzePromptPayload,
  AiOptimizePromptPayload,
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
  checkForUpdates: () => invoke(IpcChannelName.AppUpdateCheck),
  readAccelerationStatus: () => invoke(IpcChannelName.AppAccelerationStatusRead),
  saveAccelerationSettings: (settings) => invoke(IpcChannelName.AppAccelerationSettingsSave, settings),
  readLibrary: () => invoke(IpcChannelName.LibraryRead),
  saveLibrary: (library: LibraryFile) => invoke(IpcChannelName.LibrarySave, library),
  readLibraryViewSettings: () => invoke(IpcChannelName.LibraryViewSettingsRead),
  saveLibraryViewSettings: (settings: LibraryViewSettings) =>
    invoke(IpcChannelName.LibraryViewSettingsSave, settings),
  listLibraryRoots: () => invoke(IpcChannelName.LibraryRootsList),
  chooseAndScanLibraryRoot: () => invoke(IpcChannelName.LibraryRootChooseAndScan),
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
  resolveImageThumbnail: (imageFileName: string) => invoke(IpcChannelName.ImageThumbnailResolve, imageFileName),
  resolveImageThumbnails: (imageFileNames: string[]) =>
    invoke(IpcChannelName.ImageThumbnailsResolve, imageFileNames),
  writeClipboardText: (text: string) => invoke(IpcChannelName.ClipboardWriteText, text),
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
  copyAiApiKey: (profileId: string) => invoke(IpcChannelName.AiApiKeyCopy, profileId),
  testAiSettings: (settings: SaveAiProviderSettingsPayload) => invoke(IpcChannelName.AiSettingsTest, settings),
  listAiModels: (settings: SaveAiProviderSettingsPayload) => invoke(IpcChannelName.AiModelsList, settings),
  analyzePromptWithAi: (payload: AiAnalyzePromptPayload) => invoke(IpcChannelName.AiAnalyzePrompt, payload),
  optimizePromptWithAi: (payload: AiOptimizePromptPayload) => invoke(IpcChannelName.AiOptimizePrompt, payload),
  translatePromptWithAi: (payload: AiTranslatePromptPayload) => invoke(IpcChannelName.AiTranslatePrompt, payload),
  reverseImagePromptWithAi: (payload: AiReverseImagePromptPayload) =>
    invoke(IpcChannelName.AiReverseImagePrompt, payload),
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
