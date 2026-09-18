import { describe, expect, it } from "vitest";
import { buildSystemCategoryTaxonomy } from "../../src/features/library/utils/systemCategoryTaxonomy";
import {
  matchCategoriesByText,
  resolveCategoryIdFromLegacyName,
  resolveCategoryName,
  ensureSystemCategoryTaxonomy,
  mergeLexiconCategoriesIntoTaxonomy,
  ensureTaxonomyHasCategory,
  removeCategoryNode,
  upsertCustomCategoryNode,
  removeCustomCategoryNode,
  compareCategoryGroupPriority,
  listCategoryTreeGroups,
} from "../../src/features/library/utils/categoryTaxonomy";
import { migrateLibraryFileCategories, assignItemCategory } from "../../src/features/library/utils/categoryMigration";
import { analyzeCategoryHealth, mergeCategories } from "../../src/features/library/utils/categoryHealth";
import { buildTaxonomyCategoryAiResult } from "../../src/features/library/utils/categoryAiBinding";
import { confidenceBand, UNCATEGORIZED_CATEGORY_ID } from "../../src/features/library/types/category";
import type { LibraryFile, LibraryItem } from "../../src/features/library/types/library";

function makeItem(partial: Partial<LibraryItem> & Pick<LibraryItem, "id" | "title">): LibraryItem {
  return {
    imageFileName: `${partial.id}.png`,
    prompt: partial.prompt ?? "test prompt",
    negativePrompt: "",
    tags: partial.tags ?? [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("category taxonomy", () => {
  it("seeds system taxonomy with stable uncategorized and precise photography leaves", () => {
    const taxonomy = buildSystemCategoryTaxonomy("2026-01-01T00:00:00.000Z");
    expect(taxonomy.nodes.some((node) => node.id === UNCATEGORIZED_CATEGORY_ID)).toBe(true);
    expect(taxonomy.nodes.length).toBeGreaterThan(20);
    const portrait = resolveCategoryIdFromLegacyName(taxonomy, "肖像摄影");
    expect(portrait).toBeTruthy();
    expect(portrait?.startsWith("system:")).toBe(true);
    expect(resolveCategoryIdFromLegacyName(taxonomy, "肖像摄影")).toBe(portrait);
  });

  it("resolves aliases to canonical system categories", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    expect(resolveCategoryIdFromLegacyName(taxonomy, "航拍")).toBe(
      resolveCategoryIdFromLegacyName(taxonomy, "航拍摄影"),
    );
    expect(resolveCategoryIdFromLegacyName(taxonomy, "产品摄影")).toBe(
      resolveCategoryIdFromLegacyName(taxonomy, "产品摄影"),
    );
  });

  it("migrates legacy string category onto categoryId", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const library: LibraryFile = {
      schemaVersion: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [
        makeItem({ id: "1", title: "a", category: "人像写真", tags: ["电影感"] }),
        makeItem({ id: "2", title: "b", category: "未分类", tags: [] }),
      ],
    };

    const result = migrateLibraryFileCategories(library, taxonomy);
    expect(result.library.schemaVersion).toBe(2);
    expect(result.library.items[0].categoryId).toBe(resolveCategoryIdFromLegacyName(taxonomy, "肖像摄影"));
    expect(result.library.items[0].category).toBe("肖像摄影");
    expect(result.library.items[1].categoryId).toBeNull();
  });

  it("matches categories by text keywords", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const hits = matchCategoriesByText(taxonomy, "白底商品电商产品展示图，棚拍");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].categoryId).toBeTruthy();
  });

  it("prioritizes precise beverage leaves over legacy food/product categories", () => {
    const taxonomy = buildSystemCategoryTaxonomy();

    const teaId = resolveCategoryIdFromLegacyName(taxonomy, "茶饮摄影");
    const coffeeId = resolveCategoryIdFromLegacyName(taxonomy, "咖啡摄影");
    const processId = resolveCategoryIdFromLegacyName(taxonomy, "饮品制作过程摄影");
    expect(teaId).toBeTruthy();
    expect(coffeeId).toBeTruthy();
    expect(processId).toBeTruthy();

    const teaHits = matchCategoriesByText(taxonomy, "奶茶广告，绿色背景，商业饮品视觉", 5);
    expect(teaHits[0]?.categoryId).toBe(teaId);
    expect(teaHits.some((hit) => hit.categoryId === resolveCategoryIdFromLegacyName(taxonomy, "食品摄影"))).toBe(false);
    expect(teaHits.some((hit) => hit.categoryId === resolveCategoryIdFromLegacyName(taxonomy, "产品摄影"))).toBe(false);

    const coffeeHits = matchCategoriesByText(taxonomy, "手冲咖啡，倒液制作过程", 5);
    expect(coffeeHits.some((hit) => hit.categoryId === coffeeId)).toBe(true);
    expect(coffeeHits.some((hit) => hit.categoryId === processId)).toBe(true);
  });

  it("keeps bridal photography separate from wedding-day event photography", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const bridalId = resolveCategoryIdFromLegacyName(taxonomy, "婚纱摄影");
    const weddingId = resolveCategoryIdFromLegacyName(taxonomy, "婚礼摄影");

    expect(bridalId).toBeTruthy();
    expect(weddingId).toBeTruthy();
    expect(bridalId).not.toBe(weddingId);

    const bridalHits = matchCategoriesByText(taxonomy, "户外婚纱照，礼服造型，婚前外景拍摄", 5);
    expect(bridalHits[0]?.categoryId).toBe(bridalId);

    const eventHits = matchCategoriesByText(taxonomy, "婚礼仪式与婚宴现场纪实摄影", 5);
    expect(eventHits[0]?.categoryId).toBe(weddingId);
  });

  it("merges custom lexicon entries into taxonomy", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const merged = mergeLexiconCategoriesIntoTaxonomy(taxonomy, [
      {
        id: "custom:client-a:1",
        group: "项目",
        label: "客户A项目",
        description: "专属项目",
        parentId: null,
        imageFileName: null,
      },
      // Old system leftovers must NOT become custom categories.
      {
        id: "category-12",
        group: "历史地域服饰类",
        label: "中国汉服体系",
        description: "旧系统残留",
        parentId: null,
        imageFileName: null,
      },
    ]);
    expect(resolveCategoryIdFromLegacyName(merged, "客户A项目")).toBeTruthy();
    expect(merged.nodes.some((node) => node.name === "中国汉服体系" && node.type === "custom")).toBe(false);
    expect(merged.nodes.some((node) => node.group === "历史地域服饰类")).toBe(false);
  });

  it("assigns category with user source and confidence", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const id = resolveCategoryIdFromLegacyName(taxonomy, "食品摄影");
    expect(id).toBeTruthy();
    const item = assignItemCategory(makeItem({ id: "x", title: "food" }), taxonomy, id, "user", 1);
    expect(item.categoryId).toBe(id);
    expect(item.categorySource).toBe("user");
    expect(item.category).toBe("食品摄影");
  });

  it("keeps cleared categories empty after migrate (移出分类 must not reattach)", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const foodId = resolveCategoryIdFromLegacyName(taxonomy, "食品摄影");
    expect(foodId).toBeTruthy();

    const assigned = assignItemCategory(makeItem({ id: "clear-1", title: "food" }), taxonomy, foodId, "user", 1);
    const cleared = assignItemCategory(assigned, taxonomy, null, "user", 1);
    expect(cleared.categoryId).toBeNull();
    expect(cleared.category).toBeNull();
    expect(cleared.legacyCategory).toBe("食品摄影");

    const migrated = migrateLibraryFileCategories(
      {
        schemaVersion: 2,
        updatedAt: "2026-01-01T00:00:00.000Z",
        items: [cleared],
      },
      taxonomy,
    );

    expect(migrated.library.items[0].categoryId).toBeNull();
    expect(migrated.library.items[0].category).toBeNull();
    // History may remain for audit, but must not drive membership.
    expect(migrated.library.items[0].legacyCategory).toBe("食品摄影");
  });

  it("clears freeform category labels when reassigned to uncategorized", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const freeform = makeItem({
      id: "free-1",
      title: "创意条",
      category: "创意",
      categoryId: null,
    });
    const cleared = assignItemCategory(freeform, taxonomy, null, "user", 1);
    expect(cleared.category).toBeNull();
    expect(cleared.categoryId).toBeNull();
    expect(cleared.legacyCategory).toBe("创意");
  });

  it("detects duplicate health issues and can merge", () => {
    const base = buildSystemCategoryTaxonomy();
    const foodId = resolveCategoryIdFromLegacyName(base, "食品摄影");
    expect(foodId).toBeTruthy();
    const customId = "custom:food-dup:1";
    const taxonomy = {
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: customId,
          name: "美食",
          type: "custom" as const,
          parentId: null,
          group: "自定义",
          aliases: ["食品摄影"],
          keywords: [],
          description: "",
          examples: [],
          embedding: null,
          usageCount: 2,
          imageFileName: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const items = [
      makeItem({ id: "1", title: "a", categoryId: customId, category: "美食" }),
      makeItem({ id: "2", title: "b", categoryId: foodId, category: "食品摄影" }),
    ];

    const issues = analyzeCategoryHealth(taxonomy, items);
    expect(issues.some((issue) => issue.kind === "duplicate")).toBe(true);

    const merged = mergeCategories(taxonomy, items, customId, foodId!);
    expect(merged.items.every((item) => item.categoryId === foodId)).toBe(true);
    expect(merged.taxonomy.nodes.some((node) => node.id === customId)).toBe(false);
  });

  it("maps confidence bands", () => {
    expect(confidenceBand(0.96)).toBe("high");
    expect(confidenceBand(0.8)).toBe("mid");
    expect(confidenceBand(0.2)).toBe("low");
  });

  it("auto-creates only admissible AI genres and rejects pseudo labels", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    // Rejected: style soup / pseudo genre
    const rejected = buildTaxonomyCategoryAiResult(
      taxonomy,
      { primaryCategory: "高级感产品摄影", suggestedCategories: ["高级感产品摄影"] },
      "luxury soft product",
      { autoCreateMissing: true },
    );
    expect(rejected.createdCategoryIds.length).toBe(0);

    // Admitted: industry-like new genre name ending with 摄影
    const result = buildTaxonomyCategoryAiResult(
      taxonomy,
      { primaryCategory: "水下人像摄影", suggestedCategories: ["水下人像摄影"] },
      "underwater portrait",
      { autoCreateMissing: true },
    );
    // May map to existing 水下摄影 leaf OR create ai genre if not mapped
    if (result.createdCategoryIds.length > 0) {
      const created = result.taxonomy.nodes.find((node) => node.id === result.createdCategoryIds[0]);
      expect(created?.type === "ai" || created?.type === "custom").toBe(true);
      expect(created?.name).toContain("摄影");
    } else {
      // Mapped onto ontology leaf (e.g. 水下摄影)
      expect(result.primary?.categoryId).toBeTruthy();
    }
  });


  it("inducts into existing custom categories during AI binding", () => {
    const base = buildSystemCategoryTaxonomy();
    const withCustom = upsertCustomCategoryNode(base, {
      name: "品牌A产品",
      group: "自定义分类",
      description: "客户品牌专用",
    });
    const result = buildTaxonomyCategoryAiResult(
      withCustom.taxonomy,
      { primaryCategory: "品牌A产品", suggestedCategories: ["品牌A产品", "高级感"] },
      "品牌A 产品广告",
      { autoCreateMissing: true },
    );
    expect(result.primary?.categoryId).toBe(withCustom.categoryId);
    expect(result.primary?.source).toBe("user");
    expect(result.createdCategoryIds.length).toBe(0);
  });

  it("upserts and deletes custom categories without touching system nodes", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const created = upsertCustomCategoryNode(taxonomy, {
      name: "品牌视觉稿",
      group: "自定义分类",
      description: "客户品牌专用",
    });
    expect(created.categoryId.startsWith("custom:")).toBe(true);
    expect(resolveCategoryIdFromLegacyName(created.taxonomy, "品牌视觉稿")).toBe(created.categoryId);

    const renamed = upsertCustomCategoryNode(created.taxonomy, {
      id: created.categoryId,
      name: "品牌视觉改名",
      group: "自定义分类",
    });
    expect(renamed.categoryId).toBe(created.categoryId);
    expect(resolveCategoryName(renamed.taxonomy, created.categoryId)).toBe("品牌视觉改名");

    const systemId = resolveCategoryIdFromLegacyName(taxonomy, "肖像摄影");
    expect(systemId).toBeTruthy();
    const afterSystemDelete = removeCustomCategoryNode(renamed.taxonomy, systemId!);
    expect(afterSystemDelete.nodes.some((node) => node.id === systemId)).toBe(true);

    const afterCustomDelete = removeCustomCategoryNode(renamed.taxonomy, created.categoryId);
    expect(afterCustomDelete.nodes.some((node) => node.id === created.categoryId)).toBe(false);
  });

  it("keeps a newly created category until the user finishes naming it", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const created = upsertCustomCategoryNode(taxonomy, {
      name: "新分类",
      group: "自定义分类",
    });

    const normalized = ensureSystemCategoryTaxonomy(created.taxonomy);
    expect(normalized.nodes.some((node) => node.id === created.categoryId && node.name === "新分类")).toBe(true);
  });

  it("creates stable custom nodes for manually entered group labels", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    expect(resolveCategoryIdFromLegacyName(taxonomy, "饮品摄影")).toBeNull();

    const first = upsertCustomCategoryNode(taxonomy, {
      name: "饮品摄影",
      group: "自定义分类",
    });
    const second = upsertCustomCategoryNode(first.taxonomy, {
      name: "第二个手动分类",
      group: "自定义分类",
    });

    expect(first.categoryId.startsWith("custom:")).toBe(true);
    expect(second.categoryId.startsWith("custom:")).toBe(true);
    expect(second.categoryId).not.toBe(first.categoryId);
    expect(resolveCategoryIdFromLegacyName(second.taxonomy, "饮品摄影")).toBe(first.categoryId);
    expect(resolveCategoryIdFromLegacyName(second.taxonomy, "第二个手动分类")).toBe(second.categoryId);
  });

  it("deletes system categories without resurrecting them during taxonomy migration", () => {
    const taxonomy = buildSystemCategoryTaxonomy();
    const systemId = resolveCategoryIdFromLegacyName(taxonomy, "肖像摄影");
    expect(systemId).toBeTruthy();

    const deleted = removeCategoryNode(taxonomy, systemId!);
    expect(deleted.nodes.some((node) => node.id === systemId)).toBe(false);
    expect(deleted.disabledSystemCategoryIds).toContain(systemId);

    const normalized = ensureSystemCategoryTaxonomy(deleted);
    expect(normalized.nodes.some((node) => node.id === systemId)).toBe(false);
  });

  it("lists custom groups before system groups", () => {
    let taxonomy = buildSystemCategoryTaxonomy();
    taxonomy = ensureTaxonomyHasCategory(taxonomy, "我的项目分类", "custom", { group: "自定义分类" }).taxonomy;
    const groups = listCategoryTreeGroups(taxonomy).map((entry) => entry.group);
    const customIndex = groups.findIndex((group) => group.includes("自定义"));
    const systemIndex = groups.findIndex((group) => !group.includes("自定义") && !group.toLowerCase().includes("ai"));
    expect(customIndex).toBeGreaterThanOrEqual(0);
    expect(systemIndex).toBeGreaterThanOrEqual(0);
    expect(customIndex).toBeLessThan(systemIndex);
    expect(compareCategoryGroupPriority("自定义分类", "人像人物类")).toBeLessThan(0);
  });

  it("keeps a user-created custom category even when its name collides with a system alias", () => {
    const base = buildSystemCategoryTaxonomy();
    // 「武侠」是系统别名（→武侠江湖）；显式自定义创建必须建 custom 节点、不被系统吞掉。
    const { taxonomy, categoryId } = upsertCustomCategoryNode(base, { name: "武侠" });
    expect(categoryId.startsWith("custom:")).toBe(true);
    // 保存后刷新（ensureSystemCategoryTaxonomy）仍保留该自定义节点，不被折叠进系统分类。
    const ensured = ensureSystemCategoryTaxonomy(taxonomy);
    expect(ensured.nodes.some((node) => node.id === categoryId && node.name === "武侠")).toBe(true);
    // 非撞名自定义照常创建。
    expect(upsertCustomCategoryNode(base, { name: "我的收藏夹XYZ" }).categoryId.startsWith("custom:")).toBe(true);
  });
});
