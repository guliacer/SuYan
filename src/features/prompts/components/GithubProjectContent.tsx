import { createPortal } from "react-dom";
import { Check, Copy, Download, ExternalLink, Eye, EyeOff, FileCode2, FileText, GitBranch, LoaderCircle, PackageOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { clampOverlayPosition, getAppOverlayBounds } from "@/components/ui/overlayPosition";
import type { PromptGithubProject, PromptGithubRelease, PromptGithubReleaseAsset } from "../types";
import { getGithubReadmeRawUrl } from "../utils/githubProject";
import { parseGithubMarkdown, type GithubMarkdownBlock } from "../utils/githubMarkdown";

type Props = {
  project: PromptGithubProject;
  compact?: boolean;
  /** 详情全屏时让 README 占满左侧可用高度，而不是停在固定预览高度。 */
  fullHeight?: boolean;
  /** 详情页把 Releases 移动到右侧栏时关闭内嵌版本区。 */
  showReleases?: boolean;
  onToggleReadme?: (collapsed: boolean) => void | Promise<boolean>;
};

export function GithubProjectContent({ project, compact = false, fullHeight = false, showReleases = true, onToggleReadme }: Props) {
  const { t } = useLocale();
  const [readmeCollapsed, setReadmeCollapsed] = useState(project.readmeCollapsed === true);

  useEffect(() => {
    setReadmeCollapsed(project.readmeCollapsed === true);
  }, [project.readmeCollapsed, project.url]);

  async function toggleReadme() {
    const next = !readmeCollapsed;
    setReadmeCollapsed(next);
    const result = onToggleReadme?.(next);
    if (result instanceof Promise && !(await result)) setReadmeCollapsed(!next);
  }

  return (
    <div className={`grid min-h-0 gap-3 ${fullHeight ? "h-full" : ""}`}>
      <section className={`min-h-0 gap-2 ${fullHeight ? "flex min-h-0 flex-1 flex-col" : "grid"}`}>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><GitBranch size={14} />README</p>
            <p className="mt-0.5 truncate text-[11px] text-muted" title={project.readmeName}>{project.readmeName} · {formatCharacterCount(project.readmeContent.length, t)}</p>
          </div>
          <button
            aria-label={t(readmeCollapsed ? "显示 README" : "隐藏 README")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-foreground"
            title={t(readmeCollapsed ? "显示 README" : "隐藏 README")}
            type="button"
            onClick={() => void toggleReadme()}
          >
            {readmeCollapsed ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>
        {readmeCollapsed ? (
          <div className="flex min-h-10 items-center rounded-lg border border-border bg-background px-3 text-xs text-muted">{t("README 已隐藏")}</div>
        ) : (
          <GithubReadmeMarkdown compact={compact} fullHeight={fullHeight} project={project} />
        )}
      </section>
      {showReleases ? <GithubProjectReleases compact={compact} project={project} /> : null}
    </div>
  );
}

export function GithubProjectReleases({ project, compact = false }: { project: PromptGithubProject; compact?: boolean }) {
  const { language, t } = useLocale();
  const [menu, setMenu] = useState<AssetMenuState | null>(null);
  const [copiedAssetKey, setCopiedAssetKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const releasesUrl = project.releasesUrl || `${project.url.replace(/\/$/, "")}/releases`;
  const releases = project.releases ?? [];

  useEffect(() => {
    if (!menu) return;
    function closeOnOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) setMenu(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  function openUrl(url: string) {
    void window.suyanApi.openExternalUrl(url).catch(() => undefined);
  }

  function openAssetMenu(event: MouseEvent<HTMLButtonElement>, release: PromptGithubRelease, asset: PromptGithubReleaseAsset) {
    const rect = event.currentTarget.getBoundingClientRect();
    const bounds = getAppOverlayBounds(8);
    const width = 232;
    const height = 104;
    const left = clampOverlayPosition(rect.left, width, bounds.left, bounds.right);
    const top = rect.bottom + height <= bounds.bottom
      ? rect.bottom + 6
      : clampOverlayPosition(rect.top - height - 6, height, bounds.top, bounds.bottom);
    setCopiedAssetKey(null);
    setMenu({ release, asset, left, top });
  }

  async function copyDownloadUrl(asset: PromptGithubReleaseAsset, key: string) {
    if (!asset.downloadUrl) return;
    const result = await window.suyanApi.writeClipboardText(asset.downloadUrl);
    if (!result.ok) return;
    setCopiedAssetKey(key);
    window.setTimeout(() => setMenu(null), 700);
  }

  return (
    <section className="grid min-h-0 gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground"><PackageOpen size={14} />Releases</h3>
        <button aria-label={t("打开 GitHub Releases")} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-primary hover:bg-primary-soft" title={t("打开 GitHub Releases")} type="button" onClick={() => openUrl(releasesUrl)}>
          {t("查看全部")}<ExternalLink size={11} />
        </button>
      </div>
      <div className={`grid min-h-0 gap-2 overflow-y-auto rounded-lg border border-border bg-background p-1.5 ${compact ? "max-h-36" : "max-h-[520px]"}`}>
        {releases.length ? releases.map((release) => (
          <article className="grid gap-2 rounded-md border border-border/70 bg-panel/50 p-2" key={release.id}>
            <div className="flex min-w-0 items-start justify-between gap-2">
              <button className="min-w-0 text-left" title={t("打开此版本页面")} type="button" onClick={() => openUrl(release.htmlUrl)}>
                <span className="block truncate text-xs font-semibold text-foreground">{release.name}</span>
                <span className="mt-0.5 block truncate text-[10px] text-muted">{release.tagName}{release.publishedAt ? ` · ${formatReleaseDate(release.publishedAt, language)}` : ""}{release.prerelease ? ` · ${t("预发布")}` : ""}</span>
              </button>
              <ExternalLink className="mt-0.5 shrink-0 text-muted" size={12} />
            </div>
            {release.body ? <div className="max-h-28 overflow-y-auto text-[11px] leading-5 text-muted"><GithubReleaseBody project={project} body={release.body} translate={t} /></div> : null}
            {release.assets.length ? (
              <div className="grid gap-1 border-t border-border/70 pt-1.5">
                {release.assets.map((asset) => {
                  const key = `${release.id}:${asset.name}`;
                  return <button aria-label={t("操作文件 {name}", { name: asset.name })} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-background" key={key} title={t("选择文件操作")} type="button" onClick={(event) => openAssetMenu(event, release, asset)}>
                    <FileText className="shrink-0 text-muted" size={13} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground" title={asset.name}>{asset.label || asset.name}</span>
                    {asset.size !== undefined ? <span className="shrink-0 text-[10px] text-muted">{formatFileSize(asset.size)}</span> : null}
                    <Download className="shrink-0 text-muted" size={12} />
                  </button>;
                })}
              </div>
            ) : <p className="text-[10px] text-muted">{t("此版本没有附件。")}</p>}
          </article>
        )) : <div className="flex min-h-10 items-center px-2 text-xs text-muted">{t("暂无 Releases 内容")}</div>}
      </div>
      {menu ? createPortal(
        <div ref={menuRef} className="fixed z-[180] grid w-[232px] gap-1 rounded-lg border border-border bg-panel p-1.5 shadow-elevated" role="menu" style={{ left: menu.left, top: menu.top }}>
          <button className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-xs text-foreground hover:bg-background" role="menuitem" type="button" onClick={() => { openUrl(menu.asset.htmlUrl ?? menu.release.htmlUrl); setMenu(null); }}><ExternalLink size={14} />{t("打开网页查看文件")}</button>
          <button className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-xs text-foreground hover:bg-background disabled:cursor-not-allowed disabled:opacity-40" disabled={!menu.asset.downloadUrl} role="menuitem" type="button" onClick={() => void copyDownloadUrl(menu.asset, `${menu.release.id}:${menu.asset.name}`)}>{copiedAssetKey === `${menu.release.id}:${menu.asset.name}` ? <Check size={14} /> : <Copy size={14} />} {copiedAssetKey === `${menu.release.id}:${menu.asset.name}` ? t("已复制下载链接") : t("复制文件下载链接")}</button>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}

type AssetMenuState = { release: PromptGithubRelease; asset: PromptGithubReleaseAsset; left: number; top: number };

function GithubReleaseBody({ project, body, translate }: { project: PromptGithubProject; body: string; translate: (text: string) => string }) {
  const blocks = useMemo(() => parseGithubMarkdown(body), [body]);
  return <>{blocks.map((block, index) => <GithubMarkdownBlockView block={block} index={index} project={project} translate={translate} key={`release-${index}-${block.kind}`} />)}</>;
}

function formatReleaseDate(value: string, language: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? (language === "en-US" ? "Unknown date" : "未知日期") : date.toLocaleDateString(language === "en-US" ? "en-US" : "zh-CN");
}

function GithubReadmeMarkdown({ project, compact, fullHeight }: { project: PromptGithubProject; compact: boolean; fullHeight: boolean }) {
  const { t } = useLocale();
  const blocks = useMemo(() => parseGithubMarkdown(project.readmeContent), [project.readmeContent]);
  return (
    <div className={`github-readme min-w-0 overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm leading-6 text-foreground ${fullHeight ? "min-h-0 flex-1" : compact ? "max-h-none" : "max-h-[520px]"}`}>
      {blocks.length ? blocks.map((block, index) => <GithubMarkdownBlockView block={block} index={index} project={project} translate={t} key={`${block.kind}:${index}`} />) : <p className="text-xs text-muted">{t("README 没有可展示内容。")}</p>}
    </div>
  );
}

function GithubMarkdownBlockView({ block, index, project, translate }: { block: GithubMarkdownBlock; index: number; project: PromptGithubProject; translate: (text: string) => string }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${Math.min(block.level, 4)}` as "h1" | "h2" | "h3" | "h4";
      return <Tag className={`${index ? "mt-4" : ""} mb-2 font-semibold ${block.level === 1 ? "text-xl" : block.level === 2 ? "text-lg" : "text-base"}`}>{renderInline(block.text, project, `h-${index}`, translate)}</Tag>;
    }
    case "paragraph":
      return <p className="mb-3 last:mb-0">{renderInline(block.text, project, `p-${index}`, translate)}</p>;
    case "blockquote":
      return <blockquote className="mb-3 border-l-2 border-primary pl-3 text-muted">{renderInline(block.text, project, `q-${index}`, translate)}</blockquote>;
    case "unordered-list":
      return <ul className="mb-3 list-disc space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, project, `ul-${index}-${itemIndex}`, translate)}</li>)}</ul>;
    case "ordered-list":
      return <ol className="mb-3 list-decimal space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, project, `ol-${index}-${itemIndex}`, translate)}</li>)}</ol>;
    case "code":
      return <GithubCodeBlock code={block.code} language={block.language} />;
    case "table":
      return <div className="mb-3 overflow-x-auto"><table className="min-w-full border-collapse text-xs"><thead><tr>{block.headers.map((header, headerIndex) => <th className="border border-border bg-panel px-2 py-1 text-left font-semibold" key={headerIndex}>{renderInline(header, project, `th-${index}-${headerIndex}`, translate)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_header, cellIndex) => <td className="border border-border px-2 py-1 align-top" key={cellIndex}>{renderInline(row[cellIndex] ?? "", project, `td-${index}-${rowIndex}-${cellIndex}`, translate)}</td>)}</tr>)}</tbody></table></div>;
    case "thematic-break":
      return <hr className="my-3 border-border" />;
  }
}

function GithubCodeBlock({ code, language }: { code: string; language: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    const result = await window.suyanApi.writeClipboardText(code);
    if (!result.ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><FileCode2 size={13} />{language || t("代码")}</span>
        <button aria-label={t(copied ? "代码已复制" : "复制代码")} className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-primary-soft hover:text-foreground" title={t(copied ? "代码已复制" : "复制代码")} type="button" onClick={() => void copyCode()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? t("已复制") : t("复制")}</button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-3 text-xs leading-5 text-foreground"><code>{code}</code></pre>
    </div>
  );
}

function renderInline(value: string, project: PromptGithubProject, keyPrefix: string, translate: (text: string) => string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(!?\[[^\]]*\]\([^)]*\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]*\)|https:\/\/[^\s<>()]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) nodes.push(renderInlineText(value.slice(cursor, match.index), `${keyPrefix}-text-${tokenIndex}`));
    const token = match[0] ?? "";
    nodes.push(renderInlineToken(token, project, `${keyPrefix}-${tokenIndex}`, translate));
    cursor = match.index + token.length;
    tokenIndex += 1;
  }
  if (cursor < value.length) nodes.push(renderInlineText(value.slice(cursor), `${keyPrefix}-text-end`));
  return nodes;
}

function renderInlineToken(token: string, project: PromptGithubProject, key: string, translate: (text: string) => string): ReactNode {
  if (token.startsWith("![")) {
    const match = token.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
    if (!match) return token;
    const alt = match[1] || translate("README 图片");
    const url = resolveGithubUrl(stripMarkdownDestination(match[2] ?? ""), project, true);
    return url ? renderGithubMedia(url, alt.slice(0, 200), key, translate) : <span key={key}>{translate("图片：")}{alt}</span>;
  }
  if (token.startsWith("[")) {
    const match = token.match(/^\[([^\]]+)\]\(([^)]*)\)$/);
    if (!match) return token;
    const label = match[1] || translate("打开链接");
    const destination = stripMarkdownDestination(match[2] ?? "");
    const url = resolveGithubUrl(destination, project, false);
    const mediaUrl = resolveGithubUrl(destination, project, true);
    return mediaUrl && isRichMediaUrl(mediaUrl)
      ? renderGithubMedia(mediaUrl, label, key, translate)
      : url ? <a className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary" href={url} key={key} rel="noreferrer" target="_blank" onClick={(event) => { event.preventDefault(); void window.suyanApi.openExternalUrl(url); }}>{label}</a> : label;
  }
  if (token.startsWith("https://")) {
    const url = resolveGithubUrl(token, project, false);
    const mediaUrl = resolveGithubUrl(token, project, true);
    return mediaUrl && isRichMediaUrl(mediaUrl)
      ? renderGithubMedia(mediaUrl, token, key, translate)
      : url ? <a className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary" href={url} key={key} rel="noreferrer" target="_blank" onClick={(event) => { event.preventDefault(); void window.suyanApi.openExternalUrl(url); }}>{token}</a> : token;
  }
  if (token.startsWith("`")) return <code className="rounded bg-panel px-1 py-0.5 font-mono text-[0.9em]" key={key}>{token.slice(1, -1)}</code>;
  if (token.startsWith("**") || token.startsWith("__")) return <strong key={key}>{token.slice(2, -2)}</strong>;
  if (token.startsWith("~~")) return <del key={key}>{token.slice(2, -2)}</del>;
  if (token.startsWith("*") || token.startsWith("_")) return <em key={key}>{token.slice(1, -1)}</em>;
  return token;
}

function renderGithubMedia(url: string, label: string, key: string, translate: (text: string) => string): ReactNode {
  const mediaType = getRichMediaType(url);
  if (mediaType === "video") {
    return <video aria-label={label || translate("README 视频")} className="my-3 block max-h-[420px] max-w-full rounded-lg object-contain mx-auto" controls playsInline preload="metadata" src={url} key={key} />;
  }
  if (mediaType === "audio") {
    return <audio aria-label={label || translate("README 音频")} className="my-3 block w-full max-w-2xl mx-auto" controls preload="metadata" src={url} key={key} />;
  }
  return <img alt={label || translate("README 图片")} className="my-3 block max-h-[420px] max-w-full rounded-lg object-contain mx-auto" loading="lazy" src={url} key={key} />;
}

function isRichMediaUrl(value: string): boolean {
  return getRichMediaType(value) !== null;
}

function getRichMediaType(value: string): "video" | "audio" | "image" | null {
  try {
    const extension = new URL(value).pathname.split(".").pop()?.toLowerCase() ?? "";
    if (["mp4", "webm", "mov", "m4v", "ogv"].includes(extension)) return "video";
    if (["mp3", "wav", "m4a", "aac", "flac", "opus", "oga"].includes(extension)) return "audio";
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"].includes(extension)) return "image";
  } catch {
    return null;
  }
  return null;
}

function renderInlineText(value: string, key: string): ReactNode {
  const lines = value.split("\n");
  return lines.length === 1 ? <span key={key}>{value}</span> : <span key={key}>{lines.map((line, index) => <span key={index}>{index ? <br /> : null}{line}</span>)}</span>;
}

function stripMarkdownDestination(value: string): string {
  const trimmed = value.trim().replace(/^<|>$/g, "");
  return trimmed.split(/\s+/)[0] ?? "";
}

function resolveGithubUrl(value: string, project: PromptGithubProject, image: boolean): string | null {
  if (!value || /^(?:javascript|data|vbscript):/i.test(value)) return null;
  const base = image
    ? getGithubReadmeRawUrl(project)
    : `https://github.com/${project.fullName}/blob/${encodeURIComponent(project.defaultBranch)}/${project.readmeName.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function formatCharacterCount(value: number, translate: (text: string, values?: Record<string, string | number>) => string): string {
  return value >= 10_000 ? translate("{count} 万字", { count: (value / 10_000).toFixed(1) }) : translate("{count} 字", { count: value });
}

function formatFileSize(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function GithubProjectLoading() {
  const { t } = useLocale();
  return <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted"><LoaderCircle className="animate-spin text-primary" size={16} />{t("正在读取 GitHub 项目…")}</div>;
}
