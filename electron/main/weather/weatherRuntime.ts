import { app, net } from "electron";
import path from "node:path";
import { getLibraryDataDir } from "../library/libraryPaths";
import { logger } from "../appLogger";
import { createWeatherService } from "./weatherService";

let service: ReturnType<typeof createWeatherService> | undefined;
export function getWeatherService() {
  service ??= createWeatherService({
    settingsPath: path.join(getLibraryDataDir(), "weather-settings.json"),
    cachePath: path.join(getLibraryDataDir(), "weather-cache.json"),
    appVersion: app.getVersion(),
    fetcher: (url, init) => net.fetch(url, init),
    onFailure: (code) => logger.warn("weather", "forecast-unavailable", { code }),
  });
  return service;
}
