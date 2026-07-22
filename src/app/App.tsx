import { lazy, Profiler, Suspense, type ProfilerOnRenderCallback } from "react";

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
      <Suspense fallback={<AppLoadingFallback />}>
        <LibraryView />
      </Suspense>
    </Profiler>
  );
}

function AppLoadingFallback() {
  return (
    <main className="grid h-screen place-items-center bg-background text-foreground">
      <div className="rounded-lg border border-border bg-panel px-5 py-4 text-sm text-muted shadow-elevated">
        正在加载素言...
      </div>
    </main>
  );
}
