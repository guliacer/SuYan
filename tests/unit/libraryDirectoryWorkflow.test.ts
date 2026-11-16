import { describe, expect, it } from "vitest";
import * as directory from "../../src/features/library/utils/libraryDirectory";
import { isImageMediaFile } from "../../src/features/library/utils/mediaFileTypes";
import type { LibraryItem, LibraryRoot } from "../../src/features/library/types/library";

const allId = "library-directory:all";
const unfiledId = "library-directory:unfiled";
const roots: LibraryRoot[] = [{ id: "r", label: "写真", absolutePath: "W:/写真", recursive: true, lastScanAt: null }];
const rootId = "library-root:r";
function item(id: string, file = id + ".webp", tags: string[] = []): LibraryItem {
  return { id, title: id, imageFileName: id + ".webp", prompt: "柔光", negativePrompt: "", tags,
    mediaStorage: { kind: "external", rootId: "r", relativePath: file, size: 100, mtimeMs: 1, status: "available" },
    createdAt: "2026-11-14T00:00:00Z", updatedAt: "2026-11-14T00:00:00Z" };
}
function base(items = [item("one", "A/one.webp"), item("two", "B/two.webp")]) {
  return directory.mergeLibraryDirectoryNodes({ roots, items });
}

describe("Billfish-style directory workflow", () => {
  it("persists the all-materials and unfiled smart views across merging", () => {
    for (const selectedNodeId of [allId, unfiledId]) {
      expect(directory.mergeLibraryDirectoryNodes({ roots, items: [item("one")], settings: { ...base(), selectedNodeId } }).selectedNodeId).toBe(selectedNodeId);
    }
  });
  it("repairs corrupted persisted cycles so every folder remains reachable", () => {
    const settings = base();
    const a = directory.getLibraryFolderDirectoryNodeId("r", "A");
    const b = directory.getLibraryFolderDirectoryNodeId("r", "B");
    settings.nodes = settings.nodes.map(n => ({ ...n, parentId: n.id === a ? b : n.id === b ? a : n.parentId }));
    const merged = directory.mergeLibraryDirectoryNodes({ roots, items: [item("one", "A/one.webp"), item("two", "B/two.webp")], settings });
    for (const id of [a, b]) expect(directory.isLibraryDirectoryDescendant(merged.nodes, rootId, id)).toBe(true);
  });
  it("keeps explicit unfiled assignment instead of falling back to the disk folder", () => {
    const source = item("one", "A/one.webp");
    const settings = { ...base([source]), itemFolderIds: { one: unfiledId } };
    const merged = directory.mergeLibraryDirectoryNodes({ roots, items: [source], settings });
    expect(merged.itemFolderIds.one).toBe(unfiledId);
    expect(directory.getLibraryItemDirectoryId(source, merged, merged.nodes)).toBeNull();
  });
  it("cleans stale material assignments after deleting an index entry", () => {
    const settings = base(); settings.itemFolderIds = { gone: rootId, one: rootId };
    expect(directory.mergeLibraryDirectoryNodes({ roots, items: [item("one")], settings }).itemFolderIds).toEqual({ one: rootId });
  });
  it("preserves browse filters, search, and explicitly collapsed trees", () => {
    const normalized = directory.normalizeLibraryDirectorySettings({ favoriteOnly: true, formatFilter: "WEBP", tagFilter: " 长裙 ", availabilityFilter: "missing", searchQuery: " 写真 ", expandedNodeIds: [], showInfo: false });
    expect(normalized).toMatchObject({ favoriteOnly: true, formatFilter: "webp", tagFilter: "长裙", availabilityFilter: "missing", searchQuery: " 写真 ", expandedNodeIds: [], showInfo: false });
  });
  it("creates, renames, and removes a virtual folder without changing source paths", () => {
    expect(directory.createLibraryDirectoryFolder).toBeTypeOf("function");
    const source = item("one", "A/one.webp"); const settings = base([source]);
    const created = directory.createLibraryDirectoryFolder(settings, { id: "virtual-1", name: "精选", parentId: rootId });
    const renamed = directory.renameLibraryDirectoryFolder(created, "virtual-1", "客户选片");
    expect(renamed.nodes.find(n => n.id === "virtual-1")).toMatchObject({ kind: "virtual", name: "客户选片", parentId: rootId });
    const restored = directory.mergeLibraryDirectoryNodes({ roots, items: [source], settings: renamed });
    expect(restored.nodes.some(n => n.id === "virtual-1")).toBe(true);
    const assigned = { ...restored, itemFolderIds: { one: "virtual-1" } };
    const removed = directory.removeLibraryDirectoryFolder(assigned, "virtual-1");
    expect(removed.nodes.some(n => n.id === "virtual-1")).toBe(false);
    expect(source.mediaStorage).toMatchObject({ relativePath: "A/one.webp" });
  });
  it("can organize managed images even when no external directories are mounted", () => {
    expect(directory.createLibraryDirectoryFolder).toBeTypeOf("function");
    const folder = directory.createLibraryDirectoryFolder(directory.createDefaultLibraryDirectorySettings(), { id: "managed-folder", name: "灵感", parentId: null });
    const merged = directory.mergeLibraryDirectoryNodes({ roots: [], items: [], settings: folder });
    expect(merged.nodes.find(n => n.id === "managed-folder")?.parentId).toBeNull();
  });
  it("rejects duplicate sibling names and invalid virtual folder targets", () => {
    expect(directory.createLibraryDirectoryFolder).toBeTypeOf("function");
    const settings = directory.createLibraryDirectoryFolder(base(), { id: "v", name: "精选", parentId: rootId });
    expect(() => directory.createLibraryDirectoryFolder(settings, { id: "v2", name: " 精选 ", parentId: rootId })).toThrow();
    expect(() => directory.createLibraryDirectoryFolder(settings, { id: "v3", name: "选片", parentId: "missing" })).toThrow();
    expect(() => directory.removeLibraryDirectoryFolder(settings, rootId)).toThrow();
  });
  it("searches original file names and combines favorites, format, and tag filters", () => {
    expect(directory.selectLibraryDirectoryItems).toBeTypeOf("function");
    const one = item("one", "A/晨光 写真.webp", ["长裙"]); const two = item("two", "A/晨光.jpg", ["短裙"]);
    const settings = { ...base([one, two]), selectedNodeId: allId, favoriteOnly: true, formatFilter: "webp", tagFilter: "长裙", searchQuery: "晨光 写真" };
    expect(directory.selectLibraryDirectoryItems([one, two], settings, ["one"]).map(i => i.id)).toEqual(["one"]);
    expect(directory.selectLibraryDirectoryItems([one, two], settings, ["two"])).toEqual([]);
  });
  it("filters missing external files while keeping managed materials available", () => {
    expect(directory.selectLibraryDirectoryItems).toBeTypeOf("function");
    const missing = item("missing"); missing.mediaStorage = { ...missing.mediaStorage as Exclude<LibraryItem["mediaStorage"], "managed" | undefined>, status: "missing" };
    const managed = { ...item("managed"), mediaStorage: "managed" as const };
    const settings = { ...base([missing, managed]), selectedNodeId: allId, availabilityFilter: "missing" as const };
    expect(directory.selectLibraryDirectoryItems([missing, managed], settings).map(i => i.id)).toEqual(["missing"]);
  });
  it("supports range selection, additive selection, and deterministic deselection", () => {
    expect(directory.selectLibraryDirectoryRange).toBeTypeOf("function");
    expect([...directory.selectLibraryDirectoryRange(["a", "b", "c", "d"], ["a"], "c", { range: true, anchorId: "a" })]).toEqual(["a", "b", "c"]);
    expect([...directory.selectLibraryDirectoryRange(["a", "b", "c"], ["a"], "c", { additive: true })]).toEqual(["a", "c"]);
    expect([...directory.selectLibraryDirectoryRange(["a", "b", "c"], ["a", "c"], "c", { additive: true })]).toEqual(["a"]);
  });
  it("indexes actual Photoshop documents used by the real import fixture", () => {
    expect(isImageMediaFile("ps-session-backup.psd")).toBe(true);
  });
});
