import { describe, expect, it } from "vitest";
import * as directory from "../../src/features/library/utils/libraryDirectory";
import type { LibraryItem } from "../../src/features/library/types/library";
const make = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({ id, title: id, imageFileName: id + ".webp", prompt: "", negativePrompt: "", tags: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", ...extra });
const items = [make("A", { importSource: { rootId: "r", rootName: "照片", relativePath: "A.webp", size: 500, mtimeMs: 1000 }, rating: 2, tags: ["国风"], categoryId: "primary", genreIds: ["secondary"] }), make("B", { importSource: { rootId: "r", rootName: "照片", relativePath: "B.jpg", size: 100, mtimeMs: 2000 }, rating: 5, tags: ["风光"] }), make("C", { importSource: { rootId: "r", rootName: "照片", relativePath: "C.png", size: 300, mtimeMs: 3000 }, rating: 0, category: "人像" })];
const settings = () => directory.createDefaultLibraryDirectorySettings();
const ids = (overrides: Partial<directory.LibraryDirectorySettings>) => directory.selectLibraryDirectoryItems(items, { ...settings(), ...overrides }).map(item => item.id);
describe("directory browse controls", () => {
  it("preserves quiet browse grouping, category, rating and stable random settings", () => {
    expect(directory.normalizeLibraryDirectorySettings({ browseBy: "categories", categoryFilter: "primary", minimumRating: 4, randomSeed: 73, sortMode: "rating" })).toMatchObject({ browseBy: "categories", categoryFilter: "primary", minimumRating: 4, randomSeed: 73, sortMode: "rating" });
  });
  it("sorts copied imports by original size and modification time instead of treating them as zero", () => {
    expect(ids({ sortMode: "imageSize", sortDirection: "asc" })).toEqual(["B", "C", "A"]);
    expect(ids({ sortMode: "modifiedAt", sortDirection: "desc" })).toEqual(["C", "B", "A"]);
  });
  it("supports rating and real-source format sorting in both directions", () => {
    expect(ids({ sortMode: "rating", sortDirection: "desc" })).toEqual(["B", "A", "C"]);
    expect(ids({ sortMode: "format", sortDirection: "asc" })).toEqual(["B", "C", "A"]);
  });
  it("filters primary, secondary and legacy categories without changing tags", () => {
    expect(ids({ categoryFilter: "primary" })).toEqual(["A"]);
    expect(ids({ categoryFilter: "secondary" })).toEqual(["A"]);
    expect(ids({ categoryFilter: "人像" })).toEqual(["C"]);
    expect(ids({ categoryFilter: "__uncategorized__" })).toEqual(["B"]);
    expect(items[0].tags).toEqual(["国风"]);
  });
  it("filters ratings and keeps random order stable through normalization/reload", () => {
    expect(ids({ minimumRating: 3 })).toEqual(["B"]);
    expect(ids({ sortMode: "random", randomSeed: 73 })).toEqual(ids(directory.normalizeLibraryDirectorySettings({ ...settings(), sortMode: "random", randomSeed: 73 })));
  });
  it("builds counted facet lists for tags, categories and formats, including missing categories", () => {
    expect(directory.buildLibraryDirectoryFacets).toBeTypeOf("function");
    const facets = directory.buildLibraryDirectoryFacets(items);
    expect(facets.tags).toEqual(expect.arrayContaining([{ value: "国风", count: 1 }, { value: "风光", count: 1 }]));
    expect(facets.tags).toHaveLength(2);
    expect(facets.categories).toContainEqual({ value: "secondary", count: 1 });
    expect(facets.categories).toContainEqual({ value: "__uncategorized__", count: 1 });
    expect(facets.formats.map(f => f.value)).toEqual(["jpg", "png", "webp"]);
  });
});
