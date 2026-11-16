import { memo, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { formatImagePaletteColor, type ImagePaletteCodeFormat } from "../utils/imagePalette";

export const LibraryColorPalette = memo(function LibraryColorPalette({ colors }: { colors: readonly string[] }) {
  const { t } = useLocale();
  const [format, setFormat] = useState<ImagePaletteCodeFormat>("hex");
  const [active, setActive] = useState(colors[0] ?? "");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setActive(colors[0] ?? ""); setCopied(""); setError(""); }, [colors]);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(""), 1800); return () => clearTimeout(timer); }, [copied]);
  const copyColor = async (hex: string) => {
    setActive(hex); setError(""); setCopied("");
    const code = formatImagePaletteColor(hex, format);
    if (!code) return;
    try {
      const result = await window.suyanApi.writeClipboardText(code);
      if (result.ok) setCopied(code);
      else setError(result.error.message || t("色号复制失败，请重试。"));
    } catch { setError(t("色号复制失败，请重试。")); }
  };
  if (!colors.length) return null;
  const code = formatImagePaletteColor(active || colors[0], format);
  return <div className="mt-2 shrink-0" data-library-color-palette>
    <div aria-label={t("图片主色")} className="flex h-6 overflow-hidden rounded-md border border-border/50">
      {colors.map(hex => <button aria-label={t("复制颜色") + " " + hex} className="h-full min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" data-palette-color={hex} key={hex} style={{ backgroundColor: hex }} title={formatImagePaletteColor(hex, format)} type="button" onMouseEnter={() => setActive(hex)} onFocus={() => setActive(hex)} onClick={() => void copyColor(hex)} />)}
    </div>
    <div className="mt-1 flex min-h-7 min-w-0 items-center justify-between gap-1 text-[10px] text-muted">
      <select aria-label={t("色号格式")} className="h-6 shrink-0 rounded border-0 bg-transparent pr-1 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-primary" value={format} onChange={event => { setFormat(event.target.value as ImagePaletteCodeFormat); setCopied(""); }}>
        <option value="hex">HEX</option><option value="rgb">RGB</option><option value="css">CSS</option>
      </select>
      <button aria-label={t("复制色号代码") + " " + code} className="flex min-h-7 min-w-0 items-center gap-1 rounded px-1.5 font-mono text-foreground hover:bg-primary-soft hover:text-primary" title={code} type="button" onClick={() => void copyColor(active || colors[0])}><span className="min-w-0 truncate">{code}</span><Copy className="shrink-0" size={11} /></button>
    </div>
    {copied ? <div aria-live="polite" className="mt-1 inline-flex min-h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-md ring-1 ring-primary/30" data-palette-copy-feedback role="status"><Check className="shrink-0" size={13} />{t("已复制")}: <span className="font-mono">{copied}</span></div> : null}
    {error ? <p className="mt-1 text-[10px] text-danger" role="alert">{error}</p> : null}
  </div>;
});
