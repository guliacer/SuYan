import { describe, expect, it } from "vitest";
import {
  defaultCanvasCreationPanelWidth,
  defaultCanvasResultsPanelWidth,
  defaultCanvasDraftSettings,
  defaultPositivePromptHeight,
  buildCanvasImageGenerationPayload,
  extractPromptKeywords,
  getCanvasGenerationSizeLabel,
  limitCanvasPromptText,
  maxCanvasPromptLength,
  maxCanvasCreationPanelWidth,
  maxCanvasResultsPanelWidth,
  minCanvasCreationPanelWidth,
  minCanvasResultsPanelWidth,
  normalizeCanvasCreationPanelWidth,
  normalizeCanvasDraftSettings,
  normalizeCanvasResultsPanelWidth,
  replaceCanvasPromptSelection,
  resolveCanvasAtmosphereTone,
  resolveCanvasGenerationSize,
  shouldInheritCanvasPromptOrigin,
} from "../../src/features/library/utils/canvasGeneration";

describe("canvasGeneration", () => {
  it("replaces only the selected prompt range for keyboard paste", () => {
    expect(replaceCanvasPromptSelection("前缀旧选区后缀", "新内容", 2, 5)).toEqual({
      text: "前缀新内容后缀",
      selectionStart: 5,
      selectionEnd: 5,
      truncated: false,
    });
    expect(replaceCanvasPromptSelection("前缀后缀", "插入", 2, 2).text).toBe("前缀插入后缀");
  });

  it("keeps prompt text around a long keyboard paste and truncates only the inserted part", () => {
    const result = replaceCanvasPromptSelection("开头" + "尾部", "新".repeat(maxCanvasPromptLength), 2, 2);
    expect(result.text.startsWith("开头")).toBe(true);
    expect(result.text.endsWith("尾部")).toBe(true);
    expect(result.text.length).toBe(maxCanvasPromptLength);
    expect(result.truncated).toBe(true);
  });

  it("uses safe defaults when a saved draft is missing", () => {
    expect(normalizeCanvasDraftSettings(undefined)).toEqual(defaultCanvasDraftSettings);
    expect(defaultCanvasDraftSettings.generationProvider).toBe("api");
    expect(defaultCanvasDraftSettings.negativePromptHidden).toBe(true);
  });

  it("restores the sidebar preference without changing the saved creation settings", () => {
    const draft = normalizeCanvasDraftSettings({ prompt: "保留我的提示词", positivePromptHeight: 600, sizePanelHidden: true, advancedSettingsOpen: true });
    expect(draft.creationPanelCollapsed).toBe(false);
    const collapsed = normalizeCanvasDraftSettings(JSON.parse(JSON.stringify({ ...draft, creationPanelCollapsed: true })));
    expect(collapsed).toEqual({ ...draft, creationPanelCollapsed: true });
    expect(normalizeCanvasDraftSettings({ ...collapsed, creationPanelCollapsed: false })).toEqual(draft);
    expect(normalizeCanvasDraftSettings({ creationPanelCollapsed: "true" }).creationPanelCollapsed).toBe(false);
  });

  it("persists the generated-work panel visibility preference", () => {
    expect(defaultCanvasDraftSettings.resultsPanelHidden).toBe(false);
    expect(normalizeCanvasDraftSettings({ resultsPanelHidden: true }).resultsPanelHidden).toBe(true);
    expect(normalizeCanvasDraftSettings({ resultsPanelHidden: false }).resultsPanelHidden).toBe(false);
    expect(normalizeCanvasDraftSettings({ resultsPanelHidden: "true" }).resultsPanelHidden).toBe(false);
  });

  it("normalizes the generated-work panel width within its desktop bounds", () => {
    expect(defaultCanvasResultsPanelWidth).toBe(220);
    expect(normalizeCanvasResultsPanelWidth(undefined)).toBe(defaultCanvasResultsPanelWidth);
    expect(normalizeCanvasResultsPanelWidth(minCanvasResultsPanelWidth - 1)).toBe(minCanvasResultsPanelWidth);
    expect(normalizeCanvasResultsPanelWidth(maxCanvasResultsPanelWidth + 1)).toBe(maxCanvasResultsPanelWidth);
    expect(normalizeCanvasResultsPanelWidth(271.6)).toBe(272);
    expect(normalizeCanvasDraftSettings({ resultsPanelWidth: 160 }).resultsPanelWidth).toBe(minCanvasResultsPanelWidth);
    expect(normalizeCanvasDraftSettings({ resultsPanelWidth: 500 }).resultsPanelWidth).toBe(maxCanvasResultsPanelWidth);
  });

  it("normalizes and preserves the creation panel width", () => {
    expect(defaultCanvasCreationPanelWidth).toBe(380);
    expect(normalizeCanvasCreationPanelWidth(undefined)).toBe(defaultCanvasCreationPanelWidth);
    expect(normalizeCanvasCreationPanelWidth(minCanvasCreationPanelWidth - 1)).toBe(minCanvasCreationPanelWidth);
    expect(normalizeCanvasCreationPanelWidth(maxCanvasCreationPanelWidth + 1)).toBe(maxCanvasCreationPanelWidth);
    expect(normalizeCanvasCreationPanelWidth(417.4)).toBe(417);
    expect(normalizeCanvasDraftSettings({ creationPanelWidth: 280 }).creationPanelWidth).toBe(minCanvasCreationPanelWidth);
    expect(normalizeCanvasDraftSettings({ creationPanelWidth: 500 }).creationPanelWidth).toBe(500);
  });

  it("migrates retired providers back to the default API provider", () => {
    expect(normalizeCanvasDraftSettings({ generationProvider: "doubao-web" }).generationProvider).toBe("api");
    expect(normalizeCanvasDraftSettings({ generationProvider: "other" }).generationProvider).toBe("api");
  });

  it("keeps the current positive prompt height as the default and clamps saved values", () => {
    expect(defaultPositivePromptHeight).toBe(340);
    expect(normalizeCanvasDraftSettings({ positivePromptHeight: 120 }).positivePromptHeight).toBe(192);
    expect(normalizeCanvasDraftSettings({ positivePromptHeight: 900 }).positivePromptHeight).toBe(720);
    expect(normalizeCanvasDraftSettings({ positivePromptHeight: 412 }).positivePromptHeight).toBe(412);
  });

  it("preserves prompt content and normalizes transparent JPEG output to PNG", () => {
    const normalized = normalizeCanvasDraftSettings({
      ...defaultCanvasDraftSettings,
      prompt: "positive prompt",
      negativePrompt: "negative prompt",
      transparentBackground: true,
      outputFormat: "jpeg",
      customWidth: 9000,
      customHeight: 100,
      count: 9,
    });

    expect(normalized).toMatchObject({
      prompt: "positive prompt",
      negativePrompt: "negative prompt",
      transparentBackground: true,
      outputFormat: "png",
      customWidth: 4096,
      customHeight: 256,
      count: 4,
    });
  });

  it("keeps WEBP compatible with transparent output", () => {
    expect(normalizeCanvasDraftSettings({
      transparentBackground: true,
      outputFormat: "webp",
    }).outputFormat).toBe("webp");
  });

  it("normalizes the persisted advanced-settings expansion state", () => {
    expect(defaultCanvasDraftSettings.advancedSettingsOpen).toBe(false);
    expect(normalizeCanvasDraftSettings({ advancedSettingsOpen: true }).advancedSettingsOpen).toBe(true);
    expect(normalizeCanvasDraftSettings({ advancedSettingsOpen: "true" }).advancedSettingsOpen).toBe(false);
  });

  it.each([
    [{ ...defaultCanvasDraftSettings, sizeMode: "auto" as const }, "auto"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "1:1" as const }, "1024x1024"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "3:2" as const }, "1248x832"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "2:3" as const }, "832x1248"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "16:9" as const }, "1312x736"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "9:16" as const }, "736x1312"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "4:3" as const }, "1152x864"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "3:4" as const }, "864x1152"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, aspectRatio: "21:9" as const }, "1568x672"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "custom" as const, customWidth: 1600, customHeight: 900 }, "1600x900"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "custom" as const, customWidth: 900, customHeight: 1600 }, "900x1600"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, baseResolution: "2k" as const, aspectRatio: "1:1" as const }, "2048x2048"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, baseResolution: "2k" as const, aspectRatio: "3:2" as const }, "2496x1664"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, baseResolution: "3k" as const, aspectRatio: "2:3" as const }, "2496x3744"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, baseResolution: "4k" as const, aspectRatio: "3:2" as const }, "4992x3328"],
    [{ ...defaultCanvasDraftSettings, sizeMode: "ratio" as const, baseResolution: "4k" as const, aspectRatio: "16:9" as const }, "5248x2944"],
  ])("maps canvas settings to a supported generation size", (settings, expected) => {
    expect(resolveCanvasGenerationSize(settings)).toBe(expected);
  });

  it.each([
    ["1:1", "1024x1024"],
    ["3:2", "1248x832"],
    ["2:3", "832x1248"],
    ["16:9", "1312x736"],
    ["9:16", "736x1312"],
    ["4:3", "1152x864"],
    ["3:4", "864x1152"],
    ["21:9", "1568x672"],
  ] as const)("uses the Agnes native %s 1K dimensions", (aspectRatio, expected) => {
    const size = resolveCanvasGenerationSize({
      ...defaultCanvasDraftSettings,
      sizeMode: "ratio",
      baseResolution: "1k",
      aspectRatio,
    });
    expect(size).toBe(expected);

  });

  it("limits persisted prompt fields to 3000 characters without splitting surrogate pairs", () => {
    const longPrompt = "字".repeat(maxCanvasPromptLength + 80);
    const normalized = normalizeCanvasDraftSettings({
      prompt: longPrompt,
      negativePrompt: longPrompt,
    });

    expect(normalized.prompt).toBe("字".repeat(maxCanvasPromptLength));
    expect(normalized.negativePrompt).toBe("字".repeat(maxCanvasPromptLength));
    expect(limitCanvasPromptText(`${"a".repeat(maxCanvasPromptLength - 1)}🙂`)).toBe("a".repeat(maxCanvasPromptLength - 1));
  });

  it("provides a user-facing label for the resolved size", () => {
    expect(getCanvasGenerationSizeLabel("1312x736")).toBe("横向 1312 × 736");
  });

  it("maps every generation setting into one auditable request payload", () => {
    const payload = buildCanvasImageGenerationPayload({
      ...defaultCanvasDraftSettings,
      aspectRatio: "3:4",
      baseResolution: "1k",
      count: 3,
      negativePrompt: " blur ",
      notificationEnabled: true,
      outputFormat: "webp",
      prompt: " product photo ",
      quality: "high",
      referenceImages: [{ dataUrl: "data:image/png;base64,AAAA", fileName: "canvas-reference-test.png", title: "" }],
      transparentBackground: true,
    }, {
      apiModelId: "image-model",
      apiProfileId: "profile-1",
    });

    expect(payload).toEqual({
      apiModelId: "image-model",
      apiProfileId: "profile-1",
      background: "transparent",
      doubaoModel: undefined,
      doubaoStyle: undefined,
      generationProvider: "api",
      n: 3,
      negativePrompt: "blur",
      notificationEnabled: true,
      outputFormat: "webp",
      prompt: "product photo",
      quality: "high",
      referenceImageDataUrls: ["data:image/png;base64,AAAA"],
      referenceImageFileNames: ["canvas-reference-test.png"],
      ratio: "3:4",
      size: "864x1152",
    });
  });

  it("always keeps the positive prompt visible when loading an old hidden setting", () => {
    expect(normalizeCanvasDraftSettings({ positivePromptHidden: true }).positivePromptHidden).toBe(false);
  });

  it("limits both prompt fields again at the generation boundary", () => {
    const payload = buildCanvasImageGenerationPayload(defaultCanvasDraftSettings, {
      prompt: "正".repeat(maxCanvasPromptLength + 10),
      negativePrompt: "负".repeat(maxCanvasPromptLength + 10),
    });

    expect(payload.prompt).toBe("正".repeat(maxCanvasPromptLength));
    expect(payload.negativePrompt).toBe("负".repeat(maxCanvasPromptLength));
  });

  it("persists valid base resolutions and falls back for invalid saved values", () => {
    expect(normalizeCanvasDraftSettings({ baseResolution: "4k" }).baseResolution).toBe("4k");
    expect(normalizeCanvasDraftSettings({ baseResolution: "3k" }).baseResolution).toBe("3k");
    expect(normalizeCanvasDraftSettings({ baseResolution: "8k" }).baseResolution).toBe("1k");
  });

  it("extracts de-duplicated prompt keywords for the evolution display", () => {
    const keywords = extractPromptKeywords("赛博朋克城市，霓虹反射，雨夜，赛博朋克城市，电影感光线，超写实细节");
    expect(keywords).toEqual(["赛博朋克城市", "霓虹反射", "雨夜", "电影感光线", "超写实细节"]);
  });

  it("derives a restrained atmosphere tone from prompt semantics", () => {
    expect(resolveCanvasAtmosphereTone("森林里的植物与竹影")).toBe("forest");
    expect(resolveCanvasAtmosphereTone("海洋、湖泊和水下光影")).toBe("ocean");
    expect(resolveCanvasAtmosphereTone("咖啡与蛋糕的美食摄影")).toBe("warm");
    expect(resolveCanvasAtmosphereTone("梦幻魔法，紫色仙境")).toBe("violet");
    expect(resolveCanvasAtmosphereTone("极简几何构图")).toBe("neutral");
  });

  it("caps prompt keywords at the requested limit", () => {
    expect(extractPromptKeywords("a, b, c, d, e, f, g")).toHaveLength(5);
    expect(extractPromptKeywords("a, b, c", 2)).toEqual(["a", "b"]);
  });

  describe("canvas prompt origin (提示词组血缘)", () => {
    const origin = {
      itemId: "item-1",
      prompt: "一间临水而建的新中式茶室",
      negativePrompt: "低清晰度",
      title: "新中式茶室",
      tags: ["茶室", "新中式"],
      category: "室内设计",
      categoryId: "system:interior",
      genreIds: ["system:interior"],
      categoryConfidence: 0.9,
      categorySource: "ai" as const,
    };

    it("keeps a valid origin through draft normalization and drops malformed ones", () => {
      expect(normalizeCanvasDraftSettings({ promptOrigin: origin }).promptOrigin).toEqual(origin);
      // 缺 itemId / prompt → 血缘无从校验，整体丢弃。
      expect(normalizeCanvasDraftSettings({ promptOrigin: { ...origin, itemId: "" } }).promptOrigin).toBeNull();
      expect(normalizeCanvasDraftSettings({ promptOrigin: { ...origin, prompt: "  " } }).promptOrigin).toBeNull();
      expect(normalizeCanvasDraftSettings({ promptOrigin: "junk" }).promptOrigin).toBeNull();
      expect(normalizeCanvasDraftSettings({}).promptOrigin).toBeNull();
    });

    it("inherits only when both prompts are unchanged (whitespace/case-insensitive)", () => {
      expect(shouldInheritCanvasPromptOrigin(origin, origin.prompt, origin.negativePrompt)).toBe(true);
      // 与分组键同源的宽松比对：仅空白差异不算改动。
      expect(shouldInheritCanvasPromptOrigin(origin, `  ${origin.prompt}  `, "低清晰度 ")).toBe(true);
      // 正向或负向提示词任一改动 → 不继承，另立新组。
      expect(shouldInheritCanvasPromptOrigin(origin, `${origin.prompt}，黄昏光线`, origin.negativePrompt)).toBe(false);
      expect(shouldInheritCanvasPromptOrigin(origin, origin.prompt, "低清晰度、模糊")).toBe(false);
      expect(shouldInheritCanvasPromptOrigin(null, origin.prompt, origin.negativePrompt)).toBe(false);
    });
  });
});
