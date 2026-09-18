const knownAiProviderBaseUrls: Readonly<Record<string, string>> = {
  "api.openai.com": "https://api.openai.com/v1",
  "platform.openai.com": "https://api.openai.com/v1",
  "chat.openai.com": "https://api.openai.com/v1",
  "chatgpt.com": "https://api.openai.com/v1",
  "openai.com": "https://api.openai.com/v1",
  "www.openai.com": "https://api.openai.com/v1",
  "api.deepseek.com": "https://api.deepseek.com/v1",
  "platform.deepseek.com": "https://api.deepseek.com/v1",
  "chat.deepseek.com": "https://api.deepseek.com/v1",
  "deepseek.com": "https://api.deepseek.com/v1",
  "www.deepseek.com": "https://api.deepseek.com/v1",
  "openrouter.ai": "https://openrouter.ai/api/v1",
  "www.openrouter.ai": "https://openrouter.ai/api/v1",
  "api.groq.com": "https://api.groq.com/openai/v1",
  "console.groq.com": "https://api.groq.com/openai/v1",
  "groq.com": "https://api.groq.com/openai/v1",
  "api.siliconflow.cn": "https://api.siliconflow.cn/v1",
  "cloud.siliconflow.cn": "https://api.siliconflow.cn/v1",
  "siliconflow.cn": "https://api.siliconflow.cn/v1",
  "api.moonshot.cn": "https://api.moonshot.cn/v1",
  "platform.moonshot.cn": "https://api.moonshot.cn/v1",
  "kimi.moonshot.cn": "https://api.moonshot.cn/v1",
  "moonshot.cn": "https://api.moonshot.cn/v1",
  "open.bigmodel.cn": "https://open.bigmodel.cn/api/paas/v4",
  "bigmodel.cn": "https://open.bigmodel.cn/api/paas/v4",
  "dashscope.aliyuncs.com": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "generativelanguage.googleapis.com": "https://generativelanguage.googleapis.com/v1beta/openai",
  "aistudio.google.com": "https://generativelanguage.googleapis.com/v1beta/openai",
  "api.together.xyz": "https://api.together.xyz/v1",
  "together.ai": "https://api.together.xyz/v1",
  "www.together.ai": "https://api.together.xyz/v1",
  "api.fireworks.ai": "https://api.fireworks.ai/inference/v1",
  "fireworks.ai": "https://api.fireworks.ai/inference/v1",
  "api.mistral.ai": "https://api.mistral.ai/v1",
  "console.mistral.ai": "https://api.mistral.ai/v1",
  "mistral.ai": "https://api.mistral.ai/v1",
  "api.x.ai": "https://api.x.ai/v1",
  "console.x.ai": "https://api.x.ai/v1",
  "x.ai": "https://api.x.ai/v1",
  "api.cerebras.ai": "https://api.cerebras.ai/v1",
  "cloud.cerebras.ai": "https://api.cerebras.ai/v1",
  "api.perplexity.ai": "https://api.perplexity.ai",
  "perplexity.ai": "https://api.perplexity.ai",
  "www.perplexity.ai": "https://api.perplexity.ai",
  "integrate.api.nvidia.com": "https://integrate.api.nvidia.com/v1",
  "api.cohere.ai": "https://api.cohere.ai/compatibility/v1",
  "ark.cn-beijing.volces.com": "https://ark.cn-beijing.volces.com/api/v3",
  // Agnes AI's website and platform host are not API endpoints. The image
  // API is served by the dedicated API Hub host.
  "agnes-ai.com": "https://apihub.agnes-ai.com/v1",
  "www.agnes-ai.com": "https://apihub.agnes-ai.com/v1",
  "platform.agnes-ai.com": "https://apihub.agnes-ai.com/v1",
  "apihub.agnes-ai.com": "https://apihub.agnes-ai.com/v1",
};

export type AiBaseUrlProvider = "openai-compatible" | "ollama";

export function normalizeAiBaseUrl(input: string): string {
  const value = input.trim();

  if (!value) {
    return "";
  }

  const parsed = parseHttpUrl(value);
  if (!parsed) {
    return value.replace(/\/+$/, "");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    (hostname === "agnes-ai.com" ||
      hostname === "www.agnes-ai.com" ||
      hostname === "platform.agnes-ai.com" ||
      hostname === "apihub.agnes-ai.com" ||
      hostname.endsWith(".agnes-ai.com")) &&
    /\/v1\/images\/(?:generations|edits)\/?$/i.test(parsed.pathname)
  ) {
    return "https://apihub.agnes-ai.com/v1/images/generations";
  }

  const knownBaseUrl = knownAiProviderBaseUrls[hostname];
  if (knownBaseUrl) {
    return knownBaseUrl;
  }

  if (parsed.hostname.toLowerCase().endsWith(".openai.azure.com")) {
    return `${parsed.protocol}//${parsed.host}/openai/v1`;
  }

  // For unknown domains, auto-extract the base URL:
  // - If the path is already a custom API path (contains "/v1"), keep it as-is
  // - Otherwise, deduce to https://host/v1
  if (parsed.pathname === "/" || parsed.pathname === "" || !parsed.pathname.includes("/v1")) {
    return `${parsed.protocol}//${parsed.host}/v1`;
  }

  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString().replace(/\/$/, "");
}

/** Normalize an endpoint without applying OpenAI-compatible `/v1` rules to Ollama. */
export function normalizeAiBaseUrlForProvider(input: string, provider: AiBaseUrlProvider = "openai-compatible"): string {
  if (provider !== "ollama") {
    return normalizeAiBaseUrl(input);
  }

  const value = input.trim();
  if (!value) {
    return "";
  }

  const parsed = parseHttpUrl(value);
  if (!parsed) {
    return value.replace(/\/+$/, "");
  }

  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/(?:api\/(?:tags|show|chat)|v1)(?:\/.*)?$/i, "") || "/";
  return parsed.toString().replace(/\/+$/, "");
}

function parseHttpUrl(input: string): URL | null {
  const explicitUrl = input.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const candidate = explicitUrl ?? input.split(/\s+/)[0] ?? "";
  const values = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? [candidate]
    : [candidate, `https://${candidate}`];

  for (const value of values) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed;
      }
    } catch {
      // Try the next candidate, including the HTTPS fallback for bare hosts.
    }
  }

  return null;
}

export function maskAiBaseUrl(input: string): string {
  const value = input.trim();

  if (!value) {
    return "";
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname;
    const maskedHost = host.length <= 4 ? "***" : `${host.slice(0, 2)}***${host.slice(-2)}`;
    const port = parsed.port ? ":***" : "";
    const protocol = parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.protocol : "https:";
    return `${protocol}//${maskedHost}${port}${parsed.pathname || ""}`;
  } catch {
    return `${value.slice(0, 8)}***`;
  }
}
