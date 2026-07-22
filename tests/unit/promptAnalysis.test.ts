import { describe, expect, it } from "vitest";
import {
  analyzePromptText,
  applyCategoryToTags,
  applyAnalysisInlineChips,
  applyAnalysisTemplate,
  applyReplacementChip,
  buildAiPromptOptionAnalysis,
  buildAiPromptOptionValues,
  buildGeneratedPromptOptionValues,
  buildPromptAnalysisFromSavedCapsules,
  buildPromptOptionAnalysis,
  filterPromptOptionValues,
  getNegativePromptValues,
  moveNegativePromptValuesFromPrompt,
  normalizeConcretePromptTags,
  omitNegativeAnalysisSections,
  splitNegativePromptFromPrompt,
  suggestPromptCategories,
} from "@/features/library/utils/promptAnalysis";

describe("promptAnalysis", () => {
  it("suggests image-focused categories from prompt content", () => {
    const suggestions = suggestPromptCategories({
      title: "赛博朋克海报",
      prompt: "赛博朋克霓虹风格，16:9 横屏，电影感光影，英文短标语字体",
      tags: ["图像风格"],
    });

    expect(suggestions.length).toBeGreaterThanOrEqual(5);
    expect(suggestions.length).toBeLessThanOrEqual(10);
    expect(suggestions).toContain("赛博朋克");
    expect(suggestions).toContain("海报设计");
  });

  it("keeps category separate from tags", () => {
    expect(applyCategoryToTags(["旧分类", "图像风格", "旧分类"], "旧分类", "新分类")).toEqual([
      "图像风格",
    ]);
  });

  it("filters empty dimension names from concrete image tags", () => {
    expect(
      normalizeConcretePromptTags([
        "图像提示词",
        "图像风格",
        "摄影风格",
        "景别",
        "识别",
        "银紫色长发",
        "近景自拍",
      ]),
    ).toEqual(["银紫色长发", "近景自拍"]);
  });

  it("filters parameter-like and model-source noise from concrete tags", () => {
    expect(
      normalizeConcretePromptTags([
        "GPT Image 2 prompts",
        "ecommerce",
        "海报设计",
        "商业视觉",
        "前景加入一层透明玻璃或亚克力板",
        "玻璃表面布满细密水珠",
        "放在画面中央偏下位置",
        "背景可以有轻微虚化",
        "请以我上传的水果照片作为参考图",
        "冰爽水雾水果广告海报",
        "水梨",
      ]),
    ).toEqual(["海报设计", "商业视觉", "冰爽水雾水果广告海报", "水梨"]);
  });

  it("builds replacement chips and applies one chip to prompt text", () => {
    const prompt = "水彩手绘风格，近景，柔和窗边自然光影，低饱和莫兰迪配色";
    const analysis = analyzePromptText(prompt);
    const chip = analysis.chips.find((item) => item.value === "水彩手绘风格");

    expect(chip).toBeDefined();
    expect(applyReplacementChip(prompt, chip!)).toContain("{{imageStyle: 水彩手绘风格}}");
  });

  it("writes analyzed chips directly into the prompt text", () => {
    const prompt = "赛博朋克霓虹风格，近景，16:9 横屏，霓虹反射光影";
    const analysis = analyzePromptText(prompt);
    const nextPrompt = applyAnalysisInlineChips(prompt, analysis);

    expect(nextPrompt).toContain("{{imageStyle: 赛博朋克霓虹风格}}");
    expect(nextPrompt).toContain("{{shotSize: 近景}}");
    expect(nextPrompt).toContain("{{aspectRatio: 16:9 横屏}}");
    expect(nextPrompt).toContain("{{lightShadow: 霓虹反射光影}}");
  });

  it("does not replace the prompt with a broad template when short values are not located", () => {
    const prompt = "画面中人物下半身更有力量感，背景保留抽象色块";
    const analysis = {
      ...analyzePromptText(prompt),
      chips: [
        {
          id: "shot-size-test",
          sectionKey: "shot_size" as const,
          label: "景别",
          variable: "shotSize",
          value: "全景",
          templateText: "{{shotSize: 全景}}",
        },
      ],
      template: "景别：{{shotSize: 全景}}",
    };
    const nextPrompt = applyAnalysisInlineChips(prompt, analysis);

    expect(nextPrompt).toBe(prompt);
    expect(nextPrompt).not.toContain("{{shotSize:");
    expect(nextPrompt).not.toContain("{{pose:");
  });

  it("restores only the new capsule variables from saved prompts", () => {
    const analysis = buildPromptAnalysisFromSavedCapsules(
      "旧风格：{{style: 电影感写真}}\n图像风格：{{imageStyle: 浮世绘 Ukiyo-e}}\n画面比例：{{aspectRatio: 1:1 方形构图}}\n旧光线：{{lighting: 柔和自然光}}",
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.sections.map((section) => section.variable)).toEqual(["imageStyle", "aspectRatio"]);
    expect(analysis?.chips.map((chip) => chip.templateText)).toContain("{{imageStyle: 浮世绘 Ukiyo-e}}");
    expect(analysis?.chips.some((chip) => chip.variable === "style" || chip.variable === "lighting")).toBe(false);
  });

  it("restores extended portrait capsule variables from saved prompts", () => {
    const analysis = buildPromptAnalysisFromSavedCapsules(
      "镜头器材：{{lensEquipment: 85mm定焦}}\n底妆：{{baseMakeup: 水光透亮底妆}}\n场地大类：{{locationScene: 顶层公寓}}\n前景遮挡：{{foregroundOcclusion: 薄纱前景遮挡}}",
    );

    expect(analysis).not.toBeNull();
    expect(analysis?.sections.map((section) => section.label)).toEqual([
      "镜头器材",
      "底妆",
      "场地大类",
      "前景遮挡",
    ]);
    expect(analysis?.chips.map((chip) => chip.templateText)).toContain("{{locationScene: 顶层公寓}}");
  });

  it("corrects saved capsule variables when the value clearly belongs to another type", () => {
    const analysis = buildPromptAnalysisFromSavedCapsules("{{hairAccessory: 一位美丽少女}}，刺绣细节");

    expect(analysis).not.toBeNull();
    expect(analysis?.sections.map((section) => section.key)).toEqual(["identity_attribute"]);
    expect(analysis?.sections[0]).toMatchObject({
      label: "基础身份属性",
      variable: "identityAttribute",
      values: ["一位美丽少女"],
    });
    expect(analysis?.chips[0]?.templateText).toBe("{{identityAttribute: 一位美丽少女}}");
  });

  it("uses bracketed prompt fragments as default replaceable capsules", () => {
    const prompt = "一张【水梨】广告海报，画面比例[3:4]，整体（清爽夏日氛围），风格为（冰爽水雾水果广告海报）";
    const savedAnalysis = buildPromptAnalysisFromSavedCapsules(prompt);
    const localAnalysis = analyzePromptText(prompt);

    expect(savedAnalysis).not.toBeNull();
    expect(savedAnalysis?.chips.map((chip) => chip.templateText)).toEqual(
      expect.arrayContaining([
        "{{foodMainIngredient: 水梨}}",
        "{{aspectRatio: 3:4}}",
        "{{atmosphere: 清爽夏日氛围}}",
        "{{commercialVisualStyle: 冰爽水雾水果广告海报}}",
      ]),
    );
    expect(localAnalysis.chips.map((chip) => chip.templateText)).toEqual(
      expect.arrayContaining([
        "{{foodMainIngredient: 水梨}}",
        "{{aspectRatio: 3:4}}",
        "{{atmosphere: 清爽夏日氛围}}",
      ]),
    );
  });

  it("builds local replacement options from the reset rule bank", () => {
    const analysis = buildPromptOptionAnalysis({
      prompt: "水彩手绘风格，近景，16:9 横屏",
      optionLabel: "图像风格",
      optionValue: "水彩手绘风格",
      optionVariable: "imageStyle",
    });

    expect(analysis.sections[0]?.variable).toBe("imageStyle");
    expect(analysis.sections[0]?.values).toContain("浮世绘 Ukiyo-e 木版画风格");
    expect(analysis.sections[0]?.values).toContain("赛博朋克霓虹风格");
  });

  it("builds 3 to 5 contextual AI prompt options for the active capsule", () => {
    const values = buildAiPromptOptionValues({
      prompt: "韩国财阀继承人氛围，电影摄影美学，柔和光晕",
      optionValue: "韩国财阀继承人氛围",
      optionVariable: "atmosphere",
    });

    expect(values.length).toBeGreaterThanOrEqual(3);
    expect(values.length).toBeLessThanOrEqual(5);
    expect(values).not.toContain("韩国财阀继承人氛围");
    expect(values.every((value) => value.includes("氛围"))).toBe(true);
  });

  it("builds same-type AI options for scene capsules", () => {
    const values = buildAiPromptOptionValues({
      prompt: "场景类型定位：现代极简住宅空间，空间结构：三层空间结构",
      optionValue: "现代极简住宅空间",
      optionVariable: "sceneIdentity",
    });

    expect(values.length).toBeGreaterThanOrEqual(3);
    expect(values.length).toBeLessThanOrEqual(5);
    expect(values).not.toContain("现代极简住宅空间");
    expect(values.some((value) => /开放式客厅|酒店大堂|街头|森林/.test(value))).toBe(true);
  });

  it("builds same-type AI options for product capsules", () => {
    const values = buildAiPromptOptionValues({
      prompt: "产品材质纹理：细腻哑光材质，产品光影关系：侧前方大面积柔光",
      optionValue: "细腻哑光材质",
      optionVariable: "productMaterial",
    });

    expect(values.length).toBeGreaterThanOrEqual(3);
    expect(values.length).toBeLessThanOrEqual(5);
    expect(values).not.toContain("细腻哑光材质");
    expect(values.some((value) => /磨砂金属|玻璃透明|拉丝金属|颗粒质感/.test(value))).toBe(true);
  });

  it("keeps generated options visible even when they overlap with common options", () => {
    const values = buildGeneratedPromptOptionValues({
      prompt: "纯白背景，{{imageStyle: Pixar 卡通渲染风格的欧式古典风}}，沙发，地毯",
      optionLabel: "图像风格",
      optionValue: "Pixar 卡通渲染风格的欧式古典风",
      optionVariable: "imageStyle",
      values: ["浮世绘 Ukiyo-e 木版画风格", "毕加索立体主义 Cubism 风格"],
    });

    expect(values.length).toBeGreaterThan(0);
    expect(values).toContain("浮世绘 Ukiyo-e 木版画风格");
    expect(values).not.toContain("Pixar 卡通渲染风格的欧式古典风");
  });

  it("builds image-style AI options for cartoon rendering style capsules", () => {
    const values = buildAiPromptOptionValues({
      prompt: "纯白背景，Pixar 卡通渲染风格的欧式古典风，沙发，地毯",
      optionValue: "Pixar 卡通渲染风格的欧式古典风",
      optionVariable: "imageStyle",
    });

    expect(values).toHaveLength(5);
    expect(values).toEqual(["手稿风格", "二次元风格", "写实风格", "水彩手绘风格", "低多边形 3D 风格"]);
    expect(values.every((value) => /风格|艺术|视觉|卡通|渲染|pixar/i.test(value))).toBe(true);
  });

  it("builds AI prompt option analysis as same-variable replacement variants", () => {
    const analysis = buildAiPromptOptionAnalysis({
      prompt: "纯白背景，Pixar 卡通渲染风格的欧式古典风，沙发，地毯",
      optionLabel: "图像风格",
      optionValue: "Pixar 卡通渲染风格的欧式古典风",
      optionVariable: "imageStyle",
    });

    expect(analysis.sections).toHaveLength(1);
    expect(analysis.sections[0]?.variable).toBe("imageStyle");
    expect(analysis.sections[0]?.values).toEqual([
      "手稿风格",
      "二次元风格",
      "写实风格",
      "水彩手绘风格",
      "低多边形 3D 风格",
    ]);
  });

  it("filters prompt capsule options by the active variable", () => {
    expect(
      filterPromptOptionValues({
        variable: "shotSize",
        values: ["柔和窗边自然光影", "大特写", "16:9 横屏"],
        currentValue: "近景",
      }),
    ).toEqual(["大特写"]);

    expect(
      filterPromptOptionValues({
        variable: "aspectRatio",
        values: ["中景", "竖屏竖构图", "红色"],
        currentValue: "16:9 横屏",
      }),
    ).toEqual(["竖屏竖构图"]);
  });

  it("extracts negative prompt sections without exposing them as capsules", () => {
    const analysis = analyzePromptText("近景，柔和窗边自然光影，避免模糊，不要畸形手指");
    const values = getNegativePromptValues(analysis);
    const visibleAnalysis = omitNegativeAnalysisSections(analysis);
    const moved = moveNegativePromptValuesFromPrompt("", "低质量", values);

    expect(values).toEqual(["避免模糊", "不要畸形手指"]);
    expect(visibleAnalysis.sections.some((section) => section.key === "negative")).toBe(false);
    expect(visibleAnalysis.chips.some((chip) => chip.variable === "avoid")).toBe(false);
    expect(moved.negativePrompt).toBe("低质量，避免模糊，不要畸形手指");
  });

  it("splits labeled negative content out of optimized prompt text", () => {
    const result = splitNegativePromptFromPrompt(
      "近距离人像，柔和自然光\n反向提示词：低质量，模糊，畸形手指",
      "水印",
    );

    expect(result.prompt).toBe("近距离人像，柔和自然光");
    expect(result.prompt).not.toContain("反向提示词");
    expect(result.negativePrompt).toBe("水印，低质量，模糊，畸形手指");
  });

  it("splits inline negative fragments out of optimized prompt text", () => {
    const result = splitNegativePromptFromPrompt(
      "近距离人像，柔和自然光，不要畸形手指，避免低清晰度",
      "",
    );

    expect(result.prompt).toBe("近距离人像，柔和自然光");
    expect(result.negativePrompt).toBe("不要畸形手指，避免低清晰度");
  });

  it("builds grouped analysis result and applies the full template", () => {
    const prompt = "毕加索立体主义 Cubism，远景，横构图，俯视拍摄角度，对称构图，深景深全画面清晰";
    const analysis = analyzePromptText(prompt);
    const template = applyAnalysisTemplate(prompt, analysis);

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "image_style",
      "shot_size",
      "aspect_ratio",
      "camera_angle",
      "composition",
      "depth_of_field",
    ]);
    expect(analysis.primaryCategory).toBeTruthy();
    expect(template).toContain("图像风格：{{imageStyle:");
    expect(template).toContain("景深区分：{{depthOfField: 深景深全画面清晰}}");
  });
});
