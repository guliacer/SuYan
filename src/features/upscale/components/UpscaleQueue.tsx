import { FolderOpen, GripVertical, ImagePlus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import type { UpscaleJob, UpscaleJobStatus } from "../types";

type UpscaleQueueProps = {
  jobs: UpscaleJob[];
  selectedJobId: string | null;
  activeJobId: string | null;
  onAddFiles(): void;
  onAddDirectory(): void;
  onDropFiles(files: File[]): void;
  onSelect(jobId: string): void;
  onRemove(jobId: string): void;
  onRetry(jobId: string): void;
  onReorder(jobId: string, beforeJobId: string): void;
  onClearCompleted(): void;
};

const statusLabels: Record<UpscaleJobStatus, string> = {
  queued: "等待处理",
  preparing: "准备输入",
  installing: "安装组件",
  "loading-model": "加载模型",
  processing: "正在处理",
  "result-ready": "待导出",
  exporting: "正在导出",
  completed: "已完成",
  canceling: "正在取消",
  canceled: "已取消",
  failed: "处理失败",
};

export function UpscaleQueue({
  jobs,
  selectedJobId,
  activeJobId,
  onAddFiles,
  onAddDirectory,
  onDropFiles,
  onSelect,
  onRemove,
  onRetry,
  onReorder,
  onClearCompleted,
}: UpscaleQueueProps) {
  const { t } = useLocale();

  return (
    <section
      className="flex min-h-0 flex-col border-r border-border/70 bg-panel/55"
      aria-label={t("任务队列")}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;
        event.preventDefault();
        onDropFiles(files);
      }}
    >
      <header className="flex min-h-14 items-center justify-between gap-2 border-b border-border/70 px-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{t("任务队列")}</h2>
          <p className="text-xs text-muted">{t("{count} 张图片", { count: jobs.length })}</p>
        </div>
        <IconTooltipButton
          disabled={!jobs.some((job) => job.status === "completed" || job.status === "canceled")}
          icon={<Trash2 className="size-4" />}
          label={t("清理已完成")}
          size="sm"
          variant="ghost"
          onClick={onClearCompleted}
        />
      </header>

      <div className="grid grid-cols-2 gap-2 border-b border-border/70 p-3">
        <Button icon={<ImagePlus className="size-4" />} maxWidth={false} size="sm" onClick={onAddFiles}>
          {t("添加图片")}
        </Button>
        <Button icon={<FolderOpen className="size-4" />} maxWidth={false} size="sm" onClick={onAddDirectory}>
          {t("添加目录")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-upscale-queue>
        {jobs.length === 0 ? (
          <button
            type="button"
            className="grid min-h-48 w-full place-items-center rounded-md border border-dashed border-border bg-background/45 px-5 text-center text-sm text-muted transition-colors hover:border-primary/55 hover:text-foreground"
            onClick={onAddFiles}
          >
            <span className="grid justify-items-center gap-3">
              <ImagePlus className="size-8 text-primary/75" aria-hidden="true" />
              <span>{t("添加或拖入图片")}</span>
            </span>
          </button>
        ) : (
          <ol className="grid gap-1.5">
            {jobs.map((job) => {
              const selected = selectedJobId === job.id;
              const canRetry = job.status === "failed" || job.status === "canceled" || (job.status === "result-ready" && Boolean(job.errorCode));
              const busy = activeJobId === job.id;
              return (
                <li
                  key={job.id}
                  draggable={!busy}
                  className={`group grid grid-cols-[1.5rem_3.25rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-md border px-1.5 py-2 transition-colors ${
                    selected
                      ? "border-primary/55 bg-primary-soft"
                      : "border-transparent bg-background/55 hover:border-border hover:bg-panel"
                  }`}
                  onDragStart={(event) => event.dataTransfer.setData("application/x-suyan-upscale-job", job.id)}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("application/x-suyan-upscale-job")) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const sourceId = event.dataTransfer.getData("application/x-suyan-upscale-job");
                    if (sourceId) {
                      event.preventDefault();
                      onReorder(sourceId, job.id);
                    }
                  }}
                >
                  <GripVertical className="size-4 cursor-grab text-muted/65" aria-hidden="true" />
                  <button type="button" className="contents" onClick={() => onSelect(job.id)}>
                    <img
                      src={job.input.previewDataUrl}
                      alt=""
                      className="size-13 rounded object-cover"
                      draggable={false}
                    />
                    <span className="grid min-w-0 gap-1 text-left">
                      <span className="truncate text-xs font-medium text-foreground" title={job.input.displayName}>
                        {job.input.displayName}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[0.6875rem] text-muted">
                        <span>{job.input.width} x {job.input.height}</span>
                        <span>{t(statusLabels[job.status])}</span>
                      </span>
                      <span className="h-1 overflow-hidden rounded-full bg-border/70" aria-hidden="true">
                        <span
                          className={`block h-full rounded-full transition-[width] ${job.status === "failed" ? "bg-danger" : "bg-progress"}`}
                          style={{ width: `${Math.round(job.progress * 100)}%` }}
                        />
                      </span>
                    </span>
                  </button>
                  {canRetry ? (
                    <IconTooltipButton
                      icon={<RotateCcw className="size-3.5" />}
                      label={t("重试")}
                      size="sm"
                      variant="ghost"
                      onClick={() => onRetry(job.id)}
                    />
                  ) : (
                    <IconTooltipButton
                      disabled={busy}
                      icon={<X className="size-3.5" />}
                      label={t("移除")}
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemove(job.id)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
