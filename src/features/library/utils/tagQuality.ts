/** Shared tag-only admission rules. Never run these as a startup cleanup of user data. */
export type TagSemanticHint = { group: string; reason: string; evidenceRequired?: "camera" | "device" | "imaging" };
export type TagNoise = { group: string; reason: string };

const cameraBrands = /^(?:SONY|索尼|Canon|佳能|Nikon|尼康|Fujifilm|Fujifilm富士|富士|Leica|徕卡|Hasselblad|哈苏|Pentax|宾得|Olympus|奥林巴斯|OM System|Lumix|松下|Panasonic|Ricoh|理光|Sigma|适马)$/i;
const cameraModels = /^(?:(?:SONY|索尼)\s*)?(?:[αa]7(?:[crs](?:\s?(?:ii|iii|iv|v|[2-5]))?)?|[αa]9(?:\s?(?:ii|iii|[2-3]))?|ILCE-\d{1,4}[A-Z]*|ZV-E\d{1,2}|(?:EOS\s*)?R[135678](?:\s*Mark\s*(?:II|III))?|Z\s?(?:[5-9]|f|fc)|X-T[1-5]0?|GR\s?(?:II|III)x?)$/i;
const deviceBrands = /^(?:HUAWEI|华为|Apple|苹果手机|Samsung|三星|Xiaomi|小米|OPPO|vivo|Honor|荣耀)$/i;
const sourceNames = /^(?:ComfyUI|Midjourney|Stable Diffusion|ChatGPT|OpenAI|微博|小红书)$/i;
const sourceEvidence = /水印|角标|作者(?:签名|署名)|账号(?:名|标识)|平台(?:标识|图标)|来源(?:标识|文字)|营销(?:文案|口号)|推广(?:文案|文字)|watermark|username|signature/i;
const uncertainEvidence = /(?:无法|不能|难以|未能)(?:确认|辨认|识别|判断)|看不清|不确定|疑似|猜测|推测|可能|似乎|或许|大概|看起来像|外形像|无法辨别|unreadable|illegible|uncertain|guess|looks like|possibly|maybe/i;
const cameraEvidence = /相机|微单|单反|机身|镜头|camera|dslr|mirrorless/i;
const deviceEvidence = /手机|平板|电脑|笔记本|显示器|耳机|相机|机身|phone|tablet|laptop|camera/i;
const readableMark = /清晰|可见|可辨认|印有|标识|标志|品牌|型号|logo|reads|printed|label|marking/i;

export function getTagSemanticHint(label: string): TagSemanticHint | undefined {
  const term = label.normalize("NFKC").trim();
  if (cameraBrands.test(term)) return { group: "物品/数码设备/相机品牌", reason: "相机品牌，区别于画面文案和来源水印", evidenceRequired: "camera" };
  if (cameraModels.test(term)) return { group: "物品/数码设备/相机型号", reason: "相机型号，不作为随机编号处理", evidenceRequired: "camera" };
  if (deviceBrands.test(term)) return { group: "物品/数码设备/设备品牌", reason: "设备品牌，需要确认对应设备或原文依据", evidenceRequired: "device" };
  if (/^(?:XMAGE|华为影像)$/i.test(term)) return { group: "视觉表现/影像技术", reason: "影像技术标识；图片边角标识不属于画面实体", evidenceRequired: "imaging" };
  if (/^(?:动感|动态感)$/.test(term)) return { group: "视觉表现/摄影效果", reason: "需要运动或拖影等具体依据，不能凭泛泛感受凑标签" };
  if (/^(?:白线|线条)$/.test(term)) return { group: "视觉表现/线条与形状", reason: "线条特征；有道路依据时归入道路设施" };
  if (term === "遮阳") return { group: "人物/动作姿态", reason: "需要遮挡阳光的动作依据，只有帽子或伞不足以判断动作" };
  return undefined;
}

export function getTagNoise(label: string): TagNoise | undefined {
  const term = label.normalize("NFKC").trim();
  if (getTagSemanticHint(term)?.evidenceRequired) return undefined;
  if (sourceNames.test(term) || /^(?:水印|作者署名|账号名称|用户名|平台标识|网站图标)(?:[:：].+)?$/.test(term)) return { group: "来源信息", reason: "工具、平台或水印来源，不作为新图像标签" };
  if (/^(?:(?:动感|动漫)\s*)?(?:[A-Z]{1,8}[-_]?\d{4,}[A-Z\d_-]*|\d+)$/.test(term)) return { group: "疑似噪音", reason: "疑似编号或无主体的数字，不作为新标签" };
  if (/^(?:OPEN TODAY|HANDBOOK|与美好不期而遇|与春风撞个满怀|最美国道|道大风歌|get同款色号)$/i.test(term)) return { group: "设计/文字内容", reason: "疑似文案；仅在文字本身是检索目标时保留" };
  if (/^(?:大|小|道|个|的|与|是|有|无|很|好看|漂亮|高级|高级感|不错|唯美|动感|动态感)$/.test(term)) return { group: "疑似噪音", reason: "碎词或泛泛评价，缺少独立检索意义，不作为新标签" };
  if (/^(?:Ninco|UOVZ)$/i.test(term)) return { group: "疑似噪音", reason: "疑似误读的字母标识，不猜测或纠正成某个品牌" };
  return undefined;
}

function meaningfulEvidence(evidence: readonly string[]): string {
  return evidence.filter(text => text.trim() && !uncertainEvidence.test(text)).join("；");
}

export function hasReliableTagEvidence(evidence: readonly string[]): boolean {
  return Boolean(meaningfulEvidence(evidence)) && !evidence.some(text => uncertainEvidence.test(text)) && !isSourceOnlyEvidence(evidence);
}

export function resolveAmbiguousTagGroup(label: string, evidence: readonly string[]): string | undefined {
  const reliable = meaningfulEvidence(evidence);
  if (/^(?:手持)?笔记本$/.test(label)) {
    const paper = /纸张|纸页|手写|记事本|笔记簿/.test(reliable);
    const computer = /电脑|键盘|屏幕|触控板/.test(reliable);
    if (paper === computer) return "待归纳";
    return label.startsWith("手持") ? "人物/动作姿态" : computer ? "物品/数码设备" : "物品/道具";
  }
  if (label === "镜头") {
    const equipment = /镜头(?:盖|筒|卡口)|相机.{0,8}镜头|可更换镜头/.test(reliable);
    const composition = /特写|近景|景别|构图/.test(reliable);
    return equipment === composition ? "待归纳" : equipment ? "物品/数码设备/器材配件" : "视觉表现/构图与景别";
  }
  if (label === "布偶") {
    const toy = /玩具|玩偶|填充/.test(reliable);
    const cat = /猫|宠物/.test(reliable);
    return toy === cat ? "待归纳" : toy ? "物品/道具" : "动物/动物与宠物";
  }
  return undefined;
}

export function isSourceOnlyEvidence(evidence: readonly string[]): boolean {
  return evidence.some(text => sourceEvidence.test(text.replace(/(?:不是|并非|没有|无|非)水印/g, "")));
}

/** The candidate's own evidence is required; unrelated tags or model summary cannot prove a brand. */
export function hasTagEntityEvidence(label: string, evidence: readonly string[], prompt = ""): boolean {
  const hint = getTagSemanticHint(label);
  const reliable = meaningfulEvidence(evidence);
  const context = prompt || reliable;
  if (!context || isSourceOnlyEvidence(evidence) || (prompt && isSourceOnlyEvidence([prompt]))) return false;
  if (hint?.evidenceRequired === "camera") return cameraEvidence.test(context) && (Boolean(prompt) || readableMark.test(reliable));
  if (hint?.evidenceRequired === "device") return deviceEvidence.test(context) && (Boolean(prompt) || readableMark.test(reliable));
  if (hint?.evidenceRequired === "imaging") return Boolean(prompt) && /影像|技术|XMAGE/i.test(prompt);
  if (label === "遮阳") return /(?:手|抬手|举手|举伞|撑伞|帽檐).{0,12}(?:遮|挡).{0,5}(?:阳光|太阳)|遮阳动作/.test(context);
  return Boolean(reliable);
}

/** Admission applies only to newly analyzed candidates, including legacy responses. */
export function shouldAdmitAnalyzedTag(label: string, evidence: readonly string[] = [], prompt = ""): boolean {
  if (isSourceOnlyEvidence(evidence)) return false;
  const noise = getTagNoise(label);
  if (noise) {
    // Deliberately requested readable text can be a design feature; incidental OCR is excluded.
    if (noise.group !== "设计/文字内容") return false;
    const intentionalText = /(?:招牌|海报|标题|标语|排版|文字内容|lettering|typography).{0,20}(?:文字|写|印|内容|text)|(?:文字|text).{0,12}(?:为|是|写|:|：)/i.test(prompt) && prompt.toLocaleLowerCase().includes(label.toLocaleLowerCase());
    const textAsSubject = evidence.some(text => !uncertainEvidence.test(text) && text.toLocaleLowerCase().includes(label.toLocaleLowerCase()) && /(?:文字|标语|标题|字样).{0,12}(?:主体|主视觉|核心|主要内容|排版展示)/.test(text));
    return intentionalText || textAsSubject;
  }
  const hint = getTagSemanticHint(label);
  if (hint?.evidenceRequired || label === "遮阳") {
    const explicitPrompt = prompt.toLocaleLowerCase().includes(label.toLocaleLowerCase()) ? prompt : "";
    return hasTagEntityEvidence(label, evidence, explicitPrompt);
  }
  // Do not invent a location from national-style clothing, scenery, or a single OCR word.
  if (label === "中国") return false;
  if (/^[A-Z][A-Z\d]{2,10}$/.test(label) && evidence.some(text => uncertainEvidence.test(text))) return false;
  return true;
}

export function getTagEvidenceGroup(label: string, evidence: readonly string[]): string | undefined {
  if (isSourceOnlyEvidence(evidence)) return undefined;
  const ambiguous = evidence.length ? resolveAmbiguousTagGroup(label, evidence) : undefined;
  if (ambiguous) return ambiguous;
  if (label === "白线" && /车道|路面标线|道路|公路/.test(meaningfulEvidence(evidence))) return "建筑空间/道路设施";
  return undefined;
}

/** Legacy review can use co-occurring concrete tags for a proposal, never for a new recognition. */
export function reviewLegacyTag(label: string, contexts: readonly (readonly string[])[], evidence: readonly string[] = []): { group: string; reason: string; review: boolean } | undefined {
  const ambiguous = resolveAmbiguousTagGroup(label, evidence);
  if (ambiguous) return { group: ambiguous, reason: ambiguous === "待归纳" ? "名称有多种含义，请结合原图确认：笔记本可能是纸本或电脑，镜头可能是器材或景别，布偶可能是玩具或猫的简称" : "按当前记录的明确实体依据区分多义词", review: ambiguous === "待归纳" };
  const everyContext = (pattern: RegExp) => contexts.length > 0 && contexts.every(tags => tags.some(tag => tag !== label && pattern.test(tag)));
  if (label === "白线" && everyContext(/^(?:车道线|公路|路面标线|盘山公路)$/)) return { group: "建筑空间/道路设施", reason: "关联作品同时含车道线或公路，建议按道路标线归组；保留原名", review: false };
  if (label === "动感" && everyContext(/^(?:奔跑|运动模糊|跳跃|拖影)$/)) return { group: "视觉表现/摄影效果", reason: "关联作品有运动依据；新分析优先使用奔跑、运动模糊等具体标签", review: false };
  if (label === "中国" && everyContext(/^(?:路面文字|手写文字|文字|帽身文字)$/)) return { group: "设计/文字内容", reason: "关联作品含文字，不据此推断拍摄地点；建议复核是否需要保留", review: true };
  const hint = getTagSemanticHint(label);
  if (!hint || (!hint.evidenceRequired && label !== "遮阳")) return undefined;
  if (hasTagEntityEvidence(label, evidence)) return { group: hint.group, reason: `${hint.reason}；已有对应实体的识别依据`, review: false };
  const proven = hint?.evidenceRequired === "camera" ? everyContext(/^(?:相机|微单相机|单反相机|手持相机|相机背带|镜头)$/) : hint?.evidenceRequired === "device" ? everyContext(/^(?:手机|平板电脑|笔记本电脑|智能手机|手持手机|相机)$/) : false;
  return { group: hint.group, reason: proven ? `${hint.reason}；关联作品含对应设备` : `${hint.reason}；现有记录不足，请复核`, review: !proven };
}
