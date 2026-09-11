export type ExportTaskProgress = {
  id: string;
  title: string;
  status: "running" | "completed" | "canceled" | "failed";
  phase: string;
  /** null means the current phase cannot be measured. */
  percent: number | null;
  completed?: number;
  total?: number;
  fileName?: string;
};
