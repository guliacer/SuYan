import { describe, expect, it } from "vitest";
import {
  buildRemoteNetworkFailureMessage,
  buildRemoteRequestFailureMessage,
  normalizeOpenAiCompatibleEndpoint,
  normalizeOpenAiCompatibleModelsEndpoint,
  parseOpenAiCompatibleModels,
  parseRemoteOptimizedPromptContent,
  parseRemoteReversedImagePromptContent,
  parseRemotePromptAnalysisContent,
  resolveVisionImagePayloadPolicy,
} from "../../electron/main/ai/remoteAiClient";

describe("remoteAiClient", () => {
  it("normalizes OpenAI-compatible chat completion endpoints", () => {
    expect(normalizeOpenAiCompatibleEndpoint("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(normalizeOpenAiCompatibleEndpoint("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("normalizes OpenAI-compatible model list endpoints", () => {
    expect(normalizeOpenAiCompatibleModelsEndpoint("https://api.openai.com/v1")).toBe(
      "https://api.openai.com/v1/models",
    );
    expect(normalizeOpenAiCompatibleModelsEndpoint("https://api.example.com/v1/chat/completions")).toBe(
      "https://api.example.com/v1/models",
    );
  });

  it("parses OpenAI-compatible model lists with guessed capabilities", () => {
    expect(
      parseOpenAiCompatibleModels({
        data: [{ id: "DeepSeek-V4-Flash" }, { id: "Qwen/Qwen3.6-35B-A3B-FP8" }, { id: "gpt-4o-mini" }],
      }),
    ).toEqual([
      { id: "DeepSeek-V4-Flash", label: "DeepSeek-V4-Flash", capabilities: ["text"] },
      { id: "Qwen/Qwen3.6-35B-A3B-FP8", label: "Qwen/Qwen3.6-35B-A3B-FP8", capabilities: ["text"] },
      { id: "gpt-4o-mini", label: "gpt-4o-mini", capabilities: ["text", "vision"] },
    ]);
  });

  it("keeps small vision images inline and downgrades larger ones to thumbnails", () => {
    expect(resolveVisionImagePayloadPolicy(512 * 1024)).toMatchObject({
      useOriginal: true,
      useThumbnail: false,
      thumbnailMaxSize: 960,
      thumbnailQuality: 72,
    });
    expect(resolveVisionImagePayloadPolicy(3 * 1024 * 1024)).toMatchObject({
      useOriginal: false,
      useThumbnail: true,
      thumbnailMaxSize: 960,
      thumbnailQuality: 72,
    });
  });

  it("always uses the compact thumbnail policy for safety grading images", () => {
    expect(resolveVisionImagePayloadPolicy(512 * 1024, { compact: true, purpose: "safety" })).toMatchObject({
      useOriginal: false,
      useThumbnail: true,
      thumbnailMaxSize: 640,
      thumbnailQuality: 65,
    });
  });

  it("uses lighter thumbnails for category and tags vision analysis", () => {
    expect(resolveVisionImagePayloadPolicy(512 * 1024, { purpose: "category" })).toMatchObject({
      useOriginal: false,
      useThumbnail: true,
      thumbnailMaxSize: 768,
      thumbnailQuality: 70,
    });
    expect(resolveVisionImagePayloadPolicy(512 * 1024, { purpose: "tags" })).toMatchObject({
      useOriginal: false,
      useThumbnail: true,
      thumbnailMaxSize: 768,
      thumbnailQuality: 70,
    });
  });

  it("rejects invalid endpoint protocols", () => {
    expect(() => normalizeOpenAiCompatibleEndpoint("ftp://api.example.com/v1")).toThrow(
      "AI 接口地址必须以 http 或 https 开头。",
    );
  });

  it("includes provider JSON error details in API test failures", () => {
    expect(
      buildRemoteRequestFailureMessage(401, JSON.stringify({ error: { message: "invalid api key sk-secret123456" } })),
    ).toBe("远程 AI 请求失败，状态码 401。原因：invalid api key sk-****");
  });

  it("includes compact plain text error details in API test failures", () => {
    expect(buildRemoteRequestFailureMessage(502, "Bad gateway from upstream")).toBe(
      "远程 AI 请求失败，状态码 502。原因：Bad gateway from upstream",
    );
  });

  it("includes network cause details in API test failures", () => {
    const error = new TypeError("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND api.example.com"),
    });

    expect(buildRemoteNetworkFailureMessage(error)).toBe(
      "远程 AI 请求失败，网络原因：getaddrinfo ENOTFOUND api.example.com",
    );
  });

  it("parses optimized prompt text without markdown fences or labels", () => {
    expect(parseRemoteOptimizedPromptContent("```text\n优化后提示词：雨天街拍女孩\n```")).toBe("雨天街拍女孩");
  });

  it("extracts only the optimized prompt when legacy optimize-and-analysis output appears", () => {
    expect(
      parseRemoteOptimizedPromptContent("【一】优化后提示词：雨天街拍女孩，电影感自然光\n\n【二】参数胶囊结构\nstyle = 电影感"),
    ).toBe("雨天街拍女孩，电影感自然光");
  });

  it("removes orphan leading punctuation from optimized prompt output", () => {
    expect(parseRemoteOptimizedPromptContent("，智能手机摄影风格，近距离人像，柔和自然光")).toBe(
      "智能手机摄影风格，近距离人像，柔和自然光",
    );
  });

  it("removes bullet wrappers while keeping prompt body punctuation", () => {
    expect(parseRemoteOptimizedPromptContent("- 竖版 9:16 构图，人物位于画面中央\n- 光影柔和，背景干净")).toBe(
      "竖版 9:16 构图，人物位于画面中央\n光影柔和，背景干净",
    );
  });

  it("parses reversed image prompt text without markdown fences or labels", () => {
    expect(parseRemoteReversedImagePromptContent("```text\n图像反推提示词：半身人像，柔和自然光 --ar 3:4\n```")).toBe(
      "半身人像，柔和自然光 --ar 3:4",
    );
  });

  it("parses fenced JSON visual analysis content defensively", () => {
    const analysis = parseRemotePromptAnalysisContent(`
\`\`\`json
{
  "title": "赛博朋克海报提示词",
  "category": "赛博朋克",
  "tags": ["图像风格", "景别", "画面比例"],
  "sections": [
    { "key": "image_style", "label": "图像风格", "variable": "imageStyle", "values": ["赛博朋克霓虹风格"] },
    { "key": "aspect_ratio", "label": "画面比例", "variable": "aspectRatio", "values": ["16:9 横屏"] }
  ],
  "template": "",
  "summary": "用于生成海报画面"
}
\`\`\`
`);

    expect(analysis.category).toBe("赛博朋克");
    expect(analysis.tags).toContain("图像风格");
    expect(analysis.sections).toHaveLength(2);
    expect(analysis.template).toContain("图像风格：{{imageStyle:");
  });

  it("accepts image category only analysis content", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "",
  "category": "产品摄影",
  "tags": [],
  "sections": [],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.category).toBe("产品摄影");
    expect(analysis.tags).toEqual([]);
    expect(analysis.sections).toEqual([]);
  });

  it("normalizes remote section values into contextual spans while parsing JSON", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "胶囊分析",
  "category": "",
  "tags": [],
  "sections": [
    { "key": "shot_size", "label": "景别", "variable": "shotSize", "values": ["不展开成完整场景全景"] },
    { "key": "pose", "label": "动作姿态", "variable": "pose", "values": ["下部通过腿部姿态形成强烈张力"] }
  ],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.sections[0]).toMatchObject({ key: "shot_size", values: ["全景"] });
    expect(analysis.sections[1]).toMatchObject({ key: "leg_pose", values: ["腿部姿态形成强烈张力"] });
    expect(analysis.template).toContain("景别：{{shotSize: 全景}}");
    expect(analysis.template).toContain("腿部体态：{{legPose: 腿部姿态形成强烈张力}}");
  });

  it("reassigns broad remote hair values while parsing JSON", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "胶囊分析",
  "category": "",
  "tags": [],
  "sections": [
    { "key": "hair_accessory", "label": "发型头饰", "variable": "hairAccessory", "values": ["一位美丽少女", "珍珠头饰", "冷棕长发大波浪"] }
  ],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.sections.find((section) => section.key === "identity_attribute")?.values).toEqual([
      "一位美丽少女",
    ]);
    expect(analysis.sections.find((section) => section.key === "head_accessory")?.values).toEqual(["珍珠头饰"]);
    expect(analysis.sections.find((section) => section.key === "hair_color")?.values).toEqual([
      "冷棕长发大波浪",
    ]);
    expect(analysis.sections.find((section) => section.key === "hair_length")?.values).toEqual([
      "冷棕长发大波浪",
    ]);
    expect(analysis.sections.find((section) => section.key === "hair_style")?.values).toEqual([
      "冷棕长发大波浪",
    ]);
    expect(analysis.sections.find((section) => section.key === "hair_accessory")).toBeUndefined();
  });

  it("keeps contextual remote values across all capsule positions", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "胶囊分析",
  "category": "",
  "tags": [],
  "sections": [
    { "key": "composition", "label": "构图逻辑", "variable": "composition", "values": ["画面通过三分法构图形成视觉稳定"] },
    { "key": "skin_base", "label": "皮肤基底", "variable": "skinBase", "values": ["皮肤呈现冷白皮"] },
    { "key": "clothing_material", "label": "服装材质", "variable": "clothingMaterial", "values": ["身穿真丝材质礼服"] },
    { "key": "location_scene", "label": "场地大类", "variable": "locationScene", "values": ["人物位于顶层公寓的室内空间"] },
    { "key": "main_light_type", "label": "主光类型", "variable": "mainLightType", "values": ["光线采用伦勃朗硬光照亮面部"] },
    { "key": "mood_tone", "label": "情绪基调", "variable": "moodTone", "values": ["整体营造清冷疏离情绪基调"] },
    { "key": "text_content", "label": "文本内容", "variable": "textContent", "values": ["画面包含英文短标语"] }
  ],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.sections.find((section) => section.key === "composition")?.values).toEqual([
      "画面通过三分法构图形成视觉稳定",
    ]);
    expect(analysis.sections.find((section) => section.key === "skin_base")?.values).toEqual(["皮肤呈现冷白皮"]);
    expect(analysis.sections.find((section) => section.key === "clothing_material")?.values).toEqual([
      "身穿真丝材质礼服",
    ]);
    expect(analysis.sections.find((section) => section.key === "scene_identity")?.values).toEqual([
      "位于顶层公寓的室内空间",
    ]);
    expect(analysis.sections.find((section) => section.key === "main_light_type")?.values).toEqual([
      "光线采用伦勃朗硬光照亮面部",
    ]);
    expect(analysis.sections.find((section) => section.key === "mood_tone")?.values).toEqual([
      "整体营造清冷疏离情绪基调",
    ]);
    expect(analysis.sections.find((section) => section.key === "text_content")?.values).toEqual([
      "画面包含英文短标语",
    ]);
    expect(analysis.template).toContain("形成视觉稳定");
    expect(analysis.template).toContain("整体营造");
  });

  it("parses extended portrait A-G section keys from remote JSON", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "人像胶囊分析",
  "category": "",
  "tags": [],
  "sections": [
    { "key": "lens_equipment", "label": "镜头器材", "variable": "lensEquipment", "values": ["镜头器材：85mm定焦"] },
    { "key": "clothing_material", "label": "服装材质", "variable": "clothingMaterial", "values": ["服装材质：真丝材质"] },
    { "key": "mood_tone", "label": "情绪基调", "variable": "moodTone", "values": ["情绪基调：清冷疏离"] }
  ],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "lens_equipment",
      "clothing_material",
      "mood_tone",
    ]);
    expect(analysis.sections[0]?.values).toEqual(["85mm定焦"]);
    expect(analysis.template).toContain("服装材质：{{clothingMaterial: 真丝材质}}");
    expect(analysis.template).toContain("情绪基调：{{moodTone: 清冷疏离}}");
  });

  it("parses food identity section keys from remote JSON", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "美食胶囊分析",
  "category": "",
  "tags": [],
  "sections": [
    { "key": "food_specific_identity", "label": "具体名称识别", "variable": "foodSpecificIdentity", "values": ["具体名称识别：手工薄底玛格丽特披萨"] },
    { "key": "food_main_ingredient", "label": "主体食材", "variable": "foodMainIngredient", "values": ["主体食材：马苏里拉奶酪"] },
    { "key": "food_cooking_method", "label": "烹饪方式", "variable": "foodCookingMethod", "values": ["烹饪方式：高温烘焙"] },
    { "key": "food_plating", "label": "摆盘方式", "variable": "foodPlating", "values": ["摆盘方式：圆形木质托盘"] }
  ],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "food_specific_identity",
      "food_main_ingredient",
      "food_cooking_method",
      "food_plating",
    ]);
    expect(analysis.sections.find((section) => section.key === "foodSpecificIdentity")).toBeUndefined();
    expect(analysis.sections[0]?.values).toEqual(["手工薄底玛格丽特披萨"]);
    expect(analysis.template).toContain("具体名称识别：{{foodSpecificIdentity: 手工薄底玛格丽特披萨}}");
    expect(analysis.template).toContain("摆盘方式：{{foodPlating: 圆形木质托盘}}");
  });

  it("parses cuisine section keys from remote JSON", () => {
    const analysis = parseRemotePromptAnalysisContent(`
{
  "title": "菜系胶囊分析",
  "category": "",
  "tags": [],
  "sections": [
    { "key": "food_cuisine_style", "label": "菜系分类", "variable": "foodCuisineStyle", "values": ["菜系分类：日料"] },
    { "key": "cuisine_cultural_origin", "label": "地域文化来源", "variable": "cuisineCulturalOrigin", "values": ["地域文化来源：季节感"] },
    { "key": "cuisine_ingredient_system", "label": "典型食材体系", "variable": "cuisineIngredientSystem", "values": ["典型食材体系：新鲜鱼类米饭海藻"] },
    { "key": "cuisine_flavor_visual", "label": "味型视觉表达", "variable": "cuisineFlavorVisual", "values": ["味型视觉表达：酱汁光泽"] },
    { "key": "cuisine_plating_habit", "label": "传统摆盘习惯", "variable": "cuisinePlatingHabit", "values": ["传统摆盘习惯：极简留白摆盘"] },
    { "key": "cuisine_tableware_style", "label": "常用餐具风格", "variable": "cuisineTablewareStyle", "values": ["常用餐具风格：手工陶器小碟"] },
    { "key": "cuisine_color_gene", "label": "色彩基因", "variable": "cuisineColorGene", "values": ["色彩基因：白黑木色"] },
    { "key": "cuisine_spatial_context", "label": "空间环境特点", "variable": "cuisineSpatialContext", "values": ["空间环境特点：安静高级氛围"] },
    { "key": "cuisine_photography_style", "label": "摄影表现风格", "variable": "cuisinePhotographyStyle", "values": ["摄影表现风格：柔和侧光低饱和色调"] }
  ],
  "template": "",
  "summary": ""
}
`);

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "food_cuisine_style",
      "cuisine_cultural_origin",
      "cuisine_ingredient_system",
      "cuisine_flavor_visual",
      "cuisine_plating_habit",
      "cuisine_tableware_style",
      "cuisine_color_gene",
      "cuisine_spatial_context",
      "cuisine_photography_style",
    ]);
    expect(analysis.sections.find((section) => section.key === "food_cuisine_style")?.values).toEqual(["日料"]);
    expect(analysis.sections.find((section) => section.key === "cuisine_tableware_style")?.values).toEqual([
      "手工陶器小碟",
    ]);
    expect(analysis.sections.find((section) => section.key === "cuisine_color_gene")?.values).toEqual(["白黑木色"]);
    expect(analysis.template).toContain("菜系分类：{{foodCuisineStyle: 日料}}");
    expect(analysis.template).toContain("色彩基因：{{cuisineColorGene: 白黑木色}}");
  });
});
