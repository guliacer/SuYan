import { describe, expect, it } from "vitest";
import { selectTargetItems } from "../../electron/main/batch/imageCompressor";
import type { LibraryItem } from "../../src/features/library/types/library";

function makeItem(id: string, imageFileName: string, promptType: "image" | "video" = "image"): LibraryItem {
  return {
    id,
    title: `素材 ${id}`,
    imageFileName,
    prompt: "",
    negativePrompt: "",
    tags: [],
    promptType,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

describe("selectTargetItems (image compressor)", () => {
  it("returns all non-video items when itemIds is undefined", () => {
    const items = [
      makeItem("1", "a.png"),
      makeItem("2", "b.jpg"),
      makeItem("3", "c.mp4", "video"),
    ];

    const result = selectTargetItems(items, undefined);

    expect(result.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("returns all non-video items when itemIds is empty", () => {
    const items = [makeItem("1", "a.png"), makeItem("2", "b.mp4", "video")];

    const result = selectTargetItems(items, []);

    expect(result.map((item) => item.id)).toEqual(["1"]);
  });

  it("filters by itemIds and excludes video files", () => {
    const items = [
      makeItem("1", "a.png"),
      makeItem("2", "b.jpg"),
      makeItem("3", "c.mp4", "video"),
      makeItem("4", "d.webm", "video"),
    ];

    const result = selectTargetItems(items, ["1", "3", "4"]);

    expect(result.map((item) => item.id)).toEqual(["1"]);
  });

  it("returns empty when no matching itemIds", () => {
    const items = [makeItem("1", "a.png")];

    const result = selectTargetItems(items, ["nonexistent"]);

    expect(result).toHaveLength(0);
  });

  it("excludes items with video extensions even without promptType", () => {
    const items = [makeItem("1", "a.mov"), makeItem("2", "b.png")];

    const result = selectTargetItems(items, undefined);

    expect(result.map((item) => item.id)).toEqual(["2"]);
  });
});
