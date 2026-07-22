import type {
  LibraryItem,
  PromptImageLexiconEntry,
  PromptLexiconSettings,
  PromptParameterLexiconEntry,
} from "../types/library";
import { photographyCategoryDefinitions } from "./photographyCategories";
import {
  buildPromptAnalysisFromSavedCapsules,
  omitNegativeAnalysisSections,
  type PromptAnalysisResult,
} from "./promptAnalysis";
import {
  getPromptSectionKeyByVariable,
  normalizePromptSectionValue,
  promptSectionMeta,
  promptSplitSectionOrder,
  splitPromptToTemplate,
  type PromptSplitSectionKey,
} from "./promptSplit";

export type PromptParameterLexiconValue = {
  group?: string;
  label: string;
  sectionKey?: PromptSplitSectionKey;
  sourcePromptId?: string | null;
  sourcePromptTitle?: string | null;
  value: string;
  variable: string;
};

export type PromptParameterLexiconSource = {
  sourcePromptId?: string | null;
  sourcePromptTitle?: string | null;
};

export type PromptParameterLexiconValueScopes = {
  all: string[];
  currentPrompt: string[];
  global: string[];
  otherPrompts: string[];
};

export type PromptLexiconMergeResult = {
  addedCount: number;
  indexedPromptCount: number;
  promptLexicons: PromptLexiconSettings;
};

export type PromptLexiconPruneResult = {
  promptLexicons: PromptLexiconSettings | null;
  removedCategoryCount: number;
  removedCount: number;
  removedParameterCount: number;
  removedTagCount: number;
  skipped?: boolean;
};

export type PromptParameterMenuValidationCode = "duplicate-name" | "numeric-prefix";

export type PromptParameterMenuValidationIssue = {
  code: PromptParameterMenuValidationCode;
  message: string;
  name: string;
  parentPath: string;
  path: string;
};

export type PromptParameterMenuValidationResult = {
  isValid: boolean;
  issues: PromptParameterMenuValidationIssue[];
};

const defaultTagLexiconGroupLabel = "通用标签";
const tagColorGroupLabel = "颜色分类";
const tagQuantityGroupLabel = "数量分类";
const aiTagDescription = "来自 AI 标签分析";
const currentPromptTagDescription = "来自当前提示词标签";
const defaultParameterFunctionalGroupLabel = "文本与补充";
const functionalPromptParameterGroupLabels = [
  "摄影参数",
  "风格与审美",
  "光影",
  "道具与物体",
  "主体与身份",
  "身体与面部",
  "妆发与配饰",
  "服装结构",
  "动作姿态",
  "空间环境",
  "构图与画面",
  "材质纹理",
  "色彩",
  "食材与烹饪",
  "产品与商业",
  "环境与氛围",
  "文本与补充",
] as const;
const legacyPromptParameterDomainLabelKeys = new Set(
  [
    "人物像素级拆解",
    "场景像素级拆解",
    "电商产品图分析",
    "食物身份分析",
    "菜系识别",
    "风格像素级拆解",
    "光影像素级拆解",
    "道具像素级拆解",
    "历史地域服饰像素级拆解",
    "镜头与画面",
  ].map(normalizeMenuNameKey),
);
const legacyPromptParameterMenuLabelGroupByKey = new Map<string, string>([
  ...functionalPromptParameterGroupLabels.map((label) => [normalizeMenuNameKey(label), label] as const),
  ...[
    ["摄影参数", "摄影参数"],
    ["人像摄影参数", "摄影参数"],
    ["场景摄影参数", "摄影参数"],
    ["产品摄影参数", "摄影参数"],
    ["摄影表现风格", "摄影参数"],
    ["摄影呈现", "摄影参数"],
    ["镜头器材", "摄影参数"],
    ["拍摄角度", "摄影参数"],
    ["景别", "摄影参数"],
    ["画面比例", "摄影参数"],
    ["构图逻辑", "摄影参数"],
    ["曝光逻辑", "摄影参数"],
    ["图像风格", "风格与审美"],
    ["风格类别", "风格与审美"],
    ["视觉流派", "风格与审美"],
    ["时代属性", "风格与审美"],
    ["国家文化", "风格与审美"],
    ["审美体系", "风格与审美"],
    ["设计语言", "风格与审美"],
    ["风格关键词", "风格与审美"],
    ["商业视觉风格", "产品与商业"],
    ["主体定位", "主体与身份"],
    ["人物主体定位", "主体与身份"],
    ["基础身份属性", "主体与身份"],
    ["年龄气质", "主体与身份"],
    ["食物大类别", "主体与身份"],
    ["具体名称识别", "主体与身份"],
    ["产品主体定位", "主体与身份"],
    ["服饰文化身份", "主体与身份"],
    ["国家地区体系", "主体与身份"],
    ["民族体系", "主体与身份"],
    ["历史时期", "主体与身份"],
    ["历史朝代", "主体与身份"],
    ["社会身份", "主体与身份"],
    ["身体结构", "身体与面部"],
    ["身材骨架", "身体与面部"],
    ["面部结构", "身体与面部"],
    ["骨相五官", "身体与面部"],
    ["肤质细节", "身体与面部"],
    ["皮肤基底", "身体与面部"],
    ["肤质纹理", "身体与面部"],
    ["皮肤附加细节", "身体与面部"],
    ["发型结构", "妆发与配饰"],
    ["发型头饰", "妆发与配饰"],
    ["发型造型", "妆发与配饰"],
    ["饰品细节", "妆发与配饰"],
    ["面部配饰", "妆发与配饰"],
    ["颈部配饰", "妆发与配饰"],
    ["手部配饰", "妆发与配饰"],
    ["头部配饰", "妆发与配饰"],
    ["服装结构", "服装结构"],
    ["服装细节", "服装结构"],
    ["服装风格", "服装结构"],
    ["服装剪裁", "服装结构"],
    ["服装形制", "服装结构"],
    ["裁剪方式", "服装结构"],
    ["穿着方式", "服装结构"],
    ["层次结构", "服装结构"],
    ["配套系统", "服装结构"],
    ["制作工艺", "服装结构"],
    ["服饰微观细节", "服装结构"],
    ["动作姿态", "动作姿态"],
    ["手部手势", "动作姿态"],
    ["腿部体态", "动作姿态"],
    ["肩颈体态", "动作姿态"],
    ["表情情绪", "动作姿态"],
    ["面部表情", "动作姿态"],
    ["场景类型定位", "空间环境"],
    ["空间结构", "空间环境"],
    ["空间比例尺度", "空间环境"],
    ["建筑结构", "空间环境"],
    ["建筑空间结构", "空间环境"],
    ["背景环境", "空间环境"],
    ["产品背景环境", "空间环境"],
    ["产品与环境关系", "空间环境"],
    ["产品环境关系", "空间环境"],
    ["透视关系", "构图与画面"],
    ["场景透视关系", "构图与画面"],
    ["前中后景分层", "构图与画面"],
    ["构图布局", "构图与画面"],
    ["产品构图布局", "构图与画面"],
    ["产品比例关系", "构图与画面"],
    ["构图语言", "构图与画面"],
    ["构图留白", "构图与画面"],
    ["材质纹理", "材质纹理"],
    ["材质语言", "材质纹理"],
    ["产品材质纹理", "材质纹理"],
    ["场景材质纹理", "材质纹理"],
    ["服装材质", "材质纹理"],
    ["地面材质", "材质纹理"],
    ["色彩体系", "色彩"],
    ["色彩语言", "色彩"],
    ["色彩关系", "色彩"],
    ["基础颜色", "色彩"],
    ["场景色彩体系", "色彩"],
    ["产品色彩体系", "色彩"],
    ["服装颜色", "色彩"],
    ["发色", "色彩"],
    ["色彩基因", "色彩"],
    ["光影关系", "光影"],
    ["光影表现", "光影"],
    ["光影语言", "光影"],
    ["光源类型", "光影"],
    ["光源位置", "光影"],
    ["光线方向", "光影"],
    ["阴影方向", "光影"],
    ["反射折射", "光影"],
    ["摄影灯光方案", "光影"],
    ["微观光学细节", "光影"],
    ["道具识别", "道具与物体"],
    ["道具类别", "道具与物体"],
    ["道具功能作用", "道具与物体"],
    ["数量组合关系", "道具与物体"],
    ["空间位置", "道具与物体"],
    ["尺寸比例", "道具与物体"],
    ["外形结构", "道具与物体"],
    ["摆放方式", "道具与物体"],
    ["使用状态", "道具与物体"],
    ["主体关联关系", "道具与物体"],
    ["主要物体元素", "道具与物体"],
    ["产品配件元素", "道具与物体"],
    ["环境小道具", "道具与物体"],
    ["菜系分类", "食材与烹饪"],
    ["地域文化来源", "食材与烹饪"],
    ["典型食材体系", "食材与烹饪"],
    ["味型视觉表达", "食材与烹饪"],
    ["传统摆盘习惯", "食材与烹饪"],
    ["常用餐具风格", "食材与烹饪"],
    ["主体食材", "食材与烹饪"],
    ["辅助食材", "食材与烹饪"],
    ["结构层次", "食材与烹饪"],
    ["外形轮廓", "食材与烹饪"],
    ["烹饪方式", "食材与烹饪"],
    ["熟成状态", "食材与烹饪"],
    ["口感视觉表现", "食材与烹饪"],
    ["新鲜程度", "食材与烹饪"],
    ["份量比例", "食材与烹饪"],
    ["产品外观结构", "产品与商业"],
    ["产品摆放角度", "产品与商业"],
    ["产品细节卖点", "产品与商业"],
    ["商业定位", "产品与商业"],
    ["风格商业定位", "产品与商业"],
    ["产品微观细节", "产品与商业"],
    ["微观真实细节", "产品与商业"],
    ["情绪表达", "环境与氛围"],
    ["氛围情绪", "环境与氛围"],
    ["故事氛围", "环境与氛围"],
    ["时间天气", "环境与氛围"],
    ["环境天气", "环境与氛围"],
    ["参考对象", "文本与补充"],
    ["品牌文字", "文本与补充"],
    ["知名品牌", "文本与补充"],
    ["字体", "文本与补充"],
    ["文本内容", "文本与补充"],
    ["负向提示词", "文本与补充"],
    ["避免内容", "文本与补充"],
    ["其他", "文本与补充"],
    ["补充信息", "文本与补充"],
  ].map(([label, group]) => [normalizeMenuNameKey(label), group] as const),
]);
const defaultStyleAnalysisTagLabels = [
  "风格类别",
  "视觉流派",
  "时代属性",
  "国家文化",
  "审美体系",
  "色彩语言",
  "构图语言",
  "光影语言",
  "材质语言",
  "空间语言",
  "设计语言",
  "情绪表达",
  "风格商业定位",
  "风格关键词",
] as const;
const defaultLightingAnalysisTagLabels = [
  "光源类型",
  "光源位置",
  "光线方向",
  "光源大小",
  "光线硬软程度",
  "光线强弱",
  "光比关系",
  "明暗分布",
  "阴影方向",
  "阴影软硬",
  "高光位置",
  "反射折射",
  "材质响应",
  "环境光照",
  "色温色彩",
  "时间天气",
  "氛围情绪",
  "摄影灯光方案",
  "微观光学细节",
] as const;
const defaultPropAnalysisTagLabels = [
  "道具识别",
  "道具类别",
  "道具功能作用",
  "数量组合关系",
  "空间位置",
  "尺寸比例",
  "外形结构",
  "材质纹理",
  "色彩关系",
  "摆放方式",
  "使用状态",
  "主体关联关系",
  "光影表现",
  "风格属性",
  "故事氛围",
  "微观细节",
] as const;
const defaultCostumeAnalysisTagLabels = [
  "服饰文化身份",
  "国家地区体系",
  "民族体系",
  "历史时期",
  "历史朝代",
  "服装形制",
  "裁剪方式",
  "穿着方式",
  "层次结构",
  "配套系统",
  "社会身份",
  "制作工艺",
  "民族纹样符号",
  "服饰审美语言",
  "摄影呈现",
  "服饰微观细节",
] as const;

export function createDefaultPromptLexiconSettings(tagLabels: readonly string[] = []): PromptLexiconSettings {
  return {
    parameters: promptSplitSectionOrder.map((key) => {
      const meta = promptSectionMeta[key];

      return {
        id: `parameter-${key}`,
        group: getPromptParameterGroup(key),
        label: meta.label,
        variable: meta.variable,
        value: "",
      };
    }),
    categories: photographyCategoryDefinitions.map((category, index) => ({
      id: `category-${index + 1}`,
      group: category.group,
      label: category.label,
      description: category.description,
      parentId: null,
      imageFileName: null,
    })),
    tags: uniqueLabels([
      ...defaultStyleAnalysisTagLabels,
      ...defaultLightingAnalysisTagLabels,
      ...defaultPropAnalysisTagLabels,
      ...defaultCostumeAnalysisTagLabels,
      ...tagLabels,
    ]).map((tag, index) => ({
      id: `tag-${index + 1}`,
      group: getPromptTagGroup(tag),
      label: tag,
      description: currentPromptTagDescription,
      parentId: null,
      imageFileName: null,
    })),
  };
}

export function mergeLibraryPromptParametersIntoLexicon(
  promptLexicons: PromptLexiconSettings | null,
  items: readonly LibraryItem[],
  knownCategories: readonly string[] = [],
): PromptLexiconMergeResult {
  return mergeLibraryPromptParametersIntoLexiconForItems(promptLexicons, items, items, knownCategories);
}

/**
 * 仅扫描指定条目，避免导入后全库重建导致数秒卡顿。
 * seed/normalize 仍基于全库标签，保证默认词库完整。
 */
export function mergeLibraryPromptParametersIntoLexiconForItems(
  promptLexicons: PromptLexiconSettings | null,
  allItems: readonly LibraryItem[],
  targetItems: readonly LibraryItem[],
  knownCategories: readonly string[] = [],
): PromptLexiconMergeResult {
  const seedTagLabels = uniqueLabels(allItems.flatMap((item) => item.tags));
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, seedTagLabels);
  const parameterWorkingSet = createParameterLexiconWorkingSet(normalizedLexicons.parameters);
  const tagWorkingSet = createTagLexiconWorkingSet(normalizedLexicons.tags);
  let addedCount = 0;
  let indexedPromptCount = 0;

  for (const item of targetItems) {
    const savedCapsuleAnalysis = buildPromptAnalysisFromSavedCapsules(`${item.prompt}\n${item.negativePrompt}`, {
      title: item.title,
      tags: item.tags,
      currentCategory: item.category ?? undefined,
      knownCategories,
    });
    const visibleAnalysis = savedCapsuleAnalysis ? omitNegativeAnalysisSections(savedCapsuleAnalysis) : null;

    if (!visibleAnalysis || visibleAnalysis.sections.length === 0) {
      continue;
    }

    const source: PromptParameterLexiconSource = {
      sourcePromptId: item.id,
      sourcePromptTitle: item.title,
    };

    for (const section of visibleAnalysis.sections) {
      for (const value of section.values) {
        const added = applyParameterValueToWorkingSet(
          parameterWorkingSet,
          {
            group: getPromptParameterGroup(section.key),
            label: section.label,
            sectionKey: section.key,
            value,
            variable: section.variable,
          },
          source,
        );

        if (added) {
          addedCount += 1;
        }
      }
    }

    addedCount += applyTagLabelsToWorkingSet(tagWorkingSet, visibleAnalysis.suggestedTags);
    indexedPromptCount += 1;
  }

  return {
    addedCount,
    indexedPromptCount,
    promptLexicons: {
      ...normalizedLexicons,
      parameters: parameterWorkingSet.parameters,
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
      removedParameterCount: 0,
      removedTagCount: 0,
    };
  }

  // 没有“绑定到具体提示词来源”的参数时，不需要全库重建引用图。
  // 分类/标签默认词条会保留，剩余项可按当前库的直接标签/分类快速过滤。
  const hasSourceBoundParameters = promptLexicons.parameters.some(
    (entry) =>
      Boolean(normalizeOptionalSourceValue(entry.sourcePromptId) || normalizeOptionalSourceValue(entry.sourcePromptTitle)),
  );

  if (!hasSourceBoundParameters) {
    return prunePromptLexiconsWithoutSourceBoundParameters(promptLexicons, items, knownCategories);
  }

  const references = collectPromptLexiconReferences(items, knownCategories);
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, references.seedTagLabels);
  const defaultLexicons = createDefaultPromptLexiconSettings([]);
  const defaultCategoryLabelKeys = new Set(
    defaultLexicons.categories.map((entry) => normalizeLexiconLabelKey(entry.label)),
  );
  const defaultTagLabelKeys = new Set(defaultLexicons.tags.map((entry) => normalizeLexiconLabelKey(entry.label)));
  const parameters = normalizedLexicons.parameters.filter((entry) => shouldKeepParameterEntry(entry, references));
  const categories = normalizedLexicons.categories.filter((entry) =>
    shouldKeepCategoryEntry(entry, references, defaultCategoryLabelKeys),
  );
  const tags = normalizedLexicons.tags.filter((entry) =>
    shouldKeepTagEntry(entry, references, defaultTagLabelKeys),
  );
  const removedParameterCount = normalizedLexicons.parameters.length - parameters.length;
  const removedCategoryCount = normalizedLexicons.categories.length - categories.length;
  const removedTagCount = normalizedLexicons.tags.length - tags.length;

  return {
    promptLexicons: {
      parameters,
      categories,
      tags,
    },
    removedCategoryCount,
    removedCount: removedParameterCount + removedCategoryCount + removedTagCount,
    removedParameterCount,
    removedTagCount,
  };
}

/**
 * 删除条目后的轻量剪枝：只清理明确绑定到已删提示词的参数，
 * 不做全库胶囊分析。日志显示完整剪枝常花费数秒且 removedCount=0。
 */
export function prunePromptLexiconsAfterItemDeletion(
  promptLexicons: PromptLexiconSettings | null,
  _remainingItems: readonly LibraryItem[],
  deletedItems: readonly LibraryItem[],
  _knownCategories: readonly string[] = [],
): PromptLexiconPruneResult {
  if (!promptLexicons || deletedItems.length === 0) {
    return {
      promptLexicons,
      removedCategoryCount: 0,
      removedCount: 0,
      removedParameterCount: 0,
      removedTagCount: 0,
      skipped: true,
    };
  }

  const deletedIds = new Set(deletedItems.map((item) => item.id));
  const deletedTitles = new Set(
    deletedItems
      .map((item) => item.title.trim())
      .filter((title) => title.length > 0),
  );

  const parameters = promptLexicons.parameters.filter((entry) => {
    const sourceId = normalizeOptionalSourceValue(entry.sourcePromptId);
    const sourceTitle = normalizeOptionalSourceValue(entry.sourcePromptTitle);

    if (sourceId && deletedIds.has(sourceId)) {
      return false;
    }

    if (sourceTitle && deletedTitles.has(sourceTitle)) {
      return false;
    }

    return true;
  });

  const removedParameterCount = promptLexicons.parameters.length - parameters.length;

  if (removedParameterCount === 0) {
    return {
      promptLexicons,
      removedCategoryCount: 0,
      removedCount: 0,
      removedParameterCount: 0,
      removedTagCount: 0,
      skipped: true,
    };
  }

  return {
    promptLexicons: {
      parameters,
      categories: promptLexicons.categories,
      tags: promptLexicons.tags,
    },
    removedCategoryCount: 0,
    removedCount: removedParameterCount,
    removedParameterCount,
    removedTagCount: 0,
  };
}

function prunePromptLexiconsWithoutSourceBoundParameters(
  promptLexicons: PromptLexiconSettings,
  items: readonly LibraryItem[],
  knownCategories: readonly string[],
): PromptLexiconPruneResult {
  const seedTagLabels = uniqueLabels(items.flatMap((item) => item.tags));
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, seedTagLabels);
  const defaultLexicons = createDefaultPromptLexiconSettings([]);
  const defaultCategoryLabelKeys = new Set(
    defaultLexicons.categories.map((entry) => normalizeLexiconLabelKey(entry.label)),
  );
  const defaultTagLabelKeys = new Set(defaultLexicons.tags.map((entry) => normalizeLexiconLabelKey(entry.label)));
  const categoryLabelKeys = new Set<string>();
  const tagLabelKeys = new Set<string>();

  for (const category of knownCategories) {
    addLexiconLabelKey(categoryLabelKeys, category);
  }

  for (const item of items) {
    addLexiconLabelKey(categoryLabelKeys, item.category ?? "");

    for (const tag of item.tags) {
      addLexiconLabelKey(tagLabelKeys, tag);
      addLexiconLabelKey(categoryLabelKeys, tag);
    }
  }

  const references: PromptLexiconReferenceKeys = {
    categoryLabelKeys,
    parameterValueKeys: new Set<string>(),
    parameterVariableValueKeys: new Set<string>(),
    seedTagLabels,
    tagLabelKeys,
  };
  const parameters = normalizedLexicons.parameters.filter((entry) => shouldKeepParameterEntry(entry, references));
  const categories = normalizedLexicons.categories.filter((entry) =>
    shouldKeepCategoryEntry(entry, references, defaultCategoryLabelKeys),
  );
  const tags = normalizedLexicons.tags.filter((entry) =>
    shouldKeepTagEntry(entry, references, defaultTagLabelKeys),
  );
  const removedParameterCount = normalizedLexicons.parameters.length - parameters.length;
  const removedCategoryCount = normalizedLexicons.categories.length - categories.length;
  const removedTagCount = normalizedLexicons.tags.length - tags.length;

  return {
    promptLexicons: {
      parameters,
      categories,
      tags,
    },
    removedCategoryCount,
    removedCount: removedParameterCount + removedCategoryCount + removedTagCount,
    removedParameterCount,
    removedTagCount,
  };
}

export function mergePromptAnalysisParametersIntoLexicon(
  promptLexicons: PromptLexiconSettings | null,
  analysis: PromptAnalysisResult,
  seedTagLabels: readonly string[] = [],
  source: PromptParameterLexiconSource = {},
): { promptLexicons: PromptLexiconSettings; addedCount: number } {
  const parameterResult = mergePromptParameterValuesIntoLexicon(
    promptLexicons,
    analysis.sections.flatMap((section) =>
      section.values.map((value) => ({
        group: getPromptParameterGroup(section.key),
        label: section.label,
        sectionKey: section.key,
        value,
        variable: section.variable,
      })),
    ),
    seedTagLabels,
    source,
  );
  const tagResult = mergePromptTagLabelsIntoLexicon(parameterResult.promptLexicons, analysis.suggestedTags, seedTagLabels);

  return {
    promptLexicons: tagResult.promptLexicons,
    addedCount: parameterResult.addedCount + tagResult.addedCount,
  };
}

type ParameterLexiconWorkingSet = {
  parameters: PromptParameterLexiconEntry[];
  usedIds: Set<string>;
  existingEntriesByValueKey: Map<string, PromptParameterLexiconEntry>;
};

function createParameterLexiconWorkingSet(
  parameters: readonly PromptParameterLexiconEntry[],
): ParameterLexiconWorkingSet {
  const nextParameters = [...parameters];

  return {
    parameters: nextParameters,
    usedIds: new Set(nextParameters.map((entry) => entry.id)),
    existingEntriesByValueKey: new Map(
      nextParameters
        .filter((entry) => entry.value.trim())
        .map((entry) => [createParameterValueKey(entry.group, entry.label, entry.variable, entry.value), entry] as const),
    ),
  };
}

function applyParameterValueToWorkingSet(
  workingSet: ParameterLexiconWorkingSet,
  value: PromptParameterLexiconValue,
  source: PromptParameterLexiconSource,
): boolean {
  const variable = normalizeVariable(value.variable);
  const sectionKey = value.sectionKey ?? getPromptSectionKeyByVariable(variable) ?? "other";
  const normalizedValue = normalizePromptSectionValue(sectionKey, value.value);

  if (!variable || !normalizedValue) {
    return false;
  }

  const label = value.label.trim() || promptSectionMeta[sectionKey].label;
  const group = resolvePromptParameterGroup(variable, value.group?.trim() || getPromptParameterGroup(sectionKey));
  const sourcePromptId = normalizeOptionalSourceValue(value.sourcePromptId ?? source.sourcePromptId);
  const sourcePromptTitle = normalizeOptionalSourceValue(value.sourcePromptTitle ?? source.sourcePromptTitle);
  const valueKey = createParameterValueKey(group, label, variable, normalizedValue);
  const existingEntry = workingSet.existingEntriesByValueKey.get(valueKey);

  if (existingEntry) {
    mergeParameterEntrySource(existingEntry, sourcePromptId, sourcePromptTitle);
    return false;
  }

  const nextEntry = {
    id: createParameterLexiconId(variable, normalizedValue, workingSet.usedIds),
    group,
    label,
    sourcePromptId,
    sourcePromptTitle,
    variable,
    value: normalizedValue,
  };
  workingSet.parameters.push(nextEntry);
  workingSet.existingEntriesByValueKey.set(valueKey, nextEntry);
  return true;
}

export function mergePromptParameterValuesIntoLexicon(
  promptLexicons: PromptLexiconSettings | null,
  values: readonly PromptParameterLexiconValue[],
  seedTagLabels: readonly string[] = [],
  source: PromptParameterLexiconSource = {},
): { promptLexicons: PromptLexiconSettings; addedCount: number } {
  const normalizedLexicons = normalizePromptLexiconSettings(promptLexicons, seedTagLabels);
  const workingSet = createParameterLexiconWorkingSet(normalizedLexicons.parameters);
  let addedCount = 0;

  for (const value of values) {
    if (applyParameterValueToWorkingSet(workingSet, value, source)) {
      addedCount += 1;
    }
  }

  return {
    promptLexicons: {
      ...normalizedLexicons,
      parameters: workingSet.parameters,
    },
    addedCount,
  };
}

export function getPromptParameterLexiconValues(
  promptLexicons: PromptLexiconSettings | null,
  variable: string,
): string[] {
  return getPromptParameterLexiconValueScopes(promptLexicons, variable).all;
}

export function getPromptParameterLexiconValueScopes(
  promptLexicons: PromptLexiconSettings | null,
  variable: string,
  sourcePromptId: string | null = null,
): PromptParameterLexiconValueScopes {
  const variableKey = normalizeVariableKey(variable);

  if (!promptLexicons || !variableKey) {
    return {
      all: [],
      currentPrompt: [],
      global: [],
      otherPrompts: [],
    };
  }

  const values = promptLexicons.parameters.filter(
    (entry) => normalizeVariableKey(entry.variable) === variableKey && entry.value.trim(),
  );
  const normalizedSourcePromptId = normalizeOptionalSourceValue(sourcePromptId);
  const currentPrompt = normalizedSourcePromptId
    ? values
        .filter((entry) => normalizeOptionalSourceValue(entry.sourcePromptId) === normalizedSourcePromptId)
        .map((entry) => entry.value)
    : [];
  const global = values
    .filter((entry) => !normalizeOptionalSourceValue(entry.sourcePromptId) && !normalizeOptionalSourceValue(entry.sourcePromptTitle))
    .map((entry) => entry.value);
  const otherPrompts = values
    .filter((entry) => {
      const entrySourcePromptId = normalizeOptionalSourceValue(entry.sourcePromptId);
      const entrySourcePromptTitle = normalizeOptionalSourceValue(entry.sourcePromptTitle);

      return entrySourcePromptId
        ? entrySourcePromptId !== normalizedSourcePromptId
        : Boolean(entrySourcePromptTitle);
    })
    .map((entry) => entry.value);

  return {
    all: uniqueLabels([...currentPrompt, ...global, ...otherPrompts, ...values.map((entry) => entry.value)]),
    currentPrompt: uniqueLabels(currentPrompt),
    global: uniqueLabels(global),
    otherPrompts: uniqueLabels(otherPrompts),
  };
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
      group: getPromptTagGroup(tagLabel),
      label: tagLabel,
      description: aiTagDescription,
      parentId: null,
      imageFileName: null,
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

export function getPromptParameterGroup(key: string): string {
  return promptParameterGroupBySection[key as PromptSplitSectionKey] ?? defaultParameterFunctionalGroupLabel;
}

export function getPromptTagGroup(label: string, fallbackGroup = defaultTagLexiconGroupLabel): string {
  const exactSectionKey = resolveExactPromptTagSectionKey(label);

  if (exactSectionKey && exactSectionKey !== "negative" && exactSectionKey !== "other" && exactSectionKey !== "color") {
    return getPromptGroupLeaf(getPromptParameterGroup(exactSectionKey));
  }

  const intrinsicGroup = getTagIntrinsicGroup(label);

  if (intrinsicGroup) {
    return intrinsicGroup;
  }

  const sectionKey = resolvePromptTagSectionKey(label);

  if (sectionKey && sectionKey !== "negative" && sectionKey !== "other") {
    return getPromptGroupLeaf(getPromptParameterGroup(sectionKey));
  }

  return getPromptGroupLeaf(fallbackGroup) || defaultTagLexiconGroupLabel;
}

export function normalizePromptParameterGroupPath(group: string): string {
  const segments = splitPromptLexiconGroupPath(group)
    .map(stripMenuNumericPrefix)
    .filter((segment) => segment && !isLegacyPromptParameterDomainSegment(segment));

  for (const segment of [...segments].reverse()) {
    const functionalGroup = getFunctionalPromptParameterGroupByMenuLabel(segment);

    if (functionalGroup) {
      return functionalGroup;
    }
  }

  return segments.length > 0 ? segments.join(" / ") : defaultParameterFunctionalGroupLabel;
}

export function migratePromptParameterLexiconGroups(
  entries: readonly PromptParameterLexiconEntry[],
): PromptParameterLexiconEntry[] {
  return entries.map((entry) => {
    const variable = normalizeVariable(entry.variable);
    const group = resolvePromptParameterGroup(variable, entry.group);

    return group === entry.group ? entry : { ...entry, group };
  });
}

export function validatePromptParameterMenuPath(group: string): PromptParameterMenuValidationResult {
  return createPromptParameterMenuValidationResult(collectPromptParameterMenuPathIssues(group));
}

export function validatePromptParameterMenuTree(groups: readonly string[]): PromptParameterMenuValidationResult {
  const issues = groups.flatMap(collectPromptParameterMenuPathIssues);
  const namesByParentPath = new Map<string, Map<string, Set<string>>>();

  for (const group of groups) {
    const parentSegments: string[] = [];

    for (const segment of splitPromptLexiconGroupPath(group)) {
      const name = segment.trim();
      const parentPath = parentSegments.join(" / ");
      const nameKey = normalizeMenuNameKey(stripMenuNumericPrefix(name) || name);

      if (nameKey) {
        const siblingNames = getOrCreateMap(namesByParentPath, parentPath);
        const rawNames = siblingNames.get(nameKey) ?? new Set<string>();
        rawNames.add(name);
        siblingNames.set(nameKey, rawNames);
      }

      parentSegments.push(name);
    }
  }

  for (const [parentPath, siblingNames] of namesByParentPath) {
    for (const rawNames of siblingNames.values()) {
      if (rawNames.size <= 1) {
        continue;
      }

      const names = [...rawNames].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
      issues.push({
        code: "duplicate-name",
        message: `同一层级下存在重名菜单：${names.join("、")}`,
        name: names.join("、"),
        parentPath,
        path: [...splitPromptLexiconGroupPath(parentPath), names[0] ?? ""].filter(Boolean).join(" / "),
      });
    }
  }

  return createPromptParameterMenuValidationResult(dedupePromptParameterMenuIssues(issues));
}

export function validatePromptParameterMenuEntries(
  entries: readonly PromptParameterLexiconEntry[],
): PromptParameterMenuValidationResult {
  const issues = [...validatePromptParameterMenuTree(entries.map((entry) => entry.group)).issues];
  const itemsByParentPath = new Map<
    string,
    Map<string, { labels: Set<string>; path: string; variables: Set<string> }>
  >();

  for (const entry of entries) {
    const label = entry.label.trim();

    if (!label) {
      continue;
    }

    const variable = normalizeVariable(entry.variable);
    const parentPath = resolvePromptParameterGroup(variable, entry.group);
    const path = [parentPath, label].filter(Boolean).join(" / ");

    if (hasMenuNumericPrefix(label)) {
      issues.push({
        code: "numeric-prefix",
        message: `菜单名称不能以数字序号开头：${label}`,
        name: label,
        parentPath,
        path,
      });
    }

    const labelKey = normalizeMenuNameKey(stripMenuNumericPrefix(label) || label);

    if (!labelKey) {
      continue;
    }

    const siblingItems = getOrCreateMap(itemsByParentPath, parentPath);
    const item = siblingItems.get(labelKey) ?? {
      labels: new Set<string>(),
      path,
      variables: new Set<string>(),
    };
    item.labels.add(label);
    item.variables.add(normalizeVariableKey(variable));
    siblingItems.set(labelKey, item);
  }

  for (const [parentPath, siblingItems] of itemsByParentPath) {
    for (const item of siblingItems.values()) {
      if (item.labels.size <= 1 && item.variables.size <= 1) {
        continue;
      }

      const names = [...item.labels].sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
      issues.push({
        code: "duplicate-name",
        message: `同一菜单下存在重名参数集合：${names.join("、")}`,
        name: names.join("、"),
        parentPath,
        path: item.path,
      });
    }
  }

  return createPromptParameterMenuValidationResult(dedupePromptParameterMenuIssues(issues));
}

const promptParameterGroupBySection: Record<PromptSplitSectionKey, string> = {
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

function resolvePromptParameterGroup(variable: string, group: string): string {
  const sectionKey = getPromptSectionKeyByVariable(variable);

  if (sectionKey) {
    return getPromptParameterGroup(sectionKey);
  }

  return normalizePromptParameterGroupPath(group);
}

function normalizePromptLexiconSettings(
  promptLexicons: PromptLexiconSettings | null,
  seedTagLabels: readonly string[],
): PromptLexiconSettings {
  const defaultSettings = createDefaultPromptLexiconSettings(seedTagLabels);

  if (!promptLexicons) {
    return defaultSettings;
  }

  return {
    parameters: mergeMissingParameterDefaults(
      normalizeParameterLexiconEntries(promptLexicons.parameters),
      defaultSettings.parameters,
    ),
    categories: mergeMissingImageDefaults(
      normalizeImageLexiconEntries(promptLexicons.categories),
      defaultSettings.categories,
      "category",
    ),
    tags: mergeMissingImageDefaults(
      normalizeImageLexiconEntries(promptLexicons.tags, { kind: "tag" }),
      defaultSettings.tags,
      "tag",
    ),
  };
}

function mergeMissingParameterDefaults(
  entries: readonly PromptParameterLexiconEntry[],
  defaults: readonly PromptParameterLexiconEntry[],
): PromptParameterLexiconEntry[] {
  const nextEntries = [...entries];
  const usedIds = new Set(nextEntries.map((entry) => entry.id));
  const existingKeys = new Set(
    nextEntries.map((entry) => createParameterValueKey(entry.group, entry.label, entry.variable, entry.value)),
  );

  for (const defaultEntry of defaults) {
    const defaultKey = createParameterValueKey(
      defaultEntry.group,
      defaultEntry.label,
      defaultEntry.variable,
      defaultEntry.value,
    );

    if (existingKeys.has(defaultKey)) {
      continue;
    }

    nextEntries.push({
      ...defaultEntry,
      id: getUniqueLexiconId(defaultEntry.id, usedIds, "parameter"),
    });
    existingKeys.add(defaultKey);
  }

  return nextEntries;
}

function mergeMissingImageDefaults(
  entries: readonly PromptImageLexiconEntry[],
  defaults: readonly PromptImageLexiconEntry[],
  prefix: "category" | "tag",
): PromptImageLexiconEntry[] {
  const nextEntries = [...entries];
  const usedIds = new Set(nextEntries.map((entry) => entry.id));
  const existingLabels = new Set(nextEntries.map((entry) => normalizeLexiconLabelKey(entry.label)));

  for (const defaultEntry of defaults) {
    const defaultLabel = normalizeLexiconLabelKey(defaultEntry.label);

    if (existingLabels.has(defaultLabel)) {
      continue;
    }

    nextEntries.push({
      ...defaultEntry,
      id: getUniqueLexiconId(defaultEntry.id, usedIds, prefix),
    });
    existingLabels.add(defaultLabel);
  }

  return nextEntries;
}

function normalizeParameterLexiconEntries(
  entries: readonly PromptParameterLexiconEntry[],
): PromptParameterLexiconEntry[] {
  const normalizedEntries: PromptParameterLexiconEntry[] = [];
  const entriesByKey = new Map<string, PromptParameterLexiconEntry>();
  const usedIds = new Set<string>();

  for (const entry of entries) {
    const variable = normalizeVariable(entry.variable);
    const label = entry.label.trim();

    if (!variable || !label) {
      continue;
    }

    const id = getUniqueLexiconId(entry.id, usedIds, "parameter");
    const normalizedEntry: PromptParameterLexiconEntry = {
      id,
      group: resolvePromptParameterGroup(variable, entry.group),
      label,
      sourcePromptId: normalizeOptionalSourceValue(entry.sourcePromptId),
      sourcePromptTitle: normalizeOptionalSourceValue(entry.sourcePromptTitle),
      variable,
      value: entry.value.trim(),
    };
    const duplicateKey = createParameterValueKey(
      normalizedEntry.group,
      normalizedEntry.label,
      normalizedEntry.variable,
      normalizedEntry.value,
    );
    const existingEntry = entriesByKey.get(duplicateKey);

    if (existingEntry) {
      mergeParameterEntrySource(existingEntry, normalizedEntry.sourcePromptId, normalizedEntry.sourcePromptTitle);
      continue;
    }

    entriesByKey.set(duplicateKey, normalizedEntry);
    normalizedEntries.push(normalizedEntry);
  }

  return normalizedEntries;
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
      group: options.kind === "tag" ? getPromptTagGroup(label, entry.group) : entry.group.trim(),
      label,
      description: entry.description.trim(),
      parentId: options.kind === "tag" ? null : entry.parentId?.trim() || null,
      imageFileName: entry.imageFileName?.trim() || null,
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
  if (!targetEntry.description && duplicateEntry.description) {
    targetEntry.description = duplicateEntry.description;
  }

  if (!targetEntry.imageFileName && duplicateEntry.imageFileName) {
    targetEntry.imageFileName = duplicateEntry.imageFileName;
  }
}

type PromptLexiconReferenceKeys = {
  categoryLabelKeys: Set<string>;
  parameterValueKeys: Set<string>;
  parameterVariableValueKeys: Set<string>;
  seedTagLabels: string[];
  tagLabelKeys: Set<string>;
};

function collectPromptLexiconReferences(
  items: readonly LibraryItem[],
  knownCategories: readonly string[],
): PromptLexiconReferenceKeys {
  const references: PromptLexiconReferenceKeys = {
    categoryLabelKeys: new Set<string>(),
    parameterValueKeys: new Set<string>(),
    parameterVariableValueKeys: new Set<string>(),
    seedTagLabels: uniqueLabels(items.flatMap((item) => item.tags)),
    tagLabelKeys: new Set<string>(),
  };

  for (const item of items) {
    addLexiconLabelKey(references.categoryLabelKeys, item.category ?? "");

    for (const tag of item.tags) {
      addLexiconLabelKey(references.tagLabelKeys, tag);
      addLexiconLabelKey(references.categoryLabelKeys, tag);
    }

    const savedCapsuleAnalysis = buildPromptAnalysisFromSavedCapsules(`${item.prompt}\n${item.negativePrompt}`, {
      title: item.title,
      tags: item.tags,
      currentCategory: item.category ?? undefined,
      knownCategories,
    });
    const visibleAnalysis = savedCapsuleAnalysis ? omitNegativeAnalysisSections(savedCapsuleAnalysis) : null;

    if (!visibleAnalysis) {
      continue;
    }

    for (const section of visibleAnalysis.sections) {
      for (const value of section.values) {
        const reference = createParameterReferenceKeys(section.key, section.label, section.variable, value);

        if (!reference) {
          continue;
        }

        references.parameterValueKeys.add(reference.valueKey);
        references.parameterVariableValueKeys.add(reference.variableValueKey);
      }
    }

    for (const tag of visibleAnalysis.suggestedTags) {
      addLexiconLabelKey(references.tagLabelKeys, tag);
    }

    for (const category of visibleAnalysis.suggestedCategories) {
      addLexiconLabelKey(references.categoryLabelKeys, category);
    }
  }

  return references;
}

function createParameterReferenceKeys(
  sectionKey: PromptSplitSectionKey,
  label: string,
  variableName: string,
  value: string,
): { valueKey: string; variableValueKey: string } | null {
  const variable = normalizeVariable(variableName);
  const normalizedValue = normalizePromptSectionValue(sectionKey, value);

  if (!variable || !normalizedValue) {
    return null;
  }

  const resolvedLabel = label.trim() || promptSectionMeta[sectionKey].label;
  const group = resolvePromptParameterGroup(variable, getPromptParameterGroup(sectionKey));

  return {
    valueKey: createParameterValueKey(group, resolvedLabel, variable, normalizedValue),
    variableValueKey: createParameterVariableValueKey(variable, normalizedValue),
  };
}

function shouldKeepParameterEntry(
  entry: PromptParameterLexiconEntry,
  references: PromptLexiconReferenceKeys,
): boolean {
  const value = entry.value.trim();

  if (!value) {
    return true;
  }

  if (references.parameterValueKeys.has(createParameterValueKey(entry.group, entry.label, entry.variable, value))) {
    return true;
  }

  if (references.parameterVariableValueKeys.has(createParameterVariableValueKey(entry.variable, value))) {
    return true;
  }

  if (normalizeOptionalSourceValue(entry.sourcePromptId) || normalizeOptionalSourceValue(entry.sourcePromptTitle)) {
    return false;
  }

  return !isGeneratedParameterEntry(entry);
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

function isGeneratedParameterEntry(entry: PromptParameterLexiconEntry): boolean {
  const value = entry.value.trim();

  if (!value) {
    return false;
  }

  const baseId = createParameterLexiconBaseId(entry.variable, value);

  return entry.id === baseId || entry.id.startsWith(`${baseId}-`);
}

function getTagIntrinsicGroup(label: string): string | null {
  if (isColorTagLabel(label)) {
    return tagColorGroupLabel;
  }

  if (isQuantityTagLabel(label)) {
    return tagQuantityGroupLabel;
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

function collectPromptParameterMenuPathIssues(group: string): PromptParameterMenuValidationIssue[] {
  const issues: PromptParameterMenuValidationIssue[] = [];
  const parentSegments: string[] = [];

  for (const segment of splitPromptLexiconGroupPath(group)) {
    const name = segment.trim();
    const parentPath = parentSegments.join(" / ");
    const path = [...parentSegments, name].filter(Boolean).join(" / ");

    if (hasMenuNumericPrefix(name)) {
      issues.push({
        code: "numeric-prefix",
        message: `菜单名称不能以数字序号开头：${name}`,
        name,
        parentPath,
        path,
      });
    }

    parentSegments.push(name);
  }

  return issues;
}

function createPromptParameterMenuValidationResult(
  issues: PromptParameterMenuValidationIssue[],
): PromptParameterMenuValidationResult {
  return {
    isValid: issues.length === 0,
    issues,
  };
}

function dedupePromptParameterMenuIssues(
  issues: readonly PromptParameterMenuValidationIssue[],
): PromptParameterMenuValidationIssue[] {
  const nextIssues: PromptParameterMenuValidationIssue[] = [];
  const usedKeys = new Set<string>();

  for (const issue of issues) {
    const key = `${issue.code}|${issue.parentPath}|${issue.path}|${issue.name}`;

    if (usedKeys.has(key)) {
      continue;
    }

    usedKeys.add(key);
    nextIssues.push(issue);
  }

  return nextIssues;
}

function getFunctionalPromptParameterGroupByMenuLabel(label: string): string | null {
  const normalizedLabel = normalizeMenuNameKey(stripMenuNumericPrefix(label));
  const mappedGroup = legacyPromptParameterMenuLabelGroupByKey.get(normalizedLabel);

  if (mappedGroup) {
    return mappedGroup;
  }

  const sectionKey = promptSplitSectionOrder.find((key) => {
    const meta = promptSectionMeta[key];

    return [key, meta.label, meta.variable].some((value) => normalizeMenuNameKey(value) === normalizedLabel);
  });

  return sectionKey ? getPromptParameterGroup(sectionKey) : null;
}

function isLegacyPromptParameterDomainSegment(segment: string): boolean {
  const segmentKey = normalizeMenuNameKey(segment);

  return legacyPromptParameterDomainLabelKeys.has(segmentKey) || /(?:像素级拆解|身份分析|产品图分析)$/u.test(segment);
}

function hasMenuNumericPrefix(name: string): boolean {
  return /^\s*\d+\s*$/u.test(name) || /^\s*\d+[\s_\-.、:：)）]+(?=\S)/u.test(name);
}

function stripMenuNumericPrefix(name: string): string {
  const trimmedName = name.trim();

  if (/^\d+\s*$/u.test(trimmedName)) {
    return "";
  }

  return trimmedName.replace(/^\d+[\s_\-.、:：)）]+(?=\S)/u, "").trim();
}

function getOrCreateMap<TKey, TValue>(source: Map<TKey, Map<string, TValue>>, key: TKey): Map<string, TValue> {
  const existingValue = source.get(key);

  if (existingValue) {
    return existingValue;
  }

  const nextValue = new Map<string, TValue>();
  source.set(key, nextValue);

  return nextValue;
}

function createParameterValueKey(
  group: string,
  label: string,
  variable: string,
  value: string,
): string {
  const groupKey = group.trim().toLowerCase();
  const labelKey = label.trim().toLowerCase();

  return `${groupKey}:${labelKey}:${value.trim().toLowerCase()}`;
}

function createParameterVariableValueKey(variable: string, value: string): string {
  return `${normalizeVariableKey(variable)}:${value.trim().toLowerCase()}`;
}

function mergeParameterEntrySource(
  entry: PromptParameterLexiconEntry,
  sourcePromptId: string | null | undefined,
  sourcePromptTitle: string | null | undefined,
): void {
  const entrySourcePromptId = normalizeOptionalSourceValue(entry.sourcePromptId);
  const entrySourcePromptTitle = normalizeOptionalSourceValue(entry.sourcePromptTitle);
  const nextSourcePromptId = normalizeOptionalSourceValue(sourcePromptId);
  const nextSourcePromptTitle = normalizeOptionalSourceValue(sourcePromptTitle);

  if (entrySourcePromptId !== nextSourcePromptId || entrySourcePromptTitle !== nextSourcePromptTitle) {
    entry.sourcePromptId = null;
    entry.sourcePromptTitle = null;
  }
}

function createParameterLexiconId(variable: string, value: string, usedIds: Set<string>): string {
  const baseId = createParameterLexiconBaseId(variable, value);

  return getUniqueLexiconId(baseId, usedIds, "parameter");
}

function createParameterLexiconBaseId(variable: string, value: string): string {
  return `parameter-${toIdSegment(variable)}-${hashText(value)}`;
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

function normalizeVariable(value: string): string {
  const variable = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  const sectionKey = getPromptSectionKeyByVariable(variable);

  return sectionKey ? promptSectionMeta[sectionKey].variable : variable;
}

function normalizeVariableKey(value: string): string {
  return normalizeVariable(value).toLowerCase();
}

function normalizeMenuNameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-Hans-CN");
}

function normalizeLexiconLabelKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeOptionalSourceValue(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";

  return normalized || null;
}

function toIdSegment(value: string): string {
  return normalizeVariableKey(value).replace(/[^a-z0-9_-]/g, "-") || "custom";
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
