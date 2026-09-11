import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
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
  const { t } = useLocale();
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<AiSettingsImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [activeAction, setActiveAction] = useState<"pick" | "apply" | null>(null);
  const busy = isBusy || activeAction !== null;

  async function handlePickFile() {
    if (busy) return;
    setActiveAction("pick");
    setError(null);
    try {
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
    } catch {
      setError(t("读取备份失败，请重新选择文件。"));
    } finally { setActiveAction(null); }
  }

  async function handleApply() {
    if (!preview || busy) {
      return;
    }

    setError(null);
    setActiveAction("apply");
    try {
      const message = await onApply(preview.token, mode);

      if (message) {
        setError(message);
      }
    } catch {
      setError(t("导入设置失败，请重试。"));
    } finally { setActiveAction(null); }
  }

  return (
    <AppDialog
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="ai-settings-import-title"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="ai-settings-import-title">
            {t("导入 AI 设置备份")}
          </h2>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 px-6 py-5">
        <p className="text-xs leading-5 text-muted">{t("账户加密备份无需填写密码，但必须联网并登录导出时的同一账户；普通备份无需密码。")}</p>
        <label className="grid gap-2 text-sm font-medium text-muted">
          {t("备份密码")}
          <TextField
            aria-label={t("备份密码")}
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {!preview ? (
          <div className="flex justify-end gap-2">
            <Button className="min-h-8 px-2.5 py-1.5 text-xs" variant="ghost" onClick={onClose}>
              {t("取消")}
            </Button>
            <Button
              className="min-h-8 px-2.5 py-1.5 text-xs"
              disabled={busy}
              variant="primary"
              onClick={() => void handlePickFile()}
            >
              {activeAction === "pick" ? t("选择并读取中…") : t("选择备份文件")}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 rounded-xl border border-border bg-panel p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("文件")}</span>
                <span className="truncate font-medium text-foreground">{preview.fileName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("格式版本")}</span>
                <span className="font-medium text-foreground">{preview.formatVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("供应商")}</span>
                <span className="font-medium text-foreground">{t("{count} 个（新增 {newCount} 个）", { count: preview.providerCount, newCount: preview.newProviderCount })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("模型")}</span>
                <span className="font-medium text-foreground">{t("{count} 个", { count: preview.modelCount })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("含密钥的供应商")}</span>
                <span className="font-medium text-foreground">{preview.hasApiKeyProfiles ? t("是") : t("否")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t("功能偏好")}</span>
                <span className="font-medium text-foreground">{t("{count} 项", { count: preview.actionPreferencesCount })}</span>
              </div>
            </div>

            <div className="grid gap-2 text-sm font-medium text-muted">
              {t("导入方式")}
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
                      <span className="block text-sm font-semibold text-foreground">{t(modeLabels[value])}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error ? <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button className="min-h-8 px-2.5 py-1.5 text-xs" disabled={busy} variant="ghost" onClick={() => setPreview(null)}>
                {t("重新选择")}
              </Button>
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                disabled={busy}
                variant="primary"
                onClick={() => {
                  if (mode === "replace") {
                    setConfirmingReplace(true);
                  } else {
                    void handleApply();
                  }
                }}
              >
                {activeAction === "apply" ? t("导入中…") : t("开始导入")}
              </Button>
            </div>
          </>
        )}
      </div>

      {error && !preview ? <p role="alert" className="px-6 pb-4 text-xs text-danger">{error}</p> : null}

      {confirmingReplace && preview ? (
        <ConfirmBubble
          confirmLabel={t("确认替换")}
          description={t("当前所有 AI 配置将被替换为导入文件中的配置，此操作不可撤销。")}
          isBusy={busy}
          busyLabel={activeAction === "apply" ? t("正在替换…") : t("请等待当前操作完成")}
          placement="above"
          title={t("完全替换现有配置？")}
          onCancel={() => setConfirmingReplace(false)}
          onConfirm={() => void handleApply()}
        />
      ) : null}
    </AppDialog>
  );
}
