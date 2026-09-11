import { describe, expect, it } from "vitest";
import { parseTodoImportText } from "../../src/features/prompts/todos/utils/todoImportParser";

describe("todo import parser", () => {
  it("recognizes development, optimization and daily report lines with progress", () => {
    const result = parseTodoImportText([
      "开发：完成待办导入接口 60%",
      "优化 - 图片导入性能，进行中",
      "日报：完成文档解析测试 100%",
    ].join("\n"));

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0]).toMatchObject({ title: "开发：完成待办导入接口", progress: 60, status: "in-progress" });
    expect(result.candidates[1]).toMatchObject({ title: "优化 - 图片导入性能", progress: 0, status: "in-progress" });
    expect(result.candidates[2]).toMatchObject({ title: "日报：完成文档解析测试", progress: 100, status: "completed" });
  });

  it("maps markdown checkboxes, fractions, dates and priorities", () => {
    const result = parseTodoImportText([
      "- [x] 发布便携包 截止：2026-08-30",
      "- [ ] 优化导入性能 进度：2/5 优先级：高",
    ].join("\n"), { format: "md", sourceLabel: "日报.md" });

    expect(result.candidates[0]).toMatchObject({ status: "completed", progress: 100, dueAt: "2026-08-30" });
    expect(result.candidates[1]).toMatchObject({ status: "in-progress", progress: 40, priority: "high" });
  });

  it("reads structured JSON and table columns", () => {
    const json = parseTodoImportText(JSON.stringify({ tasks: [{ title: "修复导入错配", progress: "80%", state: "进行中", project: "灵感库" }] }));
    expect(json.candidates[0]).toMatchObject({ title: "修复导入错配", progress: 80, status: "in-progress", projectName: "灵感库" });

    const csv = parseTodoImportText([
      "事项,进度,状态,项目,截止日期",
      "完成日报导入,100%,已完成,待办,2026/08/28",
      "补充预览,25%,进行中,待办,",
    ].join("\n"), { format: "csv" });
    expect(csv.candidates).toHaveLength(2);
    expect(csv.candidates[0]).toMatchObject({ title: "完成日报导入", progress: 100, status: "completed", projectName: "待办", dueAt: "2026-08-28" });
    expect(csv.candidates[1]).toMatchObject({ progress: 25, status: "in-progress" });
  });

  it("carries a project heading to following text tasks", () => {
    const result = parseTodoImportText(["项目：待办模块", "- 开发导入预览 40%", "- 修复导入重复问题 100%"].join("\n"));
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((candidate) => candidate.projectName === "待办模块")).toBe(true);
  });

  it("reports invalid JSON and empty content instead of creating silent tasks", () => {
    expect(parseTodoImportText("", { format: "txt" }).candidates).toHaveLength(0);
    expect(parseTodoImportText("{bad json", { format: "json" }).warnings[0]).toContain("JSON 格式无效");
  });
});
