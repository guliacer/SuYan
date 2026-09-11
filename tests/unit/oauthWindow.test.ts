import { beforeEach, describe, expect, it, vi } from "vitest";

const shellMock = vi.hoisted(() => ({
  openExternal: vi.fn(),
}));

vi.mock("electron", () => ({ shell: shellMock }));

import { openOAuthAuthorizationWindow } from "../../electron/main/account/oauth/oauthWindow";

beforeEach(() => {
  shellMock.openExternal.mockReset();
  shellMock.openExternal.mockResolvedValue(undefined);
});

describe("oauthWindow", () => {
  it("交给系统默认浏览器打开授权页，复用浏览器已有登录能力", async () => {
    const authorizeUrl = "https://auth.example.test/auth?login_hint=google";

    await openOAuthAuthorizationWindow(authorizeUrl);

    expect(shellMock.openExternal).toHaveBeenCalledTimes(1);
    expect(shellMock.openExternal).toHaveBeenCalledWith(authorizeUrl);
  });

  it("拒绝非 HTTPS 授权地址", async () => {
    await expect(
      openOAuthAuthorizationWindow("http://auth.example.test/auth"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_PROVIDER_UNAVAILABLE",
    });
    expect(shellMock.openExternal).not.toHaveBeenCalled();
  });

  it("系统默认浏览器打开失败时返回结构化网络错误", async () => {
    shellMock.openExternal.mockRejectedValueOnce(new Error("browser unavailable"));

    await expect(
      openOAuthAuthorizationWindow("https://auth.example.test/auth"),
    ).rejects.toMatchObject({
      code: "ACCOUNT_NETWORK_ERROR",
    });
  });
});
