import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "" }));
vi.mock("electron", () => ({
  app: { getPath: () => state.dataDir },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: () => "",
    encryptString: (value: string) => Buffer.from(value, "utf8"),
  },
  shell: { openExternal: async () => undefined },
}));

import type { LibraryItem } from "../../src/features/library/types/library";
import type { AuthorInfo } from "../../src/features/account/types/account";
import {
  buildArchiveManifest,
  type ArchiveManifest,
} from "../../electron/main/library/archiveStore";
import {
  buildPromptExchangePayload,
  readPromptExchangePayload,
} from "../../electron/main/library/promptStore";

const author: AuthorInfo = { uid: "u-1", username: "素言用户", avatarUrl: "https://example.com/a.png" };

function makeItem(): LibraryItem {
  return {
    id: "i-1",
    title: "示例素材",
    imageFileName: "i-1.png",
    mediaStorage: "managed",
    prompt: "示例提示词",
    negativePrompt: "",
    tags: [],
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

describe("导出 author 注入（方案 §十七/§十八/§二十九）", () => {
  it("ZIP 清单：已登录导出携带 author，schemaVersion=2", () => {
    const manifest = buildArchiveManifest([makeItem()], author);
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.author).toEqual(author);
  });

  it("ZIP 清单：未登录导出不含 author 字段（旧版导入器不受影响）", () => {
    const manifest = buildArchiveManifest([makeItem()], null);
    expect(manifest.schemaVersion).toBe(2);
    expect("author" in manifest).toBe(false);
  });

  it("灵感库 JSON：已登录导出携带 author，未登录省略", () => {
    const file = { schemaVersion: 2 as const, updatedAt: "", entries: [], categories: [] };
    const loggedIn = buildPromptExchangePayload(file, author);
    expect(loggedIn.schemaVersion).toBe(2);
    expect(loggedIn.author).toEqual(author);

    const anonymous = buildPromptExchangePayload(file, null);
    expect("author" in anonymous).toBe(false);
  });

  it("旧 v1 灵感库 JSON 仍可导入（author 缺省兼容）", () => {
    const file = readPromptExchangePayload({
      schemaVersion: 1,
      kind: "suyan-inspiration-library",
      exportedAt: "2026-08-20T00:00:00.000Z",
      entries: [{ id: "e1", title: "灵感", content: "正文", tagIds: [] }],
      categories: [],
    });
    expect(file.entries).toHaveLength(1);
  });

  it("新 v2 灵感库 JSON（携带 author）可导入且忽略 author 字段", () => {
    const file = readPromptExchangePayload({
      schemaVersion: 2,
      kind: "suyan-inspiration-library",
      exportedAt: "2026-08-20T00:00:00.000Z",
      author,
      entries: [{ id: "e1", title: "灵感", content: "正文", tagIds: [] }],
      categories: [],
    });
    expect(file.entries).toHaveLength(1);
  });

  it("ZIP 清单结构与 LibraryFile 兼容（v1 导入器只读 items 仍成立）", () => {
    const manifest: ArchiveManifest = buildArchiveManifest([makeItem()], author);
    expect(Array.isArray(manifest.items)).toBe(true);
    expect(manifest.items[0].id).toBe("i-1");
    expect(typeof manifest.updatedAt).toBe("string");
  });
});
