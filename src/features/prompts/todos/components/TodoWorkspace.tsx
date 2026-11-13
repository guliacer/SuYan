import { useEffect, useRef, useState } from "react";
import { Archive, BarChart3, CalendarDays, Check, Download, Ellipsis, FileText, FolderKanban, ListPlus, ListTodo, Plus, Redo2, SlidersHorizontal, Sun, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AnchoredPopover } from "@/components/ui/AnchoredPopover";
import { useLocale } from "@/components/LocaleProvider";
import { TodoWeather } from "@/features/weather/components/TodoWeather";
import { usePromptStore } from "../../store/promptStore";
import { useTodoStore } from "../todoStore";
import { AddTodoWidgetDialog } from "./AddTodoWidgetDialog";
import { TodoArchiveDialog } from "./TodoArchiveDialog";
import { TodoManagerDialog, TodoTaskEditor, type TodoManagerAction, type TodoManagerActionRequest } from "./TodoManagerDialog";
import { TodoProgressSidebar } from "./TodoProgressSidebar";
import { TodoPlannerView } from "./TodoPlannerView";
import { TodoTodayView } from "./TodoTodayView";
import { collectTodoTagSuggestions } from "../utils/todoTags";
import { localDateKey } from "../utils/todoDate";
import { parseTodoQuickInput, splitTodoQuickInput } from "../utils/todoQuickInput";
import { selectTodoToday } from "../utils/todoToday";

type TodoWorkspaceSection = "today" | "tasks" | "planner" | "progress" | "archive";
export function TodoWorkspace() {
  const { t } = useLocale();
  const promptStore = usePromptStore();
  const todo = useTodoStore();
  const [section, setSection] = useState<TodoWorkspaceSection>("today");
  const [now, setNow] = useState(() => new Date());
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<typeof todo.tasks[number] | null>(null);
  const [managerActionRequest, setManagerActionRequest] = useState<TodoManagerActionRequest>();
  const [projectId, setProjectId] = useState("all");
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickAdding, setQuickAdding] = useState(false);
  const quickLock = useRef(false);
  useEffect(() => {
    void promptStore.load(); void promptStore.loadViewSettings(); void todo.load();
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    const updateDate = () => { if (!document.hidden) setNow(new Date()); };
    document.addEventListener("visibilitychange", updateDate);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", updateDate); };
  }, [promptStore.load, promptStore.loadViewSettings, todo.load]);
  const activeTaskCount = todo.tasks.filter((task) => !task.archived).length;
  const archivedTaskCount = todo.tasks.filter((task) => task.archived).length;
  const today = selectTodoToday(todo.tasks, now);
  const editingWidget = editingWidgetId ? todo.widgets.find((widget) => widget.id === editingWidgetId) : undefined;
  async function handleDeleteWidget(id: string) {
    const deleted = await todo.deleteWidget(id);
    if (deleted && editingWidgetId === id) setEditingWidgetId(null);
  }

  async function handleWidgetSaved(input: Parameters<typeof todo.createWidget>[0]) {
    const result = await todo.createWidget(input);
    if (result) {
      setWidgetDialogOpen(false);
    }
    return result;
  }

  async function handleWidgetUpdated(id: string, patch: Parameters<typeof todo.updateWidget>[1]) {
    const result = await todo.updateWidget(id, patch);
    if (result) {
      setWidgetDialogOpen(false);
      setEditingWidgetId(null);
    }
    return result;
  }

  function requestManagerAction(type: TodoManagerAction) {
    setSection("tasks");
    setManagerActionRequest((current) => ({ type, token: (current?.token ?? 0) + 1 }));
  }

  async function addQuickTasks(raw: string) {
    if (todo.isSaving || quickLock.current) return;
    const lines = splitTodoQuickInput(raw);
    if (!lines.length) return;
    quickLock.current = true; setQuickAdding(true);
    let created = 0;
    try {
      for (const title of lines) {
        const parsed = parseTodoQuickInput(title, now);
        if (!parsed.title) break;
        if (!await todo.createTask({ ...parsed, plannedDate: parsed.plannedDate ?? (section === "today" ? localDateKey(now) : undefined) })) break;
        created += 1;
      }
      setQuickTitle(lines.slice(created).join("\n"));
    } finally { quickLock.current = false; setQuickAdding(false); }
  }
  const sections = [
    { id: "today", label: "今天", icon: Sun, count: today.todayTasks.length },
    { id: "tasks", label: "全部事项", icon: ListTodo, count: activeTaskCount },
    { id: "planner", label: "规划", icon: CalendarDays },
    { id: "progress", label: "进度视图", icon: BarChart3 },
    { id: "archive", label: "归档", icon: Archive, count: archivedTaskCount },
  ] as const;
  return (
    <section aria-label={t("待办事项工作区")} className="todo-light-workspace relative flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-4 pb-1">
        <div className="min-w-0"><p className="text-[11px] font-medium text-muted">{t("灵感 / 待办事项")}</p><h1 className="mt-2 text-xl font-semibold leading-snug text-foreground min-[720px]:text-2xl">{t("今天，做点喜欢的事。")}</h1><p className="mt-2 text-xs leading-6 text-muted">{t("把想做的记下来，按自己的节奏慢慢来。")}</p></div>
        <TodoWeather now={now} />
      </header>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70">
        <div data-feature-guide="todo-views" aria-label={t("待办事项内容切换")} className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist">{sections.map((item) => <button aria-selected={section === item.id} aria-controls="todo-active-panel" className={"flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors " + (section === item.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground")} role="tab" type="button" id={"todo-tab-" + item.id} key={item.id} onClick={() => { if (item.id === "tasks") setProjectId("all"); setSection(item.id); }}><item.icon size={15} />{t(item.label)}{"count" in item && item.count ? <span className="text-[11px] font-normal opacity-70">{item.count}</span> : null}</button>)}</div>
        <div data-feature-guide="todo-actions" className="flex shrink-0 items-center gap-0.5 pb-1"><button aria-label={t("撤销上一步待办操作")} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary disabled:opacity-30" disabled={!todo.canUndo || todo.isSaving} title={t("撤销上一步待办操作")} type="button" onClick={() => void todo.undo()}><Undo2 size={15} /></button><button aria-label={t("重做待办操作")} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary disabled:opacity-30" disabled={!todo.canRedo || todo.isSaving} title={t("重做待办操作")} type="button" onClick={() => void todo.redo()}><Redo2 size={15} /></button><button ref={actionsRef} aria-expanded={actionsOpen} aria-label={t("更多待办操作")} className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" title={t("更多操作")} type="button" onClick={() => setActionsOpen((value) => !value)}><Ellipsis size={17} /></button></div>
      </div>
      {actionsOpen ? <AnchoredPopover anchorRef={actionsRef} label={t("更多待办操作")} width={215} onClose={() => setActionsOpen(false)}><div className="grid gap-1">{[{ type: "project", label: "项目管理", icon: FolderKanban }, { type: "import", label: "导入事项", icon: ListPlus }, { type: "export", label: "导出事项", icon: Download }, { type: "template", label: "文本转项目", icon: FileText }].map((item) => <button className="flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-background" type="button" key={item.type} onClick={() => { setActionsOpen(false); requestManagerAction(item.type as TodoManagerAction); }}><item.icon size={15} />{t(item.label)}</button>)}<button className="flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-sm hover:bg-background" type="button" onClick={() => { setActionsOpen(false); setEditingWidgetId(null); setWidgetDialogOpen(true); }}><Plus size={15} />{t("添加进度范围")}</button></div></AnchoredPopover> : null}
      <form className="flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-panel px-3 py-2.5 shadow-sm focus-within:border-primary/50 min-[720px]:px-4" aria-label={t("快速记录事项")} onSubmit={(event) => { event.preventDefault(); void addQuickTasks(quickTitle); }}><Plus size={20} strokeWidth={1.5} className="hidden shrink-0 text-primary min-[600px]:block" /><input aria-label={t("快速新增事项")} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted" disabled={quickAdding} maxLength={2000} placeholder={t("想到什么，就先记下来…")} value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData("text"); if (splitTodoQuickInput(pasted).length > 1) { event.preventDefault(); void addQuickTasks(pasted); } }} /><button type="button" aria-label={t("新建事项")} title={t("设置项目、日期和更多信息")} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-primary" onClick={() => requestManagerAction("create")}><SlidersHorizontal size={16} /></button><Button variant="primary" type="submit" disabled={todo.isSaving || quickAdding || !splitTodoQuickInput(quickTitle).length}>{quickAdding ? t("正在记录…") : t("记下来")}</Button></form>
      {todo.error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger"><span className="min-w-0 break-words">{t(todo.error)}</span><button aria-label={t("关闭")} className="shrink-0 rounded-md px-2 py-1 hover:bg-danger/10" type="button" onClick={todo.clearError}>{t("关闭")}</button></div> : null}
      <div id="todo-active-panel" role="tabpanel" aria-labelledby={"todo-tab-" + section} data-feature-guide="todo-content" className="relative flex min-h-0 flex-1 pt-1">
         {section === "today" ? <TodoTodayView tasks={todo.tasks} projects={todo.projects} now={now} isBusy={todo.isSaving} onEdit={setEditingTask} onComplete={todo.completeTask} onUpdate={todo.updateTask} onNew={() => requestManagerAction("create")} onViewAll={(id) => { setProjectId(id ?? "all"); setSection("tasks"); }} /> : section === "tasks" ? (
          <TodoManagerDialog
            key={projectId}
            embedded hideQuickAdd initialProjectId={projectId}
            tasks={todo.tasks}
            projects={todo.projects}
            promptEntries={promptStore.entries}
            isBusy={todo.isSaving}
            onClose={() => undefined}
            onCreateTask={todo.createTask}
            onUpdateTask={todo.updateTask}
            onDeleteTask={todo.deleteTask}
            onArchiveTask={(id) => todo.updateTask(id, { archived: true })}
            onCompleteTask={todo.completeTask}
            onBatchUpdateTasks={todo.batchUpdateTasks}
            onBatchDeleteTasks={todo.batchDeleteTasks}
             onCreateProject={todo.createProject}
             onUpdateProject={todo.updateProject}
             onDeleteProject={todo.deleteProject}
             onReorderProjects={todo.reorderProjects}
             actionRequest={managerActionRequest}
             onActionRequestHandled={() => setManagerActionRequest(undefined)}
            />
         ) : section === "planner" ? (
           <TodoPlannerView tasks={todo.tasks} projects={todo.projects} isBusy={todo.isSaving} onCompleteTask={todo.completeTask} onUpdateTask={todo.updateTask} onEditTask={setEditingTask} />
         ) : section === "progress" ? (
           <TodoProgressSidebar
             tasks={todo.tasks}
             projects={todo.projects}
             widgets={todo.widgets}
             isBusy={todo.isSaving}
             onCompleteTask={todo.completeTask}
             onUpdateTask={todo.updateTask}
             onEditTask={setEditingTask}
             onReorderProjects={todo.reorderProjects}
             onUpdateProject={todo.updateProject}
             onAddWidget={() => { setEditingWidgetId(null); setWidgetDialogOpen(true); }}
             onDeleteWidget={(id) => void handleDeleteWidget(id)}
             onEditWidget={(widget) => { setEditingWidgetId(widget.id); setWidgetDialogOpen(true); }}
             onReorderWidgets={(ids) => void todo.reorderWidgets(ids)}
           />
         ) : section === "archive" ? (
          <TodoArchiveDialog
            embedded
            tasks={todo.tasks}
            projects={todo.projects}
            promptEntries={promptStore.entries}
            isBusy={todo.isSaving}
            onClose={() => undefined}
             onRestore={(id) => todo.updateTask(id, { archived: false })}
             onDelete={todo.deleteTask}
             onUpdateTask={todo.updateTask}
             onBatchUpdateTasks={todo.batchUpdateTasks}
             onBatchDeleteTasks={todo.batchDeleteTasks}
             onUpdateProject={todo.updateProject}
           />
        ) : null}

      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[11px] text-muted"><span role="status" aria-live="polite" className="flex items-center gap-1.5"><Check size={12} className={todo.error ? "text-danger" : "text-primary"} />{todo.isLoading ? t("正在加载待办事项…") : todo.saveStatus === "saving" ? t("正在保存待办事项…") : todo.error ? t("部分更改未保存，请重试。") : t("已保存到本地")}</span><span>{t("快速输入支持 @today、@tomorrow；粘贴多行可批量记录。")}</span></footer>
      {editingTask ? <TodoTaskEditor task={editingTask} tasks={todo.tasks} projects={todo.projects} tagSuggestions={collectTodoTagSuggestions(todo.tasks)} isBusy={todo.isSaving} onClose={() => setEditingTask(null)} onCreate={async () => null} onUpdate={todo.updateTask} /> : null}

      {widgetDialogOpen ? (
        <AddTodoWidgetDialog
          widget={editingWidget}
          projects={todo.projects}
          isBusy={todo.isSaving}
          onClose={() => { setWidgetDialogOpen(false); setEditingWidgetId(null); }}
          onCreate={handleWidgetSaved}
          onUpdate={editingWidget ? handleWidgetUpdated : undefined}
        />
      ) : null}
    </section>
  );
}
