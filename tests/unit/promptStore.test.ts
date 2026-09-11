import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "", clipboardText: "" }));
vi.mock("electron", () => ({
  app: { getPath: () => state.dataDir },
  clipboard: { writeText: (text: string) => { state.clipboardText = text; } },
}));

describe("prompt store", () => {
  beforeAll(async () => { state.dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-prompts-")); });
  afterAll(async () => { await fs.rm(state.dataDir, { recursive: true, force: true }); });

  it("persists CRUD data and records successful copies", async () => {
    const store = await import("../../electron/main/library/promptStore");
    const initial = await store.listPrompts();
    expect(initial.schemaVersion).toBe(2);
    expect(initial.categories.length).toBeGreaterThan(0);

    const created = await store.createPrompt({ title: "发布文案", content: "为 {{product}} 写文案" });
    const entry = created.entries[0];
    expect(entry.variables).toEqual([{ name: "product" }]);

    const updated = await store.updatePrompt({ id: entry.id, title: "发布文案（更新）" });
    expect(updated.entries[0].createdAt).toBe(entry.createdAt);
    expect(updated.entries[0].updatedAt).not.toBe(entry.updatedAt);

    const copied = await store.copyPrompt({ id: entry.id, values: { product: "素言" } });
    expect(state.clipboardText).toBe("为 素言 写文案");
    expect(copied.entries[0].usageCount).toBe(1);

    const removed = await store.deletePrompts([entry.id]);
    expect(removed.entries).toEqual([]);
    const disk = JSON.parse(await fs.readFile(path.join(state.dataDir, "library", "prompts.json"), "utf8")) as { schemaVersion: number };
    expect(disk.schemaVersion).toBe(2);
  });

  it("reloads prompts.json when an external editor changes it", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({ title: "外部修改前", content: "正文" });
    const filePath = path.join(state.dataDir, "library", "prompts.json");
    const disk = JSON.parse(await fs.readFile(filePath, "utf8")) as { entries: Array<Record<string, unknown>> };
    disk.entries[0] = { ...disk.entries[0], title: "外部修改后" };
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fs.writeFile(filePath, JSON.stringify(disk), "utf8");

    const reloaded = await store.listPrompts();
    expect(reloaded.entries.find((entry) => entry.id === created.entries[0]?.id)?.title).toBe("外部修改后");
  });

  it("保存卡片自定义尺寸并限制异常尺寸", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({ title: "可调整卡片", content: "尺寸内容", cardWidth: 999, cardHeight: 100 });
    const entry = created.entries[0];
    expect(entry.cardWidth).toBe(640);
    expect(entry.cardHeight).toBe(260);

    const updated = await store.updatePrompt({ id: entry.id, cardWidth: 100, cardHeight: 9999 });
    expect(updated.entries[0].cardWidth).toBe(220);
    expect(updated.entries[0].cardHeight).toBe(720);

    const renamed = await store.updatePrompt({ id: entry.id, title: "尺寸不应重置" });
    expect(renamed.entries[0].cardWidth).toBe(220);
    expect(renamed.entries[0].cardHeight).toBe(720);
  });

  it("保存 GitHub 项目元数据并持久化 README 隐藏状态", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({
      type: "github-project",
      title: "PaperTodo",
      content: "# PaperTodo\n\n项目说明",
      sourceUrl: "https://github.com/snownico0722/PaperTodo",
      github: {
        owner: "snownico0722",
        repository: "PaperTodo",
        fullName: "snownico0722/PaperTodo",
        name: "PaperTodo",
        url: "https://github.com/snownico0722/PaperTodo",
        releasesUrl: "https://github.com/snownico0722/PaperTodo/releases",
        defaultBranch: "main",
        readmeName: "README.md",
        readmeContent: "# PaperTodo\n\n项目说明",
        files: [{ path: "README.md", type: "file", size: 24, htmlUrl: "https://github.com/snownico0722/PaperTodo/blob/main/README.md" }],
      },
    });
    const entry = created.entries[0];
    expect(entry.type).toBe("github-project");
    expect(entry.title).toBe("Github-PaperTodo");
    expect(created.categories.find((category) => category.id === entry.categoryId)?.name).toBe("Github");
    expect(entry.github?.files[0]?.path).toBe("README.md");

    await store.copyPrompt({ id: entry.id });
    expect(state.clipboardText).toBe("https://github.com/snownico0722/PaperTodo");

    const edited = await store.updatePrompt({ id: entry.id, content: "# PaperTodo\n\n更新后的项目说明" });
    expect(edited.entries[0]?.github?.readmeContent).toBe("# PaperTodo\n\n更新后的项目说明");

    await store.updatePrompt({ id: entry.id, github: { ...entry.github!, readmeCollapsed: true } });
    store.resetPromptStoreForTests();
    const reloaded = await store.listPrompts();
    expect(reloaded.entries.find((candidate) => candidate.id === entry.id)?.github?.readmeCollapsed).toBe(true);
  });

  it("允许只提交正文并保留自动整理状态与人工字段来源", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({ content: "Create a {{subject}} portrait" });
    const entry = created.entries[0];
    expect(entry.title).toBe("Create a {{subject}} portrait");
    expect(entry.variables).toEqual([{ name: "subject" }]);

    const analyzing = await store.updatePrompt({
      id: entry.id,
      title: "我的标题",
      metadataSource: { title: "user", type: "system" },
      analysisStatus: "analyzing",
    });
    expect(analyzing.entries[0].metadataSource?.title).toBe("user");
    expect(analyzing.entries[0].analysisStatus).toBe("analyzing");

    await store.updatePrompt({ id: entry.id, masked: true });
    store.resetPromptStoreForTests();
    const reloaded = await store.listPrompts();
    expect(reloaded.entries.find((candidate) => candidate.id === entry.id)?.masked).toBe(true);
  });

  it("migrates legacy arrays and rejects unknown future schemas", async () => {
    const { normalizePromptLibraryFile } = await import("../../electron/main/library/promptStore");
    const legacy = normalizePromptLibraryFile([{ id: "legacy", title: "旧提示词", content: "旧内容", tagIds: [] }]);
    expect(legacy.file.schemaVersion).toBe(2);
    expect(legacy.file.entries[0].title).toBe("旧提示词");
    expect(() => normalizePromptLibraryFile({ schemaVersion: 3, entries: [] })).toThrow("版本暂不受支持");
  });

  it("迁移纯文本命令时生成富文本代码块", async () => {
    const { normalizePromptLibraryFile } = await import("../../electron/main/library/promptStore");
    const source = "上传文件\n```text\nW:\\Guli Identity\\dist\n```\n```bash\ncd ~\nsha256sum -c release.sha256\n```";
    const result = normalizePromptLibraryFile([{ id: "command", title: "部署命令", content: source, tagIds: [] }]);
    expect(result.file.entries[0]?.contentHtml).toContain('<pre data-language="bash"><code>cd ~\nsha256sum -c release.sha256</code></pre>');
    expect(result.file.entries[0]?.contentHtml).not.toContain("```bash");
  });

  it("merges imported inspiration without overwriting existing entries", async () => {
    const { listPrompts, mergeImportedPromptLibrary, normalizePromptLibraryFile } = await import("../../electron/main/library/promptStore");
    const current = await listPrompts();
    const imported = normalizePromptLibraryFile({
      schemaVersion: 2,
      updatedAt: "2026-08-20T00:00:00.000Z",
      categories: [{ id: "source-category", name: "导入分类" }],
      entries: [
        { id: "duplicate", title: "重复内容", content: current.entries[0]?.content ?? "Create a {{subject}} portrait", tagIds: [] },
        { id: "source-entry", title: "导入灵感", content: "这是导入的独立灵感正文", categoryId: "source-category", tagIds: [], masked: true },
      ],
    }).file;

    const merged = mergeImportedPromptLibrary(current, imported);
    expect(merged.importedCount).toBe(1);
    expect(merged.skippedCount).toBe(1);
    const entry = merged.library.entries.find((candidate) => candidate.content === "这是导入的独立灵感正文");
    expect(entry?.id).not.toBe("source-entry");
    expect(entry?.masked).toBe(true);
    expect(merged.library.categories.find((category) => category.id === entry?.categoryId)?.name).toBe("导入分类");
  });

  it("validates the portable inspiration exchange schema", async () => {
    const { formatPromptExchangeFileName, readPromptExchangePayload } = await import("../../electron/main/library/promptStore");
    const file = readPromptExchangePayload({
      schemaVersion: 1,
      kind: "suyan-inspiration-library",
      exportedAt: "2026-08-20T00:00:00.000Z",
      entries: [{ id: "entry", title: "灵感", content: "正文", tagIds: [] }],
      categories: [],
    });
    expect(file.entries).toHaveLength(1);
    expect(() => readPromptExchangePayload({ schemaVersion: 1, kind: "other", entries: [], categories: [] })).toThrow("有效的素言灵感库");

    const localDate = new Date(2026, 7, 26, 10, 45, 30);
    const exportFileName = formatPromptExchangeFileName("0.3.6", localDate);
    const current = readPromptExchangePayload({
      schemaVersion: 2,
      kind: "suyan-inspiration-library",
      exportVersion: 2,
      appVersion: "0.3.6",
      exportedAt: localDate.toISOString(),
      exportTimeZoneOffsetMinutes: localDate.getTimezoneOffset(),
      exportFileName,
      entries: [{ id: "entry-2", title: "灵感", content: "正文2", tagIds: [] }],
      categories: [],
    }, exportFileName);
    expect(current.entries).toHaveLength(1);
    expect(exportFileName).toBe("素言-v0.3.6-灵感库-2026-08-26-10-45-30.json");
    expect(() => readPromptExchangePayload({
      schemaVersion: 2,
      kind: "suyan-inspiration-library",
      exportVersion: 1,
      appVersion: "0.3.6",
      exportedAt: "not-a-date",
      exportFileName,
      entries: [],
      categories: [],
    }, exportFileName)).toThrow("版本号或导出时间无效");

    // v1 exports keep their compact names and remain readable after this naming change.
    const legacyName = "素言-0.3.6-20260826104530.json";
    expect(readPromptExchangePayload({ schemaVersion: 2, kind: "suyan-inspiration-library", exportVersion: 1,
      appVersion: "0.3.6", exportedAt: localDate.toISOString(), exportFileName: legacyName, entries: [], categories: [] }, legacyName).entries).toEqual([]);

    // New metadata validates the sender's clock, even when the receiver uses a different timezone.
    const crossZone = { schemaVersion: 2, kind: "suyan-inspiration-library", exportVersion: 2, appVersion: "0.3.6",
      exportedAt: "2026-09-09T16:05:06.000Z", exportTimeZoneOffsetMinutes: -480,
      exportFileName: "素言-v0.3.6-灵感库-2026-09-10-00-05-06.json", entries: [], categories: [] };
    expect(readPromptExchangePayload(crossZone, crossZone.exportFileName).entries).toEqual([]);
    for (const patch of [{ appVersion: "0.3.7" }, { exportedAt: "2026-09-09T16:06:06.000Z" },
      { exportTimeZoneOffsetMinutes: 9999 }, { exportTimeZoneOffsetMinutes: undefined }]) {
      expect(() => readPromptExchangePayload({ ...crossZone, ...patch }, crossZone.exportFileName)).toThrow("版本号或导出时间无效");
    }
  });
});
