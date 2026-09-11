import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeLibraryViewSettings,
  readLibraryViewSettings,
  writeLibraryViewSettings,
} from "../../electron/main/library/viewSettingsStore";
import type { LibraryViewSettings } from "../../src/features/library/types/library";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath },
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  runtime.userDataPath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeTempUserData(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-lexicon-split-"));
  temporaryDirectories.push(directory);
  runtime.userDataPath = directory;
  return directory;
}

function readFileIfExists(filePath: string): Promise<unknown> {
  return fs.readFile(filePath, "utf8").then((content) => JSON.parse(content) as unknown).catch(() => null);
}

function makeSettings(promptLexicons: LibraryViewSettings["promptLexicons"]): LibraryViewSettings {
  return normalizeLibraryViewSettings({ themeMode: "dark", themePreset: "solarized", promptLexicons });
}

describe("lexicon file split persistence", () => {
  it("retains the previous lexicon contents before later settings writes", async () => {
    const directory = await makeTempUserData();
    const settings = makeSettings({ categories: [], tags: [{ id: "old", label: "原始标签", group: "原始组", description: "需要保留" }] });
    await writeLibraryViewSettings(settings);
    await writeLibraryViewSettings({ ...settings, promptLexicons: { categories: [], tags: [] } });
    const backup = await readFileIfExists(path.join(directory, "library", "tag-lexicon.json.bak"));
    expect(backup).toMatchObject([{ id: "old", label: "原始标签", group: "原始组" }]);
  });
  it("persists independent canvas backgrounds across disk reload and theme changes", async () => {
    const directory = await makeTempUserData();
    let settings = normalizeLibraryViewSettings({});
    expect(settings.canvasBackground).toEqual({ mode: "mist", color: null, imageFileName: null });
    for (const mode of ["mist", "white", "color", "image"] as const) {
      const background = { mode, color: "#173754", imageFileName: "theme-background-canvas.png" };
      await writeLibraryViewSettings({ ...settings, canvasBackground: background });
      settings = await readLibraryViewSettings();
      expect(settings.canvasBackground).toEqual(background);
      const disk = await readFileIfExists(path.join(directory, "library", "view-settings.json"));
      expect(disk).toMatchObject({ canvasBackground: background });
      await writeLibraryViewSettings({ ...settings, themeMode: "dark", themePreset: "xcode" });
      expect((await readLibraryViewSettings()).canvasBackground).toEqual(background);
    }
  });

  it("writes categories and tags into separate files and strips the shared field from view-settings", async () => {
    const userData = await makeTempUserData();
    const settings = makeSettings({
      categories: [{ id: "cat-1", group: "人像摄影", label: "人像", description: "" }],
      tags: [{ id: "tag-1", group: "服饰 Clothing", label: "长裙", description: "" }],
    });

    await writeLibraryViewSettings(settings);

    const mainFile = await readFileIfExists(path.join(userData, "library", "view-settings.json"));
    const categoryFile = await readFileIfExists(path.join(userData, "library", "category-lexicon.json"));
    const tagFile = await readFileIfExists(path.join(userData, "library", "tag-lexicon.json"));

    expect(categoryFile).toEqual([{ id: "cat-1", group: "人像摄影", label: "人像", description: "", parentId: null, imageFileName: null }]);
    expect(tagFile).toEqual([{ id: "tag-1", group: "服饰 Clothing", label: "长裙", description: "", parentId: null, imageFileName: null }]);
    expect(mainFile).not.toHaveProperty("promptLexicons");
  });

  it("restores both lexicons from standalone files on read", async () => {
    await makeTempUserData();
    const settings = makeSettings({
      categories: [{ id: "cat-9", group: "产品摄影", label: "产品", description: "" }],
      tags: [{ id: "tag-9", group: "光影 Lighting", label: "柔光", description: "" }],
    });

    await writeLibraryViewSettings(settings);
    const reloaded = await readLibraryViewSettings();

    expect(reloaded.themePreset).toBe("solarized");
    expect(reloaded.promptLexicons?.categories).toEqual([
      { id: "cat-9", group: "产品摄影", label: "产品", description: "", parentId: null, imageFileName: null },
    ]);
    expect(reloaded.promptLexicons?.tags).toEqual([
      { id: "tag-9", group: "光影 Lighting", label: "柔光", description: "", parentId: null, imageFileName: null },
    ]);
  });

  it("migrates legacy promptLexicons from view-settings.json into standalone files", async () => {
    const userData = await makeTempUserData();
    const libraryDir = path.join(userData, "library");
    await fs.mkdir(libraryDir, { recursive: true });

    const legacy: Record<string, unknown> = {
      themeMode: "dark",
      materialBrowserScrollTop: 0,
      nsfwGradingSpeed: "fast",
      promptLexicons: {
        categories: [{ id: "legacy-cat", group: "人像摄影", label: "汉服", description: "", imageFileName: null }],
        tags: [{ id: "legacy-tag", group: "道具与配饰 Props", label: "团扇", description: "", imageFileName: null }],
      },
    };
    await fs.writeFile(path.join(libraryDir, "view-settings.json"), JSON.stringify(legacy), "utf8");

    const reloaded = await readLibraryViewSettings();

    const categoryFile = await readFileIfExists(path.join(libraryDir, "category-lexicon.json"));
    const tagFile = await readFileIfExists(path.join(libraryDir, "tag-lexicon.json"));
    const mainFile = await readFileIfExists(path.join(libraryDir, "view-settings.json"));

    expect(categoryFile).toContainEqual(expect.objectContaining({ id: "legacy-cat", label: "汉服" }));
    expect(tagFile).toContainEqual(expect.objectContaining({ id: "legacy-tag", label: "团扇" }));
    expect((mainFile as Record<string, unknown>).promptLexicons).toBeUndefined();
    expect(reloaded.themeMode).toBe("dark");
    expect(reloaded.promptLexicons?.tags).toContainEqual(expect.objectContaining({ label: "团扇" }));
  });
});
