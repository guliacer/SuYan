import { describe, expect, it } from "vitest";
import * as directory from "../../src/features/library/utils/libraryDirectory";
import type { LibraryItem, LibraryRoot } from "../../src/features/library/types/library";

const roots: LibraryRoot[] = [{ id: "r", label: "目录", absolutePath: "W:/目录", recursive: true, lastScanAt: null }];
const rootId = directory.getLibraryRootDirectoryNodeId("r");
function item(id: string, patch: Partial<LibraryItem> = {}): LibraryItem {
  return { id, title: id, imageFileName: id + ".webp", prompt: "", negativePrompt: "", tags: [], createdAt: "2026-11-14T00:00:00Z", updatedAt: "2026-11-14T00:00:00Z", ...patch };
}
function fixture() {
  const items = [
    item("external", { mediaStorage: { kind: "external", rootId: "r", relativePath: "A/a.webp", size: 10, mtimeMs: 1, status: "available" } }),
    item("copied", { importSource: { rootId: "copy", rootName: "复制目录", relativePath: "B/b.webp", size: 10, mtimeMs: 1 } }),
    item("assigned", { tags: ["精选"] }),
    item("unrelated", { tags: ["精选"] }),
    item("explicit-unfiled", { mediaStorage: { kind: "external", rootId: "r", relativePath: "A/e.webp", size: 10, mtimeMs: 1, status: "available" } }),
  ];
  const settings = directory.mergeLibraryDirectoryNodes({ roots, items, settings: { ...directory.createDefaultLibraryDirectorySettings(), legacyGroupingDone: true, itemFolderIds: { assigned: rootId, "explicit-unfiled": directory.UNFILED_LIBRARY_DIRECTORY_ID } } });
  return { items, settings, index: directory.buildLibraryDirectoryItemIndex(items, settings) };
}

describe("directory-only workspace scope", () => {
  it("includes indexed, copied and explicitly assigned directory assets, not unrelated or unfiled assets", () => {
    expect(directory.getLibraryDirectoryScopedItems).toBeTypeOf("function");
    const { items, index } = fixture();
    expect(directory.getLibraryDirectoryScopedItems(items, index.itemDirectoryById).map(entry => entry.id)).toEqual(["external", "copied", "assigned"]);
  });
  it("keeps every search, filter and all-directory query inside the directory scope", () => {
    expect(directory.getLibraryDirectoryScopedItems).toBeTypeOf("function");
    const { items, settings, index } = fixture();
    const scoped = directory.getLibraryDirectoryScopedItems(items, index.itemDirectoryById);
    expect(directory.selectLibraryDirectoryItems(scoped, { ...settings, includeDescendants: true }, [], index.itemDirectoryById)).toHaveLength(3);
    expect(directory.selectLibraryDirectoryItems(scoped, { ...settings, tagFilter: "精选" }, [], index.itemDirectoryById).map(entry => entry.id)).toEqual(["assigned"]);
    expect(directory.buildLibraryDirectoryItemIndex(scoped, settings).counts.get(directory.ALL_LIBRARY_DIRECTORY_ID)).toBe(3);
  });
  it("migrates a previously selected unfiled view to directory overview without modifying assignments", () => {
    expect(directory.getLibraryDirectoryWorkspaceSettings).toBeTypeOf("function");
    const { settings } = fixture();
    const previous = { ...settings, selectedNodeId: directory.UNFILED_LIBRARY_DIRECTORY_ID, includeDescendants: true, searchQuery: "old" };
    const result = directory.getLibraryDirectoryWorkspaceSettings(previous);
    expect(result).toMatchObject({ browseBy: "directories", selectedNodeId: directory.ALL_LIBRARY_DIRECTORY_ID, includeDescendants: false, searchQuery: "" });
    expect(result.itemFolderIds).toEqual(previous.itemFolderIds);
    expect(previous.selectedNodeId).toBe(directory.UNFILED_LIBRARY_DIRECTORY_ID);
  });
  it("restores directory navigation from legacy tag/category/format entrances and preserves unrelated display settings", () => {
    expect(directory.getLibraryDirectoryWorkspaceSettings).toBeTypeOf("function");
    const { settings } = fixture();
    for (const browseBy of ["tags", "categories", "formats"] as const) {
      const previous = { ...settings, browseBy, tagFilter: "old", categoryFilter: "old", formatFilter: "webp", tileSize: 320, galleryMode: "list" as const };
      expect(directory.getLibraryDirectoryWorkspaceSettings(previous)).toMatchObject({ browseBy: "directories", tagFilter: "", categoryFilter: "", formatFilter: "", tileSize: 320, galleryMode: "list" });
    }
  });
  it("retains current valid directory and intentionally selected filters", () => {
    expect(directory.getLibraryDirectoryWorkspaceSettings).toBeTypeOf("function");
    const { settings } = fixture();
    const current = { ...settings, selectedNodeId: rootId, tagFilter: "精选" };
    expect(directory.getLibraryDirectoryWorkspaceSettings(current)).toBe(current);
  });
});
