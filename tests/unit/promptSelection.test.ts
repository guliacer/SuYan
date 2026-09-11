import { describe, expect, it } from "vitest";
import { invertVisibleSelection } from "../../src/features/prompts/utils/promptSelection";

describe("prompt selection", () => {
  it("inverts only the current filtered result", () => {
    const selected = new Set(["hidden", "visible-a"]);
    expect([...invertVisibleSelection(selected, ["visible-a", "visible-b"])]).toEqual(["hidden", "visible-b"]);
  });
});
