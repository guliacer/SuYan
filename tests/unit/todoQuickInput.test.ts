import { describe, expect, it } from "vitest";
import { parseTodoQuickInput, splitTodoQuickInput } from "../../src/features/prompts/todos/utils/todoQuickInput";

describe("todo quick input", () => {
  it("supports plan, deadline and estimate syntax", () => {
    const result = parseTodoQuickInput("整理发布说明 @tomorrow !2026-09-04 [t] 1.5h", new Date("2026-09-01T10:00:00"));
    expect(result.title).toBe("整理发布说明");
    expect(result.plannedDate).toBe("2026-09-02");
    expect(result.deadlineAt).toBe("2026-09-04T15:59:59.999Z");
    expect(result.timeEstimateMinutes).toBe(90);
  });

  it("keeps multiline quick input behavior", () => {
    expect(splitTodoQuickInput("- 第一项\n2. 第二项\n\n第三项")).toEqual(["第一项", "第二项", "第三项"]);
  });
});
