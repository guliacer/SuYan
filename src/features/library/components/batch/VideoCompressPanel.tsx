import { useState } from "react";
import { CheckSquare, Film, LoaderCircle, Square, TrendingDown, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BatchProgressBar, formatBytes } from "./BatchProgressBar";
import type { CompressProgress, CompressResult } from "@/types/suyanApi";
import { useLibraryStore } from "../../store/useLibraryStore";

type VideoCompressPanelProps = {
  selectedItemIds: string[];
  selectedCount: number;
  totalCount: number;
  onCompleted?: () => Promise<void> | void;
  onSelectAll: () => void;
  onInvert: () => void;
  onClearSelection: () => void;
};

type CompressStatus = "idle" | "compressing" | "done" | "error";

type Resolution = "original" | "1080p" | "720p" | "480p";

const activeBtnClass =
  "rounded-lg border border-primary-strong bg-primary-strong px-3 py-1.5 text-sm font-medium text-primary-foreground";
const inactiveBtnClass =
  "rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm text-muted hover:bg-primary-soft";
const selectionBtnClass =
  "inline-flex items-center gap-1 rounded-md border border-border/70 bg-panel px-2 py-1 text-xs text-foreground transition-colors hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40";

const resolutionOptions: { value: Resolution; label: string }[] = [
  { value: "original", label: "原分辨率" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
];

export function VideoCompressPanel({
  selectedItemIds,
  selectedCount,
  totalCount,
  onCompleted,
  onSelectAll,
  onInvert,
  onClearSelection,
}: VideoCompressPanelProps) {
  const compressVideos = useLibraryStore((s) => s.compressVideos);
  const cancelCompress = useLibraryStore((s) => s.cancelCompress);
  const [status, setStatus] = useState<CompressStatus>("idle");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const [crf, setCrf] = useState(23);
  const [codec, setCodec] = useState<"h264" | "h265">("h264");
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [progress, setProgress] = useState<CompressProgress | null>(null);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const crfMin = 18;
  const crfMax = 28;
  const crfRatio = (crf - crfMin) / (crfMax - crfMin);

  const estimatedSavingsPercent = Math.round(
    (resolution === "480p" ? 65 : resolution === "720p" ? 50 : resolution === "1080p" ? 35 : 25) +
    (codec === "h265" ? 10 : 0) -
    (crf - 23) * 3,
  );

  const scopeDisabled = scope === "selected" && selectedItemIds.length === 0;

  async function handleStart() {
    if (scopeDisabled) return;
    setStatus("compressing");
    setProgress(null);
    setResult(null);
    setErrorMessage("");
    const data = await compressVideos(
      {
        resolution,
        crf,
        codec,
        itemIds: scope === "selected" ? selectedItemIds : undefined,
      },
      setProgress,
    );
    if (data) {
      setResult(data);
      await onCompleted?.();
      setStatus("done");
    } else {
      setErrorMessage("视频压缩失败，请重试。");
      setStatus("error");
    }
  }

  async function handleCancel() {
    try {
      await cancelCompress();
    } catch {
    }
  }

  function handleReset() {
    setStatus("idle");
    setProgress(null);
    setResult(null);
    setErrorMessage("");
  }

  if (status === "compressing") {
    if (!progress) {
      return (
        <div className="flex items-center gap-3 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" />
          正在准备压缩…
        </div>
      );
    }
    const label = progress.currentItem ? `正在压缩：${progress.currentItem}` : "正在压缩视频…";
    return (
      <div className="flex flex-col gap-3">
        <BatchProgressBar
          current={progress.current}
          label={label}
          savedBytes={progress.savedBytes}
          total={progress.total}
        />
        <div>
          <Button variant="danger" onClick={() => void handleCancel()}>
            取消压缩
          </Button>
        </div>
      </div>
    );
  }

  if (status === "done" && result) {
    const savedBytes = Math.max(0, result.totalOriginalBytes - result.totalCompressedBytes);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-md border border-border/70 bg-panel px-4 py-3 text-sm">
          <Film className="size-4 text-primary" />
          <span className="text-foreground">
            已压缩 <span className="font-semibold">{result.processedCount}</span> 个视频，节省{" "}
            <span className="font-semibold">{formatBytes(savedBytes)}</span>
          </span>
        </div>
        {result.failedItems.length > 0 ? (
          <p className="text-xs text-muted">{result.failedItems.length} 项压缩失败，已跳过。</p>
        ) : null}
        <div>
          <Button variant="primary" onClick={handleReset}>
            再次压缩
          </Button>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-danger">{errorMessage || "视频压缩失败，请重试。"}</p>
        <div>
          <Button variant="primary" onClick={handleReset}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_1.3fr_1.4fr_1fr] divide-x divide-border/50">
        <div className="px-6 first:pl-0">
          <div className="mb-4 text-sm font-semibold text-foreground">分辨率与编码</div>
          <div className="mb-1.5 text-xs font-medium text-muted">目标分辨率</div>
          <div className="grid grid-cols-2 gap-1.5">
            {resolutionOptions.map((option) => (
              <button
                className={resolution === option.value ? activeBtnClass : inactiveBtnClass}
                key={option.value}
                type="button"
                onClick={() => setResolution(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-4 mb-1.5 text-xs font-medium text-muted">编码器</div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className={codec === "h264" ? activeBtnClass : inactiveBtnClass}
              type="button"
              onClick={() => setCodec("h264")}
            >
              H.264
            </button>
            <button
              className={codec === "h265" ? activeBtnClass : inactiveBtnClass}
              type="button"
              onClick={() => setCodec("h265")}
            >
              H.265
            </button>
          </div>
        </div>

        <div className="px-6">
          <div className="mb-4 text-sm font-semibold text-foreground">质量 CRF</div>
          <div className="text-3xl font-bold tabular-nums text-foreground">{crf}</div>
          <div className="relative mt-5 mb-2 h-2 rounded-full bg-border/50">
            <div
              className="absolute left-0 h-full rounded-full bg-progress"
              style={{ width: `${crfRatio * 100}%` }}
            />
            <input
              type="range"
              min={crfMin}
              max={crfMax}
              value={crf}
              onChange={(e) => setCrf(Number(e.target.value))}
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-progress [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-progress/25 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-progress [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>{crfMin} 高质量</span>
            <span>{crfMax} 小体积</span>
          </div>
          <p className="mt-4 text-xs text-muted">推荐 18-28；越低越清晰、越大。</p>
        </div>

        <div className="px-6">
          <div className="mb-4 text-sm font-semibold text-foreground">压缩范围</div>
          <div className="flex flex-col gap-2">
            <button
              className={scope === "all" ? activeBtnClass : inactiveBtnClass}
              type="button"
              onClick={() => setScope("all")}
            >
              全部视频 {scope === "all" ? "✓" : ""}
            </button>
            <button
              className={scope === "selected" ? activeBtnClass : inactiveBtnClass}
              type="button"
              onClick={() => setScope("selected")}
            >
              选中({selectedItemIds.length}) {scope === "selected" ? "✓" : ""}
            </button>
          </div>
          <div className="mt-3 rounded-lg bg-background/70 p-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button className={selectionBtnClass} type="button" onClick={onSelectAll}>
                <CheckSquare size={12} />
                全选
              </button>
              <button className={selectionBtnClass} type="button" onClick={onInvert}>
                <Square size={12} />
                反选
              </button>
              <button
                className={selectionBtnClass}
                type="button"
                disabled={selectedCount === 0}
                onClick={onClearSelection}
              >
                <X size={12} />
                取消选择
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">已选 {selectedCount} / {totalCount} 组</p>
        </div>

        <div className="px-6 last:pr-0">
          <div className="mb-4 text-sm font-semibold text-foreground">预计效果</div>
          <div className="flex items-baseline gap-1">
            <TrendingDown className="size-4 text-progress" />
            <span className="text-3xl font-bold tabular-nums text-progress">{estimatedSavingsPercent}%</span>
          </div>
          <p className="mt-1 text-xs text-muted">CRF {crf} 预计压缩率</p>
          <Button
            disabled={scopeDisabled}
            icon={<Zap size={16} />}
            variant="primary"
            onClick={() => void handleStart()}
            className="mt-5 w-full"
          >
            开始压缩
          </Button>
        </div>
      </div>
    </div>
  );
}
