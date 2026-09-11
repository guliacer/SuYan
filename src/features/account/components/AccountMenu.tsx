import { LogOut } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { useAccountStore } from "../store/useAccountStore";
import { UserAvatar } from "./UserAvatar";
import {
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  type AccountLoginProviderId,
  type AccountProviderId,
  type AccountUser,
} from "../types/account";

const LEGACY_PROVIDER_LABELS: Record<AccountProviderId, string> = {
  email: "邮箱账号",
  guli: "账号",
};

type AccountMenuProps = {
  onClose: () => void;
};

export function AccountMenu({ onClose }: AccountMenuProps) {
  const { t, language } = useLocale();
  const user = useAccountStore((state) => state.user);
  const provider = useAccountStore((state) => state.provider);
  const loginProvider = useAccountStore((state) => state.loginProvider);
  const logout = useAccountStore((state) => state.logout);
  const isSubmitting = useAccountStore((state) => state.isSubmitting);

  if (!user) {
    return null;
  }

  return (
    <div
      className="w-64 overflow-hidden rounded-2xl border border-border bg-panel shadow-elevated"
      role="menu"
    >
      <div className="flex items-center gap-3 border-b border-border/80 px-4 py-3">
        <UserAvatar size={36} user={user} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {user.username}
          </p>
          <p className="truncate text-xs text-muted">
            {accountSubtitle(user, loginProvider, provider, t)}
          </p>
        </div>
      </div>

      <dl className="grid gap-2 border-b border-border/80 px-4 py-3 text-xs">
        {user.email ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted">{t("邮箱")}</dt>
            <dd className="truncate text-right text-foreground">
              {user.email}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-muted">{t("用户 ID")}</dt>
          <dd
            className="truncate text-right font-mono text-foreground text-[10px]"
            title={user.uid}
          >
            {user.uid.length > 16 ? `${user.uid.slice(0, 16)}…` : user.uid}
          </dd>
        </div>
        {user.createdAt ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted">{t("注册时间")}</dt>
            <dd className="truncate text-right text-foreground">
              {formatDate(user.createdAt, language)}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="border-b border-border/80 px-4 py-3">
        <p className="mb-2 text-xs font-medium text-muted">{t("当前登录方式")}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2 py-0.5 text-[11px] text-foreground">
          {loginProviderLabel(loginProvider, provider, t)}
        </span>
      </div>

      <div className="p-2">
        <Button
          className="w-full"
          disabled={isSubmitting}
          icon={<LogOut size={16} />}
          variant="danger"
          onClick={() => {
            onClose();
            void logout();
          }}
        >
          {t("退出登录")}
        </Button>
      </div>
    </div>
  );
}

function accountSubtitle(
  user: AccountUser,
  loginProvider: AccountLoginProviderId | null,
  provider: AccountProviderId | null,
  t: (text: string) => string,
): string {
  if (user.email) {
    return user.email;
  }
  return `${loginProviderLabel(loginProvider, provider, t)} ${t("登录")}`;
}

function loginProviderLabel(
  loginProvider: AccountLoginProviderId | null,
  provider: AccountProviderId | null,
  t: (text: string) => string,
): string {
  if (loginProvider) {
    return t(ACCOUNT_LOGIN_PROVIDER_LABELS[loginProvider]);
  }
  return provider ? t(LEGACY_PROVIDER_LABELS[provider]) : t("账号");
}

function formatDate(value: string, language: "zh-CN" | "en-US"): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? language === "en-US" ? "Unknown" : "未知"
    : date.toLocaleDateString(language);
}
