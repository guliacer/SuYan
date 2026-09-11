import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ encryptionAvailable: true }));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, "utf8"),
    decryptString: (buffer: Buffer) => {
      const value = buffer.toString("utf8");
      if (!value.startsWith("enc:")) {
        throw new Error("invalid ciphertext");
      }
      return value.slice("enc:".length);
    },
  },
}));

import {
  decryptAccountTokenPayload,
  encryptAccountTokenPayload,
} from "../../electron/main/account/accountCrypto";

const samplePayload = {
  accessToken: "at-123",
  refreshToken: "rt-456",
  expiresAt: 1_800_000_000_000,
};

describe("accountCrypto", () => {
  it("safeStorage 可用时：加密后无明文，解密还原 payload", () => {
    state.encryptionAvailable = true;
    const encoded = encryptAccountTokenPayload(samplePayload);

    expect(encoded).not.toContain("at-123");
    expect(encoded).not.toContain("rt-456");
    expect(encoded.startsWith("dev1:")).toBe(false);
    expect(decryptAccountTokenPayload(encoded)).toEqual(samplePayload);
  });

  it("safeStorage 不可用时：退化为 dev1: 本地编码且可逆", () => {
    state.encryptionAvailable = false;
    const encoded = encryptAccountTokenPayload(samplePayload);

    expect(encoded.startsWith("dev1:")).toBe(true);
    expect(encoded).not.toContain("at-123");
    expect(decryptAccountTokenPayload(encoded)).toEqual(samplePayload);
  });

  it("空值 / 损坏密文 / 非 JSON / 结构不合法都返回 null", () => {
    state.encryptionAvailable = true;
    expect(decryptAccountTokenPayload("")).toBeNull();
    expect(decryptAccountTokenPayload("   ")).toBeNull();
    expect(decryptAccountTokenPayload("not-base64!!")).toBeNull();

    const plainBase64 = Buffer.from("hello", "utf8").toString("base64");
    expect(decryptAccountTokenPayload(plainBase64)).toBeNull();

    const wrongShape = Buffer.from(JSON.stringify({ accessToken: "a" }), "utf8").toString("base64");
    expect(decryptAccountTokenPayload(wrongShape)).toBeNull();

    const wrongShape2 = Buffer.from(JSON.stringify({ accessToken: "a", refreshToken: "b", expiresAt: "x" }), "utf8").toString("base64");
    expect(decryptAccountTokenPayload(wrongShape2)).toBeNull();
  });

  it("dev1 前缀数据也能被解密（跨启动兼容）", () => {
    state.encryptionAvailable = false;
    const encoded = encryptAccountTokenPayload(samplePayload);
    state.encryptionAvailable = true;
    expect(decryptAccountTokenPayload(encoded)).toEqual(samplePayload);
  });
});
