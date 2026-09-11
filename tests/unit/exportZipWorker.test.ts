import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeZipInBackground } from "../../electron/main/app/exportZipWorker";
import { runExportTask } from "../../electron/main/app/exportTask";

let directory: string;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-export-worker-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe("streaming ZIP background worker", () => {
  it("exports readable bytes with progress while the main event loop stays responsive", async () => {
    const source = path.join(directory, "图像.bin");
    const bytes = randomBytes(4 * 1024 * 1024);
    await fs.writeFile(source, bytes);
    const target = path.join(directory, "作品.zip");
    const sender = { id: 100, isDestroyed: () => false, send: vi.fn() };
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 10);
    try {
      await runExportTask(sender, "导出", async () => {
        await writeZipInBackground(target, [{ zipPath: "data.json", text: '{"title":"测试"}' }, { zipPath: "images/a.bin", sourcePath: source }]);
        return { filePath: target };
      });
    } finally { clearInterval(timer); }
    expect(ticks).toBeGreaterThan(2);
    const zip = await JSZip.loadAsync(await fs.readFile(target));
    expect((await zip.file("images/a.bin")!.async("nodebuffer")).equals(bytes)).toBe(true);
    expect(JSON.parse(await zip.file("data.json")!.async("string"))).toEqual({ title: "测试" });
    expect(sender.send.mock.calls.some(([, progress]) => progress.status === "running" && typeof progress.percent === "number")).toBe(true);
    expect(await fs.readdir(directory)).toEqual(expect.arrayContaining(["作品.zip", "图像.bin"]));
    expect((await fs.readdir(directory)).some(name => name.endsWith(".tmp"))).toBe(false);
  }, 15000);

  it("leaves an existing destination intact when source streaming fails", async () => {
    const target = path.join(directory, "existing.zip");
    await fs.writeFile(target, "previous valid export");
    await expect(writeZipInBackground(target, [{ zipPath: "a", sourcePath: path.join(directory, "missing") }])).rejects.toThrow();
    expect(await fs.readFile(target, "utf8")).toBe("previous valid export");
    expect(await fs.readdir(directory)).toEqual(["existing.zip"]);
  });

  it("rebuilds a corrupt native ZIP with the worker before replacing the destination", async () => {
    const target = path.join(directory, "作品.zip");
    await writeZipInBackground(target, [{ zipPath: "data.json", text: "{}" }], async temp => {
      await fs.writeFile(temp, "truncated"); return true;
    });
    const zip = await JSZip.loadAsync(await fs.readFile(target));
    expect(await zip.file("data.json")!.async("string")).toBe("{}");
  });
});
