import { create } from "zustand";
import {
  errorStatus,
  failureStatus,
  formatSavedBytes,
  infoStatus,
  progressStatus,
  successStatus,
  statusToastAutoDismissMs,
  type StatusMessage,
} from "./statusMessages";
import type {
  CompressProgress,
  CompressResult,
  DeduplicateResult,
  DownloadRemoteMaterialData,
  ImageCompressOptions,
  ImportClipboardImageForItemData,
  ImportGeneratedImagesData,
  ImportGeneratedImagesPayload,
  ImportImageBufferInput,
  ImportImagesData,
  IpcResult,
  VideoCompressOptions,
} from "../../../types/suyanApi";
import type {
  AiActionPreference,
  AiAnalyzePromptPayload,
  AiGeneratedImage,
  AiFeatureAction,
  AiModelSelection,
  AiProviderModelCapability,
  AiProviderModelSettings,
  AiOptimizePromptPayload,
  AiRecognitionSourcePreferences,
  AiReverseImagePromptPayload,
  AiSummarizePromptTitlePayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  PublicAiProviderProfile,
  PublicAiProviderSettings,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import {
  buildAiActionInstructions,
  normalizeAiRecognitionSourcePreferences,
} from "../types/ai";
import { buildPublicAiSettingsPayload, updateAiActionModelPreference } from "../utils/aiSettingsDraft";
import type { CanvasDraftSettings, CanvasGenerationResult, CanvasPhase } from "../types/canvas";
import type {
  LibraryFile,
  LibraryItem,
  LibraryRoot,
  LibraryViewSettings,
  MaterialBrowserCollectionMode,
  MaterialBrowserGalleryMode,
  MaterialBrowserSortDirection,
  MaterialBrowserSortMode,
  NetworkMaterialImportMode,
  NsfwGradingSpeed,
  NsfwDetectionMode,
  NsfwRating,
  PromptLexiconEntry,
  PromptLexiconKind,
  PromptLexiconSettings,
  SidebarEntryId,
  SidebarEntryVisibility,
  ThemeAccent,
  ThemeAccentMemoryByPreset,
  ThemeCustomTheme,
  ThemeCustomAccentSlot,
  ThemeMode,
  ThemePreset,
  CategoryWorkspaceState,
} from "../types/library";
import type { ArchiveExportAuthorChoice, ExportZipData } from "../../../types/suyanApi";
import {
  defaultWorkspaceWidthPercent,
  normalizeWorkspaceWidthPercent,
} from "../types/library";
import type {
  CategoryAssignmentSource,
  CategoryCandidateProposal,
  CategoryInboxItem,
  CategoryLearningEvent,
  CategoryTaxonomy,
} from "../types/category";
import {
  createEmptyCategoryTaxonomy,
  ensureSystemCategoryTaxonomy,
  mergeLexiconCategoriesIntoTaxonomy,
  removeCategoryNode,
  recomputeCategoryUsageCounts,
  resolveCategoryName,
  syncLexiconCategoriesFromTaxonomy,
  taxonomyToLexiconCategories,
  upsertCustomCategoryNode,
} from "../utils/categoryTaxonomy";
import {
  sanitizeMaterialTags,
} from "../utils/tagNormalization";
import { assignItemCategory } from "../utils/categoryMigration";
import { normalizeCategoryLabelKey } from "../utils/categoryId";
import type { ProxyDetectionData, ProxySettings } from "../types/proxy";
import { defaultProxySettings } from "../types/proxy";
import { buildLibraryFile, uniqueTags } from "../utils/buildLibraryFile";
import { defaultCanvasDraftSettings, normalizeCanvasDraftSettings } from "../utils/canvasGeneration";
import {
  defaultNsfwGradingSpeed,
  getNsfwGradingConcurrency,
} from "../utils/nsfwGradingSpeed";
import { defaultNsfwDetectionMode } from "../utils/nsfwDetectionMode";
import {
  analyzePromptText,
  analyzePromptTags,
  isolateCategoryAnalysisResult,
  normalizeManualPromptTags,
  normalizeConcretePromptTags,
  type PromptAnalysisResult,
} from "../utils/promptAnalysis";
import { maxAnalysisResultCount } from "../utils/analysisMergeCap";
import {
  buildPromptAnalysisFromRemote,
  type PromptAnalysisRunResult,
} from "../utils/remotePromptAnalysis";
import { resolvePromptGroupPatchItemIds } from "../utils/promptImageGroups";
import {
  resolveNsfwRatingFromRemoteAnalysisV2,
  shouldGradeNsfwItem,
} from "../utils/nsfwRating";
import { applyTagConfigurationToItems, type TagConfigurationDraft } from "../utils/tagSettings";
import { getUiErrorMessage } from "../utils/uiMessages";
import { buildAiErrorPresentation, type AiErrorPresentation } from "../utils/aiErrorPresentation";
import { reconcileItemsByIdentity } from "../utils/libraryItemIdentity";
import {
  applyThemeModeToRoot,
  DEFAULT_THEME_PRESET,
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_CUSTOM_ACCENT,
  DEFAULT_THEME_CUSTOM_ACCENTS,
  DEFAULT_THEME_OPACITY,
  DEFAULT_THEME_ACCENT_OPACITY,
  finishThemeModeSwitch,
  createDefaultThemeAccentMemory,
  getDefaultThemeAccentForPreset,
  isThemeCustomAccentSlot,
  normalizeThemeCustomTheme,
  normalizeThemeAccentOpacity,
  normalizeThemeCustomAccent,
  normalizeThemeOpacity,
} from "../utils/themeMode";
import { isPendingStatusFeedbackText, type StatusFeedbackMessage } from "../utils/statusFeedback";
import {
  builtinModuleDefinitions,
  getBuiltinModuleDefinition,
  isBuiltinModuleEnabled,
  resolveBuiltinModuleState,
  getModuleRuntimeDependencies,
  type BuiltinModuleId,
  type BuiltinModuleState,
  type BuiltinModuleStatePatch,
} from "../utils/moduleRegistry";
import { resolveVideoRuntimeStateAfterProbe } from "../utils/moduleManagement";
import {
  defaultSidebarEntryVisibility,
  normalizeSidebarEntryVisibility,
} from "../utils/sidebarEntries";
import type { PromptViewSettings } from "../../prompts/types";
import type { AppLanguage } from "../../../types/locale";
import { defaultAppLanguage } from "../../../types/locale";

// Settings writes share one JSON file. Serialize them so an autosave from the
// tag/category workspace cannot finish after a newer custom-entry save and
// overwrite it with an older snapshot.
let viewSettingsWriteChain: Promise<void> = Promise.resolve();
let tagOrganizationRevision = 0;
let archiveKnowledgeRevision = 0;

export function runTagOrganization<T>(work: () => Promise<T>): Promise<T> {
  const task = viewSettingsWriteChain.then(async () => {
    const result = await work();
    tagOrganizationRevision += 1;
    return result;
  });
  viewSettingsWriteChain = task.then(() => undefined, () => undefined);
  return task;
}
let aiSettingsWriteChain: Promise<void> = Promise.resolve();
let aiSettingsSaveRevision = 0;
let aiSettingsFullSaveInFlight = 0;
let canvasDraftSaveTimer: ReturnType<typeof setTimeout> | null = null;
let materialBrowserScrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
let workspaceWidthSaveTimer: ReturnType<typeof setTimeout> | null = null;

function saveLibraryViewSettingsSerialized(
  settings: LibraryViewSettings,
): Promise<IpcResult<LibraryViewSettings>> {
  const revision = tagOrganizationRevision;
  const knowledgeRevision = archiveKnowledgeRevision;
  const task = viewSettingsWriteChain.then(() => {
    const current = useLibraryStore.getState();
    const next = knowledgeRevision !== archiveKnowledgeRevision ? {
      ...settings, promptLexicons: current.promptLexicons,
      categoryWorkspace: buildLibraryViewSettings(current).categoryWorkspace,
    } : revision !== tagOrganizationRevision ? {
      ...settings, promptLexicons: { ...settings.promptLexicons!, tags: current.promptLexicons?.tags ?? [] },
    } : settings;
    return window.suyanApi.saveLibraryViewSettings(next);
  });
  viewSettingsWriteChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function saveAiSettingsSerialized(
  settings: SaveAiProviderSettingsPayload,
): Promise<IpcResult<PublicAiProviderSettings>> {
  const task = aiSettingsWriteChain.then(() => window.suyanApi.saveAiSettings(settings));
  aiSettingsWriteChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function logAiSettingsSaveEvent(
  event: string,
  details: {
    actionPreferenceCount: number;
    activeProfileId: string;
    profileCount: number;
    requestRevision: number;
    source: "full" | "action" | "recognition-source";
    action?: AiFeatureAction;
    modelId?: string;
    profileId?: string;
    superseded?: boolean;
    ok?: boolean;
  },
): void {
  logRendererStartupEvent(`ai-settings:${event}`, details);
}

type SaveItemOptions = {
  background?: boolean;
  preserveManualTags?: boolean;
  silent?: boolean;
};

type AiConnectionTestResult = {
  message: string;
  ok: boolean;
};

type MaterialBrowserSettingsPatch = Partial<Pick<
  LibraryViewSettings,
  | "materialBrowserCollectionMode"
  | "materialBrowserGalleryMode"
  | "materialBrowserSortMode"
  | "materialBrowserSortDirection"
  | "materialBrowserRandomSeed"
>>;

const defaultMasonryTileWidth = 4;
const minMasonryTileWidth = 2;
const maxMasonryTileWidth = 10;
const importOperationTimeoutMs = 65_000;

const inFlightRemoteMaterialDownloads = new Set<string>();

import { normalizeCanvasBackground, type CanvasBackgroundSettings } from "../utils/canvasBackground";

type LibraryState = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<boolean>;
  canvasBackground: CanvasBackgroundSettings;
  saveCanvasBackground: (patch: Partial<CanvasBackgroundSettings>) => Promise<boolean>;
  items: LibraryItem[];
  libraryRoots: LibraryRoot[];
  selectedItemId: string | null;
  /** 刚导入的素材 id（按导入顺序），用于素材浏览列表临时置顶展示。 */
  recentImportPinIds: string[];
  searchQuery: string;
  canvasDraft: CanvasDraftSettings;
  canvasGenerationResults: CanvasGenerationResult[];
  canvasLastModel: string;
  /** 画布是否正在生成（按钮置灰/转圈，跨视图保留）。 */
  canvasIsGenerating: boolean;
  /** 画布状态机阶段，跨视图保留。 */
  canvasPhase: CanvasPhase;
  /** 「理解中」阶段展示的关键词，跨视图保留。 */
  canvasThinkingKeywords: string[];
  tagOrder: string[];
  likedImageIds: string[];
  starredRecommendations: string[];
  webAssistantCustomUrls: string[];
  /** 网页助手上次选择的平台，持久化。 */
  webAssistantLastPlatform: string | null;
  /** 网页助手上次使用的自定义网址，持久化。 */
  webAssistantLastCustomUrl: string | null;
  generationModelOrder: string[];
  hiddenGenerationModels: string[];
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  themeAccent: ThemeAccent;
  themeCustomAccent: string;
  themeOpacity: number;
  themeNavigationOpacity: number;
  themeBackgroundOpacity: number;
  themeWorkspaceOpacity: number;
  themeAccentOpacity: number;
  themeCustomAccents: [string, string, string];
  themeAccentMemory: ThemeAccentMemoryByPreset;
  customTheme: ThemeCustomTheme;
  workspaceWidthPercent: number;
  sidebarEntryVisibility: SidebarEntryVisibility;
  featureGuideCompleted: string[];
  autoNsfwGrading: boolean;
  blurNsfwImages: boolean;
  nsfwGradingSpeed: NsfwGradingSpeed;
  nsfwDetectionMode: NsfwDetectionMode;
  masonryTileWidth: number;
  materialBrowserCollectionMode: MaterialBrowserCollectionMode;
  materialBrowserGalleryMode: MaterialBrowserGalleryMode;
  materialBrowserSortMode: MaterialBrowserSortMode;
  materialBrowserSortDirection: MaterialBrowserSortDirection;
  materialBrowserRandomSeed: number;
  materialBrowserScrollTop: number;
  networkMaterialImportMode: NetworkMaterialImportMode;
  promptLexicons: PromptLexiconSettings | null;
  promptViewSettings: PromptViewSettings;
  categoryTaxonomy: import("../types/category").CategoryTaxonomy | null;
  categoryInbox: import("../types/category").CategoryInboxItem[];
  categoryCandidates: import("../types/category").CategoryCandidateProposal[];
  categoryLearningEvents: import("../types/category").CategoryLearningEvent[];
  aiSettings: PublicAiProviderSettings;
  proxySettings: ProxySettings;
  isLoading: boolean;
  isBusy: boolean;
  statusMessage: StatusMessage | null;
  aiErrorDialog: AiErrorPresentation | null;
  aiAnalysisCircuitOpen: boolean;
  load: () => Promise<void>;
  showStatusMessage: (message: StatusFeedbackMessage) => void;
  setSearchQuery: (searchQuery: string) => void;
  updateCanvasDraft: (patch: Partial<CanvasDraftSettings>) => void;
  setCanvasGenerationResults: (results: CanvasGenerationResult[]) => void;
  setCanvasLastModel: (model: string) => void;
  /** 画布生成态机：thinking/generating/reveal/created/empty。
   *  提到 store 是因为 CanvasView 切到素材库会被卸载，局部 state 全丢，
   *  再切回时即使主进程后台还在生图也看不到「创作中」。store 让生成态跨视图保留。 */
  setCanvasPhase: (phase: CanvasPhase) => void;
  setCanvasThinkingKeywords: (keywords: string[]) => void;
  setCanvasGenerating: (generating: boolean) => void;
  setSelectedItemId: (selectedItemId: string | null) => void;
  clearRecentImportPins: () => void;
  setThemeMode: (themeMode: ThemeMode) => Promise<void>;
  setThemePreset: (themePreset: ThemePreset) => Promise<void>;
  setThemeAccent: (themeAccent: ThemeAccent, themeCustomAccent?: string, customAccentSlot?: ThemeCustomAccentSlot) => Promise<void>;
  setThemeOpacity: (themeOpacity: number) => Promise<void>;
  setThemeNavigationOpacity: (themeOpacity: number) => Promise<void>;
  setThemeBackgroundOpacity: (themeOpacity: number) => Promise<void>;
  setThemeWorkspaceOpacity: (themeOpacity: number) => Promise<void>;
  setThemeAccentOpacity: (themeAccentOpacity: number) => Promise<void>;
  setCustomTheme: (patch: Partial<ThemeCustomTheme>) => Promise<void>;
  setWorkspaceWidthPercent: (workspaceWidthPercent: number) => void;
  saveSidebarEntryVisibility: (entryId: SidebarEntryId, visible: boolean) => Promise<boolean>;
  completeFeatureGuide: (guideId: string) => Promise<boolean>;
  resetFeatureGuides: () => Promise<boolean>;
  saveGenerationModelPreferences: (patch: {
    generationModelOrder?: string[];
    hiddenGenerationModels?: string[];
  }) => Promise<void>;
  saveNsfwSettings: (settings: {
    autoNsfwGrading: boolean;
    blurNsfwImages: boolean;
    nsfwGradingSpeed: NsfwGradingSpeed;
    nsfwDetectionMode: NsfwDetectionMode;
  }) => Promise<boolean>;
  saveNetworkMaterialImportMode: (networkMaterialImportMode: NetworkMaterialImportMode) => Promise<boolean>;
  saveMasonryTileWidth: (masonryTileWidth: number) => Promise<void>;
  saveMaterialBrowserSettings: (patch: MaterialBrowserSettingsPatch) => Promise<boolean>;
  saveMaterialBrowserScrollTop: (scrollTop: number) => void;
  gradeAllImagesForNsfw: (options?: { force?: boolean }) => Promise<void>;
  saveAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<boolean | string>;
  applyImportedAiSettings: (settings: PublicAiProviderSettings) => void;
  saveAiActionModelPreference: (
    action: AiFeatureAction,
    selection: AiModelSelection,
  ) => Promise<boolean>;
  saveAiRecognitionSourcePreferences: (preferences: AiRecognitionSourcePreferences) => Promise<boolean>;
  testAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<AiConnectionTestResult>;
  listAiModels: (settings: SaveAiProviderSettingsPayload) => Promise<AiProviderModelSettings[] | null>;
  copyAiApiKey: (profileId: string, draftApiKey?: string) => Promise<boolean>;
  analyzePromptWithAi: (payload: AiAnalyzePromptPayload) => Promise<PromptAnalysisRunResult>;
  optimizePromptWithAi: (payload: AiOptimizePromptPayload) => Promise<string | null>;
  summarizePromptTitleWithAi: (payload: AiSummarizePromptTitlePayload) => Promise<string | null>;
  translatePromptWithAi: (payload: AiTranslatePromptPayload) => Promise<AiTranslatePromptData | null>;
  reverseImagePromptWithAi: (payload: AiReverseImagePromptPayload) => Promise<string | null>;
  saveProxySettings: (settings: ProxySettings) => Promise<boolean>;
  testProxySettings: (settings: ProxySettings) => Promise<boolean>;
  detectProxySettings: () => Promise<ProxyDetectionData | null>;
  clearStatus: () => void;
  clearAiErrorDialog: () => void;
  clearAiAnalysisCircuit: () => void;
  openExternalUrl: (url: string, label?: string) => Promise<boolean>;
  openFfmpegComponentDownloadPage: () => Promise<boolean>;
  openNsfwModuleDownloadPage: () => Promise<boolean>;
  importImages: () => Promise<void>;
  importManagedLibraryDirectory: () => Promise<void>;
  addAndScanLibraryRoot: () => Promise<void>;
  scanLibraryRoot: (rootId: string) => Promise<void>;
  reorderLibraryRoots: (rootIds: string[]) => Promise<void>;
  setLibraryRootWatch: (rootId: string, enabled: boolean) => Promise<void>;
  remapLibraryRoot: (rootId: string) => Promise<void>;
  removeLibraryRoot: (rootId: string) => Promise<void>;
  purgeMissingLibraryRootItems: (rootId: string) => Promise<void>;
  validateExternalLibrary: () => Promise<void>;
  importImageBuffers: (images: ImportImageBufferInput[]) => Promise<void>;
  importGeneratedImages: (
    images: AiGeneratedImage[],
    metadata: ImportGeneratedImagesPayload["metadata"],
  ) => Promise<LibraryItem[]>;
  importImageFilesForItem: (itemId: string) => Promise<string | null>;
  importWordDocument: () => Promise<void>;
  importClipboardImage: () => Promise<void>;
  importClipboardImageForItem: (itemId: string) => Promise<string | null>;
  downloadRemoteMaterial: (itemId: string) => Promise<boolean>;
  generateVideoFrames: (itemId: string) => Promise<boolean>;
  importVideoReferenceImages: (itemId: string) => Promise<boolean>;
  deleteVideoReferenceImage: (itemId: string, imageFileName: string) => Promise<boolean>;
  importClipboardReferenceImage: (itemId: string) => Promise<boolean>;
  importReferenceImageFromUrl: (itemId: string, url: string) => Promise<boolean>;
  importZip: () => Promise<void>;
  exportZip: (itemIds?: string[], authorChoice?: ArchiveExportAuthorChoice) => Promise<ExportZipData | null>;
  syncWorksToAccount: (itemIds: string[], expectedUid: string, force?: boolean) => Promise<boolean>;
  refreshWorkAuthors: () => Promise<void>;
  saveItem: (itemId: string, patch: Partial<LibraryItem>, options?: SaveItemOptions) => Promise<void>;
  /**
   * Apply the same or per-item patches to many items and persist once.
   * Used by bulk clear-category / clear-tags to avoid N full library writes.
   */
  saveItemsBatch: (
    patches: ReadonlyArray<{ itemId: string; patch: Partial<LibraryItem> }>,
    options?: SaveItemOptions,
  ) => Promise<boolean>;
  /**
   * Clear assignment data for one lexicon domain and persist both library + view-settings.
   * - categories: wipe item category/genre fields (system taxonomy tree stays)
   * - tags: wipe item tags + empty tag lexicon directory
   */
  clearLexiconDomain: (domain: "categories" | "tags") => Promise<boolean>;
  saveTagConfiguration: (
    originalTags: string[],
    drafts: TagConfigurationDraft[],
    promptLexicons?: PromptLexiconSettings,
  ) => Promise<void>;
  savePromptLexicons: (
    promptLexicons: PromptLexiconSettings,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  assignItemCategoryId: (
    itemId: string,
    categoryId: string | null,
    source?: import("../types/category").CategoryAssignmentSource,
  ) => Promise<void>;
  /** Move one or more prompt groups (by primary item id) into a category. */
  movePromptGroupsToCategory: (
    itemIds: readonly string[],
    categoryId: string | null,
    source?: import("../types/category").CategoryAssignmentSource,
  ) => Promise<boolean>;
  upsertCustomCategory: (input: {
    id?: string | null;
    name: string;
    group?: string | null;
    description?: string | null;
    parentId?: string | null;
    imageFileName?: string | null;
  }) => Promise<string | null>;
  deleteCustomCategory: (categoryId: string, reassignToCategoryId?: string | null) => Promise<boolean>;
  dismissCategoryInboxItem: (itemId: string) => Promise<void>;
  importPromptLexicon: (kind: PromptLexiconKind) => Promise<PromptLexiconEntry[] | null>;
  exportPromptLexicon: (kind: PromptLexiconKind, items: PromptLexiconEntry[]) => Promise<void>;
  importPromptLexiconImage: () => Promise<string | null>;
  toggleFavoriteImage: (itemId: string) => Promise<void>;
  toggleRecommendationStar: (url: string) => Promise<void>;
  addWebAssistantCustomUrl: (url: string) => Promise<void>;
  removeWebAssistantCustomUrl: (url: string) => Promise<void>;
  saveWebAssistantPrefs: (prefs: { platform: string; customUrl: string | null }) => Promise<void>;
  deleteItems: (itemIds: string[], deleteImages: boolean) => Promise<void>;
  deleteSelected: (deleteImages: boolean) => Promise<void>;
  copyImage: (imageFileName: string) => Promise<void>;
  exportImage: (imageFileName: string) => Promise<void>;
  copyText: (text: string, successText: string) => Promise<void>;
  deduplicateScan: () => Promise<DeduplicateResult | null>;
  compressImages: (
    options: ImageCompressOptions,
    onProgress?: (progress: CompressProgress) => void,
  ) => Promise<CompressResult | null>;
  compressVideos: (
    options: VideoCompressOptions,
    onProgress?: (progress: CompressProgress) => void,
  ) => Promise<CompressResult | null>;
  cancelCompress: () => Promise<void>;
  moduleState: BuiltinModuleState;
  setModuleState: (patch: BuiltinModuleStatePatch) => Promise<boolean>;
  removeModule: (moduleId: BuiltinModuleId) => Promise<boolean>;
  restoreModule: (moduleId: BuiltinModuleId) => Promise<boolean>;
  installModule: (
    moduleId: BuiltinModuleId,
    options?: { source?: "download" | "local" },
  ) => Promise<boolean>;
  /** 实测 video-runtime 二进制是否可用，并同步修正 moduleState。 */
  checkVideoRuntime: (options?: { force?: boolean }) => Promise<boolean>;
  /** 实测本地 NSFW 模块是否可用，并同步修正 moduleState。 */
  checkNsfwRuntime: () => Promise<boolean>;
};

let themeSwitchRevision = 0;
let themePersistenceQueue: Promise<void> = Promise.resolve();
/** 主进程事件订阅（外部库变更 + FFmpeg 安装进度）只挂一次。 */
let isMainProcessEventSubscribed = false;  /** checkVideoRuntime 短缓存：避免关键帧/压缩连点时重复 IPC。安装成功后会主动刷新；force 时绕过。 */
let videoRuntimeProbeCache: { installed: boolean; checkedAt: number } | null = null;
const VIDEO_RUNTIME_PROBE_TTL_MS = 30_000;

type ThemeOpacityKey = "themeNavigationOpacity" | "themeBackgroundOpacity" | "themeWorkspaceOpacity";

async function persistThemeLayerOpacity(
  key: ThemeOpacityKey,
  value: number,
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
): Promise<void> {
  const currentState = get();
  const nextValue = normalizeThemeOpacity(value);
  if (nextValue === currentState[key]) {
    return;
  }

  const revision = ++themeSwitchRevision;
  const currentThemeMode = currentState.themeMode;
  const nextPatch: Partial<LibraryState> = {
    [key]: nextValue,
    ...(key === "themeNavigationOpacity" ? { themeOpacity: nextValue } : {}),
  };
  const applyOptions = {
    themePreset: currentState.themePreset,
    themeAccent: currentState.themeAccent,
    themeCustomAccent: currentState.themeCustomAccent,
    themeCustomAccents: currentState.themeCustomAccents,
    themeOpacity: key === "themeNavigationOpacity" ? nextValue : currentState.themeOpacity,
    themeNavigationOpacity: key === "themeNavigationOpacity" ? nextValue : currentState.themeNavigationOpacity,
    themeBackgroundOpacity: key === "themeBackgroundOpacity" ? nextValue : currentState.themeBackgroundOpacity,
    themeWorkspaceOpacity: key === "themeWorkspaceOpacity" ? nextValue : currentState.themeWorkspaceOpacity,
    themeAccentOpacity: currentState.themeAccentOpacity,
    customTheme: currentState.customTheme,
  };
  applyThemeModeToRoot(currentThemeMode, document.documentElement, applyOptions);
  set({ ...nextPatch, statusMessage: null });

  themePersistenceQueue = themePersistenceQueue.then(async () => {
    if (revision !== themeSwitchRevision) return;
    const result = await saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get(), {
      [key]: nextValue,
      ...(key === "themeNavigationOpacity" ? { themeOpacity: nextValue } : {}),
    }));
    if (result.ok || revision !== themeSwitchRevision) return;

    const rollbackState = get();
    applyThemeModeToRoot(currentThemeMode, document.documentElement, {
      themePreset: rollbackState.themePreset,
      themeAccent: rollbackState.themeAccent,
      themeCustomAccent: rollbackState.themeCustomAccent,
      themeCustomAccents: rollbackState.themeCustomAccents,
      themeOpacity: currentState.themeOpacity,
      themeNavigationOpacity: currentState.themeNavigationOpacity,
      themeBackgroundOpacity: currentState.themeBackgroundOpacity,
      themeWorkspaceOpacity: currentState.themeWorkspaceOpacity,
      themeAccentOpacity: rollbackState.themeAccentOpacity,
      customTheme: rollbackState.customTheme,
    });
    set({
      [key]: currentState[key],
      ...(key === "themeNavigationOpacity" ? { themeOpacity: currentState.themeOpacity } : {}),
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
  });
  await themePersistenceQueue;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  language: defaultAppLanguage,
  items: [],
  libraryRoots: [],
  selectedItemId: null,
  recentImportPinIds: [],
  searchQuery: "",
  canvasDraft: { ...defaultCanvasDraftSettings },
  canvasGenerationResults: [],
  canvasLastModel: "",
  canvasIsGenerating: false,
  canvasPhase: "empty",
  canvasThinkingKeywords: [],
  tagOrder: [],
  likedImageIds: [],
  starredRecommendations: [],
  webAssistantCustomUrls: [],
  webAssistantLastPlatform: null,
  webAssistantLastCustomUrl: null,
  generationModelOrder: [],
  hiddenGenerationModels: [],
  themeMode: "light",
  themePreset: DEFAULT_THEME_PRESET,
  themeAccent: DEFAULT_THEME_ACCENT,
  themeCustomAccent: DEFAULT_THEME_CUSTOM_ACCENT,
  themeOpacity: DEFAULT_THEME_OPACITY,
  themeNavigationOpacity: DEFAULT_THEME_OPACITY,
  themeBackgroundOpacity: DEFAULT_THEME_OPACITY,
  themeWorkspaceOpacity: DEFAULT_THEME_OPACITY,
  themeAccentOpacity: DEFAULT_THEME_ACCENT_OPACITY,
  themeCustomAccents: [...DEFAULT_THEME_CUSTOM_ACCENTS] as [string, string, string],
  themeAccentMemory: createDefaultThemeAccentMemory(),
  customTheme: normalizeThemeCustomTheme(undefined),
  canvasBackground: normalizeCanvasBackground(undefined),
  workspaceWidthPercent: defaultWorkspaceWidthPercent,
  sidebarEntryVisibility: { ...defaultSidebarEntryVisibility },
  featureGuideCompleted: [],
  autoNsfwGrading: false,
  blurNsfwImages: false,
  nsfwGradingSpeed: defaultNsfwGradingSpeed,
  nsfwDetectionMode: defaultNsfwDetectionMode,
  masonryTileWidth: defaultMasonryTileWidth,
  materialBrowserCollectionMode: "all",
  materialBrowserGalleryMode: "masonry",
  materialBrowserSortMode: "importedAt",
  materialBrowserSortDirection: "desc",
  materialBrowserRandomSeed: 0,
  materialBrowserScrollTop: 0,
  networkMaterialImportMode: "download",
  promptLexicons: null,
  promptViewSettings: {
    sidebarMode: "expanded",
    sidebarWidth: 220,
    viewMode: "grid",
    sortMode: "updated",
    cardDensity: "comfortable",
    todoSidebarVisible: false,
    todoSidebarWidth: 280,
  },
  categoryTaxonomy: null,
  categoryInbox: [],
  categoryCandidates: [],
  categoryLearningEvents: [],
  aiSettings: {
    activeProfileId: "default",
    profiles: [
      {
        id: "default",
        name: "默认 API",
        enabled: false,
        baseUrl: "https://api.openai.com/v1",
        hasApiKey: false,
        apiKeyPreview: "",
        model: "gpt-4.1-mini",
        models: [
          {
            id: "gpt-4.1-mini",
            label: "gpt-4.1-mini",
            capabilities: ["text", "vision"],
          },
        ],
      },
    ],
    actionPreferences: {},
    recognitionSourcePreferences: {},
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    hasApiKey: false,
    apiKeyPreview: "",
    model: "gpt-4.1-mini",
  },
  proxySettings: defaultProxySettings,
  moduleState: resolveBuiltinModuleState(),
  isLoading: false,
  isBusy: false,
  statusMessage: null,
  aiErrorDialog: null,
  aiAnalysisCircuitOpen: false,

  load: async () => {
    const loadStartedAt = performance.now();
    logRendererStartupEvent("library-load:start");
    set({ isLoading: true, statusMessage: null });

    if (!isMainProcessEventSubscribed) {
      isMainProcessEventSubscribed = true;
      window.suyanApi.onFfmpegInstallProgress((progress) => {
        if (progress.phase === "done") {
          set({ statusMessage: successStatus("视频依赖安装完成。") });
          return;
        }
        set({ statusMessage: progressStatus(progress.message) });
      });
      window.suyanApi.onModuleInstallProgress((progress) => {
        if (progress.phase === "done") {
          set({ statusMessage: successStatus(progress.message) });
          return;
        }
        if (progress.phase === "failed") {
          set({ statusMessage: failureStatus(progress.message) });
          return;
        }
        set({ statusMessage: progressStatus(progress.message) });
      });
      window.suyanApi.onExternalLibraryChanged((data) => {
        const previousItemIds = new Set(get().items.map((item) => item.id));
        setLibrary(data.library, set, get);
        set({ libraryRoots: data.roots });

        if (data.importedCount > 0) {
          markRecentImportPins(set, get, previousItemIds);
          scheduleLexiconSyncAfterImport(set, get, previousItemIds);
          scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
        }

        const changes = [
          data.importedCount > 0 ? `新增 ${data.importedCount} 个` : null,
          data.renamedCount > 0 ? `识别重命名 ${data.renamedCount} 个` : null,
          data.missingCount > 0 ? `标记缺失 ${data.missingCount} 个` : null,
        ].filter((entry): entry is string => Boolean(entry));
        set({
          statusMessage: infoStatus(
            changes.length > 0 ? `目录监视已同步：${changes.join("，")}。` : "目录监视已同步。",
          ),
        });
      });
    }

    const [libraryResult, viewSettingsResult, rootsResult] = await Promise.all([
      window.suyanApi.readLibrary(),
      window.suyanApi.readLibraryViewSettings(),
      window.suyanApi.listLibraryRoots(),
    ]);

    if (libraryResult.ok) {
      setLibrary(libraryResult.data, set, get);
    } else {
      set({ statusMessage: errorStatus(libraryResult.error.code, libraryResult.error.message) });
    }

    if (viewSettingsResult.ok) {
      syncLibraryViewSettings(set, viewSettingsResult.data);
    } else if (libraryResult.ok) {
      set({ statusMessage: errorStatus(viewSettingsResult.error.code, viewSettingsResult.error.message) });
    }

    if (rootsResult.ok) {
      set({ libraryRoots: rootsResult.data });
    }

    set({ isLoading: false, recentImportPinIds: [] });
    logRendererStartupEvent("library-load:done", {
      durationMs: Math.round(performance.now() - loadStartedAt),
      itemCount: libraryResult.ok ? libraryResult.data.items.length : 0,
      startupPromptLexiconSync: "skipped",
    });

    // 解绑后视频依赖不再随包分发：启动时用真实二进制可用性校正持久化状态。
    void get().checkVideoRuntime();
    void get().checkNsfwRuntime();

    // The lexicon is a persistent knowledge library, including pending/unused tags.
    // Existing entries may only be reorganized through the explicit review flow.

    const aiSettingsReadRevision = aiSettingsSaveRevision;
    void window.suyanApi
      .readAiSettings()
      .then((aiSettingsResult) => {
        if (aiSettingsReadRevision !== aiSettingsSaveRevision) {
          logAiSettingsSaveEvent("read-skipped", {
            actionPreferenceCount: aiSettingsResult.ok ? Object.keys(aiSettingsResult.data.actionPreferences ?? {}).length : 0,
            activeProfileId: aiSettingsResult.ok ? aiSettingsResult.data.activeProfileId : "",
            profileCount: aiSettingsResult.ok ? aiSettingsResult.data.profiles.length : 0,
            requestRevision: aiSettingsReadRevision,
            source: "full",
            superseded: true,
            ok: aiSettingsResult.ok,
          });
          return;
        }

        if (aiSettingsResult.ok) {
          set({ aiSettings: aiSettingsResult.data });
          return;
        }

        if (libraryResult.ok) {
          set({ statusMessage: errorStatus(aiSettingsResult.error.code, aiSettingsResult.error.message) });
        }
      })
      .catch(() => {
        if (libraryResult.ok) {
          set({ statusMessage: errorStatus("AI_SETTINGS_READ_FAILED", "模型配置稍后再试。") });
        }
      });

    void window.suyanApi
      .readProxySettings()
      .then((proxySettingsResult) => {
        if (proxySettingsResult.ok) {
          set({ proxySettings: proxySettingsResult.data });
          return;
        }

        if (libraryResult.ok) {
          set({ statusMessage: errorStatus(proxySettingsResult.error.code, proxySettingsResult.error.message) });
        }
      })
      .catch(() => {
        if (libraryResult.ok) {
          set({ statusMessage: errorStatus("PROXY_SETTINGS_INVALID", "网络代理读取失败。") });
        }
      });

    logRendererStartupEvent("lexicon-sync:skipped", { reason: "startup-uses-saved-lexicons" });
  },

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  updateCanvasDraft: (patch) => {
    const nextCanvasDraft = normalizeCanvasDraftSettings({ ...get().canvasDraft, ...patch });
    set({ canvasDraft: nextCanvasDraft });

    if (canvasDraftSaveTimer) {
      clearTimeout(canvasDraftSaveTimer);
    }

    canvasDraftSaveTimer = setTimeout(() => {
      canvasDraftSaveTimer = null;
      void saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()))
        .then((result) => {
          if (!result.ok) {
            set({ statusMessage: errorStatus(result.error.code, result.error.message) });
          }
        })
        .catch(() => {
          set({ statusMessage: errorStatus("VIEW_SETTINGS_SAVE_FAILED", "画布草稿自动保存失败，请稍后重试。") });
        });
    }, 450);
  },
  setCanvasGenerationResults: (results) => set({ canvasGenerationResults: results }),

  setCanvasLastModel: (model) => set({ canvasLastModel: model }),

  setCanvasPhase: (phase) => set({ canvasPhase: phase }),

  setCanvasThinkingKeywords: (keywords) => set({ canvasThinkingKeywords: keywords }),

  setCanvasGenerating: (generating) => set({ canvasIsGenerating: generating }),

  setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
  clearRecentImportPins: () => {
    if (get().recentImportPinIds.length === 0) {
      return;
    }

    set({ recentImportPinIds: [] });
  },
  setThemeMode: async (themeMode) => {
    const currentThemeMode = get().themeMode;

    if (currentThemeMode === themeMode) {
      return;
    }

    const startedAt = performance.now();
    const revision = ++themeSwitchRevision;

    logRendererStartupEvent("theme-switch:click", {
      from: currentThemeMode,
      to: themeMode,
    });

    applyThemeModeToRoot(themeMode, document.documentElement, {
      suppressTransitions: true,
      themePreset: get().themePreset,
      themeAccent: get().themeAccent,
      themeCustomAccent: get().themeCustomAccent,
      themeCustomAccents: get().themeCustomAccents,
      themeOpacity: get().themeOpacity,
      themeNavigationOpacity: get().themeNavigationOpacity,
      themeBackgroundOpacity: get().themeBackgroundOpacity,
      themeWorkspaceOpacity: get().themeWorkspaceOpacity,
      themeAccentOpacity: get().themeAccentOpacity,
      customTheme: get().customTheme,
    });

    set({ themeMode, statusMessage: null });

    await waitForThemePaint(themeMode);

    logRendererStartupEvent("theme-switch:first-paint", {
      durationMs: roundDuration(performance.now() - startedAt),
      from: currentThemeMode,
      to: themeMode,
    });

    if (revision !== themeSwitchRevision) {
      logRendererStartupEvent("theme-switch:superseded", { to: themeMode });
      return;
    }

    themePersistenceQueue = themePersistenceQueue.then(async () => {
      if (revision !== themeSwitchRevision) {
        return;
      }

      const result = await saveLibraryViewSettingsSerialized(
        buildLibraryViewSettings(get(), { themeMode }),
      );

      if (result.ok) {
        logRendererStartupEvent("theme-switch:persisted", {
          durationMs: roundDuration(performance.now() - startedAt),
          to: themeMode,
        });
        return;
      }

      if (revision !== themeSwitchRevision) {
        return;
      }

      applyThemeModeToRoot(currentThemeMode, document.documentElement, {
        suppressTransitions: true,
        themePreset: get().themePreset,
        themeAccent: get().themeAccent,
        themeCustomAccent: get().themeCustomAccent,
        themeCustomAccents: get().themeCustomAccents,
        themeOpacity: get().themeOpacity,
        themeNavigationOpacity: get().themeNavigationOpacity,
        themeBackgroundOpacity: get().themeBackgroundOpacity,
        themeWorkspaceOpacity: get().themeWorkspaceOpacity,
        themeAccentOpacity: get().themeAccentOpacity,
        customTheme: get().customTheme,
      });
      set({
        themeMode: currentThemeMode,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
      await waitForThemePaint(currentThemeMode);
    });

    await themePersistenceQueue;
  },
  setThemePreset: async (themePreset) => {
    const currentState = get();
    const currentThemePreset = currentState.themePreset;

    if (currentThemePreset === themePreset) {
      return;
    }

    const currentThemeMode = get().themeMode;
    const nextMemory: ThemeAccentMemoryByPreset = {
      ...currentState.themeAccentMemory,
      [currentThemePreset]: {
        accent: currentState.themeAccent,
        customAccents: currentState.themeCustomAccents,
      },
    };
    const targetMemory = nextMemory[themePreset] ?? {
      accent: getDefaultThemeAccentForPreset(themePreset),
      customAccents: [...DEFAULT_THEME_CUSTOM_ACCENTS] as [string, string, string],
    };
    const startedAt = performance.now();
    const revision = ++themeSwitchRevision;

    logRendererStartupEvent("theme-preset-switch:click", {
      from: currentThemePreset,
      to: themePreset,
    });

    applyThemeModeToRoot(currentThemeMode, document.documentElement, {
      suppressTransitions: true,
      themePreset,
      themeAccent: targetMemory.accent,
      themeCustomAccent: targetMemory.customAccents[0],
      themeCustomAccents: targetMemory.customAccents,
      themeOpacity: currentState.themeOpacity,
      themeNavigationOpacity: currentState.themeNavigationOpacity,
      themeBackgroundOpacity: currentState.themeBackgroundOpacity,
      themeWorkspaceOpacity: currentState.themeWorkspaceOpacity,
      themeAccentOpacity: currentState.themeAccentOpacity,
      customTheme: currentState.customTheme,
    });
    set({
      themePreset,
      themeAccent: targetMemory.accent,
      themeCustomAccent: targetMemory.customAccents[0],
      themeCustomAccents: targetMemory.customAccents,
      themeAccentMemory: nextMemory,
      statusMessage: null,
    });

    await waitForThemePaint(currentThemeMode);

    logRendererStartupEvent("theme-preset-switch:first-paint", {
      durationMs: roundDuration(performance.now() - startedAt),
      from: currentThemePreset,
      to: themePreset,
    });

    if (revision !== themeSwitchRevision) {
      logRendererStartupEvent("theme-preset-switch:superseded", { to: themePreset });
      return;
    }

    themePersistenceQueue = themePersistenceQueue.then(async () => {
      if (revision !== themeSwitchRevision) {
        return;
      }

      const result = await saveLibraryViewSettingsSerialized(
        buildLibraryViewSettings(get(), {
          themePreset,
          themeAccent: targetMemory.accent,
          themeCustomAccent: targetMemory.customAccents[0],
          themeCustomAccents: targetMemory.customAccents,
          themeAccentMemory: nextMemory,
        }),
      );

      if (result.ok) {
        logRendererStartupEvent("theme-preset-switch:persisted", {
          durationMs: roundDuration(performance.now() - startedAt),
          to: themePreset,
        });
        return;
      }

      if (revision !== themeSwitchRevision) {
        return;
      }

      applyThemeModeToRoot(currentThemeMode, document.documentElement, {
        suppressTransitions: true,
        themePreset: currentThemePreset,
        themeAccent: currentState.themeAccent,
        themeCustomAccent: currentState.themeCustomAccent,
        themeCustomAccents: currentState.themeCustomAccents,
        themeOpacity: get().themeOpacity,
        themeNavigationOpacity: get().themeNavigationOpacity,
        themeBackgroundOpacity: get().themeBackgroundOpacity,
        themeWorkspaceOpacity: get().themeWorkspaceOpacity,
        themeAccentOpacity: get().themeAccentOpacity,
        customTheme: get().customTheme,
      });
      set({
        themePreset: currentThemePreset,
        themeAccent: currentState.themeAccent,
        themeCustomAccent: currentState.themeCustomAccent,
        themeCustomAccents: currentState.themeCustomAccents,
        themeAccentMemory: currentState.themeAccentMemory,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
      await waitForThemePaint(currentThemeMode);
    });

    await themePersistenceQueue;
  },
  setThemeAccent: async (themeAccent, themeCustomAccent, customAccentSlot) => {
    const currentState = get();
    const currentThemeAccent = currentState.themeAccent;
    const currentThemeCustomAccents = currentState.themeCustomAccents;
    const slot = isThemeCustomAccentSlot(customAccentSlot)
      ? customAccentSlot
      : isThemeCustomAccentSlot(themeAccent)
        ? themeAccent
        : themeAccent === "custom"
          ? "custom1"
          : null;
    const nextThemeCustomAccents = [...currentThemeCustomAccents] as [string, string, string];
    if (slot) {
      const slotIndex = slot === "custom2" ? 1 : slot === "custom3" ? 2 : 0;
      nextThemeCustomAccents[slotIndex] = normalizeThemeCustomAccent(
        themeCustomAccent ?? currentThemeCustomAccents[slotIndex],
      );
    }
    const nextThemeCustomAccent = nextThemeCustomAccents[0];
    const accentsChanged = nextThemeCustomAccents.some((accent, index) => accent !== currentThemeCustomAccents[index]);

    if (currentThemeAccent === themeAccent && !accentsChanged) {
      return;
    }

    const currentThemeMode = get().themeMode;
    const currentThemePreset = get().themePreset;
    const nextThemeAccentMemory: ThemeAccentMemoryByPreset = {
      ...currentState.themeAccentMemory,
      [currentThemePreset]: {
        accent: themeAccent,
        customAccents: nextThemeCustomAccents,
      },
    };
    const startedAt = performance.now();
    const revision = ++themeSwitchRevision;

    logRendererStartupEvent("theme-accent-switch:click", {
      from: currentThemeAccent,
      to: themeAccent,
    });

    applyThemeModeToRoot(currentThemeMode, document.documentElement, {
      suppressTransitions: true,
      themePreset: currentThemePreset,
      themeAccent,
      themeCustomAccent: nextThemeCustomAccent,
      themeCustomAccents: nextThemeCustomAccents,
      themeOpacity: currentState.themeOpacity,
      themeNavigationOpacity: currentState.themeNavigationOpacity,
      themeBackgroundOpacity: currentState.themeBackgroundOpacity,
      themeWorkspaceOpacity: currentState.themeWorkspaceOpacity,
      themeAccentOpacity: currentState.themeAccentOpacity,
      customTheme: currentState.customTheme,
    });
    set({
      themeAccent,
      themeCustomAccent: nextThemeCustomAccent,
      themeCustomAccents: nextThemeCustomAccents,
      themeAccentMemory: nextThemeAccentMemory,
      statusMessage: null,
    });

    themePersistenceQueue = themePersistenceQueue.then(async () => {
      if (revision !== themeSwitchRevision) {
        return;
      }

      const result = await saveLibraryViewSettingsSerialized(
        buildLibraryViewSettings(get(), {
          themeAccent,
          themeCustomAccent: nextThemeCustomAccent,
          themeCustomAccents: nextThemeCustomAccents,
          themeAccentMemory: nextThemeAccentMemory,
        }),
      );

      if (result.ok) {
        logRendererStartupEvent("theme-accent-switch:persisted", {
          durationMs: roundDuration(performance.now() - startedAt),
          to: themeAccent,
        });
        return;
      }

      if (revision !== themeSwitchRevision) {
        return;
      }

      applyThemeModeToRoot(currentThemeMode, document.documentElement, {
        suppressTransitions: true,
        themePreset: get().themePreset,
        themeAccent: currentThemeAccent,
        themeCustomAccent: currentThemeCustomAccents[0],
        themeCustomAccents: currentThemeCustomAccents,
        themeOpacity: get().themeOpacity,
        themeNavigationOpacity: get().themeNavigationOpacity,
        themeBackgroundOpacity: get().themeBackgroundOpacity,
        themeWorkspaceOpacity: get().themeWorkspaceOpacity,
        themeAccentOpacity: get().themeAccentOpacity,
        customTheme: get().customTheme,
      });
      set({
        themeAccent: currentThemeAccent,
        themeCustomAccent: currentThemeCustomAccents[0],
        themeCustomAccents: currentThemeCustomAccents,
        themeAccentMemory: currentState.themeAccentMemory,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    });

    await themePersistenceQueue;
  },
  setThemeOpacity: async (themeOpacity) => get().setThemeNavigationOpacity(themeOpacity),
  setThemeNavigationOpacity: async (themeOpacity) => persistThemeLayerOpacity("themeNavigationOpacity", themeOpacity, set, get),
  setThemeBackgroundOpacity: async (themeOpacity) => persistThemeLayerOpacity("themeBackgroundOpacity", themeOpacity, set, get),
  setThemeWorkspaceOpacity: async (themeOpacity) => persistThemeLayerOpacity("themeWorkspaceOpacity", themeOpacity, set, get),
  setThemeAccentOpacity: async (themeAccentOpacity) => {
    const currentState = get();
    const nextThemeAccentOpacity = normalizeThemeAccentOpacity(themeAccentOpacity);
    if (nextThemeAccentOpacity === currentState.themeAccentOpacity) {
      return;
    }

    const revision = ++themeSwitchRevision;
    const currentThemeMode = currentState.themeMode;
    applyThemeModeToRoot(currentThemeMode, document.documentElement, {
      themePreset: currentState.themePreset,
      themeAccent: currentState.themeAccent,
      themeCustomAccent: currentState.themeCustomAccent,
      themeCustomAccents: currentState.themeCustomAccents,
      themeOpacity: currentState.themeOpacity,
      themeNavigationOpacity: currentState.themeNavigationOpacity,
      themeBackgroundOpacity: currentState.themeBackgroundOpacity,
      themeWorkspaceOpacity: currentState.themeWorkspaceOpacity,
      themeAccentOpacity: nextThemeAccentOpacity,
      customTheme: currentState.customTheme,
    });
    set({ themeAccentOpacity: nextThemeAccentOpacity, statusMessage: null });

    themePersistenceQueue = themePersistenceQueue.then(async () => {
      if (revision !== themeSwitchRevision) return;
      const result = await saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get(), { themeAccentOpacity: nextThemeAccentOpacity }));
      if (result.ok || revision !== themeSwitchRevision) return;

      applyThemeModeToRoot(currentThemeMode, document.documentElement, {
        themePreset: get().themePreset,
        themeAccent: get().themeAccent,
        themeCustomAccent: get().themeCustomAccent,
        themeCustomAccents: get().themeCustomAccents,
        themeOpacity: get().themeOpacity,
        themeNavigationOpacity: get().themeNavigationOpacity,
        themeBackgroundOpacity: get().themeBackgroundOpacity,
        themeWorkspaceOpacity: get().themeWorkspaceOpacity,
        themeAccentOpacity: currentState.themeAccentOpacity,
        customTheme: get().customTheme,
      });
      set({ themeAccentOpacity: currentState.themeAccentOpacity, statusMessage: errorStatus(result.error.code, result.error.message) });
    });
    await themePersistenceQueue;
  },
  setCustomTheme: async (patch) => {
    const currentState = get();
    const nextCustomTheme = normalizeThemeCustomTheme({ ...currentState.customTheme, ...patch });
    if (JSON.stringify(nextCustomTheme) === JSON.stringify(currentState.customTheme)) {
      return;
    }

    const revision = ++themeSwitchRevision;
    applyThemeModeToRoot(currentState.themeMode, document.documentElement, {
      themePreset: currentState.themePreset,
      themeAccent: currentState.themeAccent,
      themeCustomAccent: currentState.themeCustomAccent,
      themeCustomAccents: currentState.themeCustomAccents,
      themeOpacity: currentState.themeOpacity,
      themeNavigationOpacity: currentState.themeNavigationOpacity,
      themeBackgroundOpacity: currentState.themeBackgroundOpacity,
      themeWorkspaceOpacity: currentState.themeWorkspaceOpacity,
      themeAccentOpacity: currentState.themeAccentOpacity,
      customTheme: nextCustomTheme,
    });
    set({ customTheme: nextCustomTheme, statusMessage: null });

    themePersistenceQueue = themePersistenceQueue.then(async () => {
      if (revision !== themeSwitchRevision) return;
      const result = await saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get(), { customTheme: nextCustomTheme }));
      if (result.ok || revision !== themeSwitchRevision) return;
      const rollbackState = get();
      applyThemeModeToRoot(rollbackState.themeMode, document.documentElement, {
        themePreset: rollbackState.themePreset,
        themeAccent: rollbackState.themeAccent,
        themeCustomAccent: rollbackState.themeCustomAccent,
        themeCustomAccents: rollbackState.themeCustomAccents,
        themeOpacity: rollbackState.themeOpacity,
        themeNavigationOpacity: rollbackState.themeNavigationOpacity,
        themeBackgroundOpacity: rollbackState.themeBackgroundOpacity,
        themeWorkspaceOpacity: rollbackState.themeWorkspaceOpacity,
        themeAccentOpacity: rollbackState.themeAccentOpacity,
        customTheme: currentState.customTheme,
      });
      set({ customTheme: currentState.customTheme, statusMessage: errorStatus(result.error.code, result.error.message) });
    });
    await themePersistenceQueue;
  },

  setLanguage: async (language) => {
    const currentLanguage = get().language;
    if (currentLanguage === language) {
      return true;
    }

    set({ language, statusMessage: null });
    const result = await saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get(), { language }));
    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({ language: currentLanguage, statusMessage: errorStatus(result.error.code, result.error.message) });
    return false;
  },

  saveCanvasBackground: async (patch) => {
    const previous = get().canvasBackground;
    const next = normalizeCanvasBackground({ ...previous, ...patch });
    set({ canvasBackground: next, statusMessage: null });
    try {
      const result = await saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()));
      if (result.ok) return true;
      if (get().canvasBackground === next) set({ canvasBackground: previous });
      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    } catch {
      if (get().canvasBackground === next) set({ canvasBackground: previous });
      set({ statusMessage: errorStatus("VIEW_SETTINGS_SAVE_FAILED", "画布背景保存失败，请重试。") });
    }
    return false;
  },

  setWorkspaceWidthPercent: (workspaceWidthPercent) => {
    const nextWorkspaceWidthPercent = normalizeWorkspaceWidthPercent(workspaceWidthPercent);

    if (nextWorkspaceWidthPercent === get().workspaceWidthPercent) {
      return;
    }

    set({ workspaceWidthPercent: nextWorkspaceWidthPercent, statusMessage: null });

    if (workspaceWidthSaveTimer) {
      clearTimeout(workspaceWidthSaveTimer);
    }

    workspaceWidthSaveTimer = setTimeout(() => {
      workspaceWidthSaveTimer = null;
      void saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()))
        .then((result) => {
          if (!result.ok) {
            set({ statusMessage: errorStatus(result.error.code, result.error.message) });
          }
        })
        .catch(() => {
          set({ statusMessage: errorStatus("VIEW_SETTINGS_SAVE_FAILED", "工作区宽度自动保存失败，请稍后重试。") });
        });
    }, 220);
  },

  saveSidebarEntryVisibility: async (entryId, visible) => {
    const currentVisibility = get().sidebarEntryVisibility;
    const nextVisibility = normalizeSidebarEntryVisibility({
      ...currentVisibility,
      [entryId]: visible,
    });

    if (nextVisibility[entryId] === currentVisibility[entryId]) {
      return true;
    }

    set({ sidebarEntryVisibility: nextVisibility, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { sidebarEntryVisibility: nextVisibility }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({
      sidebarEntryVisibility: currentVisibility,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  completeFeatureGuide: async (guideId) => {
    const currentCompleted = get().featureGuideCompleted;
    if (currentCompleted.includes(guideId)) {
      return true;
    }

    const nextCompleted = [...currentCompleted, guideId];
    set({ featureGuideCompleted: nextCompleted });
    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { featureGuideCompleted: nextCompleted }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({
      featureGuideCompleted: currentCompleted,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  resetFeatureGuides: async () => {
    const currentCompleted = get().featureGuideCompleted;
    if (currentCompleted.length === 0) {
      return true;
    }

    set({ featureGuideCompleted: [] });
    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { featureGuideCompleted: [] }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({
      featureGuideCompleted: currentCompleted,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  saveGenerationModelPreferences: async (patch) => {
    const currentGenerationModelOrder = get().generationModelOrder;
    const currentHiddenGenerationModels = get().hiddenGenerationModels;
    const generationModelOrder = patch.generationModelOrder ?? currentGenerationModelOrder;
    const hiddenGenerationModels = patch.hiddenGenerationModels ?? currentHiddenGenerationModels;

    set({ generationModelOrder, hiddenGenerationModels, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { generationModelOrder, hiddenGenerationModels }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return;
    }

    set({
      generationModelOrder: currentGenerationModelOrder,
      hiddenGenerationModels: currentHiddenGenerationModels,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
  },
  saveNsfwSettings: async (settings) => {
    const currentAutoNsfwGrading = get().autoNsfwGrading;
    const currentBlurNsfwImages = get().blurNsfwImages;
    const currentNsfwGradingSpeed = get().nsfwGradingSpeed;
    const currentNsfwDetectionMode = get().nsfwDetectionMode;

    set({
      autoNsfwGrading: settings.autoNsfwGrading,
      blurNsfwImages: settings.blurNsfwImages,
      nsfwGradingSpeed: settings.nsfwGradingSpeed,
      nsfwDetectionMode: settings.nsfwDetectionMode,
      statusMessage: null,
    });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), {
        autoNsfwGrading: settings.autoNsfwGrading,
        blurNsfwImages: settings.blurNsfwImages,
        nsfwGradingSpeed: settings.nsfwGradingSpeed,
        nsfwDetectionMode: settings.nsfwDetectionMode,
      }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({
      autoNsfwGrading: currentAutoNsfwGrading,
      blurNsfwImages: currentBlurNsfwImages,
      nsfwGradingSpeed: currentNsfwGradingSpeed,
      nsfwDetectionMode: currentNsfwDetectionMode,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  saveNetworkMaterialImportMode: async (networkMaterialImportMode) => {
    const currentNetworkMaterialImportMode = get().networkMaterialImportMode;

    set({ networkMaterialImportMode, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { networkMaterialImportMode }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({
      networkMaterialImportMode: currentNetworkMaterialImportMode,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  saveMasonryTileWidth: async (masonryTileWidth) => {
    const currentMasonryTileWidth = get().masonryTileWidth;
    const nextMasonryTileWidth = normalizeMasonryTileWidth(masonryTileWidth);

    if (nextMasonryTileWidth === currentMasonryTileWidth) {
      return;
    }

    // Update local state only; avoid full settings re-sync chatter while dragging
    // ends — settings persist in background, UI already holds the chosen count.
    set({ masonryTileWidth: nextMasonryTileWidth, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { masonryTileWidth: nextMasonryTileWidth }),
    );

    if (result.ok) {
      // Keep masonryTileWidth from result, but do not thrash other UI if unchanged.
      const savedWidth = normalizeMasonryTileWidth(result.data.masonryTileWidth);
      if (savedWidth !== get().masonryTileWidth) {
        set({ masonryTileWidth: savedWidth });
      }
      return;
    }

    set({
      masonryTileWidth: currentMasonryTileWidth,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
  },

  saveMaterialBrowserSettings: async (patch) => {
    const currentSettings = {
      materialBrowserCollectionMode: get().materialBrowserCollectionMode,
      materialBrowserGalleryMode: get().materialBrowserGalleryMode,
      materialBrowserSortMode: get().materialBrowserSortMode,
      materialBrowserSortDirection: get().materialBrowserSortDirection,
      materialBrowserRandomSeed: get().materialBrowserRandomSeed,
    };
    const nextSettings = {
      ...currentSettings,
      ...patch,
      materialBrowserRandomSeed: normalizeMaterialBrowserRandomSeed(
        patch.materialBrowserRandomSeed ?? currentSettings.materialBrowserRandomSeed,
      ),
    };

    set({ ...nextSettings, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get(), nextSettings));

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({ ...currentSettings, statusMessage: errorStatus(result.error.code, result.error.message) });
    return false;
  },

  saveMaterialBrowserScrollTop: (scrollTop) => {
    const nextScrollTop = normalizeMaterialBrowserScrollTop(scrollTop);
    if (materialBrowserScrollSaveTimer) {
      clearTimeout(materialBrowserScrollSaveTimer);
    }

    materialBrowserScrollSaveTimer = setTimeout(() => {
      materialBrowserScrollSaveTimer = null;
      if (nextScrollTop === get().materialBrowserScrollTop) {
        return;
      }
      set({ materialBrowserScrollTop: nextScrollTop });
      void saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()))
        .then((result) => {
          if (!result.ok) {
            set({ statusMessage: errorStatus(result.error.code, result.error.message) });
          }
        })
        .catch(() => {
          set({ statusMessage: errorStatus("VIEW_SETTINGS_SAVE_FAILED", "素材浏览位置保存失败，请稍后重试。") });
        });
    }, 300);
  },

  gradeAllImagesForNsfw: async (options = {}) => {
    await gradeImagesForNsfw(get().items.map((item) => item.id), set, get, {
      force: options.force === true,
      silent: false,
    });
  },
  saveAiSettings: async (settings) => {
    const currentAiSettings = get().aiSettings;
    const requestRevision = ++aiSettingsSaveRevision;
    aiSettingsFullSaveInFlight += 1;

    logAiSettingsSaveEvent("save-request", {
      actionPreferenceCount: Object.keys(settings.actionPreferences ?? {}).length,
      activeProfileId: settings.activeProfileId,
      profileCount: settings.profiles.length,
      requestRevision,
      source: "full",
    });
    set({ isBusy: true, statusMessage: progressStatus("正在保存 API 设置...") });

    try {
      const result = await saveAiSettingsSerialized(settings);
      const superseded = requestRevision !== aiSettingsSaveRevision;

      logAiSettingsSaveEvent("save-result", {
        actionPreferenceCount: result.ok ? Object.keys(result.data.actionPreferences ?? {}).length : 0,
        activeProfileId: result.ok ? result.data.activeProfileId : settings.activeProfileId,
        ok: result.ok,
        profileCount: result.ok ? result.data.profiles.length : settings.profiles.length,
        requestRevision,
        source: "full",
        superseded,
      });

      // A newer model/action save already owns the store state. Never let an
      // older full-settings response roll it back to a stale snapshot.
      if (superseded) {
        return true;
      }

      if (result.ok) {
        set({
          aiSettings: result.data,
          aiErrorDialog: null,
          aiAnalysisCircuitOpen: false,
          isBusy: false,
          statusMessage: successStatus(result.data.enabled ? "已保存远程模型配置。" : "已关闭远程 AI。"),
        });
        return true;
      }

      const errorMessage = result.error?.message || "API 设置保存失败。";
      set({
        aiSettings: currentAiSettings,
        isBusy: false,
        statusMessage: errorStatus(result.error.code, errorMessage),
      });
      return errorMessage;
    } catch (error) {
      const superseded = requestRevision !== aiSettingsSaveRevision;
      logAiSettingsSaveEvent("save-result", {
        actionPreferenceCount: 0,
        activeProfileId: settings.activeProfileId,
        ok: false,
        profileCount: settings.profiles.length,
        requestRevision,
        source: "full",
        superseded,
      });

      if (superseded) {
        return true;
      }

      const errorMessage = error instanceof Error ? error.message : "API 设置保存失败。";
      set({
        aiSettings: currentAiSettings,
        isBusy: false,
        statusMessage: errorStatus("AI_SETTINGS_SAVE_FAILED", errorMessage),
      });
      return errorMessage;
    } finally {
      aiSettingsFullSaveInFlight = Math.max(0, aiSettingsFullSaveInFlight - 1);
      if (aiSettingsFullSaveInFlight === 0 && get().isBusy) {
        set({ isBusy: false });
      }
    }
  },

  applyImportedAiSettings: (settings) => {
    set({
      aiSettings: settings,
      aiErrorDialog: null,
      aiAnalysisCircuitOpen: false,
      statusMessage: successStatus("已导入 AI 设置备份。"),
    });
  },

  saveAiActionModelPreference: async (action, selection) => {
    const currentAiSettings = get().aiSettings;
    const nextAiSettings = updateAiActionModelPreference(currentAiSettings, action, selection);

    if (!nextAiSettings) {
      set({
        statusMessage: errorStatus("AI_SETTINGS_INVALID", "所选 API 或模型不可用于当前功能。"),
      });
      return false;
    }

    const previousPreference = currentAiSettings.actionPreferences[action];
    const requestRevision = ++aiSettingsSaveRevision;
    const selectionProfileId = selection.profileId;
    const payload = buildPublicAiSettingsPayload(
      nextAiSettings,
      nextAiSettings.actionPreferences,
      nextAiSettings.recognitionSourcePreferences,
    );
    set({ aiSettings: nextAiSettings, statusMessage: null });
    logAiSettingsSaveEvent("save-request", {
      actionPreferenceCount: Object.keys(payload.actionPreferences ?? {}).length,
      activeProfileId: payload.activeProfileId,
      profileCount: payload.profiles.length,
      action,
      modelId: selection.modelId,
      profileId: selectionProfileId,
      requestRevision,
      source: "action",
    });

    try {
      const result = await saveAiSettingsSerialized(payload);
      const superseded = requestRevision !== aiSettingsSaveRevision;
      logAiSettingsSaveEvent("save-result", {
        actionPreferenceCount: result.ok ? Object.keys(result.data.actionPreferences ?? {}).length : 0,
        activeProfileId: result.ok ? result.data.activeProfileId : payload.activeProfileId,
        ok: result.ok,
        profileCount: result.ok ? result.data.profiles.length : payload.profiles.length,
        action,
        modelId: selection.modelId,
        profileId: selectionProfileId,
        requestRevision,
        source: "action",
        superseded,
      });

      if (superseded) {
        return true;
      }

      if (result.ok) {
        const latestAiSettings = get().aiSettings;

        // Keep any newer quick preferences already visible while this request was in flight.
        // This prevents an older response for one action from resetting another action.
        set({
          aiSettings: {
            ...result.data,
            actionPreferences: {
              ...result.data.actionPreferences,
              ...latestAiSettings.actionPreferences,
            },
            recognitionSourcePreferences: latestAiSettings.recognitionSourcePreferences,
          },
        });
        return true;
      }

      const latestAiSettings = get().aiSettings;
      const latestPreference = latestAiSettings.actionPreferences[action];

      if (matchesAiModelSelection(latestPreference, selection)) {
        const restoredActionPreferences = { ...latestAiSettings.actionPreferences };

        if (previousPreference) {
          restoredActionPreferences[action] = previousPreference;
        } else {
          delete restoredActionPreferences[action];
        }

        set({
          aiSettings: {
            ...latestAiSettings,
            actionPreferences: restoredActionPreferences,
          },
          statusMessage: errorStatus(result.error.code, result.error.message),
        });
      }
      return false;
    } catch (error) {
      const latestAiSettings = get().aiSettings;
      const latestPreference = latestAiSettings.actionPreferences[action];

      if (matchesAiModelSelection(latestPreference, selection)) {
        const restoredActionPreferences = { ...latestAiSettings.actionPreferences };

        if (previousPreference) {
          restoredActionPreferences[action] = previousPreference;
        } else {
          delete restoredActionPreferences[action];
        }

        set({
          aiSettings: {
            ...latestAiSettings,
            actionPreferences: restoredActionPreferences,
          },
          statusMessage: errorStatus(
            "AI_SETTINGS_SAVE_FAILED",
            error instanceof Error ? error.message : "API 模型偏好保存失败。",
          ),
        });
      }
      return false;
    }
  },

  saveAiRecognitionSourcePreferences: async (preferences) => {
    const currentAiSettings = get().aiSettings;
    const recognitionSourcePreferences = normalizeAiRecognitionSourcePreferences(preferences);
    const requestRevision = ++aiSettingsSaveRevision;
    const nextAiSettings: PublicAiProviderSettings = {
      ...currentAiSettings,
      recognitionSourcePreferences,
    };
    const payload = buildPublicAiSettingsPayload(nextAiSettings, nextAiSettings.actionPreferences, recognitionSourcePreferences);

    logAiSettingsSaveEvent("save-request", {
      actionPreferenceCount: Object.keys(payload.actionPreferences ?? {}).length,
      activeProfileId: payload.activeProfileId,
      profileCount: payload.profiles.length,
      requestRevision,
      source: "recognition-source",
    });
    set({ aiSettings: nextAiSettings, statusMessage: null });

    const result = await saveAiSettingsSerialized(payload);
    const superseded = requestRevision !== aiSettingsSaveRevision;
    logAiSettingsSaveEvent("save-result", {
      actionPreferenceCount: result.ok ? Object.keys(result.data.actionPreferences ?? {}).length : 0,
      activeProfileId: result.ok ? result.data.activeProfileId : payload.activeProfileId,
      ok: result.ok,
      profileCount: result.ok ? result.data.profiles.length : payload.profiles.length,
      requestRevision,
      source: "recognition-source",
      superseded,
    });

    if (superseded) {
      return true;
    }

    if (result.ok) {
      set({ aiSettings: result.data });
      return true;
    }

    set({
      aiSettings: currentAiSettings,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  testAiSettings: async (settings) => {
    set({ isBusy: true, statusMessage: progressStatus("正在测试远程 AI 连接...") });

    const result = await window.suyanApi.testAiSettings(settings);
    const statusMessage = result.ok
      ? successStatus("远程 AI 连接成功。")
      : errorStatus(result.error.code, result.error.message);
    const presentation = result.ok
      ? null
      : buildAiErrorPresentation(result.error.code, result.error.message, "ai-connection");

    set({
      aiErrorDialog: presentation,
      aiAnalysisCircuitOpen: presentation?.shouldStopBackground === true ? true : result.ok ? false : get().aiAnalysisCircuitOpen,
      statusMessage,
    });
    set({ isBusy: false });

    return {
      message: statusMessage.text,
      ok: result.ok,
    };
  },

  listAiModels: async (settings) => {
    set({ isBusy: true, statusMessage: progressStatus("正在查询模型列表...") });

    const result = await window.suyanApi.listAiModels(settings);

    set({
      isBusy: false,
      statusMessage: result.ok
        ? successStatus(`已查询到 ${result.data.models.length} 个模型。`)
        : errorStatus(result.error.code, result.error.message),
    });

    return result.ok ? result.data.models : null;
  },

  copyAiApiKey: async (profileId, draftApiKey = "") => {
    const trimmedDraftApiKey = draftApiKey.trim();
    const result = trimmedDraftApiKey
      ? await window.suyanApi.writeClipboardText(trimmedDraftApiKey)
      : await window.suyanApi.copyAiApiKey(profileId);

    set({
      statusMessage: result.ok ? successStatus("已复制 API Key。") : errorStatus(result.error.code, result.error.message),
    });

    return result.ok;
  },

  analyzePromptWithAi: async (payload) => {
    const startedAt = Date.now();
    const aiSettings = get().aiSettings;
    const taxonomy =
      get().categoryTaxonomy ??
      (await import("../utils/categoryTaxonomy")).createEmptyCategoryTaxonomy();
    const { withKnownCategoriesFromTaxonomy, buildTaxonomyCategoryAiResult } = await import("../utils/categoryAiBinding");
    const resolvedPayload = withKnownCategoriesFromTaxonomy(
      applyAiActionPreference(aiSettings, payload.target, withoutNegativePromptForAnalysis(payload)),
      taxonomy,
    );
    const runInBackground = payload.runInBackground === true;
    const logAiAnalysisDone = (
      ok: boolean,
      details: Record<string, unknown> = {},
    ) => {
      logRendererStartupEvent("ai-analysis:done", {
        durationMs: Date.now() - startedAt,
        ok,
        runInBackground,
        target: resolvedPayload.target,
        ...details,
      });
    };
    const publishAiError = (code: string, message: string) => {
      const presentation = buildAiErrorPresentation(code, message, resolvedPayload.target);

      // 后台批量分析不能打开全局模态框，否则用户切到待办事项等前台工作区后
      // 仍会被 AI 错误层拦截。后台只保留熔断信号，由批处理自己的进度状态展示结果。
      if (runInBackground) {
        if (presentation.shouldStopBackground) {
          set({ aiAnalysisCircuitOpen: true });
        }
        return presentation;
      }

      const currentPresentation = get().aiErrorDialog;
      set({
        aiErrorDialog:
          currentPresentation?.code === presentation.code ? currentPresentation : presentation,
        aiAnalysisCircuitOpen: get().aiAnalysisCircuitOpen || presentation.shouldStopBackground,
      });
      return presentation;
    };

    logRendererStartupEvent("ai-analysis:start", {
      runInBackground,
      target: resolvedPayload.target,
    });

    const persistTaxonomyIfGrown = (nextTaxonomy: CategoryTaxonomy, createdCategoryIds: readonly string[]) => {
      if (createdCategoryIds.length === 0) {
        return nextTaxonomy;
      }
      const nextPromptLexicons = syncLexiconCategoriesFromTaxonomy(get().promptLexicons, nextTaxonomy);
      set({
        categoryTaxonomy: nextTaxonomy,
        promptLexicons: nextPromptLexicons,
      });
      void saveLibraryViewSettingsSerialized(
          buildLibraryViewSettings(get(), {
            promptLexicons: nextPromptLexicons,
            categoryWorkspace: {
              taxonomy: nextTaxonomy,
              inbox: get().categoryInbox,
              candidates: get().categoryCandidates,
              learningEvents: get().categoryLearningEvents,
            },
          }),
        )
        .then((result) => {
          if (result.ok) {
            syncLibraryViewSettings(set, result.data);
          }
        })
        .catch(() => undefined);
      return nextTaxonomy;
    };

    const persistTagKnowledge = async (analysis: PromptAnalysisResult): Promise<boolean> => {
      if (!analysis.tagEntries?.length) return true;
      const lexicons = get().promptLexicons ?? { categories: [], tags: [] };
      const incoming = new Map(analysis.tagEntries.map(entry => [entry.label, entry]));
      const tags = lexicons.tags.map(entry => {
        const next = incoming.get(entry.label);
        incoming.delete(entry.label);
        return next ? { ...entry, ...next } : entry;
      });
      tags.push(...incoming.values());
      try {
        if (await get().savePromptLexicons({ ...lexicons, tags }, { silent: true })) return true;
      } catch { /* A failed write must not be reported as a successful tag analysis. */ }
      const presentation = publishAiError("TAG_KNOWLEDGE_SAVE_FAILED", "标签已识别，但归纳依据保存失败。本次未应用，请检查本地目录权限后重试。");
      set({ statusMessage: errorStatus(presentation.code, presentation.summary) });
      return false;
    };

    const localAnalysis = async (): Promise<PromptAnalysisRunResult> => {
      const base =
        resolvedPayload.target === "prompt-tags" || resolvedPayload.target === "image-tags"
          ? analyzePromptTags(resolvedPayload.prompt, {
              currentCategory: resolvedPayload.category,
              knownTagEntries: get().promptLexicons?.tags ?? [],
            })
          : analyzePromptText(resolvedPayload.prompt, {
              title: resolvedPayload.title,
              tags: resolvedPayload.tags,
              currentCategory: resolvedPayload.category,
              knownCategories: resolvedPayload.knownCategories,
            });

      if (resolvedPayload.target === "prompt-category" || resolvedPayload.target === "image-category") {
        const bound = buildTaxonomyCategoryAiResult(
          taxonomy,
          {
            primaryCategory: base.primaryCategory,
            suggestedCategories: base.suggestedCategories,
          },
          [resolvedPayload.title, resolvedPayload.prompt].filter(Boolean).join("\n"),
          { autoCreateMissing: true },
        );
        const activeTaxonomy = persistTaxonomyIfGrown(bound.taxonomy, bound.createdCategoryIds);
        const names = bound.suggestions
          .map((suggestion) => activeTaxonomy.nodes.find((node) => node.id === suggestion.categoryId)?.name)
          .filter((name): name is string => Boolean(name));
        // Category path: never leak parameter chips/sections/tags into genre results.
        return {
          analysis: isolateCategoryAnalysisResult({
            ...base,
            suggestedCategories: names,
            primaryCategory: names[0] ?? "未分类",
            taxonomySuggestions: bound.suggestions,
            taxonomyBand: bound.band,
            taxonomyPrimaryCategoryId: bound.primary?.categoryId ?? null,
            taxonomyCreatedCategoryIds: bound.createdCategoryIds,
            taxonomySnapshot: bound.createdCategoryIds.length > 0 ? bound.taxonomy : undefined,
          }),
          source: "local",
        };
      }

      if (resolvedPayload.target === "prompt-tags" || resolvedPayload.target === "image-tags") {
        if (!await persistTagKnowledge(base)) return { ...emptyImageAnalysis(), failed: true };
        return {
          analysis: base,
          source: "local",
        };
      }

      return { analysis: base, source: "local" };
    };
    const emptyImageAnalysis = (): PromptAnalysisRunResult => ({
      analysis: {
        chips: [],
        sections: [],
        suggestedTags: [],
        suggestedCategories: [],
        primaryCategory: resolvedPayload.category || "未分类",
        template: "",
        taxonomySuggestions: [],
        taxonomyBand: "none",
        taxonomyPrimaryCategoryId: null,
      },
      source: "local",
    });

    // 空输入绝不能送进模型：提示词为空时模型拿不到任何素材信息，却仍会按提示里的
    // 数量要求从分类目录里硬凑答案（曾给人像写真返回 产品摄影/食品摄影/风光摄影）。
    // 宁可不返回分类，也不能写入与效果图无关的结果。
    if (
      (resolvedPayload.target === "prompt-category" || resolvedPayload.target === "prompt-tags") &&
      !resolvedPayload.prompt.trim()
    ) {
      if (!runInBackground) {
        set({ statusMessage: infoStatus("当前素材没有提示词内容，请改用「从效果图分析」。") });
      }
      const result = emptyImageAnalysis();
      logAiAnalysisDone(false, { reason: "empty-prompt-input", source: result.source });
      return result;
    }

    if (runInBackground && get().aiAnalysisCircuitOpen) {
      const result = resolvedPayload.target === "image-category" || resolvedPayload.target === "image-tags"
        ? emptyImageAnalysis()
        : await localAnalysis();
      logAiAnalysisDone(false, { reason: "ai-circuit-open", source: result.source });
      return result;
    }

    const remoteAiReadiness = resolveRemoteAiReadiness(
      get().aiSettings,
      getAiActionLabel(resolvedPayload.target),
      resolvedPayload.apiProfileId,
      resolvedPayload.apiModelId,
      getAiAnalyzeCapability(resolvedPayload.target),
    );

    if (!remoteAiReadiness.ready) {
      if (resolvedPayload.target === "prompt-category" || resolvedPayload.target === "prompt-tags") {
        if (!runInBackground) {
          set({ statusMessage: infoStatus("远程 AI 未配置，已使用本地分析。") });
        }
        const result = await localAnalysis();
        logAiAnalysisDone(!result.failed, { reason: result.failed ? "tag-knowledge-save-failed" : "remote-not-ready", source: result.source });
        return result;
      }

      if (!runInBackground) {
        set({ statusMessage: remoteAiReadiness.statusMessage });
      }
      const result = emptyImageAnalysis();
      logAiAnalysisDone(false, { reason: "remote-not-ready", source: result.source });
      return result;
    }

    if (!runInBackground) {
      set({ statusMessage: progressStatus(getAiAnalyzeProgressText(resolvedPayload.target)) });
    }

    const result = await window.suyanApi.analyzePromptWithAi(resolvedPayload);

    if (result.ok) {
      try {
        const analysis = buildPromptAnalysisFromRemote(resolvedPayload.prompt, result.data.analysis, resolvedPayload.target, {
          taxonomy: get().categoryTaxonomy ?? taxonomy,
          knownCategories: resolvedPayload.knownCategories,
          knownTags: get().promptLexicons?.tags?.map((entry) => entry.label) ?? [],
          knownTagEntries: get().promptLexicons?.tags ?? [],
        });

        if (!await persistTagKnowledge(analysis)) {
          logAiAnalysisDone(false, { reason: "tag-knowledge-save-failed", source: "remote" });
          return emptyImageAnalysis();
        }

        if (
          (resolvedPayload.target === "prompt-category" || resolvedPayload.target === "image-category") &&
          analysis.taxonomySnapshot &&
          analysis.taxonomyCreatedCategoryIds &&
          analysis.taxonomyCreatedCategoryIds.length > 0
        ) {
          persistTaxonomyIfGrown(analysis.taxonomySnapshot, analysis.taxonomyCreatedCategoryIds);
        }

        if (!runInBackground) {
          const noUsefulTags = (resolvedPayload.target === "image-tags" || resolvedPayload.target === "prompt-tags") && analysis.suggestedTags.length === 0;
          set({ statusMessage: noUsefulTags ? infoStatus("未识别到有检索价值的标签，未新增标签。") : successStatus(getAiAnalyzeSuccessText(resolvedPayload.target)) });
        }

        const remoteResult: PromptAnalysisRunResult = {
          analysis,
          source: "remote",
        };
        logAiAnalysisDone(true, {
          source: remoteResult.source,
          taxonomyBand: analysis.taxonomyBand,
          taxonomyPrimaryCategoryId: analysis.taxonomyPrimaryCategoryId,
        });
        return remoteResult;
      } catch {
        const presentation = publishAiError(
          "AI_REMOTE_RESPONSE_INVALID",
          "AI \u8fd4\u56de\u5185\u5bb9\u65e0\u6cd5\u89e3\u6790\u4e3a\u5e94\u7528\u9700\u8981\u7684 JSON \u7ed3\u6784\u3002",
        );
        if (!runInBackground) {
          set({ statusMessage: errorStatus(presentation.code, presentation.summary) });
        }

        if (resolvedPayload.target !== "prompt-category" && resolvedPayload.target !== "prompt-tags") {
          if (!runInBackground) {
            set({ statusMessage: failureStatus("远程 AI 结果不可用，未更新图片识别结果。") });
          }
          const fallback = emptyImageAnalysis();
          logAiAnalysisDone(false, { reason: "remote-parse-failed", source: fallback.source });
          return fallback;
        }

        if (!runInBackground) {
          set({ statusMessage: infoStatus("远程 AI 结果不可用，已使用本地分析。") });
        }

        const fallback = await localAnalysis();
        logAiAnalysisDone(false, { reason: "remote-parse-failed", source: fallback.source });
        return fallback;
      }
    }

    const presentation = publishAiError(result.error.code, result.error.message);
    if (!runInBackground || presentation.shouldStopBackground) {
      set({ statusMessage: errorStatus(presentation.code, presentation.summary) });
    }

    if (resolvedPayload.target !== "prompt-category" && resolvedPayload.target !== "prompt-tags") {
      const fallback = emptyImageAnalysis();
      logAiAnalysisDone(false, { errorCode: result.error.code, source: fallback.source });
      return fallback;
    }

    if (!runInBackground) {
      set({ statusMessage: infoStatus("远程 AI 暂不可用，已使用本地分析。") });
    }

    const fallback = await localAnalysis();
    logAiAnalysisDone(false, { errorCode: result.error.code, source: fallback.source });
    return fallback;
  },

  optimizePromptWithAi: async (payload) => {
    const startedAt = Date.now();
    const resolvedPayload = applyAiActionPreference(get().aiSettings, "prompt-optimization", payload);
    const prompt = resolvedPayload.prompt.trim();

    if (!prompt) {
      set({ statusMessage: infoStatus("请先输入需要优化的提示词。") });
      return null;
    }

    const remoteAiReadiness = resolveRemoteAiReadiness(
      get().aiSettings,
      "提示词优化",
      resolvedPayload.apiProfileId,
      resolvedPayload.apiModelId,
      "text",
    );

    if (!remoteAiReadiness.ready) {
      set({ statusMessage: remoteAiReadiness.statusMessage });
      return null;
    }

    logRendererStartupEvent("ai-optimize:start");
    set({ statusMessage: progressStatus("正在优化提示词...") });

    const result = await window.suyanApi.optimizePromptWithAi({ ...resolvedPayload, prompt });

    set({
      statusMessage: result.ok
        ? successStatus("已完成提示词优化。")
        : errorStatus(result.error.code, result.error.message),
    });
    logRendererStartupEvent("ai-optimize:done", {
      durationMs: Date.now() - startedAt,
      ok: result.ok,
    });

    return result.ok ? result.data.prompt : null;
  },

  summarizePromptTitleWithAi: async (payload) => {
    // 画布生成时自动总结标题：静默执行（不占用状态条），失败或未就绪都返回 null 由调用方回退。
    const resolvedPayload = applyAiActionPreference(get().aiSettings, "prompt-optimization", payload);
    const prompt = resolvedPayload.prompt.trim();
    if (!prompt) {
      return null;
    }

    const remoteAiReadiness = resolveRemoteAiReadiness(
      get().aiSettings,
      "标题总结",
      resolvedPayload.apiProfileId,
      resolvedPayload.apiModelId,
      "text",
    );
    if (!remoteAiReadiness.ready) {
      return null;
    }

    try {
      const result = await window.suyanApi.summarizePromptTitleWithAi({ ...resolvedPayload, prompt });
      return result.ok ? result.data.title : null;
    } catch {
      return null;
    }
  },

  translatePromptWithAi: async (payload) => {
    const startedAt = Date.now();
    const resolvedPayload = applyAiActionPreference(get().aiSettings, "prompt-translation", payload);
    const prompt = resolvedPayload.prompt.trim();
    const negativePrompt = resolvedPayload.negativePrompt?.trim() ?? "";

    if (!prompt && !negativePrompt) {
      set({ statusMessage: infoStatus("请先输入需要翻译的提示词。") });
      return null;
    }

    const remoteAiReadiness = resolveRemoteAiReadiness(
      get().aiSettings,
      "提示词翻译",
      resolvedPayload.apiProfileId,
      resolvedPayload.apiModelId,
      "text",
    );

    if (!remoteAiReadiness.ready) {
      set({ statusMessage: remoteAiReadiness.statusMessage });
      return null;
    }

    logRendererStartupEvent("ai-translate:start", {
      targetLanguage: resolvedPayload.targetLanguage,
    });
    set({ statusMessage: progressStatus("正在翻译提示词...") });

    const result = await window.suyanApi.translatePromptWithAi({
      ...resolvedPayload,
      negativePrompt,
      prompt,
    });

    set({
      statusMessage: result.ok
        ? successStatus("已完成提示词翻译。")
        : errorStatus(result.error.code, result.error.message),
    });
    logRendererStartupEvent("ai-translate:done", {
      durationMs: Date.now() - startedAt,
      ok: result.ok,
      targetLanguage: resolvedPayload.targetLanguage,
    });

    return result.ok ? result.data : null;
  },

  reverseImagePromptWithAi: async (payload) => {
    const startedAt = Date.now();
    const resolvedPayload = applyAiActionPreference(get().aiSettings, "image-reverse", payload);

    if (!resolvedPayload.imageFileName) {
      set({ statusMessage: infoStatus("需要可用效果图才能进行图像反推。") });
      return null;
    }

    const remoteAiReadiness = resolveRemoteAiReadiness(
      get().aiSettings,
      "图像反推",
      resolvedPayload.apiProfileId,
      resolvedPayload.apiModelId,
      "vision",
    );

    if (!remoteAiReadiness.ready) {
      set({ statusMessage: remoteAiReadiness.statusMessage });
      return null;
    }

    logRendererStartupEvent("ai-reverse:start");
    set({ statusMessage: progressStatus("正在进行图像反推...") });

    const result = await window.suyanApi.reverseImagePromptWithAi(resolvedPayload);

    set({
      statusMessage: result.ok
        ? successStatus("已完成图像反推。")
        : errorStatus(result.error.code, result.error.message),
    });
    logRendererStartupEvent("ai-reverse:done", {
      durationMs: Date.now() - startedAt,
      ok: result.ok,
    });

    return result.ok ? result.data.prompt : null;
  },

  saveProxySettings: async (settings) => {
    const currentProxySettings = get().proxySettings;

    set({ isBusy: true, statusMessage: null });

    const result = await window.suyanApi.saveProxySettings(settings);

    if (result.ok) {
      set({
        proxySettings: result.data,
        statusMessage: successStatus("网络代理已保存并应用。"),
      });
    } else {
      set({
        proxySettings: currentProxySettings,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }

    set({ isBusy: false });
    return result.ok;
  },

  testProxySettings: async (settings) => {
    set({ isBusy: true, statusMessage: progressStatus("正在测试代理连接...") });

    const result = await window.suyanApi.testProxySettings(settings);

    set({
      isBusy: false,
      statusMessage: result.ok
        ? successStatus(`代理连接测试成功（HTTP ${result.data.status}）。`)
        : errorStatus(result.error.code, result.error.message),
    });

    return result.ok;
  },

  detectProxySettings: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在检测系统代理和本机代理软件...") });

    const result = await window.suyanApi.detectProxySettings();

    set({
      isBusy: false,
      statusMessage: result.ok
        ? result.data.detected
          ? successStatus(result.data.summary)
          : infoStatus(result.data.summary)
        : errorStatus(result.error.code, result.error.message),
    });

    return result.ok ? result.data : null;
  },

  clearStatus: () => set({ statusMessage: null }),
  clearAiErrorDialog: () => set({ aiErrorDialog: null }),
  clearAiAnalysisCircuit: () => set({ aiAnalysisCircuitOpen: false }),
  openExternalUrl: async (url, label) => {
    set({ statusMessage: progressStatus("正在打开网页...") });

    const result = await window.suyanApi.openExternalUrl(url);

    if (result.ok) {
      set({ statusMessage: successStatus(label ? `已在浏览器打开 ${label}。` : "已在浏览器打开网页。") });
      return true;
    }

    set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    return false;
  },

  openFfmpegComponentDownloadPage: async () => {
    set({ statusMessage: progressStatus("正在打开视频依赖下载页...") });
    const result = await window.suyanApi.openFfmpegComponentDownloadPage();

    if (result.ok) {
      set({ statusMessage: successStatus("已在浏览器打开视频依赖下载页。") });
      return true;
    }

    set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    return false;
  },
  openNsfwModuleDownloadPage: async () => {
    set({ statusMessage: progressStatus("正在打开本地 NSFW 模块下载页...") });
    const result = await window.suyanApi.openNsfwModuleDownloadPage();

    if (result.ok) {
      set({ statusMessage: successStatus("已在浏览器打开本地 NSFW 模块下载页。") });
      return true;
    }

    set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    return false;
  },
  showStatusMessage: (message) =>
    set({
      statusMessage: {
        ...message,
        autoDismissMs:
          message.autoDismissMs !== undefined
            ? message.autoDismissMs
            : isPendingStatusFeedbackText(message.text)
              ? null
              : statusToastAutoDismissMs,
      },
    }),

  importImages: async () => {
    const startedAt = performance.now();
    set({ isBusy: true, statusMessage: progressStatus("正在导入素材...") });

    const unsubscribe = window.suyanApi.onImportProgress((progress) => {
      set({
        statusMessage: progressStatus(`正在导入：${progress.currentFile} (${progress.current}/${progress.total})`),
      });
    });

    try {
      const previousItemIds = new Set(get().items.map((item) => item.id));
      const result = await window.suyanApi.importImageFiles();

      if (result.ok) {
        setLibrary(result.data.library, set, get);

        if (result.data.canceled) {
          set({ statusMessage: infoStatus("已取消导入。") });
        } else {
          const finalStatus =
            result.data.importedCount > 0
              ? getMediaImportStatus(result.data.importedCount)
              : infoStatus("未选择素材。");

          if (result.data.importedCount > 0) {
            markRecentImportPins(set, get, previousItemIds);
            scheduleLexiconSyncAfterImport(set, get, previousItemIds);
            scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
          }
          set({ statusMessage: finalStatus });
        }
      } else {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      }
    } finally {
      unsubscribe();
      set({ isBusy: false });
      logRendererStartupEvent("import-files:renderer-timing", {
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  },

  importManagedLibraryDirectory: async () => {
    const previousItemIds = new Set(get().items.map((item) => item.id));
    set({ isBusy: true, statusMessage: progressStatus("正在复制目录素材到软件目录...") });
    const unsubscribe = window.suyanApi.onImportProgress((progress) => {
      set({ statusMessage: progressStatus(`正在复制：${progress.currentFile} (${progress.current}/${progress.total})`) });
    });

    try {
      const result = await window.suyanApi.chooseAndImportLibraryDirectory();

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      setLibrary(result.data.library, set, get);
      if (result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      }

      if (!result.data.directoryLabel) {
        set({ statusMessage: infoStatus("未选择素材目录。") });
      } else if (result.data.canceled) {
        set({
          statusMessage: infoStatus(
            `已停止复制，已导入 ${result.data.importedCount} 个素材，跳过 ${result.data.skippedCount} 个。`,
          ),
        });
      } else {
        set({
          statusMessage: successStatus(
            `已从 ${result.data.directoryLabel} 复制 ${result.data.importedCount} 个素材到软件目录${
              result.data.skippedCount > 0 ? `，跳过 ${result.data.skippedCount} 个` : ""
            }。`,
          ),
        });
      }
    } finally {
      unsubscribe();
      set({ isBusy: false });
    }
  },
  addAndScanLibraryRoot: async () => {
    const previousItemIds = new Set(get().items.map((item) => item.id));
    set({ isBusy: true, statusMessage: progressStatus("正在选择并扫描素材目录...") });
    const unsubscribe = window.suyanApi.onImportProgress((progress) => {
      set({ statusMessage: progressStatus(`正在扫描：${progress.currentFile} (${progress.current}/${progress.total})`) });
    });

    try {
      const result = await window.suyanApi.chooseAndScanLibraryRoot();

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      if (result.data.canceled) {
        set({ statusMessage: infoStatus("未选择素材目录。") });
        return;
      }

      setLibrary(result.data.library, set, get);
      if (result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      }
      const rootsResult = await window.suyanApi.listLibraryRoots();
      if (rootsResult.ok) {
        set({ libraryRoots: rootsResult.data });
      }
      set({ statusMessage: successStatus(`已扫描 ${result.data.root?.label ?? "素材目录"}，新增 ${result.data.importedCount} 个素材。`) });
    } finally {
      unsubscribe();
      set({ isBusy: false });
    }
  },

  scanLibraryRoot: async (rootId) => {
    const root = get().libraryRoots.find((candidate) => candidate.id === rootId);
    const previousItemIds = new Set(get().items.map((item) => item.id));
    set({ isBusy: true, statusMessage: progressStatus(`正在扫描 ${root?.label ?? "素材目录"}...`) });
    const unsubscribe = window.suyanApi.onImportProgress((progress) => {
      set({ statusMessage: progressStatus(`正在扫描：${progress.currentFile} (${progress.current}/${progress.total})`) });
    });

    try {
      const result = await window.suyanApi.scanLibraryRoot(rootId);

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      setLibrary(result.data.library, set, get);
      if (result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      }
      const rootsResult = await window.suyanApi.listLibraryRoots();
      if (rootsResult.ok) {
        set({ libraryRoots: rootsResult.data });
      }
      set({ statusMessage: successStatus(`扫描完成，新增 ${result.data.importedCount} 个素材，已跳过 ${result.data.skippedCount} 个。`) });
    } finally {
      unsubscribe();
      set({ isBusy: false });
    }
  },

  setLibraryRootWatch: async (rootId, enabled) => {
    const root = get().libraryRoots.find((candidate) => candidate.id === rootId);
    set({
      isBusy: true,
      statusMessage: progressStatus(`${enabled ? "正在开启" : "正在关闭"} ${root?.label ?? "素材目录"} 监视...`),
    });

    try {
      const result = await window.suyanApi.setLibraryRootWatch(rootId, enabled);

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      set({
        libraryRoots: result.data.roots,
        statusMessage: successStatus(enabled ? "目录监视已开启。" : "目录监视已关闭。"),
      });
    } finally {
      set({ isBusy: false });
    }
  },

  reorderLibraryRoots: async (rootIds) => {
    const currentRoots = get().libraryRoots;
    const rootsById = new Map(currentRoots.map((root) => [root.id, root]));
    const orderedRoots = rootIds
      .map((rootId) => rootsById.get(rootId))
      .filter((root): root is LibraryRoot => Boolean(root));
    const usedIds = new Set(orderedRoots.map((root) => root.id));
    const nextRoots = [...orderedRoots, ...currentRoots.filter((root) => !usedIds.has(root.id))];

    set({ libraryRoots: nextRoots, isBusy: true, statusMessage: progressStatus("正在保存素材目录顺序...") });

    try {
      const result = await window.suyanApi.reorderLibraryRoots(nextRoots.map((root) => root.id));

      if (!result.ok) {
        set({ libraryRoots: currentRoots, statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      set({ libraryRoots: result.data, statusMessage: successStatus("素材目录顺序已保存。") });
    } finally {
      set({ isBusy: false });
    }
  },

  remapLibraryRoot: async (rootId) => {
    set({ isBusy: true, statusMessage: progressStatus("正在重新定位素材目录...") });

    try {
      const result = await window.suyanApi.remapLibraryRoot(rootId);

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      if (result.data.canceled) {
        set({ statusMessage: null });
        return;
      }

      setLibrary(result.data.library, set, get);
      const rootsResult = await window.suyanApi.listLibraryRoots();
      if (rootsResult.ok) {
        set({ libraryRoots: rootsResult.data });
      }
      set({
        statusMessage:
          result.data.missingCount > 0
            ? infoStatus(`目录已重新定位，仍有 ${result.data.missingCount} 个源文件缺失。`)
            : successStatus("目录已重新定位，外链素材已恢复。"),
      });
    } finally {
      set({ isBusy: false });
    }
  },

  removeLibraryRoot: async (rootId) => {
    set({ isBusy: true, statusMessage: progressStatus("正在移除素材目录...") });

    try {
      const result = await window.suyanApi.removeLibraryRoot(rootId);

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      setLibrary(result.data.library, set, get);
      set({
        libraryRoots: result.data.roots,
        statusMessage: infoStatus(`已移除挂载和 ${result.data.removedItemCount} 条索引，原文件未删除。`),
      });
    } finally {
      set({ isBusy: false });
    }
  },

  purgeMissingLibraryRootItems: async (rootId) => {
    const root = get().libraryRoots.find((candidate) => candidate.id === rootId);
    set({
      isBusy: true,
      statusMessage: progressStatus(`正在清理 ${root?.label ?? "素材目录"} 的缺失索引...`),
    });

    try {
      const result = await window.suyanApi.purgeMissingLibraryRootItems(rootId);

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      setLibrary(result.data.library, set, get);
      const rootsResult = await window.suyanApi.listLibraryRoots();
      if (rootsResult.ok) {
        set({ libraryRoots: rootsResult.data });
      }
      set({
        statusMessage:
          result.data.removedItemCount > 0
            ? successStatus(`已清理 ${result.data.removedItemCount} 条缺失索引（原文件未删除）。`)
            : infoStatus("该目录下没有可清理的缺失索引。"),
      });
    } finally {
      set({ isBusy: false });
    }
  },

  validateExternalLibrary: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在校验外链素材...") });

    try {
      const result = await window.suyanApi.validateExternalLibrary();

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        return;
      }

      setLibrary(result.data.library, set, get);
      const rootsResult = await window.suyanApi.listLibraryRoots();
      if (rootsResult.ok) {
        set({ libraryRoots: rootsResult.data });
      }
      set({
        statusMessage:
          result.data.missingCount > 0
            ? infoStatus(`校验完成：${result.data.missingCount} 个源文件缺失。`)
            : successStatus("校验完成，外链素材均可访问。"),
      });
    } finally {
      set({ isBusy: false });
    }
  },

  importImageBuffers: async (images) => {
    if (images.length === 0) {
      return;
    }

    set({ isBusy: true, statusMessage: progressStatus(`正在解析 ${images.length} 张图片的提示词…`) });

    try {
      const previousItemIds = new Set(get().items.map((item) => item.id));
      const result = await withImportOperationTimeout<ImportImagesData>(
        window.suyanApi.importImageBuffers(images),
      );

      if (result.ok) {
        setLibrary(result.data.library, set, get);
        const finalStatus =
          result.data.importedCount > 0
            ? getBufferedMediaImportStatus(result.data)
            : infoStatus("没有可导入的图片。");

        if (result.data.importedCount > 0) {
          markRecentImportPins(set, get, previousItemIds);
          scheduleLexiconSyncAfterImport(set, get, previousItemIds);
          scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
        }

        set({ statusMessage: finalStatus });
      } else {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      }
    } finally {
      set({ isBusy: false });
    }
  },

  importGeneratedImages: async (images, metadata) => {
    if (images.length === 0) {
      return [];
    }

    const mediaLabel = images.some((image) => image.mediaType === "video") ? "生成视频" : "生成图片";
    set({ isBusy: true, statusMessage: progressStatus(`正在保存 ${images.length} 个${mediaLabel}…`) });

    try {
      const previousItemIds = new Set(get().items.map((item) => item.id));
      const result = await withImportOperationTimeout<ImportGeneratedImagesData>(
        window.suyanApi.importGeneratedImages({ images, metadata }),
      );

      if (!result.ok) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
        throw new Error(result.error.message);
      }

      setLibrary(result.data.library, set, get);
      const importedIdSet = new Set(result.data.importedItemIds);
      const savedItems = result.data.library.items.filter((item) => importedIdSet.has(item.id));

      if (savedItems.length !== images.length) {
        const message = `生成图片保存不完整：应保存 ${images.length} 张，实际保存 ${savedItems.length} 张。`;
        set({ statusMessage: errorStatus("GENERATED_IMAGE_IMPORT_INCOMPLETE", message) });
        throw new Error(message);
      }

      markRecentImportPins(set, get, previousItemIds);
      scheduleLexiconSyncAfterImport(set, get, previousItemIds);
      scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      set({ statusMessage: successStatus(`已保存 ${savedItems.length} 个${mediaLabel}到素材库。`) });
      return savedItems;
    } finally {
      set({ isBusy: false });
    }
  },

  syncWorksToAccount: async (itemIds, expectedUid, force = false) => {
    if (get().isBusy) return false;
    set({ isBusy: true, statusMessage: progressStatus("正在同步作品归属…") });
    try {
      const result = await window.suyanApi.syncWorksToAccount({ itemIds, expectedUid, force });
      if (!result.ok) { set({ statusMessage: errorStatus(result.error.code, result.error.message) }); return false; }
      if (result.data.canceled) { set({ statusMessage: infoStatus("已取消同步作品。") }); return false; }
      if (result.data.library) setLibrary(result.data.library, set, get);
      set({ statusMessage: successStatus(`已关联 ${result.data.changedCount} 张素材，跳过 ${result.data.skippedCount} 张已有作者信息的素材。`) });
      return true;
    } catch {
      set({ statusMessage: errorStatus("WORK_SYNC_FAILED", "同步作品失败，请重试。") });
      return false;
    } finally { set({ isBusy: false }); }
  },

  refreshWorkAuthors: async () => {
    try {
      const result = await window.suyanApi.readLibrary();
      if (!result.ok) return;
      const byId = new Map(result.data.items.map(item => [item.id, item]));
      // Refresh author fields only: don't replace in-progress metadata edits.
      set({ items: get().items.map(item => {
        const saved = byId.get(item.id);
        if (!saved || saved.accountOwnerUid !== item.accountOwnerUid) return item;
        return { ...item, authorName: saved.authorName, authorAvatarUrl: saved.authorAvatarUrl };
      }) });
    } catch { /* Keep the existing library usable if refresh fails. */ }
  },

  importImageFilesForItem: async (itemId) => {
    const startedAt = performance.now();
    set({ isBusy: true, statusMessage: progressStatus("正在导入素材...") });
    const previousItemIds = new Set(get().items.map((item) => item.id));
    const result = await window.suyanApi.importImageFilesForItem(itemId);

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      const finalStatus = getImageImportForItemStatus(result.data);

      if (result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds, result.data.importedItemId);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      }

      set({
        selectedItemId: result.data.importedItemId ?? get().selectedItemId,
        statusMessage: finalStatus,
      });
      set({ isBusy: false });
      logRendererStartupEvent("import-files-for-item:renderer-timing", {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result.data.importedItemId;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    logRendererStartupEvent("import-files-for-item:renderer-timing", {
      durationMs: Math.round(performance.now() - startedAt),
    });

    return null;
  },

  importWordDocument: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在导入 Word 文档...") });
    const previousItemIds = new Set(get().items.map((item) => item.id));
    const result = await window.suyanApi.importWordDocument();

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      const finalStatus = getWordDocumentImportStatus(result.data);

      if (!result.data.canceled && result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      }

      set({
        statusMessage: finalStatus,
      });
    } else {
      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    }

    set({ isBusy: false });
  },

  importClipboardImage: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在导入剪贴板素材...") });
    const previousItemIds = new Set(get().items.map((item) => item.id));
    const result = await withImportOperationTimeout<ImportImagesData>(window.suyanApi.importClipboardImage());

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      const finalStatus = getClipboardImportStatus(result.data);

      if (result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      }

      set({ statusMessage: finalStatus });
    } else {
      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    }

    set({ isBusy: false });
  },

  importClipboardImageForItem: async (itemId) => {
    set({ isBusy: true, statusMessage: progressStatus("正在导入剪贴板图片...") });
    const previousItemIds = new Set(get().items.map((item) => item.id));
    const result = await withImportOperationTimeout<ImportClipboardImageForItemData>(
      window.suyanApi.importClipboardImageForItem(itemId),
    );

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      const finalStatus = successStatus(
        result.data.mode === "replaced" ? "已替换默认效果图。" : "已新增一张效果图。",
      );

      markRecentImportPins(set, get, previousItemIds, result.data.importedItemId);
      scheduleLexiconSyncAfterImport(set, get, previousItemIds);
      scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
      set({
        selectedItemId: result.data.importedItemId,
        statusMessage: finalStatus,
      });
      set({ isBusy: false });
      return result.data.importedItemId;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });

    return null;
  },

  downloadRemoteMaterial: async (itemId) => {
    const item = get().items.find((candidate) => candidate.id === itemId);

    if (!item) {
      return false;
    }

    if (inFlightRemoteMaterialDownloads.has(itemId)) {
      return true;
    }

    inFlightRemoteMaterialDownloads.add(itemId);
    set({
      statusMessage: progressStatus(
        item.remoteImageStatus === "pending" ? "正在下载网络素材..." : "正在补全网络素材信息...",
      ),
    });

    try {
      const result = await withImportOperationTimeout<DownloadRemoteMaterialData>(
        window.suyanApi.downloadRemoteMaterial(itemId),
      );

      if (result.ok) {
        setLibrary(result.data.library, set, get);
        set({
          statusMessage: result.data.downloaded
            ? successStatus("网络素材已下载到本地。")
            : result.data.updated
              ? successStatus("网络素材信息已更新。")
              : null,
        });
        return true;
      }

      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      return false;
    } finally {
      inFlightRemoteMaterialDownloads.delete(itemId);
    }
  },

  generateVideoFrames: async (itemId) => {
    if (!(await get().checkVideoRuntime())) {
      set({
        statusMessage: errorStatus("FFMPEG_BINARY_NOT_FOUND", "需要视频依赖（FFmpeg）才能生成关键帧，请先安装。"),
      });
      return false;
    }

    set({ isBusy: true, statusMessage: progressStatus("正在生成视频关键帧...") });
    const result = await window.suyanApi.generateVideoFrames(itemId);

    if (result.ok) {
      const { keyframes, posterFileName, durationSec, framesGeneratedAt } = result.data;
      set((state) => ({
        items: state.items.map((item) =>
          item.id === result.data.itemId
            ? {
                ...item,
                videoKeyframes: keyframes,
                videoPosterFileName: posterFileName,
                videoDurationSec: durationSec,
                videoFramesGeneratedAt: framesGeneratedAt,
              }
            : item,
        ),
        statusMessage: successStatus(
          keyframes.length > 0 ? `已生成 ${keyframes.length} 个关键帧。` : "已刷新视频关键帧。",
        ),
      }));
      set({ isBusy: false });
      return true;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });

    return false;
  },

  importVideoReferenceImages: async (itemId) => {
    if (!(await get().checkVideoRuntime())) {
      set({
        statusMessage: errorStatus("FFMPEG_BINARY_NOT_FOUND", "需要视频依赖（FFmpeg）才能导入参考图，请先安装。"),
      });
      return false;
    }

    set({ isBusy: true, statusMessage: progressStatus("正在导入参考图...") });
    const result = await window.suyanApi.importVideoReferenceImages(itemId);

    if (result.ok) {
      setLibrary(result.data.library, set, get);

      if (result.data.canceled) {
        set({ isBusy: false, statusMessage: infoStatus("已取消导入。") });
        return false;
      }

      set({
        isBusy: false,
        statusMessage: successStatus(`已导入 ${result.data.importedCount} 张参考图。`),
      });
      return true;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });

    return false;
  },

  deleteVideoReferenceImage: async (itemId, imageFileName) => {
    set({ isBusy: true, statusMessage: progressStatus("正在删除参考图...") });
    const result = await window.suyanApi.deleteVideoReferenceImage(itemId, imageFileName);

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      set({ isBusy: false, statusMessage: successStatus("已删除参考图。") });
      return true;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });

    return false;
  },

  importClipboardReferenceImage: async (itemId) => {
    set({ isBusy: true, statusMessage: progressStatus("正在从剪切板导入参考图...") });
    const result = await window.suyanApi.importClipboardReferenceImage(itemId);

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      set({ isBusy: false, statusMessage: successStatus("已从剪切板导入参考图。") });
      return true;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });

    return false;
  },

  importReferenceImageFromUrl: async (itemId, url) => {
    set({ isBusy: true, statusMessage: progressStatus("正在从链接下载参考图...") });
    const result = await window.suyanApi.importReferenceImageFromUrl(itemId, url);

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      set({ isBusy: false, statusMessage: successStatus("已从链接导入参考图。") });
      return true;
    }

    set({
      isBusy: false,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });

    return false;
  },

  importZip: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在导入素材包...") });
    const previousItemIds = new Set(get().items.map((item) => item.id));
    try {
      // Reserve the settings queue until imported knowledge is installed in the store.
      const task = viewSettingsWriteChain.then(async () => {
        const result = await window.suyanApi.importZip();
        if (result.ok && !result.data.canceled && result.data.settings) {
          const settings = result.data.settings;
          const workspace = normalizeCategoryWorkspace(settings.categoryWorkspace, settings.promptLexicons);
          archiveKnowledgeRevision += 1;
          set({ promptLexicons: settings.promptLexicons, categoryTaxonomy: workspace.taxonomy });
        }
        return result;
      });
      viewSettingsWriteChain = task.then(() => undefined, () => undefined);
      const result = await task;

      if (result.ok) {
        setLibrary(result.data.library, set, get);
        const finalStatus = result.data.canceled
          ? infoStatus("已取消导入。")
          : successStatus(`已导入 ${result.data.importedCount} 条素材${result.data.settings ? "，并合并对应的分类与标签库" : ""}。`);

        if (!result.data.canceled && result.data.importedCount > 0) {
          markRecentImportPins(set, get, previousItemIds);
          if (!result.data.settings) scheduleLexiconSyncAfterImport(set, get, previousItemIds);
          scheduleAutoNsfwGradingAfterImport(set, get, previousItemIds);
        }
        set({ statusMessage: finalStatus });
      } else {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      }
    } catch {
      set({ statusMessage: errorStatus("ZIP_IMPORT_FAILED", "分享包导入失败，请重试或查看日志。") });
    } finally {
      set({ isBusy: false });
    }
  },

  exportZip: async (itemIds = [], authorChoice) => {
    set({ statusMessage: null });
    try {
      await viewSettingsWriteChain;
      const result = await window.suyanApi.exportZip(itemIds, authorChoice);

      if (result.ok) {
        if (result.data.requiresAuthorChoice) return result.data;
        set({
          statusMessage: result.data.canceled
            ? infoStatus("已取消分享导出。")
              : successStatus(
                `已导出 ${result.data.exportedCount} 张素材${result.data.volumeCount && result.data.volumeCount > 1
                  ? `，已自动分为 ${result.data.volumeCount} 个备份包` : ""}${result.data.categoryCount !== undefined
                  ? `，包含 ${result.data.categoryCount} 个分类、${result.data.tagCount ?? 0} 个标签` : ""}。`,
              ),
        });
      } else {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      }
      return result.ok ? result.data : null;
    } catch {
      set({ statusMessage: errorStatus("ZIP_EXPORT_FAILED", "分享包导出失败，请重试或查看日志。") });
      return null;
    }
  },

  saveItem: async (itemId, patch, options = {}) => {
    const runInBackground = options.background === true;
    const currentItems = get().items;
    const now = new Date().toISOString();
    const targetItemIds = resolvePromptGroupPatchItemIds(currentItems, itemId, patch);
    const targetItemIdSet = new Set(targetItemIds);
    const hasTagsPatch = Object.prototype.hasOwnProperty.call(patch, "tags");
    const nextItems = currentItems.map((item) =>
      targetItemIdSet.has(item.id)
        ? {
            ...item,
            ...patch,
            tags: hasTagsPatch
              ? options.preserveManualTags
                ? normalizeManualPromptTags(patch.tags ?? [], { maxCount: maxAnalysisResultCount })
                : normalizeConcretePromptTags(patch.tags ?? [])
              : item.tags,
            updatedAt: now,
          }
        : item,
    );

    set({
      items: nextItems,
      ...(runInBackground ? {} : { isBusy: true, statusMessage: null }),
    });

    const result = await window.suyanApi.saveLibrary(buildLibraryFile(nextItems));

    if (result.ok) {
      if (!runInBackground) {
        setLibrary(result.data, set, get);
      }
      if (!options.silent && !runInBackground) {
        set({ statusMessage: successStatus("已保存。") });
      }
      // Always sync tags into the browser lexicons after saves that touch tags.
      // Background detail saves used to skip this, so AI-recognized tags never
      // appeared under 标签浏览.
      const shouldSyncLexicons = hasTagsPatch;

      if (shouldSyncLexicons) {
        scheduleIdleWork(() => {
          void syncPromptLexiconsFromLibrary(set, get, {
            silent: true,
            targetItemIds,
          }).catch(() => undefined);
        });
      }
    } else {
      set({
        items: currentItems,
        ...(runInBackground ? {} : { statusMessage: errorStatus(result.error.code, result.error.message) }),
      });
    }

    if (!runInBackground) {
      set({ isBusy: false });
    }
  },

  saveItemsBatch: async (patches, options = {}) => {
    if (!patches.length) {
      return true;
    }

    const runInBackground = options.background === true;
    const currentItems = get().items;
    const now = new Date().toISOString();
    const nextById = new Map(currentItems.map((item) => [item.id, item]));
    const touchedIds = new Set<string>();

    for (const { itemId, patch } of patches) {
      const targetItemIds = resolvePromptGroupPatchItemIds(currentItems, itemId, patch);
      const hasTagsPatch = Object.prototype.hasOwnProperty.call(patch, "tags");
      for (const id of targetItemIds) {
        const current = nextById.get(id);
        if (!current) {
          continue;
        }
        touchedIds.add(id);
        nextById.set(id, {
          ...current,
          ...patch,
          tags: hasTagsPatch
            ? options.preserveManualTags
              ? normalizeManualPromptTags(patch.tags ?? [], { maxCount: maxAnalysisResultCount })
              : normalizeConcretePromptTags(patch.tags ?? [])
            : current.tags,
          updatedAt: now,
        });
      }
    }

    if (touchedIds.size === 0) {
      return true;
    }

    const nextItems = currentItems.map((item) => nextById.get(item.id) ?? item);

    set({
      items: nextItems,
      ...(runInBackground ? {} : { isBusy: true, statusMessage: null }),
    });

    // Always await disk write so bulk clear/delete does not get lost on restart,
    // even when runInBackground is true for UI responsiveness.
    const result = await window.suyanApi.saveLibrary(buildLibraryFile(nextItems));

    if (result.ok) {
      // Always reconcile from disk so bulk clears survive restart.
      setLibrary(result.data, set, get);
      if (!options.silent && !runInBackground) {
        set({ statusMessage: successStatus(`已更新 ${touchedIds.size} 条素材。`) });
      }

      const touchedTagOrCapsule = patches.some(({ patch }) => {
        if (Object.prototype.hasOwnProperty.call(patch, "tags")) {
          return true;
        }
        if (typeof patch.prompt === "string" && patch.prompt.includes("{{")) {
          return true;
        }
        if (typeof patch.negativePrompt === "string" && patch.negativePrompt.includes("{{")) {
          return true;
        }
        return false;
      });

      // Sync material tags into 标签浏览 even for silent/background batch saves
      // (e.g. AI tag recognition). Skip bulk clears handled by clearLexiconDomain.
      if (touchedTagOrCapsule) {
        scheduleIdleWork(() => {
          void syncPromptLexiconsFromLibrary(set, get, {
            silent: true,
            targetItemIds: [...touchedIds],
          }).catch(() => undefined);
        });
      }

      if (!runInBackground) {
        set({ isBusy: false });
      }
      return true;
    }

    set({
      items: currentItems,
      ...(runInBackground
        ? {}
        : { statusMessage: errorStatus(result.error.code, result.error.message), isBusy: false }),
    });
    return false;
  },

  clearLexiconDomain: async (domain) => {
    const currentItems = get().items;
    const currentPromptLexicons = get().promptLexicons ?? {
      categories: [],
      tags: [],
    };
    const currentTaxonomy = get().categoryTaxonomy ?? createEmptyCategoryTaxonomy();
    const currentTagOrder = get().tagOrder;
    const now = new Date().toISOString();

    let nextItems = currentItems;
    let nextPromptLexicons = currentPromptLexicons;
    let nextTaxonomy = currentTaxonomy;
    let nextTagOrder = currentTagOrder;
    let touched = 0;

    if (domain === "categories") {
      nextItems = currentItems.map((item) => {
        const hasCategory =
          Boolean(item.categoryId) ||
          Boolean(item.genreIds && item.genreIds.length > 0) ||
          (typeof item.category === "string" && item.category.trim() && item.category.trim() !== "未分类");
        if (!hasCategory) {
          return item;
        }
        touched += 1;
        const history =
          (typeof item.category === "string" && item.category.trim()) ||
          (typeof item.legacyCategory === "string" && item.legacyCategory.trim()) ||
          null;
        return {
          ...item,
          category: null,
          categoryId: null,
          genreIds: null,
          categorySource: null,
          categoryConfidence: null,
          legacyCategory: history,
          updatedAt: now,
        };
      });
      // Keep system taxonomy nodes only (drop custom/ai pollution from lexicon merge later).
      nextTaxonomy = ensureSystemCategoryTaxonomy({
        schemaVersion: 1,
        updatedAt: now,
        nodes: currentTaxonomy.nodes.filter((node) => node.type === "system"),
      });
      nextPromptLexicons = {
        ...currentPromptLexicons,
        // System category leaves only — never rehydrate from dirty custom lexicon rows.
        categories: taxonomyToLexiconCategories(nextTaxonomy).filter((entry) => entry.id.startsWith("system:")),
      };
    } else if (domain === "tags") {
      nextItems = currentItems.map((item) => {
        if (!item.tags || item.tags.length === 0) {
          return item;
        }
        touched += 1;
        return {
          ...item,
          tags: [],
          updatedAt: now,
        };
      });
      nextPromptLexicons = {
        ...currentPromptLexicons,
        tags: [],
      };
      // Sidebar / filter tag order must not resurrect cleared labels after restart.
      nextTagOrder = [];
    }

    set({
      items: nextItems,
      promptLexicons: nextPromptLexicons,
      categoryTaxonomy: nextTaxonomy,
      tagOrder: nextTagOrder,
      isBusy: true,
      statusMessage: progressStatus(
        domain === "categories" ? "正在清空分类…" : "正在清空标签…",
      ),
    });

    try {
      // Persist library when items changed. Await disk write before settings so a
      // crash mid-clear cannot leave view-settings empty while library still has data
      // (or the reverse via a later autosave).
      if (domain === "categories" || domain === "tags") {
        const libraryResult = await window.suyanApi.saveLibrary(buildLibraryFile(nextItems));
        if (!libraryResult.ok) {
          set({
            items: currentItems,
            promptLexicons: currentPromptLexicons,
            categoryTaxonomy: currentTaxonomy,
            tagOrder: currentTagOrder,
            isBusy: false,
            statusMessage: errorStatus(libraryResult.error.code, libraryResult.error.message),
          });
          return false;
        }
        // Reconcile from the just-written library so cleared fields are the source of truth.
        setLibrary(libraryResult.data, set, get);
      }

      // Always build settings from the cleared snapshot, not from a concurrent store
      // mutation that may have raced in while the library write was in flight.
      const settingsResult = await saveLibraryViewSettingsSerialized(
        buildLibraryViewSettings(get(), {
          promptLexicons: nextPromptLexicons,
          tagOrder: nextTagOrder,
          categoryWorkspace: {
            taxonomy: nextTaxonomy,
            inbox: domain === "categories" ? [] : get().categoryInbox,
            candidates: domain === "categories" ? [] : get().categoryCandidates,
            learningEvents: get().categoryLearningEvents,
          },
        }),
      );

      if (!settingsResult.ok) {
        set({
          items: currentItems,
          promptLexicons: currentPromptLexicons,
          categoryTaxonomy: currentTaxonomy,
          tagOrder: currentTagOrder,
          isBusy: false,
          statusMessage: errorStatus(settingsResult.error.code, settingsResult.error.message),
        });
        return false;
      }

      syncLibraryViewSettings(set, settingsResult.data, {
        // Keep the cleared item snapshot — settings payload has no items.
        items: get().items,
        promptLexicons: nextPromptLexicons,
        categoryTaxonomy: nextTaxonomy,
        tagOrder: nextTagOrder,
        isBusy: false,
        statusMessage: successStatus(
          domain === "categories"
            ? `已清空素材分类（系统目录保留）。`
            : `已清空素材标签与标签词库。`,
        ),
      });
      logRendererStartupEvent("lexicon:clear-domain:persisted", {
        domain,
        touched,
        categoryCount: nextPromptLexicons.categories?.length ?? 0,
        tagCount: nextPromptLexicons.tags?.length ?? 0,
        itemCount: get().items.length,
      });
      return true;
    } catch (error) {
      set({
        items: currentItems,
        promptLexicons: currentPromptLexicons,
        categoryTaxonomy: currentTaxonomy,
        tagOrder: currentTagOrder,
        isBusy: false,
        statusMessage: errorStatus(
          "LEXICON_CLEAR_FAILED",
          error instanceof Error ? error.message : "清空词库失败，请重试。",
        ),
      });
      return false;
    }
  },

  saveTagConfiguration: async (originalTags, drafts, promptLexicons) => {
    const currentItems = get().items;
    const currentTagOrder = get().tagOrder;
    const currentPromptLexicons = get().promptLexicons;
    const nextPromptLexicons = promptLexicons ?? currentPromptLexicons;
    const applied = applyTagConfigurationToItems(currentItems, originalTags, drafts, new Date().toISOString());

    set({
      items: applied.items,
      tagOrder: applied.tagOrder,
      promptLexicons: nextPromptLexicons,
      isBusy: true,
      statusMessage: null,
    });

    const libraryResult = await window.suyanApi.saveLibrary(buildLibraryFile(applied.items));

    if (!libraryResult.ok) {
      set({
        items: currentItems,
        tagOrder: currentTagOrder,
        promptLexicons: currentPromptLexicons,
        statusMessage: errorStatus(libraryResult.error.code, libraryResult.error.message),
      });
      set({ isBusy: false });
      return;
    }

    const settingsResult = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { tagOrder: applied.tagOrder, promptLexicons: nextPromptLexicons }),
    );

    setLibrary(libraryResult.data, set, get);

    if (settingsResult.ok) {
      syncLibraryViewSettings(set, settingsResult.data, { statusMessage: successStatus("已更新标签。") });
    } else {
      set({
        tagOrder: applied.tagOrder,
        promptLexicons: nextPromptLexicons,
        statusMessage: errorStatus(settingsResult.error.code, settingsResult.error.message),
      });
    }

    set({ isBusy: false });
  },

  savePromptLexicons: async (promptLexicons, options) => {
    const silent = options?.silent === true;
    const currentPromptLexicons = get().promptLexicons;
    const currentTaxonomy = get().categoryTaxonomy ?? createEmptyCategoryTaxonomy();
    const nextTaxonomy = mergeLexiconCategoriesIntoTaxonomy(currentTaxonomy, promptLexicons.categories ?? []);
    const syncedLexicons = syncLexiconCategoriesFromTaxonomy(promptLexicons, nextTaxonomy);

    set({
      promptLexicons: syncedLexicons,
      categoryTaxonomy: nextTaxonomy,
      statusMessage: null,
    });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), {
        promptLexicons: syncedLexicons,
        categoryWorkspace: {
          taxonomy: nextTaxonomy,
          inbox: get().categoryInbox,
          candidates: get().categoryCandidates,
          learningEvents: get().categoryLearningEvents,
        },
      }),
    ).catch(() => ({ ok: false as const, error: { code: "LEXICON_SAVE_FAILED", message: "词库保存连接中断，请重试。" } }));

    if (result.ok) {
      logRendererStartupEvent("lexicon:save:persisted", {
        domain: "promptLexicons",
        categoryCount: syncedLexicons.categories.length,
        tagCount: syncedLexicons.tags.length,
        silent,
      });
      // An older completed request must not replace a newer optimistic lexicon.
      if (get().promptLexicons === syncedLexicons) {
        syncLibraryViewSettings(set, result.data, {
          statusMessage: silent ? null : successStatus("已保存词库。"),
        });
      }
      return true;
    }

    logRendererStartupEvent("lexicon:save:failed", {
      domain: "promptLexicons",
      code: result.error.code,
      message: result.error.message,
    });
    if (get().promptLexicons === syncedLexicons) {
      set({
        promptLexicons: currentPromptLexicons,
        categoryTaxonomy: currentTaxonomy,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }
    return false;
  },

  assignItemCategoryId: async (itemId, categoryId, source = "user") => {
    await get().movePromptGroupsToCategory([itemId], categoryId, source);
  },

  movePromptGroupsToCategory: async (itemIds, categoryId, source = "user") => {
    const uniqueItemIds = [...new Set(itemIds.filter(Boolean))];
    if (uniqueItemIds.length === 0) {
      return false;
    }

    const taxonomy = get().categoryTaxonomy ?? createEmptyCategoryTaxonomy();
    const currentItems = get().items;
    const primaryTargets = uniqueItemIds
      .map((id) => currentItems.find((item) => item.id === id))
      .filter((item): item is LibraryItem => Boolean(item));
    if (primaryTargets.length === 0) {
      return false;
    }

    const affectedIdSet = new Set<string>();
    for (const target of primaryTargets) {
      const groupIds = resolvePromptGroupPatchItemIds(currentItems, target.id, {
        category: resolveCategoryName(taxonomy, categoryId, target.category),
        categoryId,
      });
      for (const id of groupIds) {
        affectedIdSet.add(id);
      }
    }

    const nextItems = currentItems.map((item) =>
      affectedIdSet.has(item.id) ? assignItemCategory(item, taxonomy, categoryId, source, 1) : item,
    );

    const now = new Date().toISOString();
    const learningEvents = [
      ...primaryTargets.map((target, index) => ({
        id: `learn-${Date.now()}-${index}-${target.id}`,
        itemId: target.id,
        fromCategoryId: target.categoryId ?? null,
        toCategoryId: categoryId ?? "system:uncategorized",
        source,
        createdAt: now,
      })),
      ...get().categoryLearningEvents,
    ].slice(0, 200);

    const movedPrimaryIds = new Set(primaryTargets.map((item) => item.id));
    const inbox = get().categoryInbox.filter((entry) => !movedPrimaryIds.has(entry.itemId));
    const nextTaxonomy = recomputeCategoryUsageCounts(
      taxonomy,
      nextItems.map((item) => item.categoryId),
    );
    const nextPromptLexicons = syncLexiconCategoriesFromTaxonomy(get().promptLexicons, nextTaxonomy);
    const categoryLabel = categoryId
      ? resolveCategoryName(nextTaxonomy, categoryId, "目标分类")
      : "未分类";

    set({
      items: nextItems,
      categoryTaxonomy: nextTaxonomy,
      categoryInbox: inbox,
      categoryLearningEvents: learningEvents,
      promptLexicons: nextPromptLexicons,
      isBusy: true,
      statusMessage: null,
    });

    const libraryResult = await window.suyanApi.saveLibrary(buildLibraryFile(nextItems));
    const settingsResult = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), {
        promptLexicons: nextPromptLexicons,
        categoryWorkspace: {
          taxonomy: nextTaxonomy,
          inbox,
          candidates: get().categoryCandidates,
          learningEvents,
        },
      }),
    );

    if (libraryResult.ok) {
      setLibrary(libraryResult.data, set, get);
    }
    if (settingsResult.ok) {
      const count = primaryTargets.length;
      syncLibraryViewSettings(set, settingsResult.data, {
        statusMessage: successStatus(
          categoryId
            ? count > 1
              ? `已将 ${count} 组提示词移至「${categoryLabel}」。`
              : `已移至「${categoryLabel}」。`
            : count > 1
              ? `已将 ${count} 组提示词移出分类。`
              : "已清除所属分类。",
        ),
      });
    } else if (!libraryResult.ok) {
      set({
        items: currentItems,
        statusMessage: errorStatus(libraryResult.error.code, libraryResult.error.message),
      });
      set({ isBusy: false });
      return false;
    }

    set({ isBusy: false });
    return libraryResult.ok;
  },

  upsertCustomCategory: async (input) => {
    const name = input.name.trim();
    if (!name) {
      set({ statusMessage: errorStatus("CATEGORY_NAME_EMPTY", "分类名称不能为空。") });
      return null;
    }

    const currentTaxonomy = get().categoryTaxonomy ?? createEmptyCategoryTaxonomy();
    const currentPromptLexicons = get().promptLexicons;
    const { taxonomy, categoryId } = upsertCustomCategoryNode(currentTaxonomy, input);
    if (!categoryId || categoryId === "system:uncategorized") {
      set({ statusMessage: errorStatus("CATEGORY_UPSERT_FAILED", "无法创建或更新分类。") });
      return null;
    }

    const nextPromptLexicons = syncLexiconCategoriesFromTaxonomy(get().promptLexicons, taxonomy);
    set({
      categoryTaxonomy: taxonomy,
      promptLexicons: nextPromptLexicons,
      isBusy: true,
      statusMessage: null,
    });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), {
        promptLexicons: nextPromptLexicons,
        categoryWorkspace: {
          taxonomy,
          inbox: get().categoryInbox,
          candidates: get().categoryCandidates,
          learningEvents: get().categoryLearningEvents,
        },
      }),
    );

    if (result.ok) {
      const isNew = !input.id || !currentTaxonomy.nodes.some((node) => node.id === input.id);
      logRendererStartupEvent("lexicon:custom-category:save", {
        ok: true,
        categoryId,
        isNew,
        categoryCount: nextPromptLexicons.categories.length,
      });
      syncLibraryViewSettings(set, result.data, {
        statusMessage: successStatus(isNew ? `已新增分类「${name}」。` : `已更新分类「${name}」。`),
      });
      set({ isBusy: false });
      return categoryId;
    }

    logRendererStartupEvent("lexicon:custom-category:save", {
      ok: false,
      categoryId,
      code: result.error.code,
      message: result.error.message,
    });
    set({
      categoryTaxonomy: currentTaxonomy,
      promptLexicons: currentPromptLexicons,
      statusMessage: errorStatus(result.error.code, result.error.message),
      isBusy: false,
    });
    return null;
  },

  deleteCustomCategory: async (categoryId, reassignToCategoryId = null) => {
    const currentTaxonomy = get().categoryTaxonomy ?? createEmptyCategoryTaxonomy();
    const requestedId = typeof categoryId === "string" ? categoryId.trim() : "";
    if (!requestedId) {
      return false;
    }

    // Category browser may pass:
    // - real taxonomy ids (custom:/ai:/system:…)
    // - derived freeform ids (derived-category:<labelKey>) from item.category labels
    const derivedLabelKey = requestedId.startsWith("derived-category-")
      ? requestedId.slice("derived-category-".length)
      : null;

    let target = currentTaxonomy.nodes.find((node) => node.id === requestedId) ?? null;
    if (!target && derivedLabelKey) {
      target =
        currentTaxonomy.nodes.find(
          (node) =>
            node.type !== "system" &&
            normalizeCategoryLabelKey(node.name) === derivedLabelKey,
        ) ?? null;
    }

    const resolvedId = target?.id ?? (requestedId.startsWith("custom:") || requestedId.startsWith("ai:") || requestedId.startsWith("system:") ? requestedId : null);
    const matchLabelKey =
      derivedLabelKey ||
      (target ? normalizeCategoryLabelKey(target.name) : null) ||
      null;

    // Nothing to delete if the id is unknown and no freeform label key can match items.
    if (!target && !matchLabelKey && !resolvedId) {
      set({ statusMessage: errorStatus("CATEGORY_NOT_FOUND", "未找到该分类，可能已被删除。") });
      return false;
    }

    const taxonomy = target
      ? removeCategoryNode(currentTaxonomy, target.id)
      : currentTaxonomy;
    const remainingCategoryIds = new Set(taxonomy.nodes.map((node) => node.id));
    const removedCategoryIds = new Set(
      currentTaxonomy.nodes
        .map((node) => node.id)
        .filter((id) => !remainingCategoryIds.has(id)),
    );
    const currentItems = get().items;
    const nextItems = currentItems.map((item) => {
      const byId = Boolean(item.categoryId && removedCategoryIds.has(item.categoryId)) ||
        Boolean(resolvedId && item.categoryId === resolvedId);
      const byLabel =
        Boolean(matchLabelKey) &&
        typeof item.category === "string" &&
        normalizeCategoryLabelKey(item.category) === matchLabelKey;
      // Freeform / derived categories often have empty categoryId; clear by display label too.
      if (byId || byLabel) {
        return assignItemCategory(item, taxonomy, reassignToCategoryId, "user", 1);
      }
      return item;
    });
    const nextTaxonomy = recomputeCategoryUsageCounts(
      taxonomy,
      nextItems.map((item) => item.categoryId),
    );
    let nextPromptLexicons = syncLexiconCategoriesFromTaxonomy(get().promptLexicons, nextTaxonomy);
    // Drop leftover freeform category entries that only lived in the lexicon draft list.
    let nextCategories = nextPromptLexicons.categories;
    if (matchLabelKey) {
      nextCategories = nextCategories.filter(
        (entry) => normalizeCategoryLabelKey(entry.label) !== matchLabelKey,
      );
    }
    if (resolvedId) {
      nextCategories = nextCategories.filter((entry) => entry.id !== resolvedId);
    }
    if (nextCategories !== nextPromptLexicons.categories) {
      nextPromptLexicons = {
        ...nextPromptLexicons,
        categories: nextCategories,
      };
    }

    const deletedName = target?.name || matchLabelKey || "自定义分类";
    const itemsChanged = nextItems.some((item, index) => item !== currentItems[index]);

    set({
      items: nextItems,
      categoryTaxonomy: nextTaxonomy,
      promptLexicons: nextPromptLexicons,
      isBusy: true,
      statusMessage: progressStatus(`正在删除分类「${deletedName}」…`),
    });

    try {
      let libraryOk = true;
      if (itemsChanged) {
        const libraryResult = await window.suyanApi.saveLibrary(buildLibraryFile(nextItems));
        libraryOk = libraryResult.ok;
        if (libraryResult.ok) {
          setLibrary(libraryResult.data, set, get);
        } else {
          set({
            items: currentItems,
            categoryTaxonomy: currentTaxonomy,
            promptLexicons: get().promptLexicons,
            statusMessage: errorStatus(libraryResult.error.code, libraryResult.error.message),
            isBusy: false,
          });
          return false;
        }
      }

      const settingsResult = await saveLibraryViewSettingsSerialized(
        buildLibraryViewSettings(get(), {
          promptLexicons: nextPromptLexicons,
          categoryWorkspace: {
            taxonomy: nextTaxonomy,
            inbox: get().categoryInbox,
            candidates: get().categoryCandidates,
            learningEvents: get().categoryLearningEvents,
          },
        }),
      );

      if (settingsResult.ok) {
        syncLibraryViewSettings(set, settingsResult.data, {
          statusMessage: successStatus(`已删除分类「${deletedName}」。`),
          isBusy: false,
        });
        return true;
      }

      set({
        categoryTaxonomy: nextTaxonomy,
        promptLexicons: nextPromptLexicons,
        statusMessage: errorStatus(settingsResult.error.code, settingsResult.error.message),
        isBusy: false,
      });
      return libraryOk;
    } catch (error) {
      set({
        items: currentItems,
        categoryTaxonomy: currentTaxonomy,
        statusMessage: errorStatus(
          "CATEGORY_DELETE_FAILED",
          error instanceof Error ? error.message : "删除分类失败，请重试。",
        ),
        isBusy: false,
      });
      return false;
    }
  },

  dismissCategoryInboxItem: async (itemId) => {
    const inbox = get().categoryInbox.filter((entry) => entry.itemId !== itemId);
    set({ categoryInbox: inbox });
    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), {
        categoryWorkspace: {
          taxonomy: get().categoryTaxonomy,
          inbox,
          candidates: get().categoryCandidates,
          learningEvents: get().categoryLearningEvents,
        },
      }),
    );
    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
    }
  },

  importPromptLexicon: async (kind) => {
    set({ isBusy: true, statusMessage: progressStatus("正在导入词库文件...") });

    const result = await window.suyanApi.importPromptLexicon(kind);

    if (result.ok) {
      set({
        statusMessage: result.data.canceled
          ? infoStatus("未选择词库文件。")
          : successStatus(`已导入 ${result.data.importedCount} 条词库记录。`),
        isBusy: false,
      });
      return result.data.canceled ? null : result.data.items;
    }

    set({
      statusMessage: errorStatus(result.error.code, result.error.message),
      isBusy: false,
    });
    return null;
  },

  exportPromptLexicon: async (kind, items) => {
    set({ statusMessage: null });

    const result = await window.suyanApi.exportPromptLexicon(kind, items);

    set({
      statusMessage: result.ok
        ? result.data.canceled
          ? infoStatus("已取消导出。")
          : successStatus(`已导出 ${result.data.exportedCount} 条词库记录。`)
        : errorStatus(result.error.code, result.error.message),
    });
  },

  importPromptLexiconImage: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在上传词库图像...") });

    const result = await window.suyanApi.importPromptLexiconImage();

    if (result.ok) {
      set({
        statusMessage: result.data.canceled ? infoStatus("未选择图片。") : successStatus("已上传词库图像。"),
        isBusy: false,
      });
      return result.data.imageFileName;
    }

    set({
      statusMessage: errorStatus(result.error.code, result.error.message),
      isBusy: false,
    });
    return null;
  },

  toggleFavoriteImage: async (itemId) => {
    const currentLikedImageIds = get().likedImageIds;
    const isLiked = currentLikedImageIds.includes(itemId);
    const nextLikedImageIds = isLiked
      ? currentLikedImageIds.filter((likedImageId) => likedImageId !== itemId)
      : [itemId, ...currentLikedImageIds];

    set({ likedImageIds: nextLikedImageIds, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { likedImageIds: nextLikedImageIds }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data, {
        statusMessage: successStatus(isLiked ? "已取消喜爱图片。" : "已加入喜爱图片。"),
      });
    } else {
      set({
        likedImageIds: currentLikedImageIds,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }
  },

  toggleRecommendationStar: async (url) => {
    const current = get().starredRecommendations;
    const isStarred = current.includes(url);
    const next = isStarred ? current.filter((item) => item !== url) : [url, ...current];

    set({ starredRecommendations: next, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { starredRecommendations: next }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data, {
        statusMessage: successStatus(isStarred ? "已取消星标。" : "已星标并置顶。"),
      });
    } else {
      set({
        starredRecommendations: current,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }
  },

  addWebAssistantCustomUrl: async (url) => {
    const current = get().webAssistantCustomUrls;
    const normalized = url.trim();
    if (current.includes(normalized)) {
      set({ statusMessage: infoStatus("该网址已在「我的网址」中。") });
      return;
    }
    // 上限 50 条：超出后丢弃最旧的一条，新网址前置。
    const next = [normalized, ...current].slice(0, 50);
    set({ webAssistantCustomUrls: next, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { webAssistantCustomUrls: next }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data, {
        statusMessage: successStatus("已保存到「我的网址」。"),
      });
    } else {
      set({
        webAssistantCustomUrls: current,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }
  },

  removeWebAssistantCustomUrl: async (url) => {
    const current = get().webAssistantCustomUrls;
    const next = current.filter((item) => item !== url);
    if (next.length === current.length) {
      return;
    }
    set({ webAssistantCustomUrls: next, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { webAssistantCustomUrls: next }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data, {
        statusMessage: successStatus("已从「我的网址」移除。"),
      });
    } else {
      set({
        webAssistantCustomUrls: current,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }
  },

  saveWebAssistantPrefs: async (prefs) => {
    set({
      webAssistantLastPlatform: prefs.platform,
      webAssistantLastCustomUrl: prefs.customUrl,
    });
    void saveLibraryViewSettingsSerialized(buildLibraryViewSettings(get()));
  },

  deleteItems: async (itemIds, deleteImages) => {
    if (itemIds.length === 0) {
      return;
    }

    set({ isBusy: true, statusMessage: null });
    const startedAt = performance.now();
    const deletedIdSet = new Set(itemIds);
    const deletedItemsSnapshot = get().items.filter((item) => deletedIdSet.has(item.id));
    const result = await window.suyanApi.deleteItems(itemIds, deleteImages);
    const ipcDoneAt = performance.now();

    if (!result.ok) {
      set({
        isBusy: false,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
      return;
    }

    const items = result.data.library.items;
    setLibrary(result.data.library, set, get);
    const setLibraryDoneAt = performance.now();

    // 先结束 busy 并提示成功，词库剪枝放到空闲时段，避免删除后滚动卡顿。
    set({
      isBusy: false,
      statusMessage: successStatus(`已删除 ${result.data.deletedCount} 条提示词。`),
    });

    logRendererStartupEvent("item-delete:timing", {
      deletedCount: result.data.deletedCount,
      ipcMs: Math.round(ipcDoneAt - startedAt),
      pruneDeferred: true,
      setLibraryMs: Math.round(setLibraryDoneAt - ipcDoneAt),
      totalMs: Math.round(performance.now() - startedAt),
    });

    scheduleIdleWork(() => {
      void prunePromptLexiconsAfterDelete(items, deletedItemsSnapshot, result.data.deletedCount, set, get);
    });
  },

  deleteSelected: async (deleteImages) => {
    const selectedItemId = get().selectedItemId;

    if (!selectedItemId) {
      return;
    }

    await get().deleteItems([selectedItemId], deleteImages);
  },

  copyImage: async (imageFileName) => {
    const result = await window.suyanApi.copyImage(imageFileName);

    set({
      statusMessage: result.ok ? successStatus("已复制图片。") : errorStatus(result.error.code, result.error.message),
    });
  },

  exportImage: async (imageFileName) => {
    set({ statusMessage: null });
    const result = await window.suyanApi.exportImage(imageFileName);

    set({
      statusMessage: result.ok
        ? result.data.canceled
          ? infoStatus("已取消导出。")
          : successStatus("已导出文件。")
        : errorStatus(result.error.code, result.error.message),
    });
  },

  copyText: async (text, successText) => {
    const result = await window.suyanApi.writeClipboardText(text);

    set({
      statusMessage: result.ok ? successStatus(successText) : errorStatus(result.error.code, result.error.message),
    });
  },

  deduplicateScan: async () => {
    set({ isBusy: true, statusMessage: progressStatus("正在扫描重复文件...") });

    const result = await window.suyanApi.deduplicateScan();

    set({ isBusy: false });

    if (result.ok) {
      set({ statusMessage: null });
      return result.data;
    }

    set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    return null;
  },

  compressImages: async (options, onProgress) => {
    set({ isBusy: true, statusMessage: progressStatus("正在压缩图像...") });

    const unsubscribe = onProgress
      ? window.suyanApi.onCompressImagesProgress(onProgress)
      : null;

    try {
      const result = await window.suyanApi.compressImages(options);

      if (result.ok) {
        const libraryResult = await window.suyanApi.readLibrary();
        if (libraryResult.ok) {
          setLibrary(libraryResult.data, set, get);
        }

        const savedBytes = Math.max(0, result.data.totalOriginalBytes - result.data.totalCompressedBytes);
        const externalText =
          result.data.skippedExternalCount > 0
            ? `，${result.data.skippedExternalCount} 项外链素材保持只读`
            : "";
        set({
          statusMessage: successStatus(
            `已压缩 ${result.data.processedCount} 张图片，节省 ${formatSavedBytes(savedBytes)}${externalText}。`,
          ),
        });
        return result.data;
      }

      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      return null;
    } finally {
      if (unsubscribe) {
        unsubscribe();
      }
      set({ isBusy: false });
    }
  },

  compressVideos: async (options, onProgress) => {
    if (!(await get().checkVideoRuntime())) {
      set({
        statusMessage: errorStatus("FFMPEG_BINARY_NOT_FOUND", "需要视频依赖（FFmpeg）才能压缩视频，请先安装。"),
      });
      return null;
    }

    set({ isBusy: true, statusMessage: progressStatus("正在压缩视频...") });

    const unsubscribe = onProgress
      ? window.suyanApi.onCompressVideosProgress(onProgress)
      : null;

    try {
      const result = await window.suyanApi.compressVideos(options);

      if (result.ok) {
        const libraryResult = await window.suyanApi.readLibrary();
        if (libraryResult.ok) {
          setLibrary(libraryResult.data, set, get);
        }

        const savedBytes = Math.max(0, result.data.totalOriginalBytes - result.data.totalCompressedBytes);
        const externalText =
          result.data.skippedExternalCount > 0
            ? `，${result.data.skippedExternalCount} 项外链素材保持只读`
            : "";
        set({
          statusMessage: successStatus(
            `已压缩 ${result.data.processedCount} 个视频，节省 ${formatSavedBytes(savedBytes)}${externalText}。`,
          ),
        });
        return result.data;
      }

      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      return null;
    } finally {
      if (unsubscribe) {
        unsubscribe();
      }
      set({ isBusy: false });
    }
  },

  cancelCompress: async () => {
    await window.suyanApi.cancelCompress();
    set({ statusMessage: infoStatus("已取消压缩。") });
  },

  setModuleState: async (patch) => {
    const currentModuleState = get().moduleState;
    const mergedPatch: BuiltinModuleStatePatch = {};
    for (const definition of builtinModuleDefinitions) {
      const current = currentModuleState[definition.id];
      const patchEntry = patch[definition.id];
      mergedPatch[definition.id] = {
        installed: patchEntry?.installed ?? current.installed,
        enabled: patchEntry?.enabled ?? current.enabled,
      };
    }
    const nextModuleState = resolveBuiltinModuleState(mergedPatch);

    set({ moduleState: nextModuleState, statusMessage: null });

    const result = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { moduleState: nextModuleState }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({
      moduleState: currentModuleState,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  removeModule: async (moduleId) => {
    const definition = getBuiltinModuleDefinition(moduleId);
    if (definition.required) {
      set({ statusMessage: failureStatus("必需模块不可删除。") });
      return false;
    }

    set({ isBusy: true, statusMessage: progressStatus(`正在删除「${definition.label}」...`) });
    try {
      if (moduleId === "video-runtime") {
        const removeResult = await window.suyanApi.removeFfmpegComponent();
        if (!removeResult.ok) {
          set({ statusMessage: errorStatus(removeResult.error.code, removeResult.error.message) });
          return false;
        }

        // 删除应用受管组件后重新检查。系统 PATH 中已有的 FFmpeg 仍可用，但保持用户选择的停用状态。
        const availability = await window.suyanApi.checkModuleInstalled("video-runtime").catch(() => null);
        const isSystemRuntimeAvailable = availability?.ok ? availability.data.installed : false;
        const saved = await get().setModuleState({
          "video-runtime": { installed: isSystemRuntimeAvailable, enabled: false },
        });
        if (!saved) {
          return false;
        }

        videoRuntimeProbeCache = { installed: isSystemRuntimeAvailable, checkedAt: Date.now() };
        set({
          statusMessage: successStatus(
            isSystemRuntimeAvailable
              ? removeResult.data.removed
                ? "已移除应用下载的 FFmpeg；系统 FFmpeg 未受影响，视频依赖已停用。"
                : "未发现应用下载的 FFmpeg；系统 FFmpeg 未受影响，视频依赖已停用。"
              : "已删除视频依赖（FFmpeg）。",
          ),
        });
        return true;
      }

      if (moduleId === "nsfw-runtime") {
        const removeResult = await window.suyanApi.removeNsfwModule();
        if (!removeResult.ok) {
          set({ statusMessage: errorStatus(removeResult.error.code, removeResult.error.message) });
          return false;
        }

        const saved = await get().setModuleState({
          "nsfw-runtime": { installed: false, enabled: false },
        });
        if (saved) {
          set({ statusMessage: successStatus("已删除本地 NSFW 识别模块。") });
        }
        return saved;
      }

      const saved = await get().setModuleState({
        [moduleId]: { installed: false, enabled: false },
      });
      if (saved) {
        set({ statusMessage: successStatus(`已移除「${definition.label}」，可随时恢复。`) });
      }
      return saved;
    } finally {
      set({ isBusy: false });
    }
  },

  restoreModule: async (moduleId) => {
    const definition = getBuiltinModuleDefinition(moduleId);
    if (definition.required) {
      set({ statusMessage: failureStatus("必需模块始终可用，无需恢复。") });
      return false;
    }
    if (moduleId === "video-runtime") {
      set({ statusMessage: infoStatus("请使用视频依赖卡片中的下载或离线导入功能进行安装。") });
      return false;
    }
    set({ isBusy: true, statusMessage: progressStatus(`正在恢复「${definition.label}」...`) });
    try {
      if (definition.category === "runtime") {
        const availability = await window.suyanApi.checkModuleInstalled(moduleId).catch(() => null);
        const installed = availability?.ok === true && availability.data.installed;
        if (!installed) {
          set({
            statusMessage: failureStatus(`未检测到「${definition.label}」的内置依赖，无法恢复。`),
          });
          return false;
        }
      }

      const saved = await get().setModuleState({
        [moduleId]: { installed: true, enabled: true },
      });
      if (saved) {
        set({
          statusMessage: successStatus(
            definition.category === "runtime"
              ? `已校验并启用「${definition.label}」。`
              : `已恢复并启用「${definition.label}」。`,
          ),
        });
      }
      return saved;
    } finally {
      set({ isBusy: false });
    }
  },

  installModule: async (moduleId, options) => {
    set({ isBusy: true, statusMessage: progressStatus(`正在安装模块...`) });

    try {
      const result =
        moduleId === "video-runtime"
          ? options?.source === "local"
            ? await window.suyanApi.installFfmpegComponentFromLocal()
            : await window.suyanApi.installFfmpegComponentFromDownload()
          : moduleId === "nsfw-runtime"
            ? options?.source === "local"
              ? await window.suyanApi.installModuleFromLocal(moduleId)
              : await window.suyanApi.installModuleFromDownload(moduleId)
          : await window.suyanApi.installModuleFromLocal(moduleId);

      if (!result.ok) {
        set({
          statusMessage: errorStatus(result.error.code, result.error.message),
        });
        return false;
      }

      if ("canceled" in result.data && result.data.canceled) {
        set({ statusMessage: infoStatus("已取消安装。") });
        return false;
      }

      if (!result.data.installed) {
        set({
          statusMessage: errorStatus("MODULE_INSTALL_FAILED", "模块安装失败，依赖校验未通过。"),
        });
        return false;
      }

      const patch: BuiltinModuleStatePatch = {
        [moduleId]: { installed: true, enabled: true },
      };

      const runtimeDeps = getModuleRuntimeDependencies(moduleId);
      for (const depId of runtimeDeps) {
        patch[depId] = { installed: true, enabled: true };
      }

      const saved = await get().setModuleState(patch);
      if (!saved) {
        return false;
      }
      if (moduleId === "video-runtime") {
        videoRuntimeProbeCache = { installed: true, checkedAt: Date.now() };
      }
      set({
        statusMessage: successStatus(`模块安装成功，已自动校验并启用。`),
      });
      return true;
    } finally {
      set({ isBusy: false });
    }
  },

  checkVideoRuntime: async (options?: { force?: boolean }) => {
    const now = Date.now();
    if (
      !options?.force &&
      videoRuntimeProbeCache &&
      now - videoRuntimeProbeCache.checkedAt < VIDEO_RUNTIME_PROBE_TTL_MS
    ) {
      return videoRuntimeProbeCache.installed;
    }

    const result = await window.suyanApi.checkModuleInstalled("video-runtime").catch(() => null);
    // 探测失败时不改写持久化状态（避免瞬时 IPC 故障把已装用户误标为未装）。
    if (!result?.ok) {
      return get().moduleState["video-runtime"].installed;
    }

    const installed = result.data.installed;
    const current = get().moduleState["video-runtime"];
    // 已装时保留用户 enabled 偏好；二进制消失强制关闭；新装上默认启用。
    const next = resolveVideoRuntimeStateAfterProbe(current, installed);
    if (current.installed !== next.installed || current.enabled !== next.enabled) {
      const saved = await get().setModuleState({ "video-runtime": next });
      if (!saved) {
        const persisted = get().moduleState["video-runtime"];
        videoRuntimeProbeCache = { installed: persisted.installed, checkedAt: Date.now() };
        return persisted.installed;
      }
    }
    videoRuntimeProbeCache = { installed: next.installed, checkedAt: Date.now() };
    return next.installed;
  },

  checkNsfwRuntime: async () => {
    const result = await window.suyanApi.checkModuleInstalled("nsfw-runtime").catch(() => null);
    if (!result?.ok) {
      return get().moduleState["nsfw-runtime"].installed;
    }

    const installed = result.data.installed;
    const current = get().moduleState["nsfw-runtime"];
    const next = installed
      ? { installed: true, enabled: current.installed ? current.enabled : true }
      : { installed: false, enabled: false };

    if (current.installed !== next.installed || current.enabled !== next.enabled) {
      const saved = await get().setModuleState({ "nsfw-runtime": next });
      if (!saved) {
        return get().moduleState["nsfw-runtime"].installed;
      }
    }

    return next.installed;
  },

}));

function buildLibraryViewSettings(
  state: LibraryState,
  patch: Partial<LibraryViewSettings> = {},
): LibraryViewSettings {
  return {
    language: state.language,
    // referenceImageDataUrl is a session-only base64 blob; strip it before
    // persisting so app settings stay small. promptOrigin is session-only too:
    // a stale origin from a previous run must not silently pull new generations
    // into an old prompt group.
    canvasDraft: {
      ...state.canvasDraft,
      // referenceImageDataUrl is a session-only base64 blob; strip it before
      // persisting so app settings stay small. promptOrigin is session-only too:
      // a stale origin from a previous run must not silently pull new generations
      // into an old prompt group.
      referenceImages: state.canvasDraft.referenceImages.map((image) => ({ ...image, dataUrl: "" })),
      promptOrigin: null,
    },
    tagOrder: state.tagOrder,
    likedImageIds: state.likedImageIds,
    starredRecommendations: state.starredRecommendations,
    webAssistantCustomUrls: state.webAssistantCustomUrls,
    webAssistantLastPlatform: state.webAssistantLastPlatform,
    webAssistantLastCustomUrl: state.webAssistantLastCustomUrl,
    generationModelOrder: state.generationModelOrder,
    hiddenGenerationModels: state.hiddenGenerationModels,
    themeMode: state.themeMode,
    themePreset: state.themePreset,
    themeAccent: state.themeAccent,
    themeCustomAccent: state.themeCustomAccent,
    themeOpacity: state.themeOpacity,
    themeNavigationOpacity: state.themeNavigationOpacity,
    themeBackgroundOpacity: state.themeBackgroundOpacity,
    themeWorkspaceOpacity: state.themeWorkspaceOpacity,
    themeAccentOpacity: state.themeAccentOpacity,
    themeCustomAccents: state.themeCustomAccents,
    themeAccentMemory: state.themeAccentMemory,
    customTheme: state.customTheme,
    canvasBackground: state.canvasBackground,
    workspaceWidthPercent: normalizeWorkspaceWidthPercent(state.workspaceWidthPercent),
    sidebarEntryVisibility: normalizeSidebarEntryVisibility(state.sidebarEntryVisibility),
    featureGuideCompleted: state.featureGuideCompleted,
    autoNsfwGrading: state.autoNsfwGrading,
    blurNsfwImages: state.blurNsfwImages,
    nsfwGradingSpeed: state.nsfwGradingSpeed,
    nsfwDetectionMode: state.nsfwDetectionMode,
    masonryTileWidth: normalizeMasonryTileWidth(state.masonryTileWidth),
    materialBrowserCollectionMode: state.materialBrowserCollectionMode,
    materialBrowserGalleryMode: state.materialBrowserGalleryMode,
    materialBrowserSortMode: state.materialBrowserSortMode,
    materialBrowserSortDirection: state.materialBrowserSortDirection,
    materialBrowserRandomSeed: Math.max(0, Math.trunc(state.materialBrowserRandomSeed)),
    materialBrowserScrollTop: normalizeMaterialBrowserScrollTop(state.materialBrowserScrollTop),
    networkMaterialImportMode: state.networkMaterialImportMode,
    promptLexicons: state.promptLexicons,
    categoryWorkspace: {
      taxonomy: state.categoryTaxonomy,
      inbox: state.categoryInbox,
      candidates: state.categoryCandidates,
      learningEvents: state.categoryLearningEvents,
    },
    moduleState: state.moduleState,
    promptViewSettings: patch.promptViewSettings ?? state.promptViewSettings,
    ...patch,
  };
}

function syncLibraryViewSettings(
  set: (partial: Partial<LibraryState>) => void,
  settings: LibraryViewSettings,
  extra: Partial<LibraryState> = {},
): void {
  applyThemeModeToRoot(settings.themeMode, document.documentElement, {
    themePreset: settings.themePreset,
    themeAccent: settings.themeAccent,
    themeCustomAccent: settings.themeCustomAccent,
    themeCustomAccents: settings.themeCustomAccents,
    themeOpacity: settings.themeOpacity,
    themeNavigationOpacity: settings.themeNavigationOpacity,
    themeBackgroundOpacity: settings.themeBackgroundOpacity,
    themeWorkspaceOpacity: settings.themeWorkspaceOpacity,
    themeAccentOpacity: settings.themeAccentOpacity,
    customTheme: settings.customTheme,
  });
  const workspace = normalizeCategoryWorkspace(settings.categoryWorkspace, settings.promptLexicons);
  set({
    language: settings.language ?? defaultAppLanguage,
    canvasDraft: settings.canvasDraft,
    canvasBackground: normalizeCanvasBackground(settings.canvasBackground),
    tagOrder: settings.tagOrder,
    likedImageIds: settings.likedImageIds,
    starredRecommendations: settings.starredRecommendations,
    webAssistantCustomUrls: settings.webAssistantCustomUrls,
    webAssistantLastPlatform: settings.webAssistantLastPlatform ?? null,
    webAssistantLastCustomUrl: settings.webAssistantLastCustomUrl ?? null,
    generationModelOrder: settings.generationModelOrder,
    hiddenGenerationModels: settings.hiddenGenerationModels,
    themeMode: settings.themeMode,
    themePreset: settings.themePreset,
    themeAccent: settings.themeAccent,
    themeCustomAccent: settings.themeCustomAccent,
    themeOpacity: settings.themeOpacity,
    themeNavigationOpacity: settings.themeNavigationOpacity,
    themeBackgroundOpacity: settings.themeBackgroundOpacity,
    themeWorkspaceOpacity: settings.themeWorkspaceOpacity,
    themeAccentOpacity: settings.themeAccentOpacity,
    themeCustomAccents: settings.themeCustomAccents,
    themeAccentMemory: settings.themeAccentMemory,
    customTheme: settings.customTheme,
    workspaceWidthPercent: settings.workspaceWidthPercent,
    sidebarEntryVisibility: normalizeSidebarEntryVisibility(settings.sidebarEntryVisibility),
    featureGuideCompleted: settings.featureGuideCompleted ?? [],
    autoNsfwGrading: settings.autoNsfwGrading,
    blurNsfwImages: settings.blurNsfwImages,
    nsfwGradingSpeed: settings.nsfwGradingSpeed,
    nsfwDetectionMode: settings.nsfwDetectionMode,
    masonryTileWidth: settings.masonryTileWidth,
    materialBrowserCollectionMode: settings.materialBrowserCollectionMode,
    materialBrowserGalleryMode: settings.materialBrowserGalleryMode,
    materialBrowserSortMode: settings.materialBrowserSortMode,
    materialBrowserSortDirection: settings.materialBrowserSortDirection,
    materialBrowserRandomSeed: settings.materialBrowserRandomSeed,
    materialBrowserScrollTop: settings.materialBrowserScrollTop,
    networkMaterialImportMode: settings.networkMaterialImportMode,
    promptLexicons: settings.promptLexicons,
    promptViewSettings: settings.promptViewSettings,
    categoryTaxonomy: workspace.taxonomy,
    categoryInbox: workspace.inbox,
    categoryCandidates: workspace.candidates,
    categoryLearningEvents: workspace.learningEvents,
    moduleState: settings.moduleState,
    ...extra,
  });
}

function normalizeCategoryWorkspace(
  input: CategoryWorkspaceState | null | undefined,
  promptLexicons: PromptLexiconSettings | null | undefined,
): CategoryWorkspaceState {
  // Always re-seed the precise system photography tree, then merge custom lexicon nodes.
  const baseTaxonomy = ensureSystemCategoryTaxonomy(input?.taxonomy ?? null);
  const taxonomy = mergeLexiconCategoriesIntoTaxonomy(baseTaxonomy, promptLexicons?.categories ?? []);
  return {
    taxonomy,
    inbox: Array.isArray(input?.inbox) ? input.inbox : [],
    candidates: Array.isArray(input?.candidates) ? input.candidates : [],
    learningEvents: Array.isArray(input?.learningEvents) ? input.learningEvents : [],
  };
}

function waitForThemePaint(themeMode: ThemeMode): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        finishThemeModeSwitch(themeMode);
        resolve();
      }, 0);
    });
  });
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 10) / 10;
}

function normalizeMasonryTileWidth(input: number): number {
  return Math.min(maxMasonryTileWidth, Math.max(minMasonryTileWidth, Math.round(input)));
}

function normalizeMaterialBrowserRandomSeed(input: number): number {
  if (!Number.isFinite(input)) {
    return 0;
  }

  return Math.max(0, Math.trunc(input));
}

function normalizeMaterialBrowserScrollTop(input: number): number {
  if (!Number.isFinite(input)) {
    return 0;
  }

  return Math.max(0, Math.trunc(input));
}

function setLibrary(
  library: LibraryFile,
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
): void {
  const currentSelectedId = get().selectedItemId;
  const selectedStillExists = library.items.some((item) => item.id === currentSelectedId);
  const selectedItemId = selectedStillExists ? currentSelectedId : (library.items[0]?.id ?? null);

  const previousItems = get().items;
  const reconcileStart = performance.now();
  const stats = { reused: 0, changed: 0, added: 0 };
  const reconciledItems = reconcileItemsByIdentity(previousItems, library.items, stats);
  logRendererStartupEvent("set-library:reconcile", {
    durationMs: Math.round((performance.now() - reconcileStart) * 100) / 100,
    prevCount: previousItems.length,
    nextCount: library.items.length,
    reused: stats.reused,
    changed: stats.changed,
    added: stats.added,
    arrayReused: reconciledItems === previousItems,
  });

  set({ items: reconciledItems, selectedItemId });
}

async function syncPromptLexiconsFromLibrary(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  options: { silent?: boolean; targetItemIds?: readonly string[] } = {},
): Promise<void> {
  const items = get().items;
  const targetItems =
    options.targetItemIds && options.targetItemIds.length > 0
      ? items.filter((item) => options.targetItemIds!.includes(item.id))
      : items;

  if (targetItems.length === 0) {
    logRendererStartupEvent("lexicon-sync:merge", {
      durationMs: 0,
      itemCount: items.length,
      addedCount: 0,
      indexedPromptCount: 0,
      targetCount: 0,
      skipped: true,
    });
    return;
  }

  // 新导入条目可能已有 AI 标签；只有没有任何标签时，才跳过昂贵扫描。
  if (
    options.targetItemIds &&
    options.targetItemIds.length > 0 &&
    !targetItems.some((item) => Array.isArray(item.tags) && item.tags.some((tag) => tag.trim()))
  ) {
    logRendererStartupEvent("lexicon-sync:merge", {
      durationMs: 0,
      itemCount: items.length,
      addedCount: 0,
      indexedPromptCount: 0,
      targetCount: targetItems.length,
      skipped: true,
      reason: "no-tags",
    });
    return;
  }

  const { mergeLibraryPromptLexiconForItems } = await import("../utils/promptLexicons");
  const mergeStart = performance.now();
  const result = mergeLibraryPromptLexiconForItems(
    get().promptLexicons,
    items,
    targetItems,
    getKnownCategoriesFromItems(items),
  );
  logRendererStartupEvent("lexicon-sync:merge", {
    durationMs: Math.round((performance.now() - mergeStart) * 100) / 100,
    itemCount: items.length,
    addedCount: result.addedCount,
    indexedPromptCount: result.indexedPromptCount,
    targetCount: targetItems.length,
  });

  set({ promptLexicons: result.promptLexicons });

  if (result.addedCount === 0) {
    return;
  }

  const saveResult = await saveLibraryViewSettingsSerialized(
    buildLibraryViewSettings(get(), { promptLexicons: result.promptLexicons }),
  );

  if (saveResult.ok) {
    syncLibraryViewSettings(set, saveResult.data);
    return;
  }

  if (!options.silent) {
    set({ statusMessage: errorStatus(saveResult.error.code, saveResult.error.message) });
  }
}


function markRecentImportPins(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  previousItemIds: ReadonlySet<string>,
  preferredSelectedId?: string | null,
): void {
  // library.items 导入后是“新素材在前”，保持该顺序作为置顶顺序。
  const newlyImportedIds = get()
    .items.filter((item) => !previousItemIds.has(item.id))
    .map((item) => item.id);

  if (newlyImportedIds.length === 0) {
    return;
  }

  set({
    recentImportPinIds: newlyImportedIds,
    selectedItemId: preferredSelectedId ?? newlyImportedIds[0] ?? get().selectedItemId,
  });
}

function scheduleLexiconSyncAfterImport(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  previousItemIds: ReadonlySet<string>,
): void {
  const targetItemIds = get()
    .items.filter((item) => !previousItemIds.has(item.id))
    .map((item) => item.id);

  scheduleIdleWork(() => {
    void syncPromptLexiconsFromLibrary(set, get, {
      silent: true,
      targetItemIds,
    }).catch(() => undefined);
  });
}

function logRendererStartupEvent(event: string, details: Record<string, unknown> = {}): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
  }
}

async function prunePromptLexiconsAfterDelete(
  remainingItems: readonly LibraryItem[],
  deletedItems: readonly LibraryItem[],
  deletedCount: number,
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
): Promise<void> {
  const startedAt = performance.now();

  try {
    const {
      prunePromptLexiconsAfterItemDeletion,
    } = await import("../utils/promptLexicons");
    const pruneResult = prunePromptLexiconsAfterItemDeletion(
      get().promptLexicons,
      remainingItems,
      deletedItems,
      getKnownCategoriesFromItems(remainingItems),
    );
    const pruneDoneAt = performance.now();

    if (pruneResult.removedCount <= 0) {
      logRendererStartupEvent("item-delete:prune", {
        deletedCount,
        pruneMs: Math.round(pruneDoneAt - startedAt),
        pruneRemovedCount: 0,
        saved: false,
        skipped: pruneResult.skipped === true,
      });
      return;
    }

    set({ promptLexicons: pruneResult.promptLexicons });
    const saveResult = await saveLibraryViewSettingsSerialized(
      buildLibraryViewSettings(get(), { promptLexicons: pruneResult.promptLexicons }),
    );

    if (saveResult.ok) {
      syncLibraryViewSettings(set, saveResult.data, {
        statusMessage: successStatus(`已删除 ${deletedCount} 条提示词，并清理 ${pruneResult.removedCount} 条关联分析数据。`),
      });
    } else {
      set({
        statusMessage: errorStatus(
          "LEXICON_PRUNE_SAVE_FAILED",
          `提示词已删除，但关联分析数据保存失败：${getUiErrorMessage(saveResult.error.code, saveResult.error.message)}`,
        ),
      });
    }

    logRendererStartupEvent("item-delete:prune", {
      deletedCount,
      pruneMs: Math.round(pruneDoneAt - startedAt),
      pruneRemovedCount: pruneResult.removedCount,
      saved: saveResult.ok,
      totalMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    logRendererStartupEvent("item-delete:prune", {
      deletedCount,
      failed: true,
      message: error instanceof Error ? error.message : String(error),
      totalMs: Math.round(performance.now() - startedAt),
    });
  }
}

function scheduleIdleWork(work: () => void): void {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => work(), { timeout: 2500 });
    return;
  }

  window.setTimeout(work, 120);
}

function scheduleAutoNsfwGradingAfterImport(
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  previousItemIds: ReadonlySet<string>,
): void {
  if (!get().autoNsfwGrading) {
    return;
  }

  const importedItemIds = get().items
    .filter((item) => !previousItemIds.has(item.id) && Boolean(item.imageFileName))
    .map((item) => item.id);
  if (importedItemIds.length === 0) {
    return;
  }

  scheduleIdleWork(() => {
    void gradeImagesForNsfw(importedItemIds, set, get, { force: false, silent: true }).catch(() => undefined);
  });
}

function getKnownCategoriesFromItems(items: readonly LibraryItem[]): string[] {
  return uniqueTags(items.map((item) => item.category ?? "").filter(Boolean));
}

async function gradeImagesForNsfw(
  itemIds: readonly string[],
  set: (partial: Partial<LibraryState>) => void,
  get: () => LibraryState,
  options: { force: boolean; silent: boolean },
): Promise<void> {
  const uniqueItemIds = [...new Set(itemIds)].filter(Boolean);

  if (uniqueItemIds.length === 0) {
    return;
  }

  const detectionMode = get().nsfwDetectionMode;
  const localModuleEnabled =
    detectionMode !== "remote-only" && isBuiltinModuleEnabled("nsfw-runtime", get().moduleState);
  const safetyPreference = resolveAiActionPreference(get().aiSettings, "image-safety");
  const remoteAiReadiness =
    detectionMode === "local-only"
      ? null
      : resolveRemoteAiReadiness(
          get().aiSettings,
          "NSFW 分级",
          safetyPreference.profileId,
          safetyPreference.modelId,
          "vision",
        );

  if (detectionMode === "local-only" && !localModuleEnabled) {
    if (!options.silent) {
      set({ statusMessage: failureStatus("本地 NSFW 识别模块未安装或已停用，请先在模块管理中安装。") });
    }
    return;
  }

  if (!localModuleEnabled && !remoteAiReadiness?.ready) {
    if (!options.silent) {
      set({ statusMessage: remoteAiReadiness?.statusMessage ?? failureStatus("没有可用的 NSFW 分级方式。") });
    }
    return;
  }

  const targetIdSet = new Set(uniqueItemIds);
  const initialItems = get().items;
  const processableItems = initialItems.filter((item) => targetIdSet.has(item.id) && Boolean(item.imageFileName));
  const targets = processableItems.filter((item) => shouldGradeNsfwItem(item, { force: options.force }));
  const skippedCount = processableItems.length - targets.length;

  if (targets.length === 0) {
    if (!options.silent) {
      set({ statusMessage: infoStatus("没有需要补充分级的图片。") });
    }
    return;
  }

  set({
    isBusy: true,
    statusMessage: options.silent
      ? get().statusMessage
      : progressStatus(`正在进行 NSFW 分级（0/${targets.length}）...`),
  });

  let completedCount = 0;
  let failedCount = 0;
  let updatedCount = 0;
  const concurrency = getNsfwGradingConcurrency(get().nsfwGradingSpeed);
  const batchSize = Math.max(4, concurrency * 2);

  for (let index = 0; index < targets.length; index += batchSize) {
    const batch = targets.slice(index, index + batchSize);
    const batchResults = await mapWithConcurrency(batch, concurrency, (item) =>
      analyzeNsfwItem(
        item,
        get().aiSettings,
        detectionMode,
        localModuleEnabled,
        remoteAiReadiness?.ready === true,
      ),
    );
    const ratings = new Map<string, NsfwRating>();

    for (const result of batchResults) {
      if (result) {
        ratings.set(result.itemId, result.rating);
      }
    }

    completedCount += batch.length;
    failedCount += batch.length - ratings.size;

    if (ratings.size > 0) {
      const checkedAt = new Date().toISOString();
      const currentItems = get().items;
      const nextItems = currentItems.map((item) => {
        const rating = ratings.get(item.id);

        if (!rating) {
          return item;
        }

        return {
          ...item,
          nsfwRating: rating,
          nsfwCheckedAt: checkedAt,
          updatedAt: checkedAt,
        };
      });
      const saveResult = await window.suyanApi.saveLibrary(buildLibraryFile(nextItems));

      if (!saveResult.ok) {
        set({
          isBusy: false,
          statusMessage: errorStatus(saveResult.error.code, saveResult.error.message),
        });
        return;
      }

      updatedCount += ratings.size;
      setLibrary(saveResult.data, set, get);
    }

    if (!options.silent) {
      set({
        statusMessage: progressStatus(
          `正在进行 NSFW 分级（${completedCount}/${targets.length}），已更新 ${updatedCount} 张。`,
        ),
      });
    }
  }

  set({
    isBusy: false,
    statusMessage: options.silent
      ? get().statusMessage
      : getNsfwGradingResultStatus({
          failedCount,
          isForced: options.force,
          skippedCount,
          updatedCount,
        }),
  });
}

async function analyzeNsfwItem(
  item: LibraryItem,
  aiSettings: PublicAiProviderSettings,
  detectionMode: NsfwDetectionMode,
  localModuleEnabled: boolean,
  remoteAiReady: boolean,
): Promise<{ itemId: string; rating: NsfwRating } | null> {
  try {
    if (localModuleEnabled) {
      const localResult = await window.suyanApi.classifyLocalNsfw(item.id);
      if (localResult.ok) {
        return {
          itemId: item.id,
          rating: localResult.data.rating,
        };
      }
    }

    if (detectionMode === "local-only" || !remoteAiReady) {
      return null;
    }

    const payload: AiAnalyzePromptPayload = applyAiActionPreference(aiSettings, "image-safety", {
      target: "image-safety",
      title: item.title,
      imageFileName: item.imageFileName,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      tags: item.tags,
      category: item.category ?? "",
    });
    const result = await window.suyanApi.analyzePromptWithAi(payload);

    if (!result.ok) {
      return null;
    }

    return {
      itemId: item.id,
      rating: resolveNsfwRatingFromRemoteAnalysisV2(result.data.analysis),
    };
  } catch {
    return null;
  }
}

function applyAiActionPreference<T extends object>(
  settings: PublicAiProviderSettings,
  action: AiFeatureAction,
  payload: T,
): T & { apiModelId?: string; apiProfileId?: string; customInstructions?: string } {
  const preference = resolveAiActionPreference(settings, action);
  const currentPayload = payload as { apiModelId?: string; apiProfileId?: string; customInstructions?: string };

  return {
    ...payload,
    apiProfileId: currentPayload.apiProfileId || preference.profileId,
    apiModelId: currentPayload.apiModelId || preference.modelId,
    customInstructions: Object.prototype.hasOwnProperty.call(currentPayload, "customInstructions")
      ? currentPayload.customInstructions
      : preference.customInstructions,
  };
}

function matchesAiModelSelection(
  preference: AiActionPreference | undefined,
  selection: AiModelSelection,
): boolean {
  if (!preference || preference.modelId !== selection.modelId) {
    return false;
  }

  return preference.profileId === selection.profileId;
}

function resolveAiActionPreference(
  settings: PublicAiProviderSettings,
  action: AiFeatureAction,
): AiActionPreference {
  const preference = settings.actionPreferences[action] ?? {};
  const profile = preference.profileId
    ? settings.profiles.find((item) => item.id === preference.profileId)
    : (settings.profiles.find((item) => item.id === settings.activeProfileId) ?? settings.profiles[0]);
  const model = profile
    ? profile.models.find((item) => item.id === preference.modelId) ??
      profile.models.find((item) => item.id === profile.model) ??
      profile.models[0]
    : null;

  return {
    source: preference.source,
    customInstructions: buildAiActionInstructions(action, preference),
    profileId: profile?.id,
    modelId: model?.id,
  };
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

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

function getNsfwGradingResultStatus({
  failedCount,
  isForced,
  skippedCount,
  updatedCount,
}: {
  failedCount: number;
  isForced: boolean;
  skippedCount: number;
  updatedCount: number;
}): StatusMessage {
  if (updatedCount === 0) {
    return failureStatus("NSFW 分级暂不可用，未更新图片。");
  }

  const skippedText = skippedCount > 0 ? `，跳过 ${skippedCount} 张已有结果` : "";
  const failedText = failedCount > 0 ? `，${failedCount} 张暂未成功` : "";
  const actionText = isForced ? "重新校正" : "补充";

  return successStatus(`已${actionText} ${updatedCount} 张图片的 NSFW 分级${skippedText}${failedText}。`);
}

function withImportOperationTimeout<T>(operation: Promise<IpcResult<T>>): Promise<IpcResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = new Promise<IpcResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        ok: false,
        error: {
          code: "IMPORT_TIMEOUT",
          message: "导入素材超时，请检查网络或代理后重试。",
        },
      });
    }, importOperationTimeoutMs);
  });

  return Promise.race([operation, timeoutResult]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function getAiAnalyzeSuccessText(target: AiAnalyzePromptPayload["target"]): string {
  if (target === "prompt-category") {
    return "已完成提示词分类识别。";
  }

  if (target === "prompt-tags") {
    return "已完成提示词标签识别。";
  }

  if (target === "image-category") {
    return "已完成图片分类识别。";
  }

  if (target === "image-tags") {
    return "已完成图片标签识别。";
  }

  if (target === "image-safety") {
    return "已完成 NSFW 分级。";
  }

  if (target === "prompt-options") {
    return "已生成 AI 词条。";
  }

  return "已完成提示词参数分析。";
}

function getAiAnalyzeProgressText(target: AiAnalyzePromptPayload["target"]): string {
  if (target === "prompt-category") {
    return "正在识别提示词分类...";
  }

  if (target === "prompt-tags") {
    return "正在识别提示词标签...";
  }

  if (target === "image-category") {
    return "正在识别图片分类...";
  }

  if (target === "image-tags") {
    return "正在识别图片标签...";
  }

  if (target === "image-safety") {
    return "正在进行 NSFW 分级...";
  }

  if (target === "prompt-options") {
    return "正在生成 AI 词条...";
  }

  return "正在进行提示词参数分析...";
}

function getAiActionLabel(target: AiAnalyzePromptPayload["target"]): string {
  if (target === "prompt-category") {
    return "提示词分类识别";
  }

  if (target === "prompt-tags") {
    return "提示词标签识别";
  }

  if (target === "image-category") {
    return "图片分类识别";
  }

  if (target === "image-tags") {
    return "图片标签识别";
  }

  if (target === "image-safety") {
    return "NSFW 分级";
  }

  if (target === "prompt-options") {
    return "AI 词条扩写";
  }

  return "提示词参数分析";
}

/**
 * 分类 / 标签 / 参数 / 词条扩写不得携带负向提示词。
 *
 * 负向词描述「要避免的内容」，进入分析后会被反向当成画面事实：写了「不要食物」
 * 反而判成食品摄影，「避免模糊」变成画质标签。主进程侧也不会再拼接负向文本
 * （见 remoteAiClient.negativePromptExclusionNotice），这里再拦一道，
 * 让负向内容根本不跨进程传输。
 */
function withoutNegativePromptForAnalysis(payload: AiAnalyzePromptPayload): AiAnalyzePromptPayload {
  if (!payload.negativePrompt) {
    return payload;
  }

  return { ...payload, negativePrompt: "" };
}

function getAiAnalyzeCapability(target: AiAnalyzePromptPayload["target"]): AiProviderModelCapability {
  return target === "image-category" || target === "image-tags" || target === "image-safety" ? "vision" : "text";
}

function getImageImportForItemStatus(result: {
  importedCount: number;
  mode: "added" | "replaced" | "canceled";
}): StatusMessage {
  if (result.mode === "canceled" || result.importedCount === 0) {
    return infoStatus("未选择素材。");
  }

  if (result.mode === "replaced") {
    const addedCount = result.importedCount - 1;

    if (addedCount > 0) {
      return successStatus(`已替换默认素材，并新增 ${addedCount} 个素材。`);
    }

    return successStatus("已替换默认素材。");
  }

  return successStatus(result.importedCount > 1 ? `已新增 ${result.importedCount} 个素材。` : "已新增 1 个素材。");
}

function getMediaImportStatus(importedCount: number): StatusMessage {
  return successStatus(
    importedCount > 1
      ? `已导入 ${importedCount} 个素材。`
      : "已导入 1 个素材。",
  );
}

/** Drag-drop / buffer import: report per-image prompt extraction and grouping. */
function getBufferedMediaImportStatus(result: {
  importedCount: number;
  importedPromptCount?: number;
  importedImageCount?: number;
  importGroups?: Array<{
    title: string;
    promptPreview: string;
    imageCount: number;
    hasPromptContent: boolean;
  }>;
}): StatusMessage {
  const imageCount = result.importedImageCount ?? result.importedCount;
  const groupCount = result.importedPromptCount ?? result.importGroups?.length ?? imageCount;
  const groups = result.importGroups ?? [];

  if (imageCount <= 0) {
    return infoStatus("没有可导入的图片。");
  }

  if (imageCount === 1) {
    const only = groups[0];
    if (only?.hasPromptContent) {
      return successStatus(`已导入 1 张图并解析提示词：${truncateImportStatusText(only.promptPreview, 48)}`);
    }
    return successStatus("已导入 1 张图（未检测到嵌入提示词，已创建空白卡片）。");
  }

  const withPrompt = groups.filter((group) => group.hasPromptContent).length;
  const blankGroups = groups.length - withPrompt;
  const detailParts = groups.slice(0, 3).map((group) => {
    const label = group.hasPromptContent
      ? truncateImportStatusText(group.title || group.promptPreview, 28)
      : "空白提示词";
    return `「${label}」×${group.imageCount}`;
  });
  const more = groups.length > 3 ? ` 等 ${groups.length} 组` : "";

  const summary =
    groupCount === 1
      ? `已导入 ${imageCount} 张图，归入 1 个提示词组`
      : `已导入 ${imageCount} 张图，按提示词内容分成 ${groupCount} 组`;
  const stats =
    withPrompt > 0 || blankGroups > 0
      ? `（含提示词 ${withPrompt} 组${blankGroups > 0 ? `，空白 ${blankGroups} 组` : ""}）`
      : "";
  const detail = detailParts.length > 0 ? `：${detailParts.join("、")}${more}` : "";

  return successStatus(`${summary}${stats}${detail}。`);
}

function truncateImportStatusText(value: string, maxLength: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getClipboardImportStatus(result: {
  importedCount: number;
  importedPromptCount?: number;
  importedImageCount?: number;
  skippedDuplicateCount?: number;
}): StatusMessage {
  const importedPromptCount = result.importedPromptCount ?? result.importedCount;
  const importedImageCount = result.importedImageCount ?? result.importedCount;
  const skippedDuplicateCount = result.skippedDuplicateCount ?? 0;

  if (importedPromptCount > 0) {
    const imageText = importedImageCount > 0 ? `，包含 ${importedImageCount} 张效果图` : "";
    const skippedText = skippedDuplicateCount > 0 ? `，跳过 ${skippedDuplicateCount} 组重复提示词` : "";

    return successStatus(`已从剪切板导入 ${importedPromptCount} 组提示词${imageText}${skippedText}。`);
  }

  if (skippedDuplicateCount > 0) {
    return infoStatus(`没有新增提示词，已跳过 ${skippedDuplicateCount} 组重复提示词。`);
  }

  return infoStatus("未能导入提示词，请确认链接可访问后重试。");
}

function getWordDocumentImportStatus(result: {
  canceled: boolean;
  documentCount: number;
  importedCount: number;
  skippedImageCount: number;
}): StatusMessage {
  if (result.canceled) {
    return infoStatus("已取消导入。");
  }

  if (result.importedCount === 0) {
    return infoStatus("Word 文档中没有可导入的图片与提示词。");
  }

  const skippedText = result.skippedImageCount > 0 ? `，跳过 ${result.skippedImageCount} 张暂不支持的图片` : "";
  const documentText = result.documentCount > 1 ? `${result.documentCount} 个 Word 文档，` : "";

  return successStatus(`已从 ${documentText}导入 ${result.importedCount} 条素材${skippedText}。`);
}

type RemoteAiReadiness =
  | { ready: true; statusMessage?: undefined }
  | { ready: false; statusMessage: StatusMessage };

function resolveRemoteAiReadiness(
  settings: PublicAiProviderSettings,
  actionLabel: string,
  profileId?: string,
  modelId?: string,
  requiredCapability?: AiProviderModelCapability,
): RemoteAiReadiness {
  const profile = resolvePublicAiProviderProfile(settings, profileId);
  const model = resolvePublicAiProviderModel(profile, modelId);

  if (!profile) {
    return {
      ready: false,
      statusMessage: failureStatus(`${actionLabel}失败：还没有 API 配置，请先在模型配置中添加接口地址、模型和 API Key。`),
    };
  }

  if (!profile.enabled) {
    return {
      ready: false,
      statusMessage: failureStatus(`${actionLabel}失败：当前 API 未启用，请在模型配置中启用后重试。`),
    };
  }

  if (!profile.baseUrl.trim()) {
    return {
      ready: false,
      statusMessage: failureStatus(`${actionLabel}失败：当前 API 缺少接口地址，请在模型配置中填写 Base URL。`),
    };
  }

  if (!profile.hasApiKey) {
    return {
      ready: false,
      statusMessage: failureStatus(`${actionLabel}失败：当前 API 缺少 API Key，请在模型配置中填写后重试。`),
    };
  }

  if (!model) {
    return {
      ready: false,
      statusMessage: failureStatus(`${actionLabel}失败：当前 API 没有可用模型，请在模型配置中添加或查询模型。`),
    };
  }

  if (requiredCapability && !model.capabilities.includes(requiredCapability)) {
    return {
      ready: false,
      statusMessage: failureStatus(
        `${actionLabel}失败：当前模型不支持${requiredCapability === "vision" ? "图片理解" : requiredCapability === "image-generation" ? "图像生成" : "文本生成"}，请在模型配置中选择合适模型。`,
      ),
    };
  }

  return { ready: true };
}

function isRemoteAiReady(settings: PublicAiProviderSettings, profileId?: string, modelId?: string): boolean {
  return resolveRemoteAiReadiness(settings, "AI 功能", profileId, modelId).ready;
}

function resolvePublicAiProviderProfile(
  settings: PublicAiProviderSettings,
  profileId?: string,
): PublicAiProviderProfile | null {
  if (profileId) {
    const profile = settings.profiles.find((item) => item.id === profileId);

    if (profile) {
      return profile;
    }
  }

  return (
    settings.profiles.find((profile) => profile.id === settings.activeProfileId) ??
    settings.profiles[0] ??
    null
  );
}

function resolvePublicAiProviderModel(
  profile: PublicAiProviderProfile | null,
  modelId?: string,
): AiProviderModelSettings | null {
  if (!profile) {
    return null;
  }

  if (modelId) {
    const model = profile.models.find((item) => item.id === modelId);

    if (model) {
      return model;
    }
  }

  return profile.models.find((model) => model.id === profile.model) ?? profile.models[0] ?? null;
}
