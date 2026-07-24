import {
  lazy,
  memo,
  startTransition,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
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
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileText,
  FolderTree,
  Gauge,
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
  Wifi,
  X,
} from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { Button } from "@/components/ui/Button";
import { CardScrollTopButton } from "./CardScrollTopButton";
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
  PromptParameterLexiconEntry,
  ThemeMode,
} from "../types/library";
import type { AiAnalyzePromptPayload } from "../types/ai";
import { NsfwImage } from "./NsfwImage";
import { MediaFullscreenOverlay } from "./MediaFullscreenOverlay";
import { VideoPromptTile } from "./video/VideoPromptTile";
import { useLibraryStore } from "../store/useLibraryStore";
import {
  allCategoriesValue,
  filterFavoritePromptCards,
  filterPromptCards,
  getPromptCategories,
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
import { distributeItemsByTopEdge } from "../utils/masonryLayout";
import { normalizePromptText } from "../utils/normalizePromptText";
import { photographyCategoryDefinitions, photographyCategoryLabels } from "../utils/photographyCategories";
import { getImageSrc, getStartupGalleryImageSrc } from "../utils/getImageSrc";
import {
  selectRandomStartupGalleryImages,
  startupGalleryDisplayCount,
} from "../utils/startupGallerySelection";
import {
  createDefaultPromptLexiconSettings,
  getPromptParameterGroup,
  getPromptTagGroup,
  migratePromptParameterLexiconGroups,
  normalizePromptParameterGroupPath,
  validatePromptParameterMenuEntries,
  type PromptParameterMenuValidationResult,
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

const AiSettingsDialog = lazy(() =>
  import("./AiSettingsDialog").then((module) => ({ default: module.AiSettingsDialog })),
);
const NsfwSettingsDialog = lazy(() =>
  import("./NsfwSettingsDialog").then((module) => ({ default: module.NsfwSettingsDialog })),
);
const ProxySettingsDialog = lazy(() =>
  import("./ProxySettingsDialog").then((module) => ({ default: module.ProxySettingsDialog })),
);
const StartupGallerySettingsDialog = lazy(() =>
  import("./StartupGallerySettingsDialog").then((module) => ({ default: module.StartupGallerySettingsDialog })),
);
const PerformanceSettingsDialog = lazy(() =>
  import("./PerformanceSettingsDialog").then((module) => ({ default: module.PerformanceSettingsDialog })),
);
const loadPromptDetailDialog = () => import("./PromptDetailDialog");
const PromptDetailDialog = lazy(() => loadPromptDetailDialog().then((module) => ({ default: module.PromptDetailDialog })));
const PromptLibraryManagerView = lazy(() =>
  import("./PromptLibraryManagerDialog").then((module) => ({ default: module.PromptLibraryManagerView })),
);

const pageSize = 36;
const gridVisibleTagCount = 5;
const contentShellClassName = "mx-auto w-full max-w-[1280px]";
const lexiconShellClassName = "mx-auto w-full max-w-[1400px]";
const contentShellMaxWidth = 1280;
const lexiconShellMaxWidth = 1400;
const pageGutterClassName = "px-4 min-[640px]:px-6 min-[1024px]:px-8 min-[1440px]:px-10";
const minMasonryColumnCount = 2;
const maxMasonryColumnCount = 10;
const defaultMasonryColumnCount = 4;
const masonryColumnGap = 16;
const appVersion = "0.1.1";
const suyanGithubRepoUrl = "https://github.com/guliacer/SuYan";
const suyanGithubReleasesUrl = `${suyanGithubRepoUrl}/releases`;
const allParameterSourcesValue = "__all__";
const globalParameterSourceValue = "__global__";
const allParameterGroupsValue = "__all_parameter_groups__";
const parameterItemMenuPrefix = "__parameter_item__:";
const defaultParameterGroupLabel = "自定义参数";
const ungroupedParameterGroupLabel = "未分组";
const allCategoryGroupsValue = "__all_category_groups__";
const allTagGroupsValue = "__all_tag_groups__";
const imageGroupMenuPrefix = "image-group:";
const imageCategoryMenuPrefix = "image-category:";
const imageItemMenuPrefix = "image-item:";
const defaultCategoryGroupLabel = "自定义分类";
const defaultTagGroupLabel = "自定义标签";
const ungroupedImageGroupLabel = "未分组";
const validParameterMenuValidation: PromptParameterMenuValidationResult = { isValid: true, issues: [] };

type PromptSiteRecommendation = {
  description: string;
  domain: string;
  tags: string[];
  title: string;
  url: string;
};

const promptSiteRecommendations: PromptSiteRecommendation[] = [
  {
    title: "即梦AI",
    domain: "jimeng.jianying.com",
    url: "https://jimeng.jianying.com/ai-tool/home",
    description: "剪映 AI 创作工具，参考中文图像、视频玩法和提示词。",
    tags: ["中文工具", "图像视频", "创作灵感"],
  },
  {
    title: "civitai（C站）",
    domain: "civitai.red",
    url: "https://civitai.red/images",
    description: "C站图片灵感页，参考 SD 作品、模型效果和提示词。",
    tags: ["模型社区", "SD 生态", "图片案例"],
  },
  {
    title: "LibLibAI",
    domain: "liblib.art",
    url: "https://www.liblib.art/inspiration",
    description: "中文 AI 灵感库，查找图片案例、模型风格和提示词。",
    tags: ["中文灵感", "图像案例", "模型参考"],
  },
  {
    title: "YouMind",
    domain: "youmind.com",
    url: "https://youmind.com/zh-CN/gpt-image-2-prompts",
    description: "GPT Image 2 案例，参考封面、产品图和创意图提示词。",
    tags: ["GPT Image 2", "案例合集", "中文页面"],
  },
  {
    title: "awesome-gpt-image-2",
    domain: "gpt-image2.canghe.ai",
    url: "https://gpt-image2.canghe.ai",
    description: "GPT Image 2 案例导航，浏览多题材提示词和效果。",
    tags: ["GPT Image 2", "案例导航", "图像生成"],
  },
  {
    title: "aiart.pics",
    domain: "aiart.pics",
    url: "https://aiart.pics",
    description: "AI 艺术案例站，查找摄影、人物、产品和视觉参考。",
    tags: ["AI 艺术", "提示词案例", "视觉参考"],
  },
  {
    title: "提示词填空器",
    domain: "promptfill.tanshilong.com",
    url: "https://promptfill.tanshilong.com/explore",
    description: "提示词填空工具，拆分可替换参数并查看主题案例。",
    tags: ["参数填空", "提示词拆解", "案例探索"],
  },
  {
    title: "AI 图片 Prompt 案例库",
    domain: "webtomind.com",
    url: "https://webtomind.com/zh-CN/prompts",
    description: "中文图片 Prompt 案例库，收集题材和复用结构。",
    tags: ["中文案例库", "图像 Prompt", "题材分类"],
  },
  {
    title: "LeaderAI 立得AI",
    domain: "www.leaderai.top",
    url: "https://www.leaderai.top/#/preset-prompt-page",
    description: "设计师提示词预设页，查找图像创作和设计灵感。",
    tags: ["提示词预设", "设计灵感", "中文页面"],
  },
  {
    title: "哗啦哗啦广场",
    domain: "img.xmiaom.com",
    url: "https://img.xmiaom.com",
    description: "中文 AI 图片广场，浏览热门作品和提示词灵感。",
    tags: ["中文图片广场", "热门作品", "提示词灵感"],
  },
  {
    title: "上码 UPMA 图片提示词",
    domain: "upma.cn",
    url: "https://www.upma.cn/image-prompts",
    description: "GPT Image 2 生图案例库，参考中文案例和提示词结构。",
    tags: ["GPT Image 2", "中文案例", "图片 Prompt"],
  },
  {
    title: "SeaArt AI",
    domain: "seaart.ai",
    url: "https://www.seaart.ai/explore",
    description: "AI 创作社区，查看模型效果、角色和场景案例。",
    tags: ["创作社区", "图片探索", "模型案例"],
  },
];

type PersonalRecommendationSection = {
  id: string;
  title: string;
  description: string;
  items: PromptSiteRecommendation[];
};

const personalProjectRecommendations: PromptSiteRecommendation[] = [
  {
    title: "ComfyUI-GuliNodes",
    domain: "github.com",
    url: "https://github.com/guliacer/ComfyUI-GuliNodes",
    description: "ComfyUI 工具合集，囊括多种有用节点与工具。",
    tags: ["个人项目", "ComfyUI", "节点扩展"],
  },
  {
    title: "GetPhoto 图像提取",
    domain: "github.com",
    url: "https://github.com/guliacer/GetPhoto",
    description: "油猴插件，适配多站点，支持小红书 AI 爬图。",
    tags: ["个人项目", "油猴插件", "图像提取"],
  },
  {
    title: "PagePurifier 网页优化",
    domain: "github.com",
    url: "https://github.com/guliacer/PagePurifier",
    description: "油猴插件，拉黑 B 站广告 UP，精简网页广告。",
    tags: ["个人项目", "油猴插件", "网页净化"],
  },
  {
    title: "Preview 网页图像悬浮工具",
    domain: "github.com",
    url: "https://github.com/guliacer/preview",
    description: "油猴插件，鼠标悬停即可查看图像大图。",
    tags: ["个人项目", "油猴插件", "图像预览"],
  },
  {
    title: "VeilReader 网页摸鱼小说工具",
    domain: "github.com",
    url: "https://github.com/guliacer/VeilReader",
    description: "油猴插件，摸鱼的钱才是你赚到的钱。",
    tags: ["个人项目", "油猴插件", "摸鱼阅读"],
  },
  {
    title: "CookClick 网页美化",
    domain: "github.com",
    url: "https://github.com/guliacer/cookclick",
    description: "油猴插件，点击网页随机生成符号。",
    tags: ["个人项目", "油猴插件", "网页美化"],
  },
  {
    title: "PixGo",
    domain: "github.com",
    url: "https://github.com/guliacer/PixGo",
    description: "改善索尼相机无线传图。",
    tags: ["个人项目", "软件", "无线传图"],
  },
  {
    title: "新闻 HTML 日报",
    domain: "github.com",
    url: "https://github.com/guliacer/news-html-digest",
    description: "Skill 脚本，抓取新闻，消除信息差。",
    tags: ["个人项目", "Skill", "新闻抓取"],
  },
];

const friendProjectRecommendations: PromptSiteRecommendation[] = [
  {
    title: "ComfyNexus",
    domain: "github.com",
    url: "https://github.com/Allen-xxa/ComfyNexus",
    description: "最好用的 ComfyUI 启动器。",
    tags: ["友情项目", "ComfyUI", "启动器"],
  },
  {
    title: "提示词小助手",
    domain: "github.com",
    url: "https://github.com/yawiii/ComfyUI-Prompt-Assistant",
    description: "最好用的提示词优化工具。",
    tags: ["友情项目", "ComfyUI", "提示词优化"],
  },
  {
    title: "花佬",
    domain: "pan.quark.cn",
    url: "https://pan.quark.cn/s/3b60f26d43a8",
    description: "花佬整理的提示词知识库，学习写法、案例和结构。",
    tags: ["友情项目", "提示词推荐", "资源分享"],
  },
];

const apiSiteRecommendations: PromptSiteRecommendation[] = [
  {
    title: "商汤 token-plan",
    domain: "platform.sensenova.cn",
    url: "https://platform.sensenova.cn/console",
    description: "免费模型，手机号登陆，不可签到。",
    tags: ["API 网站", "商汤", "免费模型"],
  },
  {
    title: "斑马 API",
    domain: "bmapi.020212.xyz",
    url: "https://bmapi.020212.xyz/register?aff=VFNVKJJYLQQR",
    description: "QQ 邮箱登录，签到送 100 积分。",
    tags: ["API 网站", "免费额度", "签到积分"],
  },
  {
    title: "哈基米",
    domain: "api.gemai.cc",
    url: "https://api.gemai.cc/sign-up?aff=AM58",
    description: "QQ 邮箱登录，签到送少量额度。",
    tags: ["API 网站", "免费额度", "签到额度"],
  },
  {
    title: "Guyscode",
    domain: "www.guyscode.com",
    url: "https://www.guyscode.com/register?aff=5TEUB7CZEJCS",
    description: "QQ 邮箱登录，签到送少量额度。",
    tags: ["API 网站", "免费额度", "签到额度"],
  },
  {
    title: "RouterTeam",
    domain: "ai.router.team",
    url: "https://ai.router.team/register?invite=4Q2MQZFC",
    description: "QQ 邮箱登录，签到送少量额度。",
    tags: ["API 网站", "免费额度", "签到额度"],
  },
  {
    title: "rua.chat",
    domain: "api.rua.chat",
    url: "https://api.rua.chat/sign-up?aff=DQM1",
    description: "QQ 邮箱登录，签到送少量额度。",
    tags: ["API 网站", "免费额度", "签到额度"],
  },
  {
    title: "咕嘎咕嘎",
    domain: "ai.xmiaom.com",
    url: "https://ai.xmiaom.com/sign-up?aff=bibi",
    description: "微信或 GitHub 注册，签到送少量额度。",
    tags: ["API 网站", "微信注册", "签到额度"],
  },
  {
    title: "小旋风",
    domain: "console.xiaoxuanfeng.cc",
    url: "https://console.xiaoxuanfeng.cc/register?aff=5T38TJVNM4X6",
    description: "QQ 邮箱注册，不可签到，但价格较低。",
    tags: ["API 网站", "QQ 邮箱", "低价中转"],
  },
  {
    title: "FastAI 模型",
    domain: "www.fastaitoken.com",
    url: "https://www.fastaitoken.com/register?aff=S8F8YJY426VA",
    description: "QQ 邮箱注册，不可签到，但价格较低。",
    tags: ["API 网站", "QQ 邮箱", "低价模型"],
  },
];

const startupLoadingSteps = ["正在唤醒素材库", "翻阅素材星图", "点亮提示词库", "整理你的画廊"];

const startupArtImages = [startupArt1, startupArt2, startupArt3, startupArt4, startupArt5, startupArt6];
const STARTUP_CAROUSEL_INTERVAL_MS = 2400;

type CollectionMode = "all" | "featured";
type GalleryMode = "masonry" | "grid";
type LibraryMainView = "home" | "promptLibrary" | "parameterLexicon" | "categoryLexicon" | "tagLexicon" | "promptSites";
type LibrarySidebarActiveView =
  | LibraryMainView
  | "aiSettings"
  | "nsfwSettings"
  | "proxySettings"
  | "performanceSettings"
  | "startupGallerySettings";
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
const maxBatchAiTagCount = 15;
type MasonryPromptItem = {
  imageCount: number;
  item: PromptCardData;
};

function ImageDropOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-overlay/60 p-6 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-panel/95 px-10 py-8 text-center shadow-elevated">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Upload size={26} />
        </span>
        <p className="text-base font-semibold text-foreground">松开鼠标即可导入图片</p>
        <p className="text-sm text-muted">单张成卡，多张归组</p>
      </div>
    </div>
  );
}

export function LibraryView() {
  recordLibraryViewRender();
  const items = useLibraryStore((state) => state.items);
  const libraryRoots = useLibraryStore((state) => state.libraryRoots);
  const searchQuery = useLibraryStore((state) => state.searchQuery);
  const tagOrder = useLibraryStore((state) => state.tagOrder);
  const likedImageIds = useLibraryStore((state) => state.likedImageIds);
  const generationModelOrder = useLibraryStore((state) => state.generationModelOrder);
  const hiddenGenerationModels = useLibraryStore((state) => state.hiddenGenerationModels);
  const autoNsfwGrading = useLibraryStore((state) => state.autoNsfwGrading);
  const blurNsfwImages = useLibraryStore((state) => state.blurNsfwImages);
  const nsfwGradingSpeed = useLibraryStore((state) => state.nsfwGradingSpeed);
  const promptLexicons = useLibraryStore((state) => state.promptLexicons);
  const savedMasonryTileWidth = useLibraryStore((state) => state.masonryTileWidth);
  const savedMaterialBrowserCollectionMode = useLibraryStore((state) => state.materialBrowserCollectionMode);
  const savedMaterialBrowserGalleryMode = useLibraryStore((state) => state.materialBrowserGalleryMode);
  const savedMaterialBrowserSortMode = useLibraryStore((state) => state.materialBrowserSortMode);
  const savedMaterialBrowserSortDirection = useLibraryStore((state) => state.materialBrowserSortDirection);
  const savedMaterialBrowserRandomSeed = useLibraryStore((state) => state.materialBrowserRandomSeed);
  const recentImportPinIds = useLibraryStore((state) => state.recentImportPinIds);
  const clearRecentImportPins = useLibraryStore((state) => state.clearRecentImportPins);
  const aiSettings = useLibraryStore((state) => state.aiSettings);
  const proxySettings = useLibraryStore((state) => state.proxySettings);
  const moduleState = useLibraryStore((state) => state.moduleState);
  const isLoading = useLibraryStore((state) => state.isLoading);
  const isBusy = useLibraryStore((state) => state.isBusy);
  const statusMessage = useLibraryStore((state) => state.statusMessage);
  const load = useLibraryStore((state) => state.load);
  const showStatusMessage = useLibraryStore((state) => state.showStatusMessage);
  const setSearchQuery = useLibraryStore((state) => state.setSearchQuery);
  const saveNsfwSettings = useLibraryStore((state) => state.saveNsfwSettings);
  const gradeAllImagesForNsfw = useLibraryStore((state) => state.gradeAllImagesForNsfw);
  const saveAiSettings = useLibraryStore((state) => state.saveAiSettings);
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
  const addAndScanLibraryRoot = useLibraryStore((state) => state.addAndScanLibraryRoot);
  const scanLibraryRoot = useLibraryStore((state) => state.scanLibraryRoot);
  const setLibraryRootWatch = useLibraryStore((state) => state.setLibraryRootWatch);
  const remapLibraryRoot = useLibraryStore((state) => state.remapLibraryRoot);
  const removeLibraryRoot = useLibraryStore((state) => state.removeLibraryRoot);
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
  const importClipboardImageForItem = useLibraryStore((state) => state.importClipboardImageForItem);
  const downloadRemoteMaterial = useLibraryStore((state) => state.downloadRemoteMaterial);
  const importZip = useLibraryStore((state) => state.importZip);
  const copyText = useLibraryStore((state) => state.copyText);
  const copyImage = useLibraryStore((state) => state.copyImage);
  const exportImage = useLibraryStore((state) => state.exportImage);
  const saveItem = useLibraryStore((state) => state.saveItem);
  const saveGenerationModelPreferences = useLibraryStore((state) => state.saveGenerationModelPreferences);
  const savePromptLexicons = useLibraryStore((state) => state.savePromptLexicons);
  const saveMasonryTileWidth = useLibraryStore((state) => state.saveMasonryTileWidth);
  const saveMaterialBrowserSettings = useLibraryStore((state) => state.saveMaterialBrowserSettings);
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
  const [selectedCategory, setSelectedCategory] = useState(allCategoriesValue);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [mainView, setMainView] = useState<LibraryMainView>("home");
  const [sidebarActiveView, setSidebarActiveView] = useState<LibrarySidebarActiveView>("home");
  const [imageSizeById, setImageSizeById] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [masonryColumnCount, setMasonryColumnCount] = useState(() => migrateTileWidthToColumnCount(savedMasonryTileWidth));
  const [isMasonrySizeControlOpen, setIsMasonrySizeControlOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<PromptCardData | null>(null);

  const openFullscreenMedia = useCallback((item: PromptCardData) => {
    setDetailItemId(null);
    setFullscreenMedia(item);
  }, []);

  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isNsfwSettingsOpen, setIsNsfwSettingsOpen] = useState(false);
  const [isProxySettingsOpen, setIsProxySettingsOpen] = useState(false);
  const [isPerformanceSettingsOpen, setIsPerformanceSettingsOpen] = useState(false);
  const [isStartupGallerySettingsOpen, setIsStartupGallerySettingsOpen] = useState(false);
  const [isLibraryRootsOpen, setIsLibraryRootsOpen] = useState(false);
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
  const cardsStartRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sidebarElementRef = useRef<HTMLElement | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const isSidebarResizingRef = useRef(false);
  const dragDepthRef = useRef(0);
  const importMenuRef = useRef<HTMLDivElement | null>(null);
  const importMenuContentRef = useRef<HTMLDivElement | null>(null);
  const hasNotifiedRendererReadyRef = useRef(false);
  const viewSwitchStartedAtRef = useRef<{ startedAt: number; view: LibraryMainView } | null>(null);

  useEffect(() => {
    // Skip while dragging so a late state write cannot overwrite the live width.
    if (isSidebarResizingRef.current) {
      return;
    }

    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

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
    setMasonryColumnCount(migrateTileWidthToColumnCount(savedMasonryTileWidth));
  }, [savedMasonryTileWidth]);

  useEffect(() => {
    setMasonryColumnCount(migrateTileWidthToColumnCount(savedMasonryTileWidth));
  }, [savedMasonryTileWidth]);

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

    if (isProxySettingsOpen) {
      setSidebarActiveView("proxySettings");
      return;
    }

    if (isPerformanceSettingsOpen) {
      setSidebarActiveView("performanceSettings");
      return;
    }

    if (isStartupGallerySettingsOpen) {
      setSidebarActiveView("startupGallerySettings");
      return;
    }

    setSidebarActiveView(mainView);
  }, [
    isAiSettingsOpen,
    isNsfwSettingsOpen,
    isProxySettingsOpen,
    isPerformanceSettingsOpen,
    isStartupGallerySettingsOpen,
    mainView,
  ]);

  useEffect(() => {
    const switchInfo = viewSwitchStartedAtRef.current;

    if (!switchInfo || switchInfo.view !== mainView) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      logRendererStartupEvent("view-switch:ready", {
        durationMs: Math.round(performance.now() - switchInfo.startedAt),
        to: mainView,
      });
      viewSwitchStartedAtRef.current = null;
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mainView]);

  useEffect(() => {
    if (mainView !== "parameterLexicon" && mainView !== "categoryLexicon" && mainView !== "tagLexicon") {
      return;
    }

    setMountedLexiconViews((current) => (current.has(mainView) ? current : new Set([...current, mainView])));
  }, [mainView]);

  useEffect(() => {
    if (!hasInitialLoadFinished) {
      return;
    }

    const lexiconViews: LibraryMainView[] = ["categoryLexicon", "tagLexicon", "parameterLexicon"];
    const timers: number[] = [];
    let idleHandle: number | null = null;
    let cancelled = false;

    const requestIdle: (callback: () => void) => number =
      typeof window.requestIdleCallback === "function"
        ? (callback) => window.requestIdleCallback(() => callback(), { timeout: 2000 })
        : (callback) => window.setTimeout(callback, 200);
    const cancelIdle: (handle: number) => void =
      typeof window.cancelIdleCallback === "function" ? (handle) => window.cancelIdleCallback(handle) : (handle) => window.clearTimeout(handle);

    function premountNext(index: number) {
      if (cancelled) {
        return;
      }

      if (index >= lexiconViews.length) {
        setHasPremountedLexicons(true);
        return;
      }

      idleHandle = requestIdle(() => {
        idleHandle = null;
        setMountedLexiconViews((current) => (current.has(lexiconViews[index]) ? current : new Set([...current, lexiconViews[index]])));
        const timer = window.setTimeout(() => premountNext(index + 1), 120);
        timers.push(timer);
      });
    }

    premountNext(0);

    const safetyTimer = window.setTimeout(() => {
      setHasPremountedLexicons(true);
    }, 2500);
    timers.push(safetyTimer);

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        cancelIdle(idleHandle);
      }
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [hasInitialLoadFinished]);

  const promptCards = usePromptCards();
  const promptCategories = useMemo(() => getPromptCategories(promptCards), [promptCards]);
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
  }, [activeTag, collectionMode, galleryMode, randomSeed, recentImportPinIds, searchQuery, selectedCategory, sortDirection, sortMode]);

  const skipNextImportPinClearRef = useRef(true);

  useEffect(() => {
    // 用户主动改排序/筛选后，取消“刚导入置顶”，避免长期干扰既有排序。
    if (skipNextImportPinClearRef.current) {
      skipNextImportPinClearRef.current = false;
      return;
    }

    clearRecentImportPins();
  }, [activeTag, clearRecentImportPins, collectionMode, randomSeed, searchQuery, selectedCategory, sortDirection, sortMode]);


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
    if (selectedCategory !== allCategoriesValue && !promptCategories.includes(selectedCategory)) {
      setSelectedCategory(allCategoriesValue);
    }
  }, [promptCategories, selectedCategory]);

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
          category: selectedCategory,
          activeTag,
          sortMode,
          sortDirection,
          imageSizeById,
          randomSeed,
          pinnedItemIds: recentImportPinIds,
        }),
      ),
    [activeTag, imageSizeById, promptCards, randomSeed, recentImportPinIds, searchQuery, selectedCategory, sortDirection, sortMode],
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
  const imageCountByItemId = useMemo(
    () => (mainView === "home" ? buildImageCountByItemId(allPromptGroups) : new Map<string, number>()),
    [allPromptGroups, mainView],
  );
  const masonryDisplayItems = useMemo(
    () => measureDerivation("spreadPromptGroups", displayGroups.length, () => spreadPromptGroupImagesWithCount(displayGroups, imageCountByItemId)),
    [displayGroups, imageCountByItemId],
  );
  const displayCount = galleryMode === "grid" ? displayGroups.length : masonryDisplayItems.length;
  const displayCountRef = useRef(displayCount);
  displayCountRef.current = displayCount;

  useEffect(() => {
    // 删除后只收敛可见窗口，避免重新从 pageSize 灌入导致滚动卡顿。
    setVisibleCount((current) => Math.min(current, Math.max(displayCount, 0)));
  }, [displayCount]);

  useEffect(() => {
    if (!hasInitialLoadFinished) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    const container = scrollContainer;
    let rafId: number | null = null;

    function checkLoadMore() {
      rafId = null;
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

      if (distanceToBottom < 800) {
        setVisibleCount((current) => {
          const total = displayCountRef.current;
          if (current >= total) {
            return current;
          }
          return Math.min(current + pageSize, total);
        });
      }
    }

    function handleScroll() {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(checkLoadMore);
      }
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    checkLoadMore();

    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [hasInitialLoadFinished]);

  useEffect(() => {
    if (!hasInitialLoadFinished || mainView !== "home") {
      return;
    }

    const scrollContainer = scrollContainerRef.current;

    if (scrollContainer === null) {
      return;
    }

    if (visibleCount >= displayCount) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      const distanceToBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;

      if (distanceToBottom < 800) {
        setVisibleCount((current) => {
          if (current >= displayCountRef.current) {
            return current;
          }
          return Math.min(current + pageSize, displayCountRef.current);
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [displayCount, hasInitialLoadFinished, mainView, masonryColumnCount, visibleCount]);

  const visibleGridGroups = displayGroups.slice(0, visibleCount);
  const visibleMasonryItems = masonryDisplayItems.slice(0, visibleCount);
  const hasVisibleResults = displayCount > 0;
  const isInitialLibraryLoading = !hasInitialLoadFinished || (isLoading && items.length === 0);
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

  function scrollToCards() {
    cardsStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToTop(behavior: ScrollBehavior = "auto") {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior });
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

    viewSwitchStartedAtRef.current = { startedAt, view };
    startTransition(() => {
      setMainView(view);
      logRendererStartupEvent("view-switch:committed", {
        durationMs: Math.round(performance.now() - startedAt),
        to: view,
      });
    });
    scrollToTop();
  }

  function openHomeView() {
    openMainView("home");
  }

  function closeSettingsDialogs() {
    setIsAiSettingsOpen(false);
    setIsNsfwSettingsOpen(false);
    setIsProxySettingsOpen(false);
    setIsPerformanceSettingsOpen(false);
    setIsStartupGallerySettingsOpen(false);
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

  function openProxySettings() {
    setSidebarActiveView("proxySettings");
    setIsImportMenuOpen(false);
    closeSettingsDialogs();
    setIsProxySettingsOpen(true);
  }

  function openPerformanceSettings() {
    setSidebarActiveView("performanceSettings");
    setIsImportMenuOpen(false);
    closeSettingsDialogs();
    setIsPerformanceSettingsOpen(true);
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

  function openStartupGallerySettings() {
    setSidebarActiveView("startupGallerySettings");
    setIsImportMenuOpen(false);
    closeSettingsDialogs();
    setIsStartupGallerySettingsOpen(true);
  }

  function handleMasonryColumnCountChange(nextCount: number) {
    setMasonryColumnCount(clampMasonryColumnCount(nextCount));
  }

  function handleMasonryColumnCountCommit(nextCount: number) {
    const normalizedCount = clampMasonryColumnCount(nextCount);

    setMasonryColumnCount(normalizedCount);
    void saveMasonryTileWidth(normalizedCount);
  }

  function handleCollectionModeChange(mode: CollectionMode) {
    setCollectionMode(mode);
    void saveMaterialBrowserSettings({ materialBrowserCollectionMode: mode });
  }

  function handleGalleryModeChange(mode: GalleryMode) {
    setGalleryMode(mode);
    void saveMaterialBrowserSettings({ materialBrowserGalleryMode: mode });
  }

  function handleSortDirectionChange(direction: PromptSortDirection) {
    setSortDirection(direction);
    void saveMaterialBrowserSettings({ materialBrowserSortDirection: direction });
  }

  function handleSortModeChange(mode: PromptSortMode) {
    const nextRandomSeed = mode === "random" ? randomSeed + 1 : randomSeed;

    setSortMode(mode);

    if (mode === "random") {
      setRandomSeed(nextRandomSeed);
    }

    void saveMaterialBrowserSettings({
      materialBrowserSortMode: mode,
      materialBrowserRandomSeed: nextRandomSeed,
    });
  }

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
    setSelectedCategory(allCategoriesValue);
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
    return <StartupLoadingScreen />;
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
      className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground"
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      <AppTitleBar isSidebarOpen={isSidebarOpen} overlayActive={isDetailOverlayOpen} onToggleSidebar={toggleSidebar} />
      {isLibraryRootsOpen ? (
        <LibraryRootsDialog
          isBusy={isBusy}
          roots={libraryRoots}
          onAdd={() => void addAndScanLibraryRoot()}
          onClose={() => setIsLibraryRootsOpen(false)}
          onRemap={(rootId) => void remapLibraryRoot(rootId)}
          onRemove={(rootId) => void removeLibraryRoot(rootId)}
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
              void addAndScanLibraryRoot();
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
            onOpenNsfwSettings={openNsfwSettings}
            onOpenProxySettings={openProxySettings}
            onOpenPerformanceSettings={openPerformanceSettings}
            onOpenStartupGallerySettings={openStartupGallerySettings}
            onOpenCategoryLexicon={() => openMainView("categoryLexicon")}
            onOpenHome={openHomeView}
            onOpenLibraryRoots={() => setIsLibraryRootsOpen(true)}
            onOpenManager={() => openMainView("promptLibrary")}
            onOpenParameterLexicon={() => openMainView("parameterLexicon")}
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
          className="min-h-0 flex-1 overflow-y-auto"
          style={scrollContainerStyle}
        >
          <div aria-hidden={mainView !== "home"} className={mainView === "home" ? "" : "hidden"}>
              <section className={`py-4 min-[1024px]:py-5 ${pageGutterClassName}`}>
                <div className={`${contentShellClassName} grid gap-4`}>
                  <SearchHeroPanel
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSubmit={() => {
                      setVisibleCount(pageSize);
                      scrollToCards();
                    }}
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
                        columnCount={masonryColumnCount}
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
                        onCopyPrompt={(item) => void copyText(buildPromptText(item), "已复制提示词。")}
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

          {mainView !== "home" || mountedLexiconViews.size > 0 ? (
            <section className={`py-4 min-[1024px]:py-5 ${pageGutterClassName} ${mainView === "home" ? "hidden" : ""}`}>
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
                    onCopySiteUrl={(site) => void copyText(site.url, "已复制网址。")}
                    onOpenSite={(site) => void openExternalUrl(site.url, site.title)}
                  />
                ) : null}

                {mountedLexiconViews.has("parameterLexicon") ? (
                  <div className={mainView === "parameterLexicon" ? "contents" : "hidden"}>
                    <PromptLexiconWorkspace
                      kind="parameters"
                      blurNsfwImages={blurNsfwImages}
                      isBusy={isBusy}
                      hideScrollTopButton={isDetailOverlayOpen}
                      likedImageIds={likedImageIds}
                      popularTags={orderedPopularTags}
                      promptGroups={allPromptGroups}
                      promptLexicons={promptLexicons}
                      onAnalyzePrompt={analyzePromptWithAi}
                      onCopyPrompt={(item) => void copyText(buildPromptText(item), "已复制提示词。")}
                      onExportLexicon={exportPromptLexicon}
                      onImportLexicon={importPromptLexicon}
                      onImportLexiconImage={importPromptLexiconImage}
                      onOpenDetail={openDetailItem}
                      onDeleteItems={deleteItems}
                      onSaveItem={(itemId, patch) => saveItem(itemId, patch, { background: true, silent: true })}
                      onSavePromptLexicons={savePromptLexicons}
                    />
                  </div>
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
                      onAnalyzePrompt={analyzePromptWithAi}
                      onCopyPrompt={(item) => void copyText(buildPromptText(item), "已复制提示词。")}
                      onExportLexicon={exportPromptLexicon}
                      onImportLexicon={importPromptLexicon}
                      onImportLexiconImage={importPromptLexiconImage}
                      onOpenDetail={openDetailItem}
                      onDeleteItems={deleteItems}
                      onSaveItem={(itemId, patch) => saveItem(itemId, patch, { background: true, silent: true })}
                      onSavePromptLexicons={savePromptLexicons}
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
                      onAnalyzePrompt={analyzePromptWithAi}
                      onCopyPrompt={(item) => void copyText(buildPromptText(item), "已复制提示词。")}
                      onExportLexicon={exportPromptLexicon}
                      onImportLexicon={importPromptLexicon}
                      onImportLexiconImage={importPromptLexiconImage}
                      onOpenDetail={openDetailItem}
                      onDeleteItems={deleteItems}
                      onSaveItem={(itemId, patch) => saveItem(itemId, patch, { background: true, silent: true })}
                      onSavePromptLexicons={savePromptLexicons}
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

      {detailItem ? (
        <Suspense fallback={<PromptDetailFallback />}>
          <PromptDetailDialog
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
            promptLexicons={promptLexicons}
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
            onNavigateNext={() => navigateDetail(1)}
            onNavigatePrevious={() => navigateDetail(-1)}
            onShareText={(text) => void copyText(text, "已复制分享内容。")}
            onSave={(patch) => saveItem(detailItem.id, patch, { background: true, silent: true })}
            onSaveGenerationModelPreferences={(patch) => void saveGenerationModelPreferences(patch)}
            onSavePromptLexicons={savePromptLexicons}
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
            onTest={testAiSettings}
            onListModels={listAiModels}
            onCopyApiKey={copyAiApiKey}
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

      {isProxySettingsOpen ? (
        <Suspense fallback={null}>
          <ProxySettingsDialog
            isBusy={isBusy}
            settings={proxySettings}
            onClose={() => setIsProxySettingsOpen(false)}
            onDetect={detectProxySettings}
            onSave={saveProxySettings}
            onTest={testProxySettings}
            onNotify={showStatusMessage}
          />
        </Suspense>
      ) : null}

      {isPerformanceSettingsOpen ? (
        <Suspense fallback={null}>
          <PerformanceSettingsDialog
            isBusy={isBusy}
            onClose={() => setIsPerformanceSettingsOpen(false)}
            onNotify={showStatusMessage}
          />
        </Suspense>
      ) : null}

      {isStartupGallerySettingsOpen ? (
        <Suspense fallback={null}>
          <StartupGallerySettingsDialog
            isBusy={isBusy}
            onClose={() => setIsStartupGallerySettingsOpen(false)}
            onNotify={showStatusMessage}
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
          <StartupLoadingScreen />
        </div>
      ) : null}
    </main>
  );
}

type TagEditorDraft = TagConfigurationDraft & {
  id: string;
};

type ToastStatusMessage = {
  autoDismissMs: number | null;
  text: string;
  type: "success" | "error" | "info";
};

const themeModeOptions: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: "light", label: getThemeModeLabel("light"), icon: <Sun size={15} /> },
  { value: "dark", label: getThemeModeLabel("dark"), icon: <Moon size={15} /> },
];

type StatusToastProps = {
  message: ToastStatusMessage;
  onClose: () => void;
};

function StatusToast({ message, onClose }: StatusToastProps) {
  const toneClassName = getStatusToastToneClassName(message.type);
  const title = getStatusToastTitle(message);
  const isPending = message.autoDismissMs === null;
  const durationStyle = isPending
    ? undefined
    : ({
        "--status-toast-duration": `${message.autoDismissMs}ms`,
      } as CSSProperties);

  return (
    <div
      aria-atomic="true"
      aria-live={message.type === "error" ? "assertive" : "polite"}
      className="pointer-events-none fixed left-1/2 top-5 z-[100] flex w-[calc(100vw-2rem)] -translate-x-1/2 justify-center"
      role={message.type === "error" ? "alert" : "status"}
    >
      <button
        aria-label="关闭消息提示"
        className="status-toast pointer-events-auto relative flex min-h-[58px] w-fit min-w-64 max-w-[calc(100vw-2rem)] items-center justify-center gap-2.5 overflow-hidden rounded-[13px] border border-border bg-panel px-5 text-center shadow-image outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 sm:max-w-96"
        style={durationStyle}
        type="button"
        onClick={onClose}
      >
        <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${toneClassName.icon}`}>
          {message.type === "success" ? (
            <Check size={13} strokeWidth={3} />
          ) : message.type === "error" ? (
            <X size={13} strokeWidth={3} />
          ) : (
            <Info size={13} strokeWidth={2.5} />
          )}
        </span>
        <span className="grid min-w-0 max-w-[17rem] flex-none gap-0.5 text-center">
          <span className="truncate text-[13px] font-bold leading-[18px] text-foreground">{title}</span>
          <span className="truncate text-xs leading-[17px] text-muted">{message.text}</span>
        </span>
        <span
          className={`absolute bottom-0 left-0 h-0.5 ${toneClassName.progress} ${
            isPending ? "status-toast-progress-indeterminate" : "status-toast-progress w-full"
          }`}
        />
      </button>
    </div>
  );
}

function getStatusToastToneClassName(type: ToastStatusMessage["type"]): { icon: string; progress: string } {
  if (type === "success") {
    return {
      icon: "bg-capsule-sage text-capsule-sage-foreground",
      progress: "bg-primary",
    };
  }

  if (type === "error") {
    return {
      icon: "bg-danger-soft text-danger",
      progress: "bg-danger",
    };
  }

  return {
    icon: "bg-capsule-mist text-capsule-mist-foreground",
    progress: "bg-progress",
  };
}

function getStatusToastTitle(message: ToastStatusMessage): string {
  if (message.type === "error") {
    return "操作失败";
  }

  if (message.type === "info") {
    return message.autoDismissMs === null ? "正在处理" : "提示";
  }

  if (message.text.includes("导入")) {
    return "导入成功";
  }

  if (message.text.includes("导出")) {
    return "导出成功";
  }

  if (message.text.includes("复制")) {
    return "复制成功";
  }

  if (message.text.includes("保存")) {
    return "保存成功";
  }

  return "操作成功";
}

type PromptSiteRecommendationsViewProps = {
  sites: PromptSiteRecommendation[];
  onCopySiteUrl: (site: PromptSiteRecommendation) => void;
  onOpenSite: (site: PromptSiteRecommendation) => void;
};

function PromptSiteRecommendationsView({ sites, onCopySiteUrl, onOpenSite }: PromptSiteRecommendationsViewProps) {
  const sections: PersonalRecommendationSection[] = [
    {
      id: "personal-projects",
      title: "个人项目",
    description: "自研节点、脚本和小工具，覆盖图像抓取、网页效率、传图与信息聚合。",
      items: personalProjectRecommendations,
    },
    {
      id: "friend-projects",
      title: "友情项目",
      description: "推荐的 ComfyUI 启动器、提示词优化工具和知识库。",
      items: friendProjectRecommendations,
    },
    {
      id: "api-sites",
      title: "API 网站推荐",
      description: "提供免费额度或签到福利的 API 中转站。",
      items: apiSiteRecommendations,
    },
    {
      id: "prompt-sites",
      title: "提示词网站推荐",
      description: "常用提示词社区、图像灵感库和官方提示词资料。",
      items: sites,
    },
  ];

  const totalRecommendationCount = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted">资源推荐</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-foreground">资源推荐</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              收集插件、脚本、软件、自动化技能和提示词网站，覆盖 AI 创作、网页效率与图像灵感。
            </p>
          </div>
          <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-muted">
            {totalRecommendationCount} 个推荐
          </span>
        </div>
      </header>

      {sections.map((section) => (
        <section key={section.id} className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{section.description}</p>
            </div>
            <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-muted">
              {section.items.length} 个
            </span>
          </div>
          <div className="grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
            {section.items.map((site, index) => (
              <PromptSiteRecommendationCard
                key={site.url}
                site={site}
                tone={promptSiteCardToneClassNames[index % promptSiteCardToneClassNames.length]}
                onCopyUrl={() => onCopySiteUrl(site)}
                onOpen={() => onOpenSite(site)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type PromptSiteCardToneClassNames = {
  article: string;
  button: string;
  header: string;
  icon: string;
  tag: string;
};

const promptSiteCardToneClassNames: PromptSiteCardToneClassNames[] = [
  {
    article: "border-capsule-sage-border hover:border-capsule-sage-border",
    button: "border-capsule-sage-border text-capsule-sage-foreground hover:bg-capsule-sage",
    header: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
    icon: "border-capsule-sage-border bg-panel/80 text-capsule-sage-foreground",
    tag: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
  },
  {
    article: "border-capsule-mist-border hover:border-capsule-mist-border",
    button: "border-capsule-mist-border text-capsule-mist-foreground hover:bg-capsule-mist",
    header: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
    icon: "border-capsule-mist-border bg-panel/80 text-capsule-mist-foreground",
    tag: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
  },
  {
    article: "border-capsule-rose-border hover:border-capsule-rose-border",
    button: "border-capsule-rose-border text-capsule-rose-foreground hover:bg-capsule-rose",
    header: "border-capsule-rose-border bg-capsule-rose text-capsule-rose-foreground",
    icon: "border-capsule-rose-border bg-panel/80 text-capsule-rose-foreground",
    tag: "border-capsule-rose-border bg-capsule-rose text-capsule-rose-foreground",
  },
  {
    article: "border-capsule-sand-border hover:border-capsule-sand-border",
    button: "border-capsule-sand-border text-capsule-sand-foreground hover:bg-capsule-sand",
    header: "border-capsule-sand-border bg-capsule-sand text-capsule-sand-foreground",
    icon: "border-capsule-sand-border bg-panel/80 text-capsule-sand-foreground",
    tag: "border-capsule-sand-border bg-capsule-sand text-capsule-sand-foreground",
  },
  {
    article: "border-capsule-lavender-border hover:border-capsule-lavender-border",
    button: "border-capsule-lavender-border text-capsule-lavender-foreground hover:bg-capsule-lavender",
    header: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
    icon: "border-capsule-lavender-border bg-panel/80 text-capsule-lavender-foreground",
    tag: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
  },
  {
    article: "border-capsule-clay-border hover:border-capsule-clay-border",
    button: "border-capsule-clay-border text-capsule-clay-foreground hover:bg-capsule-clay",
    header: "border-capsule-clay-border bg-capsule-clay text-capsule-clay-foreground",
    icon: "border-capsule-clay-border bg-panel/80 text-capsule-clay-foreground",
    tag: "border-capsule-clay-border bg-capsule-clay text-capsule-clay-foreground",
  },
  {
    article: "border-primary/30 hover:border-primary/45",
    button: "border-primary/35 text-primary hover:bg-primary-soft",
    header: "border-primary/25 bg-primary-soft text-primary",
    icon: "border-primary/30 bg-panel/80 text-primary",
    tag: "border-primary/25 bg-primary-soft text-primary",
  },
  {
    article: "border-capsule-stone-border hover:border-capsule-stone-border",
    button: "border-capsule-stone-border text-capsule-stone-foreground hover:bg-capsule-stone",
    header: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
    icon: "border-capsule-stone-border bg-panel/80 text-capsule-stone-foreground",
    tag: "border-capsule-stone-border bg-capsule-stone text-capsule-stone-foreground",
  },
];

type PromptSiteRecommendationCardProps = {
  site: PromptSiteRecommendation;
  tone: PromptSiteCardToneClassNames;
  onCopyUrl: () => void;
  onOpen: () => void;
};

function PromptSiteRecommendationCard({ site, tone, onCopyUrl, onOpen }: PromptSiteRecommendationCardProps) {
  return (
    <article
      className={`group/site grid overflow-hidden rounded-xl border bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${tone.article}`}
    >
      <div className={`flex min-h-10 items-center border-b px-4 py-2 ${tone.header}`}>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground group-hover/site:text-current">{site.title}</h2>
        </div>
      </div>

      <div className="grid gap-2 p-4">
        <p className="line-clamp-2 text-sm leading-5 text-muted">{site.description}</p>

        <div className="flex flex-wrap gap-1.5">
          {site.tags.map((tag) => (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone.tag}`} key={tag}>
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button
            className={`w-fit bg-panel shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elevated ${tone.button}`}
            icon={<ExternalLink size={14} />}
            onClick={onOpen}
          >
            查看
          </Button>
          <button
            aria-label={`复制网址：${site.title}`}
            className={`icon-tooltip-button flex size-9 shrink-0 items-center justify-center rounded-lg border bg-panel/85 shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary/25 ${tone.icon}`}
            data-tooltip-align="end"
            data-tooltip-placement="above"
            type="button"
            onClick={onCopyUrl}
          >
            <Globe2 size={15} />
            <span className="icon-tooltip-button__bubble" role="tooltip">
              复制网址
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}

type SidebarToggleButtonProps = {
  isOpen: boolean;
  onClick: () => void;
};

type AppTitleBarProps = {
  isSidebarOpen: boolean;
  overlayActive: boolean;
  onToggleSidebar: () => void;
};

type StartupGalleryDisplayImage = {
  height: number;
  source: string;
  width: number;
};

type StartupImageProbeResult = {
  height: number;
  isReady: boolean;
  width: number;
};

type StartupGallerySelection = {
  images: StartupGalleryDisplayImage[];
  sourceCount: number;
  usedFallback: boolean;
  failedImageCount: number;
};

let startupIntroPlayed = false;
let startupGallerySelectionCache: StartupGallerySelection | null = null;
let startupGallerySelectionPromise: Promise<StartupGallerySelection> | null = null;
let startupScreenReadyPromise: Promise<void> | null = null;

function StartupLoadingScreen() {
  const replay = startupIntroPlayed;
  const [galleryImages, setGalleryImages] = useState<StartupGalleryDisplayImage[]>(
    () => startupGallerySelectionCache?.images ?? [],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    startupIntroPlayed = true;
  }, []);

  useEffect(() => {
    let isDisposed = false;

    void loadStartupGallerySelection().then((selection) => {
      if (isDisposed) {
        return;
      }

      setGalleryImages(selection.images);
      setActiveIndex(0);
      void notifyStartupScreenReadyAfterPaint();
    });

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    if (galleryImages.length < 2) {
      return;
    }

    const timerId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % galleryImages.length);
    }, STARTUP_CAROUSEL_INTERVAL_MS);

    return () => window.clearInterval(timerId);
  }, [galleryImages.length]);

  return (
    <main
      className={`startup-scene${replay ? " startup-scene--replay" : ""}`}
      aria-label="正在加载素言"
    >
      <div className="startup-scene__backdrop" aria-hidden="true" />

      <div className="startup-stage" aria-hidden="true">
        <div className="startup-stage__deck">
          {galleryImages.map((image, index) => {
            const offset = getStartupCarouselOffset(index, activeIndex, galleryImages.length);
            const absOffset = Math.abs(offset);
            const isActive = offset === 0;
            const shift = getStartupSlideShift(offset);
            const scale = isActive ? 1.88 : Math.max(0.72, 1.38 - absOffset * 0.12);
            const dimOpacity = isActive ? 0 : Math.min(0.58, 0.12 + absOffset * 0.14);

            return (
              <figure
                className={`startup-slide${isActive ? " is-active" : ""}`}
                key={`${image.source}-${index}`}
                style={
                  {
                    "--startup-slide-shift": shift,
                    "--startup-slide-scale": scale,
                    "--startup-slide-dim-opacity": dimOpacity,
                    zIndex: getStartupSlideZIndex(offset),
                  } as CSSProperties
                }
              >
                <img
                  className="startup-slide__img"
                  src={image.source}
                  alt=""
                  decoding="async"
                  loading="eager"
                />
              </figure>
            );
          })}
        </div>
      </div>

      <div className="startup-scene__overlay">
        <div className="startup-scene__panel">
          <h1 className="startup-scene__title">正在加载素材库</h1>
          <p className="startup-scene__subtitle">正在为你准备提示词与作品</p>

          <ol className="startup-scene__steps">
            {startupLoadingSteps.map((step, index) => (
              <li
                className="startup-scene__step"
                key={step}
                style={{ animationDelay: `${0.3 + index * 0.55}s` }}
              >
                <span className="startup-scene__step-dot" aria-hidden="true" />
                {step}
              </li>
            ))}
          </ol>

          <div className="startup-scene__progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </main>
  );
}

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
    }
  }

  return result;
}

function getStartupCarouselOffset(index: number, activeIndex: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  let offset = index - activeIndex;
  if (offset > total / 2) {
    offset -= total;
  }
  if (offset < -total / 2) {
    offset += total;
  }

  return offset;
}

function getStartupSlideZIndex(offset: number): number {
  return 100 - Math.abs(offset) * 10;
}

function getStartupSlideShift(offset: number): number {
  const direction = Math.sign(offset);
  const steps = Math.abs(offset);
  const stepIncrements = [0, 30, 20, 15, 13];
  let shift = 0;

  for (let step = 1; step <= steps; step += 1) {
    shift += stepIncrements[Math.min(step, stepIncrements.length - 1)];
  }

  return direction * shift;
}

function loadStartupGallerySelection(): Promise<StartupGallerySelection> {
  if (startupGallerySelectionCache) {
    return Promise.resolve(startupGallerySelectionCache);
  }

  if (startupGallerySelectionPromise) {
    return startupGallerySelectionPromise;
  }

  startupGallerySelectionPromise = window.suyanApi
    .listStartupGalleryImages()
    .then(async (result) => {
      const gallerySources = result.ok
        ? [...result.data]
            .sort((left, right) => left.order - right.order)
            .map((image) => getStartupGalleryImageSrc(image.fileName))
        : [];
      const sourceImages = gallerySources.length > 0 ? gallerySources : startupArtImages;
      const selectedSources = selectRandomStartupGalleryImages(
        sourceImages,
        startupGalleryDisplayCount,
      );
      const probes = await Promise.all(selectedSources.map(preloadStartupImage));
      const failedImageCount = probes.filter((probe) => !probe.isReady).length;
      const displayImages = await Promise.all(
        selectedSources.map((source, index) => {
          const probe = probes[index];
          if (probe?.isReady) {
            return Promise.resolve(createStartupDisplayImage(source, probe));
          }

          return preloadStartupDisplayImage(startupArtImages[index % startupArtImages.length]);
        }),
      );

      const selection: StartupGallerySelection = {
        images: displayImages,
        sourceCount: gallerySources.length,
        usedFallback: gallerySources.length === 0 || failedImageCount > 0,
        failedImageCount,
      };

      startupGallerySelectionCache = selection;
      logRendererStartupEvent("startup-gallery:selection-ready", {
        sourceCount: selection.sourceCount,
        displayCount: selection.images.length,
        usedFallback: selection.usedFallback,
        failedImageCount: selection.failedImageCount,
      });
      return selection;
    })
    .catch(async () => {
      const sources = selectRandomStartupGalleryImages(
        startupArtImages,
        startupGalleryDisplayCount,
      );
      const images = await Promise.all(sources.map(preloadStartupDisplayImage));
      const selection: StartupGallerySelection = {
        images,
        sourceCount: 0,
        usedFallback: true,
        failedImageCount: 0,
      };

      startupGallerySelectionCache = selection;
      logRendererStartupEvent("startup-gallery:selection-ready", {
        sourceCount: 0,
        displayCount: selection.images.length,
        usedFallback: true,
        failedImageCount: 0,
      });
      return selection;
    });

  return startupGallerySelectionPromise;
}

function createStartupDisplayImage(
  source: string,
  probe: StartupImageProbeResult,
): StartupGalleryDisplayImage {
  return {
    height: probe.height,
    source,
    width: probe.width,
  };
}

function preloadStartupDisplayImage(source: string): Promise<StartupGalleryDisplayImage> {
  return preloadStartupImage(source).then((probe) => createStartupDisplayImage(source, probe));
}

function preloadStartupImage(source: string): Promise<StartupImageProbeResult> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    const resolveReady = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      resolve({
        height,
        isReady: true,
        width,
      });
    };

    image.onload = () => {
      if (typeof image.decode !== "function") {
        resolveReady();
        return;
      }

      void image.decode().then(
        () => resolveReady(),
        () => resolveReady(),
      );
    };
    image.onerror = () =>
      resolve({
        height: 0,
        isReady: false,
        width: 0,
      });
    image.src = source;
  });
}

function notifyStartupScreenReadyAfterPaint(): Promise<void> {
  if (startupScreenReadyPromise) {
    return startupScreenReadyPromise;
  }

  startupScreenReadyPromise = new Promise((resolve) => {
    let isComplete = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const fallbackTimer = window.setTimeout(finish, 80);

    function finish() {
      if (isComplete) {
        return;
      }

      isComplete = true;
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.suyanApi.notifyStartupScreenReady();
      resolve();
    }

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(finish);
    });
  });

  return startupScreenReadyPromise;
}

function DeferredViewFallback() {
  return (
    <div className="rounded-lg border border-border bg-panel px-5 py-6 text-sm text-muted shadow-elevated">
      正在加载视图...
    </div>
  );
}

function PromptDetailFallback() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/45 p-4 min-[920px]:p-8">
      <div className="w-full max-w-[1500px] rounded-lg border border-border bg-panel px-5 py-6 text-sm text-muted shadow-elevated">
        正在打开提示词详情...
      </div>
    </div>
  );
}

function AppTitleBar({ isSidebarOpen, overlayActive, onToggleSidebar }: AppTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    window.suyanApi.isWindowMaximized().then((result) => {
      if (result.ok && result.data) {
        setIsMaximized(result.data.maximized);
      }
    });
    unsubscribe = window.suyanApi.onWindowMaximizeChange((maximized) => {
      setIsMaximized(maximized);
    });
    return () => unsubscribe();
  }, []);

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-panel/95 pl-3 pr-2 shadow-sm backdrop-blur [-webkit-app-region:drag]">
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarToggleButton isOpen={isSidebarOpen} onClick={onToggleSidebar} />
        <AppLogoMark />
        <span className="truncate text-sm font-semibold text-foreground">素言</span>
      </div>
      <div className={`flex items-center gap-1 [-webkit-app-region:no-drag] ${overlayActive ? "hidden" : ""}`}>
        <button
          aria-label="最小化"
          className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/60 hover:text-foreground"
          type="button"
          onClick={() => void window.suyanApi.minimizeWindow()}
        >
          <Minus size={15} />
        </button>
        <button
          aria-label={isMaximized ? "向下还原" : "最大化"}
          className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/60 hover:text-foreground"
          type="button"
          onClick={() => void window.suyanApi.toggleMaximizeWindow()}
        >
          {isMaximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          aria-label="关闭"
          className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger hover:text-primary-foreground"
          type="button"
          onClick={() => void window.suyanApi.closeWindow()}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}

function SidebarToggleButton({ isOpen, onClick }: SidebarToggleButtonProps) {
  const label = isOpen ? "隐藏边栏" : "显示边栏";

  return (
    <button
      aria-label={label}
      className="icon-tooltip-button flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted shadow-none [-webkit-app-region:no-drag] transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      data-tooltip-align="start"
      data-tooltip-placement="below"
      type="button"
      onClick={onClick}
    >
      {isOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
      <span className="icon-tooltip-button__bubble" role="tooltip">
        {label}
      </span>
    </button>
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
  onOpenNsfwSettings: () => void;
  onOpenPerformanceSettings: () => void;
  onOpenProxySettings: () => void;
  onOpenStartupGallerySettings: () => void;
  onOpenCategoryLexicon: () => void;
  onOpenHome: () => void;
  onOpenLibraryRoots: () => void;
  onOpenManager: () => void;
  onOpenParameterLexicon: () => void;
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
  onOpenNsfwSettings,
  onOpenPerformanceSettings,
  onOpenProxySettings,
  onOpenStartupGallerySettings,
  onOpenCategoryLexicon,
  onOpenHome,
  onOpenLibraryRoots,
  onOpenManager,
  onOpenParameterLexicon,
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
      className="relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-panel/95"
      style={{ width }}
    >
      <nav className={`flex min-h-0 flex-1 flex-col gap-5 overflow-hidden pb-4 pt-5 ${isCompact ? "px-2" : "px-3"}`}>
        <div className="grid min-w-0 gap-1">
          <SidebarSectionLabel isCompact={isCompact}>素材</SidebarSectionLabel>
          <SidebarActionButton
            active={activeView === "home"}
            icon={<LayoutGrid size={17} />}
            isCompact={isCompact}
            label="素材浏览"
            onClick={onOpenHome}
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

        <div className="grid min-w-0 gap-1 border-t border-border/80 pt-4">
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
          <SidebarActionButton
            active={activeView === "parameterLexicon"}
            icon={<SlidersHorizontal size={17} />}
            isCompact={isCompact}
            label="参数词库"
            onClick={onOpenParameterLexicon}
          />
        </div>

        <div className="grid min-w-0 gap-1 border-t border-border/80 pt-4">
          <SidebarSectionLabel isCompact={isCompact}>资源</SidebarSectionLabel>
          <SidebarActionButton
            active={activeView === "promptSites"}
            icon={<Globe2 size={17} />}
            isCompact={isCompact}
            label="资源推荐"
            onClick={onOpenPromptSites}
          />
        </div>

        <div className="grid min-w-0 gap-1 border-t border-border/80 pt-4">
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
            active={activeView === "proxySettings"}
            icon={<Wifi size={17} />}
            isCompact={isCompact}
            label="网络代理"
            onClick={onOpenProxySettings}
          />
          <SidebarActionButton
            active={activeView === "performanceSettings"}
            icon={<Gauge size={17} />}
            isCompact={isCompact}
            label="启动加速"
            onClick={onOpenPerformanceSettings}
          />
          <SidebarActionButton
            active={activeView === "startupGallerySettings"}
            icon={<ImageIcon size={17} />}
            isCompact={isCompact}
            label="启动图库"
            onClick={onOpenStartupGallerySettings}
          />
          <SidebarActionButton
            icon={<ScrollText size={17} />}
            isCompact={isCompact}
            label="日志导出"
            onClick={onOpenLogExport}
          />
        </div>

        <div className="mt-auto grid gap-2 border-t border-border/80 pt-4">
          <div className={`grid gap-2 ${isCompact ? "grid-cols-1" : "grid-cols-2"}`}>
            <SidebarThemeButton
              isBusy={isBusy}
              isCompact={isCompact}
            />
            <SidebarActionButton
              icon={<Info size={17} />}
              isCompact={isCompact}
              label="关于"
              onClick={onOpenAbout}
            />
          </div>
        </div>
      </nav>

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

function SearchHeroPanel({
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
}

function getNextThemeMode(value: ThemeMode): ThemeMode {
  const currentIndex = themeModeOptions.findIndex((option) => option.value === value);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % themeModeOptions.length;

  return themeModeOptions[nextIndex].value;
}

function clampMasonryColumnCount(count: number): number {
  return Math.min(maxMasonryColumnCount, Math.max(minMasonryColumnCount, Math.round(count)));
}

function migrateTileWidthToColumnCount(tileWidth: number): number {
  if (tileWidth >= minMasonryColumnCount && tileWidth <= maxMasonryColumnCount) {
    return clampMasonryColumnCount(tileWidth);
  }

  if (tileWidth <= 150) return 10;
  if (tileWidth <= 220) return 8;
  if (tileWidth <= 300) return 6;
  if (tileWidth <= 400) return 4;
  if (tileWidth <= 600) return 3;
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

type AboutDialogProps = {
  onClose: () => void;
};

function AboutDialog({ onClose }: AboutDialogProps) {
  const [isReleaseNotesVisible, setIsReleaseNotesVisible] = useState(true);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<AppUpdateCheckData | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const displayedVersion = updateCheckResult?.currentVersion ?? appVersion;
  const updateStatusClassName =
    updateCheckResult?.status === "update_available"
      ? "text-primary"
      : updateCheckResult?.status === "network_error"
        ? "text-danger"
        : "text-muted";
  const updatePageLabel = updateCheckResult?.status === "update_available" ? "前往下载" : "打开发布页";

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates) {
      return;
    }

    setIsCheckingUpdates(true);
    setUpdateStatus("正在连接 GitHub Releases...");

    try {
      const result = await window.suyanApi.checkForUpdates();
      if (result.ok) {
        setUpdateCheckResult(result.data);
        setUpdateStatus(result.data.message);
      } else {
        setUpdateCheckResult(null);
        setUpdateStatus(result.error.message);
      }
    } catch {
      setUpdateCheckResult(null);
      setUpdateStatus("检查更新失败，请稍后重试。");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleOpenUpdatePage = async () => {
    const result = await window.suyanApi.openExternalUrl(updateCheckResult?.releaseUrl ?? suyanGithubReleasesUrl);
    if (!result.ok) {
      setUpdateStatus(result.error.message);
    }
  };

  return (
    <AppDialog
      overlayClassName="z-40 px-6 py-8"
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="about-dialog-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="about-dialog-title">
            关于素言
          </h2>
          <p className="mt-1 text-sm text-muted">本地提示词与图像素材管理工具</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 overflow-y-auto px-5 py-4">
        <section className="grid gap-2 rounded-xl border border-border bg-background p-4">
          <div className="grid gap-2 text-sm">
            <InfoRow label="软件名称" value="素言" />
            <InfoRow label="版本" value={displayedVersion} />
            <InfoRow label="软件描述" value="本地 AI 提示词与图像素材管理工具" />
          </div>
        </section>

        <section className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">软件功能</h3>
            <button
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              type="button"
              onClick={() => setIsReleaseNotesVisible((current) => !current)}
            >
              {isReleaseNotesVisible ? "收起" : "查看"}
            </button>
          </div>
          {isReleaseNotesVisible ? (
            <ul className="grid gap-2 text-sm leading-6 text-muted">
              <li>本地管理提示词、图片与视频效果图。</li>
              <li>支持文件、剪贴板、Word 文档与网页导入。</li>
              <li>分类、标签、参数词库和 NSFW 分级整理。</li>
              <li>AI 分析、优化、翻译与图片反推提示词。</li>
              <li>批量压缩、重复扫描、启动图库和日志反馈。</li>
            </ul>
          ) : null}
        </section>

        <section className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">检查更新</h3>
          <p className="text-sm leading-6 text-muted">
            从 GitHub Releases 获取最新版本：guliacer/SuYan。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="w-fit"
              disabled={isCheckingUpdates}
              icon={<RefreshCw className={isCheckingUpdates ? "animate-spin" : ""} size={16} />}
              onClick={() => {
                void handleCheckUpdates();
              }}
            >
              {isCheckingUpdates ? "检查中..." : "检查更新"}
            </Button>
            <Button
              className="w-fit"
              icon={<ExternalLink size={16} />}
              onClick={() => {
                void handleOpenUpdatePage();
              }}
              variant={updateCheckResult?.status === "update_available" ? "primary" : "secondary"}
            >
              {updatePageLabel}
            </Button>
          </div>
          {updateStatus ? <p className={`text-sm leading-6 ${updateStatusClassName}`}>{updateStatus}</p> : null}
        </section>
      </div>
    </AppDialog>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  );
}

type TagEditorDialogProps = {
  drafts: TagEditorDraft[];
  isBusy: boolean;
  promptLexicons: PromptLexiconSettings | null;
  onClose: () => void;
  onExportLexicon: (kind: PromptLexiconKind, items: PromptLexiconEntry[]) => Promise<void>;
  onImportLexicon: (kind: PromptLexiconKind) => Promise<PromptLexiconEntry[] | null>;
  onImportLexiconImage: () => Promise<string | null>;
  onLabelChange: (draftId: string, label: string) => void;
  onMove: (draftId: string, direction: -1 | 1) => void;
  onRemove: (draftId: string) => void;
  onSave: (promptLexicons: PromptLexiconSettings) => void;
};

function TagEditorDialog({
  drafts,
  isBusy,
  promptLexicons,
  onClose,
  onExportLexicon,
  onImportLexicon,
  onImportLexiconImage,
  onLabelChange,
  onMove,
  onRemove,
  onSave,
}: TagEditorDialogProps) {
  const [initialPromptLexicons] = useState(() => createPromptLexiconDrafts(promptLexicons, drafts));
  const [parameterDrafts, setParameterDrafts] = useState(initialPromptLexicons.parameters);
  const [categoryDrafts, setCategoryDrafts] = useState(initialPromptLexicons.categories);
  const [tagImageDrafts, setTagImageDrafts] = useState(initialPromptLexicons.tags);
  const [parameterQuery, setParameterQuery] = useState("");
  const [selectedParameterSource, setSelectedParameterSource] = useState(allParameterSourcesValue);
  const [selectedParameterGroupPath, setSelectedParameterGroupPath] = useState(allParameterGroupsValue);
  const [selectedCategoryMenuPath, setSelectedCategoryMenuPath] = useState(allCategoryGroupsValue);
  const [selectedTagMenuPath, setSelectedTagMenuPath] = useState(allTagGroupsValue);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [tagImageQuery, setTagImageQuery] = useState("");
  const [selectedParameters, setSelectedParameters] = useState<Set<string>>(() => new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set());
  const [selectedTagImages, setSelectedTagImages] = useState<Set<string>>(() => new Set());

  const parameterSourceOptions = useMemo(
    () => buildParameterSourceOptions(parameterDrafts),
    [parameterDrafts],
  );
  const sourceFilteredParameters = useMemo(
    () => parameterDrafts.filter((entry) => matchesParameterSource(entry, selectedParameterSource)),
    [parameterDrafts, selectedParameterSource],
  );
  const filteredParameters = useMemo(
    () =>
      sourceFilteredParameters.filter(
        (entry) => matchesParameterGroup(entry, selectedParameterGroupPath) && matchesLexiconQuery(entry, parameterQuery),
      ),
    [parameterQuery, selectedParameterGroupPath, sourceFilteredParameters],
  );
  const filteredCategories = useMemo(
    () =>
      categoryDrafts.filter(
        (entry) =>
          matchesImageLexiconMenu(entry, selectedCategoryMenuPath, categoryDrafts, "category") &&
          matchesLexiconQuery(entry, categoryQuery),
      ),
    [categoryDrafts, categoryQuery, selectedCategoryMenuPath],
  );
  const filteredTagImages = useMemo(
    () =>
      tagImageDrafts.filter(
        (entry) =>
          matchesImageLexiconMenu(entry, selectedTagMenuPath, tagImageDrafts, "tag") &&
          matchesLexiconQuery(entry, tagImageQuery),
      ),
    [tagImageDrafts, selectedTagMenuPath, tagImageQuery],
  );
  const parameterMenuValidation = useMemo(
    () => validatePromptParameterMenuEntries(parameterDrafts),
    [parameterDrafts],
  );

  useEffect(() => {
    if (!parameterSourceOptions.some((option) => option.value === selectedParameterSource)) {
      setSelectedParameterSource(allParameterSourcesValue);
    }
  }, [parameterSourceOptions, selectedParameterSource]);

  useEffect(() => {
    if (
      selectedParameterGroupPath !== allParameterGroupsValue &&
      !sourceFilteredParameters.some(
        (entry) => isDisplayableParameterEntry(entry) && matchesParameterGroup(entry, selectedParameterGroupPath),
      )
    ) {
      setSelectedParameterGroupPath(allParameterGroupsValue);
    }
  }, [selectedParameterGroupPath, sourceFilteredParameters]);

  useEffect(() => {
    if (
      selectedCategoryMenuPath !== allCategoryGroupsValue &&
      !categoryDrafts.some((entry) => matchesImageLexiconMenu(entry, selectedCategoryMenuPath, categoryDrafts, "category"))
    ) {
      setSelectedCategoryMenuPath(allCategoryGroupsValue);
    }
  }, [categoryDrafts, selectedCategoryMenuPath]);

  useEffect(() => {
    if (
      selectedTagMenuPath !== allTagGroupsValue &&
      !tagImageDrafts.some((entry) => matchesImageLexiconMenu(entry, selectedTagMenuPath, tagImageDrafts, "tag"))
    ) {
      setSelectedTagMenuPath(allTagGroupsValue);
    }
  }, [selectedTagMenuPath, tagImageDrafts]);

  async function handleImportParameters() {
    const importedItems = await onImportLexicon("parameters");

    if (!importedItems) {
      return;
    }

    setParameterDrafts(
      normalizeParameterLexiconEntries(migratePromptParameterLexiconGroups(importedItems.filter(isPromptParameterLexiconEntry))),
    );
    setSelectedParameters(new Set());
    setSelectedParameterGroupPath(allParameterGroupsValue);
  }

  function handleMigrateParameterMenus() {
    setParameterDrafts((currentDrafts) =>
      normalizeParameterLexiconEntries(migratePromptParameterLexiconGroups(currentDrafts)),
    );
    setSelectedParameters(new Set());
    setSelectedParameterGroupPath(allParameterGroupsValue);
  }

  async function handleImportCategories() {
    const importedItems = await onImportLexicon("categories");

    if (!importedItems) {
      return;
    }

    setCategoryDrafts(importedItems.filter(isPromptImageLexiconEntry));
    setSelectedCategories(new Set());
    setSelectedCategoryMenuPath(allCategoryGroupsValue);
  }

  async function handleImportTagImages() {
    const importedItems = await onImportLexicon("tags");

    if (!importedItems) {
      return;
    }

    setTagImageDrafts(normalizeTagImageLexiconEntries(importedItems.filter(isPromptImageLexiconEntry)));
    setSelectedTagImages(new Set());
    setSelectedTagMenuPath(allTagGroupsValue);
  }

  async function handleUploadImage(kind: "categories" | "tags", entryId: string) {
    const imageFileName = await onImportLexiconImage();

    if (!imageFileName) {
      return;
    }

    if (kind === "categories") {
      setCategoryDrafts((currentDrafts) =>
        currentDrafts.map((entry) => (entry.id === entryId ? { ...entry, imageFileName } : entry)),
      );
      return;
    }

    setTagImageDrafts((currentDrafts) =>
      currentDrafts.map((entry) => (entry.id === entryId ? { ...entry, imageFileName } : entry)),
    );
  }

  function handleSaveAll() {
    if (!parameterMenuValidation.isValid) {
      return;
    }

    onSave({
      parameters: normalizeParameterLexiconEntries(parameterDrafts),
      categories: normalizeImageLexiconEntries(categoryDrafts),
      tags: normalizeTagImageLexiconEntries(tagImageDrafts),
    });
  }

  return (
    <AppDialog
      overlayClassName="z-40 px-6 py-8"
      panelClassName="flex max-h-full w-full max-w-6xl flex-col"
      titleId="tag-editor-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold" id="tag-editor-title">
            编辑词库管理
          </h2>
          <p className="mt-1 text-sm text-muted">维护热门标签、AI 参数、分类图像和标签图像。</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid gap-5">
          <section className="rounded-lg border border-border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md border border-border bg-panel text-primary">
                  <Tags size={17} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">热门标签</h3>
                  <p className="text-xs text-muted">{drafts.length} 个标签，可调整排序和名称</p>
                </div>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-3">
              {drafts.length > 0 ? (
                <div className="grid gap-2">
                  {drafts.map((draft, index) => (
                    <div
                      className="grid min-h-11 grid-cols-[76px_minmax(0,1fr)_40px] items-center gap-2 rounded-md border border-border bg-panel px-2 py-2"
                      key={draft.id}
                    >
                      <div className="flex items-center gap-1">
                        <IconButton
                          ariaLabel="上移标签"
                          disabled={index === 0 || isBusy}
                          icon={<ArrowUp size={15} />}
                          onClick={() => onMove(draft.id, -1)}
                        />
                        <IconButton
                          ariaLabel="下移标签"
                          disabled={index === drafts.length - 1 || isBusy}
                          icon={<ArrowDown size={15} />}
                          onClick={() => onMove(draft.id, 1)}
                        />
                      </div>
                      <input
                        aria-label="标签名称"
                        className="h-9 min-w-0 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={draft.label}
                        onChange={(event) => onLabelChange(draft.id, event.target.value)}
                      />
                      <IconButton
                        ariaLabel="删除标签"
                        disabled={isBusy}
                        icon={<Trash2 size={15} />}
                        onClick={() => onRemove(draft.id)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <LexiconEmptyState text="没有可编辑的标签" />
              )}
            </div>
          </section>

          <LexiconSection
            count={countDisplayableParameterEntries(parameterDrafts)}
            description="管理 AI 分析使用的参数、变量和值。"
            icon={<BookOpen size={17} />}
            isBusy={isBusy}
            query={parameterQuery}
            searchPlaceholder="搜索参数名称、变量或分组"
            selectedCount={countSelectedEntries(selectedParameters, parameterDrafts.filter(isDisplayableParameterEntry))}
            toolbarLeadingAction={
              <Button
                icon={<RefreshCw size={15} />}
                disabled={isBusy}
                onClick={handleMigrateParameterMenus}
              >
                整理分组
              </Button>
            }
            title="AI 分析参数词库"
            onAdd={() =>
              setParameterDrafts((currentDrafts) => [
                createBlankParameterEntry(
                  getParameterSourceDraft(parameterSourceOptions, selectedParameterSource),
                  getParameterGroupDraft(selectedParameterGroupPath),
                  getParameterItemDraft(selectedParameterGroupPath, currentDrafts),
                ),
                ...currentDrafts,
              ])
            }
            onDeleteSelected={() => {
              setParameterDrafts((currentDrafts) => currentDrafts.filter((entry) => !selectedParameters.has(entry.id)));
              setSelectedParameters(new Set());
            }}
            onExport={() => void onExportLexicon("parameters", parameterDrafts)}
            onImport={() => void handleImportParameters()}
            onQueryChange={setParameterQuery}
          >
            <ParameterMenuValidationNotice validation={parameterMenuValidation} />
            <ParameterLexiconExplorer
              entries={sourceFilteredParameters}
              filteredEntries={filteredParameters}
              isBusy={isBusy}
              selectedEntries={selectedParameters}
              selectedGroupPath={selectedParameterGroupPath}
              onAddEntry={(group, draft, value) =>
                setParameterDrafts((currentDrafts) => [
                  createBlankParameterEntry(
                    getParameterSourceDraft(parameterSourceOptions, selectedParameterSource),
                    group,
                    draft,
                    value,
                  ),
                  ...currentDrafts,
                ])
              }
              onChangeEntry={(entryId, patch) =>
                setParameterDrafts((currentDrafts) =>
                  currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, ...patch } : draft)),
                )
              }
              onChangeSection={(entryIds, patch) =>
                setParameterDrafts((currentDrafts) => {
                  const entryIdSet = new Set(entryIds);

                  return currentDrafts.map((draft) =>
                    entryIdSet.has(draft.id) ? { ...draft, ...patch } : draft,
                  );
                })
              }
              onRemoveEntry={(entryId) =>
                setParameterDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== entryId))
              }
              onRenameGroup={(oldPath, newLabel) =>
                setParameterDrafts((currentDrafts) => renameParameterGroupInDrafts(currentDrafts, oldPath, newLabel))
              }
              onSelectEntry={(entryId) => setSelectedParameters((current) => toggleEntrySelection(current, entryId))}
              onSelectGroup={setSelectedParameterGroupPath}
              onSelectAll={() => setSelectedParameters(new Set(filteredParameters.map((entry) => entry.id)))}
              onSelectInvert={() =>
                setSelectedParameters((current) => {
                  const next = new Set<string>();
                  for (const entry of filteredParameters) {
                    if (!current.has(entry.id)) {
                      next.add(entry.id);
                    }
                  }
                  return next;
                })
              }
              onSelectNone={() => setSelectedParameters(new Set())}
              onRemoveSelected={() => {
                setParameterDrafts((current) => current.filter((entry) => !selectedParameters.has(entry.id)));
                setSelectedParameters(new Set());
              }}
            />
          </LexiconSection>

          <LexiconSection
            count={categoryDrafts.length}
            description="维护分类图像、说明、分组和父级关系。"
            icon={<FolderTree size={17} />}
            isBusy={isBusy}
            query={categoryQuery}
            searchPlaceholder="搜索分类、描述、分组"
            selectedCount={countSelectedEntries(selectedCategories, categoryDrafts)}
            title="分类词库"
            onAdd={() =>
              setCategoryDrafts((currentDrafts) => [
                createBlankImageEntry("category", getImageEntryDraft("category", selectedCategoryMenuPath, currentDrafts)),
                ...currentDrafts,
              ])
            }
            onClearSelectedImages={() =>
              setCategoryDrafts((currentDrafts) =>
                currentDrafts.map((entry) =>
                  selectedCategories.has(entry.id) ? { ...entry, imageFileName: null } : entry,
                ),
              )
            }
            onDeleteSelected={() => {
              setCategoryDrafts((currentDrafts) =>
                currentDrafts
                  .filter((entry) => !selectedCategories.has(entry.id))
                  .map((entry) => (entry.parentId && selectedCategories.has(entry.parentId) ? { ...entry, parentId: null } : entry)),
              );
              setSelectedCategories(new Set());
            }}
            onExport={() => void onExportLexicon("categories", categoryDrafts)}
            onImport={() => void handleImportCategories()}
            onQueryChange={setCategoryQuery}
          >
            <ImageLexiconExplorer
              entries={categoryDrafts}
              filteredEntries={filteredCategories}
              isBusy={isBusy}
              kind="category"
              selectedEntries={selectedCategories}
              selectedMenuPath={selectedCategoryMenuPath}
              showParentSelect
              onChangeEntry={(entryId, patch) =>
                setCategoryDrafts((currentDrafts) =>
                  currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, ...patch } : draft)),
                )
              }
              onClearImage={(entryId) =>
                setCategoryDrafts((currentDrafts) =>
                  currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, imageFileName: null } : draft)),
                )
              }
              onRemoveEntry={(entryId) =>
                setCategoryDrafts((currentDrafts) =>
                  currentDrafts
                    .filter((draft) => draft.id !== entryId)
                    .map((draft) => (draft.parentId === entryId ? { ...draft, parentId: null } : draft)),
                )
              }
              onRenameGroup={(oldPath, newLabel) =>
                setCategoryDrafts((currentDrafts) => renameImageGroupInDrafts(currentDrafts, oldPath, newLabel))
              }
              onRenameItem={(groupPath, itemKey, newLabel) =>
                setCategoryDrafts((currentDrafts) => renameImageItemInDrafts(currentDrafts, groupPath, itemKey, newLabel))
              }
              onSelectEntry={(entryId) => setSelectedCategories((current) => toggleEntrySelection(current, entryId))}
              onSelectMenu={setSelectedCategoryMenuPath}
              onUploadImage={(entryId) => void handleUploadImage("categories", entryId)}
              onSelectAll={() => setSelectedCategories(new Set(filteredCategories.map((entry) => entry.id)))}
              onSelectInvert={() =>
                setSelectedCategories((current) => {
                  const next = new Set<string>();
                  for (const entry of filteredCategories) {
                    if (!current.has(entry.id)) {
                      next.add(entry.id);
                    }
                  }
                  return next;
                })
              }
              onSelectNone={() => setSelectedCategories(new Set())}
              onRemoveSelected={() => {
                setCategoryDrafts((current) =>
                  current
                    .filter((entry) => !selectedCategories.has(entry.id))
                    .map((entry) =>
                      entry.parentId && selectedCategories.has(entry.parentId) ? { ...entry, parentId: null } : entry,
                    ),
                );
                setSelectedCategories(new Set());
              }}
            />
          </LexiconSection>

          <LexiconSection
            count={tagImageDrafts.length}
            description="维护标签图像、说明和分组。"
            icon={<ImageIcon size={17} />}
            isBusy={isBusy}
            query={tagImageQuery}
            searchPlaceholder="搜索标签、描述、分组"
            selectedCount={countSelectedEntries(selectedTagImages, tagImageDrafts)}
            title="标签词库"
            onAdd={() =>
              setTagImageDrafts((currentDrafts) => [
                createBlankImageEntry("tag", getImageEntryDraft("tag", selectedTagMenuPath, currentDrafts)),
                ...currentDrafts,
              ])
            }
            onClearSelectedImages={() =>
              setTagImageDrafts((currentDrafts) =>
                currentDrafts.map((entry) =>
                  selectedTagImages.has(entry.id) ? { ...entry, imageFileName: null } : entry,
                ),
              )
            }
            onDeleteSelected={() => {
              setTagImageDrafts((currentDrafts) => currentDrafts.filter((entry) => !selectedTagImages.has(entry.id)));
              setSelectedTagImages(new Set());
            }}
            onExport={() => void onExportLexicon("tags", tagImageDrafts)}
            onImport={() => void handleImportTagImages()}
            onQueryChange={setTagImageQuery}
          >
            <ImageLexiconExplorer
              entries={tagImageDrafts}
              filteredEntries={filteredTagImages}
              isBusy={isBusy}
              kind="tag"
              selectedEntries={selectedTagImages}
              selectedMenuPath={selectedTagMenuPath}
              onChangeEntry={(entryId, patch) =>
                setTagImageDrafts((currentDrafts) =>
                  currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, ...patch } : draft)),
                )
              }
              onClearImage={(entryId) =>
                setTagImageDrafts((currentDrafts) =>
                  currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, imageFileName: null } : draft)),
                )
              }
              onRemoveEntry={(entryId) =>
                setTagImageDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== entryId))
              }
              onRenameGroup={(oldPath, newLabel) =>
                setTagImageDrafts((currentDrafts) => renameImageGroupInDrafts(currentDrafts, oldPath, newLabel))
              }
              onRenameItem={(groupPath, itemKey, newLabel) =>
                setTagImageDrafts((currentDrafts) => renameImageItemInDrafts(currentDrafts, groupPath, itemKey, newLabel))
              }
              onSelectEntry={(entryId) => setSelectedTagImages((current) => toggleEntrySelection(current, entryId))}
              onSelectMenu={setSelectedTagMenuPath}
              onUploadImage={(entryId) => void handleUploadImage("tags", entryId)}
              onSelectAll={() => setSelectedTagImages(new Set(filteredTagImages.map((entry) => entry.id)))}
              onSelectInvert={() =>
                setSelectedTagImages((current) => {
                  const next = new Set<string>();
                  for (const entry of filteredTagImages) {
                    if (!current.has(entry.id)) {
                      next.add(entry.id);
                    }
                  }
                  return next;
                })
              }
              onSelectNone={() => setSelectedTagImages(new Set())}
              onRemoveSelected={() => {
                setTagImageDrafts((current) => current.filter((entry) => !selectedTagImages.has(entry.id)));
                setSelectedTagImages(new Set());
              }}
            />
          </LexiconSection>
        </div>
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button icon={<X size={16} />} variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          icon={<Check size={16} />}
          variant="primary"
          disabled={isBusy || !parameterMenuValidation.isValid}
          onClick={handleSaveAll}
        >
          保存标签与词库
        </Button>
      </footer>
    </AppDialog>
  );
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
  onAnalyzePrompt: (payload: AiAnalyzePromptPayload) => Promise<{
    analysis: {
      primaryCategory: string;
      suggestedCategories: string[];
      suggestedTags: string[];
    };
  }>;
  onCopyPrompt: (item: PromptCardData) => void;
  onExportLexicon: (kind: PromptLexiconKind, items: PromptLexiconEntry[]) => Promise<void>;
  onImportLexicon: (kind: PromptLexiconKind) => Promise<PromptLexiconEntry[] | null>;
  onImportLexiconImage: () => Promise<string | null>;
  onOpenDetail: (itemId: string) => void;
  onDeleteItems: (itemIds: string[], deleteImages: boolean) => Promise<void>;
  onSaveItem: (itemId: string, patch: Partial<LibraryItem>) => Promise<void>;
  onSavePromptLexicons: (promptLexicons: PromptLexiconSettings) => Promise<boolean>;
};

function PromptLexiconWorkspace({
  kind,
  blurNsfwImages,
  hideScrollTopButton = false,
  isBusy,
  likedImageIds,
  popularTags,
  promptGroups,
  promptLexicons,
  onAnalyzePrompt,
  onCopyPrompt,
  onExportLexicon,
  onImportLexicon,
  onImportLexiconImage,
  onOpenDetail,
  onDeleteItems,
  onSaveItem,
  onSavePromptLexicons,
}: PromptLexiconWorkspaceProps) {
  const [parameterDrafts, setParameterDrafts] = useState(() =>
    createPromptParameterDrafts(promptLexicons, popularTags, kind === "parameters"),
  );
  const [categoryDrafts, setCategoryDrafts] = useState(() =>
    createPromptCategoryDrafts(promptLexicons, popularTags, kind === "categories"),
  );
  const [tagImageDrafts, setTagImageDrafts] = useState(() =>
    createPromptTagImageDrafts(promptLexicons, popularTags, kind === "tags"),
  );
  const [parameterQuery, setParameterQuery] = useState("");
  const [selectedParameterSource, setSelectedParameterSource] = useState(allParameterSourcesValue);
  const [selectedParameterGroupPath, setSelectedParameterGroupPath] = useState(allParameterGroupsValue);
  const [selectedCategoryMenuPath, setSelectedCategoryMenuPath] = useState(allCategoryGroupsValue);
  const [selectedTagMenuPath, setSelectedTagMenuPath] = useState(allTagGroupsValue);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [tagImageQuery, setTagImageQuery] = useState("");
  const [selectedParameters, setSelectedParameters] = useState<Set<string>>(() => new Set());
  const [selectedCategoryPromptGroups, setSelectedCategoryPromptGroups] = useState<Set<string>>(() => new Set());
  const [selectedTagPromptGroups, setSelectedTagPromptGroups] = useState<Set<string>>(() => new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [categoryAnalysisProgress, setCategoryAnalysisProgress] = useState<CategoryAnalysisProgress | null>(null);
  const [tagAnalysisProgress, setTagAnalysisProgress] = useState<CategoryAnalysisProgress | null>(null);
  const [isTagLexiconMenuReady, setIsTagLexiconMenuReady] = useState(() => kind !== "tags");
  const categoryAnalysisCancelRef = useRef(false);
  const tagAnalysisCancelRef = useRef(false);
  const autoSaveVersionRef = useRef(0);
  const deferredCategoryQuery = useDeferredValue(categoryQuery);
  const deferredSelectedCategoryMenuPath = useDeferredValue(selectedCategoryMenuPath);
  const isParameterWorkspace = kind === "parameters";
  const isCategoryWorkspace = kind === "categories";
  const isTagWorkspace = kind === "tags";

  const meta = getPromptLexiconWorkspaceMeta(kind);
  const parameterSourceOptions = useMemo(
    () => (isParameterWorkspace ? buildParameterSourceOptions(parameterDrafts) : []),
    [isParameterWorkspace, parameterDrafts],
  );
  const sourceFilteredParameters = useMemo(
    () =>
      isParameterWorkspace
        ? parameterDrafts.filter((entry) => matchesParameterSource(entry, selectedParameterSource))
        : [],
    [isParameterWorkspace, parameterDrafts, selectedParameterSource],
  );
  const filteredParameters = useMemo(
    () =>
      isParameterWorkspace
        ? sourceFilteredParameters.filter(
            (entry) =>
              matchesParameterGroup(entry, selectedParameterGroupPath) && matchesLexiconQuery(entry, parameterQuery),
          )
        : [],
    [isParameterWorkspace, parameterQuery, selectedParameterGroupPath, sourceFilteredParameters],
  );
  const categoryPromptGroups = useMemo(
    () => (isCategoryWorkspace || isTagWorkspace ? promptGroups : []),
    [isCategoryWorkspace, isTagWorkspace, promptGroups],
  );
  const categoryLabelsCache = useMemo(() => {
    const cache = new Map<string, string[]>();
    for (const group of categoryPromptGroups) {
      cache.set(group.id, getPromptGroupCategoryLabels(group));
    }
    return cache;
  }, [categoryPromptGroups]);
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
  const categoryMenuEntries = useMemo(
    () => (isCategoryWorkspace ? mergeCategoryLexiconEntriesWithPromptGroups(categoryDrafts, categoryPromptGroups, categoryLabelsCache) : []),
    [categoryDrafts, categoryLabelsCache, categoryPromptGroups, isCategoryWorkspace],
  );
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
  const analyzableTagPromptGroupCount = useMemo(
    () => (isTagWorkspace ? visibleTagPromptGroups.filter(shouldAnalyzePromptGroupTags).length : 0),
    [isTagWorkspace, visibleTagPromptGroups],
  );
  const parameterMenuValidation = useMemo(
    () => (isParameterWorkspace ? validatePromptParameterMenuEntries(parameterDrafts) : validParameterMenuValidation),
    [isParameterWorkspace, parameterDrafts],
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
    if (!isParameterWorkspace) {
      return;
    }

    if (!parameterSourceOptions.some((option) => option.value === selectedParameterSource)) {
      setSelectedParameterSource(allParameterSourcesValue);
    }
  }, [isParameterWorkspace, parameterSourceOptions, selectedParameterSource]);

  useEffect(() => {
    if (!isParameterWorkspace) {
      return;
    }

    if (
      selectedParameterGroupPath !== allParameterGroupsValue &&
      !sourceFilteredParameters.some(
        (entry) => isDisplayableParameterEntry(entry) && matchesParameterGroup(entry, selectedParameterGroupPath),
      )
    ) {
      setSelectedParameterGroupPath(allParameterGroupsValue);
    }
  }, [isParameterWorkspace, selectedParameterGroupPath, sourceFilteredParameters]);

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

  function updateParameterDrafts(updater: React.SetStateAction<PromptParameterLexiconEntry[]>) {
    setIsDirty(true);
    setParameterDrafts(updater);
  }

  function updateCategoryDrafts(updater: React.SetStateAction<PromptImageLexiconEntry[]>) {
    setIsDirty(true);
    setCategoryDrafts(updater);
  }

  function updateTagImageDrafts(updater: React.SetStateAction<PromptImageLexiconEntry[]>) {
    setIsDirty(true);
    setTagImageDrafts(updater);
  }

  useEffect(() => {
    if (!isDirty || !parameterMenuValidation.isValid) {
      return;
    }

    const saveVersion = autoSaveVersionRef.current + 1;
    autoSaveVersionRef.current = saveVersion;
    const timer = window.setTimeout(() => {
      void onSavePromptLexicons({
        parameters: normalizeParameterLexiconEntries(parameterDrafts),
        categories: normalizeImageLexiconEntries(categoryDrafts),
        tags: normalizeTagImageLexiconEntries(tagImageDrafts),
      }).then((saved) => {
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
    isDirty,
    onSavePromptLexicons,
    parameterDrafts,
    parameterMenuValidation.isValid,
    tagImageDrafts,
  ]);

  async function handleImportParameters() {
    const importedItems = await onImportLexicon("parameters");

    if (!importedItems) {
      return;
    }

    updateParameterDrafts(
      normalizeParameterLexiconEntries(migratePromptParameterLexiconGroups(importedItems.filter(isPromptParameterLexiconEntry))),
    );
    setSelectedParameters(new Set());
    setSelectedParameterGroupPath(allParameterGroupsValue);
  }

  function handleMigrateParameterMenus() {
    updateParameterDrafts((currentDrafts) =>
      normalizeParameterLexiconEntries(migratePromptParameterLexiconGroups(currentDrafts)),
    );
    setSelectedParameters(new Set());
    setSelectedParameterGroupPath(allParameterGroupsValue);
  }

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

  async function handleAnalyzeVisibleCategoryPromptGroups() {
    if (categoryAnalysisProgress?.status === "running" || visibleCategoryPromptGroups.length === 0) {
      return;
    }

    categoryAnalysisCancelRef.current = false;
    setCategoryAnalysisProgress({
      analyzed: 0,
      currentTitle: "",
      failed: 0,
      message: `准备分析 ${visibleCategoryPromptGroups.length} 个提示词组。`,
      processed: 0,
      skipped: 0,
      status: "running",
      total: visibleCategoryPromptGroups.length,
    });

    let analyzed = 0;
    let failed = 0;
    let processed = 0;
    let skipped = 0;
    let consecutiveFailures = 0;

    for (const group of visibleCategoryPromptGroups) {
      if (categoryAnalysisCancelRef.current) {
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `已取消，处理 ${processed}/${visibleCategoryPromptGroups.length} 个提示词组。`,
          processed,
          skipped,
          status: "canceled",
          total: visibleCategoryPromptGroups.length,
        });
        return;
      }

      const item = group.primaryItem;

      if (!shouldAnalyzePromptGroupCategory(group)) {
        skipped += 1;
        processed += 1;
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: item.title || "未命名提示词",
          failed,
          message: "已有足够分类，已跳过。",
          processed,
          skipped,
          status: "running",
          total: visibleCategoryPromptGroups.length,
        });
        await waitForInteractionFrame();
        continue;
      }

      setCategoryAnalysisProgress({
        analyzed,
        currentTitle: item.title || "未命名提示词",
        failed,
        message: "正在进行 AI 分类分析...",
        processed,
        skipped,
        status: "running",
        total: visibleCategoryPromptGroups.length,
      });
      await waitForInteractionFrame();

      try {
        const result = await onAnalyzePrompt({
          target: "image-category",
          title: "",
          imageFileName: item.imageFileName,
          prompt: "",
          negativePrompt: "",
          tags: [],
          category: item.category,
          knownCategories: photographyCategoryLabels,
          runInBackground: true,
        });

        if (categoryAnalysisCancelRef.current) {
          setCategoryAnalysisProgress({
            analyzed,
            currentTitle: "",
            failed,
            message: `已取消，处理 ${processed}/${visibleCategoryPromptGroups.length} 个提示词组。`,
            processed,
            skipped,
            status: "canceled",
            total: visibleCategoryPromptGroups.length,
          });
          return;
        }

        const patch = buildPromptGroupCategoryPatch(item, result.analysis);

        if (patch) {
          await onSaveItem(item.id, patch);
          await waitForInteractionFrame();
          analyzed += 1;
          consecutiveFailures = 0;
        } else {
          failed += 1;
          consecutiveFailures += 1;
        }
      } catch {
        failed += 1;
        consecutiveFailures += 1;
      }

      processed += 1;

      if (consecutiveFailures >= 3) {
        setCategoryAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `连续 ${consecutiveFailures} 组无有效分类，已停止。请检查或更换模型。`,
          processed,
          skipped,
          status: "completed",
          total: visibleCategoryPromptGroups.length,
        });
        return;
      }

      setCategoryAnalysisProgress({
        analyzed,
        currentTitle: item.title || "未命名提示词",
        failed,
        message: "已完成当前提示词组。",
        processed,
        skipped,
        status: "running",
        total: visibleCategoryPromptGroups.length,
      });
      await waitForInteractionFrame();
    }

    setCategoryAnalysisProgress({
      analyzed,
      currentTitle: "",
      failed,
      message: `分析完成：更新 ${analyzed} 个，跳过 ${skipped} 个，失败 ${failed} 个。`,
      processed: visibleCategoryPromptGroups.length,
      skipped,
      status: "completed",
      total: visibleCategoryPromptGroups.length,
    });
  }

  async function handleAnalyzeVisibleTagPromptGroups() {
    if (tagAnalysisProgress?.status === "running" || visibleTagPromptGroups.length === 0) {
      return;
    }

    tagAnalysisCancelRef.current = false;
    setTagAnalysisProgress({
      analyzed: 0,
      currentTitle: "",
      failed: 0,
      message: `准备分析 ${visibleTagPromptGroups.length} 个提示词组。`,
      processed: 0,
      skipped: 0,
      status: "running",
      total: visibleTagPromptGroups.length,
    });

    let analyzed = 0;
    let failed = 0;
    let processed = 0;
    let skipped = 0;
    let consecutiveFailures = 0;

    for (const group of visibleTagPromptGroups) {
      if (tagAnalysisCancelRef.current) {
        setTagAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `已取消，处理 ${processed}/${visibleTagPromptGroups.length} 个提示词组。`,
          processed,
          skipped,
          status: "canceled",
          total: visibleTagPromptGroups.length,
        });
        return;
      }

      const item = group.primaryItem;

      if (!shouldAnalyzePromptGroupTags(group)) {
        skipped += 1;
        processed += 1;
        setTagAnalysisProgress({
          analyzed,
          currentTitle: item.title || "未命名提示词",
          failed,
          message: "已有足够标签，已跳过。",
          processed,
          skipped,
          status: "running",
          total: visibleTagPromptGroups.length,
        });
        await waitForInteractionFrame();
        continue;
      }

      setTagAnalysisProgress({
        analyzed,
        currentTitle: item.title || "未命名提示词",
        failed,
        message: "正在进行 AI 标签分析...",
        processed,
        skipped,
        status: "running",
        total: visibleTagPromptGroups.length,
      });
      await waitForInteractionFrame();

      try {
        const result = await onAnalyzePrompt({
          target: "image-tags",
          title: "",
          imageFileName: item.imageFileName,
          prompt: "",
          negativePrompt: "",
          tags: [],
          category: item.category,
          runInBackground: true,
        });

        if (tagAnalysisCancelRef.current) {
          setTagAnalysisProgress({
            analyzed,
            currentTitle: "",
            failed,
            message: `已取消，处理 ${processed}/${visibleTagPromptGroups.length} 个提示词组。`,
            processed,
            skipped,
            status: "canceled",
            total: visibleTagPromptGroups.length,
          });
          return;
        }

        const patch = buildPromptGroupTagPatch(item, result.analysis);

        if (patch) {
          await onSaveItem(item.id, patch);
          await waitForInteractionFrame();
          analyzed += 1;
          consecutiveFailures = 0;
        } else {
          failed += 1;
          consecutiveFailures += 1;
        }
      } catch {
        failed += 1;
        consecutiveFailures += 1;
      }

      processed += 1;

      if (consecutiveFailures >= 3) {
        setTagAnalysisProgress({
          analyzed,
          currentTitle: "",
          failed,
          message: `连续 ${consecutiveFailures} 组无有效标签，已停止。请检查或更换模型。`,
          processed,
          skipped,
          status: "completed",
          total: visibleTagPromptGroups.length,
        });
        return;
      }

      setTagAnalysisProgress({
        analyzed,
        currentTitle: item.title || "未命名提示词",
        failed,
        message: "已完成当前提示词组。",
        processed,
        skipped,
        status: "running",
        total: visibleTagPromptGroups.length,
      });
      await waitForInteractionFrame();
    }

    setTagAnalysisProgress({
      analyzed,
      currentTitle: "",
      failed,
      message: `分析完成：更新 ${analyzed} 个，跳过 ${skipped} 个，失败 ${failed} 个。`,
      processed: visibleTagPromptGroups.length,
      skipped,
      status: "completed",
      total: visibleTagPromptGroups.length,
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
    const labelKeys = getSelectedCategoryLabelKeys(categoryMenuEntries, selectedCategoryMenuPath);

    if (labelKeys === null || labelKeys.size === 0) {
      setSelectedCategoryPromptGroups(new Set());
      return;
    }

    const items = collectSelectedPromptGroupItems(categoryPromptGroups, selectedCategoryPromptGroups);

    for (const item of items) {
      const patch = buildRemoveLabelsPatch(item, labelKeys);

      if (patch) {
        await onSaveItem(item.id, patch);
      }
    }

    setSelectedCategoryPromptGroups(new Set());
  }

  async function handleDeleteSelectedTagPromptGroups() {
    const labelKeys = getSelectedTagLabelKeys(tagMenuEntries, selectedTagMenuPath);

    if (labelKeys === null || labelKeys.size === 0) {
      setSelectedTagPromptGroups(new Set());
      return;
    }

    const items = collectSelectedPromptGroupItems(tagPromptGroups, selectedTagPromptGroups);

    for (const item of items) {
      const patch = buildRemoveLabelsPatch(item, labelKeys);

      if (patch) {
        await onSaveItem(item.id, patch);
      }
    }

    setSelectedTagPromptGroups(new Set());
  }

  const syncStatusBadge = (
    <span className="rounded-md border border-capsule-fog-border bg-capsule-fog px-2 py-1 text-xs text-capsule-fog-foreground">
      {isDirty ? (parameterMenuValidation.isValid ? "正在自动同步" : "校验后自动同步") : "当前已同步"}
    </span>
  );

  return (
    <section className="grid gap-4">
      {kind === "parameters" ? (
        <LexiconSection
          bodyClassName="min-h-0 overflow-visible"
          count={countDisplayableParameterEntries(parameterDrafts)}
          description={meta.description}
          eyebrow={meta.eyebrow}
          statusBadge={syncStatusBadge}
          icon={meta.icon}
          isBusy={isBusy}
          hideScrollTopButton={hideScrollTopButton}
          layout="page"
          query={parameterQuery}
          searchPlaceholder={meta.searchPlaceholder}
          selectedCount={countSelectedEntries(selectedParameters, parameterDrafts.filter(isDisplayableParameterEntry))}
          toolbarLeadingAction={
            <Button
              icon={<RefreshCw size={15} />}
              disabled={isBusy}
              onClick={handleMigrateParameterMenus}
            >
              整理分组
            </Button>
          }
          title={meta.title}
          onAdd={() =>
            updateParameterDrafts((currentDrafts) => [
              createBlankParameterEntry(
                getParameterSourceDraft(parameterSourceOptions, selectedParameterSource),
                getParameterGroupDraft(selectedParameterGroupPath),
                getParameterItemDraft(selectedParameterGroupPath, currentDrafts),
              ),
              ...currentDrafts,
            ])
          }
          onDeleteSelected={() => {
            updateParameterDrafts((currentDrafts) => currentDrafts.filter((entry) => !selectedParameters.has(entry.id)));
            setSelectedParameters(new Set());
          }}
          onExport={() => void onExportLexicon("parameters", parameterDrafts)}
          onImport={() => void handleImportParameters()}
          onQueryChange={setParameterQuery}
        >
          <ParameterMenuValidationNotice validation={parameterMenuValidation} />
          <ParameterLexiconExplorer
            entries={sourceFilteredParameters}
            filteredEntries={filteredParameters}
            isBusy={isBusy}
            layout="page"
            selectedEntries={selectedParameters}
            selectedGroupPath={selectedParameterGroupPath}
            onAddEntry={(group, draft, value) =>
              updateParameterDrafts((currentDrafts) => [
                createBlankParameterEntry(
                  getParameterSourceDraft(parameterSourceOptions, selectedParameterSource),
                  group,
                  draft,
                  value,
                ),
                ...currentDrafts,
              ])
            }
            onChangeEntry={(entryId, patch) =>
              updateParameterDrafts((currentDrafts) =>
                currentDrafts.map((draft) => (draft.id === entryId ? { ...draft, ...patch } : draft)),
              )
            }
            onChangeSection={(entryIds, patch) =>
              updateParameterDrafts((currentDrafts) => {
                const entryIdSet = new Set(entryIds);

                return currentDrafts.map((draft) =>
                  entryIdSet.has(draft.id) ? { ...draft, ...patch } : draft,
                );
              })
            }
            onRemoveEntry={(entryId) =>
              updateParameterDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== entryId))
            }
            onRenameGroup={(oldPath, newLabel) =>
              updateParameterDrafts((currentDrafts) => renameParameterGroupInDrafts(currentDrafts, oldPath, newLabel))
            }
            onSelectEntry={(entryId) => setSelectedParameters((current) => toggleEntrySelection(current, entryId))}
            onSelectGroup={setSelectedParameterGroupPath}
            onSelectAll={() => setSelectedParameters(new Set(filteredParameters.map((entry) => entry.id)))}
            onSelectInvert={() =>
              setSelectedParameters((current) => {
                const next = new Set<string>();
                for (const entry of filteredParameters) {
                  if (!current.has(entry.id)) {
                    next.add(entry.id);
                  }
                }
                return next;
              })
            }
            onSelectNone={() => setSelectedParameters(new Set())}
            onRemoveSelected={() => {
              updateParameterDrafts((current) => current.filter((entry) => !selectedParameters.has(entry.id)));
              setSelectedParameters(new Set());
            }}
          />
        </LexiconSection>
      ) : null}

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
          onAdd={() =>
            updateCategoryDrafts((currentDrafts) => [
              createBlankImageEntry("category", getImageEntryDraft("category", selectedCategoryMenuPath, currentDrafts)),
              ...currentDrafts,
            ])
          }
          onDeleteSelected={() => void handleDeleteSelectedCategoryPromptGroups()}
          onExport={() => void onExportLexicon("categories", categoryDrafts)}
          onImport={() => void handleImportCategories()}
          onQueryChange={setCategoryQuery}
        >
          <CategoryPromptGroupExplorer
            blurNsfwImages={blurNsfwImages}
            categoryLabelsCache={categoryLabelsCache}
            entries={categoryMenuEntries}
            analysisProgress={categoryAnalysisProgress}
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
                visibleTagPromptGroups.length === 0 ||
                analyzableTagPromptGroupCount === 0
              }
              onClick={() => void handleAnalyzeVisibleTagPromptGroups()}
            >
              {tagAnalysisProgress?.status === "running" ? "分析中" : "AI标签"}
            </Button>
          }
          title={meta.title}
          onAdd={() =>
            updateTagImageDrafts((currentDrafts) => [
              createBlankImageEntry("tag", getImageEntryDraft("tag", selectedTagMenuPath, currentDrafts)),
              ...currentDrafts,
            ])
          }
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
}

type PromptLexiconWorkspaceMeta = {
  description: string;
  emptyText: string;
  eyebrow: string;
  icon: React.ReactNode;
  searchPlaceholder: string;
  title: string;
};

function getPromptLexiconWorkspaceMeta(kind: PromptLexiconKind): PromptLexiconWorkspaceMeta {
  if (kind === "parameters") {
    return {
      description: "管理 AI 提取的参数、变量、值和来源。",
      emptyText: "没有匹配的参数记录",
      eyebrow: "参数词库",
      icon: <SlidersHorizontal size={18} />,
      searchPlaceholder: "搜索参数名称、变量或分组",
      title: "AI 分析参数词库",
    };
  }

  if (kind === "categories") {
    return {
      description: "按分类层级管理已保存提示词组。",
      emptyText: "当前分类下没有匹配的提示词组",
      eyebrow: "分类词库",
      icon: <FolderTree size={18} />,
      searchPlaceholder: "搜索分类或提示词组",
      title: "分类词库",
    };
  }

  return {
    description: "按标签管理已保存提示词组。",
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
  onExport,
  onImport,
  onQueryChange,
}: LexiconSectionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isPageLayout = layout === "page";
  const sectionClassName = isPageLayout
    ? "relative flex min-h-[520px] flex-col overflow-visible rounded-2xl border border-border/70 bg-panel shadow-elevated"
    : "relative flex min-h-[520px] max-h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-2xl border border-border/70 bg-panel shadow-elevated";
  const bodyLayoutClassName = isPageLayout ? "min-h-0 pb-16" : "flex-1";

  function handleScrollToTop() {
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <section className={sectionClassName} ref={sectionRef}>
      <div className="grid gap-3 border-b border-border/70 bg-background/70 px-4 py-3">
        <div className="flex flex-col gap-3 min-[960px]:flex-row min-[960px]:items-start min-[960px]:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground">
              {icon}
            </span>
            <div className="min-w-0">
              {eyebrow ? <p className="text-xs font-medium text-muted">{eyebrow}</p> : null}
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h3 className="whitespace-nowrap text-base font-semibold text-foreground">{title}</h3>
                <span className="shrink-0 rounded-lg border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">{count} 条</span>
                {selectedCount > 0 ? (
                  <span className="shrink-0 rounded-lg border border-capsule-lavender-border bg-capsule-lavender px-2 py-1 text-xs text-capsule-lavender-foreground">
                    已选 {selectedCount}
                  </span>
                ) : null}
                {statusBadge}
              </div>
              <p className="mt-1 text-xs text-muted">{description}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center min-[960px]:shrink-0 min-[960px]:justify-end">
            <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-border/70 bg-panel px-3 text-sm text-muted transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 min-[640px]:w-[16rem]">
              <Search size={15} />
              <input
                aria-label={`${title}搜索`}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {toolbarLeadingAction}
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
              <Button
                icon={<Trash2 size={16} />}
                variant="danger"
                disabled={isBusy || selectedCount === 0}
                onClick={onDeleteSelected}
              >
                删除选中
              </Button>
            </div>
          </div>
        </div>

        {toolbarExtra ? <div className="flex flex-wrap items-center gap-2">{toolbarExtra}</div> : null}
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

function ParameterMenuValidationNotice({
  validation,
}: {
  validation: PromptParameterMenuValidationResult;
}) {
  if (validation.isValid) {
    return null;
  }

  const visibleIssues = validation.issues.slice(0, 3);
  const hiddenIssueCount = Math.max(0, validation.issues.length - visibleIssues.length);

  return (
    <div className="border-b border-danger/30 bg-danger-soft px-4 py-3 text-danger">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 shrink-0" size={16} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">参数菜单校验未通过</p>
          <div className="mt-1 grid gap-1 text-xs leading-5">
            {visibleIssues.map((issue) => (
              <p className="min-w-0 truncate" key={`${issue.code}-${issue.path}-${issue.name}`}>
                {issue.message}
              </p>
            ))}
            {hiddenIssueCount > 0 ? <p>另有 {hiddenIssueCount} 个问题，请先处理。</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type ParameterLexiconRowProps = {
  entry: PromptParameterLexiconEntry;
  isBusy: boolean;
  selected: boolean;
  onChange: (patch: Partial<PromptParameterLexiconEntry>) => void;
  onRemove: () => void;
  onSelectedChange: () => void;
};

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
    ? "grid min-h-[560px] min-[1080px]:grid-cols-[280px_minmax(0,1fr)]"
    : "grid h-full min-h-0 min-[1080px]:grid-cols-[280px_minmax(0,1fr)]";
}

function getLexiconExplorerAsideClassName(layout: LexiconLayout): string {
  return layout === "page"
    ? "flex max-h-[420px] min-h-[280px] flex-col border-b border-border/70 bg-background/60 p-3 min-[1080px]:sticky min-[1080px]:top-4 min-[1080px]:max-h-[calc(100vh-9rem)] min-[1080px]:self-start min-[1080px]:border-b-0 min-[1080px]:border-r"
    : "flex min-h-0 flex-col border-b border-border/70 bg-background/60 p-3 min-[1080px]:border-b-0 min-[1080px]:border-r";
}

function getLexiconExplorerColumnClassName(layout: LexiconLayout): string {
  return layout === "page" ? "flex min-w-0 flex-col" : "flex min-h-0 min-w-0 flex-col";
}

function getLexiconExplorerContentClassName(layout: LexiconLayout, extraClassName = ""): string {
  const baseClassName =
    layout === "page" ? "min-h-[320px] overflow-visible" : "min-h-0 flex-1 overflow-y-auto overscroll-contain";

  return extraClassName ? `${baseClassName} ${extraClassName}` : baseClassName;
}

type ParameterLexiconExplorerProps = {
  entries: PromptParameterLexiconEntry[];
  filteredEntries: PromptParameterLexiconEntry[];
  isBusy: boolean;
  layout?: LexiconLayout;
  selectedEntries: ReadonlySet<string>;
  selectedGroupPath: string;
  onAddEntry: (
    group: string,
    draft: Partial<Pick<PromptParameterLexiconEntry, "label" | "variable">>,
    value?: string,
  ) => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptParameterLexiconEntry>) => void;
  onChangeSection: (
    entryIds: readonly string[],
    patch: Partial<Pick<PromptParameterLexiconEntry, "group" | "label" | "variable">>,
  ) => void;
  onRemoveEntry: (entryId: string) => void;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
  onSelectEntry: (entryId: string) => void;
  onSelectGroup: (groupPath: string) => void;
  onSelectAll: () => void;
  onSelectInvert: () => void;
  onSelectNone: () => void;
  onRemoveSelected: () => void;
};

function ParameterLexiconExplorer({
  entries,
  filteredEntries,
  isBusy,
  layout = "bounded",
  selectedEntries,
  selectedGroupPath,
  onAddEntry,
  onChangeEntry,
  onChangeSection,
  onRemoveEntry,
  onRenameGroup,
  onSelectEntry,
  onSelectGroup,
  onSelectAll,
  onSelectInvert,
  onSelectNone,
  onRemoveSelected,
}: ParameterLexiconExplorerProps) {
  const visibleEntries = useMemo(() => entries.filter(isDisplayableParameterEntry), [entries]);
  const visibleFilteredEntries = useMemo(() => filteredEntries.filter(isDisplayableParameterEntry), [filteredEntries]);
  const visibleSelectedCount = useMemo(
    () => visibleFilteredEntries.reduce((total, entry) => total + (selectedEntries.has(entry.id) ? 1 : 0), 0),
    [visibleFilteredEntries, selectedEntries],
  );
  const groupTree = useMemo(() => buildParameterGroupTree(visibleEntries), [visibleEntries]);
  const [expandedGroupPaths, setExpandedGroupPaths] = useState<Set<string>>(() => new Set());
  const activeGroupLabel = getParameterGroupDisplayLabel(selectedGroupPath, visibleEntries.length > 0 ? visibleEntries : entries);
  const isParameterItemSelected = selectedGroupPath.startsWith(parameterItemMenuPrefix);
  const parameterCapsuleSections = useMemo(
    () => buildParameterCapsuleSections(visibleFilteredEntries),
    [visibleFilteredEntries],
  );
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const rootClassName = getLexiconExplorerRootClassName(layout);
  const asideClassName = getLexiconExplorerAsideClassName(layout);
  const columnClassName = getLexiconExplorerColumnClassName(layout);
  const contentClassName = getLexiconExplorerContentClassName(layout);

  useEffect(() => {
    const activeMenuItem = menuScrollRef.current?.querySelector('[data-lexicon-menu-active="true"]');
    activeMenuItem?.scrollIntoView({ block: "center" });
  }, [expandedGroupPaths, selectedGroupPath]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedGroupPath]);

  function handleSelectAllGroups() {
    setExpandedGroupPaths(new Set());
    onSelectGroup(allParameterGroupsValue);
  }

  function handleToggleGroup(groupPath: string) {
    setExpandedGroupPaths((current) => {
      const next = new Set(current);

      if (next.has(groupPath)) {
        next.delete(groupPath);
      } else {
        next.add(groupPath);
      }

      return next;
    });
    onSelectGroup(groupPath);
  }

  return (
    <div className={rootClassName}>
      <aside className={asideClassName}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">参数菜单</p>
            <p className="mt-1 text-xs text-muted">按大类到小类逐级管理</p>
          </div>
          <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">
            {visibleEntries.length}
          </span>
        </div>
        <div ref={menuScrollRef} className="grid min-h-0 gap-1 overflow-y-auto overscroll-contain pb-8 pr-1">
          <ParameterGroupButton
            active={selectedGroupPath === allParameterGroupsValue}
            count={visibleEntries.length}
            depth={0}
            label="全部参数"
            onClick={handleSelectAllGroups}
          />
          {groupTree.length > 0 ? (
            groupTree.map((node) => (
              <ParameterGroupNodeButton
                expandedGroupPaths={expandedGroupPaths}
                key={node.path}
                node={node}
                selectedGroupPath={selectedGroupPath}
                onSelectGroup={onSelectGroup}
                onToggleGroup={handleToggleGroup}
                onRenameGroup={onRenameGroup}
              />
            ))
          ) : (
            <div className="rounded-md border border-border/70 bg-panel px-3 py-6 text-center text-xs text-muted">
              暂无参数菜单
            </div>
          )}
        </div>
      </aside>

      <div className={columnClassName}>
        <div className="shrink-0 border-b border-border/70 bg-panel px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{activeGroupLabel}</p>
            <p className="mt-1 text-xs text-muted">
              {isParameterItemSelected
                ? `显示 ${visibleFilteredEntries.length} 条具体参数`
                : `${parameterCapsuleSections.length} 个集合，${visibleFilteredEntries.length} 条具体参数`}
            </p>
          </div>
          {selectedGroupPath !== allParameterGroupsValue ? (
            <button
              className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              type="button"
              onClick={handleSelectAllGroups}
            >
              查看全部
            </button>
          ) : null}
          </div>
        </div>

        <LexiconBatchToolbar
          totalCount={visibleFilteredEntries.length}
          selectedCount={visibleSelectedCount}
          onSelectAll={onSelectAll}
          onSelectInvert={onSelectInvert}
          onSelectNone={onSelectNone}
          onRemoveSelected={onRemoveSelected}
        />

        <div ref={contentScrollRef} className={contentClassName}>
          {visibleFilteredEntries.length > 0 ? (
            <ParameterCapsuleSectionGrid
              isBusy={isBusy}
              sections={parameterCapsuleSections}
              selectedEntries={selectedEntries}
              onAddEntry={onAddEntry}
              onChangeEntry={onChangeEntry}
              onChangeSection={onChangeSection}
              onRemoveEntry={onRemoveEntry}
              onSelectEntry={onSelectEntry}
            />
          ) : (
            <LexiconEmptyState text="当前菜单下没有匹配的参数记录" />
          )}
        </div>
      </div>
    </div>
  );
}

type ParameterGroupNode = {
  children: ParameterGroupNode[];
  count: number;
  items: ParameterItemNode[];
  label: string;
  path: string;
};

type ParameterItemNode = {
  count: number;
  key: string;
  label: string;
  menuPath: string;
  variable: string;
};

type ParameterGroupNodeButtonProps = {
  expandedGroupPaths: ReadonlySet<string>;
  node: ParameterGroupNode;
  selectedGroupPath: string;
  onSelectGroup: (groupPath: string) => void;
  onToggleGroup: (groupPath: string) => void;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
};

function ParameterGroupNodeButton({
  expandedGroupPaths,
  node,
  selectedGroupPath,
  onSelectGroup,
  onToggleGroup,
  onRenameGroup,
}: ParameterGroupNodeButtonProps) {
  const depth = Math.max(0, splitParameterGroupPath(node.path).length - 1);
  const expandable = node.children.length > 0 || node.items.length > 0;
  const expanded = expandedGroupPaths.has(node.path);

  return (
    <>
      <ParameterGroupButton
        active={selectedGroupPath === node.path}
        count={node.count}
        depth={depth}
        expandable={expandable}
        expanded={expanded}
        label={node.label}
        onClick={() => (expandable ? onToggleGroup(node.path) : onSelectGroup(node.path))}
        onRename={(newLabel) => onRenameGroup(node.path, newLabel)}
      />
      {expanded
        ? node.children.map((child) => (
            <ParameterGroupNodeButton
              expandedGroupPaths={expandedGroupPaths}
              key={child.path}
              node={child}
              selectedGroupPath={selectedGroupPath}
              onSelectGroup={onSelectGroup}
              onToggleGroup={onToggleGroup}
              onRenameGroup={onRenameGroup}
            />
          ))
        : null}
      {expanded
        ? node.items.map((item) => (
            <ParameterItemNodeButton
              item={item}
              key={item.menuPath}
              parentDepth={depth}
              selectedGroupPath={selectedGroupPath}
              onSelectGroup={onSelectGroup}
            />
          ))
        : null}
    </>
  );
}

type ParameterItemNodeButtonProps = {
  item: ParameterItemNode;
  parentDepth: number;
  selectedGroupPath: string;
  onSelectGroup: (groupPath: string) => void;
};

function ParameterItemNodeButton({ item, parentDepth, selectedGroupPath, onSelectGroup }: ParameterItemNodeButtonProps) {
  return (
    <ParameterGroupButton
      active={selectedGroupPath === item.menuPath}
      count={item.count}
      depth={parentDepth + 1}
      label={item.label}
      onClick={() => onSelectGroup(item.menuPath)}
    />
  );
}

type MenuRenameInputProps = {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

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

type ParameterGroupButtonProps = {
  active: boolean;
  count: number;
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
  label: string;
  onClick: () => void;
  onRename?: (newLabel: string) => void;
};

function ParameterGroupButton({
  active,
  count,
  depth,
  expandable = false,
  expanded = false,
  label,
  onClick,
  onRename,
}: ParameterGroupButtonProps) {
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
      aria-pressed={active}
      className={`group grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground shadow-elevated"
          : "border-transparent text-muted hover:bg-panel hover:text-foreground"
      }`}
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
      <span className="flex items-center gap-1.5">
        {onRename ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="重命名"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100"
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
        <span className="rounded-md border border-border/70 bg-panel px-2 py-0.5 text-xs text-muted">{count}</span>
      </span>
    </button>
  );
}

type ParameterValueCapsuleGridProps = {
  entries: PromptParameterLexiconEntry[];
  isBusy: boolean;
  selectedEntries: ReadonlySet<string>;
  onChangeEntry: (entryId: string, patch: Partial<PromptParameterLexiconEntry>) => void;
  onRemoveEntry: (entryId: string) => void;
  onSelectEntry: (entryId: string) => void;
};

type ParameterCapsuleSection = {
  entries: PromptParameterLexiconEntry[];
  group: string;
  id: string;
  subtitle: string;
  title: string;
  variable: string;
};

type ParameterCapsuleSectionGridProps = {
  isBusy: boolean;
  sections: ParameterCapsuleSection[];
  selectedEntries: ReadonlySet<string>;
  onAddEntry: (
    group: string,
    draft: Partial<Pick<PromptParameterLexiconEntry, "label" | "variable">>,
    value?: string,
  ) => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptParameterLexiconEntry>) => void;
  onChangeSection: (
    entryIds: readonly string[],
    patch: Partial<Pick<PromptParameterLexiconEntry, "group" | "label" | "variable">>,
  ) => void;
  onRemoveEntry: (entryId: string) => void;
  onSelectEntry: (entryId: string) => void;
};

function ParameterCapsuleSectionGrid({
  isBusy,
  sections,
  selectedEntries,
  onAddEntry,
  onChangeEntry,
  onChangeSection,
  onRemoveEntry,
  onSelectEntry,
}: ParameterCapsuleSectionGridProps) {
  return (
    <div className="min-h-[320px] bg-panel p-4">
      <div className="grid gap-3">
        {sections.map((section) => (
          <section className="rounded-lg border border-border/70 bg-background/70 p-3" key={section.id}>
            <ParameterSectionEditor
              isBusy={isBusy}
              section={section}
              onAddEntry={() =>
                onAddEntry(section.group, { label: section.title, variable: section.variable }, "新参数")
              }
              onChangeSection={(patch) => onChangeSection(section.entries.map((entry) => entry.id), patch)}
            />
            <div className="flex flex-wrap content-start gap-2">
              {section.entries.map((entry) => (
                <ParameterValueCapsule
                  entry={entry}
                  isBusy={isBusy}
                  key={entry.id}
                  selected={selectedEntries.has(entry.id)}
                  onChangeValue={(value) => onChangeEntry(entry.id, { value })}
                  onRemove={() => onRemoveEntry(entry.id)}
                  onSelectedChange={() => onSelectEntry(entry.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

type ParameterSectionEditorProps = {
  isBusy: boolean;
  section: ParameterCapsuleSection;
  onAddEntry: () => void;
  onChangeSection: (patch: Partial<Pick<PromptParameterLexiconEntry, "group" | "label" | "variable">>) => void;
};

function ParameterSectionEditor({ isBusy, section, onAddEntry }: ParameterSectionEditorProps) {
  return (
    <div className="mb-3 grid gap-3 rounded-md border border-border/70 bg-panel px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">参数集合</span>
          <span className="rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-0.5 text-xs text-capsule-mist-foreground">
            {section.entries.length} 个值
          </span>
        </div>
        <IconButton ariaLabel={`在${section.title}中新增参数值`} disabled={isBusy} icon={<Plus size={14} />} onClick={onAddEntry} />
      </div>
    </div>
  );
}

function ParameterValueCapsuleGrid({
  entries,
  isBusy,
  selectedEntries,
  onChangeEntry,
  onRemoveEntry,
  onSelectEntry,
}: ParameterValueCapsuleGridProps) {
  return (
    <div className="min-h-[320px] bg-panel p-4">
      <div className="flex flex-wrap content-start gap-2">
        {entries.map((entry) => (
          <ParameterValueCapsule
            entry={entry}
            isBusy={isBusy}
            key={entry.id}
            selected={selectedEntries.has(entry.id)}
            onChangeValue={(value) => onChangeEntry(entry.id, { value })}
            onRemove={() => onRemoveEntry(entry.id)}
            onSelectedChange={() => onSelectEntry(entry.id)}
          />
        ))}
      </div>
    </div>
  );
}

type ParameterValueCapsuleProps = {
  entry: PromptParameterLexiconEntry;
  isBusy: boolean;
  selected: boolean;
  onChangeValue: (value: string) => void;
  onRemove: () => void;
  onSelectedChange: () => void;
};

function ParameterValueCapsule({
  entry,
  isBusy,
  selected,
  onChangeValue,
  onRemove,
  onSelectedChange,
}: ParameterValueCapsuleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(entry.value);

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(entry.value);
    }
  }, [entry.value, isEditing]);

  function commitEdit() {
    onChangeValue(draftValue.trim());
    setIsEditing(false);
  }

  function cancelEdit() {
    setDraftValue(entry.value);
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
      title={`${entry.label || "未命名参数"} / ${entry.variable || "未设置变量名"}`}
    >
      {isEditing ? (
        <input
          aria-label="编辑参数值"
          autoFocus
          className="h-8 w-36 min-w-0 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted"
          disabled={isBusy}
          placeholder="参数值"
          value={draftValue}
          onBlur={commitEdit}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          aria-label="选择参数值，双击可编辑"
          className="min-w-0 px-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          disabled={isBusy}
          type="button"
          onClick={onSelectedChange}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDraftValue(entry.value);
            setIsEditing(true);
          }}
        >
          <span className="block max-w-[14rem] truncate">{entry.value || "未设置具体参数"}</span>
        </button>
      )}
      <button
        aria-label="删除参数值"
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

type CategoryPromptGroupExplorerProps = {
  analysisProgress: CategoryAnalysisProgress | null;
  blurNsfwImages: boolean;
  categoryLabelsCache: ReadonlyMap<string, string[]>;
  entries: PromptImageLexiconEntry[];
  likedImageIds: string[];
  layout?: LexiconLayout;
  promptGroups: PromptImageGroup[];
  query: string;
  selectedMenuPath: string;
  selectedPromptGroupIds: ReadonlySet<string>;
  onCopyPrompt: (item: PromptCardData) => void;
  onCancelAnalysis: () => void;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  onOpenDetail: (itemId: string) => void;
  onRemoveSelectedPromptGroups: () => void;
  onSelectAllPromptGroups: (groupIds: readonly string[]) => void;
  onSelectInvertPromptGroups: (groupIds: readonly string[]) => void;
  onSelectMenu: (menuPath: string) => void;
  onSelectNoPromptGroups: () => void;
  onTogglePromptGroupSelection: (groupId: string) => void;
};

function CategoryPromptGroupExplorer({
  analysisProgress,
  blurNsfwImages,
  categoryLabelsCache,
  entries,
  likedImageIds,
  layout = "bounded",
  promptGroups,
  query,
  selectedMenuPath,
  selectedPromptGroupIds,
  onCopyPrompt,
  onCancelAnalysis,
  onChangeEntry,
  onOpenDetail,
  onRemoveSelectedPromptGroups,
  onSelectAllPromptGroups,
  onSelectInvertPromptGroups,
  onSelectMenu,
  onSelectNoPromptGroups,
  onTogglePromptGroupSelection,
}: CategoryPromptGroupExplorerProps) {
  const categoryTree = useMemo(() => buildImageCategoryTree(entries), [entries]);
  const promptGroupCountByCategory = useMemo(() => buildPromptGroupCountByCategory(promptGroups, categoryLabelsCache), [categoryLabelsCache, promptGroups]);
  const deferredQuery = useDeferredValue(query);
  const deferredSelectedMenuPath = useDeferredValue(selectedMenuPath);
  const visibleCategoryTree = useMemo(
    () => filterCategoryTreeByPromptGroups(categoryTree, promptGroupCountByCategory),
    [categoryTree, promptGroupCountByCategory],
  );
  const filteredPromptGroups = useMemo(
    () => filterPromptGroupsForCategoryMenu(promptGroups, entries, deferredSelectedMenuPath, deferredQuery, categoryLabelsCache),
    [categoryLabelsCache, deferredQuery, deferredSelectedMenuPath, entries, promptGroups],
  );
  const selectedCategoryPromptGroupCount = useMemo(
    () => countPromptGroupsForCategoryMenu(promptGroups, entries, deferredSelectedMenuPath, categoryLabelsCache),
    [categoryLabelsCache, deferredSelectedMenuPath, entries, promptGroups],
  );
  const activeMenuLabel = getImageLexiconMenuDisplayLabel("category", selectedMenuPath, entries);
  const filteredImageCount = filteredPromptGroups.reduce((total, group) => total + group.items.length, 0);
  const filteredSelectedCount = countSelectedPromptGroups(selectedPromptGroupIds, filteredPromptGroups);
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const rootClassName = getLexiconExplorerRootClassName(layout);
  const asideClassName = getLexiconExplorerAsideClassName(layout);
  const columnClassName = getLexiconExplorerColumnClassName(layout);
  const contentClassName = getLexiconExplorerContentClassName(layout, "bg-panel p-4");

  useEffect(() => {
    const activeMenuItem = menuScrollRef.current?.querySelector('[data-lexicon-menu-active="true"]');
    activeMenuItem?.scrollIntoView({ block: "center" });
  }, [selectedMenuPath]);

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0 });
  }, [query, selectedMenuPath]);

  useEffect(() => {
    if (selectedMenuPath !== allCategoryGroupsValue && selectedCategoryPromptGroupCount === 0) {
      onSelectMenu(allCategoryGroupsValue);
    }
  }, [onSelectMenu, selectedCategoryPromptGroupCount, selectedMenuPath]);

  return (
    <div className={rootClassName}>
      <aside className={asideClassName}>
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">分类菜单</p>
            <p className="mt-1 text-xs text-muted">按父子分类延伸到最小分类</p>
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
              <p className="px-3 pt-3 text-xs font-medium text-muted">分类层级</p>
              {visibleCategoryTree.map((node) => (
                <PromptCategoryNodeButton
                  countByCategory={promptGroupCountByCategory}
                  key={node.entry.id}
                  node={node}
                  onChangeEntry={onChangeEntry}
                  selectedMenuPath={selectedMenuPath}
                  onSelectMenu={onSelectMenu}
                />
              ))}
            </>
          ) : (
            <div className="rounded-md border border-border/70 bg-panel px-3 py-6 text-center text-xs text-muted">
              暂无已归纳提示词组的分类。
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
            {selectedMenuPath !== allCategoryGroupsValue ? (
              <button
                className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                type="button"
                onClick={() => onSelectMenu(allCategoryGroupsValue)}
              >
                查看全部
              </button>
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
            removeLabel="移出该分类"
            removeDisabled={selectedMenuPath === allCategoryGroupsValue}
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
            <LexiconEmptyState text="当前分类暂无提示词组" />
          )}
        </div>
      </div>
    </div>
  );
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
            <p className="mt-1 text-xs text-muted">只显示已被提示词组使用的标签</p>
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
                  selectedMenuPath={selectedMenuPath}
                  onSelectMenu={onSelectMenu}
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
              <button
                className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border/70 bg-background px-3 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                type="button"
                onClick={() => onSelectMenu(allTagGroupsValue)}
              >
                查看全部
              </button>
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
            removeLabel="移出该标签"
            removeDisabled={selectedMenuPath === allTagGroupsValue}
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

function logRendererStartupEvent(event: string, details: Record<string, unknown> = {}): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
  }
}

type PromptCategoryNodeButtonProps = {
  countByCategory: ReadonlyMap<string, number>;
  node: ImageCategoryNode;
  onChangeEntry: (entryId: string, patch: Partial<PromptImageLexiconEntry>) => void;
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
};

function PromptCategoryNodeButton({ countByCategory, node, onChangeEntry, selectedMenuPath, onSelectMenu }: PromptCategoryNodeButtonProps) {
  const menuPath = createImageCategoryMenuValue(node.entry.id);
  const count = countPromptGroupsForCategoryNode(node, countByCategory);

  return (
    <>
      <ImageLexiconMenuButton
        active={selectedMenuPath === menuPath}
        count={count}
        depth={node.depth}
        label={node.entry.label || "未命名分类"}
        onClick={() => onSelectMenu(menuPath)}
        onRename={(newLabel) => onChangeEntry(node.entry.id, { label: newLabel })}
      />
      {node.children.map((child) => (
        <PromptCategoryNodeButton
          countByCategory={countByCategory}
          key={child.entry.id}
          node={child}
          onChangeEntry={onChangeEntry}
          selectedMenuPath={selectedMenuPath}
          onSelectMenu={onSelectMenu}
        />
      ))}
    </>
  );
}

type PromptTagGroupNodeButtonProps = {
  countByTag: ReadonlyMap<string, number>;
  node: ImageGroupNode;
  onRenameGroup: (oldPath: string, newLabel: string) => void;
  onRenameItem: (groupPath: string, itemKey: string, newLabel: string) => void;
  promptGroups: readonly PromptImageGroup[];
  selectedMenuPath: string;
  onSelectMenu: (menuPath: string) => void;
};

function PromptTagGroupNodeButton({
  countByTag,
  node,
  onRenameGroup,
  onRenameItem,
  promptGroups,
  selectedMenuPath,
  onSelectMenu,
}: PromptTagGroupNodeButtonProps) {
  const menuPath = createImageGroupMenuValue(node.path);
  const depth = Math.max(0, splitParameterGroupPath(node.path).length - 1);
  const count = countPromptGroupsByTagKeys(promptGroups, getTagGroupNodeLabelKeys(node));

  return (
    <>
      <ImageLexiconMenuButton
        active={selectedMenuPath === menuPath}
        count={count}
        depth={depth}
        label={node.label}
        onClick={() => onSelectMenu(menuPath)}
        onRename={(newLabel) => onRenameGroup(node.path, newLabel)}
      />
      {node.children.map((child) => (
        <PromptTagGroupNodeButton
          countByTag={countByTag}
          key={child.path}
          node={child}
          onRenameGroup={onRenameGroup}
          onRenameItem={onRenameItem}
          promptGroups={promptGroups}
          selectedMenuPath={selectedMenuPath}
          onSelectMenu={onSelectMenu}
        />
      ))}
      {node.items.map((item) => (
        <ImageLexiconMenuButton
          active={selectedMenuPath === item.menuPath}
          count={countByTag.get(item.key) ?? 0}
          depth={depth + 1}
          key={item.menuPath}
          label={item.label}
          onClick={() => onSelectMenu(item.menuPath)}
          onRename={(newLabel) => onRenameItem(node.path, item.key, newLabel)}
        />
      ))}
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
  label: string;
  onClick: () => void;
  onRename?: (newLabel: string) => void;
};

function ImageLexiconMenuButton({ active, count, depth, label, onClick, onRename }: ImageLexiconMenuButtonProps) {
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
      aria-pressed={active}
      className={`group grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground shadow-elevated"
          : "border-transparent text-muted hover:bg-panel hover:text-foreground"
      }`}
      data-lexicon-menu-active={active ? "true" : undefined}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      type="button"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        {depth > 0 ? <ChevronRight className="shrink-0 text-muted" size={13} /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-center gap-1.5">
        {onRename ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="重命名"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100"
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

function ParameterLexiconRow({
  entry,
  isBusy,
  selected,
  onChange,
  onRemove,
  onSelectedChange,
}: ParameterLexiconRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div
      className="grid gap-3 border-b border-border/70 bg-panel px-3 py-3 transition-colors last:border-b-0 hover:bg-background min-[980px]:grid-cols-[32px_minmax(12rem,1.15fr)_minmax(10rem,0.75fr)_minmax(14rem,1fr)_76px] min-[980px]:items-center"
    >
      <SelectionButton selected={selected} ariaLabel="选择参数记录" disabled={isBusy} onClick={onSelectedChange} />
      {isEditing ? (
        <>
          <LexiconTextInput
            ariaLabel="参数名称"
            placeholder="参数名称"
            value={entry.label}
            onChange={(value) => onChange({ label: value })}
          />
          <LexiconTextInput
            ariaLabel="变量名"
            placeholder="变量名"
            value={entry.variable}
            onChange={(value) => onChange({ variable: value })}
          />
          <LexiconTextInput
            ariaLabel="默认值"
            placeholder="默认值"
            value={entry.value}
            onChange={(value) => onChange({ value })}
          />
        </>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{entry.label || "未命名参数"}</p>
            <p className="mt-1 truncate text-xs text-muted">{entry.group || "未分组"}</p>
          </div>
          <span className="min-w-0 truncate rounded-md border border-capsule-mist-border bg-capsule-mist px-2 py-1 text-xs text-capsule-mist-foreground">
            {entry.variable || "未设置变量名"}
          </span>
          <span className="min-w-0 truncate text-sm text-muted">{entry.value || "未设置默认值"}</span>
        </>
      )}
      <div className="flex items-center gap-1">
        <IconButton
          ariaLabel={isEditing ? "完成编辑参数" : "编辑参数"}
          disabled={isBusy}
          icon={isEditing ? <Check size={15} /> : <FileText size={15} />}
          onClick={() => setIsEditing((current) => !current)}
        />
        <IconButton ariaLabel="删除参数" disabled={isBusy} icon={<Trash2 size={15} />} onClick={onRemove} />
      </div>
    </div>
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

function createTagDrafts(tags: string[]): TagEditorDraft[] {
  return tags.map((tag, index) => ({
    id: `${index}-${tag}`,
    originalTag: tag,
    label: tag,
  }));
}

function moveDraft(drafts: TagEditorDraft[], draftId: string, direction: -1 | 1): TagEditorDraft[] {
  const currentIndex = drafts.findIndex((draft) => draft.id === draftId);
  const nextIndex = currentIndex + direction;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= drafts.length) {
    return drafts;
  }

  const nextDrafts = [...drafts];
  const [draft] = nextDrafts.splice(currentIndex, 1);
  nextDrafts.splice(nextIndex, 0, draft);

  return nextDrafts;
}

function createPromptLexiconDrafts(
  promptLexicons: PromptLexiconSettings | null,
  tagDrafts: TagEditorDraft[],
): PromptLexiconSettings {
  if (promptLexicons) {
    return {
      parameters: normalizeParameterLexiconEntries(promptLexicons.parameters),
      categories: normalizeImageLexiconEntries(promptLexicons.categories),
      tags: normalizeTagImageLexiconEntries(promptLexicons.tags),
    };
  }

  return createDefaultPromptLexiconSettings(tagDrafts.map((draft) => draft.label));
}

function createPromptParameterDrafts(
  promptLexicons: PromptLexiconSettings | null,
  popularTags: string[],
  shouldNormalize: boolean,
): PromptParameterLexiconEntry[] {
  if (promptLexicons) {
    return shouldNormalize
      ? normalizeParameterLexiconEntries(promptLexicons.parameters)
      : promptLexicons.parameters;
  }

  return createDefaultPromptLexiconSettings(popularTags).parameters;
}

function createPromptCategoryDrafts(
  promptLexicons: PromptLexiconSettings | null,
  popularTags: string[],
  shouldNormalize: boolean,
): PromptImageLexiconEntry[] {
  if (promptLexicons) {
    return shouldNormalize
      ? normalizeImageLexiconEntries(promptLexicons.categories)
      : promptLexicons.categories;
  }

  return createDefaultPromptLexiconSettings(popularTags).categories;
}

function createPromptTagImageDrafts(
  promptLexicons: PromptLexiconSettings | null,
  popularTags: string[],
  shouldNormalize: boolean,
): PromptImageLexiconEntry[] {
  if (promptLexicons) {
    return shouldNormalize
      ? normalizeTagImageLexiconEntries(promptLexicons.tags)
      : promptLexicons.tags;
  }

  return createDefaultPromptLexiconSettings(popularTags).tags;
}

function createBlankParameterEntry(
  source: Partial<Pick<PromptParameterLexiconEntry, "sourcePromptId" | "sourcePromptTitle">> = {},
  group = defaultParameterGroupLabel,
  draft: Partial<Pick<PromptParameterLexiconEntry, "label" | "variable">> = {},
  value = "新参数",
): PromptParameterLexiconEntry {
  return {
    id: createClientLexiconId("parameter"),
    group: normalizePromptParameterGroupPath(group || defaultParameterGroupLabel),
    label: draft.label ?? "新参数",
    sourcePromptId: source.sourcePromptId ?? null,
    sourcePromptTitle: source.sourcePromptTitle ?? null,
    variable: draft.variable ?? "customParameter",
    value,
  };
}

function createBlankImageEntry(
  kind: "category" | "tag",
  draft: Partial<Pick<PromptImageLexiconEntry, "group" | "label" | "parentId">> = {},
): PromptImageLexiconEntry {
  return {
    id: createClientLexiconId(kind),
    group: draft.group ?? (kind === "category" ? defaultCategoryGroupLabel : defaultTagGroupLabel),
    label: draft.label ?? (kind === "category" ? "新分类" : "新标签"),
    description: "",
    parentId: draft.parentId ?? null,
    imageFileName: null,
  };
}

function createClientLexiconId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeParameterLexiconEntries(entries: readonly PromptParameterLexiconEntry[]): PromptParameterLexiconEntry[] {
  const normalizedEntries: PromptParameterLexiconEntry[] = [];
  const entriesByKey = new Map<string, PromptParameterLexiconEntry>();
  const usedIds = new Set<string>();

  for (const entry of entries) {
    const label = entry.label.trim();
    const variable = normalizeParameterVariableName(entry.variable);

    if (!label || !variable) {
      continue;
    }

    const id = getUniqueLexiconId(entry.id, usedIds, "parameter");
    const normalizedEntry: PromptParameterLexiconEntry = {
      id,
      group: resolveParameterEntryGroup(entry),
      label,
      sourcePromptId: normalizeOptionalLexiconValue(entry.sourcePromptId),
      sourcePromptTitle: normalizeOptionalLexiconValue(entry.sourcePromptTitle),
      variable,
      value: entry.value.trim(),
    };
    const duplicateKey = getParameterEntryDedupKey(normalizedEntry);
    const existingEntry = entriesByKey.get(duplicateKey);

    if (existingEntry) {
      mergeParameterEntrySource(existingEntry, normalizedEntry);
      continue;
    }

    entriesByKey.set(duplicateKey, normalizedEntry);
    normalizedEntries.push(normalizedEntry);
  }

  return normalizedEntries;
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

function normalizeParameterVariableName(value: string): string {
  const variable = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  const sectionKey = getPromptSectionKeyByVariable(variable);

  return sectionKey ? promptSectionMeta[sectionKey].variable : variable;
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

function matchesLexiconQuery(entry: PromptLexiconEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return getLexiconSearchText(entry).toLowerCase().includes(normalizedQuery);
}

function getLexiconSearchText(entry: PromptLexiconEntry): string {
  if (isPromptParameterLexiconEntry(entry)) {
    return `${resolveParameterEntryGroup(entry)} ${entry.label} ${entry.variable} ${entry.value} ${entry.sourcePromptTitle ?? ""}`;
  }

  return `${entry.group} ${entry.label} ${entry.description}`;
}

type ParameterSourceOption = {
  label: string;
  sourcePromptId?: string | null;
  sourcePromptTitle?: string | null;
  value: string;
};

function buildParameterSourceOptions(entries: readonly PromptParameterLexiconEntry[]): ParameterSourceOption[] {
  const sourceOptions: ParameterSourceOption[] = [
    { label: "全部提示词", value: allParameterSourcesValue },
    { label: "通用词库", value: globalParameterSourceValue },
  ];
  const usedValues = new Set(sourceOptions.map((option) => option.value));

  for (const entry of entries) {
    const sourcePromptId = normalizeOptionalLexiconValue(entry.sourcePromptId);
    const sourcePromptTitle = normalizeOptionalLexiconValue(entry.sourcePromptTitle);

    if (!sourcePromptId && !sourcePromptTitle) {
      continue;
    }

    const value = createParameterSourceValue(sourcePromptId, sourcePromptTitle);

    if (usedValues.has(value)) {
      continue;
    }

    usedValues.add(value);
    sourceOptions.push({
      label: sourcePromptTitle || "未命名提示词",
      sourcePromptId,
      sourcePromptTitle,
      value,
    });
  }

  return sourceOptions;
}

function matchesParameterSource(entry: PromptParameterLexiconEntry, selectedSource: string): boolean {
  if (selectedSource === allParameterSourcesValue) {
    return true;
  }

  const sourcePromptId = normalizeOptionalLexiconValue(entry.sourcePromptId);
  const sourcePromptTitle = normalizeOptionalLexiconValue(entry.sourcePromptTitle);

  if (selectedSource === globalParameterSourceValue) {
    return !sourcePromptId && !sourcePromptTitle;
  }

  return createParameterSourceValue(sourcePromptId, sourcePromptTitle) === selectedSource;
}

function getParameterSourceDraft(
  options: readonly ParameterSourceOption[],
  selectedSource: string,
): Partial<Pick<PromptParameterLexiconEntry, "sourcePromptId" | "sourcePromptTitle">> {
  const option = options.find((item) => item.value === selectedSource);

  if (!option || option.value === allParameterSourcesValue || option.value === globalParameterSourceValue) {
    return {};
  }

  return {
    sourcePromptId: option.sourcePromptId ?? null,
    sourcePromptTitle: option.sourcePromptTitle ?? null,
  };
}

function getParameterGroupDraft(selectedGroupPath: string): string {
  if (selectedGroupPath === allParameterGroupsValue) {
    return defaultParameterGroupLabel;
  }

  const parsedItem = parseParameterItemMenuValue(selectedGroupPath);
  const groupPath = parsedItem?.groupPath ?? selectedGroupPath;
  const segments = splitParameterGroupPath(groupPath);

  if (segments.length === 0 || segments[0] === ungroupedParameterGroupLabel) {
    return defaultParameterGroupLabel;
  }

  return segments.join(" / ");
}

function getParameterItemDraft(
  selectedGroupPath: string,
  entries: readonly PromptParameterLexiconEntry[],
): Partial<Pick<PromptParameterLexiconEntry, "label" | "variable">> {
  const parsedItem = parseParameterItemMenuValue(selectedGroupPath);

  if (!parsedItem) {
    return {};
  }

  const matchedEntry = entries.find(
    (entry) => isExactParameterGroupMatch(entry, parsedItem.groupPath) && getParameterItemKey(entry) === parsedItem.itemKey,
  );

  if (!matchedEntry) {
    return {};
  }

  return {
    label: matchedEntry.label,
    variable: matchedEntry.variable,
  };
}

function buildParameterCapsuleSections(entries: readonly PromptParameterLexiconEntry[]): ParameterCapsuleSection[] {
  const sectionMap = new Map<string, ParameterCapsuleSection>();

  for (const entry of entries) {
    const groupPath = getParameterGroupSegments(entry).join(" / ");
    const itemKey = getParameterItemKey(entry);
    const sectionId = `${groupPath}|${itemKey}`;
    let section = sectionMap.get(sectionId);

    if (!section) {
      section = {
        entries: [],
        group: groupPath,
        id: sectionId,
        subtitle: groupPath || ungroupedParameterGroupLabel,
        title: getParameterItemLabel(entry),
        variable: entry.variable.trim(),
      };
      sectionMap.set(sectionId, section);
    }

    section.entries.push(entry);
  }

  return [...sectionMap.values()]
    .map((section) => ({
      ...section,
      entries: [...section.entries].sort(compareParameterCapsuleEntry),
    }))
    .sort(
      (left, right) =>
        left.subtitle.localeCompare(right.subtitle, "zh-Hans-CN") ||
        left.title.localeCompare(right.title, "zh-Hans-CN") ||
        left.variable.localeCompare(right.variable, "zh-Hans-CN"),
    );
}

function isDisplayableParameterEntry(entry: PromptParameterLexiconEntry): boolean {
  return Boolean(entry.label.trim() && entry.variable.trim() && isMeaningfulParameterValue(entry.value));
}

function isMeaningfulParameterValue(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  return !(
    /^未(?:设置|指定|提供|识别)/u.test(normalizedValue) ||
    ["未设置具体参数", "未设置默认值", "未设置参数", "暂无", "无", "none", "n/a", "null", "-"].includes(
      normalizedValue,
    )
  );
}

function compareParameterCapsuleEntry(left: PromptParameterLexiconEntry, right: PromptParameterLexiconEntry): number {
  const leftValue = left.value.trim();
  const rightValue = right.value.trim();

  return leftValue.localeCompare(rightValue, "zh-Hans-CN") || left.id.localeCompare(right.id);
}

function matchesParameterGroup(entry: PromptParameterLexiconEntry, selectedGroupPath: string): boolean {
  if (selectedGroupPath === allParameterGroupsValue) {
    return true;
  }

  const parsedItem = parseParameterItemMenuValue(selectedGroupPath);

  if (parsedItem) {
    return isExactParameterGroupMatch(entry, parsedItem.groupPath) && getParameterItemKey(entry) === parsedItem.itemKey;
  }

  const selectedSegments = splitParameterGroupPath(selectedGroupPath);
  const entrySegments = getParameterGroupSegments(entry);

  return selectedSegments.every((segment, index) => entrySegments[index] === segment);
}

function getParameterGroupDisplayLabel(groupPath: string, entries: readonly PromptParameterLexiconEntry[]): string {
  if (groupPath === allParameterGroupsValue) {
    return "全部参数";
  }

  const parsedItem = parseParameterItemMenuValue(groupPath);

  if (parsedItem) {
    const matchedEntry = entries.find(
      (entry) => isExactParameterGroupMatch(entry, parsedItem.groupPath) && getParameterItemKey(entry) === parsedItem.itemKey,
    );
    const label = matchedEntry?.label || parsedItem.itemKey.split("|")[0] || "未命名参数";
    const groupLabel = getParameterGroupDisplayLabel(parsedItem.groupPath, entries);
    return `${groupLabel} / ${label}`;
  }

  const segments = splitParameterGroupPath(groupPath);
  return segments.length > 0 ? segments.join(" / ") : ungroupedParameterGroupLabel;
}

function buildParameterGroupTree(entries: readonly PromptParameterLexiconEntry[]): ParameterGroupNode[] {
  const rootNodes: ParameterGroupNode[] = [];

  for (const entry of entries) {
    let currentNodes = rootNodes;
    const pathSegments: string[] = [];

    for (const segment of getParameterGroupSegments(entry)) {
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

    const groupPath = getParameterGroupSegments(entry).join(" / ");
    const groupNode = findParameterGroupNode(rootNodes, groupPath);
    const itemKey = getParameterItemKey(entry);
    let itemNode = groupNode?.items.find((item) => item.key === itemKey);

    if (groupNode && !itemNode) {
      itemNode = {
        count: 0,
        key: itemKey,
        label: getParameterItemLabel(entry),
        menuPath: createParameterItemMenuValue(groupPath, itemKey),
        variable: entry.variable,
      };
      groupNode.items.push(itemNode);
    }

    if (itemNode) {
      itemNode.count += 1;
    }
  }

  return sortParameterGroupNodes(rootNodes);
}

function sortParameterGroupNodes(nodes: ParameterGroupNode[]): ParameterGroupNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: sortParameterGroupNodes(node.children),
      items: sortParameterItemNodes(node.items),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function sortParameterItemNodes(nodes: ParameterItemNode[]): ParameterItemNode[] {
  return [...nodes].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "zh-Hans-CN"));
}

function getParameterGroupSegments(entry: PromptParameterLexiconEntry): string[] {
  const segments = splitParameterGroupPath(resolveParameterEntryGroup(entry));
  return segments.length > 0 ? segments : [ungroupedParameterGroupLabel];
}

function resolveParameterEntryGroup(entry: Pick<PromptParameterLexiconEntry, "group" | "variable">): string {
  const sectionKey = getPromptSectionKeyByVariable(entry.variable);

  if (sectionKey) {
    return getPromptParameterGroup(sectionKey);
  }

  return normalizePromptParameterGroupPath(entry.group || defaultParameterGroupLabel);
}

function findParameterGroupNode(nodes: readonly ParameterGroupNode[], groupPath: string): ParameterGroupNode | null {
  for (const node of nodes) {
    if (node.path === groupPath) {
      return node;
    }

    const childNode = findParameterGroupNode(node.children, groupPath);

    if (childNode) {
      return childNode;
    }
  }

  return null;
}

function isExactParameterGroupMatch(entry: PromptParameterLexiconEntry, groupPath: string): boolean {
  const selectedSegments = splitParameterGroupPath(groupPath);
  const entrySegments = getParameterGroupSegments(entry);

  return selectedSegments.length === entrySegments.length && selectedSegments.every((segment, index) => entrySegments[index] === segment);
}

function createParameterItemMenuValue(groupPath: string, itemKey: string): string {
  return `${parameterItemMenuPrefix}${encodeURIComponent(groupPath)}|${encodeURIComponent(itemKey)}`;
}

function parseParameterItemMenuValue(menuPath: string): { groupPath: string; itemKey: string } | null {
  if (!menuPath.startsWith(parameterItemMenuPrefix)) {
    return null;
  }

  const payload = menuPath.slice(parameterItemMenuPrefix.length);
  const [encodedGroupPath, encodedItemKey] = payload.split("|");

  if (!encodedGroupPath || !encodedItemKey) {
    return null;
  }

  return {
    groupPath: decodeURIComponent(encodedGroupPath),
    itemKey: decodeURIComponent(encodedItemKey),
  };
}

function getParameterItemKey(entry: PromptParameterLexiconEntry): string {
  return normalizeLexiconItemKey(getParameterItemLabel(entry)) || "unnamed-parameter";
}

function getParameterItemLabel(entry: PromptParameterLexiconEntry): string {
  return entry.label.trim() || entry.variable.trim() || "未命名参数";
}

function normalizeLexiconItemKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-Hans-CN");
}

function getParameterEntryDedupKey(entry: PromptParameterLexiconEntry): string {
  const groupKey = getParameterGroupSegments(entry).join(" / ").toLowerCase();
  const labelKey = normalizeLexiconItemKey(entry.label);
  const valueKey = normalizeLexiconItemKey(entry.value);

  return `${groupKey}|${labelKey}|${valueKey}`;
}

function mergeParameterEntrySource(
  targetEntry: PromptParameterLexiconEntry,
  duplicateEntry: PromptParameterLexiconEntry,
): void {
  const targetSourceId = normalizeOptionalLexiconValue(targetEntry.sourcePromptId);
  const targetSourceTitle = normalizeOptionalLexiconValue(targetEntry.sourcePromptTitle);
  const duplicateSourceId = normalizeOptionalLexiconValue(duplicateEntry.sourcePromptId);
  const duplicateSourceTitle = normalizeOptionalLexiconValue(duplicateEntry.sourcePromptTitle);

  if (targetSourceId !== duplicateSourceId || targetSourceTitle !== duplicateSourceTitle) {
    targetEntry.sourcePromptId = null;
    targetEntry.sourcePromptTitle = null;
  }
}

function splitParameterGroupPath(groupPath: string): string[] {
  return groupPath
    .split(/\s*(?:\/|／|>|＞|›|»|\||｜)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function renameParameterGroupInDrafts(
  drafts: readonly PromptParameterLexiconEntry[],
  oldPath: string,
  newLabel: string,
): PromptParameterLexiconEntry[] {
  const oldSegments = splitParameterGroupPath(oldPath);
  if (oldSegments.length === 0) {
    return [...drafts];
  }
  const newSegments = [...oldSegments.slice(0, -1), newLabel];

  return drafts.map((entry) => {
    if (getPromptSectionKeyByVariable(entry.variable)) {
      return entry;
    }
    const entrySegments = splitParameterGroupPath(
      normalizePromptParameterGroupPath(entry.group || defaultParameterGroupLabel),
    );
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
    const groupCategoryKeys = new Set(labels.map(normalizeLexiconItemKey).filter(Boolean));

    for (const categoryKey of groupCategoryKeys) {
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
  const mergedEntries = [...entries];
  const existingLabelKeys = new Set(entries.map((entry) => normalizeLexiconItemKey(entry.label)).filter(Boolean));

  for (const group of groups) {
    for (const label of (labelsCache?.get(group.id) ?? getPromptGroupCategoryLabels(group))) {
      const labelKey = normalizeLexiconItemKey(label);

      if (!labelKey || existingLabelKeys.has(labelKey)) {
        continue;
      }

      existingLabelKeys.add(labelKey);
      mergedEntries.push(createDerivedCategoryLexiconEntry(label));
    }
  }

  return mergedEntries;
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
  const mergedEntries = [...entries];
  const existingLabelKeys = new Set(entries.map((entry) => normalizeLexiconItemKey(entry.label)).filter(Boolean));

  for (const group of groups) {
    for (const label of (labelsCache?.get(group.id) ?? getPromptGroupTagLabels(group))) {
      const labelKey = normalizeLexiconItemKey(label);

      if (!labelKey || existingLabelKeys.has(labelKey)) {
        continue;
      }

      existingLabelKeys.add(labelKey);
      mergedEntries.push(createDerivedTagLexiconEntry(label));
    }
  }

  return normalizeTagImageLexiconEntries(mergedEntries);
}

function createDerivedTagLexiconEntry(label: string): PromptImageLexiconEntry {
  const normalizedLabel = label.trim();

  return {
    id: `derived-tag-${normalizeLexiconItemKey(normalizedLabel)}`,
    group: getPromptTagGroup(normalizedLabel, defaultTagGroupLabel),
    label: normalizedLabel,
    description: "",
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
  const categoryKeys = getSelectedCategoryLabelKeys(entries, selectedMenuPath);

  if (categoryKeys === null) {
    return groups.length;
  }

  return groups.filter((group) => (labelsCache?.get(group.id) ?? getPromptGroupCategoryLabels(group)).some((label) => categoryKeys.has(normalizeLexiconItemKey(label))))
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
  return getPromptGroupCategoryLabels(group).length < 3;
}

function shouldAnalyzePromptGroupTags(group: PromptImageGroup): boolean {
  return getPromptGroupTagLabels(group).length < maxBatchAiTagCount;
}

function getPromptGroupCategoryLabels(group: PromptImageGroup): string[] {
  const knownCategoryKeys = new Map(photographyCategoryLabels.map((label) => [normalizeLexiconItemKey(label), label]));
  const labels: string[] = [];
  const seenKeys = new Set<string>();

  for (const item of group.items) {
    addPromptGroupCategoryLabel(labels, seenKeys, item.category, true, knownCategoryKeys);

    for (const tag of item.tags) {
      addPromptGroupCategoryLabel(labels, seenKeys, tag, false, knownCategoryKeys);
    }
  }

  return labels;
}

function getPromptGroupTagLabels(group: PromptImageGroup): string[] {
  const labels: string[] = [];
  const seenKeys = new Set<string>();

  for (const item of group.items) {
    for (const tag of item.tags) {
      const label = tag.trim();
      const key = normalizeLexiconItemKey(label);

      if (!key || seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      labels.push(label);
    }
  }

  return labels;
}

function addPromptGroupCategoryLabel(
  labels: string[],
  seenKeys: Set<string>,
  label: string,
  allowCustomLabel: boolean,
  knownCategoryKeys: ReadonlyMap<string, string>,
): void {
  const normalizedKey = normalizeLexiconItemKey(label);

  if (!normalizedKey || normalizedKey === normalizeLexiconItemKey("未分类")) {
    return;
  }

  const resolvedLabel = knownCategoryKeys.get(normalizedKey) ?? (allowCustomLabel ? label.trim() : "");
  const resolvedKey = normalizeLexiconItemKey(resolvedLabel);

  if (!resolvedLabel || seenKeys.has(resolvedKey)) {
    return;
  }

  seenKeys.add(resolvedKey);
  labels.push(resolvedLabel);
}

function buildPromptGroupCategoryPatch(
  item: PromptCardData,
  analysis: { primaryCategory: string; suggestedCategories: string[] },
): Pick<LibraryItem, "category" | "tags"> | null {
  const nextCategories = normalizeBatchCategorySuggestions([
    ...analysis.suggestedCategories,
    analysis.primaryCategory,
  ]).slice(0, 3);

  if (nextCategories.length === 0) {
    return null;
  }

  const category = nextCategories[0];
  const tags = uniqueNormalizedLabels([...item.tags, ...nextCategories.slice(1)]);

  if (normalizeLexiconItemKey(category) === normalizeLexiconItemKey(item.category) && areLabelArraysEqual(tags, item.tags)) {
    return null;
  }

  return { category, tags };
}

function buildPromptGroupTagPatch(
  item: PromptCardData,
  analysis: { suggestedTags: string[] },
): Pick<LibraryItem, "tags"> | null {
  const suggestedTags = uniqueNormalizedLabels(analysis.suggestedTags).slice(0, maxBatchAiTagCount);

  if (suggestedTags.length === 0) {
    return null;
  }

  const tags = uniqueNormalizedLabels([...item.tags, ...suggestedTags]).slice(0, maxBatchAiTagCount);

  if (areLabelArraysEqual(tags, item.tags)) {
    return null;
  }

  return { tags };
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
  const categoryKeys = getSelectedCategoryLabelKeys(entries, selectedMenuPath);

  return groups.filter((group) => {
    const matchesCategory =
      categoryKeys === null ||
      (labelsCache?.get(group.id) ?? getPromptGroupCategoryLabels(group)).some((label) => categoryKeys.has(normalizeLexiconItemKey(label)));

    return matchesCategory && matchesPromptGroupQuery(group, query);
  });
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
      tagKeys === null || (labelsCache?.get(group.id) ?? getPromptGroupTagLabels(group)).some((label) => tagKeys.has(normalizeLexiconItemKey(label)));

    return matchesTag && matchesPromptGroupQuery(group, query);
  });
}

function getSelectedCategoryLabelKeys(
  entries: readonly PromptImageLexiconEntry[],
  selectedMenuPath: string,
): Set<string> | null {
  if (selectedMenuPath === allCategoryGroupsValue) {
    return null;
  }

  if (!selectedMenuPath.startsWith(imageCategoryMenuPrefix)) {
    return new Set<string>();
  }

  const rootId = selectedMenuPath.slice(imageCategoryMenuPrefix.length);
  const relatedIds = getImageLexiconDescendantIds(entries, rootId);
  relatedIds.add(rootId);

  return new Set(
    entries
      .filter((entry) => relatedIds.has(entry.id))
      .map((entry) => normalizeLexiconItemKey(entry.label))
      .filter(Boolean),
  );
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

function createParameterSourceValue(sourcePromptId: string | null, sourcePromptTitle: string | null): string {
  return sourcePromptId ? `item:${sourcePromptId}` : `title:${sourcePromptTitle ?? ""}`;
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

function countDisplayableParameterEntries(entries: readonly PromptParameterLexiconEntry[]): number {
  return entries.reduce((count, entry) => (isDisplayableParameterEntry(entry) ? count + 1 : count), 0);
}

function isPromptParameterLexiconEntry(entry: PromptLexiconEntry): entry is PromptParameterLexiconEntry {
  return "variable" in entry;
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

function GalleryToolbar({
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

  useEffect(() => {
    return () => {
      if (masonrySizeAutoCloseTimerRef.current !== null) {
        window.clearTimeout(masonrySizeAutoCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMasonrySizeControlOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!masonrySizeControlRef.current?.contains(event.target as Node)) {
        onMasonrySizeControlOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
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

  function scheduleMasonrySizeControlClose(count: number) {
    onMasonryColumnCountCommit(count);

    if (masonrySizeAutoCloseTimerRef.current !== null) {
      window.clearTimeout(masonrySizeAutoCloseTimerRef.current);
    }

    masonrySizeAutoCloseTimerRef.current = window.setTimeout(() => {
      onMasonrySizeControlOpenChange(false);
      masonrySizeAutoCloseTimerRef.current = null;
    }, 700);
  }

  function handleMasonryModeClick() {
    if (galleryMode === "masonry") {
      onMasonrySizeControlOpenChange(!isMasonrySizeControlOpen);
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
                onChange={onMasonryColumnCountChange}
                onCommit={scheduleMasonrySizeControlClose}
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
}

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
    colorClassName: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
  },
  {
    id: "sort-updated-at",
    angle: -90,
    kind: "mode",
    label: "修改时间",
    shortLabel: "修改",
    value: "updatedAt",
    colorClassName: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
  },
  {
    id: "sort-image-size",
    angle: -30,
    kind: "mode",
    label: "尺寸大小",
    shortLabel: "尺寸",
    value: "imageSize",
    colorClassName: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
  },
  {
    id: "sort-random",
    angle: 90,
    kind: "mode",
    label: "随机排列",
    shortLabel: "随机",
    value: "random",
    colorClassName: "border-capsule-lavender-border bg-capsule-lavender text-capsule-lavender-foreground",
  },
  {
    id: "sort-asc",
    angle: 30,
    kind: "direction",
    label: "升序",
    shortLabel: "升序",
    value: "asc",
    colorClassName: "border-capsule-sage-border bg-capsule-sage text-capsule-sage-foreground",
  },
  {
    id: "sort-desc",
    angle: 150,
    kind: "direction",
    label: "降序",
    shortLabel: "降序",
    value: "desc",
    colorClassName: "border-capsule-mist-border bg-capsule-mist text-capsule-mist-foreground",
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
  const progress =
    ((clampedValue - minMasonryColumnCount) / (maxMasonryColumnCount - minMasonryColumnCount)) * 100;

  return (
    <div
      aria-label="调整瀑布流每行列数"
      className="absolute left-1/2 top-full z-30 mt-3 w-48 -translate-x-1/2 rounded-2xl border border-border bg-panel px-3 pb-2 pt-3 shadow-elevated"
      role="dialog"
    >
      <input
        aria-label="瀑布流每行列数"
        className="h-5 w-full cursor-ew-resize accent-primary"
        max={maxMasonryColumnCount}
        min={minMasonryColumnCount}
        step={1}
        type="range"
        value={clampedValue}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
      />
      <div className="relative mt-1 h-5">
        <span
          className="absolute top-0 inline-flex min-h-5 min-w-9 items-center justify-center whitespace-nowrap rounded-lg bg-foreground/70 px-2 text-xs font-semibold text-background"
          style={{
            left: `calc(8px + ${progress} * (100% - 16px) / 100)`,
            transform: `translateX(-${progress}%)`,
          }}
        >
          {clampedValue}列
        </span>
      </div>
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

function MasonryPromptGallery({
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
}

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
  selectedGroupIds?: ReadonlySet<string>;
  variant?: "full" | "compact";
  onCopyPrompt: (item: PromptCardData) => void;
  onToggleGroupSelection?: (groupId: string) => void;
  onViewDetail: (itemId: string) => void;
  onPreviewMedia?: (item: PromptCardData) => void;
};

const gridGalleryPageSize = 24;

function GridPromptGallery({
  blurNsfwImages,
  groups,
  likedImageIds,
  selectedGroupIds,
  variant = "full",
  onCopyPrompt,
  onToggleGroupSelection,
  onViewDetail,
  onPreviewMedia,
}: PromptGroupGalleryProps) {
  const likedImageIdSet = useMemo(() => new Set(likedImageIds), [likedImageIds]);
  const [visibleCount, setVisibleCount] = useState(gridGalleryPageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(gridGalleryPageSize);
  }, [groups]);

  useEffect(() => {
    if (visibleCount >= groups.length) {
      return;
    }

    const sentinel = sentinelRef.current;

    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + gridGalleryPageSize, groups.length));
        }
      },
      { rootMargin: "600px" },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [groups.length, visibleCount]);

  const visibleGroups = visibleCount >= groups.length ? groups : groups.slice(0, visibleCount);

  return (
    <>
      <div
        className={
          variant === "compact"
            ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-3"
            : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,230px),1fr))] gap-4"
        }
      >
        {visibleGroups.map((group, index) => (
          <GridPromptTile
            blurNsfwImages={blurNsfwImages}
            group={group}
            isSelected={selectedGroupIds?.has(group.id) ?? false}
            key={group.id}
            likedImageIdSet={likedImageIdSet}
            onCopyPrompt={() => onCopyPrompt(group.primaryItem)}
            onPreviewMedia={onPreviewMedia ? () => onPreviewMedia(group.primaryItem) : undefined}
            onToggleSelection={onToggleGroupSelection ? () => onToggleGroupSelection(group.id) : undefined}
            priorityImages={index < 8}
            tone={promptSiteCardToneClassNames[index % promptSiteCardToneClassNames.length]}
            variant={variant}
            onViewDetail={() => onViewDetail(group.primaryItem.id)}
          />
        ))}
      </div>
      {visibleCount < groups.length ? <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" /> : null}
    </>
  );
}

function GridPromptTile({
  blurNsfwImages,
  group,
  isSelected,
  likedImageIdSet,
  onCopyPrompt,
  onPreviewMedia,
  onToggleSelection,
  priorityImages,
  tone,
  variant,
  onViewDetail,
}: {
  blurNsfwImages: boolean;
  group: PromptImageGroup;
  isSelected: boolean;
  likedImageIdSet: ReadonlySet<string>;
  onCopyPrompt: () => void;
  onPreviewMedia?: () => void;
  onToggleSelection?: () => void;
  priorityImages: boolean;
  tone: PromptSiteCardToneClassNames;
  variant: "full" | "compact";
  onViewDetail: () => void;
}) {
  const item = group.primaryItem;
  const isCompact = variant === "compact";
  const visibleTags = isCompact ? [] : item.tags.slice(0, gridVisibleTagCount);
  const hiddenTagCount = isCompact ? 0 : Math.max(0, item.tags.length - visibleTags.length);
  const hasLikedImage = !isCompact && group.items.some((groupItem) => likedImageIdSet.has(groupItem.id));
  const promptPreview = isCompact ? "" : buildPromptText(item);
  const sourceText = isCompact ? "" : getPromptSourceText(item);

  return (
    <article
      className={`group/tile min-w-0 overflow-hidden rounded-xl border bg-panel shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-image focus-within:-translate-y-1 focus-within:shadow-image ${
        isSelected ? "border-primary bg-primary-soft shadow-image" : tone.article
      }`}
    >
      <header className={`flex min-h-12 items-center border-b px-3 py-2 ${tone.header}`}>
        <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-current">
          {item.title || "未命名提示词"}
        </h2>
      </header>

      <div
        className="group relative block aspect-[4/3] w-full overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary/35 min-[1100px]:aspect-square"
      >
        <GridPromptMosaic
          blurNsfwImages={blurNsfwImages}
          images={group.previewItems}
          onActivate={onViewDetail}
          onPreview={onPreviewMedia}
          priorityImages={priorityImages}
          title={item.title || "提示词效果图"}
        />
        {onToggleSelection ? (
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
              onToggleSelection();
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
              onToggleSelection ? "left-12" : "left-2"
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
                  <span className={`rounded-lg border px-2 py-1 text-xs ${tone.tag}`} key={tag}>
                    {tag}
                  </span>
                ))}
                {hiddenTagCount > 0 ? (
                  <span className={`rounded-lg border px-2 py-1 text-xs ${tone.tag}`}>
                    +{hiddenTagCount}
                  </span>
                ) : null}
              </>
            ) : (
              <span className={`rounded-lg border px-2 py-1 text-xs ${tone.tag}`}>
                {item.category}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <TileActionButton icon={<Eye size={14} />} label="查看详情" onClick={onViewDetail} />
            <TileActionButton icon={<Copy size={14} />} label="复制提示词" primary onClick={onCopyPrompt} />
          </div>
        </div>
      )}
    </article>
  );
}

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

type LibraryRootsDialogProps = {
  isBusy: boolean;
  roots: readonly LibraryRoot[];
  onAdd: () => void;
  onClose: () => void;
  onRemap: (rootId: string) => void;
  onRemove: (rootId: string) => void;
  onScan: (rootId: string) => void;
  onWatchChange: (rootId: string, enabled: boolean) => void;
  onValidate: () => void;
};

function LibraryRootsDialog({
  isBusy,
  roots,
  onAdd,
  onClose,
  onRemap,
  onRemove,
  onScan,
  onWatchChange,
  onValidate,
}: LibraryRootsDialogProps) {
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
        {roots.length > 0 ? (
          roots.map((root) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background px-3 py-3" key={root.id}>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
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
                      className={`absolute left-0 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform ${
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
          ))
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
  { hosts: ["jimeng.jianying.com"], label: "即梦AI" },
  { hosts: ["civitai.red", "civitai.com"], label: "civitai（C站）" },
  { hosts: ["liblib.art"], label: "LibLibAI" },
  { hosts: ["youmind.com"], label: "YouMind" },
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


type LogExportSelection = {
  minLevel: LogExportLevel;
  range: LogExportRange;
  format: LogExportFormat;
};

type LogExportDialogProps = {
  activeAction: "save" | "feedback" | null;
  onClose: () => void;
  onExport: (options: LogExportSelection) => void;
  onFeedback: (options: LogExportSelection) => void;
};

function LogExportDialog({
  activeAction,
  onClose,
  onExport,
  onFeedback,
}: LogExportDialogProps) {
  const [minLevel, setMinLevel] = useState<LogExportLevel>("ERROR");
  const [range, setRange] = useState<LogExportRange>("all");
  const [format, setFormat] = useState<LogExportFormat>("txt");
  const isExporting = activeAction !== null;
  const selection = { minLevel, range, format };

  return (
    <AppDialog
      overlayClassName="z-50 px-6 py-8"
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="log-export-dialog-title"
      onClose={() => {
        if (!isExporting) {
          onClose();
        }
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold" id="log-export-dialog-title">
            <ScrollText className="text-primary" size={18} />
            导出应用日志
          </h2>
          <p className="mt-1 text-sm text-muted">选择日志范围后，可保存到本地或直接用于 GitHub 反馈。</p>
        </div>
        <DialogCloseButton
          onClick={() => {
            if (!isExporting) {
              onClose();
            }
          }}
        />
      </header>

      <div className="grid gap-4 overflow-y-auto px-5 py-4">
        <div className="rounded-xl border border-border bg-background p-3 text-sm leading-6 text-muted">
          默认筛选错误日志。TXT 便于阅读，ZIP 便于反馈；点击反馈会自动生成 ZIP、打开 Issue，并选中文件供拖入附件。
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">日志级别</legend>
          <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
            {(
              [
                ["ERROR", "错误及以上"],
                ["WARN", "警告及以上"],
                ["INFO", "信息及以上"],
                ["DEBUG", "全部调试"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  minLevel === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-panel text-muted hover:border-primary/40 hover:text-foreground"
                }`}
                disabled={isExporting}
                type="button"
                onClick={() => setMinLevel(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">时间范围</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["today", "今天"],
                ["7d", "近 7 天"],
                ["all", "全部"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  range === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-panel text-muted hover:border-primary/40 hover:text-foreground"
                }`}
                disabled={isExporting}
                type="button"
                onClick={() => setRange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">导出格式</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["txt", "TXT 文本"],
                ["zip", "ZIP 日志包"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  format === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-panel text-muted hover:border-primary/40 hover:text-foreground"
                }`}
                disabled={isExporting}
                type="button"
                onClick={() => setFormat(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
        <Button
          disabled={isExporting}
          type="button"
          variant="ghost"
          onClick={() => {
            if (!isExporting) {
              onClose();
            }
          }}
        >
          取消
        </Button>
        <Button
          disabled={isExporting}
          icon={<ScrollText size={16} />}
          type="button"
          variant="secondary"
          onClick={() => onExport(selection)}
        >
          {activeAction === "save" ? "导出中..." : "导出日志"}
        </Button>
        <Button
          disabled={isExporting}
          icon={<ExternalLink size={16} />}
          type="button"
          variant="primary"
          onClick={() => onFeedback(selection)}
        >
          {activeAction === "feedback" ? "准备反馈中..." : "去 GitHub 反馈"}
        </Button>
      </footer>
    </AppDialog>
  );
}
