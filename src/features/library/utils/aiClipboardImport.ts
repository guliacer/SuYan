export type AiClipboardImportSource = "json" | "curl" | "plain-key";

export type AiClipboardImport = {
  apiKey: string;
  baseUrl: string;
  model: string;
  source: AiClipboardImportSource;
  /** Explicit website and endpoint values are retained so they are not merged. */
  websiteUrl?: string;
  endpointUrl?: string;
};

export type NormalizedAiClipboardImport = {
  title: string;
  content: string;
  parsed: AiClipboardImport;
};

const API_KEY_FIELD_ALIASES = [
  "api key",
  "api_key",
  "api-key",
  "apikey",
  "x-api-key",
  "access key",
  "secret key",
  "api secret",
  "api密钥",
  "api 秘钥",
  "api令牌",
  "api 令牌",
  "访问令牌",
  "access token",
  "access_token",
  "access-token",
  "auth token",
  "auth_token",
  "auth-token",
  "bearer token",
  "bearer_token",
  "bearer-token",
  "authorization",
  "密钥",
  "秘钥",
  "令牌",
  "口令",
] as const;

const GENERIC_KEY_FIELD_ALIASES = ["key"] as const;
const TOKEN_FIELD_ALIASES = ["token"] as const;

const ENDPOINT_FIELD_ALIASES = [
  "api endpoint",
  "api_endpoint",
  "api-endpoint",
  "api url",
  "api_url",
  "api-url",
  "api base",
  "api_base",
  "api-base",
  "api base url",
  "api_base_url",
  "api-base-url",
  "api地址",
  "api接口",
  "api端点",
  "endpoint url",
  "endpoint_url",
  "endpoint-url",
  "endpoint",
  "base url",
  "base_url",
  "base-url",
  "baseurl",
  "接口地址",
  "接口网址",
  "接口URL",
  "接口",
  "请求地址",
  "请求网址",
  "请求URL",
  "基础地址",
  "基础网址",
  "基础URL",
  "服务地址",
  "服务端点",
  "端点配置",
  "端点",
] as const;

const WEBSITE_FIELD_ALIASES = [
  "website url",
  "website_url",
  "website-url",
  "website",
  "site url",
  "site_url",
  "site-url",
  "site",
  "homepage",
  "home url",
  "home_url",
  "home-url",
  "web url",
  "web_url",
  "web-url",
  "网址地址",
  "网站地址",
  "站点地址",
  "平台网址",
  "官网",
  "主页",
  "网址",
  "网站",
  "站点",
  "平台",
] as const;

const GENERIC_URL_FIELD_ALIASES = ["url", "uri", "链接", "地址"] as const;
const MODEL_FIELD_ALIASES = ["model", "model name", "model_name", "model-name", "模型", "模型名称"] as const;
const API_KEY_ENV_SUFFIXES = ["api key", "api_key", "api-key", "apikey", "access token", "access_token", "access-token", "auth token", "auth_token", "auth-token"] as const;
const ENDPOINT_ENV_SUFFIXES = ["base url", "base_url", "base-url", "api base", "api_base", "api-base", "api base url", "api_base_url", "api-base-url", "api url", "api_url", "api-url", "endpoint", "endpoint url", "endpoint_url", "endpoint-url"] as const;

const knownAiSiteNames: Readonly<Record<string, string>> = {
  "windhub.cc": "Ark API",
  "ai.121628.xyz": "霸气公益平台",
  "api.openai.com": "OpenAI",
  "api.deepseek.com": "DeepSeek",
  "api.groq.com": "Groq",
  "api.anthropic.com": "Anthropic",
  "generativelanguage.googleapis.com": "Google Gemini",
  "api.moonshot.cn": "月之暗面",
  "dashscope.aliyuncs.com": "通义千问",
  "api.siliconflow.cn": "SiliconFlow",
  "api.lingyiwanwu.com": "零一万物",
  "api.minimax.chat": "MiniMax",
  "api.stepfun.com": "阶跃星辰",
  "open.bigmodel.cn": "智谱GLM",
  "api.baichuan-ai.com": "百川智能",
  "ark.cn-beijing.volces.com": "火山引擎",
  "api.x.ai": "xAI",
};

/** Extract only connection fields from common provider snippets; ignore headers,
 * prompts, request bodies, and other fields that are not needed by the app. */
export function parseAiClipboardImport(input: string): AiClipboardImport | null {
  const text = input.trim();

  if (!text) {
    return null;
  }

  const json = parseJsonRecord(text);
  if (json) {
    const apiKey = extractJsonApiKey(json);
    const endpointUrl = extractUrl(getJsonField(json, ENDPOINT_FIELD_ALIASES));
    const genericUrl = extractUrl(getJsonField(json, GENERIC_URL_FIELD_ALIASES));
    const websiteUrl = extractUrl(getJsonField(json, WEBSITE_FIELD_ALIASES))
      || (endpointUrl && genericUrl ? genericUrl : "");
    // API endpoint is more specific than a website URL. `url` remains a
    // compatibility fallback because New API connection objects use it for
    // the provider endpoint.
    const baseUrl = extractUrl(
      firstString(
        endpointUrl,
        genericUrl,
        websiteUrl,
      ),
    );
    const model = firstString(getJsonField(json, MODEL_FIELD_ALIASES));

    if (apiKey || baseUrl || model) {
      const parsed: AiClipboardImport = {
        apiKey,
        baseUrl,
        model,
        source: "json",
      };
      if (websiteUrl) parsed.websiteUrl = websiteUrl;
      if (endpointUrl) parsed.endpointUrl = endpointUrl;
      return parsed;
    }
  }

  const apiKey = extractBearerToken(text) || extractTextApiKey(text);
  const endpoint = extractLabeledUrl(text, ENDPOINT_FIELD_ALIASES) || extractEnvironmentUrl(text, ENDPOINT_ENV_SUFFIXES);
  const curlEndpoint = /^\s*curl\b/i.test(text) ? extractUrl(text) : "";
  const genericUrl = extractLabeledUrl(text, GENERIC_URL_FIELD_ALIASES);
  const websiteUrl = extractLabeledUrl(text, WEBSITE_FIELD_ALIASES)
    || ((endpoint || curlEndpoint) && genericUrl ? genericUrl : "");
  const unlabeledUrl = /^\s*curl\b/i.test(text) ? "" : findFirstHttpUrl(text);
  const baseUrl = endpoint || curlEndpoint || genericUrl || websiteUrl || unlabeledUrl;
  const model = extractNamedValue(text, MODEL_FIELD_ALIASES);

  if (baseUrl || apiKey || model) {
    const parsed: AiClipboardImport = {
      apiKey,
      baseUrl,
      model,
      source: "curl",
    };
    if (websiteUrl) parsed.websiteUrl = websiteUrl;
    if (endpoint) parsed.endpointUrl = endpoint;
    return parsed;
  }

  // Keep the existing paste-key workflow useful for a key copied as plain text.
  if (!/[\s\r\n]/.test(text)) {
    return {
      apiKey: text,
      baseUrl: "",
      model: "",
      source: "plain-key",
    };
  }

  return null;
}

/**
 * Convert a copied provider snippet into the three fields that belong on an
 * API Key card. Headers, request bodies, messages and curl syntax are
 * intentionally discarded.
 */
export function normalizeAiClipboardImport(input: string): NormalizedAiClipboardImport | null {
  const parsed = parseAiClipboardImport(input);
  if (!parsed || !looksLikeApiConfiguration(input, parsed)) {
    return null;
  }

  const siteUrl = getAiClipboardSiteUrl(parsed.baseUrl);
  const websiteUrl = getAiClipboardSiteUrl(parsed.websiteUrl ?? "");
  const endpointUrl = getAiClipboardSiteUrl(parsed.endpointUrl ?? parsed.baseUrl);

  // Keep the field order stable even when a copied snippet omits one value.
  // This is the single persisted shape for every API configuration card.
  const fields = websiteUrl && endpointUrl && websiteUrl !== endpointUrl
    ? [`url: ${websiteUrl}`, `endpoint: ${endpointUrl}`, `key: ${parsed.apiKey}`, `model: ${parsed.model}`]
    : [`url: ${siteUrl}`, `key: ${parsed.apiKey}`, `model: ${parsed.model}`];

  return {
    title: getAiClipboardCardTitle(siteUrl),
    content: fields.join("\n"),
    parsed: {
      ...parsed,
      baseUrl: siteUrl,
      ...(parsed.websiteUrl ? { websiteUrl } : {}),
      ...(parsed.endpointUrl ? { endpointUrl } : {}),
    },
  };
}

function looksLikeApiConfiguration(input: string, parsed: AiClipboardImport): boolean {
  const text = input.trim();
  const hasExplicitApiLabel = hasLabeledField(text, [
    ...API_KEY_FIELD_ALIASES,
    ...TOKEN_FIELD_ALIASES,
    ...ENDPOINT_FIELD_ALIASES,
    ...MODEL_FIELD_ALIASES,
  ])
    || (Boolean(parsed.apiKey) && hasLabeledField(text, GENERIC_KEY_FIELD_ALIASES))
    || hasEnvironmentField(text, [...API_KEY_ENV_SUFFIXES, ...ENDPOINT_ENV_SUFFIXES])
    || /authorization\s*[:=：]|bearer\s+/i.test(text);
  const isCanonicalTemplate = /(?:^|\n)\s*url\s*[:=：][^\n]*\n\s*key\s*[:=：][^\n]*\n\s*model\s*[:=：]/i.test(text);
  const hasNewApiMarker = /_type\s*["']?\s*:\s*["']?newapi_channel_conn/i.test(text);
  const isCurl = /^\s*curl\b/i.test(text);
  const isPlainApiKey = parsed.source === "plain-key" && isLikelyApiKey(text);
  const hasConnectionFields = Boolean(parsed.apiKey && parsed.baseUrl) || Boolean(parsed.apiKey && parsed.model);

  return hasExplicitApiLabel || isCanonicalTemplate || hasNewApiMarker || isCurl || isPlainApiKey || hasConnectionFields
    || (parsed.source === "json" && Boolean(parsed.apiKey || parsed.baseUrl || parsed.model))
    || Boolean(parsed.model && hasLabeledField(text, MODEL_FIELD_ALIASES));
}

function parseJsonRecord(input: string): Record<string, unknown> | null {
  const candidate = input
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!candidate.startsWith("{")) {
    return null;
  }

  if (candidate.endsWith("}")) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return isRecord(parsed) ? parsed : null;
    } catch {
      // Continue with the balanced-object recovery below.
    }
  }

  // Some providers copy a valid JSON object followed by a Markdown link
  // suffix. Recover the first balanced object without accepting arbitrary
  // trailing text as part of the configuration.
  const recovered = extractFirstJsonObject(candidate);
  if (!recovered) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(recovered);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}" && --depth === 0) {
      return input.slice(start, index + 1);
    }
  }
  return null;
}

function extractUrl(input: string): string {
  // The curl command URL is the endpoint; URLs inside headers and request
  // bodies must never win just because they appear earlier in the text.
  if (/\bcurl\b/i.test(input)) {
    return extractCurlEndpoint(input);
  }
  return findFirstHttpUrl(input);
}

function extractCurlEndpoint(input: string): string {
  const command = input.slice(input.search(/\bcurl\b/i)).replace(/^curl\b/i, "");
  const tokens = command.match(/"(?:\\.|[^"\\])*"|'[^']*'|`(?:\\.|[^`\\])*`|\S+/g) ?? [];
  const valueOptions = new Set([
    "-h", "--header", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode",
    "--json", "-f", "--form", "--form-string", "-x", "--request", "--proxy", "--user", "-u",
  ]);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const option = token.toLocaleLowerCase();
    if (option === "--url") {
      return findFirstHttpUrl(tokens[index + 1] ?? "");
    }
    if (option.startsWith("--url=")) {
      return findFirstHttpUrl(token.slice(token.indexOf("=") + 1));
    }
    if (valueOptions.has(option) || [...valueOptions].some((valueOption) => option.startsWith(`${valueOption}=`))) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) continue;
    const url = findFirstHttpUrl(token);
    if (url) return url;
  }
  return "";
}

function extractJsonApiKey(json: Record<string, unknown>): string {
  const explicitlyNamed = getJsonField(json, API_KEY_FIELD_ALIASES);
  if (explicitlyNamed) return cleanApiKey(explicitlyNamed);

  const token = getJsonField(json, TOKEN_FIELD_ALIASES);
  if (token) return cleanApiKey(token);

  const generic = getJsonField(json, GENERIC_KEY_FIELD_ALIASES);
  return generic && isLikelyApiKey(generic) ? cleanApiKey(generic) : "";
}

function extractTextApiKey(input: string): string {
  const explicitlyNamed = extractNamedValue(input, API_KEY_FIELD_ALIASES);
  if (explicitlyNamed) return cleanApiKey(explicitlyNamed);

  const environmentKey = extractEnvironmentValue(input, API_KEY_ENV_SUFFIXES);
  if (environmentKey) return cleanApiKey(environmentKey);

  const token = extractNamedValue(input, TOKEN_FIELD_ALIASES);
  if (token) return cleanApiKey(token);

  const generic = extractNamedValue(input, GENERIC_KEY_FIELD_ALIASES);
  return generic && isLikelyApiKey(generic) ? cleanApiKey(generic) : "";
}

function cleanApiKey(value: string): string {
  const candidate = value.trim().replace(/^Bearer\s+/i, "").replace(/^["'`]|["'`,.;]+$/g, "");
  return /^(?:https?:\/\/|[/?#])/.test(candidate) ? "" : candidate;
}

function isLikelyApiKey(value: string): boolean {
  const candidate = cleanApiKey(value);
  // Unlabelled values are deliberately strict: `sk-` is the common API key
  // shape and prevents ordinary words, URLs, model ids, and query parameters
  // from being promoted to a secret.
  return /^sk-[A-Za-z0-9][A-Za-z0-9._~+/=-]{2,}$/i.test(candidate);
}

function extractLabeledUrl(input: string, aliases: readonly string[]): string {
  return extractUrl(extractNamedValue(input, aliases));
}

function extractEnvironmentUrl(input: string, suffixes: readonly string[]): string {
  return extractUrl(extractEnvironmentValue(input, suffixes));
}

function hasLabeledField(input: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => {
    const value = extractNamedValue(input, [alias]);
    return Boolean(value);
  });
}

function hasEnvironmentField(input: string, suffixes: readonly string[]): boolean {
  return Boolean(extractEnvironmentValue(input, suffixes));
}

function extractBearerToken(input: string): string {
  const match = input.match(/(?:authorization|auth)\s*[:=：]\s*bearer\s+([A-Za-z0-9._~+/=-]+)/i);
  return match?.[1] ?? "";
}

function extractModel(input: string): string {
  return extractNamedValue(input, MODEL_FIELD_ALIASES);
}

function extractNamedValue(input: string, names: readonly string[]): string {
  const labels = [...names]
    .sort((left, right) => right.length - left.length)
    .map(toFieldAliasPattern)
    .join("|");
  const pattern = [
    `(?:[\"'](?:${labels})[\"']|(?<![A-Za-z0-9_?&#\\u3400-\\u9fff])(?:${labels})(?![A-Za-z0-9_-]))`,
    `\\s*[:=：]\\s*`,
    `(?:[\"']([^\"']*)[\"']|\`([^\`]*)\`|([^\\s,;}&\\]\\)\"']+))`,
  ].join("");
  const match = input.match(new RegExp(pattern, "i"));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function extractEnvironmentValue(input: string, suffixes: readonly string[]): string {
  const labels = [...suffixes]
    .sort((left, right) => right.length - left.length)
    .map(toFieldAliasPattern)
    .join("|");
  const pattern = [
    `(?<![A-Za-z0-9_?&#])(?:[A-Za-z][A-Za-z0-9]*[_-])*?(?:${labels})`,
    `\\s*=\\s*`,
    `(?:[\"']([^\"']*)[\"']|\`([^\`]*)\`|([^\\s,;}&\\]\\)\"']+))`,
  ].join("");
  const match = input.match(new RegExp(pattern, "i"));
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function getJsonField(json: Record<string, unknown>, aliases: readonly string[]): string {
  const normalizedAliases = new Set(aliases.map(normalizeFieldName));
  for (const [key, value] of Object.entries(json)) {
    if (!normalizedAliases.has(normalizeFieldName(key)) && !aliases.some((alias) => hasFieldAliasSuffix(key, alias))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeFieldName(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s_.-]/g, "");
}

function hasFieldAliasSuffix(fieldName: string, alias: string): boolean {
  const fieldParts = fieldName.toLocaleLowerCase().split(/[\s_.-]+/).filter(Boolean);
  const aliasParts = alias.toLocaleLowerCase().split(/[\s_.-]+/).filter(Boolean);
  if (fieldParts.length <= aliasParts.length) return false;
  return fieldParts.slice(-aliasParts.length).join("") === aliasParts.join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toFieldAliasPattern(value: string): string {
  return value
    .split(/[\s_.-]+/)
    .map(escapeRegExp)
    .join("[\\s_.-]*");
}

function findFirstHttpUrl(input: string): string {
  const match = input.match(/https?:\/\/[^\s<>"'\\\])}]+/i)?.[0];
  return match?.replace(/[),.;]+$/, "") ?? "";
}

/** Return only the provider origin for the compact URL stored in an inspiration card. */
export function getAiClipboardSiteUrl(value: string): string {
  const candidate = findFirstHttpUrl(value) || value.trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

/** Resolve a stable, human-readable title from the provider host. */
export function getAiClipboardSiteName(value: string): string {
  const siteUrl = getAiClipboardSiteUrl(value);
  if (!siteUrl) return "";
  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    return knownAiSiteNames[hostname] ?? "";
  } catch {
    return "";
  }
}

/** Resolve the card title from the provider host, with a stable fallback. */
export function getAiClipboardCardTitle(value: string): string {
  const knownName = getAiClipboardSiteName(value);
  if (knownName) return knownName;

  const siteUrl = getAiClipboardSiteUrl(value);
  if (!siteUrl) return "API 配置";
  try {
    const hostname = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    return hostname ? `API · ${hostname}` : "API 配置";
  } catch {
    return "API 配置";
  }
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
