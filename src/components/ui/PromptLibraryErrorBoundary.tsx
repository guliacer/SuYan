import { Component, type ErrorInfo, type ReactNode } from "react";
import { translateUiText } from "@/components/LocaleProvider";
import { useLibraryStore } from "@/features/library/store/useLibraryStore";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Keeps a lazy-loaded inspiration library failure local to its workspace. */
export class PromptLibraryErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      window.suyanApi.logStartupEvent("prompt-library:render-error", {
        message: error.message.slice(0, 200),
        componentStack: info.componentStack?.slice(0, 500) ?? "",
      });
    } catch {
      // The bridge may be unavailable in a static preview; the fallback remains usable.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const language = useLibraryStore.getState().language;
    const t = (text: string) => translateUiText(language, text);
    return (
      <section className="flex min-h-[520px] flex-1 items-center justify-center bg-background p-6">
        <div className="grid w-full max-w-md gap-3 rounded-lg border border-danger/30 bg-panel p-6 text-center">
          <h2 className="text-base font-semibold text-foreground">{t("灵感创作暂时无法打开")}</h2>
          <p className="text-sm leading-6 text-muted">{t("灵感数据或组件加载异常，素材库仍可正常使用。")}</p>
          <div className="flex justify-center gap-2">
            <button className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background" type="button" onClick={() => this.setState({ error: null })}>{t("重试")}</button>
            <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" type="button" onClick={() => window.location.reload()}>{t("重新加载应用")}</button>
          </div>
        </div>
      </section>
    );
  }
}
