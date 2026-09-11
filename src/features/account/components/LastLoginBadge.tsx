import { useLocale } from "@/components/LocaleProvider";

/** 仅提示本机登录历史，不代表当前账号已验证。 */
export function LastLoginBadge({ onPrimary = false }: { onPrimary?: boolean }) {
  const { t } = useLocale();
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${
      onPrimary
        ? "border-current/25 bg-white/15 text-inherit"
        : "border-primary/20 bg-primary-soft text-primary"
    }`}>
      {t("上次登录")}
    </span>
  );
}
