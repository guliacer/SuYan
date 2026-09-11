import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("todo integration contract", () => {
  it("keeps todo data and IPC separate from prompts.json", () => {
    const store = read("electron/main/library/todoStore.ts");
    const channels = read("electron/shared/ipcChannels.ts");
    const preload = read("electron/preload/index.ts");
    expect(store).toContain("getTodosPath");
    expect(store).toContain("writeLibraryJsonAtomically");
    expect(store).toContain("unlinkTodoPromptIds");
    expect(channels).toContain('TodoTaskCreate = "todo:task-create"');
    expect(preload).toContain("createTodoTask");
    expect(channels).toContain('TodoLibraryReplace = "todo:library-replace"');
    expect(preload).toContain("replaceTodoLibrary");
    expect(channels).toContain('TodoImportFiles = "todo:import-files"');
    expect(preload).toContain("importTodoFiles");
  });

  it("exposes a unified todo workspace from the main sidebar", () => {
    const libraryView = read("src/features/library/components/LibraryView.tsx");
    const promptLibrary = read("src/features/prompts/components/PromptLibrary.tsx");
    const workspace = read("src/features/prompts/todos/components/TodoWorkspace.tsx");
    expect(libraryView).toContain('"todo"');
    expect(libraryView).toContain('label={t("待办事项")}');
    expect(libraryView).toContain("onOpenTodo");
    expect(libraryView).toContain("<TodoWorkspace />");
    expect(promptLibrary).toContain("onAddToTodo");
    expect(promptLibrary).not.toContain("<TodoToolbarEntry");
    expect(workspace).toContain('aria-label={t("待办事项工作区")}');
    expect(workspace).toContain('section === "progress"');
    expect(workspace).toContain('section === "archive"');
    expect(workspace).toContain("TodoProgressSidebar");
    expect(read("src/features/prompts/todos/components/TodoProgressSidebar.tsx")).toContain("ProjectOverviewCard");
    expect(read("src/features/prompts/todos/components/TodoArchiveDialog.tsx")).toContain('t("已归档事项不会出现在待办列表和进度视图中。")');
  });
});
