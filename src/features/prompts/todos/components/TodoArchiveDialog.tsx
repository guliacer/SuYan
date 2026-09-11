import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Search, Trash2 } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { TextField } from "@/components/ui/TextField";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import type { PromptEntry, TodoProject, TodoTask, UpdateTodoProjectInput, UpdateTodoTaskInput } from "../../types";
import { getTodoProjectColor } from "../utils/todoProgress";
import { getTodoProjectCardGridClassName } from "../utils/todoCardSizing";
import { TodoProjectCardFrame } from "./TodoProjectCardFrame";
import { TodoTaskQuickEdit } from "./TodoTaskQuickEdit";
import { TodoTagCapsules } from "./TodoTagCapsules";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  tasks: TodoTask[];
  projects: TodoProject[];
  promptEntries?: PromptEntry[];
  isBusy: boolean;
  onClose: () => void;
  onRestore: (id: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<boolean>;
  onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>;
  onBatchUpdateTasks: (ids: string[], patch: UpdateTodoTaskInput) => Promise<boolean>;
  onBatchDeleteTasks: (ids: string[]) => Promise<boolean>;
  onUpdateProject: (id: string, patch: UpdateTodoProjectInput) => Promise<unknown>;
  embedded?: boolean;
};

export function TodoArchiveDialog({ tasks, projects, promptEntries = [], isBusy, onClose, onRestore, onDelete, onUpdateTask, onBatchUpdateTasks, onBatchDeleteTasks, onUpdateProject, embedded = false }: Props) {
  const { t } = useLocale();
  const archivedTasks = tasks.filter((task) => task.archived);
  const [query, setQuery] = useState("");
  const filteredTasks = useMemo(() => filterArchivedTasks(archivedTasks, projects, query), [archivedTasks, projects, query]);
  const groups = useMemo(() => buildArchivedGroups(filteredTasks, projects), [filteredTasks, projects]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const archivedTaskIds = useMemo(() => filteredTasks.map((task) => task.id), [filteredTasks]);
  const allSelected = archivedTaskIds.length > 0 && archivedTaskIds.every((id) => selectedTaskIds.has(id));

  useEffect(() => {
    const available = new Set(archivedTaskIds);
    setSelectedTaskIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [archivedTaskIds]);

  function toggleAll() {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (allSelected) archivedTaskIds.forEach((id) => next.delete(id));
      else archivedTaskIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function restoreSelected() {
    const ids = [...selectedTaskIds];
    if (!ids.length || isBusy) return;
    if (await onBatchUpdateTasks(ids, { archived: false, status: "in-progress", progress: 0, completedAt: undefined })) setSelectedTaskIds(new Set());
  }

  async function deleteSelected() {
    const ids = [...selectedTaskIds];
    if (!ids.length || isBusy || !window.confirm(t("确定永久删除选中的 {count} 项归档事项吗？", { count: ids.length }))) return;
    if (await onBatchDeleteTasks(ids)) setSelectedTaskIds(new Set());
  }
  const content = <>
    {!embedded ? <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs text-muted">{t("待办事项工作区")}</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold" id="todo-archive-title"><ArchiveRestore size={19} />{t("归档")}</h2></div><DialogCloseButton onClick={onClose} /></header> : null}
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-border/70 px-4 py-3 min-[720px]:px-5"><div className="flex flex-wrap items-center gap-2"><label className="flex h-9 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-muted"><input aria-label={t("全选归档事项")} checked={allSelected} disabled={!archivedTaskIds.length} type="checkbox" onChange={toggleAll} />{t("全选")}</label><span className="text-sm font-medium">{t("归档")}</span><span className="text-xs text-muted">{t("共 {count} 项", { count: archivedTasks.length })}</span><span className="sr-only">{t("已归档事项不会出现在待办列表和进度视图中。")}</span><label className="relative ml-auto min-w-48 flex-1 min-[720px]:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={15} /><TextField className="h-9 pl-9" placeholder={t("搜索归档事项")} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>{selectedTaskIds.size ? <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2"><span className="mr-1 text-xs font-medium text-primary">{t("已选 {count} 项", { count: selectedTaskIds.size })}</span><button className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border bg-panel px-2.5 text-xs hover:bg-background disabled:opacity-50" disabled={isBusy} title={t("恢复选中事项")} type="button" onClick={() => void restoreSelected()}><ArchiveRestore size={14} />{t("恢复")}</button><button className="inline-flex min-h-8 items-center gap-2 rounded-md border border-danger bg-danger px-2.5 text-xs text-danger-foreground hover:bg-danger-strong disabled:opacity-50" disabled={isBusy} title={t("永久删除选中事项")} type="button" onClick={() => void deleteSelected()}><Trash2 size={14} />{t("删除")}</button></div> : null}</div>
      <div className="p-4 min-[720px]:p-5">{groups.length ? <div className={getTodoProjectCardGridClassName(groups.length)}>{groups.map(({ project, tasks: groupTasks }, index) => <ArchivedProjectCard key={project?.id ?? "unassigned"} project={project} projectIndex={index} tasks={groupTasks} promptEntries={promptEntries} isBusy={isBusy} selectedTaskIds={selectedTaskIds} onToggleSelect={(id) => setSelectedTaskIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onRestore={onRestore} onDelete={onDelete} onUpdateTask={onUpdateTask} onResize={project ? (size) => onUpdateProject(project.id, { cardWidth: size.width, cardHeight: size.height }) : undefined} />)}</div> : <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">{query.trim() ? t("没有匹配的归档事项") : t("暂无归档事项")}</div>}</div>
    </div>
  </>;

  if (embedded) {
    return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{content}</div>;
  }

  return <AppDialog overlayClassName="z-[175] px-3 py-4" panelClassName="flex max-h-[min(820px,calc(100dvh-2rem))] w-full max-w-4xl flex-col" titleId="todo-archive-title" onClose={onClose}>{content}</AppDialog>;
}

function ArchivedProjectCard({ project, projectIndex, tasks, promptEntries, isBusy, selectedTaskIds, onToggleSelect, onRestore, onDelete, onUpdateTask, onResize }: { project: TodoProject | null; projectIndex: number; tasks: TodoTask[]; promptEntries: PromptEntry[]; isBusy: boolean; selectedTaskIds: Set<string>; onToggleSelect: (id: string) => void; onRestore: (id: string) => Promise<unknown>; onDelete: (id: string) => Promise<boolean>; onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown>; onResize?: (size: { width?: number; height: number }) => void | Promise<unknown> }) {
  const { t } = useLocale();
  const tone = CAPSULE_TONES[getTodoProjectColor(project?.id ?? "unassigned", project?.colorId, projectIndex)];
  return <TodoProjectCardFrame project={project} projectIndex={projectIndex} onResize={onResize}>
    <header className={`flex min-w-0 items-center gap-2 border-b px-3 py-2.5 ${tone.solid}`}><span className="text-sm">{project?.icon ?? "▦"}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold" title={project?.name ?? t("未分配项目")}>{project?.name ?? t("未分配项目")}</h3><p className="mt-0.5 text-[11px] opacity-75">{t("{count} archived", { count: tasks.length })}</p></div></header>
     <div className="min-h-0 flex-1 overflow-y-auto"><div className="px-1.5">{tasks.map((task) => <ArchivedTaskRow key={task.id} task={task} project={project} linkedTitles={task.linkedPromptIds.map((id) => promptEntries.find((entry) => entry.id === id)?.title).filter((title): title is string => Boolean(title))} isBusy={isBusy} selected={selectedTaskIds.has(task.id)} onToggleSelect={() => onToggleSelect(task.id)} onRestore={() => void onRestore(task.id)} onDelete={() => void onDelete(task.id)} onUpdateTask={onUpdateTask} />)}</div></div>
  </TodoProjectCardFrame>;
}

function ArchivedTaskRow({ task, project, linkedTitles, isBusy, selected, onToggleSelect, onRestore, onDelete, onUpdateTask }: { task: TodoTask; project: TodoProject | null; linkedTitles: string[]; isBusy: boolean; selected: boolean; onToggleSelect: () => void; onRestore: () => void; onDelete: () => void; onUpdateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<unknown> }) {
  const { t } = useLocale();
  return <article className={`group border-b px-1.5 py-2.5 last:border-b-0 ${selected ? "bg-primary-soft/35" : "hover:bg-background/70"}`}><div className="flex min-w-0 items-start gap-2"><input aria-label={t("选择归档事项 {title}", { title: task.title })} checked={selected} className="mt-1 size-4 shrink-0 accent-primary" type="checkbox" onChange={onToggleSelect} /><div className="min-w-0 flex-1"><strong className="block truncate text-sm" title={task.title}>{task.title}</strong><p className="mt-0.5 truncate text-[11px] text-muted" title={linkedTitles.join("、")}>{project?.name ?? t("未分配项目")}{linkedTitles.length ? ` · ${t("关联")} ${linkedTitles.slice(0, 2).join("、")}` : ""}</p></div><div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><button aria-label={t("恢复归档事项")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-primary-soft hover:text-foreground" disabled={isBusy} title={t("恢复事项")} type="button" onClick={onRestore}><ArchiveRestore size={14} /></button><button aria-label={t("永久删除归档事项")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" disabled={isBusy} title={t("永久删除")} type="button" onClick={onDelete}><Trash2 size={14} /></button></div></div>{task.tagIds.length ? <div className="mt-1.5 flex min-w-0 items-center gap-2 pl-6"><TodoTagCapsules tags={task.tagIds} /></div> : null}<TodoTaskQuickEdit task={task} isBusy={isBusy} onUpdateTask={onUpdateTask} /></article>;
}

function filterArchivedTasks(tasks: TodoTask[], projects: TodoProject[], query: string): TodoTask[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return tasks;
  const projectNames = new Map(projects.map((project) => [project.id, project.name.toLocaleLowerCase()]));
  return tasks.filter((task) => `${task.title} ${task.description ?? ""} ${task.tagIds.join(" ")} ${projectNames.get(task.projectId ?? "") ?? ""}`.toLocaleLowerCase().includes(normalized));
}

function buildArchivedGroups(tasks: TodoTask[], projects: TodoProject[]): Array<{ project: TodoProject | null; tasks: TodoTask[] }> {
  const groups: Array<{ project: TodoProject | null; tasks: TodoTask[] }> = projects.map((project) => ({ project, tasks: tasks.filter((task) => task.projectId === project.id) })).filter((group) => group.tasks.length);
  const unassigned = tasks.filter((task) => !task.projectId || !projects.some((project) => project.id === task.projectId));
  if (unassigned.length) groups.push({ project: null, tasks: unassigned });
  return groups;
}
