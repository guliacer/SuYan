import { useEffect, useMemo, useRef, useState } from "react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { runTagOrganization, useLibraryStore } from "../store/useLibraryStore";
import { isUnorganizedTagGroup, tagGroupPaths } from "../utils/tagKnowledge";
import type { TagOrganizationPreview, TagOrganizationRow } from "../types/tagKnowledge";

export function TagOrganizationDialog({ onClose, initialChoice }: { onClose: () => void; initialChoice?: { id: string; label: string } }) {
  const { t } = useLocale();
  const [preview, setPreview] = useState<TagOrganizationPreview | null>(null);
  const pendingInitialChoice = useRef(initialChoice);
  const [rows, setRows] = useState<TagOrganizationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("suggested");
  const [page, setPage] = useState(0);
  const [confirmation, setConfirmation] = useState<"apply" | "undo" | null>(null);
  const close = () => { if (!busy) onClose(); };
  async function refresh() {
    setBusy(true);
    try {
      const result = await window.suyanApi.previewTagOrganization();
      if (!result.ok) { setMessage(result.error.message); return; }
      setPreview(result.data);
      const choice = pendingInitialChoice.current;
      setRows(result.data.rows.map(row => choice ? { ...row, selected: row.id === choice.id, ...(row.id === choice.id ? { label: choice.label, group: row.originalGroup || row.group } : {}) } : row));
      if (choice) { setFilter("all"); setQuery(result.data.rows.find(r => r.id === choice.id)?.originalLabel ?? ""); pendingInitialChoice.current = undefined; }
      setPage(0);
    } catch { setMessage(t("无法读取标签整理预览，请重试。")); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  const filtered = useMemo(() => rows.filter(row => {
    const matches = `${row.originalLabel} ${row.label} ${row.originalGroup} ${row.group}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (filter === "all" || filter === "unorganized" && isUnorganizedTagGroup(row.originalGroup) || filter === "suggested" && row.suggested || filter === row.status);
  }), [rows, query, filter]);
  const selected = rows.filter(row => row.selected);
  const unorganized = rows.filter(row => isUnorganizedTagGroup(row.originalGroup));
  const corrections = rows.filter(row => row.correction);
  const resolved = unorganized.filter(row => row.status === "accepted" && !isUnorganizedTagGroup(row.group)).length;
  useEffect(() => { setPage(p => Math.min(p, Math.max(0, Math.ceil(filtered.length / 40) - 1))); }, [filtered.length]);
  const groups = [...new Set([...tagGroupPaths, ...rows.map(r=>r.group)])].filter(Boolean);
  function edit(id: string, patch: Partial<TagOrganizationRow>) {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  }
  async function commit() {
    if (!preview || !confirmation || busy) return;
    setBusy(true); useLibraryStore.setState({ isBusy: true });
    try {
      const result = await runTagOrganization(async () => {
        const result = confirmation === "undo" ? await window.suyanApi.undoTagOrganization() : await window.suyanApi.applyTagOrganization({
          revision: preview.revision, choices: selected.map(({id,label,group})=>({id,label,group})),
        });
        if (result.ok) useLibraryStore.setState({ items: result.data.library.items, promptLexicons: result.data.settings.promptLexicons });
        return result;
      });
      if (!result.ok) { setMessage(result.error.message); return; }
      setMessage(confirmation === "undo" ? t("已撤销上次整理，恢复原标签与分组。") : t("已应用整理，原名称已保留为别名。可以撤销最近一次整理。后续新识别会复用已确认的命名和分组。"));
      await refresh();
    } catch { setMessage(t("整理未完成，恢复记录已保留，请刷新后重试或撤销。")); }
    finally { setConfirmation(null); setBusy(false); useLibraryStore.setState({ isBusy: false }); }
  }
  return <AppDialog titleId="tag-organization-title" onClose={close} panelClassName="flex max-h-full w-full max-w-6xl flex-col">
    <header className="flex items-start justify-between gap-3 border-b border-border p-4">
      <div><h2 id="tag-organization-title" className="font-semibold">{t("标签归纳与整理")}</h2><p className="mt-1 text-sm text-muted">{t("先检查名称、分组与影响范围，再应用。不会删除素材，也不会按使用次数删除标签。")}</p></div>
      <DialogCloseButton onClick={close} />
    </header>
    <div className="flex flex-wrap gap-2 border-b border-border p-3">
      {[['suggested','建议整理'],['unorganized','原未归类'],['pending','待归纳'],['noise','疑似噪音'],['all','全部标签']].map(([value,label])=><Button key={value} disabled={busy} variant={filter === value ? 'primary' : 'secondary'} onClick={()=>{setFilter(value);setPage(0);}}>{t(label)}</Button>)}
      <input aria-label={t("搜索待整理标签")} placeholder={t("搜索名称或分组")} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} />
      <Button disabled={busy} onClick={()=>void refresh()}>{t("刷新预览")}</Button>
    </div>
    {message && <p role="status" className="border-b border-border bg-primary-soft p-3 text-sm">{message}</p>}
    {preview && <p className="border-b border-border px-3 py-2 text-xs text-muted">{t("原有 {count} 个未细分标签，其中 {resolved} 个已有明确分组建议，{pending} 个需人工复核。应用并确认后才会更新标签浏览。", { count: unorganized.length, resolved, pending: unorganized.length - resolved })}</p>}
    {corrections.length > 0 && <p className="border-b border-border px-3 py-2 text-xs text-muted">{t("另有 {count} 个已有分组与完整词义不一致的标签，已列入整理建议。原分组显示在名称下方，右侧为建议分组；已确认项默认不勾选，检查后可点击“选择当前建议”。自定义分组保持原设置。", { count: corrections.length })}</p>}
    {filter === "noise" && <p className="border-b border-border px-3 py-2 text-xs text-muted">{t("碎词、编号、来源水印等不再由新分析自动添加。这里只提供复核建议；确认无用时，可返回标签浏览选中该标签并点击“删除标签”，素材会保留。")}</p>}
    {confirmation ? <div className="grid gap-4 p-6">
      <p className="font-medium">{confirmation === 'undo' ? t("确认撤销最近一次标签整理？") : t("确认应用已勾选的 {count} 个标签调整？", { count: selected.length })}</p>
      <p className="text-sm text-muted">{confirmation === 'undo' ? t("恢复对应作品标签与词库；若后来又修改了相关标签，将停止撤销，避免覆盖新内容。") : t("同义名称会同步替换到作品标签，原名称作为别名保留；分组将记录为已确认。只保留最近一次整理的撤销记录。")}</p>
      <div className="flex gap-2"><Button disabled={busy} variant="primary" onClick={()=>void commit()}>{busy ? t('正在处理…') : t('确认执行')}</Button><Button disabled={busy} onClick={()=>setConfirmation(null)}>{t("返回检查")}</Button></div>
    </div> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm text-muted">
        <span>{t("{total} 个标签，已勾选 {selected} 个；每行数量按提示词组去重。", { total: filtered.length, selected: selected.length })}</span>
        <div className="flex gap-2"><Button disabled={busy} onClick={()=>setRows(current=>current.map(r=>filtered.some(f=>f.id===r.id)&&r.suggested?{...r,selected:true}:r))}>{t("选择当前建议")}</Button><Button disabled={busy} onClick={()=>setRows(current=>current.map(r=>({...r,selected:false})))}>{t("取消勾选")}</Button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3" aria-busy={busy}>
        {!preview ? <p className="p-6 text-muted">{t("正在读取标签…")}</p> : filtered.length === 0 ? <p className="p-6 text-muted">{t("当前没有匹配的标签。")}</p> : filtered.slice(page*40,(page+1)*40).map(row=><div key={row.id} className="grid gap-2 border-b border-border py-3 min-[800px]:grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
          <input type="checkbox" className="size-4 self-center justify-self-center accent-primary" aria-label={t("选择 {label}", { label: row.originalLabel })} checked={row.selected} disabled={busy} onChange={e=>edit(row.id,{selected:e.target.checked})}/>
          <div><p className="text-sm font-medium">{row.originalLabel} <span className="text-xs text-muted">{t("{count} 个作品组", { count: row.workCount })}</span></p><p className="text-xs text-muted">{row.originalGroup || t('未分组')}</p><p className="mt-1 text-xs text-muted">{row.reason}</p>{row.analysis && <p className="mt-1 break-words text-xs text-muted">{row.analysis.dimension === 'local' ? t('本地原文依据') : t('模型置信度 {percent}%（仅供参考）', { percent: Math.round(row.analysis.confidence * 100) })} · {row.analysis.evidence.join('；') || t('未提供依据')}</p>}</div>
          <label className="grid content-start gap-1 text-xs text-muted">{t("标准名称")}<input aria-label={t("{label}的标准名称", { label: row.originalLabel })} maxLength={80} value={row.label} disabled={busy} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" onChange={e=>edit(row.id,{label:e.target.value,selected:true})}/></label>
          <label className="grid content-start gap-1 text-xs text-muted">{t("所属分组")}<input list="tag-organization-groups" maxLength={120} aria-label={t("{label}的所属分组", { label: row.originalLabel })} value={row.group} disabled={busy} className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" onChange={e=>edit(row.id,{group:e.target.value,selected:true})}/><span>{t("可自定义，使用 / 划分层级")}</span></label>
        </div>)}
      </div>
      <datalist id="tag-organization-groups">{groups.map(group => <option key={group} value={group} />)}</datalist>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
        <div className="flex items-center gap-2"><Button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>{t("上一页")}</Button><span className="text-xs text-muted">{page+1} / {Math.max(1,Math.ceil(filtered.length/40))}</span><Button disabled={busy||(page+1)*40>=filtered.length} onClick={()=>setPage(p=>p+1)}>{t("下一页")}</Button></div>
        <div className="flex gap-2"><Button disabled={busy||!preview?.undoAvailable} onClick={()=>setConfirmation('undo')}>{t("撤销上次整理")}</Button><Button variant="primary" disabled={busy||!selected.length||selected.some(r=>!r.label.trim()||!r.group.trim())} onClick={()=>setConfirmation('apply')}>{t("应用勾选项（{count}）", { count: selected.length })}</Button></div>
      </footer>
    </>}
  </AppDialog>;
}
