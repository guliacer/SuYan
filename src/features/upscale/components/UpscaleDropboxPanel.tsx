import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, FolderInput, FolderOpen, LoaderCircle, RefreshCw, ScanSearch, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type { UpscaleDropboxScanResult } from "../types";

/**
 * 模型收件目录面板。
 *
 * 自持状态、自己调 suyanApi，不往上层加一堆 props —— 这块功能独立，
 * 跟超分的队列/预览没有状态耦合。
 *
 * 交互目标是「丢进去就完事」：主进程有文件监听会自动装，
 * 这里只是让用户能看见发生了什么、找得到目录、必要时手动触发一次。
 */
type UpscaleDropboxPanelProps = {
  /** 收起右栏时不需要这块，直接不渲染。 */
  compact?: boolean;
};

export function UpscaleDropboxPanel({ compact = false }: UpscaleDropboxPanelProps) {
  const { t } = useLocale();
  const [dropboxDir, setDropboxDir] = useState<string | null>(null);
  const [result, setResult] = useState<UpscaleDropboxScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPath = useCallback(async () => {
    const response = await window.suyanApi.getUpscaleDropboxPath();
    if (!mountedRef.current) return;
    if (response.ok) setDropboxDir(response.data.dropboxDir);
  }, []);

  const scan = useCallback(async (showBusy: boolean) => {
    if (showBusy) setScanning(true);
    setError(null);
    try {
      const response = await window.suyanApi.scanUpscaleDropbox();
      if (!mountedRef.current) return;
      if (response.ok) {
        setResult(response.data);
        setDropboxDir(response.data.dropboxDir);
      } else {
        setError(t(response.error.message));
      }
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : t("扫描收件目录失败，请重试。"));
      }
    } finally {
      if (mountedRef.current && showBusy) setScanning(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPath();
    void scan(false);
  }, [loadPath, scan]);

  // 主进程的文件监听装好东西后会推事件过来，这里跟着刷新。
  useEffect(() => {
    const unsubscribe = window.suyanApi.onUpscaleDropboxChanged((next) => {
      if (!mountedRef.current) return;
      setResult(next);
      setDropboxDir(next.dropboxDir);
    });
    return unsubscribe;
  }, []);

  const openFolder = useCallback(async () => {
    const response = await window.suyanApi.openUpscaleDropbox();
    if (!mountedRef.current) return;
    if (!response.ok) setError(t(response.error.message));
  }, [t]);

  const installedCount = result?.installedCount ?? 0;
  const alreadyCount = result?.alreadyCount ?? 0;
  const rejectedCount = result?.rejectedCount ?? 0;
  const cuganReady = result?.realCuganInstalledModelIds.length ?? 0;
  const esrganReady = result?.realEsrganInstalled ?? false;
  const entries = result?.entries ?? [];

  return (
    <section className="grid gap-3 rounded-2xl border border-border/80 bg-background/60 p-4">
      <div className="flex items-center gap-2 border-b border-border/70 pb-2.5">
        <span className="text-muted" aria-hidden="true"><FolderInput className="size-3.5" /></span>
        <h3 className="flex-1 text-sm font-semibold tracking-tight text-foreground">{t("模型收件目录")}</h3>
        <Button
          icon={scanning ? <LoaderCircle className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
          maxWidth={false}
          size="sm"
          variant="ghost"
          disabled={scanning}
          onClick={() => void scan(true)}
        >
          {scanning ? t("扫描中…") : t("立即扫描")}
        </Button>
      </div>

      <p className="text-xs leading-5 text-muted">
        {t("把下载好的模型丢进这个文件夹，软件会自动识别并装好，不需要再点安装。")}
      </p>

      <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/70 px-3 py-2">
        <FolderOpen className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={dropboxDir ?? undefined}>
          {dropboxDir ?? t("读取中…")}
        </span>
        <Button maxWidth={false} size="sm" variant="ghost" onClick={() => void openFolder()}>
          {t("打开")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-muted">
        <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
          {t("Real-CUGAN 模型 {count} / 11", { count: cuganReady })}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 ${
            esrganReady
              ? "border-primary/25 bg-primary-soft/70 text-primary"
              : "border-border/70 bg-background/70"
          }`}
        >
          {esrganReady ? t("Real-ESRGAN 已就绪") : t("Real-ESRGAN 未就绪")}
        </span>
        {result && (installedCount > 0 || alreadyCount > 0 || rejectedCount > 0) ? (
          <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
            {t("上次扫描：装好 {installed} 个，跳过 {already} 个，未识别 {rejected} 个", {
              installed: installedCount,
              already: alreadyCount,
              rejected: rejectedCount,
            })}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">{error}</p>
      ) : null}

      {/* 明细默认折叠：一眼看去不该被一堆文件名淹掉，
          需要排查时再展开。 */}
      {!compact && entries.length > 0 ? (
        <details className="group rounded-xl border border-border/80 bg-background/60 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{t("扫描明细")}</span>
            <span className="text-[0.6875rem] text-muted">{t("{count} 条", { count: entries.length })}</span>
            <ChevronDown className="size-3.5 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="grid max-h-56 gap-1 overflow-y-auto pt-2">
            {entries.map((entry) => (
              <li
                key={entry.fileName}
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[0.6875rem] leading-4 ${
                  entry.state === "rejected"
                    ? "border-warning/30 bg-warning-soft/60"
                    : "border-border/70 bg-background/70"
                }`}
              >
                {entry.state === "rejected" ? (
                  <XCircle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
                ) : entry.state === "already" ? (
                  <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-progress" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground" title={entry.fileName}>
                    {entry.fileName}
                  </span>
                  <span className="block text-muted">{entry.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
