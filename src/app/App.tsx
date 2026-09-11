import { lazy, Profiler, Suspense, useEffect, type ProfilerOnRenderCallback } from "react";
import { ExportProgressPanel } from "@/components/ui/ExportProgressPanel";
import { useLocale } from "@/components/LocaleProvider";

const LibraryView = lazy(() => import("@/features/library").then((module) => ({ default: module.LibraryView })));

let profilerCommitCount = 0;
const profilerStartMs = Date.now();

const handleProfilerRender: ProfilerOnRenderCallback = (_id, phase, actualDuration) => {
  profilerCommitCount += 1;
  const sinceStartMs = Date.now() - profilerStartMs;

  if (sinceStartMs < 30000 && (actualDuration >= 20 || profilerCommitCount % 20 === 0)) {
    try {
      window.suyanApi.logStartupEvent("profiler:commit", {
        phase,
        commitIndex: profilerCommitCount,
        actualMs: Math.round(actualDuration * 100) / 100,
        sinceStartMs,
      });
    } catch {
    }
  }
};

export function App() {
  return (
    <Profiler id="LibraryView" onRender={handleProfilerRender}>
      <ExportProgressPanel />
      <Suspense fallback={<AppLoadingFallback />}>
        <LibraryView />
      </Suspense>
    </Profiler>
  );
}

/**
 * Keep the static HTML bootstrap shell visible while the lazy LibraryView chunk
 * downloads/parses. Replacing #root with a minimal React fallback caused a
 * visible white/blank flash between the HTML shell and the startup gallery.
 */
function AppLoadingFallback() {
  const { t } = useLocale();
  useEffect(() => {
    try {
      window.suyanApi.logStartupEvent("app:chunk-suspense", {
        sinceStartMs: Date.now() - profilerStartMs,
      });
    } catch {
    }
  }, []);

  return (
    <main className="app-loading-shell" aria-label={t("正在加载素言")}>
      <div className="app-loading-magic" aria-hidden="true">
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
        <span className="app-loading-particle" />
      </div>
      <div className="app-loading-titlebar" />
      <section className="app-loading-stage">
        <div className="app-loading-panel">
          <div className="app-loading-brand">
            <span className="app-loading-mark" aria-hidden="true">
              {t("素")}
            </span>
            <div>
              <strong>{t("素言")}</strong>
              <p className="app-loading-copy">{t("正在加载素材库...")}</p>
            </div>
          </div>
          <div className="app-loading-progress" aria-hidden="true" />
          <div className="app-loading-skeleton" aria-hidden="true">
            <div className="app-loading-thumb" />
            <div className="app-loading-lines">
              <div className="app-loading-line" />
              <div className="app-loading-line" />
              <div className="app-loading-line" />
            </div>
          </div>
        </div>
        <div className="app-loading-transform" aria-hidden="true">
          <div className="app-loading-prompt-card">
            <span className="app-loading-prompt-chip">{t("柔和自然光")}</span>
            <span className="app-loading-prompt-chip">{t("产品构图")}</span>
            <span className="app-loading-prompt-chip">{t("细腻材质")}</span>
            <span className="app-loading-prompt-chip">{t("背景层次")}</span>
          </div>
          <div className="app-loading-generate-flow" />
          <div className="app-loading-image-preview">
            <span />
          </div>
        </div>
      </section>
    </main>
  );
}
