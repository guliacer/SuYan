import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ExportTaskProgress } from "../../../src/types/exportTask";
import { IpcChannelName } from "../../shared/ipcChannels";
import { AppError } from "../ipc/errors";

type Sender = { id: number; isDestroyed(): boolean; send(channel: string, payload: ExportTaskProgress): void };
type Report = (phase: string, percent?: number | null, counts?: { completed: number; total: number }) => void;
const context = new AsyncLocalStorage<Report>();
const active = new Set<number>();

export function reportExportProgress(phase: string, percent: number | null = null, counts?: { completed: number; total: number }): void {
  context.getStore()?.(phase, percent, counts);
}

/** Export state never holds library/settings mutation locks or blocks unrelated IPC. */
export async function runExportTask<T>(sender: Sender, title: string, work: () => Promise<T>): Promise<T> {
  if (active.has(sender.id)) throw new AppError("EXPORT_IN_PROGRESS", "已有导出任务正在后台运行，请完成后再发起新的导出。其他功能可继续使用。");
  active.add(sender.id);
  const id = randomUUID();
  let lastSent = 0, lastPhase = "";
  const send = (progress: Omit<ExportTaskProgress, "id" | "title">) => {
    try { if (!sender.isDestroyed()) sender.send(IpcChannelName.ExportProgress, { id, title, ...progress }); }
    catch { /* A closing window must not turn a successful file write into a failure. */ }
  };
  const report: Report = (phase, percent = null, counts) => {
    const now = Date.now();
    if (phase === lastPhase && now - lastSent < 100 && percent !== 100) return;
    lastPhase = phase; lastSent = now;
    send({ status: "running", phase, percent: percent === null ? null : Math.max(0, Math.min(99, percent)), ...counts });
  };
  report("正在准备导出…");
  try {
    const result = await context.run(report, work);
    const data = (result ?? {}) as { canceled?: boolean; requiresAuthorChoice?: boolean; exported?: boolean; filePath?: string | null };
    const canceled = data.canceled || data.requiresAuthorChoice || data.exported === false;
    send({ status: canceled ? "canceled" : "completed", percent: canceled ? null : 100,
      phase: data.requiresAuthorChoice ? "请先确认作品归属" : canceled ? "未导出文件" : "导出完成",
      fileName: data.filePath ? path.basename(data.filePath) : undefined });
    return result;
  } catch (error) {
    send({ status: "failed", percent: null, phase: error instanceof AppError ? error.message : "导出失败，请重试或查看日志。" });
    throw error;
  } finally { active.delete(sender.id); }
}
