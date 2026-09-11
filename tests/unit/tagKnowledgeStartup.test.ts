import { afterEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";
import { prunePromptLexiconsAfterItemDeletion } from "../../src/features/library/utils/promptLexicons";
import type { LibraryItem } from "../../src/features/library/types/library";

vi.mock("../../src/features/library/utils/themeMode", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/features/library/utils/themeMode")>(), applyThemeModeToRoot: vi.fn(),
}));
const initial = useLibraryStore.getState();
afterEach(() => { useLibraryStore.setState(initial, true); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("tag knowledge lifecycle", () => {
  it("loading and idle startup never rewrite unused or pending tags", async () => {
    vi.useFakeTimers();
    const tags = [
      { id: "ai-unused", label: "胡杨树", group: "其他标签 Other", description: "来自 AI 标签分析" },
      { id: "pending", label: "未知装置", group: "待归纳", description: "", reviewStatus: "pending" },
      { id: "confirmed", label: "胡杨", group: "我的树木", description: "", aliases: ["胡杨别称"], groupLocked: true },
    ];
    const api = {
      readLibrary: vi.fn(async () => ({ ok: true, data: { schemaVersion: 2, items: [], updatedAt: "" } })),
      readLibraryViewSettings: vi.fn(async () => ({ ok: true, data: { promptLexicons: { categories: [], tags } } })),
      listLibraryRoots: vi.fn(async () => ({ ok: true, data: [] })),
      readAiSettings: vi.fn(async () => ({ ok: true, data: initial.aiSettings })),
      readProxySettings: vi.fn(async () => ({ ok: true, data: initial.proxySettings })),
      onFfmpegInstallProgress: vi.fn(), onModuleInstallProgress: vi.fn(), onExternalLibraryChanged: vi.fn(),
      saveLibrary: vi.fn(), saveLibraryViewSettings: vi.fn(), logRendererEvent: vi.fn(),
    };
    vi.stubGlobal("window", { suyanApi: api, setTimeout, clearTimeout, requestIdleCallback: (callback: () => void) => setTimeout(callback, 0) });
    vi.stubGlobal("document", { documentElement: {} });
    useLibraryStore.setState({ checkVideoRuntime: async () => true, checkNsfwRuntime: async () => true });
    await useLibraryStore.getState().load();
    await vi.runAllTimersAsync();
    expect(useLibraryStore.getState().promptLexicons?.tags).toMatchObject(tags);
    expect(api.saveLibrary).not.toHaveBeenCalled();
    expect(api.saveLibraryViewSettings).not.toHaveBeenCalled();
  });

  it("deleting a work does not discard learned aliases or pending review entries", () => {
    const tags = [
      { id: "learned", label: "胡杨", group: "我的树木", description: "来自 AI 标签分析", aliases: ["胡杨树"], groupLocked: true },
      { id: "pending", label: "未知装置", group: "待归纳", description: "来自 AI 标签分析", reviewStatus: "pending" as const },
    ];
    const remaining: LibraryItem = { id: "remaining", title: "剩余作品", prompt: "", negativePrompt: "", imageFileName: "a.png", category: null, tags: ["红叶"], createdAt: "", updatedAt: "" };
    const result = prunePromptLexiconsAfterItemDeletion({ categories: [], tags }, [remaining], []);
    expect(result.promptLexicons?.tags).toMatchObject(tags);
  });
});
