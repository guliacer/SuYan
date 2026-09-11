/** 将快速新增中的多行文本转为干净的待办标题。 */
export function splitTodoQuickInput(input: string): string[] {
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/u, "").replace(/^\[[ xX]\]\s*/u, "").trim())
    .filter(Boolean);
}

export type TodoQuickInput = {
  title: string;
  plannedDate?: string;
  deadlineAt?: string;
  timeEstimateMinutes?: number;
};

/** Parses the small, predictable subset of Super Productivity's short syntax. */
export function parseTodoQuickInput(input: string, now = new Date()): TodoQuickInput {
  let title = input.trim();
  let plannedDate: string | undefined;
  let deadlineAt: string | undefined;
  let timeEstimateMinutes: number | undefined;
  const planMatch = title.match(/(?:^|\s)@(today|tomorrow|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?=\s|$)/iu);
  if (planMatch) {
    plannedDate = resolveShortDate(planMatch[1] ?? "", now);
    title = title.replace(planMatch[0], " ");
  }
  const deadlineMatch = title.match(/(?:^|\s)!(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?=\s|$)/u);
  if (deadlineMatch) {
    deadlineAt = toIsoDate(deadlineMatch[1]);
    title = title.replace(deadlineMatch[0], " ");
  }
  const estimateMatch = title.match(/(?:^|\s)(?:\[t\]|t)\s*(\d+(?:\.\d+)?)\s*(m|min|分钟|h|小时)(?=\s|$)/iu);
  if (estimateMatch) {
    const amount = Number(estimateMatch[1]);
    timeEstimateMinutes = Math.round(amount * (/h|小时/iu.test(estimateMatch[2] ?? "") ? 60 : 1));
    title = title.replace(estimateMatch[0], " ");
  }
  return { title: title.replace(/\s+/gu, " ").trim(), ...(plannedDate ? { plannedDate } : {}), ...(deadlineAt ? { deadlineAt } : {}), ...(timeEstimateMinutes ? { timeEstimateMinutes } : {}) };
}

function resolveShortDate(value: string, now: Date): string | undefined {
  const normalized = value.toLowerCase();
  const date = new Date(now);
  if (normalized === "tomorrow") date.setDate(date.getDate() + 1);
  else if (normalized !== "today") {
    const match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u);
    if (!match) return undefined;
    date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toIsoDate(value: string): string | undefined {
  const match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}
