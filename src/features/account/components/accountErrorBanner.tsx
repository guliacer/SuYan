import { AlertCircle } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { useAccountStore } from "../store/useAccountStore";

/**
 * 结构化错误展示（方案 §二十二）：按 error.code 映射友好文案，
 * 绝不使用 message.includes(...) 判断错误类型。
 */

const ERROR_COPY: Record<string, string> = {
  ACCOUNT_BACKEND_NOT_CONFIGURED: "账号服务尚未配置，请检查登录服务设置。",
  ACCOUNT_INVALID_CREDENTIALS: "邮箱或密码不正确。",
  ACCOUNT_EMAIL_NOT_VERIFIED:
    "登录服务未返回邮箱验证状态。请先打开验证邮件中的链接；若已验证仍提示此问题，请稍后重试。",
  ACCOUNT_NETWORK_ERROR: "网络异常，请检查网络与代理设置后重试。",
  ACCOUNT_PROVIDER_UNAVAILABLE:
    "此登录方式暂不可用。请稍后重新选择；若持续失败，请联系管理员检查登录服务配置。",
  ACCOUNT_OAUTH_SERVICE_UNAVAILABLE:
    "登录服务暂时无法连接第三方平台，尚未完成授权。请稍后重试或选择其他登录方式；若持续失败，请联系管理员检查服务端连接。",
  ACCOUNT_EMAIL_NOT_CONFIGURED: "邮件服务尚未配置，暂时无法注册账号。",
  ACCOUNT_EMAIL_DELIVERY_FAILED: "验证邮件暂时无法发送，请稍后重试。",
  ACCOUNT_OAUTH_CANCELLED: "已取消授权。",
  ACCOUNT_OAUTH_IN_PROGRESS: "已有一个登录正在浏览器授权页中进行，请完成登录或点击取消当前登录后再试。",
  ACCOUNT_OAUTH_EXPIRED: "授权已过期，请重新选择登录方式。",
  ACCOUNT_OAUTH_STATE_INVALID: "授权回调校验失败，请重新尝试。",
  ACCOUNT_OAUTH_PROVIDER_ERROR: "第三方授权失败，登录服务可能暂时不可用或未完成配置，请重新开始。",
  ACCOUNT_REFRESH_FAILED: "登录已过期，请重新登录。",
  ACCOUNT_INPUT_INVALID: "请检查输入内容是否正确。",
  ACCOUNT_STORAGE_ERROR: "账号数据保存失败，请检查数据目录是否可写。",
  ACCOUNT_LINK_NOT_SUPPORTED: "当前登录服务尚未提供账号绑定接口，请联系管理员完成 Guli Identity 配置。",
  ACCOUNT_LINK_LAST_NOT_ALLOWED: "至少保留一种登录方式，不能解绑最后一个账号。",
  ACCOUNT_ALREADY_LINKED: "该登录方式已经绑定到当前或其他账号。",
  ACCOUNT_LINK_CONFIRM_REQUIRED: "该登录方式已属于其他账号，不能自动合并。",
  ACCOUNT_LINK_SCOPE_INSUFFICIENT: "目标登录方式授权范围不足，请重新完成登录授权。",
};

export function AccountErrorBanner() {
  const { t } = useLocale();
  const error = useAccountStore((state) => state.error);

  if (!error) {
    return null;
  }

  const copy = t(ERROR_COPY[error.code] ?? error.message);

  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-danger/35 bg-danger/10 px-3 py-2.5 text-xs leading-relaxed text-danger"
      role="alert"
    >
      <AlertCircle className="mt-0.5 shrink-0" size={15} />
      <span className="min-w-0 break-words">{copy}</span>
    </div>
  );
}
