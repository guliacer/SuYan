import { create } from "zustand";
import { useLibraryStore } from "../../library/store/useLibraryStore";
import type {
  PromptCategoryDeleteInput, PromptCategoryInput, PromptCategoryUpdate, PromptClipboardCreateInput,
  PromptClipboardPayload, PromptCopyInput, PromptInput, PromptLibraryFile, PromptReorderInput,
  PromptUpdate, PromptViewSettings, PromptCreateInput, PromptEntry,
  PromptLibraryExportResult, PromptLibraryImportResult,
} from "../types";
import { normalizeGithubProject } from "../utils/githubProject";

type PromptStore = PromptLibraryFile & {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  load: () => Promise<void>;
  createPrompt: (input: PromptInput) => Promise<boolean>;
  createPromptEntry: (input: PromptCreateInput) => Promise<PromptEntry | null>;
  updatePrompt: (input: PromptUpdate) => Promise<boolean>;
  deletePrompts: (ids: string[]) => Promise<boolean>;
  copyPrompt: (input: PromptCopyInput) => Promise<boolean>;
  setFavorite: (id: string, favorite: boolean) => Promise<boolean>;
  duplicatePrompt: (id: string) => Promise<boolean>;
  createPrompts: (inputs: PromptClipboardCreateInput[]) => Promise<boolean>;
  readClipboard: () => Promise<PromptClipboardPayload | null>;
  reorderPrompts: (input: PromptReorderInput) => Promise<boolean>;
  moveToCategory: (ids: string[], categoryId?: string) => Promise<boolean>;
  createCategory: (input: PromptCategoryInput) => Promise<boolean>;
  updateCategory: (input: PromptCategoryUpdate) => Promise<boolean>;
  deleteCategory: (input: PromptCategoryDeleteInput) => Promise<boolean>;
  reorderCategories: (ids: string[]) => Promise<boolean>;
  mergeCategories: (sourceId: string, targetId: string) => Promise<boolean>;
  exportLibrary: () => Promise<PromptLibraryExportResult | null>;
  importLibrary: () => Promise<PromptLibraryImportResult | null>;
  viewSettings: PromptViewSettings;
  loadViewSettings: () => Promise<void>;
  saveViewSettings: (patch: Partial<PromptViewSettings>) => Promise<void>;
  clearError: () => void;
};

const initialFile: PromptLibraryFile = { schemaVersion: 2, updatedAt: "", entries: [], categories: [] };
const defaultViewSettings: PromptViewSettings = { sidebarMode: "expanded", sidebarWidth: 220, viewMode: "grid", sortMode: "updated", cardDensity: "comfortable", todoSidebarVisible: false, todoSidebarWidth: 280 };

async function applyResult(
  set: (patch: Partial<PromptStore>) => void,
  request: () => Promise<{ ok: true; data: PromptLibraryFile } | { ok: false; error: { message: string } }>,
): Promise<boolean> {
  set({ isSaving: true, error: null });
  try {
    const result = await request();
    if (!result.ok) {
      set({ error: result.error.message, isSaving: false });
      return false;
    }
    set({ ...normalizePromptFileForRender(result.data), isSaving: false });
    return true;
  } catch {
    set({ error: "灵感创作操作失败，请重试。", isSaving: false });
    return false;
  }
}

export const usePromptStore = create<PromptStore>((set) => ({
  ...initialFile,
  isLoading: false,
  isSaving: false,
  error: null,
  viewSettings: defaultViewSettings,
  clearError: () => set({ error: null }),
  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.suyanApi.listPrompts();
      if (!result.ok) {
        set({ error: result.error.message, isLoading: false });
        return;
      }
    set({ ...normalizePromptFileForRender(result.data), isLoading: false });
    } catch {
      set({ error: "无法读取灵感创作。", isLoading: false });
    }
  },
  createPrompt: (input) => applyResult(set, () => window.suyanApi.createPrompt(input)),
  createPromptEntry: async (input) => {
    set({ isSaving: true, error: null });
    try {
      const result = await window.suyanApi.createPrompt(input);
      if (!result.ok) { set({ error: result.error.message, isSaving: false }); return null; }
      const normalized = normalizePromptFileForRender(result.data);
      set({ ...normalized, isSaving: false });
      return normalized.entries[0] ?? null;
    } catch {
      set({ error: "灵感创作操作失败，请重试。", isSaving: false });
      return null;
    }
  },
  updatePrompt: (input) => applyResult(set, () => window.suyanApi.updatePrompt(input)),
  deletePrompts: (ids) => applyResult(set, () => window.suyanApi.deletePrompts(ids)),
  copyPrompt: (input) => applyResult(set, () => window.suyanApi.copyPrompt(input)),
  setFavorite: (id, favorite) => applyResult(set, () => window.suyanApi.setPromptFavorite(id, favorite)),
  duplicatePrompt: (id) => applyResult(set, () => window.suyanApi.duplicatePrompt(id)),
  createPrompts: (inputs) => applyResult(set, () => window.suyanApi.createPrompts(inputs)),
  readClipboard: async () => {
    const result = await window.suyanApi.readPromptClipboard();
    if (!result.ok) { set({ error: result.error.message }); return null; }
    return result.data;
  },
  reorderPrompts: (input) => applyResult(set, () => window.suyanApi.reorderPrompts(input)),
  moveToCategory: (ids, categoryId) => applyResult(set, () => window.suyanApi.movePromptsToCategory(ids, categoryId)),
  createCategory: (input) => applyResult(set, () => window.suyanApi.createPromptCategory(input)),
  updateCategory: (input) => applyResult(set, () => window.suyanApi.updatePromptCategory(input)),
  deleteCategory: (input) => applyResult(set, () => window.suyanApi.deletePromptCategory(input)),
  reorderCategories: (ids) => applyResult(set, () => window.suyanApi.reorderPromptCategories(ids)),
  mergeCategories: (sourceId, targetId) => applyResult(set, () => window.suyanApi.mergePromptCategories(sourceId, targetId)),
  exportLibrary: async () => {
    set({ error: null });
    try {
      const result = await window.suyanApi.exportPromptLibrary();
      if (!result.ok) { set({ error: result.error.message }); return null; }
      return result.data;
    } catch {
      set({ error: "导出灵感创作失败，请重试。" });
      return null;
    }
  },
  importLibrary: async () => {
    set({ isSaving: true, error: null });
    try {
      const result = await window.suyanApi.importPromptLibrary();
      if (!result.ok) { set({ error: result.error.message, isSaving: false }); return null; }
      set({ ...normalizePromptFileForRender(result.data.library), isSaving: false });
      return result.data;
    } catch {
      set({ error: "导入灵感创作失败，请重试。", isSaving: false });
      return null;
    }
  },
  loadViewSettings: async () => {
    const result = await window.suyanApi.readLibraryViewSettings();
    if (result.ok) {
      const viewSettings = normalizePromptViewSettings(result.data.promptViewSettings);
      set({ viewSettings });
      useLibraryStore.setState({ promptViewSettings: viewSettings });
    }
  },
  saveViewSettings: async (patch) => {
    const result = await window.suyanApi.readLibraryViewSettings();
    if (!result.ok) { set({ error: result.error.message }); return; }
    const next = { ...result.data.promptViewSettings, ...patch };
    const saved = await window.suyanApi.saveLibraryViewSettings({ ...result.data, promptViewSettings: next });
    if (saved.ok) {
      const viewSettings = normalizePromptViewSettings(saved.data.promptViewSettings);
      set({ viewSettings });
      useLibraryStore.setState({ promptViewSettings: viewSettings });
    } else set({ error: saved.error.message });
  },
}));

/**
 * Renderer data is an untrusted IPC boundary. Older library.json files and
 * interrupted migrations may omit array fields; normalize them before React
 * components call map/slice/length so one malformed entry cannot blank the view.
 */
function normalizePromptFileForRender(input: unknown): PromptLibraryFile {
  const source = isRecord(input) ? input : {};
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];
  const rawCategories = Array.isArray(source.categories) ? source.categories : [];
  const entries = rawEntries
    .filter(isRecord)
    .filter((entry) => typeof entry.id === "string" && typeof entry.content === "string")
    .map((entry) => ({
      ...entry,
      id: String(entry.id),
      title: typeof entry.title === "string" ? entry.title : "未命名灵感",
      content: String(entry.content),
      tagIds: Array.isArray(entry.tagIds) ? entry.tagIds.filter((tag): tag is string => typeof tag === "string") : [],
      variables: Array.isArray(entry.variables) ? entry.variables.filter(isRecord) : [],
      favorite: entry.favorite === true,
      usageCount: typeof entry.usageCount === "number" && Number.isFinite(entry.usageCount) ? entry.usageCount : 0,
      ...(typeof entry.cardWidth === "number" && Number.isFinite(entry.cardWidth) ? { cardWidth: Math.min(640, Math.max(220, Math.round(entry.cardWidth))) } : {}),
      ...(typeof entry.cardHeight === "number" && Number.isFinite(entry.cardHeight) ? { cardHeight: Math.min(720, Math.max(260, Math.round(entry.cardHeight))) } : {}),
      github: normalizeGithubProject(entry.github),
      ...(isRecord(entry.account) ? {
        // 密文也不需要进入渲染层；密码通过 prompt:account-read 按需读取。
        account: {
          ...(typeof entry.account.name === "string" ? { name: entry.account.name } : {}),
          ...(typeof entry.account.site === "string" ? { site: entry.account.site } : {}),
        },
      } : {}),
    })) as PromptLibraryFile["entries"];
  const categories = rawCategories
    .filter(isRecord)
    .filter((category) => typeof category.id === "string" && typeof category.name === "string")
    .map((category) => ({ ...category, id: String(category.id), name: String(category.name) })) as PromptLibraryFile["categories"];
  return {
    schemaVersion: 2,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
    entries,
    categories,
  };
}

function isRecord(input: unknown): input is Record<string, any> {
  return typeof input === "object" && input !== null;
}

function normalizePromptViewSettings(input: unknown): PromptViewSettings {
  const source = isRecord(input) ? input : {};
  const viewMode = source.viewMode === "list" ? "list" : "grid";
  const sortMode = ["manual", "updated", "created", "lastUsed", "usageCount", "name"].includes(String(source.sortMode))
    ? (source.sortMode as PromptViewSettings["sortMode"])
    : defaultViewSettings.sortMode;
  const sidebarMode = source.sidebarMode === "compact" ? "compact" : "expanded";
  const cardDensity = source.cardDensity === "compact" ? "compact" : "comfortable";
  return {
    sidebarMode,
    sidebarWidth: typeof source.sidebarWidth === "number" && Number.isFinite(source.sidebarWidth)
      ? Math.min(420, Math.max(180, Math.round(source.sidebarWidth)))
      : defaultViewSettings.sidebarWidth,
    viewMode,
    sortMode,
    cardDensity,
    todoSidebarVisible: source.todoSidebarVisible === true,
    todoSidebarWidth: typeof source.todoSidebarWidth === "number" && Number.isFinite(source.todoSidebarWidth)
      ? Math.min(380, Math.max(220, Math.round(source.todoSidebarWidth)))
      : defaultViewSettings.todoSidebarWidth,
  };
}
