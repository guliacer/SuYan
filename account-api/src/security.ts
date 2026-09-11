import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ApiError, unauthorized } from "./errors.js";
import { ACCOUNT_ERROR_CODES } from "./errors.js";

/**
 * 安全原语（零依赖，node:crypto）：
 * - 密码：scrypt（随机盐，N=16384 参数编码进哈希串）；
 * - accessToken：HS256 JWT（sub=uid, iat, exp），secret 来自配置；
 * - refreshToken / 验证码：256 位随机，DB 中只存 SHA-256 哈希；
 * - PKCE：S256 code_challenge 校验（防时序比较）。
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) {
    return false;
  }
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64!, "base64");
    const expected = Buffer.from(hashB64!, "base64");
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---- JWT (HS256) ----

type JwtClaims = {
  sub: string;
  iat: number;
  exp: number;
};

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function signAccessToken(secret: string, uid: string, ttlMs: number): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({ sub: uid, iat: now, exp: now + Math.floor(ttlMs / 1000) } satisfies JwtClaims);
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/** 校验并解析 JWT；无效/过期抛 401 TOKEN_INVALID/TOKEN_EXPIRED。 */
export function verifyAccessToken(secret: string, token: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw unauthorized("访问令牌无效。");
  }
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature!), Buffer.from(expected))) {
    throw unauthorized("访问令牌签名无效。");
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as JwtClaims;
  } catch {
    throw unauthorized("访问令牌无效。");
  }

  if (typeof claims.sub !== "string" || typeof claims.exp !== "number") {
    throw unauthorized("访问令牌无效。");
  }
  if (claims.exp * 1000 <= Date.now()) {
    throw new ApiError(ACCOUNT_ERROR_CODES.TOKEN_EXPIRED, "访问令牌已过期。", 401);
  }
  return claims;
}

// ---- PKCE ----

export function verifyPkce(verifier: string, challenge: string): boolean {
  const actual = createHash("sha256").update(verifier, "utf8").digest("base64url");
  const expected = Buffer.from(challenge, "utf8");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, "utf8"), expected);
}
