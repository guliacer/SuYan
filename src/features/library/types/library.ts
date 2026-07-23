import type { BuiltinModuleState } from "../utils/moduleRegistry";

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
};

export type MediaStorage = "managed" | ExternalMediaStorage;

export type LibraryRoot = {
  id: string;
  label: string;
  absolutePath: string;
  recursive: boolean;
  lastScanAt: string | null;
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
  category?: string | null;
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
  schemaVersion: 1;
  updatedAt: string;
  items: LibraryItem[];
};

export type ThemeMode = "light" | "dark";

export type PromptParameterLexiconEntry = {
  id: string;
  group: string;
  label: string;
  sourcePromptId?: string | null;
  sourcePromptTitle?: string | null;
  variable: string;
  value: string;
};

export type PromptImageLexiconEntry = {
  id: string;
  group: string;
  label: string;
  description: string;
  parentId?: string | null;
  imageFileName?: string | null;
};

export type PromptLexiconSettings = {
  parameters: PromptParameterLexiconEntry[];
  categories: PromptImageLexiconEntry[];
  tags: PromptImageLexiconEntry[];
};

export type PromptLexiconKind = keyof PromptLexiconSettings;
export type PromptLexiconEntry = PromptParameterLexiconEntry | PromptImageLexiconEntry;

export type MaterialBrowserCollectionMode = "all" | "featured";
export type MaterialBrowserGalleryMode = "masonry" | "grid";
export type MaterialBrowserSortMode = "importedAt" | "updatedAt" | "imageSize" | "random";
export type MaterialBrowserSortDirection = "asc" | "desc";

export type LibraryViewSettings = {
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
  moduleState: BuiltinModuleState;
};
