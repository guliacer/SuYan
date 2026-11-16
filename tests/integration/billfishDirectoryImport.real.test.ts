/**
 * Explicit opt-in only: SUYAN_REAL_BILLFISH_IMPORT=1.
 * pnpm exec vitest run --config tests/integration/billfishDirectoryImport.real.harness.cjs
 * Without that variable all four real-data cases are SKIPPED.
 * The normal project config only includes tests/unit; this dedicated config needs
 * no production/config changes. Keep the isolated temp tree for fixture UI reuse.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { LibraryFile, LibraryItem, LibraryRoot } from "../../src/features/library/types/library";
import type { LibraryDirectorySettings } from "../../src/features/library/utils/libraryDirectory";

const SOURCE = "W:\\AIphotograph\\AI图像存放\\input\\人像\\写真\\2026-09";
const OUTPUT = "C:\\Users\\Admin\\.frago\\data\\suyan\\20261114-billfish-parity";
const WORKSPACE = fileURLToPath(new URL("../../", import.meta.url));
const HARNESS = fileURLToPath(new URL("./billfishDirectoryImport.real.harness.cjs", import.meta.url));
const RESULT = path.join(OUTPUT, "real-import-result.json");
const FIXTURE = path.join(OUTPUT, "real-import-fixture.json");
const enabled = process.env.SUYAN_REAL_BILLFISH_IMPORT === "1";

type SourceEntry = { relativePath: string; size: number; sha256: string; mtimeMs: number };
type Snapshot = { files: SourceEntry[]; directories: string[] };
type MediaEntry = {
  itemId?: string; relativePath: string; originalAbsolutePath: string;
  extension: string; contentFormat?: string; width?: number; height?: number;
  directoryId?: string | null; thumbnailAbsolutePath?: string; previewAbsolutePath?: string;
  thumbnailSize?: number; thumbnailSha256?: string; thumbnailMtimeMs?: number;
  previewSize?: number; previewSha256?: string; previewMtimeMs?: number;
  thumbnailWidth?: number; thumbnailHeight?: number; error?: string;
};
type Check = { status: "passed" | "failed"; errors: string[]; importedCount: number; skippedCount: number; itemCount: number };
type Stage = {
  status: "passed" | "failed"; errors: string[]; userData: string;
  firstScan?: Check; secondScan?: Check; roots?: LibraryRoot[]; items?: LibraryItem[];
  library?: LibraryFile; directorySettings?: LibraryDirectorySettings; media?: MediaEntry[];
  formatCounts?: Record<string, number>; folderCount?: number; verifiedThumbnailCount?: number;
  psdPreview?: { width: number; height: number }; verifiedPreviewCount?: number;
  deniedWrites?: string[]; loadedProductionModules?: string[];
};
type Report = {
  generatedAt: string; sourceRoot: string; isolationRoot: string; before?: Snapshot; after?: Snapshot;
  scan?: Stage; cold?: Stage; reread?: Stage; fatal?: string; sourceUnchanged: boolean;
};
let report: Report;

async function atomicJson(file: string, value: unknown): Promise<void> {
  const temp = file + ".tmp-" + randomUUID();
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  await fs.rename(temp, file);
}

/** Unfiltered read-only inventory for integrity assertions, NOT an import scanner. */
async function snapshotSource(): Promise<Snapshot> {
  const files: SourceEntry[] = [], directories: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relativePath = path.relative(SOURCE, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) throw new Error("真实夹具包含链接，拒绝扩大源目录范围: " + relativePath);
      if (entry.isDirectory()) { directories.push(relativePath); await visit(absolute); }
      else if (entry.isFile()) {
        const stats = await fs.stat(absolute);
        const bytes = await fs.readFile(absolute);
        files.push({ relativePath, size: stats.size, sha256: createHash("sha256").update(bytes).digest("hex"), mtimeMs: stats.mtimeMs });
      }
    }
  }
  await visit(SOURCE);
  return { files: files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)), directories: directories.sort() };
}

async function runElectronStage(stage: string, userData: string, payload: Record<string, unknown>): Promise<Stage> {
  const requestPath = path.join(OUTPUT, "real-import-" + stage + "-request.json");
  const outputPath = path.join(OUTPUT, "real-import-" + stage + ".json");
  const runId = randomUUID();
  await fs.mkdir(userData, { recursive: true });
  await atomicJson(requestPath, { runId, stage, workspace: WORKSPACE, sourceRoot: SOURCE, outputDir: OUTPUT,
    isolationRoot: report.isolationRoot, userData, outputPath, ...payload });
  const electron = createRequire(path.join(WORKSPACE, "package.json"))("electron") as string;
  const env: NodeJS.ProcessEnv = { ...process.env, SUYAN_REAL_IMPORT_WORKER: "1", SUYAN_REAL_IMPORT_REQUEST: requestPath,
    PROMPT_LIBRARY_ENABLE_SEED: "0", SUYAN_USE_RUST_FILE_OPS: "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.PORTABLE_EXECUTABLE_DIR;
  const child = spawn(electron, ["--user-data-dir=" + userData, "--disk-cache-dir=" + path.join(userData, "chromium-cache"),
    "--crash-dumps-dir=" + path.join(userData, "crash-dumps"), HARNESS], { cwd: WORKSPACE, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", timedOut = false;
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 160_000);
  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject); child.once("close", resolve);
    });
    await atomicJson(path.join(OUTPUT, "real-import-" + stage + "-process.json"), { runId, exitCode, timedOut, stdout, stderr });
    if (timedOut || exitCode !== 0) throw new Error("Electron " + stage + " 退出=" + exitCode + ", timeout=" + timedOut + "\n" + stderr);
    const parsed = JSON.parse(await fs.readFile(outputPath, { encoding: "utf8" })) as Stage & { runId: string };
    if (parsed.runId !== runId) throw new Error("拒绝使用过期的 Electron 阶段结果: " + outputPath);
    return parsed;
  } finally { clearTimeout(timer); }
}

async function writeFixture(): Promise<void> {
  const media = (report.scan?.media ?? []).map(entry => ({ ...entry,
    ...report.cold?.media?.find(candidate => candidate.itemId === entry.itemId),
  }));
  await atomicJson(FIXTURE, {
    schemaVersion: 1, generatedAt: new Date().toISOString(), sourceRoot: SOURCE,
    isolatedUserData: report.cold?.userData ?? report.scan?.userData ?? null,
    isolationRoot: report.isolationRoot, retainedForReadOnlyUi: true,
    roots: report.scan?.roots ?? [], items: report.scan?.items ?? [], library: report.scan?.library ?? null,
    directorySettings: report.scan?.directorySettings ?? null, media,
    mediaPaths: Object.fromEntries(media.flatMap(entry => {
      const item = report.scan?.items?.find(candidate => candidate.id === entry.itemId);
      const original = entry.contentFormat === "psd" ? entry.previewAbsolutePath : entry.originalAbsolutePath;
      return item && original ? [[item.imageFileName, { original, thumbnail: entry.thumbnailAbsolutePath ?? original }]] : [];
    })),
    sourceDirectories: [SOURCE],
    cacheDirectories: [report.cold?.userData, report.scan?.userData].filter((value): value is string => Boolean(value)).map(value => path.join(value, "library", "thumbnails")),
    mediaByItemId: Object.fromEntries(media.filter(entry => entry.itemId).map(entry => [entry.itemId!, entry])),
    verification: { resultPath: RESULT, scanStatus: report.scan?.firstScan?.status ?? "not-run",
      thumbnailStatus: report.cold?.status ?? "not-run", rereadStatus: report.reread?.status ?? "not-run",
      sourceUnchanged: report.after ? report.sourceUnchanged : null, fatal: report.fatal ?? null },
  });
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(label + " 未执行。" + (report?.fatal ?? ""));
  return value;
}
function assertStage(stage: Stage | undefined, label: string): Stage {
  const result = required(stage, label);
  expect(result.status, label + ": " + result.errors.join("\n")).toBe("passed");
  expect(result.deniedWrites, label + " 越界写入").toEqual([]);
  return result;
}

describe.skipIf(!enabled)("Billfish 2026-09 real read-only import (explicit opt-in)", () => {
  beforeAll(async () => {
    await fs.mkdir(OUTPUT, { recursive: true });
    report = { generatedAt: new Date().toISOString(), sourceRoot: SOURCE, isolationRoot: "", sourceUnchanged: false };
    try {
      if (process.platform !== "win32") throw new Error("此真实 W 盘夹具必须在 Windows 上执行。");
      report.before = await snapshotSource();
      report.isolationRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-billfish-real-"));
      report.scan = await runElectronStage("scan", path.join(report.isolationRoot, "scan-user-data"), { manifest: report.before });
      // Publish imported roots/items immediately, even if a production media defect follows.
      await writeFixture();
      if (report.scan.library && report.scan.items?.length) {
        report.cold = await runElectronStage("cold-media", path.join(report.isolationRoot, "media-user-data"), { scan: report.scan });
        await writeFixture();
        report.reread = await runElectronStage("reread-media", report.cold.userData, { scan: report.scan, cold: report.cold });
      }
    } catch (error) { report.fatal = error instanceof Error ? error.stack ?? error.message : String(error); }
    finally {
      try {
        report.after = await snapshotSource();
        report.sourceUnchanged = JSON.stringify(report.before) === JSON.stringify(report.after);
      } catch (error) { report.fatal = [report.fatal, "最终源文件快照失败: " + String(error)].filter(Boolean).join("\n"); }
      await atomicJson(RESULT, report);
      await writeFixture();
    }
  }, 290_000);

  it("indexes all 135 real files into 16 physical folders and identifies actual contents", () => {
    const scan = assertStage(report.scan, "真实扫描");
    const first = required(scan.firstScan, "第一次扫描");
    expect(first.status, first.errors.join("\n")).toBe("passed");
    expect(first).toMatchObject({ importedCount: 135, skippedCount: 0, itemCount: 135 });
    expect(scan.roots).toHaveLength(1); expect(scan.items).toHaveLength(135);
    expect(scan.folderCount).toBe(16); expect(scan.formatCounts).toEqual({ webp: 134, psd: 1 });
    expect(report.before?.files).toHaveLength(135); expect(report.before?.directories).toHaveLength(16);
  });
  it("rescans the actual persisted index without duplicate files or changed item IDs", () => {
    const second = required(report.scan?.secondScan, "第二次扫描");
    expect(second.status, second.errors.join("\n")).toBe("passed");
    expect(second).toMatchObject({ importedCount: 0, skippedCount: 135, itemCount: 135 });
  });
  it("decodes all cold thumbnails and the 1080x1800 PSD preview, then reuses disk caches in a fresh Electron process", () => {
    const cold = assertStage(report.cold, "冷缓存"); const reread = assertStage(report.reread, "跨进程重读");
    expect(cold.verifiedThumbnailCount).toBe(135); expect(reread.verifiedThumbnailCount).toBe(135);
    expect(cold.verifiedPreviewCount).toBe(1); expect(reread.verifiedPreviewCount).toBe(1);
    expect(cold.psdPreview).toEqual({ width: 1080, height: 1800 });
    expect(reread.psdPreview).toEqual({ width: 1080, height: 1800 });
  });
  it("leaves every source size, SHA-256 and directory unchanged", () => {
    expect(report.sourceUnchanged, report.fatal).toBe(true);
    expect(required(report.after, "最终快照")).toEqual(required(report.before, "初始快照"));
    expect(report.after?.files).toHaveLength(135);
  });
});
