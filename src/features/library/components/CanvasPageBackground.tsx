import type { ReactNode } from "react";
import { useCanvasBackground } from "./useCanvasBackground";
import { useLocale } from "@/components/LocaleProvider";

/** The scrollable page behind both cards, excluding the app titlebar and sidebar. */
export function CanvasPageBackground({ currentView, className, children }: {
  currentView: string;
  className: string;
  children: ReactNode;
}) {
  const enabled = currentView === "canvas";
  const { t } = useLocale();
  const background = useCanvasBackground(enabled);
  return (
    <div className={className} data-current-view={currentView}
      data-background-mode={enabled ? background.mode : undefined}
      data-background-dark={enabled ? background.dark : undefined}
      style={enabled ? background.style : undefined}>
      {children}
      {background.imageError ? <p role="status" className="absolute right-4 top-2 z-20 max-w-sm rounded-md bg-panel px-3 py-2 text-xs text-muted shadow-sm">{t("页面背景图片无法读取，已使用默认背景。请在系统设置中重新选择。")}</p> : null}
    </div>
  );
}
