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

  it("falls back to one column for invalid column counts", () => {
    expect(distributeItemsByTopEdge(["a", "b"], 0)).toEqual([["a", "b"]]);
  });
});
