import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ directory: "", save: vi.fn(), open: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => state.directory, getVersion: () => "0.3.6" }, dialog: { showSaveDialog: state.save, showOpenDialog: state.open } }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { createTodoTask, createTodoProject, updateTodoTask, createTodoWidget, listTodos, importTodoLibraries, resetTodoStoreForTests } from "../../electron/main/library/todoStore";
import { exportTodoLibrary, readTodoExchange, selectTodoExport } from "../../electron/main/library/todoExchange";
import { importTodoFiles } from "../../electron/main/library/todoImport";

beforeEach(async () => { state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-todo-exchange-")); resetTodoStoreForTests(); vi.clearAllMocks(); });
afterEach(async () => { await fs.rm(state.directory, { recursive: true, force: true }); });
async function seed() {
  const { project } = await createTodoProject({ name: "项目", colorId: "sage" });
  const { task: parent } = await createTodoTask({ title: "父事项", projectId: project.id, tagIds: ["设计"] });
  const { task: child } = await createTodoTask({ title: "子事项", projectId: project.id, parentId: parent.id, status: "completed", plannedDate: "2026-09-10", timeSpentMinutes: 30, linkedPromptIds: ["private-prompt"] });
  await updateTodoTask(child.id, { archived: true });
  await createTodoWidget({ viewType: "project", projectScope: "specific", projectId: project.id, includeCompleted: true, showOverdue: true });
  return { parent, child, project, file: await listTodos() };
}
describe("todo export and native import", () => {
  it("writes a named JSON snapshot and imports it without overwriting or mislinking local tasks", async () => {
    const { file, child, parent, project } = await seed();
    const target = path.join(state.directory, "待办.json");
    state.save.mockResolvedValueOnce({ canceled: false, filePath: target });
    const result = await exportTodoLibrary();
    expect(result).toMatchObject({ exportedCount: 2, projectCount: 1 });
    expect(state.save.mock.calls[0][0].defaultPath).toMatch(/^素言-v0\.3\.6-待办事项-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/u);
    const json = JSON.parse(await fs.readFile(target, "utf8"));
    expect(json.tasks).toEqual(file.tasks);
    state.open.mockResolvedValueOnce({ canceled: false, filePaths: [target] });
    const preview = await importTodoFiles();
    expect(preview.candidates).toEqual([]);
    expect(preview.libraries).toHaveLength(1);
    const merged = await importTodoLibraries(preview.libraries!);
    expect(merged.tasks.slice(0, 2)).toEqual(file.tasks);
    const importedParent = merged.tasks.find(task => task.title === parent.title && task.id !== parent.id)!;
    const importedChild = merged.tasks.find(task => task.title === child.title && task.id !== child.id)!;
    expect(importedChild).toMatchObject({ parentId: importedParent.id, plannedDate: "2026-09-10", archived: true, status: "completed", timeSpentMinutes: 30, linkedPromptIds: [] });
    expect(importedChild.projectId).not.toBe(project.id);
    expect(importedParent.subtaskIds).toEqual([importedChild.id]);
    expect(merged.widgets[1].projectId).toBe(importedChild.projectId);
    resetTodoStoreForTests();
    expect((await listTodos()).tasks).toEqual(merged.tasks);
  });
  it("limits selection to requested tasks and relevant projects without dangling parent links", async () => {
    const { file, child, project } = await seed();
    const selected = selectTodoExport(file, [child.id]);
    expect(selected.tasks).toHaveLength(1);
    expect(selected.tasks[0].parentId).toBeUndefined();
    expect(selected.projects.map(project => project.id)).toEqual([project.id]);
    expect(selected.widgets).toEqual([]);
    expect(() => selectTodoExport(file, [])).toThrow();
    expect(() => selectTodoExport(file, ["deleted"])).toThrow();
  });
  it("does not hold the mutation queue while choosing the export destination", async () => {
    await seed();
    let finish!: (value: unknown) => void;
    state.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const exporting = exportTodoLibrary();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await createTodoTask({ title: "导出期间新增" });
    finish({ canceled: true });
    expect(await exporting).toMatchObject({ canceled: true });
    expect((await listTodos()).tasks).toHaveLength(3);
  });
  it("rejects duplicate IDs and unknown versions without partially importing a batch", async () => {
    const { file } = await seed();
    expect(() => readTodoExchange({ ...file, schemaVersion: 99 })).toThrow();
    expect(() => readTodoExchange({ ...file, tasks: [file.tasks[0], file.tasks[0]] })).toThrow();
    await expect(importTodoLibraries([file, { ...file, schemaVersion: 99 } as never])).rejects.toThrow();
    expect((await listTodos()).tasks).toEqual(file.tasks);
  });
});
