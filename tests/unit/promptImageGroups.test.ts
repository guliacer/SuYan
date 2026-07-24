import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  groupPromptImages,
  resolvePromptGroupPatchItemIds,
  spreadPromptGroupImages,
} from "@/features/library/utils/promptImageGroups";
import { toPromptCardData } from "@/features/library/utils/promptFilters";

function makeItem(patch: Partial<LibraryItem>): LibraryItem {
  return {
    id: "image-1",
    title: "结构化文本生成器",
    imageFileName: "image-1.png",
    prompt: "整理中文文档并输出行动清单。",
    negativePrompt: "",
    tags: ["文本生成器", "写作指南"],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...patch,
  };
}

describe("promptImageGroups", () => {
  it("groups multiple images that share the same prompt identity", () => {
    const cards = [
      makeItem({ id: "image-a", imageFileName: "a.png" }),
      makeItem({ id: "image-b", imageFileName: "b.png", createdAt: "2026-07-02T00:00:00.000Z" }),
      makeItem({ id: "career", title: "职业发展路线规划", prompt: "规划职业路线。", imageFileName: "career.png" }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);
    const multiImageGroup = groups.find((group) => group.items.some((item) => item.id === "image-a"));
    const singleImageGroup = groups.find((group) => group.items.some((item) => item.id === "career"));

    expect(groups).toHaveLength(2);
    expect(singleImageGroup?.items.map((item) => item.id)).toEqual(["career"]);
    expect(multiImageGroup?.items.map((item) => item.id)).toEqual(["image-b", "image-a"]);
  });

  it("moves liked images to the front of their group", () => {
    const cards = [
      makeItem({ id: "old", createdAt: "2026-07-01T00:00:00.000Z" }),
      makeItem({ id: "new", createdAt: "2026-07-03T00:00:00.000Z" }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, ["old"]);

    expect(group.items.map((item) => item.id)).toEqual(["old", "new"]);
    expect(group.primaryItem.id).toBe("old");
  });

  it("uses a missing external image as the group primary so its state stays visible", () => {
    const cards = [
      makeItem({ id: "available", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({
        id: "missing",
        createdAt: "2026-07-01T00:00:00.000Z",
        mediaStorage: {
          kind: "external",
          rootId: "root-1",
          relativePath: "missing.png",
          status: "missing",
        },
      }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, []);

    expect(group.primaryItem.id).toBe("missing");
    expect(group.items.map((item) => item.id)).toEqual(["missing", "available"]);
  });

  it("uses the actual video file as the primary item in video prompt groups", () => {
    const cards = [
      makeItem({
        id: "cover",
        imageFileName: "cover.jpg",
        prompt: "Seedance 2.0 video prompt with cinematic camera motion.",
        promptType: "video",
        tags: ["视频提示词"],
      }),
      makeItem({
        id: "clip",
        imageFileName: "clip.mp4",
        prompt: "Seedance 2.0 video prompt with cinematic camera motion.",
        promptType: "video",
        tags: ["视频提示词"],
      }),
    ].map(toPromptCardData);

    const [group] = groupPromptImages(cards, []);

    expect(group.primaryItem.id).toBe("clip");
    expect(group.items.map((item) => item.id)).toEqual(["clip", "cover"]);
  });

  it("spreads images from the same group across the masonry sequence", () => {
    const cards = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", createdAt: "2026-07-02T00:00:00.000Z" }),
      makeItem({ id: "b-1", title: "B", prompt: "同组 B", createdAt: "2026-07-03T00:00:00.000Z" }),
      makeItem({ id: "b-2", title: "B", prompt: "同组 B", createdAt: "2026-07-02T00:00:00.000Z" }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);

    expect(spreadPromptGroupImages(groups).map((item) => item.id)).toEqual(["a-1", "b-1", "a-2", "b-2"]);
  });

  it("groups blank media imported in the same batch without mixing different blank batches", () => {
    const cards = [
      makeItem({
        id: "blank-a",
        title: "",
        imageFileName: "blank-a.png",
        prompt: "",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-08T00:00:00.000Z",
      }),
      makeItem({
        id: "blank-b",
        title: "",
        imageFileName: "blank-b.mp4",
        prompt: "",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-08T00:00:00.000Z",
      }),
      makeItem({
        id: "blank-c",
        title: "",
        imageFileName: "blank-c.png",
        prompt: "",
        negativePrompt: "",
        tags: [],
        createdAt: "2026-07-09T00:00:00.000Z",
      }),
    ].map(toPromptCardData);

    const groups = groupPromptImages(cards, []);
    const importedBatchGroup = groups.find((group) => group.items.some((item) => item.id === "blank-a"));
    const otherBlankGroup = groups.find((group) => group.items.some((item) => item.id === "blank-c"));

    expect(groups).toHaveLength(2);
    expect(importedBatchGroup?.items.map((item) => item.id)).toEqual(["blank-a", "blank-b"]);
    expect(otherBlankGroup?.items.map((item) => item.id)).toEqual(["blank-c"]);
  });

  it("syncs shared prompt edits to every image in the current prompt group", () => {
    const items = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", imageFileName: "a-1.png" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", imageFileName: "a-2.png" }),
      makeItem({ id: "b-1", title: "B", prompt: "同组 B", imageFileName: "b-1.png" }),
    ];
    const targetIds = resolvePromptGroupPatchItemIds(items, "a-1", { prompt: "同组 A 修改后" });
    const targetIdSet = new Set(targetIds);
    const nextItems = items.map((item) => (targetIdSet.has(item.id) ? { ...item, prompt: "同组 A 修改后" } : item));

    expect(targetIds).toEqual(["a-1", "a-2"]);
    expect(groupPromptImages(nextItems.map(toPromptCardData), [])).toHaveLength(2);
    expect(
      groupPromptImages(nextItems.map(toPromptCardData), [])
        .find((group) => group.items.some((item) => item.id === "a-1"))
        ?.items.map((item) => item.id),
    ).toEqual(["a-1", "a-2"]);
  });

  it("keeps image-only edits scoped to the current effect image", () => {
    const items = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", imageFileName: "a-1.png" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", imageFileName: "a-2.png" }),
    ];

    expect(resolvePromptGroupPatchItemIds(items, "a-1", { imageFileName: "a-1-new.png" })).toEqual(["a-1"]);
  });

  it("syncs prompt type edits to every image in the current prompt group", () => {
    const items = [
      makeItem({ id: "a-1", title: "A", prompt: "同组 A", imageFileName: "a-1.png" }),
      makeItem({ id: "a-2", title: "A", prompt: "同组 A", imageFileName: "a-2.png" }),
    ];

    expect(resolvePromptGroupPatchItemIds(items, "a-1", { promptType: "video" })).toEqual(["a-1", "a-2"]);
  });
});
