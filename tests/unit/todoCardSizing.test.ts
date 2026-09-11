import { describe, expect, it } from "vitest";
import {
  clampTodoCardHeight,
  clampTodoCardWidth,
  getTodoProjectCardGridClassName,
  TODO_CARD_DEFAULT_HEIGHT,
} from "../../src/features/prompts/todos/utils/todoCardSizing";

describe("todo project card sizing", () => {
  it("uses a five-item default height and clamps saved dimensions", () => {
    expect(TODO_CARD_DEFAULT_HEIGHT).toBeGreaterThanOrEqual(640);
    expect(clampTodoCardWidth(100)).toBe(260);
    expect(clampTodoCardWidth(9999)).toBe(760);
    expect(clampTodoCardHeight(100)).toBe(300);
    expect(clampTodoCardHeight(9999)).toBe(900);
  });

  it("keeps one project full width and caps large layouts at three columns", () => {
    expect(getTodoProjectCardGridClassName(1)).toBe("grid grid-cols-1 justify-items-center gap-4");
    expect(getTodoProjectCardGridClassName(2)).toContain("min-[760px]:grid-cols-2");
    expect(getTodoProjectCardGridClassName(2)).not.toContain("grid-cols-3");
    expect(getTodoProjectCardGridClassName(4)).toContain("min-[1180px]:grid-cols-3");
  });
});
