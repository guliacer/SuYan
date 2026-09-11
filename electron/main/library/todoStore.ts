import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getTodosPath } from "./libraryPaths";
import { getLibraryBackupPaths, writeLibraryJsonAtomically, writeTextFileAtomically } from "./libraryJsonPersistence";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import type {
  CreateTodoProjectInput,
  CreateTodoTaskInput,
  CreateTodoWidgetInput,
  TodoLibraryFile,
  TodoProgressWidget,
  TodoProject,
  TodoTask,
  TodoWidgetMutationData,
  TodoProjectMutationData,
  TodoTaskMutationData,
  UpdateTodoProjectInput,
  UpdateTodoTaskInput,
  UpdateTodoWidgetInput,
} from "../../../src/features/prompts/types";
import type { PromptColorId } from "../../../src/features/prompts/types";

const TODO_SCHEMA_VERSION = 1 as const;
let cache: TodoLibraryFile | null = null;
let mutationQueue: Promise<void> = Promise.resolve();

export function resetTodoStoreForTests(): void {
  cache = null;
  mutationQueue = Promise.resolve();
}

export function enqueueTodoMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(mutation, mutation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function importTodoLibraries(inputs: TodoLibraryFile[]): Promise<TodoLibraryFile> {
  return enqueueTodoMutation(async () => {
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 100) throw new AppError("TODO_EXCHANGE_INVALID", "请选择有效的待办文件。");
    const { mergeTodoExchange } = await import("./todoExchange");
    let next = await listTodos();
    for (const input of inputs) next = mergeTodoExchange(next, input);
    next = withFile(next, {});
    await persist(next);
    cache = next;
    return next;
  });
}

export async function listTodos(): Promise<TodoLibraryFile> {
  if (cache) return cache;
  const parsed = await readTodoJsonWithBackup();
  const normalized = normalizeTodoLibraryFile(parsed);
  await persist(normalized);
  cache = normalized;
  return normalized;
}

async function readTodoJsonWithBackup(): Promise<unknown> {
  const todoPath = getTodosPath();
  await fs.mkdir(todoPath.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
  let primaryContent: string | null = null;
  let primaryError: unknown = null;

  try {
    primaryContent = await fs.readFile(todoPath, "utf8");
    return JSON.parse(primaryContent) as unknown;
  } catch (error) {
    primaryError = error;
  }

  for (const [backupIndex, backupPath] of getLibraryBackupPaths(todoPath).entries()) {
    try {
      const backupContent = await fs.readFile(backupPath, "utf8");
      const parsed = JSON.parse(backupContent) as unknown;
      if (primaryContent !== null) {
        const corruptPath = `${todoPath}.corrupt.${Date.now()}`;
        await fs.copyFile(todoPath, corruptPath).catch(() => undefined);
      }
      await writeTextFileAtomically(todoPath, backupContent);
      logger.warn("library", "todo:restore-backup", { backupSlot: backupIndex });
      return parsed;
    } catch {
      // Continue to an older backup. A malformed backup must not hide a valid one.
    }
  }

  if (primaryError && (primaryError as NodeJS.ErrnoException).code !== "ENOENT") {
    throw new AppError("TODO_STORE_INVALID", "待办数据文件无法读取，且没有可用备份。");
  }
  return undefined;
}

export function createTodoTask(input: CreateTodoTaskInput): Promise<TodoTaskMutationData> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const now = new Date().toISOString();
    const task = normalizeTask({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }, undefined, file.tasks.length);
    const tasks = normalizeTaskRelations([...file.tasks, task]);
    const next = withFile(file, { tasks });
    await persist(next);
    cache = next;
    return { library: next, task: tasks.find((item) => item.id === task.id) ?? task };
  });
}

export function updateTodoTask(id: string, patch: UpdateTodoTaskInput): Promise<TodoTaskMutationData> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const index = file.tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new AppError("TODO_TASK_NOT_FOUND", "找不到待办任务。");
    const task = normalizeTask({ ...file.tasks[index], ...patch, id }, file.tasks[index], index);
    const tasks = [...file.tasks];
    tasks[index] = task;
    const next = withFile(file, { tasks: normalizeTaskRelations(tasks) });
    await persist(next);
    cache = next;
    return { library: next, task: next.tasks.find((item) => item.id === id) ?? task };
  });
}

export function deleteTodoTask(id: string): Promise<TodoLibraryFile> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const removedIds = collectTodoTaskTree(file.tasks, id);
    const tasks = file.tasks.filter((task) => !removedIds.has(task.id));
    if (tasks.length === file.tasks.length) throw new AppError("TODO_TASK_NOT_FOUND", "找不到待办任务。");
    const next = withFile(file, { tasks: normalizeTaskRelations(tasks) });
    await persist(next);
    cache = next;
    return next;
  });
}

export function completeTodoTask(id: string): Promise<TodoTaskMutationData> {
  return updateTodoTask(id, { status: "completed", progress: 100, completedAt: new Date().toISOString() });
}

/**
 * 原子替换完整待办快照，供批量操作和撤销/重做使用。
 * 数据仍由主进程归一化后写入 todos.json，渲染层不能直接访问文件。
 */
export function replaceTodoLibrary(input: TodoLibraryFile): Promise<TodoLibraryFile> {
  return enqueueTodoMutation(async () => {
    const normalized = normalizeTodoLibraryFile(input);
    const next = withFile(normalized, {});
    await persist(next);
    cache = next;
    return next;
  });
}

export function createTodoProject(input: CreateTodoProjectInput): Promise<TodoProjectMutationData> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const now = new Date().toISOString();
    const project = normalizeProject({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }, undefined, file.projects.length);
    const next = withFile(file, { projects: [...file.projects, project] });
    await persist(next);
    cache = next;
    return { library: next, project };
  });
}

export function updateTodoProject(id: string, patch: UpdateTodoProjectInput): Promise<TodoProjectMutationData> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const index = file.projects.findIndex((project) => project.id === id);
    if (index < 0) throw new AppError("TODO_PROJECT_NOT_FOUND", "找不到待办项目。");
    const project = normalizeProject({ ...file.projects[index], ...patch, id }, file.projects[index], index);
    const projects = [...file.projects];
    projects[index] = project;
    const next = withFile(file, { projects });
    await persist(next);
    cache = next;
    return { library: next, project };
  });
}

export function deleteTodoProject(id: string): Promise<TodoLibraryFile> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    if (!file.projects.some((project) => project.id === id)) throw new AppError("TODO_PROJECT_NOT_FOUND", "找不到待办项目。");
    const tasks = file.tasks.map((task) => task.projectId === id ? omitProject(task) : task);
    const next = withFile(file, { projects: file.projects.filter((project) => project.id !== id), tasks });
    await persist(next);
    cache = next;
    return next;
  });
}

export function reorderTodoProjects(ids: string[]): Promise<TodoLibraryFile> {
  return reorderByIds("projects", ids);
}

export function createTodoWidget(input: CreateTodoWidgetInput): Promise<TodoWidgetMutationData> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const now = new Date().toISOString();
    const widget = normalizeWidget({ ...input, id: randomUUID(), createdAt: now, updatedAt: now }, undefined, file.widgets.length);
    const next = withFile(file, { widgets: [...file.widgets, widget] });
    await persist(next);
    cache = next;
    return { library: next, widget };
  });
}

export function updateTodoWidget(id: string, patch: UpdateTodoWidgetInput): Promise<TodoWidgetMutationData> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const index = file.widgets.findIndex((widget) => widget.id === id);
    if (index < 0) throw new AppError("TODO_WIDGET_NOT_FOUND", "找不到进度组件。");
    const widget = normalizeWidget({ ...file.widgets[index], ...patch, id }, file.widgets[index], index);
    const widgets = [...file.widgets];
    widgets[index] = widget;
    const next = withFile(file, { widgets });
    await persist(next);
    cache = next;
    return { library: next, widget };
  });
}

export function deleteTodoWidget(id: string): Promise<TodoLibraryFile> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const widgets = file.widgets.filter((widget) => widget.id !== id);
    if (widgets.length === file.widgets.length) throw new AppError("TODO_WIDGET_NOT_FOUND", "找不到进度组件。");
    const next = withFile(file, { widgets });
    await persist(next);
    cache = next;
    return next;
  });
}

export function reorderTodoWidgets(ids: string[]): Promise<TodoLibraryFile> {
  return reorderByIds("widgets", ids);
}

export function unlinkTodoPromptIds(promptIds: readonly string[]): Promise<void> {
  return enqueueTodoMutation(async () => {
    const ids = new Set(promptIds);
    if (ids.size === 0) return;
    const file = await listTodos();
    let changed = false;
    const tasks = file.tasks.map((task) => {
      const linkedPromptIds = task.linkedPromptIds.filter((id) => !ids.has(id));
      if (linkedPromptIds.length !== task.linkedPromptIds.length) {
        changed = true;
        return { ...task, linkedPromptIds, updatedAt: new Date().toISOString() };
      }
      return task;
    });
    if (!changed) return;
    const next = withFile(file, { tasks });
    await persist(next);
    cache = next;
  });
}

async function reorderByIds(key: "projects" | "widgets", ids: string[]): Promise<TodoLibraryFile> {
  return enqueueTodoMutation(async () => {
    const file = await listTodos();
    const current = file[key];
    const byId = new Map(current.map((item) => [item.id, item]));
    const ordered = [...ids.filter((id) => byId.has(id)), ...current.map((item) => item.id).filter((id) => !ids.includes(id))]
      .map((id, index) => ({ ...byId.get(id)!, orderKey: String(index).padStart(10, "0"), updatedAt: new Date().toISOString() }));
    const next = withFile(file, { [key]: ordered } as Partial<TodoLibraryFile>);
    await persist(next);
    cache = next;
    return next;
  });
}

function emptyTodoLibrary(): TodoLibraryFile {
  return { kind: "suyan-todo-library", schemaVersion: TODO_SCHEMA_VERSION, updatedAt: new Date().toISOString(), tasks: [], projects: [], widgets: [] };
}

export function normalizeTodoLibraryFile(input: unknown): TodoLibraryFile {
  if (input === undefined || input === null) return emptyTodoLibrary();
  if (!isRecord(input) || input.kind !== "suyan-todo-library" || input.schemaVersion !== TODO_SCHEMA_VERSION) {
    throw new AppError("TODO_STORE_VERSION_UNSUPPORTED", "待办数据版本不受支持。");
  }
  const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
  const rawProjects = Array.isArray(input.projects) ? input.projects : [];
  const rawWidgets = Array.isArray(input.widgets) ? input.widgets : [];
  const tasks = normalizeTaskRelations(rawTasks.flatMap((item, index) => {
    try { return [normalizeTask(item, undefined, index)]; } catch { return []; }
  }));
  const projects = rawProjects.flatMap((item, index) => {
    try { return [normalizeProject(item, undefined, index)]; } catch { return []; }
  });
  const widgets = rawWidgets.flatMap((item, index) => {
    try { return [normalizeWidget(item, undefined, index)]; } catch { return []; }
  });
  return { kind: "suyan-todo-library", schemaVersion: TODO_SCHEMA_VERSION, updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString(), tasks, projects, widgets };
}

function normalizeTask(input: unknown, existing: TodoTask | undefined, index: number): TodoTask {
  if (!isRecord(input)) throw new AppError("TODO_TASK_INVALID", "待办任务数据无效。");
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const title = typeof input.title === "string" ? input.title.trim() : existing?.title ?? "";
  if (!title) throw new AppError("TODO_TASK_REQUIRED", "任务标题不能为空。");
  const status = isTodoStatus(input.status) ? input.status : existing?.status ?? "todo";
  const progress = clampProgress(input.progress, existing?.progress ?? 0);
  const now = new Date().toISOString();
  const description = has("description") ? stringValue(input.description) : existing?.description;
  const projectId = has("projectId") ? stringValue(input.projectId) : existing?.projectId;
  const plannedDate = has("plannedDate") ? normalizeDateKey(input.plannedDate) : existing?.plannedDate ?? normalizeDateKey(input.startAt ?? existing?.startAt);
  const scheduledAt = has("scheduledAt") ? normalizeDate(input.scheduledAt) : existing?.scheduledAt;
  const startAt = has("startAt") ? normalizeDate(input.startAt) : existing?.startAt;
  const dueAt = has("dueAt") ? normalizeDate(input.dueAt) : existing?.dueAt;
  const deadlineAt = has("deadlineAt") ? normalizeDate(input.deadlineAt) : existing?.deadlineAt ?? dueAt;
  const timeEstimateMinutes = normalizeMinutes(input.timeEstimateMinutes, existing?.timeEstimateMinutes);
  const timeSpentMinutes = normalizeMinutes(input.timeSpentMinutes, existing?.timeSpentMinutes) ?? 0;
  const parentId = has("parentId") ? stringValue(input.parentId) : existing?.parentId;
  const archived = has("archived") ? input.archived === true : existing?.archived === true;
  const completed = status === "completed";
  const completedAt = completed
    ? normalizeDate(input.completedAt) ?? existing?.completedAt ?? now
    : undefined;
  return {
    id: stringValue(input.id, existing?.id) ?? randomUUID(), title,
    ...(description ? { description } : {}),
    ...(projectId ? { projectId } : {}),
    ...(plannedDate ? { plannedDate } : {}),
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(deadlineAt ? { deadlineAt } : {}),
    status, priority: isTodoPriority(input.priority) ? input.priority : existing?.priority ?? "normal",
    progress: completed ? 100 : progress,
    ...(startAt ? { startAt } : {}),
    ...(dueAt ? { dueAt } : {}),
    ...(timeEstimateMinutes !== undefined ? { timeEstimateMinutes } : {}),
    ...(timeSpentMinutes > 0 ? { timeSpentMinutes } : {}),
    ...(parentId ? { parentId } : {}),
    subtaskIds: stringArray(input.subtaskIds ?? existing?.subtaskIds),
    ...(completedAt ? { completedAt } : {}),
    ...(archived ? { archived: true } : {}),
    linkedPromptIds: stringArray(input.linkedPromptIds ?? existing?.linkedPromptIds),
    tagIds: stringArray(input.tagIds ?? existing?.tagIds),
    orderKey: stringValue(input.orderKey, existing?.orderKey) ?? String(index).padStart(10, "0"),
    createdAt: normalizeDate(input.createdAt) ?? existing?.createdAt ?? now,
    updatedAt: normalizeDate(input.updatedAt) ?? now,
  };
}

function normalizeProject(input: unknown, existing: TodoProject | undefined, index: number): TodoProject {
  if (!isRecord(input)) throw new AppError("TODO_PROJECT_INVALID", "项目数据无效。");
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const name = typeof input.name === "string" ? input.name.trim() : existing?.name ?? "";
  if (!name) throw new AppError("TODO_PROJECT_REQUIRED", "项目名称不能为空。");
  const now = new Date().toISOString();
  const description = has("description") ? stringValue(input.description) : existing?.description;
  const icon = has("icon") ? stringValue(input.icon) : existing?.icon;
  const cardWidth = clampCardDimension(input.cardWidth, existing?.cardWidth, 260, 760);
  const cardHeight = clampCardDimension(input.cardHeight, existing?.cardHeight, 300, 900);
  return {
    id: stringValue(input.id, existing?.id) ?? randomUUID(), name,
    ...(description ? { description } : {}),
    ...(isPromptColorId(input.colorId) ? { colorId: input.colorId } : existing?.colorId ? { colorId: existing.colorId } : {}),
    ...(icon ? { icon } : {}),
    ...(cardWidth !== undefined ? { cardWidth } : {}),
    ...(cardHeight !== undefined ? { cardHeight } : {}),
    archived: input.archived === true || existing?.archived === true,
    orderKey: stringValue(input.orderKey, existing?.orderKey) ?? String(index).padStart(10, "0"),
    createdAt: normalizeDate(input.createdAt) ?? existing?.createdAt ?? now,
    updatedAt: normalizeDate(input.updatedAt) ?? now,
  };
}

function clampCardDimension(value: unknown, fallback: number | undefined, min: number, max: number): number | undefined {
  const source = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return source === undefined ? undefined : Math.min(max, Math.max(min, Math.round(source)));
}

function normalizeTaskRelations(tasks: TodoTask[]): TodoTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  const parentByChild = new Map<string, string>();
  for (const task of tasks) {
    if (task.parentId && task.parentId !== task.id && ids.has(task.parentId) && !createsTaskCycle(task.id, task.parentId, parentByChild)) {
      parentByChild.set(task.id, task.parentId);
    }
  }
  const childrenByParent = new Map<string, string[]>();
  for (const task of tasks) {
    const parentId = parentByChild.get(task.id);
    if (!parentId) continue;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(task.id);
    childrenByParent.set(parentId, children);
  }
  return tasks.map((task) => {
    const children = childrenByParent.get(task.id) ?? [];
    const orderedChildren = [...new Set([
      ...(task.subtaskIds ?? []).filter((childId) => children.includes(childId)),
      ...children,
    ])];
    return {
      ...task,
      ...(parentByChild.has(task.id) ? { parentId: parentByChild.get(task.id) } : { parentId: undefined }),
      subtaskIds: orderedChildren,
    };
  });
}

function createsTaskCycle(childId: string, parentId: string, parentByChild: Map<string, string>): boolean {
  const visited = new Set<string>();
  let current: string | undefined = parentId;
  while (current) {
    if (current === childId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    current = parentByChild.get(current);
  }
  return false;
}

function collectTodoTaskTree(tasks: readonly TodoTask[], rootId: string): Set<string> {
  const removed = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    if (removed.has(id)) continue;
    removed.add(id);
    for (const task of tasks) {
      if (task.parentId === id) pending.push(task.id);
    }
  }
  return removed;
}

function normalizeWidget(input: unknown, existing: TodoProgressWidget | undefined, index: number): TodoProgressWidget {
  if (!isRecord(input)) throw new AppError("TODO_WIDGET_INVALID", "进度组件数据无效。");
  const viewType = input.viewType === "date" ? "date" : input.viewType === "project" ? "project" : existing?.viewType ?? "project";
  const projectScope = input.projectScope === "specific" || existing?.projectScope === "specific" ? "specific" : "all";
  const projectId = stringValue(input.projectId, existing?.projectId);
  const datePreset = isTodoDatePreset(input.datePreset) ? input.datePreset : existing?.datePreset;
  if (viewType === "project" && projectScope === "specific" && !projectId) throw new AppError("TODO_WIDGET_PROJECT_REQUIRED", "项目进度组件缺少项目。");
  if (viewType === "date" && !datePreset) throw new AppError("TODO_WIDGET_DATE_REQUIRED", "日期进度组件缺少日期范围。");
  const dateFrom = stringValue(input.dateFrom, existing?.dateFrom);
  const dateTo = stringValue(input.dateTo, existing?.dateTo);
  if (viewType === "date" && datePreset === "custom" && (!dateFrom || !dateTo || Date.parse(dateFrom) > Date.parse(dateTo))) throw new AppError("TODO_WIDGET_DATE_INVALID", "自定义日期范围无效。");
  const now = new Date().toISOString();
  return {
    id: stringValue(input.id, existing?.id) ?? randomUUID(), viewType,
    ...(stringValue(input.title, existing?.title) ? { title: stringValue(input.title, existing?.title) } : {}),
    ...(viewType === "project" ? { projectScope, ...(projectId ? { projectId } : {}) } : { datePreset, ...(dateFrom ? { dateFrom } : {}), ...(dateTo ? { dateTo } : {}) }),
    includeCompleted: typeof input.includeCompleted === "boolean" ? input.includeCompleted : existing?.includeCompleted ?? true,
    showOverdue: typeof input.showOverdue === "boolean" ? input.showOverdue : existing?.showOverdue ?? true,
    orderKey: stringValue(input.orderKey, existing?.orderKey) ?? String(index).padStart(10, "0"),
    createdAt: normalizeDate(input.createdAt) ?? existing?.createdAt ?? now,
    updatedAt: normalizeDate(input.updatedAt) ?? now,
  };
}

function withFile(file: TodoLibraryFile, patch: Partial<TodoLibraryFile>): TodoLibraryFile {
  return { ...file, ...patch, updatedAt: new Date().toISOString() };
}

function omitProject(task: TodoTask): TodoTask {
  const { projectId: _projectId, ...rest } = task;
  return { ...rest, updatedAt: new Date().toISOString() };
}

function persist(file: TodoLibraryFile): Promise<void> {
  logger.info("todo", "persist", { taskCount: file.tasks.length, projectCount: file.projects.length, widgetCount: file.widgets.length });
  return writeLibraryJsonAtomically(getTodosPath(), JSON.stringify(file, null, 2));
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999`) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function normalizeDateKey(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const match = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/u);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeMinutes(value: unknown, fallback?: number): number | undefined {
  const source = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  if (source === undefined) return undefined;
  return Math.min(24 * 60 * 30, Math.max(0, Math.round(source)));
}

function stringValue(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback?.trim() || undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
}

function clampProgress(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function isTodoStatus(value: unknown): value is TodoTask["status"] { return value === "todo" || value === "in-progress" || value === "completed" || value === "cancelled"; }
function isTodoPriority(value: unknown): value is TodoTask["priority"] { return value === "low" || value === "normal" || value === "high" || value === "urgent"; }
function isTodoDatePreset(value: unknown): value is NonNullable<TodoProgressWidget["datePreset"]> { return value === "today" || value === "this-week" || value === "this-month" || value === "custom"; }
function isPromptColorId(value: unknown): value is PromptColorId { return typeof value === "string" && ["sage", "mist", "clay", "lavender", "fog", "rose", "sand", "stone", "blue", "violet", "amber", "emerald", "cyan", "indigo", "orange"].includes(value); }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
