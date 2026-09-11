export type TodoWorkMode = "single-rest" | "alternate-rest" | "double-rest";
export type TodoCalendarSettings = {
  mode: TodoWorkMode;
  singleRestDay: number;
  /** Any day in a double-rest reference week. Weeks start on Monday. */
  doubleRestWeek: string;
  useHolidays: boolean;
  overrides: Record<string, "work" | "rest">;
};
export type TodoCalendarChange =
  | { kind: "settings"; settings: Omit<TodoCalendarSettings, "overrides"> }
  | { kind: "day"; date: string; value: "work" | "rest" | "default" };
export type TodoHoliday = { date: string; name: string; isOffDay: boolean };
export type TodoHolidayYear = { year: number; days: TodoHoliday[]; fetchedAt: string };
export type TodoHolidayResult = {
  calendar: TodoHolidayYear | null;
  status: "online" | "cached" | "unavailable" | "error";
  message: string;
};
