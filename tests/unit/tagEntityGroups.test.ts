import { describe, expect, it } from "vitest";
import { isUnorganizedTagGroup, proposeTagGroup, tagGroupPaths } from "../../src/features/library/utils/tagKnowledge";
import { matchTagEntity } from "../../src/features/library/utils/tagEntityGroups";
import { buildTagOrganizationRows, applyTagOrganizationChoices } from "../../src/features/library/utils/tagOrganization";
import { buildPromptAnalysisFromRemote } from "../../src/features/library/utils/remotePromptAnalysis";
import { normalizeRemotePromptAnalysisV2 } from "../../src/features/library/utils/remoteAnalysisV2";
import type { PromptImageLexiconEntry } from "../../src/features/library/types/library";

const entry = (label: string, patch: Partial<PromptImageLexiconEntry> = {}): PromptImageLexiconEntry => ({ id: label, label, group: "其他标签 Other", description: "保留描述", ...patch });

describe("entity grouping coverage and semantic boundaries", () => {
  it.each([
    ["埃菲尔铁塔 白墙 白塔 匾额 玫瑰窗 宫殿屋顶", "建筑空间/建筑与构件"],
    ["矮几 矮桌 木椅 木质电脑桌 金箔屏风", "建筑空间/家具陈设"],
    ["桉树叶 芭蕉叶 尤加利叶 金黄树叶 嫩绿叶片", "自然环境/植物/叶片"],
    ["白桦林 白桦树 白桦树干 干枯树枝 果枝 樱花树", "自然环境/植物/树木"],
    ["白玫瑰 百合 蓝紫色花 牡丹花 淡粉玫瑰花", "自然环境/植物/花卉"],
    ["包带 包袋 贝壳装饰 背带 流苏步摇 珍珠云肩", "服饰/配饰"],
    ["闭目 手持荷叶 手持花枝 举伞 侧身回头", "人物/动作姿态"],
    ["背篓 笔 宝石 茶杯 透明伞", "物品/道具"],
    ["花卉刺绣 荷叶边 玫瑰花纹 兰花刺绣", "服饰/结构与纹样"],
    ["水面倒影 水面光斑 树影", "视觉表现/光影"],
    ["运动模糊 散景 柔焦", "视觉表现/摄影效果"],
    ["马 蜜蜂", "动物/动物与宠物"],
    ["马尾 风吹发丝 脸颊贴花", "人物/妆发"],
    ["银白 蓝紫色", "视觉表现/色彩"],
  ])("groups %s without stripping detail", (words, group) => {
    for (const label of words.split(" ")) {
      expect(proposeTagGroup(label, "其他标签 Other"), label).toBe(group);
      const rows = buildTagOrganizationRows([], [entry(label)]);
      expect(rows[0]).toMatchObject({ label, group, selected: true, status: "accepted" });
      expect(tagGroupPaths).toContain(group);
    }
  });

  it.each(["道", "大", "Ninco", "UOVZ", "玫瑰人生", "苹果标志", "石油", "蓝牙", "铁塔倒影", "手持未知装置", "赛博梦境树", "草稿", "花样年华"])("does not guess the meaning of %s from a substring", label => {
    expect(matchTagEntity(label)).toBeUndefined();
    expect(proposeTagGroup(label)).toBe("待归纳");
    expect(buildTagOrganizationRows([], [entry(label, { reviewStatus: "pending" })])[0].selected).toBe(false);
  });

  it("separates missing taxonomy coverage from uncertain image evidence", () => {
    const analysis = { dimension: "scene", confidence: 0.96, evidence: ["窗旁有一棵白桦树"] };
    const resolved = entry("白桦树", { group: "待归纳", reviewStatus: "pending", analysis });
    expect(buildTagOrganizationRows([], [resolved])[0]).toMatchObject({ group: "自然环境/植物/树木", status: "accepted", selected: true });
    for (const uncertain of [undefined, { ...analysis, confidence: 0.6 }, { ...analysis, evidence: [] }]) {
      expect(buildTagOrganizationRows([], [{ ...resolved, analysis: uncertain }])[0]).toMatchObject({ status: "pending", selected: false });
    }
  });

  it("retains confirmed names, aliases, covers and custom groups", () => {
    const locked = entry("白桦树", { groupLocked: true, group: "我的收藏/树", aliases: ["我家白桦"], imageFileName: "cover.png" });
    const entries = [locked, entry("矮几")];
    const before = JSON.stringify(entries);
    const rows = buildTagOrganizationRows([], entries);
    expect(rows[0]).toMatchObject({ label: "白桦树", group: locked.group, selected: false });
    const next = applyTagOrganizationChoices([], entries, rows, rows.filter(row => row.selected));
    expect(next.entries.find(e => e.id === locked.id)).toEqual(locked);
    expect(next.entries.find(e => e.label === "矮几")).toMatchObject({ group: "建筑空间/家具陈设", groupLocked: true });
    expect(JSON.stringify(entries)).toBe(before);
  });

  it("uses the same rules for new AI tags with evidence", () => {
    const response = normalizeRemotePromptAnalysisV2({ schemaVersion: 2, categories: [], tags: [
      { label: "矮几", group: "待归纳", dimension: "scene", confidence: 0.96, evidence: ["画面有低矮的几案"] },
      { label: "白桦树干", dimension: "scene", confidence: 0.93, evidence: ["白色树皮带黑色纹理"] },
      { label: "手持花枝", dimension: "pose", confidence: 0.95, evidence: ["手中握着花枝"] },
    ] })!;
    const result = buildPromptAnalysisFromRemote("", response, "image-tags");
    expect(result.tagEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "矮几", group: "建筑空间/家具陈设", reviewStatus: "accepted" }),
      expect.objectContaining({ label: "白桦树干", group: "自然环境/植物/树木", reviewStatus: "accepted" }),
      expect.objectContaining({ label: "手持花枝", group: "人物/动作姿态", reviewStatus: "accepted" }),
    ]));
  });

  it("surfaces legacy buckets and keeps suspected text/source tags unselected", () => {
    for (const group of ["其他标签 Other", "空间环境 Environment", "摄影参数", "待归纳", "自然环境/待细分"]) expect(isUnorganizedTagGroup(group)).toBe(true);
    expect(isUnorganizedTagGroup("我的收藏/植物")).toBe(false);
    const rows = buildTagOrganizationRows([], [entry("ComfyUI"), entry("微博"), entry("动感 A180508"), entry("与春风撞个满怀")]);
    expect(rows.every(row => row.status === "noise" && !row.selected)).toBe(true);
    expect(rows[1].group).toBe("来源信息");
  });

  it.each([
    ["蝴蝶发夹 蝴蝶结发带 蝴蝶结发饰 珍珠项链 心形耳环 垂坠耳饰 棒球帽 绒球发饰 毛绒手套 条纹丝带 藤编包", "服饰/配饰"],
    ["蝴蝶结肩带 牛角扣 蕾丝领 泡泡袖 条纹袖口", "服饰/结构与纹样"],
    ["蕾丝上衣 牛仔裤 破洞牛仔裤 羊毛外套 毛绒外套", "服饰/衣物"],
    ["手持蝴蝶 手持草莓 手持葡萄 手持玻璃杯 手持相机 手持耳机 手持书本 手持发丝 手持发辫 手持落叶 手持莲茎 手持仙女棒 手持手提箱", "人物/动作姿态"],
    ["手提包 编织手提包 手表", "服饰/配饰"],
    ["手提篮 捧花 手提箱 手提袋 玻璃杯 玻璃瓶 玻璃花瓶 金属桶 月饼礼盒 兔子摆件 蓝色兔子摆件 牛摆件 纸伞 蕾丝伞 仙女棒", "物品/道具"],
    ["蝴蝶 马群 牦牛 羊群 白兔 白猫 布偶猫", "动物/动物与宠物"],
    ["翅膀 羽毛", "动物/身体特征"],
    ["玻璃 蕾丝 金属 纸张 玩偶图案", "视觉表现/材质纹理"],
    ["玻璃态 毛玻璃", "设计/界面元素"],
    ["狗尾草", "自然环境/植物/其他植物"],
    ["藤编椅 木质电脑桌", "建筑空间/家具陈设"],
    ["咖啡 饮品 瓶装饮料 草莓蛋糕 牛肉 羊肉", "食物/食品与饮品"],
    ["柠檬片 青提", "食物/水果"],
    ["相机背带 相机包 镜头盖", "物品/数码设备/器材配件"],
    ["车道线 架空线 输电塔", "建筑空间/道路设施"],
    ["电车 列车", "物品/交通工具"],
  ])("uses whole compounds across new recognition and legacy corrections: %s", (words, group) => {
    for (const label of words.split(" ")) {
      expect(proposeTagGroup(label, "人物/主体", "other", "动物/动物与宠物"), label).toBe(group);
      const originalGroup = group === "人物/主体" ? "物品/道具" : "人物/主体";
      const row = buildTagOrganizationRows([], [entry(label, { group: originalGroup, groupLocked: true })])[0];
      expect(row, label).toMatchObject({ label, group, originalGroup, correction: true, suggested: true, selected: false });
    }
  });

  it.each(["手持未知装置", "手持蓝天", "蝴蝶效应", "玻璃心", "牛气冲天", "笔记本", "镜头", "布偶"])("does not accept an incidental old group for %s", label => {
    expect(matchTagEntity(label)).toBeUndefined();
    expect(proposeTagGroup(label, "动物/动物与宠物")).toBe("待归纳");
    expect(proposeTagGroup(label, "我的收藏/自定义")).toBe("我的收藏/自定义");
  });

  it("surfaces wrong locked standard groups through the existing suggestions without silently applying them", () => {
    const entries = [
      entry("蝴蝶发夹", { group: "动物/动物与宠物", groupLocked: true, aliases: ["小蝴蝶发夹"], imageFileName: "clip.png" }),
      entry("蝴蝶结肩带", { group: "动物/动物与宠物", groupLocked: true }),
      entry("蝴蝶结发带", { group: "我的配饰/蝴蝶", groupLocked: true }),
      entry("牛角扣", { group: "动物/动物与宠物/我的收藏", groupLocked: true }),
    ];
    const rows = buildTagOrganizationRows([], entries);
    expect(rows.filter(row => row.suggested).map(row => row.label)).toEqual(["蝴蝶发夹", "蝴蝶结肩带"]);
    expect(applyTagOrganizationChoices([], entries, rows, rows.filter(row => row.selected)).entries).toEqual(entries);
    const updated = applyTagOrganizationChoices([], entries, rows, [rows[0]]).entries;
    expect(updated[0]).toEqual({ ...entries[0], group: "服饰/配饰", reviewStatus: "accepted" });
    expect(updated.slice(1)).toEqual(entries.slice(1));
    expect(buildTagOrganizationRows([], updated)[0].suggested).toBe(false);
    const response = normalizeRemotePromptAnalysisV2({ schemaVersion: 2, categories: [], tags: [
      { label: "蝴蝶发夹", group: "动物/动物与宠物", dimension: "subject", confidence: 0.97, evidence: ["人物发间有蝴蝶形发夹"] },
    ] })!;
    for (const knownTagEntries of [[], updated]) {
      const result = buildPromptAnalysisFromRemote("", response, "image-tags", { knownTagEntries });
      expect(result.tagEntries?.[0]).toMatchObject({ label: "蝴蝶发夹", group: "服饰/配饰", reviewStatus: "accepted" });
    }
  });

  it("does not promote ambiguous or unsupported existing labels into confident corrections", () => {
    for (const label of ["笔记本", "手持笔记本", "镜头", "布偶"]) {
      const row = buildTagOrganizationRows([], [entry(label, { group: "物品/数码设备", groupLocked: true })])[0];
      expect(row).toMatchObject({ status: "pending", suggested: false, selected: false, group: "待归纳" });
    }
    const row = buildTagOrganizationRows([], [entry("蝴蝶发夹", { group: "动物/动物与宠物", reviewStatus: "pending", analysis: { dimension: "other", confidence: 0.6, evidence: [] } })])[0];
    expect(row).toMatchObject({ group: "服饰/配饰", status: "pending", selected: false });
  });
});
