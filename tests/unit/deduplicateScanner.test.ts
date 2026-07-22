import { describe, expect, it } from "vitest";
import { buildDeduplicateGroups, type HashedItem } from "../../electron/main/batch/deduplicateScanner";

function makeHashed(hash: string, itemId: string, fileSize: number): HashedItem {
  return {
    hash,
    item: {
      itemId,
      imageFileName: `${itemId}.png`,
      fileSize,
      title: `素材 ${itemId}`,
      createdAt: "2026-07-10T00:00:00.000Z",
    },
  };
}

describe("buildDeduplicateGroups", () => {
  it("returns empty result for empty input", () => {
    const result = buildDeduplicateGroups([]);

    expect(result.groups).toHaveLength(0);
    expect(result.totalDuplicateFiles).toBe(0);
    expect(result.wastedBytes).toBe(0);
  });

  it("does not form a group when a hash has only one item", () => {
    const result = buildDeduplicateGroups([makeHashed("aaa", "item-1", 1024)]);

    expect(result.groups).toHaveLength(0);
    expect(result.totalDuplicateFiles).toBe(0);
    expect(result.wastedBytes).toBe(0);
  });

  it("groups two items with the same hash and counts one duplicate file", () => {
    const result = buildDeduplicateGroups([
      makeHashed("same", "item-1", 1024),
      makeHashed("same", "item-2", 2048),
    ]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].hash).toBe("same");
    expect(result.groups[0].items).toHaveLength(2);
    expect(result.totalDuplicateFiles).toBe(1);
    expect(result.wastedBytes).toBe(1024);
  });

  it("tracks multiple duplicate groups independently", () => {
    const result = buildDeduplicateGroups([
      makeHashed("hash-a", "a-1", 1000),
      makeHashed("hash-a", "a-2", 3000),
      makeHashed("hash-b", "b-1", 500),
      makeHashed("hash-b", "b-2", 500),
      makeHashed("hash-b", "b-3", 500),
    ]);

    expect(result.groups).toHaveLength(2);
    expect(result.totalDuplicateFiles).toBe(3); // (2-1) + (3-1)
    expect(result.wastedBytes).toBe(2000);
  });

  it("keeps all items inside a group including the largest one", () => {
    const result = buildDeduplicateGroups([
      makeHashed("dup", "keep", 4096),
      makeHashed("dup", "drop", 1024),
    ]);

    expect(result.groups[0].items.map((item) => item.itemId)).toEqual(
      expect.arrayContaining(["keep", "drop"]),
    );
  });
});
