import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AuthorInfo } from "../../src/features/account/types/account";
import type { LibraryItem } from "../../src/features/library/types/library";
const state = vi.hoisted(() => ({ dir: "", author: null as AuthorInfo | null, response: 0, defaultName: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.dir, getVersion: () => "9.8.7" }, dialog: {
  showMessageBox: async () => ({ response: state.response }),
  showSaveDialog: async (options: { defaultPath: string }) => {
    state.defaultName = options.defaultPath;
    return { canceled: false, filePath: path.join(state.dir, "export.png") };
  },
} }));
vi.mock("../../electron/main/account/accountService", () => ({ getAuthorInfo: () => state.author }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { attributeWork, hasWorkAuthor } from "../../src/features/library/utils/workAttribution";
import { generateWithWorkAuthor, attributeGeneratedWork, attributeLocalImports, syncWorksToAccount, refreshOwnedWorkProfile } from "../../electron/main/library/workAttribution";
import { readLibraryFile, writeLibraryFile, saveLibraryFileFromRenderer } from "../../electron/main/library/libraryStore";
import { cacheAccountAvatar } from "../../electron/main/account/accountAvatarCache";
import { collectAuthorAvatars, restoreAuthorAvatar } from "../../electron/main/library/archiveAuthors";
import { migrateLibrary } from "../../src/features/library/utils/migrateLibrary";
import { toPromptCardData } from "../../src/features/library/utils/promptFilters";
import { groupPromptImages } from "../../src/features/library/utils/promptImageGroups";
import { embedWorkInPng, readWorkFromImage, readWorkFromImageFile } from "../../electron/main/library/workImageExchange";
import { exportGeneratedWork } from "../../electron/main/library/exportGeneratedWork";
const alice: AuthorInfo = { uid: "issuer#alice", username: "甲" };
const bob: AuthorInfo = { uid: "issuer#bob", username: "乙" };
const item = (id: string): LibraryItem => ({ id, title: "同一提示词", prompt: "same", negativePrompt: "", tags: [], imageFileName: `${id}.png`, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
beforeEach(async () => { state.dir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-work-attribution-")); state.author = alice; state.response = 0; await writeLibraryFile({ schemaVersion: 2, updatedAt: "", items: [] }); });
afterEach(async () => { await fs.rm(state.dir, { recursive: true, force: true }); });
describe("账户作品归属", () => {
  it("旧数据迁移不归属当前账户，归属字段往返保留", () => {
    const file = migrateLibrary({ schemaVersion: 1, updatedAt: "", items: [item("old"), attributeWork(item("owned"), alice)] });
    expect(file.items[0].accountOwnerUid).toBeNull();
    expect(file.items[1].accountOwnerUid).toBe(alice.uid);
  });
  it("本地新导入关联当前账户，已存在的网络作者和其他账户不覆盖", async () => {
    const web = { ...item("web"), authorName: "原作者", sourceUrl: "https://example.test/p" };
    const entries = await attributeLocalImports([item("new"), web, attributeWork(item("bob"), bob)], alice);
    expect(entries[0].accountOwnerUid).toBe(alice.uid); expect(entries[1]).toEqual(web); expect(entries[2].accountOwnerUid).toBe(bob.uid);
    expect(await attributeLocalImports([item("anonymous")], null)).toEqual([item("anonymous")]);
    expect(hasWorkAuthor(web)).toBe(true);
  });
  it("生成开始时的身份不会被保存时的账户替换；登录前生成保持无归属", async () => {
    let finish!: (v: { images: { dataUrl: string }[] }) => void;
    const pending = generateWithWorkAuthor(() => new Promise<{ images: { dataUrl: string }[] }>(resolve => { finish = resolve; }));
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    state.author = bob; finish({ images: [{ dataUrl: "fixture-A" }] }); const a = await pending;
    const receiptA = (a.images[0] as { attributionId?: string }).attributionId;
    const b = await generateWithWorkAuthor(async () => ({ images: [{ dataUrl: "fixture-A", attributionId: undefined as string | undefined }] }));
    expect(attributeGeneratedWork(item("a"), "fixture-A", receiptA).accountOwnerUid).toBe(alice.uid);
    expect(attributeGeneratedWork(item("b"), "fixture-A", b.images[0].attributionId).accountOwnerUid).toBe(bob.uid);
    expect(attributeGeneratedWork(item("tampered"), "changed", receiptA).accountOwnerUid).toBeUndefined();
    state.author = null; const anonymous = await generateWithWorkAuthor(async () => ({ images: [{ dataUrl: "fixture-anon", attributionId: undefined as string | undefined }] }));
    state.author = alice; expect(attributeGeneratedWork(item("anon"), "fixture-anon", anonymous.images[0].attributionId).accountOwnerUid).toBeUndefined();
  });
  it("批量默认忽略已有作者，强制替换必须经过二次确认", async () => {
    await writeLibraryFile({ schemaVersion: 2, updatedAt: "", items: [item("new"), attributeWork(item("bob"), bob)] });
    const first = await syncWorksToAccount({ itemIds: ["new", "bob"], expectedUid: alice.uid });
    expect(first).toMatchObject({ changedCount: 1, skippedCount: 1 });
    expect((await syncWorksToAccount({ itemIds: ["bob"], expectedUid: alice.uid, force: true })).canceled).toBe(true);
    expect((await readLibraryFile()).items.find(i => i.id === "bob")?.accountOwnerUid).toBe(bob.uid);
    state.response = 1;
    await syncWorksToAccount({ itemIds: ["bob"], expectedUid: alice.uid, force: true });
    expect((await readLibraryFile()).items.every(i => i.accountOwnerUid === alice.uid)).toBe(true);
    await expect(syncWorksToAccount({ itemIds: ["new"], expectedUid: bob.uid })).rejects.toMatchObject({ code: "WORK_ACCOUNT_CHANGED" });
  });
  it("更换头像仅更新同 UID 的作品，持久化与旧渲染快照不覆盖新头像", async () => {
    const before = { ...alice, avatarUrl: await cacheAccountAvatar(alice.uid, png, "image/png") ?? undefined };
    await writeLibraryFile({ schemaVersion: 2, updatedAt: "", items: [attributeWork(item("alice"), before), attributeWork(item("bob"), bob), item("old")] });
    const stale = await readLibraryFile();
    const after = { ...alice, avatarUrl: await cacheAccountAvatar(alice.uid, Buffer.concat([png, Buffer.from("new")]), "image/png") ?? undefined };
    expect(after.avatarUrl).not.toEqual(before.avatarUrl);
    await refreshOwnedWorkProfile(after);
    await saveLibraryFileFromRenderer(stale);
    const saved = await readLibraryFile();
    expect(saved.items[0].authorAvatarUrl).not.toEqual(before.avatarUrl);
    expect(saved.items[1].accountOwnerUid).toBe(bob.uid); expect(saved.items[1].authorName).toBe(bob.username);
    expect(saved.items[2].accountOwnerUid).toBeNull();
    const disk = JSON.parse(await fs.readFile(path.join(state.dir, "library/library.json"), "utf8"));
    expect(disk.items[0].authorAvatarUrl).toBe(saved.items[0].authorAvatarUrl);
  });
  it("分享头像导出并在全新数据目录恢复，保留昵称 UID 与真实图像", async () => {
    const author = { ...alice, avatarUrl: await cacheAccountAvatar(alice.uid, png, "image/png") ?? undefined };
    const exported = await collectAuthorAvatars([attributeWork(item("a"), author)]);
    const bytes = await fs.readFile(exported.entries[0].sourcePath);
    const oldDir = state.dir;
    state.dir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-recipient-"));
    try {
      const url = await restoreAuthorAvatar(exported.items[0].authorAvatarUrl, async () => bytes);
      expect(url).toMatch(/^app-account-avatar:/);
      expect(exported.items[0]).toMatchObject({ accountOwnerUid: alice.uid, authorName: alice.username });
      const reexported = await collectAuthorAvatars([{ ...exported.items[0], authorAvatarUrl: url }]);
      expect(await fs.readFile(reexported.entries[0].sourcePath)).toEqual(png);
    } finally { await fs.rm(oldDir, { recursive: true, force: true }); }
  });
  it("并发导入同一头像不会争用临时文件", async () => {
    const author = { ...alice, avatarUrl: await cacheAccountAvatar(alice.uid, png, "image/png") ?? undefined };
    const results = await Promise.all(["one", "two", "three"].map(id => attributeLocalImports([item(id)], author)));
    expect(results.every(entries => entries[0].accountOwnerUid === alice.uid && entries[0].authorAvatarUrl)).toBe(true);
  });
  it("不同账户的相同提示词分组隔离；同账号原图仍排第一", () => {
    const a = attributeWork(item("a"), alice); const a2 = { ...a, id: "a2", createdAt: "2026-02-01" };
    const groups = groupPromptImages([a2, attributeWork(item("b"), bob), a].map(toPromptCardData), ["a2"]);
    expect(groups).toHaveLength(2); expect(groups.find(g => g.items.length === 2)?.items.map(i => i.id)).toEqual(["a", "a2"]);
    const blank = { ...item("blank"), title: "", prompt: "" };
    expect(groupPromptImages([attributeWork(blank, alice), attributeWork({ ...blank, id: "blank-b" }, bob)].map(toPromptCardData), [])).toHaveLength(2);
  });
  it("PNG 单图包含可移植头像与资料，扩展名不符仍按内容恢复", async () => {
    const author = { ...alice, avatarUrl: await cacheAccountAvatar(alice.uid, png, "image/png") ?? undefined };
    const owned = attributeWork(item("work"), author);
    const bytes = await embedWorkInPng(png, owned);
    const restored = await readWorkFromImage(bytes);
    expect(restored).toMatchObject({ accountOwnerUid: alice.uid, authorName: alice.username, prompt: "same" });
    expect(restored?.authorAvatarUrl).toMatch(/^app-account-avatar:/);
    const mislabeled = path.join(state.dir, "mislabeled.jpg");
    await fs.writeFile(mislabeled, bytes);
    expect(await readWorkFromImageFile(mislabeled)).toEqual(restored);
    const updated = await embedWorkInPng(bytes, { ...owned, authorName: "新昵称" });
    expect((await readWorkFromImage(updated))?.authorName).toBe("新昵称");
    expect(updated.toString("utf8").split("suyan-work")).toHaveLength(2);
    expect(await readWorkFromImage(Buffer.from("not a PNG"))).toBeNull();
  });
  it("画布未收录导出携带生成者，换号不认领；按内容解码错误 MIME", async () => {
    state.author = { ...alice, avatarUrl: await cacheAccountAvatar(alice.uid, png, "image/png") ?? undefined };
    const result = await generateWithWorkAuthor(async () => ({ images: [{ dataUrl: `data:image/jpeg;base64,${png.toString("base64")}`, attributionId: undefined as string | undefined }] }));
    state.author = bob;
    const input = { ...result.images[0], prompt: "导出提示词", negativePrompt: "", generationMethod: "测试模型" };
    await exportGeneratedWork(input);
    expect(state.defaultName).toMatch(/^素言-v9\.8\.7-图像作品-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/);
    expect(await readWorkFromImageFile(path.join(state.dir, "export.png"))).toMatchObject({ accountOwnerUid: alice.uid, authorName: alice.username, prompt: input.prompt });
    expect((await readLibraryFile()).items).toHaveLength(0);
    await exportGeneratedWork({ ...input, attributionId: undefined });
    expect((await readWorkFromImageFile(path.join(state.dir, "export.png")))?.accountOwnerUid).toBeUndefined();
  });
});
