import { isOAuthDeeplink } from "./oauthDeeplink";

/**
 * OAuth 回调可能同时从 second-instance、open-url 和 protocol.handle 到达。
 * 同一个 state 只允许启动一次业务处理，后续入口复用同一个结果。
 */
export const OAUTH_CALLBACK_DEDUPE_TTL_MS = 10 * 60 * 1000;

export type OAuthCallbackDispatchResult =
  | { status: "succeeded" }
  | { status: "failed"; error: unknown };

export type OAuthCallbackDispatcherOptions = {
  handleCallback: (rawUrl: string) => Promise<unknown>;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
  dedupeTtlMs?: number;
  now?: () => number;
};

type PendingDispatch = {
  expiresAt: number;
  promise: Promise<OAuthCallbackDispatchResult>;
};

export class OAuthCallbackDispatcher {
  private readonly dispatches = new Map<string, PendingDispatch>();
  private readonly dedupeTtlMs: number;
  private readonly now: () => number;

  constructor(private readonly options: OAuthCallbackDispatcherOptions) {
    this.dedupeTtlMs = options.dedupeTtlMs ?? OAUTH_CALLBACK_DEDUPE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  dispatch(rawUrl: string): Promise<OAuthCallbackDispatchResult> {
    this.pruneExpired();

    const key = getOAuthCallbackDeduplicationKey(rawUrl);
    const existing = this.dispatches.get(key);
    if (existing) {
      return existing.promise;
    }

    const promise = this.process(rawUrl);
    this.dispatches.set(key, {
      expiresAt: this.now() + this.dedupeTtlMs,
      promise,
    });
    return promise;
  }

  /** 仅供测试和应用退出时使用；不影响 OAuth state 的服务端安全校验。 */
  clear(): void {
    this.dispatches.clear();
  }

  private async process(rawUrl: string): Promise<OAuthCallbackDispatchResult> {
    try {
      await this.options.handleCallback(rawUrl);
      return { status: "succeeded" };
    } catch (error) {
      this.options.onError?.(error);
      return { status: "failed", error };
    } finally {
      this.options.onSettled?.();
    }
  }

  private pruneExpired(): void {
    const currentTime = this.now();
    for (const [key, dispatch] of this.dispatches) {
      if (dispatch.expiresAt <= currentTime) {
        this.dispatches.delete(key);
      }
    }
  }
}

export function getOAuthCallbackDeduplicationKey(rawUrl: string): string {
  if (isOAuthDeeplink(rawUrl)) {
    const state = new URL(rawUrl).searchParams.get("state")?.trim();
    if (state) {
      return `state:${state}`;
    }
  }

  // Invalid callbacks and callbacks without state are only coalesced when their
  // complete URL is identical. handleCallback still performs all validation.
  return `url:${rawUrl}`;
}
