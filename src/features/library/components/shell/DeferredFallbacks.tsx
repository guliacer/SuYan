import { useLocale } from "@/components/LocaleProvider";

export function DeferredViewFallback() {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-border bg-panel px-5 py-6 text-sm text-muted shadow-elevated">
      {t("正在加载视图...")}
    </div>
  );
}

export function PromptDetailFallback() {
  const { t } = useLocale();
  return (
    <div className="app-window-overlay z-40 flex items-center justify-center bg-foreground/45 p-4 min-[920px]:p-8">
      <div className="w-full max-w-[1500px] rounded-lg border border-border bg-panel px-5 py-6 text-sm text-muted shadow-elevated">
        {t("正在打开提示词详情...")}
      </div>
    </div>
  );
}
