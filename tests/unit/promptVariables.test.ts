import { describe, expect, it } from "vitest";
import { extractPromptVariables, renderPromptVariables } from "../../src/features/prompts/utils/promptVariables";

describe("prompt variables", () => {
  it("deduplicates variables while preserving their first-seen order", () => {
    expect(extractPromptVariables("为 {{product}} 写文案，产品是 {{ product }}，面向 {{audience}}。"))
      .toEqual([{ name: "product" }, { name: "audience" }]);
  });

  it("renders supplied values and variable defaults", () => {
    expect(renderPromptVariables(
      "为 {{product}} 写一段 {{style}} 文案。",
      { product: "素言" },
      [{ name: "product" }, { name: "style", defaultValue: "简洁" }],
    )).toBe("为 素言 写一段 简洁 文案。");
  });
});
