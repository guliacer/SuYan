import { useState } from "react";
import type { AiSettingsImportPreview } from "../../../types/suyanApi";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { TextField } from "@/components/ui/TextField";

type ImportMode = "merge" | "replace" | "add-new";

type AiSettingsImportDialogProps = {
  isBusy: boolean;
  onClose: () => void;
  onPickFile: (password?: string) => Promise<{ preview?: AiSettingsImportPreview; error?: string }>;
  onApply: (token: string, mode: ImportMode) => Promise<string | null>;
};

const modeLabels: Record<ImportMode, string> = {
  merge: "合并（默认）",
  replace: "完全替换",
  "add-new": "仅新增",
};

export function AiSettingsImportDialog({ isBusy, onClose, onPickFile, onApply }: AiSettingsImportDialogProps) {
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<AiSettingsImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  async function handlePickFile() {
    setError(null);
    const result = await onPickFile(password || undefined);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.preview) {
      setPreview(result.preview);
      setMode("merge");
      setConfirmingReplace(false);
    }
  }

  async function handleApply() {
    if (!preview) {
      return;
    }

    setError(null);
    const message = await onApply(preview.token, mode);

    if (message) {
      setError(message);
    }
  }

  return (
    <AppDialog
      panelClassName="flex max-h-[min(720px,calc(100vh-64px))] w-full max-w-lg flex-col"
      titleId="ai-settings-import-title"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="ai-settings-import-title">
            导入 AI 设置备份
          </h2>
          <p className="mt-1 text-sm text-muted">选择素言导出的备份文件，先预览再落地导入。</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 px-6 py-5">
        <label className="grid gap-2 text-sm font-medium text-muted">
          备份密码
          <TextField
            aria-label="备份密码"
            autoComplete="current-password"
            placeholder="加密备份需要密码；明文备份可留空"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {!preview ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button disabled={isBusy} variant="primary" onClick={() => void handlePickFile()}>
              {isBusy ? "读取中…" : "选择备份文件"}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-xl border border-border bg-panel p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">文件</span>
                <span className="truncate font-medium text-foreground">{preview.fileName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">格式版本</span>
                <span className="font-medium text-foreground">{preview.formatVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">供应商</span>
                <span className="font-medium text-foreground">{preview.providerCount} 个（新增 {preview.newProviderCount} 个）</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">模型</span>
                <span className="font-medium text-foreground">{preview.modelCount} 个</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">含密钥的供应商</span>
                <span className="font-medium text-foreground">{preview.hasApiKeyProfiles ? "是" : "否"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">功能偏好</span>
                <span className="font-medium text-foreground">{preview.actionPreferencesCount} 项</span>
              </div>
            </div>

            <div className="grid gap-2 text-sm font-medium text-muted">
              导入方式
              <div className="grid gap-2">
                {(["merge", "add-new", "replace"] as const).map((value) => (
                  <label
                    className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                      mode === value ? "border-primary bg-primary-soft" : "border-border bg-panel"
                    }`}
                    key={value}
                  >
                    <input
                      className="mt-1"
                      checked={mode === value}
                      name="import-mode"
                      type="radio"
                      onChange={() => setMode(value)}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{modeLabels[value]}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {value === "merge"
                          ? "同供应商用备份覆盖，新供应商完整复制，保留未冲突的现有配置。"
                          : value === "add-new"
                            ? "只导入当前没有的新供应商，不改变规则与偏好。"
                            : "用备份完全替换现有配置，导入前需二次确认。"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error ? <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                重新选择
              </Button>
              <Button disabled={isBusy} variant="primary" onClick={() => {
                if (mode === "replace") {
                  setConfirmingReplace(true);
                } else {
                  void handleApply();
                }
              }}>
                {isBusy ? "导入中…" : "开始导入"}
              </Button>
            </div>
          </>
        )}
      </div>

      {confirmingReplace && preview ? (
        <ConfirmBubble
          confirmLabel="确认替换"
          description="完全替换将清空现有 AI 配置并用备份取代，此操作不可撤销。"
          isBusy={isBusy}
          placement="above"
          title="完全替换现有配置？"
          onCancel={() => setConfirmingReplace(false)}
          onConfirm={() => void handleApply()}
        />
      ) : null}
    </AppDialog>
  );
}