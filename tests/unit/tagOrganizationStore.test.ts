import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewTagOrganization, applyTagOrganization, undoTagOrganization } from "../../electron/main/library/tagOrganizationStore";
import { normalizeLibraryViewSettings, readLibraryViewSettings, writeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";
import { readLibraryFile, updateLibraryFile, writeLibraryFile } from "../../electron/main/library/libraryStore";
import * as persistence from "../../electron/main/library/libraryJsonPersistence";
import { exportPromptLexicon, importPromptLexicon } from "../../electron/main/library/lexiconFiles";
import type { LibraryItem, PromptImageLexiconEntry } from "../../src/features/library/types/library";

const runtime = vi.hoisted(() => ({ directory: "", exchange: "" }));
vi.mock("electron", () => ({ app: { getPath: () => runtime.directory, getVersion: () => "9.8.7" }, dialog: {
  showSaveDialog: async () => ({ canceled: false, filePath: runtime.exchange }),
  showOpenDialog: async () => ({ canceled: false, filePaths: [runtime.exchange] }),
} }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const entries: PromptImageLexiconEntry[] = [
  { id: "poplar", label: "胡杨树", group: "其他标签 Other", description: "用户图片", imageFileName: "tree.png" },
  { id: "leaf", label: "红叶", group: "其他标签 Other", description: "保留" },
];
const makeItem = (id: string, tags: string[]): LibraryItem => ({ id, title: id, prompt: "树木", negativePrompt: "", imageFileName: `${id}.png`, category: null, tags, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
const selected = (revision: string) => ({ revision, choices: [{ id: "poplar", label: "胡杨", group: "自然环境/植物/树木" }] });
const readDisk = (name: string) => fs.readFile(path.join(runtime.directory, "library", name), "utf8");

beforeEach(async () => {
  runtime.directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-tag-organization-"));
  runtime.exchange = path.join(runtime.directory, "tags-export.json");
  await writeLibraryViewSettings(normalizeLibraryViewSettings({ promptLexicons: { categories: [], tags: entries } }));
  await writeLibraryFile({ schemaVersion: 2, updatedAt: "2026-01-01T00:00:00Z", items: [makeItem("a", ["胡杨树", "红叶"])] });
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(runtime.directory, { recursive: true, force: true }); });

describe("tag organization durable transaction", () => {
  it("preview leaves the actual JSON files untouched", async () => {
    const before = await Promise.all([readDisk("library.json"), readDisk("tag-lexicon.json")]);
    const preview = await previewTagOrganization();
    expect(preview.rows.find(r => r.id === "poplar")).toMatchObject({ label: "胡杨", selected: true });
    expect(await Promise.all([readDisk("library.json"), readDisk("tag-lexicon.json")])).toEqual(before);
    expect(preview.undoAvailable).toBe(false);
  });

  it("persists selected references, aliases, custom images, and undo across module reload", async () => {
    const before = await readLibraryViewSettings();
    const applied = await applyTagOrganization(selected((await previewTagOrganization()).revision));
    expect(applied.library.items[0].tags).toEqual(["胡杨", "红叶"]);
    expect(applied.settings.promptLexicons?.tags.find(e => e.id === "poplar")).toMatchObject({ aliases: ["胡杨树"], groupLocked: true, imageFileName: "tree.png" });
    expect(JSON.parse(await readDisk("tag-lexicon.json"))).toEqual(applied.settings.promptLexicons?.tags);
    await updateLibraryFile(library => ({ ...library, items: [...library.items.map(i => ({ ...i, title: "后续改的标题" })), makeItem("new", ["红叶"])] }));
    vi.resetModules();
    const reloaded = await import("../../electron/main/library/tagOrganizationStore");
    const undone = await reloaded.undoTagOrganization();
    expect(undone.library.items[0]).toMatchObject({ title: "后续改的标题", tags: ["胡杨树", "红叶"] });
    expect(undone.library.items.some(i => i.id === "new")).toBe(true);
    expect(undone.settings.promptLexicons?.tags).toEqual(before.promptLexicons?.tags);
    expect((await reloaded.previewTagOrganization()).undoAvailable).toBe(false);
  });

  it("corrects a selected locked group, persists it on reload, and can undo without changing works", async () => {
    const original = { id: "clip", label: "蝴蝶发夹", group: "动物/动物与宠物", description: "用户说明", imageFileName: "clip.png", aliases: ["我的发夹"], groupLocked: true, parentId: null };
    await writeLibraryViewSettings(normalizeLibraryViewSettings({ promptLexicons: { categories: [], tags: [original] } }));
    await writeLibraryFile({ schemaVersion: 2, updatedAt: "2026-01-01T00:00:00Z", items: [makeItem("a", ["蝴蝶发夹"])] });
    const before = (await readLibraryFile()).items;
    const preview = await previewTagOrganization();
    const correction = preview.rows.find(row => row.id === "clip")!;
    expect(correction).toMatchObject({ originalGroup: original.group, group: "服饰/配饰", suggested: true, selected: false });
    const result = await applyTagOrganization({ revision: preview.revision, choices: [correction] });
    expect(result.library.items).toEqual(before);
    expect(result.settings.promptLexicons?.tags[0]).toEqual({ ...original, group: "服饰/配饰", reviewStatus: "accepted" });
    vi.resetModules();
    const reloaded = await import("../../electron/main/library/tagOrganizationStore");
    expect((await reloaded.previewTagOrganization()).rows[0]).toMatchObject({ group: "服饰/配饰", suggested: false });
    const undone = await reloaded.undoTagOrganization();
    expect(undone.settings.promptLexicons?.tags[0]).toEqual(original);
    expect(undone.library.items).toEqual(before);
  });

  it("rejects a stale preview before writing any undo or tag file", async () => {
    const preview = await previewTagOrganization();
    await updateLibraryFile(library => ({ ...library, items: [...library.items, makeItem("new", ["黄叶"])] }));
    const before = await readDisk("tag-lexicon.json");
    await expect(applyTagOrganization(selected(preview.revision))).rejects.toMatchObject({ code: "TAG_ORGANIZATION_STALE" });
    expect(await readDisk("tag-lexicon.json")).toBe(before);
  });

  it("rolls back the lexicon if the library cannot be saved", async () => {
    const preview = await previewTagOrganization();
    const before = JSON.parse(await readDisk("tag-lexicon.json"));
    vi.spyOn(persistence, "writeLibraryJsonAtomically").mockRejectedValueOnce(new Error("simulated disk failure"));
    await expect(applyTagOrganization(selected(preview.revision))).rejects.toThrow("simulated disk failure");
    expect(JSON.parse(await readDisk("tag-lexicon.json"))).toEqual(before);
    expect((await readLibraryFile()).items[0].tags).toEqual(["胡杨树", "红叶"]);
  });

  it("protects later tag changes when undo would overwrite them", async () => {
    await applyTagOrganization(selected((await previewTagOrganization()).revision));
    await updateLibraryFile(library => ({ ...library, items: library.items.map(i => ({ ...i, tags: ["黄叶"] })) }));
    const before = await readDisk("tag-lexicon.json");
    await expect(undoTagOrganization()).rejects.toMatchObject({ code: "TAG_ORGANIZATION_STALE" });
    expect(await readDisk("tag-lexicon.json")).toBe(before);
  });

  it("protects later lexicon edits when undo would overwrite them", async () => {
    await applyTagOrganization(selected((await previewTagOrganization()).revision));
    const settings = await readLibraryViewSettings();
    settings.promptLexicons!.tags[0].group = "用户新组";
    await writeLibraryViewSettings(settings);
    await expect(undoTagOrganization()).rejects.toMatchObject({ code: "TAG_ORGANIZATION_STALE" });
  });

  it("can retry undo after an interrupted library save", async () => {
    await applyTagOrganization(selected((await previewTagOrganization()).revision));
    vi.spyOn(persistence, "writeLibraryJsonAtomically").mockRejectedValueOnce(new Error("interrupted undo"));
    await expect(undoTagOrganization()).rejects.toThrow("interrupted undo");
    expect((await undoTagOrganization()).library.items[0].tags).toEqual(["胡杨树", "红叶"]);
  });

  it("keeps grouping evidence and aliases through settings and lexicon export/import", async () => {
    const entry = { ...entries[0], aliases: ["白杨别称"], groupLocked: true, reviewStatus: "accepted" as const, analysis: { dimension: "scene", confidence: 0.9, evidence: ["叶片可见"] } };
    await writeLibraryViewSettings(normalizeLibraryViewSettings({ promptLexicons: { categories: [], tags: [entry] } }));
    const tags = (await readLibraryViewSettings()).promptLexicons!.tags;
    expect(tags[0]).toMatchObject(entry);
    await exportPromptLexicon("tags", tags);
    expect((await importPromptLexicon("tags")).items[0]).toEqual(tags[0]);
  });
});
