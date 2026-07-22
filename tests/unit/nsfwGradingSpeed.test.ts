import { describe, expect, it } from "vitest";
import {
  getNsfwGradingConcurrency,
  normalizeNsfwGradingSpeed,
} from "@/features/library/utils/nsfwGradingSpeed";

describe("nsfwGradingSpeed", () => {
  it("normalizes persisted speed settings", () => {
    expect(normalizeNsfwGradingSpeed("stable")).toBe("stable");
    expect(normalizeNsfwGradingSpeed("turbo")).toBe("turbo");
    expect(normalizeNsfwGradingSpeed("unknown")).toBe("fast");
    expect(normalizeNsfwGradingSpeed(undefined)).toBe("fast");
  });

  it("maps speed to bounded concurrency", () => {
    expect(getNsfwGradingConcurrency("stable")).toBe(2);
    expect(getNsfwGradingConcurrency("fast")).toBe(4);
    expect(getNsfwGradingConcurrency("turbo")).toBe(6);
  });
});
