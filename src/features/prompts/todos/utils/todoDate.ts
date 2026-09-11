import type { TodoDatePreset, TodoProgressWidget, TodoTask } from "../../types";

export type TodoDateRange = { from: Date; to: Date; label: string };

export function startOfLocalDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfLocalDay(value: Date): Date {
  const result = startOfLocalDay(value);
  result.setDate(result.getDate() + 1);
  result.setMilliseconds(-1);
  return result;
}

export function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseTodoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999`)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Returns the local YYYY-MM-DD key used by day-level planning. */
export function dateKeyFromTodoValue(value?: string): string | undefined {
  if (!value) return undefined;
  const date = parseTodoDate(value);
  return date ? localDateKey(date) : undefined;
}

/**
 * Super Productivity-style planning semantics:
 * plannedDate is a day-level intention, scheduledAt is a concrete time, and
 * deadlineAt is a hard boundary. Legacy startAt/dueAt remain valid fallbacks.
 */
export function getTodoPlannedDate(task: Pick<TodoTask, "plannedDate" | "scheduledAt" | "startAt" | "dueAt">): string | undefined {
  return task.plannedDate ?? dateKeyFromTodoValue(task.scheduledAt) ?? dateKeyFromTodoValue(task.startAt) ?? dateKeyFromTodoValue(task.dueAt);
}

export function getTodoScheduledAt(task: Pick<TodoTask, "scheduledAt">): Date | null {
  return parseTodoDate(task.scheduledAt);
}

export function getTodoDeadlineAt(task: Pick<TodoTask, "deadlineAt" | "dueAt">): Date | null {
  return parseTodoDate(task.deadlineAt ?? task.dueAt);
}

export function isTodoPlannedForDay(task: Pick<TodoTask, "plannedDate" | "scheduledAt" | "startAt" | "dueAt">, day: string): boolean {
  return getTodoPlannedDate(task) === day;
}

export function toDateTimeInput(value?: string): string {
  const date = parseTodoDate(value);
  if (!date) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoDateTime(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function toDateInput(value?: string): string {
  const date = parseTodoDate(value);
  return date ? localDateKey(date) : "";
}

export function toIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Steps a YYYY-MM-DD key by whole days, staying in local time so month and DST edges stay correct. */
export function shiftDateKey(dayKey: string, offsetDays: number): string {
  const date = new Date(`${dayKey}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return dayKey;
  date.setDate(date.getDate() + offsetDays);
  return localDateKey(date);
}

export function dateRangeForPreset(
  preset: TodoDatePreset,
  customFrom?: string,
  customTo?: string,
  now = new Date(),
): TodoDateRange {
  const today = startOfLocalDay(now);
  if (preset === "today") return { from: today, to: endOfLocalDay(today), label: "今天" };
  if (preset === "this-month") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to, label: "本月" };
  }
  if (preset === "custom") {
    const from = customFrom ? startOfLocalDay(new Date(`${customFrom}T00:00:00`)) : today;
    const to = customTo ? endOfLocalDay(new Date(`${customTo}T00:00:00`)) : endOfLocalDay(from);
    return { from: Number.isFinite(from.getTime()) ? from : today, to: Number.isFinite(to.getTime()) ? to : endOfLocalDay(today), label: "自定义日期" };
  }
  const day = today.getDay() || 7;
  const from = new Date(today);
  from.setDate(today.getDate() - day + 1);
  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to, label: "本周" };
}

export function taskDueInRange(task: TodoTask, range: TodoDateRange): boolean {
  const plannedDate = getTodoPlannedDate(task);
  if (plannedDate) {
    const planned = new Date(`${plannedDate}T12:00:00`);
    return planned.getTime() >= startOfLocalDay(range.from).getTime() && planned.getTime() <= endOfLocalDay(range.to).getTime();
  }
  const deadline = getTodoDeadlineAt(task);
  return Boolean(deadline && deadline.getTime() >= range.from.getTime() && deadline.getTime() <= range.to.getTime());
}

export function getWidgetDateRange(widget: TodoProgressWidget, now = new Date()): TodoDateRange | null {
  return widget.viewType === "date" && widget.datePreset
    ? dateRangeForPreset(widget.datePreset, widget.dateFrom, widget.dateTo, now)
    : null;
}
