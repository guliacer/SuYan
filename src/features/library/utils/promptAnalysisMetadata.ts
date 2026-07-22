type MergePromptAnalysisTagsOptions = {
  categoryLabels: readonly string[];
  maxVisibleTagCount: number;
  storedCategoryTags: readonly string[];
  suggestedTags: readonly string[];
  visibleTags: readonly string[];
};

export function mergePromptAnalysisTagsPreservingCategories({
  categoryLabels,
  maxVisibleTagCount,
  storedCategoryTags,
  suggestedTags,
  visibleTags,
}: MergePromptAnalysisTagsOptions): string[] {
  const categoryKeys = new Set(categoryLabels.map(normalizeLabelKey).filter(Boolean));
  const nextVisibleTags = uniqueLabels([...visibleTags, ...suggestedTags])
    .filter((tag) => !categoryKeys.has(normalizeLabelKey(tag)))
    .slice(0, Math.max(0, maxVisibleTagCount));

  return uniqueLabels([...nextVisibleTags, ...storedCategoryTags]);
}

function uniqueLabels(values: readonly string[]): string[] {
  const labels: string[] = [];
  const seenKeys = new Set<string>();

  for (const value of values) {
    const label = value.trim();
    const key = normalizeLabelKey(label);

    if (!key || seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    labels.push(label);
  }

  return labels;
}

function normalizeLabelKey(value: string): string {
  return value.trim().toLowerCase();
}
