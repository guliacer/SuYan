import { useState } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLibraryStore } from "../store/useLibraryStore";
import { useLocale } from "@/components/LocaleProvider";

type VideoRuntimeInstallBannerProps = {
  message: string;
  /** 是否显示警告图标（详情页用）。 */
  showIcon?: boolean;
  className?: string;
  onInstalled?: () => void;
};

/**
 * 视频依赖（FFmpeg）缺失时的统一安装入口：下载安装 + 离线导入。
 * PromptDetailDialog / VideoCompressPanel 共用，避免按钮文案与样式分叉。
 */
export function VideoRuntimeInstallBanner({
  message,
  showIcon = false,
  className = "",
  onInstalled,
}: VideoRuntimeInstallBannerProps) {
  const { t } = useLocale();
  const installModule = useLibraryStore((state) => state.installModule);
  const openFfmpegComponentDownloadPage = useLibraryStore(
    (state) => state.openFfmpegComponentDownloadPage,
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const [isOpeningDownloadPage, setIsOpeningDownloadPage] = useState(false);
  const isActionBusy = isInstalling || isOpeningDownloadPage;

  async function install(source: "download" | "local" = "download") {
    if (isActionBusy) {
      return;
    }
    setIsInstalling(true);
    try {
      const ok = await installModule("video-runtime", { source });
      if (ok) {
        onInstalled?.();
      }
    } finally {
      setIsInstalling(false);
    }
  }

  async function openDownloadPage() {
    if (isActionBusy) {
      return;
    }
    setIsOpeningDownloadPage(true);
    try {
      await openFfmpegComponentDownloadPage();
    } finally {
      setIsOpeningDownloadPage(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-2">
        {showIcon ? <AlertCircle size={14} className="shrink-0 text-warning" /> : null}
        <span>{message}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={isInstalling ? undefined : undefined}
          variant="primary"
          onClick={() => void install("download")}
        >
          {isInstalling ? t("安装中…") : t("下载并安装（FFmpeg）")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          variant="secondary"
          onClick={() => void install("local")}
        >
          {t("离线导入")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={<ExternalLink size={12} />}
          variant="secondary"
          onClick={() => void openDownloadPage()}
        >
          {isOpeningDownloadPage ? t("打开中…") : t("下载地址")}
        </Button>
      </div>
    </div>
  );
}
