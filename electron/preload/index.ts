import type { TagOrganizationRequest } from "../../src/features/library/types/tagKnowledge";
import { contextBridge, ipcRenderer } from "electron";
import type {
  AiAnalyzePromptPayload,
  AiImageGenerationPayload,
  AiOptimizePromptPayload,
  AiPreparePromptEntryPayload,
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
import type {
  CreateTodoProjectInput,
  CreateTodoTaskInput,
  CreateTodoWidgetInput,
  TodoLibraryReplaceInput,
  UpdateTodoProjectInput,
  UpdateTodoTaskInput,
  UpdateTodoWidgetInput,
} from "../../src/features/prompts/types";
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
import type { AccountPublicStatus } from "../../src/features/account/types/account";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
};

const suyanApi: SuyanApi = {
  windowMaterial: process.argv.includes("--suyan-native-acrylic") ? "acrylic" : "fallback",
  notifyRendererReady: () => ipcRenderer.send(IpcChannelName.AppRendererReady),
  notifyStartupScreenReady: () => ipcRenderer.send(IpcChannelName.AppStartupScreenReady),
  logStartupEvent: (event, details = {}) => ipcRenderer.send(IpcChannelName.AppStartupLog, event, details),
  openExternalUrl: (url: string) => invoke(IpcChannelName.AppOpenExternalUrl, url),
  openDataDirectory: () => invoke(IpcChannelName.AppOpenDataDirectory),
  checkForUpdates: () => invoke(IpcChannelName.AppUpdateCheck),
  readAppUpdatePreferences: () => invoke(IpcChannelName.AppUpdatePreferencesRead),
  saveAppUpdatePreferences: (preferences) => invoke(IpcChannelName.AppUpdatePreferencesSave, preferences),
  readAccelerationStatus: () => invoke(IpcChannelName.AppAccelerationStatusRead),
  saveAccelerationSettings: (settings) => invoke(IpcChannelName.AppAccelerationSettingsSave, settings),
  readLibrary: () => invoke(IpcChannelName.LibraryRead),
  syncWorksToAccount: (input) => invoke(IpcChannelName.LibrarySyncWorks, input),
  saveLibrary: (library: LibraryFile) => invoke(IpcChannelName.LibrarySave, library),
  listPrompts: () => invoke(IpcChannelName.PromptList),
  createPrompt: (input) => invoke(IpcChannelName.PromptCreate, input),
  updatePrompt: (input) => invoke(IpcChannelName.PromptUpdate, input),
  deletePrompts: (ids) => invoke(IpcChannelName.PromptDelete, ids),
  copyPrompt: (input) => invoke(IpcChannelName.PromptCopy, input),
  setPromptFavorite: (id, favorite) => invoke(IpcChannelName.PromptFavorite, id, favorite),
  duplicatePrompt: (id) => invoke(IpcChannelName.PromptDuplicate, id),
  createPrompts: (inputs) => invoke(IpcChannelName.PromptCreateMany, inputs),
  readPromptClipboard: () => invoke(IpcChannelName.PromptClipboardRead),
  choosePromptContentImage: () => invoke(IpcChannelName.PromptContentImageChoose),
  savePromptContentImage: (dataUrl: string) => invoke(IpcChannelName.PromptContentImageSave, dataUrl),
  readPromptAccount: (id) => invoke(IpcChannelName.PromptAccountRead, id),
  reorderPrompts: (input) => invoke(IpcChannelName.PromptReorder, input),
  movePromptsToCategory: (ids, categoryId) => invoke(IpcChannelName.PromptMoveToCategory, ids, categoryId),
  createPromptCategory: (input) => invoke(IpcChannelName.PromptCategoryCreate, input),
  updatePromptCategory: (input) => invoke(IpcChannelName.PromptCategoryUpdate, input),
  deletePromptCategory: (input) => invoke(IpcChannelName.PromptCategoryDelete, input),
  reorderPromptCategories: (ids) => invoke(IpcChannelName.PromptCategoryReorder, ids),
  mergePromptCategories: (sourceId, targetId) => invoke(IpcChannelName.PromptCategoryMerge, sourceId, targetId),
  exportPromptLibrary: () => invoke(IpcChannelName.PromptExport),
  importPromptLibrary: () => invoke(IpcChannelName.PromptImport),
  fetchGithubProject: (url: string) => invoke(IpcChannelName.PromptGithubProjectFetch, url),
  listTodos: () => invoke(IpcChannelName.TodoList),
  readTodoCalendar: () => invoke(IpcChannelName.TodoCalendarRead),
  updateTodoCalendar: (change) => invoke(IpcChannelName.TodoCalendarUpdate, change),
  getTodoHolidayYear: (year, refresh) => invoke(IpcChannelName.TodoHolidayYear, year, refresh),
  createTodoTask: (input: CreateTodoTaskInput) => invoke(IpcChannelName.TodoTaskCreate, input),
  updateTodoTask: (id: string, patch: UpdateTodoTaskInput) => invoke(IpcChannelName.TodoTaskUpdate, id, patch),
  deleteTodoTask: (id: string) => invoke(IpcChannelName.TodoTaskDelete, id),
  completeTodoTask: (id: string) => invoke(IpcChannelName.TodoTaskComplete, id),
  replaceTodoLibrary: (library: TodoLibraryReplaceInput) => invoke(IpcChannelName.TodoLibraryReplace, library),
  importTodoFiles: () => invoke(IpcChannelName.TodoImportFiles),
  exportTodoLibrary: (options) => invoke(IpcChannelName.TodoExport, options),
  importTodoLibraries: (libraries) => invoke(IpcChannelName.TodoImportLibraries, libraries),
  createTodoProject: (input: CreateTodoProjectInput) => invoke(IpcChannelName.TodoProjectCreate, input),
  updateTodoProject: (id: string, patch: UpdateTodoProjectInput) => invoke(IpcChannelName.TodoProjectUpdate, id, patch),
  deleteTodoProject: (id: string) => invoke(IpcChannelName.TodoProjectDelete, id),
  reorderTodoProjects: (ids: string[]) => invoke(IpcChannelName.TodoProjectReorder, ids),
  createTodoWidget: (input: CreateTodoWidgetInput) => invoke(IpcChannelName.TodoWidgetCreate, input),
  updateTodoWidget: (id: string, patch: UpdateTodoWidgetInput) => invoke(IpcChannelName.TodoWidgetUpdate, id, patch),
  deleteTodoWidget: (id: string) => invoke(IpcChannelName.TodoWidgetDelete, id),
  reorderTodoWidgets: (ids: string[]) => invoke(IpcChannelName.TodoWidgetReorder, ids),
  readLibraryViewSettings: () => invoke(IpcChannelName.LibraryViewSettingsRead),
  previewTagOrganization: () => invoke(IpcChannelName.TagOrganizationPreview),
  applyTagOrganization: (request: TagOrganizationRequest) => invoke(IpcChannelName.TagOrganizationApply, request),
  undoTagOrganization: () => invoke(IpcChannelName.TagOrganizationUndo),
  saveLibraryViewSettings: (settings: LibraryViewSettings) =>
    invoke(IpcChannelName.LibraryViewSettingsSave, settings),
  chooseThemeBackgroundImage: () => invoke(IpcChannelName.ThemeBackgroundChoose),
  removeThemeBackgroundImage: (imageFileName: string | null) =>
    invoke(IpcChannelName.ThemeBackgroundRemove, imageFileName),
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
  exportImage: (source: Parameters<SuyanApi["exportImage"]>[0]) => invoke(IpcChannelName.ImageExport, source),
  getImageFileSize: (imageFileName: string) => invoke(IpcChannelName.ImageGetFileSize, imageFileName),
  resolveImageThumbnail: (imageFileName: string) => invoke(IpcChannelName.ImageThumbnailResolve, imageFileName),
  resolveImageThumbnails: (imageFileNames: string[]) =>
    invoke(IpcChannelName.ImageThumbnailsResolve, imageFileNames),
  writeClipboardText: (text: string) => invoke(IpcChannelName.ClipboardWriteText, text),
  readClipboardText: () => invoke(IpcChannelName.ClipboardReadText),
  readClipboardImage: () => invoke(IpcChannelName.ClipboardReadImage),
  saveCanvasReferenceImage: (dataUrl: string, sourceFileName?: string) =>
    invoke(IpcChannelName.CanvasReferenceImageSave, dataUrl, sourceFileName),
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
  exportZip: (itemIds: string[], authorChoice?: "keep" | "associate") =>
    invoke(IpcChannelName.ArchiveExportZip, itemIds, authorChoice),
  onExportProgress: (callback) => {
    const handler = (_event: unknown, progress: import("../../src/types/exportTask").ExportTaskProgress) => callback(progress);
    ipcRenderer.on(IpcChannelName.ExportProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.ExportProgress, handler);
  },
  importZip: () => invoke(IpcChannelName.ArchiveImportZip),
  readAiSettings: () => invoke(IpcChannelName.AiSettingsRead),
  saveAiSettings: (settings: SaveAiProviderSettingsPayload) => invoke(IpcChannelName.AiSettingsSave, settings),
  exportAiSettings: (payload: { type: "plain" | "full" | "account"; password?: string }) =>
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
  preparePromptEntryWithAi: (payload: AiPreparePromptEntryPayload) => invoke(IpcChannelName.AiPreparePromptEntry, payload),
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
  setWebAssistantVisibility: (visible) => invoke(IpcChannelName.WebAssistantVisibility, visible),
  captureWebAssistant: (platform, customUrl) =>
    invoke(IpcChannelName.WebAssistantCapture, platform, customUrl),
  executeWebAssistantScript: (platform: string, script: string, customUrl?: string | null) =>
    invoke(IpcChannelName.WebAssistantExecuteScript, platform, script, customUrl),
  importWebAssistantCapture: (platform: string, options?: { title?: string | null; prompt?: string | null; customUrl?: string | null } | null) =>
    invoke(IpcChannelName.WebAssistantImportCapture, platform, options),
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
  installModuleFromDownload: (moduleId: string) => invoke(IpcChannelName.ModuleInstallDownload, moduleId),
  installModuleFromGithub: (moduleId: string, githubOwner: string) =>
    invoke(IpcChannelName.ModuleInstallGithub, moduleId, githubOwner),
  onModuleInstallProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as ModuleInstallProgress);
    ipcRenderer.on(IpcChannelName.ModuleInstallProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.ModuleInstallProgress, handler);
  },
  classifyLocalNsfw: (itemId: string) => invoke(IpcChannelName.ModuleNsfwClassify, itemId),
  openNsfwModuleDownloadPage: () => invoke(IpcChannelName.ModuleNsfwOpenDownloadPage),
  removeNsfwModule: () => invoke(IpcChannelName.ModuleNsfwRemove),
  installFfmpegComponentFromDownload: () => invoke(IpcChannelName.ComponentFfmpegInstallDownload),
  installFfmpegComponentFromLocal: () => invoke(IpcChannelName.ComponentFfmpegInstallLocal),
  openFfmpegComponentDownloadPage: () => invoke(IpcChannelName.ComponentFfmpegOpenDownloadPage),
  removeFfmpegComponent: () => invoke(IpcChannelName.ComponentFfmpegRemove),
  onFfmpegInstallProgress: (callback) => {
    const handler = (_event: unknown, progress: unknown) => callback(progress as FfmpegInstallProgress);
    ipcRenderer.on(IpcChannelName.ComponentFfmpegInstallProgress, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.ComponentFfmpegInstallProgress, handler);
  },
  minimizeWindow: () => invoke(IpcChannelName.WindowMinimize),
  resizeWindow: (edge, point) => invoke(IpcChannelName.WindowResize, edge, point),
  toggleMaximizeWindow: () => invoke(IpcChannelName.WindowMaximizeToggle),
  closeWindow: () => invoke(IpcChannelName.WindowClose),
  isWindowMaximized: () => invoke<IpcResult<{ maximized: boolean }>>(IpcChannelName.WindowIsMaximized),
  toggleAlwaysOnTopWindow: () => invoke(IpcChannelName.WindowAlwaysOnTopToggle),
  isWindowAlwaysOnTop: () => invoke<IpcResult<{ alwaysOnTop: boolean }>>(IpcChannelName.WindowIsAlwaysOnTop),
  onWindowMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on(IpcChannelName.WindowMaximizeChange, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.WindowMaximizeChange, handler);
  },
  exportLogs: (options?: import("../../src/types/suyanApi").LogExportOptions) => invoke(IpcChannelName.LogExport, options),
  accountGetStatus: () => invoke(IpcChannelName.AccountGetStatus),
  accountGetCurrentUser: () => invoke(IpcChannelName.AccountGetCurrentUser),
  accountRegisterEmail: (input) => invoke(IpcChannelName.AccountRegisterEmail, input),
  accountLoginEmail: (input) => invoke(IpcChannelName.AccountLoginEmail, input),
  accountStartOAuth: (provider, options) =>
    options
      ? invoke(IpcChannelName.AccountStartOAuth, { provider, ...options })
      : invoke(IpcChannelName.AccountStartOAuth, provider),
  accountStartOAuthLink: (provider, options) =>
    options
      ? invoke(IpcChannelName.AccountStartOAuthLink, { provider, ...options })
      : invoke(IpcChannelName.AccountStartOAuthLink, provider),
  accountConfirmOAuth: (selection) =>
    selection
      ? invoke(IpcChannelName.AccountConfirmOAuth, selection)
      : invoke(IpcChannelName.AccountConfirmOAuth),
  accountSelectOAuthAvatar: () => invoke(IpcChannelName.AccountSelectOAuthAvatar),
  accountCancelOAuth: () => invoke(IpcChannelName.AccountCancelOAuth),
  accountUnlinkIdentity: (provider) =>
    invoke(IpcChannelName.AccountUnlinkIdentity, provider),
  accountLogout: () => invoke(IpcChannelName.AccountLogout),
  accountRefresh: () => invoke(IpcChannelName.AccountRefresh),
  accountUpdateProfile: (input) => invoke(IpcChannelName.AccountUpdateProfile, input),
  accountChooseAvatar: () => invoke(IpcChannelName.AccountChooseAvatar),
  accountRemoveAvatar: () => invoke(IpcChannelName.AccountRemoveAvatar),
  onAccountStatusChanged: (callback) => {
    const handler = (_event: unknown, status: unknown) => callback(status as AccountPublicStatus);
    ipcRenderer.on(IpcChannelName.AccountStatusChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannelName.AccountStatusChanged, handler);
  },
};

contextBridge.exposeInMainWorld("suyanApi", suyanApi);
