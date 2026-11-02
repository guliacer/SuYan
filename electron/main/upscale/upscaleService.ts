import path from "node:path";
import type {
  RealEsrganRunRequest,
  UpscaleEngine,
  UpscaleExportRequest,
  UpscaleModelId,
  UpscaleOutputFormat,
  UpscaleProgressEvent,
} from "../../../src/features/upscale/types";
import {
  getUpscaleModelDefinition,
  isUpscaleModelId,
} from "../../../src/features/upscale/utils/upscaleModels";
import { AppError } from "../ipc/errors";
import {
  exportUpscaleResult,
  pickUpscaleOutputDirectory,
} from "./upscaleExport";
import {
  getUpscaleComponentStatus,
  installRealCuganModel,
  installRealEsrgan,
  readRealCuganModel,
  removeUpscaleComponent,
} from "./upscaleInstaller";
import {
  createUpscaleResult,
  pickUpscaleInputs,
  readUpscaleInput,
  readUpscaleResult,
  registerUpscalePaths,
  type UpscaleInputPickKind,
  type UpscalePathInput,
} from "./upscaleInputs";
import {
  cancelRealEsrganJob,
  runRealEsrgan,
} from "./realEsrganRunner";

const MAX_BINARY_BYTES = 512 * 1024 * 1024;
const knownUpscaleCodes = new Set([
  "UPSCALE_INPUT_UNSUPPORTED",
  "UPSCALE_INPUT_MISSING",
  "UPSCALE_OUTPUT_TOO_LARGE",
  "UPSCALE_MODEL_NOT_INSTALLED",
  "UPSCALE_MODEL_DOWNLOAD_FAILED",
  "UPSCALE_MODEL_HASH_MISMATCH",
  "UPSCALE_COMPONENT_CORRUPTED",
  "UPSCALE_WEBGPU_UNAVAILABLE",
  "UPSCALE_WEBGPU_FAILED",
  "UPSCALE_WASM_FAILED",
  "UPSCALE_VULKAN_UNAVAILABLE",
  "UPSCALE_NATIVE_TIMEOUT",
  "UPSCALE_NATIVE_EXIT_FAILED",
  "UPSCALE_RESULT_MISSING",
  "UPSCALE_EXPORT_FAILED",
  "UPSCALE_LIBRARY_IMPORT_FAILED",
  "UPSCALE_CANCELED",
]);

export type UpscaleProgressSink = (event: UpscaleProgressEvent) => void;

export function getUpscaleStatusService(engine: unknown) {
  return withUpscaleErrors(() => getUpscaleComponentStatus(normalizeEngine(engine)));
}

export function installUpscaleComponentService(
  engine: unknown,
  modelId: unknown,
  emit: UpscaleProgressSink,
) {
  return withUpscaleErrors(async () => {
    const normalizedEngine = normalizeEngine(engine);
    if (normalizedEngine === "real-cugan") {
      const normalizedModel = normalizeModel(modelId, normalizedEngine);
      return installRealCuganModel(normalizedModel, (progress) => emit({
        jobId: null,
        engine: normalizedEngine,
        phase: progress.phase,
        progress: progress.totalBytes > 0 ? progress.bytesDownloaded / progress.totalBytes : 0,
        message: progress.message,
        bytesDownloaded: progress.bytesDownloaded,
        totalBytes: progress.totalBytes,
      }));
    }
    return installRealEsrgan((progress) => emit({
      jobId: null,
      engine: normalizedEngine,
      phase: progress.phase,
      progress: progress.totalBytes > 0 ? progress.bytesDownloaded / progress.totalBytes : 0,
      message: progress.message,
      bytesDownloaded: progress.bytesDownloaded,
      totalBytes: progress.totalBytes,
    }));
  });
}

export function removeUpscaleComponentService(engine: unknown) {
  return withUpscaleErrors(() => removeUpscaleComponent(normalizeEngine(engine)));
}

export function pickUpscaleInputsService(kind: unknown) {
  return withUpscaleErrors(() => pickUpscaleInputs(normalizePickKind(kind)));
}

export function registerUpscalePathsService(value: unknown) {
  return withUpscaleErrors(() => registerUpscalePaths(normalizePathInputs(value)));
}

export function readUpscaleInputService(token: unknown) {
  return withUpscaleErrors(async () => new Uint8Array(await readUpscaleInput(normalizeToken(token))));
}

export function readUpscaleModelService(modelId: unknown) {
  return withUpscaleErrors(async () => {
    const normalizedModel = normalizeModel(modelId, "real-cugan");
    return new Uint8Array(await readRealCuganModel(normalizedModel));
  });
}

export function runRealEsrganService(
  value: unknown,
  emit: UpscaleProgressSink,
) {
  return withUpscaleErrors(async () => {
    const request = normalizeRunRequest(value);
    return runRealEsrgan(request, {
      onProgress: (progress) => emit({
        jobId: request.jobId,
        engine: "real-esrgan",
        phase: "processing",
        progress: progress.progress,
        message: progress.message,
      }),
    });
  });
}

export function cancelRealEsrganService(jobId: unknown) {
  return withUpscaleErrors(async () => ({ canceled: await cancelRealEsrganJob(normalizeToken(jobId)) }));
}

export function storeUpscaleResultService(
  jobId: unknown,
  bytes: unknown,
  extension: unknown,
) {
  return withUpscaleErrors(() => createUpscaleResult(
    normalizeToken(jobId),
    normalizeBytes(bytes),
    normalizeOutputFormat(extension),
  ));
}

export function readUpscaleResultService(token: unknown) {
  return withUpscaleErrors(async () => new Uint8Array(await readUpscaleResult(normalizeToken(token))));
}

export function pickUpscaleOutputDirectoryService() {
  return withUpscaleErrors(() => pickUpscaleOutputDirectory());
}

export function exportUpscaleResultService(value: unknown) {
  return withUpscaleErrors(() => exportUpscaleResult(normalizeExportRequest(value)));
}

async function withUpscaleErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "超分操作失败";
    const code = /^([A-Z][A-Z0-9_]+):?/u.exec(message)?.[1];
    throw new AppError(code && knownUpscaleCodes.has(code) ? code : "UPSCALE_EXPORT_FAILED", message);
  }
}

function normalizeEngine(value: unknown): UpscaleEngine {
  if (value !== "real-cugan" && value !== "real-esrgan") {
    throw new AppError("UPSCALE_MODEL_NOT_INSTALLED", "超分引擎无效");
  }
  return value;
}

function normalizeModel(value: unknown, engine?: UpscaleEngine): UpscaleModelId {
  if (!isUpscaleModelId(value)) {
    throw new AppError("UPSCALE_MODEL_NOT_INSTALLED", "超分模型无效");
  }
  if (engine && getUpscaleModelDefinition(value).engine !== engine) {
    throw new AppError("UPSCALE_MODEL_NOT_INSTALLED", "模型与超分引擎不匹配");
  }
  return value;
}

function normalizePickKind(value: unknown): UpscaleInputPickKind {
  if (value !== "files" && value !== "directory") {
    throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "输入选择方式无效");
  }
  return value;
}

function normalizePathInputs(value: unknown): UpscalePathInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "拖入的图片数量无效");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "拖入图片数据无效");
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.filePath !== "string" || !path.isAbsolute(record.filePath)) {
      throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "拖入图片路径无效");
    }
    const sourceItemId = record.sourceItemId === null || record.sourceItemId === undefined
      ? null
      : normalizeToken(record.sourceItemId);
    return { filePath: record.filePath, sourceItemId };
  });
}

function normalizeRunRequest(value: unknown): RealEsrganRunRequest {
  const record = requireRecord(value, "UPSCALE_NATIVE_EXIT_FAILED", "原生超分参数无效");
  const modelId = normalizeModel(record.modelId, "real-esrgan");
  return {
    jobId: normalizeToken(record.jobId),
    inputToken: normalizeToken(record.inputToken),
    modelId,
    tileSize: normalizeInteger(record.tileSize, 0, 4096, "tile"),
    gpuId: normalizeInteger(record.gpuId, -1, 64, "GPU"),
    outputFormat: normalizeOutputFormat(record.outputFormat),
  };
}

function normalizeExportRequest(value: unknown): UpscaleExportRequest {
  const record = requireRecord(value, "UPSCALE_EXPORT_FAILED", "导出参数无效");
  const options = requireRecord(record.options, "UPSCALE_EXPORT_FAILED", "导出设置无效");
  return {
    jobId: normalizeToken(record.jobId),
    inputToken: normalizeToken(record.inputToken),
    resultToken: normalizeToken(record.resultToken),
    modelId: normalizeModel(record.modelId),
    options: options as unknown as UpscaleExportRequest["options"],
  };
}

function normalizeOutputFormat(value: unknown): UpscaleOutputFormat {
  if (value !== "png" && value !== "jpeg" && value !== "webp") {
    throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "图片格式无效");
  }
  return value;
}

function normalizeBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0 || value.byteLength > MAX_BINARY_BYTES) {
    throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "图片数据为空或过大");
  }
  return value;
}

function normalizeToken(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new AppError("UPSCALE_INPUT_UNSUPPORTED", "令牌无效");
  }
  return value;
}

function normalizeInteger(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new AppError("UPSCALE_NATIVE_EXIT_FAILED", `${label} 参数无效`);
  }
  return value as number;
}

function requireRecord(value: unknown, code: string, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(code, message);
  }
  return value as Record<string, unknown>;
}
