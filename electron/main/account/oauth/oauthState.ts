/**
 * 挂起的 OAuth 流程会话（方案 §七/§八）：
 * - 发起登录时生成 state + code_verifier，在此登记；
 * - 回调到达时按 state 取回并**立即删除（单次使用）**，杜绝 callback replay；
 * - 带 TTL 过期清理，防止残留 state 无界增长；不从磁盘读取、不进日志。
 *
 * 只允许一个活跃 OAuth 流程：新的发起会被拒绝，用户明确取消后才能重试。
 */

import type {
  AccountLoginProviderId,
  AccountOAuthPurpose,
} from "../../../../src/features/account/types/account";

/** 内部会话由 Guli Identity 承载，用户选择的平台单独绑定到一次性事务。 */
export type PendingProviderId = "guli";

export interface PendingOAuthSession {
  provider: PendingProviderId;
  /** 旧测试/旧内存事务可能没有该字段，回调时按邮箱登录兼容。 */
  loginProvider?: AccountLoginProviderId;
  /** login 会切换当前账号，link 只允许把身份加入当前账号。 */
  purpose?: AccountOAuthPurpose;
  /** 关联事务绑定的当前用户 uid，只存在主进程内存。 */
  expectedUid?: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  issuer: string;
  createdAt: number;
  expiresAt: number;
}

export const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000; // 10 分钟

const pending = new Map<string, PendingOAuthSession>();

function now(): number {
  return Date.now();
}

export function putPendingOAuthSession(session: Omit<PendingOAuthSession, "createdAt" | "expiresAt">): void {
  const createdAt = now();
  pending.set(session.state, {
    ...session,
    createdAt,
    expiresAt: createdAt + OAUTH_SESSION_TTL_MS,
  });
}

export function peekPendingOAuthSession(state: string): PendingOAuthSession | null {
  pruneExpired();
  const session = pending.get(state);
  return session ?? null;
}

/** 返回当前唯一的挂起会话；过期会话会在读取前清理。 */
export function getPendingOAuthSession(): PendingOAuthSession | null {
  pruneExpired();
  return pending.values().next().value ?? null;
}

/** 取出（单次使用）并删除。返回 null 表示 state 未知、已过期或已被消费。 */
export function consumePendingOAuthSession(state: string): PendingOAuthSession | null {
  const session = peekPendingOAuthSession(state);
  if (!session) {
    return null;
  }
  pending.delete(state);
  return session;
}

/** 取消（用户放弃 / 超时）挂起的 OAuth 流程。 */
export function cancelPendingOAuthSession(state: string): boolean {
  return pending.delete(state);
}

/** 取消当前安全授权，供用户关闭或卡住授权页面后重新开始。 */
export function cancelActivePendingOAuthSession(): boolean {
  const session = getPendingOAuthSession();
  return session ? pending.delete(session.state) : false;
}

export function clearPendingOAuthSessions(): void {
  pending.clear();
}

function pruneExpired(): void {
  const cutoff = now();
  for (const [state, session] of pending) {
    if (session.expiresAt <= cutoff) {
      pending.delete(state);
    }
  }
}

/** 仅供测试：清空挂起状态。 */
export function resetOAuthStateForTests(): void {
  pending.clear();
}
