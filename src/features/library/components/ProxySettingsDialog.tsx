import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search, Wifi, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type { ProxyDetectionData, ProxyMode, ProxySettings } from "../types/proxy";
import {
  getProxySettingsValidationError,
  normalizeProxySettings,
} from "../types/proxy";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";

type ProxySettingsDialogProps = {
  isBusy: boolean;
  settings: ProxySettings;
  onClose: () => void;
  onDetect: () => Promise<ProxyDetectionData | null>;
  onSave: (settings: ProxySettings) => Promise<boolean>;
  onTest: (settings: ProxySettings) => Promise<boolean>;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

const proxyModeOptions: Array<{
  description: string;
  label: string;
  value: ProxyMode;
}> = [
  {
    value: "system",
    label: "系统代理",
    description: "跟随系统代理，适合多数情况。",
  },
  {
    value: "direct",
    label: "不使用代理",
    description: "网页解析和远程下载直接连接。",
  },
  {
    value: "custom",
    label: "自定义代理",
    description: "使用 HTTP、HTTPS 或 Socks 代理。",
  },
];

export function ProxySettingsDialog({
  isBusy,
  settings,
  onClose,
  onDetect,
  onSave,
  onTest,
  onNotify,
}: ProxySettingsDialogProps) {
  const [draft, setDraft] = useState<ProxySettings>(() => settings);
  const [feedbackText, setFeedbackText] = useState("");
  const [detection, setDetection] = useState<ProxyDetectionData | null>(null);
  const payload = useMemo(() => normalizeProxySettings(draft), [draft]);
  const validationError = useMemo(() => getProxySettingsValidationError(payload), [payload]);

  useEffect(() => {
    const text = feedbackText.trim();

    if (!text) {
      return;
    }

    onNotify?.({
      text,
      type: resolveStatusFeedbackTone(text),
    });
  }, [feedbackText, onNotify]);

  useEffect(() => {
    setDraft(settings);
    setFeedbackText("");
    setDetection(null);
  }, [settings]);

  async function handleDetect() {
    setFeedbackText("正在检测系统和本机代理...");
    const detectedProxy = await onDetect();

    if (!detectedProxy) {
      setFeedbackText("自动检测失败，请稍后重试。");
      return;
    }

    setDetection(detectedProxy);
    setDraft(detectedProxy.settings);
    setFeedbackText(
      detectedProxy.detected
        ? `${detectedProxy.summary} 已自动填入，保存后生效。`
        : detectedProxy.summary,
    );
  }

  async function handleSave() {
    if (validationError) {
      setFeedbackText(validationError);
      return;
    }

    setFeedbackText("正在保存网络代理...");
    const isSaved = await onSave(payload);
    setFeedbackText(isSaved ? "网络代理已保存并应用。" : "网络代理保存失败。");
  }

  async function handleTest() {
    if (validationError) {
      setFeedbackText(validationError);
      return;
    }

    setFeedbackText("正在测试代理连接...");
    const isConnected = await onTest(payload);

    setFeedbackText(isConnected ? "代理连接测试成功。" : "代理连接测试失败。");
  }

  return (
    <AppDialog panelClassName="flex max-h-[92vh] w-full max-w-3xl flex-col" titleId="proxy-settings-title" onClose={onClose}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Wifi size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="proxy-settings-title">
              网络代理
            </h2>
            <p className="mt-1 text-sm text-muted">用于网页解析和远程下载</p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-5 py-5">
        <section className="grid gap-3 rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">连接方式</p>
              <p className="mt-1 text-xs leading-5 text-muted">影响分享链接解析、网页抓取和远程下载。</p>
            </div>
            <Button
              className="min-h-9 px-2.5 py-1.5 text-xs"
              disabled={isBusy}
              icon={<Search size={14} />}
              onClick={() => void handleDetect()}
            >
              自动检测
            </Button>
          </div>

          <div className="grid gap-2 min-[720px]:grid-cols-3" role="radiogroup" aria-label="选择代理模式">
            {proxyModeOptions.map((option) => {
              const selected = draft.mode === option.value;

              return (
                <button
                  aria-checked={selected}
                  className={`grid min-h-28 content-start gap-2 rounded-md border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                    selected
                      ? "border-primary bg-primary-soft text-foreground shadow-elevated"
                      : "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground"
                  }`}
                  key={option.value}
                  role="radio"
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({ ...current, mode: option.value }));
                    setFeedbackText("");
                  }}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{option.label}</span>
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                      }`}
                    >
                      {selected ? <Check size={12} /> : null}
                    </span>
                  </span>
                  <span className="text-xs leading-5">{option.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3 rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">自定义代理</p>
              <p className="mt-1 text-xs leading-5 text-muted">选择自定义后填写本机端口或局域网地址。</p>
            </div>
            <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
              {getProxyModeLabel(draft.mode)}
            </span>
          </div>

          <label className="grid gap-2 text-xs font-medium text-muted">
            代理地址
            <TextField
              disabled={draft.mode !== "custom" || isBusy}
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:7890"
              value={draft.server}
              onChange={(event) => {
                setDraft((current) => ({ ...current, server: event.target.value }));
                setFeedbackText("");
              }}
            />
          </label>

          <label className="grid gap-2 text-xs font-medium text-muted">
            绕过地址
            <TextField
              disabled={draft.mode !== "custom" || isBusy}
              placeholder="localhost,127.0.0.1,<local>"
              value={draft.bypassRules}
              onChange={(event) => {
                setDraft((current) => ({ ...current, bypassRules: event.target.value }));
                setFeedbackText("");
              }}
            />
          </label>

          {validationError ? (
            <p className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
              {validationError}
            </p>
          ) : (
            <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">
              保存后立即应用；进行中的下载可能需重试。
            </p>
          )}
        </section>

        {detection ? (
          <section className="grid gap-2 rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">检测结果</p>
              <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                {getDetectionSourceLabel(detection.source)}
              </span>
            </div>
            <p className="text-sm leading-6 text-muted">{detection.summary}</p>
            <div className="grid gap-1 text-xs text-muted">
              <p>
                系统代理：
                {detection.systemProxy.enabled || detection.systemProxy.autoConfigUrl || detection.systemProxy.autoDetect
                  ? "已发现配置"
                  : "未启用"}
              </p>
              <p>
                运行中的代理软件：
                {detection.processes.length > 0
                  ? detection.processes.map((process) => `${process.name}${formatProxyPorts(process.ports)}`).join("、")
                  : "未发现常见代理软件"}
              </p>
            </div>
          </section>
        ) : null}

        {feedbackText ? (
          <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button icon={<X size={16} />} variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={isBusy || Boolean(validationError)}
          icon={<RefreshCw size={16} />}
          onClick={() => void handleTest()}
        >
          测试连接
        </Button>
        <Button
          disabled={isBusy || Boolean(validationError)}
          icon={<Check size={16} />}
          variant="primary"
          onClick={() => void handleSave()}
        >
          保存设置
        </Button>
      </footer>
    </AppDialog>
  );
}

function getProxyModeLabel(mode: ProxyMode): string {
  if (mode === "direct") {
    return "直连";
  }

  if (mode === "custom") {
    return "自定义";
  }

  return "系统代理";
}

function getDetectionSourceLabel(source: ProxyDetectionData["source"]): string {
  if (source === "windows-system") {
    return "系统设置";
  }

  if (source === "running-process") {
    return "代理软件";
  }

  return "未检测到";
}

function formatProxyPorts(ports: readonly number[]): string {
  if (ports.length === 0) {
    return "";
  }

  return `:${ports.join("/")}`;
}
