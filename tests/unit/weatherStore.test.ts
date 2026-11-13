import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultWeatherSettings } from "../../src/types/weather";
const city = { id: "1816670", name: "北京市", englishName: "Beijing", countryCode: "CN", region: "Beijing" };
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
async function setup(api: Record<string, unknown>) {
  vi.stubGlobal("window", { suyanApi: api });
  const { useWeatherStore } = await import("../../src/features/weather/useWeatherStore");
  return useWeatherStore;
}
describe("weather renderer state", () => {
  it("claims once for repeated mounts and does not fetch when declined", async () => {
    const claimWeatherPrompt = vi.fn(async () => ({ ok: true, data: { showPrompt: true, settings: { ...defaultWeatherSettings, promptHandled: true } } }));
    const readWeatherForecast = vi.fn(); const store = await setup({ claimWeatherPrompt, readWeatherForecast });
    await Promise.all([store.getState().visitTodo(), store.getState().visitTodo()]);
    expect(store.getState().promptOpen).toBe(true); store.getState().dismissPrompt();
    await store.getState().visitTodo(); await store.getState().refreshForecast();
    expect(store.getState().promptOpen).toBe(false); expect(claimWeatherPrompt).toHaveBeenCalledTimes(1); expect(readWeatherForecast).not.toHaveBeenCalled();
  });
  it("discards an old response if weather is disabled while fetching", async () => {
    let finish!: (value: unknown) => void;
    const store = await setup({ readWeatherForecast: () => new Promise((resolve) => { finish = resolve; }), saveWeatherSettings: async () => ({ ok: true, data: { ...defaultWeatherSettings, promptHandled: true, city } }) });
    store.setState({ settings: { ...defaultWeatherSettings, promptHandled: true, enabled: true, city } });
    const request = store.getState().refreshForecast();
    await store.getState().save({ cityId: city.id, enabled: false });
    finish({ ok: true, data: { cityId: city.id, temperatureC: 30 } }); await request;
    expect(store.getState().forecast).toBeNull(); expect(store.getState().isFetching).toBe(false); expect(store.getState().settings.enabled).toBe(false);
  });
  it("shows a save error without replacing the user's existing city", async () => {
    const store = await setup({ saveWeatherSettings: async () => ({ ok: false, error: { code: "WRITE_FAILED" } }) });
    store.setState({ settings: { ...defaultWeatherSettings, enabled: true, city } });
    expect(await store.getState().save({ cityId: "1808926", enabled: true })).toBe(false);
    expect(store.getState().settings.city?.id).toBe(city.id); expect(store.getState().error).toBeTruthy();
  });
});
