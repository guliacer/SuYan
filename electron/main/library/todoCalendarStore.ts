import fs from "node:fs/promises";
import path from "node:path";
import { net } from "electron";
import { getLibraryDataDir } from "./libraryPaths";
import { getLibraryBackupPaths, writeLibraryJsonAtomically } from "./libraryJsonPersistence";
import { AppError } from "../ipc/errors";
import { logger } from "../appLogger";
import { defaultTodoCalendar, isCalendarDate, parseTodoHolidayYear, validateTodoCalendar } from "../../../src/features/prompts/todos/utils/todoWorkCalendar";
import type { TodoCalendarChange, TodoCalendarSettings, TodoHolidayResult, TodoHolidayYear } from "../../../src/types/todoCalendar";

let mutationQueue: Promise<unknown> = Promise.resolve();
const requests = new Map<number, Promise<TodoHolidayResult>>();
const recent = new Map<number, { at: number; result: TodoHolidayResult }>();
const settingsPath = () => path.join(getLibraryDataDir(), "todo-calendar.json");
const holidayPath = (year: number) => path.join(getLibraryDataDir(), "holiday-cache", `${year}.json`);

export async function readTodoCalendar(): Promise<TodoCalendarSettings> {
  let found = false;
  for (const file of [settingsPath(), ...getLibraryBackupPaths(settingsPath())]) {
    try {
      const content = await fs.readFile(file, "utf8");
      found = true;
      const parsed = JSON.parse(content) as { schemaVersion?: unknown; settings?: unknown };
      if (parsed.schemaVersion !== 1) throw new Error("schema");
      return validateTodoCalendar(parsed.settings);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") found = true;
    }
  }
  if (found) throw new AppError("TODO_CALENDAR_READ_FAILED", "无法读取日历设置，请检查数据目录中的 todo-calendar.json 及其备份。");
  return defaultTodoCalendar();
}

export function updateTodoCalendar(change: TodoCalendarChange): Promise<TodoCalendarSettings> {
  const run = mutationQueue.then(async () => {
    const current = await readTodoCalendar();
    let next: TodoCalendarSettings;
    try {
      if (change?.kind === "settings") next = validateTodoCalendar({ ...change.settings, overrides: current.overrides });
      else if (change?.kind === "day" && isCalendarDate(change.date) && ["work", "rest", "default"].includes(change.value)) {
        next = { ...current, overrides: { ...current.overrides } };
        if (change.value === "default") delete next.overrides[change.date];
        else next.overrides[change.date] = change.value;
        next = validateTodoCalendar(next);
      } else throw new Error("invalid change");
    } catch {
      throw new AppError("TODO_CALENDAR_INVALID", "日历设置无效，请检查日期和工作模式。");
    }
    try {
      await writeLibraryJsonAtomically(settingsPath(), JSON.stringify({ schemaVersion: 1, settings: next }, null, 2));
    } catch {
      throw new AppError("TODO_CALENDAR_SAVE_FAILED", "日历设置保存失败，请重试。");
    }
    logger.info("library", "todo-calendar-saved", { kind: change.kind, mode: next.mode });
    return next;
  });
  mutationQueue = run.catch(() => undefined);
  return run;
}

async function readHolidayCache(year: number): Promise<TodoHolidayYear | null> {
  try {
    const data = JSON.parse(await fs.readFile(holidayPath(year), "utf8")) as TodoHolidayYear;
    if (typeof data.fetchedAt !== "string" || !Number.isFinite(Date.parse(data.fetchedAt))) return null;
    return parseTodoHolidayYear(data, year, data.fetchedAt);
  } catch { return null; }
}

export function getTodoHolidayYear(year: number, refresh = false): Promise<TodoHolidayResult> {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || typeof refresh !== "boolean") {
    return Promise.reject(new AppError("TODO_CALENDAR_INVALID", "请选择 1900 至 2200 年之间的日期。"));
  }
  const pending = requests.get(year);
  if (pending) return pending;
  const prior = recent.get(year);
  if (!refresh && prior && Date.now() - prior.at < 300000) return Promise.resolve(prior.result);
  const run = loadHolidayYear(year, refresh).then((result) => {
    recent.set(year, { at: Date.now(), result });
    return result;
  }).finally(() => requests.delete(year));
  requests.set(year, run);
  return run;
}

async function loadHolidayYear(year: number, refresh: boolean): Promise<TodoHolidayResult> {
  const cached = await readHolidayCache(year);
  if (!refresh && cached && Date.now() - Date.parse(cached.fetchedAt) < 86400000) {
    return { calendar: cached, status: "cached", message: "已使用本地节假日缓存" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await net.fetch(`https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`, {
      signal: controller.signal, redirect: "error", cache: "no-store",
    });
    if (response.status === 404) return { calendar: cached, status: cached ? "cached" : "unavailable", message: cached ? "线上暂无数据，继续使用缓存" : `${year} 年节假日数据尚不可用，按工作模式和个人调整显示` };
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 262144) { await reader.cancel(); throw new Error("response too large"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const calendar = parseTodoHolidayYear(JSON.parse(Buffer.concat(chunks).toString("utf8")), year);
    let message = "节假日与调休已更新";
    try { await writeLibraryJsonAtomically(holidayPath(year), JSON.stringify(calendar)); }
    catch { message = "节假日已加载，但缓存保存失败；重启后需重新联网"; }
    logger.info("network", "holiday-loaded", { year, days: calendar.days.length });
    return { calendar, status: "online", message };
  } catch {
    logger.warn("network", "holiday-fetch-failed", { year, hasCache: Boolean(cached) });
    return { calendar: cached, status: cached ? "cached" : "error", message: cached ? "联网更新失败，继续使用节假日缓存" : "节假日加载失败，暂按工作模式和个人调整显示，可重试" };
  } finally { clearTimeout(timeout); }
}
