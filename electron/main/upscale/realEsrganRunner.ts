import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  RealEsrganRunRequest,
  UpscaleModelId,
  UpscaleOutputFormat,
  UpscaleResultDescriptor,
} from "../../../src/features/upscale/types";
import { getUpscaleModelDefinition } from "../../../src/features/upscale/utils/upscaleModels";
import {
  createUpscaleResult,
  resolveUpscaleInputPath,
} from "./upscaleInputs";
import { getUpscalePaths, type UpscalePaths } from "./upscalePaths";

const DEFAULT_TIMEOUT_MS = 30 * 60_000;

type ProcessEventSource = {
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
};

export type SpawnedProcess = {
  pid?: number;
  stdout: ProcessEventSource | null;
  stderr: ProcessEventSource | null;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
};

type SpawnOptions =
  | {
      cwd: string;
      shell: false;
      windowsHide: true;
      stdio: ["ignore", "pipe", "pipe"];
    }
  | {
      shell: false;
      windowsHide: true;
      stdio: "ignore";
    };

export type RealEsrganSpawn = (
  executable: string,
  args: readonly string[],
  options: SpawnOptions,
) => SpawnedProcess;

export type RealEsrganRunnerDependencies = {
  paths: UpscalePaths;
  platform: NodeJS.Platform;
  spawn: RealEsrganSpawn;
  resolveInputPath(token: string): string;
  mkdir(directory: string): Promise<unknown>;
  readFile(filePath: string): Promise<Buffer>;
  removeFile(filePath: string): Promise<unknown>;
  createResult(
    jobId: string,
    bytes: Uint8Array,
    extension: UpscaleOutputFormat | "jpg",
    paths: UpscalePaths,
  ): Promise<UpscaleResultDescriptor>;
};

export type RealEsrganRunHooks = {
  onProgress?: (progress: { progress: number; message: string }) => void;
  timeoutMs?: number;
};

export type RealEsrganArgumentRequest = {
  inputPath: string;
  outputPath: string;
  modelId: UpscaleModelId;
  tileSize: number;
  gpuId: number;
  outputFormat: UpscaleOutputFormat;
};

type ActiveJob = {
  cancel(code: "UPSCALE_CANCELED" | "UPSCALE_NATIVE_TIMEOUT"): void;
};

const activeJobs = new Map<string, ActiveJob>();

export function buildRealEsrganArgs(request: RealEsrganArgumentRequest): string[] {
  const model = getUpscaleModelDefinition(request.modelId);
  if (model.engine !== "real-esrgan" || !model.nativeModelName) {
    throw new Error(`UPSCALE_MODEL_NOT_INSTALLED: ${request.modelId} 不是 Real-ESRGAN 模型`);
  }
  if (!path.isAbsolute(request.inputPath) || !path.isAbsolute(request.outputPath)) {
    throw new Error("UPSCALE_INPUT_MISSING: 原生引擎输入或输出路径无效");
  }
  if (!Number.isInteger(request.tileSize) || request.tileSize < 0 || request.tileSize > 4096) {
    throw new Error("UPSCALE_NATIVE_EXIT_FAILED: tile 参数无效");
  }
  if (!Number.isInteger(request.gpuId) || request.gpuId < -1 || request.gpuId > 64) {
    throw new Error("UPSCALE_NATIVE_EXIT_FAILED: GPU 参数无效");
  }

  return [
    "-i", request.inputPath,
    "-o", request.outputPath,
    "-n", model.nativeModelName,
    "-s", String(model.scale),
    "-t", String(request.tileSize),
    "-g", String(request.gpuId),
    "-f", toNativeFormat(request.outputFormat),
  ];
}

export function runRealEsrgan(
  request: RealEsrganRunRequest,
  hooks: RealEsrganRunHooks = {},
): Promise<UpscaleResultDescriptor> {
  return runRealEsrganWithDependencies(request, hooks, createDefaultDependencies());
}

export async function runRealEsrganWithDependencies(
  request: RealEsrganRunRequest,
  hooks: RealEsrganRunHooks,
  dependencies: RealEsrganRunnerDependencies,
): Promise<UpscaleResultDescriptor> {
  assertSafeJobId(request.jobId);
  if (activeJobs.has(request.jobId)) {
    throw new Error("UPSCALE_NATIVE_EXIT_FAILED: 任务已在运行");
  }

  const inputPath = dependencies.resolveInputPath(request.inputToken);
  const outputExtension = toNativeFormat(request.outputFormat);
  const jobRoot = directChild(dependencies.paths.cacheRoot, request.jobId);
  const outputPath = directChild(jobRoot, `native-output.${outputExtension}`);
  await dependencies.mkdir(jobRoot);
  await dependencies.removeFile(outputPath).catch(() => undefined);

  const executablePath = path.join(
    dependencies.paths.realEsrganRoot,
    "realesrgan-ncnn-vulkan.exe",
  );
  const args = buildRealEsrganArgs({
    inputPath,
    outputPath,
    modelId: request.modelId,
    tileSize: request.tileSize,
    gpuId: request.gpuId,
    outputFormat: request.outputFormat,
  });

  return new Promise<UpscaleResultDescriptor>((resolve, reject) => {
    let child: SpawnedProcess;
    try {
      child = dependencies.spawn(executablePath, args, {
        cwd: dependencies.paths.realEsrganRoot,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      reject(new Error("UPSCALE_COMPONENT_CORRUPTED: Real-ESRGAN 无法启动"));
      return;
    }

    let settled = false;
    const timeoutMs = normalizeTimeout(hooks.timeoutMs);
    const timeout = setTimeout(() => {
      cancel("UPSCALE_NATIVE_TIMEOUT");
    }, timeoutMs);
    timeout.unref?.();

    const beginSettlement = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      activeJobs.delete(request.jobId);
      return true;
    };

    const rejectWith = (code: string, message: string): void => {
      if (!beginSettlement()) return;
      void dependencies.removeFile(outputPath).catch(() => undefined);
      reject(new Error(`${code}: ${message}`));
    };

    const cancel = (code: "UPSCALE_CANCELED" | "UPSCALE_NATIVE_TIMEOUT"): void => {
      if (settled) return;
      terminateProcessTree(child, dependencies);
      rejectWith(
        code,
        code === "UPSCALE_NATIVE_TIMEOUT" ? "Real-ESRGAN 处理超时" : "超分任务已取消",
      );
    };

    activeJobs.set(request.jobId, { cancel });
    const onOutput = (chunk: Buffer | string): void => {
      const progress = parseNativeProgress(String(chunk));
      if (progress !== null) {
        hooks.onProgress?.({ progress, message: `Real-ESRGAN 处理中 ${Math.round(progress * 100)}%` });
      }
    };
    child.stdout?.on("data", onOutput);
    child.stderr?.on("data", onOutput);

    child.once("error", () => {
      rejectWith("UPSCALE_COMPONENT_CORRUPTED", "Real-ESRGAN 进程启动失败");
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        rejectWith("UPSCALE_NATIVE_EXIT_FAILED", `Real-ESRGAN 退出码 ${code ?? "unknown"}`);
        return;
      }
      if (!beginSettlement()) return;
      void finalizeResult(request, outputPath, outputExtension, dependencies)
        .then(resolve, reject)
        .finally(() => dependencies.removeFile(outputPath).catch(() => undefined));
    });
  });
}

export async function cancelRealEsrganJob(jobId: string): Promise<boolean> {
  const active = activeJobs.get(jobId);
  if (!active) return false;
  active.cancel("UPSCALE_CANCELED");
  return true;
}

export async function cancelAllRealEsrganJobs(): Promise<number> {
  const jobs = [...activeJobs.values()];
  for (const job of jobs) {
    job.cancel("UPSCALE_CANCELED");
  }
  return jobs.length;
}

export function parseNativeProgress(output: string): number | null {
  const matches = [...output.matchAll(/(\d+(?:\.\d+)?)\s*%/gu)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  const percentage = Number(raw);
  if (!Number.isFinite(percentage)) return null;
  return Math.min(1, Math.max(0, percentage / 100));
}

async function finalizeResult(
  request: RealEsrganRunRequest,
  outputPath: string,
  outputExtension: "png" | "jpg" | "webp",
  dependencies: RealEsrganRunnerDependencies,
): Promise<UpscaleResultDescriptor> {
  let bytes: Buffer;
  try {
    bytes = await dependencies.readFile(outputPath);
  } catch {
    throw new Error("UPSCALE_RESULT_MISSING: Real-ESRGAN 未生成输出文件");
  }
  if (bytes.length === 0) {
    throw new Error("UPSCALE_RESULT_MISSING: Real-ESRGAN 输出为空");
  }
  return dependencies.createResult(
    request.jobId,
    bytes,
    outputExtension,
    dependencies.paths,
  );
}

function terminateProcessTree(
  child: SpawnedProcess,
  dependencies: RealEsrganRunnerDependencies,
): void {
  if (dependencies.platform === "win32" && Number.isInteger(child.pid) && (child.pid ?? 0) > 0) {
    try {
      dependencies.spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { shell: false, windowsHide: true, stdio: "ignore" },
      );
      return;
    } catch {
      // Fall through to the direct kill when taskkill is unavailable.
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Process exit races are expected during cancellation.
  }
}

function createDefaultDependencies(): RealEsrganRunnerDependencies {
  const paths = getUpscalePaths();
  return {
    paths,
    platform: process.platform,
    spawn: (executable, args, options) => spawn(
      executable,
      [...args],
      options as Parameters<typeof spawn>[2],
    ) as unknown as SpawnedProcess,
    resolveInputPath: resolveUpscaleInputPath,
    mkdir: (directory) => fs.mkdir(directory, { recursive: true }),
    readFile: (filePath) => fs.readFile(filePath),
    removeFile: (filePath) => fs.rm(filePath, { force: true }),
    createResult: createUpscaleResult,
  };
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("UPSCALE_NATIVE_TIMEOUT: 超时参数无效");
  }
  return Math.max(1, Math.floor(timeoutMs));
}

function toNativeFormat(format: UpscaleOutputFormat): "png" | "jpg" | "webp" {
  return format === "jpeg" ? "jpg" : format;
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/iu.test(jobId)) {
    throw new Error("UPSCALE_NATIVE_EXIT_FAILED: 任务 ID 无效");
  }
}

function directChild(parent: string, childName: string): string {
  if (path.basename(childName) !== childName) {
    throw new Error("UPSCALE_NATIVE_EXIT_FAILED: 受管路径无效");
  }
  const resolvedParent = path.resolve(parent);
  const target = path.resolve(resolvedParent, childName);
  if (path.dirname(target) !== resolvedParent) {
    throw new Error("UPSCALE_NATIVE_EXIT_FAILED: 受管路径逃逸");
  }
  return target;
}
