import { describe, expect, it } from "vitest";
import { findPromptTagSuggestions, normalizePromptTags } from "../../src/features/prompts/components/PromptTagEditor";

describe("prompt tag editor", () => {
  it("trims, removes empty values, and deduplicates tags", () => {
    expect(normalizePromptTags([" API ", "", "API", "网站", " 网站 "])).toEqual(["API", "网站"]);
  });

  it("deduplicates tags case-insensitively while preserving the first spelling", () => {
    expect(normalizePromptTags(["API", "api", " Api ", "视觉"])).toEqual(["API", "视觉"]);
  });

  it("returns prefix-first suggestions and excludes tags already on the card", () => {
    expect(findPromptTagSuggestions(["人物", "人物摄影", "摄影", "AI", "网页"], "人", ["人物"])).toEqual(["人物摄影"]);
    expect(findPromptTagSuggestions(["人物", "人物摄影", "摄影", "AI", "网页"], "影")).toEqual(["人物摄影", "摄影"]);
  });

  it("supports a new value when there is no existing suggestion", () => {
    expect(findPromptTagSuggestions(["人物", "摄影"], "新标签")).toEqual([]);
    expect(normalizePromptTags(["新标签", "新标签"])).toEqual(["新标签"]);
  });
});
