import type { TodoTask } from "../../types";
import { dateKeyFromTodoValue, getTodoPlannedDate, localDateKey } from "./todoDate";
import { isTodoOverdue } from "./todoProgress";

/** A day-level view: cancelled and archived tasks never inflate today's workload. */
export function selectTodoToday(tasks: readonly TodoTask[], now = new Date()) {
  const today = localDateKey(now);
  const active = tasks.filter((task) => !task.archived && task.status !== "cancelled");
  const open = active.filter((task) => task.status !== "completed");
  const plannedToday = (task: TodoTask) => getTodoPlannedDate(task) === today || dateKeyFromTodoValue(task.deadlineAt ?? task.dueAt) === today;
  const priority = { urgent: 3, high: 2, normal: 1, low: 0 };
  const sort = (a: TodoTask, b: TodoTask) => Number(b.status === "in-progress") - Number(a.status === "in-progress") || priority[b.priority] - priority[a.priority] || a.orderKey.localeCompare(b.orderKey);
  const todayTasks = open.filter(plannedToday).sort(sort);
  const completed = active.filter((task) => task.status === "completed" && (plannedToday(task) || dateKeyFromTodoValue(task.completedAt) === today));
  const overdue = open.filter((task) => !plannedToday(task) && isTodoOverdue(task, now)).sort(sort);
  const unscheduled = open.filter((task) => !getTodoPlannedDate(task) && !task.deadlineAt && !task.dueAt).sort(sort);
  const total = todayTasks.length + completed.length;
  return { todayTasks, completed, overdue, unscheduled, total, completedPercent: total ? Math.round(completed.length / total * 100) : 0 };
}
