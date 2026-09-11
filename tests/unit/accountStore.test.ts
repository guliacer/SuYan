import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ dataDir: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => state.dataDir },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: () => "",
    encryptString: (value: string) => Buffer.from(value, "utf8"),
  },
}));

import type { AccountFile } from "../../src/features/account/types/account";
import {
  createEmptyAccountFile,
  parseAccountFile,
  readAccountFile,
  writeAccountFile,
} from "../../electron/main/account/accountStore";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  state.dataDir = "";
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function withTempDir(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "suyan-account-store-"),
  );
  temporaryDirectories.push(directory);
  state.dataDir = directory;
  return directory;
}

function sampleAccountFile(): AccountFile {
  return {
    schemaVersion: 1,
    user: { uid: "u-1", username: "素言用户" },
    provider: "guli",
    loginProvider: null,
    tokenEncrypted: "c2VjcmV0LXRva2Vu",
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
}

describe("accountStore", () => {
  it.each(["email", "google", "linuxdo", "github", "device"] as const)("%s 登录历史不依赖有效会话即可读回", async (method) => {
    await withTempDir();
    await writeAccountFile({ ...createEmptyAccountFile(), lastLoginMethod: method });
    expect(await readAccountFile()).toMatchObject({ user: null, lastLoginMethod: method });
  });

  it("历史字段损坏不会使有效账号缓存丢失", () => {
    for (const value of ["unknown", {}, ["github"], 123, null]) {
      const parsed = parseAccountFile(JSON.stringify({ ...sampleAccountFile(), lastLoginMethod: value }));
      expect(parsed?.user?.uid).toBe("u-1");
      expect(parsed?.lastLoginMethod).toBeUndefined();
    }
  });
  it("缺失 account.json 时返回 null（未登录，不抛错）", async () => {
    await withTempDir();
    expect(await readAccountFile()).toBeNull();
  });

  it("写入后可读回，磁盘保留加密 token 与明文用户信息", async () => {
    const directory = await withTempDir();
    const file = sampleAccountFile();
    await writeAccountFile(file);

    const reloaded = await readAccountFile();
    expect(reloaded).toEqual(file);

    const accountPath = path.join(directory, "library", "account.json");
    const disk = JSON.parse(await fs.readFile(accountPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(disk.schemaVersion).toBe(1);
    expect(disk.tokenEncrypted).toBe("c2VjcmV0LXRva2Vu");
    expect(JSON.stringify(disk)).not.toContain("secret");
  });

  it("损坏 JSON 被隔离为 account.json.corrupt-* 并回到未登录", async () => {
    const directory = await withTempDir();
    const accountPath = path.join(directory, "library", "account.json");
    await fs.mkdir(path.dirname(accountPath), { recursive: true });
    await fs.writeFile(accountPath, "{ 这不是合法 JSON", "utf8");

    expect(await readAccountFile()).toBeNull();

    const entries = await fs.readdir(path.dirname(accountPath));
    const corrupt = entries.find((entry) =>
      entry.startsWith("account.json.corrupt-"),
    );
    expect(corrupt).toBeTruthy();
    expect(entries).not.toContain("account.json");
  });

  it("不支持的 schemaVersion 同样隔离为损坏", async () => {
    const directory = await withTempDir();
    const accountPath = path.join(directory, "library", "account.json");
    await fs.mkdir(path.dirname(accountPath), { recursive: true });
    await fs.writeFile(
      accountPath,
      JSON.stringify({ schemaVersion: 99, user: null }),
      "utf8",
    );

    expect(await readAccountFile()).toBeNull();
    const entries = await fs.readdir(path.dirname(accountPath));
    expect(
      entries.some((entry) => entry.startsWith("account.json.corrupt-")),
    ).toBe(true);
  });

  it("parseAccountFile 只接受 email / guli，拒绝旧 provider、坏 JSON 与未知 schema", () => {
    expect(
      parseAccountFile(
        JSON.stringify({ schemaVersion: 1, user: null, provider: null }),
      ),
    ).not.toBeNull();
    expect(
      parseAccountFile(
        JSON.stringify({
          schemaVersion: 1,
          user: { uid: "a", username: "b" },
          provider: "twitter",
        }),
      ),
    ).toBeNull();
    expect(
      parseAccountFile(
        JSON.stringify({
          schemaVersion: 1,
          user: { uid: "a", username: "b" },
          provider: "wechat",
        }),
      ),
    ).toBeNull();
    expect(
      parseAccountFile(JSON.stringify({ schemaVersion: 2, user: null })),
    ).toBeNull();
    expect(parseAccountFile("not json")).toBeNull();
  });

  it("读取历史微信 account.json 时直接删除，不再恢复旧身份", async () => {
    const directory = await withTempDir();
    const accountPath = path.join(directory, "library", "account.json");
    await fs.mkdir(path.dirname(accountPath), { recursive: true });
    await fs.writeFile(
      accountPath,
      JSON.stringify({
        schemaVersion: 1,
        user: {
          uid: "a",
          username: "b",
          identities: [{ provider: "wechat", providerUserId: "wx-old" }],
        },
        provider: "wechat",
      }),
      "utf8",
    );

    expect(await readAccountFile()).toBeNull();
    await expect(fs.access(accountPath)).rejects.toThrow();
  });

  it("Guli 文件残留不支持的 identity 时也直接删除", async () => {
    const directory = await withTempDir();
    const accountPath = path.join(directory, "library", "account.json");
    await fs.mkdir(path.dirname(accountPath), { recursive: true });
    await fs.writeFile(
      accountPath,
      JSON.stringify({
        schemaVersion: 1,
        user: {
          uid: "a",
          username: "b",
          identities: [
            { provider: "guli", providerUserId: "g-1" },
            { provider: "legacy-provider", providerUserId: "legacy-user" },
          ],
        },
        provider: "guli",
      }),
      "utf8",
    );

    expect(await readAccountFile()).toBeNull();
    await expect(fs.access(accountPath)).rejects.toThrow();
  });

  it("当前 Guli account.json 会保留身份字段并过滤未知 identity", () => {
    const parsed = parseAccountFile(
      JSON.stringify({
        schemaVersion: 1,
        user: {
          uid: "a",
          username: "b",
          identities: [
            {
              provider: "guli",
              issuer: "https://auth.example.test",
              providerUserId: "g-1",
            },
            { provider: "wechat", providerUserId: "wx-old" },
          ],
        },
        provider: "guli",
      }),
    );

    expect(parsed?.provider).toBe("guli");
    expect(parsed?.user?.identities).toEqual([
      {
        provider: "guli",
        issuer: "https://auth.example.test",
        providerUserId: "g-1",
      },
    ]);
  });

  it("createEmptyAccountFile 产生未登录结构", () => {
    const empty = createEmptyAccountFile();
    expect(empty.schemaVersion).toBe(1);
    expect(empty.user).toBeNull();
    expect(empty.provider).toBeNull();
    expect(empty.tokenEncrypted).toBeUndefined();
  });
});
