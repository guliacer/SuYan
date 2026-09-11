import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "", clipboardText: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => state.dataDir },
  clipboard: { writeText: (text: string) => { state.clipboardText = text; } },
  // isEncryptionAvailable=false 时走 dev1: 本地编码，便于在测试中做可逆断言
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: (buffer: Buffer) => buffer,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
  },
}));

describe("prompt account entries", () => {
  beforeAll(async () => { state.dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-account-")); });
  afterAll(async () => { await fs.rm(state.dataDir, { recursive: true, force: true }); });

  it("保存账号条目：密码加密落盘、正文剥离密码行、读取时解密", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({
      title: "即梦账号",
      content: "站点：即梦AI\n账号：user@example.com\n密码：secret-123",
      type: "account",
    });
    const entry = created.entries[0];
    expect(entry.type).toBe("account");
    expect(entry.content).toBe("url: 即梦AI");
    expect(entry.content).not.toContain("secret-123");
    expect(entry.account?.name).toBe("user@example.com");
    expect(entry.account?.site).toBe("即梦AI");
    expect(entry.account?.passwordEncrypted).toBeTruthy();
    expect(entry.account?.passwordEncrypted).not.toContain("secret-123");

    const view = await store.readPromptAccount(entry.id);
    expect(view).toEqual({ name: "user@example.com", password: "secret-123", site: "即梦AI" });

    // 磁盘上也不得出现明文密码
    const disk = JSON.parse(await fs.readFile(path.join(state.dataDir, "library", "prompts.json"), "utf8")) as {
      entries: Array<{ content: string; account?: Record<string, string> }>;
    };
    const diskEntry = disk.entries[0]!;
    expect(diskEntry.content).not.toContain("secret-123");
    expect(JSON.stringify(diskEntry)).not.toContain("secret-123");
  });

  it("网站账户模板自动提取字段、生成标题并加密密码", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({
      content: "备注：不要保存这行\n网址：https://www.example.com/login?token=secret\n账户名称：alice\n密码：secret-456",
    });
    const entry = created.entries[0];
    expect(entry.type).toBe("account");
    expect(entry.title).toBe("example.com");
    expect(entry.content).toBe("url: https://www.example.com/login");
    expect(JSON.stringify(entry)).not.toContain("secret-456");
    expect(await store.readPromptAccount(entry.id)).toEqual({
      name: "alice",
      password: "secret-456",
      site: "https://www.example.com/login",
    });
  });

  it("更新标题等元数据时保留已加密的密码", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({
      content: "账号：a@b.com\n密码：pw-1",
      type: "account",
    });
    const entry = created.entries[0];
    const encrypted = entry.account?.passwordEncrypted;
    expect(encrypted).toBeTruthy();

    const updated = await store.updatePrompt({ id: entry.id, title: "新标题" });
    expect(updated.entries[0].account?.passwordEncrypted).toBe(encrypted);
    expect((await store.readPromptAccount(entry.id)).password).toBe("pw-1");
  });

  it("正文中重新填写密码行可更新密码", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({ content: "账号：a@b.com\n密码：old-pw", type: "account" });
    const entry = created.entries[0];

    await store.updatePrompt({ id: entry.id, content: "账号：a@b.com\n密码：new-pw" });
    expect((await store.readPromptAccount(entry.id)).password).toBe("new-pw");
    const reloaded = await store.listPrompts();
    expect(reloaded.entries[0]?.content).not.toContain("new-pw");
  });

  it("编辑器提交结构化账号字段时，正文只保留网址并更新加密密码", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({ content: "网址：https://example.com\n邮箱：old@example.com\n密码：old-pw" });
    const entry = created.entries[0];

    const updated = await store.updatePrompt({
      id: entry.id,
      account: { name: "new@example.com", site: "https://example.com/login", password: "new-pw" },
    });
    expect(updated.entries[0]?.title).toBe("邮箱-new@example.com");
    expect(updated.entries[0]?.content).toBe("url: https://example.com/login");
    expect(await store.readPromptAccount(entry.id)).toEqual({
      name: "new@example.com",
      password: "new-pw",
      site: "https://example.com/login",
    });
  });

  it("复制与重载后仍能解密，普通文本不受影响", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({ content: "账号：a@b.com\n密码：keep-me", type: "account" });
    const entry = created.entries[0];
    await store.copyPrompt({ id: entry.id });
    expect(state.clipboardText).toBe("account: a@b.com");

    store.resetPromptStoreForTests();
    const reloaded = await store.listPrompts();
    const reloadedEntry = reloaded.entries.find((candidate) => candidate.id === entry.id);
    expect(reloadedEntry?.type).toBe("account");
    expect(reloadedEntry?.account?.passwordEncrypted).toBe(entry.account?.passwordEncrypted);
    expect((await store.readPromptAccount(entry.id)).password).toBe("keep-me");

    const plain = await store.createPrompt({ content: "写一篇关于春天的文章" });
    expect(plain.entries[0]?.type).toBe("text");
    expect(plain.entries[0]?.account).toBeUndefined();
  });

  it("类型被覆盖为文本时不剥离密码", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const created = await store.createPrompt({
      content: "账号：a@b.com\n密码：plain-secret",
      type: "text",
    });
    expect(created.entries[0]?.content).toContain("plain-secret");
    expect(created.entries[0]?.account).toBeUndefined();
  });
});
