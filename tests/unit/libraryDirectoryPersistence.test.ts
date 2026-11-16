import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeLibraryViewSettings, readLibraryViewSettings, writeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";
import { useLibraryStore } from "../../src/features/library/store/useLibraryStore";
import { createDefaultLibraryDirectorySettings } from "../../src/features/library/utils/libraryDirectory";
import type { IpcResult } from "../../src/types/suyanApi";
import type { LibraryViewSettings } from "../../src/features/library/types/library";
const runtime = vi.hoisted(() => ({ data: "" }));
vi.mock("electron", () => ({ app: { getPath: () => runtime.data } }));
vi.mock("../../src/features/library/utils/themeMode", async importOriginal => ({ ...await importOriginal<typeof import("../../src/features/library/utils/themeMode")>(), applyThemeModeToRoot: vi.fn() }));
const initial = useLibraryStore.getState();
const temporaryDirectories: string[] = [];
afterEach(async () => {
  useLibraryStore.setState(initial, true); vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    const target = path.resolve(directory); if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(target).startsWith("suyan-directory-settings-")) throw new Error("Invalid test cleanup path");
    await fs.rm(target, { recursive: true, force: true });
  }
});
function setup() {
  const calls: LibraryViewSettings[] = []; const releases: Array<(ok: boolean) => void> = [];
  vi.stubGlobal("window", { suyanApi: { logStartupEvent: vi.fn(), saveLibraryViewSettings: (settings: LibraryViewSettings) => {
    calls.push(settings); return new Promise<IpcResult<LibraryViewSettings>>(resolve => releases.push(ok => resolve(ok ? { ok: true, data: settings } : { ok: false, error: { code: "VIEW_SETTINGS_SAVE_FAILED", message: "保存失败" } })));
  } } });
  vi.stubGlobal("document", { documentElement: {} });
  return { calls, releases };
}
describe("directory settings persistence", () => {
  it("gives old view-settings files backward-compatible directory defaults", () => {
    expect(normalizeLibraryViewSettings({ themeMode: "dark" }).libraryDirectorySettings).toEqual(createDefaultLibraryDirectorySettings());
    expect(normalizeLibraryViewSettings({ themeMode: "dark" }).imageViewTransforms).toEqual({});
  });
  it("normalizes malformed directory settings before they are persisted", () => {
    const settings = normalizeLibraryViewSettings({ libraryDirectorySettings: {
      nodes: [{ id: "invalid", name: "", rootId: "root", relativePath: "", kind: "unknown", order: 0 }],
      itemFolderIds: { valid: "folder-a", invalid: 12 },
      galleryMode: "columns",
      mediaFilter: "audio",
      sortMode: "newest",
      sortDirection: "up",
      tileSize: 999,
      formatFilter: ".WEBP",
      expandedNodeIds: ["folder-a", "", null, "folder-a"],
    } }).libraryDirectorySettings;

    expect(settings).toMatchObject({
      nodes: [],
      itemFolderIds: { valid: "folder-a" },
      galleryMode: "masonry",
      mediaFilter: "all",
      sortMode: "updatedAt",
      sortDirection: "desc",
      tileSize: 360,
      formatFilter: "webp",
      expandedNodeIds: ["folder-a"],
    });
    expect(normalizeLibraryViewSettings({ libraryDirectorySettings: "corrupt" }).libraryDirectorySettings).toEqual(createDefaultLibraryDirectorySettings());
  });
  it("roundtrips folder hierarchy, assignments, layouts, filters and collapsed trees through JSON", async () => {
    runtime.data = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-directory-settings-")); temporaryDirectories.push(runtime.data);
    const settings = normalizeLibraryViewSettings({ libraryDirectorySettings: { nodes: [{ id: "v", name: "精选", kind: "virtual", rootId: "__library__", relativePath: "", parentId: null, order: 0 }], itemFolderIds: { one: "v" }, selectedNodeId: "v", galleryMode: "list", tileSize: 310, mediaFilter: "image", sortMode: "name", sortDirection: "asc", favoriteOnly: true, formatFilter: "webp", tagFilter: "长裙", availabilityFilter: "available", searchQuery: "晨光", showInfo: false, expandedNodeIds: [] } });
    await writeLibraryViewSettings(settings); const loaded = await readLibraryViewSettings();
    expect(loaded.libraryDirectorySettings).toEqual(settings.libraryDirectorySettings);
    const disk = JSON.parse(await fs.readFile(path.join(runtime.data, "library", "view-settings.json"), { encoding: "utf8" }));
    expect(disk.libraryDirectorySettings).toEqual(settings.libraryDirectorySettings);
  });
  it("roundtrips committed per-image view transforms through view-settings JSON", async () => {
    runtime.data = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-directory-settings-")); temporaryDirectories.push(runtime.data);
    const settings = normalizeLibraryViewSettings({ imageViewTransforms: {
      alpha: { rotation: 90, flipHorizontal: true, flipVertical: true },
      beta: { rotation: 270, flipHorizontal: false, flipVertical: false },
      legacy: { rotation: 180, flipHorizontal: false },
      verticalOnly: { rotation: 0, flipHorizontal: false, flipVertical: true },
      invalidRotation: { rotation: 45, flipHorizontal: true, flipVertical: false },
      invalidVertical: { rotation: 0, flipHorizontal: false, flipVertical: "yes" },
    } });
    expect(settings.imageViewTransforms).toEqual({
      alpha: { rotation: 90, flipHorizontal: true, flipVertical: true },
      beta: { rotation: 270, flipHorizontal: false, flipVertical: false },
      legacy: { rotation: 180, flipHorizontal: false, flipVertical: false },
      verticalOnly: { rotation: 0, flipHorizontal: false, flipVertical: true },
    });
    await writeLibraryViewSettings(settings);
    const loaded = await readLibraryViewSettings();
    expect(loaded.imageViewTransforms).toEqual(settings.imageViewTransforms);
  });
  it("saves a committed transform for one image without applying it to prompt-group siblings", async () => {
    const mock = setup();
    const saveTransform = Reflect.get(useLibraryStore.getState(), "saveImageViewTransform");
    expect(saveTransform).toBeTypeOf("function");
    if (typeof saveTransform !== "function") return;
    const pending = saveTransform("alpha", { rotation: 90, flipHorizontal: true, flipVertical: true });
    await vi.waitFor(() => expect(mock.calls.length).toBe(1));
    expect(mock.calls[0].imageViewTransforms.alpha).toEqual({ rotation: 90, flipHorizontal: true, flipVertical: true });
    mock.releases[0](true);
    await expect(pending).resolves.toBe(true);
    expect(useLibraryStore.getState().imageViewTransforms.alpha).toEqual({ rotation: 90, flipHorizontal: true, flipVertical: true });
  });
  it("retries Windows replacement failures and keeps a recoverable settings snapshot", async () => {
    runtime.data = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-directory-settings-")); temporaryDirectories.push(runtime.data);
    const previous = normalizeLibraryViewSettings({ libraryDirectorySettings: { tileSize: 220 } });
    await writeLibraryViewSettings(previous);
    const target = path.join(runtime.data, "library", "view-settings.json");
    const originalRename = fs.rename.bind(fs);
    let blocked = false;
    const rename = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to) === target && !blocked) { blocked = true; throw Object.assign(new Error("transient Windows lock"), { code: "EPERM" }); }
      return originalRename(from, to);
    });
    try {
      const next = normalizeLibraryViewSettings({ ...previous, libraryDirectorySettings: { ...previous.libraryDirectorySettings, tileSize: 320 } });
      await writeLibraryViewSettings(next);
      expect(blocked).toBe(true);
      expect(JSON.parse(await fs.readFile(target, "utf8")).libraryDirectorySettings.tileSize).toBe(320);
      expect(JSON.parse(await fs.readFile(target + ".bak", "utf8")).libraryDirectorySettings.tileSize).toBe(220);
    } finally { rename.mockRestore(); }
  });
  it("does not flash back to an earlier directory state while a newer save is pending", async () => {
    const mock = setup(); const a = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 180 });
    await vi.waitFor(() => expect(mock.calls.length).toBe(1));
    const b = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 300 });
    mock.releases[0](true); await a; await vi.waitFor(() => expect(mock.calls.length).toBe(2));
    const interim = useLibraryStore.getState().libraryDirectorySettings.tileSize;
    mock.releases[1](true); await b;
    expect(interim).toBe(300); expect(useLibraryStore.getState().libraryDirectorySettings.tileSize).toBe(300);
  });
  it("never rolls a newer successful directory operation back after an older failure", async () => {
    const mock = setup(); const a = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 180 });
    await vi.waitFor(() => expect(mock.calls.length).toBe(1)); const b = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 320 });
    mock.releases[0](false); await a; await vi.waitFor(() => expect(mock.calls.length).toBe(2));
    const interim = useLibraryStore.getState().libraryDirectorySettings.tileSize; mock.releases[1](true); await b;
    expect(interim).toBe(320); expect(useLibraryStore.getState().libraryDirectorySettings.tileSize).toBe(320);
  });
  it("merges the latest directory intent into independently queued view-settings writes", async () => {
    const mock = setup(); const a = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 180 });
    await vi.waitFor(() => expect(mock.calls.length).toBe(1)); const other = useLibraryStore.getState().saveMaterialBrowserSettings({ materialBrowserSortDirection: "asc" });
    const b = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 330 });
    mock.releases[0](true); await a; await vi.waitFor(() => expect(mock.calls.length).toBe(2));
    const queuedDirectorySize = mock.calls[1].libraryDirectorySettings.tileSize; mock.releases[1](true); await other;
    await vi.waitFor(() => expect(mock.calls.length).toBe(3)); mock.releases[2](true); await b;
    expect(queuedDirectorySize).toBe(330); expect(useLibraryStore.getState().libraryDirectorySettings.tileSize).toBe(330);
  });
  it("restores the last confirmed state when every queued directory write fails", async () => {
    const mock = setup();
    const a = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 180 });
    await vi.waitFor(() => expect(mock.calls.length).toBe(1));
    const b = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 360 });
    mock.releases[0](false); expect(await a).toBe(false);
    await vi.waitFor(() => expect(mock.calls.length).toBe(2));
    mock.releases[1](false); expect(await b).toBe(false);
    expect(useLibraryStore.getState().libraryDirectorySettings).toEqual(initial.libraryDirectorySettings);
  });
  it("restores the successfully persisted state after the newest directory write fails", async () => {
    const mock = setup();
    const a = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 190 });
    await vi.waitFor(() => expect(mock.calls.length).toBe(1));
    const b = useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 370 });
    mock.releases[0](true); expect(await a).toBe(true);
    await vi.waitFor(() => expect(mock.calls.length).toBe(2));
    mock.releases[1](false); expect(await b).toBe(false);
    expect(useLibraryStore.getState().libraryDirectorySettings.tileSize).toBe(190);
  });
  it("turns an IPC rejection into a structured failed save and restores the previous directory state", async () => {
    vi.stubGlobal("window", { suyanApi: { saveLibraryViewSettings: vi.fn(async () => { throw new Error("IPC disconnected"); }) } });
    const saved = await useLibraryStore.getState().saveLibraryDirectorySettings({ ...initial.libraryDirectorySettings, tileSize: 350 }).catch(() => "threw");
    expect(saved).toBe(false); expect(useLibraryStore.getState().libraryDirectorySettings).toEqual(initial.libraryDirectorySettings);
  });
});
