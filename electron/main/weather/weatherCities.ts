import cityData from "./data/cities.json";
import type { WeatherCity } from "../../../src/types/weather";

type CityRecord = [number, string, string, string, string, string, number, number, number];
const records = cityData as CityRecord[];
const byId = new Map(records.map((record) => [String(record[0]), record]));
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "").trim();
const index = records.map((record) => ({
  record,
  name: normalize(record[1]),
  englishName: normalize(record[2]),
  aliases: record[3].split("|").map(normalize),
  other: normalize([record[4], record[5]].join("|")),
}));

function publicCity(record: CityRecord): WeatherCity {
  return { id: String(record[0]), name: record[1], englishName: record[2], countryCode: record[4], region: record[5] };
}
export function findWeatherCity(id: string): (WeatherCity & { latitude: number; longitude: number }) | null {
  const row = byId.get(id);
  return row ? { ...publicCity(row), latitude: row[6], longitude: row[7] } : null;
}
export function searchWeatherCities(input: unknown): WeatherCity[] {
  const query = typeof input === "string" ? normalize(input.slice(0, 100)) : "";
  if (!query) return records.slice(0, 8).map(publicCity);
  const exactName = index.filter(({ name, englishName }) => name === query || name.replace(/市$/, "") === query || englishName === query);
  const exactAlias = index.filter(({ aliases }) => aliases.some((alias) => alias === query || alias.replace(/市$/, "") === query));
  const prefix = index.filter(({ name, englishName, aliases, other }) => [name, englishName, ...aliases, other].some((term) => term.startsWith(query)));
  const partial = index.filter(({ name, englishName, aliases, other }) => [name, englishName, ...aliases, other].some((term) => term.includes(query)));
  const matches = exactName.length ? exactName : exactAlias.length ? exactAlias : prefix.length ? prefix : partial;
  return matches.slice(0, 12).map(({ record }) => publicCity(record));
}
