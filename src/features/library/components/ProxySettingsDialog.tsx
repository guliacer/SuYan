import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search, Wifi } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
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
import { useAutoSave } from "../hooks/useAutoSave";

type ProxySettingsDialogProps = {
  isBusy: boolean;
  settings: ProxySettings;
  /** 嵌入系统设置壳时不渲染 AppDialog 外框。 */
  embedded?: boolean;
  onClose?: () => void;
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
  embedded = false,
  onClose,
  onDetect,
  onSave,
  onTest,
  onNotify,
}: ProxySettingsDialogProps) {
  const { t } = useLocale();
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

  async function handleDetect() {
    setFeedbackText(t("正在检测系统和本机代理..."));
    const detectedProxy = await onDetect();

    if (!detectedProxy) {
      setFeedbackText(t("自动检测失败，请稍后重试。"));
      return;
    }

    setDetection(detectedProxy);
    setDraft(detectedProxy.settings);
    setFeedbackText(
      detectedProxy.detected
        ? `${detectedProxy.summary} 已自动填入，正在应用。`
        : detectedProxy.summary,
    );
  }

  useAutoSave({
    enabled: !validationError,
    isBusy,
    onError: setFeedbackText,
    onSave,
    value: payload,
  });

  async function handleTest() {
    if (validationError) {
      setFeedbackText(validationError);
      return;
    }

    setFeedbackText(t("正在测试代理连接..."));
    const isConnected = await onTest(payload);

    setFeedbackText(isConnected ? t("代理连接测试成功。") : t("代理连接测试失败。"));
  }

  const body = (
      <div data-feature-guide="system-preferences-panel-proxy" className={`grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain ${embedded ? "px-1 py-1" : "px-5 py-5"}`}>
        <section className="grid gap-3 rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("连接方式")}</p>
            </div>
            <Button
              className="min-h-9 px-2.5 py-1.5 text-xs"
              disabled={isBusy}
              icon={<Search size={14} />}
              onClick={() => void handleDetect()}
            >
              {t("自动检测")}
            </Button>
            <Button
              className="min-h-9 px-2.5 py-1.5 text-xs"
              disabled={isBusy || Boolean(validationError)}
              icon={<RefreshCw size={14} />}
              onClick={() => void handleTest()}
            >
              {t("测试连接")}
            </Button>
          </div>

          <div className="grid gap-2 min-[720px]:grid-cols-3" role="radiogroup" aria-label={t("选择代理模式")}>
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
                    <span className="truncate text-sm font-semibold">{t(option.label)}</span>
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                      }`}
                    >
                      {selected ? <Check size={12} /> : null}
                    </span>
                  </span>
                  <span className="text-xs leading-5">{t(option.description)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-3 rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("自定义代理")}</p>
            </div>
            <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
              {t(getProxyModeLabel(draft.mode))}
            </span>
          </div>

          <label className="grid gap-2 text-xs font-medium text-muted">
            {t("代理地址")}
            <TextField
              disabled={draft.mode !== "custom" || isBusy}
              placeholder={t("http://127.0.0.1:7890 或 socks5://127.0.0.1:7890")}
              value={draft.server}
              onChange={(event) => {
                setDraft((current) => ({ ...current, server: event.target.value }));
                setFeedbackText("");
              }}
            />
          </label>

          <label className="grid gap-2 text-xs font-medium text-muted">
            {t("绕过地址")}
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
              {t(validationError)}
            </p>
          ) : null}
        </section>

        {detection ? (
          <section className="grid gap-2 rounded-md border border-border bg-background p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{t("检测结果")}</p>
              <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                {t(getDetectionSourceLabel(detection.source))}
              </span>
            </div>
            <p className="text-sm leading-6 text-muted">{detection.summary}</p>
            <div className="grid gap-1 text-xs text-muted">
              <p>
                {t("系统代理：")}
                {detection.systemProxy.enabled || detection.systemProxy.autoConfigUrl || detection.systemProxy.autoDetect
                  ? t("已发现配置")
                  : t("未启用")}
              </p>
              <p>
                {t("运行中的代理软件：")}
                {detection.processes.length > 0
                  ? detection.processes.map((process) => `${process.name}${formatProxyPorts(process.ports)}`).join("、")
                  : t("未发现常见代理软件")}
              </p>
            </div>
          </section>
        ) : null}

        {feedbackText ? (
          <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <AppDialog
      panelClassName="flex max-h-full w-full max-w-3xl flex-col"
      titleId="proxy-settings-title"
      onClose={onClose ?? (() => undefined)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Wifi size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="proxy-settings-title">
              {t("网络代理")}
            </h2>
          </div>
        </div>
        <DialogCloseButton onClick={() => onClose?.()} />
      </header>
      {body}
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
