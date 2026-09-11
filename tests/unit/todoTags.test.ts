import { describe, expect, it } from "vitest";
import type { TodoTask } from "../../src/features/prompts/types";
import { filterTodoTasks } from "../../src/features/prompts/todos/utils/todoFilters";
import { collectTodoTagSuggestions, getTodoTagTone, pruneTodoTagSelection } from "../../src/features/prompts/todos/utils/todoTags";

function task(patch: Partial<TodoTask> = {}): TodoTask {
  return {
    id: crypto.randomUUID(), title: "任务", status: "todo", priority: "normal", progress: 0,
    linkedPromptIds: [], tagIds: [], orderKey: "0", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...patch,
  };
}

describe("todo tags", () => {
  it("collects a de-duplicated, case-insensitive tag list", () => {
    const suggestions = collectTodoTagSuggestions([
      task({ tagIds: ["发布", "Bug"] }),
      task({ tagIds: ["bug", " 发布 "] }),
      task({ tagIds: [] }),
    ]);
    expect([...suggestions].sort()).toEqual(["Bug", "发布"]);
    expect(suggestions).toEqual([...suggestions].sort((left, right) => left.localeCompare(right, "zh-CN")));
  });

  it("keeps the same tone for the same tag regardless of casing or padding", () => {
    expect(getTodoTagTone(" Bug ")).toBe(getTodoTagTone("bug"));
  });

  it("drops selected tags that no longer exist in the library", () => {
    expect(pruneTodoTagSelection(["发布", "已删除"], ["发布", "Bug"])).toEqual(["发布"]);
  });

  it("requires every active tag to match and ignores casing", () => {
    const both = task({ id: "both", tagIds: ["发布", "Bug"] });
    const one = task({ id: "one", tagIds: ["发布"] });
    const none = task({ id: "none" });
    const tasks = [both, one, none];
    expect(filterTodoTasks(tasks, "all", "", "all", undefined, ["发布"]).map((item) => item.id)).toEqual(["both", "one"]);
    expect(filterTodoTasks(tasks, "all", "", "all", undefined, ["发布", "bug"]).map((item) => item.id)).toEqual(["both"]);
    expect(filterTodoTasks(tasks, "all", "", "all", undefined, []).map((item) => item.id)).toEqual(["both", "one", "none"]);
  });

  it("combines the tag filter with the existing query and project filters", () => {
    const tasks = [
      task({ id: "match", title: "整理发布说明", projectId: "p1", tagIds: ["发布"] }),
      task({ id: "otherProject", title: "整理发布说明", projectId: "p2", tagIds: ["发布"] }),
      task({ id: "otherTitle", title: "修复缩略图", projectId: "p1", tagIds: ["发布"] }),
    ];
    expect(filterTodoTasks(tasks, "all", "发布说明", "p1", undefined, ["发布"]).map((item) => item.id)).toEqual(["match"]);
  });
});
