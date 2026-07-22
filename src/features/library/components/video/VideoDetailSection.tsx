import { useRef, useState } from "react";
import { Clipboard, Film, ImagePlus, Link2, Music2, Play, RefreshCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getImageSrc, getImageThumbnailSrc } from "../../utils/getImageSrc";
import { isAudioMediaFile, isVideoMediaFile } from "../../utils/mediaFileTypes";
import { formatVideoDuration } from "../../utils/videoDisplay";
import type { PromptCardData } from "../../utils/promptFilters";

type VideoDetailSectionProps = {
  item: PromptCardData;
  isBusy: boolean;
  onGenerateVideoFrames: (itemId: string) => Promise<boolean>;
  onImportVideoReferenceImages: (itemId: string) => Promise<boolean>;
  onImportClipboardReferenceImage: (itemId: string) => Promise<boolean>;
  onImportReferenceImageFromUrl: (itemId: string, url: string) => Promise<boolean>;
  onDeleteReferenceImage: (itemId: string, imageFileName: string) => Promise<boolean>;
  onPreviewMedia: (imageFileName: string) => void;
};

export function VideoDetailSection({
  item,
  isBusy,
  onGenerateVideoFrames,
  onImportVideoReferenceImages,
  onImportClipboardReferenceImage,
  onImportReferenceImageFromUrl,
  onDeleteReferenceImage,
  onPreviewMedia,
}: VideoDetailSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isUrlInputOpen, setIsUrlInputOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [deletingReference, setDeletingReference] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const durationLabel = formatVideoDuration(item.videoDurationSec);
  const keyframes = item.videoKeyframes;
  const referenceImages = item.videoReferenceImages;
  const hasKeyframes = keyframes.length > 0;
  const busy = isBusy || isGenerating || isImporting;

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      await onGenerateVideoFrames(item.id);
    } finally {
      setIsGenerating(false);
    }
  }

  async function runReferenceImport(task: () => Promise<boolean>) {
    setIsImportMenuOpen(false);
    setIsImporting(true);
    try {
      await task();
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportFromFile() {
    await runReferenceImport(() => onImportVideoReferenceImages(item.id));
  }

  async function handleImportFromClipboard() {
    await runReferenceImport(() => onImportClipboardReferenceImage(item.id));
  }

  async function handleImportFromUrl() {
    const url = urlDraft.trim();
    if (!url) {
      urlInputRef.current?.focus();
      return;
    }

    const success = await onImportReferenceImageFromUrl(item.id, url);
    if (success) {
      setUrlDraft("");
      setIsUrlInputOpen(false);
    }
  }

  async function handleDeleteReference(referenceImage: string) {
    if (deletingReference) {
      return;
    }
    setDeletingReference(referenceImage);
    try {
      await onDeleteReferenceImage(item.id, referenceImage);
    } finally {
      setDeletingReference(null);
    }
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-primary/30 bg-panel shadow-sm">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-primary/25 bg-primary-soft px-4 py-2 text-primary">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-current">
          <Film size={15} />
          视频信息
        </span>
        {durationLabel ? (
          <span className="inline-flex min-h-6 items-center rounded-lg border border-primary/25 bg-panel px-2 text-xs font-medium tabular-nums text-primary">
            时长 {durationLabel}
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-col gap-2">
        <div className="relative flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">参考素材</span>
          <Button
            className="min-h-8 gap-1.5 rounded-lg px-3 text-xs"
            disabled={busy}
            icon={<ImagePlus size={14} />}
            variant="secondary"
            onClick={() => setIsImportMenuOpen((open) => !open)}
          >
            {isImporting ? "导入中" : "导入素材"}
          </Button>
          {isImportMenuOpen ? (
            <>
              <button
                aria-hidden="true"
                className="fixed inset-0 z-10 cursor-default"
                tabIndex={-1}
                type="button"
                onClick={() => setIsImportMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-1 flex w-40 flex-col overflow-hidden rounded-lg border border-border bg-panel py-1 shadow-lg">
                <button
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  type="button"
                  onClick={() => void handleImportFromFile()}
                >
                  <Upload size={13} />
                  从本地上传
                </button>
                <button
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  type="button"
                  onClick={() => void handleImportFromClipboard()}
                >
                  <Clipboard size={13} />
                  粘贴剪贴板
                </button>
                <button
                  className="flex items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    setIsUrlInputOpen(true);
                    window.setTimeout(() => urlInputRef.current?.focus(), 0);
                  }}
                >
                  <Link2 size={13} />
                  从链接导入
                </button>
              </div>
            </>
          ) : null}
        </div>

        {isUrlInputOpen ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5">
            <input
              className="min-w-0 flex-1 bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-muted"
              disabled={busy}
               placeholder="粘贴媒体链接（http/https）"
              ref={urlInputRef}
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleImportFromUrl();
                }
                if (event.key === "Escape") {
                  setIsUrlInputOpen(false);
                  setUrlDraft("");
                }
              }}
            />
            <Button
              className="min-h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
              disabled={busy || !urlDraft.trim()}
              variant="primary"
              onClick={() => void handleImportFromUrl()}
            >
              {isImporting ? "下载中" : "导入"}
            </Button>
            <button
              aria-label="取消"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel hover:text-foreground"
              type="button"
              onClick={() => {
                setIsUrlInputOpen(false);
                setUrlDraft("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

        {referenceImages.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
            {referenceImages.map((referenceImage, index) => {
              const isAudio = isAudioMediaFile(referenceImage);
              const isVideo = isVideoMediaFile(referenceImage);
              return (
                <div
                  className="group/ref relative aspect-square overflow-hidden rounded-lg border border-border bg-background"
                  key={`${referenceImage}-${index}`}
                >
                  <button
                    aria-label={`${isAudio ? "试听" : "查看"}参考素材 ${index + 1}`}
                    className="block size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    type="button"
                    onClick={() => onPreviewMedia(referenceImage)}
                  >
                    {isAudio ? (
                      <span className="flex size-full flex-col items-center justify-center gap-2 bg-primary-soft text-primary">
                        <Music2 size={24} />
                        <span className="text-[11px] font-medium">音频</span>
                      </span>
                    ) : (
                      <img
                        alt={`参考素材 ${index + 1}`}
                        className="block size-full object-cover"
                        decoding="async"
                        loading="lazy"
                        src={getImageThumbnailSrc(referenceImage)}
                      />
                    )}
                    {isVideo || isAudio ? (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="flex size-7 items-center justify-center rounded-full bg-overlay/50 text-primary-foreground backdrop-blur-sm">
                          <Play size={13} fill="currentColor" />
                        </span>
                      </span>
                    ) : null}
                  </button>
                  <button
                    aria-label={`删除参考素材 ${index + 1}`}
                    className="absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-panel/90 text-muted opacity-0 shadow-sm outline-none transition-all hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover/ref:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={busy || deletingReference === referenceImage}
                    type="button"
                    onClick={() => void handleDeleteReference(referenceImage)}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-4 text-center text-xs text-muted">
            暂无参考素材，导入媒体辅助复现。
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">关键帧时间轴</span>
          <Button
            className="min-h-8 gap-1.5 rounded-lg px-3 text-xs"
            disabled={busy}
            icon={<RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />}
            variant="secondary"
            onClick={() => void handleGenerate()}
          >
            {hasKeyframes ? "重新生成" : "生成关键帧"}
          </Button>
        </div>
        {hasKeyframes ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {keyframes.map((keyframe, index) => (
              <figure
                className="m-0 flex flex-col overflow-hidden rounded-lg border border-border bg-background"
                key={`${keyframe.imageFileName}-${index}`}
              >
                <button
                  aria-label={`查看关键帧 ${keyframe.label}`}
                  className="relative aspect-video cursor-zoom-in overflow-hidden bg-background outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  type="button"
                  onClick={() => onPreviewMedia(keyframe.imageFileName)}
                >
                  <img
                    alt={`关键帧 ${keyframe.label}`}
                    className="block size-full object-cover"
                    decoding="async"
                    loading="lazy"
                    src={getImageSrc(keyframe.imageFileName)}
                  />
                </button>
                <figcaption className="px-1.5 py-1 text-center text-[11px] font-medium tabular-nums text-muted">
                  {keyframe.label}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-4 text-center text-xs text-muted">
            暂无关键帧，点击生成时间轴画面。
          </p>
        )}
      </div>
      </div>
    </section>
  );
}
