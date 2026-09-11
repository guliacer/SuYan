import type { TodoTask } from "../../types";
import { dateKeyFromTodoValue, getTodoPlannedDate, localDateKey } from "./todoDate";
import { isTodoOverdue } from "./todoProgress";

export type TodoFilter = "all" | "today" | "upcoming" | "overdue" | "completed" | "date";

export function filterTodoTasks(tasks: readonly TodoTask[], filter: TodoFilter, query = "", projectId = "all", now = new Date(), tags: readonly string[] = [], dayKey = ""): TodoTask[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const requiredTags = tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = localDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDateKey(tomorrow);
  return tasks.filter((task) => {
    if (task.archived) return false;
    if (projectId !== "all" && task.projectId !== projectId) return false;
    if (requiredTags.length) {
      const taskTags = new Set(task.tagIds.map((tag) => tag.toLocaleLowerCase()));
      if (!requiredTags.every((tag) => taskTags.has(tag))) return false;
    }
    if (normalizedQuery && !`${task.title} ${task.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
    if (filter === "completed") return task.status === "completed";
    const plannedDate = getTodoPlannedDate(task);
    if (filter === "date") return Boolean(dayKey && (plannedDate === dayKey || dateKeyFromTodoValue(task.deadlineAt ?? task.dueAt) === dayKey));
    if (filter === "today") return Boolean(plannedDate === todayKey && task.status !== "completed");
    if (filter === "upcoming") return Boolean(plannedDate && plannedDate >= tomorrowKey && task.status !== "completed");
    if (filter === "overdue") return isTodoOverdue(task, now);
    return true;
  });
}
