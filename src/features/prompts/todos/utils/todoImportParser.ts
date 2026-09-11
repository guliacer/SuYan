import type { TodoImportCandidate, TodoImportParseResult, TodoPriority, TodoStatus } from "../../types";

type ParseOptions = {
  format?: string;
  sourceLabel?: string;
};

const headerAliases: Record<string, string> = {
  title: "title", name: "title", task: "title", item: "title", issue: "title", subject: "title", 事项: "title", 任务: "title", 标题: "title",
  description: "description", detail: "description", content: "description", 说明: "description", 描述: "description",
  progress: "progress", percent: "progress", percentage: "progress", 进度: "progress", 完成度: "progress",
  status: "status", state: "status", 状态: "status", 进展: "status",
  priority: "priority", level: "priority", 优先级: "priority",
  project: "projectName", projectname: "projectName", 项目: "projectName", 项目名称: "projectName",
  start: "startAt", startdate: "startAt", 开始: "startAt", 开始日期: "startAt",
  due: "dueAt", deadline: "dueAt", duedate: "dueAt", 截止: "dueAt", 截止日期: "dueAt",
  plan: "plannedDate", plandate: "plannedDate", planned: "plannedDate", 计划: "plannedDate", 计划日期: "plannedDate",
  schedule: "scheduledAt", scheduled: "scheduledAt", scheduledat: "scheduledAt", 排程: "scheduledAt", 计划时间: "scheduledAt",
  deadlineat: "deadlineAt", 截止时间: "deadlineAt",
  estimate: "timeEstimateMinutes", timeestimate: "timeEstimateMinutes", 估时: "timeEstimateMinutes", 预计分钟: "timeEstimateMinutes",
};

const taskPrefixPattern = /^(开发|优化|日报|日记|进展|工作|任务|事项|待办|计划|bug|修复|测试|设计|部署)\s*[:：-]\s*/iu;
const progressPattern = /(?:进度|完成度|完成率|progress)?\s*[:：=]?\s*(\d{1,3})\s*%/iu;
const fractionPattern = /(?:进度|完成度)?\s*[:：=]?\s*(\d+)\s*\/\s*(\d+)/u;
const datePattern = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/u;

export function parseTodoImportText(input: string, options: ParseOptions = {}): TodoImportParseResult {
  const sourceLabel = options.sourceLabel?.trim() || "文本导入";
  const text = normalizeText(input);
  const extension = normalizeFormat(options.format);

  if (!text) {
    return { candidates: [], warnings: ["内容为空。"], format: extension === "tsv" ? "csv" : extension ?? "text" };
  }

  if (extension === "json" || (extension === undefined && /^[\[{]/u.test(text))) {
    return parseJson(text, sourceLabel);
  }
  if (extension === "csv" || extension === "tsv" || looksLikeTable(text)) {
    return parseTable(text, extension === "tsv" ? "\t" : undefined, sourceLabel);
  }

  const format: TodoImportParseResult["format"] = extension === "markdown" ? "markdown" : extension === "docx" ? "docx" : "text";
  return parseLines(text, sourceLabel, format);
}

function parseJson(text: string, sourceLabel: string): TodoImportParseResult {
  try {
    const parsed: unknown = JSON.parse(text);
    const records = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.tasks)
        ? parsed.tasks
        : isRecord(parsed) && Array.isArray(parsed.items)
          ? parsed.items
          : isRecord(parsed)
            ? [parsed]
            : [];
    const candidates = records.flatMap((record, index) => candidateFromRecord(record, `${sourceLabel} · 第 ${index + 1} 项`));
    return {
      candidates,
      warnings: candidates.length ? [] : ["JSON 中没有找到带标题或事项字段的对象。"],
      format: "json",
    };
  } catch {
    return { candidates: [], warnings: ["JSON 格式无效，请检查括号、引号和逗号。"], format: "json" };
  }
}

function parseTable(text: string, preferredDelimiter: string | undefined, sourceLabel: string): TodoImportParseResult {
  const rows = parseDelimitedRows(text, preferredDelimiter ?? detectDelimiter(text));
  if (rows.length === 0) return { candidates: [], warnings: ["表格内容为空。"], format: preferredDelimiter === "\t" ? "csv" : "csv" };

  const headers = rows[0].map(normalizeHeader);
  const hasKnownHeader = headers.some((header) => headerAliases[header]);
  const dataRows = hasKnownHeader ? rows.slice(1) : rows;
  const candidates = dataRows.flatMap((row, index) => {
    const record: Record<string, string> = {};
    row.forEach((value, columnIndex) => {
      const key = headers[columnIndex];
      if (key) record[key] = value.trim();
    });
    if (!hasKnownHeader) {
      record.title = row[0] ?? "";
      record.description = row.slice(1).join("，");
    }
    return candidateFromRecord(record, `${sourceLabel} · 第 ${index + 1} 行`);
  });

  return {
    candidates,
    warnings: candidates.length ? [] : [hasKnownHeader ? "表格中没有找到有效事项。" : "CSV/TSV 首列需要是事项标题。"],
    format: "csv",
  };
}

function parseLines(text: string, sourceLabel: string, format: "text" | "markdown" | "docx"): TodoImportParseResult {
  const candidates: TodoImportCandidate[] = [];
  const warnings: string[] = [];
  let contextLabel = "";
  let contextProject = "";

  text.split("\n").forEach((rawLine, index) => {
    const original = rawLine.trim();
    if (!original) return;

    const heading = original.match(/^#{1,6}\s+(.+)$/u)?.[1]?.trim();
    const projectHeading = (heading ?? original).match(/^项目(?:名称)?\s*[:：]\s*(.+)$/u)?.[1]?.trim();
    if (projectHeading && !hasTaskSignal(heading ?? original)) {
      contextProject = projectHeading;
      return;
    }
    if (heading && isContextHeading(heading)) {
      contextLabel = cleanLabel(heading);
      return;
    }
    if (isContextHeading(original) && !hasTaskSignal(original)) {
      contextLabel = cleanLabel(original);
      return;
    }

    const candidate = candidateFromLine(original, sourceLabel, index + 1, contextLabel, contextProject);
    if (candidate) candidates.push(candidate);
  });

  if (!candidates.length) warnings.push("没有识别到事项。可使用“事项 + 进度/状态”、Markdown 复选框或表格列导入。 ");
  return { candidates, warnings, format };
}

function candidateFromRecord(value: unknown, sourceLabel: string): TodoImportCandidate[] {
  if (!isRecord(value)) return [];
  const title = firstString(value, ["title", "name", "task", "item", "issue", "subject", "事项", "任务", "标题"]);
  if (!title) return [];
  const rawProgress = firstValue(value, ["progress", "percent", "percentage", "进度", "完成度"]);
  const rawStatus = firstValue(value, ["status", "state", "状态", "进展"]);
  const progress = parseProgress(rawProgress);
  const status = mapStatus(rawStatus, progress);
  return [{
    title: cleanTaskTitle(title),
    description: optionalString(firstString(value, ["description", "detail", "content", "说明", "描述"])),
    projectName: optionalString(firstString(value, ["projectName", "project", "项目", "项目名称"])),
    status,
    priority: mapPriority(firstValue(value, ["priority", "level", "优先级"])),
    progress: status === "completed" ? 100 : progress,
    startAt: normalizeDateValue(firstString(value, ["startAt", "start", "startDate", "开始", "开始日期"])),
    dueAt: normalizeDateValue(firstString(value, ["dueAt", "due", "deadline", "dueDate", "截止", "截止日期"])),
    plannedDate: normalizeDateValue(firstString(value, ["plannedDate", "planDate", "plan", "计划", "计划日期"])),
    scheduledAt: normalizeDateTimeValue(firstString(value, ["scheduledAt", "scheduled", "schedule", "计划时间", "排程"])),
    deadlineAt: normalizeDateTimeValue(firstString(value, ["deadlineAt", "截止时间"])),
    timeEstimateMinutes: parseDurationMinutes(firstValue(value, ["timeEstimateMinutes", "timeEstimate", "estimate", "预计分钟", "估时"])),
    sourceLabel,
  }];
}

function candidateFromLine(line: string, sourceLabel: string, lineNumber: number, contextLabel: string, contextProject = ""): TodoImportCandidate | null {
  const checkbox = line.match(/^[-*+]\s+\[([ xX✓√])\]\s*(.*)$/u);
  const isMarkdownTask = Boolean(checkbox);
  let value = checkbox?.[2] ?? line;
  value = value.replace(/^[-*+]\s+/u, "").replace(/^\d+[.)、]\s*/u, "").trim();
  if (/^#{1,6}\s/u.test(value)) return null;
  if (isNonTaskLine(value)) return null;

  const prefix = value.match(taskPrefixPattern)?.[1] ?? "";
  const explicitProject = value.match(/^项目\s*[:：]\s*([^|｜,，;；]+)/u)?.[1]?.trim();
  const progress = parseProgress(value) || (isMarkdownTask && checkbox?.[1].toLowerCase() !== " " ? 100 : 0);
  const fraction = value.match(fractionPattern);
  const resolvedProgress = fraction ? Math.round((Number(fraction[1]) / Math.max(Number(fraction[2]), 1)) * 100) : progress;
  const explicitStatus = extractExplicitStatus(value);
  const status = isMarkdownTask && checkbox?.[1].toLowerCase() !== " " ? "completed" : mapStatus(explicitStatus, resolvedProgress);
  const title = cleanTaskTitle(
    value
      .replace(progressPattern, "")
      .replace(fractionPattern, "")
      .replace(statusSuffixPattern, "")
      .replace(statusTrailPattern, "")
      .replace(/(?:截止|截止日期|due)\s*[:：]?\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/iu, "")
      .replace(/\s*[-|｜]\s*$/u, "")
      .trim(),
  );
  if (!title || isOnlyMetadata(title)) return null;

  const visibleTitle = contextLabel && !title.startsWith(`${contextLabel}：`) && !prefix
    ? `${contextLabel}：${title}`
    : title;
  const date = value.match(/(?:截止|截止日期|due)\s*[:：]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/iu)?.[1] ?? value.match(datePattern)?.[1];
  const explicitDeadline = value.match(/(?:截止|截止日期|deadline|due)\s*[:：]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/iu)?.[1];
  const plannedDate = value.match(/(?:计划|计划日期|plan)\s*[:：]?\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/iu)?.[1];
  const estimate = value.match(/(?:估时|预计|estimate|\[t\])\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(分钟|分|min|m|小时|h)/iu);
  return {
    title: visibleTitle,
    description: `来源：第 ${lineNumber} 行${sourceLabel ? ` · ${sourceLabel}` : ""}`,
    ...(explicitProject || contextProject ? { projectName: explicitProject || contextProject } : {}),
    status,
    priority: mapPriority(value),
    progress: status === "completed" ? 100 : clampProgress(resolvedProgress),
    ...(date ? { dueAt: normalizeDateValue(date) } : {}),
    ...(plannedDate ? { plannedDate: normalizeDateValue(plannedDate) } : (!explicitDeadline && date ? { plannedDate: normalizeDateValue(date) } : {})),
    ...(explicitDeadline ? { deadlineAt: normalizeDateValue(explicitDeadline) } : {}),
    ...(estimate ? { timeEstimateMinutes: parseDurationMinutes(estimate[0]) } : {}),
    sourceLabel,
  };
}

const statusSuffixPattern = /(?:状态|进展)\s*[:：=]?\s*(已完成|完成|进行中|处理中|待开始|未开始|阻塞|取消|已取消|已关闭|关闭)\s*$/u;
const statusTrailPattern = /(?:[，,;；|｜]|\s+-\s*)(已完成|完成|进行中|处理中|待开始|未开始|阻塞|取消|已取消|已关闭|关闭)\s*$/u;

function extractExplicitStatus(value: string): string | undefined {
  const fieldStatus = value.match(statusSuffixPattern)?.[1];
  if (fieldStatus) return fieldStatus;
  const suffixStatus = value.match(statusTrailPattern)?.[1];
  if (suffixStatus) return suffixStatus;
  return value.match(/^(已完成|进行中|处理中|待开始|未开始|阻塞|取消|已取消|已关闭|关闭)\s*[:：-]/u)?.[1];
}

function parseProgress(value: unknown): number {
  if (typeof value === "number") return clampProgress(value <= 1 && value > 0 ? value * 100 : value);
  if (typeof value !== "string") return 0;
  const percent = value.match(/(\d{1,3})\s*%/u);
  if (percent) return clampProgress(Number(percent[1]));
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? clampProgress(numeric <= 1 && numeric > 0 ? numeric * 100 : numeric) : 0;
}

function mapStatus(value: unknown, progress: number): TodoStatus {
  const text = String(value ?? "").toLowerCase();
  if (/取消|关闭|cancel/u.test(text)) return "cancelled";
  if (/完成|done|complete|closed|已关闭/u.test(text) || progress >= 100) return "completed";
  if (/进行|处理中|开发中|优化中|阻塞|progress|doing|active/u.test(text) || progress > 0) return "in-progress";
  return "todo";
}

function mapPriority(value: unknown): TodoPriority {
  const text = String(value ?? "").toLowerCase();
  if (/紧急|阻塞|urgent|critical|p0/u.test(text)) return "urgent";
  if (/高|重要|high|p1/u.test(text)) return "high";
  if (/低|low|p3/u.test(text)) return "low";
  return "normal";
}

function normalizeText(value: string): string {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "").trim();
}

function normalizeFormat(value?: string): "markdown" | "csv" | "tsv" | "json" | "docx" | undefined {
  const format = value?.toLowerCase().replace(/^\./u, "");
  if (format === "md" || format === "markdown") return "markdown";
  if (format === "csv") return "csv";
  if (format === "tsv") return "tsv";
  if (format === "json") return "json";
  if (format === "docx") return "docx";
  return undefined;
}

function normalizeHeader(value: string): string {
  const key = value.toLowerCase().replace(/[\s_\-]/gu, "");
  return headerAliases[key] ?? headerAliases[value.trim()] ?? key;
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ""; continue; }
    if (char === "\n" && !quoted) { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const counts: Array<[string, number]> = [["\t", firstLine.split("\t").length], [",", firstLine.split(",").length], [";", firstLine.split(";").length]];
  return counts.sort((left, right) => right[1] - left[1])[0]?.[0] ?? ",";
}

function looksLikeTable(text: string): boolean {
  const firstLine = text.split("\n", 1)[0] ?? "";
  return /\t|,|;/.test(firstLine) && firstLine.split(/[\t,;]/u).some((value) => Boolean(headerAliases[normalizeHeader(value)]));
}

function cleanTaskTitle(value: string): string {
  return value.replace(/^[-*+]\s+/u, "").replace(/\s+/gu, " ").replace(/^[：:、，,。；;\-]+|[：:、，,。；;]+$/gu, "").trim();
}

function cleanLabel(value: string): string {
  return value.replace(/^#+\s*/u, "").replace(/\s+/gu, " ").trim();
}

function isContextHeading(value: string): boolean {
  return /^(开发|优化|日报|日记|进展|今日进展|工作计划|开发事项|优化事项)(?:[：:]|\s|$)/iu.test(value.trim());
}

function hasTaskSignal(value: string): boolean {
  return /%|进度|完成|进行中|待开始|事项|任务|[-*+]\s|\[[ xX✓√]\]/u.test(value);
}

function isNonTaskLine(value: string): boolean {
  return /^(日期|时间|日报日期|今日|开发|优化|日报|日记|进展|说明|备注|总结|目录|项目背景|更新时间)\s*[:：]?\s*$/iu.test(value)
    || /^[-_=]{3,}$/u.test(value);
}

function isOnlyMetadata(value: string): boolean {
  return /^(状态|进度|完成度|完成率|优先级|截止日期|截止|项目)\s*[:：=]?/iu.test(value);
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  return keys.map((key) => record[key]).find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function optionalString(value: string | undefined): string | undefined { return value?.trim() || undefined; }

function normalizeDateValue(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/u);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeDateTimeValue(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : normalizeDateValue(value);
}

function parseDurationMinutes(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(43200, Math.max(0, Math.round(value)));
  if (typeof value !== "string") return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(分钟|分|min|m|小时|h)/iu);
  if (!match) {
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? Math.min(43200, Math.max(0, Math.round(numeric))) : undefined;
  }
  const amount = Number(match[1]);
  const minutes = /小时|h/iu.test(match[2] ?? "") ? amount * 60 : amount;
  return Math.min(43200, Math.max(0, Math.round(minutes)));
}

function clampProgress(value: number): number { return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0))); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
