import { CircleUserRound, GitBranch, Globe2, LoaderCircle } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { useAccountStore } from "../store/useAccountStore";
import { LastLoginBadge } from "./LastLoginBadge";
import type {
  AccountExternalProviderId,
  AccountLoginMethod,
  AccountOAuthStartOptions,
} from "../types/account";

type OAuthLoginButtonsProps = {
  disabled?: boolean;
  options?: AccountOAuthStartOptions;
  lastLoginMethod?: AccountLoginMethod | null;
};

const PROVIDERS: ReadonlyArray<{
  id: AccountExternalProviderId;
  label: string;
  icon: typeof Globe2;
}> = [
  { id: "google", label: "Google", icon: CircleUserRound },
  { id: "linuxdo", label: "Linux.do", icon: Globe2 },
  { id: "github", label: "GitHub", icon: GitBranch },
];

export function OAuthLoginButtons({
  disabled = false,
  options,
  lastLoginMethod,
}: OAuthLoginButtonsProps) {
  const { t } = useLocale();
  const loginOAuth = useAccountStore((state) => state.loginOAuth);
  const activeOAuthProvider = useAccountStore(
    (state) => state.activeOAuthProvider,
  );

  return (
    <div className="grid gap-2.5 min-[640px]:grid-cols-3">
      {PROVIDERS.map(({ id, label, icon: Icon }) => {
        const isActive = activeOAuthProvider === id;
        return (
          <button
            aria-busy={isActive}
            className="inline-flex min-h-11 w-full min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground outline-none transition-colors hover:border-primary/45 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            key={id}
            title={`${t("登录")} ${label}`}
            type="button"
            onClick={() =>
              void (options ? loginOAuth(id, options) : loginOAuth(id))
            }
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
                aria-hidden="true"
              >
                {isActive ? <LoaderCircle className="animate-spin" size={14} /> : <Icon size={15} />}
              </span>
              <span className="min-w-0 truncate">
                {isActive ? t("正在打开...") : label}
              </span>
            </span>
            {lastLoginMethod === id ? <LastLoginBadge /> : null}
          </button>
        );
      })}
    </div>
  );
}
