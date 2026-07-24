import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  allCategoriesValue,
  filterPromptCards,
  getPromptCategories,
  getPopularTags,
  pinPromptCards,
  toPromptCardData,
} from "@/features/library/utils/promptFilters";

type PromptItemFixture = LibraryItem & {
  category?: string;
  hot?: number;
};

function makeItem(patch: Partial<PromptItemFixture>): PromptItemFixture {
  return {
    id: "item-1",
    title: "默认标题",
    imageFileName: "item-1.png",
    prompt: "默认提示词",
    negativePrompt: "",
    tags: ["默认标签"],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...patch,
  };
}

describe("promptFilters", () => {
  it("carries an external missing state to the rendered card model", () => {
    const card = toPromptCardData(
      makeItem({
        mediaStorage: {
          kind: "external",
          rootId: "root-1",
          relativePath: "missing.png",
          status: "missing",
        },
      }),
    );

    expect(card.mediaStatus).toBe("missing");
    expect(card.searchText).toContain("默认标题");
    expect(card.searchText).toContain("missing.png");
  });

  it("searches title, prompt, negative prompt, image file name and tags", () => {
    const cards = [
      makeItem({ id: "title", title: "品牌营销方案", tags: ["商业计划"] }),
      makeItem({ id: "prompt", prompt: "生成一份职业发展建议", tags: ["效率"] }),
      makeItem({ id: "negative", negativePrompt: "不要使用夸张标题党", tags: ["约束"] }),
      makeItem({ id: "image", imageFileName: "sunset-poster.png", tags: ["图像"] }),
      makeItem({ id: "tag", title: "普通标题", prompt: "普通内容", tags: ["写作指南"] }),
    ].map(toPromptCardData);

    expect(
      filterPromptCards(cards, {
        query: "品牌",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["title"]);
    expect(
      filterPromptCards(cards, {
        query: "职业发展",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["prompt"]);
    expect(
      filterPromptCards(cards, {
        query: "写作指南",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["tag"]);
    expect(
      filterPromptCards(cards, {
        query: "标题党",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["negative"]);
    expect(
      filterPromptCards(cards, {
        query: "sunset",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["image"]);
  });

  it("filters by category and active tag", () => {
    const cards = [
      makeItem({ id: "marketing", category: "营销", tags: ["品牌营销", "商业计划"] }),
      makeItem({ id: "writing", category: "写作", tags: ["写作指南"] }),
      makeItem({ id: "career", category: "职业", tags: ["职业发展", "商业计划"] }),
    ].map(toPromptCardData);

    expect(
      filterPromptCards(cards, {
        query: "",
        category: "营销",
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["marketing"]);
    expect(
      filterPromptCards(cards, {
        query: "",
        category: allCategoriesValue,
        activeTag: "商业计划",
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["career", "marketing"]);
  });

  it("sorts by import time and direction", () => {
    const cards = [
      makeItem({ id: "old", createdAt: "2026-07-01T00:00:00.000Z", hot: 100 }),
      makeItem({ id: "new", createdAt: "2026-07-03T00:00:00.000Z", hot: 1 }),
      makeItem({ id: "middle", createdAt: "2026-07-02T00:00:00.000Z", hot: 50 }),
    ].map(toPromptCardData);

    expect(
      filterPromptCards(cards, {
        query: "",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["new", "middle", "old"]);

    expect(
      filterPromptCards(cards, {
        query: "",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "asc",
      }).map((item) => item.id),
    ).toEqual(["old", "middle", "new"]);
  });

  it("sorts by modified time", () => {
    const cards = [
      makeItem({ id: "normal", updatedAt: "2026-07-02T00:00:00.000Z" }),
      makeItem({ id: "fresh", updatedAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({ id: "stale", updatedAt: "2026-07-01T00:00:00.000Z" }),
    ].map(toPromptCardData);

    expect(
      filterPromptCards(cards, {
        query: "",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "updatedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["fresh", "normal", "stale"]);
  });

  it("keeps missing external entries visible ahead of the normal browse window", () => {
    const cards = [
      makeItem({ id: "new", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({ id: "old", createdAt: "2026-07-01T00:00:00.000Z" }),
      makeItem({
        id: "missing",
        createdAt: "2026-07-02T00:00:00.000Z",
        mediaStorage: {
          kind: "external",
          rootId: "root-1",
          relativePath: "missing.png",
          status: "missing",
        },
      }),
    ].map(toPromptCardData);

    expect(
      filterPromptCards(cards, {
        query: "",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["missing", "new", "old"]);
  });

  it("sorts by image size from loaded dimensions", () => {
    const cards = [
      makeItem({ id: "small" }),
      makeItem({ id: "large" }),
      makeItem({ id: "middle" }),
    ].map(toPromptCardData);
    const imageSizeById = new Map([
      ["small", 100],
      ["large", 900],
      ["middle", 400],
    ]);

    expect(
      filterPromptCards(cards, {
        query: "",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "imageSize",
        sortDirection: "asc",
        imageSizeById,
      }).map((item) => item.id),
    ).toEqual(["small", "middle", "large"]);
  });

  it("keeps random sorting stable for the same saved seed", () => {
    const cards = Array.from({ length: 8 }, (_, index) =>
      makeItem({ id: `item-${index + 1}`, createdAt: `2026-07-0${index + 1}T00:00:00.000Z` }),
    ).map(toPromptCardData);
    const filterOptions = {
      query: "",
      category: allCategoriesValue,
      activeTag: null,
      sortMode: "random" as const,
      sortDirection: "desc" as const,
    };

    const firstRun = filterPromptCards(cards, { ...filterOptions, randomSeed: 42 }).map((item) => item.id);
    const secondRun = filterPromptCards(cards, { ...filterOptions, randomSeed: 42 }).map((item) => item.id);
    const reshuffledRun = filterPromptCards(cards, { ...filterOptions, randomSeed: 43 }).map((item) => item.id);

    expect(secondRun).toEqual(firstRun);
    expect(reshuffledRun).not.toEqual(firstRun);
  });

  it("derives category from the first tag without changing the stored schema", () => {
    const card = toPromptCardData(makeItem({ category: undefined, tags: ["角色", "写作指南"] }));

    expect(card.category).toBe("角色");
    expect(card.tags).toEqual(["写作指南"]);
    expect(getPromptCategories([card])).toEqual(["角色"]);
  });

  it("uses stored category and removes duplicated category from tags", () => {
    const card = toPromptCardData(makeItem({ category: "人像", tags: ["人像", "柔光"] }));

    expect(card.category).toBe("人像");
    expect(card.tags).toEqual(["柔光"]);
  });

  it("resolves real model labels from model-like categories when source labels are generic", () => {
    const card = toPromptCardData(
      makeItem({
        category: "Seedance 2.0",
        generationMethod: "WebToMind",
        sourceUrl: "https://webtomind.com/zh-CN/prompts/seedance-2-motion-case",
        tags: ["网页分享", "视频提示词"],
      }),
    );

    expect(card.generationMethod).toBe("Seedance 2.0");
    expect(card.promptType).toBe("video");
  });

  it("uses stored prompt type and lets search match image/video labels", () => {
    const cards = [
      makeItem({ id: "image", promptType: "image" }),
      makeItem({ id: "video", promptType: "video" }),
    ].map(toPromptCardData);

    expect(cards[0].promptType).toBe("image");
    expect(cards[1].promptType).toBe("video");
    expect(
      filterPromptCards(cards, {
        query: "视频",
        category: allCategoriesValue,
        activeTag: null,
        sortMode: "importedAt",
        sortDirection: "desc",
      }).map((item) => item.id),
    ).toEqual(["video"]);
  });

  it("counts popular tags by frequency", () => {
    const cards = [
      makeItem({ id: "a", tags: ["品牌营销", "商业计划"] }),
      makeItem({ id: "b", tags: ["品牌营销", "角色"] }),
      makeItem({ id: "c", tags: ["写作指南"] }),
    ].map(toPromptCardData);

    expect(getPopularTags(cards)).toEqual(["角色", "商业计划"]);
  });

  it("pins newly imported cards to the front in every sort mode", () => {
    const cards = [
      makeItem({ id: "old-a", createdAt: "2026-07-01T00:00:00.000Z" }),
      makeItem({ id: "old-b", createdAt: "2026-07-02T00:00:00.000Z" }),
      makeItem({ id: "new-1", createdAt: "2026-07-04T00:00:00.000Z" }),
      makeItem({ id: "new-2", createdAt: "2026-07-05T00:00:00.000Z" }),
      makeItem({ id: "old-c", createdAt: "2026-07-03T00:00:00.000Z" }),
    ].map(toPromptCardData);

    const importedAtOrder = filterPromptCards(cards, {
      query: "",
      category: allCategoriesValue,
      activeTag: null,
      sortMode: "importedAt",
      sortDirection: "asc",
      pinnedItemIds: ["new-1", "new-2"],
    }).map((item) => item.id);

    expect(importedAtOrder.slice(0, 2)).toEqual(["new-1", "new-2"]);
    expect(importedAtOrder.slice(2)).toEqual(["old-a", "old-b", "old-c"]);

    const randomOrder = filterPromptCards(cards, {
      query: "",
      category: allCategoriesValue,
      activeTag: null,
      sortMode: "random",
      sortDirection: "desc",
      randomSeed: 42,
      pinnedItemIds: ["new-1", "new-2"],
    }).map((item) => item.id);

    expect(randomOrder.slice(0, 2)).toEqual(["new-1", "new-2"]);
    expect(new Set(randomOrder.slice(2))).toEqual(new Set(["old-a", "old-b", "old-c"]));

    const baselineRandom = filterPromptCards(cards, {
      query: "",
      category: allCategoriesValue,
      activeTag: null,
      sortMode: "random",
      sortDirection: "desc",
      randomSeed: 42,
    }).map((item) => item.id);
    expect(baselineRandom.filter((id) => id === "old-a" || id === "old-b" || id === "old-c")).toEqual(
      randomOrder.slice(2),
    );
  });

  it("keeps pin order and ignores missing pin ids", () => {
    const cards = [
      makeItem({ id: "a" }),
      makeItem({ id: "b" }),
      makeItem({ id: "c" }),
    ].map(toPromptCardData);

    expect(pinPromptCards(cards, ["missing", "c", "a", "c"]).map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(pinPromptCards(cards, undefined).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
