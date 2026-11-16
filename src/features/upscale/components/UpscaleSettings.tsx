import { useState } from "react";
import {
  ChevronDown,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  PackageCheck,
  Palette,
  PanelRightClose,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import { UpscaleDropboxPanel } from "./UpscaleDropboxPanel";
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
  onSaveToDirectoryChange(checked: boolean): void;
  onInstall(): void;
  /** 折叠右栏（桌面端）。不传就不显示折叠按钮。 */
  onCollapse?: () => void;
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
  onSaveToDirectoryChange,
  onInstall,
  onCollapse,
}: UpscaleSettingsProps) {
  const { t } = useLocale();
  const [tab, setTab] = useState<"process" | "models" | "export">("process");
  const selectedModel = getUpscaleModelDefinition(modelId);
  const models = upscaleModelDefinitions.filter((model) => model.engine === engine);
  // 三态拆分：引擎包是否装过 / 当前这个倍率模型是否真正就绪。
  // 之前只区分「装了 / 没装」，导致用户在 real-cugan 装了 2x 后切到 3x
  // 被当成「从未安装」重新提示下载，文案还写「首次使用」，非常困惑。
  const engineInstalled = componentStatus?.installed === true;
  const modelInstalled = engineInstalled && (
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
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto p-4" aria-label={t("处理与导出")}>
      {/* 标题栏 + 收起按钮：右栏纵向占位很高，主流程却是对比预览，
          必须给一个一键折叠的出口，把画面还给中栏。 */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{t("处理与导出")}</h2>
        {onCollapse ? (
          <IconTooltipButton
            icon={<PanelRightClose className="size-4" />}
            label={t("收起设置")}
            size="sm"
            tooltipPlacement="left"
            variant="ghost"
            onClick={onCollapse}
          />
        ) : null}
      </div>
      {/* 处理 / 模型 / 导出 分页签：设置项一次性铺开会把右栏撑得又长又挤，
          竖着滚半天还找不到想调的那项。分页后一屏放得下 ——
          和创作画布把生成参数收进弹层是同一个思路。 */}
      <div className="upscale-segment mb-4 grid grid-cols-3 gap-1 rounded-xl border p-1">
        <Segment active={tab === "process"} label={t("处理")} onClick={() => setTab("process")} />
        <Segment active={tab === "models"} label={t("模型")} onClick={() => setTab("models")} />
        <Segment active={tab === "export"} label={t("导出")} onClick={() => setTab("export")} />
      </div>
      <div className="grid gap-4">
        {tab === "process" ? (
          <section className="grid gap-4 rounded-2xl border border-border/80 bg-background/60 p-4">
            <SectionTitle icon={<SlidersHorizontal className="size-3.5" />} title={t("处理设置")} />

            <FieldLabel label={t("预设")}>
              <div className="upscale-segment grid grid-cols-3 gap-1 rounded-xl border p-1">
                {presets.map((option) => (
                  <Segment
                    key={option.id}
                    active={preset === option.id}
                    label={t(option.label)}
                    onClick={() => onPresetChange(option.id)}
                  />
                ))}
              </div>
            </FieldLabel>

            <FieldLabel label={t("引擎")}>
              <div className="upscale-segment grid grid-cols-2 gap-1 rounded-xl border p-1">
                <Segment active={engine === "real-cugan"} label="Real-CUGAN" onClick={() => onEngineChange("real-cugan")} />
                <Segment active={engine === "real-esrgan"} label="Real-ESRGAN" onClick={() => onEngineChange("real-esrgan")} />
              </div>
            </FieldLabel>

            <FieldLabel label={t("放大倍率")}>
              <div className="upscale-segment grid grid-cols-3 gap-1 rounded-xl border p-1">
                {scales.map((scale) => (
                  <Segment key={scale} active={selectedModel.scale === scale} label={`${scale}x`} onClick={() => chooseScale(scale)} />
                ))}
              </div>
            </FieldLabel>

            <FieldLabel label={t("模型")}>
              <select
                className="min-h-10 w-full rounded-xl border border-border/80 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
                value={modelId}
                onChange={(event) => onModelChange(event.target.value as UpscaleModelId)}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{t(model.label)}</option>
                ))}
              </select>
              <span className="flex items-center gap-1.5 text-xs leading-4 text-muted">
                <Palette className="size-3.5 shrink-0 text-primary/70" aria-hidden="true" />
                {t(selectedModel.description)}
              </span>
            </FieldLabel>

            {modelInstalled ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/70 px-3 py-2.5 text-xs text-muted">
                <span className="size-1.5 shrink-0 rounded-full bg-progress" aria-hidden="true" />
                {t("组件已就绪，可直接开始处理")}
              </div>
            ) : !engineInstalled ? (
              <div className="grid gap-3 rounded-xl border border-primary/25 bg-primary-soft p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-panel text-primary" aria-hidden="true">
                    <Download className="size-3.5" />
                  </span>
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
                  <Button icon={<PackageCheck className="size-4" />} maxWidth={false} size="sm" variant="primary" onClick={onInstall}>
                    {t("下载并安装")}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-panel text-warning" aria-hidden="true">
                    <Download className="size-3.5" />
                  </span>
                  <span>{t("当前倍率模型尚未下载")} · {selectedModel.scale}x</span>
                </div>
                {installing ? (
                  <div className="grid gap-1.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-progress transition-[width]" style={{ width: `${Math.round(installProgress * 100)}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted">{Math.round(installProgress * 100)}%</span>
                  </div>
                ) : (
                  <Button icon={<PackageCheck className="size-4" />} maxWidth={false} size="sm" variant="primary" onClick={onInstall}>
                    {t("下载 {scale}x 模型", { scale: selectedModel.scale })}
                  </Button>
                )}
              </div>
            )}

            <details className="group rounded-xl border border-border/80 bg-background/60 px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <Cpu className="size-3.5 text-muted" aria-hidden="true" />
                <span className="flex-1">{t("性能设置")}</span>
                <ChevronDown className="size-3.5 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="grid gap-3 pt-3">
                {engine === "real-esrgan" ? (
                  <>
                    <FieldLabel label={t("切块大小")}>
                      <select
                        className="min-h-9 w-full rounded-xl border border-border/80 bg-panel px-2 text-sm text-foreground"
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
                        className="min-h-9 w-full rounded-xl border border-border/80 bg-panel px-2 text-sm text-foreground"
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
        ) : tab === "models" ? (
          <UpscaleDropboxPanel />
        ) : (
          <section className="grid gap-4 rounded-2xl border border-border/80 bg-background/60 p-4">
            <SectionTitle icon={<FolderOpen className="size-3.5" />} title={t("导出设置")} />

            <p className="rounded-xl border border-border/80 bg-background/70 px-3 py-2.5 text-xs leading-4 text-muted">
              {t("底栏「导出」会把结果收录进素材库，无需任何设置。")}
            </p>

            <FieldLabel label={t("输出格式")}>
              <div className="upscale-segment grid grid-cols-3 gap-1 rounded-xl border p-1">
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
                className="min-h-10 w-full rounded-xl border border-border/80 bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
                value={exportOptions.namingPattern}
                onChange={(event) => onExportOptionsChange({ namingPattern: event.target.value })}
              />
            </FieldLabel>

            <FieldLabel label={t("同名文件")}>
              <select
                className="min-h-10 w-full rounded-xl border border-border/80 bg-background px-3 text-sm text-foreground"
                value={exportOptions.conflictPolicy}
                onChange={(event) => onExportOptionsChange({ conflictPolicy: event.target.value as UpscaleExportOptions["conflictPolicy"] })}
              >
                <option value="append-number">{t("自动编号")}</option>
                <option value="overwrite">{t("覆盖")}</option>
                <option value="skip">{t("跳过")}</option>
              </select>
            </FieldLabel>

            <CheckRow
              // 勾选态 = 「要落盘」且「目录已选定」。
              // saveToDirectory 的默认值是 true 但目录令牌为空，只看它会让开关显示成
              // 已勾选、实际却没有目录，导出时也不会写盘。
              checked={exportOptions.saveToDirectory && Boolean(exportOptions.outputDirectoryToken)}
              icon={<HardDrive className="size-4" />}
              label={t("同时保存到目录")}
              onChange={(checked) => onSaveToDirectoryChange(checked)}
            />

            {exportOptions.saveToDirectory ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/70 px-3 py-2.5">
                <FolderOpen className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted" title={outputDirectory?.displayName}>
                  {outputDirectory?.displayName ?? t("尚未选择目录")}
                </span>
                <Button maxWidth={false} size="sm" variant="ghost" onClick={onChooseDirectory}>
                  {t("更换")}
                </Button>
              </div>
            ) : null}

            <FieldLabel label={t("素材库回流")}>
              <select
                className="min-h-10 w-full rounded-xl border border-border/80 bg-background px-3 text-sm text-foreground"
                value={exportOptions.libraryMode}
                onChange={(event) => onExportOptionsChange({ libraryMode: event.target.value as UpscaleExportOptions["libraryMode"] })}
              >
                <option value="new-group">{t("新建提示词组")}</option>
                <option value="append-source">{t("追加到来源组")}</option>
              </select>
            </FieldLabel>
          </section>
        )}
      </div>
    </aside>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 pb-2.5">
      <span className="text-muted" aria-hidden="true">{icon}</span>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
    </div>
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
      data-active={active}
      className="min-h-8 rounded-lg px-1.5 text-xs font-medium transition-all"
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
    <label
      className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 transition-colors ${
        checked
          ? "border-primary/30 bg-primary-soft/70 text-foreground"
          : "border-border/80 bg-background/70 text-foreground hover:border-border hover:bg-background"
      }`}
    >
      <input
        type="checkbox"
        className="size-3.5 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {icon ? <span className={checked ? "text-primary" : "text-muted"} aria-hidden="true">{icon}</span> : null}
      <span>{label}</span>
    </label>
  );
}
