import { describe, expect, it } from "vitest";
import {
  isNsfwItem,
  normalizeNsfwRating,
  resolveNsfwRatingFromRemoteAnalysis,
  shouldGradeNsfwItem,
} from "@/features/library/utils/nsfwRating";

describe("nsfwRating", () => {
  it("normalizes unknown or invalid ratings", () => {
    expect(normalizeNsfwRating("safe")).toBe("safe");
    expect(normalizeNsfwRating("nsfw")).toBe("nsfw");
    expect(normalizeNsfwRating("anything")).toBe("unknown");
    expect(normalizeNsfwRating(undefined)).toBe("unknown");
  });

  it("detects NSFW library items", () => {
    expect(isNsfwItem({ nsfwRating: "nsfw" })).toBe(true);
    expect(isNsfwItem({ nsfwRating: "safe" })).toBe(false);
  });

  it("only grades unclassified images unless forced", () => {
    expect(shouldGradeNsfwItem({ imageFileName: "image.png", nsfwRating: "unknown" })).toBe(true);
    expect(shouldGradeNsfwItem({ imageFileName: "image.png", nsfwRating: "safe" })).toBe(false);
    expect(shouldGradeNsfwItem({ imageFileName: "image.png", nsfwRating: "safe" }, { force: true })).toBe(true);
    expect(shouldGradeNsfwItem({ imageFileName: "clip.mp4", nsfwRating: "unknown" }, { force: true })).toBe(false);
    expect(shouldGradeNsfwItem({ imageFileName: "", nsfwRating: "unknown" })).toBe(false);
    expect(
      shouldGradeNsfwItem({
        imageFileName: "missing.png",
        mediaStorage: { kind: "external", rootId: "root-1", relativePath: "missing.png", status: "missing" },
        nsfwRating: "unknown",
      }),
    ).toBe(false);
  });

  it("resolves remote NSFW and SFW labels", () => {
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "NSFW",
        tags: ["NSFW"],
        sections: [],
        template: "",
        summary: "成人内容",
      }),
    ).toBe("nsfw");
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "SFW",
        tags: ["SFW"],
        sections: [],
        template: "",
        summary: "普通时尚人像",
      }),
    ).toBe("safe");
  });

  it("does not treat safe explanations that mention NSFW words as NSFW", () => {
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "SFW",
        tags: ["SFW"],
        sections: [],
        template: "",
        summary: "普通人像，无明显成人色情或裸露，不属于 NSFW。",
      }),
    ).toBe("safe");
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "",
        tags: [],
        sections: [],
        template: "",
        summary: "泳装日常照，但没有明显成人露骨内容，非 NSFW。",
      }),
    ).toBe("safe");
  });

  it("still resolves explicit unsafe explanations as NSFW", () => {
    expect(
      resolveNsfwRatingFromRemoteAnalysis({
        title: "",
        category: "",
        tags: [],
        sections: [],
        template: "",
        summary: "存在明显裸露和成人色情内容。",
      }),
    ).toBe("nsfw");
  });
});
