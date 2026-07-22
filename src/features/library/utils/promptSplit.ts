export type PromptSplitSectionKey =
  | "lens_equipment"
  | "image_style"
  | "style_classification"
  | "style_visual_movement"
  | "style_era"
  | "style_cultural_origin"
  | "style_aesthetic_tendency"
  | "style_color_language"
  | "style_composition_language"
  | "style_lighting_language"
  | "style_material_language"
  | "style_spatial_language"
  | "style_design_language"
  | "style_mood"
  | "style_commercial_positioning"
  | "style_keywords"
  | "lighting_source_type"
  | "lighting_source_position"
  | "lighting_direction"
  | "lighting_source_size"
  | "lighting_quality"
  | "lighting_intensity"
  | "lighting_ratio"
  | "lighting_distribution"
  | "lighting_shadow_direction"
  | "lighting_shadow_quality"
  | "lighting_highlight"
  | "lighting_reflection_refraction"
  | "lighting_material_response"
  | "lighting_environment"
  | "lighting_color_temperature"
  | "lighting_time_weather"
  | "lighting_mood"
  | "lighting_setup"
  | "lighting_micro_details"
  | "prop_identification"
  | "prop_category"
  | "prop_purpose"
  | "prop_quantity_grouping"
  | "prop_spatial_position"
  | "prop_scale_relationship"
  | "prop_shape_structure"
  | "prop_material_texture"
  | "prop_color_relationship"
  | "prop_arrangement"
  | "prop_usage_state"
  | "prop_subject_relationship"
  | "prop_lighting_interaction"
  | "prop_style_identity"
  | "prop_narrative_function"
  | "prop_micro_details"
  | "photography_style"
  | "shot_size"
  | "aspect_ratio"
  | "camera_angle"
  | "composition"
  | "depth_of_field"
  | "film_medium"
  | "exposure_logic"
  | "image_effect"
  | "subject_position"
  | "identity_attribute"
  | "age_character"
  | "body_frame"
  | "facial_structure"
  | "face_shape"
  | "eyebrow_detail"
  | "eye_detail"
  | "nose_detail"
  | "lip_detail"
  | "skin_base"
  | "skin_texture"
  | "native_facial_feature"
  | "face_makeup"
  | "base_makeup"
  | "eye_makeup"
  | "midface_makeup"
  | "lip_makeup"
  | "special_makeup"
  | "hair_accessory"
  | "hair_color"
  | "hair_length"
  | "hair_style"
  | "body_hair_detail"
  | "face_accessory"
  | "neck_accessory"
  | "hand_accessory"
  | "head_accessory"
  | "body_accessory"
  | "clothing"
  | "clothing_style"
  | "clothing_material"
  | "clothing_color"
  | "clothing_cut"
  | "costume_cultural_identity"
  | "costume_country_region"
  | "costume_ethnic_system"
  | "costume_historical_period"
  | "costume_dynasty"
  | "costume_construction_system"
  | "costume_cutting_method"
  | "costume_wearing_method"
  | "costume_layering_system"
  | "costume_complete_system"
  | "costume_social_status"
  | "costume_craft"
  | "costume_symbolic_pattern"
  | "costume_aesthetic_language"
  | "costume_photography_presentation"
  | "costume_micro_details"
  | "pose"
  | "hand_gesture"
  | "leg_pose"
  | "shoulder_neck_pose"
  | "facial_expression"
  | "nail_detail"
  | "tattoo_detail"
  | "skin_detail"
  | "hand_prop"
  | "portrait_photography"
  | "portrait_lighting_color"
  | "scene_identity"
  | "spatial_structure"
  | "spatial_scale"
  | "scene_perspective"
  | "scene_layering"
  | "architecture_structure"
  | "object_elements"
  | "material_texture"
  | "scene_color_palette"
  | "scene_lighting"
  | "scene_atmosphere"
  | "scene_photography"
  | "scene_micro_details"
  | "food_category"
  | "food_specific_identity"
  | "food_cuisine_style"
  | "cuisine_cultural_origin"
  | "cuisine_ingredient_system"
  | "cuisine_flavor_visual"
  | "cuisine_plating_habit"
  | "cuisine_tableware_style"
  | "cuisine_color_gene"
  | "cuisine_spatial_context"
  | "cuisine_photography_style"
  | "food_main_ingredient"
  | "food_supporting_ingredient"
  | "food_structure_layer"
  | "food_physical_form"
  | "food_cooking_method"
  | "food_cooking_state"
  | "food_texture_visual"
  | "food_freshness"
  | "food_portion"
  | "food_plating"
  | "commercial_food_identity"
  | "product_identity"
  | "product_form"
  | "product_position"
  | "product_composition_ratio"
  | "product_composition"
  | "product_material"
  | "product_color"
  | "product_feature_detail"
  | "product_supporting_elements"
  | "product_background"
  | "product_environment_relation"
  | "product_lighting"
  | "product_photography"
  | "commercial_visual_style"
  | "product_micro_details"
  | "location_scene"
  | "furniture_soft_decoration"
  | "background_view"
  | "floor_material"
  | "spatial_detail"
  | "environment_weather"
  | "light_shadow"
  | "main_light_type"
  | "light_source"
  | "light_temperature"
  | "shadow_layer"
  | "reflection_environment"
  | "light_receiving"
  | "color_detail"
  | "mood_tone"
  | "atmosphere"
  | "foreground_occlusion"
  | "environment_prop"
  | "environment_effect"
  | "whitespace_composition"
  | "famous_person"
  | "brand"
  | "color"
  | "typography"
  | "text_content"
  | "negative"
  | "other";

export type PromptSplitSection = {
  key: PromptSplitSectionKey;
  label: string;
  variable: string;
  values: string[];
};

export type PromptSplitResult = {
  source: string;
  sections: PromptSplitSection[];
  template: string;
  suggestedTags: string[];
};

export type PromptTemplateSegment =
  | { type: "text"; text: string }
  | { type: "parameter"; source: string; variable: string; value: string };

type SectionDefinition = {
  key: PromptSplitSectionKey;
  priority: number;
  keywords: RegExp[];
};

type PromptSectionCandidate = {
  explicitLabel: boolean;
  fragment: string;
  key: PromptSplitSectionKey;
  keywordHits: number;
  preciseCore: boolean;
  priority: number;
  score: number;
  value: string;
};

export const promptSectionMeta: Record<PromptSplitSectionKey, Omit<PromptSplitSection, "values">> = {
  lens_equipment: { key: "lens_equipment", label: "镜头器材", variable: "lensEquipment" },
  image_style: { key: "image_style", label: "图像风格", variable: "imageStyle" },
  style_classification: { key: "style_classification", label: "风格类别", variable: "styleClassification" },
  style_visual_movement: { key: "style_visual_movement", label: "视觉流派", variable: "styleVisualMovement" },
  style_era: { key: "style_era", label: "时代属性", variable: "styleEra" },
  style_cultural_origin: { key: "style_cultural_origin", label: "国家文化", variable: "styleCulturalOrigin" },
  style_aesthetic_tendency: { key: "style_aesthetic_tendency", label: "审美体系", variable: "styleAestheticTendency" },
  style_color_language: { key: "style_color_language", label: "色彩语言", variable: "styleColorLanguage" },
  style_composition_language: {
    key: "style_composition_language",
    label: "构图语言",
    variable: "styleCompositionLanguage",
  },
  style_lighting_language: { key: "style_lighting_language", label: "光影语言", variable: "styleLightingLanguage" },
  style_material_language: { key: "style_material_language", label: "材质语言", variable: "styleMaterialLanguage" },
  style_spatial_language: { key: "style_spatial_language", label: "空间语言", variable: "styleSpatialLanguage" },
  style_design_language: { key: "style_design_language", label: "设计语言", variable: "styleDesignLanguage" },
  style_mood: { key: "style_mood", label: "情绪表达", variable: "styleMood" },
  style_commercial_positioning: {
    key: "style_commercial_positioning",
    label: "风格商业定位",
    variable: "styleCommercialPositioning",
  },
  style_keywords: { key: "style_keywords", label: "风格关键词", variable: "styleKeywords" },
  lighting_source_type: { key: "lighting_source_type", label: "光源类型", variable: "lightingSourceType" },
  lighting_source_position: {
    key: "lighting_source_position",
    label: "光源位置",
    variable: "lightingSourcePosition",
  },
  lighting_direction: { key: "lighting_direction", label: "光线方向", variable: "lightingDirection" },
  lighting_source_size: { key: "lighting_source_size", label: "光源大小", variable: "lightingSourceSize" },
  lighting_quality: { key: "lighting_quality", label: "光线硬软程度", variable: "lightingQuality" },
  lighting_intensity: { key: "lighting_intensity", label: "光线强弱", variable: "lightingIntensity" },
  lighting_ratio: { key: "lighting_ratio", label: "光比关系", variable: "lightingRatio" },
  lighting_distribution: { key: "lighting_distribution", label: "明暗分布", variable: "lightingDistribution" },
  lighting_shadow_direction: {
    key: "lighting_shadow_direction",
    label: "阴影方向",
    variable: "lightingShadowDirection",
  },
  lighting_shadow_quality: { key: "lighting_shadow_quality", label: "阴影软硬", variable: "lightingShadowQuality" },
  lighting_highlight: { key: "lighting_highlight", label: "高光位置", variable: "lightingHighlight" },
  lighting_reflection_refraction: {
    key: "lighting_reflection_refraction",
    label: "反射折射",
    variable: "lightingReflectionRefraction",
  },
  lighting_material_response: {
    key: "lighting_material_response",
    label: "材质响应",
    variable: "lightingMaterialResponse",
  },
  lighting_environment: { key: "lighting_environment", label: "环境光照", variable: "lightingEnvironment" },
  lighting_color_temperature: {
    key: "lighting_color_temperature",
    label: "色温色彩",
    variable: "lightingColorTemperature",
  },
  lighting_time_weather: { key: "lighting_time_weather", label: "时间天气", variable: "lightingTimeWeather" },
  lighting_mood: { key: "lighting_mood", label: "氛围情绪", variable: "lightingMood" },
  lighting_setup: { key: "lighting_setup", label: "摄影灯光方案", variable: "lightingSetup" },
  lighting_micro_details: {
    key: "lighting_micro_details",
    label: "微观光学细节",
    variable: "lightingMicroDetails",
  },
  prop_identification: { key: "prop_identification", label: "道具识别", variable: "propIdentification" },
  prop_category: { key: "prop_category", label: "道具类别", variable: "propCategory" },
  prop_purpose: { key: "prop_purpose", label: "道具功能作用", variable: "propPurpose" },
  prop_quantity_grouping: {
    key: "prop_quantity_grouping",
    label: "数量组合关系",
    variable: "propQuantityGrouping",
  },
  prop_spatial_position: { key: "prop_spatial_position", label: "空间位置", variable: "propSpatialPosition" },
  prop_scale_relationship: { key: "prop_scale_relationship", label: "尺寸比例", variable: "propScaleRelationship" },
  prop_shape_structure: { key: "prop_shape_structure", label: "外形结构", variable: "propShapeStructure" },
  prop_material_texture: { key: "prop_material_texture", label: "材质纹理", variable: "propMaterialTexture" },
  prop_color_relationship: { key: "prop_color_relationship", label: "色彩关系", variable: "propColorRelationship" },
  prop_arrangement: { key: "prop_arrangement", label: "摆放方式", variable: "propArrangement" },
  prop_usage_state: { key: "prop_usage_state", label: "使用状态", variable: "propUsageState" },
  prop_subject_relationship: {
    key: "prop_subject_relationship",
    label: "主体关联关系",
    variable: "propSubjectRelationship",
  },
  prop_lighting_interaction: { key: "prop_lighting_interaction", label: "光影表现", variable: "propLightingInteraction" },
  prop_style_identity: { key: "prop_style_identity", label: "风格属性", variable: "propStyleIdentity" },
  prop_narrative_function: {
    key: "prop_narrative_function",
    label: "故事氛围",
    variable: "propNarrativeFunction",
  },
  prop_micro_details: { key: "prop_micro_details", label: "微观细节", variable: "propMicroDetails" },
  photography_style: { key: "photography_style", label: "摄影风格", variable: "photographyStyle" },
  shot_size: { key: "shot_size", label: "景别", variable: "shotSize" },
  aspect_ratio: { key: "aspect_ratio", label: "画面比例", variable: "aspectRatio" },
  camera_angle: { key: "camera_angle", label: "拍摄角度", variable: "cameraAngle" },
  composition: { key: "composition", label: "构图逻辑", variable: "composition" },
  depth_of_field: { key: "depth_of_field", label: "景深区分", variable: "depthOfField" },
  film_medium: { key: "film_medium", label: "胶片介质", variable: "filmMedium" },
  exposure_logic: { key: "exposure_logic", label: "曝光逻辑", variable: "exposureLogic" },
  image_effect: { key: "image_effect", label: "画面特效", variable: "imageEffect" },
  subject_position: { key: "subject_position", label: "人物主体定位", variable: "subjectPosition" },
  identity_attribute: { key: "identity_attribute", label: "基础身份属性", variable: "identityAttribute" },
  age_character: { key: "age_character", label: "年龄气质", variable: "ageCharacter" },
  body_frame: { key: "body_frame", label: "身材骨架", variable: "bodyFrame" },
  facial_structure: { key: "facial_structure", label: "骨相五官", variable: "facialStructure" },
  face_shape: { key: "face_shape", label: "脸型轮廓", variable: "faceShape" },
  eyebrow_detail: { key: "eyebrow_detail", label: "眉毛细节", variable: "eyebrowDetail" },
  eye_detail: { key: "eye_detail", label: "眼睛眼神", variable: "eyeDetail" },
  nose_detail: { key: "nose_detail", label: "鼻子结构", variable: "noseDetail" },
  lip_detail: { key: "lip_detail", label: "嘴唇唇形", variable: "lipDetail" },
  skin_base: { key: "skin_base", label: "皮肤基底", variable: "skinBase" },
  skin_texture: { key: "skin_texture", label: "肤质纹理", variable: "skinTexture" },
  native_facial_feature: { key: "native_facial_feature", label: "原生面部特征", variable: "nativeFacialFeature" },
  face_makeup: { key: "face_makeup", label: "面部妆容", variable: "faceMakeup" },
  base_makeup: { key: "base_makeup", label: "底妆", variable: "baseMakeup" },
  eye_makeup: { key: "eye_makeup", label: "眉眼妆", variable: "eyeMakeup" },
  midface_makeup: { key: "midface_makeup", label: "面中妆", variable: "midfaceMakeup" },
  lip_makeup: { key: "lip_makeup", label: "唇部妆", variable: "lipMakeup" },
  special_makeup: { key: "special_makeup", label: "特殊妆容", variable: "specialMakeup" },
  hair_accessory: { key: "hair_accessory", label: "发型头饰", variable: "hairAccessory" },
  hair_color: { key: "hair_color", label: "发色", variable: "hairColor" },
  hair_length: { key: "hair_length", label: "发长刘海", variable: "hairLength" },
  hair_style: { key: "hair_style", label: "发型造型", variable: "hairStyle" },
  body_hair_detail: { key: "body_hair_detail", label: "毛发细节", variable: "bodyHairDetail" },
  face_accessory: { key: "face_accessory", label: "面部配饰", variable: "faceAccessory" },
  neck_accessory: { key: "neck_accessory", label: "颈部配饰", variable: "neckAccessory" },
  hand_accessory: { key: "hand_accessory", label: "手部配饰", variable: "handAccessory" },
  head_accessory: { key: "head_accessory", label: "头部配饰", variable: "headAccessory" },
  body_accessory: { key: "body_accessory", label: "身体配饰", variable: "bodyAccessory" },
  clothing: { key: "clothing", label: "服装细节", variable: "clothing" },
  clothing_style: { key: "clothing_style", label: "服装风格", variable: "clothingStyle" },
  clothing_material: { key: "clothing_material", label: "服装材质", variable: "clothingMaterial" },
  clothing_color: { key: "clothing_color", label: "服装颜色", variable: "clothingColor" },
  clothing_cut: { key: "clothing_cut", label: "服装剪裁", variable: "clothingCut" },
  costume_cultural_identity: {
    key: "costume_cultural_identity",
    label: "服饰文化身份",
    variable: "costumeCulturalIdentity",
  },
  costume_country_region: { key: "costume_country_region", label: "国家地区体系", variable: "costumeCountryRegion" },
  costume_ethnic_system: { key: "costume_ethnic_system", label: "民族体系", variable: "costumeEthnicSystem" },
  costume_historical_period: {
    key: "costume_historical_period",
    label: "历史时期",
    variable: "costumeHistoricalPeriod",
  },
  costume_dynasty: { key: "costume_dynasty", label: "历史朝代", variable: "costumeDynasty" },
  costume_construction_system: {
    key: "costume_construction_system",
    label: "服装形制",
    variable: "costumeConstructionSystem",
  },
  costume_cutting_method: { key: "costume_cutting_method", label: "裁剪方式", variable: "costumeCuttingMethod" },
  costume_wearing_method: { key: "costume_wearing_method", label: "穿着方式", variable: "costumeWearingMethod" },
  costume_layering_system: { key: "costume_layering_system", label: "层次结构", variable: "costumeLayeringSystem" },
  costume_complete_system: { key: "costume_complete_system", label: "配套系统", variable: "costumeCompleteSystem" },
  costume_social_status: { key: "costume_social_status", label: "社会身份", variable: "costumeSocialStatus" },
  costume_craft: { key: "costume_craft", label: "制作工艺", variable: "costumeCraft" },
  costume_symbolic_pattern: {
    key: "costume_symbolic_pattern",
    label: "民族纹样符号",
    variable: "costumeSymbolicPattern",
  },
  costume_aesthetic_language: {
    key: "costume_aesthetic_language",
    label: "服饰审美语言",
    variable: "costumeAestheticLanguage",
  },
  costume_photography_presentation: {
    key: "costume_photography_presentation",
    label: "摄影呈现",
    variable: "costumePhotographyPresentation",
  },
  costume_micro_details: { key: "costume_micro_details", label: "服饰微观细节", variable: "costumeMicroDetails" },
  pose: { key: "pose", label: "动作姿态", variable: "pose" },
  hand_gesture: { key: "hand_gesture", label: "手部手势", variable: "handGesture" },
  leg_pose: { key: "leg_pose", label: "腿部体态", variable: "legPose" },
  shoulder_neck_pose: { key: "shoulder_neck_pose", label: "肩颈体态", variable: "shoulderNeckPose" },
  facial_expression: { key: "facial_expression", label: "面部表情", variable: "facialExpression" },
  nail_detail: { key: "nail_detail", label: "指甲美甲", variable: "nailDetail" },
  tattoo_detail: { key: "tattoo_detail", label: "纹身", variable: "tattooDetail" },
  skin_detail: { key: "skin_detail", label: "皮肤附加细节", variable: "skinDetail" },
  hand_prop: { key: "hand_prop", label: "手上道具", variable: "handProp" },
  portrait_photography: { key: "portrait_photography", label: "人像摄影参数", variable: "portraitPhotography" },
  portrait_lighting_color: { key: "portrait_lighting_color", label: "人像光影色彩", variable: "portraitLightingColor" },
  scene_identity: { key: "scene_identity", label: "场景类型定位", variable: "sceneIdentity" },
  spatial_structure: { key: "spatial_structure", label: "空间结构", variable: "spatialStructure" },
  spatial_scale: { key: "spatial_scale", label: "空间比例尺度", variable: "spatialScale" },
  scene_perspective: { key: "scene_perspective", label: "场景透视关系", variable: "scenePerspective" },
  scene_layering: { key: "scene_layering", label: "前中后景分层", variable: "sceneLayering" },
  architecture_structure: { key: "architecture_structure", label: "建筑空间结构", variable: "architectureStructure" },
  object_elements: { key: "object_elements", label: "主要物体元素", variable: "objectElements" },
  material_texture: { key: "material_texture", label: "场景材质纹理", variable: "materialTexture" },
  scene_color_palette: { key: "scene_color_palette", label: "场景色彩体系", variable: "sceneColorPalette" },
  scene_lighting: { key: "scene_lighting", label: "场景光影关系", variable: "sceneLighting" },
  scene_atmosphere: { key: "scene_atmosphere", label: "场景氛围情绪", variable: "sceneAtmosphere" },
  scene_photography: { key: "scene_photography", label: "场景摄影参数", variable: "scenePhotography" },
  scene_micro_details: { key: "scene_micro_details", label: "场景微观细节", variable: "sceneMicroDetails" },
  food_category: { key: "food_category", label: "食物大类别", variable: "foodCategory" },
  food_specific_identity: { key: "food_specific_identity", label: "具体名称识别", variable: "foodSpecificIdentity" },
  food_cuisine_style: { key: "food_cuisine_style", label: "菜系分类", variable: "foodCuisineStyle" },
  cuisine_cultural_origin: { key: "cuisine_cultural_origin", label: "地域文化来源", variable: "cuisineCulturalOrigin" },
  cuisine_ingredient_system: {
    key: "cuisine_ingredient_system",
    label: "典型食材体系",
    variable: "cuisineIngredientSystem",
  },
  cuisine_flavor_visual: { key: "cuisine_flavor_visual", label: "味型视觉表达", variable: "cuisineFlavorVisual" },
  cuisine_plating_habit: { key: "cuisine_plating_habit", label: "传统摆盘习惯", variable: "cuisinePlatingHabit" },
  cuisine_tableware_style: {
    key: "cuisine_tableware_style",
    label: "常用餐具风格",
    variable: "cuisineTablewareStyle",
  },
  cuisine_color_gene: { key: "cuisine_color_gene", label: "色彩基因", variable: "cuisineColorGene" },
  cuisine_spatial_context: { key: "cuisine_spatial_context", label: "空间环境特点", variable: "cuisineSpatialContext" },
  cuisine_photography_style: {
    key: "cuisine_photography_style",
    label: "摄影表现风格",
    variable: "cuisinePhotographyStyle",
  },
  food_main_ingredient: { key: "food_main_ingredient", label: "主体食材", variable: "foodMainIngredient" },
  food_supporting_ingredient: {
    key: "food_supporting_ingredient",
    label: "辅助食材",
    variable: "foodSupportingIngredient",
  },
  food_structure_layer: { key: "food_structure_layer", label: "结构层次", variable: "foodStructureLayer" },
  food_physical_form: { key: "food_physical_form", label: "外形轮廓", variable: "foodPhysicalForm" },
  food_cooking_method: { key: "food_cooking_method", label: "烹饪方式", variable: "foodCookingMethod" },
  food_cooking_state: { key: "food_cooking_state", label: "熟成状态", variable: "foodCookingState" },
  food_texture_visual: { key: "food_texture_visual", label: "口感视觉表现", variable: "foodTextureVisual" },
  food_freshness: { key: "food_freshness", label: "新鲜程度", variable: "foodFreshness" },
  food_portion: { key: "food_portion", label: "份量比例", variable: "foodPortion" },
  food_plating: { key: "food_plating", label: "摆盘方式", variable: "foodPlating" },
  commercial_food_identity: { key: "commercial_food_identity", label: "商业定位", variable: "commercialFoodIdentity" },
  product_identity: { key: "product_identity", label: "产品主体定位", variable: "productIdentity" },
  product_form: { key: "product_form", label: "产品外观结构", variable: "productForm" },
  product_position: { key: "product_position", label: "产品摆放角度", variable: "productPosition" },
  product_composition_ratio: {
    key: "product_composition_ratio",
    label: "产品比例关系",
    variable: "productCompositionRatio",
  },
  product_composition: { key: "product_composition", label: "产品构图布局", variable: "productComposition" },
  product_material: { key: "product_material", label: "产品材质纹理", variable: "productMaterial" },
  product_color: { key: "product_color", label: "产品色彩体系", variable: "productColor" },
  product_feature_detail: { key: "product_feature_detail", label: "产品细节卖点", variable: "productFeatureDetail" },
  product_supporting_elements: {
    key: "product_supporting_elements",
    label: "产品配件元素",
    variable: "productSupportingElements",
  },
  product_background: { key: "product_background", label: "产品背景环境", variable: "productBackground" },
  product_environment_relation: {
    key: "product_environment_relation",
    label: "产品环境关系",
    variable: "productEnvironmentRelation",
  },
  product_lighting: { key: "product_lighting", label: "产品光影关系", variable: "productLighting" },
  product_photography: { key: "product_photography", label: "产品摄影参数", variable: "productPhotography" },
  commercial_visual_style: {
    key: "commercial_visual_style",
    label: "商业视觉风格",
    variable: "commercialVisualStyle",
  },
  product_micro_details: { key: "product_micro_details", label: "产品微观细节", variable: "productMicroDetails" },
  location_scene: { key: "location_scene", label: "场地大类", variable: "locationScene" },
  furniture_soft_decoration: { key: "furniture_soft_decoration", label: "软装家具", variable: "furnitureSoftDecoration" },
  background_view: { key: "background_view", label: "背景远景", variable: "backgroundView" },
  floor_material: { key: "floor_material", label: "地面材质", variable: "floorMaterial" },
  spatial_detail: { key: "spatial_detail", label: "空间细节", variable: "spatialDetail" },
  environment_weather: { key: "environment_weather", label: "环境天气", variable: "environmentWeather" },
  light_shadow: { key: "light_shadow", label: "光影", variable: "lightShadow" },
  main_light_type: { key: "main_light_type", label: "主光类型", variable: "mainLightType" },
  light_source: { key: "light_source", label: "光源来源", variable: "lightSource" },
  light_temperature: { key: "light_temperature", label: "光影色温", variable: "lightTemperature" },
  shadow_layer: { key: "shadow_layer", label: "阴影层次", variable: "shadowLayer" },
  reflection_environment: { key: "reflection_environment", label: "反光环境", variable: "reflectionEnvironment" },
  light_receiving: { key: "light_receiving", label: "受光情况", variable: "lightReceiving" },
  color_detail: { key: "color_detail", label: "色彩细节", variable: "colorDetail" },
  mood_tone: { key: "mood_tone", label: "情绪基调", variable: "moodTone" },
  atmosphere: { key: "atmosphere", label: "氛围", variable: "atmosphere" },
  foreground_occlusion: { key: "foreground_occlusion", label: "前景遮挡", variable: "foregroundOcclusion" },
  environment_prop: { key: "environment_prop", label: "环境小道具", variable: "environmentProp" },
  environment_effect: { key: "environment_effect", label: "环境特效", variable: "environmentEffect" },
  whitespace_composition: { key: "whitespace_composition", label: "构图留白", variable: "whitespaceComposition" },
  famous_person: { key: "famous_person", label: "著名人物", variable: "famousPerson" },
  brand: { key: "brand", label: "知名品牌", variable: "brand" },
  color: { key: "color", label: "颜色", variable: "color" },
  typography: { key: "typography", label: "字体", variable: "typography" },
  text_content: { key: "text_content", label: "文本内容", variable: "textContent" },
  negative: { key: "negative", label: "避免内容", variable: "avoid" },
  other: { key: "other", label: "补充信息", variable: "details" },
};

export const promptSplitSectionOrder: PromptSplitSectionKey[] = [
  "lens_equipment",
  "image_style",
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
  "photography_style",
  "shot_size",
  "aspect_ratio",
  "camera_angle",
  "composition",
  "depth_of_field",
  "film_medium",
  "exposure_logic",
  "image_effect",
  "subject_position",
  "identity_attribute",
  "age_character",
  "body_frame",
  "facial_structure",
  "face_shape",
  "eyebrow_detail",
  "eye_detail",
  "nose_detail",
  "lip_detail",
  "skin_base",
  "skin_texture",
  "native_facial_feature",
  "face_makeup",
  "base_makeup",
  "eye_makeup",
  "midface_makeup",
  "lip_makeup",
  "special_makeup",
  "hair_accessory",
  "hair_color",
  "hair_length",
  "hair_style",
  "body_hair_detail",
  "face_accessory",
  "neck_accessory",
  "hand_accessory",
  "head_accessory",
  "body_accessory",
  "clothing",
  "clothing_style",
  "clothing_material",
  "clothing_color",
  "clothing_cut",
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
  "pose",
  "hand_gesture",
  "leg_pose",
  "shoulder_neck_pose",
  "facial_expression",
  "nail_detail",
  "tattoo_detail",
  "skin_detail",
  "hand_prop",
  "portrait_photography",
  "portrait_lighting_color",
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
  "food_category",
  "food_specific_identity",
  "food_cuisine_style",
  "cuisine_cultural_origin",
  "cuisine_ingredient_system",
  "cuisine_flavor_visual",
  "cuisine_plating_habit",
  "cuisine_tableware_style",
  "cuisine_color_gene",
  "cuisine_spatial_context",
  "cuisine_photography_style",
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
  "location_scene",
  "furniture_soft_decoration",
  "background_view",
  "floor_material",
  "spatial_detail",
  "environment_weather",
  "light_shadow",
  "main_light_type",
  "light_source",
  "light_temperature",
  "shadow_layer",
  "reflection_environment",
  "light_receiving",
  "color_detail",
  "mood_tone",
  "atmosphere",
  "foreground_occlusion",
  "environment_prop",
  "environment_effect",
  "whitespace_composition",
  "famous_person",
  "brand",
  "color",
  "typography",
  "text_content",
  "negative",
  "other",
];

export function getPromptSectionKeyByVariable(variable: string): PromptSplitSectionKey | null {
  const normalizedVariable = normalizeVariableKey(variable);
  const match = Object.entries(promptSectionMeta).find(
    ([key, meta]) =>
      key !== "other" &&
      (normalizeVariableKey(meta.variable) === normalizedVariable || normalizeVariableKey(key) === normalizedVariable),
  );

  return match ? (match[0] as PromptSplitSectionKey) : null;
}

const sectionDefinitions: SectionDefinition[] = [
  {
    key: "negative",
    priority: 110,
    keywords: [
      /不要|避免|排除|禁止|负面|反向|低质量|模糊|畸形|不夸张|不媚俗|不俗气|不过度|不油腻|不廉价|不违和|不刻意|不生硬|bad|blurry|low quality|negative|avoid/i,
    ],
  },
  {
    key: "lens_equipment",
    priority: 109,
    keywords: [/镜头器材|85mm|35mm|50mm|定焦|广角|长焦|微距人像|复古胶片镜头|电影宽幅镜头|镜头压缩|广角畸变|lens|prime lens|wide angle|telephoto|macro portrait/i],
  },
  {
    key: "photography_style",
    priority: 108,
    keywords: [
      /摄影风格|韩系写真|欧美时尚大片|复古港风|中式暗调|私房纪实|商业高定|随手私人快照|油画人像|写真|时尚杂志封面|杂志封面|封面大片|封面摄影|fashion editorial|editorial cover|magazine cover|beauty editorial|snapshot|portrait photography/i,
    ],
  },
  {
    key: "film_medium",
    priority: 107,
    keywords: [/胶片|介质质感|柯达金?200|富士\s*400h|黑白胶片|宝丽来|拍立得|数码原生|ccd|imax|film stock|polaroid|digital native/i],
  },
  {
    key: "exposure_logic",
    priority: 106,
    keywords: [/曝光逻辑|过曝|欠曝|正常曝光|均衡曝光|高对比度硬调|低对比柔雾|逆光轮廓冲光|曝光|overexposed|underexposed|high contrast|low contrast/i],
  },
  {
    key: "image_effect",
    priority: 105,
    keywords: [/画面特效|暗角|镜头眩光|光斑散景|柔焦|雾化|颗粒|胶片划痕|色散|朦胧柔光|vignette|lens flare|bokeh|soft focus|grain|chromatic aberration/i],
  },
  {
    key: "subject_position",
    priority: 96,
    keywords: [
      /人物主体定位|主体定位|人物数量|单人|多人|双人|主体人物位置|画面占比|占据画面|视觉区域|视觉重心|主体层级|中心偏左|中心偏右|画面中央|画面中心|人物与镜头距离|近距离半身|身体朝向|面对镜头|侧向镜头|subject position|single subject|multiple subjects/i,
    ],
  },
  {
    key: "identity_attribute",
    priority: 87,
    keywords: [
      /基础身份|年龄|性别|人种|混血|气质标签|财阀|校园|御姐|少年|少女|熟女|青年|中年|儿童|小孩|老人|老年|男孩|女孩|女生|男生|女模特|男模特|女士|男士|男性|女性|gender|age|ethnicity|identity|young woman|young man|teenage girl|teenage boy/i,
    ],
  },
  {
    key: "age_character",
    priority: 93,
    keywords: [
      /年龄气质|年龄感|视觉年龄|少年感|青年感|成熟感|沉稳感|年轻化特征|青年阶段|清冷气质|温柔气质|自信气质|松弛气质|自然松弛|松弛感|活泼气质|高级感|文艺感|age character|visual age|temperament/i,
    ],
  },
  {
    key: "facial_structure",
    priority: 91,
    keywords: [
      /骨相|五官底层|脸型|脸部轮廓|鹅蛋脸|方圆脸|菱形脸|v脸|眉骨|鼻梁|鼻型|眼型|眼形|大眼睛|唇形|嘴唇|下颌线|颅顶|面部比例|facial structure|face shape|eye shape|nose shape|lip shape|jawline|brow bone/i,
    ],
  },
  {
    key: "face_shape",
    priority: 104,
    keywords: [/脸型轮廓|脸型|脸部轮廓|面部轮廓|鹅蛋脸|瓜子脸|圆脸|方脸|长脸|椭圆脸|V脸|下颌线|face shape|jawline/i],
  },
  {
    key: "eyebrow_detail",
    priority: 103,
    keywords: [/眉毛细节|眉毛|眉形结构|眉形自然|平直眉|弯眉|眉峰|眉毛粗细|眉毛浓淡|眉毛弧度|eyebrow|brow shape/i],
  },
  {
    key: "eye_detail",
    priority: 103,
    keywords: [/眼睛眼神|眼睛|眼型|眼形|双眼皮|单眼皮|杏仁眼|狐狸眼|大眼睛|眼神方向|眼神|视线|凝视|看向镜头|偏离镜头|eye detail|eye shape|gaze/i],
  },
  {
    key: "nose_detail",
    priority: 103,
    keywords: [/鼻子结构|鼻子|鼻梁|鼻头|鼻型|高挺鼻梁|精致鼻型|立体鼻梁|nose detail|nose shape|bridge of nose/i],
  },
  {
    key: "lip_detail",
    priority: 103,
    keywords: [/嘴唇唇形|嘴唇|唇形|嘴角|厚唇|薄唇|饱满唇形|嘴角状态|微笑状态|lip detail|lip shape|mouth corner/i],
  },
  {
    key: "skin_base",
    priority: 92,
    keywords: [/皮肤基底|冷白皮|暖黄皮|蜜色|健康皮|肤质|细腻无暇|自然毛孔|轻微雀斑|泛红破碎感|skin base|skin tone|freckles|pores/i],
  },
  {
    key: "skin_texture",
    priority: 103,
    keywords: [/肤质纹理|皮肤纹理|皮肤细节|毛孔表现|毛孔|肌理|细微肌理|皮肤细腻度|通透程度|自然光泽|轻微光泽|真实质感|skin texture|skin pores|skin gloss/i],
  },
  {
    key: "body_frame",
    priority: 92,
    keywords: [/身体结构|身材骨架|身材比例|身体状态|骨骼骨架|肩宽|肩部|腰线|头身比|四肢|腰臀比例|体态骨架|体态|单薄|丰满|健硕|高挑|纤细|曲线|S型曲线|body frame|body proportion|shoulder width|slender|hourglass/i],
  },
  {
    key: "native_facial_feature",
    priority: 92,
    keywords: [/原生面部特征|泪沟|卧蚕|颧骨|下颌痣|眼角弧度|原生特征|tear trough|aegyo sal|cheekbones|mole/i],
  },
  {
    key: "base_makeup",
    priority: 103,
    keywords: [/底妆|哑光雾面|水光透亮|伪素颜|轻薄底妆|斑驳氛围感底妆|foundation|matte base|glowy base/i],
  },
  {
    key: "eye_makeup",
    priority: 102,
    keywords: [/眉眼|眉形|眼影|眼线|睫毛|卧蚕提亮|眼睑下至|开眼角妆效|eye makeup|eyeshadow|eyeliner|lashes/i],
  },
  {
    key: "midface_makeup",
    priority: 101,
    keywords: [/面中妆|面中腮红|面中高光|面中修容|腮红|修容|高光|鼻梁高光|锁骨高光|雀斑|晒伤妆点|blush|contour|highlight|sunburn makeup/i],
  },
  {
    key: "lip_makeup",
    priority: 100,
    keywords: [/唇部|唇形修饰|口红|唇釉|哑光唇|镜面唇|丝绒唇|润唇|唇色|lip makeup|lipstick|glossy lip/i],
  },
  {
    key: "special_makeup",
    priority: 99,
    keywords: [/特殊妆容|亮片|彩绘|晒伤妆|破碎感哭妆|复古红唇|极简裸妆|舞台浓妆|glitter|face painting|stage makeup/i],
  },
  {
    key: "hair_color",
    priority: 98,
    keywords: [/发色|纯黑发|冷棕|奶茶色|粉棕|白金发|红棕|挑染|渐变发色|hair color|highlights|ombre/i],
  },
  {
    key: "hair_length",
    priority: 97,
    keywords: [/发长|短发|锁骨发|长发|超长发|齐刘海|空气刘海|无刘海|中分|hair length|bangs/i],
  },
  {
    key: "hair_style",
    priority: 96,
    keywords: [/发型造型|大波浪|直发|高马尾|低盘发|丸子头|羊毛卷|湿发|凌乱碎发|油头|hairstyle|ponytail|bun|wet hair/i],
  },
  {
    key: "body_hair_detail",
    priority: 95,
    keywords: [/体毛细节|眉毛毛发感|睫毛浓密|鬓角碎发|胎毛|毛流|baby hair|sideburns/i],
  },
  {
    key: "face_accessory",
    priority: 94,
    keywords: [/面部配饰|耳钉|耳坠|耳骨钉|鼻钉|面饰|珍珠面纱|金丝眼镜|黑框眼镜|墨镜|earring|nose ring|glasses|sunglasses/i],
  },
  {
    key: "neck_accessory",
    priority: 93,
    keywords: [/颈部|锁骨链|项链|choker|珍珠锁骨链|钻石吊坠|丝巾|necklace|scarf/i],
  },
  {
    key: "hand_accessory",
    priority: 92,
    keywords: [/手部配饰|戒指|手链|手表|美甲款式|ring|bracelet|watch|manicure/i],
  },
  {
    key: "head_accessory",
    priority: 91,
    keywords: [/头部配饰|珍珠头饰|头饰|发饰|发簪|发箍|发夹|丝带|贝雷帽|礼帽|棒球帽|帽子|headband|hair clip|ribbon|hat|beret/i],
  },
  {
    key: "body_accessory",
    priority: 90,
    keywords: [/身体配饰|披肩|手套|腰链|胸针|shawl|gloves|waist chain|brooch/i],
  },
  {
    key: "clothing_style",
    priority: 94,
    keywords: [/服装风格|居家服|华服|礼服|西装|休闲|复古旗袍|度假长裙|机车皮衣|针织|丝绒|羊绒|舞蹈服|舞裙|肚皮舞服|汉服|洛丽塔|制服|cosplay|outfit style|gown|suit|qipao|costume/i],
  },
  {
    key: "clothing_material",
    priority: 93,
    keywords: [/服装材质|衣物材质|面料|布料|冬类材质|夏类材质|秋冬材质|春夏材质|真丝|缎面|羊毛|蕾丝|牛仔|哑光棉|亮面皮革|薄纱|毛绒|fabric|silk|satin|lace|denim|leather|tulle/i],
  },
  {
    key: "clothing_color",
    priority: 92,
    keywords: [/服装颜色|全套色系|撞色|纯色|香槟|酒红|黑色套装|白色套装|低饱和服装|outfit color|champagne|burgundy/i],
  },
  {
    key: "clothing_cut",
    priority: 91,
    keywords: [/服装剪裁|吊带|抹胸|宽松|修身|高开叉|长款|短款|oversize|紧身|cut|strapless|slit|fitted/i],
  },
  {
    key: "costume_cultural_identity",
    priority: 109,
    keywords: [
      /服饰文化身份|文化身份识别|服装文化基因|历史地域服饰|传统服饰体系|东亚传统服饰体系|西方宫廷服饰体系|民族服饰体系|cultural identity|historical costume/i,
    ],
  },
  {
    key: "costume_country_region",
    priority: 109,
    keywords: [
      /国家地区体系|国家\/地区体系|地域体系|国家地区|中国服饰|日本服饰|韩国服饰|印度服饰|阿拉伯地区|英国服饰|法国服饰|意大利服饰|西班牙服饰|北欧服饰|墨西哥服饰|美国西部服饰|拉丁美洲服饰|西非服饰|北非服饰|撒哈拉地区|country region|national fashion/i,
    ],
  },
  {
    key: "costume_ethnic_system",
    priority: 109,
    keywords: [
      /民族体系|民族服饰|民族装饰|部族服饰|汉族服饰|和服体系|韩服体系|印度传统礼服|阿拉伯长袍体系|波斯服饰|蜡染服饰|ethnic system|ethnic costume/i,
    ],
  },
  {
    key: "costume_historical_period",
    priority: 109,
    keywords: [
      /历史时期|时间时期|时代识别|平安时代|江户时代|中世纪|文艺复兴时期|巴洛克时期|维多利亚时期|18世纪礼服|historical period/i,
    ],
  },
  {
    key: "costume_dynasty",
    priority: 109,
    keywords: [
      /历史朝代|朝代|先秦时期|先秦|汉代|唐代|宋代|明代|清代|中国明代|中国唐代|中国宋代|中国清代|dynasty/i,
    ],
  },
  {
    key: "costume_construction_system",
    priority: 109,
    keywords: [
      /服装形制|形制结构|形制分析|深衣体系|曲裾|直裾|交领右衽|高腰裙|立领|马面裙|旗装|盘扣|十二单|和服|羽织|袴|紧身胸衣|裙撑|长袍体系|garment construction/i,
    ],
  },
  {
    key: "costume_cutting_method",
    priority: 109,
    keywords: [
      /裁剪方式|裁剪体系|东方平面裁剪|平面裁剪|西方立体裁剪|立体裁剪|直线裁剪|大片布料|贴合身体|肩部结构|腰线塑造|cutting method/i,
    ],
  },
  {
    key: "costume_wearing_method",
    priority: 109,
    keywords: [
      /穿着方式|穿法|叠穿方式|衣片叠合|交领右衽|宽腰带固定|覆盖式穿着|包裹式穿着|层层叠穿|wearing method/i,
    ],
  },
  {
    key: "costume_layering_system",
    priority: 109,
    keywords: [
      /层次结构|层次系统|多层叠穿|外袍内衫|上衣下装层次|披帛层次|腰部层次|裙撑层次|layering system/i,
    ],
  },
  {
    key: "costume_complete_system",
    priority: 109,
    keywords: [
      /配套系统|完整造型|服饰配套系统|头饰发型上衣下装|腰部装饰|鞋履饰品|武器\/工具|发髻|发簪|披帛|玉饰|complete costume system/i,
    ],
  },
  {
    key: "costume_social_status",
    priority: 109,
    keywords: [
      /社会身份|社会属性|阶层身份|皇室贵族|文人士大夫|军事身份|宗教身份|贵重材料|金线刺绣|制服结构|权力象征|social status/i,
    ],
  },
  {
    key: "costume_craft",
    priority: 109,
    keywords: [
      /制作工艺|工艺分析|面料工艺|染织|刺绣|织锦|金线刺绣|蕾丝工艺|天鹅绒|盘扣工艺|针脚|craft|embroidery|brocade/i,
    ],
  },
  {
    key: "costume_symbolic_pattern",
    priority: 109,
    keywords: [
      /民族纹样符号|民族纹样|图案寓意|象征纹样|文化识别符号|龙凤|祥云|花鸟|樱花|鹤|波浪纹样|波浪图案|海浪纹样|花卉纹章|宫廷纹样|曼荼罗|symbolic pattern/i,
    ],
  },
  {
    key: "costume_aesthetic_language",
    priority: 109,
    keywords: [
      /服饰审美语言|审美特点|审美体系|东方含蓄|儒雅克制|华丽开放|清雅含蓄|端庄规整|克制精致|季节美学|奢华宫廷|aesthetic language/i,
    ],
  },
  {
    key: "costume_photography_presentation",
    priority: 109,
    keywords: [
      /服饰摄影呈现|摄影呈现|摄影表现层|摄影语言|影视造型|商业摄影复刻|历史服饰摄影|服装生成模型|costume photography/i,
    ],
  },
  {
    key: "costume_micro_details",
    priority: 109,
    keywords: [
      /服饰微观细节|服装微观细节|纤维|针脚|褶皱|衣缘|袖口细节|盘扣细节|织物肌理|刺绣针法|micro costume details/i,
    ],
  },
  {
    key: "leg_pose",
    priority: 87,
    keywords: [/腿部体态|交叉腿|屈膝|伸直腿|盘腿|单腿踮脚|腿部姿态|crossed legs|bent knee/i],
  },
  {
    key: "shoulder_neck_pose",
    priority: 87,
    keywords: [/肩颈体态|含肩|挺胸|歪头|侧脸低头|仰头|肩颈线条|tilted head|chin up/i],
  },
  {
    key: "facial_expression",
    priority: 87,
    keywords: [/面部表情|神态|冷淡疲惫|慵懒放空|淡淡浅笑|破碎委屈|冷艳疏离|温柔柔和|慵懒半醉|清冷厌世|直视镜头|侧视|闭眼松弛|expression|gaze/i],
  },
  {
    key: "nail_detail",
    priority: 82,
    keywords: [/指甲|美甲|裸色美甲|碎钻美甲|短甲|长甲|nails|manicure/i],
  },
  {
    key: "tattoo_detail",
    priority: 81,
    keywords: [/纹身|手臂纹身|锁骨纹身|tattoo/i],
  },
  {
    key: "skin_detail",
    priority: 91,
    keywords: [/皮肤附加|锁骨高光|肩颈线条|轻微泛红|水光肌肤|肌肤质感|skin detail|glowing skin/i],
  },
  {
    key: "portrait_photography",
    priority: 86,
    keywords: [
      /人像摄影参数|人像镜头|85mm人像|85mm\s*人像|大光圈浅景深|人像摄影质感|专业人像摄影|面部高清细节|半身构图|肖像镜头|portrait lens|portrait photography detail/i,
    ],
  },
  {
    key: "portrait_lighting_color",
    priority: 85,
    keywords: [
      /人像光影色彩|人像光线|人物受光|面部受光|肤色光泽|左前方柔光|右前方柔光|均匀明暗过渡|低饱和人像色调|低饱和暖色调|自然高级人像|portrait lighting|portrait color/i,
    ],
  },
  {
    key: "scene_identity",
    priority: 84,
    keywords: [
      /场景类型定位|场景类型|空间类别|场景属性|室内空间|室外环境|城市空间|自然环境|商业空间|居住空间|工业空间|高端住宅|现代极简住宅空间|开放式客厅|酒店大堂|海边场景|森林场景|街头场景|顶层公寓|海边露台|古堡书房|豪车后座|酒店宴会厅|卧室|花园|泳池|咖啡馆|scene identity|scene type/i,
    ],
  },
  {
    key: "spatial_structure",
    priority: 84,
    keywords: [
      /空间结构|空间布局|三层空间结构|前景区域|中景区域|后景区域|主要活动区域|空间纵深|自然光入口|墙面和窗户|spatial structure|spatial layout/i,
    ],
  },
  {
    key: "spatial_scale",
    priority: 84,
    keywords: [
      /空间比例尺度|空间尺度|尺度宽敞|天花板高度|层高|空间宽度|开阔|狭窄|紧凑|大型落地窗|家具尺寸|家具占空间比例|人与环境比例|spatial scale|room scale/i,
    ],
  },
  {
    key: "scene_perspective",
    priority: 84,
    keywords: [
      /场景透视关系|透视关系|一点透视|单点透视|两点透视|消失点|广角透视|空间线条|人眼高度|桌面高度|镜头高度|低机位空间|scene perspective|vanishing point/i,
    ],
  },
  {
    key: "scene_layering",
    priority: 84,
    keywords: [
      /前中后景分层|场景层级|前景层|中景层|背景层|前景存在|中景区域|背景为|遮挡关系|虚化程度|主要视觉中心|layer breakdown|foreground layer|middle ground|background layer/i,
    ],
  },
  {
    key: "architecture_structure",
    priority: 84,
    keywords: [
      /建筑空间结构|建筑结构|墙体|门窗|落地玻璃窗|黑色金属窗框|吊顶|横梁|天花板|地面结构|墙面材质|建筑线条|architecture structure|architectural detail/i,
    ],
  },
  {
    key: "object_elements",
    priority: 84,
    keywords: [
      /主要物体元素|物体元素|重要物体|物体数量|空间中央摆放|低矮布艺沙发|圆形木质茶几|两盏灯|三盆植物|家具主体|家具边缘线条|object elements|scene objects/i,
    ],
  },
  {
    key: "material_texture",
    priority: 84,
    keywords: [
      /场景材质纹理|材质纹理分析|表面材质|木材纹理|木质纹理|金属反光|玻璃透明度|石材颗粒|布料纤维|低反射质感|半哑光|高反光|material texture|surface material/i,
    ],
  },
  {
    key: "scene_color_palette",
    priority: 84,
    keywords: [
      /场景色彩体系|色彩体系|主色|辅色|点缀色|米白和浅木色|浅木色|深木色|绿色植物作为视觉点缀|低饱和自然色调|莫兰迪场景|scene color palette|color palette/i,
    ],
  },
  {
    key: "scene_lighting",
    priority: 84,
    keywords: [
      /场景光影关系|场景光线|光线分析|光源位置|右侧大面积窗户|左侧大面积窗户|自然光柔和扩散|地面形成细腻明暗变化|阴影边缘较软|阴影方向|阴影长度|scene lighting/i,
    ],
  },
  {
    key: "scene_atmosphere",
    priority: 84,
    keywords: [
      /场景氛围情绪|场景氛围|空间氛围|整体氛围|氛围安静|氛围舒适|午后自然光环境|清晨氛围|黄昏氛围|夜晚氛围|居住场景|工作场景|商业展示|生活方式感|scene atmosphere/i,
    ],
  },
  {
    key: "scene_photography",
    priority: 84,
    keywords: [
      /场景摄影参数|场景摄影|建筑摄影|室内设计摄影|生活方式摄影|35mm广角镜头|35mm环境摄影|24mm广角|50mm自然视角|全景清晰|较深景深|专业室内摄影效果|scene photography|interior photography/i,
    ],
  },
  {
    key: "scene_micro_details",
    priority: 84,
    keywords: [
      /场景微观细节|细节增强层|微观细节|小物件|书籍|花瓶|灯具|摆件|轻微灰尘|轻微使用痕迹|使用痕迹|自然褶皱|真实随机性|不完全对称|自然摆放|植物叶片形态|scene micro details|micro details/i,
    ],
  },
  {
    key: "food_category",
    priority: 91,
    keywords: [
      /食物大类别|食物类别|食物分类|主食类|肉类|甜品|饮品|小吃|面食|米饭|面包|披萨|汉堡|牛排|烤鸡|烤肉|海鲜|蛋糕|饼干|巧克力|冰淇淋|咖啡|茶饮|果汁|鸡尾酒|炸物|糕点|点心|food category/i,
    ],
  },
  {
    key: "food_specific_identity",
    priority: 94,
    keywords: [
      /具体名称识别|具体食物身份|食物身份|品种名称|商业名称|法式可颂|牛角面包|草莓奶油戚风蛋糕|戚风蛋糕|日式照烧鸡肉盖饭|番茄肉酱意面|玛格丽特披萨|薄底披萨|冰拿铁|厚切谷饲牛排|food specific identity|specific food/i,
    ],
  },
  {
    key: "food_cuisine_style",
    priority: 93,
    keywords: [
      /菜系分类|菜系归属|地域料理类型|料理风格|菜系|地域类型|亚洲料理|欧洲料理|美洲料理|中餐|日料|韩餐|泰餐|越南料理|印度料理|东南亚料理|法餐|意餐|西班牙料理|德国料理|地中海料理|美式料理|墨西哥料理|拉美料理|中东料理|土耳其料理|非洲料理|日式|法式|意式|中式|泰式|韩式|美式|西式|现代法式料理|高级餐厅|家常料理|街头美食|cuisine style|culinary style/i,
    ],
  },
  {
    key: "cuisine_cultural_origin",
    priority: 92,
    keywords: [
      /地域文化来源|文化来源|饮食文化|东方饮食氛围|季节感|共享式饮食文化|家庭聚餐|江户前|传统日式|传统中餐|现代法式|意式家庭|街头饮食文化|cultural origin|food culture/i,
    ],
  },
  {
    key: "cuisine_ingredient_system",
    priority: 92,
    keywords: [
      /典型食材体系|食材体系|食材组合习惯|新鲜鱼类|海藻|季节性食材|多种食材组合|荤素搭配|高品质肉类|番茄|橄榄油|奶酪|香草|辣椒|椰奶|玉米|豆类|ingredient system|signature ingredients/i,
    ],
  },
  {
    key: "cuisine_flavor_visual",
    priority: 92,
    keywords: [
      /味型视觉表达|味型表达|酸辣香|酸辣|辣味|酱汁光泽|汤汁|油亮光泽|镬气|热气|酱汁线条|香料元素|热带风味|风味联想|flavor visual|flavour visual/i,
    ],
  },
  {
    key: "cuisine_plating_habit",
    priority: 92,
    keywords: [
      /传统摆盘习惯|摆盘逻辑|菜系摆盘|留白|极简摆盘|平衡摆盘|艺术构图|精准位置|酱汁轨迹|小菜组合|组合摆盘|共享式摆盘|粗犷食材组合|plating habit|plating logic/i,
    ],
  },
  {
    key: "cuisine_tableware_style",
    priority: 92,
    keywords: [
      /常用餐具风格|餐具选择|器皿特点|瓷盘|深色陶碗|木桌|手工陶器|木盘|小碟|金属碗|石锅|小盘组合|大面积白盘|简洁餐具|木质器皿|tableware style|ceramic bowl/i,
    ],
  },
  {
    key: "cuisine_color_gene",
    priority: 92,
    keywords: [
      /色彩基因|菜系色彩|中餐丰富色彩|日料白黑木色|韩餐红绿白|法餐低饱和高级灰|泰餐鲜艳高饱和|墨西哥明亮热烈|红色辣椒|绿色蔬菜|白色米饭|红绿白|白黑木色|原材料自然色|低饱和高级灰|明亮热烈色彩|color DNA|cuisine color/i,
    ],
  },
  {
    key: "cuisine_spatial_context",
    priority: 91,
    keywords: [
      /空间环境特点|用餐氛围|家庭餐桌|木桌|厨房|家庭感|丰盛感|家庭聚餐|热闹氛围|街头感|高端餐厅环境|自然材质空间|spatial context|dining atmosphere/i,
    ],
  },
  {
    key: "cuisine_photography_style",
    priority: 91,
    keywords: [
      /摄影表现风格|菜系摄影风格|美食摄影风格|安静高级自然|温暖家庭感|奢华精品广告|自然质朴|热带风味摄影|街头美食氛围|低饱和色调|柔和侧光|food photography style/i,
    ],
  },
  {
    key: "food_main_ingredient",
    priority: 93,
    keywords: [
      /主体食材|核心食材|主要食材|牛肉|鸡肉|猪肉|鱼肉|虾|蟹|面条|米饭|面包胚|蛋糕胚|奶油|奶酪|芝士|马苏里拉|番茄酱|水果|炸鸡|ingredient main|main ingredient/i,
    ],
  },
  {
    key: "food_supporting_ingredient",
    priority: 92,
    keywords: [
      /辅助食材|点缀元素|调味料|装饰元素|香草|罗勒|坚果|柠檬片|花瓣|香料粉|酱汁|番茄片|芝麻|生菜|新鲜蔬菜|supporting ingredient|garnish/i,
    ],
  },
  {
    key: "food_structure_layer",
    priority: 92,
    keywords: [
      /结构层次|食物组成结构|多层结构|层叠结构|顶部面包|底部面包|奶油层|蛋糕层|蛋糕胚|夹心|底层|顶部覆盖|中间夹有|汉堡层次|蛋糕层次|structure layer|food layers/i,
    ],
  },
  {
    key: "food_physical_form",
    priority: 92,
    keywords: [
      /外形轮廓|食物形态结构|食物形态|圆形|长条形|方形|不规则形|切片|半切|撕开|薄片|厚切|表面平整|蓬松起伏|边缘不规则|physical form|food shape/i,
    ],
  },
  {
    key: "food_cooking_method",
    priority: 93,
    keywords: [
      /烹饪方式|加工方式|煎制|烤制|烘焙|油炸|蒸制|炖煮|烟熏|炒制|生食|高温煎制|高温烘焙|烤制痕迹|cooking method|baked|fried|grilled|roasted|steamed|smoked/i,
    ],
  },
  {
    key: "food_cooking_state",
    priority: 92,
    keywords: [
      /熟成状态|成熟程度|三分熟|五分熟|全熟|刚出炉|冷藏状态|冰镇|融化|轻微融化|流动|拉丝|冒热气|温热状态|cooking state|doneness|melted|steaming/i,
    ],
  },
  {
    key: "food_texture_visual",
    priority: 92,
    keywords: [
      /口感视觉表现|口感视觉化|酥脆感|柔软感|多汁感|裂纹|气泡|金黄色表皮|绵密|蓬松|细腻切面|油脂光泽|汁液|湿润表面|切面层次|texture visualization|crispy|juicy|fluffy/i,
    ],
  },
  {
    key: "food_freshness",
    priority: 92,
    keywords: [
      /新鲜程度|新鲜表现|新鲜采摘|表皮光泽|果肉水润|切面颜色鲜艳|叶片挺立|海鲜湿润|水润光泽|新鲜现做|freshness|fresh food/i,
    ],
  },
  {
    key: "food_portion",
    priority: 91,
    keywords: [
      /份量比例|食物比例|食物份量|单人份|分享装|精致小份|单人精致份量|尺寸适中|厚切|薄片|小巧|与餐盘比例协调|portion|serving size/i,
    ],
  },
  {
    key: "food_plating",
    priority: 92,
    keywords: [
      /摆盘方式|摆盘|餐盘|木质托盘|圆形木质托盘|精致摆盘|餐饮摆盘|高级餐厅摆盘|围绕主体摆放|视觉点缀|plating|food styling/i,
    ],
  },
  {
    key: "commercial_food_identity",
    priority: 92,
    keywords: [
      /商业定位|食物品牌化表达|高端餐饮|快餐广告|烘焙商品|外卖展示|餐饮广告|美食广告|手工制作|新鲜现做|高品质原料|食材品质|制作工艺|commercial food|food advertising/i,
    ],
  },
  {
    key: "product_identity",
    priority: 88,
    keywords: [
      /产品主体定位|产品类别|产品数量|产品主次关系|单品展示|产品组合|主品\+配件|主产品|厨房电器|家电|食品|美妆|数码产品|家居用品|商品主体|product identity|product category/i,
    ],
  },
  {
    key: "product_form",
    priority: 88,
    keywords: [
      /产品外观结构|产品外观|整体形态|产品形态|方形|圆柱形|流线型|几何结构|长宽比例|边缘弧度|柔和弧度|转角|曲面变化|product form|product shape/i,
    ],
  },
  {
    key: "product_position",
    priority: 88,
    keywords: [
      /产品摆放角度|产品角度|摆放方式|正面展示|45\s*度|前侧视角|侧面展示|顶部俯视|logo朝向镜头|功能区域朝向|平放|悬浮|倾斜|使用状态|product position|product angle/i,
    ],
  },
  {
    key: "product_composition_ratio",
    priority: 88,
    keywords: [
      /产品比例关系|产品占画面比例|产品占据画面约?\s*\d{1,3}%|产品面积|产品留白比例|产品四周空间|产品上下空间|产品视觉中心|产品中央偏上|产品黄金比例位置|composition ratio/i,
    ],
  },
  {
    key: "product_composition",
    priority: 88,
    keywords: [
      /产品构图布局|构图方式分析|产品构图|产品视觉路径|产品第一眼|产品视线集中|背景层次引导产品|产品中心构图|产品对称构图|产品三分构图|产品对角线构图|product composition/i,
    ],
  },
  {
    key: "product_material",
    priority: 88,
    keywords: [
      /产品材质纹理|产品材质|主材质|产品外壳|表面处理|亮面|哑光|磨砂|拉丝|金属纹理|塑料|金属|玻璃|陶瓷|木材|皮革|均匀颗粒质感|product material/i,
    ],
  },
  {
    key: "product_color",
    priority: 88,
    keywords: [
      /产品色彩体系|产品颜色|产品色彩|主色|辅助色|色彩关系|黑色主体|白色主体|深灰色主体|银色金属细节|金属边框|品牌标识色|高级灰|product color/i,
    ],
  },
  {
    key: "product_feature_detail",
    priority: 88,
    keywords: [
      /产品细节卖点|产品卖点|可见功能|设计亮点|触控区域|按钮|屏幕|接口|开关|隐藏式结构|精密拼接|特殊纹理|品牌标识|Logo|制造工艺|feature details/i,
    ],
  },
  {
    key: "product_supporting_elements",
    priority: 88,
    keywords: [
      /产品配件元素|配件与辅助元素|配件|辅助元素|充电线|包装|食材|杯子|相关使用道具|衬托尺寸|使用场景|增加生活感|supporting elements/i,
    ],
  },
  {
    key: "product_background",
    priority: 88,
    keywords: [
      /产品背景环境|电商背景|背景类型|纯色背景|渐变背景|场景背景|生活空间|背景材质|石材背景|木板背景|桌面背景|墙面背景|背景虚化程度|浅色极简空间环境|product background/i,
    ],
  },
  {
    key: "product_environment_relation",
    priority: 88,
    keywords: [
      /产品环境关系|产品与环境关系|接触关系|空间关系|放在桌面|木质台面|产品融入环境|产品独立展示|自然放置|真实使用关系|商业展示整洁感|product environment/i,
    ],
  },
  {
    key: "product_lighting",
    priority: 88,
    keywords: [
      /产品光影关系|产品光影|产品光线|商业摄影光影|产品高光|高光区域|边缘曲面|侧前方柔光|大面积柔光|产品表面均匀渐变|阴影过渡|product lighting/i,
    ],
  },
  {
    key: "product_photography",
    priority: 88,
    keywords: [
      /产品摄影参数|产品摄影|商业产品摄影|35mm产品摄影|50mm标准镜头|85mm压缩视角|中等景深|产品主体超高清|微距细节|产品主体清晰|packshot photography|product photography/i,
    ],
  },
  {
    key: "commercial_visual_style",
    priority: 88,
    keywords: [
      /商业视觉风格|电商风格|高级极简商业摄影|极简高级|科技未来|生活方式|奢侈精品|干净背景|精准光影|克制色彩|产品价值感|commercial style|commercial visual style/i,
    ],
  },
  {
    key: "product_micro_details",
    priority: 88,
    keywords: [
      /产品微观细节|微观真实细节|产品表面细节|真实材质纹理|轻微划痕|灰尘|光学细节|反射变化|折射|边缘光|微小角度偏差|自然阴影变化|真实摄影效果|product micro details/i,
    ],
  },
  {
    key: "location_scene",
    priority: 79,
    keywords: [/场地大类|顶层公寓|海边露台|古堡书房|豪车后座|酒店宴会厅|卧室|花园|泳池|咖啡馆|location|apartment|terrace|bedroom|garden|pool|cafe/i],
  },
  {
    key: "furniture_soft_decoration",
    priority: 78,
    keywords: [/软装家具|家具组合|家具|茶几|沙发|地毯|桌椅|落地镜|窗帘|抱枕|灯具摆件|furniture|sofa|carpet|curtain|mirror/i],
  },
  {
    key: "background_view",
    priority: 77,
    keywords: [/背景远景|城市夜景|海面落日|山林绿植|窗外雨天|街道霓虹|阴天天空|background view|city night|sunset|rainy window/i],
  },
  {
    key: "floor_material",
    priority: 76,
    keywords: [/地面材质|大理石|地毯地面|实木地板|沙滩|草坪|瓷砖|floor material|marble|wooden floor|tiles/i],
  },
  {
    key: "spatial_detail",
    priority: 75,
    keywords: [/空间细节|落地窗纱帘|毛绒软装|金属轻奢|复古雕花|极简留白|spatial detail|minimal space/i],
  },
  {
    key: "environment_weather",
    priority: 74,
    keywords: [/环境天气|室内无风|窗外下雨|薄雾|黄昏|深夜|正午晴天|weather|rain|mist|dusk|midnight|noon/i],
  },
  {
    key: "main_light_type",
    priority: 80,
    keywords: [/主光类型|伦勃朗硬光|柔光漫射|侧逆光|正面平光|顶光|底光|轮廓发光|rembrandt light|key light|rim light/i],
  },
  {
    key: "light_source",
    priority: 72,
    keywords: [/光源来源|落地灯|窗外月光|落日自然光|室内水晶灯|霓虹灯带|蜡烛火光|light source|moonlight|candlelight|neon strip/i],
  },
  {
    key: "light_temperature",
    priority: 71,
    keywords: [/光影色温|冷蓝调|暖黄烛光|冷暖对冲|中性白光|紫粉色霓虹|color temperature|warm light|cool light/i],
  },
  {
    key: "shadow_layer",
    priority: 70,
    keywords: [/阴影层次|深黑浓郁阴影|柔和浅阴影|无阴影平光|明暗对半分割|shadow layer|split lighting/i],
  },
  {
    key: "reflection_environment",
    priority: 69,
    keywords: [/反光环境|墙面反光|水面反光|玻璃镜面反光|金属家具反光|reflection|reflected light|mirror reflection/i],
  },
  {
    key: "mood_tone",
    priority: 76,
    keywords: [/情绪基调|清冷疏离|慵懒松弛|破碎伤感|富贵克制|温柔治愈|复古忧郁|冷淡厌世|性感高级|安静独处|微醺氛围感|mood tone/i],
  },
  {
    key: "foreground_occlusion",
    priority: 95,
    keywords: [/前景遮挡|薄纱前景遮挡|绿植前景遮挡|玻璃前景遮挡|水雾前景遮挡|光斑前景遮挡|窗帘前景遮挡|前景[^，。；;、]{0,12}遮挡|薄纱前景|绿植前景|玻璃前景|水雾前景|光斑前景|窗帘前景|薄纱遮挡|绿植遮挡|玻璃遮挡|水雾遮挡|光斑遮挡|窗帘遮挡|foreground occlusion|veil|foreground plants/i],
  },
  {
    key: "environment_prop",
    priority: 66,
    keywords: [/环境小道具|香薰蜡烛|高脚杯|书本|鲜花|地毯抱枕|摆件|environment prop|candle|goblet|flowers/i],
  },
  {
    key: "environment_effect",
    priority: 65,
    keywords: [/环境特效|漂浮灰尘|水雾雾气|窗外雨丝|飘落花瓣|空气灰尘|floating dust|mist|rain streaks|falling petals/i],
  },
  {
    key: "whitespace_composition",
    priority: 83,
    keywords: [/构图留白|大面积留白|紧凑满画面|侧边留白|顶部留白|negative space|whitespace|tight frame/i],
  },
  {
    key: "famous_person",
    priority: 105,
    keywords: [
      /著名人物|名人|明星|演员|歌手|导演|艺术家|政治人物|企业家|公众人物|《[^》]{1,48}》|【[^】]{1,48}】|「[^」]{1,48}」|\[[^\]]{1,48}\]|celebrity|famous person/i,
      /毕加索|弗里达|列宾|梵高|达芬奇|莫奈|宫崎骏|奥黛丽|玛丽莲|爱因斯坦|马斯克|乔布斯|pablo picasso|frida kahlo|repin|van gogh|da vinci|monet|audrey hepburn|marilyn monroe|einstein|musk|jobs/i,
    ],
  },
  {
    key: "brand",
    priority: 104,
    keywords: [
      /知名品牌|品牌|商标|logo|奢侈品|运动品牌|科技品牌|brand|trademark/i,
      /nike|adidas|apple|tesla|gucci|chanel|dior|lv|louis vuitton|prada|balenciaga|coca-?cola|starbucks|sony|canon|leica|宝马|奔驰|香奈儿|迪奥|古驰|耐克|阿迪达斯|苹果|特斯拉|可口可乐|星巴克|徕卡/i,
    ],
  },
  {
    key: "aspect_ratio",
    priority: 100,
    keywords: [
      /\b(?:1:1|3:3|16:9|9:16|4:3|3:4|2:3|3:2|21:9)\b/i,
      /横屏|竖屏|横构图|竖构图|横版|竖版|方图|方形画幅|宽屏|portrait orientation|landscape orientation|aspect ratio|horizontal|vertical/i,
    ],
  },
  {
    key: "image_style",
    priority: 108,
    keywords: [
      /浮世绘|ukiyo-?e|葛饰北斋|日本版画/i,
      /毕加索.{0,8}立体主义|立体主义|cubism|cubist/i,
      /弗里达.{0,8}超现实主义|超现实主义|surrealism|surrealist|梦境超现实/i,
      /列宾.{0,8}现实主义|现实主义|realism|realist|俄罗斯现实主义/i,
      /欧式古典风格?|pixar|皮克斯|卡通渲染风格/i,
      /2d\s*插画|二维插画|平面插画|2d illustration|flat illustration/i,
      /写实厚涂|厚涂写实|painterly realism|realistic impasto|厚涂/i,
      /赛博朋克|霓虹风格|cyberpunk|neon style/i,
      /水彩手绘|水彩画|手绘水彩|watercolor|hand-?drawn watercolor/i,
      /手稿|线稿|二次元|动漫|漫画|超写实|写实风|3d\s*渲染|cg\s*渲染|风格|画风|插画风|写实风|艺术风格|style|illustration style|art style|anime|manga|sketch|line art|3d render/i,
    ],
  },
  {
    key: "style_classification",
    priority: 109,
    keywords: [
      /风格类别|风格类型|风格类型识别|视觉风格体系|style classification/i,
      /极简主义|复古风|电影感|商业广告风|生活方式摄影风格|艺术摄影|minimalism|vintage|cinematic|commercial|lifestyle|fine art/i,
    ],
  },
  {
    key: "style_visual_movement",
    priority: 109,
    keywords: [
      /视觉流派|设计美学体系|视觉流派定位|visual movement/i,
      /北欧风|日式侘寂|侘寂|工业风|未来科技风|奢华高级风|scandinavian|wabi-?sabi|industrial|futuristic|luxury/i,
    ],
  },
  {
    key: "style_era",
    priority: 109,
    keywords: [
      /时代属性|年代审美|时代风格|era style/i,
      /古典时期|复古年代|千禧年代|Y2K|当代现代|古典建筑|20世纪50年代|contemporary modern/i,
    ],
  },
  {
    key: "style_cultural_origin",
    priority: 109,
    keywords: [
      /国家文化|文化地域|文化来源|地域属性|文化地域风格|cultural style|cultural origin/i,
      /东方美学|西方现代设计|地中海风格|阿拉伯风格|mediterranean|arabic/i,
    ],
  },
  {
    key: "style_aesthetic_tendency",
    priority: 109,
    keywords: [/审美体系|审美倾向|审美取向|aesthetic tendency|aesthetic system/i],
  },
  {
    key: "style_color_language",
    priority: 109,
    keywords: [/色彩语言|色彩风格|色彩风格分析|色彩数量|饱和度|色调体系|color style|color language/i],
  },
  {
    key: "style_composition_language",
    priority: 109,
    keywords: [
      /构图语言|构图风格|构图风格分析|构图类型|空间关系|视觉焦点|composition style|composition language/i,
    ],
  },
  {
    key: "style_lighting_language",
    priority: 109,
    keywords: [/光影语言|光影风格|光影风格分析|lighting style|lighting language/i],
  },
  {
    key: "style_material_language",
    priority: 109,
    keywords: [/材质语言|材质风格|材质风格分析|material language|material style/i],
  },
  {
    key: "style_spatial_language",
    priority: 109,
    keywords: [/空间语言|空间风格|空间风格分析|环境语言|spatial style|spatial language/i],
  },
  {
    key: "style_design_language",
    priority: 109,
    keywords: [/设计语言|设计语言分析|视觉设计原则|design language/i],
  },
  {
    key: "style_mood",
    priority: 109,
    keywords: [/情绪表达|情绪氛围分析|风格情绪|style mood/i],
  },
  {
    key: "style_commercial_positioning",
    priority: 109,
    keywords: [
      /风格商业定位|商业定位分析|品牌定位|用户群体|commercial positioning/i,
      /大众消费|轻奢|高端奢侈|年轻消费者|商务人士|家庭用户|中高端生活方式品牌/i,
    ],
  },
  {
    key: "style_keywords",
    priority: 109,
    keywords: [/风格关键词|关键词提炼|style keywords/i],
  },
  {
    key: "lighting_source_type",
    priority: 109,
    keywords: [
      /光源类型|光源定位|光源识别|自然光源|人造光源|多光源关系|太阳光|天空散射光|窗户光|摄影灯|吊灯|台灯|霓虹灯|light source identification|lighting source type/i,
    ],
  },
  {
    key: "lighting_source_position",
    priority: 109,
    keywords: [
      /光源位置|光源方位|光源来自|光源位于|画面左侧光源|画面右侧光源|左前方光源|右前方光源|背后光源|顶部光源|lighting source position/i,
    ],
  },
  {
    key: "lighting_direction",
    priority: 109,
    keywords: [
      /光线方向|入射方向|左侧入射|右侧入射|正面照射|背后逆光|顶部照射|光线由画面|light direction/i,
    ],
  },
  {
    key: "lighting_source_size",
    priority: 109,
    keywords: [/光源大小|光源面积|大面积自然光入口|大型柔光箱|点状光源|小型聚光灯|source size/i],
  },
  {
    key: "lighting_quality",
    priority: 109,
    keywords: [
      /光线硬软程度|光源性质|光质|硬光特征|柔光特征|阴影边缘清晰|阴影边缘柔和|hard light quality|soft light quality|light quality/i,
    ],
  },
  {
    key: "lighting_intensity",
    priority: 109,
    keywords: [
      /光线强弱|光线强度|整体亮度|局部亮度|高曝光|正常曝光|低调暗光|主体突出|背景压暗|light intensity/i,
    ],
  },
  {
    key: "lighting_ratio",
    priority: 109,
    keywords: [/光比关系|光比分析|低光比|中低光比|高光比|lighting ratio/i],
  },
  {
    key: "lighting_distribution",
    priority: 109,
    keywords: [
      /明暗分布|明暗结构|亮部集中|中间调覆盖|暗部位于|最亮区域|最暗区域|light dark distribution/i,
    ],
  },
  {
    key: "lighting_shadow_direction",
    priority: 109,
    keywords: [/阴影方向|阴影长度|向右后方延伸|向右延伸|向后投射|短阴影|长阴影|shadow direction/i],
  },
  {
    key: "lighting_shadow_quality",
    priority: 109,
    keywords: [/阴影软硬|阴影边缘|阴影密度|清晰锐利阴影|柔和扩散阴影|浅灰阴影|深黑阴影|shadow quality/i],
  },
  {
    key: "lighting_highlight",
    priority: 109,
    keywords: [
      /高光位置|高光表现|高光形态|金属边缘高光|皮肤表面高光|食物油脂高光|点状高光|条状高光|大面积反射|柔和亮斑|强烈反光|highlight analysis/i,
    ],
  },
  {
    key: "lighting_reflection_refraction",
    priority: 109,
    keywords: [
      /反射折射|反射与折射|环境倒影|水杯变形|透明材质光线变化|自然折射|reflection refraction/i,
    ],
  },
  {
    key: "lighting_material_response",
    priority: 109,
    keywords: [
      /材质响应|材质光影响应|材质光学响应|金属强反射|木材柔和漫反射|皮肤半透明散射|布料吸光|material response/i,
    ],
  },
  {
    key: "lighting_environment",
    priority: 109,
    keywords: [/环境光照|空间光照关系|墙面反射|天空补光|空气感|空间层次|environmental lighting/i],
  },
  {
    key: "lighting_color_temperature",
    priority: 109,
    keywords: [/色温色彩|色温与色彩|光色分析|暖光色温|冷光色温|混合光|偏暖色温|冷暖平衡|color temperature/i],
  },
  {
    key: "lighting_time_weather",
    priority: 109,
    keywords: [
      /时间天气|时间环境|清晨光线|上午光线|午后光线|黄昏光线|夜晚光线|晴天光照|阴天光照|雨天光照|time weather/i,
    ],
  },
  {
    key: "lighting_mood",
    priority: 109,
    keywords: [/光影氛围|氛围情绪|光影情绪|温暖生活感|高级商业感|电影感光影|lighting mood/i],
  },
  {
    key: "lighting_setup",
    priority: 109,
    keywords: [
      /摄影灯光方案|灯光方案|布光方案|主光辅光|左侧大型柔光箱|右侧弱补光|轻微轮廓光|photography lighting setup/i,
    ],
  },
  {
    key: "lighting_micro_details",
    priority: 109,
    keywords: [
      /微观光学细节|微观光影细节|边缘光细节|漫反射细节|次级反射|空气光|体积光|光尘|光雾|micro lighting details/i,
    ],
  },
  {
    key: "prop_identification",
    priority: 109,
    keywords: [
      /道具识别|道具主体识别|辅助物识别|辅助道具|生活类道具|商业类道具|食品类道具|人像类道具|杯子|书籍|花瓶|香薰|台灯|包装盒|品牌卡片|展示架|标签|食材|餐具|调味瓶|包包|眼镜|乐器|运动装备|prop identification|supporting objects/i,
    ],
  },
  {
    key: "prop_category",
    priority: 109,
    keywords: [/道具类别|道具属性|装饰型道具|功能型道具|品牌型道具|生活类|商业类|食品类|人像类|prop category/i],
  },
  {
    key: "prop_purpose",
    priority: 109,
    keywords: [
      /道具功能作用|道具作用|功能作用|强化主体|表达尺度|增加真实性|营造情绪|建立使用场景|场景叙事功能|prop purpose/i,
    ],
  },
  {
    key: "prop_quantity_grouping",
    priority: 109,
    keywords: [/数量组合关系|数量与组合关系|道具数量|单个道具|少量组合|多元素堆叠|成组出现|层级组合|quantity grouping/i],
  },
  {
    key: "prop_spatial_position",
    priority: 109,
    keywords: [
      /道具空间位置|空间位置|道具方位|主体左前方|主体右侧|紧贴主体|周围环绕|远距离背景|部分遮挡产品|位于主体之后|spatial position/i,
    ],
  },
  {
    key: "prop_scale_relationship",
    priority: 109,
    keywords: [/道具尺寸比例|尺寸比例|尺寸比例关系|相对主体大小|小型点缀|同等比例|大型背景元素|体现物体大小|scale relationship/i],
  },
  {
    key: "prop_shape_structure",
    priority: 109,
    keywords: [
      /道具外形结构|外形结构|形态结构|圆形道具|方形道具|不规则轮廓|杯口|杯身|把手|底座|书籍封面|书本封面|书页|shape structure/i,
    ],
  },
  {
    key: "prop_material_texture",
    priority: 109,
    keywords: [/道具材质纹理|道具材质|材质纹理|木材|金属|陶瓷|玻璃|纸张|布料|光滑|粗糙|磨砂|反光|material texture/i],
  },
  {
    key: "prop_color_relationship",
    priority: 109,
    keywords: [
      /道具色彩关系|色彩关系|道具自身颜色|白色陶瓷|深色木材|对比色|统一色|融入背景|提供点缀|低饱和自然色调|color relationship/i,
    ],
  },
  {
    key: "prop_arrangement",
    priority: 109,
    keywords: [/道具摆放方式|摆放方式|人为摆放|自然摆放|动态摆放|整齐对称|商业感|随意|生活痕迹|倾斜|打开|使用中|arrangement/i],
  },
  {
    key: "prop_usage_state",
    priority: 109,
    keywords: [/道具使用状态|使用状态|未使用|新包装|整齐摆放|使用中|杯中有饮品|书本打开|翻开的页面|轻微杂乱|usage state/i],
  },
  {
    key: "prop_subject_relationship",
    priority: 109,
    keywords: [/主体关联关系|与主体关系|道具主体关系|衬托关系|对比关系|场景关系|围绕主体|强化产品定位|subject relationship/i],
  },
  {
    key: "prop_lighting_interaction",
    priority: 109,
    keywords: [
      /道具光影表现|光影表现|道具受光|玻璃反光|投射阴影|金属倒影|侧向柔光|自然接触阴影|lighting interaction/i,
    ],
  },
  {
    key: "prop_style_identity",
    priority: 109,
    keywords: [/道具风格属性|风格属性|极简高级|日式自然|复古风道具|科技风道具|天然材质|黄铜|皮革|LED|style identity/i],
  },
  {
    key: "prop_narrative_function",
    priority: 109,
    keywords: [/故事氛围|故事功能|叙事功能|场景故事|悠闲下午|办公状态|烹饪过程|视觉叙事|情境表达|narrative function/i],
  },
  {
    key: "prop_micro_details",
    priority: 109,
    keywords: [
      /道具微观细节|微观细节|杯壁水珠|纸张纹理|木纹细节|灰尘颗粒|轻微倾斜|自然散落|翻折|磨损|micro details/i,
    ],
  },
  {
    key: "shot_size",
    priority: 96,
    keywords: [
      /大特写|极特写|特写|近景|中景|远景|全景|大全景|全身景|半身景/i,
      /extreme close-?up|close-?up|medium shot|long shot|wide shot|full shot|panorama|establishing shot/i,
    ],
  },
  {
    key: "camera_angle",
    priority: 94,
    keywords: [/拍摄角度|视角|机位|俯拍|高角度|俯视|仰视|平视|侧视|鸟瞰|航拍|顶视|低机位|高机位|斜角|正面(?:角度|透视)|三维透视|dutch angle|top view|low angle|high angle|eye level|aerial/i],
  },
  {
    key: "hand_prop",
    priority: 92,
    keywords: [/手上道具|手持|手里拿|手中拿|口中叼|嘴里叼|叼着|拿着|握着|捧着|举着|托着|holding|held in hand|in hand/i],
  },
  {
    key: "hand_gesture",
    priority: 91,
    keywords: [/手部|手势|手指|双手|单手|指尖|握拳|比心|摊手|抬手|合十|hand gesture|hands?|fingers?|gesture/i],
  },
  {
    key: "face_makeup",
    priority: 90,
    keywords: [/面部|脸部|五官|妆容|眼妆|唇妆|腮红|睫毛|眼线|眉形|皮肤|肤色|face|facial|makeup|lipstick|eyeliner|skin tone/i],
  },
  {
    key: "hair_accessory",
    priority: 89,
    keywords: [/发型|头发|刘海|卷发|长发|短发|盘发|编发|头饰|发饰|发簪|皇冠|帽子|hair|hairstyle|bangs|headpiece|hair accessory|headdress/i],
  },
  {
    key: "clothing",
    priority: 88,
    keywords: [/身披|身着|服装|衣服|上衣|外套|裙|裤|华服|礼服|婚纱|旗袍|盔甲|制服|材质|刺绣|蕾丝|丝绸|clothing|outfit|dress|suit|jacket|fabric|embroidery/i],
  },
  {
    key: "pose",
    priority: 86,
    keywords: [/动作|姿态|姿势|站姿|坐姿|蹲姿|奔跑|跳跃|回眸|转身|倚靠|舞姿|pose|posture|standing|sitting|running|jumping|leaning/i],
  },
  {
    key: "depth_of_field",
    priority: 84,
    keywords: [/景深|浅景深|深景深|虚化|背景虚化|焦外|散景|清晰背景|depth of field|bokeh|shallow focus|deep focus|blurred background/i],
  },
  {
    key: "composition",
    priority: 82,
    keywords: [/构图|构图逻辑|居中|顶部中央|顶部中心|对称|三分法|黄金分割|留白|负空间|前景(?:中心|构图|层次)|画面中(?:央|心)|视觉中心|前景中心|背景中心|中景层次|背景层次|引导线|框架式|透视|composition|rule of thirds|symmetry|negative space|leading lines|perspective/i],
  },
  {
    key: "light_receiving",
    priority: 80,
    keywords: [/受光|侧受光|正面受光|背光|逆光轮廓|半明半暗|面部受光|主体受光|光线落在|lit from|frontlit|side lit|backlit|rim lit/i],
  },
  {
    key: "light_shadow",
    priority: 78,
    keywords: [/光影|阴影|高光|暗部|明暗|轮廓光|柔光|硬光|自然光|窗光|棚灯|霓虹光|反射光|lighting|light and shadow|shadow|highlight|soft light|hard light|neon light/i],
  },
  {
    key: "color_detail",
    priority: 76,
    keywords: [/色彩细节|色调|配色|低饱和|高饱和|冷暖|渐变|撞色|复古色|莫兰迪|金属色|荧光色|palette|color grading|tone|saturation|gradient|duotone/i],
  },
  {
    key: "atmosphere",
    priority: 74,
    keywords: [/氛围|气氛|情绪|梦幻|孤独|温柔|紧张|神秘|浪漫|高级感|未来感|复古感|atmosphere|mood|vibe|dreamy|romantic|mysterious|cinematic/i],
  },
  {
    key: "typography",
    priority: 72,
    keywords: [/字体|字形|排版字体|无衬线|衬线|手写体|书法体|粗体|细体|标题字|typography|font|typeface|serif|sans-?serif|lettering|calligraphy/i],
  },
  {
    key: "text_content",
    priority: 70,
    keywords: [/文本内容|文字内容|文案|标语|标题|副标题|字幕|海报文字|写着|包含文字|slogan|caption|subtitle|text reads|copywriting/i],
  },
  {
    key: "color",
    priority: 68,
    keywords: [/颜色|红色|橙色|黄色|绿色|青色|蓝色|紫色|粉色|黑色|白色|灰色|金色|银色|棕色|米色|color|colour|red|orange|yellow|green|blue|purple|pink|black|white|gray|gold|silver/i],
  },
];

export function splitPromptToTemplate(input: string): PromptSplitResult {
  const source = input.trim();

  if (!source) {
    return {
      source,
      sections: [],
      template: "",
      suggestedTags: [],
    };
  }

  const fragments = splitPromptFragments(resolvePromptTemplateText(source));
  const grouped = new Map<PromptSplitSectionKey, string[]>();

  for (const fragment of fragments) {
    for (const sectionKey of classifyPromptFragment(fragment)) {
      grouped.set(sectionKey, [...(grouped.get(sectionKey) ?? []), fragment]);
    }
  }

  const sections = promptSplitSectionOrder
    .map((key) => {
      const values = normalizeSectionValues(key, grouped.get(key) ?? []);

      if (values.length === 0 || key === "other") {
        return null;
      }

      return {
        ...promptSectionMeta[key],
        values,
      };
    })
    .filter((section): section is PromptSplitSection => section !== null);

  const template = sections
    .map((section) => `${section.label}：{{${section.variable}: ${section.values.join("，")}}}`)
    .join("\n");
  const suggestedTags = sections
    .filter((section) => section.key !== "negative")
    .flatMap((section) => section.values.filter((value) => value.trim() && value.trim() !== section.label))
    .slice(0, 15);

  return {
    source,
    sections,
    template,
    suggestedTags,
  };
}

export function resolvePromptTemplateText(
  input: string,
  options: { explicitParameters?: boolean } = {},
): string {
  const resolvedTemplateText = input
    .replace(/\{\{\s*([^}:]+)\s*:\s*([^}]+?)\s*\}\}/g, (_match, _key: string, value: string) => value.trim())
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => key.trim());

  if (!options.explicitParameters) {
    return resolvedTemplateText;
  }

  return resolvedTemplateText.replace(
    /【([^】]+?)】|（([^）]+?)）|［([^］]+?)］|\[([^\]]+?)\]|\(([^)]+?)\)|「([^」]+?)」|『([^』]+?)』|《([^》]+?)》|〈([^〉]+?)〉|〔([^〕]+?)〕|〖([^〗]+?)〗|〘([^〙]+?)〙|〚([^〛]+?)〛|﹁([^﹂]+?)﹂|﹃([^﹄]+?)﹄|｢([^｣]+?)｣|“([^”]+?)”|‘([^’]+?)’|｛([^｝]+?)｝|｟([^｠]+?)｠|＜([^＞]+?)＞/g,
    (...parts: Array<string | number>) =>
      parts
        .slice(1, -2)
        .find((value): value is string => typeof value === "string" && value !== undefined)
        ?.trim() ?? "",
  );
}

export function resolvePromptSectionKeyForValue(variable: string, value: string): PromptSplitSectionKey | null {
  const declaredSectionKey = getPromptSectionKeyByVariable(variable);

  if (!declaredSectionKey || declaredSectionKey === "negative") {
    return declaredSectionKey;
  }

  const normalizedValue = resolvePromptTemplateText(value).trim();

  if (!normalizedValue) {
    return declaredSectionKey;
  }

  const inferredSectionKeys = splitPromptToTemplate(normalizedValue)
    .sections
    .map((section) => section.key)
    .filter((sectionKey) => sectionKey !== "other" && sectionKey !== "negative");

  if (
    declaredSectionKey === "location_scene" &&
    inferredSectionKeys.some((sectionKey) => sectionKey === "scene_identity")
  ) {
    return declaredSectionKey;
  }

  if (inferredSectionKeys.length === 0 || inferredSectionKeys.some((sectionKey) => sectionKey === declaredSectionKey)) {
    return declaredSectionKey;
  }

  return inferredSectionKeys[0] ?? declaredSectionKey;
}

const imageStyleValuePatterns: RegExp[] = [
  /Octane\s*Render\s*(?:和|与|and|&)\s*Cinema\s*4D/iu,
  /Cinema\s*4D\s*(?:和|与|and|&)\s*Octane\s*Render/iu,
  /Octane\s*Render/iu,
  /Cinema\s*4D/iu,
  /浮世绘(?:\s*Ukiyo-?e)?/i,
  /毕加索立体主义(?:\s*Cubism)?/i,
  /弗里达超现实主义(?:\s*Surrealism)?/i,
  /列宾现实主义(?:\s*Realism)?/i,
  /欧式古典(?:风格|风)/u,
  /Pixar\s*卡通渲染风格/iu,
  /皮克斯\s*卡通渲染风格/u,
  /卡通渲染风格/u,
  /手稿风格/u,
  /线稿风格/u,
  /二次元风格/u,
  /动漫风格/u,
  /漫画风格/u,
  /写实风格/u,
  /超写实风格/u,
  /3D\s*渲染风格/iu,
  /CG\s*渲染风格/iu,
  /2D\s*插画风格/i,
  /写实厚涂风格/i,
  /赛博朋克霓虹风格/i,
  /水彩手绘风格/i,
  /(?:cyberpunk|neon)\s+style/i,
  /watercolor/i,
  /cubism/i,
  /surrealism/i,
  /realism/i,
];

export function normalizePromptSectionValue(sectionKey: PromptSplitSectionKey, input: string): string {
  const value = cleanSectionValue(sectionKey, input);
  const contextualValue = cleanContextualSectionValue(sectionKey, input);
  const replaceableValue = contextualValue || value;

  if (!replaceableValue || isPromptMetaInstructionValue(replaceableValue)) {
    return "";
  }

  if (sectionKey === "lens_equipment") {
    return normalizeLensEquipmentValue(value) || normalizeLensEquipmentValue(replaceableValue) || limitSectionValue(value);
  }

  if (sectionKey === "photography_style") {
    return normalizeContextualReplaceableValue(
      extractKnownValue(replaceableValue, [
        /真人摄影风格/u,
        /真人摄影/u,
        /实拍摄影风格/u,
        /人像摄影风格/u,
        /时尚摄影风格/u,
        /时尚杂志封面/u,
        /杂志封面/u,
        /封面大片/u,
        /封面摄影/u,
        /高定写真摄影/u,
        /商业摄影风格/u,
        /韩系写真/u,
        /欧美时尚大片/u,
        /复古港风/u,
        /中式暗调/u,
        /私房纪实/u,
        /商业高定/u,
        /随手私人快照/u,
        /油画人像/u,
        /magazine cover/i,
        /editorial cover/i,
        /beauty editorial/i,
        /fashion editorial/i,
        /portrait photography/i,
      ]) && !isSinglePromptToken(replaceableValue)
        ? replaceableValue
        : extractKnownValue(value, [
      /真人摄影风格/u,
      /真人摄影/u,
      /实拍摄影风格/u,
      /人像摄影风格/u,
      /时尚摄影风格/u,
      /时尚杂志封面/u,
      /杂志封面/u,
      /封面大片/u,
      /封面摄影/u,
      /高定写真摄影/u,
      /商业摄影风格/u,
      /韩系写真/u,
      /欧美时尚大片/u,
      /复古港风/u,
      /中式暗调/u,
      /私房纪实/u,
      /商业高定/u,
      /随手私人快照/u,
      /油画人像/u,
      /magazine cover/i,
      /editorial cover/i,
      /beauty editorial/i,
      /fashion editorial/i,
      /portrait photography/i,
        ]) || replaceableValue,
    );
  }

  if (sectionKey === "shot_size") {
    return extractShotSizeValue(value);
  }

  if (sectionKey === "aspect_ratio") {
    return extractAspectRatioValue(value);
  }

  if (sectionKey === "image_style") {
    return normalizeContextualReplaceableValue(
      extractKnownValue(replaceableValue, imageStyleValuePatterns) ||
        extractKnownValue(value, imageStyleValuePatterns) ||
        replaceableValue,
    );
  }

  if (sectionKey === "identity_attribute") {
    return normalizeIdentityAttributeValue(replaceableValue, value);
  }

  if (sectionKey === "famous_person") {
    return (
      extractDelimitedInnerValue(input) ||
      extractDelimitedInnerValue(replaceableValue) ||
      normalizeContextualReplaceableValue(extractPreciseSectionValue(sectionKey, value) || replaceableValue)
    );
  }

  if (sectionKey === "camera_angle") {
    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  if (sectionKey === "pose") {
    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  if (sectionKey === "leg_pose") {
    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  if (sectionKey === "hand_gesture") {
    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  if (sectionKey === "hand_prop") {
    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  if (sectionKey === "face_makeup") {
    if (!hasFaceMakeupCue(value) || isExpressionConstraintValue(value)) {
      return "";
    }

    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  if (sectionKey === "facial_expression" && isExpressionConstraintValue(value)) {
    return "";
  }

  if (sectionKey === "clothing") {
    return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
  }

  return normalizeContextualReplaceableValue(extractContextualSectionPhrase(sectionKey, replaceableValue) || replaceableValue);
}

export function parsePromptTemplateSegments(input: string): PromptTemplateSegment[] {
  const segments: PromptTemplateSegment[] = [];
  const pattern =
    /\{\{\s*([^}:]+?)\s*(?::\s*([^}]+?))?\s*\}\}|【([^】]+?)】|（([^）]+?)）|［([^］]+?)］|\[([^\]]+?)\]|\(([^)]+?)\)|「([^」]+?)」|『([^』]+?)』|《([^》]+?)》|〈([^〉]+?)〉|〔([^〕]+?)〕|〖([^〗]+?)〗|〘([^〙]+?)〙|〚([^〛]+?)〛|﹁([^﹂]+?)﹂|﹃([^﹄]+?)﹄|｢([^｣]+?)｣|“([^”]+?)”|‘([^’]+?)’|｛([^｝]+?)｝|｟([^｠]+?)｠|＜([^＞]+?)＞/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const startIndex = match.index;
    const source = match[0];
    const isTemplateParameter = source.startsWith("{{");
    const variable = isTemplateParameter ? (match[1] ?? "").trim() : "";
    const value = isTemplateParameter
      ? (match[2] ?? match[1] ?? "").trim()
      : (match.slice(3).find((matchedValue) => matchedValue !== undefined) ?? "").trim();

    if (startIndex > cursor) {
      segments.push({ type: "text", text: input.slice(cursor, startIndex) });
    }

    if (isTemplateParameter && variable && value) {
      segments.push({ type: "parameter", source, variable, value });
    } else if (!isTemplateParameter) {
      const explicitParameter = buildExplicitPromptParameterSegment(source, value);

      if (explicitParameter) {
        segments.push(explicitParameter);
      } else {
        segments.push({ type: "text", text: source });
      }
    } else {
      segments.push({ type: "text", text: source });
    }

    cursor = startIndex + source.length;
  }

  if (cursor < input.length) {
    segments.push({ type: "text", text: input.slice(cursor) });
  }

  return segments;
}

function buildExplicitPromptParameterSegment(source: string, value: string): PromptTemplateSegment | null {
  const normalizedValue = value.trim();

  if (!normalizedValue || isPromptMetaInstructionValue(normalizedValue)) {
    return null;
  }

  const inferredSectionKey = inferExplicitPromptParameterSectionKey(normalizedValue);
  const inferredValue = normalizePromptSectionValue(inferredSectionKey, normalizedValue);

  if (!inferredValue) {
    return null;
  }

  return {
    type: "parameter",
    source,
    variable: promptSectionMeta[inferredSectionKey].variable,
    value: inferredValue,
  };
}

function inferExplicitPromptParameterSectionKey(value: string): PromptSplitSectionKey {
  if (/\b(?:1:1|3:3|16:9|9:16|4:3|3:4|2:3|3:2|21:9)\b|横屏|竖屏|横版|竖版|方图/u.test(value)) {
    return "aspect_ratio";
  }

  if (/海报|广告|商业视觉|电商|商品展示|poster|advertising|commercial/i.test(value)) {
    return "commercial_visual_style";
  }

  if (/荔枝|水梨|雪梨|苹果|香蕉|橙子|柠檬|草莓|葡萄|桃子|芒果|水果|蔬果/u.test(value)) {
    return "food_main_ingredient";
  }

  const inferredSection = splitPromptToTemplate(value).sections.find(
    (section) => section.key !== "negative" && section.key !== "other",
  );

  if (inferredSection) {
    return inferredSection.key;
  }

  return "other";
}

function splitPromptFragments(input: string): string[] {
  return uniqueValues(
    input
      .replace(/\r\n/g, "\n")
      .replace(/([。！？!?])\s+/g, "$1\n")
      .split(/[\n,，。；;]+/)
      .map((fragment) => stripPromptMetaInstructionPrefix(fragment.trim()).trim())
      .filter((fragment) => fragment && !isPromptMetaInstructionValue(fragment)),
  );
}

function normalizeSectionValues(sectionKey: PromptSplitSectionKey, values: string[]): string[] {
  const normalizedValues = uniqueValues(values.flatMap((value) => normalizePromptSectionValues(sectionKey, value)).filter(Boolean));

  return sectionKey === "hand_prop" ? mergeRelatedHandPropValues(normalizedValues) : normalizedValues;
}

function normalizePromptSectionValues(sectionKey: PromptSplitSectionKey, input: string): string[] {
  const value = cleanSectionValue(sectionKey, input);

  if (!value) {
    return [];
  }

  if (sectionKey === "image_style") {
    const knownValues = extractKnownValues(value, imageStyleValuePatterns);

    if (knownValues.length > 0) {
      return knownValues;
    }
  }

  const normalizedValue = normalizePromptSectionValue(sectionKey, input);

  return normalizedValue ? [normalizedValue] : [];
}

const compositionCenterCuePattern = /画面中(?:央|心)|视觉中心|前景中心|背景中心|构图中心|居中(?:构图|排列|摆放)?/u;
const imageStyleContextPattern =
  /(?:风格|画风|主义|插画|渲染|厚涂|手绘|水彩|线稿|动漫|漫画|二次元|写实|style|ism|illustration|render|anime|manga|sketch)/iu;
const photographyStyleContextPattern = /(?:摄影风格|摄影|写真|大片|封面|实拍|portrait photography|editorial|photo)/iu;
const explicitImageStyleContextPattern =
  /(?:浮世绘|立体主义|超现实主义|现实主义|欧式古典|皮克斯|Pixar|赛博朋克|水彩|手绘|线稿|二次元|动漫|漫画|插画|厚涂|渲染|画风|style|ism|illustration|render|anime|manga|sketch)/iu;
const generationToolNamePatternSource = String.raw`(?:GPT[-\s]?Image\s*\d(?:\.\d)?|ChatGPT(?:\s*Image)?|DALL[-\s]?E|Midjourney|Stable\s*Diffusion|Flux|Imagen|Nano\s*Banana(?:\s*Pro|\s*2(?:\s*Lite)?)?|Gemini(?:\s*\d(?:\.\d)?)?|Seedream|Seedance|Kling|Veo|Sora)`;
const promptGenerationToolPrefixPattern = new RegExp(
  String.raw`^(?:请|帮我|使用|用|以|通过|基于)?\s*${generationToolNamePatternSource}\s*(?:生成|创建|制作|绘制|出图|画|produce|generate|create|render)\s*(?:一张|一幅|一个|图片|图像|照片|海报|image|picture|poster)?\s*`,
  "iu",
);
const promptGenericGenerationPrefixPattern =
  /^(?:请|帮我)?\s*(?:生成|创建|制作|绘制|画出|出图)\s*(?:一张|一幅|一个|图片|图像|照片|海报)?\s*/u;
const promptMetaInstructionPatterns: RegExp[] = [
  new RegExp(String.raw`^\s*${generationToolNamePatternSource}(?:\s+on\s+[\w.-]+)?\s*$`, "iu"),
  new RegExp(String.raw`${generationToolNamePatternSource}.{0,40}(?:prompts?|提示词)(?:\s*gallery)?`, "iu"),
  /\b(?:prompts?\s*gallery|prompt\s*library|seo|search engine optimization|webtomind)\b/i,
  /(?:适合|用于|面向|发布到|上传到|收录到).{0,30}(?:gallery|SEO|提示词库|图库|图集|画廊|搜索|关键词|关键字)/iu,
  /^(?:模型|生成模型|工具|平台|来源|网站|SEO|关键词|关键字|提示词来源)\s*[:：]/u,
];

function stripPromptMetaInstructionPrefix(input: string): string {
  return input.replace(promptGenerationToolPrefixPattern, "").replace(promptGenericGenerationPrefixPattern, "").trim();
}

function isPromptMetaInstructionValue(input: string): boolean {
  const value = input.trim();

  if (!value) {
    return false;
  }

  const withoutInstructionPrefix = stripPromptMetaInstructionPrefix(value);

  if (!withoutInstructionPrefix) {
    return true;
  }

  return promptMetaInstructionPatterns.some(
    (pattern) => pattern.test(value) || pattern.test(withoutInstructionPrefix),
  );
}

function classifyPromptFragment(fragment: string): PromptSplitSectionKey[] {
  if (isPromptMetaInstructionValue(fragment)) {
    return ["other"];
  }

  const candidates = buildPromptSectionCandidates(fragment);

  if (!candidates[0]) {
    return ["other"];
  }

  const primaryKey = candidates[0].key;
  const matchedKeys = candidates.map((candidate) => candidate.key);

  if (stripSectionLabelPrefix(primaryKey, fragment) !== fragment) {
    const explicitCandidates = candidates.filter((candidate) => candidate.explicitLabel);
    return selectPromptSectionCandidateKeys(
      explicitCandidates.length > 0 ? explicitCandidates : candidates.filter((candidate) => candidate.preciseCore),
    );
  }

  if (
    primaryKey === "camera_angle" &&
    matchedKeys.includes("composition") &&
    compositionCenterCuePattern.test(fragment)
  ) {
    return ["camera_angle", "composition"];
  }

  const expandedKeys = selectPromptSectionCandidateKeys(candidates);

  return expandedKeys.length > 0 ? expandedKeys : [primaryKey];
}

function buildPromptSectionCandidates(fragment: string): PromptSectionCandidate[] {
  const candidates = sectionDefinitions
    .map((definition) => buildPromptSectionCandidate(fragment, definition))
    .filter((candidate): candidate is PromptSectionCandidate => candidate !== null)
    .sort(comparePromptSectionCandidates);
  const strongestByKey = new Map<PromptSplitSectionKey, PromptSectionCandidate>();

  for (const candidate of candidates) {
    if (!strongestByKey.has(candidate.key)) {
      strongestByKey.set(candidate.key, candidate);
    }
  }

  return Array.from(strongestByKey.values()).sort(comparePromptSectionCandidates);
}

function buildPromptSectionCandidate(fragment: string, definition: SectionDefinition): PromptSectionCandidate | null {
  const explicitLabel = stripSectionLabelPrefix(definition.key, fragment) !== fragment;
  const keywordHits = definition.keywords.filter((keyword) => testPromptPattern(keyword, fragment)).length;

  if (!explicitLabel && keywordHits === 0) {
    return null;
  }

  const value = normalizePromptSectionValue(definition.key, fragment);

  if (!value) {
    return null;
  }

  const preciseCore = hasPreciseSectionCore(definition.key, fragment, value);
  const broadPenalty = broadFamilySectionKeys.has(definition.key) ? 12 : 0;
  const shortValueBonus = value.length <= 18 ? 6 : 0;
  const score =
    definition.priority +
    keywordHits * 6 +
    (explicitLabel ? 80 : 0) +
    (preciseCore ? 34 : 0) +
    shortValueBonus -
    broadPenalty;

  return {
    explicitLabel,
    fragment,
    key: definition.key,
    keywordHits,
    preciseCore,
    priority: definition.priority,
    score,
    value,
  };
}

function comparePromptSectionCandidates(first: PromptSectionCandidate, second: PromptSectionCandidate): number {
  if (second.score !== first.score) {
    return second.score - first.score;
  }

  if (Number(second.preciseCore) !== Number(first.preciseCore)) {
    return Number(second.preciseCore) - Number(first.preciseCore);
  }

  return second.priority - first.priority;
}

function selectPromptSectionCandidateKeys(candidates: PromptSectionCandidate[]): PromptSplitSectionKey[] {
  const topScore = candidates[0]?.score ?? 0;
  const selected: PromptSectionCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.explicitLabel && !candidate.preciseCore && candidate.score < topScore - 18) {
      continue;
    }

    const sameFamilyCandidates = selected.filter((selectedCandidate) =>
      isSameSectionFamily(selectedCandidate.key, candidate.key),
    );

    if (
      broadFamilySectionKeys.has(candidate.key) &&
      sameFamilyCandidates.some((selectedCandidate) => !broadFamilySectionKeys.has(selectedCandidate.key))
    ) {
      continue;
    }

    if (selected.some((selectedCandidate) => shouldPreferSelectedCandidate(selectedCandidate, candidate))) {
      continue;
    }

    for (let index = selected.length - 1; index >= 0; index -= 1) {
      const selectedCandidate = selected[index];

      if (!selectedCandidate) {
        continue;
      }

      if (
        (isSameSectionFamily(selectedCandidate.key, candidate.key) &&
          broadFamilySectionKeys.has(selectedCandidate.key) &&
          !broadFamilySectionKeys.has(candidate.key)) ||
        shouldPreferSelectedCandidate(candidate, selectedCandidate)
      ) {
        selected.splice(index, 1);
      }
    }

    if (!selected.some((selectedCandidate) => selectedCandidate.key === candidate.key)) {
      selected.push(candidate);
    }
  }

  return selected
    .map((candidate) => candidate.key)
    .sort((first, second) => promptSplitSectionOrder.indexOf(first) - promptSplitSectionOrder.indexOf(second));
}

function isSameSectionFamily(first: PromptSplitSectionKey, second: PromptSplitSectionKey): boolean {
  if (first === second) {
    return true;
  }

  return multiSectionFamilies.some((family) => family.includes(first) && family.includes(second));
}

function shouldPreferSelectedCandidate(
  selected: PromptSectionCandidate,
  candidate: PromptSectionCandidate,
): boolean {
  if (selected.key === candidate.key) {
    return selected.score >= candidate.score;
  }

  if (isTypographyTextCollision(selected, candidate)) {
    return selected.key === "typography";
  }

  if (isLightTypeShadowCollision(selected, candidate)) {
    return selected.key === "main_light_type";
  }

  if (isImageStyleFamousPersonCollision(selected, candidate)) {
    return selected.key === "image_style";
  }

  if (isForegroundOcclusionClothingCollision(selected, candidate)) {
    return selected.key === "foreground_occlusion";
  }

  if (isClothingColorCollision(selected, candidate)) {
    return selected.key !== "color";
  }

  if (isClothingFoodCollision(selected, candidate)) {
    return !foodSectionKeys.has(selected.key);
  }

  if (isTextFoodCollision(selected, candidate)) {
    return selected.key === "text_content";
  }

  if (isHandPropFoodCollision(selected, candidate)) {
    return selected.key === "hand_prop";
  }

  if (isLayoutCameraCollision(selected, candidate)) {
    return selected.key === "composition";
  }

  if (isPropSpecificCollision(selected, candidate)) {
    return propSectionKeys.has(selected.key);
  }

  if (isCostumeSpecificCollision(selected, candidate)) {
    return costumeSectionKeys.has(selected.key);
  }

  if (isFoodProductCollision(selected, candidate)) {
    return foodSectionKeys.has(selected.key);
  }

  if (isProductSpecificCollision(selected, candidate)) {
    return productSectionKeys.has(selected.key);
  }

  return false;
}

function isTypographyTextCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  if (!isSectionPair(first.key, second.key, "typography", "text_content")) {
    return false;
  }

  const textCandidate = first.key === "text_content" ? first : second;
  const typographyCandidate = first.key === "typography" ? first : second;
  const fragment = typographyCandidate.fragment;

  if (!/(?:字体|字形|排版|font|typeface|typography)/iu.test(fragment)) {
    return false;
  }

  return (
    typographyCandidate.value.includes(textCandidate.value) ||
    textCandidate.value.includes(typographyCandidate.value) ||
    /(?:标语|标题|副标题|字幕)[^，。；;、]{0,8}(?:字体|字形)/u.test(fragment)
  );
}

function isLightTypeShadowCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  if (!isSectionPair(first.key, second.key, "main_light_type", "light_shadow")) {
    return false;
  }

  const mainLightCandidate = first.key === "main_light_type" ? first : second;

  return mainLightCandidate.explicitLabel || mainLightCandidate.preciseCore;
}

function isImageStyleFamousPersonCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  if (!isSectionPair(first.key, second.key, "image_style", "famous_person")) {
    return false;
  }

  const imageStyleCandidate = first.key === "image_style" ? first : second;

  return hasImageStyleContext(imageStyleCandidate.fragment);
}

function isForegroundOcclusionClothingCollision(
  first: PromptSectionCandidate,
  second: PromptSectionCandidate,
): boolean {
  if (
    !isSectionPair(first.key, second.key, "foreground_occlusion", "clothing_material") &&
    !isSectionPair(first.key, second.key, "foreground_occlusion", "clothing")
  ) {
    return false;
  }

  const foregroundCandidate = first.key === "foreground_occlusion" ? first : second;

  return /前景.{0,12}(?:遮挡|薄纱|绿植|玻璃|水雾|光斑|窗帘)/u.test(foregroundCandidate.fragment);
}

function isClothingColorCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const clothingKeys = new Set<PromptSplitSectionKey>([
    "clothing",
    "clothing_style",
    "clothing_material",
    "clothing_color",
    "clothing_cut",
  ]);
  const firstIsClothing = clothingKeys.has(first.key);
  const secondIsClothing = clothingKeys.has(second.key);

  if (!(first.key === "color" && secondIsClothing) && !(second.key === "color" && firstIsClothing)) {
    return false;
  }

  const clothingCandidate = firstIsClothing ? first : second;

  return /(?:身穿|穿着|身披|身着|服装|衣着|穿搭|外套|裤|裙|华服|礼服)/u.test(clothingCandidate.fragment);
}

function isClothingFoodCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const clothingKeys = new Set<PromptSplitSectionKey>([
    "clothing",
    "clothing_style",
    "clothing_material",
    "clothing_color",
    "clothing_cut",
  ]);
  const firstIsClothing = clothingKeys.has(first.key);
  const secondIsClothing = clothingKeys.has(second.key);
  const firstIsFood = foodSectionKeys.has(first.key);
  const secondIsFood = foodSectionKeys.has(second.key);

  if (!(firstIsClothing && secondIsFood) && !(secondIsClothing && firstIsFood)) {
    return false;
  }

  const clothingCandidate = firstIsClothing ? first : second;

  return /(?:身穿|穿着|身披|身着|服装|衣着|穿搭|外套|裤|裙|华服|礼服|丝绸)/u.test(
    clothingCandidate.fragment,
  );
}

function isTextFoodCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  if (!isSectionPair(first.key, second.key, "text_content", "food_category")) {
    return false;
  }

  const textCandidate = first.key === "text_content" ? first : second;

  return /(?:文本|文字|文案|标语|标题|副标题|字幕|写着|slogan|caption|subtitle)/iu.test(textCandidate.fragment);
}

function isHandPropFoodCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const firstIsFood = foodSectionKeys.has(first.key);
  const secondIsFood = foodSectionKeys.has(second.key);

  if (!(first.key === "hand_prop" && secondIsFood) && !(second.key === "hand_prop" && firstIsFood)) {
    return false;
  }

  const handPropCandidate = first.key === "hand_prop" ? first : second;

  return /(?:口中叼着|嘴里叼着|手中拿着|手里拿着|手持|拿着|握着|捧着|举着|托着)/u.test(
    handPropCandidate.fragment,
  );
}

function isLayoutCameraCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  if (!isSectionPair(first.key, second.key, "composition", "camera_angle")) {
    return false;
  }

  const compositionCandidate = first.key === "composition" ? first : second;

  return /(?:排列|摆放|布局|画面中央|画面中心|前景中心|背景中心)/u.test(compositionCandidate.fragment);
}

function isProductSpecificCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const firstIsProduct = productSectionKeys.has(first.key);
  const secondIsProduct = productSectionKeys.has(second.key);

  if (firstIsProduct === secondIsProduct) {
    return false;
  }

  const productCandidate = firstIsProduct ? first : second;

  return (
    productCandidate.explicitLabel ||
    productCandidate.preciseCore ||
    productContextPattern.test(productCandidate.fragment)
  );
}

function isPropSpecificCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const firstIsProp = propSectionKeys.has(first.key);
  const secondIsProp = propSectionKeys.has(second.key);

  if (firstIsProp === secondIsProp) {
    return false;
  }

  const propCandidate = firstIsProp ? first : second;

  return (
    propCandidate.explicitLabel ||
    propCandidate.preciseCore ||
    /道具|辅助物|辅助道具|物件|小物|摆件|杯子|书籍|花瓶|香薰|台灯|包装盒|品牌卡片|展示架|标签|餐具|调味瓶|包包|眼镜|乐器|运动装备|咖啡杯|陶瓷杯|绿植|鲜花/u.test(
      propCandidate.fragment,
    )
  );
}

function isCostumeSpecificCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const firstIsCostume = costumeSectionKeys.has(first.key);
  const secondIsCostume = costumeSectionKeys.has(second.key);

  if (firstIsCostume === secondIsCostume) {
    return false;
  }

  const costumeCandidate = firstIsCostume ? first : second;

  return (
    costumeCandidate.explicitLabel ||
    /服饰|服装文化|历史服饰|民族服饰|朝代|汉服|和服|韩服|莎丽|唐代|宋代|明代|清代|平安时代|江户时代|中世纪|文艺复兴|巴洛克|维多利亚|裁剪|形制|纹样|盘扣|织锦|刺绣|针脚|褶皱/u.test(
      costumeCandidate.fragment,
    )
  );
}

function isFoodProductCollision(first: PromptSectionCandidate, second: PromptSectionCandidate): boolean {
  const firstIsFood = foodSectionKeys.has(first.key);
  const secondIsFood = foodSectionKeys.has(second.key);

  if (firstIsFood === secondIsFood) {
    return false;
  }

  const foodCandidate = firstIsFood ? first : second;
  const productCandidate = firstIsFood ? second : first;

  if (productCandidate.explicitLabel && !foodCandidate.explicitLabel && !foodCandidate.preciseCore) {
    return false;
  }

  return foodCandidate.explicitLabel || foodCandidate.preciseCore || foodContextPattern.test(foodCandidate.fragment);
}

function isSectionPair(
  first: PromptSplitSectionKey,
  second: PromptSplitSectionKey,
  expectedFirst: PromptSplitSectionKey,
  expectedSecond: PromptSplitSectionKey,
): boolean {
  return (
    (first === expectedFirst && second === expectedSecond) ||
    (first === expectedSecond && second === expectedFirst)
  );
}

function hasPreciseSectionCore(sectionKey: PromptSplitSectionKey, fragment: string, normalizedValue: string): boolean {
  const value = cleanSectionValue(sectionKey, fragment);

  if (!value) {
    return false;
  }

  if (extractPreciseSectionValue(sectionKey, value)) {
    return true;
  }

  if (sectionKey === "image_style" && (extractKnownValue(value, imageStyleValuePatterns) || hasImageStyleContext(value))) {
    return true;
  }

  if (sectionKey === "identity_attribute" && extractIdentityAttributeValue(value)) {
    return true;
  }

  if (sectionKey === "lens_equipment" && normalizeLensEquipmentValue(value)) {
    return true;
  }

  if (sectionKey === "photography_style" && normalizedValue !== limitSectionValue(value)) {
    return true;
  }

  return normalizedValue.length <= 12 && normalizedValue !== limitSectionValue(value);
}

function testPromptPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  const result = pattern.test(value);
  pattern.lastIndex = 0;

  return result;
}

function hasImageStyleContext(value: string): boolean {
  if (photographyStyleContextPattern.test(value) && !explicitImageStyleContextPattern.test(value)) {
    return false;
  }

  return imageStyleContextPattern.test(value);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeRelatedHandPropValues(values: string[]): string[] {
  if (
    values.length <= 1 ||
    values.length > 3 ||
    !values.every((value) => /^(?:口中叼着|嘴里叼着|手中拿着|手里拿着|手持|手握|手捧|拿着|握着|捧着|举着|托着)/u.test(value))
  ) {
    return values;
  }

  return [values.join("，")];
}

const multiSectionFamilies: PromptSplitSectionKey[][] = [
  [
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
  ],
  [
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
  ],
  [
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
  ],
  [
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
  ],
  ["subject_position", "identity_attribute", "age_character", "body_frame"],
  ["face_shape", "eyebrow_detail", "eye_detail", "nose_detail", "lip_detail", "facial_structure", "native_facial_feature"],
  ["skin_base", "skin_texture", "skin_detail"],
  ["base_makeup", "eye_makeup", "midface_makeup", "lip_makeup", "special_makeup", "face_makeup"],
  ["hair_color", "hair_length", "hair_style", "body_hair_detail", "hair_accessory", "head_accessory"],
  ["face_accessory", "neck_accessory", "hand_accessory", "body_accessory", "head_accessory"],
  ["clothing_style", "clothing_material", "clothing_color", "clothing_cut", "clothing"],
  ["pose", "hand_gesture", "leg_pose", "shoulder_neck_pose", "facial_expression"],
  ["lens_equipment", "portrait_photography", "scene_photography"],
  ["main_light_type", "light_source", "light_temperature", "shadow_layer", "reflection_environment", "light_receiving", "light_shadow", "portrait_lighting_color", "scene_lighting"],
  [
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
    "location_scene",
    "furniture_soft_decoration",
    "background_view",
    "floor_material",
    "spatial_detail",
    "environment_weather",
    "foreground_occlusion",
    "environment_prop",
    "environment_effect",
    "whitespace_composition",
    "color_detail",
    "mood_tone",
    "atmosphere",
  ],
  [
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
  ],
  [
    "food_category",
    "food_specific_identity",
    "food_cuisine_style",
    "cuisine_cultural_origin",
    "cuisine_ingredient_system",
    "cuisine_flavor_visual",
    "cuisine_plating_habit",
    "cuisine_tableware_style",
    "cuisine_color_gene",
    "cuisine_spatial_context",
    "cuisine_photography_style",
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
  ],
];

const broadFamilySectionKeys = new Set<PromptSplitSectionKey>([
  "lens_equipment",
  "identity_attribute",
  "facial_structure",
  "skin_base",
  "face_makeup",
  "hair_accessory",
  "clothing",
  "pose",
  "light_shadow",
  "location_scene",
  "furniture_soft_decoration",
  "background_view",
  "floor_material",
  "spatial_detail",
  "environment_weather",
  "foreground_occlusion",
  "environment_prop",
  "environment_effect",
  "whitespace_composition",
  "color_detail",
  "mood_tone",
  "atmosphere",
  "food_category",
  "food_cuisine_style",
]);

const propSectionKeys = new Set<PromptSplitSectionKey>([
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

const costumeSectionKeys = new Set<PromptSplitSectionKey>([
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

const productSectionKeys = new Set<PromptSplitSectionKey>([
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

const foodSectionKeys = new Set<PromptSplitSectionKey>([
  "food_category",
  "food_specific_identity",
  "food_cuisine_style",
  "cuisine_cultural_origin",
  "cuisine_ingredient_system",
  "cuisine_flavor_visual",
  "cuisine_plating_habit",
  "cuisine_tableware_style",
  "cuisine_color_gene",
  "cuisine_spatial_context",
  "cuisine_photography_style",
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
]);

const productContextPattern =
  /产品|商品|主品|配件|卖点|电商|商业摄影|产品摄影|包装|触控|接口|开关|logo|品牌标识|产品外壳|产品表面|product|packshot|commercial/i;
const foodContextPattern =
  /食物|菜品|美食|餐饮|料理|菜系|主食|肉类|甜品|饮品|小吃|食材|烹饪|烘焙|煎制|烤制|油炸|蒸制|熟成|口感|新鲜|摆盘|披萨|蛋糕|牛排|意面|咖啡|炸鸡|汉堡|food|cuisine|ingredient|plating/i;

function getMatchedSectionFamilyKeys(keys: PromptSplitSectionKey[]): PromptSplitSectionKey[] {
  const primaryKey = keys[0];

  if (!primaryKey) {
    return [];
  }

  for (const family of multiSectionFamilies) {
    if (!family.includes(primaryKey)) {
      continue;
    }

    const familyKeys = keys.filter((key) => family.includes(key));

    if (familyKeys.length === 0) {
      continue;
    }

    const preciseKeys = familyKeys.filter((key) => !broadFamilySectionKeys.has(key));

    return uniqueSectionKeys(preciseKeys.length > 0 ? preciseKeys : familyKeys);
  }

  return [];
}

function uniqueSectionKeys(keys: PromptSplitSectionKey[]): PromptSplitSectionKey[] {
  return Array.from(new Set(keys));
}

function cleanSectionValue(sectionKey: PromptSplitSectionKey, input: string): string {
  const value = stripPromptMetaInstructionPrefix(
    input
      .replace(/\{\{\s*([^}:]+)\s*:\s*([^}]+?)\s*\}\}/g, (_match, _key: string, value: string) => value.trim())
      .replace(/^[：:，,。.、；;\s]+|[：:，,。.、；;\s]+$/g, "")
      .replace(/^(?:当前|描述|内容|参数|画面|镜头|整体|场景)\s*[:：]\s*/u, "")
      .replace(/^(?:不要把|需要把|请把|强调|呈现|表现|形成|具备|具有|包含)\s*/u, "")
      .trim(),
  );

  return stripBoundarySymbols(stripContextualValuePrefix(
    sectionKey,
    value,
  ));
}

function cleanContextualSectionValue(sectionKey: PromptSplitSectionKey, input: string): string {
  const value = stripPromptMetaInstructionPrefix(
    input
      .replace(/\{\{\s*([^}:]+)\s*:\s*([^}]+?)\s*\}\}/g, (_match, _key: string, value: string) => value.trim())
      .replace(/^(?:当前|描述|内容|参数)\s*[:：]\s*/u, "")
      .trim(),
  );

  return normalizeContextualReplaceableValue(
    stripSectionLabelPrefix(sectionKey, value).replace(/^[\u4e00-\u9fffA-Za-z\s]{1,16}\s*[:：]\s*/u, ""),
  );
}

function normalizeContextualReplaceableValue(input: string): string {
  let value = stripBoundarySymbols(input);

  for (let index = 0; index < 4; index += 1) {
    const unwrapped = unwrapPairedBoundarySymbols(value);

    if (unwrapped === value) {
      break;
    }

    value = unwrapped;
  }

  return stripBoundarySymbols(value);
}

function stripBoundarySymbols(input: string): string {
  return input
    .replace(/^[\s:：,，.。;；、|/\\\-–—_+*=~!！?？]+|[\s:：,，.。;；、|/\\\-–—_+*=~!！?？]+$/gu, "")
    .replace(/^[()[\]{}（）【】《》「」『』“”"'‘’<>]+|[()[\]{}（）【】《》「」『』“”"'‘’<>]+$/gu, "")
    .trim();
}

function unwrapPairedBoundarySymbols(input: string): string {
  const value = input.trim();
  const wrappers: Array<[string, string]> = [
    ["《", "》"],
    ["【", "】"],
    ["[", "]"],
    ["(", ")"],
    ["（", "）"],
    ["「", "」"],
    ["『", "』"],
    ["“", "”"],
    ["‘", "’"],
    ['"', '"'],
    ["'", "'"],
  ];

  for (const [open, close] of wrappers) {
    if (value.startsWith(open) && value.endsWith(close)) {
      return stripBoundarySymbols(value.slice(open.length, value.length - close.length));
    }
  }

  return value;
}

function extractDelimitedInnerValue(input: string): string {
  const match = input.match(/[《【「『“"'‘\[(（]\s*([^《》【】「」『』“”"'‘’\[\]()（）\n\r，,。；;]{1,48}?)\s*[》】」』”"'’\])）]/u);

  return match?.[1] ? normalizeContextualReplaceableValue(match[1]) : "";
}

function isSinglePromptToken(input: string): boolean {
  const value = normalizeContextualReplaceableValue(input);

  return (
    value.length > 0 &&
    value.length <= 18 &&
    !/[，,。；;：:！？!?]/u.test(value) &&
    !/(?:使用|采用|通过|形成|营造|身穿|穿着|拿着|位于|背景|环境|画面|镜头|光线)/u.test(value)
  );
}

function normalizeIdentityAttributeValue(contextualValue: string, value: string): string {
  const delimitedValue = extractDelimitedInnerValue(contextualValue);

  if (delimitedValue) {
    return delimitedValue;
  }

  const normalizedContext = normalizeContextualReplaceableValue(contextualValue);
  const hasSubjectCue = /^(?:一位|一个|一名|单人|双人|多人|主体|人物|角色|模特|主角|女孩|男孩|女性|男性)/u.test(
    normalizedContext,
  );

  if (
    !hasSubjectCue &&
    /(?:照亮|打下来|光线|光源|背景|环境|画面|镜头|空间|位于|站在|坐在|拿着|身穿|穿着)/u.test(normalizedContext)
  ) {
    return "";
  }

  if (
    /^(?:一位|一个|一名|单人|双人|多人|主体|人物|角色|模特|主角|女孩|男孩|女性|男性)?(?:[\u4e00-\u9fffA-Za-z0-9\s-]{0,8})?(?:人物|角色|诗人|英雄|侠客|女士|男士|女性|男性|女孩|男孩|女生|男生|少女|少年|女人|男人)(?:气质|感|形象)?$/u.test(
      normalizedContext,
    )
  ) {
    return normalizedContext;
  }

  const preciseValue = extractIdentityAttributeValue(value);

  if (preciseValue && isSinglePromptToken(value)) {
    return normalizeContextualReplaceableValue(value);
  }

  return "";
}

function extractContextualSectionPhrase(sectionKey: PromptSplitSectionKey, input: string): string {
  const value = normalizeContextualReplaceableValue(input);
  const matchers: Partial<Record<PromptSplitSectionKey, RegExp[]>> = {
    clothing: [
      /(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:身穿|穿着|穿了|穿上|身披|身着|披着|搭配|服装为|服装是|衣着为|穿搭为|着).+?(?=(?:站在|坐在|位于|处于|置身|背景|环境|镜头|光线|$))/u,
    ],
    clothing_style: [
      /(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:身穿|穿着|穿了|穿上|身披|身着|披着|搭配|服装为|服装是|衣着为|穿搭为|着).+?(?=(?:站在|坐在|位于|处于|置身|背景|环境|镜头|光线|$))/u,
    ],
    clothing_material: [
      /(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:身穿|穿着|穿了|穿上|身披|身着|披着|搭配|服装为|服装是|衣着为|穿搭为|着).+?(?=(?:站在|坐在|位于|处于|置身|背景|环境|镜头|光线|$))/u,
    ],
    clothing_color: [
      /(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:身穿|穿着|穿了|穿上|身披|身着|披着|搭配|服装为|服装是|衣着为|穿搭为|着).+?(?=(?:站在|坐在|位于|处于|置身|背景|环境|镜头|光线|$))/u,
    ],
    clothing_cut: [
      /(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:身穿|穿着|穿了|穿上|身披|身着|披着|搭配|服装为|服装是|衣着为|穿搭为|着).+?(?=(?:站在|坐在|位于|处于|置身|背景|环境|镜头|光线|$))/u,
    ],
    hand_prop: [/(?:口中叼着|嘴里叼着|手中拿着|手里拿着|手持|手握|手捧|拿着|握着|捧着|举着|托着).+/u],
    hand_gesture: [/(?:单手|双手|手部|手指|指尖).*(?:手势|动作|姿态|托腮|合十|比心|整理头发)/u],
    pose: [/(?:站姿|坐姿|蹲姿|舞姿|姿态|姿势|动作|回眸|转身|奔跑|跳跃|倚靠).*/u],
    leg_pose: [/(?:腿部|下半身|交叉腿|屈膝|伸直腿|盘腿|踮脚).*(?:姿态|姿势|动作|张力)?/u],
    camera_angle: [/(?:高角度俯拍|高角度拍摄|俯拍|俯视|仰视|平视|侧面视角|低机位|高机位|鸟瞰|航拍|顶视).*/u],
    scene_identity: [/(?:站在|坐在|位于|处于|置身于?|在)[^，。；;]*(?:公寓|背景|场景|书桌|室内|户外|空间|房间|街道|海边|森林|城市|舞台|影棚|摄影棚|studio)?/u],
    location_scene: [/(?:站在|坐在|位于|处于|置身于?|在)[^，。；;]*(?:公寓|背景|场景|书桌|室内|户外|空间|房间|街道|海边|森林|城市|舞台|影棚|摄影棚|studio)?/u],
    color: [/[^\s在于，。；;、]{1,16}色背景/u],
    color_detail: [/[^\s在于，。；;、]{1,16}色背景/u],
  };

  const match = (matchers[sectionKey] ?? [])
    .map((pattern) => value.match(pattern)?.[0] ?? "")
    .find(Boolean);

  return match ? normalizeContextualReplaceableValue(match) : "";
}

function stripContextualValuePrefix(sectionKey: PromptSplitSectionKey, input: string): string {
  const withoutLabel = stripSectionLabelPrefix(sectionKey, input);
  const prefixPatterns: Partial<Record<PromptSplitSectionKey, RegExp[]>> = {
    style_classification: [/^(?:整体|图像|画面|视觉|风格)?(?:属于|采用|呈现为|是|为|定位为)\s*/u],
    style_visual_movement: [/^(?:整体|图像|画面|视觉|风格)?(?:属于|采用|呈现为|是|为|定位为)\s*/u],
    style_era: [/^(?:整体|图像|画面|视觉|风格)?(?:属于|融合|带有|呈现|是|为)\s*/u],
    style_cultural_origin: [/^(?:整体|图像|画面|视觉|风格)?(?:具有|属于|来自|源自|体现|呈现)\s*/u],
    style_aesthetic_tendency: [/^(?:整体|图像|画面|视觉|风格|审美)?(?:偏向|呈现|强调|体现|为|是)\s*/u],
    style_color_language: [/^(?:整体|图像|画面|色彩|配色)?(?:采用|使用|以|为|呈现|营造)\s*/u],
    style_composition_language: [/^(?:整体|图像|画面|构图)?(?:采用|通过|以|形成|突出|为|是)\s*/u],
    style_lighting_language: [/^(?:整体|图像|画面|光线|光影)?(?:采用|使用|通过|以|形成|为|是)\s*/u],
    style_material_language: [/^(?:整体|图像|画面|材质|材质组合)?(?:采用|使用|以|为主|体现|强化)\s*/u],
    style_spatial_language: [/^(?:整体|图像|画面|空间|环境)?(?:采用|呈现|通过|以|为|是)\s*/u],
    style_design_language: [/^(?:整体|图像|画面|设计语言)?(?:偏向|采用|通过|以|呈现|为|是)\s*/u],
    style_mood: [/^(?:整体|图像|画面|情绪|氛围)?(?:营造|传递|呈现|看起来|为|是)\s*/u],
    style_commercial_positioning: [/^(?:整体|图像|画面|视觉|风格)?(?:定位|服务于|面向|偏向|为|是)\s*/u],
    style_keywords: [/^(?:最后输出|关键词|风格关键词)?(?:为|是|包含|提炼为)?\s*/u],
    lighting_source_type: [/^(?:主要|整体)?(?:光源|光线)?(?:来自|为|是|属于|采用|存在)\s*/u],
    lighting_source_position: [/^(?:主要|整体)?(?:光源|光线)?(?:来自|位于|处于|在|由)\s*/u],
    lighting_direction: [/^(?:光线|入射光|主光)?(?:由|从|来自|进入|照射|打向)\s*/u],
    lighting_source_size: [/^(?:光源|光照入口|灯具)?(?:为|是|采用|属于|呈现)\s*/u],
    lighting_quality: [/^(?:光线|光质|阴影边缘)?(?:为|是|呈现|形成|较为|偏向)\s*/u],
    lighting_intensity: [/^(?:整体|画面|主体|背景|光线|亮度)?(?:为|是|呈现|获得|保持|逐渐|较为)\s*/u],
    lighting_ratio: [/^(?:画面|整体|亮部与暗部|光比)?(?:采用|呈现|保持|为|是)\s*/u],
    lighting_distribution: [/^(?:画面|整体)?(?:形成|呈现|为|是)\s*/u],
    lighting_shadow_direction: [/^(?:主体|物体|阴影)?(?:产生|形成|投射出?)\s*/u],
    lighting_shadow_quality: [/^(?:阴影|阴影边缘|阴影密度)?(?:为|是|呈现|形成|保持|逐渐)\s*/u],
    lighting_highlight: [/^(?:高光|亮斑|反光)?(?:集中于|位于|呈现|形成|为|是)\s*/u],
    lighting_reflection_refraction: [/^(?:透明材质|玻璃|金属|液体|镜面|表面)?(?:存在|产生|呈现|形成|具有)\s*/u],
    lighting_material_response: [/^(?:不同材质|材质|金属|木材|皮肤|布料)?(?:呈现|产生|保持|具有|为|是)\s*/u],
    lighting_environment: [/^(?:光线|环境光|空间|墙面|天空)?(?:产生|形成|提供|补充|在空间中)\s*/u],
    lighting_color_temperature: [/^(?:主光源|光线|色温|光色)?(?:呈现|偏向|为|是|保持|形成)\s*/u],
    lighting_time_weather: [/^(?:光线|环境|时间|天气)?(?:呈现|接近|推断为|为|是|来自)\s*/u],
    lighting_mood: [/^(?:光影|整体|画面|氛围)?(?:营造|呈现|传递|增强|为|是)\s*/u],
    lighting_setup: [/^(?:采用|使用|通过|灯光方案为|布光方案为|以)\s*/u],
    lighting_micro_details: [/^(?:光线|主体边缘|空气中|环境反射后)?(?:产生|出现|存在|形成|带有)\s*/u],
    prop_identification: [/^(?:画面中|画面内|道具|辅助道具|辅助物)?(?:包含|包括|有|为|是|出现)\s*/u],
    prop_category: [/^(?:道具|辅助道具|整体)?(?:主要)?(?:属于|承担|为|是|分为|定位为)\s*/u],
    prop_purpose: [/^(?:道具|辅助道具|其作用|功能)?(?:用于|用来|承担|强化|表达|增加|营造|建立)\s*/u],
    prop_quantity_grouping: [/^(?:道具|数量|组合)?(?:控制在|采用|通过|形成|为|是|呈现)\s*/u],
    prop_spatial_position: [/^(?:道具|一本书|杯子|物件)?(?:位于|放在|处于|靠近|围绕|距离|与主体形成)\s*/u],
    prop_scale_relationship: [/^(?:道具|道具尺寸|尺寸|比例)?(?:与主体|保持|作为|体现|为|是|呈现)\s*/u],
    prop_shape_structure: [/^(?:道具|陶瓷杯|书籍|外形|结构)?(?:呈|呈现|具有|由|包含|为|是)\s*/u],
    prop_material_texture: [/^(?:道具|材质|表面|边缘)?(?:采用|具有|呈现|反射|为|是)\s*/u],
    prop_color_relationship: [/^(?:道具|色彩|颜色)?(?:采用|与主体|与环境|保持|提供|融入|为|是)\s*/u],
    prop_arrangement: [/^(?:道具|摆放|整体)?(?:采用|呈现|保持|以|为|是)\s*/u],
    prop_usage_state: [/^(?:道具|状态|使用状态)?(?:保持|呈现|例如|为|是|带有)\s*/u],
    prop_subject_relationship: [/^(?:道具|辅助道具)?(?:围绕|与主体|通过|形成|强化|突出|为|是)\s*/u],
    prop_lighting_interaction: [/^(?:道具表面|道具|表面|底部|玻璃区域)?(?:受到|产生|形成|呈现|接受|为|是)\s*/u],
    prop_style_identity: [/^(?:道具|整体|道具整体)?(?:符合|属于|以|通过|强化|为|是)\s*/u],
    prop_narrative_function: [/^(?:道具|辅助道具|共同)?(?:构建|讲述|表达|营造|使画面|为|是)\s*/u],
    prop_micro_details: [/^(?:保留|道具表面|表面|细节)?(?:道具)?(?:的)?(?:微小纹理|微观细节|例如|呈现|具有|为|是)?\s*/u],
    costume_cultural_identity: [
      /^(?:该服饰|服饰|整体|画面服装)?(?:属于|来自|符合|体现|承载|定位为|为|是)\s*/u,
    ],
    costume_country_region: [
      /^(?:服饰|服装|整体)?(?:属于|来自|源自|对应|定位为|为|是)\s*/u,
    ],
    costume_ethnic_system: [
      /^(?:服饰|服装|民族体系|整体)?(?:属于|来自|源自|体现|定位为|为|是)\s*/u,
    ],
    costume_historical_period: [
      /^(?:服饰|服装|历史时期|时间时期|时代)?(?:属于|来自|识别为|推断为|定位为|为|是)\s*/u,
    ],
    costume_dynasty: [
      /^(?:服饰|服装|朝代|历史朝代)?(?:属于|来自|识别为|推断为|定位为|为|是)\s*/u,
    ],
    costume_construction_system: [
      /^(?:服饰|服装|形制|整体)?(?:采用|呈现|属于|由|包含|为|是)\s*/u,
    ],
    costume_cutting_method: [
      /^(?:服饰|服装|裁剪|整体)?(?:采用|通过|以|属于|为|是)\s*/u,
    ],
    costume_wearing_method: [
      /^(?:服饰|服装|穿着|整体)?(?:采用|通过|以|依靠|为|是)\s*/u,
    ],
    costume_layering_system: [
      /^(?:服饰|服装|层次|整体)?(?:采用|呈现|通过|形成|为|是)\s*/u,
    ],
    costume_complete_system: [
      /^(?:完整造型|服饰|服装|配套)?(?:包含|包括|由|搭配|形成|为|是)\s*/u,
    ],
    costume_social_status: [
      /^(?:服饰|服装|社会身份|身份|整体)?(?:体现|对应|属于|传递|为|是)\s*/u,
    ],
    costume_craft: [
      /^(?:服饰|服装|面料|表面|制作|工艺)?(?:采用|使用|通过|体现|包含|为|是)\s*/u,
    ],
    costume_symbolic_pattern: [
      /^(?:服饰|服装|表面|图案|纹样)?(?:采用|使用|通过|呈现|形成|包含|为|是)\s*/u,
    ],
    costume_aesthetic_language: [
      /^(?:服饰|服装|整体|审美)?(?:呈现|体现|强调|传递|属于|为|是)\s*/u,
    ],
    costume_photography_presentation: [
      /^(?:摄影|画面|服饰|服装|整体)?(?:采用|呈现|通过|强调|适合|为|是)\s*/u,
    ],
    costume_micro_details: [
      /^(?:服饰|服装|表面|微观细节|细节)?(?:保留|呈现|具有|包含|可见|为|是)\s*/u,
    ],
    subject_position: [
      /^(?:画面)?(?:主体|人物主体|主体人物|人物|角色|模特)?(?:为|是|位于|处于|占据|采用|呈现为)\s*/u,
      /^(?:画面里|画面中|画面内)(?:的)?(?:主体|人物主体|主体人物|人物)?(?:为|是|位于|处于)?\s*/u,
    ],
    identity_attribute: [
      /^(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:是|为|属于|呈现为|看起来像|身份为)\s*/u,
      /^(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)的(?:基础身份|身份属性|身份)?\s*/u,
    ],
    age_character: [
      /^(?:人物|角色|模特|主角|整体|面部轮廓)?(?:呈现|带有|具有|具备|偏|属于|约处于|视觉年龄约处于)\s*/u,
      /^(?:整体)?(?:气质|年龄感|视觉年龄)(?:为|偏|呈现为)?\s*/u,
    ],
    body_frame: [
      /^(?:人物|角色|模特|身体|身材|肩部|腰部)?(?:呈现|形成|保持|具有|具备|被服装勾勒为?)\s*/u,
    ],
    facial_structure: [
      /^(?:人物|角色|模特|面部|脸部)?(?:呈现|具有|具备|保持|是|为|偏)\s*/u,
    ],
    face_shape: [
      /^(?:面部|脸部|脸型|轮廓)?(?:呈现|具有|具备|保持|是|为|偏)\s*/u,
    ],
    eyebrow_detail: [/^(?:眉毛|眉形)?(?:呈现|保持|具有|具备|是|为|偏)\s*/u],
    eye_detail: [/^(?:眼睛|眼神|视线)?(?:呈现|保持|具有|具备|是|为)\s*/u],
    nose_detail: [/^(?:鼻子|鼻梁|鼻头|鼻型)?(?:呈现|保持|具有|具备|是|为|偏)\s*/u],
    lip_detail: [/^(?:嘴唇|唇形|嘴角)?(?:呈现|保持|具有|具备|是|为|偏)\s*/u],
    skin_texture: [/^(?:皮肤|肤质|肌肤)?(?:呈现|保持|具有|具备|保留|是|为)\s*/u],
    face_makeup: [
      /^(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性|面部|脸部)?(?:画着|化着|带着|有着|拥有|呈现|是|为)\s*/u,
      /^(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)的(?:面部|脸部)?\s*/u,
    ],
    clothing: [
      /^(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)?(?:身穿|穿着|穿了|穿上|穿|着|搭配|服装为|服装是|衣着为|穿搭为)\s*/u,
      /^(?:她|他|人物|角色|模特|主角|女孩|女人|女性|男性)的(?:服装|衣着|穿搭)\s*/u,
    ],
    portrait_photography: [
      /^(?:使用|采用|通过|镜头|拍摄|人像摄影)?\s*/u,
    ],
    portrait_lighting_color: [
      /^(?:光线|光源|人像光线|整体色调|色调)?(?:来自|采用|呈现|形成|营造|偏)?\s*/u,
    ],
    scene_identity: [
      /^(?:场景|空间|画面|环境)?(?:为|是|属于|呈现为|定位为|以)\s*/u,
    ],
    spatial_structure: [
      /^(?:场景|空间|画面)?(?:采用|具有|具备|呈现|形成|分为)\s*/u,
    ],
    spatial_scale: [
      /^(?:空间|场景|画面)?(?:尺度|比例|层高|宽度)?(?:为|是|呈现|保持|显得|较为)?\s*/u,
    ],
    scene_perspective: [
      /^(?:采用|使用|通过|镜头|空间线条)?\s*/u,
    ],
    scene_layering: [
      /^(?:前景|中景|背景|场景|画面)?(?:存在|区域由|为|由|呈现|形成)?\s*/u,
    ],
    architecture_structure: [
      /^(?:空间|建筑|场景|墙体|地面)?(?:采用|使用|为|是|呈现|具有|具备)\s*/u,
    ],
    object_elements: [
      /^(?:空间|画面|场景)?(?:中央|左侧|右侧|前景|中景|背景)?(?:摆放|搭配|存在|包含|有|由)\s*/u,
    ],
    material_texture: [
      /^(?:材质|表面|家具|木质家具|石材台面|金属元素)?(?:呈现|具有|保持|为|是)\s*/u,
    ],
    scene_color_palette: [
      /^(?:整体|场景|色彩|配色)?(?:采用|以|为|搭配|呈现|偏)\s*/u,
    ],
    scene_lighting: [
      /^(?:光线|光源|场景光线)?(?:主要)?(?:来自|采用|呈现|形成|扩散|照亮)\s*/u,
    ],
    scene_atmosphere: [
      /^(?:整体|场景|空间|氛围)?(?:氛围|情绪)?(?:呈现|营造|类似|为|是|偏)\s*/u,
    ],
    scene_photography: [
      /^(?:使用|采用|通过|镜头|拍摄|摄影语言)?\s*/u,
    ],
    scene_micro_details: [
      /^(?:桌面|空间|场景|环境|植物叶片)?(?:存在|保持|呈现|带有|具有|自然)?\s*/u,
    ],
    food_category: [
      /^(?:食物|菜品|主体|画面主体)?(?:属于|为|是|定位为|归属为)\s*/u,
    ],
    food_specific_identity: [
      /^(?:食物|菜品|主体|画面主体)?(?:为|是|具体为|识别为|呈现为)\s*/u,
    ],
    food_cuisine_style: [
      /^(?:整体|食物|菜品|料理|风格)?(?:属于|采用|呈现为|为|是|偏)\s*/u,
    ],
    cuisine_cultural_origin: [
      /^(?:整体|菜系|料理|食物|菜品|视觉特征)?(?:符合|呈现|体现|来自|源自|属于|强调)\s*/u,
    ],
    cuisine_ingredient_system: [
      /^(?:食材|菜系|料理|主体|整体)?(?:采用|强调|包含|搭配|以|由)\s*/u,
    ],
    cuisine_flavor_visual: [
      /^(?:味型|味觉视觉|表面|菜品|料理|整体)?(?:强调|呈现|表现|带有|通过|具有)\s*/u,
    ],
    cuisine_plating_habit: [
      /^(?:摆盘|菜系摆盘|盘面|料理|整体)?(?:强调|采用|通过|呈现|保持|围绕)\s*/u,
    ],
    cuisine_tableware_style: [
      /^(?:器皿|餐具|菜品|料理|整体)?(?:采用|使用|搭配|通过|以)\s*/u,
    ],
    cuisine_color_gene: [
      /^(?:色彩|配色|菜系色彩|整体)?(?:采用|常见|呈现|以|为|强调)\s*/u,
    ],
    cuisine_spatial_context: [
      /^(?:空间|场景|环境|氛围|整体)?(?:呈现|营造|强调|采用|位于|为)\s*/u,
    ],
    cuisine_photography_style: [
      /^(?:摄影|摄影风格|画面|整体)?(?:采用|呈现|强调|通过|为)\s*/u,
    ],
    food_main_ingredient: [
      /^(?:主体|食物|菜品|核心|主要)?(?:由|为|是|采用|包含|覆盖)\s*/u,
    ],
    food_supporting_ingredient: [
      /^(?:辅助|周围|表面|顶部|旁侧)?(?:搭配|点缀|加入|包含|覆盖|撒有)\s*/u,
    ],
    food_structure_layer: [
      /^(?:食物|菜品|主体|结构|顶部|中间|底部)?(?:由|呈现|形成|包含|覆盖|夹有|保持)\s*/u,
    ],
    food_physical_form: [
      /^(?:食物|菜品|主体|外形|边缘|表面)?(?:呈现|保持|为|是|具有|略微)\s*/u,
    ],
    food_cooking_method: [
      /^(?:食物|菜品|牛肉|肉类|面食|蔬菜)?(?:经过|采用|通过|以|使用)\s*/u,
    ],
    food_cooking_state: [
      /^(?:食物|菜品|奶酪|肉类|整体|表面)?(?:处于|保持|呈现|形成|为|是)\s*/u,
    ],
    food_texture_visual: [
      /^(?:表皮|内部|切面|表面|食物|菜品)?(?:呈现|表现为|具有|能够看到|保留)\s*/u,
    ],
    food_freshness: [
      /^(?:水果|蔬菜|海鲜|食材|切面|表面)?(?:保持|呈现|体现|为|是)\s*/u,
    ],
    food_portion: [
      /^(?:食物|菜品|主体|份量|尺寸)?(?:采用|保持|为|是|呈现)\s*/u,
    ],
    food_plating: [
      /^(?:食物|菜品|主体|整体)?(?:采用|以|通过|摆放于|放置于|搭配)\s*/u,
    ],
    commercial_food_identity: [
      /^(?:整体|画面|食物|菜品)?(?:采用|突出|强调|呈现|属于|为|是)\s*/u,
    ],
    product_identity: [
      /^(?:画面|主体|产品|商品|主产品)?(?:为|是|属于|呈现为|定位为|占据|位于)\s*/u,
    ],
    product_form: [
      /^(?:产品|商品|主体|外壳|整体)?(?:采用|呈现|具有|具备|为|是)\s*/u,
    ],
    product_position: [
      /^(?:产品|商品|主体)?(?:采用|以|呈现|保持|处于|为|是)\s*/u,
    ],
    product_composition_ratio: [
      /^(?:产品|商品|主体|周围|四周|画面)?(?:占据|保留|位于|处于|约为|为|是)\s*/u,
    ],
    product_composition: [
      /^(?:画面|产品|主体|构图)?(?:采用|通过|以|形成|引导|集中于)\s*/u,
    ],
    product_material: [
      /^(?:产品|商品|主体|产品外壳|外壳|表面|边缘|材质)?(?:采用|呈现|具有|保持|为|是)\s*/u,
    ],
    product_color: [
      /^(?:产品|商品|整体|主体|色彩|颜色)?(?:采用|以|搭配|呈现|形成|为|是)\s*/u,
    ],
    product_feature_detail: [
      /^(?:产品|商品|正面|局部|细节|设计)?(?:展示|呈现|包含|具有|强调|经过)\s*/u,
    ],
    product_supporting_elements: [
      /^(?:周围|产品周围|画面|旁侧)?(?:搭配|放置|存在|包含|加入)\s*/u,
    ],
    product_background: [
      /^(?:背景|产品背景|画面背景)?(?:采用|保持|通过|为|是|呈现)\s*/u,
    ],
    product_environment_relation: [
      /^(?:产品|商品|主体)?(?:自然)?(?:放置于|放在|置于|悬浮于|融入|独立展示|形成)\s*/u,
    ],
    product_lighting: [
      /^(?:使用|采用|通过|光线|主光|产品表面|高光)?(?:从|来自|照射|形成|集中于|增强)?\s*/u,
    ],
    product_photography: [
      /^(?:使用|采用|通过|镜头|拍摄|产品摄影)?\s*/u,
    ],
    commercial_visual_style: [
      /^(?:整体|画面|风格|商业视觉)?(?:采用|属于|呈现|通过|为|是)\s*/u,
    ],
    product_micro_details: [
      /^(?:产品|商品|产品表面|边缘|阴影|整体)?(?:保留|存在|呈现|具有|形成)\s*/u,
    ],
  };

  const stripped = (prefixPatterns[sectionKey] ?? []).reduce(
    (value, pattern) => value.replace(pattern, ""),
    withoutLabel,
  );

  const withoutGenericAffixes = stripGenericContextualAffixes(stripped).trim();

  if (sectionKey === "lighting_intensity" && !withoutGenericAffixes && stripped.trim()) {
    return stripped.trim();
  }

  return withoutGenericAffixes;
}

function stripSectionLabelPrefix(sectionKey: PromptSplitSectionKey, input: string): string {
  const prefixPatterns: Record<PromptSplitSectionKey, RegExp[]> = {
    lens_equipment: [/^(?:镜头器材|镜头|lens equipment|lens)\s*[:：]\s*/iu],
    image_style: [/^(?:图像风格|画风|风格|style)\s*[:：]\s*/iu],
    style_classification: [
      /^(?:风格类别|风格类型识别|风格类型|视觉风格体系|style classification)\s*[:：]\s*/iu,
    ],
    style_visual_movement: [
      /^(?:视觉流派定位|视觉流派|设计美学体系|visual movement)\s*[:：]\s*/iu,
    ],
    style_era: [/^(?:时代属性分析|时代属性|年代审美|时代风格|era style)\s*[:：]\s*/iu],
    style_cultural_origin: [
      /^(?:文化地域风格分析|文化地域风格|文化地域属性|国家文化|文化地域|地域属性|文化来源|cultural style|cultural origin)\s*[:：]\s*/iu,
    ],
    style_aesthetic_tendency: [
      /^(?:审美倾向分析|审美体系|审美倾向|审美取向|aesthetic tendency|aesthetic system)\s*[:：]\s*/iu,
    ],
    style_color_language: [
      /^(?:色彩风格分析|色彩语言|色彩风格|色彩数量|饱和度|色调体系|color style|color language)\s*[:：]\s*/iu,
    ],
    style_composition_language: [
      /^(?:构图风格分析|构图语言|构图风格|构图类型|空间关系|视觉焦点|composition style|composition language)\s*[:：]\s*/iu,
    ],
    style_lighting_language: [
      /^(?:光影风格分析|光影语言|光影风格|lighting style|lighting language)\s*[:：]\s*/iu,
    ],
    style_material_language: [
      /^(?:材质风格分析|材质语言|材质风格|material language|material style)\s*[:：]\s*/iu,
    ],
    style_spatial_language: [
      /^(?:空间风格分析|空间语言|空间风格|环境语言|spatial style|spatial language)\s*[:：]\s*/iu,
    ],
    style_design_language: [
      /^(?:设计语言分析|设计语言|视觉设计原则|design language)\s*[:：]\s*/iu,
    ],
    style_mood: [/^(?:情绪氛围分析|情绪表达|风格情绪|mood)\s*[:：]\s*/iu],
    style_commercial_positioning: [
      /^(?:风格商业定位|商业定位分析|品牌定位|用户群体|commercial positioning)\s*[:：]\s*/iu,
    ],
    style_keywords: [/^(?:风格关键词提炼|风格关键词|关键词提炼|style keywords)\s*[:：]\s*/iu],
    lighting_source_type: [
      /^(?:光源类型|光源定位|光源识别|自然光源|人造光源|多光源关系|light source identification|lighting source type)\s*[:：]\s*/iu,
    ],
    lighting_source_position: [
      /^(?:光源位置|光源方位|光源所在位置|lighting source position)\s*[:：]\s*/iu,
    ],
    lighting_direction: [/^(?:光线方向|光线方向分析|入射方向|light direction)\s*[:：]\s*/iu],
    lighting_source_size: [/^(?:光源大小|光源面积|光源尺寸|source size)\s*[:：]\s*/iu],
    lighting_quality: [
      /^(?:光线硬软程度|光源性质|光质|硬软程度|light quality)\s*[:：]\s*/iu,
    ],
    lighting_intensity: [/^(?:光线强弱|光线强度|整体亮度|light intensity)\s*[:：]\s*/iu],
    lighting_ratio: [/^(?:光比关系|光比分析|光比|lighting ratio)\s*[:：]\s*/iu],
    lighting_distribution: [
      /^(?:明暗分布|明暗结构|明暗结构分析|light dark distribution)\s*[:：]\s*/iu,
    ],
    lighting_shadow_direction: [/^(?:阴影方向|阴影长度|shadow direction)\s*[:：]\s*/iu],
    lighting_shadow_quality: [
      /^(?:阴影软硬|阴影边缘|阴影密度|阴影结构|shadow quality|shadow analysis)\s*[:：]\s*/iu,
    ],
    lighting_highlight: [
      /^(?:高光位置|高光表现|高光形态|高光分析|highlight analysis|highlight)\s*[:：]\s*/iu,
    ],
    lighting_reflection_refraction: [
      /^(?:反射折射|反射与折射|反射折射分析|reflection refraction|reflection and refraction)\s*[:：]\s*/iu,
    ],
    lighting_material_response: [
      /^(?:材质响应|材质光影响应|材质光学响应|material response)\s*[:：]\s*/iu,
    ],
    lighting_environment: [
      /^(?:环境光照|空间光照关系|环境光|environmental lighting)\s*[:：]\s*/iu,
    ],
    lighting_color_temperature: [
      /^(?:色温色彩|色温与色彩|光色|光色分析|color temperature)\s*[:：]\s*/iu,
    ],
    lighting_time_weather: [/^(?:时间天气|时间环境|时间与天气|time weather|time and weather)\s*[:：]\s*/iu],
    lighting_mood: [/^(?:氛围情绪|光影氛围|光影情绪|lighting mood)\s*[:：]\s*/iu],
    lighting_setup: [
      /^(?:摄影灯光方案|摄影灯光方案反推|灯光方案|布光方案|photography lighting setup)\s*[:：]\s*/iu,
    ],
    lighting_micro_details: [
      /^(?:微观光学细节|微观光影细节|微观灯光细节|micro lighting details)\s*[:：]\s*/iu,
    ],
    prop_identification: [
      /^(?:道具识别|道具主体识别|辅助物识别|道具名称|prop identification)\s*[:：]\s*/iu,
    ],
    prop_category: [/^(?:道具类别|道具属性|道具类别与属性|prop category)\s*[:：]\s*/iu],
    prop_purpose: [/^(?:道具功能作用|功能作用|道具作用|purpose|prop purpose)\s*[:：]\s*/iu],
    prop_quantity_grouping: [
      /^(?:数量组合关系|数量与组合关系|道具数量组合|quantity grouping)\s*[:：]\s*/iu,
    ],
    prop_spatial_position: [/^(?:空间位置|空间位置关系|道具空间位置|spatial position)\s*[:：]\s*/iu],
    prop_scale_relationship: [
      /^(?:尺寸比例|尺寸比例关系|道具尺寸比例|scale relationship)\s*[:：]\s*/iu,
    ],
    prop_shape_structure: [/^(?:外形结构|形态结构|形态结构拆解|shape structure)\s*[:：]\s*/iu],
    prop_material_texture: [/^(?:材质纹理|道具材质纹理|材质纹理分析|material texture)\s*[:：]\s*/iu],
    prop_color_relationship: [
      /^(?:色彩关系|道具色彩关系|色彩关系分析|color relationship)\s*[:：]\s*/iu,
    ],
    prop_arrangement: [/^(?:摆放方式|道具摆放方式|摆放方式分析|arrangement)\s*[:：]\s*/iu],
    prop_usage_state: [/^(?:使用状态|道具使用状态|使用状态分析|usage state)\s*[:：]\s*/iu],
    prop_subject_relationship: [
      /^(?:主体关联关系|与主体关系|主体关系|道具主体关系|subject relationship)\s*[:：]\s*/iu,
    ],
    prop_lighting_interaction: [
      /^(?:光影表现|道具光影表现|光影表现分析|lighting interaction)\s*[:：]\s*/iu,
    ],
    prop_style_identity: [
      /^(?:风格属性|道具风格属性|风格属性分析|style identity)\s*[:：]\s*/iu,
    ],
    prop_narrative_function: [
      /^(?:故事氛围|故事氛围分析|叙事功能|narrative function)\s*[:：]\s*/iu,
    ],
    prop_micro_details: [/^(?:微观细节|道具微观细节|微观细节分析|micro details)\s*[:：]\s*/iu],
    costume_cultural_identity: [
      /^(?:服饰文化身份|文化身份识别|文化身份|服装文化基因|cultural identity)\s*[:：]\s*/iu,
    ],
    costume_country_region: [
      /^(?:国家地区体系|国家\/地区体系|国家地区|地域体系|国家|地区|country region|national fashion)\s*[:：]\s*/iu,
    ],
    costume_ethnic_system: [/^(?:民族体系|民族服饰体系|民族服饰|ethnic system)\s*[:：]\s*/iu],
    costume_historical_period: [
      /^(?:历史时期|时间时期|时代识别|历史时期识别|historical period)\s*[:：]\s*/iu,
    ],
    costume_dynasty: [/^(?:历史朝代|朝代|朝代识别|dynasty)\s*[:：]\s*/iu],
    costume_construction_system: [
      /^(?:服装形制|形制结构|形制分析|服装形制分析|garment construction)\s*[:：]\s*/iu,
    ],
    costume_cutting_method: [
      /^(?:裁剪方式|裁剪体系|剪裁体系|cutting method)\s*[:：]\s*/iu,
    ],
    costume_wearing_method: [/^(?:穿着方式|穿法|穿着逻辑|wearing method)\s*[:：]\s*/iu],
    costume_layering_system: [/^(?:层次结构|层次系统|叠穿结构|layering system)\s*[:：]\s*/iu],
    costume_complete_system: [
      /^(?:配套系统|服饰配套系统|完整造型|complete costume system)\s*[:：]\s*/iu,
    ],
    costume_social_status: [/^(?:社会身份|社会属性|阶层身份|social status)\s*[:：]\s*/iu],
    costume_craft: [/^(?:制作工艺|工艺分析|服饰工艺|craft)\s*[:：]\s*/iu],
    costume_symbolic_pattern: [
      /^(?:民族纹样符号|民族纹样|图案寓意|象征纹样|symbolic pattern)\s*[:：]\s*/iu,
    ],
    costume_aesthetic_language: [
      /^(?:服饰审美语言|审美语言|审美特点|aesthetic language)\s*[:：]\s*/iu,
    ],
    costume_photography_presentation: [
      /^(?:摄影呈现|服饰摄影呈现|摄影表现层|costume photography)\s*[:：]\s*/iu,
    ],
    costume_micro_details: [
      /^(?:服饰微观细节|服装微观细节|微观细节|micro costume details)\s*[:：]\s*/iu,
    ],
    photography_style: [/^(?:摄影风格|写真风格|photography style)\s*[:：]\s*/iu],
    shot_size: [/^(?:景别|取景|shot size)\s*[:：]\s*/iu],
    aspect_ratio: [/^(?:画面比例|比例|画幅|aspect ratio)\s*[:：]\s*/iu],
    camera_angle: [/^(?:拍摄角度|视角|机位|角度|camera angle)\s*[:：]\s*/iu],
    composition: [/^(?:构图逻辑|构图|composition)\s*[:：]\s*/iu],
    depth_of_field: [/^(?:景深区分|景深|depth of field)\s*[:：]\s*/iu],
    film_medium: [/^(?:胶片介质|胶片质感|介质质感|film medium|film stock)\s*[:：]\s*/iu],
    exposure_logic: [/^(?:曝光逻辑|曝光|exposure)\s*[:：]\s*/iu],
    image_effect: [/^(?:画面特效|镜头特效|image effect)\s*[:：]\s*/iu],
    subject_position: [/^(?:人物主体定位|主体定位|人物定位|主体人物位置|subject position)\s*[:：]\s*/iu],
    identity_attribute: [/^(?:基础身份属性|身份属性|基础身份|identity)\s*[:：]\s*/iu],
    age_character: [/^(?:年龄气质|年龄感|视觉年龄|气质|age character)\s*[:：]\s*/iu],
    facial_structure: [/^(?:骨相五官|骨相|五官底层|facial structure)\s*[:：]\s*/iu],
    face_shape: [/^(?:脸型轮廓|脸型|脸部轮廓|面部轮廓|face shape)\s*[:：]\s*/iu],
    eyebrow_detail: [/^(?:眉毛细节|眉毛|眉形结构|eyebrow detail|eyebrow)\s*[:：]\s*/iu],
    eye_detail: [/^(?:眼睛眼神|眼睛细节|眼睛|眼神|视线|eye detail|gaze)\s*[:：]\s*/iu],
    nose_detail: [/^(?:鼻子结构|鼻子细节|鼻子|鼻型|nose detail)\s*[:：]\s*/iu],
    lip_detail: [/^(?:嘴唇唇形|嘴唇细节|嘴唇|唇形|lip detail)\s*[:：]\s*/iu],
    skin_base: [/^(?:皮肤基底|肤色肤质|肤色|skin base)\s*[:：]\s*/iu],
    skin_texture: [/^(?:肤质纹理|皮肤纹理|皮肤质感|skin texture)\s*[:：]\s*/iu],
    body_frame: [/^(?:身体结构|身材骨架|身材比例|身体状态|身材|骨架|body frame)\s*[:：]\s*/iu],
    native_facial_feature: [/^(?:原生面部特征|原生特征|native facial feature)\s*[:：]\s*/iu],
    face_makeup: [/^(?:面部妆容|妆容|脸部妆容|面妆|makeup)\s*[:：]\s*/iu],
    base_makeup: [/^(?:底妆|base makeup)\s*[:：]\s*/iu],
    eye_makeup: [/^(?:眉眼妆|眉眼|眼妆|eye makeup)\s*[:：]\s*/iu],
    midface_makeup: [/^(?:面中妆|面中|腮红修容|midface makeup)\s*[:：]\s*/iu],
    lip_makeup: [/^(?:唇部妆|唇妆|唇部|lip makeup)\s*[:：]\s*/iu],
    special_makeup: [/^(?:特殊妆容|special makeup)\s*[:：]\s*/iu],
    hair_accessory: [/^(?:发型头饰|发型|头饰|发饰|hair(?: accessory)?)\s*[:：]\s*/iu],
    hair_color: [/^(?:发色|hair color)\s*[:：]\s*/iu],
    hair_length: [/^(?:发长刘海|发长|刘海|hair length|bangs)\s*[:：]\s*/iu],
    hair_style: [/^(?:发型造型|发型|hair style|hairstyle)\s*[:：]\s*/iu],
    body_hair_detail: [/^(?:毛发细节|体毛细节|body hair detail)\s*[:：]\s*/iu],
    face_accessory: [/^(?:面部配饰|脸部配饰|face accessory)\s*[:：]\s*/iu],
    neck_accessory: [/^(?:颈部配饰|颈部锁骨|锁骨配饰|neck accessory)\s*[:：]\s*/iu],
    hand_accessory: [/^(?:手部配饰|hand accessory)\s*[:：]\s*/iu],
    head_accessory: [/^(?:头部配饰|head accessory)\s*[:：]\s*/iu],
    body_accessory: [/^(?:身体配饰|body accessory)\s*[:：]\s*/iu],
    clothing: [/^(?:服装细节|服装|衣着|穿搭|clothing|outfit)\s*[:：]\s*/iu],
    clothing_style: [/^(?:服装风格|服装分类|服装|衣着|穿搭|clothing style|outfit style)\s*[:：]\s*/iu],
    clothing_material: [/^(?:服装材质|材质|clothing material|fabric)\s*[:：]\s*/iu],
    clothing_color: [/^(?:服装颜色|衣服颜色|clothing color)\s*[:：]\s*/iu],
    clothing_cut: [/^(?:服装剪裁|剪裁|clothing cut)\s*[:：]\s*/iu],
    pose: [/^(?:动作姿态|动作|姿态|姿势|pose|posture)\s*[:：]\s*/iu],
    hand_gesture: [/^(?:手部手势|手势|手部|hand gesture)\s*[:：]\s*/iu],
    leg_pose: [/^(?:腿部体态|腿部姿态|leg pose)\s*[:：]\s*/iu],
    shoulder_neck_pose: [/^(?:肩颈体态|肩颈姿态|shoulder neck pose)\s*[:：]\s*/iu],
    facial_expression: [/^(?:面部表情|表情神态|表情|神态|facial expression)\s*[:：]\s*/iu],
    nail_detail: [/^(?:指甲美甲|指甲|美甲|nail detail)\s*[:：]\s*/iu],
    tattoo_detail: [/^(?:纹身|tattoo)\s*[:：]\s*/iu],
    skin_detail: [/^(?:皮肤附加细节|皮肤细节|skin detail)\s*[:：]\s*/iu],
    hand_prop: [/^(?:手上道具|手持道具|道具|hand prop)\s*[:：]\s*/iu],
    portrait_photography: [/^(?:人像摄影参数|人像摄影|肖像摄影参数|portrait photography)\s*[:：]\s*/iu],
    portrait_lighting_color: [/^(?:人像光影色彩|人像光影|人像光线|portrait lighting color|portrait lighting)\s*[:：]\s*/iu],
    scene_identity: [/^(?:场景类型定位|场景类型|空间类别|场景属性|scene identity|scene type)\s*[:：]\s*/iu],
    spatial_structure: [/^(?:空间结构|空间布局|spatial structure|spatial layout)\s*[:：]\s*/iu],
    spatial_scale: [/^(?:空间比例尺度|空间尺度|尺度比例|spatial scale)\s*[:：]\s*/iu],
    scene_perspective: [/^(?:场景透视关系|透视关系|空间透视|scene perspective|perspective)\s*[:：]\s*/iu],
    scene_layering: [/^(?:前中后景分层|场景层级|前景层|中景层|背景层|layer breakdown)\s*[:：]\s*/iu],
    architecture_structure: [/^(?:建筑空间结构|建筑结构|空间结构细节|architecture structure)\s*[:：]\s*/iu],
    object_elements: [/^(?:主要物体元素|物体元素|重要物体|object elements|scene objects)\s*[:：]\s*/iu],
    material_texture: [/^(?:场景材质纹理|材质纹理|表面材质|material texture)\s*[:：]\s*/iu],
    scene_color_palette: [/^(?:场景色彩体系|色彩体系|场景配色|scene color palette|color palette)\s*[:：]\s*/iu],
    scene_lighting: [/^(?:场景光影关系|场景光线|光线分析|scene lighting)\s*[:：]\s*/iu],
    scene_atmosphere: [/^(?:场景氛围情绪|场景氛围|空间氛围|scene atmosphere)\s*[:：]\s*/iu],
    scene_photography: [/^(?:场景摄影参数|场景摄影|摄影语言|scene photography)\s*[:：]\s*/iu],
    scene_micro_details: [/^(?:场景微观细节|细节增强层|微观细节|scene micro details|micro details)\s*[:：]\s*/iu],
    food_category: [/^(?:食物大类别|食物类别|食物分类|food category)\s*[:：]\s*/iu],
    food_specific_identity: [/^(?:具体名称识别|具体食物身份|食物身份|具体名称|food specific identity|specific food)\s*[:：]\s*/iu],
    food_cuisine_style: [/^(?:菜系分类|菜系归属|地域料理类型|料理风格|菜系|地域类型|cuisine style)\s*[:：]\s*/iu],
    cuisine_cultural_origin: [/^(?:地域文化来源|文化来源|饮食文化|cultural origin|food culture)\s*[:：]\s*/iu],
    cuisine_ingredient_system: [/^(?:典型食材体系|食材体系|食材组合习惯|signature ingredients|ingredient system)\s*[:：]\s*/iu],
    cuisine_flavor_visual: [/^(?:味型视觉表达|味型表达|味觉视觉|flavor visual|flavour visual)\s*[:：]\s*/iu],
    cuisine_plating_habit: [/^(?:传统摆盘习惯|菜系摆盘|摆盘习惯|摆盘逻辑|plating habit|plating logic)\s*[:：]\s*/iu],
    cuisine_tableware_style: [/^(?:常用餐具风格|餐具风格|餐具选择|器皿特点|tableware style)\s*[:：]\s*/iu],
    cuisine_color_gene: [/^(?:色彩基因|菜系色彩|色彩体系|color DNA|cuisine color)\s*[:：]\s*/iu],
    cuisine_spatial_context: [/^(?:空间环境特点|用餐氛围|空间环境|dining atmosphere|spatial context)\s*[:：]\s*/iu],
    cuisine_photography_style: [/^(?:摄影表现风格|菜系摄影风格|美食摄影风格|photography style|food photography style)\s*[:：]\s*/iu],
    food_main_ingredient: [/^(?:主体食材|核心食材|主要食材|main ingredient)\s*[:：]\s*/iu],
    food_supporting_ingredient: [/^(?:辅助食材|点缀元素|调味料|装饰元素|supporting ingredient|garnish)\s*[:：]\s*/iu],
    food_structure_layer: [/^(?:结构层次|食物组成结构|组成结构|food layers|structure layer)\s*[:：]\s*/iu],
    food_physical_form: [/^(?:外形轮廓|食物形态结构|食物形态|外形|physical form|food shape)\s*[:：]\s*/iu],
    food_cooking_method: [/^(?:烹饪方式|加工方式|cooking method)\s*[:：]\s*/iu],
    food_cooking_state: [/^(?:熟成状态|成熟程度|温度感|cooking state|doneness)\s*[:：]\s*/iu],
    food_texture_visual: [/^(?:口感视觉表现|口感视觉化|口感表现|texture visualization)\s*[:：]\s*/iu],
    food_freshness: [/^(?:新鲜程度|新鲜表现|freshness)\s*[:：]\s*/iu],
    food_portion: [/^(?:份量比例|食物比例|食物份量|portion|serving size)\s*[:：]\s*/iu],
    food_plating: [/^(?:摆盘方式|摆盘|plating|food styling)\s*[:：]\s*/iu],
    commercial_food_identity: [/^(?:商业定位|食物品牌化表达|餐饮商业定位|commercial food identity|commercial food)\s*[:：]\s*/iu],
    product_identity: [/^(?:产品主体定位|产品主体|产品类别|product identity|product category)\s*[:：]\s*/iu],
    product_form: [/^(?:产品外观结构|产品外观|产品形态|product form|product shape)\s*[:：]\s*/iu],
    product_position: [/^(?:产品摆放角度|产品摆放|产品角度|product position|product angle)\s*[:：]\s*/iu],
    product_composition_ratio: [/^(?:产品比例关系|产品占画面比例|产品比例|composition ratio)\s*[:：]\s*/iu],
    product_composition: [/^(?:产品构图布局|产品构图|构图布局|product composition)\s*[:：]\s*/iu],
    product_material: [/^(?:产品材质纹理|产品材质|主材质|product material)\s*[:：]\s*/iu],
    product_color: [/^(?:产品色彩体系|产品色彩|产品颜色|product color)\s*[:：]\s*/iu],
    product_feature_detail: [/^(?:产品细节卖点|产品卖点|产品细节|feature details)\s*[:：]\s*/iu],
    product_supporting_elements: [/^(?:产品配件元素|配件与辅助元素|配件元素|supporting elements)\s*[:：]\s*/iu],
    product_background: [/^(?:产品背景环境|产品背景|背景环境|product background)\s*[:：]\s*/iu],
    product_environment_relation: [/^(?:产品环境关系|产品与环境关系|环境关系|product environment)\s*[:：]\s*/iu],
    product_lighting: [/^(?:产品光影关系|产品光影|产品光线|product lighting)\s*[:：]\s*/iu],
    product_photography: [/^(?:产品摄影参数|产品摄影|商业产品摄影|product photography)\s*[:：]\s*/iu],
    commercial_visual_style: [/^(?:商业视觉风格|电商风格|商业风格|commercial style|commercial visual style)\s*[:：]\s*/iu],
    product_micro_details: [/^(?:产品微观细节|微观真实细节|产品真实细节|product micro details)\s*[:：]\s*/iu],
    location_scene: [/^(?:场地大类|场地|地点|location scene|location)\s*[:：]\s*/iu],
    furniture_soft_decoration: [/^(?:软装家具|家具软装|furniture|soft decoration)\s*[:：]\s*/iu],
    background_view: [/^(?:背景远景|远景背景|background view)\s*[:：]\s*/iu],
    floor_material: [/^(?:地面材质|地面|floor material)\s*[:：]\s*/iu],
    spatial_detail: [/^(?:空间细节|空间氛围细节|spatial detail)\s*[:：]\s*/iu],
    environment_weather: [/^(?:环境天气|天气环境|天气|environment weather)\s*[:：]\s*/iu],
    light_shadow: [/^(?:光影|光线|lighting|light shadow)\s*[:：]\s*/iu],
    main_light_type: [/^(?:主光类型|主光|main light type|key light)\s*[:：]\s*/iu],
    light_source: [/^(?:光源来源|光源|light source)\s*[:：]\s*/iu],
    light_temperature: [/^(?:光影色温|色温|light temperature)\s*[:：]\s*/iu],
    shadow_layer: [/^(?:阴影层次|阴影|shadow layer)\s*[:：]\s*/iu],
    reflection_environment: [/^(?:反光环境|反光|reflection environment)\s*[:：]\s*/iu],
    light_receiving: [/^(?:受光情况|受光|light receiving)\s*[:：]\s*/iu],
    color_detail: [/^(?:色彩细节|色调|配色|color detail)\s*[:：]\s*/iu],
    mood_tone: [/^(?:情绪基调|环境氛围|情绪氛围|mood tone)\s*[:：]\s*/iu],
    atmosphere: [/^(?:氛围|气氛|情绪|atmosphere|mood)\s*[:：]\s*/iu],
    foreground_occlusion: [/^(?:前景遮挡|前景|foreground occlusion)\s*[:：]\s*/iu],
    environment_prop: [/^(?:环境小道具|环境道具|environment prop)\s*[:：]\s*/iu],
    environment_effect: [/^(?:环境特效|特殊环境效果|environment effect)\s*[:：]\s*/iu],
    whitespace_composition: [/^(?:构图留白|留白构图|whitespace composition)\s*[:：]\s*/iu],
    famous_person: [/^(?:著名人物|名人|人物|famous person)\s*[:：]\s*/iu],
    brand: [/^(?:知名品牌|品牌|brand)\s*[:：]\s*/iu],
    color: [/^(?:颜色|色彩|color|colour)\s*[:：]\s*/iu],
    typography: [/^(?:字体|字形|typography|font)\s*[:：]\s*/iu],
    text_content: [/^(?:文本内容|文字内容|文案|文字|text content|copy)\s*[:：]\s*/iu],
    negative: [/^(?:避免内容|反向提示词|负向提示词|负面提示词|negative prompt|negative|avoid)\s*[:：]\s*/iu],
    other: [/^(?:补充信息|其他|details)\s*[:：]\s*/iu],
  };

  return prefixPatterns[sectionKey].reduce((value, pattern) => value.replace(pattern, ""), input).trim();
}

function normalizeVariableKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").trim().toLowerCase();
}

const preciseSectionValuePatterns: Partial<Record<PromptSplitSectionKey, RegExp[]>> = {
  style_classification: [
    /极简主义(?:\s*Minimalism)?/iu,
    /复古风(?:\s*Vintage)?/iu,
    /电影感(?:\s*Cinematic)?/iu,
    /商业广告风(?:\s*Commercial)?/iu,
    /生活方式(?:摄影)?风格(?:\s*Lifestyle)?/iu,
    /艺术摄影(?:\s*Fine Art)?/iu,
    /Minimalism/i,
    /Vintage/i,
    /Cinematic/i,
    /Commercial/i,
    /Lifestyle/i,
    /Fine Art/i,
  ],
  style_visual_movement: [
    /北欧风(?:\s*Scandinavian)?/iu,
    /日式侘寂(?:\s*Wabi-?Sabi)?/iu,
    /侘寂(?:\s*Wabi-?Sabi)?/iu,
    /工业风(?:\s*Industrial)?/iu,
    /未来科技风(?:\s*Futuristic)?/iu,
    /奢华高级风(?:\s*Luxury)?/iu,
    /Scandinavian/i,
    /Wabi-?Sabi/i,
    /Industrial/i,
    /Futuristic/i,
    /Luxury/i,
  ],
  style_era: [
    /古典时期/u,
    /复古年代/u,
    /20世纪50年代/u,
    /千禧年代\s*Y2K/iu,
    /千禧年代/u,
    /Y2K/iu,
    /当代现代/u,
    /现代极简设计/u,
    /轻复古元素/u,
  ],
  style_cultural_origin: [
    /东方美学/u,
    /东方自然美学/u,
    /西方现代设计/u,
    /地中海风格/u,
    /阿拉伯风格/u,
    /地域文化来源/u,
  ],
  style_aesthetic_tendency: [
    /简洁纯净/u,
    /安静克制/u,
    /自然质朴/u,
    /理性秩序/u,
    /高级质感/u,
    /平衡内敛/u,
    /温暖自然/u,
  ],
  style_color_language: [
    /单色/u,
    /双综合色/u,
    /多色/u,
    /高饱和/u,
    /低饱和/u,
    /莫兰迪色/u,
    /黑金风/u,
    /清新自然/u,
    /低饱和自然色调/u,
    /米白、灰色和木色/u,
  ],
  style_composition_language: [
    /中心构图/u,
    /对称构图/u,
    /三分构图/u,
    /留白构图/u,
    /大面积留白/u,
    /中心偏置构图/u,
    /主体中心/u,
    /边缘引导/u,
    /光线聚焦/u,
  ],
  style_lighting_language: [
    /高级商业光/u,
    /电影光/u,
    /自然生活光/u,
    /自然侧光/u,
    /柔和窗边光/u,
    /窗光/u,
    /柔和阴影/u,
    /明暗对比强/u,
  ],
  style_material_language: [
    /大理石/u,
    /金属/u,
    /玻璃/u,
    /真皮/u,
    /木材/u,
    /亚麻/u,
    /陶瓷/u,
    /天然木材/u,
    /铝合金/u,
    /透明玻璃/u,
    /LED/iu,
  ],
  style_spatial_language: [
    /极简空间/u,
    /复古空间/u,
    /商业空间/u,
    /现代极简布局/u,
    /空旷少家具/u,
    /装饰丰富/u,
    /展示性强/u,
  ],
  style_design_language: [
    /柔和曲线/u,
    /几何直线/u,
    /圆润/u,
    /锐利/u,
    /对称/u,
    /不对称/u,
    /自然曲线/u,
    /简洁结构/u,
  ],
  style_mood: [
    /温暖治愈/u,
    /冷静高级/u,
    /活力年轻/u,
    /安静舒适/u,
    /放松感/u,
    /安静克制/u,
    /柔和高级感/u,
  ],
  style_commercial_positioning: [
    /大众消费/u,
    /轻奢/u,
    /高端奢侈/u,
    /年轻消费者/u,
    /商务人士/u,
    /家庭用户/u,
    /中高端生活方式品牌/u,
    /品质认知/u,
  ],
  lighting_source_type: [
    /自然光源/u,
    /人造光源/u,
    /多光源关系/u,
    /太阳光/u,
    /天空散射光/u,
    /窗户光/u,
    /摄影灯/u,
    /吊灯/u,
    /台灯/u,
    /霓虹灯/u,
    /主光/u,
    /辅光/u,
    /环境光/u,
    /轮廓光/u,
  ],
  lighting_source_position: [
    /画面左侧/u,
    /画面右侧/u,
    /左前方/u,
    /右前方/u,
    /背后逆光/u,
    /顶部照射/u,
    /顶部光源/u,
    /正面光源/u,
  ],
  lighting_direction: [
    /左侧入射/u,
    /右侧入射/u,
    /正面照射/u,
    /背后逆光/u,
    /顶部照射/u,
    /由画面左前方进入/u,
    /由画面右前方进入/u,
  ],
  lighting_source_size: [
    /大面积自然光入口/u,
    /大型柔光箱/u,
    /点状光源/u,
    /小型聚光灯/u,
    /聚光灯/u,
  ],
  lighting_quality: [
    /硬光/u,
    /柔光/u,
    /阴影边缘清晰/u,
    /阴影边缘柔和/u,
    /明暗反差强/u,
    /过渡自然/u,
    /Hard Light/i,
    /Soft Light/i,
  ],
  lighting_intensity: [
    /高曝光/u,
    /正常曝光/u,
    /低调暗光/u,
    /主体突出/u,
    /背景压暗/u,
    /较强照明/u,
    /亮度逐渐降低/u,
  ],
  lighting_ratio: [
    /低光比/u,
    /中低光比/u,
    /高光比/u,
    /亮部与暗部保持平衡/u,
    /强烈明暗差异/u,
  ],
  lighting_distribution: [
    /亮部集中于主体中心/u,
    /中间调覆盖主要细节/u,
    /暗部位于边缘/u,
    /最亮区域/u,
    /最暗区域/u,
  ],
  lighting_shadow_direction: [
    /向右后方延伸/u,
    /向右延伸/u,
    /向后投射/u,
    /短阴影/u,
    /长阴影/u,
  ],
  lighting_shadow_quality: [
    /清晰锐利/u,
    /柔和扩散/u,
    /浅灰阴影/u,
    /深黑阴影/u,
    /边缘逐渐扩散/u,
  ],
  lighting_highlight: [
    /金属边缘/u,
    /皮肤表面/u,
    /食物油脂/u,
    /点状高光/u,
    /条状高光/u,
    /大面积反射/u,
    /柔和亮斑/u,
    /强烈反光/u,
  ],
  lighting_reflection_refraction: [
    /环境倒影/u,
    /光斑/u,
    /水杯变形/u,
    /透明材质光线变化/u,
    /自然折射/u,
    /轻微环境反射/u,
  ],
  lighting_material_response: [
    /金属强反射/u,
    /木材柔和漫反射/u,
    /皮肤半透明散射/u,
    /布料吸光/u,
    /差异化光学响应/u,
  ],
  lighting_environment: [
    /墙面反射/u,
    /天空补光/u,
    /空气感/u,
    /空间层次/u,
    /统一的光照关系/u,
  ],
  lighting_color_temperature: [
    /暖光/u,
    /冷光/u,
    /混合光/u,
    /偏暖色温/u,
    /冷暖平衡/u,
    /中性白光/u,
  ],
  lighting_time_weather: [
    /清晨/u,
    /上午/u,
    /午后/u,
    /黄昏/u,
    /夜晚/u,
    /晴天/u,
    /阴天/u,
    /雨天/u,
  ],
  lighting_mood: [
    /温暖生活感/u,
    /高级商业感/u,
    /电影感/u,
    /安静高级/u,
    /温暖治愈/u,
  ],
  lighting_setup: [
    /左侧大型柔光箱/u,
    /右侧弱补光/u,
    /轻微轮廓光/u,
    /主光/u,
    /辅光/u,
    /轮廓光/u,
    /环境光/u,
  ],
  lighting_micro_details: [
    /边缘光/u,
    /Rim Light/i,
    /漫反射/u,
    /Diffuse Reflection/i,
    /次级反射/u,
    /Bounce Light/i,
    /空气光/u,
    /Volumetric Light/i,
    /光尘/u,
    /Dust particles/i,
    /光雾/u,
  ],
  prop_identification: [
    /陶瓷杯/u,
    /纸质书籍/u,
    /绿色植物/u,
    /杯子/u,
    /书籍/u,
    /花瓶/u,
    /香薰/u,
    /台灯/u,
    /包装盒/u,
    /品牌卡片/u,
    /展示架/u,
    /标签/u,
    /食材/u,
    /餐具/u,
    /调味瓶/u,
    /包包/u,
    /眼镜/u,
    /乐器/u,
    /运动装备/u,
  ],
  prop_category: [
    /生活类道具/u,
    /商业类道具/u,
    /食品类道具/u,
    /人像类道具/u,
    /装饰型道具/u,
    /功能型道具/u,
    /品牌型道具/u,
    /场景叙事功能/u,
  ],
  prop_purpose: [
    /强化主体/u,
    /表达尺度/u,
    /增加真实性/u,
    /营造情绪/u,
    /建立使用场景/u,
    /增强生活化场景氛围/u,
    /增强实际应用环境联想/u,
  ],
  prop_quantity_grouping: [
    /单个/u,
    /少量组合/u,
    /多元素堆叠/u,
    /成组出现/u,
    /层级组合/u,
    /两三个相关元素/u,
    /前景小物/u,
    /背景装饰/u,
  ],
  prop_spatial_position: [
    /左侧/u,
    /右侧/u,
    /前方/u,
    /后方/u,
    /主体左前方/u,
    /紧贴主体/u,
    /周围环绕/u,
    /远距离背景/u,
    /部分遮挡产品/u,
    /位于主体之后/u,
  ],
  prop_scale_relationship: [
    /小型点缀/u,
    /同等比例/u,
    /大型背景元素/u,
    /合理比例/u,
    /视觉补充/u,
    /不抢占主要空间/u,
    /体现桌面大小/u,
    /体现物体大小/u,
  ],
  prop_shape_structure: [
    /圆形/u,
    /方形/u,
    /不规则/u,
    /圆柱形结构/u,
    /杯口略微外扩/u,
    /弧形把手/u,
    /整体轮廓简洁/u,
    /书籍封面/u,
    /书本封面/u,
    /书页/u,
    /书页边缘/u,
  ],
  prop_material_texture: [
    /木材/u,
    /金属/u,
    /陶瓷/u,
    /玻璃/u,
    /纸张/u,
    /布料/u,
    /哑光陶瓷材质/u,
    /细腻颗粒感/u,
    /手工质感/u,
    /光滑/u,
    /粗糙/u,
    /磨砂/u,
    /反光/u,
  ],
  prop_color_relationship: [
    /白色陶瓷/u,
    /深色木材/u,
    /对比色/u,
    /统一色/u,
    /融入背景/u,
    /提供点缀/u,
    /低饱和自然色调/u,
    /少量绿色元素/u,
    /视觉活力/u,
  ],
  prop_arrangement: [
    /人为摆放/u,
    /自然摆放/u,
    /动态摆放/u,
    /自然生活化摆放/u,
    /整齐/u,
    /对称/u,
    /随意/u,
    /有生活痕迹/u,
    /倾斜/u,
    /打开/u,
    /使用中/u,
  ],
  prop_usage_state: [
    /未使用/u,
    /新包装/u,
    /整齐摆放/u,
    /使用中/u,
    /杯中有饮品/u,
    /书本打开/u,
    /键盘正在使用/u,
    /翻开的页面/u,
    /桌面轻微杂乱/u,
    /轻微使用状态/u,
    /半满咖啡杯/u,
  ],
  prop_subject_relationship: [
    /衬托关系/u,
    /对比关系/u,
    /场景关系/u,
    /围绕主体形成完整使用场景/u,
    /强化产品定位/u,
    /突出自然属性/u,
    /形成反差/u,
  ],
  prop_lighting_interaction: [
    /玻璃反光/u,
    /投射阴影/u,
    /金属倒影/u,
    /侧向柔光/u,
    /轻微反射/u,
    /自然接触阴影/u,
    /空间真实感/u,
  ],
  prop_style_identity: [
    /极简高级/u,
    /日式自然/u,
    /复古风/u,
    /科技风/u,
    /现代极简风格/u,
    /天然材质/u,
    /低饱和颜色/u,
    /高级生活方式感/u,
    /黄铜/u,
    /皮革/u,
    /LED/iu,
  ],
  prop_narrative_function: [
    /场景故事/u,
    /悠闲下午/u,
    /办公状态/u,
    /烹饪过程/u,
    /安静阅读环境/u,
    /生活场景/u,
    /情境表达/u,
    /视觉叙事/u,
  ],
  prop_micro_details: [
    /杯壁水珠/u,
    /纸张纹理/u,
    /纸张纤维/u,
    /木纹细节/u,
    /木材纹路/u,
    /灰尘颗粒/u,
    /轻微倾斜/u,
    /自然散落/u,
    /翻折/u,
    /磨损/u,
    /轻微使用痕迹/u,
  ],
  costume_cultural_identity: [
    /东亚传统服饰体系/u,
    /中国古典服饰审美/u,
    /中国传统服饰体系/u,
    /日本服饰体系/u,
    /欧洲服饰体系/u,
    /西方宫廷服饰体系/u,
    /民族服饰体系/u,
    /历史地域服饰/u,
  ],
  costume_country_region: [
    /中国/u,
    /日本/u,
    /韩国/u,
    /印度/u,
    /阿拉伯地区/u,
    /英国/u,
    /法国/u,
    /意大利/u,
    /西班牙/u,
    /北欧/u,
    /墨西哥/u,
    /美国西部/u,
    /拉丁美洲/u,
    /西非/u,
    /北非/u,
    /撒哈拉地区/u,
  ],
  costume_ethnic_system: [
    /汉服体系/u,
    /和服体系/u,
    /韩服体系/u,
    /印度莎丽/u,
    /阿拉伯长袍体系/u,
    /波斯服饰/u,
    /部族服饰/u,
    /蜡染服饰/u,
    /牛仔文化服饰/u,
  ],
  costume_historical_period: [
    /平安时代/u,
    /江户时代/u,
    /中世纪/u,
    /文艺复兴时期/u,
    /文艺复兴/u,
    /巴洛克时期/u,
    /巴洛克/u,
    /维多利亚时期/u,
    /维多利亚/u,
    /18世纪礼服/u,
  ],
  costume_dynasty: [
    /先秦时期/u,
    /先秦/u,
    /汉代/u,
    /唐代/u,
    /宋代/u,
    /明代/u,
    /清代/u,
  ],
  costume_construction_system: [
    /深衣体系/u,
    /曲裾/u,
    /直裾/u,
    /交领右衽/u,
    /高腰裙/u,
    /宽袖/u,
    /立领/u,
    /马面裙/u,
    /旗装/u,
    /盘扣/u,
    /十二单/u,
    /和服/u,
    /羽织/u,
    /袴/u,
    /紧身胸衣/u,
    /裙撑/u,
    /长袍体系/u,
  ],
  costume_cutting_method: [
    /东方平面裁剪体系/u,
    /东方平面裁剪/u,
    /平面裁剪/u,
    /西方立体裁剪体系/u,
    /西方立体裁剪/u,
    /立体裁剪/u,
    /直线裁剪/u,
    /大片布料/u,
    /肩部结构/u,
    /腰线塑造/u,
    /贴合身体/u,
  ],
  costume_wearing_method: [
    /交领右衽/u,
    /衣片叠合/u,
    /宽腰带固定/u,
    /多层叠穿/u,
    /包裹式穿着/u,
    /覆盖式穿着/u,
    /层层叠穿/u,
  ],
  costume_layering_system: [
    /多层叠穿/u,
    /外袍内衫/u,
    /上衣下装层次/u,
    /披帛层次/u,
    /腰部层次/u,
    /裙撑层次/u,
  ],
  costume_complete_system: [
    /头饰/u,
    /发型/u,
    /上衣/u,
    /下装/u,
    /腰部装饰/u,
    /鞋履/u,
    /饰品/u,
    /武器\/工具/u,
    /发髻/u,
    /发簪/u,
    /大袖衫/u,
    /长裙/u,
    /披帛/u,
    /玉饰/u,
  ],
  costume_social_status: [
    /皇室贵族/u,
    /文人士大夫/u,
    /军事身份/u,
    /宗教身份/u,
    /贵重材料/u,
    /金线刺绣/u,
    /华丽色彩/u,
    /制服结构/u,
    /金属装饰/u,
    /权力象征/u,
  ],
  costume_craft: [
    /金线刺绣/u,
    /盘扣工艺/u,
    /面料工艺/u,
    /染织/u,
    /刺绣/u,
    /织锦/u,
    /蕾丝/u,
    /天鹅绒/u,
    /针脚/u,
  ],
  costume_symbolic_pattern: [
    /龙凤/u,
    /祥云/u,
    /花鸟/u,
    /樱花/u,
    /鹤/u,
    /波浪纹样/u,
    /波浪图案/u,
    /海浪纹样/u,
    /花卉纹章/u,
    /宫廷纹样/u,
    /曼荼罗/u,
    /植物纹样/u,
    /象征纹样/u,
  ],
  costume_aesthetic_language: [
    /古朴礼制/u,
    /修长流动典雅/u,
    /华丽开放/u,
    /丰满雍容/u,
    /清雅含蓄/u,
    /文人气质/u,
    /稳重规整/u,
    /礼仪感/u,
    /精致装饰性/u,
    /克制精致/u,
    /季节美学/u,
    /奢华宫廷/u,
  ],
  costume_photography_presentation: [
    /历史服饰摄影/u,
    /影视造型指导/u,
    /商业摄影复刻/u,
    /服装生成模型/u,
    /文化识别摄影/u,
    /场景道具氛围/u,
    /光影场景道具氛围/u,
  ],
  costume_micro_details: [
    /纤维/u,
    /针脚/u,
    /褶皱/u,
    /衣缘/u,
    /袖口细节/u,
    /盘扣细节/u,
    /织物肌理/u,
    /刺绣针法/u,
  ],
  scene_identity: [
    /现代极简住宅空间/u,
    /顶层公寓/u,
    /海边露台/u,
    /古堡书房/u,
    /豪车后座/u,
    /酒店宴会厅/u,
    /卧室/u,
    /花园/u,
    /泳池/u,
    /咖啡馆/u,
    /开放式客厅/u,
    /室内空间/u,
    /室外环境/u,
    /城市空间/u,
    /自然环境/u,
    /商业空间/u,
    /居住空间/u,
    /工业空间/u,
    /高端住宅/u,
    /咖啡馆/u,
    /酒店大堂/u,
    /海边(?:场景|环境)?/u,
    /森林(?:场景|环境)?/u,
    /街头(?:场景|环境)?/u,
    /scene type/i,
  ],
  spatial_structure: [
    /明显的三层空间结构/u,
    /三层空间结构/u,
    /前景区域/u,
    /中景区域/u,
    /后景区域/u,
    /主要活动区域/u,
    /空间纵深/u,
    /自然光入口/u,
    /墙面和自然光入口/u,
    /开放式布局/u,
    /spatial layout/i,
  ],
  spatial_scale: [
    /空间尺度宽敞/u,
    /尺度宽敞/u,
    /天花板高度较高/u,
    /高层高/u,
    /大型落地窗/u,
    /视觉延伸感/u,
    /家具尺寸与空间比例协调/u,
    /家具尺寸协调/u,
    /空间比例协调/u,
    /开阔空间/u,
    /紧凑空间/u,
    /狭窄空间/u,
    /spatial scale/i,
  ],
  scene_perspective: [
    /接近人眼高度的水平视角/u,
    /人眼高度水平视角/u,
    /一点透视结构/u,
    /单点透视结构/u,
    /两点透视结构/u,
    /广角透视/u,
    /空间线条向远处自然收拢/u,
    /稳定的一点透视/u,
    /低机位空间视角/u,
    /桌面高度视角/u,
    /vanishing point/i,
  ],
  scene_layering: [
    /前景浅景深虚化植物枝叶/u,
    /虚化植物枝叶/u,
    /低矮装饰元素/u,
    /沙发和茶几视觉中心/u,
    /主要视觉中心/u,
    /大面积浅色墙面/u,
    /窗外自然景观/u,
    /前景层/u,
    /中景层/u,
    /背景层/u,
    /foreground layer/i,
    /middle ground/i,
    /background layer/i,
  ],
  architecture_structure: [
    /落地玻璃窗设计/u,
    /落地玻璃窗/u,
    /黑色金属窗框/u,
    /现代建筑线条/u,
    /浅色木质地面/u,
    /浅色木质材质/u,
    /浅色墙面/u,
    /木地板/u,
    /石材地面/u,
    /吊顶结构/u,
    /横梁结构/u,
    /门窗框架/u,
    /architectural detail/i,
  ],
  object_elements: [
    /低矮布艺沙发/u,
    /圆形木质茶几/u,
    /一个沙发/u,
    /两盏灯/u,
    /三盆植物/u,
    /绿色植物/u,
    /桌面装饰物/u,
    /家具主体/u,
    /家具边缘线条简洁柔和/u,
    /简洁柔和家具线条/u,
    /scene objects/i,
  ],
  material_texture: [
    /自然木材纹理/u,
    /木质家具自然纹理/u,
    /木质纹理/u,
    /金属低反射质感/u,
    /金属反光/u,
    /玻璃透明度/u,
    /石材细微颗粒感/u,
    /石材颗粒/u,
    /布料纤维/u,
    /哑光表面/u,
    /半哑光表面/u,
    /高反光表面/u,
    /surface material/i,
  ],
  scene_color_palette: [
    /低饱和自然色调/u,
    /米白和浅木色/u,
    /米白色基底/u,
    /浅木色基底/u,
    /深木色辅色/u,
    /绿色植物视觉点缀/u,
    /金属黑点缀/u,
    /少量绿色植物/u,
    /莫兰迪场景配色/u,
    /低饱和场景配色/u,
    /color palette/i,
  ],
  scene_lighting: [
    /右侧大面积窗户自然光/u,
    /左侧大面积窗户自然光/u,
    /自然光柔和扩散/u,
    /地面细腻明暗变化/u,
    /阴影边缘较软/u,
    /柔和窗光/u,
    /顶部灯光/u,
    /环境反射光/u,
    /阴影方向[^，。；;、]{0,8}/u,
    /阴影长度[^，。；;、]{0,8}/u,
    /scene lighting/i,
  ],
  scene_atmosphere: [
    /安静舒适氛围/u,
    /午后自然光环境/u,
    /轻松高级的生活方式感/u,
    /生活方式感/u,
    /宁静氛围/u,
    /温暖氛围/u,
    /奢华氛围/u,
    /清冷氛围/u,
    /活力氛围/u,
    /清晨氛围/u,
    /黄昏氛围/u,
    /夜晚氛围/u,
    /商业展示氛围/u,
    /scene atmosphere/i,
  ],
  scene_photography: [
    /35mm\s*广角镜头/iu,
    /35mm\s*环境摄影/iu,
    /24mm\s*广角/iu,
    /50mm\s*自然视角/iu,
    /较深景深/u,
    /全景清晰/u,
    /专业室内摄影效果/u,
    /建筑摄影/u,
    /室内设计摄影/u,
    /生活方式摄影/u,
    /完整空间透视/u,
    /interior photography/i,
  ],
  scene_micro_details: [
    /少量生活化物件/u,
    /生活化物件/u,
    /植物叶片形态自然分散/u,
    /自然分散植物叶片/u,
    /真实使用状态/u,
    /轻微灰尘/u,
    /轻微使用痕迹/u,
    /使用痕迹/u,
    /自然褶皱/u,
    /不完全对称/u,
    /自然摆放/u,
    /微小变化/u,
    /书籍/u,
    /花瓶/u,
    /灯具/u,
    /摆件/u,
    /micro details/i,
  ],
  food_category: [
    /主食类/u,
    /肉类/u,
    /甜品/u,
    /饮品/u,
    /小吃/u,
    /西式烘焙甜品/u,
    /烘焙甜品/u,
    /面食/u,
    /米饭/u,
    /面包/u,
    /披萨/u,
    /汉堡/u,
    /牛排/u,
    /烤鸡/u,
    /烤肉/u,
    /海鲜/u,
    /蛋糕/u,
    /饼干/u,
    /巧克力/u,
    /冰淇淋/u,
    /咖啡/u,
    /茶饮/u,
    /果汁/u,
    /鸡尾酒/u,
    /炸物/u,
    /糕点/u,
    /点心/u,
    /food category/i,
  ],
  food_specific_identity: [
    /手工薄底玛格丽特披萨/u,
    /玛格丽特披萨/u,
    /法式可颂牛角面包/u,
    /可颂牛角面包/u,
    /草莓奶油戚风蛋糕/u,
    /日式照烧鸡肉盖饭/u,
    /意大利番茄肉酱意面/u,
    /冰拿铁咖啡/u,
    /厚切谷饲牛排/u,
    /精致蛋糕类产品/u,
    /[^，。；;、]{1,12}(?:披萨|蛋糕|牛排|意面|盖饭|汉堡|面包|咖啡|炸鸡|沙拉|甜品)/u,
    /specific food/i,
  ],
  food_cuisine_style: [
    /亚洲料理/u,
    /欧洲料理/u,
    /美洲料理/u,
    /中餐/u,
    /日料/u,
    /韩餐/u,
    /泰餐/u,
    /越南料理/u,
    /印度料理/u,
    /东南亚料理/u,
    /法餐/u,
    /意餐/u,
    /西班牙料理/u,
    /德国料理/u,
    /地中海料理/u,
    /美式料理/u,
    /墨西哥料理/u,
    /拉美料理/u,
    /中东料理/u,
    /土耳其料理/u,
    /非洲料理/u,
    /现代法式料理风格/u,
    /法式料理/u,
    /日式料理/u,
    /意式料理/u,
    /中式料理/u,
    /泰式料理/u,
    /韩式料理/u,
    /美式快餐/u,
    /西式烘焙/u,
    /高级餐厅风格/u,
    /家常料理/u,
    /街头美食/u,
    /cuisine style/i,
  ],
  cuisine_cultural_origin: [
    /东方饮食氛围/u,
    /共享式饮食文化/u,
    /季节感/u,
    /江户前寿司文化/u,
    /传统日式料理文化/u,
    /传统中餐文化/u,
    /现代法式餐饮文化/u,
    /意式家庭用餐文化/u,
    /墨西哥街头饮食文化/u,
    /热带饮食文化/u,
    /家庭聚餐文化/u,
    /food culture/i,
  ],
  cuisine_ingredient_system: [
    /新鲜鱼类米饭海藻/u,
    /新鲜鱼类、米饭、海藻/u,
    /米饭海藻体系/u,
    /多种食材组合/u,
    /荤素搭配/u,
    /新鲜鱼类/u,
    /季节性食材/u,
    /多种小菜组合/u,
    /高品质肉类/u,
    /海鲜奶油香草/u,
    /番茄橄榄油奶酪香草/u,
    /香草辣椒椰奶海鲜/u,
    /玉米牛肉豆类辣椒/u,
    /signature ingredients/i,
  ],
  cuisine_flavor_visual: [
    /镬气/u,
    /汤汁/u,
    /油亮光泽/u,
    /热气/u,
    /酱汁光泽/u,
    /酱汁线条/u,
    /酸辣香/u,
    /香料元素/u,
    /热带风味/u,
    /辣椒视觉/u,
    /flavor visual/i,
  ],
  cuisine_plating_habit: [
    /极简留白摆盘/u,
    /极简摆盘/u,
    /留白空间/u,
    /留白摆盘/u,
    /平衡摆盘/u,
    /艺术构图/u,
    /精确摆盘/u,
    /精准位置/u,
    /酱汁轨迹/u,
    /多种小份料理围绕主体/u,
    /组合摆盘/u,
    /共享式摆盘/u,
    /粗犷食材组合/u,
    /plating habit/i,
  ],
  cuisine_tableware_style: [
    /深色陶瓷器皿/u,
    /深色陶碗/u,
    /手工陶器小碟/u,
    /瓷盘/u,
    /木桌/u,
    /手工陶器/u,
    /木盘/u,
    /小碟/u,
    /木质器皿/u,
    /金属碗/u,
    /石锅/u,
    /小盘组合/u,
    /大面积白盘/u,
    /简洁餐具/u,
    /tableware/i,
  ],
  cuisine_color_gene: [
    /丰富色彩/u,
    /红色辣椒/u,
    /绿色蔬菜/u,
    /白色米饭/u,
    /白黑木色/u,
    /原材料自然色/u,
    /红绿白色彩/u,
    /低饱和高级灰/u,
    /高级灰/u,
    /鲜艳高饱和/u,
    /明亮热烈色彩/u,
    /cuisine color/i,
  ],
  cuisine_spatial_context: [
    /温暖家庭感/u,
    /家庭感/u,
    /丰盛感/u,
    /安静高级氛围/u,
    /自然材质空间/u,
    /热闹家庭聚餐/u,
    /家庭餐桌/u,
    /木桌厨房/u,
    /街头感/u,
    /高端餐厅环境/u,
    /dining atmosphere/i,
  ],
  cuisine_photography_style: [
    /柔和侧光低饱和色调/u,
    /温暖家庭感摄影/u,
    /安静高级自然摄影/u,
    /奢华精品广告摄影/u,
    /自然质朴摄影风格/u,
    /热带风味摄影/u,
    /街头美食摄影氛围/u,
    /柔和侧光/u,
    /低饱和色调/u,
    /food photography style/i,
  ],
  food_main_ingredient: [
    /马苏里拉奶酪/u,
    /番茄肉酱/u,
    /牛肉碎/u,
    /牛肉饼/u,
    /厚切牛排/u,
    /金黄色炸鸡/u,
    /新鲜水果/u,
    /蛋糕胚/u,
    /奶油层/u,
    /面条/u,
    /米饭/u,
    /番茄酱/u,
    /芝士/u,
    /奶酪/u,
    /炸鸡/u,
    /牛肉/u,
    /鸡肉/u,
    /海鲜/u,
    /main ingredient/i,
  ],
  food_supporting_ingredient: [
    /新鲜罗勒叶/u,
    /罗勒叶/u,
    /番茄片/u,
    /柠檬片/u,
    /香草/u,
    /坚果/u,
    /花瓣/u,
    /香料粉/u,
    /酱汁/u,
    /芝麻/u,
    /生菜/u,
    /新鲜蔬菜/u,
    /garnish/i,
  ],
  food_structure_layer: [
    /多层结构/u,
    /圆形层叠结构/u,
    /顶部覆盖奶油和新鲜水果/u,
    /中间夹有柔软蛋糕层/u,
    /顶部面包/u,
    /底部面包/u,
    /奶油层/u,
    /蛋糕层/u,
    /夹心/u,
    /底层/u,
    /汉堡层次/u,
    /蛋糕层次/u,
    /food layers/i,
  ],
  food_physical_form: [
    /圆形层叠结构/u,
    /圆形轮廓/u,
    /长条形/u,
    /方形轮廓/u,
    /不规则形/u,
    /整体展示/u,
    /切片/u,
    /半切/u,
    /撕开/u,
    /薄片/u,
    /厚切/u,
    /边缘略微不规则/u,
    /蓬松起伏/u,
    /food shape/i,
  ],
  food_cooking_method: [
    /高温烘焙/u,
    /高温煎制/u,
    /煎制/u,
    /烤制/u,
    /烘焙/u,
    /油炸/u,
    /蒸制/u,
    /炖煮/u,
    /烟熏/u,
    /炒制/u,
    /生食/u,
    /烤制痕迹/u,
    /baked/i,
    /fried/i,
    /grilled/i,
  ],
  food_cooking_state: [
    /三分熟/u,
    /五分熟/u,
    /全熟/u,
    /刚出炉/u,
    /冷藏状态/u,
    /冰镇/u,
    /轻微融化状态/u,
    /轻微融化/u,
    /柔软拉丝效果/u,
    /拉丝效果/u,
    /冒热气/u,
    /温热状态/u,
    /melted/i,
    /steaming/i,
  ],
  food_texture_visual: [
    /酥脆金黄色纹理/u,
    /金黄色脆皮状态/u,
    /金黄色表皮/u,
    /自然气泡烘烤纹理/u,
    /气泡烘烤纹理/u,
    /酥脆外壳/u,
    /焦褐色外壳/u,
    /焦化纹理/u,
    /柔软切面/u,
    /绵密口感/u,
    /蓬松口感/u,
    /油脂光泽/u,
    /汁液/u,
    /湿润表面/u,
    /明显层次/u,
    /crispy/i,
    /juicy/i,
  ],
  food_freshness: [
    /新鲜采摘状态/u,
    /水果水润光泽/u,
    /自然水润光泽/u,
    /切面颜色鲜艳/u,
    /颜色鲜艳/u,
    /叶片挺立/u,
    /海鲜湿润光泽/u,
    /新鲜现做/u,
    /食材新鲜感/u,
    /freshness/i,
  ],
  food_portion: [
    /单人精致份量/u,
    /单人份/u,
    /分享装/u,
    /精致小份/u,
    /尺寸适中/u,
    /小巧份量/u,
    /厚切份量/u,
    /与餐盘比例协调/u,
    /portion/i,
  ],
  food_plating: [
    /圆形木质托盘/u,
    /木质托盘/u,
    /精致摆盘/u,
    /高级餐厅摆盘/u,
    /单人份摆盘/u,
    /餐盘比例协调/u,
    /围绕主体展开/u,
    /视觉点缀/u,
    /plating/i,
  ],
  commercial_food_identity: [
    /高级餐饮广告视觉/u,
    /高级餐饮广告/u,
    /餐饮广告摄影/u,
    /快餐广告/u,
    /烘焙商品/u,
    /外卖展示/u,
    /手工制作质感/u,
    /高品质原料/u,
    /食材品质/u,
    /精致制作工艺/u,
    /commercial food/i,
  ],
  product_identity: [
    /单件厨房电器产品/u,
    /厨房电器产品/u,
    /家电产品/u,
    /食品产品/u,
    /美妆产品/u,
    /数码产品/u,
    /家居用品/u,
    /单品展示/u,
    /产品组合/u,
    /主品\+配件/u,
    /主产品/u,
    /辅助配件/u,
    /product category/i,
  ],
  product_form: [
    /圆润流线型外观设计/u,
    /圆润流线型外观/u,
    /流线型外观/u,
    /几何结构/u,
    /圆柱形结构/u,
    /方形结构/u,
    /柔和弧度/u,
    /边缘弧度/u,
    /紧凑协调比例/u,
    /曲面变化/u,
    /product shape/i,
  ],
  product_position: [
    /45\s*度前侧视角/iu,
    /45\s*度展示/iu,
    /正面展示/u,
    /侧面展示/u,
    /顶部俯视/u,
    /logo朝向镜头/iu,
    /功能区域朝向用户/u,
    /平放状态/u,
    /悬浮状态/u,
    /倾斜摆放/u,
    /使用状态/u,
    /product angle/i,
  ],
  product_composition_ratio: [
    /产品占据画面约?\s*\d{1,3}%/u,
    /占据画面约?\s*\d{1,3}%/u,
    /画面约?\s*\d{1,3}%/u,
    /适量留白/u,
    /四周留白/u,
    /上下留白/u,
    /中央偏上/u,
    /黄金比例位置/u,
    /商业摄影呼吸感/u,
    /composition ratio/i,
  ],
  product_composition: [
    /中心构图/u,
    /对称构图/u,
    /三分构图/u,
    /对角线构图/u,
    /视觉路径集中/u,
    /视线集中于产品核心区域/u,
    /阴影和背景层次引导/u,
    /背景层次引导/u,
    /product composition/i,
  ],
  product_material: [
    /细腻哑光材质/u,
    /哑光材质/u,
    /磨砂材质/u,
    /亮面材质/u,
    /拉丝金属/u,
    /金属纹理/u,
    /均匀颗粒质感/u,
    /轻微反射效果/u,
    /玻璃透明质感/u,
    /陶瓷光泽/u,
    /皮革纹理/u,
    /product material/i,
  ],
  product_color: [
    /低饱和深灰色/u,
    /深灰色主体/u,
    /白色主体/u,
    /黑色主体/u,
    /银色金属细节/u,
    /金属边框/u,
    /品牌标识色/u,
    /高级灰配色/u,
    /现代简洁色彩/u,
    /product color/i,
  ],
  product_feature_detail: [
    /触控区域/u,
    /品牌标识/u,
    /功能按钮/u,
    /显示屏幕/u,
    /充电接口/u,
    /隐藏式结构/u,
    /精密拼接/u,
    /特殊纹理/u,
    /局部高光强调制造工艺/u,
    /制造工艺/u,
    /feature details/i,
  ],
  product_supporting_elements: [
    /相关使用道具/u,
    /少量相关使用道具/u,
    /产品配件/u,
    /充电线/u,
    /产品包装/u,
    /食材道具/u,
    /杯子道具/u,
    /衬托尺寸/u,
    /表达使用场景/u,
    /增加生活感/u,
    /supporting elements/i,
  ],
  product_background: [
    /浅色极简空间环境/u,
    /纯色背景/u,
    /渐变背景/u,
    /场景背景/u,
    /生活空间背景/u,
    /石材背景/u,
    /木板背景/u,
    /桌面背景/u,
    /墙面背景/u,
    /柔和渐变背景/u,
    /低存在感背景/u,
    /product background/i,
  ],
  product_environment_relation: [
    /自然放置于木质台面/u,
    /木质台面/u,
    /放在桌面/u,
    /悬浮展示/u,
    /手持展示/u,
    /真实使用关系/u,
    /产品融入环境/u,
    /产品独立展示/u,
    /商业展示整洁感/u,
    /product environment/i,
  ],
  product_lighting: [
    /侧前方大面积柔光/u,
    /大面积柔光/u,
    /产品表面均匀渐变/u,
    /边缘曲面高光/u,
    /金属区域高光/u,
    /阴影过渡自然/u,
    /柔和产品阴影/u,
    /硬质产品阴影/u,
    /产品边缘光/u,
    /product lighting/i,
  ],
  product_photography: [
    /50mm\s*商业产品摄影镜头/iu,
    /50mm\s*标准镜头/iu,
    /35mm\s*产品摄影/iu,
    /85mm\s*压缩视角/iu,
    /中等景深/u,
    /全清晰产品主体/u,
    /产品主体超高清/u,
    /微距细节/u,
    /产品主体清晰/u,
    /product photography/i,
  ],
  commercial_visual_style: [
    /高级极简商业摄影风格/u,
    /高级极简/u,
    /科技未来/u,
    /生活方式商业摄影/u,
    /奢侈精品/u,
    /干净背景/u,
    /精准光影/u,
    /克制色彩/u,
    /突出产品价值感/u,
    /commercial style/i,
  ],
  product_micro_details: [
    /真实材质纹理/u,
    /轻微划痕/u,
    /细微灰尘/u,
    /细微反射变化/u,
    /折射变化/u,
    /边缘光/u,
    /微小角度偏差/u,
    /自然阴影变化/u,
    /真实摄影效果/u,
    /product micro details/i,
  ],
  subject_position: [
    /单人(?:女性|男性|人物|角色|模特|少女|少年|女孩|男孩)?/u,
    /双人(?:人物|角色|合影)?/u,
    /多人(?:人物|角色|群像)?/u,
    /画面约\s*\d{1,3}%\s*(?:的)?(?:视觉区域|区域|占比)?/u,
    /占据画面约?\s*\d{1,3}%\s*(?:的)?(?:视觉区域|区域)?/u,
    /(?:中心|画面中心|画面中央)偏左(?:位置)?/u,
    /(?:中心|画面中心|画面中央)偏右(?:位置)?/u,
    /(?:画面中央|画面中心|中心位置)/u,
    /近距离半身构图/u,
    /(?:近距离|中距离|远距离)(?:半身|全身|特写)?(?:构图|视角)?/u,
    /(?:半身|全身|特写|近景)(?:构图|人像)/u,
    /身体(?:略微)?侧向镜头/u,
    /正面面对镜头/u,
    /视觉重心[^，。；;、]{0,8}/u,
    /主体层级[^，。；;、]{0,8}/u,
    /single subject/i,
    /multiple subjects/i,
  ],
  age_character: [
    /视觉年龄约?处于青年阶段/u,
    /青年阶段/u,
    /年轻化特征/u,
    /少年感/u,
    /青年感/u,
    /成熟感/u,
    /沉稳感/u,
    /自然松弛气质/u,
    /松弛气质/u,
    /清冷气质/u,
    /温柔气质/u,
    /自信气质/u,
    /活泼气质/u,
    /高级感/u,
    /文艺感/u,
    /visual age/i,
    /temperament/i,
  ],
  face_shape: [
    /鹅蛋脸(?:骨相|轮廓)?/u,
    /瓜子脸(?:轮廓)?/u,
    /方圆脸(?:骨相|轮廓)?/u,
    /椭圆脸(?:轮廓)?/u,
    /圆脸(?:轮廓)?/u,
    /方脸(?:轮廓)?/u,
    /长脸(?:轮廓)?/u,
    /菱形脸(?:骨相|轮廓)?/u,
    /V脸/iu,
    /面部轮廓柔和/u,
    /脸部轮廓柔和/u,
    /清晰下颌线/u,
    /face shape/i,
    /jawline/i,
  ],
  eyebrow_detail: [
    /自然平直眉/u,
    /平直眉毛/u,
    /平直眉/u,
    /弯眉/u,
    /浓密眉毛/u,
    /细眉/u,
    /粗眉/u,
    /眉毛自然[^，。；;、]{0,8}/u,
    /眉毛(?:粗细|浓淡|弧度)[^，。；;、]{0,8}/u,
    /eyebrow/i,
  ],
  eye_detail: [
    /放松(?:状态)?眼睛/u,
    /眼睛呈放松状态/u,
    /双眼皮/u,
    /单眼皮/u,
    /杏仁眼/u,
    /狐狸眼/u,
    /大眼睛/u,
    /眼神柔和/u,
    /视线略微偏离镜头/u,
    /视线偏离镜头/u,
    /直视镜头/u,
    /侧视不看镜头/u,
    /眼神方向[^，。；;、]{0,8}/u,
    /eye shape/i,
    /gaze/i,
  ],
  nose_detail: [
    /高挺鼻梁/u,
    /立体鼻梁/u,
    /自然鼻梁/u,
    /精致鼻型/u,
    /小巧鼻头/u,
    /圆润鼻头/u,
    /鼻梁高度[^，。；;、]{0,8}/u,
    /鼻头形态[^，。；;、]{0,8}/u,
    /nose shape/i,
  ],
  lip_detail: [
    /饱满唇形/u,
    /自然唇形/u,
    /厚唇/u,
    /薄唇/u,
    /嘴角轻微上扬/u,
    /嘴角自然上扬/u,
    /嘴角状态[^，。；;、]{0,8}/u,
    /自然微笑状态/u,
    /lip shape/i,
  ],
  skin_texture: [
    /自然真实质感/u,
    /真实皮肤质感/u,
    /自然真实肤质/u,
    /细微肌理/u,
    /皮肤细腻度[^，。；;、]{0,8}/u,
    /自然毛孔/u,
    /毛孔表现[^，。；;、]{0,8}/u,
    /均匀肤色/u,
    /轻微自然光泽/u,
    /自然光泽/u,
    /通透肤质/u,
    /skin texture/i,
    /pores/i,
  ],
  portrait_photography: [
    /85mm\s*人像镜头/iu,
    /大光圈浅景深/u,
    /专业人像摄影质感/u,
    /人像摄影质感/u,
    /面部高清细节/u,
    /半身构图/u,
    /近距离半身构图/u,
    /portrait lens/i,
    /portrait photography/i,
  ],
  portrait_lighting_color: [
    /左前方(?:大面积)?柔光(?:源)?/u,
    /右前方(?:大面积)?柔光(?:源)?/u,
    /均匀明暗过渡/u,
    /低饱和暖色调/u,
    /低饱和人像色调/u,
    /自然高级的人像摄影氛围/u,
    /肤色(?:均匀|光泽)[^，。；;、]{0,8}/u,
    /面部受光[^，。；;、]{0,8}/u,
    /portrait lighting/i,
  ],
  camera_angle: [
    /正面的三维透视/u,
    /正面(?:视角|机位|角度|透视)/u,
    /低机位(?:透视角度|仰视)?/u,
    /高机位(?:鸟瞰视角|俯视)?/u,
    /平视(?:拍摄角度)?/u,
    /俯视(?:拍摄角度)?/u,
    /仰视(?:拍摄角度)?/u,
    /侧面视角/u,
    /鸟瞰视角/u,
    /航拍视角/u,
    /顶视角度/u,
    /dutch angle/i,
    /top view/i,
    /low angle/i,
    /high angle/i,
    /eye level/i,
    /aerial view/i,
  ],
  composition: [
    /主体居中构图/u,
    /居中构图/u,
    /中心构图/u,
    /画面中(?:央|心)/u,
    /视觉中心/u,
    /前景中心/u,
    /背景中心/u,
    /居中(?:排列|摆放)/u,
    /对称构图/u,
    /三分法构图/u,
    /黄金分割构图/u,
    /大面积留白构图/u,
    /负空间构图/u,
    /框架式构图/u,
    /引导线构图/u,
    /透视构图/u,
    /中景层次/u,
    /背景层次/u,
    /rule of thirds/i,
    /symmetry/i,
    /negative space/i,
    /leading lines/i,
  ],
  depth_of_field: [
    /浅景深(?:背景)?虚化/u,
    /深景深(?:全画面清晰)?/u,
    /前景虚化景深/u,
    /背景虚化/u,
    /焦外散景(?:明显)?/u,
    /主体锐利背景柔化/u,
    /shallow focus/i,
    /deep focus/i,
    /depth of field/i,
    /bokeh/i,
  ],
  film_medium: [
    /柯达金\s*200(?:胶片质感)?/u,
    /富士\s*400H?(?:胶片质感)?/iu,
    /黑白胶片/u,
    /宝丽来(?:拍立得)?/u,
    /拍立得/u,
    /数码原生/u,
    /CCD\s*复古/iu,
    /IMAX\s*电影质感/iu,
    /film stock/i,
    /polaroid/i,
  ],
  exposure_logic: [
    /过曝高光/u,
    /欠曝暗调/u,
    /均衡正常曝光/u,
    /正常曝光/u,
    /高对比度硬调/u,
    /低对比(?:柔雾灰调|柔雾)/u,
    /逆光轮廓冲光/u,
    /overexposed/i,
    /underexposed/i,
    /high contrast/i,
    /low contrast/i,
  ],
  image_effect: [
    /镜头眩光/u,
    /光斑散景/u,
    /柔焦雾化/u,
    /朦胧柔光/u,
    /细腻颗粒/u,
    /胶片划痕/u,
    /轻微色散/u,
    /暗角/u,
    /柔焦/u,
    /雾化/u,
    /颗粒/u,
    /色散/u,
    /vignette/i,
    /lens flare/i,
    /soft focus/i,
    /grain/i,
    /chromatic aberration/i,
  ],
  facial_structure: [
    /鹅蛋脸(?:骨相)?/u,
    /方圆脸(?:骨相)?/u,
    /菱形脸(?:骨相)?/u,
    /V脸/iu,
    /高眉骨(?:鼻梁)?/u,
    /高挺鼻梁/u,
    /精致鼻型/u,
    /大眼睛/u,
    /杏仁眼/u,
    /狐狸眼/u,
    /饱满唇形/u,
    /清晰下颌线/u,
    /高颅顶(?:比例)?/u,
    /面部比例/u,
    /脸部轮廓/u,
    /face shape/i,
    /eye shape/i,
    /nose shape/i,
    /lip shape/i,
    /jawline/i,
    /brow bone/i,
  ],
  skin_base: [
    /冷白皮/u,
    /暖黄皮/u,
    /蜜色(?:健康皮)?/u,
    /健康皮/u,
    /细腻无暇(?:肤质)?/u,
    /自然毛孔(?:肤质)?/u,
    /轻微雀斑/u,
    /泛红破碎感/u,
    /skin tone/i,
    /freckles/i,
    /pores/i,
  ],
  body_frame: [
    /身体比例自然协调/u,
    /肩部放松/u,
    /肩膀自然下沉/u,
    /腰部线条[^，。；;、]{0,8}/u,
    /腰线清晰/u,
    /自然站姿/u,
    /微微前倾/u,
    /S型曲线/u,
    /窄肩单薄骨架/u,
    /舒展肩宽/u,
    /优越头身比/u,
    /修长四肢/u,
    /清晰腰臀比例/u,
    /健硕(?:体态)?骨架/u,
    /高挑身材/u,
    /纤细身形/u,
    /沙漏型曲线/u,
    /单薄骨架/u,
    /丰满体态/u,
    /body proportion/i,
    /shoulder width/i,
    /slender/i,
    /hourglass/i,
  ],
  native_facial_feature: [
    /明显卧蚕/u,
    /浅泪沟/u,
    /高颧骨/u,
    /下颌痣/u,
    /上扬眼角弧度/u,
    /卧蚕/u,
    /泪沟/u,
    /tear trough/i,
    /aegyo sal/i,
    /cheekbones/i,
  ],
  base_makeup: [
    /哑光雾面底妆/u,
    /水光透亮底妆/u,
    /伪素颜轻薄底妆/u,
    /轻薄底妆/u,
    /斑驳氛围感底妆/u,
    /matte base/i,
    /glowy base/i,
  ],
  eye_makeup: [
    /平直眉形/u,
    /冷棕眼影色系/u,
    /上扬眼线/u,
    /纤长睫毛/u,
    /卧蚕提亮/u,
    /眼睑下至妆效/u,
    /开眼角妆效/u,
    /眼影/u,
    /眼线/u,
    /eyeshadow/i,
    /eyeliner/i,
    /lashes/i,
  ],
  midface_makeup: [
    /面中腮红/u,
    /低位腮红/u,
    /鼻梁高光/u,
    /锁骨高光/u,
    /柔和修容明暗/u,
    /轻微晒伤妆点/u,
    /腮红/u,
    /修容/u,
    /高光/u,
    /blush/i,
    /contour/i,
    /highlight/i,
  ],
  lip_makeup: [
    /哑光红唇/u,
    /镜面唇釉/u,
    /丝绒豆沙唇/u,
    /润唇质地/u,
    /裸色唇妆/u,
    /哑光唇/u,
    /镜面唇/u,
    /丝绒唇/u,
    /唇形修饰/u,
    /lipstick/i,
    /glossy lip/i,
  ],
  special_makeup: [
    /亮片妆容/u,
    /彩绘妆容/u,
    /晒伤妆/u,
    /破碎感哭妆/u,
    /复古红唇/u,
    /极简裸妆/u,
    /舞台浓妆/u,
    /glitter/i,
    /face painting/i,
    /stage makeup/i,
  ],
  hair_accessory: [
    /珍珠头饰细节/u,
    /金属发簪头饰/u,
    /编发与发带细节/u,
    /柔顺长发造型/u,
    /复古盘发发型/u,
    /短发利落造型/u,
    /头饰/u,
    /发饰/u,
    /发簪/u,
    /headpiece/i,
    /hair accessory/i,
  ],
  hair_color: [
    /纯黑发色/u,
    /冷棕发色/u,
    /冷棕色?/u,
    /奶茶(?:色|发色)/u,
    /粉棕(?:色|发色)/u,
    /白金发色/u,
    /红棕发色/u,
    /渐变发色/u,
    /挑染发色/u,
    /挑染/u,
    /ombre/i,
    /highlights/i,
  ],
  hair_length: [
    /超长发/u,
    /锁骨发/u,
    /空气刘海/u,
    /齐刘海/u,
    /无刘海/u,
    /短发/u,
    /长发/u,
    /中分/u,
    /bangs/i,
  ],
  hair_style: [
    /大波浪卷发/u,
    /大波浪/u,
    /柔顺直发/u,
    /高马尾/u,
    /低盘发/u,
    /丸子头/u,
    /羊毛卷/u,
    /湿发/u,
    /凌乱碎发/u,
    /油头/u,
    /hairstyle/i,
    /ponytail/i,
    /bun/i,
    /wet hair/i,
  ],
  body_hair_detail: [
    /眉毛毛发感/u,
    /浓密睫毛/u,
    /鬓角碎发/u,
    /胎毛修饰/u,
    /毛流/u,
    /baby hair/i,
    /sideburns/i,
  ],
  face_accessory: [
    /珍珠耳钉/u,
    /长款耳坠/u,
    /耳骨钉/u,
    /鼻钉/u,
    /珍珠面纱/u,
    /金丝眼镜/u,
    /黑框眼镜/u,
    /墨镜/u,
    /earring/i,
    /nose ring/i,
    /glasses/i,
    /sunglasses/i,
  ],
  neck_accessory: [
    /珍珠锁骨链/u,
    /钻石吊坠/u,
    /细项链/u,
    /锁骨链/u,
    /项链/u,
    /丝巾/u,
    /choker/i,
    /necklace/i,
    /scarf/i,
  ],
  hand_accessory: [
    /裸色美甲/u,
    /钻石手表/u,
    /碎钻美甲/u,
    /戒指/u,
    /手链/u,
    /手表/u,
    /ring/i,
    /bracelet/i,
    /watch/i,
    /manicure/i,
  ],
  head_accessory: [
    /珍珠头饰/u,
    /贝雷帽/u,
    /棒球帽/u,
    /发箍/u,
    /发夹/u,
    /丝带/u,
    /礼帽/u,
    /帽子/u,
    /headband/i,
    /hair clip/i,
    /ribbon/i,
    /beret/i,
    /hat/i,
  ],
  body_accessory: [
    /披肩/u,
    /手套/u,
    /腰链/u,
    /胸针/u,
    /shawl/i,
    /gloves/i,
    /waist chain/i,
    /brooch/i,
  ],
  clothing_style: [
    /肚皮舞(?:主题)?(?:服|服装|舞裙)/u,
    /舞蹈(?:服|服装|舞裙)/u,
    /cosplay\s*(?:服装|造型)?/iu,
    /汉服/u,
    /洛丽塔(?:服装|裙)?/u,
    /制服/u,
    /[^，。；;、]{1,8}居家服/u,
    /休闲穿搭/u,
    /复古旗袍/u,
    /度假长裙/u,
    /机车皮衣/u,
    /针织套装/u,
    /丝绒套装/u,
    /羊绒套装/u,
    /居家服/u,
    /礼服/u,
    /西装/u,
    /gown/i,
    /suit/i,
    /qipao/i,
    /costume/i,
  ],
  clothing_material: [
    /真丝材质/u,
    /缎面材质/u,
    /羊毛材质/u,
    /蕾丝材质/u,
    /牛仔材质/u,
    /哑光棉材质/u,
    /亮面皮革/u,
    /薄纱材质/u,
    /毛绒材质/u,
    /[\u4e00-\u9fffA-Za-z0-9]{1,8}材质/u,
    /silk/i,
    /satin/i,
    /lace/i,
    /denim/i,
    /leather/i,
    /tulle/i,
  ],
  clothing_color: [
    /香槟色系/u,
    /酒红色系/u,
    /黑色套装/u,
    /白色套装/u,
    /黑白配色/u,
    /低饱和色系/u,
    /低饱和服装/u,
    /纯色套装/u,
    /撞色搭配/u,
    /champagne/i,
    /burgundy/i,
  ],
  clothing_cut: [
    /吊带剪裁/u,
    /抹胸剪裁/u,
    /宽松廓形/u,
    /修身剪裁/u,
    /高开叉剪裁/u,
    /长款剪裁/u,
    /短款剪裁/u,
    /紧身剪裁/u,
    /oversize\s*廓形/iu,
    /strapless/i,
    /slit/i,
    /fitted/i,
  ],
  shoulder_neck_pose: [
    /含肩慵懒/u,
    /挺胸舒展/u,
    /侧脸低头/u,
    /肩颈线条/u,
    /歪头/u,
    /仰头/u,
    /tilted head/i,
    /chin up/i,
  ],
  facial_expression: [
    /冷淡疲惫/u,
    /慵懒放空/u,
    /淡淡浅笑/u,
    /破碎委屈/u,
    /冷艳疏离/u,
    /温柔柔和/u,
    /慵懒半醉/u,
    /清冷厌世/u,
    /直视镜头/u,
    /侧视不看镜头/u,
    /闭眼松弛/u,
    /expression/i,
    /gaze/i,
  ],
  nail_detail: [
    /裸色美甲/u,
    /碎钻美甲/u,
    /短甲/u,
    /长甲/u,
    /nails/i,
    /manicure/i,
  ],
  tattoo_detail: [
    /手臂纹身/u,
    /锁骨纹身图案/u,
    /锁骨纹身/u,
    /无纹身/u,
    /纹身/u,
    /tattoo/i,
  ],
  skin_detail: [
    /锁骨高光/u,
    /肩颈线条/u,
    /轻微泛红/u,
    /水光肌肤质感/u,
    /水光肌肤/u,
    /肌肤质感/u,
    /glowing skin/i,
  ],
  location_scene: [
    /顶层公寓/u,
    /海边露台/u,
    /古堡书房/u,
    /豪车后座/u,
    /酒店宴会厅/u,
    /卧室/u,
    /花园/u,
    /泳池/u,
    /咖啡馆/u,
    /apartment/i,
    /terrace/i,
    /bedroom/i,
    /garden/i,
    /pool/i,
    /cafe/i,
  ],
  furniture_soft_decoration: [
    /丝绒沙发/u,
    /厚绒地毯/u,
    /复古桌椅/u,
    /落地镜/u,
    /纱质窗帘/u,
    /水晶灯具摆件/u,
    /卡通体块/u,
    /抱枕/u,
    /沙发/u,
    /地毯/u,
    /窗帘/u,
    /mirror/i,
    /sofa/i,
    /carpet/i,
  ],
  background_view: [
    /城市夜景/u,
    /海面落日/u,
    /山林绿植/u,
    /窗外雨天/u,
    /街道霓虹/u,
    /阴天天空/u,
    /city night/i,
    /sunset/i,
    /rainy window/i,
  ],
  floor_material: [
    /大理石地面/u,
    /地毯地面/u,
    /实木地板/u,
    /沙滩地面/u,
    /草坪地面/u,
    /瓷砖地面/u,
    /marble/i,
    /wooden floor/i,
    /tiles/i,
  ],
  spatial_detail: [
    /落地窗纱帘/u,
    /毛绒软装/u,
    /金属轻奢细节/u,
    /复古雕花/u,
    /极简留白空间/u,
    /spatial detail/i,
    /minimal space/i,
  ],
  environment_weather: [
    /室内无风/u,
    /窗外下雨/u,
    /正午晴天/u,
    /薄雾/u,
    /黄昏/u,
    /深夜/u,
    /rain/i,
    /mist/i,
    /dusk/i,
    /midnight/i,
    /noon/i,
  ],
  light_shadow: [
    /柔和窗边自然光影/u,
    /高对比硬光阴影/u,
    /霓虹反射光影/u,
    /暖色轮廓光影/u,
    /低调暗部光影/u,
    /棚拍柔光光影/u,
    /自然光影/u,
    /柔光/u,
    /硬光/u,
    /轮廓光/u,
    /neon light/i,
    /soft light/i,
    /hard light/i,
  ],
  main_light_type: [
    /伦勃朗硬光/u,
    /柔光漫射/u,
    /侧逆光/u,
    /正面平光/u,
    /轮廓发光/u,
    /顶光/u,
    /底光/u,
    /rembrandt light/i,
    /key light/i,
    /rim light/i,
  ],
  light_source: [
    /落地灯光源/u,
    /窗外月光/u,
    /落日自然光/u,
    /室内水晶灯/u,
    /霓虹灯带/u,
    /蜡烛火光/u,
    /moonlight/i,
    /candlelight/i,
    /neon strip/i,
  ],
  light_temperature: [
    /冷蓝调色温/u,
    /暖黄烛光/u,
    /冷暖对冲/u,
    /中性白光/u,
    /紫粉色霓虹/u,
    /warm light/i,
    /cool light/i,
    /color temperature/i,
  ],
  shadow_layer: [
    /深黑浓郁阴影/u,
    /柔和浅阴影/u,
    /无阴影平光/u,
    /明暗对半分割/u,
    /split lighting/i,
    /shadow layer/i,
  ],
  reflection_environment: [
    /墙面反光/u,
    /水面反光/u,
    /玻璃镜面反光/u,
    /金属家具反光/u,
    /mirror reflection/i,
    /reflected light/i,
  ],
  light_receiving: [
    /正面均匀受光/u,
    /侧面单向受光/u,
    /逆光轮廓受光/u,
    /面部半明半暗受光/u,
    /主体顶部受光/u,
    /背部边缘受光/u,
    /侧面受光/u,
    /正面受光/u,
    /frontlit/i,
    /side lit/i,
    /backlit/i,
    /rim lit/i,
  ],
  color_detail: [
    /低饱和莫兰迪配色/u,
    /低饱和奶油白(?:配色|色调)?/u,
    /低饱和[^，。；;、为]{1,8}(?:配色|色调)?/u,
    /冷暖对比色彩细节/u,
    /复古胶片色调/u,
    /霓虹高饱和色彩细节/u,
    /柔和水彩渐变色调/u,
    /低饱和配色/u,
    /高饱和配色/u,
    /莫兰迪配色/u,
    /冷暖对比/u,
    /color grading/i,
    /palette/i,
  ],
  mood_tone: [
    /清冷疏离/u,
    /慵懒松弛/u,
    /破碎伤感/u,
    /富贵克制/u,
    /温柔治愈/u,
    /复古忧郁/u,
    /冷淡厌世/u,
    /性感高级/u,
    /安静独处/u,
    /微醺氛围感/u,
    /mood tone/i,
  ],
  atmosphere: [
    /安静温柔氛围/u,
    /神秘超现实氛围/u,
    /未来都市氛围/u,
    /复古怀旧氛围/u,
    /高级时尚氛围/u,
    /紧张戏剧氛围/u,
    /梦幻氛围/u,
    /浪漫氛围/u,
    /cinematic/i,
    /dreamy/i,
    /romantic/i,
    /mysterious/i,
  ],
  foreground_occlusion: [
    /薄纱前景遮挡/u,
    /绿植前景遮挡/u,
    /玻璃前景遮挡/u,
    /水雾前景遮挡/u,
    /光斑前景遮挡/u,
    /窗帘前景遮挡/u,
    /薄纱遮挡/u,
    /绿植遮挡/u,
    /玻璃遮挡/u,
    /foreground plants/i,
    /veil/i,
  ],
  environment_prop: [
    /香薰蜡烛/u,
    /高脚杯/u,
    /地毯抱枕/u,
    /书本/u,
    /鲜花/u,
    /摆件/u,
    /candle/i,
    /goblet/i,
    /flowers/i,
  ],
  environment_effect: [
    /空气中漂浮灰尘/u,
    /漂浮灰尘/u,
    /水雾雾气/u,
    /窗外雨丝/u,
    /飘落花瓣/u,
    /floating dust/i,
    /rain streaks/i,
    /falling petals/i,
    /mist/i,
  ],
  whitespace_composition: [
    /大面积留白/u,
    /紧凑满画面/u,
    /侧边留白/u,
    /顶部留白/u,
    /negative space/i,
    /whitespace/i,
    /tight frame/i,
  ],
  famous_person: [
    /毕加索艺术家气质/u,
    /弗里达式花冠肖像感/u,
    /列宾现实主义人物质感/u,
    /梵高式艺术家联想/u,
    /奥黛丽赫本复古气质/u,
    /毕加索/u,
    /弗里达/u,
    /列宾/u,
    /梵高/u,
    /奥黛丽(?:赫本)?/u,
    /pablo picasso/i,
    /frida kahlo/i,
    /van gogh/i,
  ],
  brand: [
    /Apple\s*极简科技品牌感/iu,
    /Nike\s*运动品牌感/iu,
    /Chanel\s*高级时装品牌感/iu,
    /Dior\s*精致奢华品牌感/iu,
    /Leica\s*复古相机品牌感/iu,
    /苹果(?:品牌)?/u,
    /耐克(?:品牌)?/u,
    /香奈儿(?:品牌)?/u,
    /迪奥(?:品牌)?/u,
    /徕卡(?:品牌)?/u,
    /nike/i,
    /adidas/i,
    /apple/i,
    /gucci/i,
    /chanel/i,
    /dior/i,
    /leica/i,
  ],
  color: [
    /黑白灰/u,
    /红色/u,
    /橙色/u,
    /黄色/u,
    /绿色/u,
    /青色/u,
    /蓝色/u,
    /紫色/u,
    /粉色/u,
    /黑色/u,
    /白色/u,
    /灰色/u,
    /金色/u,
    /银色/u,
    /棕色/u,
    /米色/u,
    /\b(?:red|orange|yellow|green|blue|purple|pink|black|white|gray|gold|silver)\b/i,
  ],
  typography: [
    /英文短标语字体/u,
    /无衬线粗体字体/u,
    /优雅衬线字体/u,
    /水彩手写字体/u,
    /复古海报字体/u,
    /极简细体字体/u,
    /书法字体/u,
    /无衬线/u,
    /衬线/u,
    /手写体/u,
    /书法体/u,
    /粗体/u,
    /细体/u,
    /serif/i,
    /sans-?serif/i,
    /calligraphy/i,
  ],
  text_content: [
    /画面包含中文主标题/u,
    /画面包含英文短标语/u,
    /海报文字写着限量发售/u,
    /副标题为柔和小字/u,
    /无文本内容/u,
    /中文主标题/u,
    /英文短标语/u,
    /限量发售/u,
    /柔和小字/u,
    /slogan/i,
    /caption/i,
    /subtitle/i,
  ],
};

function stripGenericContextualAffixes(input: string): string {
  return input
    .replace(/[“”"']/g, "")
    .replace(/^(?:使|让|令)\s*/u, "")
    .replace(
      /^(?:在|于)?(?:画面色彩|镜头语言|家具组合|画面|整体|场景|人物|角色|主体|模特|女孩|女人|男性|女性|背景|前景|镜头|光线|空间|环境|服装|面部|脸部|头发|手部|腿部|肩颈|文字|文本|色彩|色调|配色|家具|物体|物件)?(?:中|里)?(?:使用|采用|运用|以|通过|利用|呈现|表现|形成|营造|制造|打造|强调|突出|加入|带有|具有|具备|包含|设定为|设置为|保持|选择|作为|放在|位于|按照|依据|遵循)\s*/u,
      "",
    )
    .replace(/^(?:被|由)[^，。；;、]{0,12}(?:照亮|覆盖|遮挡|包围|点亮)\s*/u, "")
    .replace(/(?:为主|为核心|为基础|统一|清晰可见)$/u, "")
    .replace(/(?:的)?(?:画面|效果|感觉|视觉|封面视角|镜头视角|场景|部分)$/u, "")
    .trim();
}

function extractPreciseSectionValue(sectionKey: PromptSplitSectionKey, value: string): string {
  return extractKnownValue(value, preciseSectionValuePatterns[sectionKey] ?? []);
}

function normalizeLensEquipmentValue(value: string): string {
  const focalRangeMatch = value.match(/\b\d{2,3}\s*mm\s*[-~－–—]\s*\d{2,3}\s*mm\b/iu);

  if (focalRangeMatch?.[0]) {
    const suffix = extractKnownValue(value, [/广角近拍/u, /广角/u, /定焦/u, /长焦/u, /微距人像/u, /电影宽幅/u]);

    return suffix ? `${focalRangeMatch[0].replace(/\s+/g, "")} ${suffix}` : focalRangeMatch[0].replace(/\s+/g, "");
  }

  return extractKnownValue(value, [
    /\b(?:24|28|35|50|85|105|135)\s*mm\s*(?:定焦|广角|长焦|人像镜头|镜头)?/iu,
    /广角近拍/u,
    /广角镜头/u,
    /长焦压缩/u,
    /微距人像镜头/u,
    /电影宽幅镜头/u,
    /复古胶片镜头/u,
    /prime lens/i,
    /wide angle/i,
    /telephoto/i,
  ]);
}

function hasFaceMakeupCue(value: string): boolean {
  if (/肤质纹理|皮肤纹理|自然真实肤质|自然真实质感|细微肌理|毛孔表现|skin texture/i.test(value)) {
    return false;
  }

  return /妆容|妆面|底妆|眼妆|唇妆|腮红|睫毛|眼线|眉形|口红|唇釉|高光|修容|makeup|lipstick|eyeliner|lashes/i.test(value);
}

function isExpressionConstraintValue(value: string): boolean {
  return /(?:整体)?表情[^，。；;、]*(?:不夸张|不媚俗|不俗气|不过度|不油腻|不廉价|不违和|不刻意|不生硬)/u.test(value);
}

function extractKnownValue(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match?.[0]) {
      return match[0].trim();
    }
  }

  return "";
}

function extractKnownValues(value: string, patterns: RegExp[]): string[] {
  const matches = patterns
    .map((pattern) => {
      pattern.lastIndex = 0;
      const match = pattern.exec(value);
      pattern.lastIndex = 0;

      if (!match?.[0]) {
        return null;
      }

      return {
        index: match.index,
        value: match[0].trim(),
      };
    })
    .filter((match): match is { index: number; value: string } => match !== null)
    .sort((first, second) =>
      first.index === second.index ? second.value.length - first.value.length : first.index - second.index,
    );
  const values: string[] = [];

  for (const match of matches) {
    if (values.some((value) => value === match.value || value.includes(match.value))) {
      continue;
    }

    const shorterIndex = values.findIndex((value) => match.value.includes(value));

    if (shorterIndex >= 0) {
      values.splice(shorterIndex, 1);
    }

    values.push(match.value);
  }

  return uniqueValues(values);
}

function extractIdentityAttributeValue(value: string): string {
  return extractKnownValue(value, [
    /(?:财阀|校园|清冷|甜美|元气|青春|清纯|高冷|优雅|成熟|混血|东方|亚洲|欧美)?(?:少女|少年|御姐|熟女|青年|中年|儿童|小孩|老人|老年人|女孩|女生|女人|女士|女模特|女演员|男性|女性|男孩|男生|男人|男士|男模特|男演员)(?:气质|感)?/u,
    /(?:年轻|成熟女性|成人女性|年轻女性|年轻男性|成年男性|少年感|少女感|御姐感|混血感|校园感|财阀感)/u,
    /(?:财阀|校园|清冷|甜美|元气|青春|清纯|高冷|优雅|成熟|混血)(?:气质|感|属性|标签)/u,
    /\b(?:teenage girl|teenage boy|young woman|young man|adult woman|adult man|woman|man|girl|boy|teenager|adult|senior|child)\b/i,
    /\b(?:female|male|androgynous|mixed race|asian|european|latina|african)\b/i,
  ]);
}

function extractShotSizeValue(value: string): string {
  const exact = extractKnownValue(value, [
    /大特写/u,
    /极特写/u,
    /特写/u,
    /近景/u,
    /中景/u,
    /远景/u,
    /大全景/u,
    /全景/u,
    /全身景/u,
    /半身景/u,
    /extreme close-?up/i,
    /close-?up/i,
    /medium shot/i,
    /long shot/i,
    /wide shot/i,
    /full shot/i,
    /panorama/i,
  ]);

  return exact || limitSectionValue(value);
}

function extractAspectRatioValue(value: string): string {
  const ratio = extractKnownValue(value, [
    /\b(?:1:1|3:3|16:9|9:16|4:3|3:4|2:3|3:2|21:9)\b/u,
    /横屏(?:横构图|画幅)?/u,
    /竖屏(?:竖构图|画幅)?/u,
    /横构图/u,
    /竖构图/u,
    /方形(?:构图|画幅)?/u,
  ]);

  if (ratio && /\b\d+:\d+\b/u.test(ratio)) {
    const orientation = extractKnownValue(value, [/横屏|横构图/u, /竖屏|竖构图/u, /方形(?:构图|画幅)?/u]);

    return orientation && !ratio.includes(orientation) ? `${ratio} ${orientation}` : ratio;
  }

  return ratio || limitSectionValue(value);
}

function extractPoseCueValue(value: string): string {
  const match = value.match(/(?:上半身|下部|下半身|腿部|身体|人物)?[^，。；;、]{0,12}(?:站姿|坐姿|蹲姿|舞姿|姿态|姿势|动作)/u);

  return match?.[0]?.replace(/^(?:通过|以|呈现|表现)/u, "").trim() ?? "";
}

function limitSectionValue(value: string): string {
  const compact = value
    .replace(/^(?:不展开成|展开成|构成|形成|呈现为|呈现|表现为|表现)\s*/u, "")
    .replace(/(?:，|,|。|；|;).+$/u, "")
    .trim();

  if (compact.length <= 18) {
    return compact;
  }

  const wordMatch = compact.match(/[\u4e00-\u9fffA-Za-z0-9.\- ]{2,18}/u);

  return wordMatch?.[0]?.trim() ?? compact.slice(0, 18).trim();
}
