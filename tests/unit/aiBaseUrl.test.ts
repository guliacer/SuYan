import { describe, expect, it } from "vitest";
import { maskAiBaseUrl, normalizeAiBaseUrl } from "@/features/library/utils/aiBaseUrl";

describe("AI base URL helpers", () => {
  it.each([
    ["https://api.example.com", "https://api.example.com/v1"],
    ["https://api.example.com/", "https://api.example.com/v1"],
    ["https://api.example.com/v1", "https://api.example.com/v1"],
    ["https://api.example.com/v1/", "https://api.example.com/v1"],
    ["https://api.example.com/v1/chat/completions", "https://api.example.com/v1/chat/completions"],
    ["https://api.example.com/api", "https://api.example.com/v1"],
    ["https://api.example.com/unrelated/page", "https://api.example.com/v1"],
    ["api.example.com/console", "https://api.example.com/v1"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeAiBaseUrl(input)).toBe(expected);
  });

  it.each([
    ["https://openrouter.ai/settings/keys", "https://openrouter.ai/api/v1"],
    ["https://console.groq.com/keys", "https://api.groq.com/openai/v1"],
    ["https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "https://dashscope.aliyuncs.com/compatible-mode/v1"],
    ["https://open.bigmodel.cn/usercenter/apikeys", "https://open.bigmodel.cn/api/paas/v4"],
    ["https://ark.cn-beijing.volces.com/api/v3", "https://ark.cn-beijing.volces.com/api/v3"],
    ["https://api.perplexity.ai/chat/completions", "https://api.perplexity.ai"],
  ])("adapts the common provider URL %s", (input, expected) => {
    expect(normalizeAiBaseUrl(input)).toBe(expected);
  });

  it.each([
    ["https://platform.agnes-ai.com/v1", "https://apihub.agnes-ai.com/v1"],
    ["https://www.agnes-ai.com/zh-Hans/docs/agnes-image-20-flash", "https://apihub.agnes-ai.com/v1"],
    ["https://apihub.agnes-ai.com/v1/images/generations", "https://apihub.agnes-ai.com/v1/images/generations"],
  ])("normalizes Agnes URL %s to %s", (input, expected) => {
    expect(normalizeAiBaseUrl(input)).toBe(expected);
  });

  it("removes query parameters and fragments from pasted website URLs", () => {
    expect(normalizeAiBaseUrl("https://api.example.com/console?region=cn#keys")).toBe("https://api.example.com/v1");
  });

  it("extracts a URL when the clipboard also contains surrounding text", () => {
    expect(normalizeAiBaseUrl("接口地址: https://api.example.com copied")).toBe("https://api.example.com/v1");
  });

  it("masks the host by default without exposing the original hostname", () => {
    const masked = maskAiBaseUrl("https://secret.example.com/v1");

    expect(masked).toContain("/v1");
    expect(masked).not.toContain("secret.example.com");
    expect(masked).toMatch(/^https:\/\/[^/]+\/v1$/);
  });
});
