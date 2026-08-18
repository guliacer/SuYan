import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
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

  async function handleExport(type: "plain" | "full", password?: string): Promise<string | null> {
    api.autoSave.pause();

    try {
      const flushed = await api.autoSave.flush();
      if (!flushed) {
        return "当前设置尚未保存，导出前自动保存失败，请重试。";
      }

      const result = await window.suyanApi.exportAiSettings({ type, password });

      if (!result.ok) {
        return getUiErrorMessage(result.error.code, result.error.message);
      }

      setIsExportOpen(false);
      return null;
    } finally {
      api.autoSave.resume();
    }
  }

  async function handlePickFile(password?: string): Promise<{ preview?: AiSettingsImportPreview; error?: string }> {
    api.autoSave.pause();

    try {
      const flushed = await api.autoSave.flush();
      if (!flushed) {
        return { error: "当前设置尚未保存，导入前自动保存失败，请重试。" };
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
      <AppDialog panelClassName="flex h-[min(720px,calc(100vh-64px))] w-full max-w-[1180px] flex-col" titleId="ai-settings-title" onClose={onClose}>
        <div className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-5">
          <AiSettingsHeader title="模型设置" description="管理自定义模型供应商，配置后可在聊天时选择使用。" />
          <div className="flex shrink-0 items-center gap-2">
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<Download size={15} />} variant="secondary" onClick={() => setIsExportOpen(true)}>
              导出备份
            </Button>
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<Upload size={15} />} variant="secondary" onClick={() => setIsImportOpen(true)}>
              导入备份
            </Button>
            <DialogCloseButton onClick={onClose} />
          </div>
        </div>

        <div
          ref={api.profileDetailScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-6 py-5 scroll-pb-6"
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