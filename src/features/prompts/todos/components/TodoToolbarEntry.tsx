import { Archive, ListTodo, Plus } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type Props = { onOpenManager: () => void; onOpenArchive: () => void; onAddWidget: () => void; widgetCount?: number; archivedCount?: number };

export function TodoToolbarEntry({ onOpenManager, onOpenArchive, onAddWidget, widgetCount = 0, archivedCount = 0 }: Props) {
  const { t } = useLocale();
  return (
    <div className="ml-auto flex h-9 items-center gap-1 rounded-md border border-primary/25 bg-primary-soft/40 px-1">
      <button aria-label={t("待办事项")} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground hover:bg-panel" title={t("待办事项")} type="button" onClick={onOpenManager}>
        <ListTodo size={15} />
        <span>{t("待办事项")}</span>
        {widgetCount > 0 ? <span className="text-[11px] text-muted">{widgetCount}</span> : null}
      </button>
      <button aria-label={t("归档事项")} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-panel hover:text-foreground" title={t("归档事项")} type="button" onClick={onOpenArchive}><Archive size={14} /><span>{t("归档")}</span>{archivedCount > 0 ? <span className="text-[11px]">{archivedCount}</span> : null}</button>
      <button aria-label={t("添加进度视图")} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-panel hover:text-foreground" title={t("添加进度视图")} type="button" onClick={onAddWidget}>
        <Plus size={16} />
      </button>
    </div>
  );
}
