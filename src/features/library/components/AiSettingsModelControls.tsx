import {
  Check,
  FileText,
  Film,
  ImageIcon,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { MarqueeText } from "@/components/ui/MarqueeText";
import type { AiProviderKind, AiProviderModelCapability, AiProviderModelSettings } from "../types/ai";
import {
  normalizeModelSearch,
  toggleStringSelection,
  type ModelPickerState,
} from "./aiSettingsDialogData";

type ModelRowProps = {
  active: boolean;
  canDelete: boolean;
  model: AiProviderModelSettings;
  provider?: AiProviderKind;
  onDelete: () => void;
  onSelect: () => void;
  onToggleCapability: (capability: AiProviderModelCapability) => void;
};

export function ModelRow({ active, canDelete, model, onDelete, onSelect, onToggleCapability, provider = "openai-compatible" }: ModelRowProps) {
  const { t } = useLocale();
  const modelLabel = model.label || model.id;
  const capabilities = provider === "ollama" ? (["text", "vision"] as const) : ([
    "text",
    "vision",
    "image-generation",
    "video-generation",
  ] as const);

  return (
    <div
      className={`grid min-h-12 grid-cols-[minmax(220px,1fr)_260px_96px] items-center border-b border-border/60 px-3 py-1.5 text-sm last:border-b-0 ${
        active ? "bg-primary-soft/70" : "bg-panel"
      }`}
    >
      <button
        className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        type="button"
        onClick={onSelect}
      >
        <span
          className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
            active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
          }`}
        >
          {active ? <Check size={11} /> : null}
        </span>
        <span className="min-w-0">
          <MarqueeText className="font-medium text-foreground" text={modelLabel} />
          <MarqueeText className="text-[11px] text-muted" text={model.id} />
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        {capabilities.map((capability) => {
          const metadata = capabilityMetadata[capability];
          return (
            <CapabilityButton
              active={model.capabilities.includes(capability)}
              icon={metadata.icon}
              key={capability}
              label={t(metadata.label)}
              onClick={() => onToggleCapability(capability)}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          aria-label={t("设为当前模型 {model}", { model: modelLabel })}
          aria-pressed={active}
          className={`icon-tooltip-button flex size-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
            active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-primary-soft hover:text-foreground"
          }`}
          data-tooltip-align="end"
          data-tooltip-placement="above"
          type="button"
          onClick={onSelect}
        >
          {active ? <Check size={13} /> : <span className="size-3 rounded-full border border-border bg-background" />}
          <span className="icon-tooltip-button__bubble" role="tooltip">
            {active ? t("当前模型") : t("设为当前模型")}
          </span>
        </button>
        <button
          aria-label={t("删除模型 {model}", { model: modelLabel })}
          className="icon-tooltip-button flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
          data-tooltip-align="end"
          data-tooltip-placement="above"
          disabled={!canDelete}
          type="button"
          onClick={onDelete}
        >
          <X size={13} />
          <span className="icon-tooltip-button__bubble" role="tooltip">
            {t("删除模型")}
          </span>
        </button>
      </div>
    </div>
  );
}

const capabilityMetadata: Record<AiProviderModelCapability, { icon: React.ReactNode; label: string }> = {
  text: { icon: <FileText size={13} />, label: "文本" },
  vision: { icon: <ImageIcon size={13} />, label: "图像" },
  "image-generation": { icon: <Sparkles size={13} />, label: "生图" },
  "video-generation": { icon: <Film size={13} />, label: "视频" },
};

type CapabilityButtonProps = {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

export function CapabilityButton({ active, icon, label, onClick }: CapabilityButtonProps) {
  const { t } = useLocale();
  return (
    <button
      aria-label={t(label)}
      aria-pressed={active}
      className={`inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground"
      }`}
      title={t(label)}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{t(label)}</span>
    </button>
  );
}

type ModelPickerPanelProps = {
  picker: ModelPickerState;
  onCancel: () => void;
  onConfirm: () => void;
  onQueryChange: (query: string) => void;
  onToggleModel: (modelId: string) => void;
};

export function ModelPickerPanel({
  picker,
  onCancel,
  onConfirm,
  onQueryChange,
  onToggleModel,
}: ModelPickerPanelProps) {
  const { t } = useLocale();
  const query = normalizeModelSearch(picker.query);
  const visibleModels = picker.models.filter((model) => {
    if (!query) {
      return true;
    }

    return normalizeModelSearch(`${model.label} ${model.id}`).includes(query);
  });

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background shadow-elevated">
      <div className="relative border-b border-border bg-panel">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          aria-label={t("搜索模型")}
          className="h-11 w-full bg-transparent px-4 pr-10 text-sm text-foreground outline-none placeholder:text-muted"
          placeholder={t("搜索 LLM 模型...")}
          value={picker.query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="grid max-h-56 overflow-y-auto p-2">
        {visibleModels.length > 0 ? (
          visibleModels.map((model) => {
            const selected = picker.selectedModelIds.includes(model.id);

            return (
              <button
                className={`grid min-h-10 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                  selected ? "bg-primary-soft text-foreground" : "text-muted hover:bg-panel hover:text-foreground"
                }`}
                key={model.id}
                title={model.id}
                type="button"
                onClick={() => onToggleModel(model.id)}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded border ${
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-panel"
                  }`}
                >
                  {selected ? <Check size={11} /> : null}
                </span>
                <MarqueeText className="min-w-0" text={model.label || model.id} />
                <ModelCapabilityIcons capabilities={model.capabilities} />
              </button>
            );
          })
        ) : (
          <p className="rounded-md border border-border bg-panel px-3 py-6 text-center text-xs text-muted">
            {t("没有匹配的模型")}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-panel px-3 py-3">
        <span className="text-xs text-muted">{t("已选 {count} 项", { count: picker.selectedModelIds.length })}</span>
        <div className="flex gap-2">
          <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<X size={14} />} variant="ghost" onClick={onCancel}>
            {t("取消")}
          </Button>
          <Button
            className="min-h-8 px-2.5 py-1.5 text-xs"
            disabled={picker.selectedModelIds.length === 0}
            icon={<Check size={14} />}
            variant="primary"
            onClick={onConfirm}
          >
            {t("确定")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ModelCapabilityIcons({ capabilities }: { capabilities: readonly AiProviderModelCapability[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted">
      {capabilities.includes("text") ? <FileText size={13} /> : null}
      {capabilities.includes("vision") ? <ImageIcon size={13} /> : null}
      {capabilities.includes("image-generation") ? <Sparkles size={13} /> : null}
      {capabilities.includes("video-generation") ? <Film size={13} /> : null}
    </span>
  );
}
