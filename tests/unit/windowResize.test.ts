import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, screen: {} }));
import { resizeWindowBounds } from "../../electron/main/window/windowResize";

describe("visible window edge resize", () => {
  const start = { x: -1200, y: 100, width: 1000, height: 800 };
  it("anchors the opposite corner when resizing the top-left edge", () => {
    expect(resizeWindowBounds(start, "nw", 200, 100, [720, 560])).toEqual({ x: -1000, y: 200, width: 800, height: 700 });
  });
  it("clamps the minimum size without moving the opposite edge", () => {
    expect(resizeWindowBounds(start, "nw", 900, 900, [720, 560])).toEqual({ x: -920, y: 340, width: 720, height: 560 });
  });
  it("only changes the requested axis and supports negative monitor coordinates", () => {
    expect(resizeWindowBounds(start, "e", 120, -400, [720, 560])).toEqual({ ...start, width: 1120 });
    expect(resizeWindowBounds(start, "s", -400, 120, [720, 560])).toEqual({ ...start, height: 920 });
  });
});
