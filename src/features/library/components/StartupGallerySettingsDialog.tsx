import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clipboard, ImagePlus, Images, LoaderCircle, Maximize2, RotateCcw, Trash2, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { StartupGalleryImage } from "@/types/suyanApi";
import { getStartupGalleryImageSrc } from "../utils/getImageSrc";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";

type StartupGallerySettingsDialogProps = {
  isBusy: boolean;
  /** 嵌入系统设置壳时不渲染 AppDialog 外框。 */
  embedded?: boolean;
  onClose?: () => void;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

type PendingAction = "import" | "paste" | "reset" | `remove:${string}` | null;

type PendingConfirm =
  | { kind: "remove"; image: StartupGalleryImage }
  | { kind: "reset" }
  | null;

export function StartupGallerySettingsDialog({
  isBusy,
  embedded = false,
  onClose,
  onNotify,
}: StartupGallerySettingsDialogProps) {
  const { t } = useLocale();
  const [images, setImages] = useState<StartupGalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
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
      setFeedbackText(t("未选择图片。"));
      return;
    }

    const text = result.data.importedCount > 1 ? `${t("已添加启动页图片。")} (${result.data.importedCount})` : t("已添加启动页图片。");
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

    const text = result.data.importedCount > 1 ? `${t("已粘贴启动页图片。")} (${result.data.importedCount})` : t("已粘贴启动页图片。");
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
    setPendingConfirm(null);
    const text = t("已移除启动页图片。");
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
    setPendingConfirm(null);
    const text = t("已恢复默认启动页图片。");
    setFeedbackText(text);
    onNotify?.({ text, type: resolveStatusFeedbackTone(text) });
  }

  const galleryBody = (
    <>
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${embedded ? "px-1 py-1" : "px-5 py-5"}`}>
        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle size={16} className="animate-spin" />
            {t("正在读取启动页图片...")}
          </div>
        ) : images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[960px]:grid-cols-4">
            {images.map((image, index) => {
              const isRemoving = pendingAction === `remove:${image.fileName}`;

              return (
                <article className="relative overflow-hidden rounded-md border border-border bg-background" key={image.fileName}>
                  <button
                    aria-label={t("查看第 {index} 张启动页图片", { index: index + 1 })}
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
                      {image.isDefault ? t("默认图片") : t("自定义图片 {index}", { index: index + 1 })}
                    </span>
                    <button
                      aria-label={t("移除第 {index} 张启动页图片", { index: index + 1 })}
                      className="icon-tooltip-button flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                      data-tooltip-align="end"
                      data-tooltip-placement="above"
                      disabled={isActionBusy}
                      type="button"
                      onClick={() => setPendingConfirm({ kind: "remove", image })}
                    >
                      {isRemoving ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      <span className="icon-tooltip-button__bubble" role="tooltip">
                        {t("移除图片")}
                      </span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-background px-5 text-sm text-muted">
            {t("还没有启动页图片。")}
          </div>
        )}

        {feedbackText ? (
          <p className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>

      <footer className={`flex flex-wrap justify-end gap-2 ${embedded ? "border-t border-border/80 px-1 pt-3" : "border-t border-border px-5 py-4"}`}>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={pendingAction === "reset" ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          variant="ghost"
          onClick={() => setPendingConfirm({ kind: "reset" })}
        >
          {t("恢复默认")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={pendingAction === "import" ? <LoaderCircle size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          variant="secondary"
          onClick={() => void handleImport()}
        >
          {t("添加图片")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={pendingAction === "paste" ? <LoaderCircle size={14} className="animate-spin" /> : <Clipboard size={14} />}
          variant="secondary"
          onClick={() => void handlePasteFromClipboard()}
        >
          {t("粘贴图片")}
        </Button>
        {!embedded ? (
          <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<X size={14} />} variant="primary" onClick={onClose}>
            {t("完成")}
          </Button>
        ) : null}
      </footer>
    </>
  );

  return (
    <>
      {embedded ? (
        <div data-feature-guide="system-preferences-panel-startupGallery" className="flex min-h-0 flex-1 flex-col">{galleryBody}</div>
      ) : (
        <AppDialog
          panelClassName="flex max-h-full w-full max-w-4xl flex-col"
          titleId="startup-gallery-settings-title"
          onClose={onClose ?? (() => undefined)}
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
                <Images size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold" id="startup-gallery-settings-title">
                  {t("启动图库")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {images.length} {t("张轮播图")}
                </p>
              </div>
            </div>
            <DialogCloseButton onClick={() => onClose?.()} />
          </header>
          {galleryBody}
        </AppDialog>
      )}
      {previewImage ? (
        <StartupGalleryPreviewOverlay image={previewImage} onClose={() => setPreviewImage(null)} />
      ) : null}
      <ConfirmDialog
        busyLabel={pendingConfirm?.kind === "reset" ? t("恢复中…") : t("移除中…")}
        confirmLabel={pendingConfirm?.kind === "reset" ? t("恢复默认") : t("移除图片")}
        description={
          pendingConfirm?.kind === "reset"
            ? t("将清空当前启动页图片并恢复为内置默认图，自定义图片会从启动图库中移除。")
            : pendingConfirm?.kind === "remove"
              ? t("确定从启动图库移除「这张自定义图片」？")
              : ""
        }
        icon={<Trash2 size={18} />}
        isBusy={isActionBusy && pendingConfirm !== null}
        open={pendingConfirm !== null}
        title={pendingConfirm?.kind === "reset" ? t("恢复默认启动图？") : t("移除启动页图片？")}
        onCancel={() => {
          if (!isActionBusy) {
            setPendingConfirm(null);
          }
        }}
        onConfirm={() => {
          if (!pendingConfirm) {
            return;
          }
          if (pendingConfirm.kind === "reset") {
            void handleReset();
            return;
          }
          void handleRemove(pendingConfirm.image);
        }}
      />
    </>
  );
}

type StartupGalleryPreviewOverlayProps = {
  image: StartupGalleryImage;
  onClose: () => void;
};

function StartupGalleryPreviewOverlay({ image, onClose }: StartupGalleryPreviewOverlayProps) {
  const { t } = useLocale();
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
      aria-label={t("启动页图片预览")}
      aria-modal="true"
      className="app-window-overlay z-[60] flex items-center justify-center bg-overlay/90 p-6 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <button
        aria-label={t("关闭图片预览")}
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-panel/90 text-foreground shadow-elevated outline-none transition-colors hover:bg-panel focus-visible:ring-2 focus-visible:ring-primary/40"
        type="button"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <img
        alt={image.isDefault ? t("默认启动页图片预览") : t("自定义启动页图片预览")}
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
