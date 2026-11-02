import type {
  UpscaleExportOptions,
  UpscaleModelId,
} from "../types";
import { getUpscaleModelDefinition } from "./upscaleModels";

export const defaultUpscaleExportOptions: UpscaleExportOptions = {
  saveToDirectory: true,
  addToLibrary: false,
  outputDirectoryToken: null,
  format: "png",
  quality: 92,
  conflictPolicy: "append-number",
  namingPattern: "{name}_{engine}_{scale}x",
  preserveMetadata: true,
  libraryMode: "new-group",
  title: "",
  categoryId: null,
  tags: [],
};

export function normalizeUpscaleExportOptions(
  input: Partial<UpscaleExportOptions> | null | undefined,
): UpscaleExportOptions {
  const source = input ?? {};
  const requestedSave = typeof source.saveToDirectory === "boolean"
    ? source.saveToDirectory
    : defaultUpscaleExportOptions.saveToDirectory;
  const requestedLibrary = typeof source.addToLibrary === "boolean"
    ? source.addToLibrary
    : defaultUpscaleExportOptions.addToLibrary;
  const hasDestination = requestedSave || requestedLibrary;
  const quality = Number.isFinite(source.quality)
    ? Math.min(100, Math.max(1, Math.round(source.quality as number)))
    : defaultUpscaleExportOptions.quality;
  const namingPattern = typeof source.namingPattern === "string" && source.namingPattern.trim()
    ? source.namingPattern.trim().slice(0, 200)
    : defaultUpscaleExportOptions.namingPattern;
  const tags = Array.isArray(source.tags)
    ? [...new Set(source.tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 50)
    : [];

  return {
    saveToDirectory: hasDestination ? requestedSave : true,
    addToLibrary: hasDestination ? requestedLibrary : false,
    outputDirectoryToken:
      typeof source.outputDirectoryToken === "string" && source.outputDirectoryToken.trim()
        ? source.outputDirectoryToken.trim()
        : null,
    format: source.format === "jpeg" || source.format === "webp" ? source.format : "png",
    quality,
    conflictPolicy:
      source.conflictPolicy === "overwrite" || source.conflictPolicy === "skip"
        ? source.conflictPolicy
        : "append-number",
    namingPattern,
    preserveMetadata: source.preserveMetadata !== false,
    libraryMode: source.libraryMode === "append-source" ? "append-source" : "new-group",
    title: typeof source.title === "string" ? source.title.trim().slice(0, 200) : "",
    categoryId:
      typeof source.categoryId === "string" && source.categoryId.trim()
        ? source.categoryId.trim().slice(0, 256)
        : null,
    tags,
  };
}

export function buildUpscaleOutputName(
  inputDisplayName: string,
  modelId: UpscaleModelId,
  namingPattern = defaultUpscaleExportOptions.namingPattern,
): string {
  const model = getUpscaleModelDefinition(modelId);
  const sourceName = stripExtension(inputDisplayName).trim() || "image";
  const variables: Record<string, string> = {
    name: sourceName,
    engine: model.engine,
    model: model.id,
    scale: String(model.scale),
  };
  const expanded = namingPattern
    .replace(/\{(name|engine|model|scale)\}/gu, (_match, key: string) => variables[key] ?? "")
    .replace(/\{[^{}]+\}/gu, "")
    .replace(/[\s_-]+$/u, "");
  return sanitizeWindowsFileName(expanded);
}

function stripExtension(fileName: string): string {
  const normalized = fileName.replace(/\\/gu, "/").split("/").at(-1) ?? fileName;
  const extensionIndex = normalized.lastIndexOf(".");
  return extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized;
}

function sanitizeWindowsFileName(input: string): string {
  let result = input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .trim()
    .slice(0, 180)
    .replace(/[. ]+$/gu, "");
  if (!result) return "upscaled";
  const base = result.split(".")[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(base)) {
    result = `_${result}`;
  }
  return result;
}
