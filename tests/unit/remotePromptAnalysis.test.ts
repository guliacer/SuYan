import { describe, expect, it } from "vitest";
import { buildPromptAnalysisFromRemote } from "@/features/library/utils/remotePromptAnalysis";

describe("remotePromptAnalysis", () => {
  it("maps remote visual sections into replacement chips", () => {
    const analysis = buildPromptAnalysisFromRemote("水彩手绘风格，近景，16:9 横屏", {
      title: "水彩人像提示词",
      category: "插画设计",
      tags: ["图像风格", "景别"],
      sections: [
        {
          key: "image_style",
          label: "图像风格",
          variable: "imageStyle",
          values: ["水彩手绘风格"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.primaryCategory).toBe("插画设计");
    expect(analysis.suggestedTags).toContain("水彩手绘风格");
    expect(analysis.suggestedTags).not.toContain("图像风格");
    expect(analysis.sections[0]?.chips[0]?.templateText).toBe("{{imageStyle: 水彩手绘风格}}");
    expect(analysis.template).toContain("图像风格：{{imageStyle:");
  });

  it("normalizes broad remote capsule values into contextual replaceable parameters", () => {
    const analysis = buildPromptAnalysisFromRemote("不要展开成完整场景全景，下部通过腿部姿态形成强烈张力", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "shot_size",
          label: "景别",
          variable: "shotSize",
          values: ["不要展开成完整场景全景"],
        },
        {
          key: "pose",
          label: "动作姿态",
          variable: "pose",
          values: ["下部通过腿部姿态形成强烈张力"],
        },
      ],
      template: "景别：{{shotSize: 不要展开成完整场景全景}}\n动作姿态：{{pose: 下部通过腿部姿态形成强烈张力}}",
      summary: "",
    });

    expect(analysis.sections.find((section) => section.key === "shot_size")?.values).toEqual(["全景"]);
    expect(analysis.sections.find((section) => section.key === "leg_pose")?.values).toEqual([
      "腿部姿态形成强烈张力",
    ]);
    expect(analysis.template).toContain("景别：{{shotSize: 全景}}");
    expect(analysis.template).toContain("腿部体态：{{legPose: 腿部姿态形成强烈张力}}");
    expect(analysis.template).not.toContain("完整场景全景");
  });

  it("corrects remote capsule types when values clearly belong to identity", () => {
    const analysis = buildPromptAnalysisFromRemote("一位美丽少女，刺绣细节", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "hair_accessory",
          label: "发型头饰",
          variable: "hairAccessory",
          values: ["一位美丽少女"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.sections.map((section) => section.key)).toEqual(["identity_attribute"]);
    expect(analysis.sections[0]).toMatchObject({
      label: "基础身份属性",
      variable: "identityAttribute",
      values: ["一位美丽少女"],
    });
    expect(analysis.chips[0]?.templateText).toBe("{{identityAttribute: 一位美丽少女}}");
    expect(analysis.template).toContain("基础身份属性：{{identityAttribute: 一位美丽少女}}");
    expect(analysis.template).not.toContain("hairAccessory");
  });

  it("expands broad remote hair capsules into precise local people and hair parameters", () => {
    const analysis = buildPromptAnalysisFromRemote("一位美丽少女，珍珠头饰，冷棕长发大波浪", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "hair_accessory",
          label: "发型头饰",
          variable: "hairAccessory",
          values: ["一位美丽少女", "珍珠头饰", "冷棕长发大波浪"],
        },
      ],
      template: "",
      summary: "",
    });

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
    expect(analysis.template).not.toContain("hairAccessory");
  });

  it("drops remote capsules that are only generation tool or SEO metadata", () => {
    const analysis = buildPromptAnalysisFromRemote("使用 GPT Image 2 生成一张，适合 Nano Banana prompts gallery SEO", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "identity_attribute",
          label: "基础身份属性",
          variable: "identityAttribute",
          values: ["使用 GPT Image 2 生成一张", "适合 Nano Banana prompts gallery SEO"],
        },
      ],
      template: "",
      summary: "",
    }, "prompt");

    expect(analysis.sections).toEqual([]);
    expect(analysis.chips).toEqual([]);
    expect(analysis.template).toBe("");
  });

  it("keeps subject values after stripping remote generation prefixes", () => {
    const analysis = buildPromptAnalysisFromRemote("用 GPT Image 2 生成一张少女，写实风格", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "identity_attribute",
          label: "基础身份属性",
          variable: "identityAttribute",
          values: ["用 GPT Image 2 生成一张少女"],
        },
      ],
      template: "",
      summary: "",
    }, "prompt");

    expect(analysis.sections.find((section) => section.key === "identity_attribute")?.values).toEqual(["少女"]);
    expect(analysis.template).toContain("基础身份属性：{{identityAttribute: 少女}}");
    expect(analysis.template).not.toContain("GPT Image 2");
  });

  it("keeps AI prompt analysis focused on replaceable core poster parameters", () => {
    const prompt =
      "请以我上传的水果照片作为参考图，foodPhysicalForm：保留水梨的种类、外形轮廓、颜色特征、果皮纹理和主体角度，不要把水梨换成其他品种。将这张普通水果照片重新设计成一张 3:4 竖版「冰爽水雾水果广告海报」。画面目标：让水梨看起来像刚从冰箱或冰水里拿出来，表面带有强烈的冰爽感、清凉感和夏日广告感。画面要求：水梨作为画面主体，前景加入一层透明玻璃或亚克力板，玻璃表面布满细密水珠、凝结水雾、流动水痕。背景干净，使用白色、浅灰色、冷绿色或冰蓝色。文字排版：画面上方或左下角保留标题空间。";
    const analysis = buildPromptAnalysisFromRemote(
      prompt,
      {
        title: "",
        category: "",
        tags: [],
        sections: [
          {
            key: "food_physical_form",
            label: "外形轮廓",
            variable: "foodPhysicalForm",
            values: [
              "保留水梨的种类、外形轮廓、颜色特征、果皮纹理和主体角度",
              "水梨作为画面主体",
              "不要把水梨换成其他品种",
            ],
          },
          {
            key: "image_style",
            label: "图像风格",
            variable: "imageStyle",
            values: ["冰爽水雾水果广告海报", "让水梨看起来像刚从冰箱或冰水里拿出来"],
          },
          {
            key: "aspect_ratio",
            label: "画面比例",
            variable: "aspectRatio",
            values: ["3:4 竖版"],
          },
          {
            key: "foreground_occlusion",
            label: "前景遮挡",
            variable: "foregroundOcclusion",
            values: ["透明玻璃或亚克力板", "水梨可以被水雾轻微遮挡"],
          },
          {
            key: "color_detail",
            label: "色彩细节",
            variable: "colorDetail",
            values: ["使用白色、浅灰色、冷绿色或冰蓝色"],
          },
          {
            key: "text_content",
            label: "文本内容",
            variable: "textContent",
            values: ["画面上方或左下角保留标题空间"],
          },
        ],
        template: "",
        summary: "",
      },
      "prompt",
    );

    expect(analysis.chips.length).toBeLessThanOrEqual(10);
    expect(analysis.chips.map((chip) => chip.value)).toEqual(
      expect.arrayContaining(["水梨作为画面主体", "冰爽水雾水果广告海报", "透明玻璃或亚克力板", "3:4"]),
    );
    expect(analysis.chips.some((chip) => /不要|保留|重新设计|让水梨|可以被|使用白色/.test(chip.value))).toBe(
      false,
    );
    expect(analysis.template).not.toContain("不要把水梨换成其他品种");
  });

  it("strips remote capsule labels while keeping subject verbs in contextual values", () => {
    const analysis = buildPromptAnalysisFromRemote("面部妆容：她画着清冷优雅的财阀千金妆容，服装：豪华居家服", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "face_makeup",
          label: "面部妆容",
          variable: "faceMakeup",
          values: ["她画着清冷优雅的财阀千金妆容"],
        },
        {
          key: "clothing",
          label: "服装细节",
          variable: "clothing",
          values: ["服装：豪华居家服"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.sections.find((section) => section.key === "face_makeup")?.values).toEqual([
      "她画着清冷优雅的财阀千金妆容",
    ]);
    expect(analysis.sections.find((section) => section.key === "clothing_style")?.values).toEqual(["豪华居家服"]);
    expect(analysis.template).toContain("她画着清冷优雅的财阀千金妆容");
    expect(analysis.template).not.toContain("服装：");
  });

  it("narrows remote values and ignores expression constraints assigned to makeup", () => {
    const analysis = buildPromptAnalysisFromRemote("", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "photography_style",
          label: "摄影风格",
          variable: "style",
          values: ["真人摄影风格的高端肚皮舞主题时尚大片"],
        },
        {
          key: "face_makeup",
          label: "面部妆容",
          variable: "faceMakeup",
          values: ["整体表情不夸张、不媚俗"],
        },
        {
          key: "lens_equipment",
          label: "镜头器材",
          variable: "camera",
          values: ["使用 24mm–28mm 广角近拍的封面视角"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.sections.find((section) => section.key === "photography_style")).toMatchObject({
      variable: "photographyStyle",
      values: ["真人摄影风格"],
    });
    expect(analysis.sections.find((section) => section.key === "face_makeup")).toBeUndefined();
    expect(analysis.sections.find((section) => section.key === "lens_equipment")).toMatchObject({
      variable: "lensEquipment",
      values: ["24mm–28mm 广角近拍"],
    });
    expect(analysis.template).not.toContain("高端肚皮舞主题");
    expect(analysis.template).not.toContain("整体表情");
    expect(analysis.template).not.toContain("{{style:");
    expect(analysis.template).not.toContain("{{camera:");
  });

  it("accepts extended A-G portrait sections from remote analysis", () => {
    const analysis = buildPromptAnalysisFromRemote("85mm定焦，水光透亮底妆，顶层公寓，薄纱前景遮挡", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "lens_equipment",
          label: "镜头器材",
          variable: "lensEquipment",
          values: ["镜头器材：85mm定焦"],
        },
        {
          key: "base_makeup",
          label: "底妆",
          variable: "baseMakeup",
          values: ["底妆：水光透亮底妆"],
        },
        {
          key: "location_scene",
          label: "场地大类",
          variable: "locationScene",
          values: ["场地大类：顶层公寓"],
        },
        {
          key: "foreground_occlusion",
          label: "前景遮挡",
          variable: "foregroundOcclusion",
          values: ["前景遮挡：薄纱前景遮挡"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "lens_equipment",
      "base_makeup",
      "location_scene",
      "foreground_occlusion",
    ]);
    expect(analysis.chips.map((chip) => chip.templateText)).toContain("{{lensEquipment: 85mm定焦}}");
    expect(analysis.template).toContain("前景遮挡：{{foregroundOcclusion: 薄纱前景遮挡}}");
  });

  it("accepts twelve-layer portrait sections from remote analysis", () => {
    const analysis = buildPromptAnalysisFromRemote("单人女性，椭圆脸，细微肌理，左前方柔光", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "subject_position",
          label: "人物主体定位",
          variable: "subjectPosition",
          values: ["单人女性"],
        },
        {
          key: "face_shape",
          label: "脸型轮廓",
          variable: "faceShape",
          values: ["椭圆脸"],
        },
        {
          key: "skin_texture",
          label: "肤质纹理",
          variable: "skinTexture",
          values: ["细微肌理"],
        },
        {
          key: "portrait_lighting_color",
          label: "人像光影色彩",
          variable: "portraitLightingColor",
          values: ["左前方柔光"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "subject_position",
      "face_shape",
      "skin_texture",
      "portrait_lighting_color",
    ]);
    expect(analysis.template).toContain("人物主体定位：{{subjectPosition: 单人女性}}");
    expect(analysis.template).toContain("人像光影色彩：{{portraitLightingColor: 左前方柔光}}");
  });

  it("accepts thirteen-layer scene sections from remote analysis", () => {
    const analysis = buildPromptAnalysisFromRemote("现代极简住宅空间，三层空间结构，右侧大面积窗户自然光", {
      title: "",
      category: "",
      tags: [],
      sections: [
        {
          key: "scene_identity",
          label: "场景类型定位",
          variable: "sceneIdentity",
          values: ["现代极简住宅空间"],
        },
        {
          key: "spatial_structure",
          label: "空间结构",
          variable: "spatialStructure",
          values: ["三层空间结构"],
        },
        {
          key: "scene_lighting",
          label: "场景光影关系",
          variable: "sceneLighting",
          values: ["右侧大面积窗户自然光"],
        },
        {
          key: "scene_micro_details",
          label: "场景微观细节",
          variable: "sceneMicroDetails",
          values: ["轻微使用痕迹"],
        },
      ],
      template: "",
      summary: "",
    });

    expect(analysis.sections.map((section) => section.key)).toEqual([
      "scene_identity",
      "spatial_structure",
      "scene_lighting",
      "scene_micro_details",
    ]);
    expect(analysis.template).toContain("场景类型定位：{{sceneIdentity: 现代极简住宅空间}}");
    expect(analysis.template).toContain("场景光影关系：{{sceneLighting: 右侧大面积窗户自然光}}");
  });

  it("keeps image category analysis separate from tags and template sections", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "产品摄影",
        tags: ["鞋子", "海报"],
        sections: [
          {
            key: "brand",
            label: "知名品牌",
            variable: "brand",
            values: ["Nike 运动品牌感"],
          },
        ],
        template: "知名品牌：{{brand: Nike 运动品牌感}}",
        summary: "",
      },
      "image-category",
    );

    expect(analysis.suggestedCategories).toEqual(["电商产品摄影"]);
    expect(analysis.suggestedTags).toEqual([]);
    expect(analysis.sections).toEqual([]);
    expect(analysis.template).toBe("");
  });

  it("keeps all matched image categories up to ten", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "产品摄影",
        tags: [
          "广告商业摄影",
          "美食摄影",
          "服装穿搭摄影",
          "建筑地产摄影",
          "工业产品摄影",
          "珠宝奢侈品摄影",
          "活动纪实商业",
          "婚纱婚礼摄影",
          "企业形象摄影",
          "人像写真",
          "肖像摄影",
        ],
        sections: [],
        template: "",
        summary: "",
      },
      "image-category",
    );

    expect(analysis.suggestedCategories).toHaveLength(10);
    expect(analysis.suggestedCategories).toEqual([
      "电商产品摄影",
      "广告商业摄影",
      "美食摄影",
      "服装穿搭摄影",
      "建筑地产摄影",
      "工业产品摄影",
      "珠宝奢侈品摄影",
      "活动纪实商业",
      "婚纱婚礼摄影",
      "企业形象摄影",
    ]);
    expect(analysis.primaryCategory).toBe("电商产品摄影");
  });

  it("keeps image tag analysis separate from categories and prompt templates", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "产品摄影",
        tags: ["鞋子", "广告海报", "产品摄影", "图像提示词", "图像风格", "摄影风格", "景别", "识别"],
        sections: [],
        template: "",
        summary: "",
      },
      "image-tags",
    );

    expect(analysis.suggestedTags).toEqual(["鞋子", "广告海报"]);
    expect(analysis.suggestedCategories).toEqual([]);
    expect(analysis.template).toBe("");
  });

  it("keeps image tag analysis concrete instead of saving empty dimensions", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "",
        tags: [
          "柔光商业光影",
          "图像提示词",
          "图像风格",
          "摄影风格",
          "景别",
          "识别",
          "银紫色长发",
          "近景自拍",
          "中心构图",
        ],
        sections: [],
        template: "",
        summary: "",
      },
      "image-tags",
    );

    expect(analysis.suggestedTags).toEqual(["柔光商业光影", "银紫色长发", "近景自拍", "中心构图"]);
  });

  it("removes parameter sentences and model source text from image tags", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "",
        tags: [
          "GPT Image 2 prompts",
          "前景加入一层透明玻璃或亚克力板",
          "放在画面中央偏下位置",
          "背景可以有轻微虚化",
          "请以我上传的水果照片作为参考图",
          "冰爽水雾水果广告海报",
          "水梨",
          "清爽夏日氛围",
        ],
        sections: [],
        template: "",
        summary: "",
      },
      "image-tags",
    );

    expect(analysis.suggestedTags).toEqual(["冰爽水雾水果广告海报", "水梨", "清爽夏日氛围"]);
  });

  it("keeps visible source avatar tags while removing plain source metadata", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "",
        tags: [
          "WebToMind",
          "GPT Image 2 prompts",
          "WebToMind来源头像",
          "来源卡片",
          "站点标识",
          "域名标签",
          "暗调人像",
        ],
        sections: [],
        template: "",
        summary: "",
      },
      "image-tags",
    );

    expect(analysis.suggestedTags).toEqual(["WebToMind来源头像", "来源卡片", "站点标识", "域名标签", "暗调人像"]);
  });

  it("keeps all matched image tags up to fifteen", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "",
        tags: [
          "柔光",
          "长发",
          "白色上衣",
          "室内",
          "浅景深",
          "近景",
          "自然妆",
          "窗边",
          "低饱和",
          "人像",
          "胶片感",
          "侧脸",
          "回眸",
          "暖色调",
          "安静氛围",
          "多余标签",
        ],
        sections: [],
        template: "",
        summary: "",
      },
      "image-tags",
    );

    expect(analysis.suggestedTags).toHaveLength(15);
    expect(analysis.suggestedTags).not.toContain("多余标签");
  });

  it("keeps image safety analysis separate from prompt tags and templates", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "不要读取这段提示词",
      {
        title: "",
        category: "NSFW",
        tags: ["NSFW"],
        sections: [
          {
            key: "image_style",
            label: "图像风格",
            variable: "imageStyle",
            values: ["写实摄影"],
          },
        ],
        template: "图像风格：{{imageStyle: 写实摄影}}",
        summary: "成人内容",
      },
      "image-safety",
    );

    expect(analysis.primaryCategory).toBe("NSFW");
    expect(analysis.suggestedCategories).toEqual(["NSFW"]);
    expect(analysis.suggestedTags).toEqual(["NSFW"]);
    expect(analysis.sections).toEqual([]);
    expect(analysis.template).toBe("");
  });

  it("maps prompt option responses into replaceable chips", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "图像风格：{{imageStyle: 水彩手绘风格}}，光影：{{lightShadow: 柔和窗边自然光影}}",
      {
        title: "",
        category: "",
        tags: [],
        sections: [
          {
            key: "light_shadow",
            label: "光影",
            variable: "lightShadow",
            values: ["霓虹反射光影", "高对比硬光阴影"],
          },
        ],
        template: "",
        summary: "",
      },
      "prompt-options",
      {
        optionValue: "柔和窗边自然光影",
        optionVariable: "lightShadow",
      },
    );

    expect(analysis.suggestedTags).toEqual([]);
    expect(analysis.sections[0]?.variable).toBe("lightShadow");
    expect(analysis.chips[0]?.templateText).toBe("{{lightShadow: 霓虹反射光影}}");
  });

  it("filters remote prompt options that do not match the active capsule", () => {
    const analysis = buildPromptAnalysisFromRemote(
      "景别：{{shotSize: 近景}}，画面比例：{{aspectRatio: 16:9 横屏}}",
      {
        title: "",
        category: "",
        tags: [],
        sections: [
          {
            key: "aspect_ratio",
            label: "画面比例",
            variable: "aspectRatio",
            values: ["中景", "竖屏竖构图"],
          },
        ],
        template: "",
        summary: "",
      },
      "prompt-options",
      {
        optionValue: "16:9 横屏",
        optionVariable: "aspectRatio",
      },
    );

    expect(analysis.sections[0]?.values).toEqual(["竖屏竖构图"]);
  });
});
