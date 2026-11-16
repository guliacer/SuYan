import { describe, expect, it } from "vitest";
import type { LibraryItem, LibraryRoot } from "../../src/features/library/types/library";
import {
  assignLibraryItemsToDirectory,
  getDefaultLibraryItemDirectoryId,
  getDirectoryNodeDescendantIds,
  getLibraryFolderDirectoryNodeId,
  getLibraryRootDirectoryNodeId,
  isLibraryDirectoryDescendant,
  mergeLibraryDirectoryNodes,
  moveLibraryDirectoryNode,
  unassignLibraryItemsFromDirectory,
} from "../../src/features/library/utils/libraryDirectory";

const roots: LibraryRoot[] = [
  {
    id: "root-a",
    label: "参考图",
    absolutePath: "D:/参考图",
    recursive: true,
    lastScanAt: null,
  },
];

function item(id: string, relativePath: string): LibraryItem {
  return {
    id,
    title: id,
    imageFileName: `${id}.png`,
    mediaStorage: {
      kind: "external",
      rootId: "root-a",
      relativePath,
      size: 100,
      mtimeMs: 1,
      status: "available",
    },
    prompt: "",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
  };
}

describe("library directory model", () => {
  it("normalizes a persisted directory sidebar width into the supported range", async () => {
    const { normalizeLibraryDirectorySettings } = await import("../../src/features/library/utils/libraryDirectory");
    expect(normalizeLibraryDirectorySettings({ sidebarWidth: 140 }).sidebarWidth).toBe(180);
    expect(normalizeLibraryDirectorySettings({ sidebarWidth: 520 }).sidebarWidth).toBe(420);
    expect(normalizeLibraryDirectorySettings({}).sidebarWidth).toBe(228);
  });

  it("derives roots and nested physical folders from external paths", () => {
    const settings = mergeLibraryDirectoryNodes({
      roots,
      items: [item("one", "人物/室内/one.png")],
    });
    const rootId = getLibraryRootDirectoryNodeId("root-a");
    const peopleId = getLibraryFolderDirectoryNodeId("root-a", "人物");
    const roomId = getLibraryFolderDirectoryNodeId("root-a", "人物/室内");

    expect(settings.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([rootId, peopleId, roomId]));
    expect(settings.nodes.find((node) => node.id === peopleId)?.parentId).toBe(rootId);
    expect(settings.nodes.find((node) => node.id === roomId)?.parentId).toBe(peopleId);
    expect(getDefaultLibraryItemDirectoryId(item("one", "人物/室内/one.png"), settings.nodes)).toBe(roomId);
  });

  it("moves a folder inside another folder and rejects cycles", () => {
    const settings = mergeLibraryDirectoryNodes({
      roots,
      items: [item("one", "人物/室内/one.png"), item("two", "风景/two.png")],
    });
    const peopleId = getLibraryFolderDirectoryNodeId("root-a", "人物");
    const roomId = getLibraryFolderDirectoryNodeId("root-a", "人物/室内");
    const landscapeId = getLibraryFolderDirectoryNodeId("root-a", "风景");

    const moved = moveLibraryDirectoryNode(settings.nodes, landscapeId, peopleId, "inside");
    expect(moved.find((node) => node.id === landscapeId)?.parentId).toBe(peopleId);
    expect(isLibraryDirectoryDescendant(moved, peopleId, landscapeId)).toBe(true);
    expect(() => moveLibraryDirectoryNode(moved, peopleId, roomId, "inside")).toThrow("自身或子目录");
  });

  it("reorders siblings without changing unrelated parentage", () => {
    const settings = mergeLibraryDirectoryNodes({
      roots,
      items: [item("one", "A/one.png"), item("two", "B/two.png")],
    });
    const aId = getLibraryFolderDirectoryNodeId("root-a", "A");
    const bId = getLibraryFolderDirectoryNodeId("root-a", "B");
    const reordered = moveLibraryDirectoryNode(settings.nodes, bId, aId, "before");
    const rootId = getLibraryRootDirectoryNodeId("root-a");
    const topLevel = reordered.filter((node) => node.parentId === rootId).sort((left, right) => left.order - right.order);
    expect(topLevel.map((node) => node.id)).toEqual([bId, aId]);
  });

  it("assigns multiple items to a folder and exposes descendants", () => {
    const settings = mergeLibraryDirectoryNodes({
      roots,
      items: [item("one", "A/one.png"), item("two", "A/B/two.png")],
    });
    const aId = getLibraryFolderDirectoryNodeId("root-a", "A");
    const bId = getLibraryFolderDirectoryNodeId("root-a", "A/B");
    const assignments = assignLibraryItemsToDirectory(["one", "two"], bId, settings.nodes);

    expect(assignments).toEqual({ one: bId, two: bId });
    expect(Array.from(getDirectoryNodeDescendantIds(settings.nodes, aId))).toEqual(expect.arrayContaining([aId, bId]));
  });

  it("returns dragged items to the unfiled view without changing other assignments", () => {
    const settings = mergeLibraryDirectoryNodes({
      roots,
      items: [item("one", "A/one.png"), item("two", "A/two.png")],
    });
    const aId = getLibraryFolderDirectoryNodeId("root-a", "A");
    const assignments = unassignLibraryItemsFromDirectory(["one"], { one: aId, two: aId });

    expect(assignments).toEqual({ two: aId });
  });
});
