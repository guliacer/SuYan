import { useEffect, useState, type ReactNode } from "react";
import { Blocks, Check, Eye, EyeOff, ImageIcon, LayoutDashboard, Moon, Palette, PanelLeft, Settings2, Sparkles, Sun, Wifi } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { useLocale } from "@/components/LocaleProvider";
import { ThemeRoleColors } from "./ThemeRoleColors";
import { CanvasBackgroundSettingsPanel } from "./CanvasBackgroundSettingsPanel";
import type { SidebarEntryId, SidebarEntryVisibility, ThemeAccent, ThemeCustomAccentSlot, ThemeCustomTheme, ThemeMode, ThemePreset } from "../types/library";
import type { ProxyDetectionData, ProxySettings } from "../types/proxy";
import type { AppLanguage } from "@/types/locale";
import type { StatusFeedbackMessage } from "../utils/statusFeedback";
import {
  systemPreferenceSectionMeta,
  systemPreferenceSections,
  type SystemPreferenceSection,
} from "../utils/systemPreferences";
import {
  requiredSidebarEntryIds,
  sidebarEntryGroups,
  sidebarEntryMeta,
  sidebarFooterEntryIds,
} from "../utils/sidebarEntries";
import { getDefaultThemeAccentForPreset, getThemeAccentColor, getThemeModeLabel, isThemeCustomAccentSlot, themeAccentOptions, themeCustomAccentOptions, themePresetOptions } from "../utils/themeMode";
import { ModuleManagementDialog } from "./ModuleManagementDialog";
import { ProxySettingsDialog } from "./ProxySettingsDialog";
import { StartupGallerySettingsDialog } from "./StartupGallerySettingsDialog";
import {
  visualLifeEffectIds,
  type VisualLifeEffectId,
  type VisualLifeIntensity,
  type VisualLifeMode,
  type VisualLifeSettings,
} from "../utils/visualLife";

type SystemPreferencesDialogProps = {
  isBusy: boolean;
  language: AppLanguage;
  section: SystemPreferenceSection;
  proxySettings: ProxySettings;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  themeAccent: ThemeAccent;
  themeCustomAccent: string;
  themeOpacity: number;
  themeNavigationOpacity: number;
  themeBackgroundOpacity: number;
  themeWorkspaceOpacity: number;
  themeAccentOpacity: number;
  themeCustomAccents: [string, string, string];
  customTheme: ThemeCustomTheme;
  visualLife: VisualLifeSettings;
  sidebarEntryVisibility: SidebarEntryVisibility;
  workspaceWidthPercent: number;
  onSectionChange: (section: SystemPreferenceSection) => void;
  onLanguageChange: (language: AppLanguage) => Promise<boolean>;
  onClose: () => void;
  onDetectProxy: () => Promise<ProxyDetectionData | null>;
  onSaveProxy: (settings: ProxySettings) => Promise<boolean>;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>;
  onThemePresetChange: (themePreset: ThemePreset) => Promise<void>;
  onThemeAccentChange: (themeAccent: ThemeAccent, themeCustomAccent?: string, customAccentSlot?: ThemeCustomAccentSlot) => Promise<void>;
  onThemeOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeNavigationOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeBackgroundOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeWorkspaceOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeAccentOpacityChange: (themeAccentOpacity: number) => Promise<void>;
  onCustomThemeChange: (patch: Partial<ThemeCustomTheme>) => Promise<void>;
  onVisualLifeSettingsChange: (patch: Partial<VisualLifeSettings>) => Promise<boolean>;
  onSidebarEntryVisibilityChange: (entryId: SidebarEntryId, visible: boolean) => Promise<boolean>;
  onTestProxy: (settings: ProxySettings) => Promise<boolean>;
  onWorkspaceWidthChange: (widthPercent: number) => void;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

const sectionIcons: Record<SystemPreferenceSection, ReactNode> = {
  proxy: <Wifi size={16} />,
  appearance: <Palette size={16} />,
  canvasBackground: <ImageIcon size={16} />,
  visualLife: <Sparkles size={16} />,
  layout: <LayoutDashboard size={16} />,
  sidebar: <PanelLeft size={16} />,
  modules: <Blocks size={16} />,
  startupGallery: <ImageIcon size={16} />,
};

/**
 * 系统偏好统一壳：网络 / 主题 / 视觉生命 / 布局 / 边栏 / 模块 / 启动图库。
 * 模型配置与内容分级因体量与作业属性保持独立弹窗。
 */
export function SystemPreferencesDialog({
  isBusy,
  language,
  section,
  proxySettings,
  themeMode,
  themePreset,
  themeAccent,
  themeCustomAccent,
  themeOpacity,
  themeNavigationOpacity,
  themeBackgroundOpacity,
  themeWorkspaceOpacity,
  themeAccentOpacity,
  themeCustomAccents,
  customTheme,
  visualLife,
  sidebarEntryVisibility,
  workspaceWidthPercent,
  onSectionChange,
  onLanguageChange,
  onClose,
  onDetectProxy,
  onSaveProxy,
  onThemeModeChange,
  onThemePresetChange,
  onThemeAccentChange,
  onThemeOpacityChange,
  onThemeNavigationOpacityChange,
  onThemeBackgroundOpacityChange,
  onThemeWorkspaceOpacityChange,
  onThemeAccentOpacityChange,
  onCustomThemeChange,
  onVisualLifeSettingsChange,
  onSidebarEntryVisibilityChange,
  onTestProxy,
  onWorkspaceWidthChange,
  onNotify,
}: SystemPreferencesDialogProps) {
  const { t } = useLocale();
  const activeMeta = systemPreferenceSectionMeta[section];

  return (
    <AppDialog
      panelClassName="flex h-[min(820px,calc(100dvh-2rem))] min-h-0 w-full max-w-[min(1180px,calc(100vw-2rem))] flex-col"
      titleId="system-preferences-title"
      onClose={onClose}
    >
      <header className="app-chrome-surface flex min-h-14 items-center justify-between gap-3 border-b border-chrome-border/70 px-4 py-3 min-[640px]:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-chrome-border/70 bg-chrome-control/55 text-chrome-foreground">
            <Settings2 size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-chrome-foreground" id="system-preferences-title">
              {t("系统设置")}
            </h2>
            <p className="mt-0.5 text-sm text-chrome-muted">
              {t(activeMeta.label)} · {t(activeMeta.description)}
            </p>
          </div>
        </div>
        <DialogCloseButton variant="chrome" onClick={onClose} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 bg-background/20 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label={t("系统设置")}
          className="app-chrome-surface flex gap-1 overflow-x-auto border-b border-chrome-border/70 px-3 py-3 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4"
        >
          {systemPreferenceSections.map((entry) => {
            const meta = systemPreferenceSectionMeta[entry];
            const selected = entry === section;

            return (
              <button
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-transparent text-chrome-muted hover:border-chrome-border hover:bg-chrome-control/55 hover:text-chrome-foreground"
                }`}
                data-feature-guide={`system-preferences-section-${entry}`}
                key={entry}
                type="button"
                onClick={() => onSectionChange(entry)}
              >
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-xl border ${selected ? "border-primary-foreground/25 bg-primary-foreground/15" : "border-chrome-border/70 bg-chrome-control/55"}`}>
                  {sectionIcons[entry]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{t(meta.label)}</span>
                  <span className={`mt-0.5 hidden text-[11px] font-normal leading-4 md:block ${selected ? "text-primary-foreground/75" : "text-chrome-muted"}`}>
                    {t(meta.description)}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div data-feature-guide="system-preferences-content" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background/20 px-3 py-3 md:px-4 md:py-4">
          {section === "proxy" ? (
            <ProxySettingsDialog
              embedded
              isBusy={isBusy}
              settings={proxySettings}
              onDetect={onDetectProxy}
              onSave={onSaveProxy}
              onTest={onTestProxy}
              onNotify={onNotify}
            />
          ) : null}
          {section === "appearance" ? (
            <ThemeSettings
              isBusy={isBusy}
              themeMode={themeMode}
              themePreset={themePreset}
              themeAccent={themeAccent}
              themeCustomAccent={themeCustomAccent}
              themeOpacity={themeOpacity}
              themeNavigationOpacity={themeNavigationOpacity}
              themeBackgroundOpacity={themeBackgroundOpacity}
              themeWorkspaceOpacity={themeWorkspaceOpacity}
              themeAccentOpacity={themeAccentOpacity}
              themeCustomAccents={themeCustomAccents}
              customTheme={customTheme}
              language={language}
              onThemeModeChange={onThemeModeChange}
              onThemePresetChange={onThemePresetChange}
              onThemeAccentChange={onThemeAccentChange}
              onThemeOpacityChange={onThemeOpacityChange}
              onThemeNavigationOpacityChange={onThemeNavigationOpacityChange}
              onThemeBackgroundOpacityChange={onThemeBackgroundOpacityChange}
              onThemeWorkspaceOpacityChange={onThemeWorkspaceOpacityChange}
              onThemeAccentOpacityChange={onThemeAccentOpacityChange}
              onCustomThemeChange={onCustomThemeChange}
              onNotify={onNotify}
              onLanguageChange={onLanguageChange}
            />
          ) : null}
          {section === "visualLife" ? (
            <VisualLifeSettingsPanel settings={visualLife} onChange={onVisualLifeSettingsChange} />
          ) : null}
          {section === "layout" ? (
            <WorkspaceLayoutSettings
              workspaceWidthPercent={workspaceWidthPercent}
              onWorkspaceWidthChange={onWorkspaceWidthChange}
            />
          ) : null}
          {section === "canvasBackground" ? <CanvasBackgroundSettingsPanel isBusy={isBusy} /> : null}
          {section === "sidebar" ? (
            <SidebarEntriesSettings
              isBusy={isBusy}
              visibility={sidebarEntryVisibility}
              onVisibilityChange={onSidebarEntryVisibilityChange}
            />
          ) : null}
          {section === "modules" ? (
            <ModuleManagementDialog embedded isBusy={isBusy} onNotify={onNotify} />
          ) : null}
          {section === "startupGallery" ? (
            <StartupGallerySettingsDialog embedded isBusy={isBusy} onNotify={onNotify} />
          ) : null}
        </div>
      </div>
    </AppDialog>
  );
}

type ThemeSettingsProps = {
  isBusy: boolean;
  language: AppLanguage;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  themeAccent: ThemeAccent;
  themeCustomAccent: string;
  themeOpacity: number;
  themeNavigationOpacity: number;
  themeBackgroundOpacity: number;
  themeWorkspaceOpacity: number;
  themeAccentOpacity: number;
  themeCustomAccents: [string, string, string];
  customTheme: ThemeCustomTheme;
  onThemeModeChange: (themeMode: ThemeMode) => Promise<void>;
  onThemePresetChange: (themePreset: ThemePreset) => Promise<void>;
  onThemeAccentChange: (themeAccent: ThemeAccent, themeCustomAccent?: string, customAccentSlot?: ThemeCustomAccentSlot) => Promise<void>;
  onThemeOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeNavigationOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeBackgroundOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeWorkspaceOpacityChange: (themeOpacity: number) => Promise<void>;
  onThemeAccentOpacityChange: (themeAccentOpacity: number) => Promise<void>;
  onCustomThemeChange: (patch: Partial<ThemeCustomTheme>) => Promise<void>;
  onNotify?: (message: StatusFeedbackMessage) => void;
  onLanguageChange: (language: AppLanguage) => Promise<boolean>;
};

function ThemeSettings({
  isBusy,
  language,
  themeMode,
  themePreset,
  themeAccent,
  themeCustomAccent,
  themeOpacity,
  themeNavigationOpacity,
  themeBackgroundOpacity,
  themeWorkspaceOpacity,
  themeAccentOpacity,
  themeCustomAccents,
  customTheme,
  onThemeModeChange,
  onThemePresetChange,
  onThemeAccentChange,
  onThemeOpacityChange,
  onThemeNavigationOpacityChange,
  onThemeBackgroundOpacityChange,
  onThemeWorkspaceOpacityChange,
  onThemeAccentOpacityChange,
  onCustomThemeChange,
  onNotify,
  onLanguageChange,
}: ThemeSettingsProps) {
  const { t } = useLocale();
  void onThemeOpacityChange;
  const [savingThemeMode, setSavingThemeMode] = useState<ThemeMode | null>(null);
  const [savingThemePreset, setSavingThemePreset] = useState<ThemePreset | null>(null);
  const [savingThemeAccent, setSavingThemeAccent] = useState<ThemeAccent | null>(null);
  const [savingLanguage, setSavingLanguage] = useState<AppLanguage | null>(null);
  const [isChoosingBackground, setIsChoosingBackground] = useState(false);

  async function handleLanguageChange(nextLanguage: AppLanguage) {
    if (nextLanguage === language || savingLanguage) return;
    setSavingLanguage(nextLanguage);
    try {
      await onLanguageChange(nextLanguage);
    } finally {
      setSavingLanguage((current) => (current === nextLanguage ? null : current));
    }
  }

  async function handleThemeModeChange(nextThemeMode: ThemeMode) {
    if (nextThemeMode === themeMode || savingThemeMode || savingThemePreset || savingThemeAccent) {
      return;
    }

    setSavingThemeMode(nextThemeMode);
    try {
      await onThemeModeChange(nextThemeMode);
    } finally {
      setSavingThemeMode((current) => (current === nextThemeMode ? null : current));
    }
  }

  async function handleThemePresetChange(nextThemePreset: ThemePreset) {
    if (nextThemePreset === themePreset || savingThemeMode || savingThemePreset || savingThemeAccent) {
      return;
    }

    setSavingThemePreset(nextThemePreset);
    try {
      await onThemePresetChange(nextThemePreset);
    } finally {
      setSavingThemePreset((current) => (current === nextThemePreset ? null : current));
    }
  }

  async function handleThemeAccentChange(
    nextThemeAccent: ThemeAccent,
    nextCustomAccent?: string,
    customAccentSlot?: ThemeCustomAccentSlot,
  ) {
    const slot = customAccentSlot ?? (isThemeCustomAccentSlot(nextThemeAccent) ? nextThemeAccent : nextThemeAccent === "custom" ? "custom1" : null);
    const slotIndex = slot === "custom2" ? 1 : slot === "custom3" ? 2 : 0;
    const currentCustomAccent = slot ? themeCustomAccents[slotIndex] : themeCustomAccent;
    const resolvedCustomAccent = nextCustomAccent ?? currentCustomAccent;
    if (
      (nextThemeAccent === themeAccent &&
        (!slot || resolvedCustomAccent === currentCustomAccent)) ||
      savingThemeMode ||
      savingThemePreset ||
      savingThemeAccent
    ) {
      return;
    }

    setSavingThemeAccent(nextThemeAccent);
    try {
      await onThemeAccentChange(nextThemeAccent, resolvedCustomAccent, slot ?? undefined);
    } finally {
      setSavingThemeAccent((current) => (current === nextThemeAccent ? null : current));
    }
  }

  const controlsDisabled = isBusy || savingThemeMode !== null || savingThemePreset !== null || savingThemeAccent !== null;
  const defaultAccent = getDefaultThemeAccentForPreset(themePreset);
  const defaultAccentColor = themePreset === "custom"
    ? customTheme.accentColor
    : getThemeAccentColor(defaultAccent, themeMode);
  const orderedAccentOptions = [
    ...themeAccentOptions.filter((option) => option.value !== defaultAccent),
  ];

  async function handleChooseBackground() {
    if (isChoosingBackground || controlsDisabled) return;
    setIsChoosingBackground(true);
    try {
      const result = await window.suyanApi.chooseThemeBackgroundImage();
      if (!result.ok) {
        onNotify?.({ type: "error", text: result.error.message });
        return;
      }
      if (!result.data.canceled && result.data.imageFileName) {
        await onCustomThemeChange({ backgroundImageFileName: result.data.imageFileName });
      }
    } finally {
      setIsChoosingBackground(false);
    }
  }

  async function handleClearBackground() {
    const imageFileName = customTheme.backgroundImageFileName;
    if (!imageFileName || controlsDisabled) return;
    await window.suyanApi.removeThemeBackgroundImage(imageFileName);
    await onCustomThemeChange({ backgroundImageFileName: null });
  }

  async function handleCustomColorChange(key: keyof Pick<ThemeCustomTheme, "navigationColor" | "backgroundColor" | "workspaceColor" | "accentColor">, value: string) {
    await onCustomThemeChange({ [key]: value });
    if (key === "accentColor") {
      await handleThemeAccentChange("custom", value);
    }
  }

  return (
    <div data-feature-guide="appearance-colors" className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("主题")}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            {t("选择应用的颜色方案，点击后立即生效并自动保存。")} {t("当前主题")}：{t(themePresetOptions.find((option) => option.value === themePreset)?.label ?? "Raycast")}
          </p>
        </div>

        <div className="grid gap-3 min-[720px]:grid-cols-2">
          <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t("界面语言")}</h4>
              <p className="mt-1 text-xs leading-5 text-muted">{t("默认中文，可在这里切换为英文。")}</p>
            </div>
            <div aria-label={t("界面语言")} className="grid grid-cols-2 gap-2" role="group">
              {([
                ["zh-CN", "中文"],
                ["en-US", "英文"],
              ] as const).map(([value, label]) => {
                const selected = value === language;
                return (
                  <button
                    aria-pressed={selected}
                    className={`flex min-h-10 items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${selected ? "border-primary bg-primary-soft font-semibold text-foreground" : "border-border bg-background text-muted hover:bg-panel hover:text-foreground"}`}
                    disabled={isBusy || savingLanguage !== null}
                    key={value}
                    type="button"
                    onClick={() => void handleLanguageChange(value)}
                  >
                    {t(label)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t("显示模式")}</h4>
              <p className="mt-1 text-xs leading-5 text-muted">{t("选择浅色或深色界面。")}</p>
            </div>
            <div aria-label={t("显示模式")} className="grid grid-cols-2 gap-2" role="group">
              {([
                { value: "light" as const, icon: <Sun size={15} /> },
                { value: "dark" as const, icon: <Moon size={15} /> },
              ] satisfies Array<{ value: ThemeMode; icon: ReactNode }>).map((option) => {
                const selected = option.value === themeMode;
                const changing = savingThemeMode === option.value;

                return (
                  <button
                    aria-pressed={selected}
                    className={`flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${selected ? "border-primary bg-primary-soft font-semibold text-foreground" : "border-border bg-background text-muted hover:bg-panel hover:text-foreground"}`}
                    disabled={controlsDisabled}
                    key={option.value}
                    type="button"
                    onClick={() => void handleThemeModeChange(option.value)}
                  >
                    {changing ? <span aria-label={t("保存中")} className="size-3 animate-pulse rounded-full bg-current" /> : option.icon}
                    <span>{t(getThemeModeLabel(option.value))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <label className="grid gap-2 rounded-xl border border-border bg-background/60 p-4">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span>{t("导航区不透明度")}</span>
              <output aria-live="polite" className="font-semibold text-primary">{themeNavigationOpacity}%</output>
            </span>
            <input
              aria-label={t("导航区不透明度")}
              className="w-full accent-primary"
              disabled={controlsDisabled}
              max={100}
              min={15}
              step={1}
              type="range"
              value={themeNavigationOpacity}
              onChange={(event) => void onThemeNavigationOpacityChange(Number(event.target.value))}
            />
            <span className="flex justify-between text-[11px] text-muted"><span>{t("更透")}</span><span>{t("更实")}</span></span>
          </label>
          <label className="grid gap-2 rounded-xl border border-border bg-background/60 p-4">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span>{t("背景层不透明度")}</span>
              <output aria-live="polite" className="font-semibold text-primary">{themeBackgroundOpacity}%</output>
            </span>
            <input aria-label={t("背景层不透明度")} className="w-full accent-primary" disabled={controlsDisabled} max={100} min={15} step={1} type="range" value={themeBackgroundOpacity} onChange={(event) => void onThemeBackgroundOpacityChange(Number(event.target.value))} />
            <span className="flex justify-between text-[11px] text-muted"><span>{t("半透明")}</span><span>{t("完全不透明")}</span></span>
          </label>
          <label className="grid gap-2 rounded-xl border border-border bg-background/60 p-4">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span>{t("工作区不透明度")}</span>
              <output aria-live="polite" className="font-semibold text-primary">{themeWorkspaceOpacity}%</output>
            </span>
            <input aria-label={t("工作区不透明度")} className="w-full accent-primary" disabled={controlsDisabled} max={100} min={15} step={1} type="range" value={themeWorkspaceOpacity} onChange={(event) => void onThemeWorkspaceOpacityChange(Number(event.target.value))} />
            <span className="flex justify-between text-[11px] text-muted"><span>{t("半透明")}</span><span>{t("完全不透明")}</span></span>
          </label>
          <label className="grid gap-2 rounded-xl border border-border bg-background/60 p-4">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              <span>{t("主色调不透明度")}</span>
              <output aria-live="polite" className="font-semibold text-primary">{themeAccentOpacity}%</output>
            </span>
            <input
              aria-label={t("主色调不透明度")}
              className="w-full accent-primary"
              disabled={controlsDisabled}
              max={100}
              min={30}
              step={1}
              type="range"
              value={themeAccentOpacity}
              onChange={(event) => void onThemeAccentOpacityChange(Number(event.target.value))}
            />
            <span className="flex justify-between text-[11px] text-muted"><span>{t("较淡")}</span><span>{t("完全不透明")}</span></span>
          </label>
        </div>

        <ThemeRoleColors customTheme={customTheme} themeMode={themeMode} themePreset={themePreset} disabled={controlsDisabled} onChange={onCustomThemeChange} />
        <div className="grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-foreground">{t("主色调")}</span>
            <span className="text-xs text-muted">{t("与资源推荐卡片色系一致")}</span>
          </div>
          <div
            aria-label={t("主色调")}
            className="theme-accent-options"
            role="radiogroup"
          >
            <button
              aria-checked={themeAccent === defaultAccent}
                  aria-label={`${t("主色调")}：${themePreset === "custom" ? t("自定义主题") : t("主题默认")}`}
              className={`theme-accent-option ${themeAccent === defaultAccent ? "theme-accent-option--selected" : ""}`}
              disabled={controlsDisabled}
              role="radio"
                  title={t("当前主题默认颜色")}
              type="button"
              onClick={() => void handleThemeAccentChange(defaultAccent, defaultAccent === "custom" ? customTheme.accentColor : undefined)}
            >
              <span aria-hidden="true" className="theme-accent-option__swatch" style={{ backgroundColor: defaultAccentColor }} />
              <span className="theme-accent-option__label">{t("主题默认")}</span>
            </button>
            {orderedAccentOptions.map((option) => {
              const selected = themeAccent === option.value;
              const changing = savingThemeAccent === option.value;

              return (
                <button
                  aria-checked={selected}
                  aria-label={t("主色调：{label}", { label: t(option.label) })}
                  className={`theme-accent-option ${selected ? "theme-accent-option--selected" : ""} ${changing ? "theme-accent-option--saving" : ""}`}
                  disabled={controlsDisabled}
                  key={option.value}
                  role="radio"
                  title={t("{label}：{description}", { label: t(option.label), description: t(option.description) })}
                  type="button"
                  onClick={() => void handleThemeAccentChange(option.value)}
                >
                  <span
                    aria-hidden="true"
                    className="theme-accent-option__swatch"
                    style={{ backgroundColor: getThemeAccentColor(option.value, themeMode) }}
                  />
                  <span className="theme-accent-option__label">{t(option.label)}</span>
                </button>
              );
            })}
            {themeCustomAccentOptions.map((option, index) => {
              const customAccent = themeCustomAccents[index] ?? themeCustomAccent;
              const selected = themeAccent === option.value || (themeAccent === "custom" && option.value === "custom1");
              const changing = savingThemeAccent === option.value;
              return (
                <div
                  aria-checked={selected}
                  className={`theme-accent-option theme-accent-option--custom ${selected ? "theme-accent-option--selected" : ""} ${changing ? "theme-accent-option--saving" : ""}`}
                  key={option.value}
                  role="radio"
                >
                  <button
                    aria-label={t("主色调：{label}", { label: t(option.label) })}
                    className="theme-accent-option__custom-button"
                    disabled={controlsDisabled}
                    title={t("{label}：{description}", { label: t(option.label), description: t(option.description) })}
                    type="button"
                    onClick={() => void handleThemeAccentChange(option.value, customAccent, option.value)}
                  >
                    <span aria-hidden="true" className="theme-accent-option__swatch" style={{ backgroundColor: customAccent }} />
                    <span className="theme-accent-option__label">{t(option.label)}</span>
                  </button>
                  <label className="theme-accent-option__color-picker" title={t("选择{label}", { label: t(option.label) })}>
                    <input
                      aria-label={t("主色调：{label}", { label: t(option.label) })}
                      disabled={controlsDisabled}
                      type="color"
                      value={customAccent}
                      onChange={(event) => void handleThemeAccentChange(option.value, event.target.value, option.value)}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted">{t("当前主题默认颜色固定排在第一位；自定义颜色会按主题分别记忆。")}</p>
        </div>

        {themePreset === "custom" ? (
          <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t("自定义主题颜色")}</h4>
              <p className="mt-1 text-xs leading-5 text-muted">{t("分别调整导航区、背景层、工作区和主色调；次要色与第三色在上方独立设置。")}</p>
            </div>
            <div className="grid gap-3 min-[620px]:grid-cols-2">
              {([
                ["navigationColor", "导航区颜色"],
                ["backgroundColor", "背景层颜色"],
                ["workspaceColor", "工作区背景"],
                ["accentColor", "主色调"],
              ] as const).map(([key, label]) => (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel/70 px-3 py-2" key={key}>
                  <span className="text-sm text-foreground">{t(label)}</span>
                  <input aria-label={t(label)} className="size-8 cursor-pointer rounded-md border-0 bg-transparent p-0" type="color" value={customTheme[key]} onChange={(event) => void handleCustomColorChange(key, event.target.value)} />
                </label>
              ))}
            </div>
            <div className="grid gap-2 rounded-lg border border-border bg-panel/70 p-3">
              <span className="text-sm font-medium text-foreground">{t("背景图像")}</span>
              <div className="flex flex-wrap items-center gap-2">
                <button className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-primary-soft" disabled={controlsDisabled || isChoosingBackground} type="button" onClick={() => void handleChooseBackground()}>
                  {isChoosingBackground ? t("选择中...") : t("选择图像")}
                </button>
                {customTheme.backgroundImageFileName ? <button className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-danger-soft hover:text-danger" disabled={controlsDisabled} type="button" onClick={() => void handleClearBackground()}>{t("清除背景图")}</button> : null}
                <span className="min-w-0 truncate text-xs text-muted">{customTheme.backgroundImageFileName ? t("已设置自定义背景图") : t("未设置，使用纯色背景")}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div aria-label={t("主题预设")} className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 min-[900px]:grid-cols-3" role="radiogroup">
          {themePresetOptions.map((option) => {
            const selected = option.value === themePreset;
            const changing = savingThemePreset === option.value;

            return (
              <button
                aria-checked={selected}
                className={`theme-preset-card ${selected ? "theme-preset-card--selected" : ""}`}
                disabled={isBusy || savingThemePreset !== null}
                key={option.value}
                role="radio"
                type="button"
                onClick={() => void handleThemePresetChange(option.value)}
              >
                <span aria-hidden="true" className="theme-preset-preview" data-theme-preview={option.value}>
                  <span className="theme-preset-preview__chrome">
                    <span className="theme-preset-preview__dot" />
                    <span className="theme-preset-preview__line" />
                  </span>
                  <span className="theme-preset-preview__body">
                    <span className="theme-preset-preview__sidebar" />
                    <span className="theme-preset-preview__content">
                      <span className="theme-preset-preview__accent" />
                      <span className="theme-preset-preview__text" />
                      <span className="theme-preset-preview__text theme-preset-preview__text--short" />
                    </span>
                  </span>
                </span>
                <span className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{t(option.label)}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">{t(option.description)}</span>
                  </span>
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${selected ? "bg-primary text-primary-foreground" : "bg-background text-transparent"}`}>
                    {changing ? <span aria-label={t("保存中")} className="size-3 animate-pulse rounded-full bg-current" /> : <Check size={14} />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type SidebarEntriesSettingsProps = {
  isBusy: boolean;
  visibility: SidebarEntryVisibility;
  onVisibilityChange: (entryId: SidebarEntryId, visible: boolean) => Promise<boolean>;
};

function SidebarEntriesSettings({
  isBusy,
  visibility,
  onVisibilityChange,
}: SidebarEntriesSettingsProps) {
  const { t } = useLocale();
  const [savingEntryId, setSavingEntryId] = useState<SidebarEntryId | null>(null);

  async function handleVisibilityChange(entryId: SidebarEntryId, visible: boolean) {
    if (requiredSidebarEntryIds.includes(entryId as (typeof requiredSidebarEntryIds)[number])) {
      return;
    }

    setSavingEntryId(entryId);
    try {
      await onVisibilityChange(entryId, visible);
    } finally {
      setSavingEntryId((current) => (current === entryId ? null : current));
    }
  }

  return (
    <div data-feature-guide="system-preferences-panel-sidebar" className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("边栏入口")}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{t("关闭不常用的入口，设置会即时保存并在下次启动时保留。")}</p>
        </div>

        <div className="grid gap-4">
          {sidebarEntryGroups.map((group) => (
            <section
              className="grid gap-1 rounded-xl border border-border bg-background/60 p-3 min-[640px]:p-4"
              key={group.id}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-foreground">{t(group.label)}</h4>
                <span className="text-[11px] text-muted">{group.entries.length} {t("个入口")}</span>
              </div>
              {group.entries.map((entryId) => (
                <SidebarEntryPreferenceRow
                  entryId={entryId}
                  isBusy={isBusy || savingEntryId === entryId}
                  isFixed={requiredSidebarEntryIds.includes(entryId as (typeof requiredSidebarEntryIds)[number])}
                  key={entryId}
                  visible={visibility[entryId]}
                  onChange={(visible) => void handleVisibilityChange(entryId, visible)}
                />
              ))}
            </section>
          ))}

          <section className="grid gap-1 rounded-xl border border-border bg-background/60 p-3 min-[640px]:p-4">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">{t("底部入口")}</h4>
              <span className="text-[11px] text-muted">{sidebarFooterEntryIds.length} {t("个入口")}</span>
            </div>
            {sidebarFooterEntryIds.map((entryId) => (
              <SidebarEntryPreferenceRow
                entryId={entryId}
                isBusy={isBusy || savingEntryId === entryId}
                isFixed={false}
                key={entryId}
                visible={visibility[entryId]}
                onChange={(visible) => void handleVisibilityChange(entryId, visible)}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

type SidebarEntryPreferenceRowProps = {
  entryId: SidebarEntryId;
  isBusy: boolean;
  isFixed: boolean;
  visible: boolean;
  onChange: (visible: boolean) => void;
};

function SidebarEntryPreferenceRow({
  entryId,
  isBusy,
  isFixed,
  visible,
  onChange,
}: SidebarEntryPreferenceRowProps) {
  const { t } = useLocale();
  const meta = sidebarEntryMeta[entryId];

  return (
    <label className="flex min-h-14 items-center justify-between gap-4 border-t border-border/70 py-2.5 first:border-t-0">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
            visible ? "bg-primary-soft text-primary" : "bg-background text-muted"
          }`}
        >
          {visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{t(meta.label)}</span>
          <span className="mt-0.5 block truncate text-xs text-muted">{t(meta.description)}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {isFixed ? <span className="text-[11px] text-muted">{t("固定")}</span> : null}
        <input
          aria-label={`${t(meta.label)}${t("入口")}`}
          checked={visible}
          className="size-4 accent-primary"
          disabled={isFixed || isBusy}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );
}

type WorkspaceLayoutSettingsProps = {
  workspaceWidthPercent: number;
  onWorkspaceWidthChange: (widthPercent: number) => void;
};

function WorkspaceLayoutSettings({
  workspaceWidthPercent,
  onWorkspaceWidthChange,
}: WorkspaceLayoutSettingsProps) {
  const { t } = useLocale();
  const [draftWidthPercent, setDraftWidthPercent] = useState(workspaceWidthPercent);

  useEffect(() => {
    setDraftWidthPercent(workspaceWidthPercent);
  }, [workspaceWidthPercent]);

  function handleWidthChange(value: string) {
    const nextWidthPercent = Number(value);
    setDraftWidthPercent(nextWidthPercent);
    onWorkspaceWidthChange(nextWidthPercent);
  }

  return (
    <div data-feature-guide="system-preferences-panel-layout" className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("界面布局")}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{t("调整首页、创作画布和其他页面的工作区宽度。")}</p>
        </div>

        <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-3 min-[640px]:p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">{t("实时预览")}</span>
            <span className="text-xs text-muted">{t("工作区")} {draftWidthPercent}%</span>
          </div>
          <div
            aria-label={t("工作区布局预览")}
            className="aspect-[16/9] min-h-52 overflow-hidden rounded-lg border border-border bg-background p-2.5 min-[640px]:p-3"
          >
            <div className="grid h-full grid-rows-[1.65rem_minmax(0,1fr)] overflow-hidden rounded-md border border-border bg-panel shadow-sm">
              <div className="flex items-center gap-1.5 border-b border-border px-2">
                <span className="size-2 rounded-full bg-primary/70" />
                <span className="h-1.5 w-16 rounded-full bg-border" />
              </div>
              <div className="flex min-h-0">
                <aside className="flex w-11 shrink-0 items-center justify-center border-r border-border bg-panel/95">
                  <span className="rounded border border-border px-1 py-5 text-[10px] text-muted [writing-mode:vertical-rl]">{t("导航")}</span>
                </aside>
                <div className="flex min-w-0 flex-1 items-center justify-center bg-background p-2">
                  <div
                    className="flex h-full min-w-0 items-center justify-center rounded border border-primary/35 bg-panel px-2 shadow-sm"
                    style={{ width: `${draftWidthPercent}%` }}
                  >
                    <span className="rounded border border-border bg-background px-2 py-1 text-[10px] text-muted">{t("工作区")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <label className="grid gap-2 rounded-xl border border-border bg-background/60 p-4">
          <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
            <span>{t("工作区宽度")}</span>
            <output aria-live="polite" className="font-semibold text-primary">{draftWidthPercent}%</output>
          </span>
          <input
            aria-label={t("工作区宽度")}
            className="w-full accent-primary"
            max={100}
            min={70}
            step={1}
            type="range"
            value={draftWidthPercent}
            onChange={(event) => handleWidthChange(event.target.value)}
          />
          <span className="flex justify-between text-[11px] text-muted">
            <span>{t("更宽背景")}</span>
            <span>{t("最大工作区")}</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function VisualLifeSettingsPanel({
  settings,
  onChange,
}: {
  settings: VisualLifeSettings;
  onChange: (patch: Partial<VisualLifeSettings>) => Promise<boolean>;
}) {
  const { t } = useLocale();
  const effectLabels: Record<VisualLifeEffectId, string> = {
    stardust: "星尘",
    meteor: "流星",
    rainbow: "自然彩虹",
    fallingPetal: "飘落花瓣",
    geese: "大雁飞过",
    musicNote: "音符",
    cosmicDust: "宇宙尘埃",
    heart: "扩散爱心",
  };
  const modeOptions: Array<{ value: VisualLifeMode; label: string; description: string }> = [
    { value: "smart", label: "智能匹配", description: "按已有分类和标签选择更合适的氛围。" },
    { value: "custom", label: "自定义效果", description: "只从下方勾选的效果中选择。" },
    { value: "random", label: "完全随机", description: "每张卡片稳定随机一种效果。" },
    { value: "static", label: "静态彩虹", description: "保留静态外扩光带，不播放粒子动画。" },
  ];
  const intensityOptions: Array<{ value: VisualLifeIntensity; label: string }> = [
    { value: "low", label: "低" },
    { value: "standard", label: "标准" },
    { value: "dreamy", label: "梦幻" },
    { value: "immersive", label: "沉浸" },
  ];

  async function update(patch: Partial<VisualLifeSettings>) {
    await onChange(patch);
  }

  function toggleEffect(effect: VisualLifeEffectId) {
    const next = settings.effectPool.includes(effect)
      ? settings.effectPool.filter((entry) => entry !== effect)
      : [...settings.effectPool, effect];
    if (next.length === 0) return;
    void update({ effectPool: next, mode: "custom" });
  }

  return (
    <div data-feature-guide="system-preferences-panel-visual-life" className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("视觉生命")}</h3>
          <p className="mt-1 text-sm leading-6 text-muted">{t("鼠标经过素材卡片时，让图片用轻量光效回应；效果只在当前卡片附近运行。")}</p>
        </div>

        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <label data-feature-guide="visual-life-sheen-toggle" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/60 p-4">
            <span>
              <span className="block text-sm font-semibold text-foreground">{t("图像内扫光")}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{t("只在图像内部显示扫光，不会遮挡图像内容。")}</span>
            </span>
            <input
              aria-label={t("图像内扫光")}
              checked={settings.sheenEnabled}
              className="size-4 accent-primary"
              type="checkbox"
              onChange={(event) => void update({ sheenEnabled: event.target.checked })}
            />
          </label>
          <label data-feature-guide="visual-life-outer-toggle" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/60 p-4">
            <span>
              <span className="block text-sm font-semibold text-foreground">{t("卡片外部光效")}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{t("只在图像卡片外向四周扩散，不覆盖图像。")}</span>
            </span>
            <input
              aria-label={t("卡片外部光效")}
              checked={settings.outerEffectsEnabled}
              className="size-4 accent-primary"
              type="checkbox"
              onChange={(event) => void update({ outerEffectsEnabled: event.target.checked })}
            />
          </label>
        </div>

        <section data-feature-guide="visual-life-mode" className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t("效果模式")}</h4>
            <p className="mt-1 text-xs leading-5 text-muted">{t("默认使用自定义效果池，只启用星尘、宇宙尘埃和流星。")}</p>
          </div>
          <div className="grid gap-2 min-[700px]:grid-cols-2">
            {modeOptions.map((option) => {
              const selected = settings.mode === option.value;
              return (
                <button
                  aria-pressed={selected}
                  className={`grid gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${selected ? "border-primary bg-primary-soft" : "border-border bg-background hover:bg-panel"}`}
                  key={option.value}
                  type="button"
                  onClick={() => void update({ mode: option.value })}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                    {t(option.label)}
                    {selected ? <Check size={14} className="text-primary" /> : null}
                  </span>
                  <span className="text-xs leading-5 text-muted">{t(option.description)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section data-feature-guide="visual-life-intensity" className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t("效果强度")}</h4>
            <p className="mt-1 text-xs leading-5 text-muted">{t("强度只改变粒子数量和透明度，不会改变卡片尺寸。")}</p>
          </div>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("效果强度")}>
            {intensityOptions.map((option) => (
              <button
                aria-pressed={settings.intensity === option.value}
                className={`min-h-9 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 ${settings.intensity === option.value ? "border-primary bg-primary-soft text-foreground" : "border-border text-muted hover:bg-panel"}`}
                key={option.value}
                type="button"
                onClick={() => void update({ intensity: option.value })}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </section>

        <section data-feature-guide="visual-life-effect-pool" className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">{t("自定义效果池")}</h4>
           <p className="mt-1 text-xs leading-5 text-muted">{t("点击勾选会立即切换到自定义模式；可同时保留多种效果，至少保留一种。")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3">
            {visualLifeEffectIds.map((effect) => (
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm" key={effect}>
                <input checked={settings.effectPool.includes(effect)} className="size-4 accent-primary" type="checkbox" onChange={() => toggleEffect(effect)} />
                <span>{t(effectLabels[effect])}</span>
              </label>
            ))}
          </div>
        </section>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/60 p-4">
          <span>
            <span className="block text-sm font-semibold text-foreground">{t("减少动态效果")}</span>
          <span className="mt-1 block text-xs leading-5 text-muted">{t("只保留静态彩虹，并优先遵循系统的减少动态效果偏好。")}</span>
          </span>
          <input aria-label={t("减少动态效果")} checked={settings.reduced} className="size-4 accent-primary" type="checkbox" onChange={(event) => void update({ reduced: event.target.checked })} />
        </label>
      </div>
    </div>
  );
}
