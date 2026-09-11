import { Copy, CopyPlus, Pencil, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type { PromptCategory, PromptEntry } from "../types";

type Props = {
  category?: PromptCategory;
  entry: PromptEntry;
  isBusy: boolean;
  variableValues: Record<string, string>;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onToggleFavorite: () => void;
  onVariableChange: (name: string, value: string) => void;
};

export function PromptDetail(props: Props) {
  const { t } = useLocale();
  const { category, entry, isBusy, variableValues } = props;
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-panel min-[1180px]:w-[360px]" aria-label={t("灵感详情")}>
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-medium text-muted">{t("灵感详情")}</span>
        <button aria-label={t("关闭详情")} className="flex size-8 items-center justify-center rounded-lg hover:bg-primary-soft" type="button" onClick={props.onClose}><X size={17} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-6">{entry.title}</h2>
          <button aria-label={entry.favorite ? t("取消收藏") : t("收藏")} className={entry.favorite ? "text-warning" : "text-muted"} type="button" onClick={props.onToggleFavorite}><Star fill={entry.favorite ? "currentColor" : "none"} size={18} /></button>
        </div>
        {entry.description ? <p className="mt-2 text-sm leading-5 text-muted">{entry.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {category ? <span className="rounded-md bg-primary-soft px-2 py-1">{category.icon} {category.name}</span> : null}
          {entry.tagIds.map((tag) => <span className="rounded-md border border-border px-2 py-1" key={tag}>{tag}</span>)}
        </div>
        <section className="mt-6 border-t border-border pt-5">
          <h3 className="text-xs font-semibold text-muted">{t("提示词")}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
        </section>
        {entry.variables.length ? (
          <section className="mt-6 border-t border-border pt-5">
            <h3 className="text-xs font-semibold text-muted">{t("变量")}</h3>
            <div className="mt-3 grid gap-3">
              {entry.variables.map((variable) => (
                <label className="grid gap-1.5 text-xs font-medium" key={variable.name}>{variable.name}
                  <input className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" placeholder={variable.defaultValue ?? t("填写变量值")} value={variableValues[variable.name] ?? ""} onChange={(event) => props.onVariableChange(variable.name, event.target.value)} />
                </label>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <footer className="grid gap-2 border-t border-border p-4">
        <Button disabled={isBusy} icon={<Copy size={16} />} variant="primary" maxWidth={false} onClick={props.onCopy}>{t("复制提示词")}</Button>
        <div className="grid grid-cols-3 gap-2">
          <Button aria-label={t("编辑")} disabled={isBusy} icon={<Pencil size={15} />} maxWidth={false} onClick={props.onEdit} />
          <Button aria-label={t("复制一份")} disabled={isBusy} icon={<CopyPlus size={15} />} maxWidth={false} onClick={props.onDuplicate} />
          <Button aria-label={t("删除")} disabled={isBusy} icon={<Trash2 size={15} />} maxWidth={false} variant="danger" onClick={props.onDelete} />
        </div>
      </footer>
    </aside>
  );
}
