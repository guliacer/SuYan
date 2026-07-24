import { create } from "zustand";
import type {
  CompressProgress,
  CompressResult,
  DeduplicateResult,
  DownloadRemoteMaterialData,
  ImageCompressOptions,
  ImportClipboardImageForItemData,
  ImportImageBufferInput,
  ImportImagesData,
  IpcResult,
  VideoCompressOptions,
} from "../../../types/suyanApi";
import type {
  AiActionPreference,
  AiAnalyzePromptPayload,
  AiFeatureAction,
  AiProviderModelCapability,
  AiProviderModelSettings,
  AiOptimizePromptPayload,
  AiReverseImagePromptPayload,
  AiTranslatePromptData,
  AiTranslatePromptPayload,
  PublicAiProviderProfile,
  PublicAiProviderSettings,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import { buildAiActionInstructions } from "../types/ai";
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
  NsfwRating,
  PromptLexiconEntry,
  PromptLexiconKind,
  PromptLexiconSettings,
  ThemeMode,
} from "../types/library";
import type { ProxyDetectionData, ProxySettings } from "../types/proxy";
import { defaultProxySettings } from "../types/proxy";
import { buildLibraryFile, uniqueTags } from "../utils/buildLibraryFile";
import {
  defaultNsfwGradingSpeed,
  getNsfwGradingConcurrency,
} from "../utils/nsfwGradingSpeed";
import { analyzePromptText, buildAiPromptOptionAnalysis, normalizeConcretePromptTags } from "../utils/promptAnalysis";
import {
  buildPromptAnalysisFromRemote,
  type PromptAnalysisRunResult,
} from "../utils/remotePromptAnalysis";
import { resolvePromptGroupPatchItemIds } from "../utils/promptImageGroups";
import {
  resolveNsfwRatingFromRemoteAnalysis,
  shouldGradeNsfwItem,
} from "../utils/nsfwRating";
import { applyTagConfigurationToItems, type TagConfigurationDraft } from "../utils/tagSettings";
import { getUiErrorMessage } from "../utils/uiMessages";
import { reconcileItemsByIdentity } from "../utils/libraryItemIdentity";
import { applyThemeModeToRoot, finishThemeModeSwitch } from "../utils/themeMode";
import { isPendingStatusFeedbackText, type StatusFeedbackMessage } from "../utils/statusFeedback";
import {
  builtinModuleDefinitions,
  hasBuiltinModuleCapability,
  isBuiltinModuleInstalled,
  resolveBuiltinModuleState,
  getModuleRuntimeDependencies,
  type BuiltinModuleId,
  type BuiltinModuleState,
  type BuiltinModuleStatePatch,
} from "../utils/moduleRegistry";

type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
  autoDismissMs: number | null;
};

type SaveItemOptions = {
  background?: boolean;
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
const statusToastAutoDismissMs = 1_800;

const inFlightRemoteMaterialDownloads = new Set<string>();

type LibraryState = {
  items: LibraryItem[];
  libraryRoots: LibraryRoot[];
  selectedItemId: string | null;
  /** 刚导入的素材 id（按导入顺序），用于素材浏览列表临时置顶展示。 */
  recentImportPinIds: string[];
  searchQuery: string;
  tagOrder: string[];
  likedImageIds: string[];
  generationModelOrder: string[];
  hiddenGenerationModels: string[];
  themeMode: ThemeMode;
  autoNsfwGrading: boolean;
  blurNsfwImages: boolean;
  nsfwGradingSpeed: NsfwGradingSpeed;
  masonryTileWidth: number;
  materialBrowserCollectionMode: MaterialBrowserCollectionMode;
  materialBrowserGalleryMode: MaterialBrowserGalleryMode;
  materialBrowserSortMode: MaterialBrowserSortMode;
  materialBrowserSortDirection: MaterialBrowserSortDirection;
  materialBrowserRandomSeed: number;
  networkMaterialImportMode: NetworkMaterialImportMode;
  promptLexicons: PromptLexiconSettings | null;
  aiSettings: PublicAiProviderSettings;
  proxySettings: ProxySettings;
  isLoading: boolean;
  isBusy: boolean;
  statusMessage: StatusMessage | null;
  load: () => Promise<void>;
  showStatusMessage: (message: StatusFeedbackMessage) => void;
  setSearchQuery: (searchQuery: string) => void;
  setSelectedItemId: (selectedItemId: string | null) => void;
  clearRecentImportPins: () => void;
  setThemeMode: (themeMode: ThemeMode) => Promise<void>;
  saveGenerationModelPreferences: (patch: {
    generationModelOrder?: string[];
    hiddenGenerationModels?: string[];
  }) => Promise<void>;
  saveNsfwSettings: (settings: {
    autoNsfwGrading: boolean;
    blurNsfwImages: boolean;
    nsfwGradingSpeed: NsfwGradingSpeed;
  }) => Promise<boolean>;
  saveNetworkMaterialImportMode: (networkMaterialImportMode: NetworkMaterialImportMode) => Promise<boolean>;
  saveMasonryTileWidth: (masonryTileWidth: number) => Promise<void>;
  saveMaterialBrowserSettings: (patch: MaterialBrowserSettingsPatch) => Promise<boolean>;
  gradeAllImagesForNsfw: (options?: { force?: boolean }) => Promise<void>;
  saveAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<boolean>;
  testAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<AiConnectionTestResult>;
  listAiModels: (settings: SaveAiProviderSettingsPayload) => Promise<AiProviderModelSettings[] | null>;
  copyAiApiKey: (profileId: string, draftApiKey?: string) => Promise<boolean>;
  analyzePromptWithAi: (payload: AiAnalyzePromptPayload) => Promise<PromptAnalysisRunResult>;
  optimizePromptWithAi: (payload: AiOptimizePromptPayload) => Promise<string | null>;
  translatePromptWithAi: (payload: AiTranslatePromptPayload) => Promise<AiTranslatePromptData | null>;
  reverseImagePromptWithAi: (payload: AiReverseImagePromptPayload) => Promise<string | null>;
  saveProxySettings: (settings: ProxySettings) => Promise<boolean>;
  testProxySettings: (settings: ProxySettings) => Promise<boolean>;
  detectProxySettings: () => Promise<ProxyDetectionData | null>;
  clearStatus: () => void;
  openExternalUrl: (url: string, label?: string) => Promise<boolean>;
  importImages: () => Promise<void>;
  addAndScanLibraryRoot: () => Promise<void>;
  scanLibraryRoot: (rootId: string) => Promise<void>;
  setLibraryRootWatch: (rootId: string, enabled: boolean) => Promise<void>;
  remapLibraryRoot: (rootId: string) => Promise<void>;
  removeLibraryRoot: (rootId: string) => Promise<void>;
  validateExternalLibrary: () => Promise<void>;
  importImageBuffers: (images: ImportImageBufferInput[]) => Promise<void>;
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
  exportZip: (itemIds?: string[]) => Promise<void>;
  saveItem: (itemId: string, patch: Partial<LibraryItem>, options?: SaveItemOptions) => Promise<void>;
  saveTagConfiguration: (
    originalTags: string[],
    drafts: TagConfigurationDraft[],
    promptLexicons?: PromptLexiconSettings,
  ) => Promise<void>;
  savePromptLexicons: (promptLexicons: PromptLexiconSettings) => Promise<boolean>;
  importPromptLexicon: (kind: PromptLexiconKind) => Promise<PromptLexiconEntry[] | null>;
  exportPromptLexicon: (kind: PromptLexiconKind, items: PromptLexiconEntry[]) => Promise<void>;
  importPromptLexiconImage: () => Promise<string | null>;
  toggleFavoriteImage: (itemId: string) => Promise<void>;
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
  installModule: (moduleId: BuiltinModuleId) => Promise<boolean>;
};

let themeSwitchRevision = 0;
let themePersistenceQueue: Promise<void> = Promise.resolve();
let isExternalLibraryWatchSubscribed = false;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  libraryRoots: [],
  selectedItemId: null,
  recentImportPinIds: [],
  searchQuery: "",
  tagOrder: [],
  likedImageIds: [],
  generationModelOrder: [],
  hiddenGenerationModels: [],
  themeMode: "light",
  autoNsfwGrading: false,
  blurNsfwImages: false,
  nsfwGradingSpeed: defaultNsfwGradingSpeed,
  masonryTileWidth: defaultMasonryTileWidth,
  materialBrowserCollectionMode: "all",
  materialBrowserGalleryMode: "masonry",
  materialBrowserSortMode: "importedAt",
  materialBrowserSortDirection: "desc",
  materialBrowserRandomSeed: 0,
  networkMaterialImportMode: "download",
  promptLexicons: null,
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

  load: async () => {
    const loadStartedAt = performance.now();
    logRendererStartupEvent("library-load:start");
    set({ isLoading: true, statusMessage: null });

    if (!isExternalLibraryWatchSubscribed) {
      isExternalLibraryWatchSubscribed = true;
      window.suyanApi.onExternalLibraryChanged((data) => {
        const previousItemIds = new Set(get().items.map((item) => item.id));
        setLibrary(data.library, set, get);
        set({ libraryRoots: data.roots });

        if (data.importedCount > 0) {
          markRecentImportPins(set, get, previousItemIds);
          scheduleLexiconSyncAfterImport(set, get, previousItemIds);
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

    void window.suyanApi
      .readAiSettings()
      .then((aiSettingsResult) => {
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

    applyThemeModeToRoot(themeMode, document.documentElement, { suppressTransitions: true });

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

      const result = await window.suyanApi.saveLibraryViewSettings(
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

      applyThemeModeToRoot(currentThemeMode, document.documentElement, { suppressTransitions: true });
      set({
        themeMode: currentThemeMode,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
      await waitForThemePaint(currentThemeMode);
    });

    await themePersistenceQueue;
  },

  saveGenerationModelPreferences: async (patch) => {
    const currentGenerationModelOrder = get().generationModelOrder;
    const currentHiddenGenerationModels = get().hiddenGenerationModels;
    const generationModelOrder = patch.generationModelOrder ?? currentGenerationModelOrder;
    const hiddenGenerationModels = patch.hiddenGenerationModels ?? currentHiddenGenerationModels;

    set({ generationModelOrder, hiddenGenerationModels, statusMessage: null });

    const result = await window.suyanApi.saveLibraryViewSettings(
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

    set({
      autoNsfwGrading: settings.autoNsfwGrading,
      blurNsfwImages: settings.blurNsfwImages,
      nsfwGradingSpeed: settings.nsfwGradingSpeed,
      statusMessage: null,
    });

    const result = await window.suyanApi.saveLibraryViewSettings(
      buildLibraryViewSettings(get(), {
        autoNsfwGrading: settings.autoNsfwGrading,
        blurNsfwImages: settings.blurNsfwImages,
        nsfwGradingSpeed: settings.nsfwGradingSpeed,
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
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
  },

  saveNetworkMaterialImportMode: async (networkMaterialImportMode) => {
    const currentNetworkMaterialImportMode = get().networkMaterialImportMode;

    set({ networkMaterialImportMode, statusMessage: null });

    const result = await window.suyanApi.saveLibraryViewSettings(
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

    set({ masonryTileWidth: nextMasonryTileWidth, statusMessage: null });

    const result = await window.suyanApi.saveLibraryViewSettings(
      buildLibraryViewSettings(get(), { masonryTileWidth: nextMasonryTileWidth }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
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

    const result = await window.suyanApi.saveLibraryViewSettings(buildLibraryViewSettings(get(), nextSettings));

    if (result.ok) {
      syncLibraryViewSettings(set, result.data);
      return true;
    }

    set({ ...currentSettings, statusMessage: errorStatus(result.error.code, result.error.message) });
    return false;
  },

  gradeAllImagesForNsfw: async (options = {}) => {
    await gradeImagesForNsfw(get().items.map((item) => item.id), set, get, {
      force: options.force === true,
      silent: false,
    });
  },
  saveAiSettings: async (settings) => {
    const currentAiSettings = get().aiSettings;

    set({ isBusy: true, statusMessage: null });

    const result = await window.suyanApi.saveAiSettings(settings);

    if (result.ok) {
      set({
        aiSettings: result.data,
        statusMessage: successStatus(result.data.enabled ? "已保存远程模型配置。" : "已关闭远程 AI。"),
      });
    } else {
      set({
        aiSettings: currentAiSettings,
        statusMessage: errorStatus(result.error.code, result.error.message),
      });
    }

    set({ isBusy: false });
    return result.ok;
  },

  testAiSettings: async (settings) => {
    set({ isBusy: true, statusMessage: progressStatus("正在测试远程 AI 连接...") });

    const result = await window.suyanApi.testAiSettings(settings);
    const statusMessage = result.ok
      ? successStatus("远程 AI 连接成功。")
      : errorStatus(result.error.code, result.error.message);

    set({
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
    const resolvedPayload = applyAiActionPreference(get().aiSettings, payload.target, payload);
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

    logRendererStartupEvent("ai-analysis:start", {
      runInBackground,
      target: resolvedPayload.target,
    });

    const localAnalysis = (): PromptAnalysisRunResult => ({
      analysis:
        resolvedPayload.target === "prompt-options"
          ? buildAiPromptOptionAnalysis(resolvedPayload)
          : analyzePromptText(resolvedPayload.prompt, {
              title: resolvedPayload.title,
              tags: resolvedPayload.tags,
              currentCategory: resolvedPayload.category,
              knownCategories: resolvedPayload.knownCategories,
            }),
      source: "local",
    });
    const emptyImageAnalysis = (): PromptAnalysisRunResult => ({
      analysis: {
        chips: [],
        sections: [],
        suggestedTags: [],
        suggestedCategories: [],
        primaryCategory: resolvedPayload.category || "未分类",
        template: "",
      },
      source: "local",
    });

    const remoteAiReadiness = resolveRemoteAiReadiness(
      get().aiSettings,
      getAiActionLabel(resolvedPayload.target),
      resolvedPayload.apiProfileId,
      resolvedPayload.apiModelId,
      getAiAnalyzeCapability(resolvedPayload.target),
    );

    if (!remoteAiReadiness.ready) {
      if (
        resolvedPayload.target === "prompt" ||
        resolvedPayload.target === "prompt-category" ||
        resolvedPayload.target === "prompt-tags" ||
        resolvedPayload.target === "prompt-options"
      ) {
        if (!runInBackground) {
          set({ statusMessage: infoStatus("远程 AI 未配置，已使用本地分析。") });
        }
        const result = localAnalysis();
        logAiAnalysisDone(true, { reason: "remote-not-ready", source: result.source });
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
          optionValue: resolvedPayload.optionValue,
          optionVariable: resolvedPayload.optionVariable,
        });

        if (!runInBackground) {
          set({ statusMessage: successStatus(getAiAnalyzeSuccessText(resolvedPayload.target)) });
        }

        const remoteResult: PromptAnalysisRunResult = {
          analysis,
          source: "remote",
        };
        logAiAnalysisDone(true, { source: remoteResult.source });
        return remoteResult;
      } catch {
        if (
          resolvedPayload.target !== "prompt" &&
          resolvedPayload.target !== "prompt-category" &&
          resolvedPayload.target !== "prompt-tags"
        ) {
          if (resolvedPayload.target === "prompt-options") {
            if (!runInBackground) {
              set({ statusMessage: infoStatus("远程 AI 结果不可用，已生成本地词条。") });
            }
            const fallback = localAnalysis();
            logAiAnalysisDone(false, { reason: "remote-parse-failed", source: fallback.source });
            return fallback;
          }

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

        const fallback = localAnalysis();
        logAiAnalysisDone(false, { reason: "remote-parse-failed", source: fallback.source });
        return fallback;
      }
    }

    if (resolvedPayload.target === "prompt-options") {
      if (!runInBackground) {
        set({ statusMessage: infoStatus("远程 AI 暂不可用，已生成本地词条。") });
      }
      const fallback = localAnalysis();
      logAiAnalysisDone(false, { errorCode: result.error.code, source: fallback.source });
      return fallback;
    }

    if (
      resolvedPayload.target !== "prompt" &&
      resolvedPayload.target !== "prompt-category" &&
      resolvedPayload.target !== "prompt-tags"
    ) {
      if (!runInBackground) {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      }
      const fallback = emptyImageAnalysis();
      logAiAnalysisDone(false, { errorCode: result.error.code, source: fallback.source });
      return fallback;
    }

    if (!runInBackground) {
      set({ statusMessage: infoStatus("远程 AI 暂不可用，已使用本地分析。") });
    }

    const fallback = localAnalysis();
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

    set({ isBusy: true, statusMessage: progressStatus("正在导入素材...") });

    try {
      const previousItemIds = new Set(get().items.map((item) => item.id));
      const result = await withImportOperationTimeout<ImportImagesData>(
        window.suyanApi.importImageBuffers(images),
      );

      if (result.ok) {
        setLibrary(result.data.library, set, get);
        const finalStatus =
          result.data.importedCount > 0
            ? getMediaImportStatus(result.data.importedCount)
            : infoStatus("没有可导入的图片。");

        if (result.data.importedCount > 0) {
          markRecentImportPins(set, get, previousItemIds);
          scheduleLexiconSyncAfterImport(set, get, previousItemIds);
        }

        set({ statusMessage: finalStatus });
      } else {
        set({ statusMessage: errorStatus(result.error.code, result.error.message) });
      }
    } finally {
      set({ isBusy: false });
    }
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
    if (!hasBuiltinModuleCapability("video-frame-extraction", get().moduleState)) {
      const isInstalled = isBuiltinModuleInstalled("video-prompt", get().moduleState);
      set({
        statusMessage: failureStatus(
          isInstalled
            ? "视频模块未启用，无法生成关键帧。"
            : "视频提示词模块未安装，无法生成关键帧。",
        ),
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
    if (!hasBuiltinModuleCapability("video-reference-images", get().moduleState)) {
      const isInstalled = isBuiltinModuleInstalled("video-prompt", get().moduleState);
      set({
        statusMessage: failureStatus(
          isInstalled
            ? "视频模块未启用，无法导入参考图。"
            : "视频提示词模块未安装，无法导入参考图。",
        ),
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
    const result = await window.suyanApi.importZip();

    if (result.ok) {
      setLibrary(result.data.library, set, get);
      const finalStatus = result.data.canceled
        ? infoStatus("已取消导入。")
        : successStatus(`已导入 ${result.data.importedCount} 条素材。`);

      if (!result.data.canceled && result.data.importedCount > 0) {
        markRecentImportPins(set, get, previousItemIds);
        scheduleLexiconSyncAfterImport(set, get, previousItemIds);
      }

      set({
        statusMessage: finalStatus,
      });
    } else {
      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    }

    set({ isBusy: false });
  },

  exportZip: async (itemIds = []) => {
    set({ isBusy: true, statusMessage: null });
    const result = await window.suyanApi.exportZip(itemIds);

    if (result.ok) {
      set({
        statusMessage: result.data.canceled
          ? infoStatus("已取消导出。")
          : successStatus(`已导出 ${result.data.exportedCount} 条素材。`),
      });
    } else {
      set({ statusMessage: errorStatus(result.error.code, result.error.message) });
    }

    set({ isBusy: false });
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
            tags: hasTagsPatch ? normalizeConcretePromptTags(patch.tags ?? []) : item.tags,
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
      if (!runInBackground) {
        // 保存编辑时只扫描当前改动条目，避免整库重建。
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

    const settingsResult = await window.suyanApi.saveLibraryViewSettings(
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

  savePromptLexicons: async (promptLexicons) => {
    const currentPromptLexicons = get().promptLexicons;

    set({ promptLexicons, statusMessage: null });

    const result = await window.suyanApi.saveLibraryViewSettings(
      buildLibraryViewSettings(get(), { promptLexicons }),
    );

    if (result.ok) {
      syncLibraryViewSettings(set, result.data, { statusMessage: successStatus("已保存词库。") });
      return true;
    }

    set({
      promptLexicons: currentPromptLexicons,
      statusMessage: errorStatus(result.error.code, result.error.message),
    });
    return false;
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
    set({ isBusy: true, statusMessage: null });

    const result = await window.suyanApi.exportPromptLexicon(kind, items);

    set({
      statusMessage: result.ok
        ? result.data.canceled
          ? infoStatus("已取消导出。")
          : successStatus(`已导出 ${result.data.exportedCount} 条词库记录。`)
        : errorStatus(result.error.code, result.error.message),
      isBusy: false,
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

    const result = await window.suyanApi.saveLibraryViewSettings(
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
    set({ isBusy: true, statusMessage: null });
    const result = await window.suyanApi.exportImage(imageFileName);

    set({
      statusMessage: result.ok
        ? result.data.canceled
          ? infoStatus("已取消导出。")
          : successStatus("已导出文件。")
        : errorStatus(result.error.code, result.error.message),
      isBusy: false,
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

    const result = await window.suyanApi.saveLibraryViewSettings(
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

  installModule: async (moduleId) => {
    set({ isBusy: true, statusMessage: progressStatus(`正在安装模块...`) });

    try {
      const result = await window.suyanApi.installModuleFromLocal(moduleId);

      if (!result.ok) {
        set({
          statusMessage: errorStatus(result.error.code, result.error.message),
        });
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

      await get().setModuleState(patch);
      set({
        statusMessage: successStatus(`模块安装成功，已自动校验并启用。`),
      });
      return true;
    } finally {
      set({ isBusy: false });
    }
  },
}));

function buildLibraryViewSettings(
  state: LibraryState,
  patch: Partial<LibraryViewSettings> = {},
): LibraryViewSettings {
  return {
    tagOrder: state.tagOrder,
    likedImageIds: state.likedImageIds,
    generationModelOrder: state.generationModelOrder,
    hiddenGenerationModels: state.hiddenGenerationModels,
    themeMode: state.themeMode,
    autoNsfwGrading: state.autoNsfwGrading,
    blurNsfwImages: state.blurNsfwImages,
    nsfwGradingSpeed: state.nsfwGradingSpeed,
    masonryTileWidth: normalizeMasonryTileWidth(state.masonryTileWidth),
    materialBrowserCollectionMode: state.materialBrowserCollectionMode,
    materialBrowserGalleryMode: state.materialBrowserGalleryMode,
    materialBrowserSortMode: state.materialBrowserSortMode,
    materialBrowserSortDirection: state.materialBrowserSortDirection,
    materialBrowserRandomSeed: Math.max(0, Math.trunc(state.materialBrowserRandomSeed)),
    networkMaterialImportMode: state.networkMaterialImportMode,
    promptLexicons: state.promptLexicons,
    moduleState: state.moduleState,
    ...patch,
  };
}

function syncLibraryViewSettings(
  set: (partial: Partial<LibraryState>) => void,
  settings: LibraryViewSettings,
  extra: Partial<LibraryState> = {},
): void {
  applyThemeModeToRoot(settings.themeMode);
  set({
    tagOrder: settings.tagOrder,
    likedImageIds: settings.likedImageIds,
    generationModelOrder: settings.generationModelOrder,
    hiddenGenerationModels: settings.hiddenGenerationModels,
    themeMode: settings.themeMode,
    autoNsfwGrading: settings.autoNsfwGrading,
    blurNsfwImages: settings.blurNsfwImages,
    nsfwGradingSpeed: settings.nsfwGradingSpeed,
    masonryTileWidth: settings.masonryTileWidth,
    materialBrowserCollectionMode: settings.materialBrowserCollectionMode,
    materialBrowserGalleryMode: settings.materialBrowserGalleryMode,
    materialBrowserSortMode: settings.materialBrowserSortMode,
    materialBrowserSortDirection: settings.materialBrowserSortDirection,
    materialBrowserRandomSeed: settings.materialBrowserRandomSeed,
    networkMaterialImportMode: settings.networkMaterialImportMode,
    promptLexicons: settings.promptLexicons,
    moduleState: settings.moduleState,
    ...extra,
  });
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

  // 新导入条目通常还没有胶囊结构，可直接跳过昂贵扫描。
  if (
    options.targetItemIds &&
    options.targetItemIds.length > 0 &&
    !targetItems.some((item) => item.prompt.includes("{{") || item.negativePrompt.includes("{{"))
  ) {
    logRendererStartupEvent("lexicon-sync:merge", {
      durationMs: 0,
      itemCount: items.length,
      addedCount: 0,
      indexedPromptCount: 0,
      targetCount: targetItems.length,
      skipped: true,
      reason: "no-capsules",
    });
    return;
  }

  const { mergeLibraryPromptParametersIntoLexiconForItems } = await import("../utils/promptLexicons");
  const mergeStart = performance.now();
  const result = mergeLibraryPromptParametersIntoLexiconForItems(
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

  const saveResult = await window.suyanApi.saveLibraryViewSettings(
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
    const saveResult = await window.suyanApi.saveLibraryViewSettings(
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

  const safetyPreference = resolveAiActionPreference(get().aiSettings, "image-safety");
  const remoteAiReadiness = resolveRemoteAiReadiness(
    get().aiSettings,
    "NSFW 分级",
    safetyPreference.profileId,
    safetyPreference.modelId,
    "vision",
  );

  if (!remoteAiReadiness.ready) {
    if (!options.silent) {
      set({ statusMessage: remoteAiReadiness.statusMessage });
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
    const batchResults = await mapWithConcurrency(batch, concurrency, (item) => analyzeNsfwItem(item, get().aiSettings));
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
): Promise<{ itemId: string; rating: NsfwRating } | null> {
  try {
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
      rating: resolveNsfwRatingFromRemoteAnalysis(result.data.analysis),
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

function successStatus(text: string): StatusMessage {
  return { type: "success", text, autoDismissMs: statusToastAutoDismissMs };
}

function formatSavedBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressStatus(text: string): StatusMessage {
  return { type: "info", text, autoDismissMs: null };
}

function infoStatus(text: string): StatusMessage {
  return { type: "info", text, autoDismissMs: statusToastAutoDismissMs };
}

function failureStatus(text: string): StatusMessage {
  return { type: "error", text, autoDismissMs: statusToastAutoDismissMs };
}

function errorStatus(code: string, fallback: string): StatusMessage {
  return { type: "error", text: getUiErrorMessage(code, fallback), autoDismissMs: statusToastAutoDismissMs };
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
      ? `已导入 ${importedCount} 个素材，并放入同一张空白提示词卡片。`
      : "已导入 1 个素材，并创建空白提示词卡片。",
  );
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
        `${actionLabel}失败：当前模型不支持${requiredCapability === "vision" ? "图片理解" : "文本生成"}，请在模型配置中选择合适模型。`,
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
