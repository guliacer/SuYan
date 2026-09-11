import { useMemo, useState } from "react";
import { BarChart3, Check, Circle, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import type { TodoProgressWidget, TodoProject, TodoTask, UpdateTodoProjectInput, UpdateTodoTaskInput } from "../../types";
import { getWidgetDateRange } from "../utils/todoDate";
import { getTodoProjectColor, groupTodoTasksByProject, getTodoStats, selectWidgetTasks, sortTodoTasksForProject } from "../utils/todoProgress";
import { getTodoProjectCardGridClassName } from "../utils/todoCardSizing";
import { TodoProjectCardFrame } from "./TodoProjectCardFrame";
import { TodoTaskQuickEdit } from "./TodoTaskQuickEdit";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  tasks: TodoTask[];
  projects: TodoProject[];
  widgets: TodoProgressWidget[];
  isBusy: boolean;
  onCompleteTask: (id: string) => Promise<unknown>;
  onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>;
  onEditTask: (task: TodoTask) => void;
  onReorderProjects: (ids: string[]) => Promise<boolean>;
  onUpdateProject: (id: string, patch: UpdateTodoProjectInput) => Promise<unknown>;
  onAddWidget?: () => void;
  onDeleteWidget?: (id: string) => void;
  onEditWidget?: (widget: TodoProgressWidget) => void;
  onReorderWidgets?: (ids: string[]) => void;
  /** 旧侧栏调用方仍可传入这些字段，完整视图不再使用固定宽度。 */
  width?: number;
  onWidthChange?: (width: number) => void;
};

export function TodoProgressSidebar({ tasks, projects, widgets, isBusy, onCompleteTask, onUpdateTask, onEditTask, onReorderProjects, onUpdateProject, onAddWidget, onDeleteWidget, onEditWidget, onReorderWidgets }: Props) {
  const { t } = useLocale();
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>("");
  const selectedWidget = widgets.find((widget) => widget.id === selectedWidgetId) ?? widgets[0];
  const defaultWidget = useMemo<TodoProgressWidget>(() => ({ id: "all-projects", viewType: "project", projectScope: "all", includeCompleted: true, showOverdue: true, orderKey: "0", createdAt: "", updatedAt: "" }), []);
  const scope = selectedWidget ?? defaultWidget;
  const scopedTasks = useMemo(() => selectWidgetTasks(tasks, scope), [scope, tasks]);
  const groups = useMemo(() => groupTodoTasksByProject(scopedTasks, projects).filter((group) => group.tasks.length > 0), [projects, scopedTasks]);
  const stats = useMemo(() => getTodoStats(scopedTasks), [scopedTasks]);
  const projectIds = useMemo(() => projects.filter((project) => !project.archived).map((project) => project.id), [projects]);

  function moveProject(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ids = [...projectIds];
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, sourceId);
    void onReorderProjects(ids);
  }

  return <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-panel">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 min-[720px]:px-5">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-semibold"><BarChart3 className="text-primary" size={18} />{t("进度视图")}</h2><p className="mt-1 text-xs text-muted">{t("按项目查看任务完成情况，双击任务可编辑。")}</p></div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        {widgets.length ? <label className="flex min-w-44 items-center gap-2"><span className="sr-only">{t("进度范围")}</span><select aria-label={t("选择进度范围")} className="h-9 max-w-full rounded-lg border border-border bg-background px-2.5 text-sm" value={scope.id} onChange={(event) => setSelectedWidgetId(event.target.value)}>{widgets.map((widget) => <option key={widget.id} value={widget.id}>{widget.title || widgetLabel(widget, t)}</option>)}</select></label> : null}
        {onAddWidget ? <Button icon={<Plus size={14} />} onClick={onAddWidget}>{t("添加范围")}</Button> : null}
        {selectedWidget && onEditWidget && onDeleteWidget ? <WidgetMenu onEdit={() => onEditWidget(selectedWidget)} onDelete={() => onDeleteWidget(selectedWidget.id)} /> : null}
      </div>
    </header>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border/70 bg-background/35 px-4 py-2.5 text-xs min-[720px]:px-5"><span className="font-medium text-primary">{stats.progress}% {t("总体进度")}</span><span className="text-muted">{t("{completed}/{total} completed", { completed: stats.completed, total: stats.total })}</span><span className="text-muted">{t("{count} in progress", { count: stats.inProgress })}</span>{scope.showOverdue && stats.overdue ? <span className="text-danger">{t("{count} overdue", { count: stats.overdue })}</span> : null}</div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 min-[720px]:p-5">
      {groups.length ? <div className={getTodoProjectCardGridClassName(groups.length)}>{groups.map(({ project, tasks: groupTasks }, index) => <ProjectOverviewCard key={project?.id ?? "unassigned"} project={project} projectIndex={index} tasks={groupTasks} showOverdue={scope.showOverdue} isBusy={isBusy} onCompleteTask={onCompleteTask} onUpdateTask={onUpdateTask} onEditTask={onEditTask} onDrop={moveProject} onResize={project ? (size) => onUpdateProject(project.id, { cardWidth: size.width, cardHeight: size.height }) : undefined} />)}</div> : <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">{t("当前范围暂无事项")}</div>}
    </div>
    <p className="border-t border-border/70 px-4 py-2 text-[11px] text-muted min-[720px]:px-5">{t("项目卡片可拖动排序并调整大小，任务列表可独立滚动。")}</p>
    {onReorderWidgets && widgets.length > 1 ? <span className="sr-only">{onReorderWidgets.toString()}</span> : null}
  </section>;
}

function ProjectOverviewCard({ project, projectIndex, tasks, showOverdue, isBusy, onCompleteTask, onUpdateTask, onEditTask, onDrop, onResize }: { project: TodoProject | null; projectIndex: number; tasks: TodoTask[]; showOverdue: boolean; isBusy: boolean; onCompleteTask: (id: string) => Promise<unknown>; onUpdateTask: UpdateTodoTaskInputHandler; onEditTask: (task: TodoTask) => void; onDrop: (sourceId: string, targetId: string) => void; onResize?: (size: { width?: number; height: number }) => void | Promise<unknown> }) {
  const { t } = useLocale();
  const tone = CAPSULE_TONES[getTodoProjectColor(project?.id ?? "unassigned", project?.colorId, projectIndex)];
  const stats = getTodoStats(tasks);
  const title = project?.name ?? t("未分配项目");
  const orderedTasks = sortTodoTasksForProject(tasks);
  return <TodoProjectCardFrame project={project} projectIndex={projectIndex} onResize={onResize} draggable={Boolean(project)} onDragStart={(event) => { if (project) event.dataTransfer.setData("text/todo-project", project.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const sourceId = event.dataTransfer.getData("text/todo-project"); if (sourceId && project) onDrop(sourceId, project.id); }}>
    <header className={`flex min-w-0 items-center gap-2 border-b px-3 py-2.5 ${tone.solid}`}><button aria-label={t("拖动项目 {name}", { name: title })} className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted/80 active:cursor-grabbing" title={t("拖动排序")} type="button"><GripVertical size={15} /></button><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold" title={title}>{project?.icon ? `${project.icon} ` : ""}{title}</h3><p className="mt-0.5 text-[11px] opacity-75">{t("{count} items", { count: stats.total })} · {t("{count} completed", { count: stats.completed })}</p></div><strong className="text-xs">{stats.progress}%</strong></header>
    <div className="h-1 shrink-0 bg-background"><div className={`h-full ${stats.progress === 100 ? "bg-primary" : "bg-primary/70"}`} style={{ width: `${stats.progress}%` }} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="px-1.5">{orderedTasks.map((task) => <ProgressTaskRow key={task.id} task={task} showOverdue={showOverdue} isBusy={isBusy} onCompleteTask={onCompleteTask} onUpdateTask={onUpdateTask} onEditTask={onEditTask} />)}</div></div>
  </TodoProjectCardFrame>;
}

type UpdateTodoTaskInputHandler = (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>;

function ProgressTaskRow({ task, showOverdue, isBusy, onCompleteTask, onUpdateTask, onEditTask }: { task: TodoTask; showOverdue: boolean; isBusy: boolean; onCompleteTask: (id: string) => Promise<unknown>; onUpdateTask: UpdateTodoTaskInputHandler; onEditTask: (task: TodoTask) => void }) {
  const { t } = useLocale();
  const completed = task.status === "completed";
  const overdue = showOverdue && task.dueAt && new Date(task.dueAt).getTime() < Date.now() && !completed && task.status !== "cancelled";
  async function toggleCompleted() {
    if (isBusy) return;
    if (completed) await onUpdateTask(task.id, { status: "in-progress", progress: Math.min(task.progress, 99) });
    else await onCompleteTask(task.id);
  }
  return <div className={`group min-w-0 border-b px-1.5 py-2.5 transition-colors last:border-b-0 ${completed ? "bg-primary-soft/15 text-muted" : "hover:bg-background/70"}`} onDoubleClick={() => onEditTask(task)}><div className="flex min-w-0 items-start gap-2"><button aria-label={completed ? t("恢复事项") : t("标记事项完成")} className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border ${completed ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted hover:border-primary hover:text-primary"}`} disabled={isBusy} title={completed ? t("恢复事项") : t("标记完成")} type="button" onClick={() => void toggleCompleted()}>{completed ? <Check size={14} /> : <Circle size={14} />}</button><div className="min-w-0 flex-1"><p className={`truncate text-sm ${completed ? "line-through decoration-primary/70" : "font-medium"}`} title={task.title}>{task.title}</p><div className="mt-1.5 flex min-w-0 items-center gap-2"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-panel"><div className={`h-full rounded-full ${completed ? "bg-primary" : "bg-primary/60"}`} style={{ width: `${completed ? 100 : Math.min(100, Math.max(0, task.progress))}%` }} /></div><span className={`shrink-0 text-[11px] ${completed ? "text-primary" : overdue ? "text-danger" : "text-muted"}`}>{completed ? t("已完成") : overdue ? t("逾期") : `${task.progress}%`}</span></div></div><span className="mt-0.5 shrink-0 text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" title={t("双击编辑")}><Pencil size={13} /></span></div><TodoTaskQuickEdit task={task} isBusy={isBusy} onUpdateTask={onUpdateTask} /></div>;
}

function WidgetMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return <div className="relative"><button aria-expanded={open} aria-label={t("进度范围操作")} className="flex size-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-primary-soft hover:text-foreground" title={t("范围操作")} type="button" onClick={() => setOpen((value) => !value)}><MoreHorizontal size={16} /></button>{open ? <div className="absolute right-0 top-11 z-10 grid min-w-32 gap-1 rounded-lg border border-border bg-panel p-1 shadow-elevated"><button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-background" type="button" onClick={() => { setOpen(false); onEdit(); }}><Pencil size={13} />{t("编辑范围")}</button><button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-danger hover:bg-danger-soft" type="button" onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={13} />{t("删除范围")}</button></div> : null}</div>;
}

function widgetLabel(widget: TodoProgressWidget, translate: (text: string) => string): string {
  if (widget.viewType === "project") return widget.projectScope === "specific" ? translate("指定项目") : translate("全部项目");
  return translate(getWidgetDateRange(widget)?.label ?? "日期范围");
}
