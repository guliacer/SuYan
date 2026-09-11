import { describe, expect, it } from "vitest";
import type { PromptCategory, PromptEntry } from "../../src/features/prompts/types";
import { collectPromptTagCounts, filterPromptsByTag, searchPrompts } from "../../src/features/prompts/utils/promptSearch";

const category: PromptCategory = { id: "dev", name: "开发", orderKey: "1", isDefault: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const base: PromptEntry = {
  id: "one", type: "text", title: "代码评审", description: "检查前端代码", content: "Review this React component",
  categoryId: "dev", tagIds: ["TypeScript"], favorite: false, variables: [], usageCount: 0,
  orderKey: "1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("prompt search", () => {
  it.each(["代码评审", "前端", "react", "typescript", "开发"])("finds matches in %s", (query) => {
    expect(searchPrompts([base], query, [category])).toEqual([base]);
  });

  it("does not return unrelated prompts", () => {
    expect(searchPrompts([base], "摄影", [category])).toEqual([]);
  });

  it("collects tag counts and filters prompts by the selected tag", () => {
    const second = { ...base, id: "two", tagIds: ["TypeScript", "React"] };
    expect(collectPromptTagCounts([base, second])).toEqual(new Map([['TypeScript', 2], ['React', 1]]));
    expect(filterPromptsByTag([base, second], "React")).toEqual([second]);
    expect(filterPromptsByTag([base, second], "")).toEqual([base, second]);
  });
});
