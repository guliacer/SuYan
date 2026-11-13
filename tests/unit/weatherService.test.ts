import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cityNameOverrides from "../../electron/main/weather/data/city-name-overrides.json";
import { createWeatherService, parseMetForecast } from "../../electron/main/weather/weatherService";
import { findWeatherCity, searchWeatherCities } from "../../electron/main/weather/weatherCities";

const HOUR = 3600000;
const BEIJING = "1816670";
const HANGZHOU = "1808926";
let temp: string;
let clock: number;
let fetcher: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;
const forecast = (temperature = 18) => ({ properties: { meta: { updated_at: new Date(clock).toISOString() }, timeseries: Array.from({ length: 24 }, (_, n) => ({ time: new Date(clock + n * HOUR).toISOString(), data: { instant: { details: { air_temperature: temperature + n } }, next_1_hours: { summary: { symbol_code: "partlycloudy_day" } } } })) } });
const response = (temp = 18, expires = 3 * HOUR) => new Response(JSON.stringify(forecast(temp)), { status: 200, headers: { expires: new Date(clock + expires).toUTCString(), "last-modified": new Date(clock).toUTCString() } });
function service(extra = {}) { return createWeatherService({ settingsPath: path.join(temp, "weather-settings.json"), cachePath: path.join(temp, "weather-cache.json"), appVersion: "0.4.1", now: () => clock, fetcher, ...extra }); }

beforeEach(async () => { temp = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-weather-")); clock = Date.parse("2026-11-13T08:00:00Z"); fetcher = vi.fn(async () => response()); });
afterEach(async () => { await fs.rm(temp, { recursive: true, force: true }); });

describe("weather preferences", () => {
  it("defaults to disabled and makes no request without a city", async () => {
    const api = service();
    expect(await api.readSettings()).toMatchObject({ enabled: false, promptHandled: false, city: null });
    expect(await api.readForecast()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("claims the first prompt once, even concurrently and across restart", async () => {
    const api = service();
    const results = await Promise.all([api.claimPrompt(), api.claimPrompt(), api.claimPrompt()]);
    expect(results.filter((result) => result.showPrompt)).toHaveLength(1);
    expect((await service().claimPrompt()).showPrompt).toBe(false);
    expect(await api.readForecast()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("allows later setup and switching off while retaining the city", async () => {
    const api = service();
    await api.claimPrompt();
    await api.saveSettings({ enabled: true, cityId: HANGZHOU });
    const stored = await service().readSettings();
    expect(stored).toMatchObject({ enabled: true, promptHandled: true, city: { id: HANGZHOU } });
    expect(stored.city).not.toHaveProperty("latitude");
    await api.saveSettings({ enabled: false, cityId: HANGZHOU });
    expect(await api.readForecast()).toBeNull();
    expect((await api.readSettings()).city?.id).toBe(HANGZHOU);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects forged city IDs without replacing the saved preference", async () => {
    const api = service();
    await api.saveSettings({ enabled: true, cityId: BEIJING });
    await expect(api.saveSettings({ enabled: true, cityId: "file:///etc/hosts" })).rejects.toThrow("搜索结果");
    await expect(api.saveSettings({ enabled: true, cityId: null })).rejects.toThrow("搜索结果");
    expect((await api.readSettings()).city?.id).toBe(BEIJING);
  });
  it("does not repeat a prompt when a corrupt preference file is found", async () => {
    await fs.writeFile(path.join(temp, "weather-settings.json"), "{ broken", "utf8");
    expect((await service().claimPrompt()).showPrompt).toBe(false);
  });
});

describe("free forecast client", () => {
  it("uses only the fixed endpoint, bounded city coordinates and an identifying User-Agent", async () => {
    const api = service(); await api.saveSettings({ enabled: true, cityId: BEIJING });
    const result = await api.readForecast();
    expect(result).toMatchObject({ cityId: BEIJING, temperatureC: 18, stale: false, symbolCode: "partlycloudy_day" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const target = new URL(url);
    expect(target.origin).toBe("https://api.met.no");
    expect(target.pathname).toBe("/weatherapi/locationforecast/2.0/compact");
    expect(target.searchParams.get("lat")).toMatch(/^\d+\.\d{4}$/);
    expect(target.searchParams.get("lon")).toMatch(/^\d+\.\d{4}$/);
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("https://github.com/guliacer/SuYan");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("coalesces concurrent requests and honors Expires across restart", async () => {
    fetcher.mockImplementation(async () => response(18, 5 * HOUR));
    const api = service(); await api.saveSettings({ enabled: true, cityId: BEIJING });
    await Promise.all([api.readForecast(), api.readForecast(), api.readForecast()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock += 4 * HOUR;
    const result = await service().readForecast();
    expect(result?.temperatureC).toBe(22);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses the exact Last-Modified value for 304 revalidation", async () => {
    const api = service(); await api.saveSettings({ enabled: true, cityId: BEIJING });
    await api.readForecast();
    const modified = new Date(clock).toUTCString();
    clock += 4 * HOUR;
    fetcher.mockImplementation(async () => new Response(null, { status: 304 }));
    expect((await api.readForecast())?.temperatureC).toBe(22);
    const init = (fetcher.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["If-Modified-Since"]).toBe(modified);
  });
  it("falls back to stale cached data and backs off failures", async () => {
    const api = service(); await api.saveSettings({ enabled: true, cityId: BEIJING });
    await api.readForecast(); clock += 4 * HOUR;
    fetcher.mockRejectedValue(new Error("offline"));
    expect((await api.readForecast())?.stale).toBe(true);
    await api.readForecast(); expect(fetcher).toHaveBeenCalledTimes(2);
    clock += 25 * HOUR;
    expect(await api.readForecast()).toBeNull();
  });
  it("returns null and throttles when no cache is available", async () => {
    fetcher.mockImplementation(async () => new Response("busy", { status: 429 }));
    const api = service(); await api.saveSettings({ enabled: true, cityId: BEIJING });
    expect(await api.readForecast()).toBeNull();
    expect(await service().readForecast()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts a stalled network request without affecting task data", async () => {
    fetcher.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    const failed = vi.fn(); const api = service({ timeoutMs: 10, onFailure: failed });
    await api.saveSettings({ enabled: true, cityId: BEIJING });
    expect(await api.readForecast()).toBeNull(); expect(failed).toHaveBeenCalledWith("WEATHER_TIMEOUT");
  });
  it("discards a response when the user changes city during the request", async () => {
    let release!: (response: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    const api = service(); await api.saveSettings({ enabled: true, cityId: BEIJING });
    const oldRequest = api.readForecast();
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await api.saveSettings({ enabled: true, cityId: HANGZHOU });
    release(response()); expect(await oldRequest).toBeNull();
  });
  it("rejects malformed or out-of-range provider data", () => {
    expect(() => parseMetForecast({})).toThrow("天气数据");
    const bad = forecast(); bad.properties.timeseries[0].data.instant.details.air_temperature = 999;
    expect(parseMetForecast(bad).points).toHaveLength(23);
  });
});

describe("offline city search", () => {
  it("supports Chinese and pinyin without exposing coordinates", () => {
    expect(searchWeatherCities("杭州")[0]?.id).toBe(HANGZHOU);
    expect(searchWeatherCities("hangzhou")[0]?.id).toBe(HANGZHOU);
    expect(searchWeatherCities("成都")[0]?.name).toBe("成都市");
    expect(searchWeatherCities("New York").length).toBeGreaterThan(0);
    expect(searchWeatherCities("London")[0]).not.toHaveProperty("latitude");
    expect(findWeatherCity(BEIJING)?.latitude).toBeGreaterThan(0);
  });

  it("shows Foshan with its complete simplified Chinese name and prioritizes exact aliases", () => {
    const results = searchWeatherCities("佛山");
    expect(results[0]).toMatchObject({ id: "1811103", name: "佛山市" });
    expect(results.map((city) => city.id)).not.toContain("11669854");
    expect(findWeatherCity("1811103")?.name).toBe("佛山市");
  });

  it("uses the canonical simplified name for every audited city label", () => {
    for (const [id, name] of Object.entries(cityNameOverrides)) {
      expect(findWeatherCity(id)?.name).toBe(name);
    }
  });
});
