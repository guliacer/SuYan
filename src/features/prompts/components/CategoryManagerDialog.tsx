import { useState } from "react";
import { ArrowDown, ArrowUp, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/TextField";
import { useLocale } from "@/components/LocaleProvider";
import type { PromptCategory, PromptCategoryDeleteInput } from "../types";

type Props = {
  categories: PromptCategory[];
  counts: Map<string, number>;
  isBusy: boolean;
  onClose: () => void;
  onCreate: (name: string, icon: string) => Promise<boolean>;
  onDelete: (input: PromptCategoryDeleteInput) => Promise<boolean>;
  onReorder: (ids: string[]) => Promise<boolean>;
  onUpdate: (id: string, name: string, icon: string) => Promise<boolean>;
};

export function CategoryManagerDialog(props: Props) {
  const { t } = useLocale();
  const [name, setName] = useState(""); const [icon, setIcon] = useState("📁");
  const [editing, setEditing] = useState<PromptCategory | null>(null);
  const [deleting, setDeleting] = useState<PromptCategory | null>(null);
  const [targetId, setTargetId] = useState("prompt-category-uncategorized");
  async function save() { const ok = editing ? await props.onUpdate(editing.id, name, icon) : await props.onCreate(name, icon); if (ok) { setEditing(null); setName(""); setIcon("📁"); } }
  async function move(index: number, delta: number) { const ids = props.categories.map((category) => category.id); const next = index + delta; if (next < 0 || next >= ids.length) return; [ids[index], ids[next]] = [ids[next], ids[index]]; await props.onReorder(ids); }
  return <AppDialog panelClassName="flex max-h-[88dvh] w-full max-w-2xl flex-col" titleId="category-manager-title" onClose={props.onClose}>
    <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs text-muted">{t("灵感创作")}</p><h2 className="mt-1 text-lg font-semibold" id="category-manager-title">{t("分类管理")}</h2></div><DialogCloseButton onClick={props.onClose} /></header>
    <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-2 border-b border-border p-4"><TextField aria-label={t("分类图标")} value={icon} onChange={(event) => setIcon(event.target.value.slice(0, 4))} /><TextField placeholder={t("分类名称")} value={name} onChange={(event) => setName(event.target.value)} /><Button disabled={!name.trim() || props.isBusy} icon={editing ? <Pencil size={15} /> : <FolderPlus size={15} />} variant="primary" onClick={() => void save()}>{editing ? t("保存") : t("新增")}</Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4"><div className="grid gap-1">{props.categories.map((category, index) => <div className="grid min-h-12 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-background px-3" key={category.id}><span className="text-lg">{category.icon}</span><div className="min-w-0"><strong className="block truncate text-sm">{category.name}</strong><span className="text-xs text-muted">{t("{count} 条灵感", { count: props.counts.get(category.id) ?? 0 })}{category.isDefault ? ` · ${t("默认分类")}` : ""}</span></div><div className="flex gap-1"><button aria-label={t("上移分类")} className="flex size-8 items-center justify-center rounded-lg hover:bg-primary-soft disabled:opacity-30" disabled={index === 0} type="button" onClick={() => void move(index, -1)}><ArrowUp size={14} /></button><button aria-label={t("下移分类")} className="flex size-8 items-center justify-center rounded-lg hover:bg-primary-soft disabled:opacity-30" disabled={index === props.categories.length - 1} type="button" onClick={() => void move(index, 1)}><ArrowDown size={14} /></button><button aria-label={t("编辑分类")} className="flex size-8 items-center justify-center rounded-lg hover:bg-primary-soft" type="button" onClick={() => { setEditing(category); setName(category.name); setIcon(category.icon ?? "📁"); }}><Pencil size={14} /></button><button aria-label={t("删除分类")} className="flex size-8 items-center justify-center rounded-lg text-danger hover:bg-danger-soft disabled:opacity-30" disabled={category.id === "prompt-category-uncategorized"} type="button" onClick={() => setDeleting(category)}><Trash2 size={14} /></button></div></div>)}</div></div>
    {deleting ? <ConfirmDialog description={<div className="grid gap-3"><p>{t("删除“{name}”后，将其中 {count} 条灵感移动到：", { name: deleting.name, count: props.counts.get(deleting.id) ?? 0 })}</p><select className="h-9 rounded-lg border border-border bg-panel px-2" value={targetId} onChange={(event) => setTargetId(event.target.value)}>{props.categories.filter((category) => category.id !== deleting.id).map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></div>} icon={<Trash2 size={18} />} isBusy={props.isBusy} open title={t("删除分类？")} onCancel={() => setDeleting(null)} onConfirm={() => void props.onDelete({ id: deleting.id, targetCategoryId: targetId }).then((ok) => { if (ok) setDeleting(null); })} /> : null}
  </AppDialog>;
}
