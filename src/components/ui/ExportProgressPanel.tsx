import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Download, LoaderCircle, Minus, TriangleAlert, X } from "lucide-react";
import type { ExportTaskProgress } from "../../types/exportTask";
import { useLocale } from "@/components/LocaleProvider";

/** A modeless panel: no backdrop, focus trap, or page-wide pointer interception. */
export function ExportProgressPanel() {
  const { t } = useLocale();
  const [task, setTask] = useState<ExportTaskProgress | null>(null);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    let taskId: string | undefined;
    return window.suyanApi.onExportProgress?.(progress => {
      if (progress.id !== taskId || progress.status === "failed") setMinimized(false);
      taskId = progress.id;
      setTask(progress);
    });
  }, []);
  if (!task) return null;
  const running = task.status === "running";
  const icon = running ? <LoaderCircle size={18} className="motion-safe:animate-spin" />
    : task.status === "completed" ? <CheckCircle2 size={18} />
      : task.status === "failed" ? <TriangleAlert size={18} /> : <Download size={18} />;
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9900] max-w-[calc(100vw-2rem)]">
      {minimized ? (
        <button type="button" onClick={() => setMinimized(false)} aria-label={t("展开导出进度")}
          className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-panel px-4 py-3 text-sm text-foreground shadow-image focus-visible:ring-2 focus-visible:ring-primary">
          <span className="text-primary">{icon}</span>{running ? t("后台导出中") : t(task.phase)}
          {task.percent !== null && <span className="tabular-nums">{Math.floor(task.percent)}%</span>}
        </button>
      ) : (
        <section role="dialog" aria-modal="false" aria-labelledby="export-progress-title"
          className="theme-dialog pointer-events-auto w-80 max-w-full overflow-hidden rounded-2xl border border-border bg-panel text-foreground shadow-image">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className={task.status === "failed" ? "text-danger" : "text-primary"}>{icon}</span>
            <h2 id="export-progress-title" className="flex-1 text-sm font-semibold">{task.title}</h2>
            <button type="button" aria-label={running ? t("收起进度，继续后台导出") : t("关闭导出进度")}
              onClick={() => running ? setMinimized(true) : setTask(null)}
              className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary">
              {running ? <Minus size={16} /> : <X size={16} />}
            </button>
          </header>
          <div className="space-y-3 p-4">
            <p role="status" className="break-words text-sm">{t(task.phase)}</p>
            {task.percent !== null && <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted tabular-nums">
                <span>{task.total !== undefined ? `${task.completed ?? 0} / ${task.total}` : t("当前进度")}</span>
                <span>{Math.floor(task.percent)}%</span>
              </div>
              <div role="progressbar" aria-label={t("导出进度")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(task.percent)}
                className="h-1.5 overflow-hidden rounded-full bg-primary-soft">
                <div className="h-full rounded-full bg-primary motion-safe:transition-[width]" style={{ width: `${task.percent}%` }} />
              </div>
            </div>}
            {task.fileName && <p className="break-all text-xs text-muted">{task.fileName}</p>}
            {running && <p className="text-xs text-muted">{t("正在后台处理，可收起此窗口继续使用软件。")}</p>}
          </div>
        </section>
      )}
    </div>, document.body,
  );
}
