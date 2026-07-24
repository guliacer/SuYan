import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import {
  prioritizeMissingLibraryItems,
  prioritizeMissingMediaStatusItems,
} from "@/features/library/utils/externalMediaStatus";

describe("external media status ordering", () => {
  it("places retained missing indexes inside the first conversion batch", () => {
    const items = [
      makeItem("available-1"),
      makeItem("available-2"),
      makeItem("missing", "missing"),
    ];

    expect(prioritizeMissingLibraryItems(items).slice(0, 2).map((item) => item.id)).toEqual([
      "missing",
      "available-1",
    ]);
  });

  it("keeps relative ordering stable inside missing and available partitions", () => {
    const cards = [
      { id: "available-1", mediaStatus: "available" as const },
      { id: "missing-1", mediaStatus: "missing" as const },
      { id: "available-2", mediaStatus: null },
      { id: "missing-2", mediaStatus: "missing" as const },
    ];

    expect(prioritizeMissingMediaStatusItems(cards).map((item) => item.id)).toEqual([
      "missing-1",
      "missing-2",
      "available-1",
      "available-2",
    ]);
  });
});

function makeItem(id: string, status: "available" | "missing" = "available"): LibraryItem {
  return {
    id,
    title: id,
    imageFileName: `${id}.png`,
    mediaStorage: { kind: "external", rootId: "root-1", relativePath: `${id}.png`, status },
    prompt: "",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}
