import { describe, expect, it } from "vitest";

describe("prompt classification", () => {
  it("automatically classifies email and account content and derives titles", async () => {
    const { classifyPromptContent } = await import("../../src/features/prompts/utils/promptClassification");

    expect(classifyPromptContent("邮箱地址：1504481883\n邮箱密码：12345")).toMatchObject({
      type: "email-config",
      categoryName: "邮箱",
      title: "邮箱 · 1504481883",
    });
    expect(classifyPromptContent("站点：即梦AI\n账号：user@example.com\n密码：secret")).toMatchObject({
      type: "account",
      categoryName: "账号",
      title: "邮箱-user@example.com",
    });
    expect(classifyPromptContent("账号：demo-user\n密码：secret")).toMatchObject({
      type: "account",
      categoryName: "账号",
      title: "账号 · demo-user",
    });
  });

  it("uses the endpoint host for API configuration titles", async () => {
    const { classifyPromptContent } = await import("../../src/features/prompts/utils/promptClassification");

    expect(classifyPromptContent("基础 URL：https://note.example.com/v1\nAPI Key：ak_demo12345")).toMatchObject({
      type: "api-config",
      categoryName: "API Key",
      title: "API · note.example.com",
    });
  });

  it("uses the website host as the title for website account templates", async () => {
    const { classifyPromptContent } = await import("../../src/features/prompts/utils/promptClassification");

    expect(classifyPromptContent("网址：https://www.example.com/login\n账户名称：alice\n密码：secret")).toMatchObject({
      type: "account",
      categoryName: "账号",
      title: "example.com",
    });
  });

  it("recognizes New API JSON and curl snippets with site-specific titles", async () => {
    const { classifyPromptContent } = await import("../../src/features/prompts/utils/promptClassification");

    expect(classifyPromptContent("{\"_type\":\"newapi_channel_conn\",\"key\":\"sk-json-key\",\"url\":\"https://windhub.cc\"}")).toMatchObject({
      type: "api-config",
      categoryName: "API Key",
      title: "Ark API",
    });
    expect(classifyPromptContent("curl https://ai.121628.xyz/v1/chat/completions -H \"Authorization: Bearer sk-curl-key\" -d '{\"model\":\"deepseek-v4-flash-free\"}'")).toMatchObject({
      type: "api-config",
      categoryName: "API Key",
      title: "霸气公益平台",
    });
  });

  it("uses the provider host for unknown API card titles", async () => {
    const { classifyPromptContent } = await import("../../src/features/prompts/utils/promptClassification");

    expect(classifyPromptContent("curl https://unknown.example/v1/chat/completions -H \"Authorization: Bearer sk-key\" -d '{\"model\":\"demo\"}'")).toMatchObject({
      type: "api-config",
      categoryName: "API Key",
      title: "API · unknown.example",
    });
  });
});
