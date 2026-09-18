import type { BuiltinModuleState } from "../utils/moduleRegistry";
import type { CanvasDraftSettings } from "./canvas";
import type { PromptViewSettings } from "../../prompts/types";
import type { AppLanguage } from "../../../types/locale";
import type { VisualLifeSettings } from "../utils/visualLife";
import type {
  CategoryAssignmentSource,
  CategoryCandidateProposal,
  CategoryInboxItem,
  CategoryLearningEvent,
  CategoryTaxonomy,
} from "./category";

export type NsfwRating = "unknown" | "safe" | "nsfw";
export type NsfwGradingSpeed = "stable" | "fast" | "turbo";
export type NsfwDetectionMode = "local-first" | "remote-only" | "local-only";
export type PromptContentType = "image" | "video";
export type RemoteImageStatus = "pending" | "downloaded";
export type NetworkMaterialImportMode = "download" | "link" | "ask";

/** Media copied into SuYan's managed images directory, or indexed in a user-owned directory. */
export type ExternalMediaStorage = {
  kind: "external";
  rootId: string;
  relativePath: string;
  size?: number | null;
  mtimeMs?: number | null;
  status?: ExternalMediaStatus;
};

export type ExternalMediaStatus = "available" | "missing";

export type MediaStorage = "managed" | ExternalMediaStorage;

export type LibraryRoot = {
  id: string;
  label: string;
  absolutePath: string;
  recursive: boolean;
  /** Missing in legacy roots files means watching is disabled. */
  watchEnabled?: boolean;
  lastScanAt: string | null;
  status?: ExternalMediaStatus;
};

export type VideoKeyframe = {
  imageFileName: string;
  atSec: number;
  label: string;
};

export type LibraryItem = {
  id: string;
  title: string;
  imageFileName: string;
  /** Missing in persisted v1 files means managed for backward compatibility. */
  mediaStorage?: MediaStorage;
  prompt: string;
  negativePrompt: string;
  /**
   * Legacy display/label field kept for compatibility with v0.1.0 data and share packages.
   * Prefer categoryId for assignment; category is kept in sync as the resolved label.
   */
  category?: string | null;
  /** Stable taxonomy id (system:/custom:/ai:...). Null/undefined means uncategorized. */
  categoryId?: string | null;
  /**
   * Multi-genre assignments (Photography Genre Ontology).
   * Primary remains categoryId; genreIds may include primary + secondary genres.
   * Example: 手表广告 → [产品摄影, 微距摄影]
   */
  genreIds?: string[] | null;
  /** 0–1 confidence for AI assignment; user assignment should be 1. */
  categoryConfidence?: number | null;
  /** Who last set the category. */
  categorySource?: CategoryAssignmentSource | null;
  /** Original freeform label before taxonomy migration, if any. */
  legacyCategory?: string | null;
  tags: string[];
  generationMethod?: string | null;
  promptType?: PromptContentType;
  sourceUrl?: string | null;
  remoteImageUrl?: string | null;
  remoteImageStatus?: RemoteImageStatus | null;
  authorName?: string | null;
  authorUrl?: string | null;
  authorAvatarUrl?: string | null;
  /** 已登录账户的稳定 UID；缺失表示本地素材或旧数据。 */
  accountOwnerUid?: string | null;
  nsfwRating?: NsfwRating;
  nsfwCheckedAt?: string | null;
  videoDurationSec?: number | null;
  videoPosterFileName?: string | null;
  videoKeyframes?: VideoKeyframe[];
  videoReferenceImages?: string[];
  videoFramesGeneratedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LibraryFile = {
  /** 1 = legacy string category only; 2 = categoryId taxonomy assignment. */
  schemaVersion: 1 | 2;
  updatedAt: string;
  items: LibraryItem[];
  /** Optional embedded taxonomy snapshot (also stored in view-settings). */
  categoryTaxonomy?: CategoryTaxonomy | null;
};

export type ThemeMode = "light" | "dark";
export type ThemeAccent =
  | "coral"
  | "sage"
  | "mist"
  | "clay"
  | "lavender"
  | "fog"
  | "rose"
  | "sand"
  | "stone"
  | "custom"
  | "custom1"
  | "custom2"
  | "custom3";
export type ThemeCustomAccentSlot = "custom1" | "custom2" | "custom3";
export type ThemePreset =
  | "custom"
  | "raycast"
  | "notion"
  | "one"
  | "proof"
  | "rose-pine"
  | "solarized"
  | "vercel"
  | "vs-code-plus"
  | "xcode";

export type ThemeCustomTheme = {
  /** 全局角色色覆盖；空值使用当前预设的协调配色。 */
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  navigationColor: string;
  backgroundColor: string;
  workspaceColor: string;
  accentColor: string;
  backgroundImageFileName: string | null;
};

export type ThemeAccentMemory = {
  accent: ThemeAccent;
  customAccents: [string, string, string];
};

export type ThemeAccentMemoryByPreset = Partial<Record<ThemePreset, ThemeAccentMemory>>;

/** 可在系统设置中控制的主边栏入口。素材浏览与系统设置始终保留。 */
export type SidebarEntryId =
  | "home"
  | "categoryLexicon"
  | "tagLexicon"
  | "importMaterial"
  | "libraryRoots"
  | "promptLibrary"
  | "textPrompts"
  | "todo"
  | "canvas"
  | "webAssistant"
  | "promptSites"
  | "aiSettings"
  | "nsfwSettings"
  | "systemPreferences"
  | "logExport"
  | "account"
  | "appearance"
  | "about";

export type SidebarEntryVisibility = Record<SidebarEntryId, boolean>;

export const defaultWorkspaceWidthPercent = 88;
export const minWorkspaceWidthPercent = 70;
export const maxWorkspaceWidthPercent = 100;

export function normalizeWorkspaceWidthPercent(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return defaultWorkspaceWidthPercent;
  }

  return Math.min(
    maxWorkspaceWidthPercent,
    Math.max(minWorkspaceWidthPercent, Math.round(input)),
  );
}

export type PromptImageLexiconEntry = import("./tagKnowledge").TagKnowledge & {
  id: string;
  group: string;
  label: string;
  description: string;
  parentId?: string | null;
  imageFileName?: string | null;
};

export type PromptLexiconSettings = {
  categories: PromptImageLexiconEntry[];
  tags: PromptImageLexiconEntry[];
};

export type PromptLexiconKind = keyof PromptLexiconSettings;
export type PromptLexiconEntry = PromptImageLexiconEntry;

export type MaterialBrowserCollectionMode = "all" | "featured";
export type MaterialBrowserGalleryMode = "masonry" | "grid";
export type MaterialBrowserSortMode = "importedAt" | "updatedAt" | "imageSize" | "random";
export type MaterialBrowserSortDirection = "asc" | "desc";

export type CategoryWorkspaceState = {
  taxonomy: CategoryTaxonomy | null;
  inbox: CategoryInboxItem[];
  candidates: CategoryCandidateProposal[];
  learningEvents: CategoryLearningEvent[];
};

export type LibraryViewSettings = {
  /** 软件界面语言；缺失时兼容旧版本并使用简体中文。 */
  language: AppLanguage;
  /** 创作页外层背景（不含导航和生成卡片）；旧设置缺失时保留默认柔雾。 */
  canvasBackground?: import("../utils/canvasBackground").CanvasBackgroundSettings;
  canvasDraft: CanvasDraftSettings;
  tagOrder: string[];
  likedImageIds: string[];
  /** 资源推荐卡片的星标（按 URL 记录），星标项在所属分类内前置。 */
  starredRecommendations: string[];
  /** 网页助手「我的网址」保存的自定义网址（按提交顺序，新的在前）。 */
  webAssistantCustomUrls: string[];
  /** 网页助手上次选择的平台 id（持久化，替代 localStorage）。 */
  webAssistantLastPlatform: string | null;
  /** 网页助手上次使用的自定义网址（持久化，替代 localStorage）。 */
  webAssistantLastCustomUrl: string | null;
  generationModelOrder: string[];
  hiddenGenerationModels: string[];
  themeMode: ThemeMode;
  /** 主题预设；缺失时兼容旧设置并回退到 Proof。 */
  themePreset: ThemePreset;
  /** 按钮与交互强调色；缺失时兼容旧设置并回退到 Proof 的鼠尾草色。 */
  themeAccent: ThemeAccent;
  /** 旧版主题不透明度兼容字段，保存时等同于导航区不透明度。 */
  themeOpacity: number;
  /** 导航区（标题栏与边栏）不透明度百分比。 */
  themeNavigationOpacity: number;
  /** 背景层不透明度百分比。 */
  themeBackgroundOpacity: number;
  /** 工作区不透明度百分比。 */
  themeWorkspaceOpacity: number;
  /** 主要按钮与交互强调色的不透明度百分比。 */
  themeAccentOpacity: number;
  /** 自定义按钮颜色的旧版别名，始终对应 themeCustomAccents[0]。 */
  themeCustomAccent: string;
  /** 三个独立的自定义按钮颜色槽位。 */
  themeCustomAccents: [string, string, string];
  /** 按主题预设隔离保存的强调色和自定义颜色槽位。 */
  themeAccentMemory: ThemeAccentMemoryByPreset;
  /** 自定义主题的颜色和背景图设置。 */
  customTheme: ThemeCustomTheme;
  /** 素材卡片悬停时的轻量视觉生命效果。 */
  visualLife: VisualLifeSettings;
  /** 居中工作区相对于内容区域的宽度比例。 */
  workspaceWidthPercent: number;
  /** 主边栏入口的显示状态；素材浏览与系统设置由归一化逻辑强制启用。 */
  sidebarEntryVisibility: SidebarEntryVisibility;
  /** 已完成或跳过的页面功能引导 id；缺失时兼容旧版本并从未完成开始。 */
  featureGuideCompleted?: string[];
  /** 已确认版本级欢迎/更新引导的应用版本；缺失时按新安装或旧版本升级处理。 */
  featureGuideVersion?: string | null;
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
  moduleState: BuiltinModuleState;
  /** Unified category taxonomy + inbox/candidates for AI-driven maintenance. */
  categoryWorkspace?: CategoryWorkspaceState | null;
  promptViewSettings: PromptViewSettings;
};
