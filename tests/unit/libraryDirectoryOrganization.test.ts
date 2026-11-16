import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../../src/features/library/types/library";
import { createDefaultLibraryDirectorySettings, mergeLibraryDirectoryNodes, buildLibraryDirectoryItemIndex, selectLibraryDirectoryItems } from "../../src/features/library/utils/libraryDirectory";
function managed(id: string, title: string, importSource?: unknown): LibraryItem { return { id, title, imageFileName: id + ".webp", mediaStorage: "managed", prompt: "", negativePrompt: "", tags: [], createdAt: "2026-11-14T00:00:00.000Z", updatedAt: "2026-11-14T00:00:00.000Z", ...(importSource ? { importSource } : {}) } as LibraryItem; }
describe("directory-first organization", () => {
  it("starts with direct-directory browsing instead of flattening all descendants", () => {
    expect(createDefaultLibraryDirectorySettings().includeDescendants).toBe(false);
  });
  it("recovers legacy numbered import batches without touching titles or original file references", () => {
    const items = [managed("a", "20240906-信丰订婚-001"), managed("b", "20240906-信丰订婚-002"), managed("c", "未归纳的单张")];
    const before = JSON.stringify(items); const settings = mergeLibraryDirectoryNodes({ roots: [], items });
    const folder = settings.nodes.find(node => node.name === "20240906-信丰订婚");
    expect(folder).toBeDefined(); expect(folder?.kind).toBe("virtual");
    const index = buildLibraryDirectoryItemIndex(items, settings);
    expect(index.itemDirectoryById.get("a")).toBe(folder?.id); expect(index.itemDirectoryById.get("b")).toBe(folder?.id); expect(index.itemDirectoryById.get("c")).toBeNull();
    expect(JSON.stringify(items)).toBe(before);
    const repeated = mergeLibraryDirectoryNodes({ roots: [], items, settings });
    expect(repeated.nodes).toEqual(settings.nodes); expect(repeated.itemFolderIds).toEqual(settings.itemFolderIds);
  });
  it("does not override explicit unfiled or manually organized assignments during legacy recovery", () => {
    const items = [managed("a", "20240906-婚礼-001"), managed("b", "20240906-婚礼-002")];
    const base = createDefaultLibraryDirectorySettings();
    base.nodes = [{ id: "manual", name: "精选", rootId: "__library__", relativePath: "", parentId: null, kind: "virtual", order: 0 }];
    base.itemFolderIds = { a: "manual", b: "library-directory:unfiled" };
    const result = mergeLibraryDirectoryNodes({ roots: [], items, settings: base });
    expect(result.itemFolderIds).toEqual(base.itemFolderIds);
  });
  it("preserves actual nested source folders for copied imports while media stays managed", () => {
    const items = [managed("one", "one", { rootId: "source-1", rootName: "2026-09", relativePath: "室内/古风/one.webp", size: 100, mtimeMs: 1 }), managed("two", "two", { rootId: "source-1", rootName: "2026-09", relativePath: "室内/two.webp", size: 90, mtimeMs: 1 })];
    const result = mergeLibraryDirectoryNodes({ roots: [], items });
    const nested = result.nodes.find(node => node.name === "古风"); const parent = result.nodes.find(node => node.name === "室内");
    expect(nested?.parentId).toBe(parent?.id);
    const index = buildLibraryDirectoryItemIndex(items, result); expect(index.itemDirectoryById.get("one")).toBe(nested?.id);
    expect(selectLibraryDirectoryItems(items, { ...result, selectedNodeId: parent!.id, includeDescendants: false }, [], index.itemDirectoryById).map(item => item.id)).toEqual(["two"]);
    expect(items.every(item => item.mediaStorage === "managed")).toBe(true);
  });
});
