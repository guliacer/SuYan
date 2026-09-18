import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clampOverlayPosition } from "../../src/components/ui/overlayPosition";

describe("fixed overlay positioning", () => {
  it("keeps an overlay inside the available safe area", () => {
    expect(clampOverlayPosition(4, 200, 56, 1000)).toBe(56);
    expect(clampOverlayPosition(900, 200, 56, 1000)).toBe(800);
    expect(clampOverlayPosition(360, 200, 56, 1000)).toBe(360);
  });

  it("uses the shared safe-area helper for portal menus and guides", () => {
    const files = [
      "src/features/library/components/AiRulesSection.tsx",
      "src/features/library/components/FeatureGuide.tsx",
      "src/features/library/components/LibraryView.tsx",
      "src/features/library/components/PromptDetailDialog.tsx",
      "src/features/library/components/WebAssistantView.tsx",
      "src/features/prompts/components/GithubProjectContent.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("getAppOverlayBounds");
      expect(source, file).toContain("clampOverlayPosition");
    }
  });
});
