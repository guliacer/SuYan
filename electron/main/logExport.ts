export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type LogEntry = {
  at: string;
  elapsedMs: number;
  level: LogLevel;
  module: string;
  event: string;
  code?: string;
  [key: string]: unknown;
};

export type LogExportRange = "today" | "7d" | "all";
export type LogExportFormat = "txt" | "zip";
export type LogExportPurpose = "save" | "feedback";

export type LogExportOptions = {
  /** 最低日志级别，默认 ERROR（含 ERROR）。 */
  minLevel?: LogLevel;
  /** 时间范围，默认 all。 */
  range?: LogExportRange;
  /** 导出格式，默认 txt（可读文本，工具通用）。 */
  format?: LogExportFormat;
  /** 导出用途；反馈模式会自动生成 ZIP 并打开 GitHub Issue。 */
  purpose?: LogExportPurpose;
};

export type LogExportResult = {
  exported: boolean;
  filePath: string | null;
  entryCount: number;
  format: LogExportFormat;
  minLevel: LogLevel;
  range: LogExportRange;
};

const suyanGithubFeedbackUrl = "https://github.com/guliacer/SuYan/issues/new";

const logLevelOrder: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export function filterLogEntriesForExport(
  lines: readonly string[],
  options: {
    minLevel: LogLevel;
    range: LogExportRange;
    nowMs?: number;
  },
): LogEntry[] {
  const nowMs = options.nowMs ?? Date.now();
  const minOrder = logLevelOrder[options.minLevel];
  const rangeStartMs = getExportRangeStartMs(options.range, nowMs);
  const entries: LogEntry[] = [];

  for (const line of lines) {
    const entry = parseLogLine(line);
    if (!entry) {
      continue;
    }

    if (logLevelOrder[entry.level] < minOrder) {
      continue;
    }

    if (rangeStartMs !== null) {
      const entryMs = Date.parse(entry.at);
      if (!Number.isFinite(entryMs) || entryMs < rangeStartMs) {
        continue;
      }
    }

    entries.push(entry);
  }

  return entries;
}

export function buildTextLogExport(
  entries: readonly LogEntry[],
  meta: { minLevel: LogLevel; range: LogExportRange; format: LogExportFormat },
): string {
  const header = [
    "素言应用日志导出",
    `导出时间: ${new Date().toISOString()}`,
    `最低级别: ${meta.minLevel}`,
    `时间范围: ${meta.range}`,
    `条目数: ${entries.length}`,
    "=".repeat(60),
    "",
  ].join("\n");

  const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
  return `${header}${body}\n`;
}

export function buildGithubFeedbackUrl(fileName: string): string {
  const feedbackUrl = new URL(suyanGithubFeedbackUrl);
  feedbackUrl.searchParams.set("title", "[问题反馈] ");
  feedbackUrl.searchParams.set(
    "body",
    [
      "### 问题描述",
      "请描述遇到的问题：",
      "",
      "### 复现步骤",
      "1. ",
      "",
      "### 日志附件",
      `请将资源管理器中已选中的 \`${fileName}\` 拖到这里。`,
    ].join("\n"),
  );
  return feedbackUrl.toString();
}

export function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      typeof parsed.at !== "string" ||
      typeof parsed.level !== "string" ||
      typeof parsed.module !== "string" ||
      typeof parsed.event !== "string"
    ) {
      return null;
    }

    const level = normalizeExportLogLevel(parsed.level);
    return {
      ...(parsed as LogEntry),
      at: parsed.at,
      elapsedMs: typeof parsed.elapsedMs === "number" ? parsed.elapsedMs : 0,
      level,
      module: parsed.module,
      event: parsed.event,
    };
  } catch {
    return null;
  }
}

export function getExportRangeStartMs(range: LogExportRange, nowMs: number): number | null {
  if (range === "all") {
    return null;
  }

  if (range === "today") {
    const date = new Date(nowMs);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  return nowMs - 7 * 24 * 60 * 60 * 1000;
}

export function normalizeExportLogLevel(input: unknown): LogLevel {
  if (input === "DEBUG" || input === "INFO" || input === "WARN" || input === "ERROR") {
    return input;
  }
  return "ERROR";
}

export function normalizeExportRange(input: unknown): LogExportRange {
  if (input === "today" || input === "7d" || input === "all") {
    return input;
  }
  return "all";
}

export function normalizeExportFormat(input: unknown): LogExportFormat {
  if (input === "zip" || input === "txt") {
    return input;
  }
  return "txt";
}

export function normalizeExportPurpose(input: unknown): LogExportPurpose {
  return input === "feedback" ? "feedback" : "save";
}
