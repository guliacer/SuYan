import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moveItemBefore } from "../../src/features/library/components/AiSettingsDialog";

const dialogSource = readFileSync("src/features/library/components/AiSettingsDialog.tsx", "utf8");
const useAiSettingsSource = readFileSync("src/features/library/components/useAiSettings.ts", "utf8");
const connectionSource = readFileSync("src/features/library/components/AiConnectionSection.tsx", "utf8");
const rulesSource = readFileSync("src/features/library/components/AiRulesSection.tsx", "utf8");

describe("AI settings list controls", () => {
  it("supports drag reordering for API connections and rule entry groups", () => {
    expect(connectionSource).toContain("draggable={profiles.length > 1}");
    expect(connectionSource).toContain("reorderProfiles(sourceId, profile.id)");
    expect(rulesSource).toContain("draggable={orderedActionEntries.length > 1}");
    expect(rulesSource).toContain("reorderActionEntries(sourceId, entry.id)");
    expect(connectionSource).toContain("GripVertical");
    expect(rulesSource).toContain("GripVertical");
  });

  it("includes the custom rule entry order in the saved AI settings payload", () => {
    expect(useAiSettingsSource).toContain("actionOrder: actionEntryOrder");
    expect(useAiSettingsSource).toContain("normalizeAiSettingsActionOrder(settings.actionOrder)");
    expect(useAiSettingsSource).toContain("setFeedbackText(\"API 顺序已调整，正在自动保存。\")");
    expect(useAiSettingsSource).toContain("setFeedbackText(\"规则列表顺序已调整，正在自动保存。\")");
  });

  it("inserts a dragged item before the target in either direction", () => {
    expect(moveItemBefore(["a", "b", "c"], 0, 2)).toEqual(["b", "a", "c"]);
    expect(moveItemBefore(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItemBefore(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
});
