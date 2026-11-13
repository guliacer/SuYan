export type WeatherAppearance = { label: string; icon: "sun" | "cloud-sun" | "cloud" | "rain" | "snow" | "storm" | "fog" };
export function weatherAppearance(symbol: string): WeatherAppearance {
  const name = symbol.split("_")[0];
  if (name.includes("thunder")) return { label: "雷阵雨", icon: "storm" };
  if (name.includes("snow") || name.includes("sleet")) return { label: "降雪", icon: "snow" };
  if (name.includes("rain")) return { label: "降雨", icon: "rain" };
  if (name === "fog") return { label: "有雾", icon: "fog" };
  if (name === "clearsky") return { label: "晴", icon: "sun" };
  if (name === "fair" || name === "partlycloudy") return { label: "晴间多云", icon: "cloud-sun" };
  if (name === "cloudy") return { label: "多云", icon: "cloud" };
  return { label: "天气预报", icon: "cloud" };
}
