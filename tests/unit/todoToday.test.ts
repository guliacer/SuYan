import { describe, expect, it } from "vitest";
import type { TodoTask } from "../../src/features/prompts/types";
import { selectTodoToday } from "../../src/features/prompts/todos/utils/todoToday";
const now = new Date(2026, 10, 13, 15, 0);
const task = (id: string, patch: Partial<TodoTask> = {}): TodoTask => ({ id, title: id, status: "todo", priority: "normal", progress: 0, linkedPromptIds: [], tagIds: [], orderKey: id, createdAt: now.toISOString(), updatedAt: now.toISOString(), ...patch });
describe("today task selection", () => {
  it("shows today's plans and hard deadlines while excluding cancelled and archived tasks", () => {
    const result = selectTodoToday([
      task("planned", { plannedDate: "2026-11-13" }), task("deadline", { plannedDate: "2026-11-12", deadlineAt: new Date(2026, 10, 13, 22).toISOString() }),
      task("tomorrow", { plannedDate: "2026-11-14" }), task("cancelled", { plannedDate: "2026-11-13", status: "cancelled" }), task("archived", { plannedDate: "2026-11-13", archived: true }),
    ], now);
    expect(result.todayTasks.map((item) => item.id).sort()).toEqual(["deadline", "planned"]);
  });
  it("puts in-progress work first, then urgent priorities, without changing the stored order", () => {
    const source = [task("a", { plannedDate: "2026-11-13" }), task("b", { plannedDate: "2026-11-13", priority: "urgent" }), task("c", { plannedDate: "2026-11-13", status: "in-progress" })];
    expect(selectTodoToday(source, now).todayTasks.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(source.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps backlog and overdue work separate and counts completed tasks once", () => {
    const result = selectTodoToday([task("overdue", { deadlineAt: new Date(2026, 10, 12, 22).toISOString() }), task("backlog"), task("done", { status: "completed", plannedDate: "2026-11-13", completedAt: now.toISOString() }), task("open", { plannedDate: "2026-11-13" })], now);
    expect(result.overdue.map((item) => item.id)).toEqual(["overdue"]);
    expect(result.unscheduled.map((item) => item.id)).toEqual(["backlog"]);
    expect(result.completed).toHaveLength(1); expect(result.total).toBe(2); expect(result.completedPercent).toBe(50);
  });
  it("refreshes on a new local day and handles empty progress", () => {
    expect(selectTodoToday([], now).completedPercent).toBe(0);
    const source = [task("next", { plannedDate: "2026-11-14" })];
    expect(selectTodoToday(source, now).todayTasks).toHaveLength(0);
    expect(selectTodoToday(source, new Date(2026, 10, 14, 0, 1)).todayTasks).toHaveLength(1);
  });
});
