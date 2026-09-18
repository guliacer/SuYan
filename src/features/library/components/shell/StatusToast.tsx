import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, Info, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { RotatingLoadingTip } from "@/components/ui/RotatingLoadingTip";

export type ToastStatusMessage = {
  autoDismissMs: number | null;
  text: string;
  type: "success" | "error" | "info";
};

type StatusToastProps = {
  message: ToastStatusMessage;
  onClose: () => void;
};

export function StatusToast({ message, onClose }: StatusToastProps) {
  const { t } = useLocale();
  const toneClassName = getStatusToastToneClassName(message.type);
  const isPending = message.autoDismissMs === null;
  const isProcessing = message.type === "info" && isPending;
  const title = isProcessing ? message.text : getStatusToastTitle(message);
  const durationStyle = isPending
    ? undefined
    : ({
        "--status-toast-duration": `${message.autoDismissMs}ms`,
      } as CSSProperties);

  return createPortal(
    <div
      aria-atomic="true"
      aria-live={message.type === "error" ? "assertive" : "polite"}
      className="pointer-events-none fixed left-1/2 top-[calc(var(--app-window-content-top)+1rem)] z-[2147483646] flex w-[calc(100vw-2rem)] -translate-x-1/2 justify-center"
      role={message.type === "error" ? "alert" : "status"}
    >
      <button
        aria-label={t("关闭消息提示")}
        className="status-toast pointer-events-auto relative flex min-h-[76px] w-full max-w-[20rem] items-center justify-center gap-3 overflow-hidden rounded-[15px] border border-border bg-panel px-5 py-3.5 text-center shadow-image outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25"
        style={durationStyle}
        type="button"
        onClick={onClose}
      >
        <span className={`flex size-[24px] shrink-0 items-center justify-center rounded-full ${toneClassName.icon}`}>
          {message.type === "success" ? (
            <Check size={14} strokeWidth={3} />
          ) : message.type === "error" ? (
            <X size={14} strokeWidth={3} />
          ) : (
            <Info size={14} strokeWidth={2.5} />
          )}
        </span>
        <span className="grid min-w-0 flex-1 gap-1.5 text-center">
          <span
            className={`status-toast__text-sheen break-words whitespace-normal text-foreground ${
              isProcessing ? "text-sm font-black leading-[22px]" : "text-[13px] font-bold leading-[20px]"
            }`}
          >
            {t(title)}
          </span>
          {!isProcessing ? (
            <span className="status-toast__text-sheen status-toast__text-sheen--muted break-words whitespace-normal text-xs leading-[18px] text-muted">
              {t(message.text)}
            </span>
          ) : null}
          {isProcessing ? <RotatingLoadingTip className="justify-center status-toast__tip" kind="processing" /> : null}
        </span>
        <span
          className={`absolute bottom-0 left-0 h-0.5 ${toneClassName.progress} ${
            isPending ? "status-toast-progress-indeterminate" : "status-toast-progress w-full"
          }`}
        />
      </button>
    </div>,
    document.body,
  );
}

function getStatusToastToneClassName(type: ToastStatusMessage["type"]): { icon: string; progress: string } {
  if (type === "success") {
    return {
      icon: "bg-capsule-sage text-capsule-sage-foreground",
      progress: "bg-primary",
    };
  }

  if (type === "error") {
    return {
      icon: "bg-danger-soft text-danger",
      progress: "bg-danger",
    };
  }

  return {
    icon: "bg-capsule-mist text-capsule-mist-foreground",
    progress: "bg-progress",
  };
}

function getStatusToastTitle(message: ToastStatusMessage): string {
  if (message.type === "error") {
    return "操作失败";
  }

  if (message.type === "info") {
    return "提示";
  }

  if (message.text.includes("导入")) {
    return "导入成功";
  }

  if (message.text.includes("导出")) {
    return "导出成功";
  }

  if (message.text.includes("复制")) {
    return "复制成功";
  }

  if (message.text.includes("保存")) {
    return "保存成功";
  }

  return "操作成功";
}
