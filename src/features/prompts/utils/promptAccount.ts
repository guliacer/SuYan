/**
 * 账号（灵感库「账号」类型）的识别与解析。
 *
 * 账号条目采用「邮箱格式」：账号名称通常是一封邮箱地址，正文形如：
 *
 *   站点：即梦AI
 *   账号：user@example.com
 *   密码：xxxxxxxx
 *
 * 保存时主进程会把「密码」行从正文剥离，仅以加密形式存入 `account.passwordEncrypted`，
 * 详情页通过 `prompt:account-read` 解密后展示与复制。本文件只做纯文本识别与解析，
 * 不涉及加解密，供渲染层（PromptCreateDialog）与主进程（promptStore / promptAnalysisService）共用。
 */

export type ParsedPromptAccount = {
  /** 账号名称（邮箱格式）。 */
  name?: string;
  /** 明文密码；仅存在于解析结果中，不会落盘。 */
  password?: string;
  /** 站点 / 平台名称。 */
  site?: string;
};

export type NormalizedPromptAccount = {
  title: string;
  content: string;
  parsed: ParsedPromptAccount;
};

/** 从账号名称生成稳定的卡片标题；邮箱账号优先使用“邮箱-账号”格式。 */
export function derivePromptAccountTitle(name: string | undefined, site: string | undefined): string {
  const normalizedName = name?.trim() ?? "";
  if (normalizedName && isEmailAccountName(normalizedName)) {
    return `邮箱-${normalizedName}`;
  }

  const websiteTitle = deriveWebsiteTitle(site);
  if (websiteTitle) {
    return websiteTitle;
  }

  return normalizedName ? `账号 · ${normalizedName}` : "网站账户";
}

export function isEmailAccountName(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

/** 账号正文只保留可用于识别/打开站点的信息，不携带账号和密码。 */
export function buildPromptAccountContent(site: string | undefined): string {
  const normalizedSite = normalizeAccountSite(site);
  return normalizedSite ? `url: ${normalizedSite}` : "";
}

export function normalizeAccountSite(site: string | undefined): string {
  const value = site?.trim() ?? "";
  if (!value) return "";
  const url = deriveSiteUrl(value);
  return stripUrlSecrets(url ?? value);
}

/** 账号名称标签（含「邮箱」等常见叫法）。 */
const ACCOUNT_NAME_LABEL_SOURCE = "账号|帐号|账户|用户名|登录名|账号名称|账户名称|邮箱|邮箱账户|account|account\\s*name|email|e-mail";

/** 密码标签。 */
const PASSWORD_LABEL_SOURCE = "密码|口令|password|passwd|pwd";

/** 账号名称行（名称标签 + 冒号 + 值）。 */
const ACCOUNT_NAME_LINE_PATTERN = new RegExp(
  `^(?:${ACCOUNT_NAME_LABEL_SOURCE})\\s*[:：=]\\s*(.+)$`,
  "i",
);

/** 密码行（密码标签 + 冒号 + 值）。 */
const PASSWORD_LINE_PATTERN = new RegExp(
  `^(?:${PASSWORD_LABEL_SOURCE})\\s*[:：=]\\s*(.+)$`,
  "i",
);

/** 站点行。 */
const SITE_LINE_PATTERN = new RegExp(
  "^(?:网址|URL|站点|网站|平台|站点名称|站点地址|域名|platform|site)\\s*[:：=]\\s*(.+)$",
  "i",
);

/** 行内紧跟在账号名称之后的密码片段（支持「账号：a@b.com 密码：xxx」单行写法）。 */
const EMBEDDED_PASSWORD_PATTERN = new RegExp(
  `(?:${PASSWORD_LABEL_SOURCE})\\s*[:：=]\\s*(.+)$`,
  "i",
);

/**
 * 识别正文是否属于「账号」类型：账号名称按邮箱格式书写（含 @ 域名），且存在密码标签。
 * 需在「邮箱配置」等宽松规则之前判断，避免账号内容被归入 email-config。
 */
export function detectAccountType(content: string): boolean {
  const lower = content.toLocaleLowerCase();
  const hasEmailLikeAccount =
    new RegExp(
      `(?:${ACCOUNT_NAME_LABEL_SOURCE})\\s*[:：]?\\s*[^\\s@：:，,;\\n]{1,64}@[^\\s@\\n]{1,128}`,
      "i",
    ).test(lower);
  const hasAccountLabel = new RegExp(`(?:^|\\r?\\n)\\s*(?:${ACCOUNT_NAME_LABEL_SOURCE})\\s*[:：=]`, "im").test(content);
  const hasWebsiteUrl = Boolean(deriveSiteUrl(parseAccountContent(content).site));
  // 密码标签需带冒号，避免「备注：无需密码」这类含「密码」字样的普通文本误判。
  const hasPasswordLabel = new RegExp(`(?:${PASSWORD_LABEL_SOURCE})\\s*[:：=]`, "i").test(lower);
  return (hasEmailLikeAccount || (hasAccountLabel && hasWebsiteUrl)) && hasPasswordLabel;
}

/** 从正文解析出账号名称、密码与站点。 */
export function parseAccountContent(content: string): ParsedPromptAccount {
  const result: ParsedPromptAccount = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (result.name === undefined) {
      const nameMatch = ACCOUNT_NAME_LINE_PATTERN.exec(line);
      if (nameMatch) {
        const rest = nameMatch[1].trim();
        const embedded = EMBEDDED_PASSWORD_PATTERN.exec(rest);
        if (embedded) {
          const namePart = rest.slice(0, embedded.index).trim();
          if (namePart) result.name = namePart;
          if (!result.password) result.password = embedded[1].trim();
        } else if (rest) {
          result.name = rest;
        }
        continue;
      }
    }

    if (result.password === undefined) {
      const passwordMatch = PASSWORD_LINE_PATTERN.exec(line);
      if (passwordMatch) {
        const value = passwordMatch[1].trim();
        if (value) result.password = value;
        continue;
      }
    }

    if (result.site === undefined) {
      const siteMatch = SITE_LINE_PATTERN.exec(line);
      if (siteMatch) {
        const value = siteMatch[1].trim();
        if (value) result.site = value;
      }
    }
  }

  return result;
}

/**
 * 从站点值推导可交给系统浏览器打开的网址：
 * - 完整 URL（http/https）原样返回；
 * - 裸域名（如 civitai.com）自动补全 https://；
 * - 纯站点名称（如「即梦AI」）无法打开，返回 null。
 */
export function deriveSiteUrl(site: string | undefined): string | null {
  const rawValue = (site ?? "").trim();
  const value = rawValue.match(/https?:\/\/[^\s<>"'\\\])}]+/i)?.[0] ?? rawValue;
  if (!value || /\s/.test(value)) return null;
  const hasExplicitScheme = /^https?:\/\//i.test(value);
  const candidate = hasExplicitScheme ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // 裸域名需要形如 xxx.xxx（含点），排除「即梦AI」这类站点名称被误当作网址。
    const host = url.hostname;
    if (
      !hasExplicitScheme &&
      !host.includes(".") &&
      host !== "localhost" &&
      !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Get a stable website title from a full URL or a bare domain. */
export function deriveWebsiteTitle(site: string | undefined): string {
  const url = deriveSiteUrl(site);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Normalize website account snippets to one safe card template. Other lines
 * are intentionally ignored; the main process later removes the password
 * line from the persisted content and stores it encrypted.
 */
export function normalizeWebsiteAccountContent(input: string): NormalizedPromptAccount | null {
  if (!detectAccountType(input)) return null;
  const parsed = parseAccountContent(input);
  const siteUrl = deriveSiteUrl(parsed.site);
  if (!siteUrl || !parsed.name || !parsed.password) return null;

  const safeSiteUrl = stripUrlSecrets(siteUrl);
  return {
    title: derivePromptAccountTitle(parsed.name, safeSiteUrl),
    content: `url: ${safeSiteUrl}\naccount: ${parsed.name}\npassword: ${parsed.password}`,
    parsed: { ...parsed, site: safeSiteUrl },
  };
}

function stripUrlSecrets(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * 从正文中剥离密码（用于落盘前移除明文密码）：
 * 纯「密码」行整行移除；「账号：a@b.com 密码：xxx」单行写法只保留账号名称部分。
 * 站点、账号名称等其余内容保留，保证卡片预览、搜索与分享不泄露密码。
 */
export function stripAccountPasswordFromContent(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^(?:密码|口令|password|passwd|pwd)\s*[:：=]\s*\S/i.test(trimmed)) return "";
      const nameMatch = ACCOUNT_NAME_LINE_PATTERN.exec(trimmed);
      if (nameMatch) return trimmed.replace(EMBEDDED_PASSWORD_PATTERN, "").trimEnd();
      return line;
    })
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}
