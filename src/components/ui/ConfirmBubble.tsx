import type { ReactNode } from "react";

type ConfirmBubbleProps = {
  cancelLabel?: string;
  className?: string;
  confirmLabel: string;
  description: string;
  icon?: ReactNode;
  isBusy?: boolean;
  placement?: "above" | "below";
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmBubble({
  cancelLabel = "取消",
  className = "",
  confirmLabel,
  description,
  icon,
  isBusy = false,
  placement = "above",
  title,
  onCancel,
  onConfirm,
}: ConfirmBubbleProps) {
  const arrowClassName =
    placement === "below"
      ? "-top-1.5 border-l border-t"
      : "-bottom-1.5 border-b border-r";

  return (
    <div
      className={`absolute z-50 w-72 rounded-xl border border-border bg-panel/95 p-3 text-left shadow-elevated backdrop-blur ${className}`}
      role="alertdialog"
    >
      <span className={`absolute right-8 size-3 rotate-45 border-border bg-panel ${arrowClassName}`} />
      <div className="relative flex gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        </div>
      </div>
      <div className="relative mt-3 grid grid-cols-2 gap-2">
        <button
          className="min-h-9 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-primary-soft"
          disabled={isBusy}
          type="button"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          className="min-h-9 rounded-xl border border-danger bg-danger px-3 text-sm font-medium text-danger-foreground transition-colors hover:bg-danger-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          type="button"
          onClick={onConfirm}
        >
          {isBusy ? "删除中" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
