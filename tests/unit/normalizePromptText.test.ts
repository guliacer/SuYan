import { describe, expect, it } from "vitest";
import { normalizePromptText } from "@/features/library/utils/normalizePromptText";

describe("normalizePromptText", () => {
  it("trims blank lines and line edges", () => {
    expect(normalizePromptText("  cat, light  \n\n  soft shadow  ")).toBe("cat, light\nsoft shadow");
  });
});
