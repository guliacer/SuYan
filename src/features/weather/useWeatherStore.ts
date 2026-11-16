import { create } from "zustand";
import { defaultWeatherSettings, type SaveWeatherSettingsInput, type WeatherForecast, type WeatherSettings } from "@/types/weather";

type WeatherState = {
  settings: WeatherSettings;
  loaded: boolean;
  promptOpen: boolean;
  isSaving: boolean;
  isFetching: boolean;
  forecast: WeatherForecast | null;
  error: string | null;
  loadSettings: () => Promise<void>;
  visitTodo: () => Promise<void>;
  dismissPrompt: () => void;
  save: (input: SaveWeatherSettingsInput) => Promise<boolean>;
  refreshForecast: () => Promise<void>;
};
let visitPromise: Promise<void> | undefined;
let forecastSequence = 0;
export const useWeatherStore = create<WeatherState>((set, get) => ({
  settings: { ...defaultWeatherSettings }, loaded: false, promptOpen: false, isSaving: false, isFetching: false, forecast: null, error: null,
  loadSettings: async () => {
    try {
      const result = await window.suyanApi.readWeatherSettings();
      if (result.ok) set({ settings: result.data, loaded: true });
      else set({ error: "读取地区与天气设置失败。", loaded: true });
    } catch { set({ error: "读取地区与天气设置失败。", loaded: true }); }
  },
  visitTodo: () => {
    visitPromise ??= (async () => {
      try {
        // The main process records the first visit before the prompt is displayed.
        // Closing, skipping or leaving this page will therefore never prompt again.
        const result = await window.suyanApi.claimWeatherPrompt();
        if (result.ok) set({ settings: result.data.settings, loaded: true, promptOpen: result.data.showPrompt });
        else set({ loaded: true, error: "读取地区与天气设置失败。" });
      } catch { set({ loaded: true, error: "读取地区与天气设置失败。" }); }
    })();
    return visitPromise;
  },
  dismissPrompt: () => set({ promptOpen: false }),
  save: async (input) => {
    if (get().isSaving) return false;
    ++forecastSequence;
    set({ isSaving: true, error: null, forecast: null, isFetching: false });
    try {
      const result = await window.suyanApi.saveWeatherSettings(input);
      if (!result.ok) { set({ error: "保存地区与天气设置失败，请重试。" }); return false; }
      set({ settings: result.data, loaded: true, promptOpen: false });
      if (result.data.enabled) void get().refreshForecast();
      return true;
    } catch { set({ error: "保存地区与天气设置失败，请重试。" }); return false; }
    finally { set({ isSaving: false }); }
  },
  refreshForecast: async () => {
    const { settings } = get();
    if (!settings.enabled || !settings.city || get().isFetching) return;
    const sequence = ++forecastSequence;
    const cityId = settings.city.id;
    set({ isFetching: true });
    try {
      const result = await window.suyanApi.readWeatherForecast();
      if (sequence !== forecastSequence || get().settings.city?.id !== cityId || !get().settings.enabled) return;
      set({ forecast: result.ok && result.data?.cityId === cityId ? result.data : null });
    } catch { if (sequence === forecastSequence) set({ forecast: null }); }
    finally { if (sequence === forecastSequence) set({ isFetching: false }); }
  },
}));
