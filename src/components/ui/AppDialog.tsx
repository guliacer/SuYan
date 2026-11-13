import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

const dialogFocusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

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
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const animationFrame = window.requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(dialogFocusableSelector);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        panelRef.current?.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(dialogFocusableSelector)]
          .filter((element) => element.getClientRects().length > 0);
        if (focusable.length === 0) {
          event.preventDefault();
          panelRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
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
        ref={panelRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`theme-dialog overflow-hidden rounded-2xl border border-border bg-panel shadow-image ${panelClassName}`}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

type DialogCloseButtonProps = {
  ariaLabel?: string;
  variant?: "default" | "chrome";
  onClick: () => void;
};

export function DialogCloseButton({ ariaLabel = "关闭", variant = "default", onClick }: DialogCloseButtonProps) {
  const { t } = useLocale();
  const resolvedAriaLabel = ariaLabel === "关闭" ? t("关闭") : ariaLabel;
  const chrome = variant === "chrome";
  return (
    <button
      aria-label={resolvedAriaLabel}
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/35 ${
        chrome
          ? "border-chrome-border bg-chrome-control/70 text-chrome-muted hover:bg-chrome-control hover:text-chrome-foreground"
          : "border-border bg-panel/80 text-muted hover:bg-primary-soft hover:text-foreground"
      }`}
      title={resolvedAriaLabel}
      type="button"
      onClick={onClick}
    >
      <X size={17} />
    </button>
  );
}
