import { createHash, randomBytes } from "node:crypto";

/**
 * OAuth PKCE + state 工具（方案 §七）：
 * - code_verifier：128 位随机，base64url 编码（43 字符，符合 RFC 7636）；\
 * - code_challenge：S256 = base64url(SHA-256(verifier))；\
 * - state：128 位随机，base64url 编码，防 CSRF。
 *
 * verifier/state 只存在于主进程内存（oauthState），不得落盘、不得进日志。
 */

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier, "utf8").digest());
}

export function generateOAuthState(): string {
  return base64Url(randomBytes(32));
}

/** 安全比较：防时序侧信道（state 校验用）。 */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < aBuf.length; i += 1) {
    result |= aBuf[i] ^ bBuf[i];
  }
  return result === 0;
}
