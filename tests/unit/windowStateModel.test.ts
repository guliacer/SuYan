import { describe, expect, it } from "vitest";
import {
  defaultWindowState,
  normalizeWindowStateShape,
} from "../../electron/main/window/windowStateModel";
import {
  APP_TITLE_BAR_HEIGHT,
  constrainWindowContentBounds,
} from "../../electron/main/window/windowContentBounds";

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
      width: 900,
      height: 560,
      x: 120,
      y: 81,
      isMaximized: true,
    });
  });

  it("falls back to the default state for invalid input", () => {
    expect(normalizeWindowStateShape(null)).toEqual(defaultWindowState);
    expect(normalizeWindowStateShape({ width: "large", height: Number.NaN })).toEqual(defaultWindowState);
  });

  it("keeps native web views below the custom title bar and inside the window", () => {
    expect(
      constrainWindowContentBounds(
        { width: 900, height: 560 },
        { x: -20, y: 0, width: 1_000, height: 900 },
      ),
    ).toEqual({
      x: 0,
      y: APP_TITLE_BAR_HEIGHT,
      width: 900,
      height: 516,
    });
  });
});
