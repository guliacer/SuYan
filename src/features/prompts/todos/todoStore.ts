import { create } from "zustand";
import type {
  CreateTodoProjectInput,
  CreateTodoTaskInput,
  CreateTodoWidgetInput,
  TodoLibraryFile,
  TodoLibraryReplaceInput,
  TodoProgressWidget,
  TodoProject,
  TodoTask,
  UpdateTodoProjectInput,
  UpdateTodoTaskInput,
  UpdateTodoWidgetInput,
} from "../types";
import { clampTodoCardHeight, clampTodoCardWidth } from "./utils/todoCardSizing";

type TodoState = TodoLibraryFile & {
  isLoading: boolean;
  isSaving: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  error: string | null;
  undoStack: TodoLibraryFile[];
  redoStack: TodoLibraryFile[];
  canUndo: boolean;
  canRedo: boolean;
  load: () => Promise<void>;
  createTask: (input: CreateTodoTaskInput) => Promise<TodoTask | null>;
  updateTask: (id: string, patch: UpdateTodoTaskInput) => Promise<TodoTask | null>;
  deleteTask: (id: string) => Promise<boolean>;
  completeTask: (id: string) => Promise<TodoTask | null>;
  batchUpdateTasks: (ids: string[], patch: UpdateTodoTaskInput) => Promise<boolean>;
  batchDeleteTasks: (ids: string[]) => Promise<boolean>;
  createProject: (input: CreateTodoProjectInput) => Promise<TodoProject | null>;
  updateProject: (id: string, patch: UpdateTodoProjectInput) => Promise<TodoProject | null>;
  deleteProject: (id: string) => Promise<boolean>;
  reorderProjects: (ids: string[]) => Promise<boolean>;
  createWidget: (input: CreateTodoWidgetInput) => Promise<TodoProgressWidget | null>;
  updateWidget: (id: string, patch: UpdateTodoWidgetInput) => Promise<TodoProgressWidget | null>;
  deleteWidget: (id: string) => Promise<boolean>;
  reorderWidgets: (ids: string[]) => Promise<boolean>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clearError: () => void;
  exportLibrary: (taskIds?: string[]) => Promise<void>;
  importLibraries: (libraries: TodoLibraryFile[]) => Promise<boolean>;
};

const emptyFile: TodoLibraryFile = { kind: "suyan-todo-library", schemaVersion: 1, updatedAt: "", tasks: [], projects: [], widgets: [] };
const MAX_HISTORY = 100;
let rendererMutationQueue: Promise<unknown> = Promise.resolve();

export const useTodoStore = create<TodoState>((set, get) => ({
  ...emptyFile,
  isLoading: false,
  isSaving: false,
  saveStatus: "idle",
  error: null,
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  clearError: () => set({ error: null, saveStatus: "idle" }),
  exportLibrary: async (taskIds) => {
    await rendererMutationQueue;
    try {
      const result = await window.suyanApi.exportTodoLibrary(taskIds ? { taskIds } : {});
      if (!result.ok) set({ error: result.error.message });
    } catch { set({ error: "导出待办事项失败，请重试。" }); }
  },
  importLibraries: (libraries) => applyBooleanMutation(set, get, () => window.suyanApi.importTodoLibraries(libraries)),
  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.suyanApi.listTodos();
      if (!result.ok) { set({ error: result.error.message, isLoading: false, saveStatus: "error" }); return; }
      set({ ...normalizeTodoFile(result.data), isLoading: false, saveStatus: "idle", undoStack: [], redoStack: [], canUndo: false, canRedo: false });
    } catch {
      set({ error: "无法读取待办事项数据。", isLoading: false, saveStatus: "error" });
    }
  },
  createTask: (input) => applyMutation(set, get, () => window.suyanApi.createTodoTask(input), "task"),
  updateTask: (id, patch) => applyMutation(set, get, () => window.suyanApi.updateTodoTask(id, patch), "task"),
  deleteTask: (id) => applyBooleanMutation(set, get, () => window.suyanApi.deleteTodoTask(id)),
  completeTask: (id) => applyMutation(set, get, () => window.suyanApi.completeTodoTask(id), "task"),
  batchUpdateTasks: (ids, patch) => applyLibraryMutation(set, get, (file) => {
    const selected = new Set(ids);
    if (selected.size === 0) return null;
    const updatedAt = new Date().toISOString();
    let changed = false;
    const tasks = file.tasks.map((task) => {
      if (!selected.has(task.id)) return task;
      changed = true;
      return { ...task, ...patch, updatedAt };
    });
    return changed ? { ...file, tasks, updatedAt } : null;
  }),
  batchDeleteTasks: (ids) => applyLibraryMutation(set, get, (file) => {
    const selected = new Set(ids);
    if (selected.size === 0) return null;
    const tasks = file.tasks.filter((task) => !selected.has(task.id));
    return tasks.length === file.tasks.length ? null : { ...file, tasks, updatedAt: new Date().toISOString() };
  }),
  createProject: (input) => applyMutation(set, get, () => window.suyanApi.createTodoProject(input), "project"),
  updateProject: (id, patch) => applyMutation(set, get, () => window.suyanApi.updateTodoProject(id, patch), "project"),
  deleteProject: (id) => applyBooleanMutation(set, get, () => window.suyanApi.deleteTodoProject(id)),
  reorderProjects: (ids) => applyBooleanMutation(set, get, () => window.suyanApi.reorderTodoProjects(ids)),
  createWidget: (input) => applyMutation(set, get, () => window.suyanApi.createTodoWidget(input), "widget"),
  updateWidget: (id, patch) => applyMutation(set, get, () => window.suyanApi.updateTodoWidget(id, patch), "widget"),
  deleteWidget: (id) => applyBooleanMutation(set, get, () => window.suyanApi.deleteTodoWidget(id)),
  reorderWidgets: (ids) => applyBooleanMutation(set, get, () => window.suyanApi.reorderTodoWidgets(ids)),
  undo: () => restoreHistory(set, get, "undo"),
  redo: () => restoreHistory(set, get, "redo"),
}));

async function applyMutation<T extends "task" | "project" | "widget">(
  set: (patch: any) => void,
  get: () => TodoState,
  request: () => Promise<any>,
  key: T,
): Promise<T extends "task" ? TodoTask | null : T extends "project" ? TodoProject | null : TodoProgressWidget | null> {
  return enqueueRendererMutation(async () => {
    const previous = cloneTodoFile(get());
    set({ isSaving: true, saveStatus: "saving", error: null });
    try {
      const result = await request();
      if (!result.ok) { set({ error: result.error.message, isSaving: false, saveStatus: "error" }); return null as any; }
      commitMutation(set, get, normalizeTodoFile(result.data.library), previous);
      return result.data[key] as any;
    } catch {
      set({ error: "待办事项操作失败，请重试。", isSaving: false, saveStatus: "error" });
      return null as any;
    }
  });
}

async function applyBooleanMutation(
  set: (patch: any) => void,
  get: () => TodoState,
  request: () => Promise<any>,
): Promise<boolean> {
  return enqueueRendererMutation(async () => {
    const previous = cloneTodoFile(get());
    set({ isSaving: true, saveStatus: "saving", error: null });
    try {
      const result = await request();
      if (!result.ok) { set({ error: result.error.message, isSaving: false, saveStatus: "error" }); return false; }
      commitMutation(set, get, normalizeTodoFile(result.data), previous);
      return true;
    } catch {
      set({ error: "待办事项操作失败，请重试。", isSaving: false, saveStatus: "error" });
      return false;
    }
  });
}

function applyLibraryMutation(
  set: (patch: any) => void,
  get: () => TodoState,
  transform: (file: TodoLibraryFile) => TodoLibraryReplaceInput | null,
): Promise<boolean> {
  return enqueueRendererMutation(async () => {
    const previous = cloneTodoFile(get());
    const candidate = transform(cloneTodoFile(previous));
    if (!candidate) return false;
    set({ isSaving: true, saveStatus: "saving", error: null });
    try {
      const result = await window.suyanApi.replaceTodoLibrary(candidate);
      if (!result.ok) { set({ error: result.error.message, isSaving: false, saveStatus: "error" }); return false; }
      commitMutation(set, get, normalizeTodoFile(result.data), previous);
      return true;
    } catch {
      set({ error: "待办事项操作失败，请重试。", isSaving: false, saveStatus: "error" });
      return false;
    }
  });
}

function restoreHistory(set: (patch: any) => void, get: () => TodoState, direction: "undo" | "redo"): Promise<boolean> {
  return enqueueRendererMutation(async () => {
    const source = direction === "undo" ? get().undoStack : get().redoStack;
    const target = source[source.length - 1];
    if (!target) return false;
    const current = cloneTodoFile(get());
    set({ isSaving: true, saveStatus: "saving", error: null });
    try {
      const result = await window.suyanApi.replaceTodoLibrary(target);
      if (!result.ok) { set({ error: result.error.message, isSaving: false, saveStatus: "error" }); return false; }
      const next = normalizeTodoFile(result.data);
      const undoStack = direction === "undo" ? source.slice(0, -1) : [...get().undoStack, current].slice(-MAX_HISTORY);
      const redoStack = direction === "undo" ? [...get().redoStack, current].slice(-MAX_HISTORY) : source.slice(0, -1);
      set({ ...next, isSaving: false, saveStatus: "saved", error: null, undoStack, redoStack, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
      return true;
    } catch {
      set({ error: "待办事项操作失败，请重试。", isSaving: false, saveStatus: "error" });
      return false;
    }
  });
}

function commitMutation(set: (patch: any) => void, get: () => TodoState, file: TodoLibraryFile, previous: TodoLibraryFile): void {
  const undoStack = [...get().undoStack, previous].slice(-MAX_HISTORY);
  set({ ...file, isSaving: false, saveStatus: "saved", error: null, undoStack, redoStack: [], canUndo: undoStack.length > 0, canRedo: false });
}

function enqueueRendererMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = rendererMutationQueue.then(mutation, mutation);
  rendererMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function cloneTodoFile(file: TodoLibraryFile): TodoLibraryFile {
  return JSON.parse(JSON.stringify({ kind: file.kind, schemaVersion: file.schemaVersion, updatedAt: file.updatedAt, tasks: file.tasks, projects: file.projects, widgets: file.widgets })) as TodoLibraryFile;
}

function normalizeTodoFile(input: unknown): TodoLibraryFile {
  const source = isRecord(input) ? input : {};
  return {
    kind: "suyan-todo-library",
    schemaVersion: 1,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
    tasks: Array.isArray(source.tasks) ? normalizeTaskRelations(source.tasks.filter(isRecord).map((task) => ({
      ...task,
      id: String(task.id),
      title: typeof task.title === "string" ? task.title : "未命名任务",
      status: isTodoStatus(task.status) ? task.status : "todo",
      priority: isTodoPriority(task.priority) ? task.priority : "normal",
      progress: clamp(Number(task.progress)),
      plannedDate: normalizeDateKey(task.plannedDate) ?? normalizeDateKey(task.startAt),
      ...(typeof task.scheduledAt === "string" && Number.isFinite(Date.parse(task.scheduledAt)) ? { scheduledAt: new Date(task.scheduledAt).toISOString() } : {}),
      deadlineAt: normalizeDate(task.deadlineAt) ?? normalizeDate(task.dueAt),
      ...(typeof task.timeEstimateMinutes === "number" && Number.isFinite(task.timeEstimateMinutes) ? { timeEstimateMinutes: clampMinutes(task.timeEstimateMinutes) } : {}),
      ...(typeof task.timeSpentMinutes === "number" && Number.isFinite(task.timeSpentMinutes) ? { timeSpentMinutes: clampMinutes(task.timeSpentMinutes) } : {}),
      parentId: typeof task.parentId === "string" && task.parentId.trim() ? task.parentId.trim() : undefined,
      subtaskIds: stringArray(task.subtaskIds),
      archived: task.archived === true,
      linkedPromptIds: stringArray(task.linkedPromptIds),
      tagIds: stringArray(task.tagIds),
    })) as TodoTask[]) : [],
    projects: Array.isArray(source.projects) ? source.projects.filter(isRecord).map((project) => ({
      ...project,
      id: String(project.id),
      name: typeof project.name === "string" ? project.name : "未命名项目",
      archived: project.archived === true,
      ...(typeof project.cardWidth === "number" && Number.isFinite(project.cardWidth) ? { cardWidth: clampTodoCardWidth(project.cardWidth) } : {}),
      ...(typeof project.cardHeight === "number" && Number.isFinite(project.cardHeight) ? { cardHeight: clampTodoCardHeight(project.cardHeight) } : {}),
    })) as TodoProject[] : [],
    widgets: Array.isArray(source.widgets) ? source.widgets.filter(isRecord).map((widget) => ({ ...widget, id: String(widget.id), viewType: widget.viewType === "date" ? "date" : "project", includeCompleted: widget.includeCompleted !== false, showOverdue: widget.showOverdue !== false, projectScope: widget.projectScope === "specific" ? "specific" : "all" })) as TodoProgressWidget[] : [],
  };
}

function clamp(value: number): number { return Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0)); }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : []; }
function normalizeDateKey(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const match = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/u);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : undefined;
}
function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(value) ? new Date(`${value}T23:59:59.999`) : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
function clampMinutes(value: number): number { return Math.min(24 * 60 * 30, Math.max(0, Math.round(value))); }
function normalizeTaskRelations(tasks: TodoTask[]): TodoTask[] {
  const ids = new Set(tasks.map((task) => task.id));
  const parentByChild = new Map<string, string>();
  for (const task of tasks) if (task.parentId && task.parentId !== task.id && ids.has(task.parentId)) parentByChild.set(task.id, task.parentId);
  const childrenByParent = new Map<string, string[]>();
  for (const [childId, parentId] of parentByChild) childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), childId]);
  return tasks.map((task) => ({
    ...task,
    parentId: parentByChild.get(task.id),
    subtaskIds: [...new Set([...(task.subtaskIds ?? []).filter((id) => childrenByParent.get(task.id)?.includes(id)), ...(childrenByParent.get(task.id) ?? [])])],
  }));
}
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function isTodoStatus(value: unknown): value is TodoTask["status"] { return value === "todo" || value === "in-progress" || value === "completed" || value === "cancelled"; }
function isTodoPriority(value: unknown): value is TodoTask["priority"] { return value === "low" || value === "normal" || value === "high" || value === "urgent"; }
