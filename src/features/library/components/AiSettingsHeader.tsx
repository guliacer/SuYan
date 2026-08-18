import { DialogCloseButton } from "@/components/ui/AppDialog";

type AiSettingsHeaderProps = {
  onClose: () => void;
};

export function AiSettingsHeader({ onClose }: AiSettingsHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold" id="ai-settings-title">
          模型设置
        </h2>
        <p className="mt-1 text-sm text-muted">管理自定义模型供应商，配置后可在聊天时选择使用。</p>
      </div>
      <DialogCloseButton onClick={onClose} />
    </header>
  );
}