/** Coordinates stay in the main process. City selection is always manual. */
export type WeatherCity = {
  id: string;
  name: string;
  englishName: string;
  countryCode: string;
  region: string;
};

export type WeatherSettings = {
  schemaVersion: 1;
  promptHandled: boolean;
  enabled: boolean;
  city: WeatherCity | null;
};
export type SaveWeatherSettingsInput = { enabled: boolean; cityId: string | null };
export type WeatherPromptClaim = { showPrompt: boolean; settings: WeatherSettings };
export type WeatherForecast = {
  cityId: string;
  temperatureC: number;
  symbolCode: string;
  forecastAt: string;
  updatedAt: string;
  fetchedAt: string;
  nextRefreshAt: string;
  stale: boolean;
};
export const defaultWeatherSettings: WeatherSettings = { schemaVersion: 1, promptHandled: false, enabled: false, city: null };
