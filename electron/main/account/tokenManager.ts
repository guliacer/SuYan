import type { AccountTokenPayload } from "../../../src/features/account/types/account";

/**
 * access token / refresh token 的内存持有者（方案 §十）：
 * - token 只在主进程内存中存在，落盘前必须经 accountCrypto 加密；
 * - refreshIfNeeded 提供全局刷新锁：多个请求同时触发时共享同一次刷新，
 *   不会并发重复调用 refresh 端点；
 * - refreshToken 失效时由调用方清除登录态，本类不做无限重试。
 */
export class TokenManager {
  private payload: AccountTokenPayload | null = null;
  private refreshInFlight: Promise<AccountTokenPayload> | null = null;
  private sessionGeneration = 0;

  setPayload(payload: AccountTokenPayload | null): void {
    this.sessionGeneration += 1;
    this.payload = payload;
  }

  getPayload(): AccountTokenPayload | null {
    return this.payload;
  }

  clear(): void {
    this.sessionGeneration += 1;
    this.payload = null;
  }

  isExpired(nowMs: number = Date.now()): boolean {
    return this.payload === null || this.payload.expiresAt <= nowMs;
  }

  /**
   * 未过期直接返回当前 payload；已过期（或无 payload）时通过 refresher
   * 刷新一次并缓存结果，并发调用共享同一个刷新 Promise。
   */
  refreshIfNeeded(refresher: () => Promise<AccountTokenPayload>): Promise<AccountTokenPayload> {
    if (!this.isExpired() && this.payload) {
      return Promise.resolve(this.payload);
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const generation = this.sessionGeneration;
    this.refreshInFlight = refresher()
      .then((payload) => {
        if (generation !== this.sessionGeneration) {
          throw new StaleTokenRefreshError();
        }
        this.payload = payload;
        return payload;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    return this.refreshInFlight;
  }
}

/** A refresh result belonging to a session that has already been replaced. */
export class StaleTokenRefreshError extends Error {
  readonly code = "ACCOUNT_SESSION_CHANGED";

  constructor() {
    super("登录账户已变化，已忽略旧的刷新结果。");
    this.name = "StaleTokenRefreshError";
  }
}

export const tokenManager = new TokenManager();
