import { describe, expect, it, vi } from "vitest";
import { reportExportProgress, runExportTask } from "../../electron/main/app/exportTask";
import { AppError } from "../../electron/main/ipc/errors";

function sender(id = 1) { return { id, isDestroyed: () => false, send: vi.fn() }; }
describe("background export lifecycle", () => {
  it("reports progress and completion only after the operation finishes", async () => {
    const target = sender();
    let finish!: () => void;
    const task = runExportTask(target, "导出", async () => {
      reportExportProgress("压缩", 25, { completed: 1, total: 4 });
      await new Promise<void>(resolve => { finish = resolve; });
      return { filePath: "C:\\导出\\作品.zip" };
    });
    expect(target.send.mock.calls.at(-1)?.[1]).toMatchObject({ status: "running", percent: 25, total: 4 });
    await expect(runExportTask(target, "重复", async () => ({}))).rejects.toMatchObject({ code: "EXPORT_IN_PROGRESS" });
    // Another window's independent task and other event-loop work can still complete.
    const independent = sender(2);
    await runExportTask(independent, "独立任务", async () => ({}));
    expect(independent.send.mock.calls.at(-1)?.[1].status).toBe("completed");
    finish(); await task;
    expect(target.send.mock.calls.at(-1)?.[1]).toMatchObject({ status: "completed", percent: 100, fileName: "作品.zip" });
  });

  it("reports cancellation/errors honestly and releases the guard after failure", async () => {
    const target = sender();
    await runExportTask(target, "取消", async () => ({ canceled: true }));
    expect(target.send.mock.calls.at(-1)?.[1]).toMatchObject({ status: "canceled", percent: null });
    await expect(runExportTask(target, "失败", async () => { throw new AppError("DISK_FULL", "磁盘空间不足"); })).rejects.toThrow();
    expect(target.send.mock.calls.at(-1)?.[1]).toMatchObject({ status: "failed", phase: "磁盘空间不足" });
    await runExportTask(target, "重试", async () => ({}));
    expect(target.send.mock.calls.at(-1)?.[1].status).toBe("completed");
  });

  it("does not let a closed window interrupt file creation", async () => {
    const target = { ...sender(), isDestroyed: () => true };
    await expect(runExportTask(target, "完成", async () => ({ canceled: false }))).resolves.toEqual({ canceled: false });
    expect(target.send).not.toHaveBeenCalled();
  });
});
