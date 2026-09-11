import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type AppDialogProps = {
  children: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
  titleId?: string;
  onClose: () => void;
};

export function AppDialog({
  children,
  overlayClassName = "z-50 px-4 py-8",
  panelClassName = "flex max-h-full w-full max-w-2xl flex-col",
  titleId,
  onClose,
}: AppDialogProps) {
  const pointerStartedOnBackdrop = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className={`app-window-overlay flex items-center justify-center bg-overlay/60 p-2 backdrop-blur-sm min-[640px]:px-4 min-[640px]:py-8 ${overlayClassName}`}
      role="presentation"
      onPointerDown={(event) => {
        pointerStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const shouldClose = pointerStartedOnBackdrop.current && event.target === event.currentTarget;
        pointerStartedOnBackdrop.current = false;
        if (shouldClose) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`theme-dialog overflow-hidden rounded-2xl border border-border bg-panel shadow-image ${panelClassName}`}
        role="dialog"
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

type DialogCloseButtonProps = {
  ariaLabel?: string;
  onClick: () => void;
};

export function DialogCloseButton({ ariaLabel = "关闭", onClick }: DialogCloseButtonProps) {
  const { t } = useLocale();
  const resolvedAriaLabel = ariaLabel === "关闭" ? t("关闭") : ariaLabel;
  return (
    <button
      aria-label={resolvedAriaLabel}
      className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-panel/80 text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35"
      title={resolvedAriaLabel}
      type="button"
      onClick={onClick}
    >
      <X size={17} />
    </button>
  );
}
