import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardPaste, FileText, ListPlus, LoaderCircle, Upload, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type { TodoImportCandidate, TodoImportFilesData, TodoLibraryFile, TodoTask } from "../../types";
import { useTodoStore } from "../todoStore";
import { parseTodoImportText } from "../utils/todoImportParser";
import { priorityLabel, statusLabel } from "../utils/todoProgress";

type Props = {
  tasks: TodoTask[];
  isBusy: boolean;
  onClose: () => void;
  onImport: (candidates: TodoImportCandidate[]) => Promise<{ createdCount: number; skippedCount: number }>;
};

export function TodoImportDialog({ tasks, isBusy, onClose, onImport }: Props) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<TodoImportCandidate[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [sourceName, setSourceName] = useState("文本输入");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isReading, setIsReading] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [libraries, setLibraries] = useState<TodoLibraryFile[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!text.trim()) return;
    setLibraries([]);
    const parsed = parseTodoImportText(text, { sourceLabel: sourceName });
    setCandidates(parsed.candidates);
    setWarnings(parsed.warnings);
    setSelected(new Set(parsed.candidates.map((_candidate, index) => index)));
  }, [sourceName, text]);

  const duplicateIndexes = useMemo(() => {
    const known = new Set(tasks.map((task) => normalizeKey(task.title)));
    return new Set(candidates.map((candidate, index) => known.has(normalizeKey(candidate.title)) ? index : -1).filter((index) => index >= 0));
  }, [candidates, tasks]);

  async function chooseFiles() {
    if (isReading || isBusy || isImporting) return;
    setIsReading(true);
    setResultMessage("");
    try {
      const result = await window.suyanApi.importTodoFiles();
      if (!result.ok) {
        setWarnings([result.error.message]);
        return;
      }
      applyFileResult(result.data);
    } finally {
      setIsReading(false);
    }
  }

  async function submit() {
    const selectedCandidates = candidates.filter((_candidate, index) => selected.has(index));
    if ((!selectedCandidates.length && !libraries.length) || isBusy || isImporting) return;
    setIsImporting(true);
    try {
      const nativeCount = libraries.reduce((sum, file) => sum + file.tasks.length, 0);
      if (libraries.length) {
        const imported = await useTodoStore.getState().importLibraries(libraries);
        if (!imported) { setWarnings([useTodoStore.getState().error ?? t("待办文件导入失败，请重试。")]); return; }
        setLibraries([]);
      }
      const result = selectedCandidates.length ? await onImport(selectedCandidates) : { createdCount: 0, skippedCount: 0 };
      setResultMessage(`${t("已创建 {count} 项", { count: result.createdCount + nativeCount })}${result.skippedCount ? `，${t("跳过 {count} 项重复内容", { count: result.skippedCount })}` : ""}。`);
      if (result.createdCount > 0) {
        setCandidates((current) => current.filter((_candidate, index) => !selected.has(index)));
        setSelected(new Set());
      }
    } finally { setIsImporting(false); }
  }

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function applyFileResult(data: TodoImportFilesData) {
    if (data.canceled) return;
    setLibraries(data.libraries ?? []);
    setText("");
    setSourceName(data.files.map((file) => file.fileName).join("、") || "文件导入");
    setCandidates(data.candidates);
    setWarnings(data.warnings);
    setSelected(new Set(data.candidates.map((_candidate, index) => index)));
  }

  return (
    <AppDialog overlayClassName="z-[220] px-3 py-4" panelClassName="flex max-h-[min(860px,calc(100dvh-2rem))] w-full max-w-5xl flex-col" titleId="todo-import-title" onClose={onClose}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div><p className="text-xs text-muted">{t("开发 · 优化 · 日报")}</p><h3 className="mt-1 flex items-center gap-2 text-lg font-semibold" id="todo-import-title"><ListPlus size={19} />{t("导入待办事项")}</h3></div>
        <DialogCloseButton onClick={onClose} />
      </header>
      <div className="min-h-0 overflow-y-auto p-5">
        {libraries.length > 0 && <div className="mb-4 rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm">
          <strong>{t("已识别素言待办文件：{tasks} 项事项、{projects} 个项目", { tasks: libraries.reduce((sum, file) => sum + file.tasks.length, 0), projects: libraries.reduce((sum, file) => sum + file.projects.length, 0) })}</strong>
          <p className="mt-2 leading-6">{t("确认后完整追加导入，保留状态、标签、父子关系、项目和进度视图；相同标题也会保留为独立副本，不覆盖现有事项。提示词关联需要重新设置。")}</p>
        </div>}
        <div className="grid gap-4 min-[820px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="grid content-start gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{t("粘贴或输入文本")}</strong><Button size="sm" icon={<Upload size={14} />} disabled={isReading || isBusy || isImporting} onClick={() => void chooseFiles()}>{t("选择文档")}</Button></div>
            <textarea aria-label={t("待办导入文本")} className="min-h-72 w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={t("例如：\n开发：完成接口开发 60%\n优化：修复图片导入问题，进行中\n日报：完成待办模块 100%\n\n也支持 Markdown 复选框、CSV/TSV 表格、JSON 和 DOCX 文件。")} value={text} onChange={(event) => { setText(event.target.value); setSourceName("文本输入"); setResultMessage(""); }} />
            <div className="flex flex-wrap gap-2 text-xs text-muted"><span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1"><ClipboardPaste size={13} />{t("支持百分比、状态和日期")}</span><span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1"><FileText size={13} />{sourceName === "文本输入" || sourceName === "文件导入" ? t(sourceName) : sourceName}</span></div>
            {warnings.length ? <div className="grid gap-1 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">{warnings.slice(0, 8).map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}</div> : null}
          </section>
          <section className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">{t("识别预览")}</strong><span className="ml-2 text-xs text-muted">{t("{selected}/{total} 项已选择", { selected: selected.size, total: candidates.length })}</span></div><div className="flex gap-1"><button className="rounded-md px-2 py-1 text-xs text-muted hover:bg-primary-soft hover:text-foreground" type="button" onClick={() => setSelected(new Set(candidates.map((_candidate, index) => index)))}>{t("全选")}</button><button className="rounded-md px-2 py-1 text-xs text-muted hover:bg-primary-soft hover:text-foreground" type="button" onClick={() => setSelected(new Set())}>{t("清空")}</button></div></div>
            <div className="mt-2 grid max-h-[min(520px,55dvh)] gap-2 overflow-y-auto pr-1">
              {candidates.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted"><FileText size={24} /><span>{t("输入文本或选择文档后显示识别结果")}</span></div> : candidates.map((candidate, index) => <CandidateRow candidate={candidate} duplicate={duplicateIndexes.has(index)} key={`${candidate.sourceLabel ?? "candidate"}-${index}`} selected={selected.has(index)} onToggle={() => toggle(index)} />)}
            </div>
          </section>
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4"><span className="text-xs text-muted">{libraries.length ? t("素言待办文件将作为独立副本追加导入。") : t("文本中相同标题的事项会在确认时自动跳过。")}</span><div className="flex gap-2"><Button icon={<X size={15} />} onClick={onClose}>{t("取消")}</Button><Button disabled={(!selected.size && !libraries.length) || isBusy || isReading || isImporting} variant="primary" icon={isBusy || isImporting ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} onClick={() => void submit()}>{t("确认导入")}{selected.size ? `（${selected.size}）` : ""}</Button></div></footer>
      {resultMessage ? <div className="border-t border-primary/30 bg-primary-soft px-5 py-2 text-sm">{resultMessage}</div> : null}
    </AppDialog>
  );
}

function CandidateRow({ candidate, duplicate, selected, onToggle }: { candidate: TodoImportCandidate; duplicate: boolean; selected: boolean; onToggle: () => void }) {
  const { t } = useLocale();
  return <button aria-pressed={selected} className={`grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${selected ? "border-primary/50 bg-primary-soft" : "border-border bg-panel"}`} type="button" onClick={onToggle}>
    <span className={`mt-0.5 flex size-5 items-center justify-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}><Check size={13} /></span>
    <span className="min-w-0"><strong className="block truncate text-sm" title={candidate.title}>{candidate.title}</strong><span className="mt-1 block truncate text-xs text-muted" title={candidate.description}>{candidate.projectName ? `${candidate.projectName} · ` : ""}{candidate.description ?? t("无说明")}</span></span>
    <span className="grid justify-items-end gap-1 text-[11px] text-muted"><span>{t(statusLabel(candidate.status))} · {candidate.progress}%</span><span>{t(priorityLabel(candidate.priority))}{duplicate ? ` · ${t("可能重复")}` : ""}</span></span>
  </button>;
}

function normalizeKey(value: string): string { return value.trim().toLocaleLowerCase().replace(/\s+/gu, " "); }
