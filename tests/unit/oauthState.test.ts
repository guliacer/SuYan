import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPendingOAuthSession,
  cancelActivePendingOAuthSession,
  clearPendingOAuthSessions,
  consumePendingOAuthSession,
  OAUTH_SESSION_TTL_MS,
  peekPendingOAuthSession,
  putPendingOAuthSession,
  resetOAuthStateForTests,
} from "../../electron/main/account/oauth/oauthState";

beforeEach(() => {
  resetOAuthStateForTests();
  vi.restoreAllMocks();
});

describe("oauthState", () => {
  it("登记后可 peek 到挂起会话，含 TTL", () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "s1",
      nonce: "n1",
      codeVerifier: "v1",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    const session = peekPendingOAuthSession("s1");
    expect(session?.provider).toBe("guli");
    expect(session?.codeVerifier).toBe("v1");
    expect(session?.nonce).toBe("n1");
    expect(session?.redirectUri).toBe("suyan://oauth/callback");
    expect(session!.expiresAt - session!.createdAt).toBe(OAUTH_SESSION_TTL_MS);
  });

  it("consume 是单次使用：首次取出后再次为 null", () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "s2",
      nonce: "n2",
      codeVerifier: "v2",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    expect(consumePendingOAuthSession("s2")?.provider).toBe("guli");
    expect(peekPendingOAuthSession("s2")).toBeNull();
    expect(consumePendingOAuthSession("s2")).toBeNull();
  });

  it("未知 / 已过期 state → null", () => {
    expect(consumePendingOAuthSession("missing")).toBeNull();
  });

  it("cancel 删除挂起会话，返回是否删除", () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "s3",
      nonce: "n3",
      codeVerifier: "v3",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    expect(cancelPendingOAuthSession("s3")).toBe(true);
    expect(peekPendingOAuthSession("s3")).toBeNull();
    expect(cancelPendingOAuthSession("s3")).toBe(false);
  });

  it("cancelActivePendingOAuthSession 只取消当前浏览器事务", () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "active",
      nonce: "n-active",
      codeVerifier: "v-active",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });

    expect(cancelActivePendingOAuthSession()).toBe(true);
    expect(peekPendingOAuthSession("active")).toBeNull();
    expect(cancelActivePendingOAuthSession()).toBe(false);
  });

  it("新的一次发起覆盖旧的（旧 state 失效）", () => {
    putPendingOAuthSession({
      provider: "guli",
      state: "old",
      nonce: "no",
      codeVerifier: "vo",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    putPendingOAuthSession({
      provider: "guli",
      state: "old",
      nonce: "nn",
      codeVerifier: "vn",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    });
    expect(consumePendingOAuthSession("old")?.codeVerifier).toBe("vn");
  });

  it("clearPendingOAuthSessions 清空全部", () => {
    const base = {
      provider: "guli" as const,
      nonce: "n",
      redirectUri: "suyan://oauth/callback",
      issuer: "https://auth.example.test",
    };
    putPendingOAuthSession({ ...base, state: "a", codeVerifier: "x" });
    putPendingOAuthSession({ ...base, state: "b", codeVerifier: "y" });
    clearPendingOAuthSessions();
    expect(peekPendingOAuthSession("a")).toBeNull();
    expect(peekPendingOAuthSession("b")).toBeNull();
  });
});
