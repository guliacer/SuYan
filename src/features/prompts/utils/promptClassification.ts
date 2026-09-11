import type { PromptType } from "../types";
import { getAiClipboardCardTitle, parseAiClipboardImport } from "../../library/utils/aiClipboardImport";
import { derivePromptTitle } from "./promptClipboardParser";
import { derivePromptAccountTitle, detectAccountType, parseAccountContent } from "./promptAccount";

export type PromptAutoClassification = {
  type: PromptType;
  categoryName?: "账号" | "邮箱" | "API Key";
  title: string;
};

const fieldValue = (content: string, labels: string): string => {
  const pattern = new RegExp(`(?:${labels})\\s*[:：=]\\s*([^\\s,;&\\n]+)`, "i");
  return content.match(pattern)?.[1]?.trim() ?? "";
};

function hostName(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return candidate.replace(/^https?:\/\//i, "").split(/[/?#]/, 1)[0];
  }
}

function titleFor(prefix: string, value: string, fallback: string): string {
  const cleaned = value.trim();
  return cleaned ? `${prefix} · ${cleaned}` : fallback;
}

/**
 * 对粘贴/手动输入的灵感做本地、可重复的基础归类和标题生成。
 * 远程 AI 失败时也能保证账号、邮箱、API 配置不会落入“未分类”。
 */
export function classifyPromptContent(content: string): PromptAutoClassification {
  const normalized = content.trim();
  const lower = normalized.toLocaleLowerCase();
  const fallbackTitle = () => derivePromptTitle(normalized);

  // 普通长提示词走快速路径，避免在大批量导入时重复跑凭据识别正则。
  if (!/(账号|帐号|账户|用户名|登录名|邮箱|密码|api|key|token|endpoint|url|http|工作流|workflow|comfyui|视频|video)/i.test(normalized)) {
    return { type: "text", title: derivePromptTitle(normalized) };
  }

  if (detectAccountType(normalized)) {
    const account = parseAccountContent(normalized);
    return {
      type: "account",
      categoryName: "账号",
      title: derivePromptAccountTitle(account.name, account.site) || fallbackTitle(),
    };
  }

  // 使用字面量正则匹配每一行的账号字段。这里不使用 RegExp 构造器，
  // 避免字符串转义后在不同构建器中把 `\\s` 当成普通字符，导致中文账号字段漏检。
  const hasExplicitAccountLine = /(?:^|\r?\n)\s*(?:账号|帐号|账户|用户名|登录名|账号名称)\s*[:：]/im.test(normalized);
  const hasPasswordLabel = /(?:密码|口令|password|passwd|pwd)\s*[:：]/i.test(normalized);
  const hasEmailConfigFields = /邮箱地址|邮箱密码|邮箱配置|smtp|imap|pop3|邮件服务器|mail server/i.test(lower);
  if (hasExplicitAccountLine && hasPasswordLabel && !hasEmailConfigFields) {
    const account = parseAccountContent(normalized);
    return { type: "account", categoryName: "账号", title: derivePromptAccountTitle(account.name, account.site) || fallbackTitle() };
  }

  const parsedApi = parseAiClipboardImport(normalized);

  const looksLikeEmail = /邮箱地址|邮箱账号|邮箱配置|smtp|imap|pop3|邮件服务器|mail server|email/i.test(lower)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(normalized);
  if (looksLikeEmail) {
    const address = fieldValue(normalized, "邮箱地址|邮箱账号|邮箱|email|e-mail")
      || normalized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]
      || "";
    return { type: "email-config", categoryName: "邮箱", title: titleFor("邮箱", address, fallbackTitle()) };
  }

  const looksLikeApi = /api\s*key|api[_ -]?密钥|api[_ -]?令牌|apikey|endpoint|base[_ .-]?url|api[_ .-]?(?:url|地址|接口|端点)|接口地址|请求地址|基础地址|大模型|openai|claude|deepseek|gemini|groq|模型配置|密钥|秘钥|令牌|bearer|token\s*[:=：]|access[_ -]?token/i.test(lower)
    || /\b(?:sk|rk|pk|ak|tk)[_-][a-z0-9_-]{4,}/i.test(normalized)
    || Boolean(parsedApi?.apiKey);
  if (looksLikeApi) {
    const endpoint = parsedApi?.baseUrl || fieldValue(normalized, "基础\\s*URL|端点|接口地址|请求地址|endpoint|base[_ .-]?url|api[_ .-]?(?:url|地址|接口|端点)");
    return {
      type: "api-config",
      categoryName: "API Key",
      title: parsedApi ? getAiClipboardCardTitle(parsedApi.baseUrl) : titleFor("API", hostName(endpoint), "API 配置"),
    };
  }

  if (/(?:工作流|workflow|comfyui|节点)/i.test(lower)) {
    return { type: "workflow", title: fallbackTitle() };
  }
  if (/(?:视频|video|镜头运动|时长|\d+\s*秒)/i.test(lower)) {
    return { type: "video", title: fallbackTitle() };
  }

  const url = normalized.match(/\bhttps?:\/\/[^\s<>'"`]+/i)?.[0] ?? "";
  return { type: "text", title: titleFor("网址", hostName(url), fallbackTitle()) };
}
