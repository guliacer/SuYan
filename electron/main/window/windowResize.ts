import { ipcMain, screen, type BrowserWindow, type Rectangle } from "electron";
import { ipcChannels } from "../../shared/ipcChannels";
import { windowResizeEdges, type WindowResizeEdge } from "../../../src/types/windowResize";

export function resizeWindowBounds(start: Rectangle, edge: WindowResizeEdge, dx: number, dy: number, minimum: number[]): Rectangle {
  const width = edge.includes("e") ? Math.max(minimum[0], start.width + dx)
    : edge.includes("w") ? Math.max(minimum[0], start.width - dx) : start.width;
  const height = edge.includes("s") ? Math.max(minimum[1], start.height + dy)
    : edge.includes("n") ? Math.max(minimum[1], start.height - dy) : start.height;
  return { x: start.x + (edge.includes("w") ? start.width - width : 0),
    y: start.y + (edge.includes("n") ? start.height - height : 0), width, height };
}

export function registerWindowResize(window: BrowserWindow): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let update: (() => void) | undefined;
  const stop = () => { clearInterval(timer); timer = undefined; update = undefined; };
  ipcMain.handle(ipcChannels.windowResize, (event, edge: unknown, point: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      return { ok: false, error: { code: "WINDOW_RESIZE_REJECTED", message: "无法调整窗口大小。" } };
    }
    if (edge === null) { update?.(); stop(); return { ok: true, data: {} }; }
    stop();
    if (!windowResizeEdges.includes(edge as WindowResizeEdge) || window.isMaximized() || window.isFullScreen()) {
      return { ok: false, error: { code: "WINDOW_RESIZE_REJECTED", message: "当前窗口不能调整大小。" } };
    }
    const start = window.getBounds();
    const initial = point as { x?: unknown; y?: unknown } | undefined;
    if (!initial || typeof initial.x !== "number" || typeof initial.y !== "number" ||
      !Number.isFinite(initial.x) || !Number.isFinite(initial.y) || initial.x < 0 || initial.y < 0 ||
      initial.x > start.width || initial.y > start.height) {
      return { ok: false, error: { code: "WINDOW_RESIZE_REJECTED", message: "窗口边缘坐标无效。" } };
    }
    const content = window.getContentBounds();
    const cursor = { x: content.x + initial.x, y: content.y + initial.y };
    const minimum = window.getMinimumSize();
    const startedAt = Date.now();
    update = () => {
      if (window.isDestroyed() || window.isMaximized() || Date.now() - startedAt > 30_000) { stop(); return; }
      const point = screen.getCursorScreenPoint();
      const next = resizeWindowBounds(start, edge as WindowResizeEdge, point.x - cursor.x, point.y - cursor.y, minimum);
      const current = window.getBounds();
      if (Object.keys(next).some((key) => next[key as keyof Rectangle] !== current[key as keyof Rectangle])) window.setBounds(next);
    };
    timer = setInterval(update, 16);
    return { ok: true, data: {} };
  });
  window.on("blur", stop);
  window.on("maximize", stop);
  window.on("closed", () => { stop(); ipcMain.removeHandler(ipcChannels.windowResize); });
}
