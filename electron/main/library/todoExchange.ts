import { app } from "electron";
import { randomUUID } from "node:crypto";
import type { TodoExportOptions, TodoExportResult, TodoLibraryFile } from "../../../src/features/prompts/types";
import { dialog } from "../app/fileDialogs";
import { formatExportFileName } from "../app/exportFileName";
import { reportExportProgress } from "../app/exportTask";
import { AppError } from "../ipc/errors";
import { enqueueTodoMutation, listTodos, normalizeTodoLibraryFile } from "./todoStore";
import { writeTextFileAtomically } from "./libraryJsonPersistence";

export function readTodoExchange(input: unknown): TodoLibraryFile {
  const value = input as TodoLibraryFile & { exportVersion?: number };
  if (!value || value.kind !== "suyan-todo-library" || value.schemaVersion !== 1 ||
    (value.exportVersion !== undefined && value.exportVersion !== 1) ||
    !Array.isArray(value.tasks) || !Array.isArray(value.projects) || !Array.isArray(value.widgets)) {
    throw new AppError("TODO_EXCHANGE_INVALID", "待办文件格式或版本不受支持。");
  }
  for (const entries of [value.tasks, value.projects, value.widgets]) {
    const ids = entries.map(entry => entry?.id);
    if (ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
      throw new AppError("TODO_EXCHANGE_INVALID", "待办文件包含缺失或重复的标识，请重新导出。");
    }
  }
  const normalized = normalizeTodoLibraryFile(value);
  if (normalized.tasks.length !== value.tasks.length || normalized.projects.length !== value.projects.length || normalized.widgets.length !== value.widgets.length) {
    throw new AppError("TODO_EXCHANGE_INVALID", "待办文件包含无效记录，无法完整导入。");
  }
  return normalized;
}

export function selectTodoExport(file: TodoLibraryFile, taskIds?: string[]): TodoLibraryFile {
  if (taskIds === undefined) return structuredClone(file);
  if (!Array.isArray(taskIds) || !taskIds.length || taskIds.length > 100000 || taskIds.some(id => typeof id !== "string" || !id)) {
    throw new AppError("TODO_EXPORT_SELECTION_INVALID", "请先选择需要导出的待办事项。");
  }
  const selected = new Set(taskIds);
  const tasks = file.tasks.filter(task => selected.has(task.id));
  if (tasks.length !== selected.size) throw new AppError("TODO_EXPORT_SELECTION_CHANGED", "部分所选事项已不存在，请重新选择后导出。");
  const projectIds = new Set(tasks.map(task => task.projectId));
  return normalizeTodoLibraryFile({ ...file, tasks, projects: file.projects.filter(project => projectIds.has(project.id)), widgets: [] });
}

export async function exportTodoLibrary(options: TodoExportOptions = {}): Promise<TodoExportResult> {
  if (!options || typeof options !== "object") throw new AppError("TODO_EXPORT_SELECTION_INVALID", "导出选项无效。");
  // Snapshot under the mutation queue; release it before choosing a location or writing.
  const file = await enqueueTodoMutation(async () => selectTodoExport(await listTodos(), options.taskIds));
  const result = await dialog.showSaveDialog({ title: "导出待办事项", defaultPath: formatExportFileName("待办事项", "json"), filters: [{ name: "素言待办文件", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { canceled: true, filePath: null, exportedCount: 0, projectCount: 0 };
  reportExportProgress(`正在保存 ${file.tasks.length} 项待办与 ${file.projects.length} 个项目…`);
  await writeTextFileAtomically(result.filePath, JSON.stringify({ ...file, exportVersion: 1, softwareVersion: app.getVersion(), exportedAt: new Date().toISOString() }, null, 2));
  return { canceled: false, filePath: result.filePath, exportedCount: file.tasks.length, projectCount: file.projects.length };
}

/** Import as independent copies. Never overwrite local tasks or bind to someone else's prompt IDs. */
export function mergeTodoExchange(current: TodoLibraryFile, imported: TodoLibraryFile): TodoLibraryFile {
  const file = readTodoExchange(imported);
  const taskIds = new Map(file.tasks.map(task => [task.id, randomUUID()]));
  const projectIds = new Map(file.projects.map(project => [project.id, randomUUID()]));
  const projects = file.projects.map((project, index) => ({ ...project, id: projectIds.get(project.id)!, orderKey: String(current.projects.length + index).padStart(10, "0") }));
  const tasks = file.tasks.map((task, index) => ({ ...task, id: taskIds.get(task.id)!,
    projectId: task.projectId ? projectIds.get(task.projectId) : undefined,
    parentId: task.parentId ? taskIds.get(task.parentId) : undefined,
    subtaskIds: (task.subtaskIds ?? []).flatMap(id => taskIds.has(id) ? [taskIds.get(id)!] : []),
    linkedPromptIds: [], orderKey: String(current.tasks.length + index).padStart(10, "0"),
  }));
  const widgets = file.widgets.map((widget, index) => ({ ...widget, id: randomUUID(),
    projectScope: widget.projectScope === "specific" && !projectIds.has(widget.projectId ?? "") ? "all" as const : widget.projectScope,
    projectId: widget.projectId ? projectIds.get(widget.projectId) : undefined,
    orderKey: String(current.widgets.length + index).padStart(10, "0"),
  }));
  return normalizeTodoLibraryFile({ ...current, tasks: [...current.tasks, ...tasks], projects: [...current.projects, ...projects], widgets: [...current.widgets, ...widgets] });
}
