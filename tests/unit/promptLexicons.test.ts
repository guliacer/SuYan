import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import type { PromptAnalysisResult } from "@/features/library/utils/promptAnalysis";
import {
  createDefaultPromptLexiconSettings,
  getPromptParameterGroup,
  getPromptParameterLexiconValueScopes,
  getPromptParameterLexiconValues,
  getPromptTagGroup,
  migratePromptParameterLexiconGroups,
  mergeLibraryPromptParametersIntoLexicon,
  mergePromptAnalysisParametersIntoLexicon,
  mergePromptParameterValuesIntoLexicon,
  mergePromptTagLabelsIntoLexicon,
  normalizePromptParameterGroupPath,
  prunePromptLexiconsForLibraryItems,
  validatePromptParameterMenuEntries,
  validatePromptParameterMenuPath,
  validatePromptParameterMenuTree,
} from "@/features/library/utils/promptLexicons";

function makeAnalysis(): PromptAnalysisResult {
  return {
    chips: [],
    sections: [
      {
        key: "light_shadow",
        label: "光影",
        variable: "lightShadow",
        values: ["柔和窗边自然光影", "霓虹反射光影"],
        chips: [],
      },
      {
        key: "pose",
        label: "动作姿态",
        variable: "pose",
        values: ["回眸转身姿态"],
        chips: [],
      },
    ],
    suggestedTags: [],
    suggestedCategories: [],
    primaryCategory: "人像写真",
    template: "",
  };
}

function makeLibraryItem(id: string, prompt: string, patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    title: patch.title ?? id,
    imageFileName: patch.imageFileName ?? `${id}.png`,
    prompt,
    negativePrompt: patch.negativePrompt ?? "",
    category: patch.category ?? "人像摄影",
    tags: patch.tags ?? [],
    createdAt: patch.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: patch.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

function getGroupLeaf(group: string): string {
  return group.split(/\s*\/\s*/u).filter(Boolean).at(-1) ?? group;
}

describe("promptLexicons", () => {
  it("adds analyzed capsule values into the parameter lexicon", () => {
    const result = mergePromptAnalysisParametersIntoLexicon(null, makeAnalysis(), ["人像"]);

    expect(result.addedCount).toBe(3);
    expect(getPromptParameterLexiconValues(result.promptLexicons, "lightShadow")).toEqual([
      "柔和窗边自然光影",
      "霓虹反射光影",
    ]);
    expect(getPromptParameterLexiconValues(result.promptLexicons, "pose")).toEqual(["回眸转身姿态"]);
  });

  it("deduplicates values so repeated analyses do not grow the lexicon", () => {
    const first = mergePromptAnalysisParametersIntoLexicon(null, makeAnalysis());
    const second = mergePromptAnalysisParametersIntoLexicon(first.promptLexicons, makeAnalysis());

    expect(second.addedCount).toBe(0);
    expect(getPromptParameterLexiconValues(second.promptLexicons, "lightShadow")).toEqual([
      "柔和窗边自然光影",
      "霓虹反射光影",
    ]);
  });

  it("groups tag labels by the leaf parameter menu without parent hierarchy", () => {
    const lightLeafGroup = getGroupLeaf(getPromptParameterGroup("light_shadow"));
    const productLeafGroup = getGroupLeaf(getPromptParameterGroup("product_lighting"));
    const settings = createDefaultPromptLexiconSettings(["light_shadow", "productLighting", "红色", "3人", "unknown tag"]);

    expect(getPromptTagGroup("light_shadow")).toBe(lightLeafGroup);
    expect(getPromptTagGroup("productLighting")).toBe(productLeafGroup);
    expect(getPromptTagGroup("红色")).toBe("颜色分类");
    expect(getPromptTagGroup("低饱和蓝色")).toBe("颜色分类");
    expect(getPromptTagGroup("color")).toBe("颜色分类");
    expect(getPromptTagGroup("3人")).toBe("数量分类");
    expect(getPromptTagGroup("多件产品")).toBe("数量分类");
    expect(getPromptTagGroup("unknown tag", "Parent / Leaf")).toBe("Leaf");
    expect(settings.tags.find((entry) => entry.label === "light_shadow")?.group).toBe(lightLeafGroup);
    expect(settings.tags.find((entry) => entry.label === "productLighting")?.group).toBe(productLeafGroup);
    expect(settings.tags.find((entry) => entry.label === "红色")?.group).toBe("颜色分类");
    expect(settings.tags.find((entry) => entry.label === "3人")?.group).toBe("数量分类");
  });

  it("adds analyzed suggested tags into the tag lexicon and deduplicates labels", () => {
    const result = mergePromptAnalysisParametersIntoLexicon(
      null,
      {
        ...makeAnalysis(),
        suggestedTags: ["light_shadow", "light_shadow", "productLighting", "红色", "双人"],
      },
      [],
    );
    const second = mergePromptTagLabelsIntoLexicon(result.promptLexicons, ["productLighting"]);
    const matchingTags = second.promptLexicons.tags.filter((entry) =>
      ["light_shadow", "productLighting", "红色", "双人"].includes(entry.label),
    );

    expect(second.addedCount).toBe(0);
    expect(matchingTags).toHaveLength(4);
    expect(matchingTags.every((entry) => !entry.parentId)).toBe(true);
    expect(matchingTags.map((entry) => entry.group)).toEqual([
      getGroupLeaf(getPromptParameterGroup("light_shadow")),
      getGroupLeaf(getPromptParameterGroup("product_lighting")),
      "颜色分类",
      "数量分类",
    ]);
  });

  it("stores manually selected capsule values for reuse across prompts", () => {
    const first = mergePromptAnalysisParametersIntoLexicon(null, makeAnalysis());
    const second = mergePromptParameterValuesIntoLexicon(first.promptLexicons, [
      {
        label: "光影",
        value: "高对比硬光阴影",
        variable: "lightShadow",
      },
    ]);

    expect(second.addedCount).toBe(1);
    expect(getPromptParameterLexiconValues(second.promptLexicons, "lightShadow")).toContain("高对比硬光阴影");
  });

  it("regroups known parameter variables into their canonical menu group", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        group: "镜头与画面",
        label: "动作姿态",
        value: "回眸转身姿态",
        variable: "pose",
      },
    ]);

    const poseEntry = result.promptLexicons.parameters.find(
      (entry) => entry.variable === "pose" && entry.value === "回眸转身姿态",
    );
    expect(poseEntry?.group).toBe("动作姿态");
  });

  it("uses functional parameter menus without numbered domain prefixes", () => {
    const settings = createDefaultPromptLexiconSettings([]);
    const groups = settings.parameters.map((entry) => entry.group);

    expect(getPromptParameterGroup("portrait_photography")).toBe("摄影参数");
    expect(getPromptParameterGroup("scene_photography")).toBe("摄影参数");
    expect(getPromptParameterGroup("product_photography")).toBe("摄影参数");
    expect(getPromptParameterGroup("costume_photography_presentation")).toBe("摄影参数");
    expect(getPromptParameterGroup("clothing_material")).toBe("材质纹理");
    expect(getPromptParameterGroup("prop_material_texture")).toBe("材质纹理");
    expect(getPromptParameterGroup("product_material")).toBe("材质纹理");
    expect(validatePromptParameterMenuTree(groups).isValid).toBe(true);
  });

  it("migrates legacy numbered parameter menus into functional menus", () => {
    expect(normalizePromptParameterGroupPath("人物像素级拆解 / 11 摄影参数")).toBe("摄影参数");
    expect(normalizePromptParameterGroupPath("道具像素级拆解 / 8 材质纹理")).toBe("材质纹理");
    expect(normalizePromptParameterGroupPath("食物身份分析 / 8 烹饪方式")).toBe("食材与烹饪");

    const migrated = migratePromptParameterLexiconGroups([
      {
        id: "legacy-prop",
        group: "道具像素级拆解 / 8 材质纹理",
        label: "材质纹理",
        variable: "propMaterialTexture",
        value: "哑光陶瓷",
      },
      {
        id: "legacy-food",
        group: "食物身份分析 / 8 烹饪方式",
        label: "烹饪方式",
        variable: "foodCookingMethod",
        value: "烘烤",
      },
      {
        id: "legacy-photo",
        group: "电商产品图分析 / 13 摄影参数",
        label: "产品摄影参数",
        variable: "productPhotography",
        value: "棚拍",
      },
    ]);

    expect(migrated.map((entry) => entry.group)).toEqual(["材质纹理", "食材与烹饪", "摄影参数"]);
  });

  it("validates numbered menu names and same-level duplicates", () => {
    const numberedPath = validatePromptParameterMenuPath("道具像素级拆解 / 8 材质纹理");
    const duplicatedTree = validatePromptParameterMenuTree(["摄影参数 / 景别", "摄影参数 / 1_景别"]);
    const duplicatedItems = validatePromptParameterMenuEntries([
      {
        id: "shot-size",
        group: "摄影参数",
        label: "景别",
        variable: "shotSize",
        value: "特写",
      },
      {
        id: "custom-shot-size",
        group: "摄影参数",
        label: "景别",
        variable: "customShotSize",
        value: "近景",
      },
    ]);

    expect(numberedPath.isValid).toBe(false);
    expect(numberedPath.issues[0]?.code).toBe("numeric-prefix");
    expect(duplicatedTree.issues.map((issue) => issue.code)).toEqual(["numeric-prefix", "duplicate-name"]);
    expect(duplicatedItems.isValid).toBe(false);
    expect(duplicatedItems.issues[0]?.code).toBe("duplicate-name");
  });

  it("groups pixel-level portrait variables into the twelve-layer hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "人物主体定位",
        value: "中心偏右位置",
        variable: "subjectPosition",
      },
      {
        label: "脸型轮廓",
        value: "椭圆脸",
        variable: "faceShape",
      },
      {
        label: "肤质纹理",
        value: "细微肌理",
        variable: "skinTexture",
      },
      {
        label: "人像光影色彩",
        value: "左前方柔光",
        variable: "portraitLightingColor",
      },
    ]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "subjectPosition" && entry.value)?.group,
    ).toBe("主体与身份");
    expect(result.promptLexicons.parameters.find((entry) => entry.variable === "faceShape" && entry.value)?.group).toBe(
      "身体与面部",
    );
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "skinTexture" && entry.value)?.group,
    ).toBe("身体与面部");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "portraitLightingColor" && entry.value)
        ?.group,
    ).toBe("光影");
  });

  it("groups pixel-level scene variables into the thirteen-layer hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "场景类型定位",
        value: "现代极简住宅空间",
        variable: "sceneIdentity",
      },
      {
        label: "场景材质纹理",
        value: "自然木材纹理",
        variable: "materialTexture",
      },
      {
        label: "场景光影关系",
        value: "右侧大面积窗户自然光",
        variable: "sceneLighting",
      },
      {
        label: "场景微观细节",
        value: "轻微使用痕迹",
        variable: "sceneMicroDetails",
      },
      {
        label: "光影",
        value: "柔和窗边自然光影",
        variable: "lightShadow",
      },
    ]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "sceneIdentity" && entry.value)?.group,
    ).toBe("空间环境");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "materialTexture" && entry.value)?.group,
    ).toBe("材质纹理");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "sceneLighting" && entry.value)?.group,
    ).toBe("光影");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "sceneMicroDetails" && entry.value)?.group,
    ).toBe("环境与氛围");
    expect(result.promptLexicons.parameters.find((entry) => entry.variable === "lightShadow" && entry.value)?.group)
      .toBe("光影");
  });

  it("groups e-commerce product variables into the fifteen-layer hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "产品主体定位",
        value: "单件厨房电器产品",
        variable: "productIdentity",
      },
      {
        label: "产品材质纹理",
        value: "细腻哑光材质",
        variable: "productMaterial",
      },
      {
        label: "产品光影关系",
        value: "侧前方大面积柔光",
        variable: "productLighting",
      },
      {
        label: "商业视觉风格",
        value: "高级极简商业摄影风格",
        variable: "commercialVisualStyle",
      },
      {
        label: "产品微观细节",
        value: "真实材质纹理",
        variable: "productMicroDetails",
      },
    ]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "productIdentity" && entry.value)?.group,
    ).toBe("主体与身份");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "productMaterial" && entry.value)?.group,
    ).toBe("材质纹理");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "productLighting" && entry.value)?.group,
    ).toBe("光影");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "commercialVisualStyle" && entry.value)?.group,
    ).toBe("产品与商业");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "productMicroDetails" && entry.value)?.group,
    ).toBe("产品与商业");
  });

  it("groups food identity variables into the fourteen-layer hierarchy and tag leaves", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "具体名称识别",
        value: "手工薄底玛格丽特披萨",
        variable: "foodSpecificIdentity",
      },
      {
        label: "主体食材",
        value: "马苏里拉奶酪",
        variable: "foodMainIngredient",
      },
      {
        label: "口感视觉表现",
        value: "自然气泡烘烤纹理",
        variable: "foodTextureVisual",
      },
      {
        label: "商业定位",
        value: "高级餐饮广告视觉",
        variable: "commercialFoodIdentity",
      },
    ]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "foodSpecificIdentity" && entry.value)
        ?.group,
    ).toBe("主体与身份");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "foodMainIngredient" && entry.value)?.group,
    ).toBe("食材与烹饪");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "foodTextureVisual" && entry.value)?.group,
    ).toBe("食材与烹饪");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "commercialFoodIdentity" && entry.value)
        ?.group,
    ).toBe("产品与商业");
    expect(getPromptTagGroup("foodTextureVisual")).toBe("食材与烹饪");
    expect(getPromptTagGroup("摆盘方式")).toBe("食材与烹饪");
  });

  it("groups cuisine variables and tags by the dedicated cuisine leaf menus", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "菜系分类",
        value: "日料",
        variable: "foodCuisineStyle",
      },
      {
        label: "常用餐具风格",
        value: "手工陶器小碟",
        variable: "cuisineTablewareStyle",
      },
      {
        label: "色彩基因",
        value: "白黑木色",
        variable: "cuisineColorGene",
      },
      {
        label: "摄影表现风格",
        value: "柔和侧光低饱和色调",
        variable: "cuisinePhotographyStyle",
      },
    ]);
    const settings = createDefaultPromptLexiconSettings(["色彩基因", "cuisineTablewareStyle", "红色"]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "foodCuisineStyle" && entry.value)?.group,
    ).toBe("食材与烹饪");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "cuisineTablewareStyle" && entry.value)
        ?.group,
    ).toBe("食材与烹饪");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "cuisineColorGene" && entry.value)?.group,
    ).toBe("色彩");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "cuisinePhotographyStyle" && entry.value)
        ?.group,
    ).toBe("摄影参数");
    expect(getPromptTagGroup("cuisineTablewareStyle")).toBe("食材与烹饪");
    expect(getPromptTagGroup("色彩基因")).toBe("色彩");
    expect(getPromptTagGroup("日料")).toBe("食材与烹饪");
    expect(getPromptTagGroup("红色")).toBe("颜色分类");
    expect(settings.tags.find((entry) => entry.label === "色彩基因")?.group).toBe("色彩");
    expect(settings.tags.find((entry) => entry.label === "cuisineTablewareStyle")?.group).toBe("食材与烹饪");
    expect(settings.tags.find((entry) => entry.label === "红色")?.group).toBe("颜色分类");
  });

  it("groups visual style analysis variables and default tags into the style hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "风格类别",
        value: "极简主义",
        variable: "styleClassification",
      },
      {
        label: "视觉流派",
        value: "北欧风",
        variable: "styleVisualMovement",
      },
      {
        label: "色彩语言",
        value: "莫兰迪色",
        variable: "styleColorLanguage",
      },
      {
        label: "风格商业定位",
        value: "中高端生活方式品牌",
        variable: "styleCommercialPositioning",
      },
    ]);
    const settings = createDefaultPromptLexiconSettings([]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "styleClassification" && entry.value)?.group,
    ).toBe("风格与审美");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "styleVisualMovement" && entry.value)?.group,
    ).toBe("风格与审美");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "styleColorLanguage" && entry.value)?.group,
    ).toBe("色彩");
    expect(
      result.promptLexicons.parameters.find(
        (entry) => entry.variable === "styleCommercialPositioning" && entry.value,
      )?.group,
    ).toBe("产品与商业");
    expect(getPromptTagGroup("风格类别")).toBe("风格与审美");
    expect(getPromptTagGroup("风格商业定位")).toBe("产品与商业");
    expect(settings.tags.find((entry) => entry.label === "风格类别")?.group).toBe("风格与审美");
    expect(settings.tags.find((entry) => entry.label === "风格关键词")?.group).toBe("风格与审美");
  });

  it("groups lighting analysis variables and default tags into the lighting hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "光源类型",
        value: "自然光源",
        variable: "lightingSourceType",
      },
      {
        label: "光比关系",
        value: "中低光比",
        variable: "lightingRatio",
      },
      {
        label: "反射折射",
        value: "环境倒影",
        variable: "lightingReflectionRefraction",
      },
      {
        label: "微观光学细节",
        value: "边缘光",
        variable: "lightingMicroDetails",
      },
    ]);
    const settings = createDefaultPromptLexiconSettings([]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "lightingSourceType" && entry.value)?.group,
    ).toBe("光影");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "lightingRatio" && entry.value)?.group,
    ).toBe("光影");
    expect(
      result.promptLexicons.parameters.find(
        (entry) => entry.variable === "lightingReflectionRefraction" && entry.value,
      )?.group,
    ).toBe("光影");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "lightingMicroDetails" && entry.value)?.group,
    ).toBe("光影");
    expect(getPromptTagGroup("光源类型")).toBe("光影");
    expect(getPromptTagGroup("微观光学细节")).toBe("光影");
    expect(settings.tags.find((entry) => entry.label === "光源类型")?.group).toBe("光影");
    expect(settings.tags.find((entry) => entry.label === "摄影灯光方案")?.group).toBe("光影");
  });

  it("groups prop analysis variables and default tags into the prop hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "道具识别",
        value: "陶瓷杯",
        variable: "propIdentification",
      },
      {
        label: "摆放方式",
        value: "自然生活化摆放",
        variable: "propArrangement",
      },
      {
        label: "光影表现",
        value: "侧向柔光",
        variable: "propLightingInteraction",
      },
      {
        label: "微观细节",
        value: "纸张纤维",
        variable: "propMicroDetails",
      },
    ]);
    const settings = createDefaultPromptLexiconSettings([]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "propIdentification" && entry.value)?.group,
    ).toBe("道具与物体");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "propArrangement" && entry.value)?.group,
    ).toBe("道具与物体");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "propLightingInteraction" && entry.value)
        ?.group,
    ).toBe("光影");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "propMicroDetails" && entry.value)?.group,
    ).toBe("道具与物体");
    expect(getPromptTagGroup("道具识别")).toBe("道具与物体");
    expect(getPromptTagGroup("主体关联关系")).toBe("道具与物体");
    expect(settings.tags.find((entry) => entry.label === "道具识别")?.group).toBe("道具与物体");
    expect(settings.tags.find((entry) => entry.label === "微观细节")?.group).toBe("道具与物体");
  });

  it("groups historical costume variables and default tags into the costume hierarchy", () => {
    const result = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "历史朝代",
        value: "唐代",
        variable: "costumeDynasty",
      },
      {
        label: "裁剪方式",
        value: "东方平面裁剪体系",
        variable: "costumeCuttingMethod",
      },
      {
        label: "民族纹样符号",
        value: "龙凤祥云",
        variable: "costumeSymbolicPattern",
      },
      {
        label: "服饰微观细节",
        value: "纤维",
        variable: "costumeMicroDetails",
      },
    ]);
    const settings = createDefaultPromptLexiconSettings([]);

    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "costumeDynasty" && entry.value)?.group,
    ).toBe("主体与身份");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "costumeCuttingMethod" && entry.value)
        ?.group,
    ).toBe("服装结构");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "costumeSymbolicPattern" && entry.value)
        ?.group,
    ).toBe("服装结构");
    expect(
      result.promptLexicons.parameters.find((entry) => entry.variable === "costumeMicroDetails" && entry.value)?.group,
    ).toBe("服装结构");
    expect(getPromptTagGroup("历史朝代")).toBe("主体与身份");
    expect(getPromptTagGroup("costumeCuttingMethod")).toBe("服装结构");
    expect(settings.tags.find((entry) => entry.label === "服饰文化身份")?.group).toBe("主体与身份");
    expect(settings.tags.find((entry) => entry.label === "服饰微观细节")?.group).toBe("服装结构");
  });

  it("records analyzed capsule values with their source prompt", () => {
    const result = mergePromptAnalysisParametersIntoLexicon(null, makeAnalysis(), [], {
      sourcePromptId: "prompt-a",
      sourcePromptTitle: "窗边人像",
    });

    const lightShadowEntries = result.promptLexicons.parameters.filter(
      (entry) => entry.variable === "lightShadow" && entry.value,
    );

    expect(lightShadowEntries).toHaveLength(2);
    expect(lightShadowEntries.every((entry) => entry.sourcePromptId === "prompt-a")).toBe(true);
    expect(lightShadowEntries.every((entry) => entry.sourcePromptTitle === "窗边人像")).toBe(true);
  });

  it("deduplicates the same capsule value across different prompt sources", () => {
    const first = mergePromptParameterValuesIntoLexicon(
      null,
      [
        {
          label: "光影",
          value: "柔和窗边自然光影",
          variable: "lightShadow",
        },
      ],
      [],
      { sourcePromptId: "prompt-a", sourcePromptTitle: "窗边人像" },
    );
    const second = mergePromptParameterValuesIntoLexicon(
      first.promptLexicons,
      [
        {
          label: "光影",
          value: "柔和窗边自然光影",
          variable: "lightShadow",
        },
      ],
      [],
      { sourcePromptId: "prompt-b", sourcePromptTitle: "夜景人像" },
    );

    expect(second.addedCount).toBe(0);
    const matchingEntries = second.promptLexicons.parameters.filter(
      (entry) => entry.variable === "lightShadow" && entry.value === "柔和窗边自然光影",
    );
    expect(matchingEntries).toHaveLength(1);
    expect(matchingEntries[0]?.sourcePromptId).toBeNull();
    expect(matchingEntries[0]?.sourcePromptTitle).toBeNull();
    expect(getPromptParameterLexiconValues(second.promptLexicons, "lightShadow")).toEqual(["柔和窗边自然光影"]);
  });

  it("deduplicates parameter values that use legacy variable aliases", () => {
    const first = mergePromptParameterValuesIntoLexicon(null, [
      {
        label: "Light",
        value: "soft window light",
        variable: "light_shadow",
      },
    ]);
    const second = mergePromptParameterValuesIntoLexicon(first.promptLexicons, [
      {
        label: "Light",
        value: "soft window light",
        variable: "lightShadow",
      },
    ]);

    const matchingEntries = second.promptLexicons.parameters.filter(
      (entry) => entry.label === "Light" && entry.value === "soft window light",
    );

    expect(second.addedCount).toBe(0);
    expect(matchingEntries).toHaveLength(1);
    expect(matchingEntries[0]?.variable).toBe("lightShadow");
    expect(getPromptParameterLexiconValues(second.promptLexicons, "lightShadow")).toEqual(["soft window light"]);
    expect(getPromptParameterLexiconValues(second.promptLexicons, "light_shadow")).toEqual(["soft window light"]);
  });

  it("groups parameter lexicon values by current and other prompt sources", () => {
    const first = mergePromptParameterValuesIntoLexicon(
      null,
      [
        {
          label: "光影",
          value: "柔和窗边自然光影",
          variable: "lightShadow",
        },
      ],
      [],
      { sourcePromptId: "prompt-a", sourcePromptTitle: "窗边人像" },
    );
    const second = mergePromptParameterValuesIntoLexicon(
      first.promptLexicons,
      [
        {
          label: "光影",
          value: "霓虹反射光影",
          variable: "lightShadow",
        },
      ],
      [],
      { sourcePromptId: "prompt-b", sourcePromptTitle: "夜景人像" },
    );
    const third = mergePromptParameterValuesIntoLexicon(second.promptLexicons, [
      {
        label: "光影",
        value: "高对比硬光阴影",
        variable: "lightShadow",
      },
    ]);

    expect(getPromptParameterLexiconValueScopes(third.promptLexicons, "lightShadow", "prompt-a")).toEqual({
      all: ["柔和窗边自然光影", "高对比硬光阴影", "霓虹反射光影"],
      currentPrompt: ["柔和窗边自然光影"],
      global: ["高对比硬光阴影"],
      otherPrompts: ["霓虹反射光影"],
    });
  });

  it("backfills saved capsule values from all prompts into scoped lexicon entries", () => {
    const result = mergeLibraryPromptParametersIntoLexicon(null, [
      makeLibraryItem("prompt-a", "镜头：{{cameraAngle: 平视拍摄角度}}", { title: "平视人像" }),
      makeLibraryItem("prompt-b", "镜头：{{cameraAngle: 俯视拍摄角度}}", { title: "俯视人像" }),
    ]);

    expect(result.addedCount).toBe(4);
    expect(result.indexedPromptCount).toBe(2);
    expect(result.promptLexicons.tags.find((entry) => entry.label === "平视拍摄角度")?.group).toBe(
      getGroupLeaf(getPromptParameterGroup("camera_angle")),
    );
    expect(getPromptParameterLexiconValueScopes(result.promptLexicons, "cameraAngle", "prompt-a")).toEqual({
      all: ["平视拍摄角度", "俯视拍摄角度"],
      currentPrompt: ["平视拍摄角度"],
      global: [],
      otherPrompts: ["俯视拍摄角度"],
    });
  });

  it("does not backfill unrelated raw prompt context as parameter values", () => {
    const result = mergeLibraryPromptParametersIntoLexicon(null, [
      makeLibraryItem("prompt-a", "一个少女坐在窗边，镜头：{{cameraAngle: 平视拍摄角度}}"),
    ]);

    expect(getPromptParameterLexiconValues(result.promptLexicons, "cameraAngle")).toEqual(["平视拍摄角度"]);
    expect(getPromptParameterLexiconValues(result.promptLexicons, "identityAttribute")).toEqual([]);
  });

  it("prunes derived parameters, categories, and tags that no remaining prompt references", () => {
    const remainingItem = makeLibraryItem("prompt-b", "镜头：{{cameraAngle: 俯视拍摄角度}}", {
      tags: ["保留标签"],
    });
    const merged = mergeLibraryPromptParametersIntoLexicon(null, [
      makeLibraryItem("prompt-a", "镜头：{{cameraAngle: 平视拍摄角度}}", {
        tags: ["独有标签"],
      }),
      remainingItem,
    ]);
    const withDerivedCategory = {
      ...merged.promptLexicons,
      categories: [
        ...merged.promptLexicons.categories,
        {
          id: "derived-category-ai-custom",
          group: "AI 分类",
          label: "AI 临时分类",
          description: "",
          parentId: null,
          imageFileName: null,
        },
      ],
    };

    const result = prunePromptLexiconsForLibraryItems(withDerivedCategory, [remainingItem]);

    expect(result.removedParameterCount).toBe(1);
    expect(result.removedCategoryCount).toBe(1);
    expect(result.removedTagCount).toBe(2);
    expect(getPromptParameterLexiconValues(result.promptLexicons, "cameraAngle")).toEqual(["俯视拍摄角度"]);
    expect(result.promptLexicons?.parameters.some((entry) => entry.variable === "cameraAngle" && !entry.value)).toBe(
      true,
    );
    expect(result.promptLexicons?.categories.some((entry) => entry.label === "人像写真")).toBe(true);
    expect(result.promptLexicons?.categories.some((entry) => entry.label === "AI 临时分类")).toBe(false);
    expect(result.promptLexicons?.tags.some((entry) => entry.label === "独有标签")).toBe(false);
    expect(result.promptLexicons?.tags.some((entry) => entry.label === "平视拍摄角度")).toBe(false);
    expect(result.promptLexicons?.tags.some((entry) => entry.label === "保留标签")).toBe(true);
    expect(result.promptLexicons?.tags.some((entry) => entry.label === "俯视拍摄角度")).toBe(true);
  });

  it("prunes generated shared parameter values after their last prompt is deleted", () => {
    const merged = mergeLibraryPromptParametersIntoLexicon(null, [
      makeLibraryItem("prompt-a", "光影：{{lightShadow: 柔和窗边自然光影}}"),
      makeLibraryItem("prompt-b", "光影：{{lightShadow: 柔和窗边自然光影}}"),
    ]);
    const sharedEntry = merged.promptLexicons.parameters.find(
      (entry) => entry.variable === "lightShadow" && entry.value === "柔和窗边自然光影",
    );

    expect(sharedEntry?.sourcePromptId).toBeNull();

    const result = prunePromptLexiconsForLibraryItems(merged.promptLexicons, []);

    expect(result.removedParameterCount).toBe(1);
    expect(getPromptParameterLexiconValues(result.promptLexicons, "lightShadow")).toEqual([]);
  });

  it("keeps manually maintained parameter values while pruning prompt-scoped values", () => {
    const merged = mergeLibraryPromptParametersIntoLexicon(null, [
      makeLibraryItem("prompt-a", "光影：{{lightShadow: 柔和窗边自然光影}}"),
    ]);
    const withManualValue = {
      ...merged.promptLexicons,
      parameters: [
        ...merged.promptLexicons.parameters,
        {
          id: "parameter-manual-light-shadow",
          group: "光影",
          label: "光影",
          sourcePromptId: null,
          sourcePromptTitle: null,
          variable: "lightShadow",
          value: "手工常用光影",
        },
      ],
    };

    const result = prunePromptLexiconsForLibraryItems(withManualValue, []);

    expect(getPromptParameterLexiconValues(result.promptLexicons, "lightShadow")).toEqual(["手工常用光影"]);
  });
});
