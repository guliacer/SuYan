import { describe, expect, it } from "vitest";
import {
  aiSettingsActionEntries,
  resolveAiSettingsEntryAction,
} from "../../src/features/library/components/aiSettingsDialogData";

describe("AI settings entry selection", () => {
  for (const [id, kind, promptAction, imageAction] of [
    ["category-recognition", "category", "prompt-category", "image-category"],
    ["tag-recognition", "tags", "prompt-tags", "image-tags"],
  ] as const) {
    const entry = aiSettingsActionEntries.find((item) => item.id === id)!;
    it(`${kind}: enters the saved image source from another setting`, () => {
      expect(resolveAiSettingsEntryAction(entry, "prompt-translation", { [kind]: "image" })).toBe(imageAction);
    });
    it(`${kind}: keeps manual source editing until leaving the group`, () => {
      expect(resolveAiSettingsEntryAction(entry, promptAction, { [kind]: "image" })).toBe(promptAction);
      expect(resolveAiSettingsEntryAction(entry, "image-reverse", { [kind]: "image" })).toBe(imageAction);
    });
    it(`${kind}: can activate the default directly and supports old settings`, () => {
      expect(resolveAiSettingsEntryAction(entry, null, { [kind]: "image" })).toBe(imageAction);
      expect(resolveAiSettingsEntryAction(entry, null, { [kind]: "prompt" })).toBe(promptAction);
      expect(resolveAiSettingsEntryAction(entry, "image-reverse", {})).toBe(promptAction);
    });
  }
  it("keeps category and tag defaults independent", () => {
    const [category, tags] = aiSettingsActionEntries;
    const preferences = { category: "image", tags: "prompt" } as const;
    expect(resolveAiSettingsEntryAction(category!, "prompt-tags", preferences)).toBe("image-category");
    expect(resolveAiSettingsEntryAction(tags!, "image-category", preferences)).toBe("prompt-tags");
  });
  it("opens every single-source setting without borrowing another feature's default", () => {
    for (const entry of aiSettingsActionEntries.filter((item) => item.actions.length === 1)) {
      expect(resolveAiSettingsEntryAction(entry, "image-category", { category: "image", tags: "image" })).toBe(entry.actions[0]);
    }
  });
});
