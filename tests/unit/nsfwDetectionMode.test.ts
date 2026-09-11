import { describe, expect, it } from "vitest";
import {
  defaultNsfwDetectionMode,
  normalizeNsfwDetectionMode,
} from "../../src/features/library/utils/nsfwDetectionMode";

describe("NSFW detection mode", () => {
  it("defaults to local-first for backward-compatible fallback", () => {
    expect(defaultNsfwDetectionMode).toBe("local-first");
    expect(normalizeNsfwDetectionMode(undefined)).toBe("local-first");
  });

  it("preserves the three supported modes", () => {
    expect(normalizeNsfwDetectionMode("local-first")).toBe("local-first");
    expect(normalizeNsfwDetectionMode("remote-only")).toBe("remote-only");
    expect(normalizeNsfwDetectionMode("local-only")).toBe("local-only");
    expect(normalizeNsfwDetectionMode("invalid")).toBe("local-first");
  });
});
