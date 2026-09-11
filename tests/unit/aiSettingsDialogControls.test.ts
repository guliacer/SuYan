import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moveItemBefore } from "../../src/features/library/components/AiSettingsDialog";

const dialogSource = readFileSync("src/features/library/components/AiSettingsDialog.tsx", "utf8");
const useAiSettingsSource = readFileSync("src/features/library/components/useAiSettings.ts", "utf8");
const connectionSource = readFileSync("src/features/library/components/AiConnectionSection.tsx", "utf8");
const rulesSource = readFileSync("src/features/library/components/AiRulesSection.tsx", "utf8");
const nsfwSettingsSource = readFileSync("src/features/library/components/NsfwSettingsDialog.tsx", "utf8");
const canvasSource = readFileSync("src/features/library/components/CanvasView.tsx", "utf8");
const promptDetailSource = readFileSync("src/features/library/components/PromptDetailDialog.tsx", "utf8");
const titleBarSource = readFileSync("src/features/library/components/shell/AppTitleBar.tsx", "utf8");
const appDialogSource = readFileSync("src/components/ui/AppDialog.tsx", "utf8");

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
    expect(useAiSettingsSource).toContain('setFeedbackText(t("API 顺序已调整，正在自动保存。"))');
    expect(useAiSettingsSource).toContain('setFeedbackText(t("规则列表顺序已调整，正在自动保存。"))');
  });

  it("keeps configuration API sources visible but hides unusable providers from the canvas", () => {
    expect(rulesSource).toContain("const providerOptions: AiProviderOption[] = usableProfiles.map((profile) => ({");
    expect(rulesSource).toContain("当前服务商仍可保留配置");
    expect(nsfwSettingsSource).toContain("const nsfwActionProfiles = aiSettings.profiles;");
    expect(nsfwSettingsSource).toContain("当前服务商没有支持图片理解的模型。");
    expect(canvasSource).toContain(".filter((entry) => entry.models.length > 0)");
    expect(canvasSource).not.toContain("当前 API 没有可用生图模型。");
    expect(promptDetailSource).toContain("const activeProviderModels =");
    expect(promptDetailSource).toContain("activeProviderModels.map((model) =>");
    expect(promptDetailSource).toContain("hasAiModelSelection(aiSettings, selection, action)");
    expect(promptDetailSource).toContain("model.capabilities.includes(getAiProfileActionCapability(action))");
  });

  it("keeps image recognition on the configured remote API path", () => {
    expect(promptDetailSource).toContain("getSelectableAiProfiles(aiSettings, action)");
    expect(promptDetailSource).not.toContain("LOCAL_IMAGE_CLASSIFICATION_PROFILE_ID");
    expect(promptDetailSource).not.toContain("isLocalImageClassificationAction");
    expect(promptDetailSource).not.toContain("allowLocalModel");
    expect(promptDetailSource).not.toContain("window.suyanApi.analyzeImage");
    expect(promptDetailSource).not.toContain('source: \"local\"');
    expect(rulesSource).not.toContain('label: "本地模型"');
    expect(rulesSource).not.toContain("localAiModelId");
    expect(canvasSource).toContain("selectedGenerationModel?.capabilities.includes(\"image-generation\")");
  });

  it("uses accessible labels without hover-blocking native window titles", () => {
    expect(titleBarSource).not.toContain('title={title}');
    expect(titleBarSource).toContain('aria-label={ariaLabel}');
    expect(titleBarSource).toContain('data-app-titlebar="true"');
    expect(titleBarSource).toContain("z-[10000]");
    expect(titleBarSource).toContain("[-webkit-app-region:drag]");
    expect(titleBarSource).toContain("[-webkit-app-region:no-drag]");
    expect(titleBarSource).not.toContain("overlayActive");
    expect(titleBarSource).not.toContain("icon-tooltip-button__bubble");
    expect(appDialogSource).toContain('title={resolvedAriaLabel}');
    expect(appDialogSource).toContain("app-window-overlay");
    expect(appDialogSource).not.toContain("icon-tooltip-button__bubble");
  });

  it("keeps the content grading model search icon inside its input", () => {
    expect(nsfwSettingsSource).toContain(
      'className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted"',
    );
    expect(nsfwSettingsSource).toContain('className="h-10 rounded-md pl-10 pr-3"');
    expect(nsfwSettingsSource).not.toContain("inset-y-0 my-auto");
  });

  it("places content grading panels in a responsive two-column layout", () => {
    expect(nsfwSettingsSource).toContain(
      'nsfwDetectionModeDraft !== "local-only" ? (',
    );
    expect(nsfwSettingsSource).toContain(
      "min-[1120px]:col-start-1 min-[1120px]:row-start-1",
    );
    expect(nsfwSettingsSource).toContain(
      "min-[1120px]:col-start-1 min-[1120px]:row-start-2",
    );
    expect(nsfwSettingsSource).toContain(
      "min-[1120px]:col-start-2 min-[1120px]:row-start-1 min-[1120px]:row-span-2",
    );
    expect(nsfwSettingsSource.indexOf("批量分级")).toBeLessThan(
      nsfwSettingsSource.indexOf("AI 检测引擎"),
    );
    expect(nsfwSettingsSource.indexOf("AI 检测引擎")).toBeLessThan(
      nsfwSettingsSource.indexOf("检测规则"),
    );
  });

  it("imports connection, API key, and model data from the clipboard without field clear buttons", () => {
    expect(connectionSource).toContain("ClipboardPaste");
    expect(connectionSource).toContain("importClipboardIntoSelectedProfile");
    expect(connectionSource).toContain('title={t("快速导入接口、API Key和模型")}');
    expect(connectionSource).not.toContain('aria-label="删除接口地址"');
    expect(connectionSource).not.toContain('aria-label="删除 API Key"');
    expect(connectionSource).not.toContain("handleClearBaseUrl");
  });

  it("persists recognition source changes through the same full settings snapshot", () => {
    expect(useAiSettingsSource).toContain("recognitionSourcePreferences,");
  });

  it("inserts a dragged item before the target in either direction", () => {
    expect(moveItemBefore(["a", "b", "c"], 0, 2)).toEqual(["b", "a", "c"]);
    expect(moveItemBefore(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItemBefore(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
});
