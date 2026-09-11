import { randomUUID } from "node:crypto";
import type { AccountDb, IdentityRow, UserRow } from "./db.js";
import type { Config } from "./config.js";
import { ApiError, badRequest, notFound, unauthorized } from "./errors.js";
import { ACCOUNT_ERROR_CODES } from "./errors.js";
import {
  hashPassword,
  randomToken,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./security.js";

/**
 * 认证业务（方案 §四/§十五/§二十五）：
 * - 统一 User + 多 Identity：第三方 provider 的用户 ID 只属于 identity；
 * - refresh token 轮换：每次刷新吊销旧 token 并签发新 token，防重放；
 * - 邮件验证占位：EMAIL_VERIFY_MODE=auto 注册即验证；token 模式走验证链接。
 */

export type PublicUser = {
  uid: string;
  username: string;
  avatarUrl?: string;
  email?: string;
  emailVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
  identities?: Array<{ provider: string; providerUserId: string; linkedAt?: string }>;
};

export type Session = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type RegisterInput = { email: string; password: string };
export type LoginInput = { email: string; password: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AuthService {
  constructor(
    private readonly db: AccountDb,
    private readonly config: Config,
  ) {}

  // ---- register / verify ----

  async register(input: RegisterInput): Promise<Session | { verificationRequired: true; devVerifyUrl?: string }> {
    const email = normalizeEmail(input.email);
    const password = input.password;

    if (!EMAIL_RE.test(email) || email.length > 254) {
      throw badRequest("邮箱格式不正确。");
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      throw badRequest("密码长度需为 6-128 位。");
    }
    if (this.db.findUserByEmail(email)) {
      throw new ApiError(ACCOUNT_ERROR_CODES.INVALID_CREDENTIALS, "该邮箱已注册，请直接登录。", 409);
    }

    const now = new Date().toISOString();
    const user = this.db.createUser({
      uid: randomUUID(),
      email,
      password_hash: hashPassword(password),
      username: email.split("@")[0] ?? "素言用户",
      avatar_url: null,
      email_verified: this.config.emailVerifyMode === "auto" ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    });

    if (this.config.emailVerifyMode === "auto") {
      return this.issueSession(user);
    }

    // 邮件验证占位：无 SMTP 服务，验证 token 写入 DB 并随响应返回（仅开发）。
    const verifyToken = randomToken();
    this.db.insertEmailVerification(sha256Hex(verifyToken), user.uid, Date.now() + 24 * 60 * 60 * 1000);
    console.log(`[email-placeholder] 发送验证邮件到 ${email}：/auth/verify-email?token=${verifyToken}`);
    return {
      verificationRequired: true,
      ...(this.config.dev ? { devVerifyUrl: `/auth/verify-email?token=${verifyToken}` } : {}),
    };
  }

  verifyEmail(token: string): PublicUser {
    if (!token) {
      throw badRequest("缺少验证令牌。");
    }
    const record = this.db.consumeEmailVerification(sha256Hex(token));
    if (!record) {
      throw new ApiError(ACCOUNT_ERROR_CODES.EMAIL_NOT_VERIFIED, "验证链接无效或已过期。", 400);
    }
    if (record.expires_at <= Date.now()) {
      throw new ApiError(ACCOUNT_ERROR_CODES.EMAIL_NOT_VERIFIED, "验证链接已过期。", 400);
    }
    this.db.updateUserEmailVerified(record.user_uid, true);
    return this.toPublicUser(this.db.findUserByUid(record.user_uid)!);
  }

  // ---- login / session ----

  login(input: LoginInput): Session {
    const email = normalizeEmail(input.email);
    const user = this.db.findUserByEmail(email);
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      throw new ApiError(ACCOUNT_ERROR_CODES.INVALID_CREDENTIALS, "邮箱或密码不正确。", 401);
    }
    if (!user.email_verified) {
      throw new ApiError(ACCOUNT_ERROR_CODES.EMAIL_NOT_VERIFIED, "邮箱尚未验证，请先完成邮箱验证。", 403);
    }
    return this.issueSession(user);
  }

  me(accessToken: string): PublicUser {
    const claims = verifyAccessToken(this.config.jwtSecret, accessToken);
    const user = this.db.findUserByUid(claims.sub);
    if (!user) {
      throw unauthorized("用户不存在。");
    }
    return this.toPublicUser(user);
  }

  refresh(refreshToken: string): Session {
    if (!refreshToken) {
      throw new ApiError(ACCOUNT_ERROR_CODES.REFRESH_FAILED, "缺少刷新令牌。", 401);
    }
    const record = this.db.consumeRefreshToken(sha256Hex(refreshToken));
    if (!record) {
      throw new ApiError(ACCOUNT_ERROR_CODES.REFRESH_FAILED, "刷新令牌无效或已使用。", 401);
    }
    if (record.revoked || record.expires_at <= Date.now()) {
      throw new ApiError(ACCOUNT_ERROR_CODES.REFRESH_FAILED, "刷新令牌已失效，请重新登录。", 401);
    }
    const user = this.db.findUserByUid(record.user_uid);
    if (!user) {
      throw unauthorized("用户不存在。");
    }
    return this.issueSession(user);
  }

  logout(accessToken: string, refreshToken?: string): { loggedOut: true } {
    // 登出清除当前用户全部 refresh token（含轮换后仍存活的历史 token）。
    const claims = verifyAccessToken(this.config.jwtSecret, accessToken);
    const user = this.db.findUserByUid(claims.sub);
    if (!user) {
      throw unauthorized("用户不存在。");
    }
    if (refreshToken) {
      this.db.consumeRefreshToken(sha256Hex(refreshToken));
    }
    this.db.revokeAllRefreshTokens(user.uid);
    return { loggedOut: true };
  }

  // ---- link / unlink（方案 §十五：不自动按邮箱合并） ----

  /** 绑定已通过 OAuth 校验的第三方身份到当前用户（identity 已归属他人时拒绝）。 */
  attachOAuthIdentity(accessToken: string, provider: string, providerUserId: string): PublicUser {
    const claims = verifyAccessToken(this.config.jwtSecret, accessToken);
    const user = this.db.findUserByUid(claims.sub);
    if (!user) {
      throw unauthorized("用户不存在。");
    }
    if (!providerUserId) {
      throw badRequest("缺少第三方用户标识。");
    }

    const existing = this.db.findIdentity(provider, providerUserId);
    if (existing && existing.user_uid !== user.uid) {
      // 关键安全规则（方案 §十五 情况 C）：绝不能仅凭邮箱自动合并。
      throw new ApiError(
        ACCOUNT_ERROR_CODES.LINK_CONFIRM_REQUIRED,
        "该第三方账号已绑定其他用户，需要先验证已有账号后才能确认绑定。",
        409,
      );
    }
    if (existing?.user_uid === user.uid) {
      return this.toPublicUser(user);
    }
    this.db.createIdentity(provider, providerUserId, user.uid);
    return this.toPublicUser(user);
  }

  unlinkIdentity(accessToken: string, providerRaw: string): PublicUser {
    const claims = verifyAccessToken(this.config.jwtSecret, accessToken);
    const user = this.db.findUserByUid(claims.sub);
    if (!user) {
      throw unauthorized("用户不存在。");
    }
    const provider = normalizeProvider(providerRaw);
    const identities = this.db.listIdentities(user.uid);
    const target = identities.find((identity) => identity.provider === provider);
    if (!target) {
      throw notFound("该第三方账号未绑定。");
    }
    this.db.deleteIdentity(provider, target.provider_user_id);
    return this.toPublicUser(user);
  }

  // ---- helpers ----

  /** 签发完整会话（OAuthService 代交换复用）。 */
  issueSession(user: UserRow): Session {
    const refreshToken = randomToken();
    const expiresAt = Date.now() + this.config.refreshTokenTtlMs;
    this.db.insertRefreshToken(sha256Hex(refreshToken), user.uid, expiresAt);

    return {
      user: this.toPublicUser(user),
      accessToken: signAccessToken(this.config.jwtSecret, user.uid, this.config.accessTokenTtlMs),
      refreshToken,
      expiresAt: Date.now() + this.config.accessTokenTtlMs,
    };
  }

  toPublicUser(user: UserRow | null): PublicUser {
    if (!user) {
      throw unauthorized("用户不存在。");
    }
    const identities: IdentityRow[] = this.db.listIdentities(user.uid);
    return {
      uid: user.uid,
      username: user.username,
      ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
      ...(user.email ? { email: user.email } : {}),
      emailVerified: user.email_verified === 1,
      ...(user.created_at ? { createdAt: user.created_at } : {}),
      ...(user.updated_at ? { updatedAt: user.updated_at } : {}),
      identities: identities.map((identity) => ({
        provider: identity.provider,
        providerUserId: identity.provider_user_id,
        linkedAt: identity.linked_at,
      })),
    };
  }

  /** 为 OAuth 登录查找或创建用户（identity 不存在则新建 SuYan 用户）。 */
  resolveOrCreateOAuthUser(provider: string, providerUserId: string, preferredUsername: string): UserRow {
    const identity = this.db.findIdentity(provider, providerUserId);
    if (identity) {
      const user = this.db.findUserByUid(identity.user_uid);
      if (user) {
        return user;
      }
    }

    const now = new Date().toISOString();
    const user = this.db.createUser({
      uid: randomUUID(),
      email: null,
      password_hash: null,
      username: preferredUsername || `${providerLabel(provider)}用户`,
      avatar_url: null,
      email_verified: 1,
      createdAt: now,
      updatedAt: now,
    });
    this.db.createIdentity(provider, providerUserId, user.uid);
    return user;
  }
}

function normalizeEmail(email: string): string {
  if (typeof email !== "string") {
    throw badRequest("邮箱格式不正确。");
  }
  return email.trim().toLowerCase();
}

function normalizeProvider(provider: string): string {
  const value = String(provider ?? "").trim();
  if (value !== "google" && value !== "linuxdo") {
    throw badRequest("不支持的登录渠道。");
  }
  return value;
}

function providerLabel(provider: string): string {
  switch (provider) {
    case "google":
      return "Google";
    case "linuxdo":
      return "Linux.do";
    default:
      return "第三方";
  }
}
