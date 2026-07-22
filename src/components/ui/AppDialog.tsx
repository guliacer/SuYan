import type { ReactNode } from "react";
import { X } from "lucide-react";

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
  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-overlay/60 backdrop-blur-sm ${overlayClassName}`}
      role="presentation"
      onClick={onClose}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`overflow-hidden rounded-2xl border border-border bg-panel shadow-image ${panelClassName}`}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

type DialogCloseButtonProps = {
  ariaLabel?: string;
  onClick: () => void;
};

export function DialogCloseButton({ ariaLabel = "关闭", onClick }: DialogCloseButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className="icon-tooltip-button flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-panel/80 text-muted transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
      data-tooltip-align="end"
      data-tooltip-placement="below"
      type="button"
      onClick={onClick}
    >
      <X size={17} />
      <span className="icon-tooltip-button__bubble" role="tooltip">
        {ariaLabel}
      </span>
    </button>
  );
}
