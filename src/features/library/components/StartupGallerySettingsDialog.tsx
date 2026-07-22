import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clipboard, ImagePlus, Images, LoaderCircle, Maximize2, RotateCcw, Trash2, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import type { StartupGalleryImage } from "@/types/suyanApi";
import { getStartupGalleryImageSrc } from "../utils/getImageSrc";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";

type StartupGallerySettingsDialogProps = {
  isBusy: boolean;
  onClose: () => void;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

type PendingAction = "import" | "paste" | "reset" | `remove:${string}` | null;

export function StartupGallerySettingsDialog({
  isBusy,
  onClose,
  onNotify,
}: StartupGallerySettingsDialogProps) {
  const [images, setImages] = useState<StartupGalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [previewImage, setPreviewImage] = useState<StartupGalleryImage | null>(null);

  useEffect(() => {
    let isDisposed = false;

    void loadImages();

    return () => {
      isDisposed = true;
    };

    async function loadImages() {
      const result = await window.suyanApi.listStartupGalleryImages();

      if (isDisposed) {
        return;
      }

      setIsLoading(false);

      if (!result.ok) {
        setFeedbackText(result.error.message);
        return;
      }

      setImages(sortImages(result.data));
    }
  }, []);

  const isActionBusy = isBusy || pendingAction !== null;

  async function handleImport() {
    if (isActionBusy) {
      return;
    }

    setPendingAction("import");
    setFeedbackText("");
    const result = await window.suyanApi.importStartupGalleryImages();
    setPendingAction(null);

    if (!result.ok) {
      setFeedbackText(result.error.message);
      return;
    }

    setImages(sortImages(result.data.images));

    if (result.data.canceled) {
      setFeedbackText("未选择图片。");
      return;
    }

    const text = result.data.importedCount > 1 ? `已添加 ${result.data.importedCount} 张启动页图片。` : "已添加启动页图片。";
    setFeedbackText(text);
    onNotify?.({ text, type: resolveStatusFeedbackTone(text) });
  }

  async function handlePasteFromClipboard() {
    if (isActionBusy) {
      return;
    }

    setPendingAction("paste");
    setFeedbackText("");
    const result = await window.suyanApi.importStartupGalleryImageFromClipboard();
    setPendingAction(null);

    if (!result.ok) {
      setFeedbackText(result.error.message);
      return;
    }

    setImages(sortImages(result.data.images));

    const text = result.data.importedCount > 1 ? `已粘贴 ${result.data.importedCount} 张启动页图片。` : "已粘贴启动页图片。";
    setFeedbackText(text);
    onNotify?.({ text, type: resolveStatusFeedbackTone(text) });
  }

  async function handleRemove(image: StartupGalleryImage) {
    if (isActionBusy) {
      return;
    }

    setPendingAction(`remove:${image.fileName}`);
    setFeedbackText("");
    const result = await window.suyanApi.removeStartupGalleryImage(image.fileName);
    setPendingAction(null);

    if (!result.ok) {
      setFeedbackText(result.error.message);
      return;
    }

    setImages(sortImages(result.data));
    const text = "已移除启动页图片。";
    setFeedbackText(text);
    onNotify?.({ text, type: resolveStatusFeedbackTone(text) });
  }

  async function handleReset() {
    if (isActionBusy) {
      return;
    }

    setPendingAction("reset");
    setFeedbackText("");
    const result = await window.suyanApi.resetStartupGallery();
    setPendingAction(null);

    if (!result.ok) {
      setFeedbackText(result.error.message);
      return;
    }

    setImages(sortImages(result.data));
    const text = "已恢复默认启动页图片。";
    setFeedbackText(text);
    onNotify?.({ text, type: resolveStatusFeedbackTone(text) });
  }

  return (
    <>
      <AppDialog
      panelClassName="flex max-h-[92vh] w-full max-w-4xl flex-col"
      titleId="startup-gallery-settings-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Images size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="startup-gallery-settings-title">
              启动图库
            </h2>
            <p className="mt-1 text-sm text-muted">
              {images.length} 张轮播图 · 自动生成缩略图
            </p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle size={16} className="animate-spin" />
            正在读取启动页图片...
          </div>
        ) : images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[960px]:grid-cols-4">
            {images.map((image, index) => {
              const isRemoving = pendingAction === `remove:${image.fileName}`;

              return (
                <article className="relative overflow-hidden rounded-md border border-border bg-background" key={image.fileName}>
                  <button
                    aria-label={`查看第 ${index + 1} 张启动页图片`}
                    className="group relative block w-full cursor-zoom-in overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45"
                    type="button"
                    onClick={() => setPreviewImage(image)}
                  >
                    <img
                      alt=""
                      className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      decoding="async"
                      loading="lazy"
                      src={getStartupGalleryImageSrc(image.fileName)}
                    />
                    <span
                      aria-hidden="true"
                      className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-panel/90 text-foreground opacity-0 shadow-elevated transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                      <Maximize2 size={14} />
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-border/80 px-2.5 py-2">
                    <span className="truncate text-xs text-muted">
                      {image.isDefault ? "默认图片" : `自定义图片 ${index + 1}`}
                    </span>
                    <button
                      aria-label={`移除第 ${index + 1} 张启动页图片`}
                      className="icon-tooltip-button flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                      data-tooltip-align="end"
                      data-tooltip-placement="above"
                      disabled={isActionBusy}
                      type="button"
                      onClick={() => void handleRemove(image)}
                    >
                      {isRemoving ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      <span className="icon-tooltip-button__bubble" role="tooltip">
                        移除图片
                      </span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-background px-5 text-sm text-muted">
            还没有启动页图片。
          </div>
        )}

        {feedbackText ? (
          <p className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button
          disabled={isActionBusy}
          icon={pendingAction === "reset" ? <LoaderCircle size={16} className="animate-spin" /> : <RotateCcw size={16} />}
          variant="ghost"
          onClick={() => void handleReset()}
        >
          恢复默认
        </Button>
        <Button
          disabled={isActionBusy}
          icon={pendingAction === "import" ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          variant="secondary"
          onClick={() => void handleImport()}
        >
          添加图片
        </Button>
        <Button
          disabled={isActionBusy}
          icon={pendingAction === "paste" ? <LoaderCircle size={16} className="animate-spin" /> : <Clipboard size={16} />}
          variant="secondary"
          onClick={() => void handlePasteFromClipboard()}
        >
          粘贴图片
        </Button>
        <Button icon={<X size={16} />} variant="primary" onClick={onClose}>
          完成
        </Button>
      </footer>
      </AppDialog>
      {previewImage ? (
        <StartupGalleryPreviewOverlay image={previewImage} onClose={() => setPreviewImage(null)} />
      ) : null}
    </>
  );
}

type StartupGalleryPreviewOverlayProps = {
  image: StartupGalleryImage;
  onClose: () => void;
};

function StartupGalleryPreviewOverlay({ image, onClose }: StartupGalleryPreviewOverlayProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      aria-label="启动页图片预览"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay/90 p-6 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <button
        aria-label="关闭图片预览"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-panel/90 text-foreground shadow-elevated outline-none transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-primary/40"
        type="button"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <img
        alt={image.isDefault ? "默认启动页图片预览" : "自定义启动页图片预览"}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-image"
        decoding="async"
        src={getStartupGalleryImageSrc(image.fileName)}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

function sortImages(images: StartupGalleryImage[]): StartupGalleryImage[] {
  return [...images].sort((left, right) => left.order - right.order);
}
