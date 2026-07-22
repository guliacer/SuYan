import { describe, expect, it } from "vitest";
import { buildLibraryFile } from "@/features/library/utils/buildLibraryFile";

describe("buildLibraryFile", () => {
  it("deduplicates tags and keeps schemaVersion fixed", () => {
    const file = buildLibraryFile([
      {
        id: "item-1",
        title: "  标题  ",
        imageFileName: "item-1.png",
        prompt: "  prompt  ",
        negativePrompt: "",
        nsfwRating: "nsfw",
        nsfwCheckedAt: " 2026-07-06T00:00:00.000Z ",
        tags: ["人物", "人物", " 光影 "],
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ]);

    expect(file.schemaVersion).toBe(1);
    expect(file.items[0].title).toBe("标题");
    expect(file.items[0].tags).toEqual(["人物", "光影"]);
    expect(file.items[0].nsfwRating).toBe("nsfw");
    expect(file.items[0].nsfwCheckedAt).toBe("2026-07-06T00:00:00.000Z");
    expect(file.items[0].promptType).toBe("image");
  });

  it("normalizes video prompt type when saving", () => {
    const file = buildLibraryFile([
      {
        id: "item-1",
        title: "城市中心机场跑道变形记",
        imageFileName: "item-1.png",
        prompt: "Seedance 2.0 video prompt",
        negativePrompt: "",
        promptType: "video",
        tags: ["视频提示词"],
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ]);

    expect(file.items[0].promptType).toBe("video");
  });

  it("preserves and cleans video frame fields when saving", () => {
    const file = buildLibraryFile([
      {
        id: "item-1",
        title: "未来城市短片",
        imageFileName: "item-1.mp4",
        prompt: "图生视频",
        negativePrompt: "",
        promptType: "video",
        tags: ["视频提示词"],
        videoDurationSec: 10.5,
        videoPosterFileName: " item-1.poster.jpg ",
        videoKeyframes: [
          { imageFileName: " item-1.kf1.jpg ", atSec: 0, label: " 0-2s " },
          { imageFileName: "", atSec: 2, label: "2-4s" },
          { imageFileName: "item-1.kf2.jpg", atSec: -3, label: "无效" },
        ],
        videoReferenceImages: [" ref-1.png ", "ref-1.png", "", "ref-2.png"],
        videoFramesGeneratedAt: " 2026-07-10T00:00:00.000Z ",
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ]);

    const savedItem = file.items[0];

    expect(savedItem.videoDurationSec).toBe(10.5);
    expect(savedItem.videoPosterFileName).toBe("item-1.poster.jpg");
    expect(savedItem.videoKeyframes).toEqual([
      { imageFileName: "item-1.kf1.jpg", atSec: 0, label: "0-2s" },
      { imageFileName: "item-1.kf2.jpg", atSec: 0, label: "无效" },
    ]);
    expect(savedItem.videoReferenceImages).toEqual(["ref-1.png", "ref-2.png"]);
    expect(savedItem.videoFramesGeneratedAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("defaults video fields for image items", () => {
    const file = buildLibraryFile([
      {
        id: "item-1",
        title: "陶瓷杯",
        imageFileName: "item-1.png",
        prompt: "柔和自然光",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-04T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ]);

    expect(file.items[0].videoDurationSec).toBeNull();
    expect(file.items[0].videoPosterFileName).toBeNull();
    expect(file.items[0].videoKeyframes).toEqual([]);
    expect(file.items[0].videoReferenceImages).toEqual([]);
    expect(file.items[0].videoFramesGeneratedAt).toBeNull();
  });

  it("keeps a pending remote image link for lazy download", () => {
    const file = buildLibraryFile([
      {
        id: "item-remote",
        title: "远程素材",
        imageFileName: "item-remote.png",
        prompt: "网络导入",
        negativePrompt: "",
        tags: [],
        remoteImageUrl: " https://cdn.example.com/material.webp ",
        remoteImageStatus: "pending",
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:00:00.000Z",
      },
    ]);

    expect(file.items[0].remoteImageUrl).toBe("https://cdn.example.com/material.webp");
    expect(file.items[0].remoteImageStatus).toBe("pending");
  });
});
