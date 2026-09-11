import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ start: vi.fn(), open: vi.fn() }));
vi.mock("electron", () => ({ app: { isPackaged: false }, BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../../electron/main/account/oauth/guliIdentityClient", () => ({
  startGuliDeviceAuthorization: mocks.start, GULI_IDENTITY_PROVIDER: "guli",
}));
vi.mock("../../electron/main/account/oauth/oauthWindow", () => ({ openOAuthAuthorizationWindow: mocks.open }));
import { cancelLogin, startDeviceLogin, startLogin } from "../../electron/main/account/oauth/oauthService";
import type { AccountSession } from "../../src/features/account/types/account";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const session: AccountSession = { user: { uid: "verified-user", username: "已验证用户" }, accessToken: "secret-access", refreshToken: "secret-refresh", expiresAt: 9999999999999 };
let completion: ReturnType<typeof deferred<AccountSession>>;
let flow: { userCode: string; verificationUri: string; expiresAt: number; abort: ReturnType<typeof vi.fn>; wait: () => Promise<AccountSession> };
beforeEach(() => {
  vi.useFakeTimers();
  completion = deferred<AccountSession>();
  flow = { userCode: "ABCD-EFGH", verificationUri: "https://auth.example.test/device", expiresAt: Date.now() + 600000, abort: vi.fn(), wait: () => completion.promise };
  mocks.start.mockReset().mockResolvedValue(flow);
  mocks.open.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cancelLogin(); vi.useRealTimers(); });

describe("device authorization orchestration", () => {
  it("returns only public data and emits a verified session only after authorization", async () => {
    const success = vi.fn();
    const error = vi.fn();
    const result = await startDeviceLogin(success, error);
    expect(Object.keys(result.device!).sort()).toEqual(["browserOpened", "userCode", "verificationUri"]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(success).not.toHaveBeenCalled();
    await expect(startLogin("github")).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_IN_PROGRESS" });
    completion.resolve(session);
    await vi.advanceTimersByTimeAsync(0);
    expect(success).toHaveBeenCalledExactlyOnceWith(session);
    expect(error).not.toHaveBeenCalled();
  });
  it("discards late results after cancellation and cannot disturb a newer flow", async () => {
    const success = vi.fn();
    const error = vi.fn();
    await startDeviceLogin(success, error);
    cancelLogin();
    const oldCompletion = completion;
    completion = deferred<AccountSession>();
    await startDeviceLogin(vi.fn(), vi.fn());
    oldCompletion.resolve(session);
    await vi.advanceTimersByTimeAsync(0);
    expect(success).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(cancelLogin()).toEqual({ cancelled: true });
  });
  it("cancels while requesting a code without opening the browser or polling", async () => {
    const pending = deferred<typeof flow>();
    mocks.start.mockReturnValue(pending.promise);
    const task = startDeviceLogin(vi.fn(), vi.fn());
    const rejection = expect(task).rejects.toMatchObject({ code: "ACCOUNT_OAUTH_CANCELLED" });
    cancelLogin();
    pending.resolve(flow);
    await rejection;
    expect(flow.abort).toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("expires automatically and discards a token that arrives afterward", async () => {
    const success = vi.fn();
    const error = vi.fn();
    await startDeviceLogin(success, error);
    await vi.advanceTimersByTimeAsync(600000);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: "ACCOUNT_OAUTH_EXPIRED" }));
    completion.resolve(session);
    await vi.advanceTimersByTimeAsync(0);
    expect(success).not.toHaveBeenCalled();
  });
  it("keeps a usable code and address when the system browser cannot open", async () => {
    mocks.open.mockRejectedValue(new Error("launch failed"));
    expect(await startDeviceLogin(vi.fn(), vi.fn())).toMatchObject({ device: { browserOpened: false, userCode: flow.userCode } });
  });
});
