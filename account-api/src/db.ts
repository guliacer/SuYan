import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ApiError } from "./errors.js";
import { ACCOUNT_ERROR_CODES } from "./errors.js";
import type { Config } from "./config.js";

/**
 * SQLite 存储（node:sqlite，零外部依赖；Node ≥ 22.5）。
 * 表：
 * - users：SuYan 用户（uid / email / password_hash / 资料）；
 * - identities：多 Identity 绑定（provider + providerUserId → user）；
 * - refresh_tokens：refresh token 轮换（存哈希，可吊销）；
 * - email_verifications：邮件验证占位 token；
 * - oauth_codes：OAuth 授权码（单次使用 + PKCE challenge）。
 */

export type UserRow = {
  uid: string;
  email: string | null;
  password_hash: string | null;
  username: string;
  avatar_url: string | null;
  email_verified: number;
  created_at: string;
  updated_at: string;
};

export type IdentityRow = {
  provider: string;
  provider_user_id: string;
  user_uid: string;
  linked_at: string;
};

export class AccountDb {
  private db: DatabaseSync;

  constructor(private readonly config: Config) {
    if (config.dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(config.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        username TEXT NOT NULL,
        avatar_url TEXT,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS identities (
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        linked_at TEXT NOT NULL,
        PRIMARY KEY (provider, provider_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_uid);
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        user_uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS email_verifications (
        token TEXT PRIMARY KEY,
        user_uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS oauth_codes (
        code_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  // ---- users ----
  findUserByEmail(email: string): UserRow | null {
    return this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | null;
  }

  findUserByUid(uid: string): UserRow | null {
    return this.db.prepare("SELECT * FROM users WHERE uid = ?").get(uid) as UserRow | null;
  }

  createUser(row: Omit<UserRow, "created_at" | "updated_at"> & { createdAt: string; updatedAt: string }): UserRow {
    this.db
      .prepare(
        `INSERT INTO users (uid, email, password_hash, username, avatar_url, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.uid, row.email, row.password_hash, row.username, row.avatar_url, row.email_verified, row.createdAt, row.updatedAt);
    return this.findUserByUid(row.uid)!;
  }

  updateUserEmailVerified(uid: string, verified: boolean): void {
    this.db
      .prepare("UPDATE users SET email_verified = ?, updated_at = ? WHERE uid = ?")
      .run(verified ? 1 : 0, new Date().toISOString(), uid);
  }

  // ---- identities ----
  findIdentity(provider: string, providerUserId: string): IdentityRow | null {
    return this.db
      .prepare("SELECT * FROM identities WHERE provider = ? AND provider_user_id = ?")
      .get(provider, providerUserId) as IdentityRow | null;
  }

  listIdentities(userUid: string): IdentityRow[] {
    return this.db.prepare("SELECT * FROM identities WHERE user_uid = ?").all(userUid) as IdentityRow[];
  }

  createIdentity(provider: string, providerUserId: string, userUid: string): void {
    this.db
      .prepare("INSERT INTO identities (provider, provider_user_id, user_uid, linked_at) VALUES (?, ?, ?, ?)")
      .run(provider, providerUserId, userUid, new Date().toISOString());
  }

  deleteIdentity(provider: string, providerUserId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM identities WHERE provider = ? AND provider_user_id = ?")
      .run(provider, providerUserId);
    return result.changes > 0;
  }

  // ---- refresh tokens ----
  insertRefreshToken(tokenHash: string, userUid: string, expiresAt: number): void {
    this.db
      .prepare("INSERT INTO refresh_tokens (token_hash, user_uid, expires_at, created_at, revoked) VALUES (?, ?, ?, ?, 0)")
      .run(tokenHash, userUid, expiresAt, new Date().toISOString());
  }

  consumeRefreshToken(tokenHash: string): { user_uid: string; expires_at: number; revoked: number } | null {
    const row = this.db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(tokenHash) as
      | { user_uid: string; expires_at: number; revoked: number }
      | undefined;
    if (!row) {
      return null;
    }
    // 轮换：无论成败，旧 token 立即失效（防重放）。
    this.db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?").run(tokenHash);
    return row;
  }

  revokeAllRefreshTokens(userUid: string): void {
    this.db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_uid = ? AND revoked = 0").run(userUid);
  }

  // ---- email verification ----
  insertEmailVerification(token: string, userUid: string, expiresAt: number): void {
    this.db
      .prepare("INSERT INTO email_verifications (token, user_uid, expires_at, used) VALUES (?, ?, ?, 0)")
      .run(token, userUid, expiresAt);
  }

  consumeEmailVerification(token: string): { user_uid: string; expires_at: number } | null {
    const row = this.db.prepare("SELECT * FROM email_verifications WHERE token = ? AND used = 0").get(token) as
      | { user_uid: string; expires_at: number }
      | undefined;
    if (!row) {
      return null;
    }
    this.db.prepare("UPDATE email_verifications SET used = 1 WHERE token = ?").run(token);
    return row;
  }

  // ---- oauth codes ----
  insertOAuthCode(codeHash: string, provider: string, providerUserId: string, challenge: string, redirectUri: string, expiresAt: number): void {
    this.db
      .prepare(
        "INSERT INTO oauth_codes (code_hash, provider, provider_user_id, code_challenge, redirect_uri, expires_at, used) VALUES (?, ?, ?, ?, ?, ?, 0)",
      )
      .run(codeHash, provider, providerUserId, challenge, redirectUri, expiresAt);
  }

  consumeOAuthCode(codeHash: string): { provider: string; provider_user_id: string; code_challenge: string; redirect_uri: string; expires_at: number } | null {
    const row = this.db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ? AND used = 0").get(codeHash) as
      | {
          provider: string;
          provider_user_id: string;
          code_challenge: string;
          redirect_uri: string;
          expires_at: number;
        }
      | undefined;
    if (!row) {
      return null;
    }
    this.db.prepare("UPDATE oauth_codes SET used = 1 WHERE code_hash = ?").run(codeHash);
    return row;
  }
}

export function openAccountDb(config: Config): AccountDb {
  try {
    return new AccountDb(config);
  } catch (error) {
    throw new ApiError(
      ACCOUNT_ERROR_CODES.STORAGE_ERROR,
      `数据库打开失败：${error instanceof Error ? error.message : String(error)}`,
      500,
    );
  }
}
