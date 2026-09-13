import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { assertZipIntegrity, ZipCorruptError } from "../library/zipIntegrity";
import { reportExportProgress } from "./exportTask";

export type ExportZipEntry = { zipPath: string } & ({ sourcePath: string } | { text: string });
type ExportZipProgressOptions = {
  progressCounts?: { completed: number; total: number };
  phasePrefix?: string;
};

// Trusted, static worker code; no user text is interpolated into executable code.
// Loading JSZip in the worker keeps both compression and large buffers off the UI/main thread.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const JSZip = require(workerData.jszipPath);
(async () => {
  const zip = new JSZip();
  for (const entry of workerData.entries) {
    // Open each source only when JSZip consumes it, avoiding thousands of open files.
    const data = entry.sourcePath ? Readable.from((async function* () {
      for await (const chunk of fs.createReadStream(entry.sourcePath)) yield chunk;
    })()) : entry.text;
    zip.file(entry.zipPath, data);
  }
  let lastSent = 0;
  const stream = zip.generateNodeStream({ streamFiles: true, compression: 'DEFLATE' }, metadata => {
    const now = Date.now();
    if (now - lastSent >= 100 || metadata.percent === 100) {
      lastSent = now;
      parentPort.postMessage({ type: 'progress', percent: metadata.percent });
    }
  });
  await pipeline(stream, fs.createWriteStream(workerData.outputPath));
  parentPort.postMessage({ type: 'done' });
})().catch(error => { throw error; });
`;

function resolveZipRuntime(): string {
  // Packaged workers use the real vendor directory, without relying on Electron's ASAR hooks.
  if (process.resourcesPath) {
    try { return createRequire(path.join(process.resourcesPath, "vendor", "package.cjs")).resolve("jszip"); }
    catch { /* Development uses the workspace dependency. */ }
  }
  return createRequire(__filename).resolve("jszip");
}

async function streamZip(outputPath: string, entries: ExportZipEntry[], options?: ExportZipProgressOptions): Promise<void> {
  const worker = new Worker(workerSource, { eval: true, workerData: { outputPath, entries, jszipPath: resolveZipRuntime() } });
  try {
    await new Promise<void>((resolve, reject) => {
      let done = false;
      worker.on("message", (message: { type: string; percent?: number }) => {
        if (message.type === "progress") {
          reportExportProgress(`${options?.phasePrefix ?? ""}正在压缩并写入文件…`, message.percent ?? null, options?.progressCounts);
        }
        if (message.type === "done") done = true;
      });
      worker.once("error", reject);
      worker.once("exit", code => done && code === 0 ? resolve() : reject(new Error("导出压缩线程意外结束。")));
    });
  } finally { await worker.terminate(); }
}

/** Publish only a validated archive; a failed export never removes an existing destination. */
export async function writeZipInBackground(
  outputPath: string,
  entries: ExportZipEntry[],
  tryNative?: (temporaryPath: string) => Promise<boolean>,
  options?: ExportZipProgressOptions,
): Promise<void> {
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  try {
    reportExportProgress(`${options?.phasePrefix ?? ""}正在压缩并写入文件…`, null, options?.progressCounts);
    let nativeValid = false;
    if (tryNative && await tryNative(temporaryPath)) {
      try { await assertZipIntegrity(temporaryPath); nativeValid = true; }
      catch (error) { if (!(error instanceof ZipCorruptError)) throw error; }
    }
    if (!nativeValid) await streamZip(temporaryPath, entries, options);
    reportExportProgress(`${options?.phasePrefix ?? ""}正在校验导出文件…`, null, options?.progressCounts);
    await assertZipIntegrity(temporaryPath);
    reportExportProgress(`${options?.phasePrefix ?? ""}正在完成保存…`, 100, options?.progressCounts);
    await fs.rename(temporaryPath, outputPath);
  } finally { await fs.rm(temporaryPath, { force: true }).catch(() => undefined); }
}
