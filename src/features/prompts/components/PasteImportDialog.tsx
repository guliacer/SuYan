import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardPaste, ExternalLink, LoaderCircle, Split, TriangleAlert } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type { PromptClipboardCreateInput, PromptGithubProject } from "../types";
import { derivePromptTitle, parseClipboardPromptText } from "../utils/promptClipboardParser";
import { normalizeAiClipboardImport } from "../../library/utils/aiClipboardImport";
import { normalizeWebsiteAccountContent } from "../utils/promptAccount";
import { getGithubProjectTitle, parseGithubRepositoryUrl } from "../utils/githubProject";
import { GithubProjectContent } from "./GithubProjectContent";

type Props = { initialText: string; isBusy: boolean; onClose: () => void; onCreate: (items: PromptClipboardCreateInput[]) => Promise<boolean> };
export function PasteImportDialog({ initialText, isBusy, onClose, onCreate }: Props) {
  const { t } = useLocale();
  const [text, setText] = useState(initialText);
  const [split, setSplit] = useState(false);
  const [githubProject, setGithubProject] = useState<PromptGithubProject | null>(null);
  const [githubState, setGithubState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [githubError, setGithubError] = useState<string | null>(null);
  const githubRequestIdRef = useRef(0);
  const githubUrl = useMemo(() => parseGithubRepositoryUrl(text)?.url ?? null, [text]);

  useEffect(() => {
    const requestId = githubRequestIdRef.current + 1;
    githubRequestIdRef.current = requestId;
    if (!githubUrl) {
      setGithubProject(null);
      setGithubState("idle");
      setGithubError(null);
      return;
    }

    setGithubProject(null);
    setGithubState("loading");
    setGithubError(null);
    void window.suyanApi.fetchGithubProject(githubUrl).then((result) => {
      if (requestId !== githubRequestIdRef.current) return;
      if (result.ok) {
        setGithubProject(result.data);
        setGithubState("ready");
      } else {
        setGithubState("failed");
        setGithubError(result.error.message);
      }
    }).catch(() => {
      if (requestId !== githubRequestIdRef.current) return;
      setGithubState("failed");
      setGithubError(t("读取 GitHub 项目失败，请稍后重试。"));
    });
  }, [githubUrl]);

  const items = useMemo(() => {
    if (githubProject && githubUrl === githubProject.url) {
      return [{
        title: getGithubProjectTitle(githubProject),
        content: githubProject.readmeContent,
        type: "github-project" as const,
        sourceUrl: githubProject.url,
        github: githubProject,
      } satisfies PromptClipboardCreateInput];
    }
    if (githubUrl) return [];
    const rawItems = split ? parseClipboardPromptText(text) : text.trim() ? [{ title: derivePromptTitle(text), content: text.trim() }] : [];
    return rawItems.map((item) => {
      const normalized = normalizeAiClipboardImport(item.content) ?? normalizeWebsiteAccountContent(item.content);
      return normalized ? { title: normalized.title, content: normalized.content } : item;
    }) satisfies PromptClipboardCreateInput[];
  }, [githubProject, githubUrl, split, text]);
  async function submit() { if (items.length && await onCreate(items)) onClose(); }
  return <AppDialog panelClassName="flex max-h-[86dvh] w-full max-w-2xl flex-col" titleId="paste-import-title" onClose={onClose}>
    <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs text-muted">{t("系统剪贴板")}</p><h2 className="mt-1 text-lg font-semibold" id="paste-import-title">{t("粘贴创建灵感")}</h2></div><DialogCloseButton onClick={onClose} /></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <textarea className="min-h-40 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-6 outline-none focus:border-primary" value={text} onChange={(event) => setText(event.target.value)} />
      <label className={`mt-3 flex items-center gap-2 text-sm ${githubUrl ? "text-muted" : ""}`}><input checked={split} disabled={Boolean(githubUrl)} type="checkbox" onChange={(event) => setSplit(event.target.checked)} /><Split size={15} />{t("按空行拆分为多条")}</label>
      {githubUrl ? <GithubImportStatus error={githubError} onToggleReadme={(collapsed) => setGithubProject((current) => current ? { ...current, readmeCollapsed: collapsed } : current)} project={githubProject} state={githubState} /> : null}
      <p className="mt-3 text-xs text-muted">{githubUrl ? githubState === "ready" ? t("已准备创建 1 条 GitHub 项目灵感。") : t("GitHub 项目尚未准备完成。") : t("将创建 {count} 条灵感。", { count: items.length })}</p>
    </div>
    <footer className="flex justify-end gap-2 border-t border-border px-5 py-4"><Button onClick={onClose}>{t("取消")}</Button><Button disabled={!items.length || isBusy} icon={<ClipboardPaste size={16} />} variant="primary" onClick={() => void submit()}>{t("确认创建")}</Button></footer>
  </AppDialog>;
}

function GithubImportStatus({ error, onToggleReadme, project, state }: { error: string | null; onToggleReadme: (collapsed: boolean) => void; project: PromptGithubProject | null; state: "idle" | "loading" | "ready" | "failed" }) {
  const { t } = useLocale();
  if (state === "loading") return <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-3 text-sm text-muted"><LoaderCircle className="animate-spin text-primary" size={16} />{t("正在读取 GitHub 项目…")}</div>;
  if (state === "failed") return <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3 py-3 text-sm text-danger"><TriangleAlert className="mt-0.5 shrink-0" size={16} /><span>{error ?? t("GitHub 项目读取失败。")}</span></div>;
  if (!project) return null;
  return <section className="mt-4 grid gap-3 rounded-xl border border-primary/25 bg-primary-soft/30 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-primary"><Check size={14} />{t("已识别 GitHub 项目")}</p><h3 className="mt-1 truncate text-base font-semibold" title={project.fullName}>{project.name}</h3><p className="mt-1 truncate text-xs text-muted">{project.fullName} · {t("默认分支 {branch}", { branch: project.defaultBranch })}</p></div>
      <button aria-label={t("打开 GitHub 项目")} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-foreground" title={t("打开 GitHub 项目")} type="button" onClick={() => void window.suyanApi.openExternalUrl(project.url)}><ExternalLink size={15} /></button>
    </div>
    <GithubProjectContent project={project} showReleases={false} onToggleReadme={(collapsed) => { onToggleReadme(collapsed); }} />
  </section>;
}
