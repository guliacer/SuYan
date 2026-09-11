import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ExternalLink, LogIn, Mail, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { useLocale } from "@/components/LocaleProvider";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAccountStore } from "../store/useAccountStore";
import {
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  type AccountOAuthProfileSelection,
  type AccountOAuthStartOptions,
} from "../types/account";
import { AccountErrorBanner } from "./accountErrorBanner";
import { OAuthLoginButtons } from "./OAuthLoginButtons";
import { LastLoginBadge } from "./LastLoginBadge";
import { OAuthProfileChoiceFields } from "./OAuthProfileChoiceFields";
import { UserAvatar } from "./UserAvatar";

type LoginDialogProps = {
  onClose: () => void;
  onSwitchToRegister: () => void;
  forceReauthentication?: boolean;
  initialEmail?: string;
};

/**
 * 邮箱在这里输入并作为 email_hint 传给统一授权页；密码仍由 Guli Identity
 * 页面承载，客户端不接触密码。第三方登录在系统默认浏览器中重新进入实际授权
 * 流程，回调返回的身份也必须在这里明确确认。
 */
export function LoginDialog({
  onClose,
  onSwitchToRegister,
  forceReauthentication = false,
  initialEmail = "",
}: LoginDialogProps) {
  const { t } = useLocale();
  const isSubmitting = useAccountStore((state) => state.isSubmitting);
  const submittingAction = useAccountStore((state) => state.submittingAction);
  const currentUser = useAccountStore((state) => state.user);
  const lastLoginMethod = useAccountStore((state) => state.lastLoginMethod);
  const activeOAuthProvider = useAccountStore((state) => state.activeOAuthProvider);
  const oauthPendingProvider = useAccountStore((state) => state.oauthPendingProvider);
  const oauthDevice = useAccountStore((state) => state.oauthDevice);
  const oauthConfirmation = useAccountStore((state) => state.oauthConfirmation);
  const clearError = useAccountStore((state) => state.clearError);
  const loginOAuth = useAccountStore((state) => state.loginOAuth);
  const confirmOAuth = useAccountStore((state) => state.confirmOAuth);
  const selectOAuthAvatar = useAccountStore((state) => state.selectOAuthAvatar);
  const cancelOAuth = useAccountStore((state) => state.cancelOAuth);
  const [accountIdentifier, setAccountIdentifier] = useState(initialEmail);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  const [profileSelection, setProfileSelection] = useState<AccountOAuthProfileSelection>(() => ({
    usernameSource: currentUser ? "current" : "new",
    avatarSource: currentUser ? "current" : "new",
  }));
  const oauthBusy =
    isSubmitting || Boolean(oauthPendingProvider) || Boolean(oauthConfirmation);
  const isLinkConfirmation = oauthConfirmation?.purpose === "link";
  const oauthOptions: AccountOAuthStartOptions = { prompt: "login" };

  useEffect(() => {
    if (!oauthConfirmation) {
      setCustomAvatarPreview(null);
      return;
    }
    setProfileSelection({
      usernameSource: currentUser ? "current" : "new",
      avatarSource: currentUser ? "current" : "new",
    });
    setCustomAvatarPreview(null);
  }, [currentUser, oauthConfirmation]);

  async function handleChooseCustomAvatar(): Promise<boolean> {
    const previewUrl = await selectOAuthAvatar();
    if (!previewUrl) {
      return false;
    }
    setCustomAvatarPreview(previewUrl);
    return true;
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const emailHint = accountIdentifier.trim();
    if (!emailHint) {
      return;
    }
    void loginOAuth("email", { prompt: "login", emailHint });
  }

  function handleSwitchToRegister(): void {
    clearError();
    onSwitchToRegister();
  }

  return (
    <AppDialog
      panelClassName="max-h-[min(700px,calc(100vh-1rem))] w-full max-w-[448px]"
      titleId="account-login-title"
      onClose={onClose}
    >
      <div className="flex items-start justify-between border-b border-border bg-panel px-5 py-4 min-[640px]:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppLogoMark className="size-10 rounded-2xl" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary">{t("素言账号")}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-foreground" id="account-login-title">
              {t("登录")}
            </h2>
          </div>
        </div>
        <DialogCloseButton ariaLabel={`${t("关闭")} ${t("登录")}`} onClick={onClose} />
      </div>

      <div className="min-h-0 overflow-y-auto px-5 py-5 min-[640px]:px-6 min-[640px]:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t("选择登录方式")}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {forceReauthentication
                ? t("第三方登录会重新验证身份，再在系统默认浏览器中完成授权；若网站已有登录会话，请在第三方页面切换账户。")
                : t("将在系统默认浏览器中完成真实身份验证，成功后自动回到素言。")}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted">
            {t("安全登录")}
          </span>
        </div>
        <div className="mt-4">
          <AccountErrorBanner />
        </div>
        {oauthConfirmation ? (
          <div
            className="mt-4 grid gap-3 rounded-2xl border border-primary/30 bg-primary-soft p-3.5 text-xs leading-5 text-foreground"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-start gap-3">
              <UserAvatar size={42} user={oauthConfirmation.user} />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {isLinkConfirmation ? t("请确认绑定方式") : t("请确认登录账号")}
                </p>
                <p className="mt-0.5 break-words text-muted">
                  {oauthConfirmation.user.username}
                  {oauthConfirmation.user.email
                    ? `（${oauthConfirmation.user.email}）`
                    : ""}
                </p>
                <p className="mt-1 text-muted">
                  {isLinkConfirmation
                    ? t("确认后会绑定到当前素言账号，不会切换当前账号。")
                    : t("确认后才会切换当前素言账号。")}
                </p>
              </div>
            </div>
            <OAuthProfileChoiceFields
              currentUser={currentUser}
              customAvatarPreview={customAvatarPreview}
              disabled={isSubmitting}
              pendingUser={oauthConfirmation.user}
              selection={profileSelection}
              onChange={setProfileSelection}
              onChooseCustomAvatar={handleChooseCustomAvatar}
            />
            <div className="grid gap-2 min-[420px]:grid-cols-2">
              <Button
                className="w-full"
                disabled={isSubmitting}
                icon={<CheckCircle2 size={15} />}
                maxWidth={false}
                onClick={() => void confirmOAuth(profileSelection)}
              >
                {submittingAction === "confirmOAuth" ? t("确认中...") : isLinkConfirmation ? t("确认绑定") : t("确认登录")}
              </Button>
              <Button
                className="w-full"
                disabled={isSubmitting}
                icon={<X size={15} />}
                maxWidth={false}
                variant="ghost"
                onClick={() => void cancelOAuth()}
              >
                {t("取消")}
              </Button>
            </div>
          </div>
        ) : null}
        {oauthPendingProvider ? (
          <div
            className="mt-4 grid gap-3 rounded-2xl border border-primary/25 bg-primary-soft p-3.5 text-xs leading-5 text-foreground"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-panel text-primary shadow-sm">
                <ExternalLink size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{oauthDevice ? t("设备验证码登录") : t("浏览器授权页已打开")}</p>
                <p className="mt-0.5 break-words text-muted">
                  {oauthDevice
                    ? t("在浏览器输入下方验证码，选择自己的账号并允许授权。完成后请回到素言确认昵称与头像。")
                    : t("请在系统默认浏览器的 {provider} 授权页中完成授权，再返回素言确认昵称与头像。若未自动返回，请点击浏览器中的「返回素言」。", { provider: ACCOUNT_LOGIN_PROVIDER_LABELS[oauthPendingProvider] })}
                </p>
              </div>
            </div>
            {oauthDevice ? <DeviceCodePanel device={oauthDevice} /> : null}
            <Button
              className="w-full border-primary/25 bg-panel/65 text-primary hover:border-primary/45 hover:bg-panel"
              disabled={isSubmitting}
              icon={<X size={14} />}
              maxWidth={false}
              size="sm"
              variant="ghost"
              onClick={() => void cancelOAuth()}
            >
              {submittingAction === "cancelOAuth" ? t("正在取消...") : t("取消并重新选择")}
            </Button>
          </div>
        ) : null}

        <section data-feature-guide="account-login-methods" className="mt-5 grid gap-3" aria-label={t("选择登录方式")}>
          <Button disabled={oauthBusy} maxWidth={false} className="min-h-12 w-full" variant="ghost"
            onClick={() => void loginOAuth("email", { mode: "device" })}>
            <span className="inline-flex flex-wrap items-center justify-center gap-2">
              {t("设备验证码登录")}
              {lastLoginMethod === "device" ? <LastLoginBadge /> : null}
            </span>
          </Button>
          <form className="grid gap-3" onSubmit={handleEmailSubmit}>
            <label
              className="grid gap-2 text-xs font-medium text-muted"
              htmlFor="account-login-email"
            >
              <span>{t("电子邮件地址")}</span>
              <span className="relative block">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted"
                  size={15}
                  aria-hidden="true"
                />
                <TextField
                  autoComplete="username"
                  autoFocus={!oauthConfirmation}
                  className="pl-10"
                  disabled={oauthBusy}
                  id="account-login-email"
                  placeholder={t("输入邮箱地址")}
                  required
                  type="email"
                  value={accountIdentifier}
                  onChange={(event) => setAccountIdentifier(event.target.value)}
                />
              </span>
            </label>
            <p className="text-xs leading-5 text-muted">
              {t("密码将在 Guli Identity 安全登录页中验证。")}
            </p>
            <Button
              className="min-h-12 w-full"
              disabled={oauthBusy}
              icon={<LogIn size={16} />}
              id="account-login-submit"
              maxWidth={false}
              title={t("在 Guli Identity 中使用邮箱与密码登录")}
              type="submit"
              variant="primary"
            >
              <span className="inline-flex flex-wrap items-center justify-center gap-2">
                {activeOAuthProvider === "email" ? t("正在打开登录页...") : t("登录")}
                {lastLoginMethod === "email" ? <LastLoginBadge onPrimary /> : null}
              </span>
            </Button>
          </form>

          <div className="flex items-center gap-3 px-1" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium text-muted">{t("或使用第三方账号")}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <OAuthLoginButtons disabled={oauthBusy} options={oauthOptions} lastLoginMethod={lastLoginMethod} />
        </section>

        <p className="mt-5 text-center text-xs text-muted">
          {t("还没有账号？")} {" "}
          <button
            className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            disabled={oauthBusy}
            type="button"
            onClick={handleSwitchToRegister}
          >
            {t("注册邮箱账号")}
          </button>
        </p>
      </div>
    </AppDialog>
  );
}

function DeviceCodePanel({ device }: { device: import("../types/account").AccountDeviceAuthorization }) {
  const { t } = useLocale();
  const expiresAt = useAccountStore((state) => state.oauthExpiresAt);
  const [now, setNow] = useState(Date.now);
  const [feedback, setFeedback] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function copyCode() {
    try {
      const result = await window.suyanApi.writeClipboardText(device.userCode);
      setFeedback(result.ok ? t("验证码已复制") : t("复制失败，请手动选择验证码复制。"));
    } catch { setFeedback(t("复制失败，请手动选择验证码复制。")); }
  }
  async function openPage() {
    try {
      const result = await window.suyanApi.openExternalUrl(device.verificationUri);
      setFeedback(result.ok ? t("授权页已打开") : t("无法打开浏览器，请手动打开下方地址。"));
    } catch { setFeedback(t("无法打开浏览器，请手动打开下方地址。")); }
  }
  return <div className="grid min-w-0 gap-2">
    <code className="select-text break-all rounded-xl border border-border bg-panel p-3 text-center text-2xl font-semibold tracking-widest">{device.userCode}</code>
    <p className="text-muted">{t("剩余 {seconds} 秒 · 正在等待授权", { seconds: Math.max(0, Math.ceil(((expiresAt ?? now) - now) / 1000)) })}</p>
    {!device.browserOpened ? <p>{t("浏览器未能自动打开，请点击下方按钮或手动访问地址。")}</p> : null}
    <p className="select-text break-all text-muted">{device.verificationUri}</p>
    <div className="grid grid-cols-2 gap-2">
      <Button size="sm" maxWidth={false} onClick={() => void copyCode()}>{t("复制验证码")}</Button>
      <Button size="sm" maxWidth={false} variant="ghost" onClick={() => void openPage()}>{t("打开授权页")}</Button>
    </div>
    <p aria-live="polite">{feedback}</p>
  </div>;
}
