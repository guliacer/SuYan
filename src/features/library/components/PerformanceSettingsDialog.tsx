import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Cpu, LoaderCircle, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import {
  defaultAppAccelerationSettings,
  shouldUseHardwareAcceleration,
  type AppAccelerationSettings,
  type AppAccelerationStatus,
  type HardwareAccelerationMode,
} from "../types/appAcceleration";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";

type PerformanceSettingsDialogProps = {
  isBusy: boolean;
  /** 嵌入系统设置壳时不渲染 AppDialog 外框。 */
  embedded?: boolean;
  onClose?: () => void;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

const modeOptions: Array<{
  description: string;
  icon: ReactNode;
  label: string;
  value: HardwareAccelerationMode;
}> = [
  {
    value: "gpu-experimental",
    label: "GPU 加速（默认）",
    description: "启用 GPU 加速界面、图片和视频；崩溃会自动降级。",
    icon: <Zap size={17} />,
  },
  {
    value: "stable",
    label: "稳定模式",
    description: "使用软件渲染，兼容性更高。",
    icon: <ShieldCheck size={17} />,
  },
];

const gpuFeatureOrder = [
  "gpu_compositing",
  "rasterization",
  "oop_rasterization",
  "multiple_raster_threads",
  "video_decode",
  "webgl",
  "webgl2",
];

const gpuFeatureLabels: Record<string, string> = {
  gpu_compositing: "GPU 合成",
  multiple_raster_threads: "多线程栅格",
  oop_rasterization: "独立栅格",
  rasterization: "栅格化",
  video_decode: "视频解码",
  webgl: "WebGL",
  webgl2: "WebGL 2",
};

export function PerformanceSettingsDialog({
  isBusy,
  embedded = false,
  onClose,
  onNotify,
}: PerformanceSettingsDialogProps) {
  const { t } = useLocale();
  const [status, setStatus] = useState<AppAccelerationStatus | null>(null);
  const [draft, setDraft] = useState<AppAccelerationSettings>(defaultAppAccelerationSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    let isDisposed = false;

    void loadStatus();

    return () => {
      isDisposed = true;
    };

    async function loadStatus() {
      const result = await window.suyanApi.readAccelerationStatus();

      if (isDisposed) {
        return;
      }

      setIsLoading(false);

      if (!result.ok) {
        setFeedbackText(result.error.message);
        return;
      }

      setStatus(result.data);
      setDraft(result.data.settings);
    }
  }, []);

  useEffect(() => {
    const text = feedbackText.trim();

    if (!text) {
      return;
    }

    onNotify?.({
      text,
      type: resolveStatusFeedbackTone(text),
    });
  }, [feedbackText, onNotify]);

  const pendingRestart = status
    ? shouldUseHardwareAcceleration(draft) !== status.effectiveHardwareAcceleration
    : false;
  const isActionBusy = isBusy || isLoading || isSaving;
  const featureRows = useMemo(() => {
    const source = status?.gpuFeatureStatus ?? {};
    const orderedKeys = gpuFeatureOrder.filter((key) => key in source);
    const extraKeys = Object.keys(source)
      .filter((key) => !gpuFeatureOrder.includes(key))
      .sort();

    return [...orderedKeys, ...extraKeys.slice(0, 4)].map((key) => ({
      key,
      label: gpuFeatureLabels[key] ?? key,
      value: source[key],
    }));
  }, [status]);

  async function handleSave(nextDraft = draft) {
    if (isActionBusy) {
      return;
    }

    setIsSaving(true);
    setFeedbackText(t("正在保存启动加速设置..."));
    const result = await window.suyanApi.saveAccelerationSettings(nextDraft);
    setIsSaving(false);

    if (!result.ok) {
      setFeedbackText(result.error.message);
      return;
    }

    setStatus(result.data);
    setDraft(result.data.settings);

    if (result.data.safeMode && shouldUseHardwareAcceleration(result.data.settings)) {
      setFeedbackText(t("已保存；安全模式会继续关闭 GPU。"));
      return;
    }

    setFeedbackText(
      result.data.restartRequired
         ? t("已保存，重启后生效。")
         : t("已保存，当前会话已是该模式。"),
    );
  }

  async function handleReenableGpu() {
    if (isActionBusy) {
      return;
    }

    setIsSaving(true);
    setFeedbackText(t("正在重新启用 GPU..."));
    const result = await window.suyanApi.saveAccelerationSettings({
      ...draft,
      hardwareAccelerationMode: "gpu-experimental",
    });
    setIsSaving(false);

    if (!result.ok) {
      setFeedbackText(result.error.message);
      return;
    }

    setStatus(result.data);
    setDraft(result.data.settings);
    setFeedbackText(t("已重新启用 GPU，重启软件后生效。"));
  }

  const body = (
      <div data-feature-guide="system-preferences-panel-performance" className={`grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain ${embedded ? "px-1 py-1" : "px-5 py-5"}`}>
        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle size={16} className="animate-spin" />
            {t("正在读取启动加速状态...")}
          </div>
        ) : (
          <>
            <section className="grid gap-3 rounded-md border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("当前会话")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {status?.effectiveHardwareAcceleration ? t("硬件加速已启用") : t("硬件加速已关闭")}
                  </p>
                </div>
                <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                  {t(getModeLabel(status?.settings.hardwareAccelerationMode ?? draft.hardwareAccelerationMode))}
                </span>
              </div>

              {status?.autoDisabledByCrash ? (
                <div className="grid gap-2 rounded-md border border-primary bg-primary-soft px-3 py-2">
                  <p className="text-sm leading-6 text-foreground">
                    {t("GPU 多次崩溃，已降级为软件渲染。修复驱动后可重新启用。")}
                  </p>
                  <div>
                    <Button
                      className="min-h-8 px-2.5 py-1.5 text-xs"
                      disabled={isActionBusy}
                      icon={<Zap size={14} />}
                      variant="secondary"
                      onClick={() => void handleReenableGpu()}
                    >
                      {t("重新启用 GPU")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {pendingRestart || status?.restartRequired ? (
                <p className="rounded-md border border-primary bg-primary-soft px-3 py-2 text-sm text-foreground">
                  {t("重启后生效。")}
                </p>
              ) : null}
            </section>

            <section className="grid gap-3 rounded-md border border-border bg-background p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("加速模式")}</p>
              </div>

              <div className="grid gap-2 min-[720px]:grid-cols-2" role="radiogroup" aria-label={t("选择启动加速模式")}>
                {modeOptions.map((option) => {
                  const selected = draft.hardwareAccelerationMode === option.value;

                  return (
                    <button
                      aria-checked={selected}
                      className={`grid min-h-28 content-start gap-2 rounded-md border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                        selected
                          ? "border-primary bg-primary-soft text-foreground shadow-elevated"
                          : "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground"
                      }`}
                      key={option.value}
                      role="radio"
                      type="button"
                      disabled={isActionBusy}
                      onClick={() => {
                        const nextDraft = { ...draft, hardwareAccelerationMode: option.value };
                        setDraft(nextDraft);
                        void handleSave(nextDraft);
                      }}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background">
                            {option.icon}
                          </span>
                          <span className="truncate text-sm font-semibold">{t(option.label)}</span>
                        </span>
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                          }`}
                        >
                          {selected ? <Check size={12} /> : null}
                        </span>
                      </span>
                      <span className="text-xs leading-5">{t(option.description)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-3 rounded-md border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("GPU 功能状态")}</p>
                <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                  {t("当前会话")}
                </span>
              </div>

              {featureRows.length > 0 ? (
                <div className="grid gap-2 min-[720px]:grid-cols-2">
                  {featureRows.map((row) => (
                    <div
                      className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-panel px-3 py-2"
                      key={row.key}
                    >
                      <span className="truncate text-xs font-medium text-muted">{t(row.label)}</span>
                      <span className="shrink-0 text-xs font-semibold text-foreground">{t(formatGpuFeatureStatus(row.value))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">
                  {t("暂未读取到 GPU 功能状态。")}
                </p>
              )}
            </section>

            <section className="grid gap-2 rounded-md border border-border bg-background p-4">
              <div className="flex items-start gap-2">
                <RotateCcw size={16} className="mt-0.5 shrink-0 text-muted" />
                {null}
              </div>
            </section>
          </>
        )}

        {feedbackText ? (
          <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <AppDialog
      panelClassName="flex max-h-full w-full max-w-3xl flex-col"
      titleId="performance-settings-title"
      onClose={onClose ?? (() => undefined)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Cpu size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="performance-settings-title">
              {t("启动加速")}
            </h2>
          </div>
        </div>
        <DialogCloseButton onClick={() => onClose?.()} />
      </header>
      {body}
    </AppDialog>
  );
}

function getModeLabel(mode: HardwareAccelerationMode): string {
  if (mode === "gpu-experimental") {
    return "GPU 实验";
  }

  return "稳定";
}

function formatGpuFeatureStatus(value: string): string {
  if (value === "enabled") {
    return "已启用";
  }

  if (value === "disabled_software") {
    return "软件回退";
  }

  if (value.startsWith("disabled")) {
    return "已禁用";
  }

  return value;
}
