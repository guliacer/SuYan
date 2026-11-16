import { useCallback, useEffect, useRef, useState } from "react";
import { Expand, ImagePlus, Layers, Maximize2, Minus, Move, Plus, RefreshCw, Scan, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import type { UpscaleJob } from "../types";
import { getUpscaleModelDefinition } from "../utils/upscaleModels";

type UpscaleCompareProps = {
  job: UpscaleJob | null;
  /** 空态引导需要直达「添加图片」，否则用户只能去左栏找入口。 */
  onAddFiles?: () => void;
  /** 用当前模型把这张图重新入队。 */
  onReprocess?: () => void;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

type DragMode = "split" | "pan";

export function UpscaleCompare({ job, onAddFiles, onReprocess }: UpscaleCompareProps) {
  const { t } = useLocale();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // 滚轮回调里要读最新值，用 ref 镜像避免闭包拿到旧 state。
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  const updateZoom = useCallback((value: number) => {
    zoomRef.current = value;
    setZoom(value);
  }, []);
  const updatePan = useCallback((value: { x: number; y: number }) => {
    panRef.current = value;
    setPan(value);
  }, []);
  /**
   * 分割线百分比必须以 viewport 为基准，不能用 event.currentTarget：
   * 手柄自己 setPointerCapture 之后，pointermove 的 target 就是那颗 32px 的圆钮，
   * 用它的 rect 算出来的百分比会完全跑偏。
   */
  const updateSplitFromClientX = useCallback((clientX: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0) return;
    const percent = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(100, Math.max(0, percent)));
  }, []);

  useEffect(() => {
    setSplit(50);
    updateZoom(1);
    updatePan({ x: 0, y: 0 });
  }, [job?.id, updatePan, updateZoom]);

  /**
   * 滚轮缩放，以光标位置为锚点。
   * React 的 onWheel 是 passive 的，preventDefault 无效，必须手动 addEventListener。
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event: WheelEvent) => {
      // Ctrl+滚轮留给页面级缩放，不抢。
      if (event.ctrlKey) return;
      event.preventDefault();
      const currentZoom = zoomRef.current;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * Math.exp(-event.deltaY * 0.0015)));
      if (nextZoom === currentZoom) return;
      const rect = viewport.getBoundingClientRect();
      // 图片以容器中心为原点，光标相对中心的偏移即锚点。
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      const ratio = nextZoom / currentZoom;
      const currentPan = panRef.current;
      updatePan({
        x: cursorX - (cursorX - currentPan.x) * ratio,
        y: cursorY - (cursorY - currentPan.y) * ratio,
      });
      updateZoom(nextZoom);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [updatePan, updateZoom]);

  const model = job ? getUpscaleModelDefinition(job.modelId) : null;
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col" aria-label={t("前后对比")}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
            <Layers className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">{t("前后对比")}</h2>
            <p className="truncate text-xs text-muted">
              {job
                ? `${job.input.width} × ${job.input.height}${job.result ? `  →  ${job.result.width} × ${job.result.height}` : ""}`
                : t("尚未选择图片")}
            </p>
          </div>
        </div>
        {/* 控件组必须允许换行：窄屏下「重新处理 / 缩放 / 全屏」挤在一行会撑破中栏。 */}
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label={t("预览控制") }
        >
          {job?.result && onReprocess ? (
            <>
              <Button
                icon={<RefreshCw className="size-4" />}
                maxWidth={false}
                size="sm"
                variant="secondary"
                onClick={onReprocess}
              >
                {t("重新处理")}
              </Button>
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            </>
          ) : null}
          <IconTooltipButton
            icon={<Minus className="size-4" />}
            label={t("缩小")}
            size="sm"
            variant="ghost"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => updateZoom(Math.max(MIN_ZOOM, zoom - 0.25))}
          />
          <span
            className="min-w-11 rounded-lg bg-background px-2 py-1 text-center text-xs font-medium tabular-nums text-muted"
            data-upscale-zoom
          >
            {Math.round(zoom * 100)}%
          </span>
          <IconTooltipButton
            icon={<Plus className="size-4" />}
            label={t("放大")}
            size="sm"
            variant="ghost"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => updateZoom(Math.min(MAX_ZOOM, zoom + 0.25))}
          />
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
          {/* 窄屏默认就是适应窗口，这个按钮没有意义，藏起来给其它控件腾位置。 */}
          <IconTooltipButton
            className="max-[639px]:hidden"
            icon={<Scan className="size-4" />}
            label={t("适应窗口")}
            size="sm"
            variant="ghost"
            onClick={() => {
              updateZoom(1);
              updatePan({ x: 0, y: 0 });
            }}
          />
          {/* 「原始比例」的选中态要克制：IconTooltipButton 的 active 变体是实心主色块，
              放在这一排小图标里视觉太重，改用画布那套浅色 chip。 */}
          <button
            aria-label={t("原始比例")}
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
              zoom === 1
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-transparent text-muted hover:bg-primary-soft hover:text-foreground"
            }`}
            title={t("原始比例")}
            type="button"
            onClick={() => {
              updateZoom(1);
              updatePan({ x: 0, y: 0 });
            }}
          >
            <Expand className="size-4" aria-hidden="true" />
          </button>
          <IconTooltipButton
            icon={<Maximize2 className="size-4" />}
            label={t("全屏预览")}
            size="sm"
            variant="ghost"
            onClick={() => void viewportRef.current?.requestFullscreen()}
          />
        </div>
      </header>

      {/*
        viewport 就是整块画布，尺寸由 flex-1 决定（确定高度）。
        图片用 max-h/max-w 做 contain 居中，不再给外层一个「宽度由 aspect-ratio
        推导」的框——flex item 的 width:auto 走的是 content sizing，子元素全 absolute
        时内容宽为 0，框会塌成 0 宽，整块画布看着就是空的。
      */}
      <div
        ref={viewportRef}
        className="upscale-canvas-grid upscale-surface relative min-h-0 flex-1 overflow-hidden"
        data-upscale-comparison
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          // 未放大时整块画布左右拖动 = 调整前后对比分割线；放大后拖动 = 平移查看细节。
          dragRef.current = {
            mode: zoomRef.current > 1 ? "pan" : "split",
            startX: event.clientX,
            startY: event.clientY,
            panX: panRef.current.x,
            panY: panRef.current.y,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          if (drag.mode === "split") {
            updateSplitFromClientX(event.clientX);
            return;
          }
          updatePan({
            x: drag.panX + event.clientX - drag.startX,
            y: drag.panY + event.clientY - drag.startY,
          });
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        {job ? (
          <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-3.5">
            {/* 舞台：一个带内边距的定尺寸盒子。
                原图和结果图都必须在这个盒子里居中 —— 之前结果图挂在
                absolute inset-0 的覆盖层上（= 整个 viewport），原图却挂在
                带 p-3/p-5 的 flex 容器里（= viewport 减内边距），
                两张图其实差着半个内边距的偏移，对比时能看出错位。
                统一塞进 stage 之后，两图共用同一个 content box，天然对齐。 */}
            <div className="relative flex h-full w-full items-center justify-center">
              {/* 透明棋盘格只贴在图片自己的盒子上（两张图尺寸一致、位置重合，
                  棋盘自然对齐），画布其余部分交给 upscale-surface 的渐变，
                  跟创作画布的工作区是同一套表面语言。 */}
              <img
                src={job.input.previewDataUrl}
                alt={t("原图")}
                className="upscale-alpha-checker relative z-[1] max-h-full max-w-full select-none object-contain will-change-transform"
                style={{ transform }}
                draggable={false}
              />
              {job.result ? (
                <div
                  className="absolute inset-0 z-[1] flex items-center justify-center"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                >
                  <img
                    src={job.result.previewDataUrl}
                    alt={t("超分结果")}
                    className="upscale-alpha-checker max-h-full max-w-full select-none object-contain will-change-transform"
                    style={{ transform }}
                    draggable={false}
                  />
                </div>
              ) : null}

              {job.result ? (
                <>
                  {/* 分割线本体不接指针事件，交给下面整高的热区处理。 */}
                  <div className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-primary shadow-elevated" style={{ left: `${split}%` }} />
                  {/* 整高拖拽热区：16px 宽，盖住分割线左右，用户不用精确对准那条 1px 的线。
                      放在 stage 内，百分比和 clipPath 用的是同一套坐标系。 */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 z-[2] w-4 -translate-x-1/2 cursor-col-resize"
                    style={{ left: `${split}%` }}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      // 阻断冒泡，否则 viewport 会同时启动自己的拖拽逻辑。
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        mode: "split",
                        startX: event.clientX,
                        startY: event.clientY,
                        panX: panRef.current.x,
                        panY: panRef.current.y,
                      };
                    }}
                    onPointerMove={(event) => {
                      if (dragRef.current?.mode !== "split") return;
                      updateSplitFromClientX(event.clientX);
                    }}
                  />
                  <input
                    aria-label={t("对比分割位置")}
                    className="sr-only"
                    type="range"
                    min="0"
                    max="100"
                    value={split}
                    onChange={(event) => setSplit(Number(event.target.value))}
                  />
                  <div
                    className="pointer-events-none absolute bottom-5 z-[3] grid size-8 -translate-x-1/2 place-items-center rounded-full border border-primary bg-panel text-primary shadow-elevated"
                    style={{ left: `${split}%` }}
                  >
                    <Move className="size-4" aria-hidden="true" />
                  </div>
                </>
              ) : null}
            </div>

            <span className="pointer-events-none absolute left-3 top-3 z-[2] rounded-xl border border-border/70 bg-panel/85 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm">
              {t("原图")}
            </span>
            {job.result ? (
              <span className="pointer-events-none absolute right-3 top-3 z-[2] rounded-xl border border-primary/25 bg-primary-soft/90 px-2.5 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur-sm">
                {t("结果")} · {model?.scale}x
              </span>
            ) : null}
            <span className="pointer-events-none absolute bottom-3 left-3 z-[2] rounded-xl border border-border/70 bg-panel/80 px-2.5 py-1 text-xs text-muted backdrop-blur-sm">
              {zoom > 1 ? t("滚轮缩放 · 拖动平移") : t("滚轮缩放 · 左右拖动对比")}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-5">
            <div className="flex max-h-full w-full max-w-[26rem] flex-col items-center gap-5 overflow-y-auto rounded-2xl border border-border bg-panel/95 px-7 py-8 text-center shadow-elevated backdrop-blur-sm">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary" aria-hidden="true">
                <ImagePlus className="size-6" />
              </span>
            <div className="grid gap-1.5">
              <h3 className="text-base font-semibold text-foreground">{t("队列里还没有图片")}</h3>
              <p className="text-sm leading-6 text-muted">
                {t("把图片拖进左侧区域，或直接选择文件。支持 PNG、JPG、WebP。")}
              </p>
            </div>
            <ol className="grid w-full gap-2 text-left">
              {[
                { icon: <ImagePlus className="size-3.5" />, title: t("添加图片"), detail: t("单张或整个目录，也可直接拖入") },
                { icon: <Sparkles className="size-3.5" />, title: t("选引擎与倍率"), detail: t("动漫用 Real-CUGAN，照片用 Real-ESRGAN") },
                { icon: <Layers className="size-3.5" />, title: t("处理并对比"), detail: t("左右拖动分割线，满意后导出") },
              ].map((step, index) => (
                <li
                  key={step.title}
                  className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <span className="text-primary/70" aria-hidden="true">{step.icon}</span>
                      {step.title}
                    </span>
                    <span className="text-xs leading-5 text-muted">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            {onAddFiles ? (
              <Button icon={<ImagePlus className="size-4" />} maxWidth={false} size="sm" variant="primary" onClick={onAddFiles}>
                {t("添加图片")}
              </Button>
            ) : null}
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
