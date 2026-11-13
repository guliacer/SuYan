import { useEffect, useState } from "react";
import { Check, CloudSun, MapPin, Search } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import type { WeatherCity } from "@/types/weather";
import { useWeatherStore } from "../useWeatherStore";

export function WeatherAttribution() {
  const { t } = useLocale();
  return <p className="text-[11px] leading-5 text-muted">{t("天气预报：")}<button type="button" className="underline underline-offset-2 hover:text-primary" onClick={() => void window.suyanApi.openExternalUrl("https://www.met.no/en")}>MET Norway</button>{" · "}<button type="button" className="underline underline-offset-2 hover:text-primary" onClick={() => void window.suyanApi.openExternalUrl("https://creativecommons.org/licenses/by/4.0/")}>CC BY 4.0</button><br />{t("城市数据：")}<button type="button" className="underline underline-offset-2 hover:text-primary" onClick={() => void window.suyanApi.openExternalUrl("https://www.geonames.org/")}>GeoNames</button>{" · CC BY 4.0"}</p>;
}

export function WeatherSettingsPanel({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const { t, isEnglish } = useLocale();
  const { settings, loaded, isSaving, error, loadSettings, save } = useWeatherStore();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [city, setCity] = useState<WeatherCity | null>(settings.city);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<WeatherCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { if (loaded) { setEnabled(settings.enabled); setCity(settings.city); } }, [loaded, settings]);
  useEffect(() => {
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void window.suyanApi.searchWeatherCities(query).then((result) => {
        if (!active) return;
        setCities(result.ok ? result.data : []); setSearchError(!result.ok); setSearching(false);
      }).catch(() => { if (active) { setCities([]); setSearchError(true); setSearching(false); } });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  async function handleSave() { setSaved(false); if (await save({ cityId: city?.id ?? null, enabled })) { setSaved(true); onSaved?.(); } }
  return <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-1">
    <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary"><CloudSun size={21} /></span><div><h3 className="text-base font-semibold">{t("地区与天气")}</h3><p className="mt-1 text-sm leading-6 text-muted">{t("给清单加一点生活气息，手动选择你的城市。")}</p></div></div>
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-background/50 p-4"><span><span className="block text-sm font-medium">{t("在待办页显示天气")}</span><span className="mt-1 block text-xs leading-5 text-muted">{t("关闭后只显示日期，已选城市会保留。")}</span></span><input type="checkbox" className="size-5 accent-primary" checked={enabled} disabled={!loaded || isSaving} onChange={(event) => setEnabled(event.target.checked)} /></label>
    <div><label htmlFor="weather-city-search" className="mb-2 block text-sm font-medium">{t("选择所在城市")}</label><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><TextField id="weather-city-search" className="pl-9" maxLength={100} placeholder={t("搜索城市名或拼音，如杭州 / hangzhou")} value={query} onChange={(event) => setQuery(event.target.value)} /></div><p className="mt-2 text-xs leading-5 text-muted">{t("城市搜索在本地完成；开启后仅用所选城市获取预报，无需定位权限或 API Key。")}</p></div>
    {city ? <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft/40 px-3 py-2.5 text-sm"><MapPin size={15} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words">{t("当前选择：")}{isEnglish ? city.englishName : city.name}</span><span className="shrink-0 text-xs text-muted">{city.countryCode}</span></div> : null}
    <div aria-label={t("城市搜索结果")} className="max-h-60 overflow-y-auto rounded-xl border border-border" aria-busy={searching}>
      {cities.length ? cities.map((item) => <button key={item.id} type="button" aria-pressed={city?.id === item.id} disabled={isSaving} className="flex min-h-12 w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-primary-soft focus-visible:bg-primary-soft" onClick={() => { setCity(item); setEnabled(true); }}><MapPin size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{isEnglish ? item.englishName : item.name}</span><span className="mt-0.5 block break-words text-[11px] text-muted">{[item.englishName, item.region, item.countryCode].filter(Boolean).join(" · ")}</span></span>{city?.id === item.id ? <Check size={16} className="shrink-0 text-primary" /> : null}</button>) : <p className="p-4 text-sm text-muted">{searching ? t("正在搜索…") : searchError ? t("城市搜索失败，请重试。") : t("未找到城市，试试拼音或附近的大城市。")}</p>}
    </div>
    {saved ? <p role="status" className="text-sm text-primary">{t("地区与天气设置已保存。")}</p> : null}
    {error ? <p role="alert" className="text-sm text-danger">{t(error)}</p> : null}
    {enabled && !city ? <p className="text-xs text-muted">{t("选择一个城市后即可开启。")}</p> : null}
    <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4"><WeatherAttribution /><div className="flex gap-2">{onCancel ? <Button disabled={isSaving} onClick={onCancel}>{t("取消")}</Button> : null}<Button variant="primary" disabled={!loaded || isSaving || (enabled && !city)} onClick={() => void handleSave()}>{isSaving ? t("保存中…") : t("保存设置")}</Button></div></div>
  </div>;
}

export function WeatherSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const isSaving = useWeatherStore((state) => state.isSaving);
  const close = () => { if (!isSaving) onClose(); };
  return <AppDialog titleId="weather-settings-title" onClose={close} overlayClassName="z-[350] px-4 py-6" panelClassName="flex max-h-full w-full max-w-lg flex-col p-5"><header className="mb-4 flex items-center justify-between gap-3"><h2 id="weather-settings-title" className="font-semibold">{t("设置地区与天气")}</h2><DialogCloseButton onClick={close} /></header><WeatherSettingsPanel onSaved={onClose} onCancel={close} /></AppDialog>;
}
