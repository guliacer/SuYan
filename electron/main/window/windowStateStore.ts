import { BrowserWindow, screen, type Rectangle } from "electron";
import fs from "node:fs/promises";
import { getLibraryDataDir, getWindowStatePath } from "../library/libraryPaths";
import {
  defaultWindowState,
  normalizeWindowStateShape,
  type WindowState,
} from "./windowStateModel";

export async function readWindowState(): Promise<WindowState> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  let content: string;

  try {
    content = await fs.readFile(getWindowStatePath(), "utf8");
  } catch {
    return defaultWindowState;
  }

  try {
    return normalizeWindowState(JSON.parse(content) as unknown);
  } catch {
    return defaultWindowState;
  }
}

export function watchWindowState(window: BrowserWindow): void {
  let saveTimer: NodeJS.Timeout | null = null;

  function scheduleSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      saveTimer = null;
      void writeWindowState(readStateFromWindow(window)).catch(() => undefined);
    }, 400);
  }

  window.on("resize", scheduleSave);
  window.on("move", scheduleSave);
  window.on("maximize", scheduleSave);
  window.on("unmaximize", scheduleSave);
  window.on("close", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    void writeWindowState(readStateFromWindow(window)).catch(() => undefined);
  });
}

async function writeWindowState(state: WindowState): Promise<void> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  const normalized = normalizeWindowState(state);
  const tempPath = `${getWindowStatePath()}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  await fs.rename(tempPath, getWindowStatePath());
}

function readStateFromWindow(window: BrowserWindow): WindowState {
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();

  return normalizeWindowState({
    ...bounds,
    isMaximized: window.isMaximized(),
  });
}

export function normalizeWindowState(input: unknown): WindowState {
  const state = normalizeWindowStateShape(input);

  return isWindowStateVisible(state) ? state : defaultWindowState;
}

function isWindowStateVisible(state: WindowState): boolean {
  if (typeof state.x !== "number" || typeof state.y !== "number") {
    return true;
  }

  const windowBounds: Rectangle = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  };

  return screen.getAllDisplays().some((display) => rectanglesIntersect(display.workArea, windowBounds));
}

function rectanglesIntersect(first: Rectangle, second: Rectangle): boolean {
  const firstRight = first.x + first.width;
  const secondRight = second.x + second.width;
  const firstBottom = first.y + first.height;
  const secondBottom = second.y + second.height;

  return first.x < secondRight && firstRight > second.x && first.y < secondBottom && firstBottom > second.y;
}
