import { useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import type { AppUpdateCheckData } from "@/types/suyanApi";
import { useLocale } from "@/components/LocaleProvider";

type AppUpdateDialogProps = {
  update: AppUpdateCheckData;
  onClose: () => void;
};

export function AppUpdateDialog({ update, onClose }: AppUpdateDialogProps) {
  const { t } = useLocale();
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestVersion = update.latestVersion ? `v${update.latestVersion}` : t("新版本");

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
    if (!update.releaseUrl || isBusy) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      const result = await window.suyanApi.openExternalUrl(update.releaseUrl);
      if (!result.ok) {
        setErrorMessage(result.error.message || t("无法打开下载页面，请稍后重试。"));
        return;
      }
      onClose();
    } catch {
      setErrorMessage(t("无法打开下载页面，请稍后重试。"));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <AppDialog
      overlayClassName="z-[70] px-4 py-8"
      panelClassName="flex max-h-full w-full max-w-md flex-col"
      titleId="app-update-dialog-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Download size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="app-update-dialog-title">{t("发现新版本")}</h2>
            <p className="mt-1 text-xs text-muted">{t("素言有新的正式版本可供下载")}</p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 px-5 py-5">
        <section className="grid gap-2 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">{t("当前版本")}</span>
            <span className="font-medium text-foreground">v{update.currentVersion}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">{t("最新版本")}</span>
            <span className="font-semibold text-primary">{latestVersion}</span>
          </div>
          {update.releaseName && update.releaseName !== latestVersion ? (
            <p className="break-words text-sm leading-6 text-muted">{update.releaseName}</p>
          ) : null}
          <p className="text-xs leading-5 text-muted">{t("更新前建议先备份软件目录下的 data 文件夹。")}</p>
        </section>

        {errorMessage ? (
          <p className="rounded-lg border border-danger/20 bg-danger-soft/40 px-3 py-2 text-sm leading-6 text-danger">
            {errorMessage}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Button
            disabled={isBusy || !update.releaseUrl}
            icon={<ExternalLink size={16} />}
            onClick={() => void openReleasePage()}
            variant="primary"
          >
            {t("前往下载并升级")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={isBusy}
              onClick={onClose}
              variant="secondary"
            >
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
