import { useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import type { ThemeCustomTheme, ThemeMode, ThemePreset } from "../types/library";

type Props = {
  customTheme: ThemeCustomTheme;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  disabled: boolean;
  onChange: (patch: Partial<ThemeCustomTheme>) => Promise<void>;
};

export function ThemeRoleColors({ customTheme, themeMode, themePreset, disabled, onChange }: Props) {
  const { t } = useLocale();
  const [colors, setColors] = useState(() => {
    const css = getComputedStyle(document.documentElement);
    return { secondary: css.getPropertyValue("--color-secondary").trim(), tertiary: css.getPropertyValue("--color-tertiary").trim() };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    setColors({ secondary: css.getPropertyValue("--color-secondary").trim(), tertiary: css.getPropertyValue("--color-tertiary").trim() });
  }, [themeMode, themePreset, customTheme.secondaryColor, customTheme.tertiaryColor]);
  async function save(patch: Partial<ThemeCustomTheme>) {
    setSaving(true); setError("");
    try { await onChange(patch); }
    catch { setError(t("配色保存失败，请重试。")); }
    finally { setSaving(false); }
  }
  return <section aria-label={t("主色 · 次要色 · 第三色")} className="theme-section grid gap-3 rounded-xl border p-4">
    <div><h4 className="text-sm font-semibold">{t("主色 · 次要色 · 第三色")}</h4><p className="mt-1 text-xs leading-5 text-muted">{t("主色用于导航与页面重点；次要色用于操作按钮；第三色用于休息日与辅助信息。自动配色随主题和明暗模式适配，自定义角色色全局生效。")}</p></div>
    <div className="grid gap-3 min-[720px]:grid-cols-3">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-panel/70 p-3"><span className="theme-role-swatch bg-primary" /><div><strong className="text-sm">{t("主色调")}</strong><p className="text-xs text-muted">{t("使用下方主色调选择")}</p></div></div>
      {([['secondary', 'secondaryColor', '次要色', '按钮与操作'], ['tertiary', 'tertiaryColor', '第三色', '休息日与辅助信息']] as const).map(([role, key, label, description]) => <label key={role} className="grid gap-2 rounded-xl border border-border bg-panel/70 p-3">
        <span className="flex items-center justify-between gap-2"><strong className="text-sm">{t(label)}</strong><input aria-label={t(label)} type="color" className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0" disabled={disabled || saving} value={customTheme[key] ?? colors[role]} onChange={(event) => void save({ [key]: event.target.value })} /></span>
        <span className="text-xs text-muted">{t(description)} · {customTheme[key] ? t("自定义") : t("跟随主题")}</span>
      </label>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><div aria-label={t("角色颜色预览")} className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">{t("导航选中")}</span><span className="rounded-lg bg-secondary px-3 py-2 text-secondary-foreground">{t("操作按钮")}</span><span className="rounded-lg border border-tertiary-border bg-tertiary-soft px-3 py-2 text-tertiary-ink">{t("休息日")}</span><span className="rounded-lg border border-border bg-panel px-3 py-2 text-foreground">{t("工作日")}</span></div><button type="button" className="theme-action-control rounded-lg border px-3 py-2 text-xs disabled:opacity-50" disabled={disabled || saving || (!customTheme.secondaryColor && !customTheme.tertiaryColor)} onClick={() => void save({ secondaryColor: null, tertiaryColor: null })}>{t("恢复次要色与第三色自动配色")}</button></div>
    {saving ? <p role="status" className="text-xs text-muted">{t("正在保存配色…")}</p> : null}
    {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
  </section>;
}
