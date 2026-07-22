import { describe, expect, it } from "vitest";
import {
  parsePromptTemplateSegments,
  resolvePromptTemplateText,
  splitPromptToTemplate,
} from "@/features/library/utils/promptSplit";

describe("promptSplit", () => {
  it("splits visual prompts into the reset 21-dimension capsule rules", () => {
    const result = splitPromptToTemplate(
      "赛博朋克霓虹风格，16:9 横屏，中景，低机位仰视，三分法构图，浅景深背景虚化，柔和窗边自然光影，侧面受光，低饱和莫兰迪配色，英文短标语字体",
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "image_style",
      "shot_size",
      "aspect_ratio",
      "camera_angle",
      "composition",
      "depth_of_field",
      "light_shadow",
      "light_receiving",
      "color_detail",
      "typography",
    ]);
    expect(result.template).toContain("图像风格：{{imageStyle: 赛博朋克霓虹风格}}");
    expect(result.template).toContain("景别：{{shotSize: 中景}}");
    expect(result.template).toContain("画面比例：{{aspectRatio: 16:9 横屏}}");
    expect(result.suggestedTags).toEqual(
      result.sections.filter((section) => section.key !== "negative").flatMap((section) => section.values).slice(0, 15),
    );
    expect(result.suggestedTags).toContain("柔和窗边自然光影");
  });

  it("distinguishes requested image styles without falling into lighting or color", () => {
    const result = splitPromptToTemplate(
      "浮世绘 Ukiyo-e，毕加索立体主义 Cubism，弗里达超现实主义 Surrealism，列宾现实主义 Realism，2D 插画风格，写实厚涂风格，水彩手绘风格",
    );

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      key: "image_style",
      values: [
        "浮世绘 Ukiyo-e",
        "毕加索立体主义 Cubism",
        "弗里达超现实主义 Surrealism",
        "列宾现实主义 Realism",
        "2D 插画风格",
        "写实厚涂风格",
        "水彩手绘风格",
      ],
    });
  });

  it("preserves reference contextual spans without boundary symbols", () => {
    const fashion = splitPromptToTemplate(
      "身穿薄荷绿缎面防风外套与乳白色宽松慢跑裤，暖沙色柔光环境与浅琥珀色打蜡地面",
    );
    const fantasy = splitPromptToTemplate(
      "在紫禁城雪夜中，一位人形凤凰化身宫殿的灵魂。她头戴华丽繁复的金凤冠，身披流动的红橙色丝绸华服，口中叼着中式红包，手中拿着展开的春节祝福。",
    );
    const miniature = splitPromptToTemplate(
      "《 龙猫 》的经典镜头微缩场景展示，采用了 Octane Render 和 Cinema 4D 风格，3:4竖构图",
    );
    const product = splitPromptToTemplate(
      "在橙色背景上。高角度俯拍橙汁旋转形成的圆弧，使用DSLR 35mm 2.8拍摄",
    );
    const layout = splitPromptToTemplate("顶部中央，使用巨大的、圆润的 3D 字体醒目地展示主体名称");

    expect(fashion.sections.find((section) => section.key === "clothing_material")?.values).toContain(
      "身穿薄荷绿缎面防风外套与乳白色宽松慢跑裤",
    );
    expect(fashion.sections.find((section) => section.key === "light_shadow")?.values).toEqual([
      "暖沙色柔光环境与浅琥珀色打蜡地面",
    ]);
    expect(fantasy.sections.find((section) => section.key === "clothing_style")?.values).toEqual([
      "身披流动的红橙色丝绸华服",
    ]);
    expect(fantasy.sections.find((section) => section.key === "hand_prop")?.values).toEqual([
      "口中叼着中式红包，手中拿着展开的春节祝福",
    ]);
    expect(miniature.sections.find((section) => section.key === "famous_person")?.values).toEqual(["龙猫"]);
    expect(miniature.sections.find((section) => section.key === "image_style")?.values).toEqual([
      "Octane Render 和 Cinema 4D",
    ]);
    expect(miniature.template).not.toContain("《");
    expect(miniature.template).not.toContain("》");
    expect(product.sections.find((section) => section.key === "color")?.values).toEqual(["橙色背景"]);
    expect(product.sections.find((section) => section.key === "camera_angle")?.values).toEqual([
      "高角度俯拍橙汁旋转形成的圆弧",
    ]);
    expect(product.sections.find((section) => section.key === "lens_equipment")?.values).toEqual(["35mm"]);
    expect(layout.sections.find((section) => section.key === "composition")?.values).toEqual(["顶部中央"]);
  });

  it("keeps hand gestures separate from props held in hand", () => {
    const result = splitPromptToTemplate("单手托腮手势，手持透明雨伞道具");

    expect(result.sections.map((section) => section.key)).toEqual(["hand_gesture", "hand_prop"]);
    expect(result.template).toContain("手部手势：{{handGesture: 单手托腮手势}}");
    expect(result.template).toContain("手上道具：{{handProp: 手持透明雨伞道具}}");
  });

  it("keeps contextual capsule values directly replaceable", () => {
    const result = splitPromptToTemplate("不展开成完整场景全景，下部通过腿部姿态形成强烈张力");

    expect(result.sections.find((section) => section.key === "shot_size")?.values).toEqual(["全景"]);
    expect(result.sections.find((section) => section.key === "leg_pose")?.values).toEqual(["腿部姿态形成强烈张力"]);
    expect(result.template).toContain("景别：{{shotSize: 全景}}");
    expect(result.template).toContain("腿部体态：{{legPose: 腿部姿态形成强烈张力}}");
  });

  it("removes capsule labels while keeping subject context in replaceable values", () => {
    const result = splitPromptToTemplate("面部妆容：她画着清冷优雅的财阀千金妆容，服装：豪华居家服");

    expect(result.sections.find((section) => section.key === "face_makeup")?.values).toEqual([
      "她画着清冷优雅的财阀千金妆容",
    ]);
    expect(result.sections.find((section) => section.key === "clothing_style")?.values).toEqual(["豪华居家服"]);
    expect(result.template).toContain("面部妆容：{{faceMakeup: 她画着清冷优雅的财阀千金妆容}}");
    expect(result.template).toContain("服装风格：{{clothingStyle: 豪华居家服}}");
    expect(result.template).not.toContain("服装：");
  });

  it("keeps detected capsule values narrow instead of swallowing surrounding context", () => {
    const result = splitPromptToTemplate(
      "真人摄影风格的高端肚皮舞主题时尚大片，整体表情不夸张、不媚俗，使用 24mm–28mm 广角近拍的封面视角",
    );

    expect(result.sections.find((section) => section.key === "photography_style")?.values).toEqual([
      "真人摄影风格",
    ]);
    expect(result.sections.find((section) => section.key === "face_makeup")).toBeUndefined();
    expect(result.sections.find((section) => section.key === "negative")?.values).toEqual([
      "整体表情不夸张、不媚俗",
    ]);
    expect(result.sections.find((section) => section.key === "lens_equipment")?.values).toEqual([
      "24mm–28mm 广角近拍",
    ]);
    expect(result.template).not.toContain("高端肚皮舞主题");
    expect(result.template).not.toContain("使用 24mm");
  });

  it("does not turn surrounding lighting context into a tiny identity label", () => {
    const result = splitPromptToTemplate("顶部有柔和的聚光灯打下来照亮少女，校园少女感，柔和窗边自然光影");
    const identityValues = result.sections.find((section) => section.key === "identity_attribute")?.values;

    expect(identityValues).toEqual(["校园少女感"]);
    expect(result.template).toContain("基础身份属性：{{identityAttribute: 校园少女感}}");
    expect(result.template).not.toContain("聚光灯打下来照亮少女");
  });

  it("separates people, head accessories, and hair details instead of using broad hair capsules", () => {
    const result = splitPromptToTemplate("一位美丽少女，珍珠头饰，冷棕长发大波浪");

    expect(result.sections.find((section) => section.key === "identity_attribute")?.values).toEqual(["一位美丽少女"]);
    expect(result.sections.find((section) => section.key === "head_accessory")?.values).toEqual(["珍珠头饰"]);
    expect(result.sections.find((section) => section.key === "hair_color")?.values).toEqual(["冷棕长发大波浪"]);
    expect(result.sections.find((section) => section.key === "hair_length")?.values).toEqual(["冷棕长发大波浪"]);
    expect(result.sections.find((section) => section.key === "hair_style")?.values).toEqual(["冷棕长发大波浪"]);
    expect(result.sections.find((section) => section.key === "hair_accessory")).toBeUndefined();
  });

  it("ignores generation tools, gallery SEO, and source metadata when building capsules", () => {
    const result = splitPromptToTemplate(
      "使用 GPT Image 2 生成一张，适合 Nano Banana prompts gallery SEO，女性，时尚杂志封面，24mm–28mm 广角近拍",
    );

    expect(result.sections.find((section) => section.key === "identity_attribute")?.values).toEqual(["女性"]);
    expect(result.sections.find((section) => section.key === "photography_style")?.values).toEqual(["时尚杂志封面"]);
    expect(result.sections.find((section) => section.key === "lens_equipment")?.values).toEqual([
      "24mm–28mm 广角近拍",
    ]);
    expect(result.template).not.toContain("GPT Image 2");
    expect(result.template).not.toContain("Nano Banana");
    expect(result.template).not.toContain("SEO");
  });

  it("strips generation prefixes while keeping the actual subject capsule", () => {
    const result = splitPromptToTemplate("用 GPT Image 2 生成一张少女，写实风格");

    expect(result.sections.find((section) => section.key === "identity_attribute")?.values).toEqual(["少女"]);
    expect(result.sections.find((section) => section.key === "image_style")?.values).toEqual(["写实风格"]);
    expect(result.template).not.toContain("用 GPT Image 2 生成一张");
  });

  it("keeps contextual values across body, styling, scene, and lighting sections", () => {
    const result = splitPromptToTemplate(
      [
        "画面通过三分法构图形成视觉稳定",
        "背景呈现浅景深背景虚化",
        "人物具有鹅蛋脸骨相",
        "皮肤呈现冷白皮",
        "头发采用冷棕发色",
        "身穿真丝材质礼服",
        "服装采用香槟色系",
        "位于顶层公寓",
        "前景使用薄纱前景遮挡",
        "光线采用伦勃朗硬光",
        "窗外月光作为光源",
        "整体营造清冷疏离情绪基调",
      ].join("，"),
    );

    expect(result.sections.find((section) => section.key === "composition")?.values).toEqual([
      "画面通过三分法构图形成视觉稳定",
    ]);
    expect(result.sections.find((section) => section.key === "depth_of_field")?.values).toEqual([
      "背景呈现浅景深背景虚化",
    ]);
    expect(result.sections.find((section) => section.key === "face_shape")?.values).toEqual([
      "人物具有鹅蛋脸骨相",
    ]);
    expect(result.sections.find((section) => section.key === "skin_base")?.values).toEqual(["皮肤呈现冷白皮"]);
    expect(result.sections.find((section) => section.key === "hair_color")?.values).toEqual(["头发采用冷棕发色"]);
    expect(result.sections.find((section) => section.key === "clothing_style")?.values).toEqual([
      "身穿真丝材质礼服",
    ]);
    expect(result.sections.find((section) => section.key === "clothing_material")?.values).toEqual([
      "身穿真丝材质礼服",
    ]);
    expect(result.sections.find((section) => section.key === "clothing_color")?.values).toEqual([
      "服装采用香槟色系",
    ]);
    expect(result.sections.find((section) => section.key === "scene_identity")?.values).toEqual(["位于顶层公寓"]);
    expect(result.sections.find((section) => section.key === "foreground_occlusion")?.values).toEqual([
      "前景使用薄纱前景遮挡",
    ]);
    expect(result.sections.find((section) => section.key === "main_light_type")?.values).toEqual([
      "光线采用伦勃朗硬光",
    ]);
    expect(result.sections.find((section) => section.key === "light_source")?.values).toEqual([
      "窗外月光作为光源",
    ]);
    expect(result.sections.find((section) => section.key === "mood_tone")?.values).toEqual([
      "整体营造清冷疏离情绪基调",
    ]);
    expect(result.template).toContain("构图逻辑：{{composition: 画面通过三分法构图形成视觉稳定}}");
    expect(result.template).toContain("情绪基调：{{moodTone: 整体营造清冷疏离情绪基调}}");
  });

  it("splits pixel-level portrait descriptions into dedicated person capsules", () => {
    const result = splitPromptToTemplate(
      [
        "人物主体定位：单人女性",
        "占据画面约70%的视觉区域",
        "年龄气质：青年阶段",
        "自然松弛气质",
        "身体结构：肩部放松",
        "脸型轮廓：椭圆脸",
        "眉毛细节：自然平直眉",
        "眼睛眼神：视线略微偏离镜头",
        "鼻子结构：高挺鼻梁",
        "嘴唇唇形：嘴角轻微上扬",
        "肤质纹理：细微肌理",
        "发型造型：柔顺直发",
        "服装材质：亚麻材质",
        "动作姿态：自然站姿动作",
        "面部表情：表情自然放松",
        "人像摄影参数：85mm人像镜头",
        "人像光影色彩：左前方柔光",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "subject_position",
      "age_character",
      "body_frame",
      "face_shape",
      "eyebrow_detail",
      "eye_detail",
      "nose_detail",
      "lip_detail",
      "skin_texture",
      "hair_style",
      "clothing_material",
      "pose",
      "facial_expression",
      "portrait_photography",
      "portrait_lighting_color",
    ]);
    expect(result.sections.find((section) => section.key === "subject_position")?.values).toEqual([
      "单人女性",
      "占据画面约70%的视觉区域",
    ]);
    expect(result.sections.find((section) => section.key === "eye_detail")?.values).toEqual([
      "视线略微偏离镜头",
    ]);
    expect(result.sections.find((section) => section.key === "skin_texture")?.values).toEqual(["细微肌理"]);
    expect(result.template).toContain("脸型轮廓：{{faceShape: 椭圆脸}}");
    expect(result.template).toContain("人像光影色彩：{{portraitLightingColor: 左前方柔光}}");
  });

  it("splits pixel-level scene descriptions into dedicated scene capsules", () => {
    const result = splitPromptToTemplate(
      [
        "场景类型定位：现代极简住宅空间",
        "空间结构：三层空间结构",
        "空间比例尺度：空间尺度宽敞",
        "场景透视关系：一点透视结构",
        "前中后景分层：前景浅景深虚化植物枝叶",
        "建筑空间结构：落地玻璃窗设计",
        "主要物体元素：低矮布艺沙发",
        "场景材质纹理：自然木材纹理",
        "场景色彩体系：米白和浅木色",
        "场景光影关系：右侧大面积窗户自然光",
        "场景氛围情绪：午后自然光环境",
        "场景摄影参数：35mm广角镜头",
        "场景微观细节：轻微使用痕迹",
        "年龄气质：清冷气质",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "age_character",
      "scene_identity",
      "spatial_structure",
      "spatial_scale",
      "scene_perspective",
      "scene_layering",
      "architecture_structure",
      "object_elements",
      "material_texture",
      "scene_color_palette",
      "scene_lighting",
      "scene_atmosphere",
      "scene_photography",
      "scene_micro_details",
    ]);
    expect(result.sections.find((section) => section.key === "scene_identity")?.values).toEqual([
      "现代极简住宅空间",
    ]);
    expect(result.sections.find((section) => section.key === "scene_lighting")?.values).toEqual([
      "右侧大面积窗户自然光",
    ]);
    expect(result.sections.find((section) => section.key === "age_character")?.values).toEqual(["清冷气质"]);
    expect(result.sections.find((section) => section.key === "atmosphere")).toBeUndefined();
    expect(result.template).toContain("场景摄影参数：{{scenePhotography: 35mm广角镜头}}");
    expect(result.template).toContain("场景微观细节：{{sceneMicroDetails: 轻微使用痕迹}}");
  });

  it("splits e-commerce product image descriptions into dedicated product capsules", () => {
    const result = splitPromptToTemplate(
      [
        "产品主体定位：单件厨房电器产品",
        "产品外观结构：圆润流线型外观",
        "产品摆放角度：45度前侧视角",
        "产品比例关系：产品占据画面约60%",
        "产品构图布局：中心构图",
        "产品材质纹理：细腻哑光材质",
        "产品色彩体系：低饱和深灰色",
        "产品细节卖点：触控区域",
        "产品配件元素：相关使用道具",
        "产品背景环境：浅色极简空间环境",
        "产品环境关系：木质台面",
        "产品光影关系：侧前方大面积柔光",
        "产品摄影参数：50mm商业产品摄影镜头",
        "商业视觉风格：高级极简商业摄影风格",
        "产品微观细节：真实材质纹理",
        "服装材质：真丝材质",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "clothing_material",
      "product_identity",
      "product_form",
      "product_position",
      "product_composition_ratio",
      "product_composition",
      "product_material",
      "product_color",
      "product_feature_detail",
      "product_supporting_elements",
      "product_background",
      "product_environment_relation",
      "product_lighting",
      "product_photography",
      "commercial_visual_style",
      "product_micro_details",
    ]);
    expect(result.sections.find((section) => section.key === "product_material")?.values).toEqual([
      "细腻哑光材质",
    ]);
    expect(result.sections.find((section) => section.key === "product_lighting")?.values).toEqual([
      "侧前方大面积柔光",
    ]);
    expect(result.sections.find((section) => section.key === "clothing_material")?.values).toEqual(["真丝材质"]);
    expect(result.template).toContain("产品摄影参数：{{productPhotography: 50mm商业产品摄影镜头}}");
    expect(result.template).toContain("商业视觉风格：{{commercialVisualStyle: 高级极简商业摄影风格}}");
  });

  it("splits food identity descriptions into dedicated food capsules", () => {
    const result = splitPromptToTemplate(
      [
        "食物大类别：甜品",
        "具体名称识别：手工薄底玛格丽特披萨",
        "地域料理类型：意式餐饮风格",
        "主体食材：马苏里拉奶酪",
        "辅助食材：新鲜罗勒叶",
        "结构层次：圆形层叠结构",
        "外形轮廓：边缘略微不规则",
        "烹饪方式：高温烘焙",
        "熟成状态：轻微融化状态",
        "口感视觉表现：自然气泡烘烤纹理",
        "新鲜程度：食材新鲜感",
        "份量比例：单人精致份量",
        "摆盘方式：圆形木质托盘",
        "商业定位：高级餐饮广告视觉",
        "产品细节卖点：品牌标识",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "food_category",
      "food_specific_identity",
      "food_cuisine_style",
      "food_main_ingredient",
      "food_supporting_ingredient",
      "food_structure_layer",
      "food_physical_form",
      "food_cooking_method",
      "food_cooking_state",
      "food_texture_visual",
      "food_freshness",
      "food_portion",
      "food_plating",
      "commercial_food_identity",
      "product_feature_detail",
    ]);
    expect(result.sections.find((section) => section.key === "food_specific_identity")?.values).toEqual([
      "手工薄底玛格丽特披萨",
    ]);
    expect(result.sections.find((section) => section.key === "food_main_ingredient")?.values).toEqual([
      "马苏里拉奶酪",
    ]);
    expect(result.sections.find((section) => section.key === "food_texture_visual")?.values).toEqual([
      "自然气泡烘烤纹理",
    ]);
    expect(result.template).toContain("具体名称识别：{{foodSpecificIdentity: 手工薄底玛格丽特披萨}}");
    expect(result.template).toContain("摆盘方式：{{foodPlating: 圆形木质托盘}}");
    expect(result.template).toContain("产品细节卖点：{{productFeatureDetail: 品牌标识}}");
  });

  it("splits cuisine pixel analysis into dedicated cuisine capsules", () => {
    const result = splitPromptToTemplate(
      [
        "菜系分类：日料",
        "地域文化来源：季节感",
        "典型食材体系：新鲜鱼类米饭海藻",
        "味型视觉表达：酱汁光泽",
        "传统摆盘习惯：极简留白摆盘",
        "常用餐具风格：手工陶器小碟",
        "色彩基因：白黑木色",
        "空间环境特点：安静高级氛围",
        "摄影表现风格：柔和侧光低饱和色调",
        "烹饪方式：高温烘焙",
        "商业定位：高级餐饮广告视觉",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "food_cuisine_style",
      "cuisine_cultural_origin",
      "cuisine_ingredient_system",
      "cuisine_flavor_visual",
      "cuisine_plating_habit",
      "cuisine_tableware_style",
      "cuisine_color_gene",
      "cuisine_spatial_context",
      "cuisine_photography_style",
      "food_cooking_method",
      "commercial_food_identity",
    ]);
    expect(result.sections.find((section) => section.key === "food_cuisine_style")?.values).toEqual(["日料"]);
    expect(result.sections.find((section) => section.key === "cuisine_ingredient_system")?.values).toEqual([
      "新鲜鱼类米饭海藻",
    ]);
    expect(result.sections.find((section) => section.key === "cuisine_tableware_style")?.values).toEqual([
      "手工陶器小碟",
    ]);
    expect(result.sections.find((section) => section.key === "cuisine_color_gene")?.values).toEqual(["白黑木色"]);
    expect(result.sections.find((section) => section.key === "food_cooking_method")?.values).toEqual(["高温烘焙"]);
    expect(result.sections.find((section) => section.key === "commercial_food_identity")?.values).toEqual([
      "高级餐饮广告视觉",
    ]);
    expect(result.template).toContain("菜系分类：{{foodCuisineStyle: 日料}}");
    expect(result.template).toContain("常用餐具风格：{{cuisineTablewareStyle: 手工陶器小碟}}");
    expect(result.template).toContain("摄影表现风格：{{cuisinePhotographyStyle: 柔和侧光低饱和色调}}");
  });

  it("splits visual style pixel analysis into dedicated style capsules", () => {
    const result = splitPromptToTemplate(
      [
        "风格类别：极简主义",
        "视觉流派：北欧风",
        "时代属性：当代现代",
        "国家文化：东方美学",
        "审美体系：安静克制",
        "色彩语言：莫兰迪色",
        "构图语言：留白构图",
        "光影语言：自然生活光",
        "材质语言：天然木材",
        "空间语言：极简空间",
        "设计语言：柔和曲线",
        "情绪表达：温暖治愈",
        "风格商业定位：中高端生活方式品牌",
        "风格关键词：现代极简 + 北欧生活方式",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "style_classification",
      "style_visual_movement",
      "style_era",
      "style_cultural_origin",
      "style_aesthetic_tendency",
      "style_color_language",
      "style_composition_language",
      "style_lighting_language",
      "style_material_language",
      "style_spatial_language",
      "style_design_language",
      "style_mood",
      "style_commercial_positioning",
      "style_keywords",
    ]);
    expect(result.sections.find((section) => section.key === "style_classification")?.values).toEqual(["极简主义"]);
    expect(result.sections.find((section) => section.key === "style_visual_movement")?.values).toEqual(["北欧风"]);
    expect(result.sections.find((section) => section.key === "style_color_language")?.values).toEqual(["莫兰迪色"]);
    expect(result.sections.find((section) => section.key === "style_lighting_language")?.values).toEqual([
      "自然生活光",
    ]);
    expect(result.template).toContain("风格类别：{{styleClassification: 极简主义}}");
    expect(result.template).toContain("风格关键词：{{styleKeywords: 现代极简 + 北欧生活方式}}");
  });

  it("splits lighting pixel analysis into dedicated lighting capsules", () => {
    const result = splitPromptToTemplate(
      [
        "光源类型：自然光源",
        "光源位置：画面左侧",
        "光线方向：左侧入射",
        "光源大小：大型柔光箱",
        "光线硬软程度：柔光",
        "光线强弱：主体突出",
        "光比关系：中低光比",
        "明暗分布：亮部集中于主体中心",
        "阴影方向：向右后方延伸",
        "阴影软硬：柔和扩散",
        "高光位置：金属边缘",
        "反射折射：环境倒影",
        "材质响应：金属强反射",
        "环境光照：墙面反射",
        "色温色彩：冷暖平衡",
        "时间天气：黄昏",
        "氛围情绪：高级商业感",
        "摄影灯光方案：左侧大型柔光箱",
        "微观光学细节：边缘光",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "lighting_source_type",
      "lighting_source_position",
      "lighting_direction",
      "lighting_source_size",
      "lighting_quality",
      "lighting_intensity",
      "lighting_ratio",
      "lighting_distribution",
      "lighting_shadow_direction",
      "lighting_shadow_quality",
      "lighting_highlight",
      "lighting_reflection_refraction",
      "lighting_material_response",
      "lighting_environment",
      "lighting_color_temperature",
      "lighting_time_weather",
      "lighting_mood",
      "lighting_setup",
      "lighting_micro_details",
    ]);
    expect(result.sections.find((section) => section.key === "lighting_source_type")?.values).toEqual(["自然光源"]);
    expect(result.sections.find((section) => section.key === "lighting_distribution")?.values).toEqual([
      "亮部集中于主体中心",
    ]);
    expect(result.sections.find((section) => section.key === "lighting_shadow_direction")?.values).toEqual([
      "向右后方延伸",
    ]);
    expect(result.template).toContain("光源类型：{{lightingSourceType: 自然光源}}");
    expect(result.template).toContain("微观光学细节：{{lightingMicroDetails: 边缘光}}");
  });

  it("splits prop pixel analysis into dedicated prop capsules", () => {
    const result = splitPromptToTemplate(
      [
        "道具识别：陶瓷杯、纸质书籍和绿色植物",
        "道具类别：生活类道具",
        "道具功能作用：增强生活化场景氛围",
        "数量组合关系：少量组合",
        "空间位置：主体左前方",
        "尺寸比例：小型点缀",
        "外形结构：圆柱形结构",
        "材质纹理：哑光陶瓷材质",
        "色彩关系：低饱和自然色调",
        "摆放方式：自然生活化摆放",
        "使用状态：轻微使用状态",
        "主体关联关系：围绕主体形成完整使用场景",
        "光影表现：侧向柔光与自然接触阴影",
        "风格属性：现代极简风格",
        "故事氛围：安静阅读环境",
        "微观细节：纸张纤维和轻微使用痕迹",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "prop_identification",
      "prop_category",
      "prop_purpose",
      "prop_quantity_grouping",
      "prop_spatial_position",
      "prop_scale_relationship",
      "prop_shape_structure",
      "prop_material_texture",
      "prop_color_relationship",
      "prop_arrangement",
      "prop_usage_state",
      "prop_subject_relationship",
      "prop_lighting_interaction",
      "prop_style_identity",
      "prop_narrative_function",
      "prop_micro_details",
    ]);
    expect(result.sections.find((section) => section.key === "prop_identification")?.values).toEqual([
      "陶瓷杯、纸质书籍和绿色植物",
    ]);
    expect(result.sections.find((section) => section.key === "prop_arrangement")?.values).toEqual([
      "自然生活化摆放",
    ]);
    expect(result.sections.find((section) => section.key === "prop_micro_details")?.values).toEqual([
      "纸张纤维和轻微使用痕迹",
    ]);
    expect(result.template).toContain("道具识别：{{propIdentification: 陶瓷杯、纸质书籍和绿色植物}}");
    expect(result.template).toContain("微观细节：{{propMicroDetails: 纸张纤维和轻微使用痕迹}}");
  });

  it("splits historical and regional costume analysis into dedicated costume capsules", () => {
    const result = splitPromptToTemplate(
      [
        "服饰文化身份：东亚传统服饰体系",
        "国家地区体系：中国",
        "民族体系：汉服体系",
        "历史时期：江户时代",
        "历史朝代：唐代",
        "服装形制：高腰裙与宽袖",
        "裁剪方式：东方平面裁剪体系",
        "穿着方式：衣片叠合",
        "层次结构：多层叠穿",
        "配套系统：披帛",
        "社会身份：皇室贵族",
        "制作工艺：金线刺绣",
        "民族纹样符号：龙凤祥云",
        "服饰审美语言：华丽开放",
        "摄影呈现：历史服饰摄影",
        "服饰微观细节：纤维",
      ].join("，"),
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "costume_cultural_identity",
      "costume_country_region",
      "costume_ethnic_system",
      "costume_historical_period",
      "costume_dynasty",
      "costume_construction_system",
      "costume_cutting_method",
      "costume_wearing_method",
      "costume_layering_system",
      "costume_complete_system",
      "costume_social_status",
      "costume_craft",
      "costume_symbolic_pattern",
      "costume_aesthetic_language",
      "costume_photography_presentation",
      "costume_micro_details",
    ]);
    expect(result.sections.find((section) => section.key === "costume_dynasty")?.values).toEqual(["唐代"]);
    expect(result.sections.find((section) => section.key === "costume_cutting_method")?.values).toEqual([
      "东方平面裁剪体系",
    ]);
    expect(result.sections.find((section) => section.key === "costume_craft")?.values).toEqual(["金线刺绣"]);
    expect(result.template).toContain("服饰文化身份：{{costumeCulturalIdentity: 东亚传统服饰体系}}");
    expect(result.template).toContain("历史朝代：{{costumeDynasty: 唐代}}");
    expect(result.template).toContain("服饰微观细节：{{costumeMicroDetails: 纤维}}");
  });

  it("extracts contextual dimensions from one descriptive fragment", () => {
    const result = splitPromptToTemplate("身穿真丝材质礼服站在顶层公寓");

    expect(result.sections.find((section) => section.key === "clothing_material")?.values).toEqual([
      "身穿真丝材质礼服",
    ]);
    expect(result.sections.find((section) => section.key === "clothing_style")?.values).toEqual([
      "身穿真丝材质礼服",
    ]);
    expect(result.sections.find((section) => section.key === "scene_identity")?.values).toEqual(["站在顶层公寓"]);
    expect(result.sections.find((section) => section.key === "clothing")).toBeUndefined();
  });

  it("keeps contextual capsule spans from descriptive AI analysis sentences", () => {
    const result = splitPromptToTemplate(
      [
        "画面色彩以低饱和奶油白为主",
        "镜头语言保持正面视角",
        "冬类材质在卡通渲染中保持清晰的物理质感",
        "使欧式古典风格与 Pixar 卡通渲染风格统一",
        "茶几位于前景中心",
        "家具组合呈现圆润饱满的卡通体块",
        "家具按照正面视角整齐排列在画面中央",
      ].join("，"),
    );

    expect(result.sections.find((section) => section.key === "color_detail")?.values).toEqual([
      "画面色彩以低饱和奶油白为主",
    ]);
    expect(result.sections.find((section) => section.key === "camera_angle")?.values).toEqual([
      "镜头语言保持正面视角",
    ]);
    expect(result.sections.find((section) => section.key === "clothing_material")?.values).toEqual([
      "冬类材质在卡通渲染中保持清晰的物理质感",
    ]);
    expect(result.sections.find((section) => section.key === "image_style")?.values).toEqual([
      "欧式古典风格",
      "Pixar 卡通渲染风格",
    ]);
    expect(result.sections.find((section) => section.key === "composition")?.values).toEqual([
      "茶几位于前景中心",
      "家具按照正面视角整齐排列在画面中央",
    ]);
    expect(result.sections.find((section) => section.key === "furniture_soft_decoration")?.values).toEqual([
      "家具组合呈现圆润饱满的卡通体块",
    ]);
    expect(result.template).toContain("画面色彩以低饱和奶油白为主");
    expect(result.template).toContain("冬类材质在卡通渲染中保持清晰的物理质感");
    expect(result.template).not.toContain("使欧式古典风格与 Pixar 卡通渲染风格统一");
  });

  it("keeps makeup, accessories, typography, and text capsules as replaceable context", () => {
    const result = splitPromptToTemplate(
      [
        "面部呈现水光透亮底妆",
        "眼部使用上扬眼线",
        "唇部采用镜面唇釉",
        "头部搭配贝雷帽",
        "手部佩戴钻石手表",
        "画面包含英文短标语",
        "字体使用优雅衬线字体",
        "色彩细节采用低饱和莫兰迪配色",
      ].join("，"),
    );

    expect(result.sections.find((section) => section.key === "base_makeup")?.values).toEqual([
      "面部呈现水光透亮底妆",
    ]);
    expect(result.sections.find((section) => section.key === "eye_makeup")?.values).toEqual(["眼部使用上扬眼线"]);
    expect(result.sections.find((section) => section.key === "lip_makeup")?.values).toEqual(["唇部采用镜面唇釉"]);
    expect(result.sections.find((section) => section.key === "head_accessory")?.values).toEqual(["头部搭配贝雷帽"]);
    expect(result.sections.find((section) => section.key === "hand_accessory")?.values).toEqual([
      "手部佩戴钻石手表",
    ]);
    expect(result.sections.find((section) => section.key === "text_content")?.values).toEqual([
      "画面包含英文短标语",
    ]);
    expect(result.sections.find((section) => section.key === "typography")?.values).toEqual([
      "字体使用优雅衬线字体",
    ]);
    expect(result.sections.find((section) => section.key === "color_detail")?.values).toEqual([
      "色彩细节采用低饱和莫兰迪配色",
    ]);
    expect(result.template).toContain("底妆：{{baseMakeup: 面部呈现水光透亮底妆}}");
    expect(result.template).toContain("字体：{{typography: 字体使用优雅衬线字体}}");
  });

  it("keeps specific makeup capsules out of broad face makeup", () => {
    const result = splitPromptToTemplate("水光透亮底妆，上扬眼线，镜面唇釉");

    expect(result.sections.find((section) => section.key === "base_makeup")?.values).toEqual(["水光透亮底妆"]);
    expect(result.sections.find((section) => section.key === "eye_makeup")?.values).toEqual(["上扬眼线"]);
    expect(result.sections.find((section) => section.key === "lip_makeup")?.values).toEqual(["镜面唇釉"]);
    expect(result.sections.find((section) => section.key === "face_makeup")).toBeUndefined();
  });

  it("splits portrait prompts into the extended portrait replaceable dimensions", () => {
    const result = splitPromptToTemplate(
      "镜头器材：85mm定焦，胶片介质：柯达金200，基础身份属性：财阀气质，骨相五官：鹅蛋脸骨相，底妆：水光透亮底妆，发色：冷棕发色，服装材质：真丝材质，腿部体态：交叉腿，场地大类：顶层公寓，主光类型：伦勃朗硬光，情绪基调：清冷疏离，前景遮挡：薄纱前景遮挡",
    );

    expect(result.sections.map((section) => section.key)).toEqual([
      "lens_equipment",
      "film_medium",
      "identity_attribute",
      "facial_structure",
      "base_makeup",
      "hair_color",
      "clothing_material",
      "leg_pose",
      "location_scene",
      "main_light_type",
      "mood_tone",
      "foreground_occlusion",
    ]);
    expect(result.template).toContain("镜头器材：{{lensEquipment: 85mm定焦}}");
    expect(result.template).toContain("服装材质：{{clothingMaterial: 真丝材质}}");
    expect(result.template).toContain("情绪基调：{{moodTone: 清冷疏离}}");
  });

  it("detects negative prompt fragments as an internal section", () => {
    const result = splitPromptToTemplate("人物肖像，避免模糊，不要畸形手指");

    expect(result.sections.some((section) => section.key === "negative")).toBe(true);
    expect(result.template).toContain("避免内容：{{avoid: 避免模糊，不要畸形手指}}");
  });

  it("resolves inline variables into copyable text", () => {
    expect(resolvePromptTemplateText("图像风格：{{imageStyle: 浮世绘}}\n景别：{{shotSize}}")).toBe(
      "图像风格：浮世绘\n景别：shotSize",
    );
  });

  it("resolves explicit symbol-wrapped capsules into plain text", () => {
    expect(
      resolvePromptTemplateText(
        "主体【水梨】，比例[3:4]，氛围（清爽夏日氛围），风格「冰爽水雾水果广告海报」，字体《优雅衬线字体》",
        { explicitParameters: true },
      ),
    ).toBe("主体水梨，比例3:4，氛围清爽夏日氛围，风格冰爽水雾水果广告海报，字体优雅衬线字体");
  });

  it("parses inline variables into parameter segments", () => {
    expect(parsePromptTemplateSegments("画面使用{{lightShadow: 柔和自然光影}}，比例是{{aspectRatio: 16:9}}")).toEqual([
      { type: "text", text: "画面使用" },
      { type: "parameter", source: "{{lightShadow: 柔和自然光影}}", variable: "lightShadow", value: "柔和自然光影" },
      { type: "text", text: "，比例是" },
      { type: "parameter", source: "{{aspectRatio: 16:9}}", variable: "aspectRatio", value: "16:9" },
    ]);
  });

  it("treats bracketed prompt fragments as explicit replaceable parameters", () => {
    expect(parsePromptTemplateSegments("主体【水梨】，比例[3:4]，氛围（清爽夏日氛围），风格「冰爽水雾水果广告海报」")).toEqual([
      { type: "text", text: "主体" },
      { type: "parameter", source: "【水梨】", variable: "foodMainIngredient", value: "水梨" },
      { type: "text", text: "，比例" },
      { type: "parameter", source: "[3:4]", variable: "aspectRatio", value: "3:4" },
      { type: "text", text: "，氛围" },
      { type: "parameter", source: "（清爽夏日氛围）", variable: "atmosphere", value: "清爽夏日氛围" },
      { type: "text", text: "，风格" },
      {
        type: "parameter",
        source: "「冰爽水雾水果广告海报」",
        variable: "commercialVisualStyle",
        value: "冰爽水雾水果广告海报",
      },
    ]);
  });

  it("recognizes generalized paired symbols as explicit parameter markers", () => {
    expect(parsePromptTemplateSegments("主角『成熟男性』，字体《优雅衬线字体》，色彩〔低饱和莫兰迪配色〕，镜头〈35mm〉")).toEqual([
      { type: "text", text: "主角" },
      { type: "parameter", source: "『成熟男性』", variable: "identityAttribute", value: "成熟男性" },
      { type: "text", text: "，字体" },
      { type: "parameter", source: "《优雅衬线字体》", variable: "typography", value: "优雅衬线字体" },
      { type: "text", text: "，色彩" },
      { type: "parameter", source: "〔低饱和莫兰迪配色〕", variable: "colorDetail", value: "低饱和莫兰迪配色" },
      { type: "text", text: "，镜头" },
      { type: "parameter", source: "〈35mm〉", variable: "lensEquipment", value: "35mm" },
    ]);
  });
});
