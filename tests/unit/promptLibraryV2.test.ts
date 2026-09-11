import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "" }));
vi.mock("electron", () => ({ app: { getPath: () => state.dataDir }, clipboard: { writeText: vi.fn() } }));

describe("独立提示词库 v2", () => {
  beforeAll(async () => { state.dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-prompt-v2-")); });
  afterAll(async () => { await fs.rm(state.dataDir, { recursive: true, force: true }); });

  it("将旧数组无损迁移并按原位置生成排序键", async () => {
    const { normalizePromptLibraryFile } = await import("../../electron/main/library/promptStore");
    const result = normalizePromptLibraryFile([
      { id: "one", title: "第一条", content: "内容一", tagIds: [] },
      { id: "two", title: "第二条", content: "内容二", tagIds: [] },
    ]);
    expect(result.migrated).toBe(true);
    expect(result.file.schemaVersion).toBe(2);
    expect(result.file.entries.map((entry) => entry.id)).toEqual(["one", "two"]);
    expect(result.file.entries.map((entry) => entry.orderKey)).toEqual(["0000000000", "0000000001"]);
    expect(result.file.categories.some((category) => category.id === "prompt-category-uncategorized")).toBe(true);
  });

  it("支持分类创建、合并、删除迁移和跨分类移动", async () => {
    const store = await import("../../electron/main/library/promptStore");
    store.resetPromptStoreForTests();
    const sourceFile = await store.createPromptCategory({ name: "来源分类" });
    const source = sourceFile.categories.find((category) => category.name === "来源分类");
    const targetFile = await store.createPromptCategory({ name: "目标分类" });
    const target = targetFile.categories.find((category) => category.name === "目标分类");
    expect(source && target).toBeTruthy();

    let file = await store.createPrompt({ title: "待移动", content: "正文", categoryId: source!.id });
    const entryId = file.entries[0].id;
    file = await store.movePromptsToCategory([entryId], target!.id);
    expect(file.entries.find((entry) => entry.id === entryId)?.categoryId).toBe(target!.id);

    file = await store.mergePromptCategories(source!.id, target!.id);
    expect(file.categories.some((category) => category.id === source!.id)).toBe(false);
    expect(file.entries.find((entry) => entry.id === entryId)?.categoryId).toBe(target!.id);

    const deleteSourceFile = await store.createPromptCategory({ name: "待删除分类" });
    const deleteSource = deleteSourceFile.categories.find((category) => category.name === "待删除分类")!;
    file = await store.createPrompt({ title: "待迁移", content: "迁移正文", categoryId: deleteSource.id });
    const migrateId = file.entries[0].id;
    file = await store.deletePromptCategory({ id: deleteSource.id, targetCategoryId: target!.id });
    expect(file.entries.find((entry) => entry.id === migrateId)?.categoryId).toBe(target!.id);
    expect(file.categories.some((category) => category.id === deleteSource.id)).toBe(false);
  });
});

describe("提示词库纯函数", () => {
  it("颜色按 id 稳定，手动颜色优先", async () => {
    const { getPromptColor } = await import("../../src/features/prompts/utils/promptColors");
    expect(getPromptColor("stable-id")).toBe(getPromptColor("stable-id"));
    expect(getPromptColor("stable-id", "orange")).toBe("clay");
  });

  it("剪贴板文本可按空行拆分并生成标题", async () => {
    const { parseClipboardPromptText, derivePromptTitle } = await import("../../src/features/prompts/utils/promptClipboardParser");
    expect(parseClipboardPromptText(" 第一行\n正文\n\n第二条")).toEqual([
      { title: "第一行", content: "第一行\n正文" },
      { title: "第二条", content: "第二条" },
    ]);
    expect(derivePromptTitle("a".repeat(60))).toBe(`${"a".repeat(50)}…`);
  });

  it("脱敏只改变输出，不改变原文并覆盖常见凭据", async () => {
    const { findSensitiveMatches, redactPrompt } = await import("../../src/features/prompts/utils/promptRedaction");
    const original = "email alice@example.com password=secret Bearer abcdefgh sk-test_12345678";
    const redacted = redactPrompt(original);
    expect(redacted).not.toBe(original);
    expect(original).toContain("secret");
    expect(redacted).toContain("a***@example.com");
    expect(redacted).toContain("password=******");
    expect(redacted).toContain("Bearer ******");
    expect(findSensitiveMatches(original).length).toBeGreaterThanOrEqual(4);
  });

  it("脱敏覆盖身份证号、中文密码、OAuth 令牌、信用卡、访问令牌和更多 API 密钥格式", async () => {
    const { findSensitiveMatches, redactPrompt } = await import("../../src/features/prompts/utils/promptRedaction");
    const original = [
      "身份证 110101199001011234 号",
      "密码=mySecret123",
      "密钥=abc123",
      "OAuth 令牌 ya29.abcdefghijk",
      "GitHub 令牌 ghp_example1234567890abcdefghijklmnopqrstuvwxyz456",
      "信用卡 345678901234567",
      "access_token=at-secret123",
      "https://example.com/api?key=supersecret123",
      "hf_abcdefghijklmnopqrst",
      "AIzaSyDexample1234567890hij",
    ].join("\n");
    const redacted = redactPrompt(original);
    // 身份证脱敏（先于银行卡规则命中 18 位号码）
    expect(redacted).toContain("110***********1234");
    expect(redacted).not.toContain("19900101");
    // 中文密码/密钥脱敏
    expect(redacted).toContain("密码=******");
    expect(redacted).not.toContain("mySecret123");
    expect(redacted).toContain("密钥=abc****123");
    expect(redacted).not.toContain("密钥=abc123");
    // OAuth 令牌脱敏
    expect(redacted).toContain("ya29.abc****");
    expect(redacted).not.toContain("abcdefghijk");
    // GitHub token 脱敏
    expect(redacted).toContain("ghp****456");
    // 信用卡脱敏（AmEx 15 位，命中 credit-card 规则）
    expect(redacted).toContain("**** **** **** 4567");
    // 访问令牌脱敏
    expect(redacted).toContain("access_token=******");
    expect(redacted).not.toContain("at-secret123");
    // URL 查询参数脱敏
    expect(redacted).toContain("key=******");
    // HuggingFace token 脱敏
    expect(redacted).toContain("hf_****rst");
    // Google API key 脱敏
    expect(redacted).toContain("AIz****hij");
    // 原文不被修改
    expect(original).toContain("mySecret123");
    expect(original).toContain("19900101");
    const matches = findSensitiveMatches(original);
    expect(matches.length).toBeGreaterThanOrEqual(10);
    // 验证所有匹配类型
    const types = matches.map((match) => match.type);
    expect(types).toContain("id-card");
    expect(types).toContain("password");
    expect(types).toContain("oauth-token");
    expect(types).toContain("url-secret");
    expect(types).toContain("api-key");
    expect(types).toContain("credit-card");
    expect(types).toContain("access-token");
  });

  it("识别中文冒号后的裸密钥并只显示首尾片段", async () => {
    const { findSensitiveMatches, redactPrompt } = await import("../../src/features/prompts/utils/promptRedaction");
    const original = "网站： https://nsfw.nihaox.cc 密钥： 38cbf3b7ea9d7f87";
    const redacted = redactPrompt(original);

    expect(findSensitiveMatches(original).map((match) => match.type)).toEqual(expect.arrayContaining(["url", "password"]));
    expect(redacted).toContain("https://nsfw****.cc");
    expect(redacted).toContain("密钥： 38c****f87");
    expect(redacted).not.toContain("38cbf3b7ea9d7f87");
  });

  it("识别下划线 API Key 与邮箱配置中的账号密码", async () => {
    const { findSensitiveMatches, redactPrompt } = await import("../../src/features/prompts/utils/promptRedaction");
    const original = "API Key: ak_oUhLg9ybD8i5y1BqPtpSVlKamHFmz\n邮箱地址：1504481883\n邮箱密码：12345.678910aaa";
    const redacted = redactPrompt(original);

    expect(findSensitiveMatches(original).map((match) => match.type)).toEqual(expect.arrayContaining(["api-key", "account-id", "password"]));
    expect(redacted).toContain("ak_****Fmz");
    expect(redacted).toContain("邮箱地址：15****83");
    expect(redacted).toContain("邮箱密码：******");
    expect(redacted).not.toContain("ak_oUhLg9ybD8i5y1BqPtpSVlKamHFmz");
    expect(redacted).not.toContain("12345.678910aaa");
  });

  it("原位隐藏环境变量密钥和本地路径", async () => {
    const { findSensitiveMatches, redactPrompt } = await import("../../src/features/prompts/utils/promptRedaction");
    const original = "$env:JWT_SECRET=\"suyan-local-dev-secret-change-me\"\ncd W:\\提示词\\account-api";
    const redacted = redactPrompt(original);

    expect(findSensitiveMatches(original).map((match) => match.type)).toEqual(expect.arrayContaining(["password", "local-path"]));
    expect(redacted).toContain('$env:JWT_SECRET="******"');
    expect(redacted).toContain("cd W:\\****");
    expect(redacted).not.toContain("suyan-local-dev-secret-change-me");
    expect(redacted).not.toContain("W:\\提示词\\account-api");
  });
});
