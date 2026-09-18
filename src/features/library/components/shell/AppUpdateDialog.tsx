import { useState, type CSSProperties } from "react";
import { Check, CheckCircle2, Download, ExternalLink, LoaderCircle, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { RotatingLoadingTip } from "@/components/ui/RotatingLoadingTip";
import type { AppUpdateCheckData } from "@/types/suyanApi";
import { useLocale } from "@/components/LocaleProvider";

type AppUpdateDialogProps = {
  update: AppUpdateCheckData;
  onClose: () => void;
};

type UpgradeStage = "checked" | "opening" | "handed-off";

const updateTipIntervalRange: readonly [number, number] = [2800, 5200];

const stageDefinitions = [
  { id: "checked" as const, label: "检查更新" },
  { id: "opening" as const, label: "准备下载" },
  { id: "handed-off" as const, label: "交接安装" },
];

function getCompletedPercent(stage: UpgradeStage): number {
  return stage === "handed-off" ? 100 : 32;
}

function getCompletedStepCount(stage: UpgradeStage): number {
  return stage === "handed-off" ? 3 : 1;
}

function getActiveStepIndex(stage: UpgradeStage): number | null {
  return stage === "opening" ? 1 : null;
}

export function AppUpdateDialog({ update, onClose }: AppUpdateDialogProps) {
  const { t } = useLocale();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<UpgradeStage>("checked");
  const latestVersion = update.latestVersion ? `v${update.latestVersion}` : t("新版本");
  const completedPercent = getCompletedPercent(stage);
  const completedStepCount = getCompletedStepCount(stage);
  const activeStepIndex = getActiveStepIndex(stage);
  const isHandoffComplete = stage === "handed-off";
  const progressStyle = { "--upgrade-complete": `${completedPercent}%` } as CSSProperties;

  async function savePreference(patch: { automaticCheck?: boolean; ignoredVersion?: string | null }) {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const currentResult = await window.suyanApi.readAppUpdatePreferences();
      const current = currentResult.ok
        ? currentResult.data
        : { automaticCheck: true, ignoredVersion: null };
      const result = await window.suyanApi.saveAppUpdatePreferences({ ...current, ...patch });
      if (!result.ok) {
        setErrorMessage(result.error.message || t("保存更新提醒设置失败，请稍后重试。"));
        return false;
      }

      return true;
    } catch {
      setErrorMessage(t("保存更新提醒设置失败，请稍后重试。"));
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function openReleasePage() {
    if (!update.releaseUrl || isBusy || isHandoffComplete) {
      return;
    }

    setIsBusy(true);
    setStage("opening");
    setErrorMessage(null);
    try {
      const result = await window.suyanApi.openExternalUrl(update.releaseUrl);
      if (!result.ok) {
        setStage("checked");
        setErrorMessage(result.error.message || t("无法打开下载页面，请稍后重试。"));
        return;
      }
      setStage("handed-off");
    } catch {
      setStage("checked");
      setErrorMessage(t("无法打开下载页面，请稍后重试。"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <AppDialog
      overlayClassName="z-[70] px-4 py-8"
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="app-update-dialog-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            {isHandoffComplete ? <CheckCircle2 size={20} /> : <Download size={20} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="app-update-dialog-title">
              {isHandoffComplete ? t("升级页面已打开") : t("发现新版本")}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {isHandoffComplete ? t("下载与安装将在外部安装器中继续") : t("素言有新的正式版本可供下载")}
            </p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 overflow-y-auto px-5 py-5">
        <section className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">{t("版本更新")}</span>
            <span className="font-semibold text-primary">{latestVersion}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{t("当前版本")} v{update.currentVersion}</span>
            <span aria-hidden="true" className="text-primary">→</span>
            <span>{t("最新版本")} {latestVersion}</span>
          </div>
          {update.releaseName && update.releaseName !== latestVersion ? (
            <p className="break-words text-sm leading-6 text-muted">{update.releaseName}</p>
          ) : null}
          <p className="text-xs leading-5 text-muted">{t("更新前建议先备份软件目录下的 data 文件夹。")}</p>
        </section>

        <section className="grid gap-3 rounded-xl border border-border bg-panel p-4" aria-label={t("升级准备进度")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{t("升级准备进度")}</h3>
              <p className="mt-1 text-xs text-muted">
                {t("已完成 {completed} / {total} 个步骤", { completed: completedStepCount, total: stageDefinitions.length })}
              </p>
            </div>
            <span className="text-xs font-semibold text-primary">
              {isHandoffComplete ? t("已完成") : isBusy ? t("处理中...") : t("等待开始")}
            </span>
          </div>

          <div
            aria-label={t("升级准备进度")}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={completedPercent}
            className="upgrade-progress"
            role="progressbar"
            style={progressStyle}
          >
            <div className="upgrade-progress__complete" />
            {isBusy ? <div aria-hidden="true" className="upgrade-progress__activity" /> : null}
          </div>

          <div className="grid gap-2">
            {stageDefinitions.map((definition, index) => {
              const isComplete = index < completedStepCount;
              const isActive = index === activeStepIndex;
              return (
                <div className={`upgrade-step ${isComplete ? "upgrade-step--complete" : ""} ${isActive ? "upgrade-step--active" : ""}`.trim()} key={definition.id}>
                  <span className="upgrade-step__marker">
                    {isComplete ? <Check size={13} /> : isActive ? <LoaderCircle className="animate-spin" size={13} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{t(definition.label)}</span>
                    {isActive ? <span className="mt-0.5 block text-[11px] text-muted">{t("正在处理这一阶段")}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>

          {isBusy || isHandoffComplete ? (
            <RotatingLoadingTip intervalRangeMs={updateTipIntervalRange} kind="update" />
          ) : null}
          <p className="text-xs leading-5 text-muted">
            {isHandoffComplete ? t("下载页面已打开，后续安装由外部安装器完成。") : isBusy ? t("正在打开可信下载页面，请稍候。") : t("检查已完成，确认后再开始打开下载页面。")}
          </p>
        </section>

        {errorMessage ? (
          <p className="rounded-lg border border-danger/20 bg-danger-soft/40 px-3 py-2 text-sm leading-6 text-danger" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Button
            disabled={isBusy || (!isHandoffComplete && !update.releaseUrl)}
            icon={isHandoffComplete ? <CheckCircle2 size={16} /> : <ExternalLink size={16} />}
            onClick={() => {
              if (isHandoffComplete) {
                onClose();
                return;
              }
              void openReleasePage();
            }}
            variant="primary"
          >
            {isHandoffComplete ? t("关闭升级提示") : isBusy ? t("正在打开下载页面...") : t("前往下载并升级")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={isBusy} onClick={onClose} variant="secondary">
              {t("下次提醒")}
            </Button>
            <Button
              disabled={isBusy}
              onClick={() => {
                void savePreference({ ignoredVersion: update.latestVersion }).then((saved) => {
                  if (saved) onClose();
                });
              }}
              variant="ghost"
            >
              {t("忽略此版本")}
            </Button>
          </div>
          <button
            className="inline-flex items-center justify-center gap-1 py-1 text-xs text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            type="button"
            onClick={() => {
              void savePreference({ automaticCheck: false }).then((saved) => {
                if (saved) onClose();
              });
            }}
          >
            <X size={13} />
            {t("永久不提示更新")}
          </button>
        </div>
      </div>
    </AppDialog>
  );
}
