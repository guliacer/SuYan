import { describe, expect, it } from "vitest";
import { mergePromptAnalysisTagsPreservingCategories } from "@/features/library/utils/promptAnalysisMetadata";

describe("mergePromptAnalysisTagsPreservingCategories", () => {
  it("keeps every stored secondary category when visible tags reach their limit", () => {
    const visibleTags = Array.from({ length: 15 }, (_, index) => `标签${index + 1}`);
    const storedCategoryTags = ["分类二", "分类三", "分类四"];

    const result = mergePromptAnalysisTagsPreservingCategories({
      categoryLabels: ["分类一", ...storedCategoryTags],
      maxVisibleTagCount: 15,
      storedCategoryTags,
      suggestedTags: ["新增标签"],
      visibleTags,
    });

    expect(result.slice(0, 15)).toEqual(visibleTags);
    expect(result.slice(15)).toEqual(storedCategoryTags);
  });

  it("does not add category suggestions to ordinary tags", () => {
    const result = mergePromptAnalysisTagsPreservingCategories({
      categoryLabels: ["人像摄影", "自然光人像"],
      maxVisibleTagCount: 15,
      storedCategoryTags: ["自然光人像"],
      suggestedTags: ["电影感", "人像摄影", "自然光人像"],
      visibleTags: ["半身构图"],
    });

    expect(result).toEqual(["半身构图", "电影感", "自然光人像"]);
  });

  it("deduplicates labels without consuming the category preservation slots", () => {
    const result = mergePromptAnalysisTagsPreservingCategories({
      categoryLabels: ["产品摄影", "商业静物"],
      maxVisibleTagCount: 2,
      storedCategoryTags: ["商业静物", "商业静物"],
      suggestedTags: ["柔光", "高质感"],
      visibleTags: ["柔光"],
    });

    expect(result).toEqual(["柔光", "高质感", "商业静物"]);
  });
});
