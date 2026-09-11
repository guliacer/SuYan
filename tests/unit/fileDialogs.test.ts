import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ directory: "", open: vi.fn(), save: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => state.directory }, dialog: {
  showOpenDialog: state.open, showSaveDialog: state.save,
} }));
import { dialog } from "../../electron/main/app/fileDialogs";

beforeEach(async () => {
  state.directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-dialog-test-"));
  vi.clearAllMocks();
  state.open.mockResolvedValue({ canceled: true, filePaths: [] });
  state.save.mockResolvedValue({ canceled: true });
});
afterEach(async () => { await fs.rm(state.directory, { recursive: true, force: true }); });

describe("file chooser directory memory", () => {
  it("persists separate import/export folders and restores them after reloading the module", async () => {
    const source = path.join(state.directory, "导入");
    const target = path.join(state.directory, "导出");
    await fs.mkdir(source); await fs.mkdir(target);
    state.open.mockResolvedValueOnce({ canceled: false, filePaths: [path.join(source, "作品.zip")] });
    state.save.mockResolvedValueOnce({ canceled: false, filePath: path.join(target, "旧文件.zip") });
    await dialog.showOpenDialog({ properties: ["openFile"] });
    await dialog.showSaveDialog({ defaultPath: "旧文件.zip" });
    expect(JSON.parse(await fs.readFile(path.join(state.directory, "library/file-dialog-settings.json"), "utf8")))
      .toEqual({ import: source, export: target });
    vi.resetModules();
    const reloaded = (await import("../../electron/main/app/fileDialogs")).dialog;
    await reloaded.showOpenDialog({ title: "导入 AI 设置" });
    await reloaded.showSaveDialog({ defaultPath: "素言-v0.3.6-提示词-2026-09-10-15-10-30.zip" });
    expect(state.open.mock.calls.at(-1)?.[0].defaultPath).toBe(source);
    expect(state.save.mock.calls.at(-1)?.[0].defaultPath).toBe(path.join(target, "素言-v0.3.6-提示词-2026-09-10-15-10-30.zip"));
  });

  it("remembers a chosen folder itself, and cancellation never changes it", async () => {
    state.open.mockResolvedValueOnce({ canceled: false, filePaths: [state.directory] });
    await dialog.showOpenDialog({ properties: ["openDirectory"] });
    state.open.mockResolvedValueOnce({ canceled: true, filePaths: [path.dirname(state.directory)] });
    await dialog.showOpenDialog({ properties: ["openDirectory"] });
    await dialog.showOpenDialog({});
    expect(state.open.mock.calls.at(-1)?.[0].defaultPath).toBe(state.directory);
  });

  it("falls back safely when the stored directory no longer exists or JSON is corrupt", async () => {
    const prefs = path.join(state.directory, "library/file-dialog-settings.json");
    await fs.mkdir(path.dirname(prefs));
    await fs.writeFile(prefs, JSON.stringify({ export: path.join(state.directory, "missing") }));
    await dialog.showSaveDialog({ defaultPath: "默认.zip" });
    expect(state.save.mock.calls.at(-1)?.[0].defaultPath).toBe("默认.zip");
    await fs.writeFile(prefs, "{");
    await dialog.showOpenDialog({ defaultPath: state.directory });
    expect(state.open.mock.calls.at(-1)?.[0].defaultPath).toBe(state.directory);
  });

  it("serializes simultaneous preference writes without losing either direction", async () => {
    state.open.mockResolvedValueOnce({ canceled: false, filePaths: [path.join(state.directory, "a.png")] });
    state.save.mockResolvedValueOnce({ canceled: false, filePath: path.join(state.directory, "b.zip") });
    await Promise.all([dialog.showOpenDialog({}), dialog.showSaveDialog({})]);
    const prefs = JSON.parse(await fs.readFile(path.join(state.directory, "library/file-dialog-settings.json"), "utf8"));
    expect(prefs).toEqual({ import: state.directory, export: state.directory });
  });
});
