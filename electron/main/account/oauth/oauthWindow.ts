import { shell } from "electron";
import { ACCOUNT_ERROR_CODES } from "../../../../src/features/account/types/account";
import { AccountError } from "../errors";

/**
 * 使用系统默认浏览器完成 OAuth。
 *
 * 默认浏览器可以复用用户已有的 GitHub/Google 会话、密码管理器和通行密钥，
 * 让用户使用平台已有的快捷登录能力；回调仍由主进程的 suyan:// 协议统一处理。
 * 回调完成前，OAuth state 只保存在主进程内存中，登录态仍必须等待用户确认。
 */
export async function openOAuthAuthorizationWindow(authorizeUrl: string): Promise<void> {
  const normalizedUrl = normalizeOAuthAuthorizationUrl(authorizeUrl);

  try {
    await shell.openExternal(normalizedUrl);
  } catch {
    throw new AccountError(
      ACCOUNT_ERROR_CODES.NETWORK_ERROR,
      "无法打开系统默认浏览器，请稍后重试。",
    );
  }
}

function normalizeOAuthAuthorizationUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new AccountError(ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE, "登录服务授权地址必须使用 HTTPS。");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof AccountError) {
      throw error;
    }
    throw new AccountError(ACCOUNT_ERROR_CODES.PROVIDER_UNAVAILABLE, "登录服务授权地址不合法。");
  }
}
