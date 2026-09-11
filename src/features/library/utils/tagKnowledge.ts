import type { PromptImageLexiconEntry } from "../types/library";
import type { TagKnowledge } from "../types/tagKnowledge";
import { matchTagEntity, requiresWholeTagMeaning } from "./tagEntityGroups";
import { getTagNoise, getTagSemanticHint, getTagEvidenceGroup, hasReliableTagEvidence } from "./tagQuality";

export const tagGroupPaths = [
  "人物/主体", "人物/身体与面部", "人物/妆发", "人物/动作姿态", "人物/表情",
  "服饰/衣物", "服饰/服制", "服饰/配饰", "服饰/结构与纹样",
  "自然环境/植物/树木", "自然环境/植物/叶片", "自然环境/植物/花卉", "自然环境/植物/其他植物",
  "自然环境/水域", "自然环境/山石地形", "自然环境/天气与天空", "动物/动物与宠物", "动物/身体特征",
  "建筑空间/建筑与构件", "建筑空间/园林", "建筑空间/家具陈设", "建筑空间/道路设施", "建筑空间/游乐设施",
  "物品/道具", "物品/数码设备", "物品/交通工具", "食物/蔬菜", "食物/水果", "食物/食品与饮品",
  "物品/数码设备/相机品牌", "物品/数码设备/相机型号", "物品/数码设备/设备品牌",
  "物品/数码设备/器材配件",
  "视觉表现/光影", "视觉表现/构图与景别", "视觉表现/材质纹理", "视觉表现/风格", "视觉表现/情绪",
  "视觉表现/色彩", "视觉表现/背景", "视觉表现/摄影效果",
  "视觉表现/线条与形状", "视觉表现/影像技术",
  "设计/版式与应用", "设计/界面元素", "设计/文字内容", "来源信息", "待归纳", "疑似噪音",
] as const;

const synonyms: Record<string, string> = {
  胡杨树: "胡杨", 手托脸颊: "托腮", 手托腮: "托腮", 托着腮: "托腮",
  双手上扬: "双手扬起", 衬衣: "衬衫", 树叶: "叶片", 银杏树: "银杏", 枫树叶: "枫叶",
};
const legacyGroups: Record<string, string> = {
  "主体 Subject": "人物/主体", 主体与身份: "人物/主体", 身体与面部: "人物/身体与面部",
  "服饰 Clothing": "服饰/衣物", "服制 Historical Garment": "服饰/服制", 服装结构: "服饰/结构与纹样",
  妆发与配饰: "人物/妆发", "动作姿态 Pose": "人物/动作姿态", 动作姿态: "人物/动作姿态",
  "动物 Animal": "动物/动物与宠物", "宠物 Pet": "动物/动物与宠物",
  "道具与配饰 Props": "物品/道具", 道具与物体: "物品/道具", "数码 Digital": "物品/数码设备",
  "美食 Food": "食物/食品与饮品", 食材与烹饪: "食物/食品与饮品",
  "光影 Lighting": "视觉表现/光影", "构图 Composition": "视觉表现/构图与景别",
  "材质 Material": "视觉表现/材质纹理", 材质纹理: "视觉表现/材质纹理",
  "风格 Style": "视觉表现/风格", 风格与审美: "视觉表现/风格",
  "情绪 Emotion": "视觉表现/情绪", "应用 Application": "设计/版式与应用",
  "文字排版 Text": "设计/文字内容", "UI设计 UI Design": "设计/界面元素",
};

// Whole-word patterns, ordered by entity meaning. Do not infer synonymy from substrings.
const groups: Array<[RegExp, string]> = [
  [/^(?:胡杨|银杏|枫树|柳树|松树|树木|树干|树枝|树皮|树根|枯枝|柳枝|棕榈|梅枝)$/, "自然环境/植物/树木"],
  [/^(?:红叶|黄叶|绿叶|枫叶|银杏叶|叶片|枝叶|落叶|荷叶|蕨叶|绿枝)$/, "自然环境/植物/叶片"],
  [/^(?:白花|红花|黄花|紫花|花朵|花瓣|花枝|樱花|百合花|雏菊|洋甘菊|玫瑰|荷花|桃花|梅花|炮仗花)$/, "自然环境/植物/花卉"],
  [/^(?:芦苇|芦苇荡|苇草|苔藓|藤蔓|绿植|草地|森林|树林|灌木|草丛|羽状花序)$/, "自然环境/植物/其他植物"],
  [/^(?:湖泊|湖水|湖面|水面|河流|溪流|瀑布|海面|海水|池塘|水面波纹|涟漪|水波纹|湖岸|海平面)$/, "自然环境/水域"],
  [/^(?:湖石|假山石|石头|山石|岩石|岩壁|礁石|雪山|远山|山脉|山峦|群山|山地|沙滩|海岸|草坡|草甸|梯田)$/, "自然环境/山石地形"],
  [/^(?:天空|云朵|云层|白云|蓝天|太阳|月亮|满月|明月|星空|银河|晚霞|朝霞|夕阳|落日|日出|日落|积雪|雪地|雨|雨滴|雨丝|雪|雪花|雾)$/, "自然环境/天气与天空"],
  [/^(?:假山|园林|庭院|池亭|月洞门|圆形门洞|栈道|石桥|石拱桥|花园)$/, "建筑空间/园林"],
  [/^(?:红柱|廊柱|梁柱|护栏|栏杆|栅栏|院墙|砖墙|混凝土墙|墙面|拱窗|窗棂|门洞|长廊|回廊|飞檐|斗拱|瓦垄|架空线|输电塔|建筑|房屋|房间|地板|地砖|砖地|楼阁|亭台)$/, "建筑空间/建筑与构件"],
  [/^(?:木质柜|木柜|柜门把手|橱柜|吊柜|书桌|木桌|桌子|长凳|椅子|藤椅|木凳|屏风|窗帘|帷幔|幕布|台面|吧台|置物架)$/, "建筑空间/家具陈设"],
  [/^(?:黄瓜|南瓜|番茄|西红柿|胡萝卜|萝卜|白菜|青菜|茄子|辣椒|土豆|玉米|西兰花)$/, "食物/蔬菜"],
  [/^(?:浆果|草莓|蓝莓|树莓|樱桃|葡萄|西瓜|芒果|苹果|橙子|柠檬|青柠|牛油果|水果|桃子|柑橘|石榴|香蕉|梨)$/, "食物/水果"],
  [/^(?:肩膀|肩颈|手指|手掌|手部|脸颊|面部|锁骨|腰部|背部|双腿|眼睛|嘴唇|红唇)$/, "人物/身体与面部"],
  [/^(?:回头|回眸|转身|托腮|抬手|低头|抬头|仰面|站立|坐姿|行走|奔跑|跳跃|双手扬起|双手合十|张开双臂|双手举过头顶|手遮额头|手搭额头|闭眼|睁眼)$/, "人物/动作姿态"],
  [/^(?:手持|手提|手握|双手抓|持)(?:花束|花朵|团扇|折扇|餐铲|长巾|围巾|水果|月饼|枝叶|烟花|饮料罐|羽毛|竹篮|箱包|辫子|辫)$/, "人物/动作姿态"],
  [/^(?:微笑|大笑|皱眉|张嘴|眨眼|凝视)$/, "人物/表情"],
  [/^(?:徽章|徽章贴布|胸针|发簪|发饰|耳坠|耳环|耳饰|项链|手链|戒指|腰链|围巾|腰带|皮带|领带|领结|蝴蝶结|璎珞项圈|眼镜|帽子|草帽|贝雷帽)$/, "服饰/配饰"],
  [/^(?:长发|短发|卷发|直发|刘海|辫子|麻花辫|双麻花辫|长辫|马尾|双马尾|盘发|发髻|丸子头|中分)$/, "人物/妆发"],
  [/^(?:团扇|扇子|折扇|油纸伞|雨伞|书本|报纸|剪贴板|剪贴画|剪贴墙|花束|花瓶|花篮|竹篮|竹筐|竹编提篮|竹编背篓|长巾|手提袋|羽毛笔|水晶|珠串)$/, "物品/道具"],
  [/^(?:箭头标识|双幅拼图|双联画面|竖版海报|横版海报|多产品组合|剖面展示)$/, "设计/版式与应用"],
];

export function tagKey(value: string): string { return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, ""); }

export function isUnorganizedTagGroup(group: string): boolean {
  return !group.trim() || /^(?:其他标签(?: Other)?|通用标签|自定义标签|趣味配方|空间环境(?: Environment)?|文本与补充|环境与氛围|颜色分类|摄影参数|技术 Technique|待归纳|疑似噪音)$/.test(group.trim()) || group.endsWith("待细分");
}

export function isStandardTagGroup(group: string): boolean {
  return tagGroupPaths.includes(group as typeof tagGroupPaths[number]) || Object.hasOwn(legacyGroups, group);
}

export function normalizeTagKnowledge(input: unknown): TagKnowledge {
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, unknown>;
  const result: TagKnowledge = {};
  if (Array.isArray(value.aliases)) result.aliases = [...new Set(value.aliases.filter((a): a is string => typeof a === "string").map(a => a.trim()).filter(a => a && a.length <= 80))].slice(0, 40);
  if (value.groupLocked === true) result.groupLocked = true;
  if (value.reviewStatus === "accepted" || value.reviewStatus === "pending" || value.reviewStatus === "noise") result.reviewStatus = value.reviewStatus;
  if (value.analysis && typeof value.analysis === "object") {
    const a = value.analysis as Record<string, unknown>;
    if (typeof a.confidence === "number" && Number.isFinite(a.confidence)) result.analysis = {
      confidence: Math.max(0, Math.min(1, a.confidence)),
      dimension: typeof a.dimension === "string" ? a.dimension.slice(0, 40) : "other",
      evidence: Array.isArray(a.evidence) ? a.evidence.filter((e): e is string => typeof e === "string").slice(0, 4).map(e => e.slice(0, 160)) : [],
      ...(typeof a.suggestedGroup === "string" && tagGroupPaths.includes(a.suggestedGroup as typeof tagGroupPaths[number]) ? { suggestedGroup: a.suggestedGroup } : {}),
    };
  }
  return result;
}

export function findKnownTag(label: string, entries: readonly PromptImageLexiconEntry[]): PromptImageLexiconEntry | undefined {
  const key = tagKey(label);
  const direct = entries.find(e => tagKey(e.label) === key);
  if (direct?.groupLocked) return direct;
  const aliases = entries.filter(e => e.aliases?.some(a => tagKey(a) === key));
  // Ambiguous user aliases are never guessed.
  return aliases.length === 1 ? aliases[0] : direct;
}

export function canonicalTagLabel(label: string, entries: readonly PromptImageLexiconEntry[] = []): string {
  return findKnownTag(label, entries)?.label ?? synonyms[label.trim()] ?? label.trim();
}

export function proposeTagGroup(label: string, fallback = "", dimension = "", aiGroup = "", evidence: readonly string[] = []): string {
  const evidenceGroup = getTagEvidenceGroup(label, evidence);
  if (evidenceGroup) return evidenceGroup;
  const semantic = getTagSemanticHint(label);
  if (semantic) return semantic.group;
  const entity = matchTagEntity(label);
  if (entity) return entity.group;
  const match = groups.find(([pattern]) => pattern.test(label));
  if (match) return match[1];
  if (tagGroupPaths.includes(aiGroup as typeof tagGroupPaths[number]) && aiGroup !== "待归纳" && aiGroup !== "疑似噪音") return aiGroup;
  if (requiresWholeTagMeaning(label) && (!fallback || isStandardTagGroup(fallback) || isUnorganizedTagGroup(fallback))) return "待归纳";
  if (tagGroupPaths.includes(fallback as typeof tagGroupPaths[number])) return fallback;
  if (legacyGroups[fallback]) return legacyGroups[fallback];
  if (fallback && !isUnorganizedTagGroup(fallback)) return fallback;
  if (dimension === "scene") return "自然环境/待细分";
  if (dimension === "composition") return "视觉表现/构图与景别";
  if (dimension === "lighting") return "视觉表现/光影";
  return "待归纳";
}

export function tagNoiseReason(label: string): string | null {
  return getTagNoise(label)?.reason ?? null;
}

/** Shared final grouping for new local/remote analysis. Never run on library load. */
export function buildAnalyzedTagEntry(
  label: string,
  analysis: NonNullable<TagKnowledge["analysis"]> | undefined,
  known?: PromptImageLexiconEntry,
): PromptImageLexiconEntry {
  const customGroup = known?.group && !isStandardTagGroup(known.group) && !isUnorganizedTagGroup(known.group) ? known.group : undefined;
  const evidence = analysis?.evidence ?? [];
  // A known standard group is not evidence. Re-evaluate it with the same full-phrase
  // rules as a fresh label; never reuse the legacy substring classifier here.
  const group = customGroup ?? proposeTagGroup(label, "", analysis?.dimension, analysis?.suggestedGroup, evidence);
  const pending = isUnorganizedTagGroup(group) || !analysis || analysis.confidence < 0.8 || !hasReliableTagEvidence(evidence);
  return {
    ...known,
    id: known?.id ?? `tag-knowledge-${encodeURIComponent(label)}`,
    label,
    description: known?.description || "来自 AI 标签分析",
    parentId: known?.parentId ?? null,
    imageFileName: known?.imageFileName ?? null,
    ...normalizeTagKnowledge(known),
    group: customGroup ?? (pending ? "待归纳" : group),
    reviewStatus: pending ? "pending" : "accepted",
    ...(analysis ? normalizeTagKnowledge({ analysis: { ...analysis, suggestedGroup: group } }) : {}),
  };
}

export const tagRecognitionPolicy = [
  "统一标签归纳规范：只提取当前输入中明确可见或写明的事实；词库仅用于统一命名，不是画面证据。",
  "优先检索价值高的主体细节、衣物配饰、动作、植物、环境、道具、光影和构图；返回0-15个，不设最低数量，不为凑数列举边缘碎片。没有有效特征时tags返回[]。",
  "同义词统一：胡杨树→胡杨、手托腮/手托脸颊→托腮、双手上扬→双手扬起。相关词不能冒充同义词：假山≠假山石、湖泊≠湖水、徽章≠徽章贴布，红叶/黄叶/绿叶保留差异。",
  "分类负责稳定的内容类型/题材/风格类别；标签负责具体检索特征。不得把光线、色彩、景深、情绪硬塞进图像分类，也不得重复返回图像分类名称。",
  "不提取水印、来源头像、网站图标、平台名称、文件编号、营销口号；可见招牌/海报文字只有在其本身是检索目标时进入设计/文字内容，不能和实体混组。",
  "实体品牌与水印必须区分：画面相机机身上清晰的SONY归入物品/数码设备/相机品牌，α7C归入相机型号；品牌/型号的evidence必须说明对应设备及可读标识，不能只写看见文字。仅在角落出现HUAWEI/XMAGE不得推断画面有该设备，更不能推断拍摄器材。看不清的Ninco/UOVZ不猜成真实品牌。",
  "禁止把一句文字拆成大、道等碎词；禁止编号A180508、用户名、重复营销文案和只有动感/好看/高级等泛泛评价。马、树、雾等明确的单字实体仍可保留。白线必须说明是道路标线、服装线条还是设计线条；遮阳必须说明真实动作；中国不能仅凭风景或字样推断为拍摄地点。",
  "流心、拉丝、融化、剖面、悬浮构图等可见动态或结构是内容特征，应保留；局部手持道具标注动作，不凭局部手部推断人物身份，不将合成布景当成真实拍摄场景。",
  "先判断完整短语的中心含义：蝴蝶发夹/蝴蝶结发带属于服饰/配饰，蝴蝶结肩带/牛角扣属于服饰/结构与纹样，蝴蝶本身才属于动物；羽毛/翅膀属于动物/身体特征，兔子摆件属于物品/道具。",
  "手持蝴蝶/手持草莓/手持玻璃杯/手持相机均按人物/动作姿态分组，不按手中的对象分组；玻璃杯是物品，玻璃是材质，玻璃态是界面风格。相机背带是器材配件，狗尾草是植物。禁止用局部字词推断主体，不能确定完整词义时保留待归纳。",
  "每个标签必须保留dimension、confidence和简短evidence，并额外给出group；不确定的身份、品种和分组不得猜测，group用待归纳。",
  "分组以完整词义和当前输入依据为准，旧标准分组和模型返回的group不能覆盖明确实体规则；笔记本须区分纸本与电脑，镜头须区分器材与景别，无法辨别或依据互相冲突时标记待归纳。",
  `group仅从以下路径选择：${tagGroupPaths.join("、")}。衣物按实体归类，动作里的道具不改变动作分组；颜色不覆盖植物/服饰的实体分组。`,
].join("\n");
