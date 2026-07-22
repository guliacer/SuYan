import { describe, expect, it } from "vitest";
import { normalizeExternalUrl } from "../../electron/main/app/externalUrlPolicy";

describe("externalUrlPolicy", () => {
  it("allows http and https URLs", () => {
    expect(normalizeExternalUrl(" https://prompthero.com/ ")).toBe("https://prompthero.com/");
    expect(normalizeExternalUrl("http://example.com/path?q=prompt")).toBe("http://example.com/path?q=prompt");
  });

  it("rejects unsafe or invalid URLs", () => {
    expect(() => normalizeExternalUrl("")).toThrow("网页地址不合法");
    expect(() => normalizeExternalUrl("file:///C:/Windows/System32/calc.exe")).toThrow("只能打开 http 或 https 网页");
    expect(() => normalizeExternalUrl("javascript:alert(1)")).toThrow("只能打开 http 或 https 网页");
    expect(() => normalizeExternalUrl("not a url")).toThrow("网页地址不合法");
  });
});
