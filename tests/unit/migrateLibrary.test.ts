import { describe, expect, it } from "vitest";
import { migrateLibrary } from "@/features/library/utils/migrateLibrary";

describe("migrateLibrary", () => {
  it("accepts schemaVersion 1 library files", () => {
    const library = {
      schemaVersion: 1,
      updatedAt: "2026-07-04T00:00:00.000Z",
      items: [
        {
          id: "item-1",
          title: "样例",
          imageFileName: "item-1.png",
          prompt: "柔光",
          negativePrompt: "",
          tags: ["测试"],
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        },
      ],
    };

    expect(migrateLibrary(library)).toEqual({
      ...library,
      items: [
        {
          ...library.items[0],
          category: null,
          generationMethod: null,
          promptType: "image",
          sourceUrl: null,
          authorName: null,
          authorUrl: null,
          authorAvatarUrl: null,
          nsfwRating: "unknown",
          nsfwCheckedAt: null,
          videoDurationSec: null,
          videoPosterFileName: null,
          videoKeyframes: [],
          videoReferenceImages: [],
          videoFramesGeneratedAt: null,
        },
      ],
    });
  });

  it("normalizes optional web metadata fields", () => {
    const library = {
      schemaVersion: 1,
      updatedAt: "2026-07-04T00:00:00.000Z",
      items: [
        {
          id: "item-1",
          title: "样例",
          imageFileName: "item-1.png",
          prompt: "柔光",
          negativePrompt: "",
          category: " 人像 ",
          tags: ["测试"],
          generationMethod: " nanoBanana-Pro ",
          sourceUrl: " https://aiart.pics/?prompt=1 ",
          authorName: " Meem ",
          authorUrl: " https://x.com/mehvishs25 ",
          authorAvatarUrl: "",
          nsfwRating: "nsfw",
          nsfwCheckedAt: " 2026-07-06T00:00:00.000Z ",
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        },
      ],
    };

    expect(migrateLibrary(library).items[0]).toMatchObject({
      category: "人像",
      generationMethod: "nanoBanana-Pro",
      sourceUrl: "https://aiart.pics/?prompt=1",
      authorName: "Meem",
      authorUrl: "https://x.com/mehvishs25",
      authorAvatarUrl: null,
      nsfwRating: "nsfw",
      nsfwCheckedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("normalizes and infers prompt type", () => {
    const library = {
      schemaVersion: 1,
      updatedAt: "2026-07-04T00:00:00.000Z",
      items: [
        {
          id: "item-1",
          title: "机场跑道变形记",
          imageFileName: "item-1.png",
          prompt: "9:16 vertical smartphone filming perspective",
          negativePrompt: "",
          category: "Seedance 2.0",
          tags: ["视频提示词"],
          generationMethod: "Seedance 2.0",
          promptType: " 视频 ",
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        },
      ],
    };

    expect(migrateLibrary(library).items[0].promptType).toBe("video");
  });

  it("rejects missing schemaVersion", () => {
    expect(() => migrateLibrary({ items: [] })).toThrow("Unsupported library schemaVersion");
  });
});
