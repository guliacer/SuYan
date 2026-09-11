import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportLibraryZip, importLibraryZip } from "../../electron/main/library/archiveStore";
import { readLibraryFile, writeLibraryFile } from "../../electron/main/library/libraryStore";
import { normalizeLibraryViewSettings, readLibraryViewSettings, writeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";
import * as persistence from "../../electron/main/library/libraryJsonPersistence";
import { groupPromptImages } from "../../src/features/library/utils/promptImageGroups";
import { toPromptCardData } from "../../src/features/library/utils/promptFilters";
import type { CategoryNode } from "../../src/features/library/types/category";
import type { LibraryItem, PromptImageLexiconEntry } from "../../src/features/library/types/library";

const runtime = vi.hoisted(() => ({ directory: "", exchange: "", external: "", defaultName: "", decode: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => runtime.directory, getVersion: () => "9.8.7" }, dialog: {
  showSaveDialog: async (options: { defaultPath: string }) => {
    runtime.defaultName = options.defaultPath;
    return { canceled: false, filePath: runtime.exchange };
  },
  showOpenDialog: async () => ({ canceled: false, filePaths: [runtime.exchange] }),
}, nativeImage: { createFromBuffer: (buffer: Buffer) => {
  runtime.decode(buffer);
  return { isEmpty: () => !buffer.subarray(1, 4).equals(Buffer.from("PNG")), getSize: () => ({ width: 1, height: 1 }),
    toBitmap: () => Buffer.from([0, 0, 0, 0]), toPNG: () => buffer };
} } }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../electron/main/library/workAttribution", () => ({ snapshotWorkAuthor: async () => null }));
vi.mock("../../electron/main/runtime/rustFileOps", () => ({ createZipViaRust: async () => null }));
vi.mock("../../electron/main/library/imageThumbnails", () => ({ prepareImageThumbnails: async () => undefined }));
vi.mock("../../electron/main/library/mediaPathResolver", () => ({ resolveMediaAbsolutePath: async (item: LibraryItem) =>
  typeof item.mediaStorage === "object" ? runtime.external : path.join(runtime.directory, "library", "images", item.imageFileName) }));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const timestamp = "2026-09-01T00:00:00.000Z";
const node = (name: string, id = "custom:shared"): CategoryNode => ({ id, name, type: "custom", group: "项目题材", aliases: [], keywords: [],
  description: "分类说明", examples: [], usageCount: 0, imageFileName: "original.jpg", createdAt: timestamp, updatedAt: timestamp });
const tag: PromptImageLexiconEntry = { id: "camera", label: "哈苏", group: "物品/数码设备/相机品牌", description: "品牌已确认", aliases: ["Hasselblad"],
  imageFileName: "external-cover.jpg", groupLocked: true, reviewStatus: "accepted", analysis: { dimension: "object", confidence: 0.98, evidence: ["机身上的哈苏字样"] } };
const item = (id: string, createdAt = timestamp): LibraryItem => ({ id, title: "同组作品", prompt: "相机的产品图", negativePrompt: "", tags: ["Hasselblad"],
  category: "项目摄影", categoryId: "custom:shared", genreIds: ["custom:shared", "custom:second"], imageFileName: `${id}.jpg`, createdAt, updatedAt: createdAt });
let temporaryRoot = "";
const disk = (name: string) => path.join(runtime.directory, "library", name);
const readZip = async () => JSZip.loadAsync(await fs.readFile(runtime.exchange));

beforeEach(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-archive-knowledge-"));
  runtime.directory = path.join(temporaryRoot, "sender");
  runtime.exchange = path.join(temporaryRoot, "share.zip");
  runtime.external = path.join(temporaryRoot, "external-cover.png");
  runtime.decode.mockClear();
  const taxonomy = { schemaVersion: 1 as const, updatedAt: timestamp, nodes: [node("项目摄影"), { ...node("旅行计划", "custom:second"), imageFileName: null }] };
  await writeLibraryViewSettings(normalizeLibraryViewSettings({ promptLexicons: {
    categories: [{ id: "custom:shared", label: "项目摄影", group: "项目题材", description: "分类说明", imageFileName: "original.jpg" }],
    tags: [tag, { id: "unrelated", label: "红叶", group: "自然环境/植物/叶片", description: "不导出" }],
  }, categoryWorkspace: { taxonomy, inbox: [], candidates: [], learningEvents: [] } }));
  await writeLibraryFile({ schemaVersion: 2, updatedAt: timestamp, categoryTaxonomy: taxonomy, items: [
    item("additional", "2026-09-02T00:00:00.000Z"), item("original"),
    { ...item("external-cover"), prompt: "另一作品，不应进入分享包", mediaStorage: { kind: "external", rootId: "test-root", relativePath: "cover.png" } },
  ] });
  await fs.writeFile(disk("images/original.jpg"), png);
  await fs.writeFile(disk("images/additional.jpg"), png);
  await fs.writeFile(runtime.external, png);
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(temporaryRoot, { recursive: true, force: true }); });

async function recipient(conflict = false) {
  runtime.directory = path.join(temporaryRoot, "recipient");
  const local = { ...node("本地静物"), imageFileName: null };
  const taxonomy = { schemaVersion: 1 as const, updatedAt: timestamp, nodes: conflict ? [local] : [] };
  await writeLibraryFile({ schemaVersion: 2, updatedAt: timestamp, items: conflict ? [{ ...item("local"), title: "已有作品", prompt: "自己的静物", category: local.name, genreIds: [local.id], tags: ["哈苏"] }] : [], categoryTaxonomy: taxonomy });
  await writeLibraryViewSettings(normalizeLibraryViewSettings({ themeMode: "dark", tagOrder: ["原顺序"], promptLexicons: {
    categories: conflict ? [{ id: local.id, label: local.name, group: local.group, description: "本地说明" }] : [],
    tags: conflict ? [{ ...tag, id: "local-tag", group: "我的相机", imageFileName: null }] : [],
  }, categoryWorkspace: { taxonomy, inbox: [], candidates: [], learningEvents: [] } }));
}

describe("ZIP round trip with analyzed libraries and real JSON persistence", () => {
  it("exports only selected knowledge with external covers and restores it to a clean recipient without reanalysis", async () => {
    const startedAt = Date.now();
    const exported = await exportLibraryZip(["original", "additional"]);
    const name = /^素言-v9\.8\.7-提示词-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.zip$/.exec(runtime.defaultName);
    expect(name).not.toBeNull();
    const [, year, month, day, hour, minute, second] = name!.map(Number);
    const exportTime = new Date(year, month - 1, day, hour, minute, second).getTime();
    expect(exportTime).toBeGreaterThanOrEqual(Math.floor(startedAt / 1000) * 1000);
    expect(exportTime).toBeLessThanOrEqual(Date.now());
    expect(exported).toMatchObject({ exportedCount: 2, categoryCount: 2, tagCount: 1 });
    const zip = await readZip();
    const manifest = JSON.parse(await zip.file("data.json")!.async("string"));
    expect(manifest.items).toHaveLength(2);
    expect(manifest.analyzedLibraries.tags).toContainEqual(expect.objectContaining(tag));
    expect(manifest.analyzedLibraries.tags.some((e: PromptImageLexiconEntry) => e.id === "unrelated")).toBe(false);
    expect(zip.file("knowledge-images/external-cover.jpg")).toBeTruthy();
    expect(zip.file("knowledge-images/original.jpg")).toBeNull(); // cover reuses the selected image
    expect(zip.file("images/external-cover.jpg")).toBeNull();
    await recipient();
    const imported = await importLibraryZip();
    expect(imported.importedCount).toBe(2);
    const settings = await readLibraryViewSettings();
    expect(settings.promptLexicons?.tags[0]).toMatchObject({ ...tag, imageFileName: expect.any(String) });
    expect(settings.themeMode).toBe("dark");
    expect(settings.tagOrder).toEqual(["原顺序"]);
    expect(settings.promptLexicons?.tags[0].imageFileName).not.toBe(tag.imageFileName);
    expect(imported.library.items.every(i => i.genreIds?.includes("custom:second"))).toBe(true);
    expect((await readLibraryFile()).items).toEqual(imported.library.items);
    expect(imported.settings?.promptLexicons).toEqual(settings.promptLexicons);

    // PNG bytes intentionally carry a .jpg suffix; decoding must see the actual content.
    expect(runtime.decode).toHaveBeenCalledWith(png);
    for (const file of await fs.readdir(disk("images"))) expect(await fs.readFile(disk(`images/${file}`))).toEqual(png);
    const groups = groupPromptImages(imported.library.items.map(toPromptCardData), []);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(i => i.createdAt)).toEqual([Date.parse(timestamp), Date.parse("2026-09-02T00:00:00.000Z")]);
    const cover = settings.promptLexicons!.categories.find(e => e.id === "custom:shared")!.imageFileName;
    expect(cover).toBe(groups[0].primaryItem.imageFileName);
    expect(settings.categoryWorkspace?.taxonomy?.nodes.find(n => n.id === "custom:shared")?.imageFileName).toBe(cover);
  });

  it("preserves existing category/tag definitions and remaps only incoming assignments on an ID conflict", async () => {
    await exportLibraryZip(["original", "additional"]);
    await recipient(true);
    const before = await readLibraryFile();
    const settingsBefore = await readLibraryViewSettings();
    const result = await importLibraryZip();
    expect(result.library.items.find(i => i.id === "local")).toEqual(before.items[0]);
    const imported = result.library.items.filter(i => i.id !== "local");
    expect(imported[0].categoryId).not.toBe("custom:shared");
    expect(imported[0].genreIds).toContain(imported[0].categoryId);
    expect(imported[0].category).toBe("项目摄影");
    expect(result.settings?.promptLexicons?.tags).toEqual([{ ...settingsBefore.promptLexicons!.tags[0], imageFileName: expect.any(String) }]);
    expect(result.settings?.promptLexicons?.categories).toContainEqual(settingsBefore.promptLexicons!.categories[0]);
  });

  it.each([1, 2])("imports legacy schema %i without requiring new metadata or changing lexicons", async schemaVersion => {
    await exportLibraryZip(["original"]);
    const zip = await readZip();
    const data = JSON.parse(await zip.file("data.json")!.async("string"));
    delete data.analyzedLibraries;
    data.schemaVersion = schemaVersion;
    zip.file("data.json", JSON.stringify(data));
    await fs.writeFile(runtime.exchange, await zip.generateAsync({ type: "nodebuffer" }));
    await recipient(true);
    const before = await readLibraryViewSettings();
    const imported = await importLibraryZip();
    expect(imported).toMatchObject({ importedCount: 1 });
    expect(imported.settings).toBeUndefined();
    expect(await readLibraryViewSettings()).toEqual(before);
  });

  it.each(["tag-lexicon.json", "library.json"])("rolls back settings and imported media if %s cannot be committed", async filename => {
    await exportLibraryZip(["original", "additional"]);
    await recipient(true);
    const before = await readLibraryViewSettings();
    const libraryBefore = await readLibraryFile();
    const write = persistence.writeLibraryJsonAtomically;
    let failed = false;
    vi.spyOn(persistence, "writeLibraryJsonAtomically").mockImplementation(async (target, content) => {
      if (!failed && target === disk(filename)) { failed = true; throw new Error("simulated disk failure"); }
      return write(target, content);
    });
    await expect(importLibraryZip()).rejects.toThrow("simulated disk failure");
    expect(await readLibraryViewSettings()).toEqual(before);
    expect(await readLibraryFile()).toEqual(libraryBefore);
    expect(await fs.readdir(disk("images"))).toEqual([]);
  });

  it("rejects missing covers and cleans only newly written files", async () => {
    await exportLibraryZip(["original"]);
    const zip = await readZip();
    zip.remove("knowledge-images/external-cover.jpg");
    await fs.writeFile(runtime.exchange, await zip.generateAsync({ type: "nodebuffer" }));
    await recipient();
    await fs.writeFile(disk("images/existing.png"), png);
    const before = await readLibraryViewSettings();
    await expect(importLibraryZip()).rejects.toMatchObject({ code: "ZIP_KNOWLEDGE_IMAGE_MISSING" });
    expect(await readLibraryViewSettings()).toEqual(before);
    expect((await readLibraryFile()).items).toHaveLength(0);
    expect(await fs.readdir(disk("images"))).toEqual(["existing.png"]);
  });
});
