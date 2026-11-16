import { memo, useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { extractImagePalette, formatImagePaletteColor } from "../utils/imagePalette";

const paletteCache = new Map<string, readonly string[]>();
const pendingPalettes = new Map<string, Promise<readonly string[]>>();

export function getCachedImagePalette(imageFileName: string): readonly string[] | undefined {
  return paletteCache.get(imageFileName);
}

type PaletteSampleResult = Awaited<ReturnType<typeof window.suyanApi.getImagePaletteSample>>;

/** Sample one bounded main-process palette per file and share it across cards and the info rail. */
export function loadImagePalette(imageFileName: string, sample?: () => Promise<PaletteSampleResult>): Promise<readonly string[]> {
  const cached = paletteCache.get(imageFileName);
  if (cached) return Promise.resolve(cached);
  const pending = pendingPalettes.get(imageFileName);
  if (pending) return pending;
  const request = (sample ? sample() : window.suyanApi.getImagePaletteSample(imageFileName))
    .then((result: PaletteSampleResult) => {
      const colors = result.ok ? extractImagePalette(result.data.pixels, 8).map(color => color.hex) : [];
      if (colors.length) {
        if (paletteCache.size >= 400) {
          const oldest = paletteCache.keys().next().value;
          if (oldest) paletteCache.delete(oldest);
        }
        paletteCache.set(imageFileName, colors);
      }
      return colors;
    })
    .catch(() => [] as readonly string[])
    .finally(() => { pendingPalettes.delete(imageFileName); });
  pendingPalettes.set(imageFileName, request);
  return request;
}

export const LibraryAssetPaletteStrip = memo(function LibraryAssetPaletteStrip({ imageFileName }: { imageFileName: string }) {
  const { t } = useLocale();
  const [colors, setColors] = useState<readonly string[]>(() => paletteCache.get(imageFileName) ?? []);
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setColors(paletteCache.get(imageFileName) ?? []);
    setFailed(false);
    void loadImagePalette(imageFileName).then(next => { if (active) setColors(next); });
    return () => { active = false; };
  }, [imageFileName]);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(""), 2000); return () => window.clearTimeout(timer); }, [copied]);
  const copyColor = useCallback(async (hex: string) => {
    setFailed(false);
    const code = formatImagePaletteColor(hex, "hex");
    if (!code) return;
    try {
      const result = await window.suyanApi.writeClipboardText(code);
      if (result.ok) setCopied(code); else setFailed(true);
    } catch { setFailed(true); }
  }, []);
  if (!colors.length) return null;
  return <div data-directory-palette="true" className="absolute inset-x-1.5 bottom-1.5 z-10 flex flex-col items-start gap-1" onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()}>
    <div aria-label={t("图片主色")} className="flex h-5 w-full overflow-hidden rounded-md border border-white/50 bg-panel/70 shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
      {colors.map(hex => <button aria-label={t("复制颜色") + " " + hex} className="h-full min-w-0 flex-1 outline-none transition-transform hover:scale-y-125 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" data-directory-action="true" data-palette-color={hex} key={hex} style={{ backgroundColor: hex }} title={hex + " · " + t("单击复制色号")} type="button" onClick={event => { event.stopPropagation(); void copyColor(hex); }} />)}
    </div>
    {copied ? <span className="inline-flex items-center gap-1 rounded bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold text-panel shadow-md" data-palette-copy-feedback="true" role="status"><Check size={11} />{t("已复制")}: <span className="font-mono">{copied}</span></span> : null}
    {failed ? <span className="rounded bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-md" role="alert">{t("色号复制失败，请重试。")}</span> : null}
  </div>;
});