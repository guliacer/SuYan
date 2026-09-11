import { CalendarDays, Check, Circle, Clock3, Flag, ListTodo } from "lucide-react";
import { useState, type DragEvent } from "react";
import type { TodoProject, TodoTask, UpdateTodoTaskInput } from "../../types";
import type { TodoCalendarSettings, TodoWorkMode } from "../../../../types/todoCalendar";
import { buildTodoMonthBuckets, formatTodoPlanDate, getTodoProjectName, getTodoRemainingMinutes } from "../utils/todoPlanning";
import { getTodoDeadlineAt, getTodoPlannedDate, localDateKey } from "../utils/todoDate";
import { isCalendarDate, resolveTodoWorkday } from "../utils/todoWorkCalendar";
import { useTodoCalendar } from "../useTodoCalendar";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  tasks: TodoTask[];
  projects: TodoProject[];
  isBusy: boolean;
  onCompleteTask: (id: string) => Promise<unknown>;
  onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>;
  onEditTask: (task: TodoTask) => void;
};

const controlClass = "theme-action-control min-h-8 rounded-lg border px-2 py-1 text-xs disabled:opacity-50";
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function TodoPlannerView({ tasks, projects, isBusy, onCompleteTask, onUpdateTask, onEditTask }: Props) {
  const { t } = useLocale();
  const todayKey = localDateKey(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const calendar = useTodoCalendar(month.getFullYear());
  const { settings } = calendar;
  const holidays = calendar.holiday?.calendar?.year === month.getFullYear() ? calendar.holiday.calendar.days : [];
  const buckets = buildTodoMonthBuckets(tasks, month.getFullYear(), month.getMonth(), (date) => resolveTodoWorkday(date, settings, holidays).isWorkday);
  const unplanned = tasks.filter((task) => !task.archived && task.status !== "cancelled" && task.status !== "completed" && !getTodoPlannedDate(task))
    .sort((left, right) => left.orderKey.localeCompare(right.orderKey, "zh-CN"));
  const selected = buckets.find((bucket) => bucket.date === selectedDate) ?? buckets[0]!;
  const selectedWorkday = resolveTodoWorkday(selected.date, settings, holidays);
  const plannedCount = buckets.reduce((sum, bucket) => sum + bucket.tasks.length, 0);
  const workDays = buckets.filter((bucket) => bucket.isWorkday).length;
  const estimatedMinutes = buckets.reduce((sum, bucket) => sum + bucket.estimatedMinutes, 0);
  const leading = (month.getDay() + 6) % 7;
  const disabled = !calendar.ready || calendar.saving;

  function navigateMonth(next: Date) {
    if (next.getFullYear() < 1900 || next.getFullYear() > 2200) return;
    setMonth(next);
    setSelectedDate(localDateKey(next).slice(0, 7) === todayKey.slice(0, 7) ? todayKey : localDateKey(next));
  }
  function updateSettings(patch: Partial<Omit<TodoCalendarSettings, "overrides">>) {
    const { overrides: _overrides, ...current } = settings;
    void calendar.update({ kind: "settings", settings: { ...current, ...patch } });
  }
  function planTask(taskId: string, date: string) {
    if (!isBusy) void onUpdateTask(taskId, { plannedDate: date, scheduledAt: undefined });
  }
  function handleDrop(event: DragEvent<HTMLElement>, date: string) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/todo-task");
    if (tasks.some((task) => task.id === taskId)) { planTask(taskId, date); setSelectedDate(date); }
  }
  function clearPlan(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    // Preserve the legacy deadline when clearing the legacy plan fallback.
    if (!isBusy && task) void onUpdateTask(taskId, { plannedDate: undefined, scheduledAt: undefined, startAt: undefined, dueAt: undefined, deadlineAt: task.deadlineAt ?? task.dueAt });
  }

  return <section aria-label={t("待办规划视图")} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4 min-[720px]:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={18} />{t("按月规划")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label={t("上个月")} className={controlClass} disabled={month.getFullYear() === 1900 && month.getMonth() === 0} onClick={() => navigateMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>{t("上月")}</button>
          <input type="month" aria-label={t("规划月份")} min="1900-01" max="2200-12" className={controlClass} value={localDateKey(month).slice(0, 7)} onChange={(event) => { if (isCalendarDate(event.target.value + "-01")) navigateMonth(new Date(event.target.value + "-01T12:00:00")); }} />
          <button type="button" aria-label={t("下个月")} className={controlClass} disabled={month.getFullYear() === 2200 && month.getMonth() === 11} onClick={() => navigateMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>{t("下月")}</button>
          <button type="button" className={controlClass} onClick={() => { navigateMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelectedDate(todayKey); }}>{t("回到本月")}</button>
        </div>
      </header>
      <div className="theme-section my-3 space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">{t("工作模式")}<select aria-label={t("工作模式")} className={controlClass} value={settings.mode} disabled={disabled} onChange={(event) => updateSettings({ mode: event.target.value as TodoWorkMode })}><option value="single-rest">{t("单休")}</option><option value="alternate-rest">{t("大小周")}</option><option value="double-rest">{t("双休")}</option></select></label>
          {settings.mode === "single-rest" ? <label className="flex items-center gap-2">{t("每周休息")}<select aria-label={t("每周休息")} className={controlClass} disabled={disabled} value={settings.singleRestDay} onChange={(event) => updateSettings({ singleRestDay: Number(event.target.value) })}>{weekdays.map((name, index) => <option key={name} value={(index + 1) % 7}>{t(name)}</option>)}</select></label> : null}
          {settings.mode === "alternate-rest" ? <label className="flex flex-wrap items-center gap-2">{t("双休基准周")}<input className={controlClass} aria-label={t("双休基准周日期")} type="date" min="1900-01-01" max="2200-12-31" value={settings.doubleRestWeek} disabled={disabled} onChange={(event) => { if (isCalendarDate(event.target.value)) updateSettings({ doubleRestWeek: event.target.value }); }} /><span className="text-muted">{t("该日期所在周休周六、周日，下一周仅休周日")}</span></label> : null}
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.useHolidays} disabled={disabled} onChange={(event) => updateSettings({ useHolidays: event.target.checked })} />{t("应用中国大陆法定放假与调休")}</label>
          <button type="button" className={controlClass} disabled={!calendar.ready || !settings.useHolidays || calendar.loading} onClick={() => void calendar.refresh()}> {calendar.loading ? t("查询中…") : t("刷新节假日")}</button>
        </div>
        <p className="text-xs text-muted">{t("个人调整优先于法定放假与调休，最后按工作模式计算。切换模式保留个人调整，不移动已有事项。")}</p>
        <p role="status" className="text-xs text-muted">{!calendar.ready ? calendar.error ? t("日历设置不可用") : t("正在读取日历设置…") : calendar.saving ? t("正在保存…") : t(calendar.message)}</p>
        {calendar.error ? <p role="alert" className="text-xs text-danger">{calendar.error}</p> : null}
        <p role="status" className="text-xs text-muted">{!settings.useHolidays ? t("未应用法定节假日，按工作模式和个人调整显示") : calendar.loading ? t("正在查询节假日，当前日期标记可能更新…") : t(calendar.holiday?.message ?? "等待加载节假日")}
          {settings.useHolidays && calendar.holiday?.calendar ? ` · ${t("缓存更新时间")}: ` + new Date(calendar.holiday.calendar.fetchedAt).toLocaleString() : ""}
        </p>
        <p className="text-[11px] text-muted">{t("数据来源：holiday-cn（依据国务院通知整理的开源数据，非政府官方接口）。")}</p>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>{t("{year}年{month}月", { year: month.getFullYear(), month: month.getMonth() + 1 })}</span><span>{t("工作 {count} 天", { count: workDays })} · {t("休息 {count} 天", { count: buckets.length - workDays })}</span><span>{t("本月已计划 {count} 项", { count: plannedCount })} · {t("预计 {duration}", { duration: formatMinutes(estimatedMinutes, t) })}</span><span>{t("待规划 {count} 项", { count: unplanned.length })}</span></div>
      <div aria-label={t("月份日期")} className="grid grid-cols-7 gap-1 min-[720px]:gap-2">
        {weekdays.map((day) => <div key={day} className={`py-1 text-center text-[11px] ${day === "周六" || day === "周日" ? "text-tertiary-ink" : "text-muted"}`}>{t(day)}</div>)}
        {Array.from({ length: leading }, (_, index) => <div key={"empty-" + index} aria-hidden="true" />)}
        {buckets.map((bucket) => {
          const day = resolveTodoWorkday(bucket.date, settings, holidays);
          return <button key={bucket.date} type="button" data-color-role="calendar" aria-label={bucket.date + " " + t(day.label) + " " + t("{count} items", { count: bucket.tasks.length })} aria-pressed={selected.date === bucket.date}
            title={t("{label} · 点击查看事项或调整工作/休息", { label: t(day.label) })}
            className={`flex min-h-24 min-w-0 flex-col items-center gap-1 rounded-lg border px-0.5 py-2 text-center transition-colors min-[720px]:min-h-28 min-[720px]:px-2 ${selected.date === bucket.date ? "border-primary ring-1 ring-primary" : day.isWorkday ? "border-border hover:border-primary/60" : "border-tertiary-border hover:border-tertiary"} ${day.isWorkday ? "bg-panel/55" : "bg-tertiary-soft text-tertiary-ink"}`}
            onClick={() => setSelectedDate(bucket.date)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, bucket.date)}>
            <strong className={`text-sm ${bucket.date === todayKey ? "text-primary" : ""}`}>{Number(bucket.date.slice(-2))}{bucket.date === todayKey ? <span className="ml-0.5 text-[9px]">{t("今天缩写")}</span> : null}</strong>
            <span className={`w-full break-words text-[10px] leading-tight ${!day.isWorkday ? "text-tertiary-ink" : day.source === "manual" ? "text-secondary-ink" : "text-muted"}`}>{t(day.label)}</span>
            <span className="mt-auto text-[10px] text-muted">{bucket.tasks.length ? t("{count} items", { count: bucket.tasks.length }) : "—"}</span>
          </button>;
        })}
      </div>
      <section aria-label={t("所选日期安排")} className={`mt-4 rounded-xl border p-3 ${selectedWorkday.isWorkday ? "border-border bg-panel/55" : "border-tertiary-border bg-tertiary-soft/50"}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, selected.date)}>
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h3 className={`text-sm font-semibold ${selectedWorkday.isWorkday ? "" : "text-tertiary-ink"}`}>{selected.date} · {t(selectedWorkday.label)}</h3><p className="mt-1 text-xs text-muted">{t("{count} items", { count: selected.tasks.length })} · {t("预计 {duration}", { duration: formatMinutes(selected.estimatedMinutes, t) })} · {t("可拖入事项安排到这一天")}</p></div>
          <label className="flex items-center gap-2 text-xs">{t("当天安排")}<select aria-label={t("当天工作休息安排")} className={controlClass} disabled={disabled} value={settings.overrides[selected.date] ?? "default"} onChange={(event) => void calendar.update({ kind: "day", date: selected.date, value: event.target.value as "work" | "rest" | "default" })}><option value="default">{t("自动（恢复默认）")}</option><option value="work">{t("自定义工作日")}</option><option value="rest">{t("自定义休息日")}</option></select></label>
        </header>
        <div className="grid gap-2 min-[900px]:grid-cols-2">{selected.tasks.length ? selected.tasks.map((task) => <PlannerTaskRow key={task.id} task={task} projects={projects} isBusy={isBusy} onCompleteTask={onCompleteTask} onUpdateTask={onUpdateTask} onEditTask={onEditTask} onClearPlan={() => clearPlan(task.id)} />) : <p className="py-4 text-xs text-muted">{t("这一天没有安排事项。可拖入待规划事项，或在事项编辑中设置计划日。")}</p>}</div>
      </section>
      <section className="mt-4 rounded-xl border border-border bg-panel/45 p-3"><div className="mb-2 flex items-center gap-2"><ListTodo size={15} className="text-primary" /><h3 className="text-sm font-semibold">{t("待规划事项")}</h3><span className="text-xs text-muted">{unplanned.length}</span></div><div className="grid gap-2 min-[900px]:grid-cols-2">{unplanned.map((task) => <PlannerBacklogRow key={task.id} task={task} projects={projects} isBusy={isBusy} onCompleteTask={onCompleteTask} onEditTask={onEditTask} onPlanToday={() => planTask(task.id, selected.date)} />)}{!unplanned.length ? <p className="py-2 text-xs text-muted">{t("暂无待规划事项。其他月份的计划可通过月份切换查看。")}</p> : null}</div></section>
    </div>
  </section>;
}

function PlannerTaskRow({ task, projects, isBusy, onCompleteTask, onUpdateTask, onEditTask, onClearPlan }: { task: TodoTask; projects: TodoProject[]; isBusy: boolean; onCompleteTask: (id: string) => Promise<unknown>; onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>; onEditTask: (task: TodoTask) => void; onClearPlan: () => void }) {
  const { t } = useLocale();
  const completed = task.status === "completed";
  const deadline = getTodoDeadlineAt(task);
  return <article draggable={!isBusy} onDragStart={(event) => event.dataTransfer.setData("text/todo-task", task.id)} className={`group rounded-lg border border-border/70 bg-background/65 p-2 transition-colors hover:border-primary/50 ${completed ? "opacity-65" : ""}`}>
    <div className="flex min-w-0 items-start gap-2"><button aria-label={completed ? t("恢复事项 {title}", { title: task.title }) : t("完成事项 {title}", { title: task.title })} className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border ${completed ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted hover:border-primary hover:text-primary"}`} disabled={isBusy} title={completed ? t("恢复事项") : t("完成事项")} type="button" onClick={() => void (completed ? onUpdateTask(task.id, { status: "in-progress", progress: Math.min(task.progress, 99), completedAt: undefined }) : onCompleteTask(task.id))}>{completed ? <Check size={13} /> : <Circle size={13} />}</button><button className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-primary" title={task.title} type="button" onClick={() => onEditTask(task)}>{task.title}</button><button aria-label={t("取消计划 {title}", { title: task.title })} className="hidden size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-primary group-hover:flex group-focus-within:flex" title={t("移出计划")} type="button" onClick={onClearPlan}>×</button></div>
    <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-8 text-[10px] text-muted"><span className="truncate">{getTodoProjectName(task, projects)}</span>{task.timeEstimateMinutes ? <span className="inline-flex shrink-0 items-center gap-0.5"><Clock3 size={10} />{formatMinutes(getTodoRemainingMinutes(task), t)} {t("remaining")}</span> : null}{deadline ? <span className={`inline-flex shrink-0 items-center gap-0.5 ${deadline.getTime() < Date.now() && !completed ? "text-danger" : ""}`}><Flag size={10} />{formatTodoPlanDate(localDateKey(deadline))}</span> : null}</div>
  </article>;
}

function PlannerBacklogRow({ task, projects, isBusy, onCompleteTask, onEditTask, onPlanToday }: { task: TodoTask; projects: TodoProject[]; isBusy: boolean; onCompleteTask: (id: string) => Promise<unknown>; onEditTask: (task: TodoTask) => void; onPlanToday: () => void }) {
  const { t } = useLocale();
  return <article draggable={!isBusy} onDragStart={(event) => event.dataTransfer.setData("text/todo-task", task.id)} className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/65 px-2.5 py-2"><button aria-label={t("完成事项 {title}", { title: task.title })} className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted hover:border-primary hover:text-primary" disabled={isBusy} title={t("完成事项")} type="button" onClick={() => void onCompleteTask(task.id)}><Circle size={13} /></button><button className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:text-primary" title={task.title} type="button" onClick={() => onEditTask(task)}>{task.title}</button><span className="hidden max-w-32 truncate text-[10px] text-muted min-[860px]:inline">{getTodoProjectName(task, projects)}</span><button className="shrink-0 rounded-md px-2 py-1 text-[10px] text-primary hover:bg-primary-soft" type="button" onClick={onPlanToday}>{t("安排到所选日期")}</button></article>;
}

function formatMinutes(minutes: number, translate: (text: string, values?: Record<string, string | number>) => string = (text) => text): string {
  if (minutes <= 0) return translate("0 分钟");
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? translate("{hours}h {minutes}m", { hours, minutes: rest }) : translate("{minutes}m", { minutes: rest });
}
