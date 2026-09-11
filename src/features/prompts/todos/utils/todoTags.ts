import type { TodoTask } from "../../types";
import { getPromptColor, type PromptPaletteColorId } from "../../utils/promptColors";

/** 汇总当前待办库里出现过的标签，用于筛选栏与标签录入建议。 */
export function collectTodoTagSuggestions(tasks: readonly TodoTask[]): string[] {
  const seen = new Map<string, string>();
  for (const task of tasks) {
    for (const tag of task.tagIds) {
      const value = tag.trim();
      if (!value) continue;
      const key = value.toLocaleLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    }
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

/** 同名标签在任何视图里都取到同一个胶囊色，避免颜色随位置漂移。 */
export function getTodoTagTone(tag: string): PromptPaletteColorId {
  return getPromptColor(tag.trim().toLocaleLowerCase());
}

/** 保留仍然存在的标签选择，标签被删空后筛选条件不应继续生效。 */
export function pruneTodoTagSelection(selected: readonly string[], available: readonly string[]): string[] {
  const availableKeys = new Set(available.map((tag) => tag.toLocaleLowerCase()));
  return selected.filter((tag) => availableKeys.has(tag.toLocaleLowerCase()));
}
