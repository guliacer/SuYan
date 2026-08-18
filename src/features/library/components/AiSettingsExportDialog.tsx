import { useState } from "react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

type AiSettingsExportDialogProps = {
  isBusy: boolean;
  onClose: () => void;
  onExport: (type: "plain" | "full", password?: string) => Promise<string | null>;
};

export function AiSettingsExportDialog({ isBusy, onClose, onExport }: AiSettingsExportDialogProps) {
  const [type, setType] = useState<"plain" | "full">("plain");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);

    if (type === "full") {
      if (!password) {
        setError("请输入备份密码。");
        return;
      }

      if (password !== passwordConfirm) {
        setError("两次输入的密码不一致。");
        return;
      }
    }

    const message = await onExport(type, type === "full" ? password : undefined);
    if (message) {
      setError(message);
    }
  }

  return (
    <AppDialog
      panelClassName="flex max-h-[min(720px,calc(100vh-64px))] w-full max-w-lg flex-col"
      titleId="ai-settings-export-title"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border bg-panel px-6 py-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" id="ai-settings-export-title">
            导出 AI 设置
          </h2>
          <p className="mt-1 text-sm text-muted">明文备份不含 API Key；加密备份可跨设备恢复并携带密钥。</p>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid gap-4 px-6 py-5">
        <div className="grid gap-2 text-sm font-medium text-muted">
          备份类型
          <div className="grid gap-2">
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
                <span className="block text-sm font-semibold text-foreground">普通导出（不含密钥）</span>
                <span className="mt-1 block text-xs text-muted">
                  保存供应商、模型与规则配置，不包含任何 API Key。
                </span>
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
                <span className="block text-sm font-semibold text-foreground">加密完整备份（含密钥）</span>
                <span className="mt-1 block text-xs text-muted">
                  使用密码加密，换机导入后无需重新填写 API Key。
                </span>
              </span>
            </label>
          </div>
        </div>

        {type === "full" ? (
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm font-medium text-muted">
              备份密码
              <TextField
                aria-label="备份密码"
                autoComplete="new-password"
                placeholder="至少 8 位，含字母与数字"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-muted">
              确认密码
              <TextField
                aria-label="确认备份密码"
                autoComplete="new-password"
                placeholder="再次输入备份密码"
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button disabled={isBusy} variant="primary" onClick={() => void handleExport()}>
            {isBusy ? "导出中…" : "选择保存位置"}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}