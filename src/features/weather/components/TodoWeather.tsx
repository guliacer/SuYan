import { useEffect, useRef, useState } from "react";
import { ChevronDown, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, MapPin, Sun, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { AnchoredPopover } from "@/components/ui/AnchoredPopover";
import { useWeatherStore } from "../useWeatherStore";
import { weatherAppearance } from "../weatherPresentation";
import { WeatherAttribution, WeatherSettingsDialog } from "./WeatherSettingsPanel";

const icons = { sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, rain: CloudRain, snow: CloudSnow, storm: CloudLightning, fog: CloudFog };
export function TodoWeather({ now }: { now: Date }) {
  const { t, language, isEnglish } = useLocale();
  const { settings, forecast, promptOpen, isFetching, visitTodo, dismissPrompt, refreshForecast } = useWeatherStore();
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => { void visitTodo(); return dismissPrompt; }, [visitTodo, dismissPrompt]);
  useEffect(() => {
    if (!settings.enabled || !settings.city) return;
    void refreshForecast();
    const timer = window.setInterval(() => void refreshForecast(), 5 * 60000);
    return () => window.clearInterval(timer);
  }, [settings.enabled, settings.city?.id, refreshForecast]);
  const city = settings.city;
  const configured = settings.enabled && city;
  const appearance = weatherAppearance(forecast?.symbolCode ?? "unknown");
  const Icon = icons[appearance.icon];
  return <div className="flex shrink-0 items-center gap-4 text-right" ref={anchor}>
    <div className="flex items-center gap-3"><span className="text-3xl font-light tabular-nums tracking-tight text-foreground">{now.getDate()}</span><span className="text-left text-xs leading-5 text-muted">{new Intl.DateTimeFormat(language, { month: "long" }).format(now)} · {new Intl.DateTimeFormat(language, { weekday: "short" }).format(now)}<br />{now.getFullYear()}</span></div>
    {configured ? <button type="button" aria-expanded={details} aria-label={t("地区与天气")} className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-panel/70 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary-soft/40" onClick={() => setDetails((value) => !value)}><Icon size={23} className="shrink-0 text-primary" /><span className="min-w-0"><span className="block max-w-36 break-words text-xs leading-4 text-muted">{isEnglish ? city.englishName : city.name}</span><span className="mt-0.5 block text-sm font-medium">{forecast ? Math.round(forecast.temperatureC) + "°C · " + t(appearance.label) : isFetching ? t("获取天气中…") : t("天气暂不可用")}{forecast?.stale ? <span className="ml-1 text-[10px] text-muted">{t("缓存")}</span> : null}</span></span><ChevronDown size={13} className="shrink-0 text-muted" /></button> : null}
    {promptOpen && !editing ? <AnchoredPopover anchorRef={anchor} label={t("设置天气提醒")} onClose={dismissPrompt}><div className="flex items-start justify-between gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><CloudSun size={20} /></span><button type="button" aria-label={t("暂不设置天气")} className="rounded-md p-1 text-muted hover:bg-background" onClick={dismissPrompt}><X size={16} /></button></div><h3 className="mt-3 text-sm font-semibold">{t("让今天，多一点生活感。")}</h3><p className="mt-2 text-xs leading-6 text-muted">{t("选个城市，在这里看看天气。暂不设置后，此页不会再次提醒；以后可在系统设置中开启。")}</p><div className="mt-4 flex items-center justify-end gap-2"><Button size="sm" onClick={dismissPrompt}>{t("暂不设置")}</Button><Button size="sm" variant="primary" icon={<MapPin size={13} />} onClick={() => { dismissPrompt(); setEditing(true); }}>{t("选择城市")}</Button></div></AnchoredPopover> : null}
    {details && configured ? <AnchoredPopover anchorRef={anchor} label={t("天气详情")} onClose={() => setDetails(false)}><h3 className="break-words text-left text-sm font-semibold">{isEnglish ? city.englishName : city.name}{" · "}{t("天气预报")}</h3><p className="mt-2 text-left text-xs leading-6 text-muted">{forecast ? t("预报时间：{time}", { time: new Date(forecast.forecastAt).toLocaleString(language) }) : t("天气获取失败，清单仍可正常使用。")}{forecast ? <><br />{t("更新于：{time}", { time: new Date(forecast.fetchedAt).toLocaleString(language) })}{forecast.stale ? <><br />{t("当前显示上次缓存的预报。")}</> : null}</> : null}</p><div className="mt-3 border-t border-border pt-3 text-left"><WeatherAttribution /></div><Button className="mt-3 w-full" onClick={() => { setDetails(false); setEditing(true); }}>{t("更改地区与天气")}</Button></AnchoredPopover> : null}
    {editing ? <WeatherSettingsDialog onClose={() => setEditing(false)} /> : null}
  </div>;
}
