import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAccountStore } from "../../account/store/useAccountStore";

type AiSettingsExportDialogProps = {
  isBusy: boolean;
  onClose: () => void;
  onExport: (type: "plain" | "full" | "account", password?: string) => Promise<string | null>;
};

export function AiSettingsExportDialog({ isBusy, onClose, onExport }: AiSettingsExportDialogProps) {
  const { t } = useLocale();
  const user = useAccountStore(state => state.user);
  const [type, setType] = useState<"plain" | "full" | "account">("plain");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isBusy || isExporting) return;
    setError(null);

    if (type === "full") {
      if (!password) {
        setError(t("请输入备份密码。"));
        return;
      }

      if (password !== passwordConfirm) {
        setError(t("两次输入的密码不一致。"));
        return;
      }
    }

    setIsExporting(true);
    try {
      const message = await onExport(type, type === "full" ? password : undefined);
      if (message) {
        setError(message);
      }
    } catch {
      setError(t("导出设置失败，请重试。"));
    } finally { setIsExporting(false); }
  }

  return (
    <AppDialog
      panelClassName="flex max-h-full w-full max-w-lg flex-col"
      titleId="ai-settings-export-title"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="ai-settings-export-title">
            {t("导出 AI 设置")}
          </h2>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 px-6 py-5">
        <div className="grid gap-2 text-sm font-medium text-muted">
          {t("备份类型")}
          <div className="grid gap-2">
            <label className={`flex items-start gap-3 rounded-xl border p-3 ${type === "account" ? "border-primary bg-primary-soft" : "border-border bg-panel"}`}>
              <input className="mt-1" type="radio" name="export-type" checked={type === "account"} disabled={!user || isExporting} onChange={() => setType("account")} />
              <span className="min-w-0"><span className="block text-sm font-semibold text-foreground">{t("账户验证加密备份（含密钥）")}</span>
                <span className="block text-xs leading-5 text-muted">{user ? t("绑定「{username}」，始终加密。仅同一账户联网验证后可导入，无需备份密码。", { username: user.username }) : t("请先登录账户。")}</span></span>
            </label>
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                type === "plain" ? "border-primary bg-primary-soft" : "border-border bg-panel"
              }`}
            >
              <input
                className="mt-1"
                checked={type === "plain"}
                name="export-type"
                type="radio"
                onChange={() => setType("plain")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t("普通导出（不含密钥）")}</span>
              </span>
            </label>
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                type === "full" ? "border-primary bg-primary-soft" : "border-border bg-panel"
              }`}
            >
              <input
                className="mt-1"
                checked={type === "full"}
                name="export-type"
                type="radio"
                onChange={() => setType("full")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t("加密完整备份（含密钥）")}</span>
              </span>
            </label>
          </div>
        </div>

        {type === "full" ? (
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm font-medium text-muted">
              {t("备份密码")}
              <TextField
                aria-label={t("备份密码")}
                autoComplete="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-muted">
              {t("确认密码")}
              <TextField
                aria-label={t("确认备份密码")}
                autoComplete="new-password"
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button className="min-h-8 px-2.5 py-1.5 text-xs" variant="ghost" onClick={onClose}>
            {t("取消")}
          </Button>
          <Button
            className="min-h-8 px-2.5 py-1.5 text-xs"
            disabled={isBusy || isExporting || (type === "account" && !user)}
            variant="primary"
            onClick={() => void handleExport()}
          >
            {isExporting ? t("选择位置并导出中…") : t("选择保存位置")}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
