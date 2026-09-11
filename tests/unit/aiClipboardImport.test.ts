import { describe, expect, it } from "vitest";
import {
  getAiClipboardCardTitle,
  getAiClipboardSiteName,
  getAiClipboardSiteUrl,
  normalizeAiClipboardImport,
  parseAiClipboardImport,
} from "../../src/features/library/utils/aiClipboardImport";

describe("parseAiClipboardImport", () => {
  it("extracts url and key from a newapi connection JSON object", () => {
    expect(
      parseAiClipboardImport(
        '{"_type":"newapi_channel_conn","key":"sk-json-key","url":"https://windhub.cc"}',
      ),
    ).toEqual({
      source: "json",
      apiKey: "sk-json-key",
      baseUrl: "https://windhub.cc",
      model: "",
    });
  });

  it("recovers New API JSON when the copied value has a Markdown suffix", () => {
    expect(parseAiClipboardImport(
      '{"_type":"newapi_channel_conn","key":"sk-json-key","url":"[https://windhub.cc"}](https://windhub.cc")',
    )).toMatchObject({
      source: "json",
      apiKey: "sk-json-key",
      baseUrl: "https://windhub.cc",
    });
  });

  it("extracts endpoint, bearer key, and model from a curl command", () => {
    expect(
      parseAiClipboardImport(`curl https://ai.121628.xyz/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-curl-key" \\
  -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"Say hello in one sentence."}]}'`),
    ).toEqual({
      source: "curl",
      apiKey: "sk-curl-key",
      baseUrl: "https://ai.121628.xyz/v1/chat/completions",
      model: "deepseek-v4-flash-free",
    });
  });

  it("accepts Markdown-wrapped URLs and keeps only the curl endpoint", () => {
    const input = "curl [https://ai.121628.xyz/v1/chat/completions](https://ai.121628.xyz/v1/chat/completions)\n"
      + "  -H \"Authorization: Bearer sk-markdown-key\"\n"
      + "  -d '{\"model\":\"deepseek-v4-flash-free\",\"messages\":[{\"content\":\"https://ignore.example\"}]}'";
    expect(parseAiClipboardImport(input)).toMatchObject({
      source: "curl",
      apiKey: "sk-markdown-key",
      baseUrl: "https://ai.121628.xyz/v1/chat/completions",
      model: "deepseek-v4-flash-free",
    });
  });

  it("normalizes the card URL and resolves the requested site titles", () => {
    expect(getAiClipboardSiteUrl("https://windhub.cc/some/ignored/path")).toBe("https://windhub.cc");
    expect(getAiClipboardSiteName("https://windhub.cc")).toBe("Ark API");
    expect(getAiClipboardSiteUrl("https://ai.121628.xyz/v1/chat/completions")).toBe("https://ai.121628.xyz");
    expect(getAiClipboardSiteName("https://ai.121628.xyz/v1/chat/completions")).toBe("霸气公益平台");
    expect(getAiClipboardCardTitle("https://unknown.example/v1")).toBe("API · unknown.example");
  });

  it("normalizes provider snippets to card fields only", () => {
    const normalized = normalizeAiClipboardImport(
      `curl [https://ai.121628.xyz/v1/chat/completions](https://ai.121628.xyz/v1/chat/completions) \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-curl-key" \\
  -d '{"model":"deepseek-v4-flash-free","messages":[{"role":"user","content":"Say hello"}]}'`,
    );

    expect(normalized).toEqual({
      title: "霸气公益平台",
      content: "url: https://ai.121628.xyz\nkey: sk-curl-key\nmodel: deepseek-v4-flash-free",
      parsed: {
        source: "curl",
        apiKey: "sk-curl-key",
        baseUrl: "https://ai.121628.xyz",
        model: "deepseek-v4-flash-free",
      },
    });
  });

  it("uses the same three-line template when API fields are incomplete", () => {
    expect(normalizeAiClipboardImport("sk-only-key")).toMatchObject({
      title: "API 配置",
      content: "url: \nkey: sk-only-key\nmodel: ",
    });
    expect(normalizeAiClipboardImport("API Key: sk-label-key")).toMatchObject({
      content: "url: \nkey: sk-label-key\nmodel: ",
    });
    expect(normalizeAiClipboardImport("url: \nkey: sk-label-key\nmodel: ")).toMatchObject({
      content: "url: \nkey: sk-label-key\nmodel: ",
    });
  });

  it("does not turn an ordinary URL prompt into an API card", () => {
    expect(normalizeAiClipboardImport("请访问 https://example.com 查看产品说明")).toBeNull();
  });

  it("keeps the model after the dialog rewrites fields into Chinese labels", () => {
    expect(parseAiClipboardImport(
      "端点: https://ai.121628.xyz\nAPI Key: sk-normalized-key\n模型: deepseek-v4-flash-free",
    )).toMatchObject({
      apiKey: "sk-normalized-key",
      baseUrl: "https://ai.121628.xyz",
      model: "deepseek-v4-flash-free",
    });
  });

  it("ignores request headers and message content", () => {
    const result = parseAiClipboardImport(
      `curl https://example.com/v1/chat/completions -H "Authorization: Bearer sk-key" -d '{"model":"m","messages":[{"content":"https://ignore.example"}]}'`,
    );

    expect(result).toEqual({
      source: "curl",
      apiKey: "sk-key",
      baseUrl: "https://example.com/v1/chat/completions",
      model: "m",
    });
  });

  it("keeps plain API key paste compatible", () => {
    expect(parseAiClipboardImport("sk-plain-key")).toEqual({
      source: "plain-key",
      apiKey: "sk-plain-key",
      baseUrl: "",
      model: "",
    });
  });

  it("recognizes API key aliases and prefers a real sk- key over generic key text", () => {
    expect(parseAiClipboardImport(
      "API_KEY: sk-proj-demo_key\nkey: not-the-api-key\n接口地址: https://api.example.com/v1\n模型名称: demo-model",
    )).toEqual({
      source: "curl",
      apiKey: "sk-proj-demo_key",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      endpointUrl: "https://api.example.com/v1",
    });
    expect(parseAiClipboardImport("密钥：sk-labeled-key")).toMatchObject({ apiKey: "sk-labeled-key" });
    expect(parseAiClipboardImport("访问令牌: sk-access-token")).toMatchObject({ apiKey: "sk-access-token" });
    expect(parseAiClipboardImport("token: opaque-provider-token")).toMatchObject({ apiKey: "opaque-provider-token" });
    expect(normalizeAiClipboardImport("key: ordinary-label")).toBeNull();
    expect(normalizeAiClipboardImport("key: sk-generic-key")).toMatchObject({
      content: "url: \nkey: sk-generic-key\nmodel: ",
    });
  });

  it("recognizes endpoint and website aliases without confusing their order", () => {
    expect(parseAiClipboardImport(
      "网址: https://console.example.com\n站点地址: https://example.com\n接口: https://api.example.com/v1\napikey: sk-alias-key",
    )).toMatchObject({
      apiKey: "sk-alias-key",
      baseUrl: "https://api.example.com/v1",
      websiteUrl: "https://console.example.com",
      endpointUrl: "https://api.example.com/v1",
    });
    expect(parseAiClipboardImport(
      JSON.stringify({ websiteUrl: "https://console.example.com", base_url: "https://api.example.com/v1", api_key: "sk-json-alias" }),
    )).toMatchObject({
      apiKey: "sk-json-alias",
      baseUrl: "https://api.example.com/v1",
      websiteUrl: "https://console.example.com",
      endpointUrl: "https://api.example.com/v1",
    });
    expect(parseAiClipboardImport(
      "OPENAI_API_KEY=sk-env-key\nOPENAI_BASE_URL=https://api.example.com/v1",
    )).toMatchObject({
      apiKey: "sk-env-key",
      baseUrl: "https://api.example.com/v1",
    });
    expect(parseAiClipboardImport(
      JSON.stringify({ OPENAI_API_KEY: "sk-prefixed-json", OPENAI_BASE_URL: "https://api.example.com/v1" }),
    )).toMatchObject({
      apiKey: "sk-prefixed-json",
      baseUrl: "https://api.example.com/v1",
    });
  });

  it("preserves separate website and endpoint values in the normalized card", () => {
    const normalized = normalizeAiClipboardImport(
      "密钥: sk-card-key\n接口: https://api.example.com/v1\n网址: https://console.example.com",
    );
    expect(normalized).toMatchObject({
      content: "url: https://console.example.com\nendpoint: https://api.example.com\nkey: sk-card-key\nmodel: ",
      parsed: {
        apiKey: "sk-card-key",
        baseUrl: "https://api.example.com",
        websiteUrl: "https://console.example.com",
        endpointUrl: "https://api.example.com",
      },
    });
    expect(normalizeAiClipboardImport(normalized!.content)).toMatchObject({
      content: normalized!.content,
      parsed: normalized!.parsed,
    });
  });

  it("does not read key-like query parameters or ordinary URL text as API keys", () => {
    expect(parseAiClipboardImport("请访问 https://example.com/path?key=sk-not-a-key 查看说明")).toMatchObject({
      apiKey: "",
      baseUrl: "https://example.com/path?key=sk-not-a-key",
    });
    expect(normalizeAiClipboardImport("请访问 https://example.com/path?key=sk-not-a-key 查看说明")).toBeNull();
    expect(parseAiClipboardImport("模型名称: sk-not-a-keyword")).toMatchObject({ model: "sk-not-a-keyword", apiKey: "" });
  });

  it("keeps explicit bearer authorization ahead of unrelated labeled values", () => {
    expect(parseAiClipboardImport(
      "接口地址=https://api.example.com/v1\nkey=display-name\nAuthorization: Bearer sk-real-key",
    )).toMatchObject({
      apiKey: "sk-real-key",
      baseUrl: "https://api.example.com/v1",
    });
  });

  it("skips URLs inside curl headers and data when locating the endpoint", () => {
    expect(parseAiClipboardImport(
      `curl -H "Referer: https://console.example.com" -H "Authorization: Bearer sk-curl-order" https://api.example.com/v1/chat/completions -d '{"callback":"https://ignore.example"}'`,
    )).toMatchObject({
      apiKey: "sk-curl-order",
      baseUrl: "https://api.example.com/v1/chat/completions",
    });
    expect(parseAiClipboardImport(
      `curl -H "Authorization: Bearer sk-curl-url" --url https://api.example.com/v1/chat/completions -d '{"model":"demo"}'`,
    )).toMatchObject({
      apiKey: "sk-curl-url",
      baseUrl: "https://api.example.com/v1/chat/completions",
    });
    expect(parseAiClipboardImport(
      `curl -H "Authorization: Bearer sk-no-endpoint" -d '{"callback":"https://ignore.example"}'`,
    )).toMatchObject({
      apiKey: "sk-no-endpoint",
      baseUrl: "",
    });
  });
});
