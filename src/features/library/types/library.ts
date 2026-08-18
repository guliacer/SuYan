import type { BuiltinModuleState } from "../utils/moduleRegistry";
import type { CanvasDraftSettings } from "./canvas";
import type {
  CategoryAssignmentSource,
  CategoryCandidateProposal,
  CategoryInboxItem,
  CategoryLearningEvent,
  CategoryTaxonomy,
} from "./category";

export type NsfwRating = "unknown" | "safe" | "nsfw";
export type NsfwGradingSpeed = "stable" | "fast" | "turbo";
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

export type PromptImageLexiconEntry = {
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
  canvasDraft: CanvasDraftSettings;
  tagOrder: string[];
  likedImageIds: string[];
  /** 资源推荐卡片的星标（按 URL 记录），星标项在所属分类内前置。 */
  starredRecommendations: string[];
  /** 网页助手「我的网址」保存的自定义网址（按提交顺序，新的在前）。 */
  webAssistantCustomUrls: string[];
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
  materialBrowserScrollTop: number;
  networkMaterialImportMode: NetworkMaterialImportMode;
  promptLexicons: PromptLexiconSettings | null;
  moduleState: BuiltinModuleState;
  /** Unified category taxonomy + inbox/candidates for AI-driven maintenance. */
  categoryWorkspace?: CategoryWorkspaceState | null;
};
