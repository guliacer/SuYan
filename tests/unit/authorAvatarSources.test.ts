import { describe, expect, it } from "vitest";
import { buildAuthorAvatarSources } from "../../src/features/library/utils/authorAvatarSources";

describe("authorAvatarSources", () => {
  it("uses the imported avatar first and then website icons", () => {
    expect(
      buildAuthorAvatarSources({
        authorAvatarUrl: "https://cdn.example.com/avatar.png",
        authorUrl: "https://webtomind.com/",
        sourceUrl: "https://webtomind.com/zh-CN/prompts/example",
      }).slice(0, 3),
    ).toEqual([
      "https://cdn.example.com/avatar.png",
      "https://webtomind.com/favicon.ico",
      "https://webtomind.com/favicon.svg",
    ]);
  });

  it("falls back to the source website logo when no avatar is available", () => {
    expect(
      buildAuthorAvatarSources({
        authorAvatarUrl: null,
        authorUrl: null,
        sourceUrl: "https://webtomind.com/zh-CN/prompts/example",
      }).slice(0, 2),
    ).toEqual(["https://webtomind.com/favicon.ico", "https://webtomind.com/favicon.svg"]);
  });

  it("returns no remote source for local prompts", () => {
    expect(buildAuthorAvatarSources({ authorAvatarUrl: null, authorUrl: null, sourceUrl: null })).toEqual([]);
  });

  it("deduplicates author and source websites", () => {
    const sources = buildAuthorAvatarSources({
      authorAvatarUrl: "https://webtomind.com/favicon.ico",
      authorUrl: "https://webtomind.com/",
      sourceUrl: "https://webtomind.com/zh-CN/prompts/example",
    });

    expect(sources.filter((source) => source === "https://webtomind.com/favicon.ico")).toHaveLength(1);
  });
});
