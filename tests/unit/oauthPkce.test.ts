import { describe, expect, it } from "vitest";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  safeEqual,
} from "../../electron/main/account/oauth/pkce";

describe("oauth pkce", () => {
  it("生成 RFC 7636 兼容的 code_verifier（43 字符，base64url）", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true);
  });

  it("code_challenge 是 verifier 的 S256 base64url，且稳定、不同 verifier 结果不同", () => {
    const v1 = generateCodeVerifier();
    const v2 = generateCodeVerifier();

    expect(generateCodeChallenge(v1)).toBe(generateCodeChallenge(v1));
    expect(generateCodeChallenge(v1)).not.toBe(generateCodeChallenge(v2));
    expect(generateCodeChallenge(v1).length).toBe(43);
  });

  it("state 是随机 base64url 且唯一", () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).not.toBe(b);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it("safeEqual 安全比较：相等为 true，不等为 false，长度不同为 false", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
