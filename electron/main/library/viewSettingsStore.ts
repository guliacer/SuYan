import fs from "node:fs/promises";
import { writeLibraryJsonAtomically } from "./libraryJsonPersistence";
import { normalizeTagKnowledge } from "../../../src/features/library/utils/tagKnowledge";
import type {
  LibraryViewSettings,
  MaterialBrowserCollectionMode,
  MaterialBrowserGalleryMode,
  MaterialBrowserSortDirection,
  MaterialBrowserSortMode,
  NetworkMaterialImportMode,
  PromptImageLexiconEntry,
  PromptLexiconEntry,
  PromptLexiconSettings,
  ThemeMode,
  CategoryWorkspaceState,
} from "../../../src/features/library/types/library";
import type { CategoryTaxonomy } from "../../../src/features/library/types/category";
import type { PromptViewSettings } from "../../../src/features/prompts/types";
import { defaultAppLanguage, normalizeAppLanguage, isAppLanguage } from "../../../src/types/locale";
import { createEmptyCategoryTaxonomy } from "../../../src/features/library/utils/categoryTaxonomy";
import { defaultCanvasDraftSettings, normalizeCanvasDraftSettings } from "../../../src/features/library/utils/canvasGeneration";
import type { BuiltinModuleStatePatch } from "../../../src/features/library/utils/moduleRegistry";
import {
  normalizeWorkspaceWidthPercent,
} from "../../../src/features/library/types/library";
import {
  isBuiltinModuleState,
  resolveBuiltinModuleState,
} from "../../../src/features/library/utils/moduleRegistry";
import {
  isSidebarEntryVisibility,
  normalizeSidebarEntryVisibility,
} from "../../../src/features/library/utils/sidebarEntries";
import {
  defaultNsfwGradingSpeed,
  isNsfwGradingSpeed,
  normalizeNsfwGradingSpeed,
} from "../../../src/features/library/utils/nsfwGradingSpeed";
import {
  isNsfwDetectionMode,
  normalizeNsfwDetectionMode,
} from "../../../src/features/library/utils/nsfwDetectionMode";
import {
  DEFAULT_THEME_PRESET,
  DEFAULT_THEME_OPACITY,
  DEFAULT_THEME_ACCENT_OPACITY,
  DEFAULT_THEME_CUSTOM_ACCENTS,
  isThemePreset,
  resolveThemePreset,
  isThemeAccent,
  normalizeThemeCustomAccents,
  normalizeThemeOpacity,
  normalizeThemeAccentOpacity,
  normalizeThemeCustomTheme,
  normalizeThemeAccentMemory,
  createDefaultThemeAccentMemory,
  getDefaultThemeAccentForPreset,
  resolveThemeAccent,
} from "../../../src/features/library/utils/themeMode";
import { AppError } from "../ipc/errors";
import {
  getCategoryLexiconPath,
  getLibraryDataDir,
  getLibraryViewSettingsPath,
  getTagLexiconPath,
} from "./libraryPaths";

import { normalizeCanvasBackground } from "../../../src/features/library/utils/canvasBackground";
import {
  defaultVisualLifeSettings,
  isVisualLifeEffectId,
  normalizeVisualLifeSettings,
} from "../../../src/features/library/utils/visualLife";
import type { VisualLifeSettings } from "../../../src/features/library/utils/visualLife";

const defaultMasonryColumnCount = 4;
let settingsWriteQueue: Promise<unknown> = Promise.resolve();
export function withViewSettingsWriteLock<T>(work: () => Promise<T>): Promise<T> {
  const task = settingsWriteQueue.then(work, work);
  settingsWriteQueue = task.catch(() => undefined);
  return task;
}
const minMasonryColumnCount = 2;
const maxMasonryColumnCount = 10;

export async function readLibraryViewSettings(): Promise<LibraryViewSettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  const [content, categoryLexicon, tagLexicon] = await Promise.all([
    readJsonFile(getLibraryViewSettingsPath()),
    readJsonFile(getCategoryLexiconPath()),
    readJsonFile(getTagLexiconPath()),
  ]);

  const settings = normalizeLibraryViewSettings(content);
  const legacyLexicons = readLegacyLexiconsFromSettings(content);

  // One-time migration: older versions stored both lexicons inside view-settings.json.
  // Split them into standalone files and persist the cleaned settings so the next
  // read does not pay the migration path again.
  if (legacyLexicons) {
    const migrated = normalizeLibraryViewSettings({
      ...settings,
      promptLexicons: legacyLexicons,
    });
    await Promise.all([
      writeLexiconFile(getCategoryLexiconPath(), migrated.promptLexicons?.categories ?? []),
      writeLexiconFile(getTagLexiconPath(), migrated.promptLexicons?.tags ?? []),
    ]);
    await writeLibraryViewSettingsCore(migrated);
    return migrated;
  }

  // Standalone files win when present; they are the source of truth for the current
  // version. Missing files fall back to the legacy field (already migrated above).
  const categories = categoryLexicon === null ? [] : (categoryLexicon as unknown[]).map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry);
  const tags = tagLexicon === null ? [] : (tagLexicon as unknown[]).map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry);

  return normalizeLibraryViewSettings({
    ...settings,
    promptLexicons: { categories, tags },
  });
}

export function writeLibraryViewSettings(settings: LibraryViewSettings): Promise<LibraryViewSettings> {
  return withViewSettingsWriteLock(() => writeLibraryViewSettingsUnlocked(settings));
}

/** Caller must hold withViewSettingsWriteLock for the entire transaction, including rollback. */
export async function writeLibraryViewSettingsUnlocked(
  settings: LibraryViewSettings,
): Promise<LibraryViewSettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  if (!isLibraryViewSettings(settings)) {
    throw new AppError("VIEW_SETTINGS_INVALID", "视图设置结构不合法。");
  }

  const normalized = normalizeLibraryViewSettings(settings);
  const { categories, tags } = normalized.promptLexicons ?? { categories: [], tags: [] };

  // Finish each write before reporting failure, so a caller can safely roll back.
  await writeLexiconFile(getCategoryLexiconPath(), categories);
  await writeLexiconFile(getTagLexiconPath(), tags);
  await writeLibraryViewSettingsCore(normalized);

  return normalized;
}

async function writeLibraryViewSettingsCore(settings: LibraryViewSettings): Promise<void> {
  const { promptLexicons: _promptLexicons, ...mainSettings } = settings;
  const tempPath = `${getLibraryViewSettingsPath()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(mainSettings, null, 2), "utf8");
  await fs.rename(tempPath, getLibraryViewSettingsPath());
}

async function writeLexiconFile(filePath: string, entries: readonly PromptImageLexiconEntry[]): Promise<void> {
  // Keep the same rotating recovery copies as the main library JSON.
  await writeLibraryJsonAtomically(filePath, JSON.stringify(entries, null, 2));
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readLegacyLexiconsFromSettings(input: unknown): PromptLexiconSettings | null {
  if (!isRecord(input) || input.promptLexicons === null || input.promptLexicons === undefined) {
    return null;
  }

  const legacy = input.promptLexicons;
  if (!isRecord(legacy)) {
    return null;
  }

  const categories = Array.isArray(legacy.categories) ? legacy.categories : [];
  const tags = Array.isArray(legacy.tags) ? legacy.tags : [];
  if (categories.length === 0 && tags.length === 0) {
    return null;
  }

  return {
    categories: categories.map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry),
    tags: tags.map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry),
  };
}

export function normalizeLibraryViewSettings(input: unknown): LibraryViewSettings {
  if (!isRecord(input)) {
    return createDefaultViewSettings();
  }

  const normalizedCustomAccents = normalizeThemeCustomAccents(input.themeCustomAccents, input.themeCustomAccent);
  const themePreset = resolveThemePreset(input.themePreset);
  const legacyAccent = input.themeAccent === undefined
    ? getDefaultThemeAccentForPreset(themePreset)
    : resolveThemeAccent(input.themeAccent);
  const themeAccentMemory = {
    ...createDefaultThemeAccentMemory(),
    ...normalizeThemeAccentMemory(input.themeAccentMemory),
  };
  if (!isRecord(input.themeAccentMemory) || !isRecord(input.themeAccentMemory[themePreset])) {
    themeAccentMemory[themePreset] = {
      accent: legacyAccent,
      customAccents: normalizedCustomAccents,
    };
  }
  const currentMemory = themeAccentMemory[themePreset];
  const normalizedCustomTheme = normalizeThemeCustomTheme(input.customTheme);

  return {
    language: normalizeAppLanguage(input.language),
    canvasDraft: normalizeCanvasDraftSettings(input.canvasDraft),
    canvasBackground: normalizeCanvasBackground(input.canvasBackground),
    tagOrder: Array.isArray(input.tagOrder) ? uniqueStrings(input.tagOrder) : [],
    likedImageIds: Array.isArray(input.likedImageIds) ? uniqueStrings(input.likedImageIds) : [],
    starredRecommendations: Array.isArray(input.starredRecommendations) ? uniqueStrings(input.starredRecommendations) : [],
    webAssistantCustomUrls: Array.isArray(input.webAssistantCustomUrls) ? uniqueStrings(input.webAssistantCustomUrls) : [],
    webAssistantLastPlatform: normalizeOptionalString(input.webAssistantLastPlatform) || null,
    webAssistantLastCustomUrl: normalizeOptionalString(input.webAssistantLastCustomUrl) || null,
    generationModelOrder: Array.isArray(input.generationModelOrder) ? uniqueStrings(input.generationModelOrder) : [],
    hiddenGenerationModels: Array.isArray(input.hiddenGenerationModels) ? uniqueStrings(input.hiddenGenerationModels) : [],
    themeMode: normalizeThemeMode(input.themeMode),
    themePreset,
    themeAccent: currentMemory?.accent ?? getDefaultThemeAccentForPreset(themePreset),
    themeOpacity: normalizeThemeOpacity(input.themeOpacity ?? input.themeNavigationOpacity),
    themeNavigationOpacity: normalizeThemeOpacity(input.themeNavigationOpacity ?? input.themeOpacity),
    themeBackgroundOpacity: normalizeThemeOpacity(input.themeBackgroundOpacity ?? input.themeOpacity),
    themeWorkspaceOpacity: normalizeThemeOpacity(input.themeWorkspaceOpacity ?? input.themeOpacity),
    themeAccentOpacity: normalizeThemeAccentOpacity(input.themeAccentOpacity),
    themeCustomAccents: currentMemory?.customAccents ?? normalizedCustomAccents,
    themeCustomAccent: (currentMemory?.customAccents ?? normalizedCustomAccents)[0],
    themeAccentMemory,
    customTheme: normalizedCustomTheme,
    visualLife: normalizeVisualLifeSettings(input.visualLife as Partial<VisualLifeSettings> | undefined),
    workspaceWidthPercent: normalizeWorkspaceWidthPercent(input.workspaceWidthPercent),
    sidebarEntryVisibility: normalizeSidebarEntryVisibility(input.sidebarEntryVisibility),
    featureGuideCompleted: Array.isArray(input.featureGuideCompleted)
      ? uniqueStrings(input.featureGuideCompleted.filter((guideId): guideId is string => typeof guideId === "string"))
      : [],
    featureGuideVersion:
      typeof input.featureGuideVersion === "string" && input.featureGuideVersion.trim().length > 0
        ? input.featureGuideVersion.trim()
        : null,
    autoNsfwGrading: input.autoNsfwGrading === true,
    blurNsfwImages: input.blurNsfwImages === true,
    nsfwGradingSpeed: normalizeNsfwGradingSpeed(input.nsfwGradingSpeed),
    nsfwDetectionMode: normalizeNsfwDetectionMode(input.nsfwDetectionMode),
    masonryTileWidth: normalizeMasonryTileWidth(input.masonryTileWidth),
    materialBrowserCollectionMode: normalizeMaterialBrowserCollectionMode(input.materialBrowserCollectionMode),
    materialBrowserGalleryMode: normalizeMaterialBrowserGalleryMode(input.materialBrowserGalleryMode),
    materialBrowserSortMode: normalizeMaterialBrowserSortMode(input.materialBrowserSortMode),
    materialBrowserSortDirection: normalizeMaterialBrowserSortDirection(input.materialBrowserSortDirection),
    materialBrowserRandomSeed: normalizeMaterialBrowserRandomSeed(input.materialBrowserRandomSeed),
    materialBrowserScrollTop: normalizeMaterialBrowserScrollTop(input.materialBrowserScrollTop),
    networkMaterialImportMode: normalizeNetworkMaterialImportMode(input.networkMaterialImportMode),
    promptLexicons:
      input.promptLexicons === null || input.promptLexicons === undefined
        ? null
        : normalizePromptLexiconSettings(input.promptLexicons),
    moduleState: normalizeBuiltinModuleState(input.moduleState),
    categoryWorkspace: normalizeCategoryWorkspace(input.categoryWorkspace),
    promptViewSettings: normalizePromptViewSettings(input.promptViewSettings),
  };
}

function isLibraryViewSettings(input: unknown): input is LibraryViewSettings {
  return (
    isRecord(input) &&
    (input.language === undefined || isAppLanguage(input.language)) &&
    isRecord(input.canvasDraft) &&
    Array.isArray(input.tagOrder) &&
    input.tagOrder.every((tag) => typeof tag === "string") &&
    Array.isArray(input.likedImageIds) &&
    input.likedImageIds.every((itemId) => typeof itemId === "string") &&
    (input.starredRecommendations === undefined ||
      (Array.isArray(input.starredRecommendations) &&
        input.starredRecommendations.every((url) => typeof url === "string"))) &&
    (input.webAssistantCustomUrls === undefined ||
      (Array.isArray(input.webAssistantCustomUrls) &&
        input.webAssistantCustomUrls.every((url) => typeof url === "string"))) &&
    (input.webAssistantLastPlatform === undefined ||
      input.webAssistantLastPlatform === null ||
      typeof input.webAssistantLastPlatform === "string") &&
    (input.webAssistantLastCustomUrl === undefined ||
      input.webAssistantLastCustomUrl === null ||
      typeof input.webAssistantLastCustomUrl === "string") &&
    Array.isArray(input.generationModelOrder) &&
    input.generationModelOrder.every((model) => typeof model === "string") &&
    Array.isArray(input.hiddenGenerationModels) &&
    input.hiddenGenerationModels.every((model) => typeof model === "string") &&
    isThemeMode(input.themeMode) &&
    (input.themePreset === undefined || isThemePreset(input.themePreset)) &&
    (input.themeAccent === undefined || isThemeAccent(input.themeAccent)) &&
    (input.themeCustomAccent === undefined || typeof input.themeCustomAccent === "string") &&
    (input.themeOpacity === undefined || (typeof input.themeOpacity === "number" && Number.isFinite(input.themeOpacity))) &&
    (input.themeAccentOpacity === undefined || (typeof input.themeAccentOpacity === "number" && Number.isFinite(input.themeAccentOpacity))) &&
    (input.themeNavigationOpacity === undefined || (typeof input.themeNavigationOpacity === "number" && Number.isFinite(input.themeNavigationOpacity))) &&
    (input.themeBackgroundOpacity === undefined || (typeof input.themeBackgroundOpacity === "number" && Number.isFinite(input.themeBackgroundOpacity))) &&
    (input.themeWorkspaceOpacity === undefined || (typeof input.themeWorkspaceOpacity === "number" && Number.isFinite(input.themeWorkspaceOpacity))) &&
    (input.themeCustomAccents === undefined || (Array.isArray(input.themeCustomAccents) && input.themeCustomAccents.every((accent) => typeof accent === "string"))) &&
    (input.themeAccentMemory === undefined || isRecord(input.themeAccentMemory)) &&
    (input.customTheme === undefined || isRecord(input.customTheme)) &&
    (input.visualLife === undefined || (
      isRecord(input.visualLife) &&
      typeof input.visualLife.enabled === "boolean" &&
      (input.visualLife.sheenEnabled === undefined || typeof input.visualLife.sheenEnabled === "boolean") &&
      (input.visualLife.outerEffectsEnabled === undefined || typeof input.visualLife.outerEffectsEnabled === "boolean") &&
      typeof input.visualLife.reduced === "boolean" &&
      (input.visualLife.mode === "smart" || input.visualLife.mode === "custom" || input.visualLife.mode === "random" || input.visualLife.mode === "static") &&
      (input.visualLife.intensity === "low" || input.visualLife.intensity === "standard" || input.visualLife.intensity === "dreamy" || input.visualLife.intensity === "immersive") &&
      Array.isArray(input.visualLife.effectPool) &&
      input.visualLife.effectPool.every(isVisualLifeEffectId)
    )) &&
    (input.canvasBackground === undefined || isRecord(input.canvasBackground)) &&
    (input.workspaceWidthPercent === undefined ||
      (typeof input.workspaceWidthPercent === "number" && Number.isFinite(input.workspaceWidthPercent))) &&
    (input.sidebarEntryVisibility === undefined || isSidebarEntryVisibility(input.sidebarEntryVisibility)) &&
    (input.featureGuideCompleted === undefined ||
      (Array.isArray(input.featureGuideCompleted) && input.featureGuideCompleted.every((guideId) => typeof guideId === "string"))) &&
    (input.featureGuideVersion === undefined || input.featureGuideVersion === null || typeof input.featureGuideVersion === "string") &&
    typeof input.autoNsfwGrading === "boolean" &&
    typeof input.blurNsfwImages === "boolean" &&
    isNsfwGradingSpeed(input.nsfwGradingSpeed) &&
    isNsfwDetectionMode(input.nsfwDetectionMode) &&
    typeof input.masonryTileWidth === "number" &&
    isMaterialBrowserCollectionMode(input.materialBrowserCollectionMode) &&
    isMaterialBrowserGalleryMode(input.materialBrowserGalleryMode) &&
    isMaterialBrowserSortMode(input.materialBrowserSortMode) &&
    isMaterialBrowserSortDirection(input.materialBrowserSortDirection) &&
    typeof input.materialBrowserRandomSeed === "number" &&
    Number.isFinite(input.materialBrowserRandomSeed) &&
    typeof input.materialBrowserScrollTop === "number" &&
    Number.isFinite(input.materialBrowserScrollTop) &&
    isNetworkMaterialImportMode(input.networkMaterialImportMode) &&
    (input.promptLexicons === null ||
      input.promptLexicons === undefined ||
      isPromptLexiconSettings(input.promptLexicons)) &&
    isBuiltinModuleState(input.moduleState) &&
    (input.promptViewSettings === undefined || isPromptViewSettings(input.promptViewSettings))
  );
}

function createDefaultViewSettings(): LibraryViewSettings {
  return {
    language: defaultAppLanguage,
    canvasDraft: { ...defaultCanvasDraftSettings },
    canvasBackground: normalizeCanvasBackground(undefined),
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
    themeAccent: getDefaultThemeAccentForPreset(DEFAULT_THEME_PRESET),
    themeOpacity: DEFAULT_THEME_OPACITY,
    themeNavigationOpacity: DEFAULT_THEME_OPACITY,
    themeBackgroundOpacity: DEFAULT_THEME_OPACITY,
    themeWorkspaceOpacity: DEFAULT_THEME_OPACITY,
    themeAccentOpacity: DEFAULT_THEME_ACCENT_OPACITY,
    themeCustomAccents: [...DEFAULT_THEME_CUSTOM_ACCENTS] as [string, string, string],
    themeCustomAccent: "#ff6363",
    themeAccentMemory: createDefaultThemeAccentMemory(),
    customTheme: normalizeThemeCustomTheme(undefined),
    visualLife: { ...defaultVisualLifeSettings, effectPool: [...defaultVisualLifeSettings.effectPool] },
    workspaceWidthPercent: 88,
    sidebarEntryVisibility: normalizeSidebarEntryVisibility(undefined),
    featureGuideCompleted: [],
    featureGuideVersion: null,
    autoNsfwGrading: false,
    blurNsfwImages: false,
    nsfwGradingSpeed: defaultNsfwGradingSpeed,
    nsfwDetectionMode: "local-first",
    masonryTileWidth: defaultMasonryColumnCount,
    materialBrowserCollectionMode: "all",
    materialBrowserGalleryMode: "masonry",
    materialBrowserSortMode: "importedAt",
    materialBrowserSortDirection: "desc",
    materialBrowserRandomSeed: 0,
    materialBrowserScrollTop: 0,
    networkMaterialImportMode: "download",
    promptLexicons: null,
    moduleState: resolveBuiltinModuleState(),
    categoryWorkspace: {
      taxonomy: createEmptyCategoryTaxonomy(),
      inbox: [],
      candidates: [],
      learningEvents: [],
    },
    promptViewSettings: createDefaultPromptViewSettings(),
  };
}

function createDefaultPromptViewSettings(): PromptViewSettings {
  return { sidebarMode: "expanded", sidebarWidth: 220, viewMode: "grid", sortMode: "updated", cardDensity: "comfortable", todoSidebarVisible: false, todoSidebarWidth: 280 };
}

function normalizePromptViewSettings(input: unknown): PromptViewSettings {
  if (!isRecord(input)) return createDefaultPromptViewSettings();
  return {
    sidebarMode: input.sidebarMode === "compact" || input.sidebarMode === "hidden" ? input.sidebarMode : "expanded",
    sidebarWidth: typeof input.sidebarWidth === "number" && Number.isFinite(input.sidebarWidth) ? Math.min(360, Math.max(180, Math.round(input.sidebarWidth))) : 220,
    viewMode: input.viewMode === "list" ? "list" : "grid",
    sortMode: input.sortMode === "manual" || input.sortMode === "created" || input.sortMode === "lastUsed" || input.sortMode === "usageCount" || input.sortMode === "name" ? input.sortMode : "updated",
    cardDensity: input.cardDensity === "compact" ? "compact" : "comfortable",
    todoSidebarVisible: input.todoSidebarVisible === true,
    todoSidebarWidth: typeof input.todoSidebarWidth === "number" && Number.isFinite(input.todoSidebarWidth) ? Math.min(380, Math.max(220, Math.round(input.todoSidebarWidth))) : 280,
  };
}

function isPromptViewSettings(input: unknown): input is PromptViewSettings {
  return isRecord(input) &&
    (input.sidebarMode === "expanded" || input.sidebarMode === "compact" || input.sidebarMode === "hidden") &&
    typeof input.sidebarWidth === "number" &&
    (input.viewMode === "grid" || input.viewMode === "list") &&
    (input.sortMode === "manual" || input.sortMode === "updated" || input.sortMode === "created" || input.sortMode === "lastUsed" || input.sortMode === "usageCount" || input.sortMode === "name") &&
    (input.cardDensity === "compact" || input.cardDensity === "comfortable") &&
    (input.todoSidebarVisible === undefined || typeof input.todoSidebarVisible === "boolean") &&
    (input.todoSidebarWidth === undefined || typeof input.todoSidebarWidth === "number");
}

function normalizeCategoryWorkspace(input: unknown): CategoryWorkspaceState {
  if (!isRecord(input)) {
    return {
      taxonomy: createEmptyCategoryTaxonomy(),
      inbox: [],
      candidates: [],
      learningEvents: [],
    };
  }

  return {
    taxonomy: isCategoryTaxonomy(input.taxonomy) ? input.taxonomy : createEmptyCategoryTaxonomy(),
    inbox: Array.isArray(input.inbox) ? input.inbox.filter(isCategoryInboxItem) : [],
    candidates: Array.isArray(input.candidates) ? input.candidates.filter(isCategoryCandidate) : [],
    learningEvents: Array.isArray(input.learningEvents) ? input.learningEvents.filter(isCategoryLearningEvent) : [],
  };
}

function isCategoryTaxonomy(input: unknown): input is CategoryTaxonomy {
  return (
    isRecord(input) &&
    input.schemaVersion === 1 &&
    typeof input.updatedAt === "string" &&
    Array.isArray(input.nodes)
  );
}

function isCategoryInboxItem(input: unknown): boolean {
  return isRecord(input) && typeof input.itemId === "string" && typeof input.reason === "string";
}

function isCategoryCandidate(input: unknown): boolean {
  return isRecord(input) && typeof input.id === "string" && typeof input.proposedName === "string";
}

function isCategoryLearningEvent(input: unknown): boolean {
  return isRecord(input) && typeof input.id === "string" && typeof input.itemId === "string";
}

function normalizeBuiltinModuleState(input: unknown): LibraryViewSettings["moduleState"] {
  return isRecord(input) ? resolveBuiltinModuleState(input as BuiltinModuleStatePatch) : resolveBuiltinModuleState();
}

function normalizePromptLexiconSettings(input: unknown): PromptLexiconSettings {
  if (!isRecord(input)) {
    return {
      categories: [],
      tags: [],
    };
  }

  return {
    categories: Array.isArray(input.categories)
      ? input.categories.map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry)
      : [],
    tags: Array.isArray(input.tags)
      ? input.tags.map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry)
      : [],
  };
}

export function normalizeImageLexiconEntry(input: unknown): PromptImageLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = normalizeRequiredString(input.id);
  const label = normalizeRequiredString(input.label);

  if (!id || !label) {
    return null;
  }

  const parentId = normalizeOptionalString(input.parentId);
  const imageFileName = normalizeOptionalString(input.imageFileName);

  return {
    id,
    group: normalizeOptionalString(input.group),
    label,
    description: normalizeOptionalString(input.description),
    parentId: parentId || null,
    imageFileName: imageFileName || null,
    ...normalizeTagKnowledge(input),
  };
}

function isPromptLexiconSettings(input: unknown): input is PromptLexiconSettings {
  return (
    isRecord(input) &&
    Array.isArray(input.categories) &&
    input.categories.every(isPromptImageLexiconEntry) &&
    Array.isArray(input.tags) &&
    input.tags.every(isPromptImageLexiconEntry)
  );
}

function isPromptImageLexiconEntry(input: unknown): input is PromptImageLexiconEntry {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.group === "string" &&
    typeof input.label === "string" &&
    typeof input.description === "string" &&
    (input.parentId === null || typeof input.parentId === "string" || input.parentId === undefined) &&
    (input.imageFileName === null || typeof input.imageFileName === "string" || input.imageFileName === undefined)
  );
}

function normalizeThemeMode(input: unknown): ThemeMode {
  return isThemeMode(input) ? input : "light";
}

function normalizeMaterialBrowserCollectionMode(input: unknown): MaterialBrowserCollectionMode {
  return isMaterialBrowserCollectionMode(input) ? input : "all";
}

function normalizeMaterialBrowserGalleryMode(input: unknown): MaterialBrowserGalleryMode {
  return isMaterialBrowserGalleryMode(input) ? input : "masonry";
}

function normalizeMaterialBrowserSortMode(input: unknown): MaterialBrowserSortMode {
  return isMaterialBrowserSortMode(input) ? input : "importedAt";
}

function normalizeMaterialBrowserSortDirection(input: unknown): MaterialBrowserSortDirection {
  return isMaterialBrowserSortDirection(input) ? input : "desc";
}

function normalizeMaterialBrowserRandomSeed(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 0;
  }

  return Math.max(0, Math.trunc(input));
}

function normalizeMaterialBrowserScrollTop(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 0;
  }

  return Math.max(0, Math.trunc(input));
}

function normalizeNetworkMaterialImportMode(input: unknown): NetworkMaterialImportMode {
  return isNetworkMaterialImportMode(input) ? input : "download";
}

function normalizeMasonryTileWidth(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return defaultMasonryColumnCount;
  }

  const rounded = Math.round(input);

  if (rounded >= minMasonryColumnCount && rounded <= maxMasonryColumnCount) {
    return rounded;
  }

  const migratedColumnCount =
    rounded <= 150 ? 10 : rounded <= 220 ? 8 : rounded <= 300 ? 6 : rounded <= 400 ? 4 : rounded <= 600 ? 3 : 2;

  return Math.min(maxMasonryColumnCount, Math.max(minMasonryColumnCount, migratedColumnCount));
}

function isThemeMode(input: unknown): input is ThemeMode {
  return input === "light" || input === "dark";
}

function isMaterialBrowserCollectionMode(input: unknown): input is MaterialBrowserCollectionMode {
  return input === "all" || input === "featured";
}

function isMaterialBrowserGalleryMode(input: unknown): input is MaterialBrowserGalleryMode {
  return input === "masonry" || input === "grid";
}

function isMaterialBrowserSortMode(input: unknown): input is MaterialBrowserSortMode {
  return input === "importedAt" || input === "updatedAt" || input === "imageSize" || input === "random";
}

function isMaterialBrowserSortDirection(input: unknown): input is MaterialBrowserSortDirection {
  return input === "asc" || input === "desc";
}

function isNetworkMaterialImportMode(input: unknown): input is NetworkMaterialImportMode {
  return input === "download" || input === "link" || input === "ask";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeRequiredString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function normalizeOptionalString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
