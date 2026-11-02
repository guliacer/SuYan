import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { IpcResult } from "@/types/suyanApi";
import type {
  UpscaleEngine,
  UpscaleExportOptions,
  UpscaleExportResult,
  UpscaleInputDescriptor,
  UpscaleJob,
  UpscaleJobStatus,
  UpscaleModelId,
  UpscalePreset,
  UpscaleResultDescriptor,
} from "../types";
import { defaultUpscaleExportOptions, normalizeUpscaleExportOptions } from "../utils/upscaleExport";
import { getUpscaleModelDefinition } from "../utils/upscaleModels";
import { realCuganClient } from "../worker/realCuganClient";

export type UpscaleProcessingSettings = {
  preset: UpscalePreset;
  engine: UpscaleEngine;
  modelId: UpscaleModelId;
  tileSize: number;
  gpuId: number;
  forceWasm: boolean;
  exportOptions: UpscaleExportOptions;
};

export type UpscaleProcessProgress = (
  progress: number,
  message: string,
  status?: UpscaleJobStatus,
) => void;

export type UpscaleStoreDependencies = {
  process(
    job: UpscaleJob,
    settings: UpscaleProcessingSettings,
    onProgress: UpscaleProcessProgress,
  ): Promise<UpscaleResultDescriptor>;
  cancel(job: UpscaleJob): Promise<boolean> | boolean;
  exportResult(
    job: UpscaleJob,
    options: UpscaleExportOptions,
  ): Promise<UpscaleExportResult>;
  now(): string;
  createId(): string;
};

export type UpscaleStoreState = UpscaleProcessingSettings & {
  jobs: UpscaleJob[];
  selectedJobId: string | null;
  activeJobId: string | null;
  isRunning: boolean;
  cancelRequested: boolean;
  enqueue(inputs: UpscaleInputDescriptor[]): void;
  remove(jobId: string): void;
  reorder(jobId: string, beforeJobId: string): void;
  select(jobId: string | null): void;
  startQueue(): Promise<void>;
  cancelActive(): Promise<boolean>;
  retry(jobId: string): void;
  setPreset(preset: UpscalePreset): void;
  setEngine(engine: UpscaleEngine): void;
  setModelId(modelId: UpscaleModelId): void;
  setTileSize(tileSize: number): void;
  setGpuId(gpuId: number): void;
  setForceWasm(forceWasm: boolean): void;
  setExportOptions(options: Partial<UpscaleExportOptions>): void;
  commitResults(jobIds?: string[]): Promise<{ completed: number; failed: number }>;
  clearCompleted(): void;
};

const defaultSettings: UpscaleProcessingSettings = {
  preset: "anime",
  engine: "real-cugan",
  modelId: "cugan-2x-conservative",
  tileSize: 0,
  gpuId: -1,
  forceWasm: false,
  exportOptions: defaultUpscaleExportOptions,
};

export function createUpscaleStore(
  dependencies: UpscaleStoreDependencies = browserDependencies,
): StoreApi<UpscaleStoreState> {
  return createStore<UpscaleStoreState>((set, get) => ({
    ...defaultSettings,
    exportOptions: { ...defaultSettings.exportOptions },
    jobs: [],
    selectedJobId: null,
    activeJobId: null,
    isRunning: false,
    cancelRequested: false,

    enqueue(inputs) {
      if (inputs.length === 0) return;
      const now = dependencies.now();
      const modelId = get().modelId;
      const jobs = inputs.map<UpscaleJob>((input) => ({
        id: dependencies.createId(),
        input,
        modelId,
        status: "queued",
        progress: 0,
        message: "等待处理",
        result: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      }));
      set((state) => ({
        jobs: [...state.jobs, ...jobs],
        selectedJobId: state.selectedJobId ?? jobs[0]?.id ?? null,
      }));
    },

    remove(jobId) {
      if (get().activeJobId === jobId) return;
      set((state) => {
        const jobs = state.jobs.filter((job) => job.id !== jobId);
        return {
          jobs,
          selectedJobId: state.selectedJobId === jobId
            ? jobs[0]?.id ?? null
            : state.selectedJobId,
        };
      });
    },

    reorder(jobId, beforeJobId) {
      if (jobId === beforeJobId) return;
      set((state) => {
        const fromIndex = state.jobs.findIndex((job) => job.id === jobId);
        const targetIndex = state.jobs.findIndex((job) => job.id === beforeJobId);
        if (fromIndex < 0 || targetIndex < 0) return state;
        const jobs = [...state.jobs];
        const [job] = jobs.splice(fromIndex, 1);
        const insertionIndex = jobs.findIndex((entry) => entry.id === beforeJobId);
        jobs.splice(insertionIndex < 0 ? jobs.length : insertionIndex, 0, job);
        return { jobs };
      });
    },

    select(selectedJobId) {
      if (selectedJobId && !get().jobs.some((job) => job.id === selectedJobId)) return;
      set({ selectedJobId });
    },

    async startQueue() {
      if (get().isRunning) return;
      set({ isRunning: true, cancelRequested: false });
      try {
        const jobIds = get().jobs.filter((job) => job.status === "queued").map((job) => job.id);
        for (const jobId of jobIds) {
          if (get().cancelRequested) break;
          const job = get().jobs.find((entry) => entry.id === jobId);
          if (!job || job.status !== "queued") continue;
          updateJob(set, dependencies, jobId, {
            status: "preparing",
            progress: 0,
            message: "准备输入",
            errorCode: null,
          });
          set({ activeJobId: jobId, selectedJobId: jobId });
          const settings = readSettings(get());
          try {
            const result = await dependencies.process(
              { ...job, status: "preparing" },
              { ...settings, modelId: job.modelId, engine: getUpscaleModelDefinition(job.modelId).engine },
              (progress, message, status = "processing") => {
                updateJob(set, dependencies, jobId, {
                  status,
                  progress: clampProgress(progress),
                  message,
                });
              },
            );
            updateJob(set, dependencies, jobId, {
              status: "result-ready",
              progress: 1,
              message: "结果待导出",
              result,
              errorCode: null,
            });
          } catch (error) {
            const code = errorCode(error);
            updateJob(set, dependencies, jobId, {
              status: code === "UPSCALE_CANCELED" ? "canceled" : "failed",
              message: errorMessage(error),
              errorCode: code,
            });
          } finally {
            set({ activeJobId: null });
          }
        }
      } finally {
        set({ isRunning: false, activeJobId: null, cancelRequested: false });
      }
    },

    async cancelActive() {
      const state = get();
      const active = state.jobs.find((job) => job.id === state.activeJobId);
      if (!active) return false;
      set({ cancelRequested: true });
      updateJob(set, dependencies, active.id, {
        status: "canceling",
        message: "正在取消",
      });
      return dependencies.cancel(active);
    },

    retry(jobId) {
      const job = get().jobs.find((entry) => entry.id === jobId);
      if (!job || get().activeJobId === jobId) return;
      updateJob(set, dependencies, jobId, {
        status: job.result ? "result-ready" : "queued",
        progress: job.result ? 1 : 0,
        message: job.result ? "结果待导出" : "等待重试",
        errorCode: null,
      });
    },

    setPreset(preset) {
      if (preset === "anime") {
        applyModelSettings(set, dependencies, "real-cugan", "cugan-2x-conservative", preset);
      } else if (preset === "photo") {
        applyModelSettings(set, dependencies, "real-esrgan", "esrgan-x4plus", preset);
      } else {
        set({ preset });
      }
    },

    setEngine(engine) {
      const modelId: UpscaleModelId = engine === "real-cugan"
        ? "cugan-2x-conservative"
        : "esrgan-x4plus";
      applyModelSettings(set, dependencies, engine, modelId, "manual");
    },

    setModelId(modelId) {
      const engine = getUpscaleModelDefinition(modelId).engine;
      applyModelSettings(set, dependencies, engine, modelId, "manual");
    },

    setTileSize(tileSize) {
      set({ tileSize: normalizeInteger(tileSize, 0, 4096, 0) });
    },

    setGpuId(gpuId) {
      set({ gpuId: normalizeInteger(gpuId, -1, 64, -1) });
    },

    setForceWasm(forceWasm) {
      set({ forceWasm });
    },

    setExportOptions(options) {
      set((state) => ({
        exportOptions: normalizeUpscaleExportOptions({ ...state.exportOptions, ...options }),
      }));
    },

    async commitResults(jobIds) {
      const allowedIds = jobIds ? new Set(jobIds) : null;
      const candidates = get().jobs.filter((job) =>
        job.status === "result-ready" && Boolean(job.result) && (!allowedIds || allowedIds.has(job.id))
      );
      let completed = 0;
      let failed = 0;
      for (const candidate of candidates) {
        const current = get().jobs.find((job) => job.id === candidate.id);
        if (!current?.result || current.status !== "result-ready") continue;
        updateJob(set, dependencies, current.id, {
          status: "exporting",
          message: "正在导出",
          errorCode: null,
        });
        try {
          await dependencies.exportResult(current, get().exportOptions);
          updateJob(set, dependencies, current.id, {
            status: "completed",
            progress: 1,
            message: "已完成",
            errorCode: null,
          });
          completed += 1;
        } catch (error) {
          updateJob(set, dependencies, current.id, {
            status: "result-ready",
            message: errorMessage(error),
            errorCode: errorCode(error),
          });
          failed += 1;
        }
      }
      return { completed, failed };
    },

    clearCompleted() {
      set((state) => {
        const jobs = state.jobs.filter((job) => job.status !== "completed" && job.status !== "canceled");
        return {
          jobs,
          selectedJobId: jobs.some((job) => job.id === state.selectedJobId)
            ? state.selectedJobId
            : jobs[0]?.id ?? null,
        };
      });
    },
  }));
}

type StateSetter = StoreApi<UpscaleStoreState>["setState"];

function updateJob(
  set: StateSetter,
  dependencies: UpscaleStoreDependencies,
  jobId: string,
  patch: Partial<UpscaleJob>,
): void {
  set((state) => ({
    jobs: state.jobs.map((job) => job.id === jobId
      ? { ...job, ...patch, updatedAt: dependencies.now() }
      : job),
  }));
}

function applyModelSettings(
  set: StateSetter,
  dependencies: UpscaleStoreDependencies,
  engine: UpscaleEngine,
  modelId: UpscaleModelId,
  preset: UpscalePreset,
): void {
  set((state) => ({
    engine,
    modelId,
    preset,
    jobs: state.jobs.map((job) => job.status === "queued"
      ? { ...job, modelId, updatedAt: dependencies.now() }
      : job),
  }));
}

function readSettings(state: UpscaleStoreState): UpscaleProcessingSettings {
  return {
    preset: state.preset,
    engine: state.engine,
    modelId: state.modelId,
    tileSize: state.tileSize,
    gpuId: state.gpuId,
    forceWasm: state.forceWasm,
    exportOptions: state.exportOptions,
  };
}

function clampProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function normalizeInteger(value: number, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /^([A-Z][A-Z0-9_]+):?/u.exec(message)?.[1] ?? "UPSCALE_EXPORT_FAILED";
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[A-Z][A-Z0-9_]+:\s*/u, "") || "超分操作失败";
}

function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`${result.error.code}: ${result.error.message}`);
}

const browserDependencies: UpscaleStoreDependencies = {
  process: processInBrowser,
  async cancel(job) {
    const engine = getUpscaleModelDefinition(job.modelId).engine;
    if (engine === "real-cugan") return realCuganClient.cancel();
    return unwrap(await window.suyanApi.cancelRealEsrgan(job.id)).canceled;
  },
  async exportResult(job, options) {
    if (!job.result) throw new Error("UPSCALE_RESULT_MISSING: 超分结果已过期");
    return unwrap(await window.suyanApi.exportUpscaleResult({
      jobId: job.id,
      inputToken: job.input.token,
      resultToken: job.result.token,
      modelId: job.modelId,
      options,
    }));
  },
  now: () => new Date().toISOString(),
  createId: () => globalThis.crypto.randomUUID(),
};

async function processInBrowser(
  job: UpscaleJob,
  settings: UpscaleProcessingSettings,
  onProgress: UpscaleProcessProgress,
): Promise<UpscaleResultDescriptor> {
  const definition = getUpscaleModelDefinition(job.modelId);
  if (definition.engine === "real-esrgan") {
    const unsubscribe = window.suyanApi.onUpscaleProgress((event) => {
      if (event.jobId === job.id) onProgress(event.progress, event.message, "processing");
    });
    try {
      onProgress(0, "启动 Real-ESRGAN", "preparing");
      return unwrap(await window.suyanApi.runRealEsrgan({
        jobId: job.id,
        inputToken: job.input.token,
        modelId: job.modelId,
        tileSize: settings.tileSize,
        gpuId: settings.gpuId,
        outputFormat: settings.exportOptions.format,
      }));
    } finally {
      unsubscribe();
    }
  }

  onProgress(0, "读取 Real-CUGAN 模型", "loading-model");
  const modelBytes = unwrap(await window.suyanApi.readUpscaleModel(job.modelId));
  await realCuganClient.loadModel(job.modelId, modelBytes, { forceWasm: settings.forceWasm });
  const sourceBytes = unwrap(await window.suyanApi.readUpscaleInput(job.input.token));
  const source = await decodeImage(sourceBytes, job.input.mediaType);
  const output = await realCuganClient.run({
    pixels: source.pixels,
    width: source.width,
    height: source.height,
    scale: definition.scale,
    onProgress: ({ progress, backend }) => onProgress(progress, `${backend.toUpperCase()} 推理中`, "processing"),
    onFallback: (message) => onProgress(0, message, "processing"),
  });
  onProgress(1, "正在生成预览", "processing");
  const encoded = await encodeImage(
    output.pixels,
    output.width,
    output.height,
    settings.exportOptions.format,
    settings.exportOptions.quality,
  );
  return unwrap(await window.suyanApi.storeUpscaleResult(
    job.id,
    encoded,
    settings.exportOptions.format,
  ));
}

async function decodeImage(
  bytes: Uint8Array,
  mediaType: UpscaleInputDescriptor["mediaType"],
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const blob = new Blob([ownedBytes.buffer], { type: mediaType });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("UPSCALE_INPUT_UNSUPPORTED: 无法创建图片解码画布");
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { pixels: imageData.data, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function encodeImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  format: UpscaleExportOptions["format"],
  quality: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("UPSCALE_EXPORT_FAILED: 无法创建结果编码画布");
  const ownedPixels = new Uint8ClampedArray(pixels.length);
  ownedPixels.set(pixels);
  context.putImageData(new ImageData(ownedPixels, width, height), 0, 0);
  const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const blob = await canvas.convertToBlob({
    type: mimeType,
    quality: format === "png" ? undefined : quality / 100,
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export const upscaleStore = createUpscaleStore();

export function useUpscaleStore<T>(selector: (state: UpscaleStoreState) => T): T {
  return useStore(upscaleStore, selector);
}
