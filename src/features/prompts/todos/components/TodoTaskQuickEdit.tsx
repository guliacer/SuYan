import type { ReactNode } from "react";
import type { TodoPriority, TodoStatus, TodoTask, UpdateTodoTaskInput } from "../../types";
import { priorityLabel, statusLabel } from "../utils/todoProgress";
import { formatTodoPlanDate } from "../utils/todoPlanning";
import { toDateInput, toIsoDate } from "../utils/todoDate";
import { CalendarDays, Flag } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  task: TodoTask;
  isBusy: boolean;
  onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>;
};

export function TodoTaskQuickEdit({ task, isBusy, onUpdateTask }: Props) {
  const { t } = useLocale();
  function update(patch: UpdateTodoTaskInput) {
    if (isBusy) return;
    void onUpdateTask(task.id, patch);
  }

  function updateStatus(status: TodoStatus) {
    update({
      status,
      progress: status === "completed" ? 100 : Math.min(task.progress, 99),
      completedAt: status === "completed" ? new Date().toISOString() : undefined,
    });
  }

  return <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 pl-9 text-[11px] min-[520px]:pl-[4.75rem]" onClick={(event) => event.stopPropagation()}>
    <QuickDateField disabled={isBusy} icon={<CalendarDays size={12} />} label={`${task.title} ${t("计划日期")}`} title={t("计划日期")} value={task.plannedDate ?? toDateInput(task.startAt)} onChange={(value) => update({ plannedDate: value || undefined, startAt: toIsoDate(value) })} />
    <QuickDateField disabled={isBusy} icon={<Flag size={12} />} label={`${task.title} ${t("硬截止日期")}`} title={t("硬截止日期")} value={toDateInput(task.deadlineAt ?? task.dueAt)} onChange={(value) => update({ deadlineAt: toIsoDate(value), dueAt: toIsoDate(value) })} />
    <select aria-label={`${task.title} ${t("优先级")}`} className="h-6 max-w-[72px] rounded-md border border-border bg-panel px-1.5 text-[11px] text-foreground outline-none focus:border-primary" disabled={isBusy} value={task.priority} onChange={(event) => update({ priority: event.target.value as TodoPriority })}><option value="low">{t(priorityLabel("low"))}</option><option value="normal">{t(priorityLabel("normal"))}</option><option value="high">{t(priorityLabel("high"))}</option><option value="urgent">{t(priorityLabel("urgent"))}</option></select>
    <select aria-label={`${task.title} ${t("状态")}`} className="h-6 max-w-[78px] rounded-md border border-border bg-panel px-1.5 text-[11px] text-foreground outline-none focus:border-primary" disabled={isBusy} value={task.status} onChange={(event) => updateStatus(event.target.value as TodoStatus)}><option value="todo">{t(statusLabel("todo"))}</option><option value="in-progress">{t(statusLabel("in-progress"))}</option><option value="completed">{t(statusLabel("completed"))}</option><option value="cancelled">{t(statusLabel("cancelled"))}</option></select>
  </div>;
}

/**
 * 日期只在填写后占位：已填写时常驻显示文本，未填写时收起为悬停/聚焦才出现的图标，
 * 避免每行都摆一个「年/月/日」空输入框。点击后调 showPicker 打开原生日历。
 */
function QuickDateField({ disabled, icon, label, title, value, onChange }: { disabled: boolean; icon: ReactNode; label: string; title: string; value: string; onChange: (value: string) => void }) {
  return <span className={`relative inline-flex h-6 shrink-0 items-center gap-1 rounded-md ${value ? "border border-border bg-panel px-1.5 text-foreground" : "w-6 justify-center text-muted opacity-0 transition-opacity hover:bg-background focus-within:opacity-100 group-hover:opacity-100"}`} title={title}>
    {icon}
    {value ? <span className="whitespace-nowrap">{formatTodoPlanDate(value)}</span> : null}
    <input aria-label={label} className="absolute inset-0 cursor-pointer opacity-0" disabled={disabled} type="date" value={value} onChange={(event) => onChange(event.target.value)} onClick={(event) => event.currentTarget.showPicker()} />
  </span>;
}
