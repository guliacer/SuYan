import { Component, type ErrorInfo, type ReactNode } from "react";
import { translateUiText } from "@/components/LocaleProvider";
import { useLibraryStore } from "@/features/library/store/useLibraryStore";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Prevents a renderer exception from clearing the entire desktop workspace. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      window.suyanApi.logStartupEvent("render:error-boundary", {
        code: "RENDERER_RENDER_ERROR",
        message: error.message.slice(0, 500),
        stack: error.stack?.slice(0, 1000) ?? "",
        componentStack: info.componentStack?.slice(0, 1000) ?? "",
      });
    } catch {
      // A broken renderer bridge must not hide the recovery view.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = (text: string) => translateUiText(useLibraryStore.getState().language, text);

    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-6 py-10 text-foreground" role="alert">
        <section className="grid w-full max-w-lg gap-4 rounded-xl border border-danger/30 bg-panel p-6 shadow-sm">
          <div>
            <p className="text-xs font-medium text-danger">{t("页面加载异常")}</p>
            <h1 className="mt-1 text-lg font-semibold">{t("工作区暂时无法显示")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted">{t("应用数据没有被删除。可以先重试当前页面；如果问题持续，请重新加载应用。")}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-background" type="button" onClick={() => this.setState({ error: null })}>{t("重试当前页面")}</button>
            <button className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" type="button" onClick={() => window.location.reload()}>{t("重新加载应用")}</button>
          </div>
        </section>
      </main>
    );
  }
}
