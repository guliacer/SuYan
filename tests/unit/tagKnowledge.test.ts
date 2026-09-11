import { describe, expect, it } from "vitest";
import { canonicalTagLabel, findKnownTag, proposeTagGroup } from "../../src/features/library/utils/tagKnowledge";
import { buildTagOrganizationRows, applyTagOrganizationChoices, matchesTagAliasQuery } from "../../src/features/library/utils/tagOrganization";
import { buildPromptAnalysisFromRemote } from "../../src/features/library/utils/remotePromptAnalysis";
import { normalizeRemotePromptAnalysisV2, remoteAnalysisV2FromLegacy } from "../../src/features/library/utils/remoteAnalysisV2";
import { mergeLibraryPromptLexiconForItems } from "../../src/features/library/utils/promptLexicons";
import { normalizeImageTag } from "../../src/features/library/utils/tagNormalization";
import type { LibraryItem, PromptImageLexiconEntry } from "../../src/features/library/types/library";

const tag = (label: string, patch: Partial<PromptImageLexiconEntry> = {}): PromptImageLexiconEntry => ({ id: label, label, group: "其他标签 Other", description: "", ...patch });
const item = (id: string, tags: string[], prompt = id): LibraryItem => ({ id, tags, prompt, imageFileName: `${id}.png`, title: id, category: null, negativePrompt: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });

describe("tag knowledge and organization", () => {
  it.each([
    ["红叶", "自然环境/植物/叶片"], ["黄叶", "自然环境/植物/叶片"], ["胡杨", "自然环境/植物/树木"],
    ["黄瓜", "食物/蔬菜"], ["回头", "人物/动作姿态"], ["肩颈", "人物/身体与面部"],
    ["假山", "建筑空间/园林"], ["假山石", "自然环境/山石地形"], ["湖泊", "自然环境/水域"],
  ])("groups %s by entity", (label, expected) => expect(proposeTagGroup(label)).toBe(expected));

  it("merges only safe synonyms and preserves related-but-distinct objects", () => {
    expect(canonicalTagLabel("胡杨树")).toBe("胡杨");
    expect(canonicalTagLabel("手托脸颊")).toBe("托腮");
    for (const label of ["红叶", "黄叶", "绿叶", "假山", "假山石", "湖泊", "湖水", "徽章", "徽章贴布", "咖啡豆", "咖啡", "柔光箱", "香水瓶"]) {
      expect(canonicalTagLabel(label)).toBe(label);
      expect(normalizeImageTag(label)).toBe(label);
    }
  });

  it("prefers confirmed names/aliases and refuses to guess ambiguous aliases", () => {
    const entries = [tag("胡杨", { aliases: ["胡杨树"], groupLocked: true, group: "我的植物/树" })];
    expect(canonicalTagLabel("胡杨树", entries)).toBe("胡杨");
    expect(matchesTagAliasQuery(["胡杨"], "胡杨树", entries)).toBe(true);
    expect(findKnownTag("植物", [tag("树", { aliases: ["植物"] }), tag("花", { aliases: ["植物"] })])).toBeUndefined();
  });

  it("preserves AI group/evidence, queues uncertain tags, and ignores unsafe normalizedLabel", () => {
    const input = normalizeRemotePromptAnalysisV2({ schemaVersion: 2, categories: [], tags: [
      { label: "胡杨树", group: "自然环境/植物/树木", dimension: "scene", confidence: 0.95, evidence: ["树干旁的胡杨叶"] },
      { label: "假山石", normalizedLabel: "假山", dimension: "scene", confidence: 0.96, evidence: ["单独的石块"] },
      { label: "黄叶", dimension: "scene", confidence: 0.6, evidence: ["疑似黄色叶片"] },
      { label: "薄纱帷帐", group: "建筑空间/家具陈设", dimension: "scene", confidence: 0.9, evidence: ["窗前的帷帐"] },
      { label: "ComfyUI", dimension: "other", confidence: 0.99, evidence: ["水印"] },
    ] })!;
    const result = buildPromptAnalysisFromRemote("", input, "image-tags");
    expect(result.suggestedTags).toContain("假山石");
    expect(result.suggestedTags).not.toContain("假山");
    expect(result.suggestedTags).not.toContain("ComfyUI");
    expect(result.tagEntries?.find(e => e.label === "胡杨")).toMatchObject({ group: "自然环境/植物/树木", reviewStatus: "accepted", analysis: { confidence: 0.95, evidence: ["树干旁的胡杨叶"] } });
    expect(result.tagEntries?.find(e => e.label === "薄纱帷帐")?.group).toBe("建筑空间/家具陈设");
    const pending = result.tagEntries!.find(e => e.label === "黄叶")!;
    expect(pending).toMatchObject({ group: "待归纳", reviewStatus: "pending" });
    expect(buildTagOrganizationRows([], [pending])[0]).toMatchObject({ status: "pending", selected: false });
  });

  it("legacy responses remain reviewable and future AI never overwrites confirmed metadata", () => {
    const response = remoteAnalysisV2FromLegacy({ title: "", category: "", summary: "", tags: ["胡杨树", "黄叶"] });
    const entry = tag("胡杨", { aliases: ["胡杨树"], groupLocked: true, group: "我的植物/秋季", description: "用户描述", imageFileName: "tree.png" });
    const result = buildPromptAnalysisFromRemote("", response, "prompt-tags", { knownTagEntries: [entry] });
    expect(result.tagEntries?.find(e => e.label === "胡杨")).toMatchObject({ ...entry, reviewStatus: "pending" });
    expect(result.tagEntries?.find(e => e.label === "黄叶")).toMatchObject({ reviewStatus: "pending", group: "待归纳" });
    expect(result.suggestedTags).not.toContain("红叶");
  });

  it("preview deduplicates work counts without mutating input, application touches selected labels only", () => {
    const items = [item("a", ["胡杨树", "红叶"], "同一提示词"), item("b", ["胡杨树"], "同一提示词"), item("c", ["黄叶", "黄叶"])];
    items[1] = { ...items[0], id: "b", imageFileName: "b.png" };
    const entries = [tag("胡杨树"), tag("胡杨", { imageFileName: "cover.png" }), tag("红叶")];
    const before = JSON.stringify({ items, entries });
    const rows = buildTagOrganizationRows(items, entries);
    expect(rows.find(r => r.originalLabel === "胡杨树")?.workCount).toBe(1);
    expect(JSON.stringify({ items, entries })).toBe(before);
    const next = applyTagOrganizationChoices(items, entries, rows, [{ id: "胡杨树", label: "胡杨", group: "自然环境/植物/树木" }]);
    expect(next.items[0].tags).toEqual(["胡杨", "红叶"]);
    expect(next.items[2]).toBe(items[2]);
    expect(next.entries.find(e => e.label === "胡杨")).toMatchObject({ id: "胡杨", aliases: ["胡杨树"], imageFileName: "cover.png", groupLocked: true });
    expect(next.entries.find(e => e.label === "红叶")).toEqual(entries[2]);
    expect(next.entries.some(e => e.label === "黄叶")).toBe(false);
  });

  it("rejects alias and confirmed-group conflicts", () => {
    const entries = [tag("甲", { groupLocked: true, group: "甲组" }), tag("乙", { groupLocked: true, group: "乙组" })];
    const rows = buildTagOrganizationRows([], entries);
    expect(() => applyTagOrganizationChoices([], entries, rows, [{ id: "乙", label: "甲", group: "乙组" }])).toThrow("分组冲突");
    expect(() => applyTagOrganizationChoices([], entries, rows, [{ id: "missing", label: "甲", group: "甲组" }])).toThrow("无效");
  });

  it("ordinary indexing preserves old groups and confirmed knowledge without silent migration", () => {
    const entries = [tag("红叶"), tag("胡杨", { groupLocked: true, aliases: ["胡杨树"], group: "我的树木" })];
    const result = mergeLibraryPromptLexiconForItems({ categories: [], tags: entries }, [], []);
    expect(result.promptLexicons.tags[0].group).toBe("其他标签 Other");
    expect(result.promptLexicons.tags[1]).toMatchObject(entries[1]);
  });
});
