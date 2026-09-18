import { describe, expect, it } from "vitest";
import { normalizePromptText } from "@/features/library/utils/normalizePromptText";

describe("normalizePromptText", () => {
  it("normalizes line endings while preserving paragraph breaks", () => {
    expect(normalizePromptText("  cat, light  \r\n\r\n  soft shadow  ")).toBe("cat, light\n\nsoft shadow");
  });

  it("removes only leading and trailing blank lines", () => {
    expect(normalizePromptText("\n\ncat, light\n\nsoft shadow\n\n")).toBe("cat, light\n\nsoft shadow");
  });
});
