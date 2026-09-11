import { describe, expect, it } from "vitest";
import type { TodoTask } from "../../src/features/prompts/types";
import { dateRangeForPreset, localDateKey, shiftDateKey } from "../../src/features/prompts/todos/utils/todoDate";
import { filterTodoTasks } from "../../src/features/prompts/todos/utils/todoFilters";

function task(patch: Partial<TodoTask> = {}): TodoTask {
  return {
    id: crypto.randomUUID(), title: "任务", status: "todo", priority: "normal", progress: 0,
    linkedPromptIds: [], tagIds: [], orderKey: "0", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...patch,
  };
}

describe("todo date ranges", () => {
  it("starts the week on Monday", () => {
    const range = dateRangeForPreset("this-week", undefined, undefined, new Date("2026-08-26T12:00:00"));
    expect(localDateKey(range.from)).toBe("2026-08-24");
    expect(localDateKey(range.to)).toBe("2026-08-30");
  });

  it("validates custom ranges through an ordered local interval", () => {
    const range = dateRangeForPreset("custom", "2026-08-01", "2026-08-03", new Date("2026-08-26T12:00:00"));
    expect(localDateKey(range.from)).toBe("2026-08-01");
    expect(localDateKey(range.to)).toBe("2026-08-03");
  });

  it("steps day keys across month and year boundaries", () => {
    expect(shiftDateKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateKey("", 1)).toBe("");
  });
});

describe("todo date filter", () => {
  it("matches the picked day by planned date or deadline, including completed items", () => {
    const planned = task({ id: "planned", plannedDate: "2026-09-10" });
    const deadline = task({ id: "deadline", deadlineAt: "2026-09-10T18:00:00" });
    const done = task({ id: "done", plannedDate: "2026-09-10", status: "completed", progress: 100 });
    const other = task({ id: "other", plannedDate: "2026-09-11" });
    const unplanned = task({ id: "unplanned" });
    const tasks = [planned, deadline, done, other, unplanned];
    expect(filterTodoTasks(tasks, "date", "", "all", undefined, [], "2026-09-10").map((item) => item.id)).toEqual(["planned", "deadline", "done"]);
    expect(filterTodoTasks(tasks, "date", "", "all", undefined, [], "2026-09-11").map((item) => item.id)).toEqual(["other"]);
  });

  it("returns nothing when no day is picked and still honours query, project and tag filters", () => {
    const tasks = [
      task({ id: "match", title: "整理发布说明", projectId: "p1", plannedDate: "2026-09-10", tagIds: ["发布"] }),
      task({ id: "otherProject", title: "整理发布说明", projectId: "p2", plannedDate: "2026-09-10", tagIds: ["发布"] }),
      task({ id: "otherTitle", title: "修复缩略图", projectId: "p1", plannedDate: "2026-09-10", tagIds: ["发布"] }),
    ];
    expect(filterTodoTasks(tasks, "date", "", "all", undefined, [], "")).toEqual([]);
    expect(filterTodoTasks(tasks, "date", "发布说明", "p1", undefined, ["发布"], "2026-09-10").map((item) => item.id)).toEqual(["match"]);
  });
});
