import type { LibraryItem, PromptImageLexiconEntry } from "../types/library";
import type { TagOrganizationRow } from "../types/tagKnowledge";
import { canonicalTagLabel, findKnownTag, isStandardTagGroup, isUnorganizedTagGroup, proposeTagGroup, tagKey } from "./tagKnowledge";
import { getPromptTagGroup } from "./promptLexicons";
import { getPromptImageGroupKey } from "./promptImageGroups";
import { toPromptCardData } from "./promptFilters";
import { matchTagEntity } from "./tagEntityGroups";
import { getTagNoise, hasReliableTagEvidence, reviewLegacyTag } from "./tagQuality";

export function buildTagOrganizationRows(items: readonly LibraryItem[], entries: readonly PromptImageLexiconEntry[]): TagOrganizationRow[] {
  const known = [...entries];
  const labels = new Set(known.map(e => tagKey(e.label)));
  const works = new Map<string, Set<string>>();
  const contexts = new Map<string, string[][]>();
  for (const item of items) {
    const work = getPromptImageGroupKey(toPromptCardData(item));
    for (const tag of item.tags) {
      const key = tagKey(tag);
      if (!labels.has(key)) { known.push({ id: `tag-missing-${encodeURIComponent(tag)}`, label: tag, group: "", description: "来自素材标签" }); labels.add(key); }
      const ids = works.get(key) ?? new Set<string>(); ids.add(work); works.set(key, ids);
      const coTags = contexts.get(key) ?? []; coTags.push(item.tags); contexts.set(key, coTags);
    }
  }
  return known.map(entry => {
    // Unlocked legacy spelling does not override the standard synonym dictionary.
    const label = entry.groupLocked ? entry.label : canonicalTagLabel(entry.label, entries.filter(e => e.groupLocked || e.aliases?.length));
    const context = reviewLegacyTag(label, contexts.get(tagKey(entry.label)) ?? [], entry.analysis && entry.analysis.confidence >= 0.8 ? entry.analysis.evidence : []);
    const noise = context && !context.review ? undefined : getTagNoise(label);
    // Re-audit standard groups using independent whole-phrase meaning, never the old
    // substring-derived fallback or the model's old group. Custom groups are authoritative.
    const semanticGroup = context && !context.review ? context.group : context?.review ? undefined : proposeTagGroup(label);
    const correction = !noise && Boolean(semanticGroup && !isUnorganizedTagGroup(semanticGroup)
      && isStandardTagGroup(entry.group) && !isUnorganizedTagGroup(entry.group) && semanticGroup !== entry.group);
    const group = correction ? semanticGroup! : context?.review && isStandardTagGroup(entry.group) ? context.group : entry.groupLocked ? entry.group : context?.group ?? noise?.group ?? proposeTagGroup(label, entry.reviewStatus ? entry.group : getPromptTagGroup(label, entry.group), entry.analysis?.dimension, entry.analysis?.suggestedGroup, entry.analysis?.evidence);
    // A new entity rule may resolve a missing group, but cannot prove the AI saw that entity.
    const uncertainEvidence = entry.reviewStatus === "pending" && (!entry.analysis || entry.analysis.confidence < 0.8 || !hasReliableTagEvidence(entry.analysis.evidence));
    const status = noise ? "noise" : uncertainEvidence || context?.review ? "pending" : entry.groupLocked ? "accepted" : group === "待归纳" || group.endsWith("待细分") ? "pending" : "accepted";
    const changed = label !== entry.label || group !== entry.group || entry.reviewStatus === "pending";
    const suggested = changed && status === "accepted" && (!entry.groupLocked || correction);
    return { id: entry.id, originalLabel: entry.label, originalGroup: entry.group, label, group, status,
      reason: uncertainEvidence ? "识别依据不足，请确认画面确有该标签；分组建议仅供参考" : correction ? `${context?.reason ?? matchTagEntity(label)?.reason ?? "完整词义与原分组不符"}；${entry.groupLocked ? "原分组已确认，请重新检查后勾选" : "请检查分组调整"}` : context?.review ? context.reason : noise?.reason ?? (entry.groupLocked ? "已确认的用户设置" : context?.reason ?? (label !== entry.label ? "同义名称统一，原名称保留为搜索别名" : status === "pending" ? "含义或分组不明确，请指定分组" : matchTagEntity(label)?.reason ?? "按实体语义统一分组")),
      workCount: works.get(tagKey(entry.label))?.size ?? 0, suggested, selected: suggested && !entry.groupLocked, correction, analysis: entry.analysis };
  });
}

export function applyTagOrganizationChoices(
  items: readonly LibraryItem[], entries: readonly PromptImageLexiconEntry[], rows: readonly TagOrganizationRow[],
  choices: readonly { id: string; label: string; group: string }[],
): { items: LibraryItem[]; entries: PromptImageLexiconEntry[] } {
  const byId = new Map(rows.map(r => [r.id, r]));
  const chosen = new Map(choices.map(c => [c.id, c]));
  if (chosen.size !== choices.length) throw new Error("标签整理选项重复，请刷新预览");
  const replacements = new Map<string, string>();
  for (const choice of choices) {
    const row = byId.get(choice.id);
    if (!row || !choice.label.trim() || choice.label.length > 80 || !choice.group.trim() || choice.group.length > 120) throw new Error("标签整理选项无效");
    replacements.set(tagKey(row.originalLabel), choice.label.trim());
  }
  const merged = new Map<string, PromptImageLexiconEntry>();
  // Existing canonical IDs win over aliases to preserve references and custom images.
  const ordered = [...rows].sort((a,b) => Number((chosen.get(a.id)?.label ?? a.originalLabel) !== a.originalLabel) - Number((chosen.get(b.id)?.label ?? b.originalLabel) !== b.originalLabel));
  for (const row of ordered) {
    if (!chosen.has(row.id) && !entries.some(e => e.id === row.id)) continue;
    const original = entries.find(e => e.id === row.id) ?? { id: row.id, label: row.originalLabel, group: row.originalGroup, description: "来自素材标签" };
    const choice = chosen.get(row.id);
    const label = choice?.label.trim() ?? original.label;
    const group = choice?.group.trim() ?? original.group;
    const next: PromptImageLexiconEntry = choice ? { ...original, label, group, groupLocked: true, reviewStatus: "accepted", aliases: [...new Set([...(original.aliases ?? []), ...(label !== original.label ? [original.label] : [])])] } : original;
    const key = tagKey(label);
    const existing = merged.get(key);
    if (existing) {
      if (!chosen.has(row.id) && !choices.some(c => tagKey(c.label) === key)) throw new Error("词库中存在重名标签，请勾选对应标签后再整理");
      if (existing.groupLocked && next.groupLocked && existing.group !== next.group) throw new Error("同名标签的分组冲突，请统一后再应用");
      merged.set(key, { ...existing, ...(next.groupLocked && !existing.groupLocked ? { group: next.group, groupLocked: true, reviewStatus: "accepted" as const } : {}),
        imageFileName: existing.imageFileName || next.imageFileName, description: existing.description || next.description, analysis: existing.analysis ?? next.analysis,
        aliases: [...new Set([...(existing.aliases ?? []), ...(next.aliases ?? [])])].filter(a => tagKey(a) !== key),
      });
    } else merged.set(key, next);
  }
  // One alias may never resolve to two different canonical tags.
  const aliasOwner = new Map<string, string>();
  for (const entry of merged.values()) for (const alias of [entry.label, ...(entry.aliases ?? [])]) {
    if ((entry.aliases?.length ?? 0) > 40) throw new Error("合并后别名超过40个，请分开整理并检查历史别名");
    const key = tagKey(alias); const owner = aliasOwner.get(key);
    if (owner && owner !== entry.label) throw new Error("标签别名存在冲突，请调整合并名称");
    aliasOwner.set(key, entry.label);
  }
  return { entries: [...merged.values()], items: items.map(item => {
    if (!item.tags.some(tag => replacements.has(tagKey(tag)))) return item;
    const tags = [...new Set(item.tags.map(tag => replacements.get(tagKey(tag)) ?? tag))];
    return tags.length === item.tags.length && tags.every((tag,i) => tag === item.tags[i]) ? item : { ...item, tags, updatedAt: new Date().toISOString() };
  }) };
}

export function matchesTagAliasQuery(labels: readonly string[], query: string, entries: readonly PromptImageLexiconEntry[]): boolean {
  const key = tagKey(query);
  return Boolean(key) && labels.some(label => {
    const known = findKnownTag(label, entries);
    return [label, ...(known?.aliases ?? [])].some(term => tagKey(term).includes(key));
  });
}
