import { describe, expect, it, vi } from "vitest";
import {
  getOAuthCallbackDeduplicationKey,
  OAuthCallbackDispatcher,
} from "../../electron/main/account/oauth/oauthCallbackDispatcher";

function callbackUrl(state: string, code = "code-1"): string {
  return `suyan://oauth/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`;
}

describe("OAuthCallbackDispatcher", () => {
  it("并发收到同一个 state 时只处理一次，并共享结果", async () => {
    let resolveCallback: (() => void) | undefined;
    const handleCallback = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveCallback = resolve;
      }),
    );
    const onSettled = vi.fn();
    const dispatcher = new OAuthCallbackDispatcher({ handleCallback, onSettled });

    const first = dispatcher.dispatch(callbackUrl("same-state", "first-code"));
    const second = dispatcher.dispatch(callbackUrl("same-state", "second-code"));

    expect(second).toBe(first);
    expect(handleCallback).toHaveBeenCalledTimes(1);
    resolveCallback?.();

    await expect(first).resolves.toEqual({ status: "succeeded" });
    await expect(second).resolves.toEqual({ status: "succeeded" });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("失败结果也只通知一次，重复回调不会再次广播错误", async () => {
    const error = new Error("callback failed");
    const handleCallback = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const onSettled = vi.fn();
    const dispatcher = new OAuthCallbackDispatcher({ handleCallback, onError, onSettled });
    const url = callbackUrl("failed-state");

    const first = await dispatcher.dispatch(url);
    const second = await dispatcher.dispatch(url);

    expect(first).toEqual({ status: "failed", error });
    expect(second).toEqual({ status: "failed", error });
    expect(handleCallback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("不同 state 独立处理，TTL 到期后允许新的同 state 回调", async () => {
    let currentTime = 0;
    const handleCallback = vi.fn().mockResolvedValue(undefined);
    const dispatcher = new OAuthCallbackDispatcher({
      handleCallback,
      dedupeTtlMs: 100,
      now: () => currentTime,
    });

    await dispatcher.dispatch(callbackUrl("state-a"));
    await dispatcher.dispatch(callbackUrl("state-b"));
    await dispatcher.dispatch(callbackUrl("state-a", "replayed-before-expiry"));
    expect(handleCallback).toHaveBeenCalledTimes(2);

    currentTime = 100;
    await dispatcher.dispatch(callbackUrl("state-a", "after-expiry"));
    expect(handleCallback).toHaveBeenCalledTimes(3);
  });

  it("优先按 state 去重，无 state 时按完整 URL 去重", () => {
    expect(getOAuthCallbackDeduplicationKey(callbackUrl("state-1", "code-1"))).toBe(
      "state:state-1",
    );
    expect(
      getOAuthCallbackDeduplicationKey("suyan://oauth/callback?error=access_denied"),
    ).toBe("url:suyan://oauth/callback?error=access_denied");
  });
});
