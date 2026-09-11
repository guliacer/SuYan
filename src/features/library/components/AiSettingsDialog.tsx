import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { useAiSettings } from "./useAiSettings";
import { AiSettingsHeader } from "./AiSettingsHeader";
import { AiConnectionSection } from "./AiConnectionSection";
import { AiRulesSection } from "./AiRulesSection";
import { AiSettingsExportDialog } from "./AiSettingsExportDialog";
import { AiSettingsImportDialog } from "./AiSettingsImportDialog";
import { getUiErrorMessage } from "../utils/uiMessages";
import type { AiSettingsImportPreview } from "../../../types/suyanApi";
import type { AiSettingsDialogProps } from "./aiSettingsDialogData";

export { moveItemBefore } from "./aiSettingsDialogData";

/** 编排组件：组装 Header + 连接区 + 规则区，并托管导入/导出对话框。
 * 全部设置状态与操作收敛在 useAiSettings；导入落地后暂停自动保存、
 * 重置内部 drafts、同步 store，再恢复自动保存。 */
export function AiSettingsDialog({
  isBusy,
  settings,
  onClose,
  onSave,
  onSaveAiRecognitionSourcePreferences,
  onTest,
  onListModels,
  onCopyApiKey,
  onReadApiKey,
  onNotify,
  onApplyImportedSettings,
}: AiSettingsDialogProps) {
  const { t } = useLocale();
  const api = useAiSettings({
    isBusy,
    settings,
    onClose,
    onSave,
    onSaveAiRecognitionSourcePreferences,
    onTest,
    onListModels,
    onCopyApiKey,
    onReadApiKey,
    onNotify,
  });

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  async function handleClose() {
    if (isClosing) {
      return;
    }

    setIsClosing(true);
    api.autoSave.pause();

    try {
      const flushed = await api.autoSave.flush();
      if (!flushed && api.canSaveSettings) {
        onNotify?.({ type: "error", text: t("模型配置尚未保存，请稍后重试。") });
        return;
      }

      onClose();
    } finally {
      api.autoSave.resume();
      setIsClosing(false);
    }
  }

  async function handleExport(type: "plain" | "full" | "account", password?: string): Promise<string | null> {
    api.autoSave.pause();
    let flushed: boolean;
    try {
      flushed = await api.autoSave.flush();
    } finally {
      api.autoSave.resume();
    }
    if (!flushed) return t("当前设置尚未保存，导出前自动保存失败，请重试。");

    // Only flush pauses autosave. Background export must not pause later edits/imports.
    setIsExportOpen(false);
    try {
      const result = await window.suyanApi.exportAiSettings({ type, password });

      if (!result.ok) {
        onNotify?.({ type: "error", text: getUiErrorMessage(result.error.code, result.error.message) });
        return getUiErrorMessage(result.error.code, result.error.message);
      }

      return null;
    } catch {
      onNotify?.({ type: "error", text: t("导出设置失败，请重试。") });
      return t("导出设置失败，请重试。");
    }
  }

  async function handlePickFile(password?: string): Promise<{ preview?: AiSettingsImportPreview; error?: string }> {
    api.autoSave.pause();

    try {
      const flushed = await api.autoSave.flush();
      if (!flushed) {
        return { error: t("当前设置尚未保存，导入前自动保存失败，请重试。") };
      }

      const result = await window.suyanApi.importAiSettingsPreview({ password });

      if (!result.ok) {
        return { error: getUiErrorMessage(result.error.code, result.error.message) };
      }

      return { preview: result.data };
    } finally {
      api.autoSave.resume();
    }
  }

  async function handleApply(token: string, mode: "merge" | "replace" | "add-new"): Promise<string | null> {
    api.autoSave.pause();

    try {
      const result = await window.suyanApi.importAiSettingsApply({ token, mode });

      if (!result.ok) {
        return getUiErrorMessage(result.error.code, result.error.message);
      }

      const nextSettings = result.data;
      api.resetDrafts(nextSettings);
      onApplyImportedSettings?.(nextSettings);
      setIsImportOpen(false);
      return null;
    } finally {
      api.autoSave.resume();
    }
  }

  return (
    <>
      <AppDialog panelClassName="flex max-h-full w-full max-w-[1180px] flex-col" titleId="ai-settings-title" onClose={() => void handleClose()}>
        <div className="flex flex-col gap-3 border-b border-border bg-panel px-3 py-3 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between min-[640px]:gap-4 min-[640px]:px-6 min-[640px]:py-5">
          <AiSettingsHeader title={t("模型设置")} />
          <div data-feature-guide="ai-settings-exchange" className="flex w-full shrink-0 items-center justify-end gap-2 min-[640px]:w-auto">
            <Button className="min-h-7 px-2 py-1 text-xs" icon={<Download size={14} />} variant="secondary" onClick={() => setIsExportOpen(true)}>
              {t("导出")}
            </Button>
            <Button className="min-h-7 px-2 py-1 text-xs" icon={<Upload size={14} />} variant="secondary" onClick={() => setIsImportOpen(true)}>
              {t("导入")}
            </Button>
            <DialogCloseButton onClick={() => void handleClose()} />
          </div>
        </div>

        <div
          ref={api.profileDetailScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-3 py-3 scroll-pb-4 min-[640px]:px-4 min-[640px]:py-4 min-[960px]:px-6 min-[960px]:py-5"
        >
          <section className="grid gap-4 pb-4">
            <AiConnectionSection api={api} />

            {api.selectedProfile ? <AiRulesSection api={api} /> : null}
          </section>
        </div>
      </AppDialog>

      {isExportOpen ? (
        <AiSettingsExportDialog
          isBusy={isBusy}
          onClose={() => setIsExportOpen(false)}
          onExport={handleExport}
        />
      ) : null}

      {isImportOpen ? (
        <AiSettingsImportDialog
          isBusy={isBusy}
          onClose={() => setIsImportOpen(false)}
          onPickFile={handlePickFile}
          onApply={handleApply}
        />
      ) : null}
    </>
  );
}
