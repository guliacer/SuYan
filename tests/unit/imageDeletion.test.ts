import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import { getDeletableImageFileNames } from "../../electron/main/library/imageDeletion";

function makeItem(
  id: string,
  imageFileName: string,
  extras: Partial<LibraryItem> = {},
): LibraryItem {
  return {
    id,
    title: "测试素材",
    imageFileName,
    prompt: "提示词",
    negativePrompt: "",
    tags: ["测试"],
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
    ...extras,
  };
}

describe("getDeletableImageFileNames", () => {
  it("keeps images still referenced by remaining items", () => {
    expect(
      getDeletableImageFileNames(
        [makeItem("deleted", "shared.png"), makeItem("solo", "solo.png")],
        [makeItem("remaining", "shared.png")],
      ),
    ).toEqual(["solo.png"]);
  });

  it("deduplicates image cleanup targets", () => {
    expect(
      getDeletableImageFileNames(
        [makeItem("a", "same.png"), makeItem("b", "same.png")],
        [],
      ),
    ).toEqual(["same.png"]);
  });

  it("includes unused video poster, keyframes and reference images", () => {
    expect(
      getDeletableImageFileNames(
        [
          makeItem("video", "clip.mp4", {
            videoPosterFileName: "poster.jpg",
            videoKeyframes: [
              { imageFileName: "frame-1.jpg", atSec: 1, label: "1s" },
              { imageFileName: "frame-2.jpg", atSec: 2, label: "2s" },
            ],
            videoReferenceImages: ["ref-a.jpg", "shared-ref.jpg"],
          }),
        ],
        [makeItem("remaining", "other.png", { videoReferenceImages: ["shared-ref.jpg"] })],
      ),
    ).toEqual(["clip.mp4", "poster.jpg", "frame-1.jpg", "frame-2.jpg", "ref-a.jpg"]);
  });

  it("never schedules user-owned external media for deletion", () => {
    expect(
      getDeletableImageFileNames(
        [
          makeItem("external", "external.png", {
            mediaStorage: { kind: "external", rootId: "root-1", relativePath: "素材/外链.png" },
          }),
        ],
        [],
      ),
    ).toEqual([]);
  });
});
