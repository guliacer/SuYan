import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { LocaleProvider } from "./components/LocaleProvider";
import { WindowResizeHandles } from "./components/ui/WindowResizeHandles";
import "./styles/tokens.css";

function logRendererFailure(event: string, details: Record<string, unknown>): void {
  try {
    window.suyanApi.logStartupEvent(event, details);
  } catch {
    // Error reporting must never become a second renderer failure.
  }
}

window.addEventListener("error", (event) => {
  const error = event.error instanceof Error ? event.error : null;
  logRendererFailure("renderer:uncaught-error", {
    code: "RENDERER_UNCAUGHT_ERROR",
    message: (error?.message || event.message || "未捕获的渲染异常").slice(0, 500),
    stack: error?.stack?.slice(0, 1000) ?? "",
    source: event.filename?.slice(0, 300) ?? "",
    line: event.lineno,
    column: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason : null;
  logRendererFailure("renderer:unhandled-rejection", {
    code: "RENDERER_UNHANDLED_REJECTION",
    message: (reason?.message || String(event.reason || "未处理的异步异常")).slice(0, 500),
    stack: reason?.stack?.slice(0, 1000) ?? "",
  });
});

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element missing");
}

function bindBootstrapWindowControls(): void {
  const controls = document.querySelectorAll<HTMLButtonElement>("[data-window-control]");

  controls.forEach((control) => {
    control.addEventListener(
      "click",
      () => {
        switch (control.dataset.windowControl) {
          case "minimize":
            void window.suyanApi.minimizeWindow();
            break;
          case "maximize":
            void window.suyanApi.toggleMaximizeWindow();
            break;
          case "close":
            void window.suyanApi.closeWindow();
            break;
          default:
            break;
        }
      },
      { once: true },
    );
  });
}

bindBootstrapWindowControls();
document.documentElement.dataset.windowMaterial = window.suyanApi.windowMaterial ?? "fallback";

/**
 * 窗口悬浮形态开关：无边框透明窗口没有系统投影，也没有系统圆角裁切，
 * 阴影与四角圆角都得自己画（见 tokens.css 的 --app-window-gutter / -radius）。
 * 最大化时必须收掉留边，否则窗口四周会露出一圈桌面。
 */
function bindWindowFloatingState(): void {
  const apply = (maximized: boolean) => {
    document.documentElement.dataset.windowFloating = String(!maximized);
  };

  void window.suyanApi
    .isWindowMaximized()
    .then((result) => {
      if (result.ok && result.data) {
        apply(result.data.maximized);
      }
    })
    .catch(() => undefined);

  window.suyanApi.onWindowMaximizeChange(apply);
}

bindWindowFloatingState();

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <AppErrorBoundary>
        <App />
        <WindowResizeHandles />
      </AppErrorBoundary>
    </LocaleProvider>
  </StrictMode>,
);
