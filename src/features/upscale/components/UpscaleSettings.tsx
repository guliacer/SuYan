import { Download, FolderOpen, HardDrive, Library, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type {
  UpscaleComponentStatus,
  UpscaleEngine,
  UpscaleExportOptions,
  UpscaleModelId,
  UpscaleOutputDirectoryDescriptor,
  UpscalePreset,
} from "../types";
import { getUpscaleModelDefinition, upscaleModelDefinitions } from "../utils/upscaleModels";

type UpscaleSettingsProps = {
  preset: UpscalePreset;
  engine: UpscaleEngine;
  modelId: UpscaleModelId;
  tileSize: number;
  gpuId: number;
  forceWasm: boolean;
  exportOptions: UpscaleExportOptions;
  outputDirectory: UpscaleOutputDirectoryDescriptor | null;
  componentStatus: UpscaleComponentStatus | null;
  installing: boolean;
  installProgress: number;
  onPresetChange(preset: UpscalePreset): void;
  onEngineChange(engine: UpscaleEngine): void;
  onModelChange(modelId: UpscaleModelId): void;
  onTileSizeChange(tileSize: number): void;
  onGpuIdChange(gpuId: number): void;
  onForceWasmChange(forceWasm: boolean): void;
  onExportOptionsChange(options: Partial<UpscaleExportOptions>): void;
  onChooseDirectory(): void;
  onInstall(): void;
};

const presets: Array<{ id: UpscalePreset; label: string }> = [
  { id: "anime", label: "动漫插画" },
  { id: "photo", label: "真实照片" },
  { id: "manual", label: "手动选择" },
];

export function UpscaleSettings({
  preset,
  engine,
  modelId,
  tileSize,
  gpuId,
  forceWasm,
  exportOptions,
  outputDirectory,
  componentStatus,
  installing,
  installProgress,
  onPresetChange,
  onEngineChange,
  onModelChange,
  onTileSizeChange,
  onGpuIdChange,
  onForceWasmChange,
  onExportOptionsChange,
  onChooseDirectory,
  onInstall,
}: UpscaleSettingsProps) {
  const { t } = useLocale();
  const selectedModel = getUpscaleModelDefinition(modelId);
  const models = upscaleModelDefinitions.filter((model) => model.engine === engine);
  const installed = componentStatus?.installed === true && (
    engine === "real-esrgan" || componentStatus.installedModelIds.includes(modelId)
  );
  const scales = engine === "real-cugan" ? [2, 3, 4] as const : [2, 3, 4] as const;

  function chooseScale(scale: 2 | 3 | 4) {
    const matching = models.filter((model) => model.scale === scale);
    if (matching.length === 0) return;
    if (engine === "real-cugan") {
      const sameDenoise = matching.find((model) => model.denoiseLevel === selectedModel.denoiseLevel);
      onModelChange((sameDenoise ?? matching.find((model) => model.denoiseLevel === 0) ?? matching[0]).id);
      return;
    }
    onModelChange((matching.find((model) => model.id.startsWith("esrgan-animevideov3")) ?? matching[0]).id);
  }

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-border/70 bg-panel/55" aria-label={t("处理与导出")}>
      <div className="divide-y divide-border/70">
        <section className="grid gap-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("处理设置")}</h2>
          <FieldLabel label={t("预设")}>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border bg-background/60">
              {presets.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`min-h-9 border-r border-border px-2 text-xs last:border-r-0 ${preset === option.id ? "bg-primary text-primary-foreground" : "text-muted hover:bg-primary-soft hover:text-foreground"}`}
                  onClick={() => onPresetChange(option.id)}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </FieldLabel>

          <FieldLabel label={t("引擎")}>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background/60">
              <Segment active={engine === "real-cugan"} label="Real-CUGAN" onClick={() => onEngineChange("real-cugan")} />
              <Segment active={engine === "real-esrgan"} label="Real-ESRGAN" onClick={() => onEngineChange("real-esrgan")} />
            </div>
          </FieldLabel>

          <FieldLabel label={t("放大倍率")}>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border bg-background/60">
              {scales.map((scale) => (
                <Segment key={scale} active={selectedModel.scale === scale} label={`${scale}x`} onClick={() => chooseScale(scale)} />
              ))}
            </div>
          </FieldLabel>

          <FieldLabel label={t("模型")}>
            <select
              className="min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              value={modelId}
              onChange={(event) => onModelChange(event.target.value as UpscaleModelId)}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>{t(model.label)}</option>
              ))}
            </select>
            <span className="text-xs leading-5 text-muted">{t(selectedModel.description)}</span>
          </FieldLabel>

          {!installed ? (
            <div className="grid gap-2 rounded-md border border-primary/35 bg-primary-soft p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Download className="size-4 text-primary" aria-hidden="true" />
                <span>{t("首次使用需下载组件")}</span>
              </div>
              {installing ? (
                <div className="grid gap-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full bg-progress transition-[width]" style={{ width: `${Math.round(installProgress * 100)}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted">{Math.round(installProgress * 100)}%</span>
                </div>
              ) : (
                <Button icon={<PackageCheck className="size-4" />} maxWidth={false} size="sm" onClick={onInstall}>
                  {t("下载并安装")}
                </Button>
              )}
            </div>
          ) : null}

          <details className="group rounded-md border border-border bg-background/45 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-foreground">{t("性能设置")}</summary>
            <div className="grid gap-3 pt-3">
              {engine === "real-esrgan" ? (
                <>
                  <FieldLabel label={t("切块大小")}>
                    <select
                      className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                      value={tileSize}
                      onChange={(event) => onTileSizeChange(Number(event.target.value))}
                    >
                      <option value="0">{t("自动")}</option>
                      <option value="128">128</option>
                      <option value="256">256</option>
                      <option value="512">512</option>
                    </select>
                  </FieldLabel>
                  <FieldLabel label={t("GPU 编号")}>
                    <input
                      className="min-h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                      type="number"
                      min="-1"
                      max="64"
                      value={gpuId}
                      onChange={(event) => onGpuIdChange(Number(event.target.value))}
                    />
                  </FieldLabel>
                </>
              ) : (
                <CheckRow
                  checked={forceWasm}
                  label={t("强制使用 WASM")}
                  onChange={onForceWasmChange}
                />
              )}
            </div>
          </details>
        </section>

        <section className="grid gap-3 p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("导出设置")}</h2>
          <div className="grid gap-2">
            <CheckRow
              checked={exportOptions.saveToDirectory}
              icon={<HardDrive className="size-4" />}
              label={t("保存到目录")}
              onChange={(checked) => onExportOptionsChange({ saveToDirectory: checked })}
            />
            <CheckRow
              checked={exportOptions.addToLibrary}
              icon={<Library className="size-4" />}
              label={t("加入素材库")}
              onChange={(checked) => onExportOptionsChange({ addToLibrary: checked })}
            />
          </div>

          {exportOptions.saveToDirectory ? (
            <Button icon={<FolderOpen className="size-4" />} maxWidth={false} size="sm" onClick={onChooseDirectory}>
              {outputDirectory?.displayName ?? t("选择保存目录")}
            </Button>
          ) : null}

          <FieldLabel label={t("输出格式")}>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-border bg-background/60">
              {(["png", "jpeg", "webp"] as const).map((format) => (
                <Segment
                  key={format}
                  active={exportOptions.format === format}
                  label={format.toUpperCase()}
                  onClick={() => onExportOptionsChange({ format })}
                />
              ))}
            </div>
          </FieldLabel>

          {exportOptions.format !== "png" ? (
            <FieldLabel label={`${t("质量")} · ${exportOptions.quality}`}>
              <input
                aria-label={t("输出质量")}
                className="w-full accent-primary"
                type="range"
                min="1"
                max="100"
                value={exportOptions.quality}
                onChange={(event) => onExportOptionsChange({ quality: Number(event.target.value) })}
              />
            </FieldLabel>
          ) : null}

          <FieldLabel label={t("命名模板")}>
            <input
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              value={exportOptions.namingPattern}
              onChange={(event) => onExportOptionsChange({ namingPattern: event.target.value })}
            />
          </FieldLabel>

          <FieldLabel label={t("同名文件")}>
            <select
              className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              value={exportOptions.conflictPolicy}
              onChange={(event) => onExportOptionsChange({ conflictPolicy: event.target.value as UpscaleExportOptions["conflictPolicy"] })}
            >
              <option value="append-number">{t("自动编号")}</option>
              <option value="overwrite">{t("覆盖")}</option>
              <option value="skip">{t("跳过")}</option>
            </select>
          </FieldLabel>

          {exportOptions.addToLibrary ? (
            <FieldLabel label={t("素材库回流")}>
              <select
                className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={exportOptions.libraryMode}
                onChange={(event) => onExportOptionsChange({ libraryMode: event.target.value as UpscaleExportOptions["libraryMode"] })}
              >
                <option value="new-group">{t("新建提示词组")}</option>
                <option value="append-source">{t("追加到来源组")}</option>
              </select>
            </FieldLabel>
          ) : null}
        </section>
      </div>
    </aside>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Segment({ active, label, onClick }: { active: boolean; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      className={`min-h-9 border-r border-border px-2 text-xs last:border-r-0 ${active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-primary-soft hover:text-foreground"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CheckRow({
  checked,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  icon?: React.ReactNode;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-background/45 px-3 text-xs text-foreground">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {icon ? <span className="text-muted" aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </label>
  );
}
