import { describe, expect, it } from "vitest";
import {
  defaultWindowState,
  normalizeWindowStateShape,
} from "../../electron/main/window/windowStateModel";

describe("windowStateModel", () => {
  it("normalizes stored window size and position", () => {
    expect(
      normalizeWindowStateShape({
        width: 900.2,
        height: 500.8,
        x: 120.4,
        y: 80.6,
        isMaximized: true,
      }),
    ).toEqual({
      width: 1040,
      height: 680,
      x: 120,
      y: 81,
      isMaximized: true,
    });
  });

  it("falls back to the default state for invalid input", () => {
    expect(normalizeWindowStateShape(null)).toEqual(defaultWindowState);
    expect(normalizeWindowStateShape({ width: "large", height: Number.NaN })).toEqual(defaultWindowState);
  });
});
