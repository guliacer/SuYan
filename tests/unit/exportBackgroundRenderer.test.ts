import { afterEach, describe, expect, it, vi } from "vitest";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";
import { usePromptStore } from "../../src/features/prompts/store/promptStore";

const library = useLibraryStore.getState();
const prompts = usePromptStore.getState();
afterEach(() => { useLibraryStore.setState(library, true); usePromptStore.setState(prompts, true); vi.unstubAllGlobals(); });

describe("export leaves page operation state independent", () => {
  it.each([false, true])("does not set or clear isBusy=%s while a ZIP export runs", async initialBusy => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal("window", { suyanApi: { exportZip: vi.fn(() => new Promise(resolve => { finish = resolve; })) } });
    useLibraryStore.setState({ isBusy: initialBusy });
    const task = useLibraryStore.getState().exportZip(["a"]);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(useLibraryStore.getState().isBusy).toBe(initialBusy);
    // A separate operation can start/finish during export; export must not overwrite its state.
    useLibraryStore.setState({ isBusy: !initialBusy });
    finish({ ok: true, data: { canceled: false, exportedCount: 1 } });
    await task;
    expect(useLibraryStore.getState().isBusy).toBe(!initialBusy);
  });

  it("does not disable editing or clear an in-flight save when exporting inspiration", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal("window", { suyanApi: { exportPromptLibrary: vi.fn(() => new Promise(resolve => { finish = resolve; })) } });
    const task = usePromptStore.getState().exportLibrary();
    expect(usePromptStore.getState().isSaving).toBe(false);
    usePromptStore.setState({ isSaving: true });
    finish({ ok: true, data: { canceled: false, exportedCount: 1 } });
    await task;
    expect(usePromptStore.getState().isSaving).toBe(true);
  });
});
