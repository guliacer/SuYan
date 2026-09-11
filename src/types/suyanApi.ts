import type { TagOrganizationPreview, TagOrganizationRequest } from "../features/library/types/tagKnowledge";
import type { TodoCalendarSettings, TodoCalendarChange, TodoHolidayResult } from "./todoCalendar";
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
  AiGeneratedImage,
  AiImageGenerationData,
  AiImageGenerationPayload,
  AiAnalyzePromptPayload,
  AiListProviderModelsData,
  AiOptimizePromptData,
  AiOptimizePromptPayload,
  AiPreparePromptEntryData,
  AiPreparePromptEntryPayload,
  AiReverseImagePromptData,
  AiReverseImagePromptPayload,
  AiSettingsTestData,
  AiSummarizePromptTitleData,
  AiSummarizePromptTitlePayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  PublicAiProviderSettings,
  SaveAiProviderSettingsPayload,
} from "../features/library/types/ai";
import type {
  DoubaoWebCanvasBounds,
  DoubaoWebCanvasStatus,
} from "../features/library/types/canvas";
import type {
  WebAssistantBounds,
  WebAssistantPrepareInput,
  WebAssistantTargetId,
} from "../features/library/types/webAssistant";
import type { ProxyDetectionData, ProxySettings, ProxyTestData } from "../features/library/types/proxy";
import type {
  AppAccelerationSettings,
  AppAccelerationStatus,
} from "../features/library/types/appAcceleration";
import type {
  PromptCategoryDeleteInput,
  PromptCategoryInput,
  PromptCategoryUpdate,
  PromptClipboardCreateInput,
  PromptClipboardPayload,
  PromptCopyInput,
  PromptInput,
  PromptLibraryExportResult,
  PromptLibraryImportResult,
  PromptLibraryFile,
  PromptGithubProject,
  PromptReorderInput,
  PromptUpdate,
} from "../features/prompts/types";
import type {
  CreateTodoProjectInput,
  CreateTodoTaskInput,
  CreateTodoWidgetInput,
  TodoLibraryFile,
  TodoLibraryReplaceInput,
  TodoImportFilesData,
  TodoProjectMutationData,
  TodoTaskMutationData,
  TodoWidgetMutationData,
  UpdateTodoProjectInput,
  UpdateTodoTaskInput,
  UpdateTodoWidgetInput,
} from "../features/prompts/types";
import type {
  AccountLoginProviderId,
  AccountOAuthProfileSelection,
  AccountOAuthStartOptions,
  AccountOAuthStartResult,
  AccountProfileUpdateInput,
  AccountProviderId,
  AccountPublicStatus,
  AccountRegistrationResult,
  AccountUser,
  EmailLoginInput,
  EmailRegisterInput,
} from "../features/account/types/account";

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** 账号条目的明文视图（密码解密后仅在内存中存在）。 */
export type PromptAccountReadData = {
  name?: string;
  password?: string;
  site?: string;
};

export type PromptContentImageData = {
  canceled: boolean;
  imageFileName: string | null;
  width: number;
  height: number;
};

export type AiSettingsImportPreview = {
  token: string;
  fileName: string;
  formatVersion: number;
  providerCount: number;
  newProviderCount: number;
  modelCount: number;
  hasApiKeyProfiles: boolean;
  actionPreferencesCount: number;
  errors?: string[];
};

export type ImportProgress = {
  current: number;
  total: number;
  currentFile: string;
};

export type CanvasReferenceImageData = {
  dataUrl: string;
  fileName: string;
  height: number;
  title: string;
  width: number;
};

export type ThemeBackgroundSelectionData = {
  canceled: boolean;
  imageFileName: string | null;
};

export type ImportPromptGroupSummary = {
  groupKey: string;
  title: string;
  promptPreview: string;
  imageCount: number;
  hasPromptContent: boolean;
};

export type ImportImagesData = {
  library: LibraryFile;
  importedCount: number;
  importedPromptCount?: number;
  importedImageCount?: number;
  skippedDuplicateCount?: number;
  /** Drag/buffer multi-image import: one entry per distinct prompt group. */
  importGroups?: ImportPromptGroupSummary[];
  canceled?: boolean;
};

export type ExternalLibraryScanData = {
  canceled: boolean;
  library: LibraryFile;
  root: LibraryRoot | null;
  importedCount: number;
  skippedCount: number;
};

export type ManagedDirectoryImportData = {
  canceled: boolean;
  directoryLabel: string | null;
  library: LibraryFile;
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

export type ExternalLibraryPurgeMissingData = ExternalLibraryValidationData & {
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

export type ImportGeneratedImagesPayload = {
  images: AiGeneratedImage[];
  metadata: {
    title: string;
    prompt: string;
    negativePrompt: string;
    generationMethod: string;
    /**
     * 「传送到画布」且提示词未改动时，继承来源提示词组的身份字段，
     * 使新图与原组的分组键一致、归入原组。省略即按新组处理。
     */
    tags?: string[];
    category?: string | null;
    categoryId?: string | null;
    genreIds?: string[];
    categoryConfidence?: number | null;
    categorySource?: "system" | "user" | "ai" | "local" | null;
  };
};

export type ImportGeneratedImagesData = ImportImagesData & {
  importedItemIds: string[];
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
  settings?: LibraryViewSettings;
};

export type ExportZipData = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
  requiresAuthorChoice?: boolean;
  unownedCount?: number;
  authorName?: string;
  categoryCount?: number;
  tagCount?: number;
};

export type ArchiveExportAuthorChoice = "keep" | "associate";

export type ExportImageData = {
  canceled: boolean;
  filePath: string | null;
};

export type GeneratedWorkExportInput = Pick<AiGeneratedImage, "dataUrl" | "attributionId" | "mediaType"> & {
  prompt: string;
  negativePrompt: string;
  generationMethod: string;
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
  maxSide?: number;
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

export type LocalNsfwClassificationData = {
  rating: "safe" | "nsfw";
  score: number;
  threshold: number;
};

/** FFmpeg 按需组件安装进度（下载/离线导入共用）。phase 与主进程 InstallPhase 对齐。 */
export type FfmpegInstallProgress = {
  phase: "verifying" | "downloading" | "extracting" | "self-check" | "done";
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

export type AppUpdatePreferences = {
  automaticCheck: boolean;
  ignoredVersion: string | null;
};

export type SuyanApi = {
  /** Read-only native window capability, supplied by main through preload. */
  readonly windowMaterial?: "acrylic" | "fallback";
  notifyRendererReady: () => void;
  notifyStartupScreenReady: () => void;
  logStartupEvent: (event: string, details?: Record<string, unknown>) => void;
  openExternalUrl: (url: string) => Promise<IpcResult<{ opened: true }>>;
  openDataDirectory: () => Promise<IpcResult<{ opened: true; path: string }>>;
  checkForUpdates: () => Promise<IpcResult<AppUpdateCheckData>>;
  readAppUpdatePreferences: () => Promise<IpcResult<AppUpdatePreferences>>;
  saveAppUpdatePreferences: (preferences: AppUpdatePreferences) => Promise<IpcResult<AppUpdatePreferences>>;
  readAccelerationStatus: () => Promise<IpcResult<AppAccelerationStatus>>;
  saveAccelerationSettings: (settings: AppAccelerationSettings) => Promise<IpcResult<AppAccelerationStatus>>;
  readLibrary: () => Promise<IpcResult<LibraryFile>>;
  onExportProgress: (callback: (progress: import("./exportTask").ExportTaskProgress) => void) => () => void;
  syncWorksToAccount: (input: { itemIds: string[]; expectedUid: string; force?: boolean }) => Promise<IpcResult<{
    canceled: boolean; library: LibraryFile | null; changedCount: number; skippedCount: number;
  }>>;
  saveLibrary: (library: LibraryFile) => Promise<IpcResult<LibraryFile>>;
  listPrompts: () => Promise<IpcResult<PromptLibraryFile>>;
  createPrompt: (input: PromptInput) => Promise<IpcResult<PromptLibraryFile>>;
  updatePrompt: (input: PromptUpdate) => Promise<IpcResult<PromptLibraryFile>>;
  deletePrompts: (ids: string[]) => Promise<IpcResult<PromptLibraryFile>>;
  copyPrompt: (input: PromptCopyInput) => Promise<IpcResult<PromptLibraryFile>>;
  setPromptFavorite: (id: string, favorite: boolean) => Promise<IpcResult<PromptLibraryFile>>;
  duplicatePrompt: (id: string) => Promise<IpcResult<PromptLibraryFile>>;
  createPrompts: (inputs: PromptClipboardCreateInput[]) => Promise<IpcResult<PromptLibraryFile>>;
  readPromptClipboard: () => Promise<IpcResult<PromptClipboardPayload>>;
  choosePromptContentImage: () => Promise<IpcResult<PromptContentImageData>>;
  savePromptContentImage: (dataUrl: string) => Promise<IpcResult<PromptContentImageData>>;
  /** 读取账号条目的明文视图（密码由主进程解密，仅存在于内存）。 */
  readPromptAccount: (id: string) => Promise<IpcResult<PromptAccountReadData>>;
  reorderPrompts: (input: PromptReorderInput) => Promise<IpcResult<PromptLibraryFile>>;
  movePromptsToCategory: (ids: string[], categoryId?: string) => Promise<IpcResult<PromptLibraryFile>>;
  createPromptCategory: (input: PromptCategoryInput) => Promise<IpcResult<PromptLibraryFile>>;
  updatePromptCategory: (input: PromptCategoryUpdate) => Promise<IpcResult<PromptLibraryFile>>;
  deletePromptCategory: (input: PromptCategoryDeleteInput) => Promise<IpcResult<PromptLibraryFile>>;
  reorderPromptCategories: (ids: string[]) => Promise<IpcResult<PromptLibraryFile>>;
  mergePromptCategories: (sourceId: string, targetId: string) => Promise<IpcResult<PromptLibraryFile>>;
  exportPromptLibrary: () => Promise<IpcResult<PromptLibraryExportResult>>;
  importPromptLibrary: () => Promise<IpcResult<PromptLibraryImportResult>>;
  fetchGithubProject: (url: string) => Promise<IpcResult<PromptGithubProject>>;
  listTodos: () => Promise<IpcResult<TodoLibraryFile>>;
  readTodoCalendar: () => Promise<IpcResult<TodoCalendarSettings>>;
  updateTodoCalendar: (change: TodoCalendarChange) => Promise<IpcResult<TodoCalendarSettings>>;
  getTodoHolidayYear: (year: number, refresh?: boolean) => Promise<IpcResult<TodoHolidayResult>>;
  createTodoTask: (input: CreateTodoTaskInput) => Promise<IpcResult<TodoTaskMutationData>>;
  updateTodoTask: (id: string, patch: UpdateTodoTaskInput) => Promise<IpcResult<TodoTaskMutationData>>;
  deleteTodoTask: (id: string) => Promise<IpcResult<TodoLibraryFile>>;
  completeTodoTask: (id: string) => Promise<IpcResult<TodoTaskMutationData>>;
  replaceTodoLibrary: (library: TodoLibraryReplaceInput) => Promise<IpcResult<TodoLibraryFile>>;
  importTodoFiles: () => Promise<IpcResult<TodoImportFilesData>>;
  exportTodoLibrary: (options?: import("../features/prompts/types").TodoExportOptions) => Promise<IpcResult<import("../features/prompts/types").TodoExportResult>>;
  importTodoLibraries: (libraries: TodoLibraryFile[]) => Promise<IpcResult<TodoLibraryFile>>;
  createTodoProject: (input: CreateTodoProjectInput) => Promise<IpcResult<TodoProjectMutationData>>;
  updateTodoProject: (id: string, patch: UpdateTodoProjectInput) => Promise<IpcResult<TodoProjectMutationData>>;
  deleteTodoProject: (id: string) => Promise<IpcResult<TodoLibraryFile>>;
  reorderTodoProjects: (ids: string[]) => Promise<IpcResult<TodoLibraryFile>>;
  createTodoWidget: (input: CreateTodoWidgetInput) => Promise<IpcResult<TodoWidgetMutationData>>;
  updateTodoWidget: (id: string, patch: UpdateTodoWidgetInput) => Promise<IpcResult<TodoWidgetMutationData>>;
  deleteTodoWidget: (id: string) => Promise<IpcResult<TodoLibraryFile>>;
  reorderTodoWidgets: (ids: string[]) => Promise<IpcResult<TodoLibraryFile>>;
  readLibraryViewSettings: () => Promise<IpcResult<LibraryViewSettings>>;
  previewTagOrganization: () => Promise<IpcResult<TagOrganizationPreview>>;
  applyTagOrganization: (request: TagOrganizationRequest) => Promise<IpcResult<{ library: LibraryFile; settings: LibraryViewSettings }>>;
  undoTagOrganization: () => Promise<IpcResult<{ library: LibraryFile; settings: LibraryViewSettings }>>;
  saveLibraryViewSettings: (settings: LibraryViewSettings) => Promise<IpcResult<LibraryViewSettings>>;
  chooseThemeBackgroundImage: () => Promise<IpcResult<ThemeBackgroundSelectionData>>;
  removeThemeBackgroundImage: (imageFileName: string | null) => Promise<IpcResult<{ removed: boolean }>>;
  listLibraryRoots: () => Promise<IpcResult<LibraryRoot[]>>;
  reorderLibraryRoots: (rootIds: string[]) => Promise<IpcResult<LibraryRoot[]>>;
  chooseAndScanLibraryRoot: () => Promise<IpcResult<ExternalLibraryScanData>>;
  chooseAndImportLibraryDirectory: () => Promise<IpcResult<ManagedDirectoryImportData>>;
  scanLibraryRoot: (rootId: string) => Promise<IpcResult<ExternalLibraryScanData>>;
  remapLibraryRoot: (rootId: string) => Promise<IpcResult<ExternalLibraryRemapData>>;
  removeLibraryRoot: (rootId: string) => Promise<IpcResult<ExternalLibraryRootRemoveData>>;
  purgeMissingLibraryRootItems: (rootId: string) => Promise<IpcResult<ExternalLibraryPurgeMissingData>>;
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
  importGeneratedImages: (payload: ImportGeneratedImagesPayload) => Promise<IpcResult<ImportGeneratedImagesData>>;
  importImageFilesForItem: (itemId: string) => Promise<IpcResult<ImportImageFilesForItemData>>;
  onImportProgress: (callback: (progress: ImportProgress) => void) => () => void;
  cancelImport: () => Promise<IpcResult<{ canceled: true }>>;
  importWordDocument: () => Promise<IpcResult<ImportWordDocumentData>>;
  importClipboardImage: () => Promise<IpcResult<ImportImagesData>>;
  importClipboardImageForItem: (itemId: string) => Promise<IpcResult<ImportClipboardImageForItemData>>;
  downloadRemoteMaterial: (itemId: string) => Promise<IpcResult<DownloadRemoteMaterialData>>;
  /** 接受已收录图片文件名，或尚未收录的生成图片 data URL。 */
  copyImage: (imageSource: string) => Promise<IpcResult<{ copied: true }>>;
  exportImage: (source: string | GeneratedWorkExportInput) => Promise<IpcResult<ExportImageData>>;
  getImageFileSize: (imageFileName: string) => Promise<IpcResult<{ size: number }>>;
  resolveImageThumbnail: (imageFileName: string) => Promise<IpcResult<ResolvedImageSourceData>>;
  resolveImageThumbnails: (imageFileNames: string[]) => Promise<IpcResult<ResolvedImageSourcesData>>;
  writeClipboardText: (text: string) => Promise<IpcResult<{ copied: true }>>;
  readClipboardText: () => Promise<IpcResult<{ text: string }>>;
  readClipboardImage: () => Promise<IpcResult<{ dataUrl: string; width: number; height: number }>>;
  saveCanvasReferenceImage: (
    dataUrl: string,
    sourceFileName?: string,
  ) => Promise<IpcResult<CanvasReferenceImageData>>;
  readCanvasReferenceImage: (fileName: string) => Promise<IpcResult<CanvasReferenceImageData>>;
  removeCanvasReferenceImage: (fileName: string) => Promise<IpcResult<{ removed: boolean }>>;
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
  exportZip: (itemIds: string[], authorChoice?: ArchiveExportAuthorChoice) => Promise<IpcResult<ExportZipData>>;
  importZip: () => Promise<IpcResult<ImportZipData>>;
  readAiSettings: () => Promise<IpcResult<PublicAiProviderSettings>>;
  saveAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<IpcResult<PublicAiProviderSettings>>;
  exportAiSettings: (payload: {
    type: "plain" | "full" | "account";
    password?: string;
  }) => Promise<IpcResult<{ canceled: boolean; filePath?: string }>>;
  importAiSettingsPreview: (payload: { password?: string }) =>
    Promise<IpcResult<AiSettingsImportPreview>>;
  importAiSettingsApply: (payload: { token: string; mode: "merge" | "replace" | "add-new" }) =>
    Promise<IpcResult<PublicAiProviderSettings>>;
  copyAiApiKey: (profileId: string) => Promise<IpcResult<{ copied: true }>>;
  readAiApiKey: (profileId: string) => Promise<IpcResult<{ apiKey: string }>>;
  testAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<IpcResult<AiSettingsTestData>>;
  listAiModels: (settings: SaveAiProviderSettingsPayload) => Promise<IpcResult<AiListProviderModelsData>>;
  analyzePromptWithAi: (payload: AiAnalyzePromptPayload) => Promise<IpcResult<AiAnalyzePromptData>>;
  preparePromptEntryWithAi: (payload: AiPreparePromptEntryPayload) => Promise<IpcResult<AiPreparePromptEntryData>>;
  optimizePromptWithAi: (payload: AiOptimizePromptPayload) => Promise<IpcResult<AiOptimizePromptData>>;
  summarizePromptTitleWithAi: (
    payload: AiSummarizePromptTitlePayload,
  ) => Promise<IpcResult<AiSummarizePromptTitleData>>;
  translatePromptWithAi: (payload: AiTranslatePromptPayload) => Promise<IpcResult<AiTranslatePromptData>>;
  reverseImagePromptWithAi: (payload: AiReverseImagePromptPayload) => Promise<IpcResult<AiReverseImagePromptData>>;
  generateImagesWithAi: (payload: AiImageGenerationPayload) => Promise<IpcResult<AiImageGenerationData>>;
  prepareDoubaoWebCanvas: () => Promise<IpcResult<DoubaoWebCanvasStatus>>;
  refreshDoubaoWebCanvasAuth: () => Promise<IpcResult<DoubaoWebCanvasStatus>>;
  setDoubaoWebCanvasBounds: (bounds: DoubaoWebCanvasBounds) => Promise<IpcResult<{ updated: true }>>;
  showDoubaoWebCanvas: () => Promise<IpcResult<{ visible: true }>>;
  hideDoubaoWebCanvas: () => Promise<IpcResult<{ visible: false }>>;
  generateImagesWithDoubaoWeb: (payload: AiImageGenerationPayload) => Promise<IpcResult<AiImageGenerationData>>;
  prepareWebAssistant: (input: WebAssistantPrepareInput) => Promise<IpcResult<{ platform: WebAssistantTargetId }>>;
  setWebAssistantBounds: (
    payload: { platform: WebAssistantTargetId; bounds: WebAssistantBounds; customUrl?: string | null },
  ) => Promise<IpcResult<{ updated: true }>>;
  showWebAssistant: (
    platform?: WebAssistantTargetId,
    customUrl?: string | null,
  ) => Promise<IpcResult<{ visible: true }>>;
  setWebAssistantVisibility: (visible: boolean) => Promise<IpcResult<{ visible: boolean }>>;
  /** 截取当前网页视图画面（JPEG data URL），供目录浮层在网页块上方展示时垫底。 */
  captureWebAssistant: (
    platform?: WebAssistantTargetId,
    customUrl?: string | null,
  ) => Promise<IpcResult<{ dataUrl: string; width: number; height: number }>>;
  /** 在当前网页助手页面执行脚本，返回最后一条表达式的值。脚本由渲染层模板拼装、主进程白名单执行。 */
  executeWebAssistantScript: (
    platform: WebAssistantTargetId,
    script: string,
    customUrl?: string | null,
  ) => Promise<IpcResult<{ value: unknown }>>;
  /** 保存当前网页助手画面 + 文本框提示词到素材库。 */
  importWebAssistantCapture: (
    platform: WebAssistantTargetId,
    options?: { title?: string | null; prompt?: string | null; customUrl?: string | null } | null,
  ) => Promise<IpcResult<ImportImagesData>>;
  hideWebAssistant: (platform?: WebAssistantTargetId) => Promise<IpcResult<{ visible: false }>>;
  disposeWebAssistant: () => Promise<IpcResult<{ disposed: true }>>;
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
  /** 本地 NSFW 模块：固定 Release 在线下载安装，不接受 Renderer 自定义地址。 */
  installModuleFromDownload: (moduleId: string) => Promise<IpcResult<{ installed: boolean }>>;
  installModuleFromGithub: (moduleId: string, githubOwner: string) => Promise<IpcResult<{ installed: boolean }>>;
  onModuleInstallProgress: (callback: (progress: ModuleInstallProgress) => void) => () => void;
  classifyLocalNsfw: (itemId: string) => Promise<IpcResult<LocalNsfwClassificationData>>;
  openNsfwModuleDownloadPage: () => Promise<IpcResult<{ opened: true }>>;
  removeNsfwModule: () => Promise<IpcResult<{ removed: boolean }>>;
  /** FFmpeg 按需组件：在线下载安装（固定 Release，内置验签）。 */
  installFfmpegComponentFromDownload: () => Promise<
    IpcResult<{ installed: boolean; version?: string; canceled?: boolean }>
  >;
  /** FFmpeg 按需组件：离线导入（用户选 manifest.json + .sig + zip 三件，内置验签）。 */
  installFfmpegComponentFromLocal: () => Promise<
    IpcResult<{ installed: boolean; version?: string; canceled?: boolean }>
  >;
  /** 打开内置 FFmpeg 版本对应的固定 Release 下载页。 */
  openFfmpegComponentDownloadPage: () => Promise<IpcResult<{ opened: true }>>;
  /** 仅删除应用 userData/components 中受管的 FFmpeg，不触碰系统 PATH。 */
  removeFfmpegComponent: () => Promise<IpcResult<{ removed: boolean }>>;
  onFfmpegInstallProgress: (callback: (progress: FfmpegInstallProgress) => void) => () => void;
  minimizeWindow: () => Promise<IpcResult<{ minimized: true }>>;
  toggleMaximizeWindow: () => Promise<IpcResult<{ maximized: boolean }>>;
  resizeWindow: (edge: import("./windowResize").WindowResizeEdge | null, point?: { x: number; y: number }) => Promise<IpcResult<Record<string, never>>>;
  closeWindow: () => Promise<IpcResult<{ closed: true }>>;
  isWindowMaximized: () => Promise<IpcResult<{ maximized: boolean }>>;
  toggleAlwaysOnTopWindow: () => Promise<IpcResult<{ alwaysOnTop: boolean }>>;
  isWindowAlwaysOnTop: () => Promise<IpcResult<{ alwaysOnTop: boolean }>>;
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
  /** 导出 TXT / ZIP 日志；反馈模式会自动准备 ZIP 并打开 GitHub Issue。 */
  exportLogs: (options?: LogExportOptions) => Promise<IpcResult<LogExportResult>>;
  /** 账号系统（docs/账号登录实施总方案.md）：渲染层只消费公开登录态，token 永不进入渲染层。 */
  accountGetStatus: () => Promise<IpcResult<AccountPublicStatus>>;
  accountGetCurrentUser: () => Promise<IpcResult<AccountUser | null>>;
  accountRegisterEmail: (
    input: EmailRegisterInput,
  ) => Promise<IpcResult<AccountPublicStatus | AccountRegistrationResult>>;
  accountLoginEmail: (input: EmailLoginInput) => Promise<IpcResult<AccountPublicStatus>>;
  accountStartOAuth: (
    provider: AccountLoginProviderId,
    options?: AccountOAuthStartOptions,
  ) => Promise<IpcResult<AccountOAuthStartResult>>;
  accountStartOAuthLink: (
    provider: Exclude<AccountLoginProviderId, "email">,
    options?: AccountOAuthStartOptions,
  ) => Promise<IpcResult<{ started: true; expiresAt: number }>>;
  accountConfirmOAuth: (
    selection?: AccountOAuthProfileSelection,
  ) => Promise<IpcResult<AccountPublicStatus>>;
  accountSelectOAuthAvatar: () => Promise<
    IpcResult<{ selected: boolean; previewUrl?: string }>
  >;
  accountCancelOAuth: () => Promise<IpcResult<{ cancelled: boolean }>>;
  accountUnlinkIdentity: (
    provider: Exclude<AccountLoginProviderId, "email">,
  ) => Promise<IpcResult<AccountPublicStatus>>;
  accountLogout: () => Promise<IpcResult<AccountPublicStatus>>;
  accountRefresh: () => Promise<IpcResult<AccountPublicStatus>>;
  accountUpdateProfile: (
    input: AccountProfileUpdateInput,
  ) => Promise<IpcResult<AccountPublicStatus>>;
  accountChooseAvatar: () => Promise<IpcResult<AccountPublicStatus | null>>;
  accountRemoveAvatar: () => Promise<IpcResult<AccountPublicStatus>>;
  /** 登录态变化事件（登录/退出/OAuth 完成/刷新失败清除）时推送公开状态。 */
  onAccountStatusChanged: (callback: (status: AccountPublicStatus) => void) => () => void;
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
