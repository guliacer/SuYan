import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import { useLibraryStore } from "@/features/library/store/useLibraryStore";

const initialState = useLibraryStore.getState();

const item: LibraryItem = {
  id: "manual-tag-item",
  title: "手动标签测试",
  imageFileName: "manual-tag-item.png",
  prompt: "一张测试图片",
  negativePrompt: "",
  category: null,
  tags: ["原有标签"],
  createdAt: "2026-09-13T00:00:00.000Z",
  updatedAt: "2026-09-13T00:00:00.000Z",
};

afterEach(() => {
  useLibraryStore.setState(initialState, true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function installSaveApi() {
  const saveLibrary = vi.fn(async (library: { items: LibraryItem[] }) => ({
    ok: true as const,
    data: library,
  }));

  vi.stubGlobal("window", {
    suyanApi: {
      saveLibrary,
      saveLibraryViewSettings: vi.fn(async (settings: unknown) => ({ ok: true as const, data: settings })),
    },
    setTimeout: globalThis.setTimeout,
  });

  useLibraryStore.setState({ items: [item] });
  return saveLibrary;
}

describe("manual tag persistence", () => {
  it("persists user-entered labels through the real saveItem path", async () => {
    const saveLibrary = installSaveApi();

    await useLibraryStore.getState().saveItem(
      item.id,
      { tags: ["  我的私人标签：春日灵感  ", "我的私人标签：春日灵感", "English Mood"] },
      { background: true, silent: true, preserveManualTags: true },
    );

    expect(useLibraryStore.getState().items[0].tags).toEqual([
      "我的私人标签：春日灵感",
      "English Mood",
    ]);
    expect(saveLibrary).toHaveBeenCalledTimes(1);
    expect(saveLibrary.mock.calls[0][0].items[0].tags).toEqual([
      "我的私人标签：春日灵感",
      "English Mood",
    ]);
  });

  it("keeps strict filtering for saves that do not opt into manual labels", async () => {
    const saveLibrary = installSaveApi();

    await useLibraryStore.getState().saveItem(
      item.id,
      { tags: ["我的私人标签：春日灵感"] },
      { background: true, silent: true },
    );

    expect(saveLibrary.mock.calls[0][0].items[0].tags).toEqual([]);
  });
});
