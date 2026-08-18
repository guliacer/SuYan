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

    const migrated = migrateLibrary(library);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.items[0]).toMatchObject({
      id: "item-1",
      title: "样例",
      mediaStorage: "managed",
      category: null,
      categoryId: null,
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
    });
  });

  it("keeps external storage references while validating their shape", () => {
    const library = migrateLibrary({
      schemaVersion: 1,
      updatedAt: "2026-07-04T00:00:00.000Z",
      items: [
        {
          id: "external-1",
          title: "外链样例",
          imageFileName: "external-1.png",
          mediaStorage: { kind: "external", rootId: "root-1", relativePath: "素材/样例.png" },
          prompt: "柔光",
          negativePrompt: "",
          tags: [],
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        },
      ],
    });

    expect(library.items[0].mediaStorage).toEqual({
      kind: "external",
      rootId: "root-1",
      relativePath: "素材/样例.png",
      size: null,
      mtimeMs: null,
      status: "available",
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
      // alias 人像 → 肖像摄影 (taxonomy canonical label)
      category: "肖像摄影",
      categoryId: expect.stringMatching(/^system:/),
      categorySource: "system",
      generationMethod: "nanoBanana-Pro",
      sourceUrl: "https://aiart.pics/?prompt=1",
      authorName: "Meem",
      authorUrl: "https://x.com/mehvishs25",
      authorAvatarUrl: null,
      nsfwRating: "nsfw",
      nsfwCheckedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("preserves multi-genre category assignments across migration", () => {
    const genreIds = ["system:人像摄影:肖像摄影", "system:人像摄影:婚礼摄影"];
    const library = migrateLibrary({
      schemaVersion: 2,
      updatedAt: "2026-07-04T00:00:00.000Z",
      items: [
        {
          id: "item-genre",
          title: "多分类样例",
          imageFileName: "item-genre.png",
          prompt: "",
          negativePrompt: "",
          category: "肖像摄影",
          categoryId: genreIds[0],
          genreIds,
          tags: [],
          createdAt: "2026-07-04T00:00:00.000Z",
          updatedAt: "2026-07-04T00:00:00.000Z",
        },
      ],
    });

    expect(library.items[0].genreIds).toEqual(genreIds);
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
    expect(() => migrateLibrary({ items: [] })).toThrow("不支持的素材库 schemaVersion");
  });
});
