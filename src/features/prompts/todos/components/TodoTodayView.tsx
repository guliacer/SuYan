import { useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, Circle, CircleCheck, Clock3, FolderOpen, ListTodo, Play, Plus, Sparkles, Sun } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import type { TodoProject, TodoTask, UpdateTodoTaskInput } from "../../types";
import { selectTodoToday } from "../utils/todoToday";
import { priorityLabel } from "../utils/todoProgress";
import { getTodoDeadlineAt } from "../utils/todoDate";
import { TodoTagCapsules } from "./TodoTagCapsules";

type Props = {
  tasks: TodoTask[]; projects: TodoProject[]; now: Date; isBusy: boolean;
  onEdit: (task: TodoTask) => void;
  onComplete: (id: string) => Promise<unknown>;
  onUpdate: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>;
  onNew: () => void;
  onViewAll: (projectId?: string) => void;
};
export function TodoTodayView({ tasks, projects, now, isBusy, onEdit, onComplete, onUpdate, onNew, onViewAll }: Props) {
  const { t } = useLocale();
  const [doneOpen, setDoneOpen] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(true);
  const day = selectTodoToday(tasks, now);
  const [focus, ...rest] = day.todayTasks;
  const projectFor = (task: TodoTask) => projects.find((project) => project.id === task.projectId);
  function row(task: TodoTask, focused = false) {
    const project = projectFor(task);
    const completed = task.status === "completed";
    const due = getTodoDeadlineAt(task);
    return <div key={task.id} className={focused ? "rounded-2xl border border-primary/30 bg-primary-soft/30 p-4 min-[720px]:p-5" : "group flex items-start gap-3 rounded-xl border border-border/70 bg-panel/70 px-3 py-3 transition-colors hover:border-primary/30 min-[720px]:px-4"}>
      {focused ? <div className="mb-4 flex items-center gap-2 text-xs font-medium text-primary"><Sparkles size={14} />{t("先从这一件开始")}<span className="ml-auto rounded-full border border-primary/20 bg-panel/70 px-2 py-0.5 text-[10px]">{task.status === "in-progress" ? t("进行中") : t("下一步")}</span></div> : null}
      <div className={focused ? "flex items-start gap-3" : "contents"}>
        <button type="button" aria-label={completed ? t("恢复事项：{title}", { title: task.title }) : t("完成事项：{title}", { title: task.title })} disabled={isBusy} className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-primary outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50" onClick={() => void (completed ? onUpdate(task.id, { status: "todo", progress: 0, completedAt: undefined }) : onComplete(task.id))}>{completed ? <CircleCheck size={22} /> : <Circle size={22} strokeWidth={1.4} />}</button>
        <div className="min-w-0 flex-1"><button type="button" className={"block w-full break-words py-1 text-left font-medium leading-6 hover:text-primary " + (focused ? "text-lg" : "text-sm") + (completed ? " text-muted line-through" : " text-foreground")} onClick={() => onEdit(task)}>{task.title}</button>
          {focused && task.description ? <p className="mt-1 line-clamp-2 text-xs leading-6 text-muted">{task.description}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted">{project ? <span className="flex max-w-48 items-center gap-1 truncate"><FolderOpen size={12} className="shrink-0" />{project.name}</span> : <span>{t("随手记")}</span>}{due ? <span className="flex items-center gap-1"><Clock3 size={12} />{due.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span> : null}{task.priority === "urgent" || task.priority === "high" ? <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-primary">{t(priorityLabel(task.priority))}</span> : null}{task.timeEstimateMinutes ? <span>{t("约 {count} 分钟", { count: task.timeEstimateMinutes })}</span> : null}<TodoTagCapsules tags={task.tagIds} max={3} /></div>
          {focused ? <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={isBusy} variant="primary" icon={task.status === "in-progress" ? <Check size={13} /> : <Play size={13} />} onClick={() => void (task.status === "in-progress" ? onComplete(task.id) : onUpdate(task.id, { status: "in-progress" }))}>{task.status === "in-progress" ? t("完成这一件") : t("开始这一件")}</Button><Button size="sm" variant="ghost" onClick={() => onEdit(task)}>{t("查看详情")}</Button></div> : null}
        </div>{!focused ? <button type="button" aria-label={t("编辑事项：{title}", { title: task.title })} className="mt-1 rounded-lg p-2 text-muted hover:bg-background hover:text-primary" onClick={() => onEdit(task)}><ChevronRight size={15} /></button> : null}
      </div>
    </div>;
  }
  return <div className="grid min-h-0 w-full gap-7 overflow-y-auto pr-1 min-[1100px]:grid-cols-[minmax(0,1fr)_230px]">
    <section aria-label={t("今天的清单")} className="min-w-0 pb-4">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{t("今天的清单")}<span className="ml-2 text-xs font-normal text-muted">{day.todayTasks.length}</span></h2><button type="button" className="flex items-center gap-1.5 text-xs text-muted hover:text-primary" onClick={() => onViewAll()}><ListTodo size={13} />{t("搜索与筛选")}<ArrowRight size={12} /></button></div>
      {focus ? <div className="space-y-2.5">{row(focus, true)}{rest.map((task) => row(task))}</div> : <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/25 bg-primary-soft/15 p-6 text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Sun size={25} strokeWidth={1.4} /></span><h3 className="text-base font-medium">{day.completed.length ? t("今天的安排，已经完成了。") : t("今天的清单，留一点给喜欢的事。")}</h3><p className="mb-4 mt-2 text-xs leading-6 text-muted">{t("记下一件小事，就从这里开始。")}</p><Button size="sm" icon={<Plus size={14} />} onClick={onNew}>{t("添加第一件事")}</Button></div>}
      {day.overdue.length ? <div className="mt-5"><button type="button" aria-expanded={overdueOpen} className="mb-3 flex w-full items-center gap-2 text-left text-xs font-medium text-muted" onClick={() => setOverdueOpen((value) => !value)}>{overdueOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{t("之前还没完成")}{" · "}{day.overdue.length}</button>{overdueOpen ? <div className="space-y-2">{day.overdue.map((task) => row(task))}</div> : null}</div> : null}
      {day.unscheduled.length ? <div className="mt-5"><button type="button" aria-expanded={backlogOpen} className="mb-3 flex w-full items-center gap-2 text-left text-xs font-medium text-muted" onClick={() => setBacklogOpen((value) => !value)}>{backlogOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{t("还没安排日期")}{" · "}{day.unscheduled.length}</button>{backlogOpen ? <div className="space-y-2">{day.unscheduled.map((task) => row(task))}</div> : null}</div> : null}
      {day.completed.length ? <div className="mt-5 border-t border-border/70 pt-4"><button type="button" aria-expanded={doneOpen} className="flex w-full items-center gap-2 text-left text-xs text-muted" onClick={() => setDoneOpen((value) => !value)}>{doneOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Check size={14} />{t("今天已完成 {count} 件", { count: day.completed.length })}</button>{doneOpen ? <div className="mt-3 space-y-2">{day.completed.map((task) => row(task))}</div> : null}</div> : null}
    </section>
    <aside aria-label={t("今天的节奏与项目")} className="min-w-0 space-y-6 border-t border-border/70 pt-5 min-[1100px]:border-l min-[1100px]:border-t-0 min-[1100px]:pl-6 min-[1100px]:pt-0">
      <section><div className="flex items-center gap-2 text-xs font-medium text-muted"><CircleCheck size={14} />{t("今天的节奏")}</div><p className="mt-4 text-3xl font-light tabular-nums text-foreground">{day.completed.length}<span className="ml-1.5 text-sm text-muted">/ {t("{count} 件", { count: day.total })}</span></p><div role="progressbar" aria-label={t("今日完成进度")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={day.completedPercent} className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-soft"><div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: day.completedPercent + "%" }} /></div><p className="mt-3 text-xs leading-6 text-muted">{day.total && day.completedPercent === 100 ? t("做得不错，给自己一点休息。") : t("不用一下做完，向前一点就很好。")}</p></section>
      <section><div className="mb-3 flex items-center justify-between text-xs font-medium text-muted"><span>{t("我的项目")}</span><button type="button" className="rounded-md p-1 hover:text-primary" aria-label={t("查看全部项目")} onClick={() => onViewAll()}><ArrowRight size={14} /></button></div><div className="space-y-1">{projects.filter((project) => !project.archived).map((project) => { const list = tasks.filter((task) => !task.archived && task.status !== "cancelled" && task.projectId === project.id); const count = list.filter((task) => task.status !== "completed").length; return <button type="button" key={project.id} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs hover:bg-primary-soft/50" onClick={() => onViewAll(project.id)}><FolderOpen size={14} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{project.name}</span><span className="text-muted">{count}</span></button>; })}{!projects.some((project) => !project.archived) ? <p className="text-xs leading-6 text-muted">{t("先随手记，之后再整理成项目。")}</p> : null}</div></section>
    </aside>
  </div>;
}
