import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, CopyPlus, ExternalLink, Eye, EyeOff, Maximize2, Minimize2, Pencil, ShieldCheck, Star, Trash2 } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type { PromptCategory, PromptEntry, PromptGithubProject } from "../types";
import { deriveSiteUrl } from "../utils/promptAccount";
import { findSensitiveMatches, redactPrompt } from "../utils/promptRedaction";
import { renderPromptVariables } from "../utils/promptVariables";
import { extractPromptText, hasPromptCodeFence, plainTextToPromptHtml, preparePromptHtmlForRender } from "../utils/promptRichText";
import { PromptTagEditor } from "./PromptTagEditor";
import { GithubProjectContent, GithubProjectReleases } from "./GithubProjectContent";
import { PromptCardRichContent } from "./PromptCardRichContent";
import { getPromptColor } from "../utils/promptColors";
import { getPromptCardToneClassNames } from "./PromptCard";

type Props = {
  categories: PromptCategory[];
  entry: PromptEntry;
  isBusy: boolean;
  tagSuggestions?: string[];
  hasNext: boolean;
  hasPrevious: boolean;
  onClose: () => void;
  onCopy: (values: Record<string, string>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onMove: (categoryId: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleFavorite: () => void;
  onToggleMasked: () => void;
  onUpdateTags: (tagIds: string[]) => Promise<boolean>;
  onGithubReadmeCollapsed?: (collapsed: boolean) => void | Promise<boolean>;
  onGithubProjectRefresh?: (project: PromptGithubProject) => void | Promise<boolean>;
};

export function PromptDetailDialog(props: Props) {
  const { t, language } = useLocale();
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  // 明文展示只在当前详情窗口内显式打开，避免历史 masked=false 的旧条目直接泄露。
  const [showSensitive, setShowSensitive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [accountData, setAccountData] = useState<{ name?: string; password?: string; site?: string } | null>(null);
  const [accountState, setAccountState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [revealPassword, setRevealPassword] = useState(false);
  const [copiedSensitiveIndex, setCopiedSensitiveIndex] = useState<number | null>(null);
  const [githubRefreshState, setGithubRefreshState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const githubRefreshAttemptedRef = useRef<string | null>(null);
  const githubRequestIdRef = useRef(0);
  const isAccount = props.entry.type === "account";
  const isGithubProject = props.entry.type === "github-project" && Boolean(props.entry.github);
  const tagColorClassName = getPromptCardToneClassNames(getPromptColor(props.entry.id, props.entry.colorId)).tag;
  const rendered = useMemo(() => renderPromptVariables(
    props.entry.contentHtml ? extractPromptText(props.entry.contentHtml) : props.entry.content,
    variableValues,
    props.entry.variables,
  ), [props.entry, variableValues]);
  const renderedHtml = useMemo(() => {
    if (props.entry.contentHtml) return preparePromptHtmlForRender(renderPromptVariables(props.entry.contentHtml, variableValues, props.entry.variables));
    if (!hasPromptCodeFence(rendered)) return "";
    return preparePromptHtmlForRender(plainTextToPromptHtml(rendered));
  }, [props.entry, rendered, variableValues]);
  const matches = useMemo(() => findSensitiveMatches(rendered), [rendered]);

  // 每次切换到另一条灵感都回到安全默认值：敏感信息隐藏。
  useEffect(() => {
    setVariableValues({});
    setCopiedSensitiveIndex(null);
    setShowSensitive(false);
    setGithubRefreshState("idle");
    githubRefreshAttemptedRef.current = null;
  }, [props.entry.id]);
  // 账号条目：打开时向主进程取解密后的明文视图（仅存在于内存）。
  useEffect(() => {
    setAccountData(null);
    setRevealPassword(false);
    if (!isAccount) { setAccountState("idle"); return; }
    setAccountState("loading");
    void window.suyanApi.readPromptAccount(props.entry.id).then((result) => {
      if (result.ok) { setAccountData(result.data); setAccountState("ready"); } else setAccountState("error");
    });
  }, [isAccount, props.entry.id]);
  // 旧 GitHub 条目没有 Releases 字段时，详情首次打开自动补齐并持久化一次。
  useEffect(() => {
    const requestId = githubRequestIdRef.current + 1;
    githubRequestIdRef.current = requestId;
    const project = props.entry.github;
    if (!isGithubProject || !project || project.releases !== undefined || !props.onGithubProjectRefresh) return;
    if (githubRefreshAttemptedRef.current === project.url) return;
    githubRefreshAttemptedRef.current = project.url;
    setGithubRefreshState("loading");
    void window.suyanApi.fetchGithubProject(project.url).then(async (result) => {
      if (requestId !== githubRequestIdRef.current) return;
      if (!result.ok) { setGithubRefreshState("failed"); return; }
      setGithubRefreshState("ready");
      await props.onGithubProjectRefresh?.(result.data);
    }).catch(() => {
      if (requestId === githubRequestIdRef.current) setGithubRefreshState("failed");
    });
  }, [isGithubProject, props.entry.github, props.onGithubProjectRefresh]);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && props.hasPrevious && !isEditable(event.target)) { event.preventDefault(); props.onPrevious(); }
      if (event.key === "ArrowRight" && props.hasNext && !isEditable(event.target)) { event.preventDefault(); props.onNext(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props.hasNext, props.hasPrevious, props.onNext, props.onPrevious]);

  // 乐观更新：点击按钮立即切换本地状态，同时通知父组件持久化
  const handleToggleMasked = useCallback(() => {
    setShowSensitive((current) => !current);
    props.onToggleMasked();
  }, [props.onToggleMasked]);

  const siteUrl = useMemo(() => (accountData?.site ? deriveSiteUrl(accountData.site) : null), [accountData?.site]);

  async function copyText(text: string) { await window.suyanApi.writeClipboardText(text); }
  async function copySensitiveMatch(index: number, value: string) {
    if (!value) return;
    await copyText(value);
    setCopiedSensitiveIndex(index);
    window.setTimeout(() => setCopiedSensitiveIndex((current) => (current === index ? null : current)), 1400);
  }
  function openSite(url: string) { void window.suyanApi.openExternalUrl(url).catch(() => undefined); }

  return (
    <AppDialog overlayClassName="z-[140] px-3 py-4" panelClassName={`flex max-h-[92dvh] w-full flex-col ${fullscreen ? "h-[94dvh] max-w-[96vw]" : "max-w-[920px]"}`} titleId="prompt-detail-dialog-title" onClose={props.onClose}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0"><p className="text-xs text-muted">{t("灵感详情")}</p><button aria-label={t("编辑标题")} className="mt-1 block max-w-full truncate text-left text-xl font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35" title={t("点击编辑标题")} type="button" onClick={props.onEdit}><span id="prompt-detail-dialog-title">{props.entry.title}</span></button></div>
        <div className="flex items-center gap-1">
          <button aria-label={t("上一条")} className="flex size-9 items-center justify-center rounded-lg hover:bg-primary-soft disabled:opacity-30" disabled={!props.hasPrevious} type="button" onClick={props.onPrevious}><ArrowLeft size={17} /></button>
          <button aria-label={t("下一条")} className="flex size-9 items-center justify-center rounded-lg hover:bg-primary-soft disabled:opacity-30" disabled={!props.hasNext} type="button" onClick={props.onNext}><ArrowRight size={17} /></button>
          <button aria-label={t(fullscreen ? "退出全屏" : "全屏查看")} className="flex size-9 items-center justify-center rounded-lg hover:bg-primary-soft" type="button" onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
          <DialogCloseButton onClick={props.onClose} />
        </div>
      </header>
      <div className="grid min-h-0 flex-1 overflow-hidden min-[760px]:grid-cols-[minmax(0,1fr)_250px]">
        <div className={`min-h-0 overflow-y-auto p-5 ${isGithubProject && fullscreen ? "flex flex-col" : ""}`}>
          {isAccount ? (
            <section className="mb-5 rounded-lg border border-border bg-panel/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted">{t("账号")}</h3>
                {accountState === "loading" ? <span className="text-xs text-muted">{t("读取中…")}</span> : accountState === "error" ? <span className="text-xs text-danger">{t("读取失败")}</span> : null}
              </div>
              <div className="grid gap-3">
                <AccountField label="账号名称" onCopy={() => void copyText(accountData?.name ?? "")} copyDisabled={!accountData?.name} value={accountData?.name ?? ""} />
                <AccountField label="密码" onCopy={() => void copyText(accountData?.password ?? "")} copyDisabled={!accountData?.password} reveal={{ revealed: revealPassword, onToggle: () => setRevealPassword((value) => !value) }} value={accountData?.password ?? ""} />
                {accountData?.site ? <AccountField label="站点" onCopy={() => void copyText(accountData.site ?? "")} onOpen={siteUrl ? () => openSite(siteUrl) : undefined} value={accountData.site} /> : null}
              </div>
              </section>
          ) : null}
          {props.entry.description ? <p className="mb-4 text-sm leading-6 text-muted">{props.entry.description}</p> : null}
          {isGithubProject && props.entry.github ? (
            <section className={`mt-5 rounded-lg border border-border bg-background p-4 ${fullscreen ? "flex min-h-0 flex-1 flex-col" : ""}`}>
              <GithubProjectContent fullHeight={fullscreen} project={props.entry.github} showReleases={false} onToggleReadme={props.onGithubReadmeCollapsed} />
            </section>
          ) : (
            <section className="mt-5 rounded-lg border border-border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-muted">{t("灵感正文")}</h3>
                {matches.length ? <span className="text-xs text-warning">{t("自动发现 {count} 处敏感信息，已原位隐藏", { count: matches.length })}</span> : null}
              </div>
              {renderedHtml
                ? <PromptCardRichContent className="text-sm leading-6 [&_blockquote]:my-2 [&_blockquote]:pl-3 [&_code]:rounded [&_code]:bg-panel [&_code]:px-1 [&_img]:my-3 [&_img]:max-h-[520px] [&_pre]:my-2 [&_pre]:max-h-[520px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-panel [&_pre]:p-3 [&_ul]:list-disc" html={renderedHtml} showSensitive={showSensitive} />
                : <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6"><SensitivePromptText matches={matches} showSensitive={showSensitive} text={rendered} copiedIndex={copiedSensitiveIndex} onCopy={copySensitiveMatch} /></pre>}
            </section>
          )}
          {props.entry.variables.length ? <section className="mt-5"><h3 className="text-xs font-semibold text-muted">{t("变量")}</h3><div className="mt-3 grid gap-3 min-[600px]:grid-cols-2">{props.entry.variables.map((variable) => <label className="grid gap-1.5 text-xs font-medium" key={variable.name}>{variable.name}<input className="h-9 rounded-lg border border-border bg-panel px-3 text-sm outline-none focus:border-primary" value={variableValues[variable.name] ?? ""} placeholder={variable.defaultValue ?? t("填写变量值")} onChange={(event) => setVariableValues((current) => ({ ...current, [variable.name]: event.target.value }))} /></label>)}</div></section> : null}
        </div>
        <aside className="overflow-y-auto border-l border-border bg-background/60 p-4">
          <label className="mt-0 grid gap-1.5 text-xs font-medium">{t("分类")}<select className="h-9 rounded-lg border border-border bg-panel px-2 text-sm" value={props.entry.categoryId ?? ""} onChange={(event) => props.onMove(event.target.value)}><option value="">{t("未分类")}</option>{props.categories.map((category) => <option key={category.id} value={category.id}>{category.icon} {category.name}</option>)}</select></label>
          <div className="mt-5 border-t border-border pt-4"><PromptTagEditor colorClassName={tagColorClassName} isBusy={props.isBusy} suggestions={props.tagSuggestions} tags={props.entry.tagIds} onChange={props.onUpdateTags} /></div>
          {isGithubProject && props.entry.github ? <div className="mt-5 border-t border-border pt-4">{githubRefreshState === "loading" ? <p className="mb-2 text-[10px] text-muted">{t("正在更新 Releases…")}</p> : null}<GithubProjectReleases project={props.entry.github} /></div> : null}
          <dl className="mt-5 grid gap-3 text-xs text-muted"><div><dt>{t("使用次数")}</dt><dd className="mt-1 text-sm text-foreground">{props.entry.usageCount}</dd></div><div><dt>{t("创建时间")}</dt><dd className="mt-1 text-foreground">{formatDate(props.entry.createdAt, language)}</dd></div><div><dt>{t("更新时间")}</dt><dd className="mt-1 text-foreground">{formatDate(props.entry.updatedAt, language)}</dd></div><div><dt>{t("最近使用")}</dt><dd className="mt-1 text-foreground">{props.entry.lastUsedAt ? formatDate(props.entry.lastUsedAt, language) : t("尚未使用")}</dd></div></dl>
        </aside>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-4">
        {isGithubProject && props.entry.github ? (
          <>
            <Button disabled={props.isBusy} icon={<Copy size={16} />} variant="primary" onClick={() => props.onCopy({})}>{t("复制")}</Button>
            <Button aria-label={t("直达仓库")} icon={<ExternalLink size={16} />} title={t("直达仓库")} onClick={() => openSite(props.entry.github!.url)}>{t("直达")}</Button>
          </>
        ) : <Button disabled={props.isBusy} icon={<Copy size={16} />} variant="primary" onClick={() => props.onCopy(variableValues)}>{t("复制")}</Button>}
        {!isGithubProject ? <Button aria-label={t("脱敏复制")} className="size-10 px-0" disabled={!matches.length} icon={<ShieldCheck size={17} />} maxWidth={false} title={t("脱敏复制")} onClick={() => void copyText(redactPrompt(rendered))} /> : null}
        <div className="ml-auto flex gap-1"><Button aria-label={t(showSensitive ? "隐藏敏感信息" : "显示敏感信息")} className={showSensitive ? "border-warning bg-warning/10 text-warning" : ""} icon={showSensitive ? <EyeOff size={15} /> : <Eye size={15} />} maxWidth={false} title={t(showSensitive ? "隐藏敏感信息" : "显示敏感信息")} onClick={handleToggleMasked} /><Button aria-label={t("收藏")} icon={<Star fill={props.entry.favorite ? "currentColor" : "none"} size={15} />} maxWidth={false} onClick={props.onToggleFavorite} /><Button aria-label={t("编辑")} icon={<Pencil size={15} />} maxWidth={false} onClick={props.onEdit} /><Button aria-label={t("复制一份")} icon={<CopyPlus size={15} />} maxWidth={false} onClick={props.onDuplicate} /><Button aria-label={t("删除")} icon={<Trash2 size={15} />} maxWidth={false} variant="danger" onClick={props.onDelete} /></div>
      </footer>
    </AppDialog>
  );
}

function AccountField(props: {
  label: string;
  onCopy: () => void;
  copyDisabled?: boolean;
  onOpen?: () => void;
  reveal?: { revealed: boolean; onToggle: () => void };
  value: string;
}) {
  const { t } = useLocale();
  const label = t(props.label);
  const shown = props.reveal ? (props.reveal.revealed ? props.value : "••••••") : props.value || "—";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="flex items-center gap-1">
          {props.onOpen ? (
            <button
              aria-label={t("打开字段 {label}", { label })}
              className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              title={t("在浏览器打开字段 {label}", { label })}
              type="button"
              onClick={props.onOpen}
            >
              <ExternalLink size={14} />
            </button>
          ) : null}
          {props.reveal ? (
            <button
              aria-label={t(props.reveal.revealed ? "隐藏密码" : "显示密码")}
              className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              title={t(props.reveal.revealed ? "隐藏密码" : "显示密码")}
              type="button"
              onClick={props.reveal.onToggle}
            >
              {props.reveal.revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          ) : null}
          <button
            aria-label={t("复制字段 {label}", { label })}
            className="flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            disabled={props.copyDisabled ?? false}
            title={t("复制字段 {label}", { label })}
            type="button"
            onClick={props.onCopy}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
      <div className="min-h-9 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">{shown}</div>
    </div>
  );
}

function SensitivePromptText(props: {
  text: string;
  matches: ReturnType<typeof findSensitiveMatches>;
  showSensitive: boolean;
  copiedIndex: number | null;
  onCopy: (index: number, value: string) => void;
}) {
  const { t } = useLocale();
  if (props.matches.length === 0) return <>{props.text}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  props.matches.forEach((match, index) => {
    if (match.start < cursor) return;
    if (match.start > cursor) nodes.push(<span key={`text-${cursor}`}>{props.text.slice(cursor, match.start)}</span>);
    nodes.push(
      <span className="inline-flex items-center rounded bg-warning/10 px-0.5" key={`match-${match.start}-${match.end}`}>
        <span>{props.showSensitive ? match.original : match.masked}</span>
        <button
          aria-label={t("复制敏感信息原值 {label}", { label: t(sensitiveMatchLabel(match.type)) })}
          className="ml-0.5 inline-flex size-5 items-center justify-center rounded text-muted hover:bg-primary-soft hover:text-foreground"
          title={t("复制敏感信息原值 {label}", { label: t(sensitiveMatchLabel(match.type)) })}
          type="button"
          onClick={() => props.onCopy(index, match.original)}
        >
          {props.copiedIndex === index ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </span>,
    );
    cursor = match.end;
  });
  if (cursor < props.text.length) nodes.push(<span key={`text-${cursor}-end`}>{props.text.slice(cursor)}</span>);
  return <>{nodes}</>;
}

function formatDate(value: string, language: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString(language === "en-US" ? "en-US" : "zh-CN"); }
function isEditable(target: EventTarget | null): boolean { return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)); }
function sensitiveMatchLabel(type: string): string {
  const labels: Record<string, string> = {
    "api-key": "API Key",
    password: "密码",
    token: "令牌",
    "url-secret": "网址参数",
    url: "网址",
    email: "邮箱",
    phone: "手机号",
    "private-key": "私钥",
    authorization: "授权信息",
    "database-url": "数据库地址",
    "account-id": "账号",
  };
  return labels[type] ?? "敏感信息";
}
