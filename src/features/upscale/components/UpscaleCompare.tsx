import { useEffect, useRef, useState } from "react";
import { Expand, Maximize2, Minus, Move, Plus, Scan } from "lucide-react";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import type { UpscaleJob } from "../types";
import { getUpscaleModelDefinition } from "../utils/upscaleModels";

type UpscaleCompareProps = {
  job: UpscaleJob | null;
};

export function UpscaleCompare({ job }: UpscaleCompareProps) {
  const { t } = useLocale();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setSplit(50);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [job?.id]);

  const model = job ? getUpscaleModelDefinition(job.modelId) : null;
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-background/55" aria-label={t("前后对比")}>
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{t("前后对比")}</h2>
          <p className="truncate text-xs text-muted">
            {job
              ? `${job.input.width} x ${job.input.height}${job.result ? `  →  ${job.result.width} x ${job.result.height}` : ""}`
              : t("尚未选择图片")}
          </p>
        </div>
        <div className="flex items-center gap-1.5" aria-label={t("预览控制") }>
          <IconTooltipButton
            icon={<Minus className="size-4" />}
            label={t("缩小")}
            size="sm"
            variant="ghost"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
          />
          <span className="w-12 text-center text-xs tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
          <IconTooltipButton
            icon={<Plus className="size-4" />}
            label={t("放大")}
            size="sm"
            variant="ghost"
            disabled={zoom >= 4}
            onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
          />
          <IconTooltipButton
            icon={<Scan className="size-4" />}
            label={t("适应窗口")}
            size="sm"
            variant="ghost"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          />
          <IconTooltipButton
            active={zoom === 1}
            icon={<Expand className="size-4" />}
            label={t("原始比例")}
            size="sm"
            variant="ghost"
            onClick={() => setZoom(1)}
          />
          <IconTooltipButton
            icon={<Maximize2 className="size-4" />}
            label={t("全屏预览")}
            size="sm"
            variant="ghost"
            onClick={() => void viewportRef.current?.requestFullscreen()}
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 place-items-center overflow-hidden p-3 sm:p-5">
        <div
          ref={viewportRef}
          className="relative aspect-[16/10] max-h-full w-full max-w-6xl touch-none overflow-hidden rounded-md border border-border bg-panel shadow-elevated"
          data-upscale-comparison
          onPointerDown={(event) => {
            if (zoom <= 1) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || zoom <= 1) return;
            setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          {job ? (
            <>
              <div className="absolute inset-0 grid place-items-center overflow-hidden bg-background">
                <img
                  src={job.input.previewDataUrl}
                  alt={t("原图")}
                  className="size-full select-none object-contain transition-transform duration-150"
                  style={{ transform }}
                  draggable={false}
                />
              </div>
              {job.result ? (
                <div
                  className="absolute inset-0 grid place-items-center overflow-hidden bg-background"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                >
                  <img
                    src={job.result.previewDataUrl}
                    alt={t("超分结果")}
                    className="size-full select-none object-contain transition-transform duration-150"
                    style={{ transform }}
                    draggable={false}
                  />
                </div>
              ) : null}

              {job.result ? (
                <>
                  <div className="pointer-events-none absolute inset-y-0 w-px bg-primary shadow-elevated" style={{ left: `${split}%` }} />
                  <input
                    aria-label={t("对比分割位置")}
                    className="absolute inset-x-5 bottom-5 h-8 cursor-col-resize opacity-0"
                    type="range"
                    min="0"
                    max="100"
                    value={split}
                    onChange={(event) => setSplit(Number(event.target.value))}
                  />
                  <div
                    className="pointer-events-none absolute bottom-5 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-primary bg-panel text-primary shadow-elevated"
                    style={{ left: `${split}%` }}
                  >
                    <Move className="size-4" aria-hidden="true" />
                  </div>
                </>
              ) : null}

              <span className="absolute left-3 top-3 rounded bg-panel/85 px-2 py-1 text-[0.6875rem] font-medium text-foreground shadow-elevated">
                {t("原图")}
              </span>
              {job.result ? (
                <span className="absolute right-3 top-3 rounded bg-panel/85 px-2 py-1 text-[0.6875rem] font-medium text-foreground shadow-elevated">
                  {t("结果")} · {model?.scale}x
                </span>
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-center text-sm text-muted">
              <span>{t("从队列中选择一张图片")}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
