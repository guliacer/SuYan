import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultTodoCalendar } from "../../src/features/prompts/todos/utils/todoWorkCalendar";

const state = vi.hoisted(() => ({ dataDir: "", fetch: vi.fn() }));
vi.mock("electron", () => ({ app: { getPath: () => state.dataDir }, net: { fetch: state.fetch } }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { readTodoCalendar, updateTodoCalendar, getTodoHolidayYear } from "../../electron/main/library/todoCalendarStore";

describe("calendar persistence and holiday service", () => {
  beforeAll(async () => { state.dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-calendar-test-")); });
  afterAll(async () => { await fs.rm(state.dataDir, { recursive: true, force: true }); });
  it("serializes day changes and pattern changes without losing overrides, then reads from disk", async () => {
    expect(await readTodoCalendar()).toEqual(defaultTodoCalendar());
    await Promise.all([
      updateTodoCalendar({ kind: "day", date: "2026-09-09", value: "rest" }),
      updateTodoCalendar({ kind: "settings", settings: { ...defaultTodoCalendar(), mode: "single-rest" } }),
      updateTodoCalendar({ kind: "day", date: "2026-09-10", value: "work" }),
    ]);
    expect(await readTodoCalendar()).toMatchObject({ mode: "single-rest", overrides: { "2026-09-09": "rest", "2026-09-10": "work" } });
    await updateTodoCalendar({ kind: "day", date: "2026-09-09", value: "default" });
    expect((await readTodoCalendar()).overrides).toEqual({ "2026-09-10": "work" });
    const disk = JSON.parse(await fs.readFile(path.join(state.dataDir, "library", "todo-calendar.json"), "utf8"));
    expect(disk.schemaVersion).toBe(1);
  });
  it("rejects malformed changes without corrupting saved data", async () => {
    const before = await readTodoCalendar();
    await expect(updateTodoCalendar({ kind: "day", date: "2026-02-30", value: "rest" })).rejects.toThrow("日历设置无效");
    expect(await readTodoCalendar()).toEqual(before);
  });
  it("uses a valid backup when the primary settings are corrupted", async () => {
    const file = path.join(state.dataDir, "library", "todo-calendar.json");
    await fs.writeFile(file, "broken", "utf8");
    expect((await readTodoCalendar()).mode).toBe("single-rest");
    await updateTodoCalendar({ kind: "day", date: "2026-09-11", value: "work" });
    expect((await readTodoCalendar()).overrides["2026-09-11"]).toBe("work");
  });
  it("fetches a validated year, caches it, and preserves it on a failed refresh", async () => {
    state.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ year: 2026, days: [{ date: "2026-01-04", name: "元旦", isOffDay: false }] })));
    const first = await getTodoHolidayYear(2026, true);
    expect(first.status).toBe("online");
    expect(state.fetch.mock.calls.at(-1)?.[0]).toBe("https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json");
    state.fetch.mockRejectedValueOnce(new Error("offline"));
    const offline = await getTodoHolidayYear(2026, true);
    expect(offline.status).toBe("cached");
    expect(offline.calendar).toEqual(first.calendar);
    const count = state.fetch.mock.calls.length;
    await getTodoHolidayYear(2026);
    expect(state.fetch.mock.calls.length).toBe(count);
  });
  it("shows unavailable data for a future year and rejects unsafe year inputs", async () => {
    state.fetch.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    expect(await getTodoHolidayYear(2099, true)).toMatchObject({ status: "unavailable", calendar: null });
    await expect(getTodoHolidayYear(NaN)).rejects.toThrow("请选择");
    await expect(getTodoHolidayYear(2026.5)).rejects.toThrow("请选择");
  });
  it("rejects oversized and malformed holiday payloads without claiming success", async () => {
    state.fetch.mockResolvedValueOnce(new Response("x".repeat(262145)));
    expect(await getTodoHolidayYear(2098, true)).toMatchObject({ status: "error", calendar: null });
    state.fetch.mockResolvedValueOnce(new Response('{"year":2097,"days":[]}'));
    expect(await getTodoHolidayYear(2097, true)).toMatchObject({ status: "error", calendar: null });
  });
});
