import { app } from "electron";

/** All user exports share the same versioned, local-time filename format. */
export function formatExportFileName(
  contentType: string,
  extension: string,
  options: { version?: string; date?: Date; timeZoneOffsetMinutes?: number } = {},
): string {
  const date = options.date ?? new Date();
  const offset = options.timeZoneOffsetMinutes ?? date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const dateStamp = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const timeStamp = `${pad(local.getUTCHours())}-${pad(local.getUTCMinutes())}-${pad(local.getUTCSeconds())}`;
  const safe = (value: string) => value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  const version = safe(options.version ?? app.getVersion()) || "未知版本";
  return `素言-v${version}-${safe(contentType)}-${dateStamp}-${timeStamp}.${safe(extension).replace(/^\.+/, "")}`;
}
