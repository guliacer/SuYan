import { describe, expect, it } from "vitest";
import { StaleTokenRefreshError, TokenManager } from "../../electron/main/account/tokenManager";
import type { AccountTokenPayload } from "../../src/features/account/types/account";

function payload(accessToken: string, expiresAt: number): AccountTokenPayload {
  return { accessToken, refreshToken: `rt-${accessToken}`, expiresAt };
}

describe("TokenManager", () => {
  it("set/get/clear 与未设置时视为过期", () => {
    const manager = new TokenManager();
    expect(manager.isExpired()).toBe(true);

    manager.setPayload(payload("at-1", Date.now() + 60_000));
    expect(manager.isExpired()).toBe(false);
    expect(manager.getPayload()?.accessToken).toBe("at-1");

    manager.clear();
    expect(manager.isExpired()).toBe(true);
    expect(manager.getPayload()).toBeNull();
  });

  it("已过期 token 触发刷新，刷新结果写回", async () => {
    const manager = new TokenManager();
    manager.setPayload(payload("old", Date.now() - 1_000));

    const refreshed = await manager.refreshIfNeeded(async () => payload("new", Date.now() + 60_000));

    expect(refreshed.accessToken).toBe("new");
    expect(manager.getPayload()?.accessToken).toBe("new");
    expect(manager.isExpired()).toBe(false);
  });

  it("未过期 token 直接返回，不调用 refresher", async () => {
    const manager = new TokenManager();
    manager.setPayload(payload("valid", Date.now() + 60_000));
    let calls = 0;

    const result = await manager.refreshIfNeeded(async () => {
      calls += 1;
      return payload("should-not-happen", Date.now() + 60_000);
    });

    expect(calls).toBe(0);
    expect(result.accessToken).toBe("valid");
  });

  it("并发触发刷新时共享同一次刷新（单飞锁）", async () => {
    const manager = new TokenManager();
    manager.setPayload(payload("old", Date.now() - 1_000));

    let calls = 0;
    let resolveRefresher: ((value: AccountTokenPayload) => void) | null = null;
    const refresher = () => {
      calls += 1;
      return new Promise<AccountTokenPayload>((resolve) => {
        resolveRefresher = resolve;
      });
    };

    const first = manager.refreshIfNeeded(refresher);
    const second = manager.refreshIfNeeded(refresher);
    const third = manager.refreshIfNeeded(refresher);

    expect(calls).toBe(1);

    resolveRefresher!(payload("fresh", Date.now() + 60_000));
    const results = await Promise.all([first, second, third]);

    expect(calls).toBe(1);
    expect(results.every((result) => result.accessToken === "fresh")).toBe(true);
  });

  it("刷新失败后锁释放，后续可再次刷新", async () => {
    const manager = new TokenManager();
    manager.setPayload(payload("old", Date.now() - 1_000));

    await expect(
      manager.refreshIfNeeded(async () => {
        throw new Error("refresh boom");
      }),
    ).rejects.toThrow("refresh boom");

    let calls = 0;
    const result = await manager.refreshIfNeeded(async () => {
      calls += 1;
      return payload("recovered", Date.now() + 60_000);
    });

    expect(calls).toBe(1);
    expect(result.accessToken).toBe("recovered");
  });

  it("账号切换后忽略迟到的旧刷新结果", async () => {
    const manager = new TokenManager();
    manager.setPayload(payload("account-a", Date.now() - 1_000));

    let resolveRefresh: ((value: AccountTokenPayload) => void) | null = null;
    const refresh = manager.refreshIfNeeded(
      () => new Promise<AccountTokenPayload>((resolve) => { resolveRefresh = resolve; }),
    );

    manager.setPayload(payload("account-b", Date.now() + 60_000));
    resolveRefresh!(payload("account-a-late", Date.now() + 60_000));

    await expect(refresh).rejects.toBeInstanceOf(StaleTokenRefreshError);
    expect(manager.getPayload()?.accessToken).toBe("account-b");
  });

  it("退出后旧刷新失败不会清空新会话令牌", async () => {
    const manager = new TokenManager();
    manager.setPayload(payload("account-a", Date.now() - 1_000));

    let rejectRefresh: ((reason?: unknown) => void) | null = null;
    const refresh = manager.refreshIfNeeded(
      () => new Promise<AccountTokenPayload>((_resolve, reject) => { rejectRefresh = reject; }),
    );

    manager.setPayload(payload("account-b", Date.now() + 60_000));
    rejectRefresh!(new Error("old refresh failed"));

    await expect(refresh).rejects.toThrow("old refresh failed");
    expect(manager.getPayload()?.accessToken).toBe("account-b");
  });
});
