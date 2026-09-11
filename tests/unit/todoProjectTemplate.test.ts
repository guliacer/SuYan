import { describe, expect, it } from "vitest";
import type { TodoProject } from "../../src/features/prompts/types";
import { buildTodoProjectTemplateTasks, parseTodoProjectTemplate, TODO_PROJECT_TEMPLATE_EXAMPLE } from "../../src/features/prompts/todos/utils/todoProjectTemplate";

const project: TodoProject = {
  id: "project-1",
  name: "apRelay 已适配应用目录",
  archived: false,
  orderKey: "0",
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

describe("todo project progress template", () => {
  it("turns the built-in apRelay report into nine completed and eight pending items", () => {
    const result = parseTodoProjectTemplate(TODO_PROJECT_TEMPLATE_EXAMPLE);

    expect(result.projectTitle).toBe("apRelay 已适配应用目录");
    expect(result.completedItems).toHaveLength(9);
    expect(result.pendingItems).toHaveLength(8);
    expect(result.completedItems[0]?.title).toBe("claude：CLI/HTTP 续接适配");
    expect(result.completedItems.at(-1)?.title).toBe("workbuddy：窗口聚焦续接适配");
    expect(result.pendingItems.map((item) => item.title)).toContain("comfyui：继续会话适配");
    expect(result.projectDescription).toContain("AgentResumeRunner");
  });

  it("builds persistent task inputs with completed status and project id", () => {
    const result = parseTodoProjectTemplate(TODO_PROJECT_TEMPLATE_EXAMPLE);
    const taskGroups = buildTodoProjectTemplateTasks(result, project);

    expect(taskGroups.completed).toHaveLength(9);
    expect(taskGroups.completed[0]).toMatchObject({ projectId: "project-1", status: "completed", progress: 100 });
    expect(taskGroups.pending[0]).toMatchObject({ projectId: "project-1", status: "todo", progress: 0 });
  });

  it("falls back to ordinary project headings and task status text", () => {
    const result = parseTodoProjectTemplate(["项目：发布计划", "- [x] 完成构建", "- [ ] 发布验证"].join("\n"));

    expect(result.projectTitle).toBe("发布计划");
    expect(result.completedItems.map((item) => item.title)).toEqual(["完成构建"]);
    expect(result.pendingItems.map((item) => item.title)).toEqual(["发布验证"]);
  });
});
