import type { TodoDatePreset, TodoProgressWidget, TodoProjectScope } from "../../types";

export function isTodoDatePreset(value: unknown): value is TodoDatePreset {
  return value === "today" || value === "this-week" || value === "this-month" || value === "custom";
}

export function validateTodoWidgetDates(input: { datePreset?: TodoDatePreset; dateFrom?: string; dateTo?: string }): string | null {
  if (input.datePreset !== "custom") return null;
  if (!input.dateFrom || !input.dateTo) return "自定义日期范围需要同时填写开始和结束日期。";
  if (input.dateFrom > input.dateTo) return "开始日期不能晚于结束日期。";
  return null;
}

export function normalizeTodoProjectScope(value: unknown): TodoProjectScope {
  return value === "specific" ? "specific" : "all";
}

export function isTodoWidgetUsable(widget: TodoProgressWidget): boolean {
  if (widget.viewType === "project" && widget.projectScope === "specific" && !widget.projectId) return false;
  return Boolean(widget.viewType === "project" || (widget.datePreset && validateTodoWidgetDates(widget) === null));
}
