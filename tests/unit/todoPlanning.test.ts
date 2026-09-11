import { describe, expect, it } from "vitest";
import type { TodoTask } from "../../src/features/prompts/types";
import { buildTodoMonthBuckets, buildTodoPlanBuckets, getTodoRemainingMinutes, getTodoSubtaskStats, sortTodoTasksForExecution } from "../../src/features/prompts/todos/utils/todoPlanning";

function task(patch: Partial<TodoTask> = {}): TodoTask {
  return {
    id: crypto.randomUUID(), title: "任务", status: "todo", priority: "normal", progress: 0,
    linkedPromptIds: [], tagIds: [], orderKey: "0", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...patch,
  };
}

describe("todo planning semantics", () => {
  it("builds month days across leap-day boundaries", () => {
    const days = buildTodoMonthBuckets([], 2028, 1, (date) => !date.endsWith("-06"));
    expect(days).toHaveLength(29);
    expect(days[28]?.date).toBe("2028-02-29");
    expect(days[5]?.isWorkday).toBe(false);
  });
  it("groups by planned day while leaving unplanned tasks out", () => {
    const buckets = buildTodoPlanBuckets([
      task({ id: "today", plannedDate: "2026-09-01", timeEstimateMinutes: 60, progress: 50 }),
      task({ id: "tomorrow", plannedDate: "2026-09-02", timeEstimateMinutes: 30, status: "completed" }),
      task({ id: "none" }),
    ], 2, new Date("2026-09-01T10:00:00"));
    expect(buckets.map((bucket) => bucket.tasks.map((item) => item.id))).toEqual([["today"], ["tomorrow"]]);
    expect(buckets[0]?.estimatedMinutes).toBe(60);
    expect(buckets[0]?.completedMinutes).toBe(30);
  });

  it("orders urgent and earlier deadline work before normal work", () => {
    const ordered = sortTodoTasksForExecution([
      task({ id: "normal", priority: "normal" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "deadline", priority: "normal", deadlineAt: "2026-09-01T12:00:00.000Z" }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["urgent", "deadline", "normal"]);
  });

  it("calculates remaining estimate and child progress", () => {
    const parent = task({ id: "parent", subtaskIds: ["child-a", "child-b"], timeEstimateMinutes: 90 });
    const children = [task({ id: "child-a", status: "completed", timeEstimateMinutes: 30 }), task({ id: "child-b", progress: 50, timeEstimateMinutes: 60 })];
    expect(getTodoSubtaskStats(parent, children)).toEqual({ total: 2, completed: 1, progress: 75 });
    expect(getTodoRemainingMinutes({ status: "in-progress", progress: 50, timeEstimateMinutes: 60, timeSpentMinutes: 10 })).toBe(50);
  });
});
