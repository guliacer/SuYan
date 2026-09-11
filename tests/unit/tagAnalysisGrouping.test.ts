import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPromptAnalysisFromRemote } from "../../src/features/library/utils/remotePromptAnalysis";
import { normalizeRemotePromptAnalysisV2, remoteAnalysisV2FromLegacy } from "../../src/features/library/utils/remoteAnalysisV2";
import { analyzePromptTags } from "../../src/features/library/utils/promptAnalysis";
import { buildTagOrganizationRows } from "../../src/features/library/utils/tagOrganization";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";
import type { PromptImageLexiconEntry } from "../../src/features/library/types/library";
import type { LibraryViewSettings } from "../../src/features/library/types/library";

vi.mock("../../src/features/library/utils/themeMode", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/features/library/utils/themeMode")>(), applyThemeModeToRoot: vi.fn(),
}));

const initial = useLibraryStore.getState();
afterEach(() => { useLibraryStore.setState(initial, true); vi.unstubAllGlobals(); });
const tag = (label: string, group = "动物/动物与宠物"): PromptImageLexiconEntry => ({ id: label, label, group, description: "用户说明", imageFileName: "cover.png", aliases: [label + "别称"], groupLocked: true });
const response = (label: string, evidence: string[], group = "动物/动物与宠物", confidence = 0.96) => normalizeRemotePromptAnalysisV2({
  schemaVersion: 2, categories: [], tags: [{ label, group, dimension: "other", confidence, evidence }],
})!;

describe("future tag analysis uses the final semantic grouping rules", () => {
  it.each([
    ["蝴蝶发夹", "服饰/配饰"], ["蝴蝶结发带", "服饰/配饰"], ["牛角扣", "服饰/结构与纹样"],
    ["蝴蝶结肩带", "服饰/结构与纹样"], ["手持蝴蝶", "人物/动作姿态"], ["手持玻璃杯", "人物/动作姿态"],
    ["玻璃杯", "物品/道具"], ["手提包", "服饰/配饰"], ["相机背带", "物品/数码设备/器材配件"],
    ["兔子摆件", "物品/道具"], ["狗尾草", "自然环境/植物/其他植物"],
  ])("%s overrides both an incorrect model group and a locked old standard group", (label, group) => {
    const known = tag(label), before = structuredClone(known);
    for (const target of ["image-tags", "prompt-tags"] as const) {
      const result = buildPromptAnalysisFromRemote(label, response(label, [`画面可见${label}`]), target, { knownTagEntries: [known] });
      expect(result.tagEntries?.[0]).toMatchObject({ ...known, group, reviewStatus: "accepted", analysis: { suggestedGroup: group } });
    }
    expect(known).toEqual(before);
  });

  it("keeps explicit custom groups, aliases, names and covers", () => {
    const known = tag("蝴蝶发夹", "我的收藏/头饰");
    const result = buildPromptAnalysisFromRemote("", response("蝴蝶发夹别称", ["头发上的发夹清晰可见"]), "image-tags", { knownTagEntries: [known] });
    expect(result.tagEntries?.[0]).toMatchObject({ ...known, reviewStatus: "accepted" });
  });

  it.each([
    ["笔记本", ["可见手写的纸页"], "物品/道具"],
    ["笔记本", ["带键盘和屏幕的电脑"], "物品/数码设备"],
    ["手持笔记本", ["手中握着纸张装订的笔记簿"], "人物/动作姿态"],
    ["笔记本", ["画面有一本笔记本"], "待归纳"],
    ["笔记本", ["既有纸页又有电脑键盘，无法区分"], "待归纳"],
    ["镜头", ["相机镜头的卡口可见"], "物品/数码设备/器材配件"],
    ["镜头", ["使用面部特写景别"], "视觉表现/构图与景别"],
    ["镜头", ["看见镜头"], "待归纳"],
    ["布偶", ["可见填充玩具"], "物品/道具"],
    ["布偶", ["一只宠物猫"], "动物/动物与宠物"],
  ])("requires specific evidence for %s", (label, evidence, group) => {
    const result = buildPromptAnalysisFromRemote("", response(label as string, evidence as string[], "物品/数码设备"), "image-tags");
    const actual = result.tagEntries![0];
    expect(actual).toMatchObject({ group, reviewStatus: group === "待归纳" ? "pending" : "accepted" });
    expect(buildTagOrganizationRows([], [actual])[0].group).toBe(group);
  });

  it("cannot promote doubtful or legacy evidence by borrowing a confirmed group", () => {
    const known = tag("蝴蝶发夹", "服饰/配饰");
    for (const remote of [response(known.label, ["疑似蝴蝶发夹，无法确认"]), response(known.label, ["发间可见发饰", "可能是蝴蝶形状"]), response(known.label, ["可见发夹"], known.group, 0.6), remoteAnalysisV2FromLegacy({ title: "", summary: "", category: "", tags: [known.label] })]) {
      const entry = buildPromptAnalysisFromRemote("", remote, "image-tags", { knownTagEntries: [known] }).tagEntries![0];
      expect(entry).toMatchObject({ group: "待归纳", reviewStatus: "pending" });
      expect(buildTagOrganizationRows([], [entry])[0]).toMatchObject({ status: "pending", selected: false });
    }
    const unknown = buildPromptAnalysisFromRemote("", response("手持未知装置", ["装置结构清晰"], ""), "image-tags");
    expect(unknown.tagEntries?.[0]).toMatchObject({ group: "待归纳", reviewStatus: "pending" });
  });

  it("keeps concrete local features even if the parameter parser recognizes them", () => {
    const result = analyzePromptTags("蝴蝶发夹，蝴蝶结发带；手持玻璃杯。牛角扣", { knownTagEntries: [tag("蝴蝶发夹")] });
    expect(result.suggestedTags).toEqual(expect.arrayContaining(["蝴蝶发夹", "蝴蝶结发带", "手持玻璃杯", "牛角扣"]));
    expect(result.tagEntries?.find(entry => entry.label === "蝴蝶发夹")).toMatchObject({ group: "服饰/配饰", reviewStatus: "accepted", analysis: { dimension: "local" } });
    expect(result.chips).toEqual([]);
    expect(result.suggestedCategories).toEqual([]);
  });
});

function installApi(mode: "local" | "remote", failure?: "error" | "throw") {
  vi.stubGlobal("document", { documentElement: {} });
  let disk: LibraryViewSettings | undefined;
  const saveLibraryViewSettings = vi.fn(async (settings: LibraryViewSettings) => {
    if (failure === "throw") throw new Error("IPC disconnected");
    if (failure === "error") return { ok: false, error: { code: "WRITE_FAILED", message: "磁盘写入失败" } };
    disk = structuredClone(settings);
    return { ok: true, data: disk };
  });
  vi.stubGlobal("window", { suyanApi: {
    saveLibraryViewSettings, logRendererEvent: vi.fn(), logStartupEvent: vi.fn(),
    analyzePromptWithAi: vi.fn(async () => ({ ok: true, data: { analysis: response("蝴蝶发夹", ["发间可见蝴蝶形状的发夹"]) } })),
  } });
  useLibraryStore.setState({
    aiSettings: mode === "local" ? { ...initial.aiSettings, enabled: false, profiles: [] } : {
      ...initial.aiSettings, enabled: true, hasApiKey: true, activeProfileId: "group-test", model: "test", baseUrl: "https://test.invalid/v1",
      profiles: [{ id: "group-test", name: "测试", enabled: true, hasApiKey: true, apiKeyPreview: "test", baseUrl: "https://test.invalid/v1", model: "test", models: [{ id: "test", label: "test", capabilities: ["vision", "text"] }] }],
    },
    aiErrorDialog: null, aiAnalysisCircuitOpen: false,
    promptLexicons: { categories: [], tags: [tag("蝴蝶发夹")] },
  });
  return { saveLibraryViewSettings, saved: () => disk };
}
const payload = { target: "prompt-tags" as const, prompt: "蝴蝶发夹", title: "", negativePrompt: "", tags: [], category: "", runInBackground: true };

describe("tag analysis persistence across entry points", () => {
  it.each(["local", "remote"] as const)("%s saves corrected groups before reporting tags", async mode => {
    const api = installApi(mode);
    const result = await useLibraryStore.getState().analyzePromptWithAi(payload);
    expect(result.source).toBe(mode);
    expect(result.analysis.suggestedTags).toContain("蝴蝶发夹");
    expect(api.saved()?.promptLexicons?.tags.find(entry => entry.label === "蝴蝶发夹")).toMatchObject({ group: "服饰/配饰", groupLocked: true, imageFileName: "cover.png" });
    expect(api.saveLibraryViewSettings).toHaveBeenCalledTimes(1);
    expect(useLibraryStore.getState().promptLexicons?.tags[0].group).toBe("服饰/配饰");
  });

  it.each(["local", "remote"] as const)("%s returns no applicable tags when persistence fails", async mode => {
    for (const failure of ["error", "throw"] as const) {
      installApi(mode, failure);
      const result = await useLibraryStore.getState().analyzePromptWithAi(payload);
      expect(result.analysis.suggestedTags).toEqual([]);
      expect(useLibraryStore.getState().promptLexicons?.tags[0].group).toBe("动物/动物与宠物");
      expect(useLibraryStore.getState().statusMessage?.text).toContain("保存失败");
    }
  });
});
