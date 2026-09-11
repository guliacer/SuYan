import { describe, expect, it } from "vitest";
import { distributeItemsByTopEdge } from "@/features/library/utils/masonryLayout";

describe("masonryLayout", () => {
  it("fills the top row across columns before stacking downward", () => {
    expect(distributeItemsByTopEdge(["a", "b"], 4)).toEqual([["a"], ["b"]]);
    expect(distributeItemsByTopEdge(["a", "b", "c", "d", "e"], 3)).toEqual([
      ["a", "d"],
      ["b", "e"],
      ["c"],
    ]);
  });

  it("places later tall and short images into the currently shortest column", () => {
    const items = [
      { id: "a", height: 3 },
      { id: "b", height: 1 },
      { id: "c", height: 1 },
      { id: "d", height: 1 },
      { id: "e", height: 1 },
      { id: "f", height: 1 },
    ];

    expect(distributeItemsByTopEdge(items, 3, (item) => item.height).map((column) => column.map((item) => item.id))).toEqual([
      ["a"],
      ["b", "d", "f"],
      ["c", "e"],
    ]);
  });

  it("falls back to one column for invalid column counts", () => {
    expect(distributeItemsByTopEdge(["a", "b"], 0)).toEqual([["a", "b"]]);
  });
});
