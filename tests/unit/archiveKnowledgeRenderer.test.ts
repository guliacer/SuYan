import { afterEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";
import type { ImportZipData, IpcResult } from "../../src/types/suyanApi";
import type { LibraryItem, LibraryViewSettings, PromptImageLexiconEntry } from "../../src/features/library/types/library";

vi.mock("../../src/features/library/utils/themeMode", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/features/library/utils/themeMode")>(), applyThemeModeToRoot: vi.fn(),
}));

const initial = useLibraryStore.getState();
afterEach(() => { useLibraryStore.setState(initial, true); vi.unstubAllGlobals(); });
const tag: PromptImageLexiconEntry = { id: "camera", label: "哈苏", group: "物品/数码设备/相机品牌", description: "已归纳", groupLocked: true };
const item: LibraryItem = { id: "imported", title: "测试", prompt: "相机", negativePrompt: "", tags: ["哈苏"], imageFileName: "a.png", createdAt: "2026-09-01", updatedAt: "2026-09-01" };

function api(importZip: () => Promise<IpcResult<ImportZipData>>) {
  const save = vi.fn(async (settings: LibraryViewSettings) => ({ ok: true, data: settings }));
  const idle = vi.fn();
  vi.stubGlobal("window", { requestIdleCallback: idle, suyanApi: {
    importZip, saveLibraryViewSettings: save, logStartupEvent: vi.fn(),
    exportZip: vi.fn(async () => ({ ok: true, data: { canceled: false, exportedCount: 1, categoryCount: 2, tagCount: 1 } })),
  } });
  vi.stubGlobal("document", { documentElement: {} });
  useLibraryStore.setState({ items: [], autoNsfwGrading: false, promptLexicons: { categories: [], tags: [] } });
  return { save, idle };
}

async function importedData() {
  // Capture a complete settings payload through the same path used by preferences.
  await useLibraryStore.getState().saveMaterialBrowserSettings({ materialBrowserSortDirection: "asc" });
  const settings = vi.mocked(window.suyanApi.saveLibraryViewSettings).mock.calls.at(-1)![0];
  return { canceled: false, library: { schemaVersion: 2 as const, updatedAt: "2026-09-01", items: [item] }, importedCount: 1,
    settings: { ...settings, promptLexicons: { categories: [], tags: [tag] } } };
}

describe("sharing applies knowledge before pending UI settings saves", () => {
  it("immediately displays imported knowledge and never schedules generic tag reclassification", async () => {
    const mock = api(async () => ({ ok: true, data }));
    const data = await importedData();
    await useLibraryStore.getState().importZip();
    expect(useLibraryStore.getState().promptLexicons?.tags).toEqual([tag]);
    expect(useLibraryStore.getState().items).toEqual([item]);
    expect(useLibraryStore.getState().isBusy).toBe(false);
    expect(mock.idle).not.toHaveBeenCalled();
  });

  it("prevents settings queued during import from erasing newly imported tags", async () => {
    let resolveImport!: (value: IpcResult<ImportZipData>) => void;
    const mock = api(() => new Promise(resolve => { resolveImport = resolve; }));
    const data = await importedData();
    const importing = useLibraryStore.getState().importZip();
    await vi.waitFor(() => expect(resolveImport).toBeTypeOf("function"));
    const saving = useLibraryStore.getState().saveMaterialBrowserSettings({ materialBrowserSortDirection: "desc" });
    resolveImport({ ok: true, data });
    await Promise.all([importing, saving]);
    expect(mock.save.mock.calls.at(-1)![0].promptLexicons?.tags).toEqual([tag]);
    expect(useLibraryStore.getState().promptLexicons?.tags).toEqual([tag]);
    expect(useLibraryStore.getState().materialBrowserSortDirection).toBe("desc");
  });

  it("waits for analyzed lexicons to finish saving before requesting export", async () => {
    const mock = api(async () => { throw new Error("unused"); });
    let finishSave!: () => void;
    mock.save.mockImplementationOnce(settings => new Promise(resolve => { finishSave = () => resolve({ ok: true, data: settings }); }));
    const saving = useLibraryStore.getState().saveMaterialBrowserSettings({ materialBrowserSortDirection: "asc" });
    const exporting = useLibraryStore.getState().exportZip(["a"]);
    await vi.waitFor(() => expect(finishSave).toBeTypeOf("function"));
    expect(window.suyanApi.exportZip).not.toHaveBeenCalled();
    finishSave();
    await Promise.all([saving, exporting]);
    expect(window.suyanApi.exportZip).toHaveBeenCalledWith(["a"], undefined);
  });

  it("releases the busy state on cancellation or IPC failure without losing local tags", async () => {
    api(async () => { throw new Error("disconnected"); });
    useLibraryStore.setState({ promptLexicons: { categories: [], tags: [tag] } });
    await useLibraryStore.getState().importZip();
    expect(useLibraryStore.getState().isBusy).toBe(false);
    expect(useLibraryStore.getState().promptLexicons?.tags).toEqual([tag]);
    window.suyanApi.importZip = async () => ({ ok: true, data: { canceled: true, library: { schemaVersion: 2, updatedAt: "", items: [] }, importedCount: 0 } });
    await useLibraryStore.getState().importZip();
    expect(useLibraryStore.getState().promptLexicons?.tags).toEqual([tag]);
    expect(useLibraryStore.getState().isBusy).toBe(false);
  });
});
