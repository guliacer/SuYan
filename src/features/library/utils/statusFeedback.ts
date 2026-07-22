export type StatusFeedbackTone = "error" | "info" | "success";

export type StatusFeedbackMessage = {
  text: string;
  type: StatusFeedbackTone;
  autoDismissMs?: number | null;
};

const pendingStatusPattern = /^(正在|检测中|查询中|保存中|测试中)/;

export function resolveStatusFeedbackTone(text: string): StatusFeedbackTone {
  const value = text.trim();

  if (!value) {
    return "info";
  }

  if (/失败|错误|异常|超时|请先|无法|不合法/.test(value)) {
    return "error";
  }

  if (isPendingStatusFeedbackText(value)) {
    return "info";
  }

  return "success";
}

export function isPendingStatusFeedbackText(text: string): boolean {
  return pendingStatusPattern.test(text.trim());
}
