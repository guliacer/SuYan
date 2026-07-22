import fs from "node:fs/promises";
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
  PromptParameterLexiconEntry,
  ThemeMode,
} from "../../../src/features/library/types/library";
import type { BuiltinModuleStatePatch } from "../../../src/features/library/utils/moduleRegistry";
import {
  isBuiltinModuleState,
  resolveBuiltinModuleState,
} from "../../../src/features/library/utils/moduleRegistry";
import {
  defaultNsfwGradingSpeed,
  isNsfwGradingSpeed,
  normalizeNsfwGradingSpeed,
} from "../../../src/features/library/utils/nsfwGradingSpeed";
import { AppError } from "../ipc/errors";
import { getLibraryDataDir, getLibraryViewSettingsPath } from "./libraryPaths";

const defaultMasonryColumnCount = 4;
const minMasonryColumnCount = 2;
const maxMasonryColumnCount = 10;

export async function readLibraryViewSettings(): Promise<LibraryViewSettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  let content: string;

  try {
    content = await fs.readFile(getLibraryViewSettingsPath(), "utf8");
  } catch {
    return createDefaultViewSettings();
  }

  try {
    return normalizeLibraryViewSettings(JSON.parse(content) as unknown);
  } catch {
    return createDefaultViewSettings();
  }
}

export async function writeLibraryViewSettings(
  settings: LibraryViewSettings,
): Promise<LibraryViewSettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  if (!isLibraryViewSettings(settings)) {
    throw new AppError("VIEW_SETTINGS_INVALID", "视图设置结构不合法。");
  }

  const normalized = normalizeLibraryViewSettings(settings);
  const tempPath = `${getLibraryViewSettingsPath()}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tempPath, getLibraryViewSettingsPath());

  return normalized;
}

function normalizeLibraryViewSettings(input: unknown): LibraryViewSettings {
  if (!isRecord(input)) {
    return createDefaultViewSettings();
  }

  return {
    tagOrder: Array.isArray(input.tagOrder) ? uniqueStrings(input.tagOrder) : [],
    likedImageIds: Array.isArray(input.likedImageIds) ? uniqueStrings(input.likedImageIds) : [],
    generationModelOrder: Array.isArray(input.generationModelOrder) ? uniqueStrings(input.generationModelOrder) : [],
    hiddenGenerationModels: Array.isArray(input.hiddenGenerationModels) ? uniqueStrings(input.hiddenGenerationModels) : [],
    themeMode: normalizeThemeMode(input.themeMode),
    autoNsfwGrading: input.autoNsfwGrading === true,
    blurNsfwImages: input.blurNsfwImages === true,
    nsfwGradingSpeed: normalizeNsfwGradingSpeed(input.nsfwGradingSpeed),
    masonryTileWidth: normalizeMasonryTileWidth(input.masonryTileWidth),
    materialBrowserCollectionMode: normalizeMaterialBrowserCollectionMode(input.materialBrowserCollectionMode),
    materialBrowserGalleryMode: normalizeMaterialBrowserGalleryMode(input.materialBrowserGalleryMode),
    materialBrowserSortMode: normalizeMaterialBrowserSortMode(input.materialBrowserSortMode),
    materialBrowserSortDirection: normalizeMaterialBrowserSortDirection(input.materialBrowserSortDirection),
    materialBrowserRandomSeed: normalizeMaterialBrowserRandomSeed(input.materialBrowserRandomSeed),
    networkMaterialImportMode: normalizeNetworkMaterialImportMode(input.networkMaterialImportMode),
    promptLexicons:
      input.promptLexicons === null || input.promptLexicons === undefined
        ? null
        : normalizePromptLexiconSettings(input.promptLexicons),
    moduleState: normalizeBuiltinModuleState(input.moduleState),
  };
}

function isLibraryViewSettings(input: unknown): input is LibraryViewSettings {
  return (
    isRecord(input) &&
    Array.isArray(input.tagOrder) &&
    input.tagOrder.every((tag) => typeof tag === "string") &&
    Array.isArray(input.likedImageIds) &&
    input.likedImageIds.every((itemId) => typeof itemId === "string") &&
    Array.isArray(input.generationModelOrder) &&
    input.generationModelOrder.every((model) => typeof model === "string") &&
    Array.isArray(input.hiddenGenerationModels) &&
    input.hiddenGenerationModels.every((model) => typeof model === "string") &&
    isThemeMode(input.themeMode) &&
    typeof input.autoNsfwGrading === "boolean" &&
    typeof input.blurNsfwImages === "boolean" &&
    isNsfwGradingSpeed(input.nsfwGradingSpeed) &&
    typeof input.masonryTileWidth === "number" &&
    isMaterialBrowserCollectionMode(input.materialBrowserCollectionMode) &&
    isMaterialBrowserGalleryMode(input.materialBrowserGalleryMode) &&
    isMaterialBrowserSortMode(input.materialBrowserSortMode) &&
    isMaterialBrowserSortDirection(input.materialBrowserSortDirection) &&
    typeof input.materialBrowserRandomSeed === "number" &&
    Number.isFinite(input.materialBrowserRandomSeed) &&
    isNetworkMaterialImportMode(input.networkMaterialImportMode) &&
    (input.promptLexicons === null || isPromptLexiconSettings(input.promptLexicons)) &&
    isBuiltinModuleState(input.moduleState)
  );
}

function createDefaultViewSettings(): LibraryViewSettings {
  return {
    tagOrder: [],
    likedImageIds: [],
    generationModelOrder: [],
    hiddenGenerationModels: [],
    themeMode: "light",
    autoNsfwGrading: false,
    blurNsfwImages: false,
    nsfwGradingSpeed: defaultNsfwGradingSpeed,
    masonryTileWidth: defaultMasonryColumnCount,
    materialBrowserCollectionMode: "all",
    materialBrowserGalleryMode: "masonry",
    materialBrowserSortMode: "importedAt",
    materialBrowserSortDirection: "desc",
    materialBrowserRandomSeed: 0,
    networkMaterialImportMode: "download",
    promptLexicons: null,
    moduleState: resolveBuiltinModuleState(),
  };
}

function normalizeBuiltinModuleState(input: unknown): LibraryViewSettings["moduleState"] {
  return isRecord(input) ? resolveBuiltinModuleState(input as BuiltinModuleStatePatch) : resolveBuiltinModuleState();
}

function normalizePromptLexiconSettings(input: unknown): PromptLexiconSettings {
  if (!isRecord(input)) {
    return {
      parameters: [],
      categories: [],
      tags: [],
    };
  }

  return {
    parameters: Array.isArray(input.parameters)
      ? input.parameters.map(normalizeParameterLexiconEntry).filter(isPromptParameterLexiconEntry)
      : [],
    categories: Array.isArray(input.categories)
      ? input.categories.map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry)
      : [],
    tags: Array.isArray(input.tags)
      ? input.tags.map(normalizeImageLexiconEntry).filter(isPromptImageLexiconEntry)
      : [],
  };
}

function normalizeParameterLexiconEntry(input: unknown): PromptParameterLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = normalizeRequiredString(input.id);
  const label = normalizeRequiredString(input.label);
  const variable = normalizeRequiredString(input.variable);

  if (!id || !label || !variable) {
    return null;
  }

  return {
    id,
    group: normalizeOptionalString(input.group),
    label,
    sourcePromptId: normalizeOptionalString(input.sourcePromptId) || null,
    sourcePromptTitle: normalizeOptionalString(input.sourcePromptTitle) || null,
    variable,
    value: normalizeOptionalString(input.value),
  };
}

function normalizeImageLexiconEntry(input: unknown): PromptImageLexiconEntry | null {
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
  };
}

function isPromptLexiconSettings(input: unknown): input is PromptLexiconSettings {
  return (
    isRecord(input) &&
    Array.isArray(input.parameters) &&
    input.parameters.every(isPromptParameterLexiconEntry) &&
    Array.isArray(input.categories) &&
    input.categories.every(isPromptImageLexiconEntry) &&
    Array.isArray(input.tags) &&
    input.tags.every(isPromptImageLexiconEntry)
  );
}

function isPromptParameterLexiconEntry(input: unknown): input is PromptParameterLexiconEntry {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.group === "string" &&
    typeof input.label === "string" &&
    (input.sourcePromptId === null || typeof input.sourcePromptId === "string" || input.sourcePromptId === undefined) &&
    (input.sourcePromptTitle === null || typeof input.sourcePromptTitle === "string" || input.sourcePromptTitle === undefined) &&
    typeof input.variable === "string" &&
    typeof input.value === "string"
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
