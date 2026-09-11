import { describe, expect, it } from "vitest";
import { findOAuthDeeplink, isOAuthDeeplink } from "../../electron/main/account/oauth/oauthDeeplink";

describe("oauthDeeplink", () => {
  it("只接受固定的 suyan OAuth 回调并允许授权查询参数", () => {
    const callback = "suyan://oauth/callback?code=code-1&state=state-1";
    expect(isOAuthDeeplink(callback)).toBe(true);
    expect(findOAuthDeeplink(["--verbose", "https://example.test", callback])).toBe(callback);
  });

  it.each([
    "suyan://other/callback?code=code-1&state=state-1",
    "suyan://oauth/other?code=code-1&state=state-1",
    "suyan://oauth/callback#code=code-1",
    "suyan://user:password@oauth/callback?code=code-1",
    "suyan://oauth:443/callback?code=code-1",
    "suyan://oauth/Callback?code=code-1",
    "not-a-url",
    "",
  ])("拒绝不安全或不匹配的回调 %s", (value) => {
    expect(isOAuthDeeplink(value)).toBe(false);
  });
});
