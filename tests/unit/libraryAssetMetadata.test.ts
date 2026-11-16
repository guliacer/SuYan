import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/unused" } }));
import { normalizeItem } from "../../electron/main/library/libraryStore";
import { getLibraryItemSourcePath } from "../../src/features/library/utils/libraryImportSource";
import type { LibraryItem, LibraryRoot } from "../../src/features/library/types/library";
const item: LibraryItem = { id: "asset", title: "照片", imageFileName: "asset.webp", prompt: "", negativePrompt: "", tags: [], createdAt: "2026-11-14T00:00:00.000Z", updatedAt: "2026-11-14T00:00:00.000Z" };
describe("asset information persistence", () => {
  it("keeps notes, star rating and copied-folder provenance through library normalization", () => {
    const enriched = { ...item, notes: "客户选片\n需保留留白", rating: 4, importSource: { rootId: "source", rootName: "写真", relativePath: "室内/照片.webp", size: 1234, mtimeMs: 1 } };
    expect(normalizeItem(enriched)).toMatchObject({ notes: enriched.notes, rating: 4, importSource: enriched.importSource });
  });
  it("normalizes ratings and rejects invalid traversal provenance", () => {
    expect(normalizeItem({ ...item, rating: 99, importSource: { rootId: "x", rootName: "x", relativePath: "../outside.jpg" } } as LibraryItem)).toMatchObject({ rating: 5, importSource: null });
  });
});


describe("asset source paths", () => {
  const root: LibraryRoot = { id: "source", label: "写真", absolutePath: "W:/写真", recursive: true, lastScanAt: null };
  const external: LibraryItem = { ...item, mediaStorage: { kind: "external", rootId: "source", relativePath: "室内/照片.webp", size: 1234, mtimeMs: 1, status: "available" } };
  it.each(["W:/写真", "W:/写真/", "W:/写真///", "W:/写真\\"])("joins an external root without duplicate separators (%s)", absolutePath => {
    expect(getLibraryItemSourcePath(external, { ...root, absolutePath }, "软件素材库")).toBe("W:/写真/室内/照片.webp");
  });
  it("copies the external path even when copied-import provenance also exists", () => {
    expect(getLibraryItemSourcePath({ ...external, importSource: { rootId: "old", rootName: "旧目录", relativePath: "旧照片.webp" } }, root, "软件素材库")).toBe("W:/写真/室内/照片.webp");
  });
  it("preserves copied-import provenance for a managed asset", () => {
    expect(getLibraryItemSourcePath({ ...item, mediaStorage: "managed", importSource: { rootId: "source", rootName: "写真", relativePath: "室内/照片.webp" } }, undefined, "软件素材库")).toBe("写真/室内/照片.webp");
  });
  it("preserves the localized managed-library label when there is no provenance", () => {
    expect(getLibraryItemSourcePath(item, undefined, "Local library")).toBe("Local library");
  });
});
