import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "../ipc/errors";
import { defaultWeatherSettings, type SaveWeatherSettingsInput, type WeatherForecast, type WeatherPromptClaim, type WeatherSettings } from "../../../src/types/weather";
import { findWeatherCity } from "./weatherCities";

const CACHE_INTERVAL_MS = 3 * 60 * 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
type ForecastPoint = { time: string; temperature: number; symbol: string };
type ForecastData = { updatedAt: string; points: ForecastPoint[] };
type CacheEntry = { data?: ForecastData; fetchedAt: number; nextFetchAt: number; lastModified?: string };
type Options = {
  settingsPath: string;
  cachePath: string;
  fetcher: (url: string, init: RequestInit) => Promise<Response>;
  appVersion: string;
  now?: () => number;
  timeoutMs?: number;
  onFailure?: (code: string) => void;
};

function toPublicSettings(input: unknown): WeatherSettings {
  if (!input || typeof input !== "object") return { ...defaultWeatherSettings };
  const raw = input as Record<string, unknown>;
  const id = raw.city && typeof raw.city === "object" ? (raw.city as Record<string, unknown>).id : null;
  const found = typeof id === "string" ? findWeatherCity(id) : null;
  const city = found ? { id: found.id, name: found.name, englishName: found.englishName, countryCode: found.countryCode, region: found.region } : null;
  return { schemaVersion: 1, promptHandled: raw.promptHandled === true || Boolean(city), enabled: raw.enabled === true && Boolean(city), city };
}

/** Keep only bounded, validated forecast data; never forward a remote response to the renderer. */
export function parseMetForecast(input: unknown): ForecastData {
  const properties = (input as { properties?: { meta?: { updated_at?: string }; timeseries?: unknown[] } })?.properties;
  if (!properties || !Array.isArray(properties.timeseries)) throw new AppError("WEATHER_RESPONSE_INVALID", "天气数据暂时不可用。");
  const points: ForecastPoint[] = [];
  for (const item of properties.timeseries.slice(0, 120)) {
    const row = item as { time?: unknown; data?: { instant?: { details?: { air_temperature?: unknown } }; next_1_hours?: { summary?: { symbol_code?: unknown } }; next_6_hours?: { summary?: { symbol_code?: unknown } } } };
    const temperature = row?.data?.instant?.details?.air_temperature;
    if (typeof row?.time !== "string" || !Number.isFinite(Date.parse(row.time)) || typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < -100 || temperature > 70) continue;
    const code = row.data?.next_1_hours?.summary?.symbol_code ?? row.data?.next_6_hours?.summary?.symbol_code;
    points.push({ time: row.time, temperature, symbol: typeof code === "string" && /^[a-z_]{1,80}$/.test(code) ? code : "unknown" });
  }
  if (!points.length) throw new AppError("WEATHER_RESPONSE_INVALID", "天气数据暂时不可用。");
  points.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const updatedAt = properties.meta?.updated_at;
  return { updatedAt: typeof updatedAt === "string" && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : points[0].time, points };
}

export function createWeatherService(options: Options) {
  const now = options.now ?? Date.now;
  let settingsQueue: Promise<unknown> = Promise.resolve();
  let cacheQueue: Promise<unknown> = Promise.resolve();
  let cacheLoaded: Promise<Map<string, CacheEntry>> | undefined;
  const inFlight = new Map<string, Promise<CacheEntry>>();

  async function atomicJson(file: string, data: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = file + "." + randomUUID() + ".tmp";
    try { await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8"); await fs.rename(temp, file); }
    finally { await fs.rm(temp, { force: true }).catch(() => undefined); }
  }
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = settingsQueue.then(operation);
    settingsQueue = result.catch(() => undefined);
    return result;
  }
  async function readStoredSettings(): Promise<WeatherSettings> {
    let text: string;
    try { text = await fs.readFile(options.settingsPath, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...defaultWeatherSettings };
      throw new AppError("WEATHER_SETTINGS_READ_FAILED", "读取地区与天气设置失败。");
    }
    try { return toPublicSettings(JSON.parse(text)); }
    catch { return { ...defaultWeatherSettings, promptHandled: true }; }
  }
  async function writeSettings(settings: WeatherSettings) {
    try { await atomicJson(options.settingsPath, settings); }
    catch { throw new AppError("WEATHER_SETTINGS_SAVE_FAILED", "保存地区与天气设置失败，请重试。"); }
    return settings;
  }
  async function readSettings() { await settingsQueue; return readStoredSettings(); }
  function claimPrompt(): Promise<WeatherPromptClaim> {
    return serialize(async () => {
      const current = await readStoredSettings();
      if (current.promptHandled) return { showPrompt: false, settings: current };
      const settings = await writeSettings({ ...current, promptHandled: true });
      return { showPrompt: true, settings };
    });
  }
  function saveSettings(input: SaveWeatherSettingsInput): Promise<WeatherSettings> {
    return serialize(async () => {
      if (!input || typeof input.enabled !== "boolean" || (input.cityId !== null && typeof input.cityId !== "string")) throw new AppError("WEATHER_SETTINGS_INVALID", "请选择有效的地区。");
      const found = input.cityId ? findWeatherCity(input.cityId) : null;
      if ((input.cityId && !found) || (input.enabled && !found)) throw new AppError("WEATHER_CITY_INVALID", "请从搜索结果中选择地区。");
      const city = found ? { id: found.id, name: found.name, englishName: found.englishName, countryCode: found.countryCode, region: found.region } : null;
      return writeSettings({ schemaVersion: 1, promptHandled: true, enabled: input.enabled, city });
    });
  }
  function loadCache() {
    cacheLoaded ??= fs.readFile(options.cachePath, "utf8").then((text) => {
      const raw = JSON.parse(text) as Record<string, CacheEntry>;
      const entries = new Map<string, CacheEntry>();
      for (const [id, entry] of Object.entries(raw).slice(0, 5)) {
        if (!findWeatherCity(id) || !entry || !Number.isFinite(entry.fetchedAt) || !Number.isFinite(entry.nextFetchAt)) continue;
        // Treat the cache as untrusted local input as well.
        const data = entry.data;
        if (data && (!Array.isArray(data.points) || !data.points.every((p) => p && typeof p.temperature === "number" && Number.isFinite(p.temperature) && typeof p.time === "string" && Number.isFinite(Date.parse(p.time)) && typeof p.symbol === "string"))) continue;
        entries.set(id, { ...entry, nextFetchAt: Math.min(entry.nextFetchAt, now() + 7 * 24 * 60 * 60 * 1000) });
      }
      return entries;
    }).catch(() => new Map<string, CacheEntry>());
    return cacheLoaded;
  }
  function persistCache(cache: Map<string, CacheEntry>) {
    const entries = [...cache].sort((a, b) => b[1].fetchedAt - a[1].fetchedAt).slice(0, 5);
    const snapshot = Object.fromEntries(entries);
    cacheQueue = cacheQueue.catch(() => undefined).then(() => atomicJson(options.cachePath, snapshot)).catch(() => options.onFailure?.("WEATHER_CACHE_SAVE_FAILED"));
    return cacheQueue;
  }
  async function requestForecast(cityId: string): Promise<CacheEntry> {
    const city = findWeatherCity(cityId)!;
    const cache = await loadCache();
    const previous = cache.get(cityId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
    const requestedAt = now();
    let entry: CacheEntry;
    try {
      const response = await options.fetcher("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + city.latitude.toFixed(4) + "&lon=" + city.longitude.toFixed(4), {
        headers: { "User-Agent": "SuYan/" + options.appVersion + " https://github.com/guliacer/SuYan", Accept: "application/json", ...(previous?.lastModified ? { "If-Modified-Since": previous.lastModified } : {}) },
        signal: controller.signal,
        redirect: "error",
      });
      const expires = Date.parse(response.headers.get("expires") ?? "");
      const nextFetchAt = Math.max(requestedAt + CACHE_INTERVAL_MS, Number.isFinite(expires) ? expires : 0);
      if (response.status === 304 && previous?.data) entry = { ...previous, fetchedAt: requestedAt, nextFetchAt };
      else {
        if (!response.ok) throw new AppError("WEATHER_HTTP_" + response.status, "天气服务暂时不可用。");
        const text = await response.text();
        if (text.length > 1000000) throw new AppError("WEATHER_RESPONSE_INVALID", "天气数据暂时不可用。");
        entry = { data: parseMetForecast(JSON.parse(text)), fetchedAt: requestedAt, nextFetchAt, lastModified: response.headers.get("last-modified") ?? undefined };
      }
    } catch (error) {
      options.onFailure?.(controller.signal.aborted ? "WEATHER_TIMEOUT" : error instanceof AppError ? error.code : "WEATHER_UNAVAILABLE");
      entry = { ...previous, fetchedAt: previous?.fetchedAt ?? 0, nextFetchAt: requestedAt + CACHE_INTERVAL_MS };
    } finally { clearTimeout(timeout); }
    cache.set(cityId, entry);
    await persistCache(cache);
    return entry;
  }
  async function readForecast(): Promise<WeatherForecast | null> {
    const settings = await readSettings();
    if (!settings.enabled || !settings.city) return null;
    const id = settings.city.id;
    const cache = await loadCache();
    let entry = cache.get(id);
    let failedRefresh = false;
    if (!entry || entry.nextFetchAt <= now()) {
      let request = inFlight.get(id);
      if (!request) { request = requestForecast(id); inFlight.set(id, request); }
      try { entry = await request; failedRefresh = entry.fetchedAt + CACHE_INTERVAL_MS <= now(); }
      finally { if (inFlight.get(id) === request) inFlight.delete(id); }
    }
    const current = await readSettings();
    if (!current.enabled || current.city?.id !== id || !entry?.data?.points.length) return null;
    const point = entry.data.points.reduce((best, next) => Math.abs(Date.parse(next.time) - now()) < Math.abs(Date.parse(best.time) - now()) ? next : best);
    if (Math.abs(Date.parse(point.time) - now()) > MAX_STALE_MS || now() - entry.fetchedAt > MAX_STALE_MS) return null;
    return { cityId: id, temperatureC: point.temperature, symbolCode: point.symbol, forecastAt: point.time, updatedAt: entry.data.updatedAt, fetchedAt: new Date(entry.fetchedAt).toISOString(), nextRefreshAt: new Date(entry.nextFetchAt).toISOString(), stale: failedRefresh || now() - entry.fetchedAt >= CACHE_INTERVAL_MS || Math.abs(Date.parse(point.time) - now()) > 90 * 60000 };
  }
  return { readSettings, claimPrompt, saveSettings, readForecast };
}
