import { useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Check, CheckCheck, Circle, Download, FileText, FolderKanban, GripVertical, ListPlus, ListTodo, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useLocale } from "@/components/LocaleProvider";
import type { CreateTodoProjectInput, CreateTodoTaskInput, PromptEntry, TodoImportCandidate, TodoPriority, TodoProject, TodoStatus, TodoTask, UpdateTodoProjectInput, UpdateTodoTaskInput } from "../../types";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import { getPromptColor } from "../../utils/promptColors";
import { getTodoProjectColor, priorityLabel, statusLabel } from "../utils/todoProgress";
import { filterTodoTasks, type TodoFilter } from "../utils/todoFilters";
import { collectTodoTagSuggestions, getTodoTagTone, pruneTodoTagSelection } from "../utils/todoTags";
import { TodoTagCapsules } from "./TodoTagCapsules";
import { normalizePromptTags, PromptTagEditor } from "../../components/PromptTagEditor";
import { TodoImportDialog } from "./TodoImportDialog";
import { TodoExportDialog } from "./TodoExportDialog";
import { TodoProjectCardFrame } from "./TodoProjectCardFrame";
import { TodoTaskQuickEdit } from "./TodoTaskQuickEdit";
import { TodoDateFilterChip } from "./TodoDateFilterChip";
import { TodoProjectTemplateDialog } from "./TodoProjectTemplateDialog";
import { getTodoProjectCardGridClassName } from "../utils/todoCardSizing";
import { parseTodoQuickInput, splitTodoQuickInput } from "../utils/todoQuickInput";
import { localDateKey, toDateTimeInput, toIsoDateTime } from "../utils/todoDate";

type Props = {
  tasks: TodoTask[];
  projects: TodoProject[];
  promptEntries?: PromptEntry[];
  isBusy: boolean;
  initialPrompt?: PromptEntry | null;
  onClose: () => void;
  onCreateTask: (input: CreateTodoTaskInput) => Promise<TodoTask | null>;
  onUpdateTask: (id: string, patch: any) => Promise<unknown>;
  onDeleteTask: (id: string) => Promise<boolean>;
  onArchiveTask: (id: string) => Promise<unknown>;
  onCompleteTask: (id: string) => Promise<unknown>;
  onBatchUpdateTasks: (ids: string[], patch: UpdateTodoTaskInput) => Promise<boolean>;
  onBatchDeleteTasks: (ids: string[]) => Promise<boolean>;
  onCreateProject: (input: CreateTodoProjectInput) => Promise<TodoProject | null>;
  onUpdateProject: (id: string, patch: UpdateTodoProjectInput) => Promise<unknown>;
  onDeleteProject: (id: string) => Promise<boolean>;
  onReorderProjects?: (ids: string[]) => Promise<boolean>;
  embedded?: boolean;
  actionRequest?: TodoManagerActionRequest;
  onActionRequestHandled?: () => void;
};

export type TodoManagerAction = "project" | "import" | "export" | "create" | "template";
export type TodoManagerActionRequest = {
  type: TodoManagerAction;
  token: number;
};

type TaskInput = {
  title: string;
  description?: string;
  projectId?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  progress?: number;
  startAt?: string;
  dueAt?: string;
  plannedDate?: string;
  scheduledAt?: string;
  deadlineAt?: string;
  timeEstimateMinutes?: number;
  timeSpentMinutes?: number;
  parentId?: string;
  linkedPromptIds?: string[];
  tagIds?: string[];
};

export function TodoManagerDialog({ tasks, projects, promptEntries = [], isBusy, initialPrompt, onClose, onCreateTask, onUpdateTask, onDeleteTask, onArchiveTask, onCompleteTask, onBatchUpdateTasks, onBatchDeleteTasks, onCreateProject, onUpdateProject, onDeleteProject, onReorderProjects, embedded = false, actionRequest, onActionRequestHandled }: Props) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [editor, setEditor] = useState<TodoTask | null | undefined>(initialPrompt ? null : undefined);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectTemplateOpen, setProjectTemplateOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickAdding, setQuickAdding] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const todayKey = useMemo(() => localDateKey(new Date()), []);
  const [dayKey, setDayKey] = useState(todayKey);
  const tagSuggestions = useMemo(() => collectTodoTagSuggestions(tasks), [tasks]);
  const visibleTasks = useMemo(() => filterTodoTasks(tasks, filter, query, projectId, undefined, activeTags, dayKey), [activeTags, dayKey, filter, projectId, query, tasks]);
  const projectGroups = useMemo(() => buildProjectGroups(visibleTasks, projects), [projects, visibleTasks]);
  const overdueCount = filterTodoTasks(tasks, "overdue").length;
  const todayCount = filterTodoTasks(tasks, "today").length;
  const dayCount = filterTodoTasks(tasks, "date", "", "all", undefined, [], dayKey).length;
  const visibleTaskIds = useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks]);
  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.has(id));

  useEffect(() => {
    const visible = new Set(visibleTaskIds);
    setSelectedTaskIds((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleTaskIds]);

  useEffect(() => {
    setActiveTags((current) => {
      const next = pruneTodoTagSelection(current, tagSuggestions);
      return next.length === current.length ? current : next;
    });
  }, [tagSuggestions]);

  useEffect(() => {
    if (!actionRequest) return;
    if (actionRequest.type === "project") setProjectManagerOpen(true);
    if (actionRequest.type === "import") setImportOpen(true);
    if (actionRequest.type === "export") setExportOpen(true);
    if (actionRequest.type === "create") setEditor(null);
    if (actionRequest.type === "template") setProjectTemplateOpen(true);
    onActionRequestHandled?.();
  }, [actionRequest, onActionRequestHandled]);

  useEffect(() => {
    function handleCopy(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "c" || selectedTaskIds.size === 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const selectedTitles = tasks.filter((task) => selectedTaskIds.has(task.id)).map((task) => task.title);
      if (selectedTitles.length === 0) return;
      event.preventDefault();
      void window.suyanApi.writeClipboardText(selectedTitles.join("\n")).then((result) => {
        if (!result.ok) return;
        setCopyNotice(t("已复制 {count} 项", { count: selectedTitles.length }));
        window.setTimeout(() => setCopyNotice(""), 1800);
      });
    }
    window.addEventListener("keydown", handleCopy);
    return () => window.removeEventListener("keydown", handleCopy);
  }, [selectedTaskIds, tasks]);

  function toggleTaskSelection(id: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleTaskIds.forEach((id) => next.delete(id));
      else visibleTaskIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function addQuickTasks(raw: string) {
    if (isBusy || quickAdding) return;
    const titles = splitTodoQuickInput(raw);
    if (titles.length === 0) return;
    setQuickTitle("");
    setQuickAdding(true);
    try {
      for (const title of titles) {
        const parsed = parseTodoQuickInput(title);
        const created = await onCreateTask({ ...parsed, projectId: projectId === "all" ? undefined : projectId });
        if (!created) break;
      }
    } finally {
      setQuickAdding(false);
    }
  }

  async function updateSelected(patch: UpdateTodoTaskInput) {
    const ids = [...selectedTaskIds];
    if (ids.length === 0 || isBusy) return;
    if (await onBatchUpdateTasks(ids, patch)) setSelectedTaskIds(new Set());
  }

  async function deleteSelected() {
    const ids = [...selectedTaskIds];
    if (ids.length === 0 || isBusy || !window.confirm(t("确定永久删除选中的 {count} 项事项吗？", { count: ids.length }))) return;
    if (await onBatchDeleteTasks(ids)) setSelectedTaskIds(new Set());
  }

  const content = (
    <>
      {exportOpen && <TodoExportDialog selectedTaskIds={[...selectedTaskIds]} onClose={() => setExportOpen(false)} />}
      {!embedded ? <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div><p className="text-xs text-muted">{t("灵感创作 · 独立事项")}</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold" id="todo-manager-title"><ListTodo size={19} />{t("待办事项")}</h2></div>
        <div className="flex items-center gap-1.5"><Button icon={<FolderKanban size={15} />} onClick={() => setProjectManagerOpen((value) => !value)}>{projectManagerOpen ? t("收起项目") : t("项目管理")}</Button><Button icon={<FileText size={15} />} onClick={() => setProjectTemplateOpen(true)}>{t("文本转项目")}</Button><Button icon={<ListPlus size={15} />} onClick={() => setImportOpen(true)}>{t("导入事项")}</Button><Button icon={<Download size={15} />} onClick={() => setExportOpen(true)}>{t("导出事项")}</Button><Button icon={<Plus size={15} />} variant="primary" onClick={() => setEditor(null)}>{t("新建事项")}</Button><DialogCloseButton onClick={onClose} /></div>
      </header> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="shrink-0 border-b border-border/70 px-4 py-3 min-[720px]:px-5">
          <div className="flex flex-wrap items-center gap-1">
            {(["all", "today", "upcoming", "overdue", "completed"] as TodoFilter[]).map((item) => {
              const labels: Partial<Record<TodoFilter, string>> = { all: t("全部"), today: `${t("今天")} ${todayCount || ""}`, upcoming: t("即将到期"), overdue: `${t("已逾期")} ${overdueCount || ""}`, completed: t("已完成") };
              return <button aria-pressed={filter === item} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${filter === item ? "bg-primary-soft text-primary" : "text-muted hover:bg-background hover:text-foreground"}`} key={item} type="button" onClick={() => setFilter(item)}>{labels[item]}</button>;
            })}
            <TodoDateFilterChip active={filter === "date"} count={dayCount} dayKey={dayKey} todayKey={todayKey} onActivate={() => setFilter("date")} onChangeDay={(next) => { setDayKey(next); setFilter("date"); }} />
            <span className="ml-auto text-xs text-muted">{t("显示 {count} 项", { count: visibleTasks.length })}</span>
          </div>
          <div className="mt-2 grid gap-2 min-[720px]:grid-cols-[minmax(0,1fr)_170px_auto]">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><TextField className="h-9 pl-9" placeholder={t("搜索任务标题或说明")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <select aria-label={t("按项目筛选")} className="h-9 rounded-lg border border-border bg-panel px-2.5 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">{t("全部项目")}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.archived ? `（${t("已归档")}）` : ""}</option>)}</select>
            <div className="flex min-w-0 items-center gap-1.5">
              <label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-muted"><input aria-label={t("全选当前事项")} checked={allVisibleSelected} disabled={visibleTaskIds.length === 0} type="checkbox" onChange={toggleAllVisible} />{t("全选")}</label>
              <TextField aria-label={t("快速新增事项")} className="h-9 min-w-32 flex-1 min-[720px]:w-36" disabled={isBusy || quickAdding} placeholder={t("快速新增")} value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void addQuickTasks(quickTitle); } }} onPaste={(event) => { const pasted = event.clipboardData.getData("text"); if (splitTodoQuickInput(pasted).length > 1) { event.preventDefault(); void addQuickTasks(pasted); } }} />
              <Button disabled={isBusy || quickAdding || splitTodoQuickInput(quickTitle).length === 0} icon={<Plus size={14} />} size="sm" onClick={() => void addQuickTasks(quickTitle)}>{t("添加")}</Button>
            </div>
          </div>
          {tagSuggestions.length ? <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 border-t border-border/60 pt-2"><span className="text-[11px] text-muted">{t("标签")}</span>{tagSuggestions.map((tag) => { const active = activeTags.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase()); const tone = CAPSULE_TONES[getTodoTagTone(tag)]; return <button aria-pressed={active} className={`max-w-40 truncate rounded-full border px-2 py-0.5 text-[11px] ${active ? tone.solid : "border-border text-muted hover:text-foreground"}`} key={tag} title={active ? `${t("取消筛选标签")} ${tag}` : `${t("按标签筛选")} ${tag}`} type="button" onClick={() => setActiveTags((current) => active ? current.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) : [...current, tag])}>{tag}</button>; })}{activeTags.length ? <button className="rounded-md px-2 py-0.5 text-[11px] text-primary hover:bg-primary-soft" type="button" onClick={() => setActiveTags([])}>{t("清除标签筛选")}</button> : null}</div> : null}
          {selectedTaskIds.size ? <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2"><span className="mr-1 text-xs font-medium text-primary">{t("已选 {count} 项", { count: selectedTaskIds.size })}</span><Button disabled={isBusy} icon={<CheckCheck size={14} />} size="sm" onClick={() => void updateSelected({ status: "completed", progress: 100, completedAt: new Date().toISOString() })}>{t("完成")}</Button><Button disabled={isBusy} icon={<ArchiveRestore size={14} />} size="sm" onClick={() => void updateSelected({ status: "in-progress", progress: 0, completedAt: undefined })}>{t("恢复")}</Button><Button disabled={isBusy} icon={<Archive size={14} />} size="sm" onClick={() => void updateSelected({ archived: true })}>{t("归档")}</Button><Button disabled={isBusy} icon={<Trash2 size={14} />} size="sm" variant="danger" onClick={() => void deleteSelected()}>{t("删除")}</Button><Button icon={<Download size={14} />} size="sm" onClick={() => setExportOpen(true)}>{t("导出所选")}</Button>{copyNotice ? <span className="ml-1 text-xs text-primary">{copyNotice}</span> : null}</div> : null}
        </div>
        {projectManagerOpen ? <ProjectManager projects={projects} isBusy={isBusy} onCreate={onCreateProject} onUpdate={onUpdateProject} onDelete={onDeleteProject} onReorder={onReorderProjects} /> : null}
        <div className="p-4 min-[720px]:p-5">
          {visibleTasks.length === 0 ? <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">{t("暂无符合条件的事项")}</div> : <div className={getTodoProjectCardGridClassName(projectGroups.length)}>{projectGroups.map(({ project, tasks: groupTasks }, index) => <ProjectTaskCard key={project?.id ?? "unassigned"} project={project} projectIndex={index} tasks={groupTasks} promptEntries={promptEntries} isBusy={isBusy} selectedTaskIds={selectedTaskIds} onToggleSelect={toggleTaskSelection} onEdit={(task) => setEditor(task)} onDelete={onDeleteTask} onArchive={onArchiveTask} onComplete={onCompleteTask} onRestore={(id) => onUpdateTask(id, { status: "in-progress", progress: 0 })} onUpdateTask={onUpdateTask} onResize={project ? (size) => onUpdateProject(project.id, { cardWidth: size.width, cardHeight: size.height }) : undefined} />)}</div>}
        </div>
      </div>
      {editor !== undefined ? <TodoTaskEditor task={editor} tasks={tasks} projects={projects} initialPrompt={initialPrompt} tagSuggestions={tagSuggestions} isBusy={isBusy} onClose={() => setEditor(undefined)} onCreate={onCreateTask} onUpdate={onUpdateTask} /> : null}
      {importOpen ? <TodoImportDialog tasks={tasks} isBusy={isBusy} onClose={() => setImportOpen(false)} onImport={(candidates) => importCandidates(candidates, tasks, projects, onCreateTask, onCreateProject)} /> : null}
      {projectTemplateOpen ? <TodoProjectTemplateDialog isBusy={isBusy} onClose={() => setProjectTemplateOpen(false)} onCreateProject={onCreateProject} onCreateTask={onCreateTask} /> : null}
    </>
  );

  if (embedded) {
    return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{content}</div>;
  }

  return <AppDialog overlayClassName="z-[170] px-3 py-4" panelClassName="flex max-h-[min(820px,calc(100dvh-2rem))] w-full max-w-5xl flex-col" titleId="todo-manager-title" onClose={onClose}>{content}</AppDialog>;
}

async function importCandidates(
  candidates: TodoImportCandidate[],
  tasks: TodoTask[],
  projects: TodoProject[],
  onCreateTask: (input: CreateTodoTaskInput) => Promise<TodoTask | null>,
  onCreateProject: (input: { name: string }) => Promise<TodoProject | null>,
): Promise<{ createdCount: number; skippedCount: number }> {
  const projectMap = new Map(projects.map((project) => [normalizeImportKey(project.name), project]));
  const existingKeys = new Set(tasks.map((task) => `${normalizeImportKey(task.title)}\u0000${task.projectId ?? ""}`));
  let createdCount = 0;
  let skippedCount = 0;

  for (const candidate of candidates) {
    let projectId: string | undefined;
    if (candidate.projectName?.trim()) {
      const projectKey = normalizeImportKey(candidate.projectName);
      let project = projectMap.get(projectKey);
      if (!project) {
        const createdProject = await onCreateProject({ name: candidate.projectName.trim() });
        if (createdProject) {
          project = createdProject;
          projectMap.set(projectKey, createdProject);
        }
      }
      if (!project) {
        skippedCount += 1;
        continue;
      }
      projectId = project?.id;
    }

    const key = `${normalizeImportKey(candidate.title)}\u0000${projectId ?? ""}`;
    if (existingKeys.has(key)) {
      skippedCount += 1;
      continue;
    }

    const created = await onCreateTask({
      title: candidate.title,
      description: candidate.description,
      projectId,
      status: candidate.status,
      priority: candidate.priority,
      progress: candidate.status === "completed" ? 100 : candidate.progress,
      startAt: candidate.startAt,
      dueAt: candidate.dueAt,
      plannedDate: candidate.plannedDate,
      scheduledAt: candidate.scheduledAt,
      deadlineAt: candidate.deadlineAt,
      timeEstimateMinutes: candidate.timeEstimateMinutes,
    });
    if (created) {
      createdCount += 1;
      existingKeys.add(key);
    }
  }

  return { createdCount, skippedCount };
}

function normalizeImportKey(value: string): string { return value.trim().toLocaleLowerCase().replace(/\s+/gu, " "); }

function buildProjectGroups(tasks: TodoTask[], projects: TodoProject[]): Array<{ project?: TodoProject; tasks: TodoTask[] }> {
  const groups = projects.filter((project) => !project.archived).map((project) => ({ project, tasks: [] as TodoTask[] }));
  const groupMap = new Map(groups.map((group) => [group.project.id, group]));
  const unassigned: TodoTask[] = [];
  for (const task of tasks) {
    const group = task.projectId ? groupMap.get(task.projectId) : undefined;
    if (group) group.tasks.push(task); else unassigned.push(task);
  }
  const visibleGroups: Array<{ project?: TodoProject; tasks: TodoTask[] }> = groups.filter((group) => group.tasks.length > 0).map((group) => ({ ...group, tasks: sortTasks(group.tasks) }));
  if (unassigned.length) visibleGroups.push({ tasks: sortTasks(unassigned) });
  return visibleGroups;
}

function sortTasks(tasks: TodoTask[]): TodoTask[] {
  return [...tasks].sort((left, right) => Number(left.status === "completed") - Number(right.status === "completed") || left.orderKey.localeCompare(right.orderKey, "zh-CN"));
}

function ProjectTaskCard({ project, projectIndex, tasks, promptEntries, isBusy, selectedTaskIds, onToggleSelect, onEdit, onDelete, onArchive, onComplete, onRestore, onUpdateTask, onResize }: { project?: TodoProject; projectIndex: number; tasks: TodoTask[]; promptEntries: PromptEntry[]; isBusy: boolean; selectedTaskIds: Set<string>; onToggleSelect: (id: string) => void; onEdit: (task: TodoTask) => void; onDelete: (id: string) => void; onArchive: (id: string) => void; onComplete: (id: string) => void; onRestore: (id: string) => void; onUpdateTask: (id: string, patch: any) => Promise<unknown>; onResize?: (size: { width?: number; height: number }) => void | Promise<unknown> }) {
  const { t } = useLocale();
  const tone = CAPSULE_TONES[getTodoProjectColor(project?.id ?? "unassigned", project?.colorId, projectIndex)];
  const progress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + (task.status === "completed" ? 100 : task.progress), 0) / tasks.length) : 0;
  return <TodoProjectCardFrame project={project ?? null} projectIndex={projectIndex} onResize={onResize}>
    <header className={`flex min-w-0 items-center gap-2 border-b px-3 py-2.5 ${tone.solid}`}><span className="text-sm">{project?.icon ?? "▦"}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold" title={project?.name ?? t("未分配项目")}>{project?.name ?? t("未分配项目")}</h3><p className="mt-0.5 text-[11px] opacity-75">{t("{count} items", { count: tasks.length })} · {t("{count} completed", { count: tasks.filter((task) => task.status === "completed").length })}</p></div><span className="text-xs font-semibold">{progress}%</span></header>
      <div className="min-h-0 flex-1 overflow-y-auto"><div className="px-1.5">{tasks.map((task) => <TodoTaskRow key={task.id} task={task} project={project} promptEntries={promptEntries} isBusy={isBusy} selected={selectedTaskIds.has(task.id)} onToggleSelect={() => onToggleSelect(task.id)} onEdit={() => onEdit(task)} onDelete={() => void onDelete(task.id)} onArchive={() => void onArchive(task.id)} onComplete={() => void onComplete(task.id)} onRestore={() => void onRestore(task.id)} onUpdateTask={onUpdateTask} />)}</div></div>
  </TodoProjectCardFrame>;
}

function TodoTaskRow({ task, project, promptEntries, isBusy, selected, onToggleSelect, onEdit, onDelete, onArchive, onComplete, onRestore, onUpdateTask }: { task: TodoTask; project?: TodoProject; promptEntries: PromptEntry[]; isBusy: boolean; selected: boolean; onToggleSelect: () => void; onEdit: () => void; onDelete: () => void; onArchive: () => void; onComplete: () => void; onRestore: () => void; onUpdateTask: (id: string, patch: any) => Promise<unknown> }) {
  const { t } = useLocale();
  const linked = task.linkedPromptIds.map((id) => promptEntries.find((entry) => entry.id === id)?.title).filter(Boolean);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);

  useEffect(() => {
    if (!editingTitle) setDraftTitle(task.title);
  }, [editingTitle, task.title]);

  function commitTitle() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setEditingTitle(false);
      onDelete();
      return;
    }
    setEditingTitle(false);
    if (nextTitle !== task.title) void onUpdateTask(task.id, { title: nextTitle });
  }

  return <div className={`group border-b px-1.5 py-2.5 transition-colors last:border-b-0 ${selected ? "bg-primary-soft/35" : task.status === "completed" ? "bg-primary-soft/15 text-muted" : "hover:bg-background/70"}`}>
    <div className="flex min-w-0 items-start gap-2"><input aria-label={t("选择事项 {title}", { title: task.title })} checked={selected} className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" onChange={onToggleSelect} /><button aria-label={task.status === "completed" ? t("恢复事项") : t("标记完成")} className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border ${task.status === "completed" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted hover:border-primary hover:text-primary"}`} type="button" onClick={task.status === "completed" ? onRestore : onComplete}>{task.status === "completed" ? <Check size={14} /> : <Circle size={14} />}</button><div className="min-w-0 flex-1">{editingTitle ? <input aria-label={t("编辑事项标题 {title}", { title: task.title })} autoFocus className="h-8 w-full min-w-0 rounded-md border border-primary bg-panel px-2 text-sm outline-none" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} onBlur={commitTitle} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTitle(); } if (event.key === "Escape") { setDraftTitle(task.title); setEditingTitle(false); } if (event.key === "Backspace" && draftTitle.length === 0) onDelete(); }} /> : <button className={`block max-w-full truncate text-left text-sm font-medium hover:text-primary ${task.status === "completed" ? "line-through decoration-primary/70" : ""}`} type="button" onClick={onEdit} onDoubleClick={(event) => { event.stopPropagation(); setEditingTitle(true); }}>{task.title}</button>}<p className="mt-0.5 truncate text-[11px] text-muted" title={linked.join("、")}>{project?.name ?? t("未分配项目")}{task.parentId ? ` · ${t("子事项")}` : ""}{task.subtaskIds?.length ? ` · ${t("{count} subtasks", { count: task.subtaskIds.length })}` : ""}{linked.length ? ` · ${linked.slice(0, 2).join("、")}${linked.length > 2 ? ` ${t("and {count} more ideas", { count: linked.length })}` : ` ${t("ideas")}`}` : ""}</p></div><div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><button aria-label={t("编辑事项")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground" title={t("编辑")} type="button" onClick={onEdit}><Pencil size={14} /></button><button aria-label={t("归档事项")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground" title={t("归档")} type="button" disabled={isBusy} onClick={onArchive}><Archive size={14} /></button><button aria-label={t("删除事项")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" title={t("删除")} type="button" disabled={isBusy} onClick={onDelete}><Trash2 size={14} /></button></div></div>
    {task.tagIds.length ? <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-9 min-[520px]:pl-[4.75rem]"><TodoTagCapsules tags={task.tagIds} /></div> : null}
    <TodoTaskQuickEdit task={task} isBusy={isBusy} onUpdateTask={onUpdateTask} />
  </div>;
}

export function TodoTaskEditor({ task, tasks = [], projects, initialPrompt, tagSuggestions = [], isBusy, onClose, onCreate, onUpdate }: { task: TodoTask | null; tasks?: TodoTask[]; projects: TodoProject[]; initialPrompt?: PromptEntry | null; tagSuggestions?: string[]; isBusy: boolean; onClose: () => void; onCreate: (input: TaskInput) => Promise<unknown>; onUpdate: (id: string, patch: TaskInput) => Promise<unknown> }) {
  const { t } = useLocale();
  const [title, setTitle] = useState(task?.title ?? initialPrompt?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [selectedProject, setSelectedProject] = useState(task?.projectId ?? "");
  const [priority, setPriority] = useState<TodoPriority>(task?.priority ?? "normal");
  const [status, setStatus] = useState<TodoStatus>(task?.status ?? "todo");
  const [progress, setProgress] = useState(String(task?.progress ?? 0));
  const [plannedDate, setPlannedDate] = useState(task?.plannedDate ?? toDateInput(task?.startAt ?? task?.dueAt));
  const [scheduledAt, setScheduledAt] = useState(toDateTimeInput(task?.scheduledAt));
  const [deadlineAt, setDeadlineAt] = useState(toDateTimeInput(task?.deadlineAt ?? task?.dueAt));
  const [timeEstimateMinutes, setTimeEstimateMinutes] = useState(String(task?.timeEstimateMinutes ?? ""));
  const [timeSpentMinutes, setTimeSpentMinutes] = useState(String(task?.timeSpentMinutes ?? ""));
  const [parentId, setParentId] = useState(task?.parentId ?? "");
  const [tags, setTags] = useState<string[]>(task?.tagIds ?? []);
  const [linkedPromptIds] = useState<string[]>(task?.linkedPromptIds ?? (initialPrompt ? [initialPrompt.id] : []));
  const valid = title.trim().length > 0;

  async function submit() {
    if (!valid || isBusy) return;
    const estimate = Number(timeEstimateMinutes);
    const input: TaskInput = {
      title: title.trim(), description: description.trim() || undefined, projectId: selectedProject || undefined, priority, status,
      progress: status === "completed" ? 100 : Number(progress),
      plannedDate: plannedDate || undefined,
      scheduledAt: toIsoDateTime(scheduledAt),
      deadlineAt: toIsoDateTime(deadlineAt),
      // Keep legacy fields populated for older builds and existing exports.
      startAt: plannedDate ? toIsoDate(plannedDate) : undefined,
      dueAt: deadlineAt ? toIsoDate(deadlineAt.slice(0, 10)) : undefined,
      timeEstimateMinutes: Number.isFinite(estimate) && estimate > 0 ? Math.round(estimate) : undefined,
      timeSpentMinutes: Number.isFinite(Number(timeSpentMinutes)) && Number(timeSpentMinutes) > 0 ? Math.round(Number(timeSpentMinutes)) : undefined,
      parentId: parentId || undefined,
      tagIds: normalizePromptTags(tags),
      linkedPromptIds,
    };
    const result = task ? await onUpdate(task.id, input) : await onCreate(input);
    if (result) onClose();
  }

  const availableParents = tasks.filter((candidate) => candidate.id !== task?.id && !candidate.parentId && candidate.status !== "cancelled");
  return (
    <AppDialog overlayClassName="z-[190] px-3 py-4" panelClassName="flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl flex-col" titleId="todo-task-editor-title" onClose={onClose}>
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4"><h3 className="text-lg font-semibold" id="todo-task-editor-title">{task ? t("编辑事项") : t("新建事项")}</h3><DialogCloseButton onClick={onClose} /></header>
      <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
        <label className="grid gap-1.5 text-sm font-medium">{t("任务标题")}<TextField autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("例如：整理 API 接入文档")} /></label>
        <label className="grid gap-1.5 text-sm font-medium">{t("任务说明")}<textarea className="min-h-24 rounded-xl border border-border bg-panel px-3 py-2 text-sm outline-none focus:border-primary" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="grid gap-3 min-[620px]:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">{t("项目")}<select className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="">{t("未分配项目")}</option>{projects.filter((project) => !project.archived || project.id === selectedProject).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium">{t("优先级")}<select className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}><option value="low">{t("低")}</option><option value="normal">{t("普通")}</option><option value="high">{t("高")}</option><option value="urgent">{t("紧急")}</option></select></label></div>
        {availableParents.length ? <label className="grid gap-1.5 text-sm font-medium">{t("父事项")}<select className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">{t("顶层事项")}</option>{availableParents.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select><span className="text-[11px] font-normal text-muted">{t("子事项仍是独立任务，完成状态和进度可以单独维护。")}</span></label> : null}
        <div className="grid gap-3 min-[620px]:grid-cols-4"><label className="grid gap-1.5 text-sm font-medium">{t("状态")}<select className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value as TodoStatus)}><option value="todo">{t("待开始")}</option><option value="in-progress">{t("进行中")}</option><option value="completed">{t("已完成")}</option><option value="cancelled">{t("已取消")}</option></select></label><label className="grid gap-1.5 text-sm font-medium">{t("进度（0-100）")}<TextField inputMode="numeric" type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">{t("预计分钟")}<TextField inputMode="numeric" type="number" min={0} max={43200} value={timeEstimateMinutes} onChange={(event) => setTimeEstimateMinutes(event.target.value)} placeholder={t("例如 45")} /></label><label className="grid gap-1.5 text-sm font-medium">{t("已用分钟")}<TextField inputMode="numeric" type="number" min={0} max={43200} value={timeSpentMinutes} onChange={(event) => setTimeSpentMinutes(event.target.value)} placeholder={t("例如 10")} /></label></div>
        <div className="grid gap-3 min-[620px]:grid-cols-3"><label className="grid gap-1.5 text-sm font-medium">{t("计划日")}<input className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">{t("排程时间")}<input className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">{t("硬截止时间")}<input className="h-10 rounded-xl border border-border bg-panel px-3 py-2 text-sm" type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} /></label></div>
        {linkedPromptIds.length ? <p className="text-xs text-muted">{t("已关联 {count} 条灵感，保存后会在事项详情中保留关联。", { count: linkedPromptIds.length })}</p> : null}
        <PromptTagEditor helperText={t("按回车新增，点击标签右侧图标删除；保存后可在筛选栏按标签过滤。")} isBusy={isBusy} suggestions={tagSuggestions} tags={tags} onChange={(nextTags) => { setTags(nextTags); return true; }} />
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4"><Button onClick={onClose}>{t("取消")}</Button><Button disabled={!valid || isBusy} variant="primary" onClick={() => void submit()}>{t("保存事项")}</Button></footer>
    </AppDialog>
  );
}

function ProjectManager({ projects, isBusy, onCreate, onUpdate, onDelete, onReorder }: { projects: TodoProject[]; isBusy: boolean; onCreate: (input: CreateTodoProjectInput) => Promise<unknown>; onUpdate: (id: string, patch: UpdateTodoProjectInput) => Promise<unknown>; onDelete: (id: string) => Promise<boolean>; onReorder?: (ids: string[]) => Promise<boolean> }) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  async function add() { const value = name.trim(); if (!value || isBusy) return; if (await onCreate({ name: value })) setName(""); }
  function moveProject(sourceId: string, targetId: string) {
    if (!onReorder || sourceId === targetId) return;
    const ids = projects.map((project) => project.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, sourceId);
    void onReorder(ids);
  }
  return <section className="mt-4 rounded-xl border border-border bg-background p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{t("项目管理")}</strong><TextField className="min-w-48 flex-1" placeholder={t("新项目名称")} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void add(); }} /><Button icon={<Plus size={14} />} disabled={isBusy || !name.trim()} onClick={() => void add()}>{t("新增项目")}</Button></div><div className="mt-3 grid gap-1">{projects.map((project) => <div key={project.id} draggable={Boolean(onReorder)} onDragStart={(event) => event.dataTransfer.setData("text/todo-project", project.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const sourceId = event.dataTransfer.getData("text/todo-project"); if (sourceId) moveProject(sourceId, project.id); }}><ProjectManagerRow project={project} isBusy={isBusy} onUpdate={onUpdate} onDelete={onDelete} /></div>)}</div><p className="mt-2 text-[11px] text-muted">{t("拖动项目左侧手柄可调整卡片顺序，顺序会同步到待办事项和进度视图。")}</p></section>;
}

function ProjectManagerRow({ project, isBusy, onUpdate, onDelete }: { project: TodoProject; isBusy: boolean; onUpdate: (id: string, patch: UpdateTodoProjectInput) => Promise<unknown>; onDelete: (id: string) => Promise<boolean> }) {
  const { t } = useLocale();
  const [name, setName] = useState(project.name);
  const tone = CAPSULE_TONES[getPromptColor(project.id, project.colorId)];
  async function saveName() { const value = name.trim(); if (value && value !== project.name) await onUpdate(project.id, { name: value }); }
  return <div className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${tone.borderHover}`}><button aria-label={t("拖动项目 {name}", { name: project.name })} className="flex size-7 cursor-grab items-center justify-center rounded-md text-muted active:cursor-grabbing" title={t("拖动排序")} type="button"><GripVertical size={14} /></button><span className={`size-3 rounded-full ${tone.solid}`} /><TextField aria-label={t("项目名称 {name}", { name: project.name })} className="min-w-32 flex-1 border-0 bg-transparent px-1" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void saveName()} onKeyDown={(event) => { if (event.key === "Enter") void saveName(); }} /><span className="text-xs text-muted">{project.archived ? t("已归档") : ""}</span><button aria-label={project.archived ? t("恢复项目") : t("归档项目")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-primary-soft" title={project.archived ? t("恢复项目") : t("归档项目")} type="button" disabled={isBusy} onClick={() => void onUpdate(project.id, { archived: !project.archived })}>{project.archived ? <Check size={14} /> : <X size={14} />}</button><button aria-label={t("删除项目")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" title={t("删除项目")} type="button" disabled={isBusy} onClick={() => void onDelete(project.id)}><Trash2 size={14} /></button></div>;
}

function toDateInput(value?: string): string { if (!value) return ""; const date = new Date(value); if (!Number.isFinite(date.getTime())) return ""; return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function toIsoDate(value: string): string | undefined { if (!value) return undefined; const date = new Date(`${value}T23:59:59.999`); return Number.isFinite(date.getTime()) ? date.toISOString() : undefined; }
