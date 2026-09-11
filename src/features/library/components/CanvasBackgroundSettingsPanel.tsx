import { useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useLibraryStore } from "../store/useLibraryStore";
import { canvasBackgroundImageUrl, type CanvasBackgroundSettings } from "../utils/canvasBackground";
import { isThemeCustomAccent } from "../utils/themeMode";

const options = [
  { mode: "mist", label: "柔雾渐变（默认）", description: "整页玻璃背景，随主题变化并保留光效。" },
  { mode: "white", label: "经典白色", description: "将创作页面底色设为白色。" },
  { mode: "color", label: "自定义颜色", description: "使用你选择的纯色。" },
  { mode: "image", label: "自定义图片", description: "使用本地图片铺满创作页面。" },
] as const;

export function CanvasBackgroundSettingsPanel({ isBusy = false }: { isBusy?: boolean }) {
  const { t } = useLocale();
  const settings = useLibraryStore(state => state.canvasBackground);
  const save = useLibraryStore(state => state.saveCanvasBackground);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [defaultColor] = useState(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas-default-custom-color").trim());
  const [color, setColor] = useState(settings.color ?? defaultColor);
  useEffect(() => setColor(settings.color ?? defaultColor), [settings.color, defaultColor]);
  const disabled = isBusy || working;
  async function persist(patch: Partial<CanvasBackgroundSettings>) {
    const ok = await save(patch);
    setMessage(ok ? t("页面背景已保存") : t("保存失败，请重试。原设置已保留。"));
    return ok;
  }
  async function update(patch: Partial<CanvasBackgroundSettings>) {
    if (disabled) return;
    setWorking(true);
    try { await persist(patch); } finally { setWorking(false); }
  }
  async function chooseImage() {
    if (disabled) return;
    setWorking(true);
    setMessage("");
    try {
      const result = await window.suyanApi.chooseThemeBackgroundImage();
      if (!result.ok) { setMessage(result.error.message); return; }
      if (result.data.canceled || !result.data.imageFileName) return;
      // Each selection gets its own managed file. Never remove a file that could
      // still be referenced by another queued settings write or the global theme.
      await persist({ mode: "image", imageFileName: result.data.imageFileName });
    } catch { setMessage(t("无法选择背景图片，请重试。")); }
    finally { setWorking(false); }
  }
  return (
    <section data-feature-guide="system-preferences-panel-canvasBackground" className="min-h-0 flex-1 overflow-y-auto" aria-label={t("创作页面背景设置")}>
      <h3 className="text-base font-semibold">{t("创作页面背景")}</h3>
      <p className="mt-2 text-sm text-muted">{t("设置标题栏下方、主导航右侧的整页底色或图片，包括创作参数与生成卡片周围的区域。右侧生成卡片保持原有柔雾效果。选择会自动保存。")}</p>
      <div role="radiogroup" aria-label={t("页面背景样式")} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map(option => (
          <button key={option.mode} type="button" role="radio" aria-checked={settings.mode === option.mode} disabled={disabled}
            className={`rounded-xl border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary ${settings.mode === option.mode ? "border-primary bg-primary-soft" : "border-border bg-panel hover:bg-background"}`}
            onClick={() => option.mode === "image" && !settings.imageFileName ? void chooseImage() : void update({ mode: option.mode })}>
            <span className="block font-medium">{t(option.label)}</span>
            <span className="mt-1 block text-xs leading-5 text-muted">{t(option.description)}</span>
          </button>
        ))}
      </div>
      {settings.mode === "color" ? (
        <div className="mt-5 rounded-xl border border-border p-4">
          <label htmlFor="canvas-background-color" className="text-sm font-medium">{t("页面背景颜色")}</label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input aria-label={t("选择页面背景颜色")} type="color" disabled={disabled} value={isThemeCustomAccent(color) ? color : defaultColor}
              className="size-10 cursor-pointer" onChange={event => setColor(event.target.value)} />
            <input id="canvas-background-color" type="text" spellCheck={false} maxLength={7} placeholder="#RRGGBB" value={color} disabled={disabled}
              className="w-32 rounded-md border border-border bg-panel px-3 py-2 text-sm" onChange={event => setColor(event.target.value)} />
            <button type="button" disabled={disabled || !isThemeCustomAccent(color)} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => void update({ color })}>{t("应用颜色")}</button>
          </div>
          <p className="mt-2 text-xs text-muted">{t("支持六位十六进制色号，点击“应用颜色”保存。")}</p>
        </div>
      ) : null}
      {settings.mode === "image" ? (
        <div className="mt-5 rounded-xl border border-border p-4">
          {settings.imageFileName ? <img key={settings.imageFileName} alt={t("页面背景预览")} className="mb-3 max-h-48 w-full rounded-lg object-contain"
            src={canvasBackgroundImageUrl(settings.imageFileName)} onError={event => { event.currentTarget.hidden = true; setMessage(t("背景图片无法读取，请重新选择。")); }} /> : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={disabled} className="rounded-md border border-border px-3 py-2 text-sm" onClick={() => void chooseImage()}>{working ? t("处理中…") : t("选择背景图片")}</button>
            <button type="button" disabled={disabled} className="rounded-md border border-border px-3 py-2 text-sm" onClick={() => void update({ mode: "mist", imageFileName: null })}>{t("移除图片并恢复默认")}</button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">{t("支持 PNG、JPEG、WebP、GIF、BMP，最大 50 MB。图片会保存到软件数据目录，居中铺满，超出部分裁切；GIF 使用静态画面。")}</p>
        </div>
      ) : null}
      <p role="status" className="mt-4 min-h-5 text-sm text-muted">{working ? t("正在处理页面背景…") : message}</p>
    </section>
  );
}
