import { type CSSProperties } from "react";
import { Check, Info, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

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
  const title = getStatusToastTitle(message);
  const isPending = message.autoDismissMs === null;
  const durationStyle = isPending
    ? undefined
    : ({
        "--status-toast-duration": `${message.autoDismissMs}ms`,
      } as CSSProperties);

  return (
    <div
      aria-atomic="true"
      aria-live={message.type === "error" ? "assertive" : "polite"}
      className="pointer-events-none fixed left-1/2 top-[calc(var(--app-window-content-top)+0.75rem)] z-[9990] flex w-[calc(100vw-2rem)] -translate-x-1/2 justify-center"
      role={message.type === "error" ? "alert" : "status"}
    >
      <button
        aria-label={t("关闭消息提示")}
        className="status-toast pointer-events-auto relative flex min-h-[58px] w-fit min-w-64 max-w-[calc(100vw-2rem)] items-center justify-center gap-2.5 overflow-hidden rounded-[13px] border border-border bg-panel px-5 text-center shadow-image outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/25 sm:max-w-96"
        style={durationStyle}
        type="button"
        onClick={onClose}
      >
        <span className={`flex size-[22px] shrink-0 items-center justify-center rounded-full ${toneClassName.icon}`}>
          {message.type === "success" ? (
            <Check size={13} strokeWidth={3} />
          ) : message.type === "error" ? (
            <X size={13} strokeWidth={3} />
          ) : (
            <Info size={13} strokeWidth={2.5} />
          )}
        </span>
        <span className="grid min-w-0 max-w-[17rem] flex-none gap-0.5 text-center">
          <span className="truncate text-[13px] font-bold leading-[18px] text-foreground">{t(title)}</span>
          <span className="truncate text-xs leading-[17px] text-muted">{t(message.text)}</span>
        </span>
        <span
          className={`absolute bottom-0 left-0 h-0.5 ${toneClassName.progress} ${
            isPending ? "status-toast-progress-indeterminate" : "status-toast-progress w-full"
          }`}
        />
      </button>
    </div>
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
    return message.autoDismissMs === null ? "正在处理" : "提示";
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
