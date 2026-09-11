import { useEffect, useState } from "react";
import { CircleHelp, ExternalLink, FolderOpen, RefreshCw } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import type { AppUpdateCheckData, AppUpdatePreferences } from "@/types/suyanApi";
import { appVersion, suyanGithubReleasesUrl } from "../../appVersion";
import { useLocale } from "@/components/LocaleProvider";

type AboutDialogProps = {
  onClose: () => void;
  onReplayFeatureGuides?: () => void;
  onUpdateAvailable?: (update: AppUpdateCheckData) => void;
};

export function AboutDialog({ onClose, onReplayFeatureGuides, onUpdateAvailable }: AboutDialogProps) {
  const { t } = useLocale();
  const [isReleaseNotesVisible, setIsReleaseNotesVisible] = useState(true);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<AppUpdateCheckData | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [updatePreferences, setUpdatePreferences] = useState<AppUpdatePreferences | null>(null);
  const [isRestoringUpdateChecks, setIsRestoringUpdateChecks] = useState(false);
  const displayedVersion = updateCheckResult?.currentVersion ?? appVersion;
  const updateStatusClassName =
    updateCheckResult?.status === "update_available"
      ? "text-primary"
      : updateCheckResult?.status === "network_error"
        ? "text-danger"
        : "text-muted";
  const updatePageLabel = updateCheckResult?.status === "update_available" ? t("前往下载") : t("打开发布页");
  const isUpdateAvailable = updateCheckResult?.status === "update_available";

  useEffect(() => {
    let canceled = false;
    void window.suyanApi.readAppUpdatePreferences().then((result) => {
      if (!canceled && result.ok) {
        setUpdatePreferences(result.data);
      }
    });

    return () => {
      canceled = true;
    };
  }, []);

  const handleCheckUpdates = async () => {
    if (isCheckingUpdates) {
      return;
    }

    setIsCheckingUpdates(true);
    setUpdateStatus(t("正在连接 GitHub Releases..."));

    try {
      const result = await window.suyanApi.checkForUpdates();
      if (result.ok) {
        setUpdateCheckResult(result.data);
        setUpdateStatus(result.data.message);
        if (result.data.status === "update_available") {
          onUpdateAvailable?.(result.data);
        }
      } else {
        setUpdateCheckResult(null);
        setUpdateStatus(result.error.message);
      }
    } catch {
      setUpdateCheckResult(null);
      setUpdateStatus(t("检查更新失败，请稍后重试。"));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleRestoreUpdateChecks = async () => {
    if (isRestoringUpdateChecks) {
      return;
    }

    setIsRestoringUpdateChecks(true);
    try {
      const current = updatePreferences ?? { automaticCheck: true, ignoredVersion: null };
      const result = await window.suyanApi.saveAppUpdatePreferences({
        ...current,
        automaticCheck: true,
        ignoredVersion: null,
      });
      if (result.ok) {
        setUpdatePreferences(result.data);
        setUpdateStatus(t("已恢复自动检查更新。"));
      } else {
        setUpdateStatus(result.error.message);
      }
    } catch {
      setUpdateStatus(t("恢复自动检查失败，请稍后重试。"));
    } finally {
      setIsRestoringUpdateChecks(false);
    }
  };

  const handleOpenUpdatePage = async () => {
    const result = await window.suyanApi.openExternalUrl(updateCheckResult?.releaseUrl ?? suyanGithubReleasesUrl);
    if (!result.ok) {
      setUpdateStatus(result.error.message);
    }
  };

  const handleOpenDataDirectory = async () => {
    setBackupStatus(null);

    try {
      const result = await window.suyanApi.openDataDirectory();
      if (!result.ok) {
        setBackupStatus(result.error.message);
      }
    } catch {
      setBackupStatus(t("无法打开数据目录，请手动定位软件安装目录下的 data 文件夹。"));
    }
  };

  return (
    <AppDialog
      overlayClassName="z-40 px-6 py-8"
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="about-dialog-title"
      onClose={onClose}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="about-dialog-title">
            {t("关于素言")}
          </h2>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 overflow-y-auto px-5 py-4">
        <section data-feature-guide="about-version" className="grid gap-2 rounded-xl border border-border bg-background p-4">
          <div className="grid gap-2 text-sm">
            <InfoRow label={t("软件名称")} value={t("素言")} />
            <InfoRow label={t("版本")} value={displayedVersion} />
            <InfoRow label={t("软件描述")} value={t("本地 AI 提示词与图像素材管理工具")} />
          </div>
        </section>

        <section data-feature-guide="about-features" className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t("软件功能")}</h3>
            <button
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
              type="button"
              onClick={() => setIsReleaseNotesVisible((current) => !current)}
            >
              {isReleaseNotesVisible ? t("收起") : t("查看")}
            </button>
          </div>
          {isReleaseNotesVisible ? (
            <ul className="grid gap-2 text-sm leading-6 text-muted">
              <li>{t("本地管理提示词、图片与视频效果图。")}</li>
              <li>{t("支持文件、剪贴板、Word 文档与网页导入。")}</li>
              <li>{t("分类、标签和 NSFW 分级整理。")}</li>
              <li>{t("AI 分析、优化、翻译与图片反推提示词。")}</li>
              <li>{t("批量压缩、重复扫描、启动图库和日志反馈。")}</li>
            </ul>
          ) : null}
          {onReplayFeatureGuides ? (
            <Button
              className="w-fit min-h-8 px-2.5 py-1.5 text-xs"
              icon={<CircleHelp size={14} />}
              onClick={onReplayFeatureGuides}
              variant="ghost"
            >
              {t("重新查看功能引导")}
            </Button>
          ) : null}
        </section>

        <section data-feature-guide="about-update" className="grid gap-3 rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">{t("检查更新")}</h3>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              className="min-h-8 w-fit px-2.5 py-1.5 text-xs"
              disabled={isCheckingUpdates}
              icon={<RefreshCw className={isCheckingUpdates ? "animate-spin" : ""} size={14} />}
              onClick={() => {
                void handleCheckUpdates();
              }}
            >
              {isCheckingUpdates ? t("检查中...") : t("检查更新")}
            </Button>
            <Button
              className="min-h-8 w-fit px-2.5 py-1.5 text-xs"
              icon={<ExternalLink size={14} />}
              onClick={() => {
                void handleOpenUpdatePage();
              }}
              variant={updateCheckResult?.status === "update_available" ? "primary" : "secondary"}
            >
              {updatePageLabel}
            </Button>
          </div>
          {updateStatus ? (
            <p className={`text-center text-sm leading-6 ${updateStatusClassName}`}>{updateStatus}</p>
          ) : null}
          {updatePreferences && !updatePreferences.automaticCheck ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 py-2">
              <span className="text-xs text-muted">{t("自动检查更新已关闭")}</span>
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                disabled={isRestoringUpdateChecks}
                onClick={() => void handleRestoreUpdateChecks()}
                variant="ghost"
              >
                {isRestoringUpdateChecks ? t("恢复中...") : t("恢复自动检查")}
              </Button>
            </div>
          ) : null}
          {isUpdateAvailable ? (
            <div className="grid gap-2 rounded-xl border border-danger/20 bg-danger-soft/40 p-3">
              <p className="text-sm font-semibold text-danger">{t("升级前请先备份数据")}</p>
              <Button
                className="min-h-8 w-fit px-2.5 py-1.5 text-xs"
                icon={<FolderOpen size={14} />}
                onClick={() => {
                  void handleOpenDataDirectory();
                }}
                variant="secondary"
              >
                {t("打开数据目录")}
              </Button>
              {backupStatus ? <p className="text-sm leading-6 text-danger">{backupStatus}</p> : null}
            </div>
          ) : null}
        </section>
      </div>
    </AppDialog>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate text-foreground">{value}</span>
    </div>
  );
}
