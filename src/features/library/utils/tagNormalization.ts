/**
 * Tag hygiene inspired by image-prompt-library:
 * - normalize freeform labels
 * - merge synonyms onto canonical tags
 * - drop stop words / pure noise
 * - orphan cleanup for lexicon vs material usage
 */

export const funRecipeTagGroupLabel = "趣味配方";
export const mainTagGroupLabels = [
  "主体 Subject",
  "动物 Animal",
  "服饰 Clothing",
  "风格 Style",
  "光影 Lighting",
  "构图 Composition",
  "技术 Technique",
  "材质 Material",
  "情绪 Emotion",
  "应用 Application",
  "空间环境 Environment",
  "动作姿态 Pose",
  "道具与配饰 Props",
  "其他标签 Other",
  "颜色分类",
  "数量分类",
] as const;

const STOP_TAG_KEYS = new Set(
  [
    "全部",
    "标签",
    "分类",
    "未分类",
    "未知",
    "其他",
    "其它",
    "null",
    "undefined",
    "builtin",
    "tag",
    "tags",
    "category",
    "prompt",
    "image",
    "video",
    "aigc",
    "ai",
  ].map(normalizeTagKey),
);

/** synonym / freeform → canonical tag */
const TAG_ALIAS_PAIRS: Array<[string, string]> = [
  ["界面", "UI界面"],
  ["仪表盘", "UI界面"],
  ["ui", "UI界面"],
  ["ui界面", "UI界面"],
  ["海报", "海报"],
  ["海报设计", "海报"],
  ["kv", "海报KV"],
  ["海报kv", "海报KV"],
  ["主图", "电商主图"],
  ["电商主图", "电商主图"],
  ["商品图", "电商主图"],
  ["详情", "详情页"],
  ["详情页", "详情页"],
  ["软光", "柔光"],
  ["硬光影", "硬光"],
  ["逆光轮廓", "逆光"],
  ["侧逆光", "逆光"],
  ["自然光源", "自然光"],
  ["窗光", "自然光"],
  ["浅景深虚化", "浅景深"],
  ["背景虚化", "浅景深"],
  ["bokeh", "浅景深"],
  ["长曝光摄影", "长曝光"],
  ["慢门", "长曝光"],
  ["微距细节", "微距"],
  ["macro", "微距"],
  ["航拍俯视", "航拍俯视"],
  ["无人机视角", "航拍俯视"],
  ["电影感光影", "电影感"],
  ["cinematic", "电影感"],
  ["高级", "高级感"],
  ["premium", "高级感"],
  ["奢华感", "奢华"],
  ["极简风", "极简"],
  ["minimal", "极简"],
  ["日系清新", "日系"],
  ["胶片感", "胶片"],
  ["film grain", "胶片颗粒"],
  ["咖啡饮品", "咖啡"],
  ["玻璃质感", "玻璃"],
  ["金属质感", "金属"],
  ["人物主体", "人物"],
  ["女性人物", "女性"],
  ["男性人物", "男性"],
  ["小孩子", "儿童"],
  ["宝宝", "儿童"],
  ["小猫", "猫"],
  ["小狗", "狗"],
  ["网页分享", "来源网页"],
  ["本地导入", "来源本地"],
];

const aliasMap = new Map<string, string>(
  TAG_ALIAS_PAIRS.map(([alias, canonical]) => [normalizeTagKey(alias), canonical]),
);

// 发型核心名词：发色/染色只是可分离属性（应交色彩体系），发型本身才是「妆发」维度的特征词。
const HAIR_CORE_TERMS =
  "短发|长发|中长发|中发|锁骨发|齐肩发|披肩发|超长发|卷发|直发|大波浪|波浪卷|羊毛卷|盘发|发髻|丸子头|双马尾|马尾|麻花辫|编发|波波头|碎发|湿发|中分|刘海|发型|秀发";
// 「颜色/染发前缀 + 发型核心名词」复合词剖开为纯发型名词（如「粉色短发」→「短发」）。
// 仅当结尾是发型核心名词时才剥前缀，故「白花」「红唇」这类颜色即主体特征的词不会命中；
// 「大波浪卷发」等无颜色前缀的词也原样保留。被剥离的颜色交色彩体系识别，不再重复为标签。
const hairColorCompoundPattern = new RegExp(
  `^(?:亮|暗|浅|深|冷|暖|脏)?(?:粉红|玫红|酒红|正红|橘红|脏橘|焦糖|奶茶|亚麻|莫兰迪|雾霾蓝|雾蓝|香槟|栗|银|粉|红|橙|黄|绿|青|蓝|紫|黑|白|灰|金|棕|米|杏)(?:色|棕|金|灰)?(?:系|调)?(${HAIR_CORE_TERMS})$`,
  "u",
);

export function normalizeTagKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .replace(/[·•]/g, "")
    .replace(/[／/]/g, "/");
}

export type NormalizeImageTagOptions = {
  /** Max compact length for primary tags; longer becomes fun-recipe style. */
  maxPrimaryLength?: number;
};

/**
 * Normalize one freeform tag label.
 * Returns null when the tag should be dropped.
 */
export function normalizeImageTag(
  value: string,
  options: NormalizeImageTagOptions = {},
): string | null {
  const maxPrimaryLength = options.maxPrimaryLength ?? 12;
  let label = value.trim().replace(/^#+/, "").replace(/\s+/g, " ");
  if (!label) {
    return null;
  }

  const key = normalizeTagKey(label);
  if (!key || STOP_TAG_KEYS.has(key)) {
    return null;
  }

  // Drop pure ascii noise / model-ish tokens already handled elsewhere.
  if (/^(midjourney|stable[\s-]?diffusion|chatgpt|openai|nanobanana)/i.test(label)) {
    return null;
  }

  const aliasHit = aliasMap.get(key);
  if (aliasHit) {
    return aliasHit;
  }

  // 颜色+发型复合词剖开为纯发型核心名词，颜色交色彩体系识别，不再作发型附属标签重复。
  const hairCompoundMatch = label.replace(/\s+/g, "").match(hairColorCompoundPattern);
  if (hairCompoundMatch) {
    return hairCompoundMatch[1];
  }

  // Prefer short Chinese / mixed feature words.
  const compact = label.replace(/\s+/g, "");
  if (compact.length > maxPrimaryLength) {
    // Keep as a fun-recipe style free tag but still truncated for UI.
    return compact.slice(0, Math.min(compact.length, 18));
  }

  return label;
}

export function normalizeImageTagList(
  tags: readonly string[],
  options: NormalizeImageTagOptions = {},
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const normalized = normalizeImageTag(raw, options);
    if (!normalized) {
      continue;
    }
    const key = normalizeTagKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export type TagLexiconLike = {
  id: string;
  group: string;
  label: string;
  description?: string;
  parentId?: string | null;
  imageFileName?: string | null;
};

/**
 * Preserve recognized tag groups. The compatibility bucket is retained only
 * for callers that still pass genuinely unresolved legacy rows.
 */
export function collapseTagsIntoMainAndFunRecipe<T extends TagLexiconLike>(
  entries: readonly T[],
  usedLabelKeys: ReadonlySet<string>,
  options: { maxFunChildren?: number } = {},
): T[] {
  const maxFunChildren = options.maxFunChildren ?? 28;
  const main: T[] = [];
  const funCandidates: T[] = [];

  for (const entry of entries) {
    const key = normalizeTagKey(entry.label);
    if (!key) {
      continue;
    }
    // Hide orphans from sidebar (still may exist in lexicon until prune).
    if (usedLabelKeys.size > 0 && !usedLabelKeys.has(key) && !usedLabelKeys.has(normalizeTagKey(entry.label))) {
      continue;
    }

    const isGenericGroup = ["通用标签", funRecipeTagGroupLabel, "自定义标签"].some(
      (group) => normalizeTagKey(group) === normalizeTagKey(entry.group),
    );
    const isMainGroup =
      mainTagGroupLabels.some((group) => normalizeTagKey(group) === normalizeTagKey(entry.group)) || !isGenericGroup;
    if (isMainGroup) {
      main.push(entry);
    } else {
      funCandidates.push({
        ...entry,
        group: funRecipeTagGroupLabel,
      });
    }
  }

  // Prefer higher-usage first when possible: keep stable order, just cap.
  const fun = funCandidates.slice(0, maxFunChildren);
  return [...main, ...fun];
}

export function collectUsedTagKeysFromItems(
  items: ReadonlyArray<{ tags?: readonly string[] | null }>,
): Set<string> {
  const used = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const normalized = normalizeImageTag(tag);
      if (!normalized) {
        continue;
      }
      used.add(normalizeTagKey(normalized));
      used.add(normalizeTagKey(tag));
    }
  }
  return used;
}

/**
 * Remove lexicon tag entries that are unused by any material.
 */
export function pruneOrphanTagLexiconEntries<T extends TagLexiconLike>(
  entries: readonly T[],
  usedLabelKeys: ReadonlySet<string>,
): { entries: T[]; removedCount: number } {
  if (usedLabelKeys.size === 0) {
    // Explicitly created tags are a directory, not derived analysis data. Keep
    // them even before they are assigned to a material.
    const kept = entries.filter((entry) => entry.id.startsWith("custom-tag-"));
    return { entries: kept, removedCount: entries.length - kept.length };
  }

  const next: T[] = [];
  let removedCount = 0;
  for (const entry of entries) {
    const key = normalizeTagKey(entry.label);
    const isCustomTag = entry.id.startsWith("custom-tag-");
    if (!isCustomTag && (!key || !usedLabelKeys.has(key))) {
      removedCount += 1;
      continue;
    }
    next.push(entry);
  }
  return { entries: next, removedCount };
}

/**
 * Apply synonym merge + normalize to material tags and lexicon rows.
 */
export function sanitizeMaterialTags(tags: readonly string[]): string[] {
  return normalizeImageTagList(tags);
}
