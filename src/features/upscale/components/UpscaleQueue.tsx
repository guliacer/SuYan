import { Download, FolderOpen, GripVertical, ImagePlus, ListOrdered, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
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
  onReprocess(jobId: string): void;
  onSaveAs(jobId: string): void;
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
  onReprocess,
  onSaveAs,
  onReorder,
  onClearCompleted,
}: UpscaleQueueProps) {
  const { t } = useLocale();

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={t("任务队列")}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        onDropFiles(files);
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
            <ListOrdered className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{t("任务队列")}</h2>
            <p className="truncate text-xs text-muted">{t("{count} 张图片", { count: jobs.length })}</p>
          </div>
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

      <div className="grid shrink-0 grid-cols-2 gap-2 px-4 py-3">
        <Button className="justify-center" icon={<ImagePlus className="size-4" />} maxWidth={false} size="sm" onClick={onAddFiles}>
          {t("添加图片")}
        </Button>
        <Button className="justify-center" icon={<FolderOpen className="size-4" />} maxWidth={false} size="sm" onClick={onAddDirectory}>
          {t("添加目录")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" data-upscale-queue>
        {jobs.length === 0 ? (
          <button
            type="button"
            className="flex min-h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-background/60 px-4 py-8 text-center transition-colors hover:border-primary/45 hover:bg-primary-soft/40"
            onClick={onAddFiles}
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-panel text-primary shadow-sm" aria-hidden="true">
              <ImagePlus className="size-5" />
            </span>
            <span className="grid gap-1">
              <span className="text-sm font-medium text-foreground">{t("添加或拖入图片")}</span>
              <span className="text-xs leading-4 text-muted">
                {t("拖到这里即可加入队列")}
              </span>
            </span>
            <span className="flex flex-wrap items-center justify-center gap-1">
              {["PNG", "JPG", "WEBP"].map((format) => (
                <span
                  key={format}
                  className="rounded-full border border-border bg-panel px-1.5 py-0.5 text-[0.625rem] font-medium tracking-wide text-muted"
                >
                  {format}
                </span>
              ))}
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
                  className={`group relative grid grid-cols-[1.25rem_2.75rem_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-xl border py-2 pl-1 pr-1.5 transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary-soft"
                      : "border-border/70 bg-background/60 hover:border-border hover:bg-background"
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
                  {selected ? (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                  <GripVertical className="size-4 cursor-grab text-muted/55 transition-colors group-hover:text-muted" aria-hidden="true" />
                  {/* 缩略图单独成格：「另存为」浮在缩略图角上，不占布局宽度，
                      移动端没有 hover，改用底栏的「另存为」按钮。 */}
                  <div className="relative">
                    <button type="button" className="block" onClick={() => onSelect(job.id)}>
                      <img
                        src={job.input.previewDataUrl}
                        alt=""
                        className={`size-11 rounded-lg border object-cover ${selected ? "border-primary/30" : "border-border"}`}
                        draggable={false}
                      />
                    </button>
                    {job.result ? (
                      <button
                        type="button"
                        aria-label={t("另存为")}
                        title={t("另存为")}
                        className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-md border border-border bg-panel/95 text-muted opacity-0 shadow-sm transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 max-[639px]:hidden"
                        onClick={() => onSaveAs(job.id)}
                      >
                        <Download className="size-3" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <button type="button" className="contents" onClick={() => onSelect(job.id)}>
                    <span className="grid min-w-0 gap-1 text-left">
                      <span className="truncate text-[0.8125rem] font-medium text-foreground" title={job.input.displayName}>
                        {job.input.displayName}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="tabular-nums whitespace-nowrap">{job.input.width} × {job.input.height}</span>
                        <span
                          className={`truncate ${
                            job.status === "failed"
                              ? "text-danger"
                              : job.status === "completed" || job.status === "result-ready"
                                ? "text-primary"
                                : ""
                          }`}
                        >
                          {t(statusLabels[job.status])}
                        </span>
                      </span>
                      <span className="h-1 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
                        <span
                          className={`block h-full rounded-full transition-[width] ${job.status === "failed" ? "bg-danger" : "bg-progress"}`}
                          style={{ width: `${Math.round(job.progress * 100)}%` }}
                        />
                      </span>
                    </span>
                  </button>
                  <span className="flex items-center gap-0.5">
                    {/* 有结果时给「重新处理」：换模型后对这张图再跑一遍。 */}
                    {job.result ? (
                      <IconTooltipButton
                        disabled={busy}
                        icon={<RefreshCw className="size-3.5" />}
                        label={t("重新处理")}
                        size="sm"
                        variant="ghost"
                        onClick={() => onReprocess(job.id)}
                      />
                    ) : null}
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
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
