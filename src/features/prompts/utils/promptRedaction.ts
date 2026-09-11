export type SensitiveMatchType =
  | "api-key" | "jwt" | "password" | "email" | "phone" | "identity" | "bank-card"
  | "ip" | "url-secret" | "private-key" | "local-path" | "database-url" | "authorization"
  | "id-card" | "credit-card" | "access-token" | "oauth-token" | "url" | "account-id";

export type SensitiveMatch = {
  type: SensitiveMatchType;
  start: number;
  end: number;
  original: string;
  masked: string;
  confidence: number;
};

type Rule = { type: SensitiveMatchType; pattern: RegExp; mask: (value: string) => string };
const keepEnds = (value: string, prefix = 3, suffix = 3) => `${value.slice(0, prefix)}****${value.slice(-suffix)}`;
const keepFirst = (value: string, keep = 4) => `${value.slice(0, keep)}****`;
const maskLocalPath = (value: string): string => {
  if (/^[A-Z]:\\/i.test(value)) return `${value.slice(0, 3)}****`;
  if (value.startsWith("/")) return `/${"****"}`;
  return "[本地路径已隐藏]";
};
const maskUrl = (value: string): string => {
  const match = value.match(/^(https?:\/\/)([^/?#]+)(.*)$/i);
  if (!match) return keepEnds(value, 10, 4);
  const [, protocol, host, suffix] = match;
  const maskedHost = host.length <= 7 ? keepFirst(host, 2) : keepEnds(host, 4, 3);
  if (!suffix) return `${protocol}${maskedHost}`;
  const queryStart = suffix.indexOf("?");
  const query = queryStart >= 0
    ? suffix.slice(queryStart).replace(/([?&][^=&#\s]+)=([^&#\s]*)/g, "$1=******")
    : "";
  return `${protocol}${maskedHost}/****${query}`;
};

const rules: Rule[] = [
  // 私钥（PEM 格式）
  { type: "private-key", pattern: /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, mask: () => "[私钥内容已隐藏]" },

  // Bearer / Authorization 令牌
  { type: "authorization", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, mask: (value) => `${value.slice(0, 7)}******` },

  // API 密钥（sk- / rk- / pk- / ak- / tk- 前缀，以及常见平台格式）
  {
    type: "api-key",
    pattern: /\b(?:sk|rk|pk|ak|tk)[_-][A-Za-z0-9_-]{4,}|\b(?:AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{32,}|github_pat_[A-Za-z0-9_]{20,}|hf_[A-Za-z0-9]{20,}|r8_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|deepseek-[A-Za-z0-9]{8,})/g,
    mask: (value) => keepEnds(value, 3, 3),
  },

  // JWT
  { type: "jwt", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, mask: () => "[JWT 已隐藏]" },

  // 密码 / 密钥 / 令牌 等关键字段（含中文；CJK 非 \w，不能用 \b 起始）
  {
    type: "password",
    pattern: /(?<![A-Za-z0-9_])(?!access[_-]?token|auth[_-]?token|refresh[_-]?token)(?:[A-Za-z][A-Za-z0-9_]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|auth|credential)[A-Za-z0-9_]*|password|passwd|pwd|secret|token|api[_-]?key|apikey|auth|credential|密码|密钥|令牌|秘钥|口令)\s*[:=：]\s*["']?[^\s,;&\n"']+["']?/gi,
    mask: (value) => {
      const separator = value.match(/[:=：]\s*/)?.[0] ?? "=";
      const secret = value.slice(value.indexOf(separator) + separator.length);
      const label = value.slice(0, value.indexOf(separator));
      // 密钥/API Key/令牌通常需要确认是否填对，保留首尾少量字符即可；
      // password/密码仍完全隐藏，避免在详情页泄露可用凭据。
      const partial = /^(?:密钥|秘钥|api\s*key|api[_-]?key|apikey|令牌)$/i.test(label.trim());
      const quoted = /^(["'])(.*)\1$/.exec(secret);
      const secretValue = quoted?.[2] ?? secret;
      const safeValue = partial ? keepEnds(secretValue, 3, 3) : "******";
      return `${label}${separator}${quoted ? `${quoted[1]}${safeValue}${quoted[1]}` : safeValue}`;
    },
  },

  // 邮箱配置中常见的数字账号、用户名等标识，即使不是标准邮箱地址也要保护。
  {
    type: "account-id",
    pattern: /(?<![A-Za-z0-9_])(?:邮箱地址|邮箱账号|邮箱账户|用户名|账号)\s*[:=：]\s*[^\s,;&\n]+/gi,
    mask: (value) => {
      const separator = value.match(/[:=：]\s*/)?.[0] ?? "=";
      const identifier = value.slice(value.indexOf(separator) + separator.length);
      return `${value.slice(0, value.indexOf(separator))}${separator}${keepEnds(identifier, 2, 2)}`;
    },
  },

  // URL 查询参数中的敏感值
  {
    type: "url-secret",
    pattern: /([?&](?:token|access_token|refresh_token|api[_-]?key|apikey|secret|client_secret|password|auth|key|client_id)=)[^&#\s]+/gi,
    mask: (value) => value.replace(/(=)[^]+$/, "$1******"),
  },

  // 数据库连接字符串
  { type: "database-url", pattern: /\b(?:mysql|postgres(?:ql)?|mongodb|redis|sqlite):\/\/[^\s]+/gi, mask: (value) => value.replace(/:\/\/([^:]+):([^@]+)@/, "://***:******@") },

  // 普通网站地址也属于需要保护的外部凭据/来源信息：保留协议和少量域名片段，
  // 路径、查询参数与完整域名不在详情正文中直接展示。
  {
    type: "url",
    pattern: /\bhttps?:\/\/(?![^\s<>'"`]*[?&](?:token|access_token|refresh_token|api[_-]?key|apikey|secret|client_secret|password|auth|key|client_id)=)[^\s<>'"`]+/gi,
    mask: maskUrl,
  },

  // 邮箱
  { type: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, mask: (value) => `${value[0]}***@${value.split("@")[1]}` },

  // 中国大陆手机号
  { type: "phone", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g, mask: (value) => `${value.slice(0, 3)}****${value.slice(-4)}` },

  // 中国大陆身份证号（18 位）——必须先于银行卡规则，避免 18 位身份证被银行卡匹配优先占用
  {
    type: "id-card",
    pattern: /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g,
    mask: (value) => `${value.slice(0, 3)}***********${value.slice(-4)}`,
  },

  // 银行卡号（16-19 位数字，可含空格/短横线分隔；结尾必须是数字，避免吞掉尾部空格）
  { type: "bank-card", pattern: /(?<!\d)(?:\d[ -]?){15,18}\d(?!\d)/g, mask: (value) => `**** **** **** ${value.replace(/\D/g, "").slice(-4)}` },

  // 信用卡号（Visa / MasterCard / AmEx / Discover）
  {
    type: "credit-card",
    pattern: /(?<!\d)(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})(?!\d)/g,
    mask: (value) => `**** **** **** ${value.replace(/\D/g, "").slice(-4)}`,
  },

  // IPv4 地址
  { type: "ip", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, mask: (value) => `${value.split(".")[0]}.${value.split(".")[1]}.*.*` },

  // 本地文件路径（Windows / macOS / Linux）
  { type: "local-path", pattern: /(?:[A-Z]:\\|\/Users\/|\/home\/|\/root\/)[^\s"']+/g, mask: maskLocalPath },

  // 通用访问令牌（access_token / auth_token 等）
  {
    type: "access-token",
    pattern: /\b(?:access[_-]?token|auth[_-]?token|refresh[_-]?token)\s*[:=]\s*[A-Za-z0-9._~+/=-]{8,}/gi,
    mask: (value) => value.replace(/([:=]\s*).*/, "$1******"),
  },

  // OAuth 令牌（Google ya29. / ya30. 等）
  {
    type: "oauth-token",
    pattern: /\b(?:ya29\.|ya30\.)[A-Za-z0-9_-]+/g,
    mask: (value) => keepFirst(value, 8),
  },
];

export function findSensitiveMatches(text: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const original = match[0];
      const start = match.index ?? 0;
      matches.push({ type: rule.type, start, end: start + original.length, original, masked: rule.mask(original), confidence: 0.9 });
    }
  }
  return matches.sort((a, b) => a.start - b.start || b.end - a.end).filter((match, index, all) => index === 0 || match.start >= all[index - 1].end);
}

export function redactPrompt(text: string): string {
  const matches = findSensitiveMatches(text);
  let result = text;
  for (const match of [...matches].reverse()) result = `${result.slice(0, match.start)}${match.masked}${result.slice(match.end)}`;
  return result;
}
