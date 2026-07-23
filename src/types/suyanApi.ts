import type {
  LibraryFile,
  LibraryRoot,
  LibraryViewSettings,
  PromptLexiconEntry,
  PromptLexiconKind,
  VideoKeyframe,
} from "../features/library/types/library";
import type {
  AiAnalyzePromptData,
  AiAnalyzePromptPayload,
  AiListProviderModelsData,
  AiOptimizePromptData,
  AiOptimizePromptPayload,
  AiReverseImagePromptData,
  AiReverseImagePromptPayload,
  AiSettingsTestData,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  PublicAiProviderSettings,
  SaveAiProviderSettingsPayload,
} from "../features/library/types/ai";
import type { ProxyDetectionData, ProxySettings, ProxyTestData } from "../features/library/types/proxy";
import type {
  AppAccelerationSettings,
  AppAccelerationStatus,
} from "../features/library/types/appAcceleration";

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export type ImportProgress = {
  current: number;
  total: number;
  currentFile: string;
};

export type ImportImagesData = {
  library: LibraryFile;
  importedCount: number;
  importedPromptCount?: number;
  importedImageCount?: number;
  skippedDuplicateCount?: number;
  canceled?: boolean;
};

export type ExternalLibraryScanData = {
  canceled: boolean;
  library: LibraryFile;
  root: LibraryRoot | null;
  importedCount: number;
  skippedCount: number;
};

export type ExternalLibraryValidationData = {
  library: LibraryFile;
  missingCount: number;
  changedCount: number;
};

export type ExternalLibraryRemapData = ExternalLibraryValidationData & {
  canceled: boolean;
  root: LibraryRoot | null;
};

export type ExternalLibraryRootRemoveData = ExternalLibraryValidationData & {
  roots: LibraryRoot[];
  removedItemCount: number;
};

export type ExternalLibraryWatchData = {
  root: LibraryRoot;
  roots: LibraryRoot[];
};

export type ExternalLibrarySyncData = {
  library: LibraryFile;
  roots: LibraryRoot[];
  rootId: string;
  importedCount: number;
  missingCount: number;
  renamedCount: number;
};

export type ImportImageBufferInput = {
  name: string;
  data: ArrayBuffer;
};

export type ImportWordDocumentData = {
  canceled: boolean;
  documentCount: number;
  library: LibraryFile;
  importedCount: number;
  skippedImageCount: number;
};

export type ImportClipboardImageForItemData = {
  library: LibraryFile;
  importedItemId: string;
  mode: "added" | "replaced";
};

export type DownloadRemoteMaterialData = {
  library: LibraryFile;
  itemId: string;
  downloaded: boolean;
  updated?: boolean;
};

export type ImportImageFilesForItemData = {
  library: LibraryFile;
  importedCount: number;
  importedItemId: string | null;
  mode: "added" | "replaced" | "canceled";
};

export type ImportZipData = {
  canceled: boolean;
  library: LibraryFile;
  importedCount: number;
};

export type ExportZipData = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
};

export type ExportImageData = {
  canceled: boolean;
  filePath: string | null;
};

export type ResolvedImageSourceData = {
  source: "thumbnail" | "original";
  src: string;
};

export type ResolvedImageSourcesData = {
  sources: Record<string, ResolvedImageSourceData>;
};

export type ImportPromptLexiconImageData = {
  canceled: boolean;
  imageFileName: string | null;
};

export type ImportPromptLexiconData = {
  canceled: boolean;
  items: PromptLexiconEntry[];
  importedCount: number;
};

export type ExportPromptLexiconData = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
};

export type DeduplicateItem = {
  itemId: string;
  imageFileName: string;
  fileSize: number;
  title: string;
  createdAt: string;
};

export type DeduplicateGroup = {
  hash: string;
  items: DeduplicateItem[];
};

export type DeduplicateResult = {
  groups: DeduplicateGroup[];
  totalDuplicateFiles: number;
  wastedBytes: number;
};

export type ImageCompressOptions = {
  quality: number;
  format: "keep" | "webp";
  itemIds?: string[];
};

export type VideoCompressOptions = {
  resolution: "original" | "1080p" | "720p" | "480p";
  crf: number;
  codec: "h264" | "h265";
  itemIds?: string[];
};

export type CompressProgress = {
  current: number;
  total: number;
  currentItem: string;
  savedBytes: number;
};

export type CompressResult = {
  processedCount: number;
  totalOriginalBytes: number;
  totalCompressedBytes: number;
  skippedExternalCount: number;
  failedItems: { itemId: string; reason: string }[];
};

export type ModuleInstallProgress = {
  moduleId: string;
  phase: "downloading" | "extracting" | "verifying" | "done" | "failed";
  bytesDownloaded: number;
  totalBytes: number;
  message: string;
};

export type GenerateVideoFramesData = {
  itemId: string;
  durationSec: number | null;
  posterFileName: string | null;
  keyframes: VideoKeyframe[];
  framesGeneratedAt: string;
};

export type ImportVideoReferenceImagesData = {
  library: LibraryFile;
  itemId: string;
  importedCount: number;
  referenceImages: string[];
  canceled: boolean;
};

export type DeleteVideoReferenceImageData = {
  library: LibraryFile;
  itemId: string;
  referenceImages: string[];
};

export type AddVideoReferenceImageData = {
  library: LibraryFile;
  itemId: string;
  importedCount: number;
  referenceImages: string[];
};

export type StartupGalleryImage = {
  fileName: string;
  isDefault: boolean;
  order: number;
};

export type StartupGalleryImportData = {
  canceled: boolean;
  images: StartupGalleryImage[];
  importedCount: number;
};

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

export type SuyanApi = {
  notifyRendererReady: () => void;
  notifyStartupScreenReady: () => void;
  logStartupEvent: (event: string, details?: Record<string, unknown>) => void;
  openExternalUrl: (url: string) => Promise<IpcResult<{ opened: true }>>;
  checkForUpdates: () => Promise<IpcResult<AppUpdateCheckData>>;
  readAccelerationStatus: () => Promise<IpcResult<AppAccelerationStatus>>;
  saveAccelerationSettings: (settings: AppAccelerationSettings) => Promise<IpcResult<AppAccelerationStatus>>;
  readLibrary: () => Promise<IpcResult<LibraryFile>>;
  saveLibrary: (library: LibraryFile) => Promise<IpcResult<LibraryFile>>;
  readLibraryViewSettings: () => Promise<IpcResult<LibraryViewSettings>>;
  saveLibraryViewSettings: (settings: LibraryViewSettings) => Promise<IpcResult<LibraryViewSettings>>;
  listLibraryRoots: () => Promise<IpcResult<LibraryRoot[]>>;
  chooseAndScanLibraryRoot: () => Promise<IpcResult<ExternalLibraryScanData>>;
  scanLibraryRoot: (rootId: string) => Promise<IpcResult<ExternalLibraryScanData>>;
  remapLibraryRoot: (rootId: string) => Promise<IpcResult<ExternalLibraryRemapData>>;
  removeLibraryRoot: (rootId: string) => Promise<IpcResult<ExternalLibraryRootRemoveData>>;
  setLibraryRootWatch: (rootId: string, enabled: boolean) => Promise<IpcResult<ExternalLibraryWatchData>>;
  onExternalLibraryChanged: (callback: (data: ExternalLibrarySyncData) => void) => () => void;
  validateExternalLibrary: () => Promise<IpcResult<ExternalLibraryValidationData>>;
  listStartupGalleryImages: () => Promise<IpcResult<StartupGalleryImage[]>>;
  importStartupGalleryImages: () => Promise<IpcResult<StartupGalleryImportData>>;
  importStartupGalleryImageFromClipboard: () => Promise<IpcResult<StartupGalleryImportData>>;
  removeStartupGalleryImage: (fileName: string) => Promise<IpcResult<StartupGalleryImage[]>>;
  resetStartupGallery: () => Promise<IpcResult<StartupGalleryImage[]>>;
  importImageFiles: () => Promise<IpcResult<ImportImagesData>>;
  importImageBuffers: (images: ImportImageBufferInput[]) => Promise<IpcResult<ImportImagesData>>;
  importImageFilesForItem: (itemId: string) => Promise<IpcResult<ImportImageFilesForItemData>>;
  onImportProgress: (callback: (progress: ImportProgress) => void) => () => void;
  cancelImport: () => Promise<IpcResult<{ canceled: true }>>;
  importWordDocument: () => Promise<IpcResult<ImportWordDocumentData>>;
  importClipboardImage: () => Promise<IpcResult<ImportImagesData>>;
  importClipboardImageForItem: (itemId: string) => Promise<IpcResult<ImportClipboardImageForItemData>>;
  downloadRemoteMaterial: (itemId: string) => Promise<IpcResult<DownloadRemoteMaterialData>>;
  copyImage: (imageFileName: string) => Promise<IpcResult<{ copied: true }>>;
  exportImage: (imageFileName: string) => Promise<IpcResult<ExportImageData>>;
  resolveImageThumbnail: (imageFileName: string) => Promise<IpcResult<ResolvedImageSourceData>>;
  resolveImageThumbnails: (imageFileNames: string[]) => Promise<IpcResult<ResolvedImageSourcesData>>;
  writeClipboardText: (text: string) => Promise<IpcResult<{ copied: true }>>;
  importPromptLexiconImage: () => Promise<IpcResult<ImportPromptLexiconImageData>>;
  exportPromptLexicon: (
    kind: PromptLexiconKind,
    items: PromptLexiconEntry[],
  ) => Promise<IpcResult<ExportPromptLexiconData>>;
  importPromptLexicon: (kind: PromptLexiconKind) => Promise<IpcResult<ImportPromptLexiconData>>;
  deleteItems: (
    itemIds: string[],
    deleteImages: boolean,
  ) => Promise<IpcResult<{ library: LibraryFile; deletedCount: number }>>;
  generateVideoFrames: (itemId: string) => Promise<IpcResult<GenerateVideoFramesData>>;
  importVideoReferenceImages: (itemId: string) => Promise<IpcResult<ImportVideoReferenceImagesData>>;
  deleteVideoReferenceImage: (
    itemId: string,
    imageFileName: string,
  ) => Promise<IpcResult<DeleteVideoReferenceImageData>>;
  importClipboardReferenceImage: (itemId: string) => Promise<IpcResult<AddVideoReferenceImageData>>;
  importReferenceImageFromUrl: (
    itemId: string,
    url: string,
  ) => Promise<IpcResult<AddVideoReferenceImageData>>;
  exportZip: (itemIds: string[]) => Promise<IpcResult<ExportZipData>>;
  importZip: () => Promise<IpcResult<ImportZipData>>;
  readAiSettings: () => Promise<IpcResult<PublicAiProviderSettings>>;
  saveAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<IpcResult<PublicAiProviderSettings>>;
  copyAiApiKey: (profileId: string) => Promise<IpcResult<{ copied: true }>>;
  testAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<IpcResult<AiSettingsTestData>>;
  listAiModels: (settings: SaveAiProviderSettingsPayload) => Promise<IpcResult<AiListProviderModelsData>>;
  analyzePromptWithAi: (payload: AiAnalyzePromptPayload) => Promise<IpcResult<AiAnalyzePromptData>>;
  optimizePromptWithAi: (payload: AiOptimizePromptPayload) => Promise<IpcResult<AiOptimizePromptData>>;
  translatePromptWithAi: (payload: AiTranslatePromptPayload) => Promise<IpcResult<AiTranslatePromptData>>;
  reverseImagePromptWithAi: (payload: AiReverseImagePromptPayload) => Promise<IpcResult<AiReverseImagePromptData>>;
  readProxySettings: () => Promise<IpcResult<ProxySettings>>;
  saveProxySettings: (settings: ProxySettings) => Promise<IpcResult<ProxySettings>>;
  testProxySettings: (settings: ProxySettings) => Promise<IpcResult<ProxyTestData>>;
  detectProxySettings: () => Promise<IpcResult<ProxyDetectionData>>;
  deduplicateScan: () => Promise<IpcResult<DeduplicateResult>>;
  compressImages: (options: ImageCompressOptions) => Promise<IpcResult<CompressResult>>;
  onCompressImagesProgress: (callback: (progress: CompressProgress) => void) => () => void;
  compressVideos: (options: VideoCompressOptions) => Promise<IpcResult<CompressResult>>;
  onCompressVideosProgress: (callback: (progress: CompressProgress) => void) => () => void;
  cancelCompress: () => Promise<IpcResult<{ canceled: true }>>;
  checkModuleInstalled: (moduleId: string) => Promise<IpcResult<{ installed: boolean }>>;
  installModuleFromLocal: (moduleId: string) => Promise<IpcResult<{ installed: boolean }>>;
  installModuleFromGithub: (moduleId: string, githubOwner: string) => Promise<IpcResult<{ installed: boolean }>>;
  onModuleInstallProgress: (callback: (progress: ModuleInstallProgress) => void) => () => void;
  minimizeWindow: () => Promise<IpcResult<{ minimized: true }>>;
  toggleMaximizeWindow: () => Promise<IpcResult<{ maximized: boolean }>>;
  closeWindow: () => Promise<IpcResult<{ closed: true }>>;
  isWindowMaximized: () => Promise<IpcResult<{ maximized: boolean }>>;
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
  /** 导出 TXT / ZIP 日志；反馈模式会自动准备 ZIP 并打开 GitHub Issue。 */
  exportLogs: (options?: LogExportOptions) => Promise<IpcResult<LogExportResult>>;
};

export type LogExportRange = "today" | "7d" | "all";
export type LogExportFormat = "txt" | "zip";
export type LogExportPurpose = "save" | "feedback";
export type LogExportLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LogExportOptions = {
  minLevel?: LogExportLevel;
  range?: LogExportRange;
  format?: LogExportFormat;
  purpose?: LogExportPurpose;
};

export type LogExportResult = {
  exported: boolean;
  filePath: string | null;
  entryCount: number;
  format: LogExportFormat;
  minLevel: LogExportLevel;
  range: LogExportRange;
};

declare global {
  interface Window {
    suyanApi: SuyanApi;
  }
}

export {};
