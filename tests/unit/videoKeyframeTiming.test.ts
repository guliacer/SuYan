import { describe, expect, it } from "vitest";
import { computeKeyframeTimings, maxVideoKeyframeCount } from "../../electron/main/library/videoKeyframeTiming";

describe("computeKeyframeTimings", () => {
  it("returns no timings for non-positive or invalid durations", () => {
    expect(computeKeyframeTimings(0)).toEqual([]);
    expect(computeKeyframeTimings(-5)).toEqual([]);
    expect(computeKeyframeTimings(Number.NaN)).toEqual([]);
    expect(computeKeyframeTimings(Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("caps the keyframe count at the maximum for long videos", () => {
    const timings = computeKeyframeTimings(60);

    expect(timings).toHaveLength(maxVideoKeyframeCount);
    expect(timings[0].label).toBe("0s-12s");
    expect(timings.at(-1)?.label).toBe("48s-60s");
  });

  it("places each sample point at the middle of its segment", () => {
    const timings = computeKeyframeTimings(10, 5);

    expect(timings.map((timing) => timing.atSec)).toEqual([1, 3, 5, 7, 9]);
    expect(timings.every((timing) => timing.imageFileName === "")).toBe(true);
  });

  it("uses one keyframe per second for short videos without exceeding the cap", () => {
    expect(computeKeyframeTimings(3)).toHaveLength(3);
    expect(computeKeyframeTimings(1)).toHaveLength(1);
  });

  it("never samples beyond the video duration", () => {
    const timings = computeKeyframeTimings(7);

    expect(timings.every((timing) => timing.atSec <= 7)).toBe(true);
  });
});
