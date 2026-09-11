import { describe, expect, it, vi, afterEach } from "vitest";
import { getTagNoise, shouldAdmitAnalyzedTag } from "../../src/features/library/utils/tagQuality";
import { buildTagOrganizationRows, applyTagOrganizationChoices } from "../../src/features/library/utils/tagOrganization";
import { buildPromptAnalysisFromRemote } from "../../src/features/library/utils/remotePromptAnalysis";
import { normalizeRemotePromptAnalysisV2, remoteAnalysisV2FromLegacy } from "../../src/features/library/utils/remoteAnalysisV2";
import { analyzePromptTags } from "../../src/features/library/utils/promptAnalysis";
import { proposeTagGroup } from "../../src/features/library/utils/tagKnowledge";
import { parseRemotePromptAnalysisV2Content, buildSystemAnalysisContent, analyzePromptRemotely } from "../../electron/main/ai/remoteAiClient";
import type { LibraryItem, PromptImageLexiconEntry } from "../../src/features/library/types/library";

const tag = (label: string, patch: Partial<PromptImageLexiconEntry> = {}): PromptImageLexiconEntry => ({ id: label, label, group: "其他标签 Other", description: "", ...patch });
const item = (id: string, tags: string[]): LibraryItem => ({ id, tags, title: id, prompt: "", negativePrompt: "", imageFileName: id + ".png", category: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const response = (tags: Array<{label: string; evidence: string[]; confidence?: number}>) => normalizeRemotePromptAnalysisV2({ schemaVersion: 2, categories: [], tags: tags.map(t => ({ dimension: "other", confidence: 0.98, ...t })), summary: "" }, { allowEmptyTags: true })!;

describe("tag quality and device context", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it.each(["SONY", "索尼", "Canon", "Nikon", "Fujifilm", "Leica", "Hasselblad"])("recognizes %s as a camera brand", label => {
    expect(proposeTagGroup(label)).toBe("物品/数码设备/相机品牌");
    expect(getTagNoise(label)).toBeUndefined();
    expect(shouldAdmitAnalyzedTag(label, [`相机机身清晰印有 ${label}`])).toBe(true);
    expect(shouldAdmitAnalyzedTag(label, [`右下角水印 ${label}`])).toBe(false);
    expect(shouldAdmitAnalyzedTag(label, [`看到 ${label} 字样`])).toBe(false);
    expect(shouldAdmitAnalyzedTag(label, [`疑似 ${label} 相机，标识看不清`])).toBe(false);
    expect(shouldAdmitAnalyzedTag(label, [`相机外形像 ${label} 品牌`])).toBe(false);
    expect(shouldAdmitAnalyzedTag(label, [`由 ${label} 相机拍摄`])).toBe(false);
  });

  it.each(["α7C", "A7C II", "EOS R5", "Z8", "GR III", "X-T5"])("distinguishes camera model %s from arbitrary IDs", label => {
    expect(proposeTagGroup(label)).toBe("物品/数码设备/相机型号");
    expect(shouldAdmitAnalyzedTag(label, [`相机机身型号 ${label} 可辨认`])).toBe(true);
  });

  it("keeps real device tags but filters source marks even when a camera tag coexists", () => {
    const result = buildPromptAnalysisFromRemote("", response([
      { label: "SONY", evidence: ["手中相机机身上可见SONY品牌"] },
      { label: "α7C", evidence: ["相机型号标识α7C清晰"] },
      { label: "HUAWEI", evidence: ["图片底部HUAWEI水印"] },
      { label: "XMAGE", evidence: ["右下角影像水印XMAGE"] },
      { label: "自定义来源名", evidence: ["作者签名"] },
      { label: "Ninco", evidence: ["疑似相机品牌"] },
      { label: "微单相机", evidence: ["手中有一台微单相机"] },
    ]), "image-tags");
    expect(result.suggestedTags).toEqual(expect.arrayContaining(["SONY", "α7C", "微单相机"]));
    for (const label of ["HUAWEI", "XMAGE", "自定义来源名", "Ninco"]) expect(result.suggestedTags).not.toContain(label);
    expect(result.tagEntries?.find(t => t.label === "SONY")?.group).toBe("物品/数码设备/相机品牌");
    expect(result.tagEntries?.find(t => t.label === "α7C")?.group).toBe("物品/数码设备/相机型号");
    const unproven = buildPromptAnalysisFromRemote("", response([{ label: "SONY", evidence: ["图中字样SONY"] }, { label: "相机", evidence: ["手持相机"] }]), "image-tags");
    expect(unproven.suggestedTags).not.toContain("SONY");
    expect(shouldAdmitAnalyzedTag("HUAWEI", ["手机后盖的HUAWEI品牌"])).toBe(true);
    expect(shouldAdmitAnalyzedTag("XMAGE", [], "使用XMAGE影像技术呈现色彩")).toBe(true);
  });

  it("filters meaningless fragments and sources in modern, legacy and local tag analysis", () => {
    const labels = ["大", "道", "动感", "动感 A180508", "动漫 A180508", "A180508", "UOVZ", "Ninco", "微博", "小红书", "与美好不期而遇", "OPEN TODAY", "中国"];
    const modern = buildPromptAnalysisFromRemote("", response(labels.map(label => ({ label, evidence: ["图中可见该字样"] }))), "image-tags");
    const legacy = buildPromptAnalysisFromRemote("", remoteAnalysisV2FromLegacy({ title: "", summary: "", category: "", tags: labels }), "image-tags");
    expect(modern.suggestedTags).toEqual([]);
    expect(legacy.suggestedTags).toEqual([]);
    expect(analyzePromptTags("大，道，动感 A180508，微博，小红书").suggestedTags).toEqual([]);
    for (const label of ["马", "树", "雾", "猫", "笔", "花", "水", "草", "烟花", "手持相机", "rose", "RGB"]) expect(shouldAdmitAnalyzedTag(label, ["画面实体"]), label).toBe(true);
  });

  it("does not let a previously confirmed noisy tag bypass new-analysis admission", () => {
    const known = tag("大", { groupLocked: true, group: "我的标签" });
    const result = buildPromptAnalysisFromRemote("", response([{ label: "大", evidence: ["路面上的大字"] }]), "image-tags", { knownTagEntries: [known] });
    expect(result.suggestedTags).toEqual([]);
    expect(buildTagOrganizationRows([], [known])[0]).toMatchObject({ group: "我的标签", selected: false });
  });

  it("uses concrete context for old SONY/model/road labels and never guesses a misspelled brand", () => {
    const items = [item("camera", ["SONY", "α7C", "微单相机", "手持相机"]), item("road", ["白线", "公路", "路面文字", "中国", "大", "道"]), item("flowers", ["HUAWEI", "XMAGE", "花瓣"]), item("unknown", ["Ninco", "相机"])];
    const entries = [...new Set(items.flatMap(i => i.tags))].map(label => tag(label));
    const before = JSON.stringify({ items, entries });
    const rows = buildTagOrganizationRows(items, entries);
    expect(rows.find(r => r.label === "SONY")).toMatchObject({ group: "物品/数码设备/相机品牌", selected: true });
    expect(rows.find(r => r.label === "α7C")).toMatchObject({ group: "物品/数码设备/相机型号", selected: true });
    expect(rows.find(r => r.label === "白线")).toMatchObject({ group: "建筑空间/道路设施", selected: true });
    expect(rows.find(r => r.label === "中国")).toMatchObject({ group: "设计/文字内容", status: "pending", selected: false });
    for (const label of ["HUAWEI", "XMAGE", "Ninco", "大", "道"]) expect(rows.find(r => r.label === label)?.selected).toBe(false);
    const next = applyTagOrganizationChoices(items, entries, rows, rows.filter(r => r.selected));
    expect(next.items).toEqual(items);
    expect(next.entries.length).toBe(entries.length);
    expect(JSON.stringify({ items, entries })).toBe(before);
  });

  it("allows intentional design text, but rejects incidental OCR and inferred locations", () => {
    expect(shouldAdmitAnalyzedTag("OPEN TODAY", ["招牌上写着OPEN TODAY"], "招牌文字为OPEN TODAY")).toBe(true);
    expect(shouldAdmitAnalyzedTag("OPEN TODAY", ["招牌文字"])).toBe(false);
    expect(shouldAdmitAnalyzedTag("OPEN TODAY", ["文字排版展示为主体，标题写着OPEN TODAY"])).toBe(true);
    expect(shouldAdmitAnalyzedTag("遮阳", ["戴着草帽"])).toBe(false);
    expect(shouldAdmitAnalyzedTag("遮阳", ["抬手挡住阳光"])).toBe(true);
    expect(shouldAdmitAnalyzedTag("SONY", [], "相机旁边添加SONY水印")).toBe(false);
  });

  it("groups white lines from their evidence, without assuming every line is a road", () => {
    expect(proposeTagGroup("白线")).toBe("视觉表现/线条与形状");
    const road = buildPromptAnalysisFromRemote("", response([{ label: "白线", evidence: ["公路车道上的白色标线"] }]), "image-tags");
    expect(road.tagEntries?.[0]?.group).toBe("建筑空间/道路设施");
    const graphic = buildPromptAnalysisFromRemote("", response([{ label: "白线", evidence: ["画面设计中的白色线条"] }]), "image-tags");
    expect(graphic.tagEntries?.[0]?.group).toBe("视觉表现/线条与形状");
  });

  it("does not retry a successful zero-tag response", async () => {
    const empty = { schemaVersion: 2, categories: [], tags: [], summary: "没有可用特征" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(empty) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzePromptRemotely({ apiKey: "test-key", baseUrl: "https://api.example.com/v1", enabled: true, id: "test", model: "test-model", models: [], name: "测试" }, { target: "prompt-tags", title: "", prompt: "只显示来源水印", negativePrompt: "", category: "", tags: [] });
    expect(result.tags).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts intentional empty tag responses without loosening malformed/category results", () => {
    const empty = { schemaVersion: 2, categories: [], tags: [], summary: "只有来源水印，无有效内容" };
    expect(parseRemotePromptAnalysisV2Content(JSON.stringify(empty), "image-tags").tags).toEqual([]);
    expect(parseRemotePromptAnalysisV2Content(JSON.stringify(empty), "prompt-tags").warnings).not.toContain("legacy-v1-source");
    expect(normalizeRemotePromptAnalysisV2(empty)).toBeNull();
    expect(normalizeRemotePromptAnalysisV2({ ...empty, tags: [{}] }, { allowEmptyTags: true })).toBeNull();
    expect(normalizeRemotePromptAnalysisV2({ ...empty, tags: null }, { allowEmptyTags: true })).toBeNull();
    expect(buildSystemAnalysisContent("image-tags")).toContain("返回0-15个");
    expect(buildSystemAnalysisContent("prompt-tags")).toContain("相机品牌");
  });
});
