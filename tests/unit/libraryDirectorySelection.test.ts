import { describe, expect, it } from "vitest";
import * as directory from "../../src/features/library/utils/libraryDirectory";
const all = directory.ALL_LIBRARY_DIRECTORY_ID;
const nodes = [
  { id: "root", name: "Root", parentId: null, rootId: "r", relativePath: "", kind: "root" as const, order: 0 },
  { id: "a", name: "A", parentId: "root", rootId: "r", relativePath: "A", kind: "folder" as const, order: 0 },
  { id: "b", name: "B", parentId: "root", rootId: "r", relativePath: "B", kind: "folder" as const, order: 1 },
];
const valid = new Map([...nodes.map(n => [n.id, n] as const), [all, nodes[0]]]);
describe("mounted directory external selection", () => {
  it("follows a changed saved selection even when the local old folder is valid", () => {
    expect(directory.resolveLibraryDirectorySelection).toBeTypeOf("function");
    expect(directory.resolveLibraryDirectorySelection("a", "a", "b", valid)).toBe("b");
  });
  it("preserves an immediate local click until saved selection actually changes", () => {
    expect(directory.resolveLibraryDirectorySelection).toBeTypeOf("function");
    expect(directory.resolveLibraryDirectorySelection("b", "a", "a", valid)).toBe("b");
  });
  it("follows rollback and falls back after a selected folder disappears", () => {
    expect(directory.resolveLibraryDirectorySelection).toBeTypeOf("function");
    expect(directory.resolveLibraryDirectorySelection("b", "b", "a", valid)).toBe("a");
    expect(directory.resolveLibraryDirectorySelection("gone", "a", "a", valid)).toBe("a");
    expect(directory.resolveLibraryDirectorySelection("gone", null, "missing", valid)).toBe(all);
  });
  it("expands root-to-parent ancestors without entering cycles", () => {
    expect(directory.getLibraryDirectoryAncestorIds).toBeTypeOf("function");
    expect(directory.getLibraryDirectoryAncestorIds(nodes, "b")).toEqual(["root"]);
    expect(directory.getLibraryDirectoryAncestorIds(nodes, "missing")).toEqual([]);
    expect(directory.getLibraryDirectoryAncestorIds(nodes.map(n => n.id === "root" ? { ...n, parentId: "a" } : n), "a")).toEqual(["root"]);
  });
});
