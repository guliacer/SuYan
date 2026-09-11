import type { PromptCategory, PromptEntry } from "../types";

export function searchPrompts(
  prompts: PromptEntry[],
  query: string,
  categories: PromptCategory[] = [],
): PromptEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return prompts;
  }

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  return prompts.filter((prompt) => {
    const haystack = [
      prompt.title,
      prompt.description ?? "",
      prompt.content,
      prompt.account?.name ?? "",
      prompt.account?.site ?? "",
      ...prompt.tagIds,
      prompt.categoryId ? categoryNames.get(prompt.categoryId) ?? "" : "",
    ]
      .join("\n")
      .toLocaleLowerCase();
    return haystack.includes(normalized);
  });
}

/** 统计灵感库中每个标签的使用数量，供标签筛选入口展示。 */
export function collectPromptTagCounts(prompts: PromptEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const prompt of prompts) {
    for (const tag of prompt.tagIds) {
      const normalized = tag.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return counts;
}

/** 按一个标签筛选灵感；空值表示不过滤。 */
export function filterPromptsByTag(prompts: PromptEntry[], tag: string): PromptEntry[] {
  const normalized = tag.trim();
  return normalized ? prompts.filter((prompt) => prompt.tagIds.includes(normalized)) : prompts;
}

export function sortPrompts(prompts: PromptEntry[], mode: "recent" | "created" | "updated" | "usage" | "name"): PromptEntry[] {
  return [...prompts].sort((a, b) => {
    if (mode === "name") return a.title.localeCompare(b.title, "zh-CN");
    if (mode === "usage") return b.usageCount - a.usageCount;
    const aTime = mode === "created" ? a.createdAt : mode === "updated" ? a.updatedAt : a.lastUsedAt ?? "";
    const bTime = mode === "created" ? b.createdAt : mode === "updated" ? b.updatedAt : b.lastUsedAt ?? "";
    return bTime.localeCompare(aTime);
  });
}
