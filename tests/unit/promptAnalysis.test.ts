import { describe, expect, it } from "vitest";
import {
  analyzePromptText,
  analyzePromptTags,
  applyCategoryToTags,
  applyAnalysisInlineChips,
  applyAnalysisTemplate,
  applyReplacementChip,
  buildAiPromptOptionAnalysis,
  buildAiPromptOptionValues,
  buildGeneratedPromptOptionValues,
  buildPromptOptionAnalysis,
  filterPromptOptionValues,
  getNegativePromptValues,
  moveNegativePromptValuesFromPrompt,
  normalizePromptAnalysisSections,
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

    // Only formal photography ontology leaves are selectable as categories.
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.length).toBeLessThanOrEqual(8);
    expect(suggestions.every((label) => label.endsWith("摄影") || label.includes("摄影"))).toBe(true);
  });

  it("routes beverage ads to beverage leaves instead of generic product or food photography", () => {
    const suggestions = suggestPromptCategories({
      title: "抹茶奶茶夏季广告",
      prompt: "抹茶奶茶，奶油顶，户外绿色场景，品牌广告画面，竖版排版",
      tags: [],
    });

    expect(suggestions).toContain("茶饮摄影");
    expect(suggestions).not.toContain("产品摄影");
    expect(suggestions).not.toContain("食品摄影");
  });

  it("prioritizes beverage-making process when the action is the visual subject", () => {
    const suggestions = suggestPromptCategories({
      title: "鸡尾酒调制",
      prompt: "调酒师将冰块与鸡尾酒摇匀并倒入杯中",
      tags: [],
    });

    expect(suggestions[0]).toBe("饮品制作过程摄影");
    expect(suggestions).toContain("酒精饮品摄影");
  });

  it("routes pre-wedding bridal images to bridal photography, not wedding-day events", () => {
    const bridal = suggestPromptCategories({
      title: "户外婚纱照",
      prompt: "新娘穿婚纱在花海中进行婚前外景拍摄，成片用于婚纱相册",
      tags: [],
    });
    expect(bridal).toContain("婚纱摄影");
    expect(bridal).not.toContain("婚礼摄影");

    const event = suggestPromptCategories({
      title: "婚礼现场纪实",
      prompt: "婚礼仪式、婚宴和接亲现场的纪实摄影",
      tags: [],
    });
    expect(event).toContain("婚礼摄影");
    expect(event).not.toContain("婚纱摄影");
  });

  it("keeps category separate from tags", () => {
    expect(applyCategoryToTags(["旧分类", "图像风格", "旧分类"], "旧分类", "新分类")).toEqual([
      "图像风格",
    ]);
  });

  it("normalizes capsule sections to the parameter schema and rejects cross-domain values", () => {
    const sections = normalizePromptAnalysisSections(
      "产品摄影，近景，16:9 横屏，柔和窗边自然光影",
      [
        {
          key: "shot_size",
          label: "分类标签",
          variable: "category",
          values: ["产品摄影", "近景"],
          chips: [],
        },
        {
          key: "aspect_ratio",
          label: "标签",
          variable: "tags",
          values: ["不存在于原文的比例"],
          chips: [],
        },
        {
          key: "light_shadow",
          label: "任意标签名",
          variable: "tagValue",
          values: ["柔和窗边自然光影"],
          chips: [],
        },
      ],
    );

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      key: "shot_size",
      label: "景别",
      variable: "shotSize",
      values: ["近景"],
    });
    expect(sections[1]).toMatchObject({
      key: "light_shadow",
      label: "光影",
      variable: "lightShadow",
    });
    expect(sections.every((section) => section.variable !== "category" && section.variable !== "tags")).toBe(true);
  });

  it("keeps tag analysis isolated from parameter capsules", () => {
    const tagResult = analyzePromptTags("近景, 柔和窗边自然光影, 香水");
    expect(tagResult.sections).toEqual([]);
    expect(tagResult.chips).toEqual([]);
    expect(tagResult.suggestedCategories).toEqual([]);
    expect(tagResult.primaryCategory).toBe("未分类");
    expect(tagResult.suggestedTags).not.toContain("近景");
    expect(tagResult.suggestedTags).not.toContain("柔和窗边自然光影");
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
        "波浪卷发",
      ]),
    ).toEqual(["银紫色长发", "波浪卷发"]);
  });

  it("strips category names from tags — so categories must never be stored in tags", () => {
    // 这是「关闭卡片后分类只剩一个」的根因守卫：
    // useLibraryStore.saveItem 对每个 tags 补丁都会跑 normalizeConcretePromptTags，
    // 分类名会被整体剥掉。次分类因此只能存 genreIds，绝不能借道 tags 传递。
    expect(
      normalizeConcretePromptTags(["肖像摄影", "少女写真", "汉服造型", "团扇", "木质栈道"]),
    ).toEqual(["团扇", "木质栈道"]);
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
      // 「海报设计」是分类叶子（平面设计域），按分类/标签边界必须从标签里剥掉，
      // 不再降级成「海报」留在标签中。见 photographyCategories.resolveLabelLayer。
    ).toEqual(["商业视觉", "冰爽水雾水果广告海报", "水梨"]);
  });

  it("rejects sentence clauses that describe a scene instead of naming a tag", () => {
    expect(
      normalizeConcretePromptTags([
        "地平线上有一位长发侠客剪影",
        "画面中出现一位女性",
        "白色抹胸长裙",
        "自然光斑",
      ]),
    ).toEqual(["白色抹胸长裙", "自然光斑"]);
  });

  it("builds replacement chips and applies one chip to prompt text", () => {
    const prompt = "水彩手绘风格，近景，柔和窗边自然光影，低饱和莫兰迪配色";
    const analysis = analyzePromptText(prompt);
    const chip = analysis.chips.find((item) => item.value === "水彩手绘风格");

    expect(chip).toBeDefined();
    expect(applyReplacementChip(prompt, chip!)).toContain("{{imageStyle: 水彩手绘风格}}");
  });

  it("keeps only the highest-value replaceable parameters (5-10 chips)", () => {
    const prompt =
      "水彩手绘风格，近景，16:9 横屏，俯视拍摄角度，主体居中构图，柔和窗边自然光影，低饱和莫兰迪配色，安静温柔氛围，自然站姿动作，丝绸礼服服装细节，鹅蛋脸轮廓，杏仁眼";
    const analysis = analyzePromptText(prompt);

    expect(analysis.chips.length).toBeGreaterThanOrEqual(5);
    expect(analysis.chips.length).toBeLessThanOrEqual(10);
    expect(analysis.sections.length).toBeLessThanOrEqual(analysis.chips.length);
    // Prefer high-value visual dimensions over long-tail facial micro details.
    expect(analysis.chips.some((chip) => chip.sectionKey === "image_style")).toBe(true);
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

  it("restores only the new parameter values from saved prompts", () => {
    const analysis = analyzePromptText(
      "旧风格：{{style: 电影感写真}}，图像风格：{imageStyle: 浮世绘 Ukiyo-e}，画面比例：{{aspectRatio: 1:1 方形构图}}",
    );

    expect(analysis.sections.map((section) => section.variable)).toEqual(["imageStyle", "styleClassification", "photographyStyle", "aspectRatio"]);
    expect(analysis.chips.every((chip) => chip.variable !== "style")).toBe(true);
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
