import { describe, expect, it } from "vitest";
import { planArchiveVolumes } from "../../electron/main/library/archiveVolumePolicy";

describe("archive volume policy", () => {
  it("keeps a small library in one volume", () => {
    const volumes = planArchiveVolumes([
      { entry: "a", size: 3 },
      { entry: "b", size: 4 },
    ], 1, 10);

    expect(volumes).toEqual([["a", "b"]]);
  });

  it("splits large libraries by source bytes while preserving order", () => {
    const volumes = planArchiveVolumes([
      { entry: "a", size: 6 },
      { entry: "b", size: 4 },
      { entry: "c", size: 5 },
    ], 2, 10);

    expect(volumes).toEqual([["a"], ["b"], ["c"]]);
  });

  it("keeps one entry even when it is larger than the target", () => {
    const volumes = planArchiveVolumes([{ entry: "large", size: 20 }], 0, 10);

    expect(volumes).toEqual([["large"]]);
  });

  it("also splits when the entry-count budget is reached", () => {
    const volumes = planArchiveVolumes([
      { entry: "a", size: 1 },
      { entry: "b", size: 1 },
      { entry: "c", size: 1 },
    ], 0, 100, 2);

    expect(volumes).toEqual([["a", "b"], ["c"]]);
  });

  it("returns an empty volume for an empty library", () => {
    expect(planArchiveVolumes([], 0, 10)).toEqual([[]]);
  });
});
