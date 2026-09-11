import type { ReactNode } from "react";
import { useLocale } from "@/components/LocaleProvider";

type ConfirmBubbleProps = {
  cancelLabel?: string;
  className?: string;
  confirmLabel: string;
  description: string;
  icon?: ReactNode;
  isBusy?: boolean;
  /** Label while confirm is in progress. Defaults to "处理中…". */
  busyLabel?: string;
  placement?: "above" | "below";
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmBubble({
  cancelLabel,
  className = "",
  confirmLabel,
  description,
  icon,
  isBusy = false,
  busyLabel,
  placement = "above",
  title,
  onCancel,
  onConfirm,
}: ConfirmBubbleProps) {
  const { t } = useLocale();
  const resolvedCancelLabel = cancelLabel ?? t("取消");
  const resolvedBusyLabel = busyLabel ?? t("处理中…");
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
          className="flex min-h-9 min-w-0 items-center justify-center rounded-xl border border-border bg-background px-3 py-1.5 text-center text-sm font-medium leading-tight break-words text-foreground transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          title={resolvedCancelLabel}
          type="button"
          onClick={onCancel}
        >
          {resolvedCancelLabel}
        </button>
        <button
          className="flex min-h-9 min-w-0 items-center justify-center rounded-xl border border-danger bg-danger px-3 py-1.5 text-center text-sm font-medium leading-tight break-words text-danger-foreground transition-colors hover:bg-danger-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isBusy}
          title={isBusy ? resolvedBusyLabel : confirmLabel}
          type="button"
          onClick={onConfirm}
        >
          {isBusy ? resolvedBusyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
