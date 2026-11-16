import { describe, expect, it } from "vitest";
import * as appearance from "../../src/features/library/utils/libraryDirectoryAppearance";
import * as directory from "../../src/features/library/utils/libraryDirectory";
const nodes = [
  { id: "r1", name: "插画设计", parentId: null, rootId: "1", relativePath: "", kind: "root" as const, order: 0 },
  { id: "a", name: "创意插画", parentId: "r1", rootId: "1", relativePath: "A", kind: "folder" as const, order: 0 },
  { id: "b", name: "子目录", parentId: "a", rootId: "1", relativePath: "A/B", kind: "folder" as const, order: 0 },
  { id: "r2", name: "平面设计", parentId: null, rootId: "2", relativePath: "", kind: "root" as const, order: 1 },
  { id: "r3", name: "室内设计", parentId: null, rootId: "3", relativePath: "", kind: "root" as const, order: 2 },
];
describe("directory color parity", () => {
  it("uses soft red, blue and purple for successive top-level folders with inherited children", () => {
    const colors = appearance.buildLibraryDirectoryColors(nodes);
    expect(colors.get("r1")).toBe("#ef8793"); expect(colors.get("r2")).toBe("#60bcf4"); expect(colors.get("r3")).toBe("#af89e5");
    expect(colors.get("a")).toBe(colors.get("r1")); expect(colors.get("b")).toBe(colors.get("r1"));
  });
  it("supports a per-folder override and lets descendants inherit it", () => {
    const settings = { ...directory.createDefaultLibraryDirectorySettings(), nodes };
    const next = appearance.setLibraryDirectoryColor(settings, "a", "#abc");
    expect(appearance.buildLibraryDirectoryColors(next.nodes).get("b")).toBe("#aabbcc");
    expect(appearance.buildLibraryDirectoryColors(appearance.setLibraryDirectoryColor(next, "a", null).nodes).get("b")).toBe("#ef8793");
    expect(settings.nodes[1]).not.toHaveProperty("color");
  });
  it("normalizes persisted colors and rejects invalid CSS or absent folders", () => {
    expect(appearance.normalizeLibraryDirectoryColor(" #AABBCD ")).toBe("#aabbcd");
    expect(appearance.normalizeLibraryDirectoryColor("url(https://bad)")).toBeNull();
    const settings = directory.normalizeLibraryDirectorySettings({ nodes: [{ ...nodes[0], color: "#ABC" }, { ...nodes[1], color: "bad" }] });
    expect(settings.nodes[0]).toHaveProperty("color", "#aabbcc"); expect(settings.nodes[1]).not.toHaveProperty("color");
    expect(() => appearance.setLibraryDirectoryColor(settings, "r1", "bad")).toThrow();
    expect(() => appearance.setLibraryDirectoryColor(settings, "missing", "#aabbcc")).toThrow();
  });
  it("is deterministic and handles corrupted parent cycles without recursion overflow", () => {
    const corrupt = nodes.map(n => n.id === "r1" ? { ...n, parentId: "b" } : n);
    expect([...appearance.buildLibraryDirectoryColors(corrupt)]).toEqual([...appearance.buildLibraryDirectoryColors(corrupt)]);
    expect(appearance.buildLibraryDirectoryColors(corrupt).size).toBe(nodes.length);
  });
});
