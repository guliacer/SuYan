import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Play, Save, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type {
  UpscaleComponentStatus,
  UpscaleEngine,
  UpscaleInputDescriptor,
  UpscaleOutputDirectoryDescriptor,
} from "../types";
import { getUpscaleModelDefinition } from "../utils/upscaleModels";
import { useUpscaleStore } from "../store/useUpscaleStore";
import { UpscaleCompare } from "./UpscaleCompare";
import { UpscaleQueue } from "./UpscaleQueue";
import { UpscaleSettings } from "./UpscaleSettings";

type MobilePanel = "queue" | "compare" | "settings";

const emptyStatuses: Record<UpscaleEngine, UpscaleComponentStatus | null> = {
  "real-cugan": null,
  "real-esrgan": null,
};

export function UpscaleWorkspace() {
  const { t } = useLocale();
  const store = useUpscaleStore((state) => state);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("compare");
  const [statuses, setStatuses] = useState(emptyStatuses);
  const [outputDirectory, setOutputDirectory] = useState<UpscaleOutputDirectoryDescriptor | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedJob = useMemo(
    () => store.jobs.find((job) => job.id === store.selectedJobId) ?? null,
    [store.jobs, store.selectedJobId],
  );
  const selectedDefinition = getUpscaleModelDefinition(store.modelId);
  const componentStatus = statuses[store.engine];
  const engineReady = componentStatus?.installed === true && (
    store.engine === "real-esrgan" || componentStatus.installedModelIds.includes(store.modelId)
  );
  const queuedCount = store.jobs.filter((job) => job.status === "queued").length;
  const resultCount = store.jobs.filter((job) => job.status === "result-ready").length;
  const completedCount = store.jobs.filter((job) => job.status === "completed").length;
  const overallProgress = store.jobs.length === 0
    ? 0
    : store.jobs.reduce((sum, job) => sum + job.progress, 0) / store.jobs.length;
  const exportReady = resultCount > 0 && (
    store.exportOptions.addToLibrary || (store.exportOptions.saveToDirectory && Boolean(store.exportOptions.outputDirectoryToken))
  );

  const refreshStatus = useCallback(async (engine: UpscaleEngine) => {
    const result = await window.suyanApi.getUpscaleComponentStatus(engine);
    if (result.ok) setStatuses((current) => ({ ...current, [engine]: result.data }));
  }, []);

  useEffect(() => {
    void refreshStatus("real-cugan");
    void refreshStatus("real-esrgan");
  }, [refreshStatus]);

  useEffect(() => window.suyanApi.onUpscaleProgress((event) => {
    if (event.jobId !== null || event.engine !== store.engine) return;
    setInstallProgress(event.progress);
  }), [store.engine]);

  async function addInputs(kind: "files" | "directory") {
    setNotice(null);
    const result = await window.suyanApi.pickUpscaleInputs(kind);
    if (!result.ok) {
      setNotice(t(result.error.message));
      return;
    }
    store.enqueue(result.data);
    if (result.data.length > 0) setMobilePanel("queue");
  }

  async function addDroppedFiles(files: File[]) {
    const result = await window.suyanApi.registerUpscaleFiles(files);
    if (!result.ok) {
      setNotice(t(result.error.message));
      return;
    }
    store.enqueue(result.data);
    setMobilePanel("queue");
  }

  async function chooseDirectory() {
    const result = await window.suyanApi.pickUpscaleOutputDirectory();
    if (!result.ok) {
      setNotice(t(result.error.message));
      return;
    }
    if (!result.data) return;
    setOutputDirectory(result.data);
    store.setExportOptions({ outputDirectoryToken: result.data.token, saveToDirectory: true });
  }

  async function installSelected() {
    setInstalling(true);
    setInstallProgress(0);
    setNotice(null);
    try {
      const result = await window.suyanApi.installUpscaleComponent(store.engine, store.modelId);
      if (!result.ok) {
        setNotice(t(result.error.message));
        return;
      }
      setStatuses((current) => ({ ...current, [store.engine]: result.data }));
    } finally {
      setInstalling(false);
    }
  }

  async function exportResults() {
    const summary = await store.commitResults();
    setNotice(summary.failed > 0
      ? t("{count} 项导出失败，可直接重试", { count: summary.failed })
      : t("已导出 {count} 项", { count: summary.completed }));
  }

  function selectJob(jobId: string) {
    store.select(jobId);
    setMobilePanel("compare");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-upscale-workspace>
      <nav className="grid grid-cols-3 border-b border-border bg-panel/65 min-[1100px]:hidden" aria-label={t("图片超分视图") }>
        {(["queue", "compare", "settings"] as const).map((panel) => (
          <button
            key={panel}
            type="button"
            className={`min-h-11 border-r border-border text-xs font-medium last:border-r-0 ${mobilePanel === panel ? "bg-primary text-primary-foreground" : "text-muted"}`}
            onClick={() => setMobilePanel(panel)}
          >
            {t(panel === "queue" ? "队列" : panel === "compare" ? "对比" : "设置")}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 grid-cols-1 min-[1100px]:grid-cols-[17rem_minmax(24rem,1fr)_20rem]">
        <div className={`${mobilePanel === "queue" ? "flex" : "hidden"} min-h-0 min-[1100px]:flex`}>
          <div className="min-h-0 flex-1">
            <UpscaleQueue
              jobs={store.jobs}
              selectedJobId={store.selectedJobId}
              activeJobId={store.activeJobId}
              onAddFiles={() => void addInputs("files")}
              onAddDirectory={() => void addInputs("directory")}
              onDropFiles={(files) => void addDroppedFiles(files)}
              onSelect={selectJob}
              onRemove={store.remove}
              onRetry={store.retry}
              onReorder={store.reorder}
              onClearCompleted={store.clearCompleted}
            />
          </div>
        </div>
        <div className={`${mobilePanel === "compare" ? "flex" : "hidden"} min-h-0 min-[1100px]:flex`}>
          <div className="min-h-0 min-w-0 flex-1"><UpscaleCompare job={selectedJob} /></div>
        </div>
        <div className={`${mobilePanel === "settings" ? "block" : "hidden"} min-h-0 overflow-hidden min-[1100px]:block`}>
          <UpscaleSettings
            preset={store.preset}
            engine={store.engine}
            modelId={store.modelId}
            tileSize={store.tileSize}
            gpuId={store.gpuId}
            forceWasm={store.forceWasm}
            exportOptions={store.exportOptions}
            outputDirectory={outputDirectory}
            componentStatus={componentStatus}
            installing={installing}
            installProgress={installProgress}
            onPresetChange={store.setPreset}
            onEngineChange={store.setEngine}
            onModelChange={store.setModelId}
            onTileSizeChange={store.setTileSize}
            onGpuIdChange={store.setGpuId}
            onForceWasmChange={store.setForceWasm}
            onExportOptionsChange={store.setExportOptions}
            onChooseDirectory={() => void chooseDirectory()}
            onInstall={() => void installSelected()}
          />
        </div>
      </main>

      <footer className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border bg-panel/85 px-3 py-2 sm:px-4">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className={`size-2 shrink-0 rounded-full ${engineReady ? "bg-progress" : "bg-muted"}`} aria-hidden="true" />
            <span className="truncate text-foreground">
              {engineReady
                ? `${store.engine === "real-cugan" ? "Real-CUGAN" : "Real-ESRGAN"} · ${t(selectedDefinition.label)}`
                : t("所选模型尚未安装")}
            </span>
            <span className="hidden shrink-0 text-muted sm:inline">
              {t("{completed}/{total} 已完成", { completed: completedCount, total: store.jobs.length })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-border/70">
            <div className="h-full rounded-full bg-progress transition-[width]" style={{ width: `${Math.round(overallProgress * 100)}%` }} />
          </div>
          {notice ? <p className="truncate text-xs text-muted" title={notice}>{notice}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {resultCount > 0 ? (
            <Button
              icon={<Save className="size-4" />}
              disabled={!exportReady || store.isRunning}
              maxWidth={false}
              size="sm"
              variant="secondary"
              onClick={() => void exportResults()}
            >
              {t("导出结果")} · {resultCount}
            </Button>
          ) : null}
          {store.isRunning ? (
            <Button icon={<Square className="size-4" />} maxWidth={false} size="sm" variant="danger" onClick={() => void store.cancelActive()}>
              {t("取消任务")}
            </Button>
          ) : engineReady ? (
            <Button
              icon={<Play className="size-4" />}
              disabled={queuedCount === 0}
              maxWidth={false}
              size="sm"
              variant="primary"
              onClick={() => void store.startQueue()}
            >
              {t("开始处理")} · {queuedCount}
            </Button>
          ) : (
            <Button icon={<Download className="size-4" />} disabled={installing} maxWidth={false} size="sm" variant="primary" onClick={() => void installSelected()}>
              {installing ? t("安装中") : t("安装模型")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

export function createUpscaleMockInput(index = 1): UpscaleInputDescriptor {
  return {
    token: `mock-input-${index}`,
    displayName: `image-${index}.png`,
    width: 960,
    height: 640,
    byteSize: 1024,
    mediaType: "image/png",
    sourceItemId: null,
    previewDataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  };
}
