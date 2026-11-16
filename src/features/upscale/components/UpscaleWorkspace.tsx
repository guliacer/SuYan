import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ImageUp, Inbox, PanelRightClose, PanelRightOpen, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import { useLibraryStore } from "@/features/library/store/useLibraryStore";
import type {
  UpscaleComponentStatus,
  UpscaleEngine,
  UpscaleInputDescriptor,
  UpscaleOutputDirectoryDescriptor,
  UpscaleOutputFormat,
} from "../types";
import { buildUpscaleOutputName } from "../utils/upscaleExport";
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

type UpscaleWorkspaceProps = {
  onSourceReplaced?: (sourceItemId: string) => void | Promise<void>;
};

export function UpscaleWorkspace({ onSourceReplaced = () => undefined }: UpscaleWorkspaceProps = {}) {
  const { t } = useLocale();
  const store = useUpscaleStore((state) => state);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("compare");
  const [statuses, setStatuses] = useState(emptyStatuses);
  const [outputDirectory, setOutputDirectory] = useState<UpscaleOutputDirectoryDescriptor | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [replacingSource, setReplacingSource] = useState(false);
  // 右栏折叠：设置项多、纵向占位高，用户主要在对比预览时不需要它。
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  // 只有宽屏才允许折叠：窄屏下右栏本身就是独立的「设置」标签页，
  // 折叠掉会直接让用户看不到设置内容。
  const [isWideLayout, setIsWideLayout] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1100px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const handleChange = (event: MediaQueryListEvent) => setIsWideLayout(event.matches);
    setIsWideLayout(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const settingsHidden = settingsCollapsed && isWideLayout;

  const selectedJob = useMemo(
    () => store.jobs.find((job) => job.id === store.selectedJobId) ?? null,
    [store.jobs, store.selectedJobId],
  );
  const selectedDefinition = getUpscaleModelDefinition(store.modelId);
  const componentStatus = statuses[store.engine];
  const engineReady = componentStatus?.installed === true && (
    store.engine === "real-esrgan" || componentStatus.installedModelIds.includes(store.modelId)
  );
  // 仅判引擎包是否装过，用于底栏文案细分（已装引擎但当前倍率模型未下时，
  // 不该显示「所选模型尚未安装」这种笼统话）。
  const engineInstalled = componentStatus?.installed === true;
  const queuedCount = store.jobs.filter((job) => job.status === "queued").length;
  const canceledCount = store.jobs.filter((job) => job.status === "canceled").length;
  const resultCount = store.jobs.filter((job) => job.status === "result-ready").length;
  const completedCount = store.jobs.filter((job) => job.status === "completed").length;
  const overallProgress = store.jobs.length === 0
    ? 0
    : store.jobs.reduce((sum, job) => sum + job.progress, 0) / store.jobs.length;
  const activeJob = store.jobs.find((job) => job.id === store.activeJobId) ?? null;
  // 底栏状态文字：优先显示主动反馈（导出结果 / 报错），否则显示正在跑的任务在做什么。
  const statusText = notice ?? (activeJob ? t(activeJob.message) : null);

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

  /**
   * 勾选「同时保存到目录」时立刻弹出目录选择：
   * 不让用户停在「已勾选但没选目录」的中间态，导出时也就不会报「尚未选择保存目录」。
   */
  async function toggleSaveToDirectory(checked: boolean) {
    if (!checked) {
      store.setExportOptions({ saveToDirectory: false });
      return;
    }
    const result = await window.suyanApi.pickUpscaleOutputDirectory();
    if (!result.ok) {
      setNotice(t(result.error.message));
      return;
    }
    if (!result.data) return;
    setOutputDirectory(result.data);
    store.setExportOptions({ saveToDirectory: true, outputDirectoryToken: result.data.token });
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
      // 安装结果必须同步回模块面板：超分引擎和模块状态是两套数据，
      // 不主动回写会让「依赖」分组永远停在「未安装 / 不可用」。
      void useLibraryStore.getState().checkUpscaleRuntimes();
    } finally {
      setInstalling(false);
    }
  }

  /**
   * 底栏「导出」：与创意画布一致 —— 点了就收录进素材库，不需要任何前置设置。
   * 右栏勾了「同时保存到目录」时额外落一份到该目录。
   */
  async function exportResults() {
    const options = store.exportOptions;
    const saveToDirectory = options.saveToDirectory && Boolean(options.outputDirectoryToken);
    const summary = await store.commitResults(undefined, {
      addToLibrary: true,
      saveToDirectory,
      outputDirectoryToken: saveToDirectory ? options.outputDirectoryToken : null,
    });
    setNotice(summary.failed > 0
      ? t("{count} 项导出失败，可直接重试", { count: summary.failed })
      : t("已导出 {count} 项", { count: summary.completed }));
  }

  /**
   * 单张「另存为」：弹系统保存对话框，落到用户指定的位置。
   * 目标已存在时主进程会先备份再覆盖，失败时自动还原。
   */
  async function saveAs(jobId: string) {
    const job = store.jobs.find((entry) => entry.id === jobId);
    if (!job?.result) return;
    const format = store.exportOptions.format;
    const fileName = `${buildUpscaleOutputName(job.input.displayName, job.modelId, store.exportOptions.namingPattern)}.${extensionForFormat(format)}`;
    const target = await window.suyanApi.pickUpscaleExportTarget({ mode: "file", fileName, format });
    if (!target.ok) {
      setNotice(t(target.error.message));
      return;
    }
    if (!target.data) return;
    const summary = await store.commitResults([job.id], {
      saveToDirectory: true,
      addToLibrary: false,
      outputDirectoryToken: target.data.directoryToken,
      targetFilePath: target.data.filePath,
    });
    const savedName = target.data.filePath?.split(/[\\/]/u).at(-1) ?? fileName;
    setNotice(summary.failed > 0
      ? t("导出失败，请重试。")
      : t("已另存为 {name}", { name: savedName }));
  }

  async function replaceSourceAndReturn() {
    if (!selectedJob?.result || !selectedJob.input.sourceItemId) return;
    setReplacingSource(true);
    setNotice(null);
    try {
      const result = await window.suyanApi.replaceUpscaleSource({
        inputToken: selectedJob.input.token,
        resultToken: selectedJob.result.token,
      });
      if (!result.ok) {
        setReplaceConfirmOpen(false);
        setNotice(t(result.error.message));
        return;
      }
      store.remove(selectedJob.id);
      setReplaceConfirmOpen(false);
      try {
        await onSourceReplaced(result.data.sourceItemId);
      } catch {
        setNotice(t("原图已替换，但返回详情失败，请重新打开素材详情。"));
      }
    } catch (error) {
      setReplaceConfirmOpen(false);
      setNotice(error instanceof Error && error.message.trim() ? error.message : t("替换原图失败，请重试。"));
    } finally {
      setReplacingSource(false);
    }
  }

  function selectJob(jobId: string) {
    store.select(jobId);
    setMobilePanel("compare");
  }

  /**
   * 用当前选中的模型重新处理这张图。
   * 换模型后旧结果对应的是上一个模型，用户不满意必须能再跑一次；
   * 旧逻辑里 job 一旦离开 queued 就再也回不来，所以这里显式重新入队并清掉旧结果。
   */
  function reprocessJob(jobId: string) {
    store.reprocess(jobId);
    setNotice(t("已按当前模型重新入队，点「开始处理」执行。"));
  }

  function renderSettingsPanel(collapsible: boolean) {
    return (
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
        onSaveToDirectoryChange={(checked) => void toggleSaveToDirectory(checked)}
        onInstall={() => void installSelected()}
        onCollapse={collapsible ? () => setSettingsCollapsed(true) : undefined}
      />
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3 bg-background p-3 text-foreground min-[640px]:gap-4 min-[640px]:p-4"
      data-upscale-workspace
    >
      {/* 标题条：和创作画布同构 —— 左侧「标题 + 副标题」，右侧状态胶囊。
          引擎/模型状态从底栏挪上来，底栏只留进度和操作，两边不再重复。 */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">{t("图片超分")}</h1>
          <p className="truncate text-xs text-muted">{t("放大细节，左右对比满意后再导出")}</p>
        </div>
        <span
          className={`inline-flex min-w-0 shrink items-center gap-2 rounded-full border px-3 py-1 text-xs ${
            engineReady
              ? "border-border bg-panel text-muted"
              : "border-warning/30 bg-warning-soft text-warning"
          }`}
        >
          <span className="relative flex size-1.5 shrink-0 items-center justify-center" aria-hidden="true">
            {engineReady ? (
              <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-progress/55" />
            ) : null}
            <span className={`relative inline-flex size-1.5 rounded-full ${engineReady ? "bg-progress" : "bg-warning"}`} />
          </span>
          <span className="truncate">
            {engineReady
              ? `${store.engine === "real-cugan" ? "Real-CUGAN" : "Real-ESRGAN"} · ${selectedDefinition.scale}x`
              : engineInstalled
                ? t("当前倍率模型尚未下载")
                : t("所选引擎尚未安装")}
          </span>
        </span>
      </header>

      {/* 窄屏视图切换：单独占一行通栏，宽屏隐藏。 */}
      <nav
        className="grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-border bg-panel p-1 min-[1100px]:hidden"
        aria-label={t("图片超分视图") }
      >
        {(["queue", "compare", "settings"] as const).map((panel) => (
          <button
            key={panel}
            type="button"
            className={`min-h-9 rounded-lg text-xs font-medium transition-colors ${
              mobilePanel === panel
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted hover:bg-primary-soft hover:text-foreground"
            }`}
            onClick={() => setMobilePanel(panel)}
          >
            {t(panel === "queue" ? "队列" : panel === "compare" ? "对比" : "设置")}
          </button>
        ))}
      </nav>

      <main
        className={`grid min-h-0 flex-1 grid-cols-1 gap-3 ${
          // 折叠后右栏只留一条窄边（放展开按钮），把宽度还给中栏的对比区。
          // 必须二选一地拼 class：两个 grid-cols-* 同时存在时，
          // 生效的是 CSS 里靠后的那条，跟 class 属性的书写顺序无关。
          settingsHidden
            ? "min-[1100px]:grid-cols-[20rem_minmax(24rem,1fr)_2.75rem]"
            : "min-[1100px]:grid-cols-[20rem_minmax(24rem,1fr)_20rem]"
        }`}
      >
        <div className={`${mobilePanel === "queue" ? "flex" : "hidden"} min-h-0 min-[1100px]:flex`}>
          <div className="upscale-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-panel">
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
              onReprocess={(jobId) => reprocessJob(jobId)}
              onSaveAs={(jobId) => void saveAs(jobId)}
              onReorder={store.reorder}
              onClearCompleted={store.clearCompleted}
            />
          </div>
        </div>
        <div className={`${mobilePanel === "compare" ? "flex" : "hidden"} min-h-0 min-[1100px]:flex`}>
          <div className="upscale-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-panel">
            <UpscaleCompare
              job={selectedJob}
              onAddFiles={() => void addInputs("files")}
              onReprocess={selectedJob ? () => reprocessJob(selectedJob.id) : undefined}
            />
          </div>
        </div>
        <div className={`${mobilePanel === "settings" ? "flex" : "hidden"} min-h-0 min-[1100px]:flex`}>
          {/* 宽屏折叠时换成一条窄边（放展开按钮），窄屏永远显示完整设置。 */}
          <div
            className={`upscale-panel min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-panel ${
              settingsHidden ? "hidden" : "flex"
            }`}
          >
            {renderSettingsPanel(isWideLayout)}
          </div>
          {settingsHidden ? (
            <div className="upscale-panel hidden h-full flex-col items-center gap-2 rounded-2xl border border-border bg-panel py-3 min-[1100px]:flex">
              <IconTooltipButton
                icon={<PanelRightOpen className="size-4" />}
                label={t("展开设置")}
                size="sm"
                tooltipPlacement="left"
                variant="ghost"
                onClick={() => setSettingsCollapsed(false)}
              />
              <span className="select-none text-[0.625rem] tracking-[0.25em] text-muted [writing-mode:vertical-rl]">
                {t("设置")}
              </span>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="upscale-panel flex min-h-16 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-panel px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {/* 进度条限宽：整条铺满会把右边那行文字挤成孤岛。 */}
          <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-border/70">
            <div
              className="h-full rounded-full bg-progress transition-[width] duration-300"
              style={{ width: `${Math.round(overallProgress * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {t("{completed}/{total} 已完成", { completed: completedCount, total: store.jobs.length })}
          </span>
          {/* 当前状态写在这里：用户要求「处理要一直展示在页面当中」，
              只给一个百分比看不出在干什么。 */}
          {statusText ? (
            <span className="min-w-0 max-w-full truncate text-xs text-muted" title={statusText}>
              {statusText}
            </span>
          ) : null}
          {engineReady ? null : (
            <span className="shrink-0 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-xs text-warning">
              {engineInstalled ? t("需先下载模型") : t("需先下载组件")}
            </span>
          )}
        </div>
        {/* 按钮组必须允许换行：窄屏下「替换原图 / 导出 / 另存为 / 开始处理」
            四个按钮一行放不下，不换行会撑破视口。 */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedJob?.input.sourceItemId && selectedJob.result ? (
            <Button
              aria-label={t("替换原图并返回详情")}
              className="max-[639px]:gap-0 max-[639px]:px-2 max-[639px]:[&>span:last-child]:hidden"
              icon={<ImageUp className="size-4" />}
              disabled={store.isRunning || replacingSource}
              maxWidth={false}
              size="sm"
              variant="secondary"
              onClick={() => setReplaceConfirmOpen(true)}
            >
              {t("替换原图并返回详情")}
            </Button>
          ) : null}
          {resultCount > 0 ? (
            <>
              <Button
                icon={<Inbox className="size-4" />}
                disabled={store.isRunning}
                maxWidth={false}
                size="sm"
                variant="secondary"
                onClick={() => void exportResults()}
              >
                {t("导出")} · {resultCount}
              </Button>
              <Button
                icon={<Download className="size-4" />}
                disabled={store.isRunning || !selectedJob?.result}
                maxWidth={false}
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (selectedJob) void saveAs(selectedJob.id);
                }}
              >
                {t("另存为")}
              </Button>
            </>
          ) : null}
          {store.isRunning ? (
            <Button icon={<Square className="size-4" />} maxWidth={false} size="sm" variant="danger" onClick={() => void store.cancelActive()}>
              {t("取消任务")}
            </Button>
          ) : engineReady ? (
            <>
              {canceledCount > 0 ? (
                <Button
                  icon={<RotateCcw className="size-4" />}
                  maxWidth={false}
                  size="sm"
                  variant="secondary"
                  onClick={() => void store.reprocessCanceled()}
                >
                  {t("重新处理")} · {canceledCount}
                </Button>
              ) : null}
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
            </>
          ) : (
            <Button icon={<Download className="size-4" />} disabled={installing} maxWidth={false} size="sm" variant="primary" onClick={() => void installSelected()}>
              {installing ? t("安装中") : t("安装模型")}
            </Button>
          )}
        </div>
      </footer>
      <ConfirmDialog
        busyLabel={t("替换中…")}
        confirmLabel={t("确认替换")}
        description={t("确认后，超分结果将替换素材库中的当前图片。原图只会在替换成功后删除。")}
        icon={<ImageUp size={18} />}
        isBusy={replacingSource}
        open={replaceConfirmOpen}
        title={t("替换原图？")}
        onCancel={() => setReplaceConfirmOpen(false)}
        onConfirm={() => void replaceSourceAndReturn()}
      />
    </div>
  );
}

/** JPEG 的落盘扩展名是 jpg，其余与格式同名。 */
function extensionForFormat(format: UpscaleOutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
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
