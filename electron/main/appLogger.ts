import { app, dialog, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type JSZip from "jszip";
import type { LogExportOptions, LogExportResult } from "./logExport";
import {
  buildGithubFeedbackUrl,
  buildTextLogExport,
  filterLogEntriesForExport,
  normalizeExportFormat,
  normalizeExportLogLevel,
  normalizeExportPurpose,
  normalizeExportRange,
} from "./logExport";
import { normalizeExternalUrl } from "./app/externalUrlPolicy";
import { resolveLogDirectory } from "./logStoragePath";

export type {
  LogExportFormat,
  LogExportOptions,
  LogExportPurpose,
  LogExportRange,
  LogExportResult,
} from "./logExport";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const logLevelOrder: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

let minLevel: LogLevel = app.isPackaged ? "INFO" : "DEBUG";

const processStartTime = Date.now();

const maxLogBytes = 1024 * 1024;

const maxRotatedFiles = 2;

const logFileName = "app.log";

type JSZipConstructor = new () => JSZip;

let jsZipRuntime: JSZipConstructor | null = null;

const sensitiveKeyPatterns = [
  "apikey",
  "api_key",
  "api-key",
  "secret",
  "password",
  "token",
  "authorization",
  "credential",
];

export type LogEntry = {
  at: string;
  elapsedMs: number;
  level: LogLevel;
  module: string;
  event: string;
  code?: string;
  [key: string]: unknown;
};

let writeQueue: Promise<void> = Promise.resolve();
let currentLogPath: string | null = null;

function getLogDir(): string {
  return resolveLogDirectory({
    isPackaged: app.isPackaged,
    execPath: process.execPath,
    userDataPath: app.getPath("userData"),
    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
  });
}

function getLogPath(): string {
  if (!currentLogPath) {
    currentLogPath = path.join(getLogDir(), logFileName);
  }
  return currentLogPath;
}

export function log(
  level: LogLevel,
  module: string,
  event: string,
  details: Record<string, unknown> = {},
): void {
  if (logLevelOrder[level] < logLevelOrder[minLevel]) {
    return;
  }

  const entry: LogEntry = {
    at: new Date().toISOString(),
    elapsedMs: Date.now() - processStartTime,
    level,
    module,
    event,
    ...sanitizeDetails(details),
  };

  writeQueue = writeQueue.then(() => appendLog(JSON.stringify(entry))).catch(() => undefined);
}

export const logger = {
  debug: (module: string, event: string, details?: Record<string, unknown>) =>
    log("DEBUG", module, event, details),
  info: (module: string, event: string, details?: Record<string, unknown>) =>
    log("INFO", module, event, details),
  warn: (module: string, event: string, details?: Record<string, unknown>) =>
    log("WARN", module, event, details),
  error: (module: string, event: string, details?: Record<string, unknown>) =>
    log("ERROR", module, event, details),
};

export function logStartupEvent(event: string, details: Record<string, unknown> = {}): void {
  log("INFO", "main", event, details);
}

async function appendLog(line: string): Promise<void> {
  const logPath = getLogPath();
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await rotateIfNeeded(logPath);
  await fs.appendFile(logPath, `${line}\n`, "utf8");
}

async function rotateIfNeeded(logPath: string): Promise<void> {
  try {
    const stats = await fs.stat(logPath);

    if (stats.size <= maxLogBytes) {
      return;
    }

    const oldest = `${logPath}.${maxRotatedFiles}`;
    await fs.rm(oldest, { force: true });

    for (let i = maxRotatedFiles - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      await fs.rename(from, to).catch(() => undefined);
    }

    await fs.rename(logPath, `${logPath}.1`);
  } catch {
  }
}

export async function migrateOldStartupLog(): Promise<void> {
  try {
    await writeQueue;

    const userDataDir = app.getPath("userData");
    const legacyLogDir = path.join(userDataDir, "logs");
    const logDir = getLogDir();
    const legacyStartupLog = path.join(userDataDir, "library", "startup.log");
    const candidates = [
      `${legacyStartupLog}.old`,
      legacyStartupLog,
      path.join(legacyLogDir, "startup.log.old.migrated"),
      path.join(legacyLogDir, "startup.log.migrated"),
      path.join(legacyLogDir, `${logFileName}.${maxRotatedFiles}`),
      path.join(legacyLogDir, `${logFileName}.1`),
      path.join(legacyLogDir, logFileName),
    ];

    if (path.resolve(legacyLogDir) === path.resolve(logDir)) {
      await migrateLogFiles(candidates.slice(0, 2));
      return;
    }

    await migrateLogFiles(candidates);
    await fs.rmdir(legacyLogDir).catch(() => undefined);
  } catch {
  }
}

async function migrateLogFiles(sourcePaths: string[]): Promise<void> {
  for (const sourcePath of sourcePaths) {
    try {
      const content = await fs.readFile(sourcePath, "utf8");

      if (content.trim()) {
        for (const line of content.split(/\r?\n/)) {
          if (line.trim()) {
            await appendLog(line);
          }
        }
      }

      await fs.rm(sourcePath, { force: true });
    } catch {
    }
  }
}

export async function exportLogs(options: LogExportOptions = {}): Promise<LogExportResult> {
  await writeQueue;

  const minLevel = normalizeExportLogLevel(options.minLevel);
  const range = normalizeExportRange(options.range);
  const format = normalizeExportFormat(options.format);
  const purpose = normalizeExportPurpose(options.purpose);
  const outputFormat = purpose === "feedback" ? "zip" : format;
  const logDir = getLogDir();

  const logFiles: string[] = [];

  for (const candidate of [
    `${logFileName}.${maxRotatedFiles}`,
    `${logFileName}.1`,
    logFileName,
  ]) {
    const fullPath = path.join(logDir, candidate);
    try {
      await fs.access(fullPath);
      logFiles.push(fullPath);
    } catch {
    }
  }

  for (const migrated of ["startup.log.old.migrated", "startup.log.migrated"]) {
    const fullPath = path.join(logDir, migrated);
    try {
      await fs.access(fullPath);
      logFiles.push(fullPath);
    } catch {
    }
  }

  if (logFiles.length === 0 && purpose !== "feedback") {
    return {
      exported: false,
      filePath: null,
      entryCount: 0,
      format: outputFormat,
      minLevel,
      range,
    };
  }

  // 先在后台过滤，再弹出保存框，避免大日志时对话框前后都卡住主线程感知。
  const rawLines: string[] = [];
  for (const logFile of logFiles) {
    try {
      const content = await fs.readFile(logFile, "utf8");
      for (const line of content.split(/\r?\n/)) {
        if (line.trim()) {
          rawLines.push(line);
        }
      }
    } catch {
    }
  }

  const filteredEntries = filterLogEntriesForExport(rawLines, {
    minLevel,
    range,
    nowMs: Date.now(),
  });

  if (filteredEntries.length === 0 && purpose !== "feedback") {
    return {
      exported: false,
      filePath: null,
      entryCount: 0,
      format: outputFormat,
      minLevel,
      range,
    };
  }

  const dateLabel = new Date().toISOString().slice(0, 10);
  const extension = outputFormat;
  const levelLabel = minLevel.toLowerCase();
  const fileName = `素言-日志-${dateLabel}-${levelLabel}.${extension}`;
  const result =
    purpose === "feedback"
      ? { canceled: false, filePath: path.join(app.getPath("temp"), fileName) }
      : await dialog.showSaveDialog({
          title: "导出应用日志",
          defaultPath: fileName,
          filters:
            outputFormat === "zip"
              ? [{ name: "ZIP 日志包", extensions: ["zip"] }]
              : [{ name: "文本日志", extensions: ["txt", "log"] }],
        });

  if (result.canceled || !result.filePath) {
    return {
      exported: false,
      filePath: null,
      entryCount: filteredEntries.length,
      format: outputFormat,
      minLevel,
      range,
    };
  }

  const exportBody = buildTextLogExport(filteredEntries, { minLevel, range, format: outputFormat });

  if (outputFormat === "zip") {
    const JSZipRuntime = getJSZipConstructor();
    const zip = new JSZipRuntime();
    zip.file(`素言-日志-${dateLabel}-${levelLabel}.txt`, exportBody);
    zip.file(
      "请先阅读.txt",
      "此压缩包由素言自动生成，仅包含按所选时间和级别筛选后的应用日志。\n请将本 ZIP 拖入 GitHub Issue 的附件区域。\n",
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await fs.writeFile(result.filePath, buffer);
  } else {
    await fs.writeFile(result.filePath, exportBody, "utf8");
  }

  if (purpose === "feedback") {
    logger.info("main", "log-export:feedback-ready", {
      entryCount: filteredEntries.length,
      minLevel,
      range,
    });

    shell.showItemInFolder(result.filePath);
    await shell.openExternal(
      normalizeExternalUrl(buildGithubFeedbackUrl(path.basename(result.filePath))),
    );
  }

  return {
    exported: true,
    filePath: result.filePath,
    entryCount: filteredEntries.length,
    format: outputFormat,
    minLevel,
    range,
  };
}

function getJSZipConstructor(): JSZipConstructor {
  if (jsZipRuntime) {
    return jsZipRuntime;
  }

  const runtimeRequire = createRequire(__filename);

  try {
    jsZipRuntime = normalizeJSZipModule(runtimeRequire("jszip"));
  } catch {
    const vendorRequire = createRequire(path.join(process.resourcesPath, "vendor", "package.cjs"));
    jsZipRuntime = normalizeJSZipModule(vendorRequire("jszip"));
  }

  return jsZipRuntime;
}

function normalizeJSZipModule(input: unknown): JSZipConstructor {
  const candidate = (input as { default?: JSZipConstructor }).default ?? input;
  return candidate as JSZipConstructor;
}

export async function readRecentLogs(maxLines: number = 200): Promise<string[]> {
  const logPath = getLogPath();

  try {
    const content = await fs.readFile(logPath, "utf8");
    const lines = content.trim().split("\n");
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    if (isSensitiveKey(key)) {
      result[key] = "***";
      continue;
    }

    if (typeof value === "string" && value.length > 500) {
      result[key] = `${value.slice(0, 200)}...[截断, 原长${value.length}字符]`;
      continue;
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeDetails(value as Record<string, unknown>);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return sensitiveKeyPatterns.some((pattern) => lower.includes(pattern));
}

export function setMinLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLogDirPath(): string {
  return getLogDir();
}
