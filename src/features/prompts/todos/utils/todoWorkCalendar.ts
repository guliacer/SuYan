import type { TodoCalendarSettings, TodoHoliday, TodoHolidayYear } from "../../../../types/todoCalendar";

export function defaultTodoCalendar(): TodoCalendarSettings {
  return { mode: "double-rest", singleRestDay: 0, doubleRestWeek: "2026-01-05", useHolidays: true, overrides: {} };
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && +value.slice(0, 4) >= 1900 && +value.slice(0, 4) <= 2200;
}

function weekIndex(date: string): number {
  // UTC day numbers prevent DST shifts; 1970-01-05 was a Monday.
  return Math.floor((Date.parse(`${date}T00:00:00Z`) / 86400000 - 4) / 7);
}

export function resolveTodoWorkday(date: string, settings: TodoCalendarSettings, holidays: readonly TodoHoliday[] = []) {
  const holiday = settings.useHolidays ? holidays.find((entry) => entry.date === date) : undefined;
  const override = settings.overrides[date];
  if (override) return { isWorkday: override === "work", source: "manual" as const, label: `自定${override === "work" ? "工作" : "休息"}` };
  if (holiday) return { isWorkday: !holiday.isOffDay, source: "holiday" as const, label: `${holiday.name}·${holiday.isOffDay ? "放假" : "补班"}` };
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const isWorkday = settings.mode === "single-rest" ? weekday !== settings.singleRestDay
    : weekday !== 0 && (weekday !== 6 || (settings.mode === "alternate-rest" && Math.abs(weekIndex(date) - weekIndex(settings.doubleRestWeek)) % 2 === 1));
  return { isWorkday, source: "mode" as const, label: isWorkday ? "工作日" : "休息日" };
}

export function validateTodoCalendar(value: unknown): TodoCalendarSettings {
  const data = value as TodoCalendarSettings | null;
  if (!data || !["single-rest", "alternate-rest", "double-rest"].includes(data.mode)
    || !Number.isInteger(data.singleRestDay) || data.singleRestDay < 0 || data.singleRestDay > 6
    || !isCalendarDate(data.doubleRestWeek) || typeof data.useHolidays !== "boolean"
    || !data.overrides || typeof data.overrides !== "object" || Array.isArray(data.overrides)) throw new Error("日历设置格式无效");
  const entries = Object.entries(data.overrides);
  if (entries.length > 20000 || entries.some(([date, status]) => !isCalendarDate(date) || !["work", "rest"].includes(status))) throw new Error("自定义日期无效");
  return { mode: data.mode, singleRestDay: data.singleRestDay, doubleRestWeek: data.doubleRestWeek, useHolidays: data.useHolidays, overrides: Object.fromEntries(entries) };
}

export function parseTodoHolidayYear(value: unknown, year: number, fetchedAt = new Date().toISOString()): TodoHolidayYear {
  const data = value as { year?: unknown; days?: unknown } | null;
  if (!data || data.year !== year || !Array.isArray(data.days) || !data.days.length || data.days.length > 366) throw new Error("节假日数据格式无效");
  const dates = new Set<string>();
  const days = data.days.map((raw: unknown): TodoHoliday => {
    const entry = raw as TodoHoliday | null;
    if (!entry || !isCalendarDate(entry.date) || +entry.date.slice(0, 4) !== year || dates.has(entry.date)
      || typeof entry.isOffDay !== "boolean" || typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 60) throw new Error("节假日日期无效");
    dates.add(entry.date);
    return { date: entry.date, name: entry.name.trim(), isOffDay: entry.isOffDay };
  });
  return { year, days, fetchedAt };
}
