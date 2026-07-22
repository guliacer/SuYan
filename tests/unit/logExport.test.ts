import { describe, expect, it } from "vitest";
import {
  buildGithubFeedbackUrl,
  buildTextLogExport,
  filterLogEntriesForExport,
  normalizeExportFormat,
  normalizeExportPurpose,
  type LogEntry,
} from "../../electron/main/logExport";

function makeLine(entry: Partial<LogEntry> & Pick<LogEntry, "at" | "level" | "module" | "event">): string {
  return JSON.stringify({
    elapsedMs: 1,
    ...entry,
  });
}

describe("log export filters", () => {
  const lines = [
    makeLine({ at: "2026-07-21T01:00:00.000Z", level: "INFO", module: "main", event: "app:ready" }),
    makeLine({ at: "2026-07-21T02:00:00.000Z", level: "ERROR", module: "ipc", event: "handler-error", code: "X", message: "boom" }),
    makeLine({ at: "2026-07-10T02:00:00.000Z", level: "ERROR", module: "ipc", event: "old-error" }),
    makeLine({ at: "2026-07-21T03:00:00.000Z", level: "WARN", module: "ipc", event: "ipc:slow" }),
    "not-json",
  ];

  it("defaults conceptually to ERROR and keeps higher severities only", () => {
    const entries = filterLogEntriesForExport(lines, {
      minLevel: "ERROR",
      range: "all",
      nowMs: Date.parse("2026-07-21T12:00:00.000Z"),
    });
    expect(entries.map((item) => item.event)).toEqual(["handler-error", "old-error"]);
  });

  it("filters by range today and seven days", () => {
    const today = filterLogEntriesForExport(lines, {
      minLevel: "WARN",
      range: "today",
      nowMs: Date.parse("2026-07-21T12:00:00.000Z"),
    });
    expect(today.map((item) => item.event)).toEqual(["handler-error", "ipc:slow"]);

    const week = filterLogEntriesForExport(lines, {
      minLevel: "ERROR",
      range: "7d",
      nowMs: Date.parse("2026-07-21T12:00:00.000Z"),
    });
    expect(week.map((item) => item.event)).toEqual(["handler-error"]);
  });

  it("builds a readable text payload used by txt and zip exports", () => {
    const entries = filterLogEntriesForExport(lines, {
      minLevel: "ERROR",
      range: "all",
      nowMs: Date.parse("2026-07-21T12:00:00.000Z"),
    });

    const txt = buildTextLogExport(entries, { minLevel: "ERROR", range: "all", format: "txt" });
    expect(txt).toContain("素言应用日志导出");
    expect(txt).toContain("handler-error");

    const zipText = buildTextLogExport(entries, { minLevel: "ERROR", range: "all", format: "zip" });
    expect(zipText).toContain("素言应用日志导出");
    expect(zipText).toContain("boom");
  });

  it("normalizes supported formats and feedback purpose", () => {
    expect(normalizeExportFormat("txt")).toBe("txt");
    expect(normalizeExportFormat("zip")).toBe("zip");
    expect(normalizeExportFormat("csv")).toBe("txt");
    expect(normalizeExportPurpose("feedback")).toBe("feedback");
    expect(normalizeExportPurpose("unknown")).toBe("save");
  });

  it("builds the SuYan GitHub issue URL with a ZIP attachment instruction", () => {
    const url = new URL(buildGithubFeedbackUrl("素言-日志-2026-07-21-error.zip"));
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/guliacer/SuYan/issues/new");
    expect(url.searchParams.get("title")).toBe("[问题反馈] ");
    expect(url.searchParams.get("body")).toContain("素言-日志-2026-07-21-error.zip");
    expect(url.searchParams.get("body")).toContain("拖到这里");
  });
});
