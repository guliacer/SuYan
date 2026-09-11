import { useState } from "react";
import { ExternalLink, ScrollText } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import type { LogExportFormat, LogExportLevel, LogExportRange } from "@/types/suyanApi";
import { useLocale } from "@/components/LocaleProvider";

export type LogExportSelection = {
  minLevel: LogExportLevel;
  range: LogExportRange;
  format: LogExportFormat;
};

type LogExportDialogProps = {
  activeAction: "save" | "feedback" | null;
  onClose: () => void;
  onExport: (options: LogExportSelection) => void;
  onFeedback: (options: LogExportSelection) => void;
};

export function LogExportDialog({
  activeAction,
  onClose,
  onExport,
  onFeedback,
}: LogExportDialogProps) {
  const { t } = useLocale();
  const [minLevel, setMinLevel] = useState<LogExportLevel>("ERROR");
  const [range, setRange] = useState<LogExportRange>("all");
  const [format, setFormat] = useState<LogExportFormat>("txt");
  const isExporting = activeAction !== null;
  const selection = { minLevel, range, format };

  return (
    <AppDialog
      overlayClassName="z-50 px-6 py-8"
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="log-export-dialog-title"
      onClose={() => {
        if (!isExporting) {
          onClose();
        }
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold" id="log-export-dialog-title">
            <ScrollText className="text-primary" size={18} />
            {t("导出应用日志")}
          </h2>
        </div>
        <DialogCloseButton
          onClick={() => {
            if (!isExporting) {
              onClose();
            }
          }}
        />
      </header>

      <div className="grid gap-4 overflow-y-auto px-5 py-4">
        <div className="rounded-xl border border-border bg-background p-3 text-sm leading-6 text-muted">
          {t("默认筛选错误日志。TXT 便于阅读，ZIP 便于反馈；点击反馈会自动生成 ZIP、打开 Issue，并选中文件供拖入附件。")}
        </div>

        <fieldset data-feature-guide="log-level-filter" className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">{t("日志级别")}</legend>
          <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-4">
            {(
              [
                ["ERROR", "错误及以上"],
                ["WARN", "警告及以上"],
                ["INFO", "信息及以上"],
                ["DEBUG", "全部调试"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  minLevel === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-panel text-muted hover:border-primary/40 hover:text-foreground"
                }`}
                disabled={isExporting}
                type="button"
                onClick={() => setMinLevel(value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset data-feature-guide="log-time-range" className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">{t("时间范围")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["today", "今天"],
                ["7d", "近 7 天"],
                ["all", "全部"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  range === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-panel text-muted hover:border-primary/40 hover:text-foreground"
                }`}
                disabled={isExporting}
                type="button"
                onClick={() => setRange(value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset data-feature-guide="log-export-format" className="grid gap-2">
          <legend className="text-sm font-semibold text-foreground">{t("导出格式")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["txt", "TXT 文本"],
                ["zip", "ZIP 日志包"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  format === value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-panel text-muted hover:border-primary/40 hover:text-foreground"
                }`}
                disabled={isExporting}
                type="button"
                onClick={() => setFormat(value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <footer data-feature-guide="log-export-actions" className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isExporting}
          type="button"
          variant="ghost"
          onClick={() => {
            if (!isExporting) {
              onClose();
            }
          }}
        >
          {t("取消")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isExporting}
          icon={<ScrollText size={14} />}
          type="button"
          variant="secondary"
          onClick={() => onExport(selection)}
        >
          {activeAction === "save" ? t("导出中...") : t("导出日志")}
        </Button>
        <Button
          className="min-h-8 px-2.5 py-1.5 text-xs"
          disabled={isExporting}
          icon={<ExternalLink size={14} />}
          type="button"
          variant="primary"
          onClick={() => onFeedback(selection)}
        >
          {activeAction === "feedback" ? t("准备反馈中...") : t("去 GitHub 反馈")}
        </Button>
      </footer>
    </AppDialog>
  );
}
