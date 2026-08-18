import { AppDialog } from "@/components/ui/AppDialog";
import { useAiSettings } from "./useAiSettings";
import { AiSettingsHeader } from "./AiSettingsHeader";
import { AiConnectionSection } from "./AiConnectionSection";
import { AiRulesSection } from "./AiRulesSection";
import type { AiSettingsDialogProps } from "./aiSettingsDialogData";

export { moveItemBefore } from "./aiSettingsDialogData";

/** 编排组件：只负责组装 Header + 连接区 + 规则区。全部状态与操作
 * 收敛在 useAiSettings，连接/规则两区各自消费同一份 hook 返回值。 */
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

  return (
    <AppDialog panelClassName="flex h-[min(720px,calc(100vh-64px))] w-full max-w-[1180px] flex-col" titleId="ai-settings-title" onClose={onClose}>
      <AiSettingsHeader onClose={onClose} />

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
  );
}