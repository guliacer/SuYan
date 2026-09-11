import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { useLocale } from "@/components/LocaleProvider";
import { AppLogoMark } from "@/components/ui/AppLogoMark";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAccountStore } from "../store/useAccountStore";
import type { AccountRegistrationResult } from "../types/account";
import { AccountErrorBanner } from "./accountErrorBanner";

type RegisterDialogProps = {
  onClose: () => void;
  onSwitchToLogin: (email?: string) => void;
};

export function RegisterDialog({
  onClose,
  onSwitchToLogin,
}: RegisterDialogProps) {
  const { t } = useLocale();
  const registerEmail = useAccountStore((state) => state.registerEmail);
  const isSubmitting = useAccountStore((state) => state.isSubmitting);
  const submittingAction = useAccountStore((state) => state.submittingAction);
  const clearError = useAccountStore((state) => state.clearError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registration, setRegistration] =
    useState<AccountRegistrationResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearError();
    const result = await registerEmail({ email, password, confirmPassword });
    if (result) {
      setRegistration(result);
    }
  }

  function handleSwitchToLogin(emailHint?: string): void {
    clearError();
    onSwitchToLogin(emailHint);
  }

  return (
    <AppDialog
      panelClassName="flex max-h-[min(720px,calc(100vh-1rem))] w-full max-w-[430px] flex-col"
      titleId="account-register-title"
      onClose={onClose}
    >
      <div className="flex items-start justify-between border-b border-border bg-panel px-5 py-4 min-[640px]:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppLogoMark className="size-10 rounded-2xl" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
              {t("素言账号")}
            </p>
            <h2
              className="mt-0.5 text-lg font-semibold text-foreground"
              id="account-register-title"
            >
              {t("创建账号")}
            </h2>
          </div>
        </div>
        <DialogCloseButton ariaLabel={`${t("关闭")} ${t("注册")}`} onClick={onClose} />
      </div>

      {registration ? (
        <div className="min-h-0 overflow-y-auto px-5 py-5 min-[640px]:px-6 min-[640px]:py-6">
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-2xl border border-primary/25 bg-primary-soft p-4">
              <CheckCircle2
                className="text-primary"
                size={24}
                aria-hidden="true"
              />
              <div className="grid gap-1.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("注册请求已受理")}
                </h3>
                <p className="break-words text-sm leading-6 text-muted">
                  {t("身份服务已受理注册请求。若邮箱地址可用，验证邮件会发送到")} {" "}
                  <span className="font-medium text-foreground">
                    {registration.email}
                  </span>{" "}
                  {" "}{t("。请点击邮件中的链接完成验证，验证后回到这里使用邮箱登录。")}
                </p>
                <p className="text-xs leading-5 text-muted">
                  {t("如果暂时没有看到邮件，请检查垃圾邮件和广告邮件；仍未收到时，请联系管理员检查 Guli Identity 的邮件投递配置。")}
                </p>
                <p className="text-xs leading-5 text-muted">
                  {registration.message}
                </p>
              </div>
            </div>
            <Button
              className="min-h-11 w-full"
              icon={<ArrowLeft size={16} />}
              maxWidth={false}
              onClick={() => handleSwitchToLogin(registration.email)}
            >
              {t("返回登录")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="min-h-0 overflow-y-auto px-5 py-5 min-[640px]:px-6 min-[640px]:py-6"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4">
            <label
              className="grid gap-2 text-xs font-medium text-muted"
              htmlFor="account-register-email"
            >
              <span>{t("邮箱")}</span>
              <span className="relative block">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted"
                  size={15}
                  aria-hidden="true"
                />
                <TextField
                  autoComplete="email"
                  autoFocus
                  className="pl-10"
                  disabled={isSubmitting}
                  id="account-register-email"
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
            </label>
            <label
              className="grid gap-2 text-xs font-medium text-muted"
              htmlFor="account-register-password"
            >
              <span>{t("密码")}</span>
              <span className="relative block">
                <LockKeyhole
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted"
                  size={15}
                  aria-hidden="true"
                />
                <TextField
                  autoComplete="new-password"
                  className="pl-10 pr-10"
                  disabled={isSubmitting}
                  id="account-register-password"
                  minLength={12}
                  placeholder={t("至少 12 位")}
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  aria-label={showPassword ? t("隐藏密码") : t("显示密码")}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                  title={showPassword ? t("隐藏密码") : t("显示密码")}
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </span>
            </label>
            <label
              className="grid gap-2 text-xs font-medium text-muted"
              htmlFor="account-register-confirm"
            >
              <span>{t("确认密码")}</span>
              <span className="relative block">
                <ShieldCheck
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted"
                  size={15}
                  aria-hidden="true"
                />
                <TextField
                  autoComplete="new-password"
                  className="pl-10 pr-10"
                  disabled={isSubmitting}
                  id="account-register-confirm"
                  minLength={12}
                  placeholder={t("再次输入密码")}
                  required
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <button
                  aria-label={showConfirmPassword ? t("隐藏确认密码") : t("显示确认密码")}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                  title={showConfirmPassword ? t("隐藏确认密码") : t("显示确认密码")}
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                >
                  {showConfirmPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </span>
            </label>
          </div>

          <div className="mt-5">
            <AccountErrorBanner />
          </div>

          <Button
            className="mt-5 min-h-11 w-full"
            disabled={isSubmitting}
            icon={<UserPlus size={16} />}
            maxWidth={false}
            type="submit"
            variant="primary"
          >
            {submittingAction === "registerEmail" ? t("注册中...") : t("注册")}
          </Button>

          <p className="mt-5 text-center text-xs text-muted">
            {t("已有账号？")} {" "}
            <button
              className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              type="button"
              onClick={() => handleSwitchToLogin(email)}
            >
              {t("登录")}
            </button>
          </p>
        </form>
      )}
    </AppDialog>
  );
}
