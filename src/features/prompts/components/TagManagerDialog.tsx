import { useState } from "react";
import { Pencil, Tag, Trash2 } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/TextField";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  tags: string[];
  counts: Map<string, number>;
  isBusy: boolean;
  onClose: () => void;
  onRename: (source: string, target: string) => Promise<boolean>;
  onDelete: (tag: string) => Promise<boolean>;
};

export function TagManagerDialog(props: Props) {
  const { t } = useLocale();
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  async function save() {
    if (!editingTag || !name.trim()) return;
    const saved = await props.onRename(editingTag, name.trim());
    if (saved) {
      setEditingTag(null);
      setName("");
    }
  }

  return (
    <AppDialog panelClassName="flex max-h-[88dvh] w-full max-w-2xl flex-col" titleId="tag-manager-title" onClose={props.onClose}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><p className="text-xs text-muted">{t("灵感创作")}</p><h2 className="mt-1 text-lg font-semibold" id="tag-manager-title">{t("标签管理")}</h2></div>
        <DialogCloseButton onClick={props.onClose} />
      </header>
      <div className="border-b border-border bg-background/60 px-5 py-3 text-xs leading-5 text-muted">{t("标签来自灵感条目。可在这里批量重命名或删除，也可以在编辑灵感时按回车即时新增。")}</div>
      {editingTag ? <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border p-4"><TextField autoFocus aria-label={t("新标签名称")} placeholder={t("新标签名称")} value={name} onChange={(event) => setName(event.target.value)} /><Button disabled={!name.trim() || props.isBusy} icon={<Pencil size={15} />} variant="primary" onClick={() => void save()}>{t("保存名称")}</Button></div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {props.tags.length ? <div className="grid gap-1">{props.tags.map((tag) => <div className="grid min-h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-background px-3" key={tag}><span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary"><Tag size={15} /></span><div className="min-w-0"><strong className="block truncate text-sm">{tag}</strong><span className="text-xs text-muted">{t("{count} 条灵感", { count: props.counts.get(tag) ?? 0 })}</span></div><div className="flex gap-1"><button aria-label={t("重命名标签 {tag}", { tag })} className="flex size-8 items-center justify-center rounded-lg hover:bg-primary-soft" title={t("重命名标签 {tag}", { tag })} type="button" onClick={() => { setEditingTag(tag); setName(tag); }}><Pencil size={14} /></button><button aria-label={t("删除标签 {tag}", { tag })} className="flex size-8 items-center justify-center rounded-lg text-danger hover:bg-danger-soft" title={t("删除标签 {tag}", { tag })} type="button" onClick={() => setDeletingTag(tag)}><Trash2 size={14} /></button></div></div>)}</div> : <div className="flex min-h-40 items-center justify-center text-sm text-muted">{t("还没有可管理的标签。")}</div>}
      </div>
      {deletingTag ? <ConfirmDialog description={t("删除“{tag}”后，所有引用它的灵感都会移除该标签。", { tag: deletingTag })} icon={<Trash2 size={18} />} isBusy={props.isBusy} open title={t("删除标签？")} onCancel={() => setDeletingTag(null)} onConfirm={() => void props.onDelete(deletingTag).then((ok) => { if (ok) setDeletingTag(null); })} /> : null}
    </AppDialog>
  );
}
