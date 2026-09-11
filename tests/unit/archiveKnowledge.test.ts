import { describe, expect, it } from "vitest";
import { collectArchiveAnalyzedLibraries, mergeArchiveAnalyzedLibraries, readArchiveAnalyzedLibraries, remapArchiveKnowledgeImages } from "../../electron/main/library/archiveKnowledge";
import type { CategoryNode, CategoryTaxonomy } from "../../src/features/library/types/category";
import type { LibraryItem, PromptImageLexiconEntry } from "../../src/features/library/types/library";

const timestamp = "2026-09-10T00:00:00.000Z";
const node = (id: string, name = id, parentId: string | null = null): CategoryNode => ({
  id, name, parentId, type: "custom", group: "我的项目/题材", aliases: [], keywords: [name], description: "已归纳的分类",
  examples: ["另一作品的提示词"], usageCount: 99, createdAt: timestamp, updatedAt: timestamp,
});
const tree = (nodes: CategoryNode[]): CategoryTaxonomy => ({ schemaVersion: 1, updatedAt: timestamp, nodes });
const entry = (id: string, label = id): PromptImageLexiconEntry => ({ id, label, group: "器材/相机品牌", description: "已分析的标签", aliases: ["Hasselblad"],
  groupLocked: true, reviewStatus: "accepted", analysis: { dimension: "object", confidence: 0.97, evidence: ["机身可见哈苏品牌"] } });
const item: LibraryItem = { id: "work", imageFileName: "work.png", title: "作品", prompt: "相机", negativePrompt: "", tags: ["Hasselblad"],
  categoryId: "custom:child", genreIds: ["custom:child", "custom:secondary"], createdAt: timestamp, updatedAt: timestamp };
const sourceTree = tree([node("custom:root"), node("custom:child", "项目人像", "custom:root"), node("custom:secondary", "旅行纪实"), node("custom:unrelated")]);

describe("share package analyzed libraries", () => {
  it("includes primary/secondary categories, parents, exact tag aliases and all analysis fields, but no unrelated entries", () => {
    const tag = { ...entry("camera", "哈苏"), imageFileName: "camera.png", parentId: "brands" };
    const source = { categories: [entry("custom:child", "项目人像")], tags: [entry("brands", "相机品牌"), tag, { ...entry("other", "旅行"), aliases: [] }] };
    const before = structuredClone(source);
    const result = collectArchiveAnalyzedLibraries([item], sourceTree, source);
    expect(result.categoryTaxonomy.nodes.map(n => n.id)).toEqual(["custom:root", "custom:child", "custom:secondary"]);
    expect(result.categories.map(e => e.id)).toEqual(expect.arrayContaining(["custom:root", "custom:child", "custom:secondary"]));
    expect(result.tags).toContainEqual(tag);
    expect(result.tags.map(e => e.id)).toEqual(["brands", "camera"]);
    expect(result.categoryTaxonomy.nodes.every(n => n.examples.length === 0 && !n.embedding)).toBe(true);
    expect(readArchiveAnalyzedLibraries(JSON.parse(JSON.stringify(result)))?.tags).toContainEqual(tag);
    expect(source).toEqual(before);
  });

  it("remaps conflicting category IDs only on incoming works and keeps local definitions", () => {
    const local = tree([node("custom:child", "本地静物")]);
    const localTag = { ...entry("local-camera", "哈苏"), group: "我的器材", imageFileName: "local.png" };
    const source = collectArchiveAnalyzedLibraries([item], sourceTree, { categories: [], tags: [entry("camera", "哈苏")] });
    const merged = mergeArchiveAnalyzedLibraries(local, { categories: [], tags: [localTag] }, source, [item]);
    const incomingId = merged.items[0].categoryId!;
    expect(incomingId).not.toBe(item.categoryId);
    expect(merged.items[0].genreIds).toContain(incomingId);
    expect(merged.items[0].tags).toEqual(["哈苏"]);
    expect(merged.taxonomy.nodes.find(n => n.id === incomingId)?.name).toBe("项目人像");
    expect(merged.taxonomy.nodes[0]).toEqual(local.nodes[0]);
    expect(merged.lexicons.tags).toEqual([localTag]);
    expect(merged.lexicons.categories.find(e => e.id === incomingId)?.label).toBe("项目人像");
    expect(local.nodes).toHaveLength(1);
    expect(item.categoryId).toBe("custom:child");
  });

  it("rewrites cover references everywhere without copying sender filenames", () => {
    const source = collectArchiveAnalyzedLibraries([item], tree([{ ...node("custom:child"), imageFileName: "cover.jpg" }]), {
      categories: [{ ...entry("custom:child"), imageFileName: "cover.jpg" }], tags: [{ ...entry("camera", "哈苏"), imageFileName: "camera.png" }],
    });
    const result = remapArchiveKnowledgeImages(source, new Map([["cover.jpg", "new.jpg"], ["camera.png", "new.png"]]));
    expect(result.categories[0].imageFileName).toBe("new.jpg");
    expect(result.categoryTaxonomy.nodes[0].imageFileName).toBe("new.jpg");
    expect(result.tags[0].imageFileName).toBe("new.png");
    expect(source.categories[0].imageFileName).toBe("cover.jpg");
  });

  it("keeps legacy archives valid, rejects cycles, unsafe cover paths and duplicate IDs", () => {
    expect(readArchiveAnalyzedLibraries(undefined)).toBeUndefined();
    const source = collectArchiveAnalyzedLibraries([item], sourceTree, null);
    for (const corrupt of [
      { ...source, tags: [{ ...entry("x"), parentId: "x" }] },
      { ...source, tags: [{ ...entry("x"), imageFileName: "../private.png" }] },
      { ...source, tags: [entry("x"), entry("x")] },
    ]) expect(() => readArchiveAnalyzedLibraries(corrupt)).toThrow(/结构不合法/);
  });

  it("does not merge ambiguous tag aliases or seed unrelated tags into an empty recipient", () => {
    const source = collectArchiveAnalyzedLibraries([item], sourceTree, { categories: [], tags: [entry("a", "相机甲"), entry("b", "相机乙")] });
    const merged = mergeArchiveAnalyzedLibraries(tree([]), { categories: [], tags: [] }, source, [item]);
    expect(merged.items[0].tags).toEqual(["Hasselblad"]);
    expect(merged.lexicons.tags).toHaveLength(2);
  });

  it("fills missing analysis and covers without replacing a local group or existing analysis", () => {
    const incomingTag = { ...entry("camera", "哈苏"), imageFileName: "incoming.png" };
    const source = collectArchiveAnalyzedLibraries([item], sourceTree, { categories: [], tags: [incomingTag] });
    const local = { id: "my-camera", label: "哈苏", group: "我的收藏", description: "本地说明" };
    const merged = mergeArchiveAnalyzedLibraries(tree([]), { categories: [], tags: [local] }, source, [item]);
    expect(merged.lexicons.tags).toEqual([{ ...local, imageFileName: "incoming.png", aliases: incomingTag.aliases, analysis: incomingTag.analysis, reviewStatus: "accepted" }]);
    expect(local).not.toHaveProperty("imageFileName");
  });

  it("does not include a different category that happens to have the same label", () => {
    const source = collectArchiveAnalyzedLibraries([item], sourceTree, { categories: [
      entry("custom:child", "项目人像"), { ...entry("custom:another-project", "项目人像"), group: "其他项目" },
    ], tags: [] });
    expect(source.categories.some(e => e.id === "custom:another-project")).toBe(false);
  });
});
