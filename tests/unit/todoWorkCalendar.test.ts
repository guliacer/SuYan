import { describe, expect, it } from "vitest";
import { defaultTodoCalendar, isCalendarDate, parseTodoHolidayYear, resolveTodoWorkday, validateTodoCalendar } from "../../src/features/prompts/todos/utils/todoWorkCalendar";
import { buildTodoMonthBuckets } from "../../src/features/prompts/todos/utils/todoPlanning";

describe("work calendar", () => {
  it("handles leap years, local month boundaries and labels independently of today", () => {
    const february = buildTodoMonthBuckets([], 2028, 1, () => true);
    expect(february).toHaveLength(29);
    expect(february[0].date).toBe("2028-02-01");
    expect(february[28].date).toBe("2028-02-29");
    expect(february[0].label).not.toBe("今天");
    expect(buildTodoMonthBuckets([], 2026, 12, () => true)[0].date).toBe("2027-01-01");
  });
  it("supports double rest and any single rest weekday", () => {
    const config = defaultTodoCalendar();
    expect(resolveTodoWorkday("2026-09-05", config).isWorkday).toBe(false);
    expect(resolveTodoWorkday("2026-09-06", config).isWorkday).toBe(false);
    expect(resolveTodoWorkday("2026-09-07", config).isWorkday).toBe(true);
    config.mode = "single-rest";
    config.singleRestDay = 3;
    expect(resolveTodoWorkday("2026-09-09", config).isWorkday).toBe(false);
    expect(resolveTodoWorkday("2026-09-06", config).isWorkday).toBe(true);
  });
  it("alternates continuous Monday weeks across months and years in both directions", () => {
    const config = { ...defaultTodoCalendar(), mode: "alternate-rest" as const, doubleRestWeek: "2027-01-03" };
    expect(resolveTodoWorkday("2027-01-02", config).isWorkday).toBe(false);
    expect(resolveTodoWorkday("2026-12-26", config).isWorkday).toBe(true);
    expect(resolveTodoWorkday("2027-01-09", config).isWorkday).toBe(true);
    expect(resolveTodoWorkday("2027-01-16", config).isWorkday).toBe(false);
    expect(resolveTodoWorkday("2027-01-10", config).isWorkday).toBe(false);
  });
  it("uses manual > holiday/makeup > pattern and restores the default", () => {
    const config = defaultTodoCalendar();
    const holidays = [{ date: "2026-01-04", name: "元旦", isOffDay: false }, { date: "2026-01-02", name: "元旦", isOffDay: true }];
    expect(resolveTodoWorkday("2026-01-04", config, holidays).isWorkday).toBe(true);
    expect(resolveTodoWorkday("2026-01-02", config, holidays).isWorkday).toBe(false);
    config.overrides["2026-01-04"] = "rest";
    expect(resolveTodoWorkday("2026-01-04", config, holidays).source).toBe("manual");
    expect(resolveTodoWorkday("2026-01-04", config, holidays).isWorkday).toBe(false);
    delete config.overrides["2026-01-04"];
    expect(resolveTodoWorkday("2026-01-04", config, holidays).isWorkday).toBe(true);
    config.useHolidays = false;
    expect(resolveTodoWorkday("2026-01-04", config, holidays).isWorkday).toBe(false);
  });
  it("rejects invalid dates and settings instead of rolling into another month", () => {
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(() => validateTodoCalendar({ ...defaultTodoCalendar(), singleRestDay: 7 })).toThrow();
    expect(() => validateTodoCalendar({ ...defaultTodoCalendar(), overrides: { "2026-02-30": "work" } })).toThrow();
  });
  it("validates real API shape, year, duplicates and booleans", () => {
    const entry = { date: "2026-01-01", name: "元旦", isOffDay: true };
    expect(parseTodoHolidayYear({ year: 2026, days: [entry], papers: [] }, 2026).days).toEqual([entry]);
    expect(() => parseTodoHolidayYear({ year: 2027, days: [entry] }, 2026)).toThrow();
    expect(() => parseTodoHolidayYear({ year: 2026, days: [entry, entry] }, 2026)).toThrow();
    expect(() => parseTodoHolidayYear({ year: 2026, days: [{ ...entry, isOffDay: "true" }] }, 2026)).toThrow();
    expect(() => parseTodoHolidayYear({ year: 2026, days: [] }, 2026)).toThrow();
  });
});
