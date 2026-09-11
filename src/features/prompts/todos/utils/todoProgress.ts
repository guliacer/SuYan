import type { PromptColorId, TodoProgressWidget, TodoProject, TodoStatus, TodoTask } from "../../types";
import { getPromptColor, PROMPT_CARD_COLORS } from "../../utils/promptColors";
import { getTodoDeadlineAt, getWidgetDateRange, taskDueInRange, type TodoDateRange } from "./todoDate";

export type TodoProgressStats = {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  overdue: number;
  progress: number;
};

/** 项目卡片统一使用：未完成任务在前，已完成任务自动沉底。 */
export function sortTodoTasksForProject(tasks: readonly TodoTask[]): TodoTask[] {
  return [...tasks].sort((left, right) => {
    const leftCompleted = left.status === "completed" ? 1 : 0;
    const rightCompleted = right.status === "completed" ? 1 : 0;
    if (leftCompleted !== rightCompleted) return leftCompleted - rightCompleted;
    return left.orderKey.localeCompare(right.orderKey, "zh-CN") || left.createdAt.localeCompare(right.createdAt);
  });
}

export type TodoProjectTaskGroup = { project: TodoProject | null; tasks: TodoTask[] };

export function getTodoProjectColor(projectId: string, customColor: PromptColorId | undefined, projectIndex: number): ReturnType<typeof getPromptColor> {
  return customColor ? getPromptColor(projectId, customColor) : PROMPT_CARD_COLORS[projectIndex % PROMPT_CARD_COLORS.length];
}

export function groupTodoTasksByProject(tasks: readonly TodoTask[], projects: readonly TodoProject[]): TodoProjectTaskGroup[] {
  const groups: TodoProjectTaskGroup[] = projects
    .filter((project) => !project.archived)
    .map((project) => ({ project, tasks: sortTodoTasksForProject(tasks.filter((task) => task.projectId === project.id)) }));
  const unassigned = sortTodoTasksForProject(tasks.filter((task) => !task.projectId || !projects.some((project) => !project.archived && project.id === task.projectId)));
  if (unassigned.length) groups.push({ project: null, tasks: unassigned });
  return groups;
}

export function calculateTodoProgress(tasks: readonly TodoTask[]): number {
  const effective = tasks.filter((task) => !task.archived && task.status !== "cancelled");
  if (effective.length === 0) return 0;
  const total = effective.reduce((sum, task) => sum + (task.status === "completed" ? 100 : clampProgress(task.progress)), 0);
  return Math.round(total / effective.length);
}

export function getTodoStats(tasks: readonly TodoTask[], now = new Date()): TodoProgressStats {
  const active = tasks.filter((task) => !task.archived && task.status !== "cancelled");
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  return {
    total: active.length,
    completed: active.filter((task) => task.status === "completed").length,
    inProgress: active.filter((task) => task.status === "in-progress").length,
    todo: active.filter((task) => task.status === "todo").length,
    overdue: active.filter((task) => isTodoOverdue(task, todayEnd)).length,
    progress: calculateTodoProgress(active),
  };
}

export function isTodoOverdue(task: TodoTask, now = new Date()): boolean {
  const due = getTodoDeadlineAt(task);
  return Boolean(due && due.getTime() < now.getTime() && task.status !== "completed" && task.status !== "cancelled");
}

export function selectWidgetTasks(tasks: readonly TodoTask[], widget: TodoProgressWidget, now = new Date()): TodoTask[] {
  if (widget.viewType === "project") {
    return widget.projectScope === "specific" && widget.projectId
      ? tasks.filter((task) => !task.archived && task.projectId === widget.projectId && (widget.includeCompleted || task.status !== "completed"))
      : tasks.filter((task) => !task.archived && (widget.includeCompleted || task.status !== "completed"));
  }
  const range = getWidgetDateRange(widget, now);
  if (!range) return [];
  return tasks.filter((task) => !task.archived && taskDueInRange(task, range) && (widget.includeCompleted || task.status !== "completed"));
}

export function getWidgetStats(tasks: readonly TodoTask[], widget: TodoProgressWidget, now = new Date()): TodoProgressStats {
  return getTodoStats(selectWidgetTasks(tasks, widget, now), now);
}

export function clampProgress(value: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

export function statusLabel(status: TodoStatus): string {
  return status === "completed" ? "已完成" : status === "in-progress" ? "进行中" : status === "cancelled" ? "已取消" : "待开始";
}

export function priorityLabel(priority: TodoTask["priority"]): string {
  return priority === "urgent" ? "紧急" : priority === "high" ? "高" : priority === "low" ? "低" : "普通";
}
