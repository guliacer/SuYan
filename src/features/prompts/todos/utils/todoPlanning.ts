import type { TodoProject, TodoTask } from "../../types";
import { dateKeyFromTodoValue, getTodoDeadlineAt, getTodoPlannedDate, localDateKey, startOfLocalDay } from "./todoDate";
import { clampProgress } from "./todoProgress";

export type TodoPlanBucket = {
  date: string;
  label: string;
  tasks: TodoTask[];
  estimatedMinutes: number;
  completedMinutes: number;
};

export type { TodoWorkMode } from "../../../../types/todoCalendar";
export type TodoCalendarDay = TodoPlanBucket & { isWorkday: boolean };

export function buildTodoMonthBuckets(tasks: readonly TodoTask[], year: number, month: number, isWorkday: (date: string) => boolean): TodoCalendarDay[] {
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const byDate = new Map(buildTodoPlanBuckets(tasks, count, first).map((bucket) => [bucket.date, bucket]));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const key = localDateKey(date);
    const bucket = byDate.get(key)!;
    return { ...bucket, label: date.toLocaleDateString("zh-CN", { weekday: "short", day: "numeric" }), isWorkday: isWorkday(key) };
  });
}

/** A stable execution order: urgency, deadline, then the user's orderKey. */
export function sortTodoTasksForExecution(tasks: readonly TodoTask[], now = new Date()): TodoTask[] {
  return [...tasks].sort((left, right) => {
    const statusOrder = Number(left.status === "completed") - Number(right.status === "completed");
    if (statusOrder) return statusOrder;
    const priorityOrder = priorityRank(right.priority) - priorityRank(left.priority);
    if (priorityOrder) return priorityOrder;
    const leftDeadline = getTodoDeadlineAt(left)?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightDeadline = getTodoDeadlineAt(right)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    const leftPlanned = getTodoPlannedDate(left) ?? "9999-12-31";
    const rightPlanned = getTodoPlannedDate(right) ?? "9999-12-31";
    return leftPlanned.localeCompare(rightPlanned) || left.orderKey.localeCompare(right.orderKey, "zh-CN") || left.createdAt.localeCompare(right.createdAt);
  });
}

/** Builds a rolling day plan without mutating task data. */
export function buildTodoPlanBuckets(tasks: readonly TodoTask[], days = 14, now = new Date()): TodoPlanBucket[] {
  const start = startOfLocalDay(now);
  const buckets = Array.from({ length: Math.max(1, days) }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return { date: key, label: formatPlanLabel(date, index), tasks: [] as TodoTask[], estimatedMinutes: 0, completedMinutes: 0 };
  });
  const byDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const task of tasks) {
    if (task.archived || task.status === "cancelled") continue;
    const plannedDate = getTodoPlannedDate(task);
    if (!plannedDate) continue;
    const bucket = byDate.get(plannedDate);
    if (!bucket) continue;
    bucket.tasks.push(task);
    const estimate = task.timeEstimateMinutes ?? 0;
    bucket.estimatedMinutes += estimate;
    bucket.completedMinutes += task.status === "completed" ? estimate : Math.round(estimate * clampProgress(task.progress) / 100);
  }
  buckets.forEach((bucket) => { bucket.tasks = sortTodoTasksForExecution(bucket.tasks, now); });
  return buckets;
}

export function getTodoRemainingMinutes(task: Pick<TodoTask, "timeEstimateMinutes" | "timeSpentMinutes" | "progress" | "status">): number {
  if (task.status === "completed") return 0;
  const estimate = task.timeEstimateMinutes ?? 0;
  if (estimate <= 0) return 0;
  const spent = task.timeSpentMinutes ?? Math.round(estimate * clampProgress(task.progress) / 100);
  return Math.max(0, estimate - spent);
}

export function getTodoSubtaskStats(task: Pick<TodoTask, "subtaskIds">, tasks: readonly TodoTask[]): { total: number; completed: number; progress: number } {
  const ids = new Set(task.subtaskIds ?? []);
  const children = tasks.filter((candidate) => ids.has(candidate.id));
  const completed = children.filter((candidate) => candidate.status === "completed").length;
  const progress = children.length ? Math.round(children.reduce((sum, child) => sum + (child.status === "completed" ? 100 : clampProgress(child.progress)), 0) / children.length) : 0;
  return { total: children.length, completed, progress };
}

export function getTodoProjectName(task: Pick<TodoTask, "projectId">, projects: readonly TodoProject[]): string {
  return projects.find((project) => project.id === task.projectId)?.name ?? "未分配项目";
}

export function formatTodoPlanDate(value?: string): string {
  const key = value ?? "";
  if (!key) return "未计划";
  const date = new Date(`${key}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) : "未计划";
}

function formatPlanLabel(date: Date, offset: number): string {
  if (offset === 0) return "今天";
  if (offset === 1) return "明天";
  return date.toLocaleDateString("zh-CN", { weekday: "short", month: "numeric", day: "numeric" });
}

function priorityRank(priority: TodoTask["priority"]): number {
  return priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "normal" ? 2 : 1;
}

export { dateKeyFromTodoValue };
