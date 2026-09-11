import { useState } from "react";
import { AlertCircle, Download, ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLibraryStore } from "../store/useLibraryStore";
import { useLocale } from "@/components/LocaleProvider";

type NsfwRuntimeInstallBannerProps = {
  message: string;
  onInstalled?: () => void;
};

/** 本地 NSFW 模块按需安装，模型不会随主安装包分发。 */
export function NsfwRuntimeInstallBanner({ message, onInstalled }: NsfwRuntimeInstallBannerProps) {
  const { t } = useLocale();
  const installModule = useLibraryStore((state) => state.installModule);
  const openDownloadPage = useLibraryStore((state) => state.openNsfwModuleDownloadPage);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isOpeningDownloadPage, setIsOpeningDownloadPage] = useState(false);
  const isActionBusy = isInstalling || isOpeningDownloadPage;

  async function install(source: "download" | "local") {
    if (isActionBusy) {
      return;
    }
    setIsInstalling(true);
    try {
      const ok = await installModule("nsfw-runtime", { source });
      if (ok) {
        onInstalled?.();
      }
    } finally {
      setIsInstalling(false);
    }
  }

  async function openPage() {
    if (isActionBusy) {
      return;
    }
    setIsOpeningDownloadPage(true);
    try {
      await openDownloadPage();
    } finally {
      setIsOpeningDownloadPage(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 shrink-0 text-warning" size={14} />
        <span>{message}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={isInstalling ? undefined : <Download size={13} />}
          variant="primary"
          onClick={() => void install("download")}
        >
          {isInstalling ? t("安装中…") : t("下载并安装")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={<FolderOpen size={13} />}
          variant="secondary"
          onClick={() => void install("local")}
        >
          {t("离线导入（三件套）")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isActionBusy}
          icon={<ExternalLink size={12} />}
          variant="secondary"
          onClick={() => void openPage()}
        >
          {isOpeningDownloadPage ? t("打开中…") : t("下载地址")}
        </Button>
      </div>
    </div>
  );
}
