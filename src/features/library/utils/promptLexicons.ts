import type {
  LibraryItem,
  PromptImageLexiconEntry,
  PromptLexiconSettings,
} from "../types/library";
import { photographyCategoryDefinitions } from "./photographyCategories";
import { buildSystemCategoryId } from "./categoryId";
import { normalizeTagKnowledge, proposeTagGroup } from "./tagKnowledge";
import {
  promptSectionMeta,
  promptSplitSectionOrder,
  splitPromptToTemplate,
  type PromptSplitSectionKey,
} from "./promptSplit";

export type PromptLexiconMergeResult = {
  addedCount: number;
  indexedPromptCount: number;
  promptLexicons: PromptLexiconSettings;
};

export type PromptLexiconPruneResult = {
  promptLexicons: PromptLexiconSettings | null;
  removedCategoryCount: number;
  removedCount: number;
  removedTagCount: number;
  skipped?: boolean;
};

const defaultTagLexiconGroupLabel = "通用标签";
const tagColorGroupLabel = "颜色分类";
const tagQuantityGroupLabel = "数量分类";
const aiTagDescription = "来自 AI 标签分析";
const currentPromptTagDescription = "来自当前提示词标签";

const defaultSubjectTagLabels = [
  "人物",
  "女性",
  "男性",
  "儿童",
  "猫",
  "狗",
  "鸟类",
  "汽车",
  "手机",
  "手表",
  "咖啡",
  "花朵",
  "建筑",
  "香水",
  "玻璃瓶",
  "产品主体",
  "包装",
  "珠宝",
  "食物",
  "饮品",
  "动物",
  "宠物",
  "植物",
  "道具",
  "文字图形",
] as const;

const defaultStyleTagLabels = [
  "电影感",
  "高级感",
  "极简",
  "复古",
  "未来感",
  "赛博朋克",
  "日系",
  "胶片",
  "奢华",
  "自然",
  "商业广告感",
  "纪实感",
  "梦幻",
  "韩系干净",
  "港风",
  "黑白",
  "高对比",
  "低饱和",
  "高饱和",
  "胶片颗粒",
  "超写实",
  "插画感",
  "3D渲染感",
] as const;

const defaultLightingTagLabels = [
  "自然光",
  "柔光",
  "硬光",
  "逆光",
  "侧光",
  "轮廓光",
  "低调光",
  "高调光",
  "戏剧光",
  "棚拍",
  "顶光",
  "窗光",
  "霓虹光",
] as const;

const defaultCompositionTagLabels = [
  "中心构图",
  "三分法",
  "对称构图",
  "留白",
  "前景遮挡",
  "框架构图",
  "俯拍",
  "平拍",
  "低角度",
  "高角度",
  "引导线",
  "负空间",
] as const;

const defaultTechniqueTagLabels = [
  "浅景深",
  "长曝光",
  "微距",
  "HDR",
  "焦外虚化",
  "运动冻结",
  "慢门",
  "景深合成",
  "高速快门",
  "航拍俯视",
  "移轴",
  "多重曝光",
  "深景深",
] as const;

const defaultMaterialTagLabels = [
  "玻璃",
  "金属",
  "皮革",
  "木材",
  "陶瓷",
  "水",
  "液体",
  "布料",
  "石材",
  "塑料",
  "纸张",
] as const;

const defaultEmotionTagLabels = [
  "温暖",
  "孤独",
  "宁静",
  "活力",
  "神秘",
  "浪漫",
  "力量感",
  "清冷",
  "紧张",
  "愉悦",
] as const;

const defaultApplicationTagLabels = [
  "电商",
  "广告",
  "海报",
  "品牌宣传",
  "社交媒体",
  "杂志",
  "包装",
  "电商主图",
  "详情页",
  "海报KV",
  "Lookbook",
  "封面图",
  "剧照",
] as const;

export function createDefaultPromptLexiconSettings(tagLabels: readonly string[] = []): PromptLexiconSettings {
  // Default seed for brand-new installs only.
  // Do NOT pack hundreds of template tags into every empty lexicon —
  // users who clear tags expect an empty directory until AI/user adds them.
  return {
    categories: photographyCategoryDefinitions.map((category) => ({
      id: buildSystemCategoryId(category.group, category.label),
      group: category.group,
      label: category.label,
      description: category.description,
      parentId: null,
      imageFileName: null,
    })),
    tags: uniqueLabels(tagLabels).map((tag, index) => ({
      id: `tag-${index + 1}`,
      group: getPromptTagGroup(tag),
      label: tag,
      description: currentPromptTagDescription,
      parentId: null,
      imageFileName: null,
    })),
  };
}

/**
 * 同步词库：扫描指定条目，将素材标签合并进标签词库。
 * 导入后只扫描新增条目，避免全库重建导致数秒卡顿。
 */
export function mergeLibraryPromptLexiconForItems(
  promptLexicons: PromptLexiconSettings | null,
  allItems: readonly LibraryItem[],
  targetItems: readonly LibraryItem[],
  knownCategories: readonly string[] = [],
): PromptLexiconMergeResult {
  void knownCategories;
  const seedTagLabels = uniqueLabels(allItems.flatMap((item) => item.tags));
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, seedTagLabels);
  const tagWorkingSet = createTagLexiconWorkingSet(normalizedLexicons.tags);
  let addedCount = 0;
  let indexedPromptCount = 0;

  for (const item of targetItems) {
    // Always index material tags into the tag browser lexicon. AI tag recognition
    // writes item.tags without capsules; those must still appear under 标签浏览.
    const materialTags = uniqueLabels(item.tags ?? []);
    if (materialTags.length > 0) {
      addedCount += applyTagLabelsToWorkingSet(tagWorkingSet, materialTags);
      indexedPromptCount += 1;
    }
  }

  return {
    addedCount,
    indexedPromptCount,
    promptLexicons: {
      ...normalizedLexicons,
      tags: tagWorkingSet.tags,
    },
  };
}

export function prunePromptLexiconsForLibraryItems(
  promptLexicons: PromptLexiconSettings | null,
  items: readonly LibraryItem[],
  knownCategories: readonly string[] = [],
): PromptLexiconPruneResult {
  if (!promptLexicons) {
    return {
      promptLexicons,
      removedCategoryCount: 0,
      removedCount: 0,
      removedTagCount: 0,
    };
  }

  const references = collectPromptLexiconReferences(items, knownCategories);
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, references.seedTagLabels);
  const defaultLexicons = createDefaultPromptLexiconSettings([]);
  const defaultCategoryLabelKeys = new Set(
    defaultLexicons.categories.map((entry) => normalizeLexiconLabelKey(entry.label)),
  );
  const defaultTagLabelKeys = new Set(defaultLexicons.tags.map((entry) => normalizeLexiconLabelKey(entry.label)));
  const categories = normalizedLexicons.categories.filter((entry) =>
    shouldKeepCategoryEntry(entry, references, defaultCategoryLabelKeys),
  );
  const tags = normalizedLexicons.tags.filter((entry) =>
    shouldKeepTagEntry(entry, references, defaultTagLabelKeys),
  );
  const removedCategoryCount = normalizedLexicons.categories.length - categories.length;
  const removedTagCount = normalizedLexicons.tags.length - tags.length;

  return {
    promptLexicons: {
      categories,
      tags,
    },
    removedCategoryCount,
    removedCount: removedCategoryCount + removedTagCount,
    removedTagCount,
  };
}

/**
 * 删除条目后的轻量剪枝：只清理标签/分类中不再被剩余条目引用的条目。
 */
export function prunePromptLexiconsAfterItemDeletion(
  promptLexicons: PromptLexiconSettings | null,
  remainingItems: readonly LibraryItem[],
  _deletedItems: readonly LibraryItem[],
  knownCategories: readonly string[] = [],
): PromptLexiconPruneResult {
  if (!promptLexicons || remainingItems.length === 0) {
    return {
      promptLexicons,
      removedCategoryCount: 0,
      removedCount: 0,
      removedTagCount: 0,
    };
  }

  return prunePromptLexiconsForLibraryItems(promptLexicons, remainingItems, knownCategories);
}

type PromptLexiconReferenceKeys = {
  categoryLabelKeys: Set<string>;
  seedTagLabels: string[];
  tagLabelKeys: Set<string>;
};

function collectPromptLexiconReferences(
  items: readonly LibraryItem[],
  knownCategories: readonly string[],
): PromptLexiconReferenceKeys {
  const references: PromptLexiconReferenceKeys = {
    categoryLabelKeys: new Set<string>(),
    seedTagLabels: uniqueLabels(items.flatMap((item) => item.tags)),
    tagLabelKeys: new Set<string>(),
  };

  for (const category of knownCategories) {
    addLexiconLabelKey(references.categoryLabelKeys, category);
  }

  for (const item of items) {
    addLexiconLabelKey(references.categoryLabelKeys, item.category ?? "");

    for (const tag of item.tags) {
      addLexiconLabelKey(references.tagLabelKeys, tag);
      addLexiconLabelKey(references.categoryLabelKeys, tag);
    }
  }

  return references;
}

function shouldKeepCategoryEntry(
  entry: PromptImageLexiconEntry,
  references: PromptLexiconReferenceKeys,
  defaultCategoryLabelKeys: ReadonlySet<string>,
): boolean {
  const labelKey = normalizeLexiconLabelKey(entry.label);

  if (defaultCategoryLabelKeys.has(labelKey) || references.categoryLabelKeys.has(labelKey)) {
    return true;
  }

  return !entry.id.startsWith("derived-category-");
}

function shouldKeepTagEntry(
  entry: PromptImageLexiconEntry,
  references: PromptLexiconReferenceKeys,
  defaultTagLabelKeys: ReadonlySet<string>,
): boolean {
  if (entry.groupLocked || entry.reviewStatus || entry.aliases?.length) return true;
  const labelKey = normalizeLexiconLabelKey(entry.label);

  if (defaultTagLabelKeys.has(labelKey) || references.tagLabelKeys.has(labelKey)) {
    return true;
  }

  if (entry.description === aiTagDescription || entry.description === currentPromptTagDescription) {
    return false;
  }

  return !entry.id.startsWith("derived-tag-");
}

function addLexiconLabelKey(target: Set<string>, value: string | null | undefined): void {
  const labelKey = normalizeLexiconLabelKey(value ?? "");

  if (labelKey) {
    target.add(labelKey);
  }
}

type TagLexiconWorkingSet = {
  tags: PromptImageLexiconEntry[];
  usedIds: Set<string>;
  existingEntriesByLabel: Map<string, PromptImageLexiconEntry>;
};

function createTagLexiconWorkingSet(tags: readonly PromptImageLexiconEntry[]): TagLexiconWorkingSet {
  const nextTags = [...tags];

  return {
    tags: nextTags,
    usedIds: new Set(nextTags.map((entry) => entry.id)),
    existingEntriesByLabel: new Map(nextTags.map((entry) => [normalizeLexiconLabelKey(entry.label), entry] as const)),
  };
}

function applyTagLabelsToWorkingSet(workingSet: TagLexiconWorkingSet, tagLabels: readonly string[]): number {
  let addedCount = 0;

  for (const label of uniqueLabels(tagLabels).slice(0, 15)) {
    const tagLabel = label.trim();
    const labelKey = normalizeLexiconLabelKey(tagLabel);

    if (!tagLabel || workingSet.existingEntriesByLabel.has(labelKey)) {
      continue;
    }

    const nextEntry: PromptImageLexiconEntry = {
      id: createTagLexiconId(tagLabel, workingSet.usedIds),
      group: proposeTagGroup(tagLabel, getPromptTagGroup(tagLabel)),
      label: tagLabel,
      description: aiTagDescription,
      parentId: null,
      imageFileName: null,
      reviewStatus: proposeTagGroup(tagLabel, getPromptTagGroup(tagLabel)) === "待归纳" ? "pending" : "accepted",
    };
    workingSet.tags.push(nextEntry);
    workingSet.existingEntriesByLabel.set(labelKey, nextEntry);
    addedCount += 1;
  }

  return addedCount;
}

export function mergePromptTagLabelsIntoLexicon(
  promptLexicons: PromptLexiconSettings | null,
  tagLabels: readonly string[],
  seedTagLabels: readonly string[] = [],
): { promptLexicons: PromptLexiconSettings; addedCount: number } {
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, seedTagLabels);
  const workingSet = createTagLexiconWorkingSet(normalizedLexicons.tags);
  const addedCount = applyTagLabelsToWorkingSet(workingSet, tagLabels);

  return {
    promptLexicons: {
      ...normalizedLexicons,
      tags: workingSet.tags,
    },
    addedCount,
  };
}

export function getPromptSectionGroup(key: string): string {
  return promptSectionGroupByKey[key as PromptSplitSectionKey] ?? "文本与补充";
}

// label -> group 是纯函数，但内部会跑整套 splitPromptToTemplate 解析。
// 渲染路径按标签反复调用同一批 label，缓存后启动阶段不再重复解析。
// 键的取值范围由用户词库里的去重 label 决定，不会无界增长。
const promptTagGroupCache = new Map<string, string>();

export function getPromptTagGroup(label: string, fallbackGroup = defaultTagLexiconGroupLabel): string {
  const cacheKey = `${label}\u0000${fallbackGroup}`;
  const cached = promptTagGroupCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const resolved = resolvePromptTagGroup(label, fallbackGroup);
  promptTagGroupCache.set(cacheKey, resolved);
  return resolved;
}

function resolvePromptTagGroup(label: string, fallbackGroup: string): string {
  const exactSectionKey = resolveExactPromptTagSectionKey(label);

  if (exactSectionKey && exactSectionKey !== "negative" && exactSectionKey !== "other" && exactSectionKey !== "color") {
    return getPromptGroupLeaf(getPromptSectionGroup(exactSectionKey));
  }

  const intrinsicGroup = getTagIntrinsicGroup(label);

  if (intrinsicGroup) {
    return intrinsicGroup;
  }

  const sectionKey = resolvePromptTagSectionKey(label);

  if (sectionKey && sectionKey !== "negative" && sectionKey !== "other") {
    return getPromptGroupLeaf(getPromptSectionGroup(sectionKey));
  }

  const fallbackLeaf = getPromptGroupLeaf(fallbackGroup);
  if (!fallbackLeaf || ["通用标签", "趣味配方", "自定义标签"].includes(fallbackLeaf)) {
    return "其他标签 Other";
  }
  return fallbackLeaf;
}

const promptSectionGroupByKey: Record<PromptSplitSectionKey, string> = {
  lens_equipment: "摄影参数",
  image_style: "风格与审美",
  style_classification: "风格与审美",
  style_visual_movement: "风格与审美",
  style_era: "风格与审美",
  style_cultural_origin: "风格与审美",
  style_aesthetic_tendency: "风格与审美",
  style_color_language: "色彩",
  style_composition_language: "构图与画面",
  style_lighting_language: "光影",
  style_material_language: "材质纹理",
  style_spatial_language: "空间环境",
  style_design_language: "风格与审美",
  style_mood: "环境与氛围",
  style_commercial_positioning: "产品与商业",
  style_keywords: "风格与审美",
  lighting_source_type: "光影",
  lighting_source_position: "光影",
  lighting_direction: "光影",
  lighting_source_size: "光影",
  lighting_quality: "光影",
  lighting_intensity: "光影",
  lighting_ratio: "光影",
  lighting_distribution: "光影",
  lighting_shadow_direction: "光影",
  lighting_shadow_quality: "光影",
  lighting_highlight: "光影",
  lighting_reflection_refraction: "光影",
  lighting_material_response: "光影",
  lighting_environment: "光影",
  lighting_color_temperature: "光影",
  lighting_time_weather: "环境与氛围",
  lighting_mood: "环境与氛围",
  lighting_setup: "光影",
  lighting_micro_details: "光影",
  prop_identification: "道具与物体",
  prop_category: "道具与物体",
  prop_purpose: "道具与物体",
  prop_quantity_grouping: "道具与物体",
  prop_spatial_position: "道具与物体",
  prop_scale_relationship: "道具与物体",
  prop_shape_structure: "道具与物体",
  prop_material_texture: "材质纹理",
  prop_color_relationship: "色彩",
  prop_arrangement: "道具与物体",
  prop_usage_state: "道具与物体",
  prop_subject_relationship: "道具与物体",
  prop_lighting_interaction: "光影",
  prop_style_identity: "风格与审美",
  prop_narrative_function: "环境与氛围",
  prop_micro_details: "道具与物体",
  costume_cultural_identity: "主体与身份",
  costume_country_region: "主体与身份",
  costume_ethnic_system: "主体与身份",
  costume_historical_period: "主体与身份",
  costume_dynasty: "主体与身份",
  costume_construction_system: "服装结构",
  costume_cutting_method: "服装结构",
  costume_wearing_method: "服装结构",
  costume_layering_system: "服装结构",
  costume_complete_system: "服装结构",
  costume_social_status: "主体与身份",
  costume_craft: "服装结构",
  costume_symbolic_pattern: "服装结构",
  costume_aesthetic_language: "风格与审美",
  costume_photography_presentation: "摄影参数",
  costume_micro_details: "服装结构",
  photography_style: "摄影参数",
  shot_size: "摄影参数",
  aspect_ratio: "摄影参数",
  camera_angle: "摄影参数",
  composition: "摄影参数",
  depth_of_field: "摄影参数",
  film_medium: "摄影参数",
  exposure_logic: "摄影参数",
  image_effect: "摄影参数",
  subject_position: "主体与身份",
  identity_attribute: "主体与身份",
  age_character: "主体与身份",
  body_frame: "身体与面部",
  facial_structure: "身体与面部",
  face_shape: "身体与面部",
  eyebrow_detail: "身体与面部",
  eye_detail: "身体与面部",
  nose_detail: "身体与面部",
  lip_detail: "身体与面部",
  skin_base: "身体与面部",
  skin_texture: "身体与面部",
  native_facial_feature: "身体与面部",
  face_makeup: "妆发与配饰",
  base_makeup: "妆发与配饰",
  eye_makeup: "妆发与配饰",
  midface_makeup: "妆发与配饰",
  lip_makeup: "妆发与配饰",
  special_makeup: "妆发与配饰",
  hair_accessory: "妆发与配饰",
  hair_color: "色彩",
  hair_length: "妆发与配饰",
  hair_style: "妆发与配饰",
  body_hair_detail: "妆发与配饰",
  face_accessory: "妆发与配饰",
  neck_accessory: "妆发与配饰",
  hand_accessory: "妆发与配饰",
  head_accessory: "妆发与配饰",
  body_accessory: "妆发与配饰",
  clothing: "服装结构",
  clothing_style: "服装结构",
  clothing_material: "材质纹理",
  clothing_color: "色彩",
  clothing_cut: "服装结构",
  pose: "动作姿态",
  hand_gesture: "动作姿态",
  leg_pose: "动作姿态",
  shoulder_neck_pose: "动作姿态",
  facial_expression: "动作姿态",
  nail_detail: "妆发与配饰",
  tattoo_detail: "妆发与配饰",
  skin_detail: "身体与面部",
  hand_prop: "道具与物体",
  portrait_photography: "摄影参数",
  portrait_lighting_color: "光影",
  scene_identity: "空间环境",
  spatial_structure: "空间环境",
  spatial_scale: "空间环境",
  scene_perspective: "构图与画面",
  scene_layering: "构图与画面",
  architecture_structure: "空间环境",
  object_elements: "道具与物体",
  material_texture: "材质纹理",
  scene_color_palette: "色彩",
  scene_lighting: "光影",
  scene_atmosphere: "环境与氛围",
  scene_photography: "摄影参数",
  scene_micro_details: "环境与氛围",
  food_category: "主体与身份",
  food_specific_identity: "主体与身份",
  food_cuisine_style: "食材与烹饪",
  cuisine_cultural_origin: "食材与烹饪",
  cuisine_ingredient_system: "食材与烹饪",
  cuisine_flavor_visual: "食材与烹饪",
  cuisine_plating_habit: "食材与烹饪",
  cuisine_tableware_style: "食材与烹饪",
  cuisine_color_gene: "色彩",
  cuisine_spatial_context: "空间环境",
  cuisine_photography_style: "摄影参数",
  food_main_ingredient: "食材与烹饪",
  food_supporting_ingredient: "食材与烹饪",
  food_structure_layer: "食材与烹饪",
  food_physical_form: "食材与烹饪",
  food_cooking_method: "食材与烹饪",
  food_cooking_state: "食材与烹饪",
  food_texture_visual: "食材与烹饪",
  food_freshness: "食材与烹饪",
  food_portion: "食材与烹饪",
  food_plating: "食材与烹饪",
  commercial_food_identity: "产品与商业",
  product_identity: "主体与身份",
  product_form: "产品与商业",
  product_position: "产品与商业",
  product_composition_ratio: "构图与画面",
  product_composition: "构图与画面",
  product_material: "材质纹理",
  product_color: "色彩",
  product_feature_detail: "产品与商业",
  product_supporting_elements: "道具与物体",
  product_background: "空间环境",
  product_environment_relation: "空间环境",
  product_lighting: "光影",
  product_photography: "摄影参数",
  commercial_visual_style: "产品与商业",
  product_micro_details: "产品与商业",
  location_scene: "空间环境",
  furniture_soft_decoration: "空间环境",
  background_view: "空间环境",
  floor_material: "材质纹理",
  spatial_detail: "空间环境",
  environment_weather: "环境与氛围",
  light_shadow: "光影",
  main_light_type: "光影",
  light_source: "光影",
  light_temperature: "光影",
  shadow_layer: "光影",
  reflection_environment: "光影",
  light_receiving: "光影",
  color_detail: "色彩",
  mood_tone: "环境与氛围",
  atmosphere: "环境与氛围",
  foreground_occlusion: "构图与画面",
  environment_prop: "道具与物体",
  environment_effect: "环境与氛围",
  whitespace_composition: "构图与画面",
  famous_person: "主体与身份",
  brand: "文本与补充",
  color: "色彩",
  typography: "文本与补充",
  text_content: "文本与补充",
  negative: "文本与补充",
  other: "文本与补充",
};

function normalizePromptLexiconSettings(
  promptLexicons: PromptLexiconSettings | null,
  seedTagLabels: readonly string[],
): PromptLexiconSettings {
  // Only brand-new installs (null) get defaults. An explicit empty settings object
  // means the user cleared the lexicon — never reseed tags/categories.
  if (!promptLexicons) {
    return createDefaultPromptLexiconSettings(seedTagLabels);
  }

  return {
    categories: normalizeImageLexiconEntries(promptLexicons.categories ?? []),
    tags: normalizeImageLexiconEntries(promptLexicons.tags ?? [], { kind: "tag" }),
  };
}

function normalizeImageLexiconEntries(
  entries: readonly PromptImageLexiconEntry[],
  options: { kind?: "category" | "tag" } = {},
): PromptImageLexiconEntry[] {
  const normalizedEntries: PromptImageLexiconEntry[] = [];
  const entriesByKey = new Map<string, PromptImageLexiconEntry>();
  const usedIds = new Set<string>();

  for (const entry of entries) {
    const label = entry.label.trim();

    if (!label) {
      continue;
    }

    const normalizedEntry: PromptImageLexiconEntry = {
      id: getUniqueLexiconId(entry.id, usedIds, "image"),
      group: entry.group.trim(),
      label,
      description: entry.description.trim(),
      parentId: options.kind === "tag" ? null : entry.parentId?.trim() || null,
      imageFileName: entry.imageFileName?.trim() || null,
      ...normalizeTagKnowledge(entry),
    };

    if (options.kind === "tag") {
      const duplicateKey = normalizeLexiconLabelKey(label);
      const existingEntry = entriesByKey.get(duplicateKey);

      if (existingEntry) {
        mergeImageLexiconEntry(existingEntry, normalizedEntry);
        continue;
      }

      entriesByKey.set(duplicateKey, normalizedEntry);
    }

    normalizedEntries.push(normalizedEntry);
  }

  const validIds = new Set(normalizedEntries.map((entry) => entry.id));

  return normalizedEntries.map((entry) => ({
    ...entry,
    parentId: entry.parentId && validIds.has(entry.parentId) && entry.parentId !== entry.id ? entry.parentId : null,
  }));
}

function mergeImageLexiconEntry(targetEntry: PromptImageLexiconEntry, duplicateEntry: PromptImageLexiconEntry): void {
  if (duplicateEntry.aliases?.length) targetEntry.aliases = [...new Set([...(targetEntry.aliases ?? []), ...duplicateEntry.aliases])];
  if (!targetEntry.groupLocked && duplicateEntry.groupLocked) {
    targetEntry.group = duplicateEntry.group;
    targetEntry.groupLocked = true;
    targetEntry.reviewStatus = duplicateEntry.reviewStatus;
  }
  if (!targetEntry.analysis && duplicateEntry.analysis) targetEntry.analysis = duplicateEntry.analysis;
  if (!targetEntry.description && duplicateEntry.description) {
    targetEntry.description = duplicateEntry.description;
  }

  if (!targetEntry.imageFileName && duplicateEntry.imageFileName) {
    targetEntry.imageFileName = duplicateEntry.imageFileName;
  }
}

function getTagIntrinsicGroup(label: string): string | null {
  if (isQuantityTagLabel(label)) {
    return tagQuantityGroupLabel;
  }

  // Classify concrete visual facts before generic vocabulary and colors. A
  // color describes an entity; it must never outrank the entity's semantic
  // layer (for example, a dress is clothing and a flower wall is environment).
  // Clothing is checked before composition because “半身裙” contains “半身”.
  // 具体历史服制（朝代形制）先于泛服饰归入「服制」组，便于古风素材按形制检索。
  if (/玄端|深衣|曲裾|直裾|襜褕|袿衣|襦裙|大袖衫|杂裾|袴褶|裲裆|坦领|半臂|披帛|圆领袍|襕衫|褙子|旋裙|直裰|袄裙|马面裙|比甲|曳撒|旗装|氅衣|马褂|马蹄袖|旗头|花盆底/.test(label)) {
    return "服制 Historical Garment";
  }
  // 人物气质倾向归入「气质」组，与服饰/情绪/风格分开，可多值标注。
  if (/清纯|甜美|甜酷|元气|冷艳|御姐|知性|邻家|优雅|高冷|英气|古灵精怪/.test(label)) {
    return "气质 Temperament";
  }
  // 发型/发长归入「妆发与配饰」维度。发色只是可分离属性（交色彩体系），发型本身才是妆发特征。
  // 即便模型吐回「粉色短发」这类颜色+发型复合词（未经 normalizeImageTag 剖开时直达此处），
  // 也按发型收敛到妆发，绝不落进颜色分类——颜色描述实体，不得盖过实体语义层。置于色彩判定之前，
  // 与「白色花朵→空间环境」同理；「披肩发」列全词以免退回披肩（道具），「马尾」在动物规则之前。
  if (
    /短发|长发|中长发|中发|锁骨发|齐肩发|披肩发|超长发|卷发|直发|大波浪|波浪卷|羊毛卷|盘发|发髻|丸子头|双马尾|马尾|麻花辫|编发|波波头|碎发|湿发|中分|刘海|发型|秀发/.test(
      label,
    )
  ) {
    return "妆发与配饰";
  }
  // 具体菜品 / 节庆食品 / 食材细节归入「美食」组（画面事实、多值）。
  if (/月饼|粽子|饺子|汤圆|年糕|火锅|牛排|寿司|刺身|拉面|烧烤|蛋糕|甜甜圈|布丁|冰淇淋|沙拉|三明治|汉堡|披萨|意面|薯片|巧克力|海鲜|牛肉|猪肉|鸡肉|羊肉|米饭|面条|包子|春卷|牛油果|芒果|西瓜|哈密瓜|柠檬|青柠|柠茶|橙片|橙汁|橙茶|柑橘|西柚|柚子|猕猴桃|草莓|蓝莓|树莓|葡萄|青提|提子|石榴|芭乐|莲雾|黄皮|油柑|山楂|乌梅|陈皮|甘草片|核桃|开心果|巴旦木|夏威夷果|花生|杏仁|奇亚籽|燕麦|西米|椰果|椰蓉|芋头|芋泥|红豆|绿豆|豆乳|奶盖|奶浆|奶油|奶昔|抹茶粉|糖粉|酥皮|水果|鲜果|果肉|果粒|果丁|果酱|果串|冰块|冰沙|茶汤|茶叶|气泡|雪媚娘|凤梨|南瓜|莲子|银耳|牛奶|奶液/.test(label)) {
    return "美食 Food";
  }
  // 宠物品种归入「宠物」组（犬/猫/异宠题材的具体品种，画面事实）；置于主体之前。
  if (/金毛|柯基|柴犬|哈士奇|泰迪|边牧|萨摩耶|拉布拉多|布偶|橘猫|英短|美短|蓝猫|狸花猫|荷兰猪|垂耳兔|龙猫|仓鼠|鹦鹉|文鸟|乌龟|蜥蜴|金鱼|锦鲤/.test(label)) {
    return "宠物 Pet";
  }
  // 数码设备归入「数码」组（电子数码摄影题材的具体设备）；置于主体之前，防「手机」落入泛主体。
  if (/手机|笔记本|平板电脑|相机|单反|键盘|鼠标|显示器|智能手表|游戏机|充电宝|移动电源|耳机|耳罩|音响|音箱/.test(label)) {
    return "数码 Digital";
  }
  // 界面组件/微风格/布局模式归入「UI设计」组；置于材质之前，防「玻璃态/毛玻璃」被玻璃材质误收。
  if (/导航栏|按钮|表单|弹窗|卡片|轮播图|侧边栏|标签页|输入框|开关|进度条|新拟物|拟物化|玻璃态|毛玻璃|瀑布流|向导流|骨架屏/.test(label)) {
    return "UI设计 UI Design";
  }
  // 海报文字 / 排版元素归入「文字排版」组（水印/版权已在准入层排除，不入标签）。
  if (/文字标|字标|文案|口号|挂牌|招牌|副题|排版|标注|营养成分|活动时间|日期标记|尺寸标注|坐标文字|指标格|双语|竖排|字距|英文文字/.test(label)) {
    return "文字排版 Text";
  }
  if (/半身裙|连衣裙|长裙|短裙|裙子|抹胸|吊带|背心|上衣|下装|长裤|短裤|裤子|外套|风衣|夹克|西装|大衣|毛衣|针织|衬衫|衬衣|T恤|体恤|礼服|婚纱|汉服|旗袍|制服|帽衫|Polo衫|羽绒服|棉服|袍|衣|裙|裤|鞋|靴|袜|服装|服饰|穿搭|袖|衣领/.test(label)) {
    return "服饰 Clothing";
  }
  if (/前景|中景|后景|景别|构图|三分|对称|留白|俯拍|仰拍|低角度|高角度|平拍|平视|近景|远景|特写|半身|七分身|全身|视角|镜头/.test(label)) {
    return "构图 Composition";
  }
  if (/抬手|触摸|触碰|手势|姿态|动作|站立|坐姿|躺|行走|回眸|转身|低头|抬头|闭眼|睁眼|眨眼|伸手|握住|奔跑|跳跃/.test(label)) {
    return "动作姿态 Pose";
  }
  if (/花瓶|花束|花篮|花环|耳坠|耳环|耳饰|发簪|发饰|草帽|帽子|团扇|扇子|项链|手链|戒指|眼镜|围巾|领带|领结|披肩|腰带|皮带|胸针|配饰|道具|雨伞|背包|书本|杯子|餐具|托盘|木碗|木盘|木桌|木凳|木架|木盒|长凳|吧椅|藤椅|藤编|竹编|竹篮|提篮|置物架|陈列架|果盘|茶盘|茶则|茶勺|茶筅|茶具|烛台|花器|陶罐|陶盆|陶碗|盆栽|摆件|器具|托特包|布包|斗笠|油纸伞|折扇|绢扇|碗|碟|盘子|木勺|牵马绳|缰绳|马缰|马鞍|缰辔/.test(label)) {
    return "道具与配饰 Props";
  }
  if (/马匹|骏马|马群|马儿|马\b|牛|羊|鹿|狐狸|兔|狼|虎|狮|豹|熊|象|长颈鹿|斑马|孔雀|天鹅|鸭|鹅|鱼|鲸|海豚|蝴蝶|昆虫/.test(label)) {
    return "动物 Animal";
  }
  if (/自然光斑|丁达尔光|轮廓光|斑驳树影|光晕|耀斑|剪影|阴影/.test(label)) {
    return "光影 Lighting";
  }
  // Botanical labels describe the depicted setting by default. This rule is
  // intentionally before the legacy exact Subject list so “白色花朵”,
  // “橙色炮仗花”, “白花” and “麻花瓣” do not fall into Subject.
  if (/花朵|花瓣|炮仗花|花枝|花墙|花园|花(?!纹|色)|树影|树干|树木|叶片|绿叶|枝叶|森林|树林|藤蔓|绿植|植物|草地|湖水|水面|河流|海面|天空|云层|窗景|帷幔|幕布|窗帘|屏风|栈道|道路|街道|建筑|房屋|楼宇|室内|室外|房间|墙面|背景|地面|山景|石头|雪地|沙滩|场景|环境|蓝天|白云|云朵|积云|太阳(?!光|镜)|红日|夕阳|落日|日出|日落|旭日|烈日|晚霞|朝霞|满月|明月|月亮|星空|星点|银河|雪山|远山|山脉|山峦|群山|山地|牧场|草坡|草甸|梯田|湖岸|海平面|海岸|礁石|溪流|瀑布|芦苇|苇草|芦苇荡|枯枝|柳枝|树枝|棕榈|蕨叶|苔藓|荷叶|绿枝|梅枝|飞檐|斗拱|瓦垄|榻榻米|障子|拱窗|石桥|石拱桥|栏杆|台基|回廊|廊柱|吊柜|橱柜|百叶窗|地板|地砖|瓷砖|饰面|吊顶|筒灯|壁灯|吊灯|出风口|石膏线|台面|吧台|窗棂|梁柱|民居|村落|小镇|楼阁|亭台|殿宇|阁楼|长廊|嵌入式|水槽|烤箱|灶台/.test(label)) {
    return "空间环境 Environment";
  }
  if (/玻璃|金属|皮革|木材|陶瓷|布料|液体|石材|塑料|纸|纸张|纹理|纹样|图案|花纹|材质|质感|编织|刺绣|麻编|木质纹理|皮质|丝绸|毛绒|格纹|条纹|针织纹理/.test(label)) {
    return "材质 Material";
  }

  const key = normalizeLexiconLabelKey(label);
  const sets: Array<[string, readonly string[]]> = [
    ["主体 Subject", defaultSubjectTagLabels],
    ["风格 Style", defaultStyleTagLabels],
    ["光影 Lighting", defaultLightingTagLabels],
    ["构图 Composition", defaultCompositionTagLabels],
    ["技术 Technique", defaultTechniqueTagLabels],
    ["材质 Material", defaultMaterialTagLabels],
    ["情绪 Emotion", defaultEmotionTagLabels],
    ["应用 Application", defaultApplicationTagLabels],
  ];

  for (const [group, labels] of sets) {
    if (new Set(labels.map((item) => normalizeLexiconLabelKey(item))).has(key)) {
      return group;
    }
  }

  if (/人|女|男|儿童|猫|狗|鸟|车|手机|表|咖啡|香水|瓶|珠宝|食|饮|动物|宠物|产品主体/.test(label)) {
    return "主体 Subject";
  }
  if (/光|阴影|树影|斑驳|逆光|侧光|棚拍|窗光|霓虹|光晕|耀斑/.test(label)) {
    return "光影 Lighting";
  }
  if (isColorTagLabel(label)) {
    return tagColorGroupLabel;
  }
  if (/^(红|橙|黄|绿|青|蓝|紫|粉|黑|白|灰|金|银)(色)?$/.test(label) || /色调|饱和|对比/.test(label)) {
    return "风格 Style";
  }
  if (/景深|曝光|微距|HDR|虚化|慢门|快门|移轴|多重曝光/.test(label)) {
    return "技术 Technique";
  }
  if (/温暖|孤独|宁静|活力|神秘|浪漫|力量|清冷|紧张|愉悦|高级感/.test(label)) {
    return "情绪 Emotion";
  }
  if (/电商|广告|海报|品牌|社交|杂志|包装|主图|详情|KV|Lookbook|封面/.test(label)) {
    return "应用 Application";
  }
  return null;
}

function isColorTagLabel(label: string): boolean {
  const normalizedLabel = normalizeLexiconLabelKey(label);
  const colorSectionKeys: PromptSplitSectionKey[] = [
    "color",
    "color_detail",
    "scene_color_palette",
    "product_color",
    "clothing_color",
    "hair_color",
    "light_temperature",
    "portrait_lighting_color",
  ];
  const exactColorMatch = colorSectionKeys.some((key) => {
    const meta = promptSectionMeta[key];

    return [key, meta.label, meta.variable].some((value) => normalizeLexiconLabelKey(value) === normalizedLabel);
  });

  return (
    exactColorMatch ||
    /颜色|色彩|色调|配色|色系|肤色|发色|红色|橙色|黄色|绿色|青色|蓝色|紫色|粉色|黑色|白色|灰色|金色|银色|棕色|米色|暖色|冷色|低饱和|高饱和|莫兰迪|color|colour|red|orange|yellow|green|cyan|blue|purple|pink|black|white|gray|grey|gold|silver|brown|beige|monochrome|palette|tone/i.test(
      label,
    )
  );
}

function isQuantityTagLabel(label: string): boolean {
  return /单人|双人|多人|群像|一人|两人|三人|四人|五人|六人|七人|八人|九人|十人|一个|两个|三个|四个|五个|六个|七个|八个|九个|十个|单个|多个|多件|多款|多套|多张|多只|多组|若干|少量|大量|成对|一组|两组|\d+\s*(个|人|只|张|件|组|位|名|款|套)|[一二三四五六七八九十两]+\s*(个|人|只|张|件|组|位|名|款|套)|\b(single|double|triple|multiple|few|many|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(
    label,
  );
}

function resolvePromptTagSectionKey(label: string): PromptSplitSectionKey | null {
  const exactMatch = resolveExactPromptTagSectionKey(label);

  if (exactMatch) {
    return exactMatch;
  }

  const inferredSection = splitPromptToTemplate(label)
    .sections
    .find((section) => section.key !== "negative" && section.key !== "other");

  return inferredSection?.key ?? null;
}

function resolveExactPromptTagSectionKey(label: string): PromptSplitSectionKey | null {
  const normalizedLabel = normalizeLexiconLabelKey(label);

  if (!normalizedLabel) {
    return null;
  }

  const exactMatch = promptSplitSectionOrder.find((key) => {
    const meta = promptSectionMeta[key];

    return [key, meta.label, meta.variable].some((value) => normalizeLexiconLabelKey(value) === normalizedLabel);
  });

  if (exactMatch) {
    return exactMatch;
  }

  return null;
}

function getPromptGroupLeaf(group: string): string {
  const segments = splitPromptLexiconGroupPath(group);

  return segments[segments.length - 1] ?? group.trim();
}

function splitPromptLexiconGroupPath(groupPath: string): string[] {
  return groupPath
    .split(/\s*(?:\/|／|>|＞|→|›|»|\||｜)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function createTagLexiconId(label: string, usedIds: Set<string>): string {
  return getUniqueLexiconId(`tag-${hashText(label)}`, usedIds, "tag");
}

function getUniqueLexiconId(id: string, usedIds: Set<string>, prefix: string): string {
  const normalizedId = id.trim() || `${prefix}-${hashText(Date.now().toString())}`;

  if (!usedIds.has(normalizedId)) {
    usedIds.add(normalizedId);
    return normalizedId;
  }

  let index = 2;
  let nextId = `${normalizedId}-${index}`;

  while (usedIds.has(nextId)) {
    index += 1;
    nextId = `${normalizedId}-${index}`;
  }

  usedIds.add(nextId);
  return nextId;
}

function normalizeLexiconLabelKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hashText(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36);
}

function uniqueLabels(values: readonly string[]): string[] {
  const labels: string[] = [];

  for (const value of values) {
    const label = value.trim();

    if (!label || labels.some((item) => item.toLowerCase() === label.toLowerCase())) {
      continue;
    }

    labels.push(label);
  }

  return labels;
}
