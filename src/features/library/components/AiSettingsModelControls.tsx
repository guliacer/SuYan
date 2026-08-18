import {
  Check,
  FileText,
  ImageIcon,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AiProviderModelCapability, AiProviderModelSettings } from "../types/ai";
import {
  normalizeModelSearch,
  toggleStringSelection,
  type ModelPickerState,
} from "./aiSettingsDialogData";

type ModelRowProps = {
  active: boolean;
  canDelete: boolean;
  model: AiProviderModelSettings;
  onDelete: () => void;
  onSelect: () => void;
  onToggleCapability: (capability: AiProviderModelCapability) => void;
};

export function ModelRow({ active, canDelete, model, onDelete, onSelect, onToggleCapability }: ModelRowProps) {
  const modelLabel = model.label || model.id;

  return (
    <div
      className={`grid min-h-12 grid-cols-[minmax(220px,1fr)_280px_96px] items-center border-b border-border/60 px-3 py-1.5 text-sm last:border-b-0 ${
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
          <span className="block truncate font-medium text-foreground">{modelLabel}</span>
          <span className="block truncate text-[11px] text-muted">{model.id}</span>
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        <CapabilityButton
          active={model.capabilities.includes("text")}
          icon={<FileText size={13} />}
          label="文本"
          onClick={() => onToggleCapability("text")}
        />
        <CapabilityButton
          active={model.capabilities.includes("vision")}
          icon={<ImageIcon size={13} />}
          label="视觉"
          onClick={() => onToggleCapability("vision")}
        />
        <CapabilityButton
          active={model.capabilities.includes("image-generation")}
          icon={<Sparkles size={13} />}
          label="生图"
          onClick={() => onToggleCapability("image-generation")}
        />
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          aria-label={`设为当前模型 ${modelLabel}`}
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
            {active ? "当前模型" : "设为当前模型"}
          </span>
        </button>
        <button
          aria-label={`删除模型 ${modelLabel}`}
          className="icon-tooltip-button flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
          data-tooltip-align="end"
          data-tooltip-placement="above"
          disabled={!canDelete}
          type="button"
          onClick={onDelete}
        >
          <X size={13} />
          <span className="icon-tooltip-button__bubble" role="tooltip">
            删除模型
          </span>
        </button>
      </div>
    </div>
  );
}

type CapabilityButtonProps = {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

export function CapabilityButton({ active, icon, label, onClick }: CapabilityButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground"
      }`}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
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
          aria-label="搜索模型"
          className="h-11 w-full bg-transparent px-4 pr-10 text-sm text-foreground outline-none placeholder:text-muted"
          placeholder="搜索 LLM 模型..."
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
                <span className="min-w-0 truncate">{model.label || model.id}</span>
                <ModelCapabilityIcons capabilities={model.capabilities} />
              </button>
            );
          })
        ) : (
          <p className="rounded-md border border-border bg-panel px-3 py-6 text-center text-xs text-muted">
            没有匹配的模型
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-panel px-3 py-3">
        <span className="text-xs text-muted">已选 {picker.selectedModelIds.length} 项</span>
        <div className="flex gap-2">
          <Button icon={<X size={15} />} variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button disabled={picker.selectedModelIds.length === 0} icon={<Check size={15} />} variant="primary" onClick={onConfirm}>
            确定
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
    </span>
  );
}