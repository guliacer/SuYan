import { describe, expect, it } from "vitest";
import type { TodoProgressWidget, TodoTask } from "../../src/features/prompts/types";
import { calculateTodoProgress, getTodoStats, groupTodoTasksByProject, isTodoOverdue, selectWidgetTasks, sortTodoTasksForProject } from "../../src/features/prompts/todos/utils/todoProgress";

function task(patch: Partial<TodoTask> = {}): TodoTask {
  return {
    id: crypto.randomUUID(), title: "任务", status: "todo", priority: "normal", progress: 0,
    linkedPromptIds: [], tagIds: [], orderKey: "0", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z", ...patch,
  };
}

describe("todo progress", () => {
  it("sorts completed tasks to the bottom and preserves project order", () => {
    const first = task({ id: "first", orderKey: "0002" });
    const completed = task({ id: "completed", orderKey: "0001", status: "completed", progress: 100 });
    const second = task({ id: "second", orderKey: "0003", status: "in-progress", progress: 30 });
    expect(sortTodoTasksForProject([completed, second, first]).map((item) => item.id)).toEqual(["first", "second", "completed"]);
  });

  it("groups tasks by active project and keeps tasks from archived projects visible as unassigned", () => {
    const activeProject = { id: "active", name: "项目 A", archived: false, orderKey: "0", createdAt: "", updatedAt: "" };
    const archivedProject = { id: "archived", name: "旧项目", archived: true, orderKey: "1", createdAt: "", updatedAt: "" };
    const groups = groupTodoTasksByProject([task({ id: "a", projectId: "active" }), task({ id: "b", projectId: "archived" })], [activeProject, archivedProject]);
    expect(groups.map((group) => group.project?.id ?? "unassigned")).toEqual(["active", "unassigned"]);
    expect(groups[1]?.tasks[0]?.id).toBe("b");
  });

  it("excludes cancelled tasks and does not show a fake 100% for an empty scope", () => {
    expect(calculateTodoProgress([])).toBe(0);
    expect(calculateTodoProgress([task({ status: "cancelled", progress: 100 })])).toBe(0);
    expect(calculateTodoProgress([task({ progress: 40 }), task({ status: "completed", progress: 0 })])).toBe(70);
  });

  it("computes overdue tasks using local day end and ignores completed/cancelled", () => {
    const now = new Date("2026-08-26T12:00:00");
    expect(isTodoOverdue(task({ dueAt: "2026-08-25T23:59:59.999Z" }), now)).toBe(true);
    expect(isTodoOverdue(task({ dueAt: "2026-08-25T23:59:59.999Z", status: "completed" }), now)).toBe(false);
    expect(getTodoStats([task({ status: "cancelled" }), task({ dueAt: "2026-08-25T23:59:59.999Z" })], now).total).toBe(1);
  });

  it("keeps archived tasks out of progress totals and widget results", () => {
    const widget: TodoProgressWidget = {
      id: "w", viewType: "project", projectScope: "all", includeCompleted: true, showOverdue: true,
      orderKey: "0", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z",
    };
    const archived = task({ id: "archived", progress: 100, status: "completed", archived: true });
    expect(getTodoStats([archived]).total).toBe(0);
    expect(selectWidgetTasks([archived], widget)).toHaveLength(0);
  });

  it("selects date widgets by dueAt and keeps tasks with no due date out", () => {
    const widget: TodoProgressWidget = {
      id: "w", viewType: "date", datePreset: "today", includeCompleted: true, showOverdue: true,
      orderKey: "0", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z",
    };
    const now = new Date("2026-08-26T12:00:00");
    expect(selectWidgetTasks([task({ id: "today", dueAt: "2026-08-26T23:00:00" }), task({ id: "none" })], widget, now).map((item) => item.id)).toEqual(["today"]);
  });
});
