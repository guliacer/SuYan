import { describe, expect, it } from "vitest";
import { findPromptTextMatches, replacePromptText } from "../../src/features/prompts/utils/promptFindReplace";

describe("prompt find and replace", () => {
  it("returns non-overlapping literal matches with original offsets", () => {
    expect(findPromptTextMatches("React react React", "react")).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ]);
  });

  it("supports case-sensitive matching and keeps Chinese offsets", () => {
    expect(findPromptTextMatches("代码 Code 代码", "代码", true)).toEqual([
      { start: 0, end: 2 },
      { start: 8, end: 10 },
    ]);
    expect(findPromptTextMatches("代码 Code 代码", "code", true)).toEqual([]);
  });

  it("replaces all matches in one deterministic result", () => {
    expect(replacePromptText("React react", "react", "Vue")).toEqual({ text: "Vue Vue", count: 2 });
    expect(replacePromptText("没有命中", "React", "Vue")).toEqual({ text: "没有命中", count: 0 });
  });
});
