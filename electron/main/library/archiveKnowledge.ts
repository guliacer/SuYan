import { randomUUID } from "node:crypto";
import type { CategoryNode, CategoryTaxonomy } from "../../../src/features/library/types/category";
import type { LibraryItem, PromptImageLexiconEntry, PromptLexiconSettings } from "../../../src/features/library/types/library";
import { normalizeTagKnowledge, tagKey } from "../../../src/features/library/utils/tagKnowledge";
import { mergeLexiconCategoriesIntoTaxonomy, resolveCategoryIdFromLegacyName } from "../../../src/features/library/utils/categoryTaxonomy";
import { AppError } from "../ipc/errors";

export type ArchiveAnalyzedLibraries = {
  schemaVersion: 1;
  categoryTaxonomy: CategoryTaxonomy;
  categories: PromptImageLexiconEntry[];
  tags: PromptImageLexiconEntry[];
};

export function collectArchiveAnalyzedLibraries(
  items: readonly LibraryItem[],
  taxonomy: CategoryTaxonomy,
  lexicons: PromptLexiconSettings | null,
): ArchiveAnalyzedLibraries {
  const categoryIds = new Set(items.flatMap(i => [i.categoryId, ...(i.genreIds ?? []),
    i.categoryId ? null : resolveCategoryIdFromLegacyName(taxonomy, i.category)]).filter((id): id is string => Boolean(id)));
  const nodes = withParents(taxonomy.nodes, categoryIds);
  const categoryEntries = lexicons?.categories ?? [];
  const selectedEntries = new Set<string>();
  for (const node of nodes) {
    const direct = categoryEntries.find(e => e.id === node.id);
    const matches = categoryEntries.filter(e => tagKey(e.label) === tagKey(node.name) && e.group === node.group);
    if (direct) selectedEntries.add(direct.id);
    else if (matches.length === 1) selectedEntries.add(matches[0].id);
  }
  for (const item of items) {
    if (!item.category || nodes.some(n => n.id === item.categoryId || tagKey(n.name) === tagKey(item.category!))) continue;
    const matches = categoryEntries.filter(e => tagKey(e.label) === tagKey(item.category!));
    if (matches.length === 1) selectedEntries.add(matches[0].id);
  }
  const categories = withParents(categoryEntries, selectedEntries);
  const tagLabels = new Set(items.flatMap(i => i.tags).map(tagKey));
  const tags = withParents(lexicons?.tags ?? [], new Set((lexicons?.tags ?? [])
    .filter(e => tagLabels.has(tagKey(e.label)) || e.aliases?.some(a => tagLabels.has(tagKey(a))))
    .map(e => e.id)));
  // Taxonomy-only categories must still be visible in the recipient's category library.
  for (const node of nodes) {
    if (!categories.some(e => e.id === node.id)) categories.push({ id: node.id, label: node.name,
      group: node.group, description: node.description, parentId: node.parentId, imageFileName: node.imageFileName });
  }
  return structuredClone({ schemaVersion: 1, categories, tags,
    categoryTaxonomy: { schemaVersion: 1, updatedAt: taxonomy.updatedAt,
      nodes: nodes.map(n => ({ ...n, usageCount: items.filter(i => i.categoryId === n.id || i.genreIds?.includes(n.id)).length,
        examples: [], embedding: null })) } });
}

function withParents<T extends { id: string; parentId?: string | null }>(entries: readonly T[], ids: Set<string>): T[] {
  const byId = new Map(entries.map(e => [e.id, e]));
  const selected = new Set<string>();
  for (const id of ids) {
    let current = byId.get(id);
    while (current && !selected.has(current.id)) {
      selected.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return entries.filter(e => selected.has(e.id));
}

export function archiveKnowledgeImageNames(knowledge: ArchiveAnalyzedLibraries): string[] {
  return [...new Set([...knowledge.categories, ...knowledge.tags, ...knowledge.categoryTaxonomy.nodes]
    .map(e => e.imageFileName).filter((s): s is string => Boolean(s)))];
}

export function remapArchiveKnowledgeImages(knowledge: ArchiveAnalyzedLibraries, names: ReadonlyMap<string, string>): ArchiveAnalyzedLibraries {
  const remap = <T extends { imageFileName?: string | null }>(entry: T): T => ({ ...entry,
    imageFileName: entry.imageFileName ? names.get(entry.imageFileName) ?? null : null });
  return { ...knowledge, categories: knowledge.categories.map(remap), tags: knowledge.tags.map(remap),
    categoryTaxonomy: { ...knowledge.categoryTaxonomy, nodes: knowledge.categoryTaxonomy.nodes.map(remap) } };
}

/** Validate optional new metadata before any media or library files are written. */
export function readArchiveAnalyzedLibraries(input: unknown): ArchiveAnalyzedLibraries | undefined {
  if (input === undefined) return undefined;
  const invalid = (): never => { throw new AppError("ZIP_KNOWLEDGE_INVALID", "分享包中的分类或标签库结构不合法，请重新导出。"); };
  const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const text = (v: unknown, max = 4000): v is string => typeof v === "string" && v.length <= max;
  const optional = (v: unknown): boolean => v == null || text(v);
  const list = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 100 && v.every(x => text(x));
  const imageName = (v: unknown): boolean => v == null || (text(v, 255) && Boolean(v) && !/[\\/:\x00-\x1f]/u.test(v) && v !== "." && v !== "..");
  const entries = (v: unknown): PromptImageLexiconEntry[] => {
    if (!Array.isArray(v) || v.length > 20000) return invalid();
    return v.map(e => {
      if (!record(e) || !text(e.id, 300) || !e.id || !text(e.label, 300) || !e.label.trim() ||
        !text(e.group, 300) || !text(e.description) || !optional(e.parentId) || !imageName(e.imageFileName)) return invalid();
      return { id: e.id, label: e.label, group: e.group, description: e.description,
        parentId: (e.parentId as string | null) ?? null, imageFileName: (e.imageFileName as string | null) ?? null,
        ...normalizeTagKnowledge(e) };
    });
  };
  if (!record(input) || input.schemaVersion !== 1 || !record(input.categoryTaxonomy)) return invalid();
  const tree = input.categoryTaxonomy;
  if (tree.schemaVersion !== 1 || !text(tree.updatedAt) || !Array.isArray(tree.nodes) || tree.nodes.length > 20000) return invalid();
  const nodes: CategoryNode[] = tree.nodes.map(n => {
    if (!record(n) || !text(n.id, 300) || !/^(system|custom|ai):.+/u.test(n.id) || !text(n.name, 300) || !n.name.trim() ||
      !["system", "custom", "ai"].includes(String(n.type)) || !optional(n.parentId) || !text(n.group, 300) ||
      !list(n.aliases) || !list(n.keywords) || !text(n.description) || !imageName(n.imageFileName) ||
      !text(n.createdAt) || !text(n.updatedAt)) return invalid();
    return { id: n.id, name: n.name, type: n.type as CategoryNode["type"], group: n.group,
      parentId: (n.parentId as string | null) ?? null, aliases: n.aliases, keywords: n.keywords,
      description: n.description, examples: [], usageCount: 0, imageFileName: (n.imageFileName as string | null) ?? null,
      createdAt: n.createdAt, updatedAt: n.updatedAt };
  });
  const result: ArchiveAnalyzedLibraries = { schemaVersion: 1, categories: entries(input.categories), tags: entries(input.tags),
    categoryTaxonomy: { schemaVersion: 1, updatedAt: tree.updatedAt, nodes } };
  for (const group of [result.categories, result.tags, nodes]) {
    const byId = new Map(group.map(e => [e.id, e]));
    if (byId.size !== group.length) return invalid();
    for (const entry of group) {
      const seen = new Set<string>();
      let current: { id: string; parentId?: string | null } | undefined = entry;
      while (current) {
        if (seen.has(current.id) || seen.size > 100) return invalid();
        seen.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
  }
  return result;
}

/** Local choices win; fill missing knowledge, remapping only imported items on ID collisions. */
export function mergeArchiveAnalyzedLibraries(
  taxonomy: CategoryTaxonomy, lexicons: PromptLexiconSettings | null,
  incoming: ArchiveAnalyzedLibraries, items: LibraryItem[],
): { taxonomy: CategoryTaxonomy; lexicons: PromptLexiconSettings; items: LibraryItem[] } {
  incoming = { ...incoming, categoryTaxonomy: mergeLexiconCategoriesIntoTaxonomy(incoming.categoryTaxonomy, incoming.categories) };
  const nodes = [...taxonomy.nodes];
  const incomingNodes = new Map(incoming.categoryTaxonomy.nodes.map(n => [n.id, n]));
  const nodeIds = new Map<string, string>();
  const addNode = (node: CategoryNode): string => {
    if (nodeIds.has(node.id)) return nodeIds.get(node.id)!;
    const parent = incomingNodes.get(node.parentId ?? "");
    const parentId = parent ? addNode(parent) : node.parentId ?? null;
    const same = nodes.find(n => n.id === node.id && tagKey(n.name) === tagKey(node.name)) ??
      nodes.find(n => tagKey(n.name) === tagKey(node.name) && n.group === node.group && (n.parentId ?? null) === parentId);
    const id = same?.id ?? (nodes.some(n => n.id === node.id) ? `custom:import-${randomUUID()}` : node.id);
    nodeIds.set(node.id, id);
    if (same) nodes[nodes.indexOf(same)] = { ...same,
      imageFileName: same.imageFileName || node.imageFileName,
      description: same.description || node.description,
      aliases: [...new Set([...same.aliases, ...node.aliases])],
      keywords: [...new Set([...same.keywords, ...node.keywords])] };
    else nodes.push({ ...node, id, parentId, type: id.startsWith("custom:") ? "custom" : node.type });
    return id;
  };
  incoming.categoryTaxonomy.nodes.forEach(addNode);
  const merge = (local: PromptImageLexiconEntry[], extra: PromptImageLexiconEntry[], category: boolean) => {
    const result = [...local];
    const incomingEntries = new Map(extra.map(e => [e.id, e]));
    const ids = new Map<string, string>();
    const labels = new Map<string, string>();
    const add = (entry: PromptImageLexiconEntry): string => {
      if (ids.has(entry.id)) return ids.get(entry.id)!;
      const parent = incomingEntries.get(entry.parentId ?? "");
      const parentId = parent ? add(parent) : (category ? nodeIds.get(entry.parentId ?? "") : null) ?? entry.parentId ?? null;
      const mappedId = category ? nodeIds.get(entry.id) : undefined;
      const same = result.find(e => category && mappedId ? e.id === mappedId : tagKey(e.label) === tagKey(entry.label) &&
        (!category || e.group === entry.group && (e.parentId ?? null) === parentId));
      const candidate = mappedId ?? entry.id;
      const id = same?.id ?? (result.some(e => e.id === candidate) ? `${category ? "custom" : "tag"}:import-${randomUUID()}` : candidate);
      ids.set(entry.id, id);
      labels.set(tagKey(entry.label), same?.label ?? entry.label);
      if (same) result[result.indexOf(same)] = { ...same,
        imageFileName: same.imageFileName || entry.imageFileName,
        description: same.description || entry.description,
        aliases: [...new Set([...(same.aliases ?? []), ...(entry.aliases ?? [])])],
        analysis: same.analysis ?? entry.analysis,
        reviewStatus: same.reviewStatus ?? entry.reviewStatus,
      };
      else result.push({ ...entry, id, parentId });
      return id;
    };
    extra.forEach(add);
    // Only unambiguous aliases are used to relabel imported works. Existing works never change.
    const aliasOwners = new Map<string, Set<string>>();
    for (const entry of extra) for (const alias of [entry.label, ...(entry.aliases ?? [])]) {
      const key = tagKey(alias), owners = aliasOwners.get(key) ?? new Set<string>();
      owners.add(entry.id);
      aliasOwners.set(key, owners);
    }
    for (const [key, owners] of aliasOwners) {
      if (!labels.has(key) && owners.size === 1) {
        const entry = incomingEntries.get(owners.values().next().value!)!;
        labels.set(key, labels.get(tagKey(entry.label))!);
      }
    }
    return { entries: result, labels };
  };
  const categories = merge(lexicons?.categories ?? [], incoming.categories, true);
  const tags = merge(lexicons?.tags ?? [], incoming.tags, false);
  return { taxonomy: { ...taxonomy, updatedAt: new Date().toISOString(), nodes }, lexicons: { categories: categories.entries, tags: tags.entries },
    items: items.map(item => {
      const categoryId = nodeIds.get(item.categoryId ?? "") ?? item.categoryId;
      return { ...item, categoryId,
        category: nodes.find(n => n.id === categoryId)?.name ?? item.category,
        genreIds: item.genreIds?.map(id => nodeIds.get(id) ?? id) ?? item.genreIds,
        tags: [...new Set(item.tags.map(t => tags.labels.get(tagKey(t)) ?? t))] };
    }) };
}
