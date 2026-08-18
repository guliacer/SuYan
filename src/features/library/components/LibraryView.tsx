import {
  lazy,
  memo,
  startTransition,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { usePromptCards } from "@/hooks/usePromptCards";
import type { AppUpdateCheckData, LogExportFormat, LogExportLevel, LogExportRange } from "@/types/suyanApi";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckSquare,
  ChevronRight,
  Columns4,
  Clipboard,
  Compass,
  Copy,
  Download,
  Eraser,
  Eye,
  ExternalLink,
  FileText,
  FolderTree,
  GripVertical,
  Globe2,
  Grid2X2,
  Heart,
  ImageIcon,
  ImageOff,
  ImagePlus,
  Info,
  LayoutGrid,
  Minus,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Sun,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import { CardScrollTopButton } from "./CardScrollTopButton";
import { appVersion, suyanGithubReleasesUrl } from "../appVersion";
import { ImageDropOverlay } from "./shell/ImageDropOverlay";
import { StatusToast } from "./shell/StatusToast";
import { AiErrorDialog } from "./shell/AiErrorDialog";
import { DeferredViewFallback, PromptDetailFallback } from "./shell/DeferredFallbacks";
import { AppTitleBar } from "./shell/AppTitleBar";
import { AboutDialog } from "./shell/AboutDialog";
import { LogExportDialog, type LogExportSelection } from "./shell/LogExportDialog";
import {
  PromptSiteRecommendationsView,
  promptSiteRecommendations,
  promptSiteCardToneClassNames,
  type PromptSiteCardToneClassNames,
} from "./recommendations/PromptSiteRecommendations";
import { StartupLoadingScreen } from "./startup/StartupLoadingScreen";
import startupArt1 from "../assets/startup-art-1.png?url";
import startupArt2 from "../assets/startup-art-2.png?url";
import startupArt3 from "../assets/startup-art-3.png?url";
import startupArt4 from "../assets/startup-art-4.png?url";
import startupArt5 from "../assets/startup-art-5.png?url";
import startupArt6 from "../assets/startup-art-6.png?url";
import type {
  LibraryItem,
  LibraryRoot,
  PromptImageLexiconEntry,
  PromptLexiconEntry,
  PromptLexiconKind,
  PromptLexiconSettings,
  ThemeMode,
} from "../types/library";
import type { AiAnalyzePromptPayload, AiImageGenerationPayload } from "../types/ai";
import type { CanvasPromptOrigin, DoubaoWebCanvasStatus } from "../types/canvas";
import { NsfwImage } from "./NsfwImage";
import { MediaFullscreenOverlay } from "./MediaFullscreenOverlay";
import { VideoPromptTile } from "./video/VideoPromptTile";
import { useLibraryStore } from "../store/useLibraryStore";
import {
  allCategoriesValue,
  filterFavoritePromptCards,
  filterPromptCards,
  getPopularTags,
  toPromptCardData,
  type PromptCardData,
  type PromptSortDirection,
  type PromptSortMode,
} from "../utils/promptFilters";
import {
  getPromptImageGroupItems,
  groupPromptImages,
  spreadPromptGroupImages,
  type PromptImageGroup,
} from "../utils/promptImageGroups";
import {
  getPromptGroupCategoryLabels,
  getPromptGroupCategoryMembershipKeys,
} from "../utils/promptGroupCategories";
import { distributeItemsByTopEdge } from "../utils/masonryLayout";
import { maxAnalysisResultCount, mergeAnalysisLabelsWithFitCap } from "../utils/analysisMergeCap";
import { normalizePromptText } from "../utils/normalizePromptText";
import {
  photographyCategoryDefinitions,
  photographyCategoryLabels,
  dedupeExclusiveGenreLabels,
  resolvePhotographyCategory,
} from "../utils/photographyCategories";
import { normalizeImageTag } from "../utils/tagNormalization";
import { sanitizePromptTags } from "../utils/promptAnalysis";
import { isVideoMediaFile } from "../utils/mediaFileTypes";
import {
  createEmptyCategoryTaxonomy,
  compareCategoryGroupPriority,
  resolveCategoryIdFromLegacyName,
  resolveCategoryName,
  taxonomyToLexiconCategories,
} from "../utils/categoryTaxonomy";
import type { CategoryTaxonomy } from "../types/category";
import { buildCustomCategoryId, normalizeCategoryLabelKey } from "../utils/categoryId";
import { getImageSrc, getStartupGalleryImageSrc } from "../utils/getImageSrc";
import {
  selectRandomStartupGalleryImages,
  startupGalleryDisplayCount,
} from "../utils/startupGallerySelection";
import {
  createDefaultPromptLexiconSettings,
  getPromptTagGroup,
} from "../utils/promptLexicons";
import { getPromptSectionKeyByVariable, promptSectionMeta, resolvePromptTemplateText } from "../utils/promptSplit";
import {
  getStoredSidebarOpen,
  getStoredSidebarWidth,
  storeSidebarOpen,
  storeSidebarWidth,
} from "../utils/sidebarPrefs";
import {
  clampSidebarWidth,
  compactSidebarBreakpoint,
  defaultSidebarWidth,
  maxSidebarWidth,
  minSidebarWidth,
  normalizeSidebarWidth,
  resizeSidebarWidthBy,
} from "../utils/sidebarLayout";
import { getThemeModeLabel } from "../utils/themeMode";
import {
  orderTagsWithPreference,
  type TagConfigurationDraft,
} from "../utils/tagSettings";
import { hasBuiltinModuleCapability } from "../utils/moduleRegistry";
import {
  defaultSystemPreferenceSection,
  type SystemPreferenceSection,
} from "../utils/systemPreferences";

const AiSettingsDialog = lazy(() =>
  import("./AiSettingsDialog").then((module) => ({ default: module.AiSettingsDialog })),
);
const NsfwSettingsDialog = lazy(() =>
  import("./NsfwSettingsDialog").then((module) => ({ default: module.NsfwSettingsDialog })),
);
const SystemPreferencesDialog = lazy(() =>
  import("./SystemPreferencesDialog").then((module) => ({ default: module.SystemPreferencesDialog })),
);
const loadPromptDetailDialog = () => import("./PromptDetailDialog");
const PromptDetailDialog = lazy(() => loadPromptDetailDialog().then((module) => ({ default: module.PromptDetailDialog })));
const PromptLibraryManagerView = lazy(() =>
  import("./PromptLibraryManagerDialog").then((module) => ({ default: module.PromptLibraryManagerView })),
);
const CanvasView = lazy(() =>
  import("./CanvasView").then((module) => ({ default: module.CanvasView })),
);
const WebAssistantView = lazy(() =>
  import("./WebAssistantView").then((module) => ({ default: module.WebAssistantView })),
);

const pageSize = 16;
const gridVisibleTagCount = 5;
const contentShellClassName = "mx-auto w-full max-w-[min(100%,1280px)]";
const lexiconShellClassName = "mx-auto w-full max-w-[min(100%,1400px)]";
// 网页助手是沉浸式工作区，不沿用素材浏览的 1280px 内容壳层。
const webAssistantShellClassName = "mx-auto h-full min-h-0 w-full max-w-[1760px]";
const contentShellMaxWidth = 1280;
const lexiconShellMaxWidth = 1400;
const pageGutterClassName = "px-3 min-[640px]:px-5 min-[900px]:px-6 min-[1024px]:px-8 min-[1440px]:px-10";
/** Waterfall column count: smooth 2–10 steps (matches persisted store range). */
const minMasonryColumnCount = 2;
const maxMasonryColumnCount = 10;
const defaultMasonryColumnCount = 4;
const masonryColumnGap = 16;
const allCategoryGroupsValue = "__all_category_groups__";
const allTagGroupsValue = "__all_tag_groups__";
const imageGroupMenuPrefix = "image-group:";
const imageCategoryMenuPrefix = "image-category:";
const imageItemMenuPrefix = "image-item:";
const defaultCategoryGroupLabel = "自定义分类";
const defaultTagGroupLabel = "自定义标签";
const ungroupedImageGroupLabel = "未分组";

/**
 * Fixed startup gallery duration. Always reserve this wall-clock window so the
 * intro is not auto-dismissed early; users may click to skip manually.
 * Also keeps category/tag workspaces warming in the background.
 */
const STARTUP_OVERLAY_FIXED_MS = 6000;
const STARTUP_PREWARM_VIEWS: LibraryMainView[] = ["categoryLexicon", "tagLexicon"];

type CollectionMode = "all" | "featured";
type GalleryMode = "masonry" | "grid";
type LibraryMainView = "home" | "canvas" | "webAssistant" | "promptLibrary" | "categoryLexicon" | "tagLexicon" | "promptSites";
type LibrarySidebarActiveView =
  | LibraryMainView
  | "aiSettings"
  | "nsfwSettings"
  | "systemPreferences";
type CategoryAnalysisStatus = "running" | "completed" | "canceled";
type CategoryAnalysisProgress = {
  analyzed: number;
  currentTitle: string;
  failed: number;
  message: string;
  processed: number;
  skipped: number;
  status: CategoryAnalysisStatus;
  total: number;
};
/** 分类 / 标签 / 参数三类分析结果的统一上限，见 utils/analysisMergeCap。 */
const maxBatchAiTagCount = maxAnalysisResultCount;
const maxAiCategoryCount = maxAnalysisResultCount;
type MasonryPromptItem = {
  imageCount: number;
  item: PromptCardData;
};

const themeModeOptions: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: "light", label: getThemeModeLabel("light"), icon: <Sun size={15} /> },
  { value: "dark", label: getThemeModeLabel("dark"), icon: <Moon size={15} /> },
];

let libraryViewRenderCount = 0;
let libraryViewFirstRenderMs = 0;
let libraryViewLastReportMs = 0;

function recordLibraryViewRender(): void {
  const now = Date.now();

  if (libraryViewFirstRenderMs === 0) {
    libraryViewFirstRenderMs = now;
  }

  libraryViewRenderCount += 1;
  const sinceFirstMs = now - libraryViewFirstRenderMs;

  if (sinceFirstMs > 30000) {
    return;
  }

  if (now - libraryViewLastReportMs >= 500 || libraryViewRenderCount % 50 === 0) {
    libraryViewLastReportMs = now;
    try {
      window.suyanApi.logStartupEvent("render:count", {
        renderCount: libraryViewRenderCount,
        sinceFirstMs,
      });
    } catch {
      // Telemetry must never block rendering.
    }
  }
}

function measureDerivation<T>(label: string, inputSize: number, compute: () => T): T {
  const startedAt = performance.now();
  const result = compute();
  const durationMs = performance.now() - startedAt;

  if (durationMs >= 30) {
    try {
      window.suyanApi.logStartupEvent("derivation:slow", {
        label,
        inputSize,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    } catch {
      // Telemetry must never block derivations.
    }
  }

  return result;
}

export function LibraryView() {
  recordLibraryViewRender();
  const items = useLibraryStore((state) => state.items);
  const libraryRoots = useLibraryStore((state) => state.libraryRoots);
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const tagOrder = useLibraryStore((state) => state.tagOrder);
  const likedImageIds = useLibraryStore((state) => state.likedImageIds);
  const starredRecommendations = useLibraryStore((state) => state.starredRecommendations);
  const toggleRecommendationStar = useLibraryStore((state) => state.toggleRecommendationStar);
  const generationModelOrder = useLibraryStore((state) => state.generationModelOrder);
  const hiddenGenerationModels = useLibraryStore((state) => state.hiddenGenerationModels);
  const autoNsfwGrading = useLibraryStore((state) => state.autoNsfwGrading);
  const blurNsfwImages = useLibraryStore((state) => state.blurNsfwImages);
  const nsfwGradingSpeed = useLibraryStore((state) => state.nsfwGradingSpeed);
  const promptLexicons = useLibraryStore((state) => state.promptLexicons);
  const categoryTaxonomy = useLibraryStore((state) => state.categoryTaxonomy);
  const savedMasonryTileWidth = useLibraryStore((state) => state.masonryTileWidth);
  const savedMaterialBrowserCollectionMode = useLibraryStore((state) => state.materialBrowserCollectionMode);
  const savedMaterialBrowserGalleryMode = useLibraryStore((state) => state.materialBrowserGalleryMode);
  const savedMaterialBrowserSortMode = useLibraryStore((state) => state.materialBrowserSortMode);
  const savedMaterialBrowserSortDirection = useLibraryStore((state) => state.materialBrowserSortDirection);
  const savedMaterialBrowserRandomSeed = useLibraryStore((state) => state.materialBrowserRandomSeed);
  const savedMaterialBrowserScrollTop = useLibraryStore((state) => state.materialBrowserScrollTop);
  const recentImportPinIds = useLibraryStore((state) => state.recentImportPinIds);
  const clearRecentImportPins = useLibraryStore((state) => state.clearRecentImportPins);
  const aiSettings = useLibraryStore((state) => state.aiSettings);
  const canvasDraft = useLibraryStore((state) => state.canvasDraft);
  const canvasGenerationResults = useLibraryStore((state) => state.canvasGenerationResults);
  const canvasLastModel = useLibraryStore((state) => state.canvasLastModel);
  const proxySettings = useLibraryStore((state) => state.proxySettings);
  const moduleState = useLibraryStore((state) => state.moduleState);
  const isLoading = useLibraryStore((state) => state.isLoading);
  const isBusy = useLibraryStore((state) => state.isBusy);
  const statusMessage = useLibraryStore((state) => state.statusMessage);
  const aiErrorDialog = useLibraryStore((state) => state.aiErrorDialog);
  const clearAiErrorDialog = useLibraryStore((state) => state.clearAiErrorDialog);
  const aiAnalysisCircuitOpen = useLibraryStore((state) => state.aiAnalysisCircuitOpen);
  const load = useLibraryStore((state) => state.load);
  const showStatusMessage = useLibraryStore((state) => state.showStatusMessage);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);
  const updateCanvasDraft = useLibraryStore((state) => state.updateCanvasDraft);
  const setCanvasGenerationResults = useLibraryStore((state) => state.setCanvasGenerationResults);
  const setCanvasLastModel = useLibraryStore((state) => state.setCanvasLastModel);
  const saveNsfwSettings = useLibraryStore((state) => state.saveNsfwSettings);
  const gradeAllImagesForNsfw = useLibraryStore((state) => state.gradeAllImagesForNsfw);
  const saveAiSettings = useLibraryStore((state) => state.saveAiSettings);
  const saveAiActionModelPreference = useLibraryStore((state) => state.saveAiActionModelPreference);
  const testAiSettings = useLibraryStore((state) => state.testAiSettings);
  const saveProxySettings = useLibraryStore((state) => state.saveProxySettings);
  const testProxySettings = useLibraryStore((state) => state.testProxySettings);
  const detectProxySettings = useLibraryStore((state) => state.detectProxySettings);
  const listAiModels = useLibraryStore((state) => state.listAiModels);
  const copyAiApiKey = useLibraryStore((state) => state.copyAiApiKey);
  const analyzePromptWithAi = useLibraryStore((state) => state.analyzePromptWithAi);
  const optimizePromptWithAi = useLibraryStore((state) => state.optimizePromptWithAi);
  const translatePromptWithAi = useLibraryStore((state) => state.translatePromptWithAi);
  const reverseImagePromptWithAi = useLibraryStore((state) => state.reverseImagePromptWithAi);
  const clearStatus = useLibraryStore((state) => state.clearStatus);
  const importImages = useLibraryStore((state) => state.importImages);
  const importManagedLibraryDirectory = useLibraryStore((state) => state.importManagedLibraryDirectory);
  const addAndScanLibraryRoot = useLibraryStore((state) => state.addAndScanLibraryRoot);
  const scanLibraryRoot = useLibraryStore((state) => state.scanLibraryRoot);
  const setLibraryRootWatch = useLibraryStore((state) => state.setLibraryRootWatch);
  const reorderLibraryRoots = useLibraryStore((state) => state.reorderLibraryRoots);
  const remapLibraryRoot = useLibraryStore((state) => state.remapLibraryRoot);
  const removeLibraryRoot = useLibraryStore((state) => state.removeLibraryRoot);
  const purgeMissingLibraryRootItems = useLibraryStore((state) => state.purgeMissingLibraryRootItems);
  const validateExternalLibrary = useLibraryStore((state) => state.validateExternalLibrary);
  const importImageFilesForItem = useLibraryStore((state) => state.importImageFilesForItem);
  const generateVideoFrames = useLibraryStore((state) => state.generateVideoFrames);
  const importVideoReferenceImages = useLibraryStore((state) => state.importVideoReferenceImages);
  const deleteVideoReferenceImage = useLibraryStore((state) => state.deleteVideoReferenceImage);
  const importClipboardReferenceImage = useLibraryStore((state) => state.importClipboardReferenceImage);
  const importReferenceImageFromUrl = useLibraryStore((state) => state.importReferenceImageFromUrl);
  const importWordDocument = useLibraryStore((state) => state.importWordDocument);
  const importClipboardImage = useLibraryStore((state) => state.importClipboardImage);
  const importImageBuffers = useLibraryStore((state) => state.importImageBuffers);
  const importGeneratedImages = useLibraryStore((state) => state.importGeneratedImages);
  const importClipboardImageForItem = useLibraryStore((state) => state.importClipboardImageForItem);
  const downloadRemoteMaterial = useLibraryStore((state) => state.downloadRemoteMaterial);
  const importZip = useLibraryStore((state) => state.importZip);
  const copyText = useLibraryStore((state) => state.copyText);
  const copyImage = useLibraryStore((state) => state.copyImage);
  const exportImage = useLibraryStore((state) => state.exportImage);
  const saveItem = useLibraryStore((state) => state.saveItem);
  const saveItemsBatch = useLibraryStore((state) => state.saveItemsBatch);
  const clearLexiconDomain = useLibraryStore((state) => state.clearLexiconDomain);
  const saveGenerationModelPreferences = useLibraryStore((state) => state.saveGenerationModelPreferences);
  const saveAiRecognitionSourcePreferences = useLibraryStore((state) => state.saveAiRecognitionSourcePreferences);
  const savePromptLexicons = useLibraryStore((state) => state.savePromptLexicons);
  const movePromptGroupsToCategory = useLibraryStore((state) => state.movePromptGroupsToCategory);
  const upsertCustomCategory = useLibraryStore((state) => state.upsertCustomCategory);
  const deleteCustomCategory = useLibraryStore((state) => state.deleteCustomCategory);
  const saveMasonryTileWidth = useLibraryStore((state) => state.saveMasonryTileWidth);
  const saveMaterialBrowserSettings = useLibraryStore((state) => state.saveMaterialBrowserSettings);
  const saveMaterialBrowserScrollTop = useLibraryStore((state) => state.saveMaterialBrowserScrollTop);
  const importPromptLexicon = useLibraryStore((state) => state.importPromptLexicon);
  const exportPromptLexicon = useLibraryStore((state) => state.exportPromptLexicon);
  const importPromptLexiconImage = useLibraryStore((state) => state.importPromptLexiconImage);
  const toggleFavoriteImage = useLibraryStore((state) => state.toggleFavoriteImage);
  const deleteItems = useLibraryStore((state) => state.deleteItems);
  const exportZip = useLibraryStore((state) => state.exportZip);
  const openExternalUrl = useLibraryStore((state) => state.openExternalUrl);
  const [sortMode, setSortMode] = useState<PromptSortMode>(savedMaterialBrowserSortMode);
  const [sortDirection, setSortDirection] = useState<PromptSortDirection>(savedMaterialBrowserSortDirection);
  const [randomSeed, setRandomSeed] = useState(savedMaterialBrowserRandomSeed);
  const [collectionMode, setCollectionMode] = useState<CollectionMode>(savedMaterialBrowserCollectionMode);
  const [galleryMode, setGalleryMode] = useState<GalleryMode>(savedMaterialBrowserGalleryMode);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [mainView, setMainView] = useState<LibraryMainView>("home");
  const [sidebarActiveView, setSidebarActiveView] = useState<LibrarySidebarActiveView>("home");
  const [imageSizeById, setImageSizeById] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [masonryColumnCount, setMasonryColumnCount] = useState(() => migrateTileWidthToColumnCount(savedMasonryTileWidth));
  // Layout columns may lag one frame behind the slider so dragging stays smooth.
  const [masonryLayoutColumnCount, setMasonryLayoutColumnCount] = useState(() =>
    migrateTileWidthToColumnCount(savedMasonryTileWidth),
  );
  const [isMasonrySizeControlOpen, setIsMasonrySizeControlOpen] = useState(false);
  const isMasonryAdjustingRef = useRef(false);
  const masonryLayoutRafRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<PromptCardData | null>(null);

  const openFullscreenMedia = useCallback((item: PromptCardData) => {
    setDetailItemId(null);
    setFullscreenMedia(item);
  }, []);

  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isNsfwSettingsOpen, setIsNsfwSettingsOpen] = useState(false);
  const [isSystemPreferencesOpen, setIsSystemPreferencesOpen] = useState(false);
  const [systemPreferencesSection, setSystemPreferencesSection] = useState<SystemPreferenceSection>(
    defaultSystemPreferenceSection,
  );
  const [isLibraryRootsOpen, setIsLibraryRootsOpen] = useState(false);
  const [isDirectoryImportModeOpen, setIsDirectoryImportModeOpen] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(getStoredSidebarOpen);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    normalizeSidebarWidth(getStoredSidebarWidth(defaultSidebarWidth)),
  );
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isLogExportOpen, setIsLogExportOpen] = useState(false);
  const [logExportAction, setLogExportAction] = useState<"save" | "feedback" | null>(null);
  const isExportingLogs = logExportAction !== null;
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [hasInitialLoadFinished, setHasInitialLoadFinished] = useState(false);
  const [mountedLexiconViews, setMountedLexiconViews] = useState<Set<LibraryMainView>>(() => new Set());
  const [hasPremountedLexicons, setHasPremountedLexicons] = useState(false);
  /** Tracks when the startup sequence began so we can enforce a fixed intro length. */
  const startupSequenceStartedAtRef = useRef<number>(performance.now());
  const [hasStartupHoldElapsed, setHasStartupHoldElapsed] = useState(false);
  const cardsStartRef = useRef<HTMLDivElement | null>(null);
  const homeScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingHomeScrollRestoreRef = useRef<number | null>(null);
  const hasRestoredHomeScrollRef = useRef(false);
  const sidebarElementRef = useRef<HTMLElement | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const isSidebarResizingRef = useRef(false);
  const dragDepthRef = useRef(0);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const importMenuContentRef = useRef<HTMLDivElement | null>(null);
  const hasNotifiedRendererReadyRef = useRef(false);
  const viewSwitchStartedAtRef = useRef<{ startedAt: number; view: LibraryMainView } | null>(null);
  const viewSwitchRenderStartedAtRef = useRef<number | null>(null);
  const pendingViewSwitch = viewSwitchStartedAtRef.current;

  if (
    pendingViewSwitch?.view === mainView &&
    viewSwitchRenderStartedAtRef.current === null
  ) {
    viewSwitchRenderStartedAtRef.current = performance.now();
    logRendererStartupEvent("view-switch:render-start", {
      durationMs: Math.round(performance.now() - pendingViewSwitch.startedAt),
      to: mainView,
    });
  }

  useEffect(() => {
    // Skip while dragging so a late state write cannot overwrite the live width.
    if (isSidebarResizingRef.current) {
      return;
    }

    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Keep the app usable on narrow / short displays: auto-collapse wide sidebars
  // when the window cannot fit main content + expanded nav comfortably.
  useEffect(() => {
    const NARROW_CONTENT_BREAKPOINT = 1100;
    const COMPACT_WIDTH = minSidebarWidth;

    function adaptSidebarToViewport() {
      if (isSidebarResizingRef.current) {
        return;
      }

      const viewportWidth = window.innerWidth;
      if (viewportWidth < NARROW_CONTENT_BREAKPOINT && isSidebarOpen) {
        if (sidebarWidthRef.current > compactSidebarBreakpoint) {
          commitSidebarWidth(COMPACT_WIDTH);
        }
      }
    }

    adaptSidebarToViewport();
    window.addEventListener("resize", adaptSidebarToViewport);
    return () => window.removeEventListener("resize", adaptSidebarToViewport);
    // commitSidebarWidth is stable enough for this session; width state is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSidebarOpen]);

  useEffect(() => {
    let isCanceled = false;

    setHasInitialLoadFinished(false);
    void load().finally(() => {
      if (!isCanceled) {
        setHasInitialLoadFinished(true);
      }
    });

    return () => {
      isCanceled = true;
    };
  }, [load]);

  useEffect(() => {
    setCollectionMode(savedMaterialBrowserCollectionMode);
    setGalleryMode(savedMaterialBrowserGalleryMode);
    setSortMode(savedMaterialBrowserSortMode);
    setSortDirection(savedMaterialBrowserSortDirection);
    setRandomSeed(savedMaterialBrowserRandomSeed);
  }, [
    savedMaterialBrowserCollectionMode,
    savedMaterialBrowserGalleryMode,
    savedMaterialBrowserRandomSeed,
    savedMaterialBrowserSortDirection,
    savedMaterialBrowserSortMode,
  ]);

  useEffect(() => {
    // Avoid snapping the slider while the user is still dragging (save/settings
    // sync used to rewrite the value mid-gesture and skip intermediate steps).
    if (isMasonryAdjustingRef.current) {
      return;
    }
    const nextCount = migrateTileWidthToColumnCount(savedMasonryTileWidth);
    setMasonryColumnCount((current) => (current === nextCount ? current : nextCount));
    setMasonryLayoutColumnCount((current) => (current === nextCount ? current : nextCount));
  }, [savedMasonryTileWidth]);

  useEffect(() => {
    return () => {
      if (masonryLayoutRafRef.current !== 0) {
        window.cancelAnimationFrame(masonryLayoutRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!statusMessage || statusMessage.autoDismissMs === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearStatus();
    }, statusMessage.autoDismissMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [clearStatus, statusMessage]);

  useEffect(() => {
    if (isAiSettingsOpen) {
      setSidebarActiveView("aiSettings");
      return;
    }

    if (isNsfwSettingsOpen) {
      setSidebarActiveView("nsfwSettings");
      return;
    }

    if (isSystemPreferencesOpen) {
      setSidebarActiveView("systemPreferences");
      return;
    }

    setSidebarActiveView(mainView);
  }, [
    isAiSettingsOpen,
    isNsfwSettingsOpen,
    isSystemPreferencesOpen,
    mainView,
  ]);

  useLayoutEffect(() => {
    const switchInfo = viewSwitchStartedAtRef.current;

    if (!switchInfo || switchInfo.view !== mainView) {
      return;
    }

    const layoutEffectAt = performance.now();
    logRendererStartupEvent("view-switch:layout-effect", {
      durationMs: Math.round(layoutEffectAt - switchInfo.startedAt),
      renderDurationMs:
        viewSwitchRenderStartedAtRef.current === null
          ? null
          : Math.round(layoutEffectAt - viewSwitchRenderStartedAtRef.current),
      to: mainView,
    });

    const frame = window.requestAnimationFrame(() => {
      const firstFrameAt = performance.now();
      logRendererStartupEvent("view-switch:first-raf", {
        afterLayoutMs: Math.round(firstFrameAt - layoutEffectAt),
        durationMs: Math.round(firstFrameAt - switchInfo.startedAt),
        to: mainView,
      });
      logRendererStartupEvent("view-switch:ready", {
        durationMs: Math.round(firstFrameAt - switchInfo.startedAt),
        to: mainView,
      });
      viewSwitchStartedAtRef.current = null;
      viewSwitchRenderStartedAtRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mainView]);

  const skipStartupIntro = useCallback(() => {
    if (hasStartupHoldElapsed) {
      return;
    }

    setHasStartupHoldElapsed(true);
    logRendererStartupEvent("startup-overlay:skip", {
      elapsedMs: Math.round(performance.now() - startupSequenceStartedAtRef.current),
      libraryReady: hasInitialLoadFinished,
    });
  }, [hasInitialLoadFinished, hasStartupHoldElapsed]);

  useEffect(() => {
    // Fixed wall-clock hold from first mount (covers the early full-screen phase too).
    // Do not auto-dismiss earlier than STARTUP_OVERLAY_FIXED_MS unless the user skips.
    const elapsed = performance.now() - startupSequenceStartedAtRef.current;
    const remaining = Math.max(0, STARTUP_OVERLAY_FIXED_MS - elapsed);
    const timer = window.setTimeout(() => {
      setHasStartupHoldElapsed(true);
    }, remaining);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    // Mount only the active lexicon workspace while navigating.
    // Startup prewarm may mount others once under the overlay (see below).
    if (mainView !== "categoryLexicon" && mainView !== "tagLexicon") {
      return;
    }

    setMountedLexiconViews((current) => {
      if (current.has(mainView)) {
        return current;
      }
      const next = new Set(current);
      next.add(mainView);
      return next;
    });
  }, [mainView]);

  useEffect(() => {
    if (!hasInitialLoadFinished || !hasStartupHoldElapsed) {
      return;
    }

    // Dismiss only after BOTH library ready and fixed hold elapsed.
    setHasPremountedLexicons(true);
    logRendererStartupEvent("startup-overlay:dismissed", {
      holdMs: STARTUP_OVERLAY_FIXED_MS,
      elapsedMs: Math.round(performance.now() - startupSequenceStartedAtRef.current),
      libraryReady: true,
    });
  }, [hasInitialLoadFinished, hasStartupHoldElapsed]);

  useEffect(() => {
    if (!hasInitialLoadFinished) {
      return;
    }

    // While the fixed startup page is up, stagger-prewarm heavy workspaces so
    // opening 分类/标签/参数 later is smoother (they stay hidden until selected).
    let cancelled = false;
    const timers: number[] = [];

    logRendererStartupEvent("startup-overlay:hold-start", {
      holdMs: STARTUP_OVERLAY_FIXED_MS,
      prewarm: STARTUP_PREWARM_VIEWS,
    });

    STARTUP_PREWARM_VIEWS.forEach((view, index) => {
      const timer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        setMountedLexiconViews((current) => {
          if (current.has(view)) {
            return current;
          }
          const next = new Set(current);
          next.add(view);
          return next;
        });
        logRendererStartupEvent("startup-overlay:prewarm", { view, index });
      }, 280 + index * 420);
      timers.push(timer);
    });

    return () => {
      cancelled = true;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [hasInitialLoadFinished]);

  const promptCards = usePromptCards();
  const popularTags = useMemo(() => getPopularTags(promptCards), [promptCards]);
  const orderedPopularTags = useMemo(
    () => orderTagsWithPreference(popularTags, tagOrder),
    [popularTags, tagOrder],
  );

  useEffect(() => {
    if (sortMode !== "imageSize") {
      return;
    }

    const missingCards = promptCards.filter((card) => card.imageFileName && !imageSizeById.has(card.id));

    if (missingCards.length === 0) {
      return;
    }

    let isCanceled = false;

    void Promise.all(missingCards.map(loadPromptCardImageSize)).then((results) => {
      if (isCanceled) {
        return;
      }

      setImageSizeById((currentSizes) => {
        const nextSizes = new Map(currentSizes);

        for (const result of results) {
          nextSizes.set(result.id, result.size);
        }

        return nextSizes;
      });
    });

    return () => {
      isCanceled = true;
    };
  }, [imageSizeById, promptCards, sortMode]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!importMenuRef.current?.contains(target) && !importMenuContentRef.current?.contains(target)) {
        setIsImportMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsImportMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    // 筛选条件变化时重置可见窗口；删除导致的 displayCount 变化不走这里。
    setVisibleCount(pageSize);
  }, [activeTag, collectionMode, galleryMode, randomSeed, recentImportPinIds, searchQuery, sortDirection, sortMode]);

  const skipNextImportPinClearRef = useRef(true);

  useEffect(() => {
    // 用户主动改排序/筛选后，取消“刚导入置顶”，避免长期干扰既有排序。
    if (skipNextImportPinClearRef.current) {
      skipNextImportPinClearRef.current = false;
      return;
    }

    clearRecentImportPins();
  }, [activeTag, clearRecentImportPins, collectionMode, randomSeed, searchQuery, sortDirection, sortMode]);

  useEffect(() => {
    if (recentImportPinIds.length === 0 || mainView !== "home") {
      return;
    }

    setVisibleCount(pageSize);
    // 导入完成后把列表滚回顶部，确保第一张就是刚导入的提示词组。
    requestAnimationFrame(() => {
      cardsStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [mainView, recentImportPinIds]);

  // 网页助手与创作画布都用 WebContentsView 叠加在主窗口上，两者不可同时可见。
  // 进入网页助手时主动隐藏豆包网页画布；切走网页助手时销毁站点 view，释放渲染进程。
  useEffect(() => {
    if (mainView === "webAssistant") {
      void window.suyanApi.hideDoubaoWebCanvas();
      return;
    }
    void window.suyanApi.hideWebAssistant();
  }, [mainView]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (detailItemId || fullscreenMedia || isBusy) {
        return;
      }

      if (isEditableEventTarget(event.target)) {
        return;
      }

      const clipboardData = event.clipboardData;

      const pastedImageFiles = Array.from(clipboardData?.files ?? []).filter(isDroppableImageFile);

      if (pastedImageFiles.length > 0) {
        event.preventDefault();
        void importDroppedImageFiles(pastedImageFiles);
        return;
      }

      const hasImageItem = Array.from(clipboardData?.items ?? []).some(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      const hasFileReference = Array.from(clipboardData?.types ?? []).includes("Files");

      if (!hasImageItem && !hasFileReference) {
        return;
      }

      event.preventDefault();
      void importClipboardImage();
    }

    document.addEventListener("paste", handlePaste);

    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [detailItemId, fullscreenMedia, isBusy, importClipboardImage]);

  useEffect(() => {
    if (activeTag && !orderedPopularTags.includes(activeTag)) {
      setActiveTag(null);
    }
  }, [activeTag, orderedPopularTags]);

  useEffect(() => {
    if (galleryMode !== "masonry") {
      setIsMasonrySizeControlOpen(false);
    }
  }, [galleryMode]);

  const filteredItems = useMemo(
    () =>
      measureDerivation("filterPromptCards", promptCards.length, () =>
        filterPromptCards(promptCards, {
          query: searchQuery,
          category: allCategoriesValue,
          activeTag,
          sortMode,
          sortDirection,
          imageSizeById,
          randomSeed,
          pinnedItemIds: recentImportPinIds,
        }),
      ),
    [activeTag, imageSizeById, promptCards, randomSeed, recentImportPinIds, searchQuery, sortDirection, sortMode],
  );

  const displayItems = useMemo(
    () => (collectionMode === "featured" ? filterFavoritePromptCards(filteredItems, likedImageIds) : filteredItems),
    [collectionMode, filteredItems, likedImageIds],
  );
  const displayGroups = useMemo(
    () => measureDerivation("groupPromptImages:display", displayItems.length, () => groupPromptImages(displayItems, likedImageIds)),
    [displayItems, likedImageIds],
  );
  const allPromptGroups = useMemo(
    () => measureDerivation("groupPromptImages:all", promptCards.length, () => groupPromptImages(promptCards, likedImageIds)),
    [likedImageIds, promptCards],
  );
  // Keep gallery derivations stable while another view is active. Rebuilding the
  // image-count map on every return invalidates the masonry item array and forces
  // the first material-browser frame to reconcile every visible card again.
  const imageCountByItemId = useMemo(() => buildImageCountByItemId(allPromptGroups), [allPromptGroups]);
  const masonryDisplayItems = useMemo(
    () => measureDerivation("spreadPromptGroups", displayGroups.length, () => spreadPromptGroupImagesWithCount(displayGroups, imageCountByItemId)),
    [displayGroups, imageCountByItemId],
  );
  const displayCount = galleryMode === "grid" ? displayGroups.length : masonryDisplayItems.length;
  const displayCountRef = useRef(displayCount);
  displayCountRef.current = displayCount;
  const homeScrollPerformanceContextRef = useRef({
    galleryMode,
    masonryColumnCount: masonryLayoutColumnCount,
    visibleCount,
  });
  homeScrollPerformanceContextRef.current = {
    galleryMode,
    masonryColumnCount: masonryLayoutColumnCount,
    visibleCount,
  };
  const isInitialLibraryLoading =
    !hasStartupHoldElapsed || !hasInitialLoadFinished || (isLoading && items.length === 0);

  useEffect(() => {
    // 删除后只收敛可见窗口，避免重新从 pageSize 灌入导致滚动卡顿。
    setVisibleCount((current) => Math.min(current, Math.max(displayCount, 0)));
  }, [displayCount]);

  useEffect(() => {
    // Wait until the real home layout is mounted. The home gallery keeps its own
    // scroll panel so switching views does not tear down and rebuild masonry layout.
    if (!hasInitialLoadFinished || isInitialLibraryLoading || mainView !== "home") {
      return;
    }

    const scrollContainer = homeScrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const container = scrollContainer;
    let rafId: number | null = null;

    function checkLoadMore(fillViewportOnly = false) {
      rafId = null;
      const total = displayCountRef.current;
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldLoadMore = fillViewportOnly
        ? container.scrollHeight <= container.clientHeight + 2
        : distanceToBottom < 800;

      if (shouldLoadMore) {
        setVisibleCount((current) => {
          if (current >= total) {
            return current;
          }
          return Math.min(current + pageSize, total);
        });
      }
    }

    function handleScroll() {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => checkLoadMore(false));
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    // The first layout may only add another page when the initial cards do not fill
    // the viewport. Near-bottom prefetching starts after the user actually scrolls.
    rafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(() => checkLoadMore(true));
    });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [displayCount, hasInitialLoadFinished, isInitialLibraryLoading, mainView, masonryLayoutColumnCount, visibleCount]);

  useEffect(() => {
    if (!hasInitialLoadFinished || isInitialLibraryLoading || hasRestoredHomeScrollRef.current) {
      return;
    }

    hasRestoredHomeScrollRef.current = true;
    pendingHomeScrollRestoreRef.current = Math.max(0, Math.trunc(savedMaterialBrowserScrollTop));
    setVisibleCount((current) => Math.max(current, Math.min(pageSize, displayCount)));
  }, [displayCount, hasInitialLoadFinished, isInitialLibraryLoading, savedMaterialBrowserScrollTop]);

  useLayoutEffect(() => {
    const targetScrollTop = pendingHomeScrollRestoreRef.current;
    const container = homeScrollContainerRef.current;
    if (targetScrollTop === null || !container || isInitialLibraryLoading) {
      return;
    }

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScrollTop < targetScrollTop && visibleCount < displayCount) {
      setVisibleCount((current) => Math.min(current + pageSize, displayCount));
      return;
    }

    // 所有卡片已渲染但 scrollHeight 仍不足时，图片可能还在加载中。
    // 使用 ResizeObserver 等待 scrollHeight 增长后再恢复滚动位置。
    if (maxScrollTop < targetScrollTop && visibleCount >= displayCount) {
      let retryCount = 0;
      const maxRetries = 10;
      let resizeObserver: ResizeObserver | null = null;
      let retryTimer: number | null = null;

      const tryRestore = () => {
        const currentMax = Math.max(0, container.scrollHeight - container.clientHeight);
        if (currentMax >= targetScrollTop || retryCount >= maxRetries) {
          if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
          }
          if (retryTimer !== null) {
            window.clearTimeout(retryTimer);
            retryTimer = null;
          }
          const restoredScrollTop = Math.min(targetScrollTop, currentMax);
          container.scrollTop = restoredScrollTop;
          pendingHomeScrollRestoreRef.current = null;
          logRendererStartupEvent("view-scroll:restore", {
            requestedScrollTop: targetScrollTop,
            restoredScrollTop,
            view: "home",
          });
          return;
        }

        retryCount += 1;
        retryTimer = window.setTimeout(tryRestore, 200);
      };

      resizeObserver = new ResizeObserver(() => {
        if (retryTimer !== null) {
          window.clearTimeout(retryTimer);
        }
        retryTimer = window.setTimeout(tryRestore, 50);
      });
      resizeObserver.observe(container);
      retryTimer = window.setTimeout(tryRestore, 200);

      return () => {
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (retryTimer !== null) {
          window.clearTimeout(retryTimer);
        }
      };
    }

    const restoredScrollTop = Math.min(targetScrollTop, maxScrollTop);
    container.scrollTop = restoredScrollTop;
    pendingHomeScrollRestoreRef.current = null;
    logRendererStartupEvent("view-scroll:restore", {
      requestedScrollTop: targetScrollTop,
      restoredScrollTop,
      view: "home",
    });
  }, [displayCount, isInitialLibraryLoading, visibleCount]);

  useEffect(() => {
    if (!hasInitialLoadFinished || isInitialLibraryLoading) {
      return;
    }

    const container = homeScrollContainerRef.current;
    if (!container) {
      return;
    }

    function handleScrollPositionChange() {
      saveMaterialBrowserScrollTop(container?.scrollTop ?? 0);
    }

    container.addEventListener("scroll", handleScrollPositionChange, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScrollPositionChange);
      saveMaterialBrowserScrollTop(container.scrollTop);
    };
  }, [hasInitialLoadFinished, isInitialLibraryLoading, saveMaterialBrowserScrollTop]);

  useEffect(() => {
    if (!hasInitialLoadFinished || isInitialLibraryLoading || mainView !== "home") {
      return;
    }

    const container = homeScrollContainerRef.current;

    if (!container) {
      return;
    }

    const slowFrameThresholdMs = 40;
    const scrollIdleMs = 180;
    let animationFrameId: number | null = null;
    let startedAt = 0;
    let lastFrameAt = 0;
    let lastScrollAt = 0;
    let maxFrameGapMs = 0;
    let slowFrameCount = 0;
    let scrollEventCount = 0;

    function resetSample() {
      startedAt = 0;
      lastFrameAt = 0;
      lastScrollAt = 0;
      maxFrameGapMs = 0;
      slowFrameCount = 0;
      scrollEventCount = 0;
    }

    function finishSample(finishedAt: number) {
      const durationMs = finishedAt - startedAt;

      if (maxFrameGapMs >= slowFrameThresholdMs) {
        const context = homeScrollPerformanceContextRef.current;
        logRendererStartupEvent("home-scroll:slow", {
          displayCount: displayCountRef.current,
          durationMs: Math.round(durationMs),
          galleryMode: context.galleryMode,
          masonryColumnCount: context.masonryColumnCount,
          maxFrameGapMs: Math.round(maxFrameGapMs * 100) / 100,
          scrollEventCount,
          slowFrameCount,
          visibleCount: context.visibleCount,
        });
      }

      resetSample();
    }

    function sampleFrame(now: number) {
      const frameGapMs = now - lastFrameAt;
      lastFrameAt = now;
      maxFrameGapMs = Math.max(maxFrameGapMs, frameGapMs);

      if (frameGapMs >= slowFrameThresholdMs) {
        slowFrameCount += 1;
      }

      if (now - lastScrollAt >= scrollIdleMs) {
        animationFrameId = null;
        finishSample(now);
        return;
      }

      animationFrameId = window.requestAnimationFrame(sampleFrame);
    }

    function handlePerformanceScroll() {
      const now = performance.now();
      lastScrollAt = now;
      scrollEventCount += 1;

      if (animationFrameId !== null) {
        return;
      }

      startedAt = now;
      lastFrameAt = now;
      animationFrameId = window.requestAnimationFrame(sampleFrame);
    }

    container.addEventListener("scroll", handlePerformanceScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handlePerformanceScroll);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [hasInitialLoadFinished, isInitialLibraryLoading, mainView]);

  const visibleGridGroups = useMemo(
    () => displayGroups.slice(0, visibleCount),
    [displayGroups, visibleCount],
  );
  const visibleMasonryItems = useMemo(
    () => masonryDisplayItems.slice(0, visibleCount),
    [masonryDisplayItems, visibleCount],
  );
  const hasVisibleResults = displayCount > 0;
  const detailItem = promptCards.find((item) => item.id === detailItemId) ?? null;
  const detailGroupItems = useMemo(
    () => (detailItem ? getPromptImageGroupItems(detailItem, promptCards, likedImageIds) : []),
    [detailItem, likedImageIds, promptCards],
  );
  const detailGroupIndex = detailItem ? detailGroupItems.findIndex((item) => item.id === detailItem.id) : -1;
  const isDetailOverlayOpen = Boolean(detailItemId || fullscreenMedia);

  useEffect(() => {
    if (isInitialLibraryLoading || hasNotifiedRendererReadyRef.current) {
      return;
    }

    hasNotifiedRendererReadyRef.current = true;
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.suyanApi.notifyRendererReady();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isInitialLibraryLoading]);

  useEffect(() => {
    if (!hasInitialLoadFinished) {
      return;
    }

    const prefetchDetailDialog = () => {
      void loadPromptDetailDialog()
        .then(() => {
          logRendererStartupEvent("detail-dialog:prefetched");
        })
        .catch(() => {
          logRendererStartupEvent("detail-dialog:prefetch-failed");
        });
    };

    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(prefetchDetailDialog, { timeout: 1800 });
        return;
      }

      prefetchDetailDialog();
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasInitialLoadFinished]);

  const handleHomeSearchSubmit = useCallback(() => {
    setVisibleCount(pageSize);
    cardsStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function scrollToTop(behavior: ScrollBehavior = "auto") {
    const activeScrollContainer =
      mainView === "home" ? homeScrollContainerRef.current : scrollContainerRef.current;
    activeScrollContainer?.scrollTo({ top: 0, behavior });
  }

  function scrollHomeToTop() {
    scrollToTop("smooth");
  }

  const openDetailItem = useCallback(
    (itemId: string) => {
      logRendererStartupEvent("detail-open:click", { itemId });
      setDetailItemId(itemId);
      void downloadRemoteMaterial(itemId);
    },
    [downloadRemoteMaterial],
  );
  const handleCopyPromptItem = useCallback(
    (item: PromptCardData) => {
      void copyText(buildPromptText(item), "已复制提示词。");
    },
    [copyText],
  );
  const handleSavePromptLexiconItem = useCallback(
    (itemId: string, patch: Partial<LibraryItem>) =>
      saveItem(itemId, patch, { background: true, silent: true }),
    [saveItem],
  );
  const handleSavePromptLexiconItemsBatch = useCallback(
    (patches: ReadonlyArray<{ itemId: string; patch: Partial<LibraryItem> }>) =>
      saveItemsBatch(patches, { background: true, silent: true }),
    [saveItemsBatch],
  );
  const handleMovePromptGroupsToCategory = useCallback(
    (
      itemIds: readonly string[],
      categoryId: string | null,
      source: "system" | "user" | "ai" = "user",
    ) => movePromptGroupsToCategory(itemIds, categoryId, source),
    [movePromptGroupsToCategory],
  );

  function openMainView(view: LibraryMainView) {
    const startedAt = performance.now();

    logRendererStartupEvent("view-switch:click", { from: mainView, to: view });
    setSidebarActiveView(view);
    setIsImportMenuOpen(false);

    if (view === mainView) {
      logRendererStartupEvent("view-switch:same-view", { view });
      scrollToTop();
      return;
    }

    if (mainView === "home") {
      const scrollTop = homeScrollContainerRef.current?.scrollTop ?? 0;
      saveMaterialBrowserScrollTop(scrollTop);
      logRendererStartupEvent("view-scroll:save", { scrollTop: Math.round(scrollTop), view: "home" });
    }

    viewSwitchStartedAtRef.current = { startedAt, view };
    // Navigation is an urgent interaction. Deferring it with startTransition makes
    // the first material-browser reveal wait behind background renderer work.
    setMainView(view);
    logRendererStartupEvent("view-switch:committed", {
      durationMs: Math.round(performance.now() - startedAt),
      to: view,
    });
  }

  /**
   * 记录「传送到画布」的来源提示词组身份。比对基准取库里已保存的 prompt/negativePrompt
   * （而非详情页未保存的草稿），因为提示词组键是按库里的值算的：详情页改了没保存就传送，
   * 血缘应当立即失效、另立新组。
   */
  function buildCanvasPromptOrigin(item: PromptCardData): CanvasPromptOrigin {
    return {
      itemId: item.id,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      title: item.title,
      tags: item.tags,
      category: item.category === "未分类" ? null : item.category,
      categoryId: item.categoryId,
      genreIds: item.genreIds,
      categoryConfidence: item.categoryConfidence,
      categorySource: item.categorySource ?? null,
    };
  }

  async function pushImageToCanvas(
    item: PromptCardData,
    prompt: string,
    negativePrompt: string,
  ) {
    if (!item.imageFileName) {
      showStatusMessage({ type: "error", text: "当前效果图不可用，无法传送到画布。" });
      return;
    }

    const startedAt = performance.now();
    logRendererStartupEvent("canvas-transfer:click", {
      hasNegativePrompt: Boolean(negativePrompt.trim()),
      hasPrompt: Boolean(prompt.trim()),
    });

    try {
      const url = getImageSrc(item.imageFileName, item.updatedAt);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`IMAGE_FETCH_${response.status}`);
      }
      const responseBlob = await response.blob();
      if (responseBlob.size === 0) {
        throw new Error("IMAGE_RESPONSE_INVALID");
      }
      const blob = await normalizeCanvasReferenceBlob(responseBlob);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          if (!result.startsWith("data:image/")) {
            reject(new Error("IMAGE_DATA_URL_INVALID"));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
      });

      if (
        canvasDraft.referenceImageFileName &&
        canvasDraft.referenceImageFileName !== item.imageFileName
      ) {
        void window.suyanApi.removeCanvasReferenceImage(canvasDraft.referenceImageFileName);
      }

      updateCanvasDraft({
        prompt,
        negativePrompt,
        negativePromptHidden: false,
        referenceImageDataUrl: dataUrl,
        referenceImageTitle: item.title || "参考图",
        referenceImageFileName: item.imageFileName,
        promptOrigin: buildCanvasPromptOrigin(item),
      });
      setDetailItemId(null);
      openMainView("canvas");
      logRendererStartupEvent("canvas-transfer:done", {
        durationMs: Math.round(performance.now() - startedAt),
        hasPrompt: Boolean(prompt.trim()),
        imageBytes: blob.size,
      });
      showStatusMessage({
        type: "success",
        text: prompt.trim() ? "已把效果图及关联提示词传送到画布。" : "已把效果图传送到画布作为参考图。",
      });
    } catch (error) {
      logRendererStartupEvent("canvas-transfer:failed", {
        code: error instanceof Error ? error.message.slice(0, 80) : "CANVAS_TRANSFER_FAILED",
        durationMs: Math.round(performance.now() - startedAt),
      });
      showStatusMessage({ type: "error", text: "读取参考图失败，请重试。" });
    }
  }

  function pushPromptToCanvas(item: PromptCardData, prompt: string, negativePrompt: string) {
    const patch: {
      prompt: string;
      negativePrompt?: string;
      negativePromptHidden?: boolean;
      promptOrigin: CanvasPromptOrigin;
    } = { prompt, promptOrigin: buildCanvasPromptOrigin(item) };
    if (negativePrompt.trim()) {
      patch.negativePrompt = negativePrompt;
      patch.negativePromptHidden = false;
    }
    updateCanvasDraft(patch);
    setDetailItemId(null);
    openMainView("canvas");
    showStatusMessage({ type: "success", text: "已把提示词传送到画布。" });
  }

  function openHomeView() {
    openMainView("home");
  }

  async function generateImagesWithAi(payload: AiImageGenerationPayload) {
    const result = payload.generationProvider === "doubao-web"
      ? await window.suyanApi.generateImagesWithDoubaoWeb(payload)
      : await window.suyanApi.generateImagesWithAi(payload);
    if (!result.ok) {
      showStatusMessage({ type: "error", text: result.error.message });
      return null;
    }
    return result.data;
  }

  const prepareDoubaoWebCanvas = useCallback(async (): Promise<DoubaoWebCanvasStatus | null> => {
    const result = await window.suyanApi.prepareDoubaoWebCanvas();
    if (!result.ok) {
      showStatusMessage({ type: "error", text: result.error.message });
      return null;
    }
    if (result.data.loginRequired) {
      showStatusMessage({ type: "info", text: "请在画布内完成豆包登录，登录后会自动切回原生画布。" });
    }
    return result.data;
  }, [showStatusMessage]);

  const refreshDoubaoWebCanvasAuth = useCallback(async (): Promise<DoubaoWebCanvasStatus | null> => {
    const result = await window.suyanApi.refreshDoubaoWebCanvasAuth();
    if (!result.ok) {
      return null;
    }
    return result.data;
  }, []);

  function closeSettingsDialogs() {
    setIsAiSettingsOpen(false);
    setIsNsfwSettingsOpen(false);
    setIsSystemPreferencesOpen(false);
  }

  function openAiSettings() {
    setSidebarActiveView("aiSettings");
    setIsImportMenuOpen(false);
    closeSettingsDialogs();
    setIsAiSettingsOpen(true);
  }

  function openNsfwSettings() {
    setSidebarActiveView("nsfwSettings");
    setIsImportMenuOpen(false);
    closeSettingsDialogs();
    setIsNsfwSettingsOpen(true);
  }

  function openSystemPreferences(section: SystemPreferenceSection = defaultSystemPreferenceSection) {
    setSystemPreferencesSection(section);
    setSidebarActiveView("systemPreferences");
    setIsImportMenuOpen(false);
    closeSettingsDialogs();
    setIsSystemPreferencesOpen(true);
  }

  async function handleExportLogs(options: LogExportSelection, action: "save" | "feedback") {
    if (isExportingLogs) {
      return;
    }

    setLogExportAction(action);
    showStatusMessage({
      type: "info",
      text: action === "feedback" ? "正在生成日志 ZIP 并打开 GitHub..." : "正在整理并导出日志...",
      autoDismissMs: null,
    });

    try {
      const result = await window.suyanApi.exportLogs({
        ...options,
        format: action === "feedback" ? "zip" : options.format,
        purpose: action,
      });

      if (!result.ok) {
        showStatusMessage({ type: "error", text: result.error.message || "日志导出失败，请稍后重试。" });
        return;
      }

      if (!result.data.exported) {
        if (result.data.entryCount === 0) {
          showStatusMessage({ type: "info", text: "当前筛选条件下没有可导出的日志。" });
        } else {
          showStatusMessage({ type: "info", text: "已取消日志导出。" });
        }
        return;
      }

      if (action === "feedback") {
        showStatusMessage({
          type: "success",
          text:
            result.data.entryCount > 0
              ? "已打开 GitHub，并在资源管理器中选中日志 ZIP；请把它拖入附件区域。"
              : "已打开 GitHub；当前筛选无日志，已生成说明 ZIP 并在资源管理器中选中。",
        });
        setIsLogExportOpen(false);
        return;
      }

      const formatLabel = result.data.format === "zip" ? "ZIP" : "TXT";
      showStatusMessage({
        type: "success",
        text: `已导出 ${result.data.entryCount} 条日志（${formatLabel}）。`,
      });
      setIsLogExportOpen(false);
    } catch {
      showStatusMessage({ type: "error", text: "日志导出失败，请稍后重试。" });
    } finally {
      setLogExportAction(null);
    }
  }

  
  const handleMasonryColumnCountChange = useCallback((nextCount: number) => {
    const normalizedCount = clampMasonryColumnCount(nextCount);
    isMasonryAdjustingRef.current = true;
    // Slider badge updates immediately; gallery layout is rAF + transition so
    // the thumb does not stall on heavy card reflow (was skipping 5→7 etc.).
    setMasonryColumnCount(normalizedCount);

    if (masonryLayoutRafRef.current !== 0) {
      window.cancelAnimationFrame(masonryLayoutRafRef.current);
    }
    masonryLayoutRafRef.current = window.requestAnimationFrame(() => {
      masonryLayoutRafRef.current = 0;
      startTransition(() => {
        setMasonryLayoutColumnCount(normalizedCount);
      });
    });
    }, [saveMasonryTileWidth]);

  const handleMasonryColumnCountCommit = useCallback((nextCount: number) => {
    const normalizedCount = clampMasonryColumnCount(nextCount);

    if (masonryLayoutRafRef.current !== 0) {
      window.cancelAnimationFrame(masonryLayoutRafRef.current);
      masonryLayoutRafRef.current = 0;
    }

    setMasonryColumnCount(normalizedCount);
    setMasonryLayoutColumnCount(normalizedCount);
    void saveMasonryTileWidth(normalizedCount).finally(() => {
      // Allow store→UI sync again after persistence settles.
      window.setTimeout(() => {
        isMasonryAdjustingRef.current = false;
      }, 120);
    });
    }, [saveMasonryTileWidth]);

  const handleCollectionModeChange = useCallback((mode: CollectionMode) => {
    setCollectionMode(mode);
    void saveMaterialBrowserSettings({ materialBrowserCollectionMode: mode });
    }, [saveMaterialBrowserSettings]);

  const handleGalleryModeChange = useCallback((mode: GalleryMode) => {
    setGalleryMode(mode);
    void saveMaterialBrowserSettings({ materialBrowserGalleryMode: mode });
    }, [saveMaterialBrowserSettings]);

  const handleSortDirectionChange = useCallback((direction: PromptSortDirection) => {
    setSortDirection(direction);
    void saveMaterialBrowserSettings({ materialBrowserSortDirection: direction });
    }, [saveMaterialBrowserSettings]);

  const handleSortModeChange = useCallback((mode: PromptSortMode) => {
    const nextRandomSeed = mode === "random" ? randomSeed + 1 : randomSeed;

    setSortMode(mode);

    if (mode === "random") {
      setRandomSeed(nextRandomSeed);
    }

    void saveMaterialBrowserSettings({
      materialBrowserSortMode: mode,
      materialBrowserRandomSeed: nextRandomSeed,
    });
    }, [randomSeed, saveMaterialBrowserSettings]);

  async function importDroppedImageFiles(files: File[]) {
    const imageFiles = files.filter(isDroppableImageFile);

    if (imageFiles.length === 0) {
      return;
    }

    const images = await Promise.all(
      imageFiles.map(async (file) => ({
        name: file.name || "image.png",
        data: await file.arrayBuffer(),
      })),
    );

    await importImageBuffers(images);
  }

  function isGlobalDropDisabled() {
    return isDetailOverlayOpen;
  }

  function handleWindowDragEnter(event: React.DragEvent) {
    if (isGlobalDropDisabled() || !hasDragImagePayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsImageDragOver(true);
  }

  function handleWindowDragOver(event: React.DragEvent) {
    if (isGlobalDropDisabled() || !hasDragImagePayload(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleWindowDragLeave(event: React.DragEvent) {
    if (isGlobalDropDisabled() || !hasDragImagePayload(event.dataTransfer)) {
      return;
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsImageDragOver(false);
    }
  }

  function handleWindowDrop(event: React.DragEvent) {
    dragDepthRef.current = 0;
    setIsImageDragOver(false);

    if (isGlobalDropDisabled()) {
      return;
    }

    const files = Array.from(event.dataTransfer?.files ?? []);
    const hasImagePayload = hasDragImagePayload(event.dataTransfer);

    if (files.length === 0 && !hasImagePayload) {
      return;
    }

    event.preventDefault();

    if (files.length > 0) {
      void importDroppedImageFiles(files);
    }
  }

  function resetFilters() {
    setSearchQuery("");
    setActiveTag(null);
    setSortMode("importedAt");
    setSortDirection("desc");
    setCollectionMode("all");
    void saveMaterialBrowserSettings({
      materialBrowserCollectionMode: "all",
      materialBrowserSortMode: "importedAt",
      materialBrowserSortDirection: "desc",
      materialBrowserRandomSeed: randomSeed,
    });
  }

  function navigateDetail(direction: -1 | 1) {
    if (detailGroupItems.length <= 1 || detailGroupIndex < 0) {
      return;
    }

    const nextIndex = (detailGroupIndex + direction + detailGroupItems.length) % detailGroupItems.length;
    const nextItemId = detailGroupItems[nextIndex].id;
    setDetailItemId(nextItemId);
    void downloadRemoteMaterial(nextItemId);
  }

  async function handleDeleteDetailItem() {
    if (!detailItem) {
      return;
    }

    const itemId = detailItem.id;
    setDetailItemId(null);
    await deleteItems([itemId], true);
  }

  async function handleImportClipboardImageForDetail() {
    if (!detailItem || isBusy) {
      return;
    }

    const importedItemId = await importClipboardImageForItem(detailItem.id);

    if (importedItemId) {
      setDetailItemId(importedItemId);
    }
  }

  async function handleImportImageFilesForDetail() {
    if (!detailItem || isBusy) {
      return;
    }

    const importedItemId = await importImageFilesForItem(detailItem.id);

    if (importedItemId) {
      setDetailItemId(importedItemId);
    }
  }

  function toggleSidebar() {
    const nextIsOpen = !isSidebarOpen;

    if (!nextIsOpen) {
      setIsImportMenuOpen(false);
    }

    setIsSidebarOpen(nextIsOpen);
    storeSidebarOpen(nextIsOpen);
  }

  function applySidebarWidthToDom(nextWidth: number) {
    const sidebarElement = sidebarElementRef.current;
    const scrollContainer = scrollContainerRef.current;

    if (sidebarElement) {
      sidebarElement.style.width = `${nextWidth}px`;
    }

    if (scrollContainer) {
      scrollContainer.style.setProperty("--library-sidebar-width", `${nextWidth}px`);
    }
  }

  function commitSidebarWidth(nextWidth: number) {
    const normalizedWidth = normalizeSidebarWidth(nextWidth);
    sidebarWidthRef.current = normalizedWidth;
    applySidebarWidthToDom(normalizedWidth);
    setSidebarWidth(normalizedWidth);
    storeSidebarWidth(normalizedWidth);
  }

  function resizeSidebarBy(delta: number) {
    commitSidebarWidth(resizeSidebarWidthBy(sidebarWidthRef.current, delta));
  }

  function handleSidebarResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    if (!isSidebarOpen || isSidebarResizingRef.current) {
      return;
    }

    event.preventDefault();
    isSidebarResizingRef.current = true;
    const startX = event.clientX;
    const startWidth = sidebarWidthRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    function handlePointerMove(pointerEvent: PointerEvent) {
      const nextWidth = clampSidebarWidth(startWidth + pointerEvent.clientX - startX);
      sidebarWidthRef.current = nextWidth;
      // Drag updates stay on the DOM so the active button fill tracks the edge
      // without re-rendering the full library tree every pointermove.
      applySidebarWidthToDom(nextWidth);
    }

    function handlePointerUp() {
      isSidebarResizingRef.current = false;
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      commitSidebarWidth(sidebarWidthRef.current);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  if (isInitialLibraryLoading) {
    return <StartupLoadingScreen onSkip={skipStartupIntro} />;
  }

  const isStartupOverlayVisible = !hasPremountedLexicons;
  // Prefer the live ref so incidental re-renders mid-drag do not snap the
  // width CSS variable back to the last committed React state.
  const liveSidebarWidth = sidebarWidthRef.current;
  const scrollContainerStyle = {
    scrollbarGutter: "stable both-edges",
    "--library-sidebar-width": isSidebarOpen ? `${liveSidebarWidth}px` : "0px",
  } as CSSProperties & Record<"--library-sidebar-width", string>;

  return (
    <main
      className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-background text-foreground"
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      <AppTitleBar isSidebarOpen={isSidebarOpen} overlayActive={isDetailOverlayOpen} onToggleSidebar={toggleSidebar} />
      {isDirectoryImportModeOpen ? (
        <DirectoryImportModeDialog
          isBusy={isBusy}
          onClose={() => setIsDirectoryImportModeOpen(false)}
          onCopy={() => {
            setIsDirectoryImportModeOpen(false);
            void importManagedLibraryDirectory();
          }}
          onIndex={() => {
            setIsDirectoryImportModeOpen(false);
            void addAndScanLibraryRoot();
          }}
        />
      ) : null}
      {isLibraryRootsOpen ? (
        <LibraryRootsDialog
          isBusy={isBusy}
          roots={libraryRoots}
          onAdd={() => setIsDirectoryImportModeOpen(true)}
          onClose={() => setIsLibraryRootsOpen(false)}
          onPurgeMissing={(rootId) => void purgeMissingLibraryRootItems(rootId)}
          onRemap={(rootId) => void remapLibraryRoot(rootId)}
          onRemove={(rootId) => void removeLibraryRoot(rootId)}
          onReorder={(rootIds) => void reorderLibraryRoots(rootIds)}
          onScan={(rootId) => void scanLibraryRoot(rootId)}
          onWatchChange={(rootId, enabled) => void setLibraryRootWatch(rootId, enabled)}
          onValidate={() => void validateExternalLibrary()}
        />
      ) : null}
      {isImageDragOver ? <ImageDropOverlay /> : null}
      <div className="flex min-h-0 flex-1">
        {isSidebarOpen ? (
          <LibrarySidebar
            activeView={sidebarActiveView}
            isBusy={isBusy}
            isCompact={sidebarWidth <= compactSidebarBreakpoint}
            isImportMenuOpen={isImportMenuOpen}
            importMenuContentRef={importMenuContentRef}
            importMenuRef={importMenuRef}
            sidebarRef={sidebarElementRef}
            width={liveSidebarWidth}
            onImportClipboardImage={() => {
              setIsImportMenuOpen(false);
              void importClipboardImage();
            }}
            onImportImages={() => {
              setIsImportMenuOpen(false);
              void importImages();
            }}
            onAddLibraryDirectory={() => {
              setIsImportMenuOpen(false);
              setIsDirectoryImportModeOpen(true);
            }}
            onImportZip={() => {
              setIsImportMenuOpen(false);
              void importZip();
            }}
            onImportWordDocument={() => {
              setIsImportMenuOpen(false);
              void importWordDocument();
            }}
            onOpenAbout={() => setIsAboutOpen(true)}
            onOpenAiSettings={openAiSettings}
            onOpenCanvas={() => openMainView("canvas")}
            onOpenWebAssistant={() => openMainView("webAssistant")}
            onOpenNsfwSettings={openNsfwSettings}
            onOpenSystemPreferences={() => openSystemPreferences()}
            onOpenCategoryLexicon={() => openMainView("categoryLexicon")}
            onOpenHome={openHomeView}
            onOpenLibraryRoots={() => setIsLibraryRootsOpen(true)}
            onOpenManager={() => openMainView("promptLibrary")}
            onOpenPromptSites={() => openMainView("promptSites")}
            onOpenTagLexicon={() => openMainView("tagLexicon")}
            onResizeBy={resizeSidebarBy}
            onResizeStart={handleSidebarResizeStart}
            onToggleImportMenu={() => setIsImportMenuOpen((current) => !current)}
            onOpenLogExport={() => setIsLogExportOpen(true)}
          />
        ) : null}
        <div
          ref={scrollContainerRef}
          className="relative min-h-0 flex-1 overflow-y-auto"
          style={scrollContainerStyle}
        >
          <div
            ref={homeScrollContainerRef}
            aria-hidden={mainView !== "home"}
            className={`absolute inset-0 overflow-y-auto ${
              mainView === "home" ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
            }`}
            style={{ scrollbarGutter: "stable both-edges", willChange: "opacity" }}
          >
              <section className={`py-4 min-[1024px]:py-5 ${pageGutterClassName}`}>
                <div className={`${contentShellClassName} grid gap-4`}>
                  <SearchHeroPanel
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSubmit={handleHomeSearchSubmit}
                  />
                </div>
              </section>

              <section className={`pb-6 pt-3 ${pageGutterClassName}`}>
                <div className={contentShellClassName} ref={cardsStartRef}>
                  <GalleryToolbar
                    collectionMode={collectionMode}
                    galleryMode={galleryMode}
                    isMasonrySizeControlOpen={isMasonrySizeControlOpen}
                    masonryColumnCount={masonryColumnCount}
                    resultCount={displayCount}
                    sortDirection={sortDirection}
                    sortMode={sortMode}
                    onCollectionModeChange={handleCollectionModeChange}
                    onGalleryModeChange={handleGalleryModeChange}
                    onMasonrySizeControlOpenChange={setIsMasonrySizeControlOpen}
                    onMasonryColumnCountChange={handleMasonryColumnCountChange}
                    onMasonryColumnCountCommit={handleMasonryColumnCountCommit}
                    onSortDirectionChange={handleSortDirectionChange}
                    onSortModeChange={handleSortModeChange}
                  />

                  {!hasVisibleResults ? (
                    <EmptyPromptList
                      hasItems={items.length > 0}
                      isBusy={isBusy}
                      onImportClipboardImage={() => void importClipboardImage()}
                      onImportImages={() => void importImages()}
                      onResetFilters={resetFilters}
                    />
                  ) : null}

                  {hasVisibleResults ? (
                    galleryMode === "masonry" ? (
                      <MasonryPromptGallery
                        blurNsfwImages={blurNsfwImages}
                        columnCount={masonryLayoutColumnCount}
                        items={visibleMasonryItems}
                        likedImageIds={likedImageIds}
                        onViewDetail={openDetailItem}
                        onPreviewMedia={openFullscreenMedia}
                      />
                    ) : (
                      <GridPromptGallery
                        blurNsfwImages={blurNsfwImages}
                        groups={visibleGridGroups}
                        likedImageIds={likedImageIds}
                        onCopyPrompt={handleCopyPromptItem}
                        onViewDetail={openDetailItem}
                        onPreviewMedia={openFullscreenMedia}
                      />
                    )
                  ) : null}

                </div>
              </section>
              {!isDetailOverlayOpen ? (
                <CardScrollTopButton
                  className="fixed bottom-6 z-50 min-[1024px]:bottom-10 min-[1440px]:bottom-12"
                  contentMaxWidth={contentShellMaxWidth}
                  onClick={scrollHomeToTop}
                />
              ) : null}
          </div>

          {mainView === "canvas" ? (
            <Suspense fallback={<DeferredViewFallback />}>
              <CanvasView
                aiSettings={aiSettings}
                canvasDraft={canvasDraft}
                generationResults={canvasGenerationResults}
                lastGenerationModel={canvasLastModel}
                isBusy={isBusy}
                onDraftChange={updateCanvasDraft}
                onGenerationResultsChange={setCanvasGenerationResults}
                onLastGenerationModelChange={setCanvasLastModel}
                onCopyImage={copyImage}
                onGenerate={generateImagesWithAi}
                onPrepareDoubaoWebCanvas={prepareDoubaoWebCanvas}
                onRefreshDoubaoWebCanvasAuth={refreshDoubaoWebCanvasAuth}
                onImportGeneratedImages={importGeneratedImages}
                onOpenAiSettings={openAiSettings}
                onOptimizePrompt={optimizePromptWithAi}
                onSaveAiActionModelPreference={saveAiActionModelPreference}
                onNotify={showStatusMessage}
              />
            </Suspense>
          ) : null}

          {mainView === "webAssistant" ? (
            <section className={`h-full min-h-0 py-4 min-[1024px]:py-5 ${pageGutterClassName}`}>
              <div className={webAssistantShellClassName}>
                <Suspense fallback={<DeferredViewFallback />}>
                  <WebAssistantView onNotify={showStatusMessage} />
                </Suspense>
              </div>
            </section>
          ) : null}

          {(mainView !== "home" && mainView !== "canvas" && mainView !== "webAssistant") || mountedLexiconViews.size > 0 ? (
            <section
              className={`py-4 min-[1024px]:py-5 ${pageGutterClassName} ${
                mainView === "home" || mainView === "canvas" || mainView === "webAssistant" ? "hidden" : ""
              }`}
            >
              <div className={`${lexiconShellClassName} grid gap-4`}>
                {mainView === "promptLibrary" ? (
                  <Suspense fallback={<DeferredViewFallback />}>
                    <PromptLibraryManagerView
                      isBusy={isBusy}
                      blurNsfwImages={blurNsfwImages}
                      hideScrollTopButton={isDetailOverlayOpen}
                      items={promptCards}
                      onCopy={(item) => void copyText(buildPromptText(item), "已复制提示词。")}
                      onDelete={(itemIds) => deleteItems(itemIds, true)}
                      onExport={(itemIds) => exportZip(itemIds)}
                      onImport={() => void importZip()}
                      onOpenDetail={openDetailItem}
                      onRefreshLibrary={load}
                    />
                  </Suspense>
                ) : null}

                {mainView === "promptSites" ? (
                  <PromptSiteRecommendationsView
                    sites={promptSiteRecommendations}
                    starredUrls={starredRecommendations}
                    onToggleStar={(url) => void toggleRecommendationStar(url)}
                    onCopySiteUrl={(site) => void copyText(site.url, "已复制网址。")}
                    onOpenSite={(site) => void openExternalUrl(site.url, site.title)}
                  />
                ) : null}

                {mountedLexiconViews.has("categoryLexicon") ? (
                  <div className={mainView === "categoryLexicon" ? "contents" : "hidden"}>
                    <PromptLexiconWorkspace
                      kind="categories"
                      blurNsfwImages={blurNsfwImages}
                      isBusy={isBusy}
                      hideScrollTopButton={isDetailOverlayOpen}
                      likedImageIds={likedImageIds}
                      popularTags={orderedPopularTags}
                      promptGroups={allPromptGroups}
                      promptLexicons={promptLexicons}
                      categoryTaxonomy={categoryTaxonomy}
                      onAnalyzePrompt={analyzePromptWithAi}
                      onCopyPrompt={handleCopyPromptItem}
                      onExportLexicon={exportPromptLexicon}
                      onImportLexicon={importPromptLexicon}
                      onImportLexiconImage={importPromptLexiconImage}
                      onOpenDetail={openDetailItem}
                      onDeleteItems={deleteItems}
                      onSaveItem={handleSavePromptLexiconItem}
                      onSaveItemsBatch={handleSavePromptLexiconItemsBatch}
                      onClearLexiconDomain={clearLexiconDomain}
                      onSavePromptLexicons={savePromptLexicons}
                      onMovePromptGroupsToCategory={handleMovePromptGroupsToCategory}
                      onUpsertCustomCategory={upsertCustomCategory}
                      onDeleteCustomCategory={deleteCustomCategory}
                    />
                  </div>
                ) : null}

                {mountedLexiconViews.has("tagLexicon") ? (
                  <div className={mainView === "tagLexicon" ? "contents" : "hidden"}>
                    <PromptLexiconWorkspace
                      kind="tags"
                      blurNsfwImages={blurNsfwImages}
                      isBusy={isBusy}
                      hideScrollTopButton={isDetailOverlayOpen}
                      likedImageIds={likedImageIds}
                      popularTags={orderedPopularTags}
                      promptGroups={allPromptGroups}
                      promptLexicons={promptLexicons}
                      categoryTaxonomy={categoryTaxonomy}
                      onAnalyzePrompt={analyzePromptWithAi}
                      onCopyPrompt={handleCopyPromptItem}
                      onExportLexicon={exportPromptLexicon}
                      onImportLexicon={importPromptLexicon}
                      onImportLexiconImage={importPromptLexiconImage}
                      onOpenDetail={openDetailItem}
                      onDeleteItems={deleteItems}
                      onSaveItem={handleSavePromptLexiconItem}
                      onSaveItemsBatch={handleSavePromptLexiconItemsBatch}
                      onClearLexiconDomain={clearLexiconDomain}
                      onSavePromptLexicons={savePromptLexicons}
                      onMovePromptGroupsToCategory={handleMovePromptGroupsToCategory}
                      onUpsertCustomCategory={upsertCustomCategory}
                      onDeleteCustomCategory={deleteCustomCategory}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <StatusToast
          key={`${statusMessage.type}:${statusMessage.text}`}
          message={statusMessage}
          onClose={clearStatus}
        />
      ) : null}
      {aiErrorDialog ? (
        <AiErrorDialog
          presentation={aiErrorDialog}
          onClose={clearAiErrorDialog}
          onOpenSettings={() => {
            clearAiErrorDialog();
            openAiSettings();
          }}
        />
      ) : null}

      {detailItem ? (
        <Suspense fallback={<PromptDetailFallback />}>
          <PromptDetailDialog
            key={detailItem.id}
            isBusy={isBusy}
            isImageLiked={likedImageIds.includes(detailItem.id)}
            item={detailItem}
            imageCount={detailGroupItems.length}
            imageIndex={detailGroupIndex}
            generationModelOrder={generationModelOrder}
            hiddenGenerationModels={hiddenGenerationModels}
            aiSettings={aiSettings}
            blurNsfwImages={blurNsfwImages}
            knownCategories={photographyCategoryLabels}
            onAnalyzePrompt={analyzePromptWithAi}
            onOptimizePrompt={optimizePromptWithAi}
            onTranslatePrompt={translatePromptWithAi}
            onReverseImagePrompt={reverseImagePromptWithAi}
            onClose={() => setDetailItemId(null)}
            onCopyImage={() => void copyImage(detailItem.imageFileName)}
            onCopyText={(text) => void copyText(text, "已复制提示词。")}
            onDelete={() => void handleDeleteDetailItem()}
            onExportImage={() => void exportImage(detailItem.imageFileName)}
            onImportImages={() => void handleImportImageFilesForDetail()}
            onImportClipboardImage={() => void handleImportClipboardImageForDetail()}
            onPushToCanvas={(prompt, negativePrompt) => void pushImageToCanvas(detailItem, prompt, negativePrompt)}
            onPushPromptToCanvas={(prompt, negativePrompt) => pushPromptToCanvas(detailItem, prompt, negativePrompt)}
            onNavigateNext={() => navigateDetail(1)}
            onNavigatePrevious={() => navigateDetail(-1)}
            onShareGroup={() => {
              if (detailGroupItems.length === 0) {
                return;
              }

              void exportZip(detailGroupItems.map((groupItem) => groupItem.id));
            }}
            onShareText={(text) => void copyText(text, "已复制分享文案。")}
            onSave={(patch) => saveItem(detailItem.id, patch, { background: true, silent: true })}
            onSaveGenerationModelPreferences={(patch) => void saveGenerationModelPreferences(patch)}
            onSaveAiActionModelPreference={saveAiActionModelPreference}
            onSaveAiRecognitionSourcePreferences={saveAiRecognitionSourcePreferences}
            onToggleImageLike={() => void toggleFavoriteImage(detailItem.id)}
            onGenerateVideoFrames={generateVideoFrames}
            onImportVideoReferenceImages={importVideoReferenceImages}
            onDeleteVideoReferenceImage={deleteVideoReferenceImage}
            onImportClipboardReferenceImage={importClipboardReferenceImage}
            onImportReferenceImageFromUrl={importReferenceImageFromUrl}
          />
        </Suspense>
      ) : null}

      {isAiSettingsOpen ? (
        <Suspense fallback={null}>
          <AiSettingsDialog
            isBusy={isBusy}
            settings={aiSettings}
            onClose={() => setIsAiSettingsOpen(false)}
            onSave={saveAiSettings}
            onSaveAiRecognitionSourcePreferences={saveAiRecognitionSourcePreferences}
            onTest={testAiSettings}
            onListModels={listAiModels}
            onCopyApiKey={copyAiApiKey}
            onReadApiKey={async (profileId) => {
              const result = await window.suyanApi.readAiApiKey(profileId);
              return result.ok ? result.data.apiKey : null;
            }}
            onNotify={showStatusMessage}
          />
        </Suspense>
      ) : null}

      {isNsfwSettingsOpen ? (
        <Suspense fallback={null}>
          <NsfwSettingsDialog
            isBusy={isBusy}
            aiSettings={aiSettings}
            autoNsfwGrading={autoNsfwGrading}
            blurNsfwImages={blurNsfwImages}
            nsfwGradingSpeed={nsfwGradingSpeed}
            onClose={() => setIsNsfwSettingsOpen(false)}
            onGradeAllNsfw={(options) => void gradeAllImagesForNsfw(options)}
            onSaveAiSettings={saveAiSettings}
            onSave={saveNsfwSettings}
            onNotify={showStatusMessage}
          />
        </Suspense>
      ) : null}

      {isSystemPreferencesOpen ? (
        <Suspense fallback={null}>
          <SystemPreferencesDialog
            isBusy={isBusy}
            proxySettings={proxySettings}
            section={systemPreferencesSection}
            onClose={() => setIsSystemPreferencesOpen(false)}
            onDetectProxy={detectProxySettings}
            onNotify={showStatusMessage}
            onSaveProxy={saveProxySettings}
            onSectionChange={setSystemPreferencesSection}
            onTestProxy={testProxySettings}
          />
        </Suspense>
      ) : null}

      {isAboutOpen ? <AboutDialog onClose={() => setIsAboutOpen(false)} /> : null}

      {isLogExportOpen ? (
        <LogExportDialog
          activeAction={logExportAction}
          onClose={() => {
            if (!isExportingLogs) {
              setIsLogExportOpen(false);
            }
          }}
          onExport={(options) => void handleExportLogs(options, "save")}
          onFeedback={(options) => void handleExportLogs(options, "feedback")}
        />
      ) : null}

      {fullscreenMedia ? (
        <MediaFullscreenOverlay item={fullscreenMedia} onClose={() => setFullscreenMedia(null)} />
      ) : null}

      {isStartupOverlayVisible ? (
        <div className="absolute inset-0 z-50">
          <StartupLoadingScreen onSkip={skipStartupIntro} />
        </div>
      ) : null}
    </main>
  );
}

type LibrarySidebarProps = {
  activeView: LibrarySidebarActiveView;
  importMenuContentRef: React.RefObject<HTMLDivElement | null>;
  importMenuRef: React.RefObject<HTMLDivElement | null>;
  isBusy: boolean;
  isCompact: boolean;
  isImportMenuOpen: boolean;
  sidebarRef: React.RefObject<HTMLElement | null>;
  width: number;
  onImportClipboardImage: () => void;
  onImportImages: () => void;
  onAddLibraryDirectory: () => void;
  onImportZip: () => void;
  onImportWordDocument: () => void;
  onOpenAbout: () => void;
  onOpenAiSettings: () => void;
  onOpenCanvas: () => void;
  onOpenWebAssistant: () => void;
  onOpenNsfwSettings: () => void;
  onOpenSystemPreferences: () => void;
  onOpenCategoryLexicon: () => void;
  onOpenHome: () => void;
  onOpenLibraryRoots: () => void;
  onOpenManager: () => void;
  onOpenPromptSites: () => void;
  onOpenTagLexicon: () => void;
  onResizeBy: (delta: number) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onToggleImportMenu: () => void;
  onOpenLogExport: () => void;
};

function LibrarySidebar({
  activeView,
  importMenuContentRef,
  importMenuRef,
  isBusy,
  isCompact,
  isImportMenuOpen,
  sidebarRef,
  width,
  onImportClipboardImage,
  onImportImages,
  onAddLibraryDirectory,
  onImportZip,
  onImportWordDocument,
  onOpenAbout,
  onOpenAiSettings,
  onOpenCanvas,
  onOpenWebAssistant,
  onOpenNsfwSettings,
  onOpenSystemPreferences,
  onOpenCategoryLexicon,
  onOpenHome,
  onOpenLibraryRoots,
  onOpenManager,
  onOpenPromptSites,
  onOpenTagLexicon,
  onResizeBy,
  onResizeStart,
  onToggleImportMenu,
  onOpenLogExport,
}: LibrarySidebarProps) {
  const [importMenuStyle, setImportMenuStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!isImportMenuOpen) {
      setImportMenuStyle(null);
      return;
    }

    function updateImportMenuPosition() {
      const anchor = importMenuRef.current;

      if (!anchor) {
        setImportMenuStyle(null);
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const menuGap = 8;
      const menuWidth = 176;
      const menuHeight = 226;
      const canOpenRight = rect.right + menuGap + menuWidth <= window.innerWidth - viewportPadding;
      const left = canOpenRight
        ? rect.right + menuGap
        : Math.max(viewportPadding, rect.left - menuGap - menuWidth);
      const top = Math.min(
        Math.max(viewportPadding, rect.top),
        Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding),
      );

      setImportMenuStyle({
        left,
        position: "fixed",
        top,
        zIndex: 120,
      });
    }

    updateImportMenuPosition();
    window.addEventListener("resize", updateImportMenuPosition);
    window.addEventListener("scroll", updateImportMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateImportMenuPosition);
      window.removeEventListener("scroll", updateImportMenuPosition, true);
    };
  }, [importMenuRef, isImportMenuOpen]);

  return (
    <aside
      ref={sidebarRef}
      className="relative z-20 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-panel/95"
      style={{ width }}
    >
      {/*
        Scroll the menu list so short/low-resolution viewports can still reach
        every item (e.g. 启动图库 / 日志导出). Keep 外观/关于 pinned below.
      */}
      <nav
        aria-label="主导航"
        className={`library-sidebar-nav flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-3 pt-4 [scrollbar-gutter:stable] ${
          isCompact ? "px-2" : "px-3"
        }`}
      >
        <div className="grid min-w-0 gap-1">
          <SidebarSectionLabel isCompact={isCompact}>素材</SidebarSectionLabel>
          <SidebarActionButton
            active={activeView === "home"}
            icon={<LayoutGrid size={17} />}
            isCompact={isCompact}
            label="素材浏览"
            onClick={onOpenHome}
          />
          <SidebarActionButton
            active={activeView === "canvas"}
            icon={<Sparkles size={17} />}
            isCompact={isCompact}
            label={"\u521b\u4f5c\u753b\u5e03"}
            onClick={onOpenCanvas}
          />
          <SidebarActionButton
            active={activeView === "webAssistant"}
            icon={<Compass size={17} />}
            isCompact={isCompact}
            label="网页助手"
            onClick={onOpenWebAssistant}
          />
          <div className="relative min-w-0" ref={importMenuRef}>
            <SidebarActionButton
              ariaExpanded={isImportMenuOpen}
              ariaHasPopup="menu"
              disabled={isBusy}
              icon={<Download size={17} />}
              isCompact={isCompact}
              label="导入素材"
              onClick={onToggleImportMenu}
            />
            {isImportMenuOpen && importMenuStyle
              ? createPortal(
                  <div
                    className="w-fit min-w-40 overflow-hidden rounded-2xl border border-border bg-panel p-1.5 shadow-elevated"
                    ref={importMenuContentRef}
                    role="menu"
                    style={importMenuStyle}
                  >
                    <ImportMenuItem icon={<ImagePlus size={16} />} label="导入图片" onClick={onImportImages} />
                    <ImportMenuItem icon={<FolderTree size={16} />} label="添加目录" onClick={onAddLibraryDirectory} />
                    <ImportMenuItem icon={<Clipboard size={16} />} label="粘贴导入" onClick={onImportClipboardImage} />
                    <ImportMenuItem icon={<FileText size={16} />} label="导入文档" onClick={onImportWordDocument} />
                    <ImportMenuItem icon={<Download size={16} />} label="导入分享" onClick={onImportZip} />
                  </div>,
                  document.body,
                )
              : null}
          </div>
          <SidebarActionButton
            icon={<FolderTree size={17} />}
            isCompact={isCompact}
            label="素材目录"
            onClick={onOpenLibraryRoots}
          />
          <SidebarActionButton
            active={activeView === "promptLibrary"}
            icon={<BookOpen size={17} />}
            isCompact={isCompact}
            label="批量管理"
            onClick={onOpenManager}
          />
        </div>

        <div className="grid min-w-0 gap-1 border-t border-border/80 pt-3">
          <SidebarSectionLabel isCompact={isCompact}>组织</SidebarSectionLabel>
          <SidebarActionButton
            active={activeView === "categoryLexicon"}
            icon={<FolderTree size={17} />}
            isCompact={isCompact}
            label="分类浏览"
            onClick={onOpenCategoryLexicon}
          />
          <SidebarActionButton
            active={activeView === "tagLexicon"}
            icon={<Tags size={17} />}
            isCompact={isCompact}
            label="标签浏览"
            onClick={onOpenTagLexicon}
          />
        </div>

        <div className="grid min-w-0 gap-1 border-t border-border/80 pt-3">
          <SidebarSectionLabel isCompact={isCompact}>资源</SidebarSectionLabel>
          <SidebarActionButton
            active={activeView === "promptSites"}
            icon={<Globe2 size={17} />}
            isCompact={isCompact}
            label="资源推荐"
            onClick={onOpenPromptSites}
          />
        </div>

        <div className="grid min-w-0 gap-1 border-t border-border/80 pt-3">
          <SidebarSectionLabel isCompact={isCompact}>系统</SidebarSectionLabel>
          <SidebarActionButton
            active={activeView === "aiSettings"}
            icon={<Settings size={17} />}
            isCompact={isCompact}
            label="模型配置"
            onClick={onOpenAiSettings}
          />
          <SidebarActionButton
            active={activeView === "nsfwSettings"}
            icon={<Shield size={17} />}
            isCompact={isCompact}
            label="内容分级"
            onClick={onOpenNsfwSettings}
          />
          <SidebarActionButton
            active={activeView === "systemPreferences"}
            icon={<SlidersHorizontal size={17} />}
            isCompact={isCompact}
            label="系统设置"
            onClick={onOpenSystemPreferences}
          />
          <SidebarActionButton
            icon={<ScrollText size={17} />}
            isCompact={isCompact}
            label="日志导出"
            onClick={onOpenLogExport}
          />
        </div>
      </nav>

      <div
        className={`shrink-0 border-t border-border/80 bg-panel/95 pb-3 pt-3 ${isCompact ? "px-2" : "px-3"}`}
      >
        <div className={`grid gap-2 ${isCompact ? "grid-cols-1" : "grid-cols-2"}`}>
          <SidebarThemeButton isBusy={isBusy} isCompact={isCompact} />
          <SidebarActionButton
            icon={<Info size={17} />}
            isCompact={isCompact}
            label="关于"
            onClick={onOpenAbout}
          />
        </div>
      </div>

      <div
        aria-label="调整边栏宽度"
        aria-orientation="vertical"
        aria-valuemax={maxSidebarWidth}
        aria-valuemin={minSidebarWidth}
        aria-valuenow={width}
        className="absolute -right-1 top-0 h-full w-2 cursor-col-resize outline-none after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-primary/35 focus-visible:after:bg-primary/50"
        role="separator"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onResizeBy(-16);
          }

          if (event.key === "ArrowRight") {
            event.preventDefault();
            onResizeBy(16);
          }
        }}
        onPointerDown={onResizeStart}
      />
    </aside>
  );
}

type SidebarSectionLabelProps = {
  children: React.ReactNode;
  isCompact: boolean;
};

function SidebarSectionLabel({ children, isCompact }: SidebarSectionLabelProps) {
  if (isCompact) {
    return <span className="sr-only">{children}</span>;
  }

  return <span className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted">{children}</span>;
}

type SidebarActionButtonProps = {
  active?: boolean;
  ariaExpanded?: boolean;
  ariaHasPopup?: React.AriaAttributes["aria-haspopup"];
  disabled?: boolean;
  icon: React.ReactNode;
  isCompact: boolean;
  label: string;
  onClick: () => void;
};

function SidebarActionButton({
  active = false,
  ariaExpanded,
  ariaHasPopup,
  disabled = false,
  icon,
  isCompact,
  label,
  onClick,
}: SidebarActionButtonProps) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-label={label}
      className={`icon-tooltip-button flex min-h-11 w-full items-center gap-3 rounded-xl border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 ${
        isCompact ? "justify-center px-0" : "justify-start px-3"
      } ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-transparent text-muted hover:border-border hover:bg-background hover:text-foreground"
      }`}
      data-tooltip-align="start"
      data-tooltip-placement="right"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-xl border ${
          active ? "border-primary-foreground/25 bg-primary-foreground/15" : "border-border/70 bg-panel"
        }`}
      >
        {icon}
      </span>
      {isCompact ? null : <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
      {isCompact ? (
        <span className="icon-tooltip-button__bubble" role="tooltip">
          {label}
        </span>
      ) : null}
    </button>
  );
}

type SidebarThemeButtonProps = {
  isBusy: boolean;
  isCompact: boolean;
};

function SidebarThemeButton({ isBusy, isCompact }: SidebarThemeButtonProps) {
  const value = useLibraryStore((state) => state.themeMode);
  const setThemeMode = useLibraryStore((state) => state.setThemeMode);
  const currentOption = themeModeOptions.find((option) => option.value === value) ?? themeModeOptions[0];
  const label = "外观";

  return (
    <SidebarActionButton
      disabled={isBusy}
      icon={currentOption.icon}
      isCompact={isCompact}
      label={label}
      onClick={() => void setThemeMode(getNextThemeMode(value))}
    />
  );
}

type SearchHeroPanelProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSubmit: () => void;
};

const SearchHeroPanel = memo(function SearchHeroPanel({
  searchQuery,
  onSearchChange,
  onSubmit,
}: SearchHeroPanelProps) {
  return (
    <form
      className="w-full rounded-2xl border border-border bg-panel p-3 shadow-elevated transition-all duration-200 focus-within:border-primary focus-within:shadow-image focus-within:ring-4 focus-within:ring-primary/10"
      id="top-main"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid gap-3">
        <div className="grid min-w-0 gap-2">
          <label className="sr-only" htmlFor="prompt-library-search">
            全库搜索
          </label>
          <div className="grid min-h-12 grid-cols-[1fr_auto] items-center rounded-xl border border-border bg-background px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <input
              aria-label="搜索提示词"
              className="min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
              id="prompt-library-search"
              placeholder="搜索标题、文件名、内容或标签"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
            <button
              aria-label="执行搜索"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-elevated transition-colors hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
              type="submit"
            >
              <Search size={18} />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
});

function getNextThemeMode(value: ThemeMode): ThemeMode {
  const currentIndex = themeModeOptions.findIndex((option) => option.value === value);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % themeModeOptions.length;

  return themeModeOptions[nextIndex].value;
}

function clampMasonryColumnCount(count: number): number {
  if (!Number.isFinite(count)) {
    return defaultMasonryColumnCount;
  }
  return Math.min(maxMasonryColumnCount, Math.max(minMasonryColumnCount, Math.round(count)));
}

function migrateTileWidthToColumnCount(tileWidth: number): number {
  // Current schema stores column count directly (2–10).
  if (tileWidth >= minMasonryColumnCount && tileWidth <= maxMasonryColumnCount) {
    return clampMasonryColumnCount(tileWidth);
  }

  // Legacy pixel tile widths → nearest column density (continuous 2–10).
  if (tileWidth <= 150) return 10;
  if (tileWidth <= 180) return 9;
  if (tileWidth <= 210) return 8;
  if (tileWidth <= 250) return 7;
  if (tileWidth <= 300) return 6;
  if (tileWidth <= 350) return 5;
  if (tileWidth <= 420) return 4;
  if (tileWidth <= 520) return 3;
  return 2;
}

const droppableImageExtensions = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

function isDroppableImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";

  return droppableImageExtensions.includes(extension);
}

function hasDragImagePayload(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(dataTransfer.types).includes("Files");
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  return tagName === "INPUT" || tagName === "TEXTAREA" || target.isContentEditable;
}

function loadPromptCardImageSize(card: PromptCardData): Promise<{ id: string; size: number }> {
  return new Promise((resolve) => {
    const image = new window.Image();

    image.onload = () => {
      resolve({ id: card.id, size: image.naturalWidth * image.naturalHeight });
    };
    image.onerror = () => {
      resolve({ id: card.id, size: 0 });
    };
    image.src = getImageSrc(card.imageFileName);
  });
}

type PromptLexiconWorkspaceProps = {
  kind: PromptLexiconKind;
  blurNsfwImages: boolean;
  hideScrollTopButton?: boolean;
  isBusy: boolean;
  likedImageIds: string[];
  popularTags: string[];
  promptGroups: PromptImageGroup[];
  promptLexicons: PromptLexiconSettings | null;
  categoryTaxonomy?: CategoryTaxonomy | null;
  onAnalyzePrompt: (payload: AiAnalyzePromptPayload) => Promise<{
    analysis: {
      primaryCategory: string;
      suggestedCategories: string[];
      suggestedTags: string[];
      taxonomyPrimaryCategoryId?: string | null;
      taxonomyBand?: "high" | "mid" | "low" | "none";
      taxonomyCreatedCategoryIds?: string[];
    };
  }>;
  onCopyPrompt: (item: PromptCardData) => void;
  onExportLexicon: (kind: PromptLexiconKind, items: PromptLexiconEntry[]) => Promise<void>;
  onImportLexicon: (kind: PromptLexiconKind) => Promise<PromptLexiconEntry[] | null>;
  onImportLexiconImage: () => Promise<string | null>;
  onOpenDetail: (itemId: string) => void;
  onDeleteItems: (itemIds: string[], deleteImages: boolean) => Promise<void>;
  onSaveItem: (itemId: string, patch: Partial<LibraryItem>) => Promise<void>;
  onSaveItemsBatch?: (
    patches: ReadonlyArray<{ itemId: string; patch: Partial<LibraryItem> }>,
  ) => Promise<boolean>;
  onClearLexiconDomain?: (domain: "categories" | "tags") => Promise<boolean>;
  onSavePromptLexicons: (
    promptLexicons: PromptLexiconSettings,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  onMovePromptGroupsToCategory: (
    itemIds: readonly string[],
    categoryId: string | null,
    source?: "system" | "user" | "ai",
  ) => Promise<boolean>;
  onUpsertCustomCategory: (input: {
    id?: string | null;
    name: string;
    group?: string | null;
    description?: string | null;
    parentId?: string | null;
  }) => Promise<string | null>;
  onDeleteCustomCategory: (categoryId: string) => Promise<boolean>;
};

type PromptGroupAnalysisOutcome<TPatch> = {
  item: PromptCardData;
  patch: TPatch | null;
  skipped: boolean;
  failed: boolean;
  canceled: boolean;
};

async function analyzePromptGroupBatch<TPatch>(
  groups: readonly PromptImageGroup[],
  shouldSkip: (group: PromptImageGroup) => boolean,
  isCanceled: () => boolean,
  analyze: (item: PromptCardData) => Promise<TPatch | null>,
): Promise<PromptGroupAnalysisOutcome<TPatch>[]> {
  return Promise.all(
    groups.map(async (group) => {
      const item = group.primaryItem;
      if (isCanceled()) {
        return { item, patch: null, skipped: false, failed: false, canceled: true };
      }
      if (shouldSkip(group)) {
        return { item, patch: null, skipped: true, failed: false, canceled: false };
      }

      try {
        const patch = await analyze(item);
        if (isCanceled()) {
          return { item, patch: null, skipped: false, failed: false, canceled: true };
        }
        return { item, patch, skipped: false, failed: !patch, canceled: false };
      } catch {
        return { item, patch: null, skipped: false, failed: true, canceled: false };
      }
    }),
  );
}

async function persistPromptGroupPatches(
  patches: ReadonlyArray<{ itemId: string; patch: Partial<LibraryItem> }>,
  onSaveItem: (itemId: string, patch: Partial<LibraryItem>) => Promise<void>,
  onSaveItemsBatch?: (
    patches: ReadonlyArray<{ itemId: string; patch: Partial<LibraryItem> }>,
  ) => Promise<boolean>,
): Promise<boolean> {
  if (patches.length === 0) {
    return true;
  }
  if (onSaveItemsBatch) {
    return onSaveItemsBatch(patches);
  }
  for (const entry of patches) {
    await onSaveItem(entry.itemId, entry.patch);
  }
  return true;
}

const PromptLexiconWorkspace = memo(function PromptLexiconWorkspace({
  kind,
  blurNsfwImages,
  hideScrollTopButton = false,
  isBusy,
  likedImageIds,
  popularTags,
  promptGroups,
  promptLexicons,
  categoryTaxonomy = null,
  onAnalyzePrompt,
  onCopyPrompt,
  onExportLexicon,
  onImportLexicon,
  onImportLexiconImage,
  onOpenDetail,
  onDeleteItems,
  onSaveItem,
  onSaveItemsBatch,
  onClearLexiconDomain,
  onSavePromptLexicons,
  onMovePromptGroupsToCategory,
  onUpsertCustomCategory,
  onDeleteCustomCategory,
}: PromptLexiconWorkspaceProps) {
  const [categoryDrafts, setCategoryDrafts] = useState(() =>
    createPromptCategoryDrafts(promptLexicons, popularTags, kind === "categories", categoryTaxonomy),
  );
  const [tagImageDrafts, setTagImageDrafts] = useState(() =>
    createPromptTagImageDrafts(promptLexicons, popularTags, kind === "tags"),
  );
  const [selectedCategoryMenuPath, setSelectedCategoryMenuPath] = useState(allCategoryGroupsValue);
  const [selectedTagMenuPath, setSelectedTagMenuPath] = useState(allTagGroupsValue);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [tagImageQuery, setTagImageQuery] = useState("");
  const [selectedCategoryPromptGroups, setSelectedCategoryPromptGroups] = useState<Set<string>>(() => new Set());
  const [selectedTagPromptGroups, setSelectedTagPromptGroups] = useState<Set<string>>(() => new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [categoryAnalysisProgress, setCategoryAnalysisProgress] = useState<CategoryAnalysisProgress | null>(null);
  const [tagAnalysisProgress, setTagAnalysisProgress] = useState<CategoryAnalysisProgress | null>(null);
  const [isTagLexiconMenuReady, setIsTagLexiconMenuReady] = useState(() => kind !== "tags");
  const categoryAnalysisCancelRef = useRef(false);
  const tagAnalysisCancelRef = useRef(false);
  const autoSaveVersionRef = useRef(0);
  const promptLexiconsRef = useRef(promptLexicons);
  promptLexiconsRef.current = promptLexicons;
  const deferredCategoryQuery = useDeferredValue(categoryQuery);
  const deferredSelectedCategoryMenuPath = useDeferredValue(selectedCategoryMenuPath);
  const isCategoryWorkspace = kind === "categories";
  const isTagWorkspace = kind === "tags";

  const meta = getPromptLexiconWorkspaceMeta(kind);
  const categoryPromptGroups = useMemo(
    () => (isCategoryWorkspace || isTagWorkspace ? promptGroups : []),
    [isCategoryWorkspace, isTagWorkspace, promptGroups],
  );
  const categoryLabelsCache = useMemo(() => {
    const cache = new Map<string, string[]>();
    for (const group of categoryPromptGroups) {
      cache.set(group.id, getPromptGroupCategoryLabels(group, categoryTaxonomy));
    }
    return cache;
  }, [categoryPromptGroups, categoryTaxonomy]);
  const tagLabelsCache = useMemo(() => {
    const cache = new Map<string, string[]>();
    for (const group of categoryPromptGroups) {
      cache.set(group.id, getPromptGroupTagLabels(group));
    }
    return cache;
  }, [categoryPromptGroups]);
  const tagPromptGroups = useMemo(
    () => (isTagWorkspace ? categoryPromptGroups.filter((group) => (tagLabelsCache.get(group.id)?.length ?? 0) > 0) : []),
    [categoryPromptGroups, isTagWorkspace, tagLabelsCache],
  );
  const categoryMenuEntries = useMemo(() => {
    if (!isCategoryWorkspace) {
      return [];
    }
    // Always start from full system+custom taxonomy, then merge labels that appear on items.
    const taxonomyEntries = taxonomyToLexiconFallback(categoryTaxonomy);
    const baseEntries =
      taxonomyEntries.length > 0
        ? taxonomyEntries
        : categoryDrafts.length > 0
          ? categoryDrafts
          : [];
    return mergeCategoryLexiconEntriesWithPromptGroups(baseEntries, categoryPromptGroups, categoryLabelsCache);
  }, [categoryDrafts, categoryLabelsCache, categoryPromptGroups, categoryTaxonomy, isCategoryWorkspace]);

  // Keep editable drafts in sync when taxonomy changes (create / rename / delete).
  // Taxonomy is the source of truth — never re-add custom entries that were removed
  // from taxonomy (that used to resurrect deleted categories via autosave).
  useEffect(() => {
    if (!isCategoryWorkspace) {
      return;
    }
    const taxonomyEntries = taxonomyToLexiconFallback(categoryTaxonomy);
    if (taxonomyEntries.length === 0) {
      return;
    }
    setCategoryDrafts((current) => {
      const next = normalizeImageLexiconEntries(taxonomyEntries);
      if (
        current.length === next.length &&
        current.every(
          (entry, index) =>
            entry.id === next[index]?.id &&
            entry.label === next[index]?.label &&
            entry.group === next[index]?.group &&
            entry.parentId === next[index]?.parentId,
        )
      ) {
        return current;
      }
      return next;
    });
    // Taxonomy-driven updates are already persisted by store actions — don't
    // re-trigger "正在自动同步 / 已保存词库" loops.
    setIsDirty(false);
  }, [categoryTaxonomy, isCategoryWorkspace]);
  const visibleCategoryPromptGroups = useMemo(
    () =>
      isCategoryWorkspace
        ? filterPromptGroupsForCategoryMenu(
            categoryPromptGroups,
            categoryMenuEntries,
            deferredSelectedCategoryMenuPath,
            deferredCategoryQuery,
            categoryLabelsCache,
          )
        : [],
    [
      categoryLabelsCache,
      categoryMenuEntries,
      categoryPromptGroups,
      deferredCategoryQuery,
      deferredSelectedCategoryMenuPath,
      isCategoryWorkspace,
    ],
  );
  const tagMenuEntries = useMemo(
    () =>
      isTagWorkspace
        ? isTagLexiconMenuReady
          ? mergeTagLexiconEntriesWithPromptGroups(tagImageDrafts, tagPromptGroups, tagLabelsCache)
          : tagImageDrafts
        : [],
    [isTagLexiconMenuReady, isTagWorkspace, tagImageDrafts, tagLabelsCache, tagPromptGroups],
  );
  const visibleTagPromptGroups = useMemo(
    () =>
      isTagWorkspace
        ? filterPromptGroupsForTagMenu(
            tagPromptGroups,
            tagMenuEntries,
            selectedTagMenuPath,
            tagImageQuery,
            tagLabelsCache,
          )
        : [],
    [isTagWorkspace, selectedTagMenuPath, tagImageQuery, tagLabelsCache, tagMenuEntries, tagPromptGroups],
  );
  const analyzableCategoryPromptGroupCount = useMemo(
    () => (isCategoryWorkspace ? visibleCategoryPromptGroups.filter(shouldAnalyzePromptGroupCategory).length : 0),
    [isCategoryWorkspace, visibleCategoryPromptGroups],
  );
  const tagAnalysisPromptGroupCount = useMemo(
    () => (isTagWorkspace ? categoryPromptGroups.length : 0),
    [categoryPromptGroups, isTagWorkspace],
  );
  const selectedCategoryPromptGroupCount = useMemo(
    () => (isCategoryWorkspace ? countSelectedPromptGroups(selectedCategoryPromptGroups, categoryPromptGroups) : 0),
    [categoryPromptGroups, isCategoryWorkspace, selectedCategoryPromptGroups],
  );
  const selectedTagPromptGroupCount = useMemo(
    () => (isTagWorkspace ? countSelectedPromptGroups(selectedTagPromptGroups, tagPromptGroups) : 0),
    [isTagWorkspace, selectedTagPromptGroups, tagPromptGroups],
  );

  useEffect(() => {
    if (!isCategoryWorkspace) {
      return;
    }

    setSelectedCategoryPromptGroups((current) =>
      pruneSelectionToIds(current, new Set(categoryPromptGroups.map((group) => group.id))),
    );
  }, [categoryPromptGroups, isCategoryWorkspace]);

  useEffect(() => {
    if (!isTagWorkspace) {
      return;
    }

    setSelectedTagPromptGroups((current) =>
      pruneSelectionToIds(current, new Set(tagPromptGroups.map((group) => group.id))),
    );
  }, [isTagWorkspace, tagPromptGroups]);

  useEffect(() => {
    if (!isTagWorkspace) {
      setIsTagLexiconMenuReady(true);
      return;
    }

    setIsTagLexiconMenuReady(false);
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        setIsTagLexiconMenuReady(true);
      }, 0);
    });

    return () => {
      window.cancelAnimationFrame(frame);

      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [isTagWorkspace]);

  useEffect(() => {
    if (!isCategoryWorkspace) {
      return;
    }

    if (
      selectedCategoryMenuPath !== allCategoryGroupsValue &&
      !categoryMenuEntries.some((entry) => matchesImageLexiconMenu(entry, selectedCategoryMenuPath, categoryMenuEntries, "category"))
    ) {
      setSelectedCategoryMenuPath(allCategoryGroupsValue);
    }
  }, [categoryMenuEntries, isCategoryWorkspace, selectedCategoryMenuPath]);

  useEffect(() => {
    if (!isTagWorkspace) {
      return;
    }

    if (
      selectedTagMenuPath !== allTagGroupsValue &&
      countPromptGroupsForTagMenu(tagPromptGroups, tagMenuEntries, selectedTagMenuPath, tagLabelsCache) === 0
    ) {
      setSelectedTagMenuPath(allTagGroupsValue);
    }
  }, [isTagWorkspace, selectedTagMenuPath, tagMenuEntries, tagPromptGroups]);

  function updateCategoryDrafts(updater: React.SetStateAction<PromptImageLexiconEntry[]>) {
    setIsDirty(true);
    setCategoryDrafts(updater);
  }

  function updateTagImageDrafts(updater: React.SetStateAction<PromptImageLexiconEntry[]>) {
    setIsDirty(true);
    setTagImageDrafts(updater);
  }

  // Keep local drafts aligned with the persisted store after clear/import/save
  // from another workspace. Skip while this workspace has unsaved edits.
  useEffect(() => {
    if (isDirty) {
      return;
    }

    if (isTagWorkspace) {
      setTagImageDrafts(createPromptTagImageDrafts(promptLexicons, popularTags, true));
    }
  }, [isDirty, isTagWorkspace, popularTags, promptLexicons]);

  // Repair legacy tag rows after opening the tag workspace. The current draft
  // is normalized for display immediately; this flag lets the existing
  // domain-scoped autosave persist corrected groups without touching the other
  // lexicon domains.
  useEffect(() => {
    if (!isTagWorkspace || !promptLexicons) {
      return;
    }

    const savedTags = promptLexicons.tags ?? [];
    const normalizedTags = normalizeTagImageLexiconEntries(savedTags);
    const savedByLabel = new Map(savedTags.map((entry) => [normalizeLexiconItemKey(entry.label), entry.group]));
    const needsRepair =
      normalizedTags.length !== savedTags.length ||
      normalizedTags.some((entry) => savedByLabel.get(normalizeLexiconItemKey(entry.label)) !== entry.group);

    if (needsRepair) {
      setIsDirty(true);
    }
  }, [isTagWorkspace, promptLexicons]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const saveVersion = autoSaveVersionRef.current + 1;
    autoSaveVersionRef.current = saveVersion;
    const timer = window.setTimeout(() => {
      const currentPromptLexicons = promptLexiconsRef.current;
      // Only persist the active domain. Each lexicon view mounts its own workspace
      // and keeps sibling drafts frozen at mount-time; writing all three domains
      // would resurrect tags/categories the user just cleared elsewhere.
      const nextLexicons: PromptLexiconSettings = {
        categories: isCategoryWorkspace
          ? normalizeImageLexiconEntries(categoryDrafts)
          : (currentPromptLexicons?.categories ?? []),
        tags: isTagWorkspace
          ? normalizeTagImageLexiconEntries(tagImageDrafts)
          : (currentPromptLexicons?.tags ?? []),
      };

      void onSavePromptLexicons(nextLexicons, { silent: true }).then((saved) => {
        if (saved && autoSaveVersionRef.current === saveVersion) {
          setIsDirty(false);
        }
      });
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    categoryDrafts,
    isCategoryWorkspace,
    isDirty,
    isTagWorkspace,
    onSavePromptLexicons,
    tagImageDrafts,
  ]);

  async function handleImportCategories() {
    const importedItems = await onImportLexicon("categories");

    if (!importedItems) {
      return;
    }

    updateCategoryDrafts(importedItems.filter(isPromptImageLexiconEntry));
    setSelectedCategoryMenuPath(allCategoryGroupsValue);
  }

  async function handleImportTagImages() {
    const importedItems = await onImportLexicon("tags");

    if (!importedItems) {
      return;
    }

    updateTagImageDrafts(normalizeTagImageLexiconEntries(importedItems.filter(isPromptImageLexiconEntry)));
    setSelectedTagMenuPath(allTagGroupsValue);
  }

  async function handleUploadImage(entryKind: "categories" | "tags", entryId: string) {
    const imageFileName = await onImportLexiconImage();

    if (!imageFileName) {
      return;
    }

    if (entryKind === "categories") {
      updateCategoryDrafts((currentDrafts) =>
        currentDrafts.map((entry) => (entry.id === entryId ? { ...entry, imageFileName } : entry)),
      );
      return;
    }

    updateTagImageDrafts((currentDrafts) =>
      currentDrafts.map((entry) => (entry.id === entryId ? { ...entry, imageFileName } : entry)),
    );
  }

  async function handleResetAndReanalyzeCategories() {
    if (isBusy || categoryAnalysisProgress?.status === "running") {
      return;
    }
    if (!onClearLexiconDomain) {
      showLexiconStatus({ type: "error", text: "清空接口不可用，请重启应用。" });
      return;
    }

    setCategoryAnalysisProgress({
      analyzed: 0,
      currentTitle: "",
      failed: 0,
      message: "正在清空素材分类并同步词库…",
      processed: 0,
      skipped: 0,
      status: "running",
      total: 1,
    });

    const ok = await onClearLexiconDomain("categories");
    if (!ok) {
      setCategoryAnalysisProgress((current) =>
        current ? { ...current, status: "canceled", message: "清空失败，请重试。" } : current,
      );
      return;
    }

    // Local drafts: keep only system taxonomy leaves for navigation.
    const systemOnly = taxonomyToLexiconFallback(categoryTaxonomy).filter(
      (entry) => entry.id.startsWith("system:") || entry.id.startsWith("group:"),
    );
    setCategoryDrafts(systemOnly);
    setIsDirty(false);
    setSelectedCategoryMenuPath(allCategoryGroupsValue);
    setSelectedCategoryPromptGroups(new Set());
    setCategoryAnalysisProgress({
      analyzed: 1,
      currentTitle: "",
      failed: 0,
      message: "已清空素材分类。系统目录保留；需要时点「AI分类」。",
      processed: 1,
      skipped: 0,
      status: "completed",
      total: 1,
    });
    showLexiconStatus({
      type: "success",
      text: "已清空素材分类并写入磁盘（未自动分析）。",
    });
    logRendererStartupEvent("lexicon:clear-categories:done", { domain: "categories" });
  }

  async function handleResetAndReanalyzeTags() {
    if (isBusy || tagAnalysisProgress?.status === "running") {
      return;
    }
    if (!onClearLexiconDomain) {
      showLexiconStatus({ type: "error", text: "清空接口不可用，请重启应用。" });
      return;
    }

    setTagAnalysisProgress({
      analyzed: 0,
      currentTitle: "",
      failed: 0,
      message: "正在清空素材标签与标签词库…",
      processed: 0,
      skipped: 0,
      status: "running",
      total: 1,
    });

    const ok = await onClearLexiconDomain("tags");
    if (!ok) {
      setTagAnalysisProgress((current) =>
        current ? { ...current, status: "canceled", message: "清空失败，请重试。" } : current,
      );
      return;
    }

    setTagImageDrafts([]);
    setIsDirty(false);
    setSelectedTagMenuPath(allTagGroupsValue);
    setSelectedTagPromptGroups(new Set());
    setTagAnalysisProgress({
      analyzed: 1,
      currentTitle: "",
      failed: 0,
      message: "已清空素材标签与标签词库。需要时点「AI标签」。",
      processed: 1,
      skipped: 0,
      status: "completed",
      total: 1,
    });
    showLexiconStatus({
      type: "success",
      text: "已清空标签（素材 + 词库目录）并写入磁盘（未自动分析）。",
    });
    logRendererStartupEvent("lexicon:clear-tags:done", { domain: "tags" });
  }

  async function handleAnalyzeVisibleCategoryPromptGroups(options: { force?: boolean } = {}) {
    const force = options.force === true;
    const groupsToAnalyze = force ? categoryPromptGroups : visibleCategoryPromptGroups;

    if (categoryAnalysisProgress?.status === "running" || groupsToAnalyze.length === 0) {
      return;
    }

    categoryAnalysisCancelRef.current = false;
    setCategoryAnalysisProgress({
      analyzed: 0,
      currentTitle: "",
      failed: 0,
      message: `准备分析 ${groupsToAnalyze.length} 个提示词组。`,
      processed: 0,
      skipped: 0,
      status: "running",
      total: groupsToAnalyze.length,
    });

    let analyzed = 0;
    let failed = 0;
    let processed = 0;
    let skipped = 0;
    let consecutiveFailures = 0;

    const analysisBatchSize = 2;
    for (let batchStart = 0; batchStart < groupsToAnalyze.length; batchStart += analysisBatchSize) {
      if (categoryAnalysisCancelRef.current) {
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `已取消，处理 ${processed}/${groupsToAnalyze.length} 个提示词组。`,
          processed,
          skipped,
          status: "canceled",
          total: groupsToAnalyze.length,
        });
        return;
      }

      const batch = groupsToAnalyze.slice(batchStart, batchStart + analysisBatchSize);
      setCategoryAnalysisProgress({
        analyzed,
        currentTitle: batch[0]?.primaryItem.title || "未命名提示词",
        failed,
        message: `正在并行分析 ${batch.length} 个提示词组...`,
        processed,
        skipped,
        status: "running",
        total: groupsToAnalyze.length,
      });

      const outcomes = await analyzePromptGroupBatch(
        batch,
        (group) =>
          (!force && !shouldAnalyzePromptGroupCategory(group)) ||
          (isVideoMediaFile(group.primaryItem.imageFileName) && !group.primaryItem.prompt.trim()),
        () => categoryAnalysisCancelRef.current,
        async (item) => {
          const usePromptAnalysis = isVideoMediaFile(item.imageFileName);
          const result = await onAnalyzePrompt({
            target: usePromptAnalysis ? "prompt-category" : "image-category",
            title: usePromptAnalysis ? item.title : "",
            imageFileName: usePromptAnalysis ? undefined : item.imageFileName,
            prompt: usePromptAnalysis ? item.prompt : "",
            negativePrompt: "",
            tags: [],
            category: item.category,
            knownCategories: photographyCategoryLabels,
            runInBackground: true,
          });
          return buildPromptGroupCategoryPatch(
            item,
            result.analysis,
            useLibraryStore.getState().categoryTaxonomy ?? categoryTaxonomy,
          );
        },
      );

      const patches = outcomes.flatMap((outcome) =>
        outcome.patch ? [{ itemId: outcome.item.id, patch: outcome.patch }] : [],
      );
      const saved = await persistPromptGroupPatches(patches, onSaveItem, onSaveItemsBatch);
      const batchSuccessCount = saved ? patches.length : 0;
      analyzed += batchSuccessCount;
      skipped += outcomes.filter((outcome) => outcome.skipped).length;
      failed += outcomes.filter((outcome) => outcome.failed).length + (saved ? 0 : patches.length);
      processed += outcomes.length;

      for (const outcome of outcomes) {
        if (outcome.canceled) {
          continue;
        }
        if (outcome.skipped) {
          continue;
        }
        if (outcome.patch && saved) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
        }
      }

      if (useLibraryStore.getState().aiAnalysisCircuitOpen) {
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: "AI 连续请求失败，已停止本轮批量分析。",
          processed,
          skipped,
          status: "completed",
          total: groupsToAnalyze.length,
        });
        return;
      }

      if (categoryAnalysisCancelRef.current || outcomes.some((outcome) => outcome.canceled)) {
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `已取消，处理 ${processed}/${groupsToAnalyze.length} 个提示词组。`,
          processed,
          skipped,
          status: "canceled",
          total: groupsToAnalyze.length,
        });
        return;
      }

      if (consecutiveFailures >= 3) {
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `连续 ${consecutiveFailures} 组无有效分类，已停止。请检查或更换模型。`,
          processed,
          skipped,
          status: "completed",
          total: groupsToAnalyze.length,
        });
        return;
      }

      setCategoryAnalysisProgress({
        analyzed,
        currentTitle: batch.at(-1)?.primaryItem.title || "未命名提示词",
        failed,
        message: `已完成 ${processed}/${groupsToAnalyze.length} 个提示词组。`,
        processed,
        skipped,
        status: "running",
        total: groupsToAnalyze.length,
      });
      await waitForInteractionFrame();
    }

    setCategoryAnalysisProgress({
      analyzed,
      currentTitle: "",
      failed,
      message: `分析完成：更新 ${analyzed} 个，跳过 ${skipped} 个，失败 ${failed} 个。`,
      processed: groupsToAnalyze.length,
      skipped,
      status: "completed",
      total: groupsToAnalyze.length,
    });
  }

  async function handleAnalyzeVisibleTagPromptGroups(options: { force?: boolean } = {}) {
    const force = options.force === true;
    // AI 标签必须能够从零建立标签库，因此强制分析范围使用全部提示词组，
    // 不能只取已经存在标签的分组。
    const groupsToAnalyze = force ? categoryPromptGroups : visibleTagPromptGroups;

    if (tagAnalysisProgress?.status === "running" || groupsToAnalyze.length === 0) {
      return;
    }

    tagAnalysisCancelRef.current = false;
    setTagAnalysisProgress({
      analyzed: 0,
      currentTitle: "",
      failed: 0,
      message: `准备分析 ${groupsToAnalyze.length} 个提示词组。`,
      processed: 0,
      skipped: 0,
      status: "running",
      total: groupsToAnalyze.length,
    });

    let analyzed = 0;
    let failed = 0;
    let processed = 0;
    let skipped = 0;
    let consecutiveFailures = 0;

    const analysisBatchSize = 2;
    for (let batchStart = 0; batchStart < groupsToAnalyze.length; batchStart += analysisBatchSize) {
      if (tagAnalysisCancelRef.current) {
        setTagAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `已取消，处理 ${processed}/${groupsToAnalyze.length} 个提示词组。`,
          processed,
          skipped,
          status: "canceled",
          total: groupsToAnalyze.length,
        });
        return;
      }

      const batch = groupsToAnalyze.slice(batchStart, batchStart + analysisBatchSize);
      setTagAnalysisProgress({
        analyzed,
        currentTitle: batch[0]?.primaryItem.title || "未命名提示词",
        failed,
        message: `正在并行分析 ${batch.length} 个提示词组...`,
        processed,
        skipped,
        status: "running",
        total: groupsToAnalyze.length,
      });

      const outcomes = await analyzePromptGroupBatch(
        batch,
        (group) =>
          (!force && !shouldAnalyzePromptGroupTags(group)) ||
          (isVideoMediaFile(group.primaryItem.imageFileName) && !group.primaryItem.prompt.trim()),
        () => tagAnalysisCancelRef.current,
        async (item) => {
          const usePromptAnalysis = isVideoMediaFile(item.imageFileName);
          const result = await onAnalyzePrompt({
            target: usePromptAnalysis ? "prompt-tags" : "image-tags",
            title: usePromptAnalysis ? item.title : "",
            imageFileName: usePromptAnalysis ? undefined : item.imageFileName,
            prompt: usePromptAnalysis ? item.prompt : "",
            negativePrompt: "",
            tags: [],
            category: item.category,
            runInBackground: true,
          });
          return buildPromptGroupTagPatch(item, result.analysis);
        },
      );

      const patches = outcomes.flatMap((outcome) =>
        outcome.patch ? [{ itemId: outcome.item.id, patch: outcome.patch }] : [],
      );
      const saved = await persistPromptGroupPatches(patches, onSaveItem, onSaveItemsBatch);
      const batchSuccessCount = saved ? patches.length : 0;
      analyzed += batchSuccessCount;
      skipped += outcomes.filter((outcome) => outcome.skipped).length;
      failed += outcomes.filter((outcome) => outcome.failed).length + (saved ? 0 : patches.length);
      processed += outcomes.length;

      for (const outcome of outcomes) {
        if (outcome.canceled || outcome.skipped) {
          continue;
        }
        if (outcome.patch && saved) {
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
        }
      }

      if (tagAnalysisCancelRef.current || outcomes.some((outcome) => outcome.canceled)) {
        setTagAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `已取消，处理 ${processed}/${groupsToAnalyze.length} 个提示词组。`,
          processed,
          skipped,
          status: "canceled",
          total: groupsToAnalyze.length,
        });
        return;
      }

      if (consecutiveFailures >= 3) {
        setTagAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `连续 ${consecutiveFailures} 组无有效标签，已停止。请检查或更换模型。`,
          processed,
          skipped,
          status: "completed",
          total: groupsToAnalyze.length,
        });
        return;
      }

      setTagAnalysisProgress({
        analyzed,
        currentTitle: batch.at(-1)?.primaryItem.title || "未命名提示词",
        failed,
        message: `已完成 ${processed}/${groupsToAnalyze.length} 个提示词组。`,
        processed,
        skipped,
        status: "running",
        total: groupsToAnalyze.length,
      });
      await waitForInteractionFrame();
    }

    setTagAnalysisProgress({
      analyzed,
      currentTitle: "",
      failed,
      message: `分析完成：更新 ${analyzed} 个，跳过 ${skipped} 个，失败 ${failed} 个。`,
      processed: groupsToAnalyze.length,
      skipped,
      status: "completed",
      total: groupsToAnalyze.length,
    });
  }

  function handleCancelCategoryAnalysis() {
    categoryAnalysisCancelRef.current = true;
    setCategoryAnalysisProgress((current) =>
      current?.status === "running"
        ? {
            ...current,
            message: "正在取消，当前请求后停止...",
          }
        : current,
    );
  }

  function handleCancelTagAnalysis() {
    tagAnalysisCancelRef.current = true;
    setTagAnalysisProgress((current) =>
      current?.status === "running"
        ? {
            ...current,
            message: "正在取消，当前请求后停止...",
          }
        : current,
    );
  }

  async function handleDeleteSelectedCategoryPromptGroups() {
    const items = collectSelectedPromptGroupItems(categoryPromptGroups, selectedCategoryPromptGroups);
    if (items.length === 0) {
      setSelectedCategoryPromptGroups(new Set());
      showLexiconStatus({ type: "info", text: "请先勾选要移出的提示词组。" });
      logRendererStartupEvent("lexicon:remove-category:empty-selection");
      return;
    }

    // Prefer taxonomy-aware move (clears categoryId without deleting prompts / materials).
    if (selectedCategoryMenuPath !== allCategoryGroupsValue) {
      const ok = await onMovePromptGroupsToCategory(
        items.map((item) => item.id),
        null,
      );
      setSelectedCategoryPromptGroups(new Set());
      if (ok) {
        // movePromptGroupsToCategory already shows success toast.
        logRendererStartupEvent("lexicon:remove-category:done", {
          mode: "taxonomy-clear",
          count: items.length,
        });
      }
      return;
    }

    // 「全部分类」无法指定要移出的分类：只提示，绝不删除素材。
    showLexiconStatus({
      type: "info",
      text: "请先在左侧选择具体分类，再点「移出分类」。此操作不会删除素材。",
    });
    logRendererStartupEvent("lexicon:remove-category:need-menu", {
      selectedCount: items.length,
    });
  }

  async function handleCreateCustomCategory(options: {
    asChild: boolean;
    group?: string | null;
    parentId?: string | null;
  }) {
    if (isBusy) {
      return;
    }

    const parentEntry = options.asChild
      ? options.parentId
        ? categoryMenuEntries.find((entry) => entry.id === options.parentId) ?? null
        : resolveSelectedCategoryParentEntry(selectedCategoryMenuPath, categoryMenuEntries)
      : null;

    if (options.asChild && !parentEntry) {
      showLexiconStatus({
        type: "info",
        text: "请先在左侧选择一个父分类，再新增子分类。",
      });
      return;
    }

    const groupLabel =
      (options.asChild && parentEntry
        ? parentEntry.group
        : options.group?.trim() || defaultCategoryGroupLabel) || defaultCategoryGroupLabel;

    const draft = createBlankImageEntry(
      "category",
      options.asChild && parentEntry
        ? {
            group: groupLabel,
            label: "新子分类",
            parentId: parentEntry.id,
          }
        : {
            group: groupLabel,
            label: "新分类",
            parentId: null,
          },
    );

    updateCategoryDrafts((currentDrafts) => [draft, ...currentDrafts]);
    const createdId = await onUpsertCustomCategory({
      id: draft.id,
      name: draft.label,
      group: draft.group || defaultCategoryGroupLabel,
      parentId: draft.parentId ?? null,
    });

    if (createdId) {
      setSelectedCategoryMenuPath(createImageCategoryMenuValue(createdId));
      showLexiconStatus({
        type: "success",
        text: options.asChild
          ? `已在「${parentEntry?.label || "父分类"}」下新增子分类，可直接改名。`
          : "已新增自定义分类，可直接改名。",
      });
      logRendererStartupEvent("lexicon:create-category", {
        asChild: options.asChild,
        parentId: draft.parentId,
        categoryId: createdId,
        group: draft.group,
      });
    }
  }

  function canCreateChildCustomCategory(
    menuPath: string,
    entries: readonly PromptImageLexiconEntry[],
  ): boolean {
    return Boolean(resolveSelectedCategoryParentEntry(menuPath, entries));
  }

  function resolveSelectedCategoryParentEntry(
    menuPath: string,
    entries: readonly PromptImageLexiconEntry[],
  ): PromptImageLexiconEntry | null {
    if (!menuPath.startsWith(imageCategoryMenuPrefix)) {
      return null;
    }
    const entryId = menuPath.slice(imageCategoryMenuPrefix.length);
    if (!entryId || entryId.startsWith("group:")) {
      return null;
    }
    return entries.find((entry) => entry.id === entryId) ?? null;
  }

  async function handleDeleteSelectedTagPromptGroups() {
    const labelKeys = getSelectedTagLabelKeys(tagMenuEntries, selectedTagMenuPath);
    const items = collectSelectedPromptGroupItems(tagPromptGroups, selectedTagPromptGroups);

    if (items.length === 0) {
      setSelectedTagPromptGroups(new Set());
      showLexiconStatus({ type: "info", text: "请先勾选要移出的提示词组。" });
      logRendererStartupEvent("lexicon:remove-tag:empty-selection");
      return;
    }

    // 「全部标签」没有可移出的具体标签：原先静默 return，表现为「删除选中没反应」。
    if (labelKeys === null || labelKeys.size === 0) {
      showLexiconStatus({
        type: "info",
        text: "请先在左侧选择具体标签，再点「移出标签」。此操作只去掉标签，不会删除素材。",
      });
      logRendererStartupEvent("lexicon:remove-tag:need-menu", {
        selectedCount: items.length,
        menuPath: selectedTagMenuPath,
      });
      return;
    }

    let updatedCount = 0;
    const patches: Array<{ itemId: string; patch: Partial<LibraryItem> }> = [];
    for (const item of items) {
      const patch = buildRemoveLabelsPatch(item, labelKeys);
      if (patch) {
        patches.push({ itemId: item.id, patch });
        updatedCount += 1;
      }
    }

    if (patches.length > 0) {
      if (onSaveItemsBatch) {
        await onSaveItemsBatch(patches);
      } else {
        for (const entry of patches) {
          await onSaveItem(entry.itemId, entry.patch);
        }
      }
    }

    setSelectedTagPromptGroups(new Set());
    if (updatedCount > 0) {
      showLexiconStatus({
        type: "success",
        text: `已从 ${updatedCount} 个提示词组移出标签（素材未删除）。`,
      });
      logRendererStartupEvent("lexicon:remove-tag:done", {
        count: updatedCount,
        menuPath: selectedTagMenuPath,
      });
    } else {
      showLexiconStatus({
        type: "info",
        text: "选中的提示词组不包含当前标签，无需移出。",
      });
      logRendererStartupEvent("lexicon:remove-tag:noop", {
        selectedCount: items.length,
        menuPath: selectedTagMenuPath,
      });
    }
  }

  async function handleDeleteSelectedTag(): Promise<boolean> {
    const labelKeys = getSelectedTagLabelKeys(tagMenuEntries, selectedTagMenuPath);
    if (!labelKeys || labelKeys.size === 0) {
      showLexiconStatus({ type: "info", text: "请先在左侧选择具体标签，再删除标签。" });
      return false;
    }

    const patches: Array<{ itemId: string; patch: Partial<LibraryItem> }> = [];
    const seenItemIds = new Set<string>();
    for (const group of tagPromptGroups) {
      for (const item of group.items) {
        if (seenItemIds.has(item.id)) {
          continue;
        }
        seenItemIds.add(item.id);
        const patch = buildRemoveLabelsPatch(item, labelKeys);
        if (patch) {
          patches.push({ itemId: item.id, patch });
        }
      }
    }

    if (patches.length > 0) {
      if (onSaveItemsBatch) {
        const saved = await onSaveItemsBatch(patches);
        if (!saved) {
          return false;
        }
      } else {
        for (const entry of patches) {
          await onSaveItem(entry.itemId, entry.patch);
        }
      }
    }

    updateTagImageDrafts((currentDrafts) =>
      currentDrafts.filter((entry) => !labelKeys.has(normalizeLexiconItemKey(entry.label))),
    );
    setSelectedTagMenuPath(allTagGroupsValue);
    setSelectedTagPromptGroups(new Set());
    showLexiconStatus({
      type: "success",
      text: `已删除标签「${getTagPromptMenuDisplayLabel(selectedTagMenuPath, tagMenuEntries)}」，素材未删除。`,
    });
    return true;
  }

  function showLexiconStatus(message: { type: "info" | "success" | "error"; text: string }) {
    useLibraryStore.getState().showStatusMessage(message);
  }

  const syncStatusBadge = (
    <span className="rounded-md border border-capsule-fog-border bg-capsule-fog px-2 py-1 text-xs text-capsule-fog-foreground">
      {isDirty ? "正在自动同步" : "当前已同步"}
    </span>
  );

  return (
    <section className="grid gap-4">
      {kind === "categories" ? (
        <LexiconSection
          bodyClassName="min-h-0 overflow-visible"
          count={categoryPromptGroups.length}
          description={meta.description}
          eyebrow={meta.eyebrow}
          statusBadge={syncStatusBadge}
          icon={meta.icon}
          isBusy={isBusy}
          hideScrollTopButton={hideScrollTopButton}
          layout="page"
          query={categoryQuery}
          searchPlaceholder={meta.searchPlaceholder}
          selectedCount={selectedCategoryPromptGroupCount}
          toolbarLeadingAction={
            <Button
              icon={<Sparkles size={16} />}
              disabled={
                isBusy ||
                categoryAnalysisProgress?.status === "running" ||
                visibleCategoryPromptGroups.length === 0 ||
                analyzableCategoryPromptGroupCount === 0
              }
              onClick={() => void handleAnalyzeVisibleCategoryPromptGroups()}
            >
              {categoryAnalysisProgress?.status === "running" ? "分析中" : "AI分类"}
            </Button>
          }
          title={meta.title}
          onAdd={() => {
            void handleCreateCustomCategory({ asChild: false });
          }}
          toolbarExtra={
            <Button
              icon={<RefreshCw size={16} />}
              disabled={isBusy || categoryAnalysisProgress?.status === "running" || categoryPromptGroups.length === 0}
              title="清空全部分类（不会自动分析；需要时再点「AI分类」）"
              onClick={() => void handleResetAndReanalyzeCategories()}
            >
              清空分类
            </Button>
          }
          deleteSelectedLabel="移出分类"
          showToolbarDelete={false}
          onDeleteSelected={() => void handleDeleteSelectedCategoryPromptGroups()}
          onExport={() => void onExportLexicon("categories", categoryDrafts)}
          onImport={() => void handleImportCategories()}
          onQueryChange={setCategoryQuery}
        >
          <CategoryPromptGroupExplorer
            blurNsfwImages={blurNsfwImages}
            categoryLabelsCache={categoryLabelsCache}
            categoryTaxonomy={categoryTaxonomy}
            entries={categoryMenuEntries}
            analysisProgress={categoryAnalysisProgress}
            isBusy={isBusy}
            likedImageIds={likedImageIds}
            layout="page"
            promptGroups={categoryPromptGroups}
            query={categoryQuery}
            selectedMenuPath={selectedCategoryMenuPath}
            selectedPromptGroupIds={selectedCategoryPromptGroups}
            onCopyPrompt={onCopyPrompt}
            onCancelAnalysis={handleCancelCategoryAnalysis}
            onChangeEntry={(entryId, patch) =>
              updateCategoryDrafts((currentDrafts) =>
                currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, ...patch } : draft)),
              )
            }
            onDeleteCustomCategory={onDeleteCustomCategory}
            onMovePromptGroupsToCategory={onMovePromptGroupsToCategory}
            onOpenDetail={onOpenDetail}
            onRemoveSelectedPromptGroups={() => void handleDeleteSelectedCategoryPromptGroups()}
            onSelectAllPromptGroups={(groupIds) => setSelectedCategoryPromptGroups(new Set(groupIds))}
            onSelectInvertPromptGroups={(groupIds) =>
              setSelectedCategoryPromptGroups((current) => invertSelectionWithinIds(current, groupIds))
            }
            onSelectMenu={setSelectedCategoryMenuPath}
            onSelectNoPromptGroups={() => setSelectedCategoryPromptGroups(new Set())}
            onTogglePromptGroupSelection={(groupId) =>
              setSelectedCategoryPromptGroups((current) => toggleEntrySelection(current, groupId))
            }
            onUpsertCustomCategory={onUpsertCustomCategory}
            onAddCustomCategory={(options) => {
              if (options?.parentCategoryId) {
                void handleCreateCustomCategory({
                  asChild: true,
                  group: options.groupLabel ?? defaultCategoryGroupLabel,
                  parentId: options.parentCategoryId,
                });
                return;
              }
              void handleCreateCustomCategory({
                asChild: false,
                group: options?.groupLabel ?? defaultCategoryGroupLabel,
              });
            }}
          />
        </LexiconSection>
      ) : null}

      {kind === "tags" ? (
        <LexiconSection
          bodyClassName="min-h-0 overflow-visible"
          count={tagPromptGroups.length}
          description={meta.description}
          eyebrow={meta.eyebrow}
          statusBadge={syncStatusBadge}
          icon={meta.icon}
          isBusy={isBusy}
          hideScrollTopButton={hideScrollTopButton}
          layout="page"
          query={tagImageQuery}
          searchPlaceholder={meta.searchPlaceholder}
          selectedCount={selectedTagPromptGroupCount}
          toolbarLeadingAction={
            <Button
              icon={<Sparkles size={16} />}
              disabled={
                isBusy ||
                tagAnalysisProgress?.status === "running" ||
                tagAnalysisPromptGroupCount === 0
              }
              onClick={() => void handleAnalyzeVisibleTagPromptGroups({ force: true })}
            >
              {tagAnalysisProgress?.status === "running" ? "分析中" : "AI标签"}
            </Button>
          }
          toolbarExtra={
            <Button
              icon={<RefreshCw size={16} />}
              disabled={isBusy || tagAnalysisProgress?.status === "running" || tagPromptGroups.length === 0}
              title="清空全部标签（不会自动分析；需要时再点「AI标签」）"
              onClick={() => void handleResetAndReanalyzeTags()}
            >
              清空标签
            </Button>
          }
          title={meta.title}
          onAdd={() =>
            updateTagImageDrafts((currentDrafts) => [
              createBlankImageEntry("tag", getImageEntryDraft("tag", selectedTagMenuPath, currentDrafts)),
              ...currentDrafts,
            ])
          }
          deleteSelectedLabel="移出标签"
          showToolbarDelete={false}
          onDeleteSelected={() => void handleDeleteSelectedTagPromptGroups()}
          onExport={() => void onExportLexicon("tags", tagImageDrafts)}
          onImport={() => void handleImportTagImages()}
          onQueryChange={setTagImageQuery}
        >
          <TagPromptGroupExplorer
            blurNsfwImages={blurNsfwImages}
            entries={tagMenuEntries}
            isMenuReady={isTagLexiconMenuReady}
            likedImageIds={likedImageIds}
            layout="page"
            promptGroups={tagPromptGroups}
            query={tagImageQuery}
            selectedMenuPath={selectedTagMenuPath}
            selectedPromptGroupIds={selectedTagPromptGroups}
            tagLabelsCache={tagLabelsCache}
            analysisProgress={tagAnalysisProgress}
            onCopyPrompt={onCopyPrompt}
            onCancelAnalysis={handleCancelTagAnalysis}
            onOpenDetail={onOpenDetail}
            onRemoveSelectedPromptGroups={() => void handleDeleteSelectedTagPromptGroups()}
            onDeleteSelectedTag={handleDeleteSelectedTag}
            onRenameGroup={(oldPath, newLabel) =>
              updateTagImageDrafts((currentDrafts) => renameImageGroupInDrafts(currentDrafts, oldPath, newLabel))
            }
            onRenameItem={(groupPath, itemKey, newLabel) =>
              updateTagImageDrafts((currentDrafts) => renameImageItemInDrafts(currentDrafts, groupPath, itemKey, newLabel))
            }
            onSelectAllPromptGroups={(groupIds) => setSelectedTagPromptGroups(new Set(groupIds))}
            onSelectInvertPromptGroups={(groupIds) =>
              setSelectedTagPromptGroups((current) => invertSelectionWithinIds(current, groupIds))
            }
            onSelectMenu={setSelectedTagMenuPath}
            onSelectNoPromptGroups={() => setSelectedTagPromptGroups(new Set())}
            onTogglePromptGroupSelection={(groupId) =>
              setSelectedTagPromptGroups((current) => toggleEntrySelection(current, groupId))
            }
          />
        </LexiconSection>
      ) : null}
    </section>
  );
});

type PromptLexiconWorkspaceMeta = {
  description: string;
  emptyText: string;
  eyebrow: string;
  icon: React.ReactNode;
  searchPlaceholder: string;
  title: string;
};

function getPromptLexiconWorkspaceMeta(kind: PromptLexiconKind): PromptLexiconWorkspaceMeta {
  if (kind === "categories") {
    return {
      description: "按分类层级管理已保存提示词组。勾选后点「移出分类」只会移出分类，不会删除素材。",
      emptyText: "当前分类下没有匹配的提示词组",
      eyebrow: "分类词库",
      icon: <FolderTree size={18} />,
      searchPlaceholder: "搜索分类或提示词组",
      title: "分类词库",
    };
  }

  return {
    description:
      "按细粒度标签管理提示词组（材质/光影/构图/情绪等）。标签与分类互不重叠；「移出标签」只去掉标签，不删除素材。",
    emptyText: "当前标签下没有匹配的提示词组",
    eyebrow: "标签词库",
    icon: <Tags size={18} />,
    searchPlaceholder: "搜索标签或提示词组",
    title: "标签词库",
  };
}

type LexiconLayout = "bounded" | "page";

type LexiconSectionProps = {
  children: React.ReactNode;
  bodyClassName?: string;
  count: number;
  description: string;
  hideScrollTopButton?: boolean;
  icon: React.ReactNode;
  isBusy: boolean;
  query: string;
  searchPlaceholder: string;
  selectedCount: number;
  layout?: LexiconLayout;
  toolbarLeadingAction?: React.ReactNode;
  toolbarExtra?: React.ReactNode;
  title: string;
  eyebrow?: string;
  statusBadge?: React.ReactNode;
  onAdd: () => void;
  onClearSelectedImages?: () => void;
  onDeleteSelected: () => void;
  /** Top toolbar action label — never imply permanent material delete for tag/category workspaces. */
  deleteSelectedLabel?: string;
  deleteSelectedDisabled?: boolean;
  /** When false, hide the top-bar delete/remove button (batch toolbar already has it). Default true. */
  showToolbarDelete?: boolean;
  onExport: () => void;
  onImport: () => void;
  onQueryChange: (query: string) => void;
};

function LexiconSection({
  children,
  bodyClassName = "max-h-[420px] overflow-y-auto",
  count,
  description,
  hideScrollTopButton = false,
  icon,
  isBusy,
  query,
  searchPlaceholder,
  selectedCount,
  layout = "bounded",
  toolbarLeadingAction,
  toolbarExtra,
  title,
  eyebrow,
  statusBadge,
  onAdd,
  onClearSelectedImages,
  onDeleteSelected,
  deleteSelectedLabel = "删除选中",
  deleteSelectedDisabled = false,
  showToolbarDelete = true,
  onExport,
  onImport,
  onQueryChange,
}: LexiconSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isPageLayout = layout === "page";
  const sectionClassName = isPageLayout
    ? "relative flex min-h-0 min-[720px]:min-h-[420px] flex-col overflow-visible rounded-2xl border border-border/70 bg-panel shadow-elevated"
    : "relative flex min-h-0 min-[720px]:min-h-[420px] max-h-[calc(100dvh-10rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-panel shadow-elevated";
  const bodyLayoutClassName = isPageLayout ? "min-h-0 pb-16" : "flex-1";

  function handleScrollToTop() {
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <section className={sectionClassName} ref={sectionRef}>
      <div className="border-b border-border/70 bg-background/70 px-4 py-3">
        {/* Row 1: title (left) + action buttons (right) */}
        <div className="flex flex-col gap-3 min-[1100px]:flex-row min-[1100px]:items-start min-[1100px]:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground">
              {icon}
            </span>
            <div className="min-w-0">
              {eyebrow ? <p className="text-xs font-medium text-muted">{eyebrow}</p> : null}
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h3 className="whitespace-nowrap text-base font-semibold text-foreground">{title}</h3>
                <span className="shrink-0 rounded-lg border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">
                  {count} 条
                </span>
                {selectedCount > 0 ? (
                  <span className="shrink-0 rounded-lg border border-capsule-lavender-border bg-capsule-lavender px-2 py-1 text-xs text-capsule-lavender-foreground">
                    已选 {selectedCount}
                  </span>
                ) : null}
                {statusBadge}
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{description}</p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 min-[1100px]:w-auto min-[1100px]:max-w-[58%]">
            {(toolbarLeadingAction || toolbarExtra) && (
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-panel/90 p-1 shadow-sm">
                {toolbarLeadingAction}
                {toolbarExtra}
              </div>
            )}

            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-panel/90 p-1 shadow-sm">
              <Button icon={<Plus size={16} />} disabled={isBusy} onClick={onAdd}>
                新增
              </Button>
              <Button icon={<Download size={16} />} disabled={isBusy} onClick={onImport}>
                导入
              </Button>
              <Button icon={<Upload size={16} />} disabled={isBusy || count === 0} onClick={onExport}>
                导出
              </Button>
              {onClearSelectedImages ? (
                <Button
                  icon={<ImageIcon size={16} />}
                  disabled={isBusy || selectedCount === 0}
                  onClick={onClearSelectedImages}
                >
                  清除选中图像
                </Button>
              ) : null}
            </div>

            {showToolbarDelete ? (
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-panel/90 p-1 shadow-sm">
                <Button
                  icon={<Trash2 size={16} />}
                  variant="danger"
                  disabled={isBusy || selectedCount === 0 || deleteSelectedDisabled}
                  onClick={onDeleteSelected}
                >
                  {deleteSelectedLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Row 2: full-width search under actions — keeps header uncluttered */}
        <div className="mt-3 border-t border-border/50 pt-3">
          <label className="flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-border/70 bg-panel px-3.5 text-sm text-muted shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <Search className="shrink-0 opacity-70" size={15} />
            <input
              aria-label={`${title}搜索`}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {query.trim() ? (
              <button
                aria-label="清除搜索"
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                type="button"
                onClick={() => onQueryChange("")}
              >
                <span className="text-base leading-none">×</span>
              </button>
            ) : null}
          </label>
        </div>
      </div>

      <div className={`${bodyLayoutClassName} ${bodyClassName}`}>{children}</div>
      {isPageLayout && !hideScrollTopButton ? (
        <CardScrollTopButton
          className="fixed bottom-6 z-50 min-[1024px]:bottom-10 min-[1440px]:bottom-12"
          contentMaxWidth={lexiconShellMaxWidth}
          onClick={handleScrollToTop}
        />
      ) : null}
    </section>
  );
}


type LexiconBatchToolbarProps = {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onSelectInvert: () => void;
  onSelectNone: () => void;
  onRemoveSelected: () => void;
  removeLabel?: string;
  removeDisabled?: boolean;
};

function LexiconBatchToolbar({
  totalCount,
  selectedCount,
  onSelectAll,
  onSelectInvert,
  onSelectNone,
  onRemoveSelected,
  removeLabel = "删除所选",
  removeDisabled = false,
}: LexiconBatchToolbarProps) {
  if (totalCount === 0) {
    return null;
  }
  const hasSelection = selectedCount > 0;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-background/40 px-3 py-2 text-xs">
      <span className="text-muted">
        已选 <span className="font-semibold text-foreground">{selectedCount}</span> / {totalCount}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onSelectAll}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          全选
        </button>
        <button
          type="button"
          onClick={onSelectInvert}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          反选
        </button>
        <button
          type="button"
          onClick={onSelectNone}
          disabled={!hasSelection}
          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onRemoveSelected}
          disabled={!hasSelection || removeDisabled}
          className="inline-flex items-center gap-1 rounded-md border border-danger/50 bg-background px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {removeLabel}
        </button>
      </div>
    </div>
  );
}

function getLexiconExplorerRootClassName(layout: LexiconLayout): string {
  return layout === "page"
    ? "grid min-h-0 min-[900px]:min-h-[480px] min-[960px]:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] min-[1200px]:grid-cols-[280px_minmax(0,1fr)]"
    : "grid h-full min-h-0 min-[960px]:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] min-[1200px]:grid-cols-[280px_minmax(0,1fr)]";
}

function getLexiconExplorerAsideClassName(layout: LexiconLayout): string {
  return layout === "page"
    ? "flex max-h-[min(42vh,360px)] min-h-[200px] flex-col border-b border-border/70 bg-background/60 p-3 min-[960px]:sticky min-[960px]:top-4 min-[960px]:max-h-[calc(100dvh-9rem)] min-[960px]:self-start min-[960px]:border-b-0 min-[960px]:border-r"
    : "flex min-h-0 max-h-[min(42vh,360px)] flex-col border-b border-border/70 bg-background/60 p-3 min-[960px]:max-h-none min-[960px]:border-b-0 min-[960px]:border-r";
}

function getLexiconExplorerColumnClassName(layout: LexiconLayout): string {
  return layout === "page" ? "flex min-w-0 flex-col" : "flex min-h-0 min-w-0 flex-col";
}

function getLexiconExplorerContentClassName(layout: LexiconLayout, extraClassName = ""): string {
  const baseClassName =
    layout === "page" ? "min-h-[320px] overflow-visible" : "min-h-0 flex-1 overflow-y-auto overscroll-contain";

  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName;
}


type MenuRenameInputProps = {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

/** Shared sidebar tree row chrome for category / tag / parameter explorers. */
const lexiconTreeItemBaseClassName =
  "group grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25";

function getLexiconTreeItemStateClassName(active: boolean): string {
  // Aside sits on bg-background/60 — solid fill + soft border so hover/selected
  // rows read clearly against the muted menu surface (category / tag / parameter).
  return active
    ? "border-capsule-sage-border/90 bg-capsule-sage text-capsule-sage-foreground shadow-sm"
    : "border-transparent bg-transparent text-muted hover:border-border hover:bg-background hover:text-foreground hover:shadow-sm";
}

function MenuRenameInput({ initialValue, onCommit, onCancel }: MenuRenameInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit() {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== initialValue) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  }

  function cancel() {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    onCancel();
  }

  return (
    <input
      ref={inputRef}
      className="h-7 w-full rounded-md border border-primary bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      type="text"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
    />
  );
}


type ImageLexiconKind = "category" | "tag";

type ImageLexiconExplorerProps = {
  entries: PromptImageLexiconEntry[];
  filteredEntries: PromptImageLexiconEntry[];
  isBusy: boolean;
  kind: ImageLexiconKind;
  layout?: LexiconLayout;
  selectedEntries: ReadonlySet<string>;
  selectedMenuPath: string;
  showParentSelect?: boolean;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  onClearImage: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
  onRenameItem: (groupPath: string, itemKey: string, newLabel: string) => void;
  onSelectEntry: (entryId: string) => void;
  onSelectMenu: (menuPath: string) => void;
  onUploadImage: (entryId: string) => void;
  onSelectAll: () => void;
  onSelectInvert: () => void;
  onSelectNone: () => void;
  onRemoveSelected: () => void;
};

function ImageLexiconExplorer({
  entries,
  filteredEntries,
  isBusy,
  kind,
  layout = "bounded",
  selectedEntries,
  selectedMenuPath,
  showParentSelect = false,
  onChangeEntry,
  onClearImage,
  onRemoveEntry,
  onRenameGroup,
  onRenameItem,
  onSelectEntry,
  onSelectMenu,
  onUploadImage,
  onSelectAll,
  onSelectInvert,
  onSelectNone,
  onRemoveSelected,
}: ImageLexiconExplorerProps) {
  const allMenuValue = getImageLexiconAllValue(kind);
  const groupTree = useMemo(() => buildImageLexiconGroupTree(entries), [entries]);
  const categoryTree = useMemo(() => (kind === "category" ? buildImageCategoryTree(entries) : []), [entries, kind]);
  const activeMenuLabel = getImageLexiconMenuDisplayLabel(kind, selectedMenuPath, entries);
  const isImageItemSelected = selectedMenuPath.startsWith(imageItemMenuPrefix);
  const imageCapsuleSections = useMemo(
    () => buildImageLexiconCapsuleSections(filteredEntries, kind),
    [filteredEntries, kind],
  );
  const visibleSelectedCount = useMemo(
    () => filteredEntries.reduce((total, entry) => total + (selectedEntries.has(entry.id) ? 1 : 0), 0),
    [filteredEntries, selectedEntries],
  );
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const rootClassName = getLexiconExplorerRootClassName(layout);
  const asideClassName = getLexiconExplorerAsideClassName(layout);
  const columnClassName = getLexiconExplorerColumnClassName(layout);
  const contentClassName = getLexiconExplorerContentClassName(layout);
  const menuTitle = kind === "category" ? "分类菜单" : "标签菜单";
  const menuHint = kind === "category" ? "按分组、词条和父级管理" : "按分组和标签管理";
  const groupHeading = kind === "category" ? "分组层级" : "标签层级";
  const emptyMenuText = kind === "category" ? "暂无分类菜单" : "暂无标签菜单";
  const itemLabel = kind === "category" ? "分类" : "标签图像";
  const emptyContentText =
    kind === "category" ? "没有匹配的分类记录" : "没有匹配的标签图像";

  useEffect(() => {
    const activeMenuItem = menuScrollRef.current?.querySelector('[data-lexicon-menu-active="true"]');
    activeMenuItem?.scrollIntoView({ block: "center" });
  }, [selectedMenuPath]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedMenuPath]);

  return (
    <div className={rootClassName}>
      <aside className={asideClassName}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{menuTitle}</p>
            <p className="mt-1 text-xs text-muted">{menuHint}</p>
          </div>
          <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">
            {entries.length}
          </span>
        </div>

        <div ref={menuScrollRef} className="grid min-h-0 gap-1 overflow-y-auto overscroll-contain pb-8 pr-1">
          <ImageLexiconMenuButton
            active={selectedMenuPath === allMenuValue}
            count={entries.length}
            depth={0}
            label={getImageLexiconAllLabel(kind)}
            onClick={() => onSelectMenu(allMenuValue)}
          />

          {groupTree.length > 0 ? (
            <>
              <p className="px-3 pt-3 text-xs font-medium text-muted">{groupHeading}</p>
              {groupTree.map((node) => (
                <ImageGroupNodeButton
                  key={node.path}
                  node={node}
                  selectedMenuPath={selectedMenuPath}
                  onSelectMenu={onSelectMenu}
                  onRenameGroup={onRenameGroup}
                  onRenameItem={onRenameItem}
                />
              ))}
            </>
          ) : (
            <div className="rounded-md border border-border/70 bg-panel px-3 py-6 text-center text-xs text-muted">
              {emptyMenuText}
            </div>
          )}

          {kind === "category" && categoryTree.length > 0 ? (
            <>
              <p className="px-3 pt-3 text-xs font-medium text-muted">分类层级</p>
              {categoryTree.map((node) => (
                <ImageCategoryNodeButton
                  key={node.entry.id}
                  node={node}
                  selectedMenuPath={selectedMenuPath}
                  onSelectMenu={onSelectMenu}
                  onChangeEntry={onChangeEntry}
                />
              ))}
            </>
          ) : null}
        </div>
      </aside>

      <div className={columnClassName}>
        <div className="shrink-0 border-b border-border/70 bg-panel px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{activeMenuLabel}</p>
            <p className="mt-1 text-xs text-muted">
              {isImageItemSelected
                ? `显示 ${filteredEntries.length} 条${itemLabel}`
                : `${imageCapsuleSections.length} 个分组，${filteredEntries.length} 条${itemLabel}`}
            </p>
          </div>
          {selectedMenuPath !== allMenuValue ? (
            <button
              className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              type="button"
              onClick={() => onSelectMenu(allMenuValue)}
            >
              查看全部
            </button>
          ) : null}
          </div>
        </div>

        <LexiconBatchToolbar
          totalCount={filteredEntries.length}
          selectedCount={visibleSelectedCount}
          onSelectAll={onSelectAll}
          onSelectInvert={onSelectInvert}
          onSelectNone={onSelectNone}
          onRemoveSelected={onRemoveSelected}
        />

        <div ref={contentScrollRef} className={contentClassName}>
          {filteredEntries.length > 0 && isImageItemSelected ? (
            <ImageLexiconCapsuleGrid
              entries={filteredEntries}
              isBusy={isBusy}
              kind={kind}
              selectedEntries={selectedEntries}
              onClearImage={onClearImage}
              onChangeEntry={onChangeEntry}
              onRemoveEntry={onRemoveEntry}
              onSelectEntry={onSelectEntry}
              onUploadImage={onUploadImage}
            />
          ) : filteredEntries.length > 0 ? (
            <ImageLexiconCapsuleSectionGrid
              isBusy={isBusy}
              kind={kind}
              sections={imageCapsuleSections}
              selectedEntries={selectedEntries}
              onClearImage={onClearImage}
              onChangeEntry={onChangeEntry}
              onRemoveEntry={onRemoveEntry}
              onSelectEntry={onSelectEntry}
              onUploadImage={onUploadImage}
            />
          ) : (
            <LexiconEmptyState text={emptyContentText} />
          )}
        </div>
      </div>
    </div>
  );
}

const promptGroupDragMime = "application/x-suyan-prompt-group-ids";

type CategoryPromptGroupExplorerProps = {
  analysisProgress: CategoryAnalysisProgress | null;
  blurNsfwImages: boolean;
  categoryLabelsCache: ReadonlyMap<string, string[]>;
  categoryTaxonomy?: CategoryTaxonomy | null;
  entries: PromptImageLexiconEntry[];
  isBusy?: boolean;
  likedImageIds: string[];
  layout?: LexiconLayout;
  promptGroups: PromptImageGroup[];
  query: string;
  selectedMenuPath: string;
  selectedPromptGroupIds: ReadonlySet<string>;
  onCopyPrompt: (item: PromptCardData) => void;
  onCancelAnalysis: () => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  onDeleteCustomCategory?: (categoryId: string) => Promise<boolean>;
  onMovePromptGroupsToCategory: (itemIds: readonly string[], categoryId: string | null, source?: "system" | "user" | "ai") => Promise<boolean>;
  onOpenDetail: (itemId: string) => void;
  onRemoveSelectedPromptGroups: () => void;
  onSelectAllPromptGroups: (groupIds: readonly string[]) => void;
  onSelectInvertPromptGroups: (groupIds: readonly string[]) => void;
  onSelectMenu: (menuPath: string) => void;
  onSelectNoPromptGroups: () => void;
  onTogglePromptGroupSelection: (groupId: string) => void;
  onUpsertCustomCategory?: (input: {
    id?: string | null;
    name: string;
    group?: string | null;
    parentId?: string | null;
  }) => Promise<string | null>;
  /** Create a top-level custom category (group-header + button). */
  /** Create a top-level custom category, or a child under parentCategoryId. */
  onAddCustomCategory?: (options?: { groupLabel?: string; parentCategoryId?: string | null }) => void;
};

function CategoryPromptGroupExplorer({
  analysisProgress,
  blurNsfwImages,
  categoryLabelsCache,
  categoryTaxonomy = null,
  entries,
  isBusy = false,
  likedImageIds,
  layout = "bounded",
  promptGroups,
  query,
  selectedMenuPath,
  selectedPromptGroupIds,
  onCopyPrompt,
  onCancelAnalysis,
  onChangeEntry,
  onDeleteCustomCategory,
  onMovePromptGroupsToCategory,
  onOpenDetail,
  onRemoveSelectedPromptGroups,
  onSelectAllPromptGroups,
  onSelectInvertPromptGroups,
  onSelectMenu,
  onSelectNoPromptGroups,
  onTogglePromptGroupSelection,
  onUpsertCustomCategory,
  onAddCustomCategory,
}: CategoryPromptGroupExplorerProps) {
  const promptGroupCountByCategory = useMemo(() => buildPromptGroupCountByCategory(promptGroups, categoryLabelsCache), [categoryLabelsCache, promptGroups]);
  const deferredQuery = useDeferredValue(query);
  const deferredSelectedMenuPath = useDeferredValue(selectedMenuPath);
  const fullCategoryTree = useMemo(() => (entries.length === 0 ? [] : buildGroupedCategoryTree(entries)), [entries]);
  // Hide empty system leaves; keep empty custom leaves as drop targets.
  const visibleCategoryTree = useMemo(
    () => filterCategoryTreeKeepingCustomEmpty(fullCategoryTree, promptGroupCountByCategory),
    [fullCategoryTree, promptGroupCountByCategory],
  );
  const moveTargetLeaves = useMemo(() => {
    const leaves: PromptImageLexiconEntry[] = [];

    function walk(nodes: readonly ImageCategoryNode[]) {
      for (const node of nodes) {
        if (!node.entry.id.startsWith("group:")) {
          leaves.push(node.entry);
        }
        if (node.children.length > 0) {
          walk(node.children);
        }
      }
    }

    walk(fullCategoryTree);
    return leaves.sort((left, right) => {
      const leftCustom = isCustomCategoryEntry(left) ? 0 : 1;
      const rightCustom = isCustomCategoryEntry(right) ? 0 : 1;
      if (leftCustom !== rightCustom) {
        return leftCustom - rightCustom;
      }
      return (left.label || "").localeCompare(right.label || "", "zh-CN");
    });
  }, [fullCategoryTree]);
  const [expandedCategoryGroupIds, setExpandedCategoryGroupIds] = useState<Set<string>>(() => new Set());
  const [dropTargetEntryId, setDropTargetEntryId] = useState<string | null>(null);
  const [isDraggingPromptGroup, setIsDraggingPromptGroup] = useState(false);
  const [moveMenu, setMoveMenu] = useState<{ anchorX: number; anchorY: number; itemIds: string[] } | null>(null);
  const filteredPromptGroups = useMemo(
    () => filterPromptGroupsForCategoryMenu(promptGroups, entries, deferredSelectedMenuPath, deferredQuery, categoryLabelsCache),
    [categoryLabelsCache, deferredQuery, deferredSelectedMenuPath, entries, promptGroups],
  );
  const activeMenuLabel = getImageLexiconMenuDisplayLabel("category", selectedMenuPath, entries);
  const selectedCategoryEntry = useMemo(
    () =>
      selectedMenuPath === allCategoryGroupsValue
        ? null
        : entries.find((entry) => createImageCategoryMenuValue(entry.id) === selectedMenuPath) ?? null,
    [entries, selectedMenuPath],
  );
  const canDeleteSelectedCategory = Boolean(
    selectedCategoryEntry &&
      !selectedCategoryEntry.id.startsWith("group:") &&
      selectedCategoryEntry.id !== "system:uncategorized" &&
      onDeleteCustomCategory,
  );
  const filteredImageCount = filteredPromptGroups.reduce((total, group) => total + group.items.length, 0);
  const filteredSelectedCount = countSelectedPromptGroups(selectedPromptGroupIds, filteredPromptGroups);
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const rootClassName = getLexiconExplorerRootClassName(layout);
  const asideClassName = getLexiconExplorerAsideClassName(layout);
  const columnClassName = getLexiconExplorerColumnClassName(layout);
  const contentClassName = getLexiconExplorerContentClassName(layout, "bg-panel p-4");
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<PromptImageLexiconEntry | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  useEffect(() => {
    if (!selectedMenuPath || selectedMenuPath === allCategoryGroupsValue) {
      return;
    }

    function findGroupAncestors(nodes: readonly ImageCategoryNode[], targetPath: string): string[] | null {
      for (const node of nodes) {
        if (createImageCategoryMenuValue(node.entry.id) === targetPath) {
          return [];
        }
        if (node.children.length === 0) {
          continue;
        }
        const nested = findGroupAncestors(node.children, targetPath);
        if (nested) {
          return node.entry.id.startsWith("group:") ? [node.entry.id, ...nested] : nested;
        }
      }
      return null;
    }

    const groupIdsToExpand = findGroupAncestors(visibleCategoryTree, selectedMenuPath);
    if (!groupIdsToExpand || groupIdsToExpand.length === 0) {
      return;
    }

    setExpandedCategoryGroupIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const id of groupIdsToExpand) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedMenuPath, visibleCategoryTree]);

  useEffect(() => {
    const activeMenuItem = menuScrollRef.current?.querySelector('[data-lexicon-menu-active="true"]');
    activeMenuItem?.scrollIntoView({ block: "center" });
  }, [selectedMenuPath]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [query, selectedMenuPath]);

  useEffect(() => {
    if (!moveMenu) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-category-move-menu='true']")) {
        return;
      }
      setMoveMenu(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMoveMenu(null);
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [moveMenu]);

  function handleToggleCategoryGroup(groupId: string) {
    setExpandedCategoryGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function resolveCategoryIdForEntry(entry: PromptImageLexiconEntry): string | null {
    if (entry.id.startsWith("group:")) {
      return null;
    }
    if (entry.id.startsWith("system:") || entry.id.startsWith("custom:") || entry.id.startsWith("ai:")) {
      return entry.id;
    }
    if (categoryTaxonomy) {
      return resolveCategoryIdFromLegacyName(categoryTaxonomy, entry.label) ?? entry.id;
    }
    return entry.id;
  }

  async function handleDropOnCategory(entry: PromptImageLexiconEntry, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDropTargetEntryId(null);
    setIsDraggingPromptGroup(false);
    const categoryId = resolveCategoryIdForEntry(entry);
    if (!categoryId) {
      return;
    }
    const raw = event.dataTransfer.getData(promptGroupDragMime) || event.dataTransfer.getData("text/plain");
    let itemIds: string[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        itemIds = parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
      }
    } catch {
      if (raw.trim()) {
        itemIds = [raw.trim()];
      }
    }
    if (itemIds.length === 0) {
      return;
    }
    await onMovePromptGroupsToCategory(itemIds, categoryId);
  }

  function handleOpenMoveMenu(itemIds: string[], clientX: number, clientY: number) {
    if (itemIds.length === 0) {
      return;
    }
    setMoveMenu({ anchorX: clientX, anchorY: clientY, itemIds });
  }

  async function handleMoveMenuSelect(categoryId: string | null) {
    if (!moveMenu) {
      return;
    }
    const itemIds = moveMenu.itemIds;
    setMoveMenu(null);
    await onMovePromptGroupsToCategory(itemIds, categoryId);
  }

  async function handleRenameCategory(entryId: string, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed) {
      return;
    }
    onChangeEntry(entryId, { label: trimmed });
    if (onUpsertCustomCategory && (entryId.startsWith("custom:") || entryId.startsWith("ai:"))) {
      const existing = entries.find((entry) => entry.id === entryId);
      await onUpsertCustomCategory({
        id: entryId,
        name: trimmed,
        group: existing?.group || defaultCategoryGroupLabel,
        parentId: existing?.parentId ?? null,
      });
    }
  }

  return (
    <div className={rootClassName}>
      <aside className={asideClassName}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">素材目录</p>
            <p className="mt-1 text-xs text-muted">
              {isDraggingPromptGroup ? "拖到左侧分类即可归类" : "自定义优先 · 拖拽或菜单移动"}
            </p>
          </div>
          <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">
            {promptGroups.length}
          </span>
        </div>

        <div ref={menuScrollRef} className="grid min-h-0 gap-1 overflow-y-auto overscroll-contain pb-8 pr-1">
          <ImageLexiconMenuButton
            active={selectedMenuPath === allCategoryGroupsValue}
            count={promptGroups.length}
            depth={0}
            label="全部分类"
            onClick={() => onSelectMenu(allCategoryGroupsValue)}
          />

          {visibleCategoryTree.length > 0 ? (
            <>
              <p className="px-3 pt-3 text-xs font-medium text-muted">分类目录（自定义优先）</p>
              {visibleCategoryTree.map((node) => (
                <PromptCategoryNodeButton
                  countByCategory={promptGroupCountByCategory}
                  dropTargetEntryId={dropTargetEntryId}
                  expandedGroupIds={expandedCategoryGroupIds}
                  isDraggingPromptGroup={isDraggingPromptGroup}
                  key={node.entry.id}
                  node={node}
                  onChangeEntry={(entryId, patch) => {
                    if (patch.label) {
                      void handleRenameCategory(entryId, patch.label);
                      return;
                    }
                    onChangeEntry(entryId, patch);
                  }}
                  onDeleteCustomCategory={onDeleteCustomCategory}
                  onDragEnterCategory={(entryId) => setDropTargetEntryId(entryId)}
                  onDragLeaveCategory={(entryId) =>
                    setDropTargetEntryId((current) => (current === entryId ? null : current))
                  }
                  onDropOnCategory={(entry, event) => void handleDropOnCategory(entry, event)}
                  onToggleGroup={handleToggleCategoryGroup}
                  onAddCategoryInGroup={
                    onAddCustomCategory
                      ? (options) => onAddCustomCategory(options)
                      : undefined
                  }
                  selectedMenuPath={selectedMenuPath}
                  onSelectMenu={onSelectMenu}
                />
              ))}
            </>
          ) : (
            <div className="rounded-md border border-border/70 bg-panel px-3 py-6 text-center text-xs text-muted">
              {entries.length === 0
                ? "暂无分类目录，请检查 taxonomy 是否加载。"
                : "当前素材未归入任何分类，归类后将显示对应目录。"}
            </div>
          )}
        </div>
      </aside>

      <div className={columnClassName}>
        <div className="shrink-0 border-b border-border/70 bg-panel px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{activeMenuLabel}</p>
              <p className="mt-1 text-xs text-muted">
                {filteredPromptGroups.length} 个提示词组 / {filteredImageCount} 张图片
                {query.trim() ? "，已按搜索词过滤" : ""}
                {" · 拖拽卡片到左侧分类，或点 ⋯ 菜单移动"}
              </p>
            </div>
            {selectedMenuPath !== allCategoryGroupsValue ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canDeleteSelectedCategory ? (
                  <button
                    className="inline-flex min-h-8 items-center gap-2 rounded-md border border-danger/35 bg-danger-soft px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
                    type="button"
                    onClick={() => {
                      if (selectedCategoryEntry) {
                        setDeleteCategoryTarget(selectedCategoryEntry);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                    删除分类
                  </button>
                ) : null}
                <button
                  className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                  type="button"
                  onClick={() => onSelectMenu(allCategoryGroupsValue)}
                >
                  查看全部
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div ref={contentScrollRef} className={contentClassName}>
          {analysisProgress ? (
            <CategoryAnalysisProgressPanel progress={analysisProgress} onCancel={onCancelAnalysis} />
          ) : null}
          <LexiconBatchToolbar
            totalCount={filteredPromptGroups.length}
            selectedCount={filteredSelectedCount}
            onSelectAll={() => onSelectAllPromptGroups(filteredPromptGroups.map((group) => group.id))}
            onSelectInvert={() => onSelectInvertPromptGroups(filteredPromptGroups.map((group) => group.id))}
            onSelectNone={onSelectNoPromptGroups}
            onRemoveSelected={onRemoveSelectedPromptGroups}
            removeLabel={selectedMenuPath === allCategoryGroupsValue ? "移出分类" : "移出该分类"}
          />
          {filteredPromptGroups.length > 0 ? (
            <GridPromptGallery
              blurNsfwImages={blurNsfwImages}
              enableCategoryDnD
              groups={filteredPromptGroups}
              likedImageIds={likedImageIds}
              selectedGroupIds={selectedPromptGroupIds}
              variant="compact"
              onCopyPrompt={onCopyPrompt}
              onDragPromptGroupsEnd={() => {
                setIsDraggingPromptGroup(false);
                setDropTargetEntryId(null);
              }}
              onDragPromptGroupsStart={() => setIsDraggingPromptGroup(true)}
              onOpenMoveMenu={handleOpenMoveMenu}
              onToggleGroupSelection={onTogglePromptGroupSelection}
              onViewDetail={onOpenDetail}
            />
          ) : (
            <LexiconEmptyState text="当前分类暂无提示词组" />
          )}
        </div>
      </div>

      {moveMenu
        ? createPortal(
            <div
              className="fixed z-[80] max-h-[min(420px,70vh)] w-[min(280px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-panel shadow-elevated"
              data-category-move-menu="true"
              style={{
                left: Math.min(moveMenu.anchorX, window.innerWidth - 296),
                top: Math.min(moveMenu.anchorY, window.innerHeight - 280),
              }}
            >
              <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted">
                移动到分类（{moveMenu.itemIds.length} 组）
              </div>
              <div className="max-h-[min(360px,60vh)] overflow-y-auto p-1">
                <button
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-primary-soft hover:text-foreground"
                  type="button"
                  onClick={() => void handleMoveMenuSelect(null)}
                >
                  移出分类 / 未分类
                </button>
                {moveTargetLeaves.map((entry) => {
                  const categoryId = resolveCategoryIdForEntry(entry);
                  if (!categoryId) {
                    return null;
                  }
                  return (
                    <button
                      key={entry.id}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-primary-soft"
                      type="button"
                      onClick={() => void handleMoveMenuSelect(categoryId)}
                    >
                      <span className="min-w-0 truncate">{entry.label}</span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {isCustomCategoryEntry(entry) ? "自定义" : entry.group || "系统"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        busyLabel="删除中…"
        confirmLabel="删除分类"
        description={
          <>
            分类「{deleteCategoryTarget?.label || "未命名分类"}」中的素材、图片和提示词都会保留，只会移出该分类。
          </>
        }
        icon={<Trash2 size={18} />}
        isBusy={isDeletingCategory}
        open={Boolean(deleteCategoryTarget)}
        title="确定删除分类吗？"
        onCancel={() => {
          if (!isDeletingCategory) {
            setDeleteCategoryTarget(null);
          }
        }}
        onConfirm={() => {
          if (!deleteCategoryTarget || !onDeleteCustomCategory || isDeletingCategory) {
            return;
          }
          void (async () => {
            setIsDeletingCategory(true);
            try {
              const categoryId = resolveCategoryIdForEntry(deleteCategoryTarget);
              const deleted = categoryId ? await onDeleteCustomCategory(categoryId) : false;
              setDeleteCategoryTarget(null);
              if (deleted) {
                onSelectMenu(allCategoryGroupsValue);
                onSelectNoPromptGroups();
              }
            } finally {
              setIsDeletingCategory(false);
            }
          })();
        }}
      />
    </div>
  );
}

function isCustomCategoryEntry(entry: PromptImageLexiconEntry): boolean {
  if (entry.id.startsWith("custom:") || entry.id.startsWith("ai:")) {
    return true;
  }
  // Freeform categories derived from item.category labels (not system taxonomy).
  if (entry.id.startsWith("derived-category-")) {
    return true;
  }
  const groupKey = normalizeCategoryLabelKey(entry.group || "");
  return groupKey === normalizeCategoryLabelKey("自定义分类") || groupKey.startsWith("自定义");
}

function filterCategoryTreeKeepingCustomEmpty(
  nodes: readonly ImageCategoryNode[],
  countByCategory: ReadonlyMap<string, number>,
): ImageCategoryNode[] {
  return nodes
    .map((node) => {
      if (node.entry.id.startsWith("group:")) {
        const children = filterCategoryTreeKeepingCustomEmpty(node.children, countByCategory);
        if (children.length === 0) {
          return null;
        }
        return { ...node, children };
      }
      const count = countPromptGroupsForCategoryNode(node, countByCategory);
      if (count > 0 || isCustomCategoryEntry(node.entry)) {
        return {
          ...node,
          children: filterCategoryTreeKeepingCustomEmpty(node.children, countByCategory),
        };
      }
      return null;
    })
    .filter((node): node is ImageCategoryNode => node !== null);
}

type TagPromptGroupExplorerProps = {
  analysisProgress?: CategoryAnalysisProgress | null;
  blurNsfwImages: boolean;
  entries: PromptImageLexiconEntry[];
  isMenuReady: boolean;
  likedImageIds: string[];
  layout?: LexiconLayout;
  promptGroups: PromptImageGroup[];
  query: string;
  selectedMenuPath: string;
  selectedPromptGroupIds: ReadonlySet<string>;
  tagLabelsCache: ReadonlyMap<string, string[]>;
  onCancelAnalysis: () => void;
  onCopyPrompt: (item: PromptCardData) => void;
  onDeleteSelectedTag: () => Promise<boolean>;
  onOpenDetail: (itemId: string) => void;
  onRemoveSelectedPromptGroups: () => void;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
  onRenameItem: (groupPath: string, itemKey: string, newLabel: string) => void;
  onSelectAllPromptGroups: (groupIds: readonly string[]) => void;
  onSelectInvertPromptGroups: (groupIds: readonly string[]) => void;
  onSelectMenu: (menuPath: string) => void;
  onSelectNoPromptGroups: () => void;
  onTogglePromptGroupSelection: (groupId: string) => void;
};

function TagPromptGroupExplorer({
  analysisProgress,
  blurNsfwImages,
  entries,
  isMenuReady,
  likedImageIds,
  layout = "bounded",
  promptGroups,
  query,
  selectedMenuPath,
  selectedPromptGroupIds,
  tagLabelsCache,
  onCancelAnalysis,
  onCopyPrompt,
  onDeleteSelectedTag,
  onOpenDetail,
  onRemoveSelectedPromptGroups,
  onRenameGroup,
  onRenameItem,
  onSelectAllPromptGroups,
  onSelectInvertPromptGroups,
  onSelectMenu,
  onSelectNoPromptGroups,
  onTogglePromptGroupSelection,
}: TagPromptGroupExplorerProps) {
  const tagGroupTree = useMemo(() => (isMenuReady ? buildImageLexiconGroupTree(entries) : []), [entries, isMenuReady]);
  const [expandedTagGroupPaths, setExpandedTagGroupPaths] = useState<Set<string>>(() => new Set());
  const hasInitializedTagGroupExpansion = useRef(false);
  const promptGroupCountByTag = useMemo(() => buildPromptGroupCountByTag(promptGroups, tagLabelsCache), [promptGroups, tagLabelsCache]);
  const deferredQuery = useDeferredValue(query);
  const deferredSelectedMenuPath = useDeferredValue(selectedMenuPath);
  const visibleTagGroupTree = useMemo(
    () => (isMenuReady ? filterTagGroupTreeByPromptGroups(tagGroupTree, promptGroupCountByTag) : []),
    [isMenuReady, promptGroupCountByTag, tagGroupTree],
  );
  const filteredPromptGroups = useMemo(
    () => filterPromptGroupsForTagMenu(promptGroups, entries, deferredSelectedMenuPath, deferredQuery, tagLabelsCache),
    [deferredQuery, deferredSelectedMenuPath, entries, promptGroups, tagLabelsCache],
  );
  const selectedTagPromptGroupCount = useMemo(
    () => countPromptGroupsForTagMenu(promptGroups, entries, deferredSelectedMenuPath, tagLabelsCache),
    [deferredSelectedMenuPath, entries, promptGroups, tagLabelsCache],
  );
  const activeMenuLabel = getTagPromptMenuDisplayLabel(selectedMenuPath, entries);
  const filteredImageCount = filteredPromptGroups.reduce((total, group) => total + group.items.length, 0);
  const filteredSelectedCount = countSelectedPromptGroups(selectedPromptGroupIds, filteredPromptGroups);
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const rootClassName = getLexiconExplorerRootClassName(layout);
  const asideClassName = getLexiconExplorerAsideClassName(layout);
  const columnClassName = getLexiconExplorerColumnClassName(layout);
  const contentClassName = getLexiconExplorerContentClassName(layout, "bg-panel p-4");
  const [isDeleteTagConfirmOpen, setIsDeleteTagConfirmOpen] = useState(false);
  const [isDeletingTag, setIsDeletingTag] = useState(false);

  useEffect(() => {
    const knownPaths = collectImageGroupPaths(tagGroupTree);
    if (knownPaths.length === 0) {
      return;
    }

    setExpandedTagGroupPaths((current) => {
      if (!hasInitializedTagGroupExpansion.current) {
        hasInitializedTagGroupExpansion.current = true;
        return new Set(knownPaths);
      }

      const knownPathSet = new Set(knownPaths);
      const next = new Set([...current].filter((path) => knownPathSet.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [tagGroupTree]);

  function handleToggleTagGroup(path: string) {
    setExpandedTagGroupPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  useEffect(() => {
    const activeMenuItem = menuScrollRef.current?.querySelector('[data-lexicon-menu-active="true"]');
    activeMenuItem?.scrollIntoView({ block: "center" });
  }, [selectedMenuPath]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [query, selectedMenuPath]);

  useEffect(() => {
    if (selectedMenuPath !== allTagGroupsValue && selectedTagPromptGroupCount === 0) {
      onSelectMenu(allTagGroupsValue);
    }
  }, [onSelectMenu, selectedMenuPath, selectedTagPromptGroupCount]);

  return (
    <div className={rootClassName}>
      <aside className={asideClassName}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">标签菜单</p>
          <p className="mt-1 text-xs text-muted">按主体、环境、构图、材质等语义自动归类</p>
          </div>
          <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">
            {promptGroups.length}
          </span>
        </div>

        <div ref={menuScrollRef} className="grid min-h-0 gap-1 overflow-y-auto overscroll-contain pb-8 pr-1">
          <ImageLexiconMenuButton
            active={selectedMenuPath === allTagGroupsValue}
            count={promptGroups.length}
            depth={0}
            label="全部标签"
            onClick={() => onSelectMenu(allTagGroupsValue)}
          />

          {!isMenuReady ? (
            <div className="rounded-md border border-border/70 bg-panel px-3 py-6 text-center text-xs text-muted">
              正在整理标签菜单...
            </div>
          ) : visibleTagGroupTree.length > 0 ? (
            <>
              <p className="px-3 pt-3 text-xs font-medium text-muted">标签层级</p>
              {visibleTagGroupTree.map((node) => (
                <PromptTagGroupNodeButton
                  countByTag={promptGroupCountByTag}
                  key={node.path}
                  node={node}
                  onRenameGroup={onRenameGroup}
                  onRenameItem={onRenameItem}
                  promptGroups={promptGroups}
                  expandedGroupPaths={expandedTagGroupPaths}
                  selectedMenuPath={selectedMenuPath}
                  onSelectMenu={onSelectMenu}
                  onToggleGroup={handleToggleTagGroup}
                />
              ))}
            </>
          ) : (
            <div className="rounded-md border border-border/70 bg-panel px-3 py-6 text-center text-xs text-muted">
              暂无已归纳提示词组的标签。
            </div>
          )}
        </div>
      </aside>

      <div className={columnClassName}>
        <div className="shrink-0 border-b border-border/70 bg-panel px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{activeMenuLabel}</p>
              <p className="mt-1 text-xs text-muted">
                {filteredPromptGroups.length} 个提示词组 / {filteredImageCount} 张图片
                {query.trim() ? "，已按搜索词过滤" : ""}
              </p>
            </div>
            {selectedMenuPath !== allTagGroupsValue ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  className="inline-flex min-h-8 items-center gap-2 rounded-md border border-danger/35 bg-danger-soft px-3 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
                  type="button"
                  onClick={() => setIsDeleteTagConfirmOpen(true)}
                >
                  <Trash2 size={14} />
                  删除标签
                </button>
                <button
                  className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                  type="button"
                  onClick={() => onSelectMenu(allTagGroupsValue)}
                >
                  查看全部
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div ref={contentScrollRef} className={contentClassName}>
          {analysisProgress ? (
            <CategoryAnalysisProgressPanel
              progress={analysisProgress}
              title="AI 标签分析"
              onCancel={onCancelAnalysis}
            />
          ) : null}
          <LexiconBatchToolbar
            totalCount={filteredPromptGroups.length}
            selectedCount={filteredSelectedCount}
            onSelectAll={() => onSelectAllPromptGroups(filteredPromptGroups.map((group) => group.id))}
            onSelectInvert={() => onSelectInvertPromptGroups(filteredPromptGroups.map((group) => group.id))}
            onSelectNone={onSelectNoPromptGroups}
            onRemoveSelected={onRemoveSelectedPromptGroups}
            removeLabel={selectedMenuPath === allTagGroupsValue ? "移出标签" : "移出该标签"}
          />
          {filteredPromptGroups.length > 0 ? (
            <GridPromptGallery
              blurNsfwImages={blurNsfwImages}
              groups={filteredPromptGroups}
              likedImageIds={likedImageIds}
              selectedGroupIds={selectedPromptGroupIds}
              variant="compact"
              onCopyPrompt={onCopyPrompt}
              onToggleGroupSelection={onTogglePromptGroupSelection}
              onViewDetail={onOpenDetail}
            />
          ) : (
            <LexiconEmptyState text="当前标签暂无提示词组" />
          )}
        </div>
      </div>

      <ConfirmDialog
        busyLabel="删除中…"
        confirmLabel="删除标签"
        description={
          <>
            「{activeMenuLabel}」对应的标签会从素材和标签目录中移除，素材、图片和提示词本身不会删除。
          </>
        }
        icon={<Trash2 size={18} />}
        isBusy={isDeletingTag}
        open={isDeleteTagConfirmOpen}
        title="确定删除标签吗？"
        onCancel={() => {
          if (!isDeletingTag) {
            setIsDeleteTagConfirmOpen(false);
          }
        }}
        onConfirm={() => {
          if (isDeletingTag) {
            return;
          }
          void (async () => {
            setIsDeletingTag(true);
            try {
              const deleted = await onDeleteSelectedTag();
              if (deleted) {
                setIsDeleteTagConfirmOpen(false);
                onSelectNoPromptGroups();
              }
            } finally {
              setIsDeletingTag(false);
            }
          })();
        }}
      />
    </div>
  );
}

function CategoryAnalysisProgressPanel({
  progress,
  title = "AI 分类分析",
  onCancel,
}: {
  progress: CategoryAnalysisProgress;
  title?: string;
  onCancel: () => void;
}) {
  const progressRatio = progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0;
  const isRunning = progress.status === "running";
  const statusText =
    progress.status === "running" ? "正在分析" : progress.status === "canceled" ? "已取消" : "已完成";
  const poolStyle = {
    "--analysis-progress": `${progressRatio}%`,
    "--analysis-progress-ratio": progressRatio / 100,
    "--analysis-progress-color": getCategoryAnalysisProgressColor(progressRatio),
  } as CSSProperties;

  return (
    <section
      aria-label={`${title}进度 ${progressRatio}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progressRatio}
      className={`category-analysis-pool mb-4 rounded-lg border border-border/70 p-4${
        isRunning ? " category-analysis-pool--running" : ""
      }`}
      role="progressbar"
      style={poolStyle}
    >
      <span className="category-analysis-pool__water" />
      <span className="category-analysis-pool__surface" />
      <span aria-hidden="true" className="category-analysis-pool__rain">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-md border border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground">
                <Sparkles size={15} />
              </span>
              <h4 className="text-sm font-semibold text-foreground">{title}</h4>
              <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-0.5 text-xs text-capsule-mist-foreground">
                {statusText}
              </span>
              <span className="rounded-md border border-border/70 bg-panel/80 px-2 py-0.5 text-xs font-semibold text-foreground">
                {progressRatio}%
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              {progress.message}
              {progress.currentTitle ? ` 当前：${progress.currentTitle}` : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted min-[760px]:grid-cols-4">
              <span>进度 {progress.processed}/{progress.total}</span>
              <span>更新 {progress.analyzed}</span>
              <span>跳过 {progress.skipped}</span>
              <span>失败 {progress.failed}</span>
            </div>
          </div>
        </div>
        {isRunning ? (
          <button
            className="inline-flex min-h-8 items-center rounded-md border border-border bg-panel px-3 text-xs font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            type="button"
            onClick={onCancel}
          >
            取消分析
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getCategoryAnalysisProgressColor(progressRatio: number): string {
  if (progressRatio < 35) {
    return "color-mix(in srgb, var(--color-capsule-mist-foreground) 74%, var(--color-primary) 26%)";
  }

  if (progressRatio < 70) {
    return "color-mix(in srgb, var(--color-primary) 78%, var(--color-capsule-sage-foreground) 22%)";
  }

  return "color-mix(in srgb, var(--color-progress) 34%, var(--color-primary) 66%)";
}

function waitForInteractionFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

async function normalizeCanvasReferenceBlob(blob: Blob): Promise<Blob> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  let mime = "";

  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  ) {
    mime = "image/png";
  } else if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    mime = "image/jpeg";
  } else if (
    header.length >= 12 &&
    String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...header.slice(8, 12)) === "WEBP"
  ) {
    mime = "image/webp";
  }

  if (!mime) {
    throw new Error("IMAGE_FORMAT_UNSUPPORTED");
  }

  return blob.type === mime ? blob : new Blob([blob], { type: mime });
}

function logRendererStartupEvent(event: string, details: Record<string, unknown> = {}): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
  }
}

type PromptCategoryNodeButtonProps = {
  countByCategory: ReadonlyMap<string, number>;
  dropTargetEntryId?: string | null;
  expandedGroupIds: ReadonlySet<string>;
  isDraggingPromptGroup?: boolean;
  node: ImageCategoryNode;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  onDeleteCustomCategory?: (categoryId: string) => Promise<boolean>;
  onDragEnterCategory?: (entryId: string) => void;
  onDragLeaveCategory?: (entryId: string) => void;
  onDropOnCategory?: (entry: PromptImageLexiconEntry, event: React.DragEvent) => void;
  onToggleGroup: (groupId: string) => void;
  /** Add a top-level custom category under this group header (e.g. 自定义分类). */
  /** Create top-level custom (group header) or child under a selected custom category. */
  onAddCategoryInGroup?: (options: { groupLabel: string; parentCategoryId?: string | null }) => void;
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
};

function PromptCategoryNodeButton({
  countByCategory,
  dropTargetEntryId = null,
  expandedGroupIds,
  isDraggingPromptGroup = false,
  node,
  onChangeEntry,
  onDeleteCustomCategory,
  onDragEnterCategory,
  onDragLeaveCategory,
  onDropOnCategory,
  onToggleGroup,
  onAddCategoryInGroup,
  selectedMenuPath,
  onSelectMenu,
}: PromptCategoryNodeButtonProps) {
  const isGroupHeader = node.entry.id.startsWith("group:");
  const menuPath = createImageCategoryMenuValue(node.entry.id);
  // Includes this node + nested children labels (parentId tree).
  const count = countPromptGroupsForCategoryNode(node, countByCategory);
  const expanded = isGroupHeader ? expandedGroupIds.has(node.entry.id) : true;
  const isDropTarget = !isGroupHeader && dropTargetEntryId === node.entry.id;
  const canAcceptDrop = !isGroupHeader && Boolean(onDropOnCategory);
  const canDelete = !isGroupHeader && isCustomCategoryEntry(node.entry) && Boolean(onDeleteCustomCategory);
  // "+" only when needed: custom group header, or currently selected custom category (add child).
  const canAddInGroup =
    Boolean(onAddCategoryInGroup) &&
    ((isGroupHeader &&
      (normalizeCategoryLabelKey(node.entry.label || node.entry.group || "") ===
        normalizeCategoryLabelKey(defaultCategoryGroupLabel) ||
        normalizeCategoryLabelKey(node.entry.label || node.entry.group || "").startsWith("自定义"))) ||
      (!isGroupHeader && isCustomCategoryEntry(node.entry) && selectedMenuPath === menuPath));
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const categoryLabel = node.entry.label || "未命名分类";

  return (
    <>
      <div
        className={isDropTarget ? "rounded-md ring-2 ring-primary/50" : undefined}
        onDragEnter={
          canAcceptDrop
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onDragEnterCategory?.(node.entry.id);
              }
            : undefined
        }
        onDragOver={
          canAcceptDrop
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                onDragEnterCategory?.(node.entry.id);
              }
            : undefined
        }
        onDragLeave={
          canAcceptDrop
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onDragLeaveCategory?.(node.entry.id);
              }
            : undefined
        }
        onDrop={
          canAcceptDrop
            ? (event) => {
                onDropOnCategory?.(node.entry, event);
              }
            : undefined
        }
      >
        <ImageLexiconMenuButton
          active={!isGroupHeader && selectedMenuPath === menuPath}
          count={count}
          depth={node.depth}
          expandable={isGroupHeader}
          expanded={expanded}
          label={
            isDraggingPromptGroup && !isGroupHeader
              ? `↓ ${categoryLabel}`
              : categoryLabel
          }
          onClick={() => {
            if (isGroupHeader) {
              onToggleGroup(node.entry.id);
              return;
            }
            onSelectMenu(menuPath);
          }}
          onRename={
            isGroupHeader
              ? undefined
              : (newLabel) => onChangeEntry(node.entry.id, { label: newLabel })
          }
          onDelete={
            canDelete
              ? () => {
                  setIsDeleteConfirmOpen(true);
                }
              : undefined
          }
          onAdd={
            canAddInGroup
              ? () => {
                  if (isGroupHeader) {
                    onAddCategoryInGroup?.({
                      groupLabel: node.entry.label || node.entry.group || defaultCategoryGroupLabel,
                      parentCategoryId: null,
                    });
                    return;
                  }
                  onAddCategoryInGroup?.({
                    groupLabel: node.entry.group || defaultCategoryGroupLabel,
                    parentCategoryId: node.entry.id,
                  });
                }
              : undefined
          }
        />
      </div>
      {expanded
        ? node.children.map((child) => (
            <PromptCategoryNodeButton
              countByCategory={countByCategory}
              dropTargetEntryId={dropTargetEntryId}
              expandedGroupIds={expandedGroupIds}
              isDraggingPromptGroup={isDraggingPromptGroup}
              key={child.entry.id}
              node={child}
              onChangeEntry={onChangeEntry}
              onDeleteCustomCategory={onDeleteCustomCategory}
              onDragEnterCategory={onDragEnterCategory}
              onDragLeaveCategory={onDragLeaveCategory}
              onDropOnCategory={onDropOnCategory}
              onToggleGroup={onToggleGroup}
              onAddCategoryInGroup={onAddCategoryInGroup}
              selectedMenuPath={selectedMenuPath}
              onSelectMenu={onSelectMenu}
            />
          ))
        : null}
      <ConfirmDialog
        busyLabel="删除中…"
        confirmLabel="删除分类"
        description={
          <>
            将删除自定义分类「{categoryLabel}」。其下提示词会变为未分类，素材本身不会被删除。
          </>
        }
        icon={<Trash2 size={18} />}
        isBusy={isDeleting}
        open={isDeleteConfirmOpen}
        title="删除自定义分类？"
        onCancel={() => {
          if (!isDeleting) {
            setIsDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => {
          void (async () => {
            setIsDeleting(true);
            try {
              await onDeleteCustomCategory?.(node.entry.id);
              setIsDeleteConfirmOpen(false);
            } finally {
              setIsDeleting(false);
            }
          })();
        }}
      />
    </>
  );
}

type PromptTagGroupNodeButtonProps = {
  countByTag: ReadonlyMap<string, number>;
  expandedGroupPaths: ReadonlySet<string>;
  node: ImageGroupNode;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
  onRenameItem: (groupPath: string, itemKey: string, newLabel: string) => void;
  promptGroups: readonly PromptImageGroup[];
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
  onToggleGroup: (path: string) => void;
};

function PromptTagGroupNodeButton({
  countByTag,
  expandedGroupPaths,
  node,
  onRenameGroup,
  onRenameItem,
  promptGroups,
  selectedMenuPath,
  onSelectMenu,
  onToggleGroup,
}: PromptTagGroupNodeButtonProps) {
  const menuPath = createImageGroupMenuValue(node.path);
  const depth = Math.max(0, splitParameterGroupPath(node.path).length - 1);
  const count = countPromptGroupsByTagKeys(promptGroups, getTagGroupNodeLabelKeys(node));
  const expandable = node.children.length > 0 || node.items.length > 0;
  const expanded = expandedGroupPaths.has(node.path);

  return (
    <>
      <ImageLexiconMenuButton
        active={selectedMenuPath === menuPath}
        count={count}
        depth={depth}
        expandable={expandable}
        expanded={expanded}
        label={node.label}
        onClick={() => {
          if (expandable) {
            onToggleGroup(node.path);
          }
          onSelectMenu(menuPath);
        }}
        onRename={(newLabel) => onRenameGroup(node.path, newLabel)}
      />
      {expanded
        ? node.children.map((child) => (
            <PromptTagGroupNodeButton
              countByTag={countByTag}
              expandedGroupPaths={expandedGroupPaths}
              key={child.path}
              node={child}
              onRenameGroup={onRenameGroup}
              onRenameItem={onRenameItem}
              promptGroups={promptGroups}
              selectedMenuPath={selectedMenuPath}
              onSelectMenu={onSelectMenu}
              onToggleGroup={onToggleGroup}
            />
          ))
        : null}
      {expanded
        ? node.items.map((item) => (
            <ImageLexiconMenuButton
              active={selectedMenuPath === item.menuPath}
              count={countByTag.get(item.key) ?? 0}
              depth={depth + 1}
              key={item.menuPath}
              label={item.label}
              onClick={() => onSelectMenu(item.menuPath)}
              onRename={(newLabel) => onRenameItem(node.path, item.key, newLabel)}
            />
          ))
        : null}
    </>
  );
}

type ImageGroupNode = {
  children: ImageGroupNode[];
  count: number;
  items: ImageItemNode[];
  label: string;
  path: string;
};

type ImageItemNode = {
  count: number;
  key: string;
  label: string;
  menuPath: string;
};

function collectImageGroupPaths(nodes: readonly ImageGroupNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    paths.push(node.path, ...collectImageGroupPaths(node.children));
  }
  return paths;
}

type ImageGroupNodeButtonProps = {
  node: ImageGroupNode;
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
  onRenameItem?: (groupPath: string, itemKey: string, newLabel: string) => void;
};

function ImageGroupNodeButton({ node, selectedMenuPath, onSelectMenu, onRenameGroup, onRenameItem }: ImageGroupNodeButtonProps) {
  const menuPath = createImageGroupMenuValue(node.path);
  const depth = Math.max(0, splitParameterGroupPath(node.path).length - 1);

  return (
    <>
      <ImageLexiconMenuButton
        active={selectedMenuPath === menuPath}
        count={node.count}
        depth={depth}
        label={node.label}
        onClick={() => onSelectMenu(menuPath)}
        onRename={(newLabel) => onRenameGroup(node.path, newLabel)}
      />
      {node.children.map((child) => (
        <ImageGroupNodeButton
          key={child.path}
          node={child}
          selectedMenuPath={selectedMenuPath}
          onSelectMenu={onSelectMenu}
          onRenameGroup={onRenameGroup}
          onRenameItem={onRenameItem}
        />
      ))}
      {node.items.map((item) => (
        <ImageItemNodeButton
          item={item}
          key={item.menuPath}
          parentDepth={depth}
          groupPath={node.path}
          selectedMenuPath={selectedMenuPath}
          onSelectMenu={onSelectMenu}
          onRenameItem={onRenameItem}
        />
      ))}
    </>
  );
}

type ImageItemNodeButtonProps = {
  item: ImageItemNode;
  parentDepth: number;
  groupPath: string;
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
  onRenameItem?: (groupPath: string, itemKey: string, newLabel: string) => void;
};

function ImageItemNodeButton({
  item,
  parentDepth,
  groupPath,
  selectedMenuPath,
  onSelectMenu,
  onRenameItem,
}: ImageItemNodeButtonProps) {
  return (
    <ImageLexiconMenuButton
      active={selectedMenuPath === item.menuPath}
      count={item.count}
      depth={parentDepth + 1}
      label={item.label}
      onClick={() => onSelectMenu(item.menuPath)}
      onRename={onRenameItem ? (newLabel) => onRenameItem(groupPath, item.key, newLabel) : undefined}
    />
  );
}

type ImageCategoryNode = {
  children: ImageCategoryNode[];
  count: number;
  depth: number;
  entry: PromptImageLexiconEntry;
};

type ImageCategoryNodeButtonProps = {
  node: ImageCategoryNode;
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
};

function ImageCategoryNodeButton({ node, selectedMenuPath, onSelectMenu, onChangeEntry }: ImageCategoryNodeButtonProps) {
  const menuPath = createImageCategoryMenuValue(node.entry.id);

  return (
    <>
      <ImageLexiconMenuButton
        active={selectedMenuPath === menuPath}
        count={node.count}
        depth={node.depth}
        label={node.entry.label || "未命名分类"}
        onClick={() => onSelectMenu(menuPath)}
        onRename={(newLabel) => onChangeEntry(node.entry.id, { label: newLabel })}
      />
      {node.children.map((child) => (
        <ImageCategoryNodeButton
          key={child.entry.id}
          node={child}
          selectedMenuPath={selectedMenuPath}
          onSelectMenu={onSelectMenu}
          onChangeEntry={onChangeEntry}
        />
      ))}
    </>
  );
}

type ImageLexiconMenuButtonProps = {
  active: boolean;
  count: number;
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
  label: string;
  onClick: () => void;
  onRename?: (newLabel: string) => void;
  /** Optional icon-only delete action, aligned on the same row as the label. */
  onDelete?: () => void;
  /** Optional icon-only add action (e.g. add category under a group header). */
  onAdd?: () => void;
};

function ImageLexiconMenuButton({
  active,
  count,
  depth,
  expandable = false,
  expanded = false,
  label,
  onClick,
  onRename,
  onDelete,
  onAdd,
}: ImageLexiconMenuButtonProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing && onRename) {
    return (
      <div
        className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-primary bg-panel px-3 py-2 shadow-elevated"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <MenuRenameInput
          initialValue={label}
          onCommit={(next) => {
            setIsEditing(false);
            onRename(next);
          }}
          onCancel={() => setIsEditing(false)}
        />
        <span className="rounded-md border border-border/70 bg-panel px-2 py-0.5 text-xs text-muted">{count}</span>
      </div>
    );
  }

  return (
    <button
      aria-expanded={expandable ? expanded : undefined}
      aria-pressed={active}
      className={`${lexiconTreeItemBaseClassName} ${getLexiconTreeItemStateClassName(active)}`}
      data-lexicon-menu-active={active ? "true" : undefined}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      type="button"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        {expandable ? (
          <ChevronRight
            className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
            size={13}
          />
        ) : depth > 0 ? (
          <span className="size-[13px] shrink-0" aria-hidden="true" />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-center gap-1">
        {onAdd ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="新增分类"
            title="新增分类"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onAdd();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                event.preventDefault();
                onAdd();
              }
            }}
          >
            <Plus size={12} />
          </span>
        ) : null}
        {onRename ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="重命名"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100 group-focus-within:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              setIsEditing(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                event.preventDefault();
                setIsEditing(true);
              }
            }}
          >
            <Pencil size={12} />
          </span>
        ) : null}
        {onDelete ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="删除自定义分类"
            title="删除自定义分类"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/35 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onDelete();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                event.preventDefault();
                onDelete();
              }
            }}
          >
            <Trash2 size={12} />
          </span>
        ) : null}
        <span className="rounded-md border border-border/70 bg-panel px-2 py-0.5 text-xs text-muted">{count}</span>
      </span>
    </button>
  );
}

type ImageLexiconCapsuleGridProps = {
  entries: PromptImageLexiconEntry[];
  isBusy: boolean;
  kind: ImageLexiconKind;
  selectedEntries: ReadonlySet<string>;
  onClearImage: (entryId: string) => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  onRemoveEntry: (entryId: string) => void;
  onSelectEntry: (entryId: string) => void;
  onUploadImage: (entryId: string) => void;
};

function ImageLexiconCapsuleGrid({
  entries,
  isBusy,
  kind,
  selectedEntries,
  onClearImage,
  onChangeEntry,
  onRemoveEntry,
  onSelectEntry,
  onUploadImage,
}: ImageLexiconCapsuleGridProps) {
  return (
    <div className="min-h-[320px] bg-panel p-4">
      <div className="flex flex-wrap content-start gap-2">
        {entries.map((entry) => (
          <ImageLexiconCapsule
            entry={entry}
            isBusy={isBusy}
            key={entry.id}
            kind={kind}
            selected={selectedEntries.has(entry.id)}
            onClearImage={() => onClearImage(entry.id)}
            onChangeLabel={(label) => onChangeEntry(entry.id, { label })}
            onRemove={() => onRemoveEntry(entry.id)}
            onSelectedChange={() => onSelectEntry(entry.id)}
            onUploadImage={() => onUploadImage(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

type ImageLexiconCapsuleSection = {
  entries: PromptImageLexiconEntry[];
  id: string;
  subtitle: string;
  title: string;
};

type ImageLexiconCapsuleSectionGridProps = {
  isBusy: boolean;
  kind: ImageLexiconKind;
  sections: ImageLexiconCapsuleSection[];
  selectedEntries: ReadonlySet<string>;
  onClearImage: (entryId: string) => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  onRemoveEntry: (entryId: string) => void;
  onSelectEntry: (entryId: string) => void;
  onUploadImage: (entryId: string) => void;
};

function ImageLexiconCapsuleSectionGrid({
  isBusy,
  kind,
  sections,
  selectedEntries,
  onClearImage,
  onChangeEntry,
  onRemoveEntry,
  onSelectEntry,
  onUploadImage,
}: ImageLexiconCapsuleSectionGridProps) {
  return (
    <div className="min-h-[320px] bg-panel p-4">
      <div className="grid gap-3">
        {sections.map((section) => (
          <section className="rounded-lg border border-border/70 bg-background/70 p-3" key={section.id}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="truncate text-sm font-semibold text-foreground">{section.title}</h4>
                  <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-0.5 text-xs text-capsule-mist-foreground">
                    {section.entries.length}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted">{section.subtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap content-start gap-2">
              {section.entries.map((entry) => (
                <ImageLexiconCapsule
                  entry={entry}
                  isBusy={isBusy}
                  key={entry.id}
                  kind={kind}
                  selected={selectedEntries.has(entry.id)}
                  onClearImage={() => onClearImage(entry.id)}
                  onChangeLabel={(label) => onChangeEntry(entry.id, { label })}
                  onRemove={() => onRemoveEntry(entry.id)}
                  onSelectedChange={() => onSelectEntry(entry.id)}
                  onUploadImage={() => onUploadImage(entry.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

type ImageLexiconCapsuleProps = {
  entry: PromptImageLexiconEntry;
  isBusy: boolean;
  kind: ImageLexiconKind;
  selected: boolean;
  onClearImage: () => void;
  onChangeLabel: (label: string) => void;
  onRemove: () => void;
  onSelectedChange: () => void;
  onUploadImage: () => void;
};

function ImageLexiconCapsule({
  entry,
  isBusy,
  kind,
  selected,
  onClearImage,
  onChangeLabel,
  onRemove,
  onSelectedChange,
  onUploadImage,
}: ImageLexiconCapsuleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(entry.label);
  const fallbackLabel = kind === "category" ? "未命名分类" : "未命名标签";
  const uploadImageLabel = kind === "category" ? "上传分类图像" : "上传标签图像";
  const clearImageLabel = kind === "category" ? "清除分类图像" : "清除标签图像";

  useEffect(() => {
    if (!isEditing) {
      setDraftLabel(entry.label);
    }
  }, [entry.label, isEditing]);

  function commitEdit() {
    onChangeLabel(draftLabel.trim());
    setIsEditing(false);
  }

  function cancelEdit() {
    setDraftLabel(entry.label);
    setIsEditing(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  }

  return (
    <span
      className={`inline-flex min-h-9 max-w-full items-center overflow-hidden rounded-full border text-sm shadow-sm transition-colors ${
        selected
          ? "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground"
          : "border-border/70 bg-background text-foreground hover:bg-primary-soft"
      }`}
      title={entry.description || entry.group || fallbackLabel}
    >
      <button
        aria-label={uploadImageLabel}
        className="ml-1 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-panel outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isBusy}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onUploadImage();
        }}
      >
        {entry.imageFileName ? (
          <img
            alt={`${entry.label || fallbackLabel}图像`}
            className="size-full object-cover"
            src={getImageSrc(entry.imageFileName)}
          />
        ) : (
          <ImageIcon className="text-muted" size={13} />
        )}
      </button>
      {isEditing ? (
        <input
          aria-label={kind === "category" ? "编辑分类名称" : "编辑标签名称"}
          autoFocus
          className="h-8 w-32 min-w-0 bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted"
          disabled={isBusy}
          placeholder={fallbackLabel}
          value={draftLabel}
          onBlur={commitEdit}
          onChange={(event) => setDraftLabel(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          aria-label={kind === "category" ? "选择分类，双击可编辑" : "选择标签，双击可编辑"}
          className="min-w-0 px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          disabled={isBusy}
          type="button"
          onClick={onSelectedChange}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDraftLabel(entry.label);
            setIsEditing(true);
          }}
        >
          <span className="block max-w-[12rem] truncate">{entry.label || fallbackLabel}</span>
        </button>
      )}
      {entry.imageFileName ? (
        <button
          aria-label={clearImageLabel}
          className="flex size-8 shrink-0 items-center justify-center border-l border-border/70 text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isBusy}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClearImage();
          }}
        >
          <ImageOff size={13} />
        </button>
      ) : null}
      <button
        aria-label={kind === "category" ? "删除分类" : "删除标签"}
        className="flex size-8 shrink-0 items-center justify-center border-l border-border/70 text-muted outline-none transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={isBusy}
        type="button"
        onClick={onRemove}
      >
        <X size={13} />
      </button>
    </span>
  );
}


type ImageLexiconRowProps = {
  entry: PromptImageLexiconEntry;
  isBusy: boolean;
  parentOptions: PromptImageLexiconEntry[];
  selected: boolean;
  showParentSelect?: boolean;
  onChange: (patch: Partial<PromptImageLexiconEntry>) => void;
  onClearImage: () => void;
  onRemove: () => void;
  onSelectedChange: () => void;
  onUploadImage: () => void;
};

function ImageLexiconRow({
  entry,
  isBusy,
  parentOptions,
  selected,
  showParentSelect = false,
  onChange,
  onClearImage,
  onRemove,
  onSelectedChange,
  onUploadImage,
}: ImageLexiconRowProps) {
  const gridClassName = showParentSelect
    ? "min-[980px]:grid-cols-[32px_84px_minmax(14rem,1.15fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_88px_40px]"
    : "min-[980px]:grid-cols-[32px_84px_minmax(16rem,1.4fr)_minmax(10rem,0.75fr)_88px_40px]";

  return (
    <div
      className={`grid gap-3 border-b border-border/70 bg-panel px-3 py-3 transition-colors last:border-b-0 hover:bg-background min-[980px]:items-center ${gridClassName}`}
    >
      <SelectionButton selected={selected} ariaLabel="选择图像词库记录" disabled={isBusy} onClick={onSelectedChange} />
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background shadow-sm">
        {entry.imageFileName ? (
          <img
            alt={`${entry.label}图像预览`}
            className="size-full object-cover"
            src={getImageSrc(entry.imageFileName)}
          />
        ) : (
          <ImageIcon className="text-muted" size={20} />
        )}
      </div>
      <div className="grid gap-2">
        <LexiconTextInput
          ariaLabel="名称"
          placeholder="名称"
          value={entry.label}
          onChange={(value) => onChange({ label: value })}
        />
        <LexiconTextInput
          ariaLabel="说明"
          placeholder="说明"
          value={entry.description}
          onChange={(value) => onChange({ description: value })}
        />
      </div>
      <LexiconTextInput
        ariaLabel="分组"
        placeholder="分组"
        value={entry.group}
        onChange={(value) => onChange({ group: value })}
      />
      {showParentSelect ? (
        <select
          aria-label="父级分类"
          className="h-9 min-w-0 rounded-md border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={entry.parentId ?? ""}
          onChange={(event) => onChange({ parentId: event.target.value || null })}
        >
          <option value="">顶级分类</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex items-center gap-1">
        <IconButton
          ariaLabel="上传图像"
          disabled={isBusy}
          icon={<ImagePlus size={15} />}
          onClick={onUploadImage}
        />
        <IconButton
          ariaLabel="清除图像"
          disabled={isBusy || !entry.imageFileName}
          icon={<X size={15} />}
          onClick={onClearImage}
        />
      </div>
      <IconButton ariaLabel="删除记录" disabled={isBusy} icon={<Trash2 size={15} />} onClick={onRemove} />
    </div>
  );
}

type LexiconTextInputProps = {
  ariaLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

function LexiconTextInput({ ariaLabel, placeholder, value, onChange }: LexiconTextInputProps) {
  return (
    <input
      aria-label={ariaLabel}
      className="h-9 min-w-0 rounded-md border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

type SelectionButtonProps = {
  ariaLabel: string;
  disabled: boolean;
  selected: boolean;
  onClick: () => void;
};

function SelectionButton({ ariaLabel, disabled, selected, onClick }: SelectionButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={`icon-tooltip-button flex size-8 items-center justify-center rounded-md border outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground"
          : "border-border/70 bg-background text-muted"
      }`}
      data-tooltip-align="center"
      data-tooltip-placement="above"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {selected ? <CheckSquare size={16} /> : <Square size={16} />}
      <span className="icon-tooltip-button__bubble" role="tooltip">
        {ariaLabel}
      </span>
    </button>
  );
}

function LexiconEmptyState({ text }: { text: string }) {
  return (
    <div className="m-3 rounded-md border border-border/70 bg-background px-4 py-8 text-center text-sm text-muted">{text}</div>
  );
}

type IconButtonProps = {
  ariaLabel: string;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
};

function IconButton({ ariaLabel, disabled = false, icon, onClick }: IconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className="icon-tooltip-button flex size-8 items-center justify-center rounded-md border border-border/70 bg-background text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-40"
      data-tooltip-align="center"
      data-tooltip-placement="above"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span className="icon-tooltip-button__bubble" role="tooltip">
        {ariaLabel}
      </span>
    </button>
  );
}


function createPromptCategoryDrafts(
  promptLexicons: PromptLexiconSettings | null,
  popularTags: string[],
  shouldNormalize: boolean,
  categoryTaxonomy?: import("../types/category").CategoryTaxonomy | null,
): PromptImageLexiconEntry[] {
  // New taxonomy mode: always seed from system+custom taxonomy first.
  const taxonomyEntries = taxonomyToLexiconFallback(categoryTaxonomy);
  if (taxonomyEntries.length > 0) {
    const fromLexicon = promptLexicons?.categories ?? [];
    const merged = [...taxonomyEntries];
    const seen = new Set(taxonomyEntries.map((entry) => normalizeLexiconItemKey(entry.label)));
    for (const entry of fromLexicon) {
      const key = normalizeLexiconItemKey(entry.label);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(entry);
    }
    return shouldNormalize ? normalizeImageLexiconEntries(merged) : merged;
  }

  if (promptLexicons) {
    return shouldNormalize
      ? normalizeImageLexiconEntries(promptLexicons.categories)
      : promptLexicons.categories;
  }

  return createDefaultPromptLexiconSettings(popularTags).categories;
}

function taxonomyToLexiconFallback(
  categoryTaxonomy?: CategoryTaxonomy | null,
): PromptImageLexiconEntry[] {
  const taxonomy =
    categoryTaxonomy && categoryTaxonomy.nodes.length > 0
      ? categoryTaxonomy
      : createEmptyCategoryTaxonomy();
  return taxonomyToLexiconCategories(taxonomy);
}

function createPromptTagImageDrafts(
  promptLexicons: PromptLexiconSettings | null,
  popularTags: string[],
  shouldNormalize: boolean,
): PromptImageLexiconEntry[] {
  // Prefer the saved tag directory. Also fold in live material tags so AI-recognized
  // labels appear under 标签浏览 even before the next lexicon autosave settles.
  const savedTags = promptLexicons?.tags ?? [];
  const baseTags = shouldNormalize ? normalizeTagImageLexiconEntries(savedTags) : savedTags;
  const knownKeys = new Set(baseTags.map((entry) => normalizeLexiconItemKey(entry.label)).filter(Boolean));
  const derivedFromMaterials = popularTags
    .map((label) => label.trim())
    .filter((label) => {
      const key = normalizeLexiconItemKey(label);
      return Boolean(key) && !knownKeys.has(key);
    })
    .map((label) => createDerivedTagLexiconEntry(label));

  if (derivedFromMaterials.length === 0) {
    return baseTags;
  }

  return shouldNormalize
    ? normalizeTagImageLexiconEntries([...baseTags, ...derivedFromMaterials])
    : [...baseTags, ...derivedFromMaterials];
}

  function createBlankImageEntry(
  kind: "category" | "tag",
  draft: Partial<Pick<PromptImageLexiconEntry, "group" | "label" | "parentId">> = {},
): PromptImageLexiconEntry {
  const label = draft.label ?? (kind === "category" ? "新分类" : "新标签");
  return {
    id: kind === "category" ? buildCustomCategoryId(label) : `custom-tag-${createClientLexiconId("tag")}`,
    group: draft.group ?? (kind === "category" ? "自定义分类" : defaultTagGroupLabel),
    label,
    description: "",
    parentId: draft.parentId ?? null,
    imageFileName: null,
  };
}

function createClientLexiconId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}


function normalizeImageLexiconEntries(entries: readonly PromptImageLexiconEntry[]): PromptImageLexiconEntry[] {
  const normalizedEntries: PromptImageLexiconEntry[] = [];
  const usedIds = new Set<string>();

  for (const entry of entries) {
    const label = entry.label.trim();

    if (!label) {
      continue;
    }

    const id = getUniqueLexiconId(entry.id, usedIds, "image");
    normalizedEntries.push({
      id,
      group: entry.group.trim(),
      label,
      description: entry.description.trim(),
      parentId: entry.parentId?.trim() || null,
      imageFileName: entry.imageFileName?.trim() || null,
    });
  }

  const validIds = new Set(normalizedEntries.map((entry) => entry.id));

  return normalizedEntries.map((entry) => ({
    ...entry,
    parentId: entry.parentId && validIds.has(entry.parentId) && entry.parentId !== entry.id ? entry.parentId : null,
  }));
}

function normalizeTagImageLexiconEntries(entries: readonly PromptImageLexiconEntry[]): PromptImageLexiconEntry[] {
  const normalizedEntries: PromptImageLexiconEntry[] = [];
  const entriesByLabel = new Map<string, PromptImageLexiconEntry>();

  for (const entry of normalizeImageLexiconEntries(entries)) {
    const labelKey = normalizeLexiconItemKey(entry.label);
    const normalizedEntry: PromptImageLexiconEntry = {
      ...entry,
      group: getPromptTagGroup(entry.label, entry.group),
      parentId: null,
    };
    const existingEntry = entriesByLabel.get(labelKey);

    if (existingEntry) {
      if (!existingEntry.description && normalizedEntry.description) {
        existingEntry.description = normalizedEntry.description;
      }

      if (!existingEntry.imageFileName && normalizedEntry.imageFileName) {
        existingEntry.imageFileName = normalizedEntry.imageFileName;
      }

      continue;
    }

    entriesByLabel.set(labelKey, normalizedEntry);
    normalizedEntries.push(normalizedEntry);
  }

  return normalizedEntries;
}


function getUniqueLexiconId(id: string, usedIds: Set<string>, prefix: string): string {
  const normalizedId = id.trim() || createClientLexiconId(prefix);

  if (!usedIds.has(normalizedId)) {
    usedIds.add(normalizedId);
    return normalizedId;
  }

  let nextId = createClientLexiconId(prefix);

  while (usedIds.has(nextId)) {
    nextId = createClientLexiconId(prefix);
  }

  usedIds.add(nextId);
  return nextId;
}

function normalizeLexiconItemKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-Hans-CN");
}



function splitParameterGroupPath(groupPath: string): string[] {
  return groupPath
    .split(/\s*(?:\/|／|>|＞|›|»|\||｜)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}


function renameImageGroupInDrafts(
  drafts: readonly PromptImageLexiconEntry[],
  oldPath: string,
  newLabel: string,
): PromptImageLexiconEntry[] {
  const oldSegments = splitParameterGroupPath(oldPath);
  if (oldSegments.length === 0) {
    return [...drafts];
  }
  const newSegments = [...oldSegments.slice(0, -1), newLabel];

  return drafts.map((entry) => {
    const entrySegments = getImageGroupSegments(entry);
    if (entrySegments.length < oldSegments.length) {
      return entry;
    }
    const isUnderOldPath = oldSegments.every((segment, index) => entrySegments[index] === segment);
    if (!isUnderOldPath) {
      return entry;
    }
    const remainingSegments = entrySegments.slice(oldSegments.length);
    const nextGroup = remainingSegments.length > 0
      ? [...newSegments, ...remainingSegments].join(" / ")
      : newSegments.join(" / ");
    return { ...entry, group: nextGroup };
  });
}

function renameImageItemInDrafts(
  drafts: readonly PromptImageLexiconEntry[],
  groupPath: string,
  itemKey: string,
  newLabel: string,
): PromptImageLexiconEntry[] {
  const trimmed = newLabel.trim();

  if (!trimmed) {
    return [...drafts];
  }

  return drafts.map((entry) => {
    const entryGroupPath = getImageGroupSegments(entry).join(" / ");

    if (entryGroupPath !== groupPath || getImageItemKey(entry) !== itemKey) {
      return entry;
    }

    return { ...entry, label: trimmed };
  });
}

function getImageLexiconAllValue(kind: ImageLexiconKind): string {
  return kind === "category" ? allCategoryGroupsValue : allTagGroupsValue;
}

function getImageLexiconAllLabel(kind: ImageLexiconKind): string {
  return kind === "category" ? "全部分类" : "全部标签";
}

function createImageGroupMenuValue(groupPath: string): string {
  return `${imageGroupMenuPrefix}${groupPath}`;
}

function createImageCategoryMenuValue(entryId: string): string {
  return `${imageCategoryMenuPrefix}${entryId}`;
}

function createImageItemMenuValue(groupPath: string, itemKey: string): string {
  return `${imageItemMenuPrefix}${encodeURIComponent(groupPath)}|${encodeURIComponent(itemKey)}`;
}

function parseImageItemMenuValue(menuPath: string): { groupPath: string; itemKey: string } | null {
  if (!menuPath.startsWith(imageItemMenuPrefix)) {
    return null;
  }

  const payload = menuPath.slice(imageItemMenuPrefix.length);
  const [encodedGroupPath, encodedItemKey] = payload.split("|");

  if (!encodedGroupPath || !encodedItemKey) {
    return null;
  }

  return {
    groupPath: decodeURIComponent(encodedGroupPath),
    itemKey: decodeURIComponent(encodedItemKey),
  };
}

function getImageEntryDraft(
  kind: ImageLexiconKind,
  selectedMenuPath: string,
  entries: readonly PromptImageLexiconEntry[],
): Partial<Pick<PromptImageLexiconEntry, "group" | "label" | "parentId">> {
  const parsedItem = parseImageItemMenuValue(selectedMenuPath);

  if (parsedItem) {
    const matchedEntry = entries.find(
      (entry) => isExactImageGroupMatch(entry, parsedItem.groupPath) && getImageItemKey(entry) === parsedItem.itemKey,
    );

    if (matchedEntry) {
      return {
        group: matchedEntry.group || (kind === "category" ? defaultCategoryGroupLabel : defaultTagGroupLabel),
        label: matchedEntry.label,
        parentId: kind === "category" ? matchedEntry.parentId ?? null : null,
      };
    }
  }

  if (kind === "category" && selectedMenuPath.startsWith(imageCategoryMenuPrefix)) {
    const parentId = selectedMenuPath.slice(imageCategoryMenuPrefix.length);
    const parent = entries.find((entry) => entry.id === parentId);

    if (parent) {
      return {
        group: parent.group || defaultCategoryGroupLabel,
        parentId: parent.id,
      };
    }
  }

  return {
    group: getImageGroupDraft(kind, selectedMenuPath),
  };
}

function getImageGroupDraft(kind: ImageLexiconKind, selectedMenuPath: string): string {
  const defaultGroupLabel = kind === "category" ? defaultCategoryGroupLabel : defaultTagGroupLabel;
  const parsedItem = parseImageItemMenuValue(selectedMenuPath);

  if (parsedItem) {
    const segments = splitParameterGroupPath(parsedItem.groupPath);
    return segments.length > 0 && segments[0] !== ungroupedImageGroupLabel ? segments.join(" / ") : defaultGroupLabel;
  }

  if (!selectedMenuPath.startsWith(imageGroupMenuPrefix)) {
    return defaultGroupLabel;
  }

  const segments = splitParameterGroupPath(selectedMenuPath.slice(imageGroupMenuPrefix.length));

  if (segments.length === 0 || segments[0] === ungroupedImageGroupLabel) {
    return defaultGroupLabel;
  }

  return segments.join(" / ");
}

function matchesImageLexiconMenu(
  entry: PromptImageLexiconEntry,
  selectedMenuPath: string,
  entries: readonly PromptImageLexiconEntry[],
  kind: ImageLexiconKind,
): boolean {
  if (selectedMenuPath === getImageLexiconAllValue(kind)) {
    return true;
  }

  if (selectedMenuPath.startsWith(imageGroupMenuPrefix)) {
    const selectedSegments = splitParameterGroupPath(selectedMenuPath.slice(imageGroupMenuPrefix.length));
    const entrySegments = getImageGroupSegments(entry);

    return selectedSegments.every((segment, index) => entrySegments[index] === segment);
  }

  const parsedItem = parseImageItemMenuValue(selectedMenuPath);

  if (parsedItem) {
    return isExactImageGroupMatch(entry, parsedItem.groupPath) && getImageItemKey(entry) === parsedItem.itemKey;
  }

  if (kind === "category" && selectedMenuPath.startsWith(imageCategoryMenuPrefix)) {
    const rootId = selectedMenuPath.slice(imageCategoryMenuPrefix.length);
    return entry.id === rootId || getImageLexiconDescendantIds(entries, rootId).has(entry.id);
  }

  return false;
}

function getImageLexiconMenuDisplayLabel(
  kind: ImageLexiconKind,
  selectedMenuPath: string,
  entries: readonly PromptImageLexiconEntry[],
): string {
  if (selectedMenuPath === getImageLexiconAllValue(kind)) {
    return getImageLexiconAllLabel(kind);
  }

  if (selectedMenuPath.startsWith(imageGroupMenuPrefix)) {
    const segments = splitParameterGroupPath(selectedMenuPath.slice(imageGroupMenuPrefix.length));
    return `分组：${segments.length > 0 ? segments.join(" / ") : ungroupedImageGroupLabel}`;
  }

  const parsedItem = parseImageItemMenuValue(selectedMenuPath);

  if (parsedItem) {
    const matchedEntry = entries.find(
      (entry) => isExactImageGroupMatch(entry, parsedItem.groupPath) && getImageItemKey(entry) === parsedItem.itemKey,
    );
    const groupSegments = splitParameterGroupPath(parsedItem.groupPath);
    const groupLabel = groupSegments.length > 0 ? groupSegments.join(" / ") : ungroupedImageGroupLabel;
    const itemLabel = matchedEntry?.label || parsedItem.itemKey || "未命名词条";
    return `${groupLabel} / ${itemLabel}`;
  }

  if (kind === "category" && selectedMenuPath.startsWith(imageCategoryMenuPrefix)) {
    const entryId = selectedMenuPath.slice(imageCategoryMenuPrefix.length);
    const entry = entries.find((item) => item.id === entryId);
    return `分类：${entry?.label || "未命名分类"}`;
  }

  return getImageLexiconAllLabel(kind);
}

function buildImageLexiconCapsuleSections(
  entries: readonly PromptImageLexiconEntry[],
  kind: ImageLexiconKind,
): ImageLexiconCapsuleSection[] {
  const sectionMap = new Map<string, ImageLexiconCapsuleSection>();
  const itemLabel = kind === "category" ? "分类图像" : "标签图像";

  for (const entry of entries) {
    const groupPath = getImageGroupSegments(entry).join(" / ");
    let section = sectionMap.get(groupPath);

    if (!section) {
      section = {
        entries: [],
        id: groupPath,
        subtitle: `${itemLabel}集合`,
        title: groupPath || ungroupedImageGroupLabel,
      };
      sectionMap.set(groupPath, section);
    }

    section.entries.push(entry);
  }

  return [...sectionMap.values()]
    .map((section) => ({
      ...section,
      entries: [...section.entries].sort(compareImageLexiconEntries),
    }))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN"));
}

function buildImageLexiconGroupTree(entries: readonly PromptImageLexiconEntry[]): ImageGroupNode[] {
  const rootNodes: ImageGroupNode[] = [];

  for (const entry of entries) {
    let currentNodes = rootNodes;
    const pathSegments: string[] = [];

    for (const segment of getImageGroupSegments(entry)) {
      pathSegments.push(segment);
      const path = pathSegments.join(" / ");
      let node = currentNodes.find((item) => item.label === segment);

      if (!node) {
        node = {
          children: [],
          count: 0,
          items: [],
          label: segment,
          path,
        };
        currentNodes.push(node);
      }

      node.count += 1;
      currentNodes = node.children;
    }

    const groupPath = getImageGroupSegments(entry).join(" / ");
    const groupNode = findImageGroupNode(rootNodes, groupPath);
    const itemKey = getImageItemKey(entry);
    let itemNode = groupNode?.items.find((item) => item.key === itemKey);

    if (groupNode && !itemNode) {
      itemNode = {
        count: 0,
        key: itemKey,
        label: entry.label || "未命名词条",
        menuPath: createImageItemMenuValue(groupPath, itemKey),
      };
      groupNode.items.push(itemNode);
    }

    if (itemNode) {
      itemNode.count += 1;
    }
  }

  return sortImageGroupNodes(rootNodes);
}

function sortImageGroupNodes(nodes: ImageGroupNode[]): ImageGroupNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortImageGroupNodes(node.children),
      items: sortImageItemNodes(node.items),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function sortImageItemNodes(nodes: ImageItemNode[]): ImageItemNode[] {
  return [...nodes].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function getImageGroupSegments(entry: PromptImageLexiconEntry): string[] {
  const segments = splitParameterGroupPath(entry.group);
  return segments.length > 0 ? segments : [ungroupedImageGroupLabel];
}

function findImageGroupNode(nodes: readonly ImageGroupNode[], groupPath: string): ImageGroupNode | null {
  for (const node of nodes) {
    if (node.path === groupPath) {
      return node;
    }

    const childNode = findImageGroupNode(node.children, groupPath);

    if (childNode) {
      return childNode;
    }
  }

  return null;
}

function isExactImageGroupMatch(entry: PromptImageLexiconEntry, groupPath: string): boolean {
  const selectedSegments = splitParameterGroupPath(groupPath);
  const entrySegments = getImageGroupSegments(entry);

  return selectedSegments.length === entrySegments.length && selectedSegments.every((segment, index) => entrySegments[index] === segment);
}

function getImageItemKey(entry: PromptImageLexiconEntry): string {
  return normalizeLexiconItemKey(entry.label) || "unnamed-image-entry";
}

function buildImageCategoryTree(entries: readonly PromptImageLexiconEntry[]): ImageCategoryNode[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const childrenByParentId = new Map<string, PromptImageLexiconEntry[]>();
  const rootEntries: PromptImageLexiconEntry[] = [];

  for (const entry of entries) {
    const parentId = normalizeOptionalLexiconValue(entry.parentId);

    if (parentId && parentId !== entry.id && byId.has(parentId)) {
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(entry);
      childrenByParentId.set(parentId, children);
    } else {
      rootEntries.push(entry);
    }
  }

  for (const children of childrenByParentId.values()) {
    children.sort(compareImageLexiconEntries);
  }

  const visitedIds = new Set<string>();
  const sortedRootEntries = [...rootEntries].sort(compareImageLexiconEntries);

  function buildNode(entry: PromptImageLexiconEntry, depth: number, lineageIds: Set<string>): ImageCategoryNode {
    visitedIds.add(entry.id);
    const nextLineageIds = new Set(lineageIds);
    nextLineageIds.add(entry.id);
    const children = (childrenByParentId.get(entry.id) ?? [])
      .filter((child) => !nextLineageIds.has(child.id) && !visitedIds.has(child.id))
      .map((child) => buildNode(child, depth + 1, nextLineageIds));

    return {
      children,
      count: 1 + children.reduce((total, child) => total + child.count, 0),
      depth,
      entry,
    };
  }

  const nodes = sortedRootEntries.map((entry) => buildNode(entry, 0, new Set<string>()));

  for (const entry of [...entries].sort(compareImageLexiconEntries)) {
    if (!visitedIds.has(entry.id)) {
      nodes.push(buildNode(entry, 0, new Set<string>()));
    }
  }

  return nodes;
}

/** Build group → categories tree, nesting children via parentId under their parents. */
function buildGroupedCategoryTree(entries: readonly PromptImageLexiconEntry[]): ImageCategoryNode[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const childrenByParentId = new Map<string, PromptImageLexiconEntry[]>();
  const rootsByGroup = new Map<string, PromptImageLexiconEntry[]>();

  for (const entry of entries) {
    const parentId = normalizeOptionalLexiconValue(entry.parentId);
    if (parentId && parentId !== entry.id && byId.has(parentId)) {
      const children = childrenByParentId.get(parentId) ?? [];
      children.push(entry);
      childrenByParentId.set(parentId, children);
      continue;
    }
    const group = (entry.group || defaultCategoryGroupLabel).trim() || defaultCategoryGroupLabel;
    const list = rootsByGroup.get(group) ?? [];
    list.push(entry);
    rootsByGroup.set(group, list);
  }

  for (const children of childrenByParentId.values()) {
    children.sort(compareImageLexiconEntries);
  }
  for (const roots of rootsByGroup.values()) {
    roots.sort(compareImageLexiconEntries);
  }

  function buildEntryNode(entry: PromptImageLexiconEntry, depth: number, lineage: Set<string>): ImageCategoryNode {
    const nextLineage = new Set(lineage);
    nextLineage.add(entry.id);
    const children = (childrenByParentId.get(entry.id) ?? [])
      .filter((child) => !nextLineage.has(child.id))
      .map((child) => buildEntryNode(child, depth + 1, nextLineage));

    return {
      children,
      count: 1 + children.reduce((total, child) => total + child.count, 0),
      depth,
      entry,
    };
  }

  return Array.from(rootsByGroup.entries())
    .sort(([a], [b]) => compareCategoryGroupPriority(a, b))
    .map(([group, rootEntries]) => {
      const groupId = `group:${normalizeLexiconItemKey(group) || "ungrouped"}`;
      const children = rootEntries.map((entry) => buildEntryNode(entry, 1, new Set<string>()));

      return {
        children,
        count: children.reduce((total, child) => total + child.count, 0),
        depth: 0,
        entry: {
          id: groupId,
          group,
          label: group,
          description: "",
          parentId: null,
          imageFileName: null,
        },
      };
    });
}

function compareImageLexiconEntries(left: PromptImageLexiconEntry, right: PromptImageLexiconEntry): number {
  return (left.label || left.group).localeCompare(right.label || right.group, "zh-Hans-CN");
}

function getImageLexiconDescendantIds(entries: readonly PromptImageLexiconEntry[], rootId: string): Set<string> {
  const childrenByParentId = new Map<string, PromptImageLexiconEntry[]>();

  for (const entry of entries) {
    const parentId = normalizeOptionalLexiconValue(entry.parentId);

    if (!parentId || parentId === entry.id) {
      continue;
    }

    const children = childrenByParentId.get(parentId) ?? [];
    children.push(entry);
    childrenByParentId.set(parentId, children);
  }

  const descendantIds = new Set<string>();
  const queue = [...(childrenByParentId.get(rootId) ?? [])];

  while (queue.length > 0) {
    const entry = queue.shift();

    if (!entry || entry.id === rootId || descendantIds.has(entry.id)) {
      continue;
    }

    descendantIds.add(entry.id);
    queue.push(...(childrenByParentId.get(entry.id) ?? []));
  }

  return descendantIds;
}

function buildPromptGroupCountByCategory(
  groups: readonly PromptImageGroup[],
  labelsCache?: ReadonlyMap<string, string[]>,
): ReadonlyMap<string, number> {
  const countByCategory = new Map<string, number>();

  for (const group of groups) {
    const labels = labelsCache?.get(group.id) ?? getPromptGroupCategoryLabels(group);
    const categoryKeys = new Set(labels.map(normalizeLexiconItemKey).filter(Boolean));

    for (const categoryKey of categoryKeys) {
      countByCategory.set(categoryKey, (countByCategory.get(categoryKey) ?? 0) + 1);
    }
  }

  return countByCategory;
}

function mergeCategoryLexiconEntriesWithPromptGroups(
  entries: readonly PromptImageLexiconEntry[],
  groups: readonly PromptImageGroup[],
  labelsCache?: ReadonlyMap<string, string[]>,
): PromptImageLexiconEntry[] {
  // Do NOT invent custom categories from freeform item.category labels.
  // That re-filled「自定义分类」with residual names (创意 / 图表 / 即梦AI …).
  // Taxonomy + user-created customs are the only category menu sources.
  void groups;
  void labelsCache;
  return [...entries];
}

function createDerivedCategoryLexiconEntry(label: string): PromptImageLexiconEntry {
  const matchedDefinition = photographyCategoryDefinitions.find((category) =>
    normalizeLexiconItemKey(category.label) === normalizeLexiconItemKey(label),
  );

  return {
    id: `derived-category-${normalizeLexiconItemKey(label)}`,
    group: matchedDefinition?.group ?? defaultCategoryGroupLabel,
    label: matchedDefinition?.label ?? label.trim(),
    description: matchedDefinition?.description ?? "",
    parentId: null,
    imageFileName: null,
  };
}

function buildPromptGroupCountByTag(
  groups: readonly PromptImageGroup[],
  labelsCache?: ReadonlyMap<string, string[]>,
): ReadonlyMap<string, number> {
  const countByTag = new Map<string, number>();

  for (const group of groups) {
    const labels = labelsCache?.get(group.id) ?? getPromptGroupTagLabels(group);
    const groupTagKeys = new Set(labels.map(normalizeLexiconItemKey).filter(Boolean));

    for (const tagKey of groupTagKeys) {
      countByTag.set(tagKey, (countByTag.get(tagKey) ?? 0) + 1);
    }
  }

  return countByTag;
}

function mergeTagLexiconEntriesWithPromptGroups(
  entries: readonly PromptImageLexiconEntry[],
  groups: readonly PromptImageGroup[],
  labelsCache?: ReadonlyMap<string, string[]>,
): PromptImageLexiconEntry[] {
  // Keep every used tag visible in its semantic group. Older versions collapsed
  // scene, material, pose and composition labels into one fun-recipe bucket.
  void groups;
  void labelsCache;
  const categoryLabelKeys = new Set(
    photographyCategoryLabels.map((label) => normalizeLexiconItemKey(label)).filter(Boolean),
  );
  const cleaned = normalizeTagImageLexiconEntries(
    entries.filter((entry) => {
      const key = normalizeLexiconItemKey(entry.label);
      return Boolean(key) && !categoryLabelKeys.has(key);
    }),
  );

  // Build used keys from current groups for orphan hiding.
  const usedKeys = new Set<string>();
  for (const group of groups) {
    for (const label of labelsCache?.get(group.id) ?? getPromptGroupTagLabels(group)) {
      const key = normalizeLexiconItemKey(label);
      if (key) {
        usedKeys.add(key);
      }
    }
  }

  return cleaned.filter(
    (entry) =>
      entry.id.startsWith("custom-tag-") ||
      usedKeys.size === 0 ||
      usedKeys.has(normalizeLexiconItemKey(entry.label)),
  );
}

function createDerivedTagLexiconEntry(label: string): PromptImageLexiconEntry {
  const normalizedLabel = label.trim();
  // Never promote formal category names into the tag lexicon.
  const isCategoryLike = photographyCategoryLabels.some(
    (category) => normalizeLexiconItemKey(category) === normalizeLexiconItemKey(normalizedLabel),
  );

  return {
    id: `derived-tag-${normalizeLexiconItemKey(normalizedLabel)}`,
    group: isCategoryLike ? defaultTagGroupLabel : getPromptTagGroup(normalizedLabel, defaultTagGroupLabel),
    label: normalizedLabel,
    description: isCategoryLike ? "已从分类名中隔离" : "",
    parentId: null,
    imageFileName: null,
  };
}

function countPromptGroupsForCategoryNode(
  node: ImageCategoryNode,
  countByCategory: ReadonlyMap<string, number>,
): number {
  let count = 0;

  for (const categoryKey of getCategoryNodeLabelKeys(node)) {
    count += countByCategory.get(categoryKey) ?? 0;
  }

  return count;
}

function filterCategoryTreeByPromptGroups(
  nodes: readonly ImageCategoryNode[],
  countByCategory: ReadonlyMap<string, number>,
): ImageCategoryNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: filterCategoryTreeByPromptGroups(node.children, countByCategory),
    }))
    .filter((node) => countPromptGroupsForCategoryNode(node, countByCategory) > 0);
}

function filterTagGroupTreeByPromptGroups(
  nodes: readonly ImageGroupNode[],
  countByTag: ReadonlyMap<string, number>,
): ImageGroupNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: filterTagGroupTreeByPromptGroups(node.children, countByTag),
      items: node.items.filter((item) => (countByTag.get(item.key) ?? 0) > 0),
    }))
    .filter((node) => node.items.length > 0 || node.children.length > 0);
}

function countPromptGroupsByTagKeys(groups: readonly PromptImageGroup[], tagKeys: ReadonlySet<string>): number {
  if (tagKeys.size === 0) {
    return 0;
  }

  return groups.filter((group) => getPromptGroupTagLabels(group).some((label) => tagKeys.has(normalizeLexiconItemKey(label))))
    .length;
}

function countPromptGroupsForCategoryMenu(
  groups: readonly PromptImageGroup[],
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
  labelsCache?: ReadonlyMap<string, string[]>,
): number {
  const selection = getSelectedCategorySelection(entries, selectedMenuPath);

  if (selection === null) {
    return groups.length;
  }

  return groups.filter((group) => promptGroupMatchesCategorySelection(group, selection, labelsCache))
    .length;
}

function countPromptGroupsForTagMenu(
  groups: readonly PromptImageGroup[],
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
  labelsCache?: ReadonlyMap<string, string[]>,
): number {
  const tagKeys = getSelectedTagLabelKeys(entries, selectedMenuPath);

  if (tagKeys === null) {
    return groups.length;
  }

  return groups.filter((group) => (labelsCache?.get(group.id) ?? getPromptGroupTagLabels(group)).some((label) => tagKeys.has(normalizeLexiconItemKey(label))))
    .length;
}

function shouldAnalyzePromptGroupCategory(group: PromptImageGroup): boolean {
  // Analyze when the primary item has no formal category or secondary genre yet.
  return getPromptGroupCategoryLabels(group).length === 0;
}

function shouldAnalyzePromptGroupTags(group: PromptImageGroup): boolean {
  // Analyze when the group has few concrete (non-category) tags left.
  return getPromptGroupTagLabels(group).length < Math.min(5, maxBatchAiTagCount);
}

function getPromptGroupTagLabels(group: PromptImageGroup): string[] {
  // Prompt cards already run sanitizePromptTags in toPromptCardData — reuse those
  // tags here. Re-sanitizing every group on each menu open was ~3.6s of main-thread work.
  const labels: string[] = [];
  const seenKeys = new Set<string>();

  for (const item of group.items) {
    for (const tag of item.tags) {
      const label = tag.trim();
      const key = normalizeLexiconItemKey(label);
      if (!key || key === normalizeLexiconItemKey("未分类") || seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      labels.push(label);
    }
  }

  return labels;
}

function buildPromptGroupCategoryPatch(
  item: PromptCardData,
  analysis: {
    primaryCategory: string;
    suggestedCategories: string[];
    taxonomyPrimaryCategoryId?: string | null;
    taxonomySuggestions?: Array<{ categoryId: string; confidence: number }>;
    taxonomyBand?: "high" | "mid" | "low" | "none";
  },
  taxonomy?: CategoryTaxonomy | null,
): Partial<LibraryItem> | null {
  const suggestionIds = Array.isArray(analysis.taxonomySuggestions)
    ? analysis.taxonomySuggestions
        .map((suggestion) => suggestion.categoryId)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  const taxonomyId = analysis.taxonomyPrimaryCategoryId ?? suggestionIds[0] ?? null;
  if (taxonomyId && taxonomy) {
    const name = resolveCategoryName(taxonomy, taxonomyId, analysis.primaryCategory);
    if (!name || name === "未分类") {
      return null;
    }

    const orderedNames = dedupeExclusiveGenreLabels([
      name,
      ...suggestionIds
        .filter((id) => id !== taxonomyId)
        .map((id) => resolveCategoryName(taxonomy, id, ""))
        .filter(Boolean),
    ]);
    const orderedIds = orderedNames
      .map((label) => resolveCategoryIdFromLegacyName(taxonomy, label))
      .filter((id): id is string => Boolean(id));
    // 只新增不替换：素材已有主分类时保留原主分类，AI 结果全部作为次分类追加。
    const hasExistingCategory =
      typeof item.category === "string" && item.category.trim() && item.category.trim() !== "未分类";
    const primaryId = hasExistingCategory ? item.categoryId ?? orderedIds[0] ?? taxonomyId : orderedIds[0] ?? taxonomyId;
    const primaryName = hasExistingCategory ? item.category!.trim() : orderedNames[0] ?? name;
    // 次分类只写 genreIds。绝不能塞进 tags —— saveItem 会对 tags 跑标签清洗
    // （normalizeConcretePromptTags），分类名会被整体剥掉，导致次分类存不住。
    const genreIds = mergeAnalysisLabelsWithFitCap({
      existing: item.genreIds ?? [],
      incoming: orderedIds,
      maxCount: maxAiCategoryCount,
      protectedCount: 1,
    });
    const currentGenreKey = (item.genreIds ?? []).join("|");
    const nextGenreKey = genreIds.join("|");

    if (
      item.categoryId === primaryId &&
      normalizeLexiconItemKey(item.category ?? "") === normalizeLexiconItemKey(primaryName) &&
      currentGenreKey === nextGenreKey
    ) {
      return null;
    }

    return {
      category: primaryName,
      categoryId: primaryId,
      genreIds,
      categorySource: "ai",
      categoryConfidence:
        analysis.taxonomyBand === "high" ? 0.96 : analysis.taxonomyBand === "mid" ? 0.8 : 0.65,
    };
  }

  const nextCategories = dedupeExclusiveGenreLabels(
    normalizeBatchCategorySuggestions([
      analysis.primaryCategory,
      ...analysis.suggestedCategories,
    ]),
  ).slice(0, maxAiCategoryCount);

  if (nextCategories.length === 0) {
    return null;
  }

  // 只新增不替换：素材已有主分类时保留原主分类，AI 结果全部作为次分类追加。
  const hasExistingLabel =
    typeof item.category === "string" && item.category.trim() && item.category.trim() !== "未分类";
  const category = hasExistingLabel ? item.category!.trim() : nextCategories[0];
  const resolvedIds = nextCategories
    .map((label) => (taxonomy ? resolveCategoryIdFromLegacyName(taxonomy, label) : null))
    .filter((id): id is string => Boolean(id));
  const resolvedId = hasExistingLabel ? item.categoryId ?? resolvedIds[0] ?? null : resolvedIds[0] ?? null;
  // 次分类只写 genreIds，不夹带进 tags（tags 会被 saveItem 做标签清洗剥掉分类名）。
  const mergedGenreIds = mergeAnalysisLabelsWithFitCap({
    existing: item.genreIds ?? [],
    incoming: resolvedIds,
    maxCount: maxAiCategoryCount,
    protectedCount: 1,
  });
  const genreIds = mergedGenreIds.length > 0 ? mergedGenreIds : null;

  if (
    normalizeLexiconItemKey(category) === normalizeLexiconItemKey(item.category ?? "") &&
    item.categoryId === resolvedId &&
    (item.genreIds ?? []).join("|") === (genreIds ?? []).join("|")
  ) {
    return null;
  }

  return {
    category,
    categoryId: resolvedId,
    genreIds,
    categorySource: "ai",
    categoryConfidence: 0.8,
  };
}

function buildPromptGroupTagPatch(
  item: PromptCardData,
  analysis: { suggestedTags: string[] },
): Pick<LibraryItem, "tags"> | null {
  const formalCategory =
    typeof item.category === "string" && item.category.trim() && item.category.trim() !== "未分类"
      ? item.category.trim()
      : "";

  // AI tags: merge, sanitize, and force into wiki dimensions (Object/Purpose/Technique/Scene/Style…).
  const suggestedTags = normalizeWikiDimensionTags(analysis.suggestedTags, {
    category: formalCategory,
    maxCount: maxBatchAiTagCount,
  });

  if (suggestedTags.length === 0) {
    return null;
  }

  // 未满纯新增；满了之后高匹配度的新标签顶掉低匹配度的旧标签。
  const tags = normalizeWikiDimensionTags(
    mergeAnalysisLabelsWithFitCap({
      existing: item.tags,
      incoming: suggestedTags,
      maxCount: maxBatchAiTagCount,
    }),
    {
      category: formalCategory,
      maxCount: maxBatchAiTagCount,
    },
  );

  if (areLabelArraysEqual(tags, item.tags)) {
    return null;
  }

  return { tags };
}

/** Map free tags into professional wiki tag layers; never promote to Genre. */
function normalizeWikiDimensionTags(
  tags: readonly string[],
  options: { category?: string | null; maxCount?: number } = {},
): string[] {
  // 1) strip genre names / generics / noise
  // 2) drop pseudo-genre phrases (红色产品摄影 / 高级感摄影 …)
  const cleaned = sanitizePromptTags(tags, {
    category: options.category,
    maxCount: (options.maxCount ?? maxBatchAiTagCount) * 2,
  });

  // 优先保留标签层该负责的具体事实：主体、服饰、环境、构图、动作、
  // 道具、光影和材质。纯色只作为补充信息，不能挤掉实体标签。
  // 风格 / 情绪 / 应用 已经归分类，sanitizePromptTags 上一步就把它们剥掉了，
  // 继续列在这里只会让人以为标签还管这些维度。
  const preferred: string[] = [];
  const rest: string[] = [];
  for (const tag of cleaned) {
    const group = getPromptTagGroup(tag);
    if (
      group.startsWith("主体") ||
      group.startsWith("服饰") ||
      group.startsWith("空间环境") ||
      group.startsWith("景别") ||
      group.startsWith("构图") ||
      group.startsWith("动作姿态") ||
      group.startsWith("道具与配饰") ||
      group.startsWith("光影") ||
      group.startsWith("材质") ||
      group.includes("数量")
    ) {
      preferred.push(tag);
    } else if (tag.length <= 12) {
      rest.push(tag);
    }
  }

  const merged = uniqueNormalizedLabels([...preferred, ...rest]);
  const maxCount = options.maxCount ?? maxBatchAiTagCount;
  return merged.slice(0, maxCount);
}

function normalizeBatchCategorySuggestions(values: readonly string[]): string[] {
  const knownCategoryKeys = new Map(photographyCategoryLabels.map((label) => [normalizeLexiconItemKey(label), label]));
  const suggestions: string[] = [];

  for (const value of values) {
    const normalizedKey = normalizeLexiconItemKey(value);

    if (!normalizedKey || normalizedKey === normalizeLexiconItemKey("未分类")) {
      continue;
    }

    const category = knownCategoryKeys.get(normalizedKey) ?? value.trim();

    if (!suggestions.some((item) => normalizeLexiconItemKey(item) === normalizeLexiconItemKey(category))) {
      suggestions.push(category);
    }
  }

  return suggestions;
}

function uniqueNormalizedLabels(values: readonly string[]): string[] {
  const labels: string[] = [];

  for (const value of values) {
    const label = value.trim();

    if (!label || labels.some((item) => normalizeLexiconItemKey(item) === normalizeLexiconItemKey(label))) {
      continue;
    }

    labels.push(label);
  }

  return labels;
}

function areLabelArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((label, index) => normalizeLexiconItemKey(label) === normalizeLexiconItemKey(right[index] ?? ""))
  );
}

function filterPromptGroupsForCategoryMenu(
  groups: readonly PromptImageGroup[],
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
  query: string,
  labelsCache?: ReadonlyMap<string, string[]>,
): PromptImageGroup[] {
  const selection = getSelectedCategorySelection(entries, selectedMenuPath);

  return groups.filter((group) => {
    const matchesCategory =
      selection === null || promptGroupMatchesCategorySelection(group, selection, labelsCache);

    return matchesCategory && matchesPromptGroupQuery(group, query);
  });
}

type CategoryMenuSelection = {
  /** Taxonomy / lexicon entry ids under the selected menu (includes descendants). */
  entryIds: ReadonlySet<string>;
  /** Normalized labels for freeform categories that only have a display name. */
  labelKeys: ReadonlySet<string>;
};

function getSelectedCategorySelection(
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
): CategoryMenuSelection | null {
  if (selectedMenuPath === allCategoryGroupsValue) {
    return null;
  }

  if (!selectedMenuPath.startsWith(imageCategoryMenuPrefix)) {
    return { entryIds: new Set(), labelKeys: new Set() };
  }

  const rootId = selectedMenuPath.slice(imageCategoryMenuPrefix.length);
  const relatedIds = getImageLexiconDescendantIds(entries, rootId);
  relatedIds.add(rootId);

  const selectedEntries = entries.filter((entry) => relatedIds.has(entry.id));
  return {
    entryIds: new Set(selectedEntries.map((entry) => entry.id)),
    labelKeys: new Set(
      selectedEntries.map((entry) => normalizeLexiconItemKey(entry.label)).filter(Boolean),
    ),
  };
}

function promptGroupMatchesCategorySelection(
  group: PromptImageGroup,
  selection: CategoryMenuSelection,
  labelsCache?: ReadonlyMap<string, string[]>,
): boolean {
  const membership = getPromptGroupCategoryMembershipKeys(group);

  // Prefer exact taxonomy ids (primary + secondary genres).
  if (membership.categoryIds.some((id) => selection.entryIds.has(id))) {
    return true;
  }

  if (membership.labelKeys.some((key) => selection.labelKeys.has(key))) {
    return true;
  }

  // Cache path for freeform-only labels (no categoryId yet).
  const cached = labelsCache?.get(group.id);
  if (cached && cached.length > 0) {
    if (cached.some((label) => selection.labelKeys.has(normalizeLexiconItemKey(label)))) {
      return true;
    }
  }

  return false;
}

function getSelectedCategoryLabelKeys(
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
): Set<string> | null {
  const selection = getSelectedCategorySelection(entries, selectedMenuPath);
  if (selection === null) {
    return null;
  }
  return new Set(selection.labelKeys);
}

function filterPromptGroupsForTagMenu(
  groups: readonly PromptImageGroup[],
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
  query: string,
  labelsCache?: ReadonlyMap<string, string[]>,
): PromptImageGroup[] {
  const tagKeys = getSelectedTagLabelKeys(entries, selectedMenuPath);

  return groups.filter((group) => {
    const matchesTag =
      tagKeys === null ||
      (labelsCache?.get(group.id) ?? getPromptGroupTagLabels(group)).some((label) =>
        tagKeys.has(normalizeLexiconItemKey(label)),
      );

    return matchesTag && matchesPromptGroupQuery(group, query);
  });
}

function getSelectedTagLabelKeys(
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
): Set<string> | null {
  if (selectedMenuPath === allTagGroupsValue) {
    return null;
  }

  if (selectedMenuPath.startsWith(imageGroupMenuPrefix)) {
    const selectedSegments = splitParameterGroupPath(selectedMenuPath.slice(imageGroupMenuPrefix.length));

    return new Set(
      entries
        .filter((entry) => {
          const entrySegments = getImageGroupSegments(entry);
          return selectedSegments.every((segment, index) => entrySegments[index] === segment);
        })
        .map((entry) => normalizeLexiconItemKey(entry.label))
        .filter(Boolean),
    );
  }

  const parsedItem = parseImageItemMenuValue(selectedMenuPath);

  if (parsedItem) {
    return new Set([parsedItem.itemKey].filter(Boolean));
  }

  return new Set<string>();
}

function getCategoryNodeLabelKeys(node: ImageCategoryNode): Set<string> {
  const labelKeys = new Set<string>();
  const nodeLabelKey = normalizeLexiconItemKey(node.entry.label);

  if (nodeLabelKey) {
    labelKeys.add(nodeLabelKey);
  }

  for (const child of node.children) {
    for (const childLabelKey of getCategoryNodeLabelKeys(child)) {
      labelKeys.add(childLabelKey);
    }
  }

  return labelKeys;
}

function getTagGroupNodeLabelKeys(node: ImageGroupNode): Set<string> {
  const labelKeys = new Set<string>();

  for (const item of node.items) {
    if (item.key) {
      labelKeys.add(item.key);
    }
  }

  for (const child of node.children) {
    for (const childLabelKey of getTagGroupNodeLabelKeys(child)) {
      labelKeys.add(childLabelKey);
    }
  }

  return labelKeys;
}

function getTagPromptMenuDisplayLabel(
  selectedMenuPath: string,
  entries: readonly PromptImageLexiconEntry[],
): string {
  if (selectedMenuPath === allTagGroupsValue) {
    return "全部标签";
  }

  if (selectedMenuPath.startsWith(imageGroupMenuPrefix)) {
    const segments = splitParameterGroupPath(selectedMenuPath.slice(imageGroupMenuPrefix.length));
    return `标签分组：${segments.length > 0 ? segments.join(" / ") : ungroupedImageGroupLabel}`;
  }

  const parsedItem = parseImageItemMenuValue(selectedMenuPath);

  if (parsedItem) {
    const matchedEntry = entries.find(
      (entry) => isExactImageGroupMatch(entry, parsedItem.groupPath) && getImageItemKey(entry) === parsedItem.itemKey,
    );
    return `标签：${matchedEntry?.label || parsedItem.itemKey || "未命名标签"}`;
  }

  return "全部标签";
}

function matchesPromptGroupQuery(group: PromptImageGroup, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-Hans-CN");

  if (!normalizedQuery) {
    return true;
  }

  return group.items.some((item) =>
    [
      item.title,
      item.prompt,
      item.negativePrompt,
      item.category,
      item.tags.join(" "),
      item.author ?? "",
      item.generationMethod,
      item.imageFileName,
    ]
      .join(" ")
      .toLocaleLowerCase("zh-Hans-CN")
      .includes(normalizedQuery),
  );
}

function getImageLexiconParentOptions(
  entries: readonly PromptImageLexiconEntry[],
  entryId: string,
): PromptImageLexiconEntry[] {
  const descendantIds = getImageLexiconDescendantIds(entries, entryId);

  return entries.filter((entry) => entry.id !== entryId && !descendantIds.has(entry.id));
}


function normalizeOptionalLexiconValue(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";

  return normalized || null;
}

function toggleEntrySelection(currentSelection: Set<string>, entryId: string): Set<string> {
  const nextSelection = new Set(currentSelection);

  if (nextSelection.has(entryId)) {
    nextSelection.delete(entryId);
  } else {
    nextSelection.add(entryId);
  }

  return nextSelection;
}

function invertSelectionWithinIds(currentSelection: ReadonlySet<string>, entryIds: readonly string[]): Set<string> {
  const nextSelection = new Set<string>();

  for (const entryId of entryIds) {
    if (!currentSelection.has(entryId)) {
      nextSelection.add(entryId);
    }
  }

  return nextSelection;
}

function pruneSelectionToIds(currentSelection: Set<string>, allowedIds: ReadonlySet<string>): Set<string> {
  let changed = false;
  const nextSelection = new Set<string>();

  for (const selectedId of currentSelection) {
    if (allowedIds.has(selectedId)) {
      nextSelection.add(selectedId);
    } else {
      changed = true;
    }
  }

  return changed ? nextSelection : currentSelection;
}

function countSelectedEntries<T extends { id: string }>(selectedIds: Set<string>, entries: readonly T[]): number {
  return entries.reduce((count, entry) => (selectedIds.has(entry.id) ? count + 1 : count), 0);
}

function countSelectedPromptGroups(selectedIds: ReadonlySet<string>, groups: readonly PromptImageGroup[]): number {
  return groups.reduce((count, group) => (selectedIds.has(group.id) ? count + 1 : count), 0);
}

function collectSelectedPromptGroupItems(
  groups: readonly PromptImageGroup[],
  selectedGroupIds: ReadonlySet<string>,
): PromptCardData[] {
  const items: PromptCardData[] = [];
  const seenIds = new Set<string>();

  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) {
      continue;
    }

    for (const item of group.items) {
      if (seenIds.has(item.id)) {
        continue;
      }

      seenIds.add(item.id);
      items.push(item);
    }
  }

  return items;
}

function buildRemoveLabelsPatch(
  item: PromptCardData,
  labelKeys: ReadonlySet<string>,
): Partial<LibraryItem> | null {
  const patch: Partial<LibraryItem> = {};
  const categoryKey = normalizeLexiconItemKey(item.category);

  if (categoryKey && labelKeys.has(categoryKey)) {
    patch.category = "";
  }

  const nextTags = item.tags.filter((tag) => !labelKeys.has(normalizeLexiconItemKey(tag)));

  if (nextTags.length !== item.tags.length) {
    patch.tags = nextTags;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}



function isPromptImageLexiconEntry(entry: PromptLexiconEntry): entry is PromptImageLexiconEntry {
  return "description" in entry;
}

type GalleryToolbarProps = {
  collectionMode: CollectionMode;
  galleryMode: GalleryMode;
  isMasonrySizeControlOpen: boolean;
  masonryColumnCount: number;
  resultCount: number;
  sortDirection: PromptSortDirection;
  sortMode: PromptSortMode;
  onCollectionModeChange: (mode: CollectionMode) => void;
  onGalleryModeChange: (mode: GalleryMode) => void;
  onMasonrySizeControlOpenChange: (isOpen: boolean) => void;
  onMasonryColumnCountChange: (count: number) => void;
  onMasonryColumnCountCommit: (count: number) => void;
  onSortDirectionChange: (direction: PromptSortDirection) => void;
  onSortModeChange: (mode: PromptSortMode) => void;
};

const GalleryToolbar = memo(function GalleryToolbar({
  collectionMode,
  galleryMode,
  isMasonrySizeControlOpen,
  masonryColumnCount,
  resultCount,
  sortDirection,
  sortMode,
  onCollectionModeChange,
  onGalleryModeChange,
  onMasonrySizeControlOpenChange,
  onMasonryColumnCountChange,
  onMasonryColumnCountCommit,
  onSortDirectionChange,
  onSortModeChange,
}: GalleryToolbarProps) {
  const masonrySizeControlRef = useRef<HTMLDivElement | null>(null);
  const masonrySizeAutoCloseTimerRef = useRef<number | null>(null);
  const sortControlRef = useRef<HTMLDivElement | null>(null);
  const [isSortControlOpen, setIsSortControlOpen] = useState(false);
  /** After the last column adjustment, wait this long with no further input before auto-closing. */
  const masonrySizeIdleCloseMs = 2000;

  function clearMasonrySizeAutoCloseTimer() {
    if (masonrySizeAutoCloseTimerRef.current !== null) {
      window.clearTimeout(masonrySizeAutoCloseTimerRef.current);
      masonrySizeAutoCloseTimerRef.current = null;
    }
  }

  function scheduleMasonrySizeIdleClose() {
    clearMasonrySizeAutoCloseTimer();
    masonrySizeAutoCloseTimerRef.current = window.setTimeout(() => {
      onMasonrySizeControlOpenChange(false);
      masonrySizeAutoCloseTimerRef.current = null;
    }, masonrySizeIdleCloseMs);
  }

  useEffect(() => {
    return () => {
      clearMasonrySizeAutoCloseTimer();
    };
  }, []);

  useEffect(() => {
    if (!isMasonrySizeControlOpen) {
      clearMasonrySizeAutoCloseTimer();
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!masonrySizeControlRef.current?.contains(event.target as Node)) {
        clearMasonrySizeAutoCloseTimer();
        onMasonrySizeControlOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        clearMasonrySizeAutoCloseTimer();
        onMasonrySizeControlOpenChange(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMasonrySizeControlOpen, onMasonrySizeControlOpenChange]);

  useEffect(() => {
    if (!isSortControlOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!sortControlRef.current?.contains(event.target as Node)) {
        setIsSortControlOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSortControlOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSortControlOpen]);

  function handleMasonryColumnLiveChange(count: number) {
    // Any drag / key adjustment restarts the idle timer so the popover stays open
    // while the user is still fine-tuning columns.
    onMasonryColumnCountChange(count);
    scheduleMasonrySizeIdleClose();
  }

  function handleMasonryColumnCommit(count: number) {
    onMasonryColumnCountCommit(count);
    // After release, keep the panel for 2s of inactivity before auto-hiding.
    scheduleMasonrySizeIdleClose();
  }

  function handleMasonryModeClick() {
    if (galleryMode === "masonry") {
      if (isMasonrySizeControlOpen) {
        clearMasonrySizeAutoCloseTimer();
        onMasonrySizeControlOpenChange(false);
      } else {
        onMasonrySizeControlOpenChange(true);
      }
      return;
    }

    onGalleryModeChange("masonry");
    onMasonrySizeControlOpenChange(false);
  }

  return (
    <div
      className="relative z-20 mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-panel p-3 shadow-elevated min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between"
      id="filter-bar"
    >
      <div className="inline-flex w-fit items-center rounded-xl border border-border bg-background p-1">
        <SegmentButton
          active={collectionMode === "all"}
          icon={<Grid2X2 size={15} />}
          label="全部"
          onClick={() => onCollectionModeChange("all")}
        />
        <SegmentButton
          active={collectionMode === "featured"}
          icon={<Star size={15} />}
          label="精选"
          onClick={() => onCollectionModeChange("featured")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 min-[900px]:justify-end">
        <span className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-3 text-sm text-muted">
          <span className="mr-1 font-semibold text-warning">{resultCount}</span>
          个结果
        </span>

        <div className="inline-flex items-center rounded-xl border border-border bg-background p-1">
          <div className="relative" ref={masonrySizeControlRef}>
            <IconModeButton
              active={galleryMode === "masonry"}
              ariaExpanded={isMasonrySizeControlOpen}
              ariaHasPopup="dialog"
              ariaLabel="瀑布流展示"
              icon={<Columns4 size={16} />}
              onClick={handleMasonryModeClick}
            />
            {isMasonrySizeControlOpen ? (
              <MasonrySizeControl
                value={masonryColumnCount}
                onChange={handleMasonryColumnLiveChange}
                onCommit={handleMasonryColumnCommit}
              />
            ) : null}
          </div>
          <IconModeButton
            active={galleryMode === "grid"}
            ariaLabel="网格视图"
            icon={<LayoutGrid size={16} />}
            onClick={() => onGalleryModeChange("grid")}
          />
        </div>

        <div className="relative z-30" ref={sortControlRef}>
          <button
            aria-expanded={isSortControlOpen}
            aria-haspopup="dialog"
            aria-label="打开排序设置"
            className={`relative z-30 inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
              isSortControlOpen
                ? "border-primary bg-primary-soft text-primary shadow-sm"
                : "border-border bg-background text-muted hover:border-primary/40 hover:bg-panel hover:text-foreground"
            }`}
            title="排序"
            type="button"
            onClick={() => setIsSortControlOpen((isOpen) => !isOpen)}
          >
            <span className="flex size-6 items-center justify-center rounded-lg border border-border/70 bg-panel">
              <SlidersHorizontal size={14} />
            </span>
            <span>排序</span>
          </button>

          {isSortControlOpen ? (
            <SortControlPanel
              sortDirection={sortDirection}
              sortMode={sortMode}
              onSortDirectionChange={onSortDirectionChange}
              onSortModeChange={onSortModeChange}
            />
          ) : null}
        </div>
      </div>

    </div>
  );
});

type SortControlPanelProps = {
  sortDirection: PromptSortDirection;
  sortMode: PromptSortMode;
  onSortDirectionChange: (direction: PromptSortDirection) => void;
  onSortModeChange: (mode: PromptSortMode) => void;
};

type RadialSortOption =
  | {
      id: string;
      angle: number;
      kind: "mode";
      label: string;
      value: PromptSortMode;
      colorClassName: string;
      shortLabel: string;
    }
  | {
      id: string;
      angle: number;
      kind: "direction";
      label: string;
      value: PromptSortDirection;
      colorClassName: string;
      shortLabel: string;
    };

const radialSortOptions: RadialSortOption[] = [
  {
    id: "sort-imported-at",
    angle: 210,
    kind: "mode",
    label: "导入时间",
    shortLabel: "导入",
    value: "importedAt",
    colorClassName: CAPSULE_TONES.sage.solid,
  },
  {
    id: "sort-updated-at",
    angle: -90,
    kind: "mode",
    label: "修改时间",
    shortLabel: "修改",
    value: "updatedAt",
    colorClassName: CAPSULE_TONES.mist.solid,
  },
  {
    id: "sort-image-size",
    angle: -30,
    kind: "mode",
    label: "尺寸大小",
    shortLabel: "尺寸",
    value: "imageSize",
    colorClassName: CAPSULE_TONES.mist.solid,
  },
  {
    id: "sort-random",
    angle: 90,
    kind: "mode",
    label: "随机排列",
    shortLabel: "随机",
    value: "random",
    colorClassName: CAPSULE_TONES.lavender.solid,
  },
  {
    id: "sort-asc",
    angle: 30,
    kind: "direction",
    label: "升序",
    shortLabel: "升序",
    value: "asc",
    colorClassName: CAPSULE_TONES.sage.solid,
  },
  {
    id: "sort-desc",
    angle: 150,
    kind: "direction",
    label: "降序",
    shortLabel: "降序",
    value: "desc",
    colorClassName: CAPSULE_TONES.mist.solid,
  },
];

function SortControlPanel({
  sortDirection,
  sortMode,
  onSortDirectionChange,
  onSortModeChange,
}: SortControlPanelProps) {
  const [isRingPaused, setIsRingPaused] = useState(false);

  function handleSelect(option: RadialSortOption) {
    setIsRingPaused(false);

    if (option.kind === "mode") {
      onSortModeChange(option.value);
      return;
    }

    onSortDirectionChange(option.value);
  }

  return (
    <div
      aria-label="排序设置"
      className="pointer-events-none absolute left-1/2 top-1/2 z-30 size-48 -translate-x-1/2 -translate-y-1/2"
      role="dialog"
    >
      <div
        aria-hidden="true"
        className={`sort-radial-menu__plate absolute inset-2 rounded-full border border-border shadow-elevated ${
          isRingPaused ? "sort-radial-menu__plate--paused" : ""
        }`}
      />
      <div aria-hidden="true" className="absolute inset-[3.35rem] rounded-full border border-dashed border-primary/35" />
      <div className="absolute inset-0">
        {radialSortOptions.map((option) => {
          const active = option.kind === "mode" ? option.value === sortMode : option.value === sortDirection;

          return (
            <RadialSortButton
              key={option.id}
              active={active}
              colorClassName={option.colorClassName}
              label={option.label}
              positionStyle={getRadialSortButtonPosition(option.angle)}
              shortLabel={option.shortLabel}
              onRingPauseChange={setIsRingPaused}
              onSelect={() => handleSelect(option)}
            />
          );
        })}
      </div>
    </div>
  );
}

type RadialSortButtonProps = {
  active: boolean;
  colorClassName: string;
  label: string;
  positionStyle: CSSProperties;
  shortLabel: string;
  onRingPauseChange: (isPaused: boolean) => void;
  onSelect: () => void;
};

function RadialSortButton({
  active,
  colorClassName,
  label,
  positionStyle,
  shortLabel,
  onRingPauseChange,
  onSelect,
}: RadialSortButtonProps) {
  function handleClick() {
    onRingPauseChange(false);
    onSelect();
  }

  return (
    <div className="sort-radial-menu__item absolute" style={positionStyle}>
      <button
        aria-label={label}
        aria-pressed={active}
        className={`sort-radial-menu__button pointer-events-auto relative z-20 flex items-center justify-center rounded-full border text-center font-semibold shadow-elevated outline-none transition-all duration-200 hover:z-30 hover:scale-110 hover:shadow-image focus-visible:z-30 focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-primary/25 ${colorClassName} ${
          active ? "scale-110 ring-2 ring-primary/35" : ""
        }`}
        title={label}
        type="button"
        onClick={handleClick}
        onPointerEnter={() => onRingPauseChange(true)}
        onPointerLeave={() => onRingPauseChange(false)}
      >
        <span className="sort-radial-menu__label">{shortLabel}</span>
        <Check
          aria-hidden="true"
          className={`sort-radial-menu__active-mark transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
          size={9}
        />
      </button>
    </div>
  );
}

function getRadialSortButtonPosition(angle: number): CSSProperties {
  const angleInRadians = (angle * Math.PI) / 180;
  const center = 96;
  const radius = 68;

  return {
    left: `${center + Math.cos(angleInRadians) * radius}px`,
    top: `${center + Math.sin(angleInRadians) * radius}px`,
  };
}

type MasonrySizeControlProps = {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

function MasonrySizeControl({ value, onChange, onCommit }: MasonrySizeControlProps) {
  const clampedValue = clampMasonryColumnCount(value);
  const span = maxMasonryColumnCount - minMasonryColumnCount;
  const progress = span <= 0 ? 0 : ((clampedValue - minMasonryColumnCount) / span) * 100;
  const tickValues = useMemo(
    () =>
      Array.from({ length: span + 1 }, (_, index) => minMasonryColumnCount + index),
    // Constants; recompute only if range constants change at build time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function readRangeValue(event: { currentTarget: HTMLInputElement }): number {
    return clampMasonryColumnCount(Number(event.currentTarget.value));
  }

  return (
    <div
      aria-label="调整瀑布流每行列数"
      className="absolute left-1/2 top-full z-30 mt-3 w-56 -translate-x-1/2 rounded-2xl border border-border bg-panel px-3 pb-2.5 pt-3 shadow-elevated"
      role="dialog"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted">
        <span>{minMasonryColumnCount} 列</span>
        <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
          {clampedValue} 列
        </span>
        <span>{maxMasonryColumnCount} 列</span>
      </div>
      <input
        aria-label="瀑布流每行列数"
        aria-valuemax={maxMasonryColumnCount}
        aria-valuemin={minMasonryColumnCount}
        aria-valuenow={clampedValue}
        aria-valuetext={`${clampedValue}列`}
        className="masonry-column-slider h-5 w-full cursor-ew-resize accent-primary"
        max={maxMasonryColumnCount}
        min={minMasonryColumnCount}
        step={1}
        type="range"
        value={clampedValue}
        onChange={(event) => onChange(readRangeValue(event))}
        onInput={(event) => onChange(readRangeValue(event))}
        onKeyDown={(event) => {
          // Arrow keys should move exactly one column (browser default may vary).
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            onChange(clampedValue - 1);
          } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            onChange(clampedValue + 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            onChange(minMasonryColumnCount);
          } else if (event.key === "End") {
            event.preventDefault();
            onChange(maxMasonryColumnCount);
          }
        }}
        onKeyUp={(event) => onCommit(readRangeValue(event))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          onCommit(readRangeValue(event));
        }}
      />
      <div className="mt-1 flex justify-between px-0.5" aria-hidden="true">
        {tickValues.map((tick) => (
          <span
            key={tick}
            className={`h-1 w-0.5 rounded-full ${
              tick === clampedValue ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>
      <div className="relative mt-1.5 h-0 overflow-hidden" style={{ ["--masonry-slider-progress" as string]: `${progress}%` }} />
    </div>
  );
}

type SegmentButtonProps = {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

function SegmentButton({ active, icon, label, onClick }: SegmentButtonProps) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-primary bg-primary-soft text-primary shadow-sm"
          : "border-transparent text-muted hover:border-border hover:bg-panel hover:text-foreground"
      }`}
      type="button"
      onClick={onClick}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

type IconModeButtonProps = {
  active: boolean;
  ariaExpanded?: boolean;
  ariaHasPopup?: React.AriaAttributes["aria-haspopup"];
  ariaLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
};

function IconModeButton({
  active,
  ariaExpanded,
  ariaHasPopup,
  ariaLabel,
  icon,
  onClick,
}: IconModeButtonProps) {
  return (
    <button
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`icon-tooltip-button flex size-10 items-center justify-center rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-primary bg-primary-soft text-primary shadow-sm"
          : "border-transparent text-muted hover:border-border hover:bg-panel hover:text-foreground"
      }`}
      data-tooltip-align="center"
      data-tooltip-placement="above"
      type="button"
      onClick={onClick}
    >
      {icon}
      <span className="icon-tooltip-button__bubble" role="tooltip">
        {ariaLabel}
      </span>
    </button>
  );
}

type PromptGalleryProps = {
  items: MasonryPromptItem[];
  likedImageIds: string[];
  blurNsfwImages: boolean;
  columnCount: number;
  onViewDetail: (itemId: string) => void;
  onPreviewMedia?: (item: PromptCardData) => void;
};

const MasonryPromptGallery = memo(function MasonryPromptGallery({
  blurNsfwImages,
  columnCount,
  items,
  likedImageIds,
  onViewDetail,
  onPreviewMedia,
}: PromptGalleryProps) {
  const likedImageIdSet = useMemo(() => new Set(likedImageIds), [likedImageIds]);
  const moduleState = useLibraryStore((state) => state.moduleState);
  const canUseVideoPromptCards = hasBuiltinModuleCapability("video-prompt-card", moduleState);
  const safeColumnCount = Math.max(1, columnCount);
  const columns = useMemo(
    () => distributeItemsByTopEdge(items, safeColumnCount),
    [items, safeColumnCount],
  );
  const activeColumnCount = safeColumnCount;

  return (
    <div
      className="grid w-full items-start"
      style={{
        alignItems: "start",
        gap: masonryColumnGap,
        gridTemplateColumns: `repeat(${activeColumnCount}, 1fr)`,
      }}
    >
      {columns.map((column, columnIndex) => (
        <div className="grid min-w-0 content-start gap-4" key={`masonry-column-${columnIndex}`}>
          {column.map((item, rowIndex) => {
            const priorityIndex = rowIndex * activeColumnCount + columnIndex;
            const isPriorityImage = priorityIndex < Math.max(6, safeColumnCount * 2);

            if (canUseVideoPromptCards && item.item.promptType === "video") {
              return (
                <VideoPromptTile
                  blurNsfwImages={blurNsfwImages}
                  isPriorityImage={isPriorityImage}
                  item={item.item}
                  key={item.item.id}
                  onViewDetail={onViewDetail}
                />
              );
            }

            return (
              <MasonryPromptTile
                blurNsfwImages={blurNsfwImages}
                imageCount={item.imageCount}
                isPriorityImage={isPriorityImage}
                isLiked={likedImageIdSet.has(item.item.id)}
                item={item.item}
                key={item.item.id}
                onViewDetail={onViewDetail}
                onPreviewMedia={onPreviewMedia}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});

const MasonryPromptTile = memo(function MasonryPromptTile({
  blurNsfwImages,
  imageCount,
  isPriorityImage,
  isLiked,
  item,
  onViewDetail,
  onPreviewMedia,
}: {
  blurNsfwImages: boolean;
  imageCount: number;
  isPriorityImage: boolean;
  isLiked: boolean;
  item: PromptCardData;
  onViewDetail: (itemId: string) => void;
  onPreviewMedia?: (item: PromptCardData) => void;
}) {
  const handleViewDetail = useCallback(() => onViewDetail(item.id), [onViewDetail, item.id]);
  const handlePreviewMedia = useMemo(
    () => (onPreviewMedia ? () => onPreviewMedia(item) : undefined),
    [onPreviewMedia, item],
  );

  return (
    <article
      className="group/tile block min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-panel shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-image"
      style={{
        contain: "layout paint style",
      }}
    >
      <div
        className="group relative block w-full overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      >
        <NsfwImage
          activateLabel={`查看 ${item.title || "未命名提示词"} 的详情`}
          alt={item.title || "提示词效果图"}
          blurNsfwImages={blurNsfwImages}
          className="w-full"
          fetchPriority={isPriorityImage ? "high" : "auto"}
          image={item}
          imageClassName="block h-auto w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          loading={isPriorityImage ? "eager" : "lazy"}
          onActivate={handleViewDetail}
          onPreview={handlePreviewMedia}
          placeholderClassName="min-h-44"
          showRevealControl={false}
          source="thumbnail"
        />
        {isLiked ? (
          <span className="absolute left-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-panel/85 text-danger opacity-90 shadow-elevated transition-opacity group-hover/tile:opacity-100">
            <Heart size={15} fill="currentColor" />
          </span>
        ) : null}
        {imageCount > 1 ? (
          <span className="absolute bottom-2 right-2 inline-flex min-h-7 items-center gap-1 rounded-xl bg-background/80 px-2 text-xs font-medium text-foreground backdrop-blur">
            <ImageIcon size={13} />
            {imageCount}
          </span>
        ) : null}
      </div>
    </article>
  );
});

function spreadPromptGroupImagesWithCount(
  groups: PromptImageGroup[],
  imageCountByItemId: ReadonlyMap<string, number>,
): MasonryPromptItem[] {
  return spreadPromptGroupImages(groups).map((item) => {
    return {
      imageCount: imageCountByItemId.get(item.id) ?? 1,
      item,
    };
  });
}

function buildImageCountByItemId(groups: PromptImageGroup[]): ReadonlyMap<string, number> {
  const imageCountByItemId = new Map<string, number>();

  for (const group of groups) {
    for (const item of group.items) {
      imageCountByItemId.set(item.id, group.items.length);
    }
  }

  return imageCountByItemId;
}

type TileActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick: () => void;
};

function TileActionButton({ icon, label, primary = false, onClick }: TileActionButtonProps) {
  return (
    <button
      className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl border px-1.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary-strong"
          : "border-border bg-background text-foreground hover:bg-primary-soft"
      }`}
      title={label}
      type="button"
      onClick={onClick}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

type PromptGroupGalleryProps = {
  groups: PromptImageGroup[];
  likedImageIds: string[];
  blurNsfwImages: boolean;
  enableCategoryDnD?: boolean;
  selectedGroupIds?: ReadonlySet<string>;
  variant?: "full" | "compact";
  onCopyPrompt: (item: PromptCardData) => void;
  onDragPromptGroupsEnd?: () => void;
  onDragPromptGroupsStart?: () => void;
  onOpenMoveMenu?: (itemIds: string[], clientX: number, clientY: number) => void;
  onToggleGroupSelection?: (groupId: string) => void;
  onViewDetail: (itemId: string) => void;
  onPreviewMedia?: (item: PromptCardData) => void;
};

const gridGalleryPageSize = 24;

const GridPromptGallery = memo(function GridPromptGallery({
  blurNsfwImages,
  enableCategoryDnD = false,
  groups,
  likedImageIds,
  selectedGroupIds,
  variant = "full",
  onCopyPrompt,
  onDragPromptGroupsEnd,
  onDragPromptGroupsStart,
  onOpenMoveMenu,
  onToggleGroupSelection,
  onViewDetail,
  onPreviewMedia,
}: PromptGroupGalleryProps) {
  const likedImageIdSet = useMemo(() => new Set(likedImageIds), [likedImageIds]);
  const [visibleCount, setVisibleCount] = useState(gridGalleryPageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount((current) => {
      if (groups.length === 0) {
        return gridGalleryPageSize;
      }
      // Parent expanded the window (home infinite scroll): keep progress, do not snap back.
      if (groups.length > current) {
        return current;
      }
      // Filter change / shorter list: restart from the first page.
      return Math.min(gridGalleryPageSize, groups.length);
    });
  }, [groups]);

  useEffect(() => {
    if (visibleCount >= groups.length) {
      return;
    }

    const sentinel = sentinelRef.current;

    if (!sentinel) {
      return;
    }

    const scrollRoot = sentinel.closest(".overflow-y-auto") as Element | null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + gridGalleryPageSize, groups.length));
        }
      },
      {
        root: scrollRoot,
        rootMargin: "600px",
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [groups.length, visibleCount]);

  const visibleGroups = useMemo(
    () => (visibleCount >= groups.length ? groups : groups.slice(0, visibleCount)),
    [groups, visibleCount],
  );
  const primaryItemIdByGroupId = useMemo(() => {
    if (!enableCategoryDnD || !selectedGroupIds || selectedGroupIds.size === 0) {
      return undefined;
    }

    const map = new Map<string, string>();
    for (const group of groups) {
      map.set(group.id, group.primaryItem.id);
    }
    return map;
  }, [enableCategoryDnD, groups, selectedGroupIds]);

  return (
    <>
      <div
        className={
          variant === "compact"
            ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-2.5 min-[640px]:grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] min-[640px]:gap-3"
            : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] gap-3 min-[640px]:grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] min-[640px]:gap-4"
        }
      >
        {visibleGroups.map((group, index) => (
          <GridPromptTile
            blurNsfwImages={blurNsfwImages}
            enableCategoryDnD={enableCategoryDnD}
            group={group}
            isSelected={selectedGroupIds?.has(group.id) ?? false}
            key={group.id}
            likedImageIdSet={likedImageIdSet}
            primaryItemIdByGroupId={primaryItemIdByGroupId}
            selectedGroupIds={selectedGroupIds}
            onCopyPrompt={onCopyPrompt}
            onDragPromptGroupsEnd={onDragPromptGroupsEnd}
            onDragPromptGroupsStart={onDragPromptGroupsStart}
            onOpenMoveMenu={onOpenMoveMenu}
            onPreviewMedia={onPreviewMedia}
            onToggleGroupSelection={onToggleGroupSelection}
            priorityImages={index < 8}
            tone={promptSiteCardToneClassNames[index % promptSiteCardToneClassNames.length]}
            variant={variant}
            onViewDetail={onViewDetail}
          />
        ))}
      </div>
      {visibleCount < groups.length ? <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" /> : null}
    </>
  );
});

const GridPromptTile = memo(function GridPromptTile({
  blurNsfwImages,
  enableCategoryDnD = false,
  group,
  isSelected,
  likedImageIdSet,
  primaryItemIdByGroupId,
  selectedGroupIds,
  onCopyPrompt,
  onDragPromptGroupsEnd,
  onDragPromptGroupsStart,
  onOpenMoveMenu,
  onPreviewMedia,
  onToggleGroupSelection,
  priorityImages,
  tone,
  variant,
  onViewDetail,
}: {
  blurNsfwImages: boolean;
  enableCategoryDnD?: boolean;
  group: PromptImageGroup;
  isSelected: boolean;
  likedImageIdSet: ReadonlySet<string>;
  primaryItemIdByGroupId?: ReadonlyMap<string, string>;
  selectedGroupIds?: ReadonlySet<string>;
  onCopyPrompt: (item: PromptCardData) => void;
  onDragPromptGroupsEnd?: () => void;
  onDragPromptGroupsStart?: () => void;
  onOpenMoveMenu?: (itemIds: string[], clientX: number, clientY: number) => void;
  onPreviewMedia?: (item: PromptCardData) => void;
  onToggleGroupSelection?: (groupId: string) => void;
  priorityImages: boolean;
  tone: PromptSiteCardToneClassNames;
  variant: "full" | "compact";
  onViewDetail: (itemId: string) => void;
}) {
  const item = group.primaryItem;
  const isCompact = variant === "compact";
  const visibleTags = isCompact ? [] : item.tags.slice(0, gridVisibleTagCount);
  const hiddenTagCount = isCompact ? 0 : Math.max(0, item.tags.length - visibleTags.length);
  const hasLikedImage = !isCompact && group.items.some((groupItem) => likedImageIdSet.has(groupItem.id));
  const promptPreview = isCompact ? "" : buildPromptText(item);
  const sourceText = isCompact ? "" : getPromptSourceText(item);
  const handleViewDetail = useCallback(() => onViewDetail(item.id), [item.id, onViewDetail]);
  const handleCopyPrompt = useCallback(() => onCopyPrompt(item), [item, onCopyPrompt]);
  const handlePreviewMedia = useMemo(
    () => (onPreviewMedia ? () => onPreviewMedia(item) : undefined),
    [item, onPreviewMedia],
  );
  const handleToggleSelection = useMemo(
    () => (onToggleGroupSelection ? () => onToggleGroupSelection(group.id) : undefined),
    [group.id, onToggleGroupSelection],
  );

  function resolveDragItemIds(): string[] {
    if (selectedGroupIds && selectedGroupIds.size > 0 && selectedGroupIds.has(group.id) && primaryItemIdByGroupId) {
      return Array.from(selectedGroupIds)
        .map((groupId) => primaryItemIdByGroupId.get(groupId))
        .filter((id): id is string => Boolean(id));
    }
    return [item.id];
  }

  return (
    <article
      className={`group/tile min-w-0 overflow-hidden rounded-xl border bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${
        isSelected ? "border-primary bg-primary-soft shadow-image" : tone.article
      }`}
      draggable={enableCategoryDnD}
      style={{
        contain: "layout paint style",
      }}
      onDragEnd={() => onDragPromptGroupsEnd?.()}
      onDragStart={(event) => {
        if (!enableCategoryDnD) {
          return;
        }
        const itemIds = resolveDragItemIds();
        const payload = JSON.stringify(itemIds);
        event.dataTransfer.setData(promptGroupDragMime, payload);
        event.dataTransfer.setData("text/plain", payload);
        event.dataTransfer.effectAllowed = "move";
        onDragPromptGroupsStart?.();
      }}
    >
      <header className={`flex min-h-12 items-center gap-2 border-b px-3 py-2 ${tone.header}`}>
        <h2 className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-5 text-current">
          {item.title || "未命名提示词"}
        </h2>
        {enableCategoryDnD && onOpenMoveMenu ? (
          <button
            aria-label="移动到分类"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/70 text-muted opacity-80 transition-opacity hover:opacity-100 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            title="移动到分类"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const itemIds = resolveDragItemIds();
              onOpenMoveMenu(itemIds, event.clientX, event.clientY);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        ) : null}
      </header>

      <div
        className="group relative block aspect-[4/3] w-full overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary/35 min-[1100px]:aspect-square"
      >
        <GridPromptMosaic
          blurNsfwImages={blurNsfwImages}
          images={group.previewItems}
          onActivate={handleViewDetail}
          onPreview={handlePreviewMedia}
          priorityImages={priorityImages}
          title={item.title || "提示词效果图"}
        />
        {handleToggleSelection ? (
          <button
            aria-label={isSelected ? "取消选择提示词组" : "选择提示词组"}
            aria-pressed={isSelected}
            className={`absolute left-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-md border shadow-elevated backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-panel/85 text-muted hover:bg-primary-soft hover:text-foreground"
            }`}
            title={isSelected ? "取消选择提示词组" : "选择提示词组"}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleToggleSelection();
            }}
          >
            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </button>
        ) : null}
        {!isCompact && group.items.length > 1 ? (
          <span className="absolute bottom-2 right-2 rounded-xl bg-background/80 px-2 py-1 text-xs font-medium text-foreground backdrop-blur">
            {group.items.length} 个
          </span>
        ) : null}
        {hasLikedImage ? (
          <span
            className={`absolute top-2 inline-flex size-8 items-center justify-center rounded-full bg-panel/85 text-danger opacity-90 shadow-elevated transition-opacity group-hover/tile:opacity-100 ${
              handleToggleSelection ? "left-12" : "left-2"
            }`}
          >
            <Heart size={15} fill="currentColor" />
          </span>
        ) : null}
      </div>

      {isCompact ? null : (
        <div className="grid gap-2 px-3 py-3">
          <p className="line-clamp-1 text-xs text-muted">{sourceText}</p>
          <p className="line-clamp-2 text-xs leading-5 text-muted">{promptPreview}</p>
          <div className="flex min-h-7 max-h-14 flex-wrap gap-1.5 overflow-hidden">
            {visibleTags.length > 0 ? (
              <>
                {visibleTags.map((tag) => (
                  <span className={`max-w-full truncate rounded-lg border px-2 py-1 text-xs ${tone.tag}`} key={tag}>
                    {tag}
                  </span>
                ))}
                {hiddenTagCount > 0 ? (
                  <span className={`max-w-full truncate rounded-lg border px-2 py-1 text-xs ${tone.tag}`}>
                    +{hiddenTagCount}
                  </span>
                ) : null}
              </>
            ) : (
              <span className={`max-w-full truncate rounded-lg border px-2 py-1 text-xs ${tone.tag}`}>
                {item.category}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <TileActionButton icon={<Eye size={14} />} label="查看详情" onClick={handleViewDetail} />
            <TileActionButton icon={<Copy size={14} />} label="复制提示词" primary onClick={handleCopyPrompt} />
          </div>
        </div>
      )}
    </article>
  );
});

function GridPromptMosaic({
  blurNsfwImages,
  images,
  onActivate,
  onPreview,
  priorityImages,
  title,
}: {
  blurNsfwImages: boolean;
  images: PromptCardData[];
  onActivate: () => void;
  onPreview?: () => void;
  priorityImages: boolean;
  title: string;
}) {
  if (images.length <= 1) {
    const image = images[0];

    return image ? (
      <NsfwImage
        activateLabel={`查看 ${title} 的详情`}
        alt={title}
        blurNsfwImages={blurNsfwImages}
        className="h-full w-full"
        fetchPriority={priorityImages ? "high" : "auto"}
        image={image}
        imageClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        loading={priorityImages ? "eager" : "lazy"}
        onActivate={onActivate}
        onPreview={onPreview}
        showRevealControl={false}
        source="thumbnail"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center text-muted">
        <ImageIcon size={42} />
      </div>
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 gap-1 bg-border p-1 transition-transform duration-300 group-hover:scale-[1.03]">
      {images.slice(0, 4).map((image) => (
        <NsfwImage
          activateLabel={`查看 ${title} 的详情`}
          alt={title}
          blurNsfwImages={blurNsfwImages}
          className="h-full w-full rounded-xl"
          fetchPriority={priorityImages ? "high" : "auto"}
          image={image}
          imageClassName="h-full w-full object-cover"
          key={image.id}
          loading={priorityImages ? "eager" : "lazy"}
          onActivate={onActivate}
          onPreview={onPreview}
          showRevealControl={false}
          source="thumbnail"
        />
      ))}
      {Array.from({ length: Math.max(0, 4 - images.length) }).map((_, index) => (
        <div className="rounded-xl bg-panel" key={index} />
      ))}
    </div>
  );
}

type DirectoryImportModeDialogProps = {
  isBusy: boolean;
  onClose: () => void;
  onCopy: () => void;
  onIndex: () => void;
};

function DirectoryImportModeDialog({ isBusy, onClose, onCopy, onIndex }: DirectoryImportModeDialogProps) {
  return (
    <AppDialog
      overlayClassName="z-[140] px-4 py-8"
      panelClassName="flex max-h-full w-full max-w-2xl flex-col"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">添加素材目录</h2>
          <p className="mt-1 text-sm text-muted">请选择目录的使用方式。大目录推荐仅建立索引。</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>
      <div className="grid gap-4 overflow-y-auto p-6 md:grid-cols-2">
        <button
          className="group flex min-h-72 flex-col rounded-2xl border-2 border-primary bg-primary-soft/40 p-5 text-left outline-none transition hover:-translate-y-0.5 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isBusy}
          type="button"
          onClick={onIndex}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <FolderTree size={21} />
            </span>
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">推荐大目录</span>
          </span>
          <strong className="mt-4 text-base text-foreground">仅建立索引</strong>
          <p className="mt-2 text-sm leading-6 text-muted">
            不复制、不修改源文件。软件保存文件名、相对路径、分类、标签、标题、提示词等索引数据，并生成缩略图缓存。
          </p>
          <ul className="mt-4 grid gap-2 text-xs leading-5 text-muted">
            <li>• 导入快，避免软件目录占用大量空间</li>
            <li>• 源文件移动、改名或删除后会显示缺失</li>
            <li>• 整体迁移目录后可通过“重新定位”恢复</li>
          </ul>
        </button>
        <button
          className="group flex min-h-72 flex-col rounded-2xl border border-border bg-background p-5 text-left outline-none transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isBusy}
          type="button"
          onClick={onCopy}
        >
          <span className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-panel text-foreground">
              <Copy size={21} />
            </span>
            <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted">独立保存</span>
          </span>
          <strong className="mt-4 text-base text-foreground">复制到软件目录</strong>
          <p className="mt-2 text-sm leading-6 text-muted">
            将支持的图片和视频复制到软件管理目录。复制完成后，原目录移动或删除不会影响软件中的素材。
          </p>
          <ul className="mt-4 grid gap-2 text-xs leading-5 text-muted">
            <li>• 适合数量较少或需要集中备份的素材</li>
            <li>• 大目录导入耗时，并占用额外磁盘空间</li>
            <li>• 会增加软件数据目录的备份与迁移体积</li>
          </ul>
        </button>
      </div>
      <div className="mx-6 mb-5 flex items-start gap-3 rounded-xl border border-warning/35 bg-warning/10 px-4 py-3 text-xs leading-5 text-muted">
        <Info className="mt-0.5 shrink-0 text-warning" size={16} />
        <p>
          仅索引模式不会把原图写入软件目录；请保留源目录和软件的 <code>data</code> 索引数据。复制模式不会删除或修改源文件。
        </p>
      </div>
    </AppDialog>
  );
}

type LibraryRootsDialogProps = {
  isBusy: boolean;
  roots: readonly LibraryRoot[];
  onAdd: () => void;
  onClose: () => void;
  onPurgeMissing: (rootId: string) => void;
  onRemap: (rootId: string) => void;
  onRemove: (rootId: string) => void;
  onReorder: (rootIds: string[]) => void;
  onScan: (rootId: string) => void;
  onWatchChange: (rootId: string, enabled: boolean) => void;
  onValidate: () => void;
};

function LibraryRootsDialog({
  isBusy,
  roots,
  onAdd,
  onClose,
  onPurgeMissing,
  onRemap,
  onRemove,
  onReorder,
  onScan,
  onWatchChange,
  onValidate,
}: LibraryRootsDialogProps) {
  const [orderedRoots, setOrderedRoots] = useState<LibraryRoot[]>(() => [...roots]);
  const [draggedRootId, setDraggedRootId] = useState<string | null>(null);
  const [dragOverRootId, setDragOverRootId] = useState<string | null>(null);

  useEffect(() => {
    setOrderedRoots([...roots]);
  }, [roots]);

  function reorderRoots(sourceId: string, targetId: string) {
    const sourceIndex = orderedRoots.findIndex((root) => root.id === sourceId);
    const targetIndex = orderedRoots.findIndex((root) => root.id === targetId);

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }

    const nextRoots = [...orderedRoots];
    const [movedRoot] = nextRoots.splice(sourceIndex, 1);

    if (!movedRoot) {
      return;
    }

    nextRoots.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, movedRoot);
    setOrderedRoots(nextRoots);
    onReorder(nextRoots.map((root) => root.id));
  }

  return (
    <AppDialog overlayClassName="z-[130] px-4 py-8" panelClassName="flex max-h-full w-full max-w-xl flex-col" onClose={onClose}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">素材目录</h2>
          <p className="mt-1 text-sm text-muted">{roots.length} 个已挂载目录</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>
      <div className="grid min-h-0 gap-3 overflow-y-auto p-5">
        {orderedRoots.length > 0 ? (
          orderedRoots.map((root) => {
            const isDragging = draggedRootId === root.id;
            const isDragOver = dragOverRootId === root.id;

            return (
            <div
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-background px-3 py-3 transition-colors ${
                isDragOver ? "border-primary bg-primary-soft/60 ring-1 ring-primary/30" : "border-border"
              } ${isDragging ? "opacity-55" : ""}`}
              draggable={orderedRoots.length > 1 && !isBusy}
              key={root.id}
              onDragStart={(event) => {
                if (orderedRoots.length <= 1 || isBusy) {
                  event.preventDefault();
                  return;
                }

                setDraggedRootId(root.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", root.id);
              }}
              onDragEnter={(event) => {
                if (!draggedRootId || draggedRootId === root.id) {
                  return;
                }

                event.preventDefault();
                setDragOverRootId(root.id);
              }}
              onDragOver={(event) => {
                if (!draggedRootId || draggedRootId === root.id) {
                  return;
                }

                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggedRootId ?? event.dataTransfer.getData("text/plain");
                setDraggedRootId(null);
                setDragOverRootId(null);

                if (sourceId && sourceId !== root.id) {
                  reorderRoots(sourceId, root.id);
                }
              }}
              onDragEnd={() => {
                setDraggedRootId(null);
                setDragOverRootId(null);
              }}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <GripVertical aria-hidden="true" className="shrink-0 text-muted/60" size={15} />
                  <span className={`size-2 shrink-0 rounded-full ${root.status === "missing" ? "bg-danger" : "bg-primary"}`} />
                  <p className="truncate text-sm font-medium text-foreground">{root.label}</p>
                  {root.status === "missing" ? <span className="shrink-0 text-xs font-medium text-danger">目录不可用</span> : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted" title={root.absolutePath}>
                  {root.absolutePath}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {root.lastScanAt ? `上次扫描：${new Date(root.lastScanAt).toLocaleString()}` : "尚未扫描"}
                </p>
                <div className="mt-2 flex min-h-6 items-center gap-2">
                  <button
                    aria-checked={root.watchEnabled === true}
                    aria-label={`监视 ${root.label}`}
                    className={`relative h-5 w-9 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                      root.watchEnabled ? "bg-primary" : "bg-border"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                    disabled={isBusy || (root.status === "missing" && !root.watchEnabled)}
                    role="switch"
                    type="button"
                    onClick={() => onWatchChange(root.id, !root.watchEnabled)}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-0.5 size-4 rounded-full bg-panel shadow-sm transition-transform ${
                        root.watchEnabled ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-muted">监视此目录</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button aria-label="重新扫描" className="size-10 px-0" icon={<RefreshCw size={15} />} title="重新扫描" disabled={isBusy || root.status === "missing"} onClick={() => onScan(root.id)} />
                <Button aria-label="重新定位" className="size-10 px-0" icon={<FolderTree size={15} />} title="重新定位" disabled={isBusy} onClick={() => onRemap(root.id)} />
                <Button
                  aria-label="清理该目录下已删除文件的提示词缓存"
                  className="size-10 px-0"
                  icon={<Eraser size={15} />}
                  title="清理该目录下已删除文件的提示词缓存"
                  disabled={isBusy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `清理“${root.label}”下已删除文件的提示词索引？仅删除库内缺失索引与缩略图缓存，不会删除磁盘上仍存在的原文件。`,
                      )
                    ) {
                      onPurgeMissing(root.id);
                    }
                  }}
                />
                <Button
                  aria-label="移除挂载"
                  className="size-10 px-0"
                  icon={<Trash2 size={15} />}
                  title="移除挂载"
                  variant="ghost"
                  disabled={isBusy}
                  onClick={() => {
                    if (window.confirm(`移除“${root.label}”挂载及其索引？原文件不会删除。`)) {
                      onRemove(root.id);
                    }
                  }}
                />
              </div>
            </div>
            );
          })
        ) : (
          <p className="py-8 text-center text-sm text-muted">还没有已挂载目录。</p>
        )}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button icon={<Shield size={16} />} disabled={isBusy || roots.length === 0} onClick={onValidate}>
          校验全部
        </Button>
        <Button icon={<FolderTree size={16} />} disabled={isBusy} variant="primary" onClick={onAdd}>
          添加目录
        </Button>
      </footer>
    </AppDialog>
  );
}

type ImportMenuItemProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

function ImportMenuItem({ icon, label, onClick }: ImportMenuItemProps) {
  return (
    <button
      className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/25"
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

type EmptyPromptListProps = {
  hasItems: boolean;
  isBusy: boolean;
  onImportClipboardImage: () => void;
  onImportImages: () => void;
  onResetFilters: () => void;
};

function EmptyPromptList({
  hasItems,
  isBusy,
  onImportClipboardImage,
  onImportImages,
  onResetFilters,
}: EmptyPromptListProps) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border bg-panel px-6 text-center shadow-sm">
      <div className="max-w-md">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-border bg-background text-muted">
          {hasItems ? <Tags size={26} /> : <ImageIcon size={26} />}
        </div>
        <h2 className="mt-5 text-lg font-semibold">{hasItems ? "没有匹配的提示词" : "还没有提示词素材"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {hasItems ? "当前筛选无结果。" : "导入图片或视频后补充信息。"}
        </p>
        {hasItems ? (
          <div className="mt-5 flex justify-center">
            <Button onClick={onResetFilters}>重置筛选</Button>
          </div>
        ) : (
          <div className="mt-5 flex justify-center gap-2">
            <Button icon={<ImagePlus size={16} />} disabled={isBusy} onClick={onImportImages}>
              导入素材
            </Button>
            <Button icon={<Clipboard size={16} />} disabled={isBusy} onClick={onImportClipboardImage}>
              粘贴导入
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function buildPromptText(item: PromptCardData): string {
  const prompt = resolvePromptTemplateText(normalizePromptText(item.prompt));
  const negativePrompt = resolvePromptTemplateText(normalizePromptText(item.negativePrompt));
  const parts = [prompt, negativePrompt ? `负向提示词：${negativePrompt}` : ""].filter(Boolean);

  return parts.join("\n") || "暂无提示词详情。";
}

const promptSourceHostLabels: Array<{ hosts: string[]; label: string }> = [
  { hosts: ["webtomind.com"], label: "WebToMind" },
  { hosts: ["opennana.com", "img.opennana.com"], label: "OpenNana" },
  { hosts: ["youmind.com"], label: "YouMind" },
  { hosts: ["prompts.chat"], label: "prompts.chat" },
  { hosts: ["kookaigc.top"], label: "KookAIGC" },
  { hosts: ["jimeng.jianying.com"], label: "即梦AI" },
  { hosts: ["civitai.red", "civitai.com"], label: "civitai（C站）" },
  { hosts: ["liblib.art"], label: "LibLibAI" },
  { hosts: ["gpt-image2.canghe.ai"], label: "awesome-gpt-image-2" },
  { hosts: ["aiart.pics"], label: "aiart.pics" },
  { hosts: ["promptfill.tanshilong.com"], label: "提示词填空器" },
  { hosts: ["img.xmiaom.com"], label: "哗啦哗啦广场" },
  { hosts: ["upma.cn"], label: "上码 UPMA" },
  { hosts: ["seaart.ai"], label: "SeaArt AI" },
  { hosts: ["x.com", "twitter.com"], label: "X" },
];

function getPromptSourceText(item: PromptCardData): string {
  if (!item.sourceUrl) {
    return "本地来源";
  }

  return `来源：${resolvePromptSourceName(item.sourceUrl)}`;
}

function resolvePromptSourceName(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.toLowerCase();

    if (hostname === "github.com" && pathname.includes("awesome-gpt-image-2")) {
      return "awesome-gpt-image-2";
    }

    const knownSource = promptSourceHostLabels.find((source) =>
      source.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
    );

    return knownSource?.label ?? hostname;
  } catch {
    return "网络来源";
  }
}
