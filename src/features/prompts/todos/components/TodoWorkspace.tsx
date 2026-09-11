import { useEffect, useRef, useState } from "react";
import { Archive, BarChart3, CalendarDays, Download, Ellipsis, FileText, FolderKanban, ListPlus, ListTodo, Plus, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { usePromptStore } from "../../store/promptStore";
import { useTodoStore } from "../todoStore";
import { AddTodoWidgetDialog } from "./AddTodoWidgetDialog";
import { TodoArchiveDialog } from "./TodoArchiveDialog";
import { TodoManagerDialog, type TodoManagerAction, type TodoManagerActionRequest } from "./TodoManagerDialog";
import { TodoProgressSidebar } from "./TodoProgressSidebar";
import { TodoTaskEditor } from "./TodoManagerDialog";
import { TodoPlannerView } from "./TodoPlannerView";
import { collectTodoTagSuggestions } from "../utils/todoTags";

type TodoWorkspaceSection = "tasks" | "planner" | "progress" | "archive";

export function TodoWorkspace() {
  const { t } = useLocale();
  const promptStore = usePromptStore();
  const todo = useTodoStore();
  const [section, setSection] = useState<TodoWorkspaceSection>("tasks");
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<typeof todo.tasks[number] | null>(null);
  const [managerActionRequest, setManagerActionRequest] = useState<TodoManagerActionRequest>();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void promptStore.load();
    void promptStore.loadViewSettings();
    void todo.load();
  }, [promptStore.load, promptStore.loadViewSettings, todo.load]);

  useEffect(() => {
    if (!actionsOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [actionsOpen]);

  const activeTaskCount = todo.tasks.filter((task) => !task.archived).length;
  const archivedTaskCount = todo.tasks.filter((task) => task.archived).length;
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

  return (
    <section aria-label={t("待办事项工作区")} className="relative flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary">{t("任务中心")}</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <ListTodo size={20} />
            {t("待办事项")}
          </h1>
          <p className="mt-1 text-xs text-muted">{t("按项目整理任务，快速掌握今天要做的事。")}</p>
        </div>
        <div data-feature-guide="todo-actions" className="flex items-center gap-1.5">
          <button aria-label={t("撤销上一步待办操作")} className="flex size-9 items-center justify-center rounded-lg border border-border bg-panel text-muted hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={!todo.canUndo || todo.isSaving} title={t("撤销上一步待办操作")} type="button" onClick={() => void todo.undo()}><Undo2 size={16} /></button>
          <button aria-label={t("重做待办操作")} className="flex size-9 items-center justify-center rounded-lg border border-border bg-panel text-muted hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={!todo.canRedo || todo.isSaving} title={t("重做待办操作")} type="button" onClick={() => void todo.redo()}><Redo2 size={16} /></button>
          <Button icon={<Plus size={15} />} variant="primary" onClick={() => requestManagerAction("create")}>{t("新建事项")}</Button>
          <div className="relative" ref={actionsRef}>
            <button aria-expanded={actionsOpen} aria-label={t("更多待办操作")} className="flex size-9 items-center justify-center rounded-lg border border-border bg-panel text-muted hover:bg-background hover:text-foreground" title={t("更多操作")} type="button" onClick={() => setActionsOpen((value) => !value)}><Ellipsis size={17} /></button>
            {actionsOpen ? <div className="absolute right-0 top-11 z-20 grid min-w-44 gap-1 rounded-xl border border-border bg-panel p-1.5 shadow-elevated">
              <button className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-background" type="button" onClick={() => { setActionsOpen(false); requestManagerAction("project"); }}><FolderKanban size={15} />{t("项目管理")}</button>
              <button className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-background" type="button" onClick={() => { setActionsOpen(false); requestManagerAction("import"); }}><ListPlus size={15} />{t("导入事项")}</button>
              <button className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-background" type="button" onClick={() => { setActionsOpen(false); requestManagerAction("export"); }}><Download size={15} />{t("导出事项")}</button>
              <button className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-background" type="button" onClick={() => { setActionsOpen(false); requestManagerAction("template"); }}><FileText size={15} />{t("文本转项目")}</button>
              <button className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-background" type="button" onClick={() => { setActionsOpen(false); setEditingWidgetId(null); setWidgetDialogOpen(true); }}><Plus size={15} />{t("添加进度范围")}</button>
            </div> : null}
          </div>
        </div>
        </header>

      {todo.error ? <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger"><span className="min-w-0 break-words">{t(todo.error)}</span><button aria-label={t("关闭")} className="shrink-0 rounded-md px-2 py-1 hover:bg-danger/10" type="button" onClick={todo.clearError}>{t("关闭")}</button></div> : todo.saveStatus === "saving" ? <div className="rounded-xl border border-border bg-background/60 px-4 py-2 text-sm text-muted">{t("正在保存待办事项…")}</div> : todo.saveStatus === "saved" ? <div className="rounded-xl border border-primary/20 bg-primary-soft/20 px-4 py-2 text-sm text-primary">{t("待办事项已保存")}</div> : null}

      <div data-feature-guide="todo-views" aria-label={t("待办事项内容切换")} className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border" role="tablist">
        <button
          aria-selected={section === "tasks"}
          className={`flex min-h-10 shrink-0 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${section === "tasks" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
          role="tab"
          type="button"
          onClick={() => setSection("tasks")}
        >
          <ListTodo size={15} />
           {t("待办事项")}
          <span className="text-xs opacity-80">{activeTaskCount}</span>
        </button>
         <button
          aria-selected={section === "planner"}
          className={`flex min-h-10 shrink-0 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${section === "planner" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
          role="tab"
          type="button"
          onClick={() => setSection("planner")}
        >
          <CalendarDays size={15} />
          {t("规划")}
          <span className="text-xs opacity-80">{t("月历")}</span>
        </button>
        <button
           aria-selected={section === "progress"}
           className={`flex min-h-10 shrink-0 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${section === "progress" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
           role="tab"
           type="button"
           onClick={() => setSection("progress")}
         >
           <BarChart3 size={15} />
           {t("进度视图")}
           <span className="text-xs opacity-80">{todo.projects.filter((project) => !project.archived).length}</span>
         </button>
         <button
          aria-selected={section === "archive"}
           className={`flex min-h-10 shrink-0 items-center justify-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${section === "archive" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
          role="tab"
          type="button"
          onClick={() => setSection("archive")}
        >
          <Archive size={15} />
          {t("归档")}
          <span className="text-xs opacity-80">{archivedTaskCount}</span>
        </button>
      </div>

       <div data-feature-guide="todo-content" className="relative flex min-h-0 flex-1">
         {section === "tasks" ? (
          <TodoManagerDialog
            embedded
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
         ) : (
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
        )}

      </div>

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
