import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.dataDir } }));

describe("todo store", () => {
  beforeAll(async () => { state.dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-todos-")); });
  afterAll(async () => { await fs.rm(state.dataDir, { recursive: true, force: true }); });

  it("persists task completion rules and project cleanup", async () => {
    const store = await import("../../electron/main/library/todoStore");
    store.resetTodoStoreForTests();
    const projectResult = await store.createTodoProject({ name: "项目 A" });
    const project = projectResult.project;
    const sizedProject = await store.updateTodoProject(project.id, { cardWidth: 9999, cardHeight: 100 });
    expect(sizedProject.project.cardWidth).toBe(760);
    expect(sizedProject.project.cardHeight).toBe(300);
    const renamedProject = await store.updateTodoProject(project.id, { name: "项目 A（保留尺寸）" });
    expect(renamedProject.project.cardWidth).toBe(760);
    expect(renamedProject.project.cardHeight).toBe(300);
    const created = await store.createTodoTask({ title: "整理文档", projectId: project.id, progress: 140 });
    expect(created.task.progress).toBe(100);
    expect(created.task.status).toBe("todo");

    const completed = await store.completeTodoTask(created.task.id);
    expect(completed.task.status).toBe("completed");
    expect(completed.task.progress).toBe(100);
    expect(completed.task.completedAt).toBeTruthy();
    const restored = await store.updateTodoTask(created.task.id, { status: "in-progress", progress: 20 });
    expect(restored.task.status).toBe("in-progress");
    expect(restored.task.progress).toBe(20);
    expect(restored.task.completedAt).toBeUndefined();

    const archived = await store.updateTodoTask(created.task.id, { archived: true });
    expect(archived.task.archived).toBe(true);
    const unarchived = await store.updateTodoTask(created.task.id, { archived: false });
    expect(unarchived.task.archived).toBeUndefined();

    const widget = await store.createTodoWidget({ viewType: "project", projectScope: "specific", projectId: project.id, includeCompleted: true, showOverdue: true });
    const afterProjectDelete = await store.deleteTodoProject(project.id);
    expect(afterProjectDelete.tasks[0]?.projectId).toBeUndefined();
    expect(afterProjectDelete.widgets.some((item) => item.id === widget.widget.id)).toBe(true);
    const disk = JSON.parse(await fs.readFile(path.join(state.dataDir, "library", "todos.json"), "utf8")) as { kind: string };
    expect(disk.kind).toBe("suyan-todo-library");
  });

  it("rejects invalid widget ranges and empty task titles", async () => {
    const store = await import("../../electron/main/library/todoStore");
    await expect(store.createTodoTask({ title: "   " })).rejects.toThrow("任务标题不能为空");
    await expect(store.createTodoWidget({ viewType: "date", datePreset: "custom", dateFrom: "2026-08-20", dateTo: "2026-08-01", includeCompleted: true, showOverdue: true })).rejects.toThrow("自定义日期范围无效");
  });

  it("keeps parent-child links consistent and cascades parent deletion", async () => {
    const store = await import("../../electron/main/library/todoStore");
    store.resetTodoStoreForTests();
    const parent = await store.createTodoTask({ title: "父事项" });
    const child = await store.createTodoTask({ title: "子事项", parentId: parent.task.id, plannedDate: "2026-09-02", timeEstimateMinutes: 45 });
    expect(child.task.parentId).toBe(parent.task.id);
    const listed = await store.listTodos();
    expect(listed.tasks.find((task) => task.id === parent.task.id)?.subtaskIds).toContain(child.task.id);
    const afterDelete = await store.deleteTodoTask(parent.task.id);
    expect(afterDelete.tasks.some((task) => task.id === child.task.id)).toBe(false);
  });

  it("drops invalid self and circular parent references during normalization", async () => {
    const { normalizeTodoLibraryFile } = await import("../../electron/main/library/todoStore");
    const normalized = normalizeTodoLibraryFile({
      kind: "suyan-todo-library", schemaVersion: 1, updatedAt: "",
      tasks: [
        { id: "a", title: "A", parentId: "b", status: "todo", priority: "normal", progress: 0, linkedPromptIds: [], tagIds: [], orderKey: "0", createdAt: "", updatedAt: "" },
        { id: "b", title: "B", parentId: "a", status: "todo", priority: "normal", progress: 0, linkedPromptIds: [], tagIds: [], orderKey: "1", createdAt: "", updatedAt: "" },
        { id: "self", title: "Self", parentId: "self", status: "todo", priority: "normal", progress: 0, linkedPromptIds: [], tagIds: [], orderKey: "2", createdAt: "", updatedAt: "" },
      ], projects: [], widgets: [],
    });
    expect(normalized.tasks.find((task) => task.id === "a")?.parentId).toBe("b");
    expect(normalized.tasks.find((task) => task.id === "b")?.parentId).toBeUndefined();
    expect(normalized.tasks.find((task) => task.id === "self")?.parentId).toBeUndefined();
  });

  it("restores a valid backup when the primary todo file is corrupted", async () => {
    const store = await import("../../electron/main/library/todoStore");
    const todoPath = path.join(state.dataDir, "library", "todos.json");
    const backup = {
      kind: "suyan-todo-library",
      schemaVersion: 1,
      updatedAt: "2026-08-26T00:00:00.000Z",
      tasks: [{ id: "backup-task", title: "备份事项", status: "todo", priority: "normal", progress: 0, linkedPromptIds: [], tagIds: [], orderKey: "0000000000", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" }],
      projects: [],
      widgets: [],
    };
    await fs.writeFile(todoPath, "{ invalid", "utf8");
    await fs.writeFile(`${todoPath}.bak`, JSON.stringify(backup), "utf8");
    store.resetTodoStoreForTests();

    const restored = await store.listTodos();
    expect(restored.tasks[0]?.id).toBe("backup-task");
    expect(JSON.parse(await fs.readFile(todoPath, "utf8"))).toMatchObject({ tasks: [{ id: "backup-task" }] });
    const corruptCopies = (await fs.readdir(path.dirname(todoPath))).filter((name) => name.startsWith("todos.json.corrupt."));
    expect(corruptCopies.length).toBeGreaterThan(0);
  });
});
