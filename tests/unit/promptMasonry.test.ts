import { describe, expect, it } from "vitest";
import { distributePromptMasonryItems } from "@/features/prompts/utils/promptMasonry";

describe("promptMasonry", () => {
  it("places cards into shortest columns instead of stretching a row", () => {
    const columns = distributePromptMasonryItems(
      [
        { id: "tall", cardWidth: 300, cardHeight: 620 },
        { id: "short-a", cardWidth: 300, cardHeight: 260 },
        { id: "short-b", cardWidth: 300, cardHeight: 260 },
        { id: "next", cardWidth: 300, cardHeight: 260 },
      ],
      940,
    );

    expect(columns.map((column) => column.items.map((item) => item.id))).toEqual([
      ["tall"],
      ["short-a", "next"],
      ["short-b"],
    ]);
  });

  it("reduces columns when custom card widths cannot fit together", () => {
    const columns = distributePromptMasonryItems(
      [
        { id: "wide", cardWidth: 640, cardHeight: 300 },
        { id: "normal-a", cardWidth: 300, cardHeight: 300 },
        { id: "normal-b", cardWidth: 300, cardHeight: 300 },
      ],
      960,
    );

    expect(columns).toHaveLength(2);
    expect(columns.reduce((sum, column) => sum + column.width, 0) + 12).toBeLessThanOrEqual(960);
    expect(columns.flatMap((column) => column.items.map((item) => item.id))).toEqual(
      expect.arrayContaining(["wide", "normal-a", "normal-b"]),
    );
  });

  it("keeps all cards in one responsive column when the container is narrow", () => {
    const columns = distributePromptMasonryItems(
      [{ id: "one", cardWidth: 300, cardHeight: 300 }, { id: "two", cardWidth: 300, cardHeight: 400 }],
      210,
    );

    expect(columns).toHaveLength(1);
    expect(columns[0]?.width).toBe(210);
    expect(columns[0]?.items.map((item) => item.id)).toEqual(["one", "two"]);
  });
});
