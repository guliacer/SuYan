export type AppLanguage = "zh-CN" | "en-US";

export const defaultAppLanguage: AppLanguage = "zh-CN";

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === "en-US" ? "en-US" : defaultAppLanguage;
}

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh-CN" || value === "en-US";
}
