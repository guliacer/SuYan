import type { UpscaleModelId } from "../types";

type Backend = "webgpu" | "wasm";

export type RealCuganRunInput = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  scale: 2 | 3 | 4;
  onProgress?: (event: { progress: number; backend: Backend }) => void;
  onFallback?: (message: string) => void;
};

export type RealCuganRunResult = {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  backend: Backend;
};

type WorkerMessage = {
  type: "ready" | "progress" | "fallback" | "result" | "error";
  requestId: string;
  backend?: Backend;
  modelId?: string;
  progress?: number;
  message?: string;
  code?: string;
  pixels?: ArrayBuffer;
  width?: number;
  height?: number;
};

type PendingOperation = {
  requestId: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  onProgress?: RealCuganRunInput["onProgress"];
  onFallback?: RealCuganRunInput["onFallback"];
};

export class RealCuganClient {
  private worker: Worker | null = null;
  private pending: PendingOperation | null = null;
  private sequence = 0;

  async loadModel(
    modelId: UpscaleModelId,
    modelBytes: Uint8Array,
    options?: { forceWasm?: boolean },
  ): Promise<{ backend: Backend; modelId: string }> {
    if (modelBytes.byteLength === 0) {
      throw new Error("UPSCALE_MODEL_NOT_INSTALLED: Real-CUGAN 模型为空");
    }
    const requestId = this.nextRequestId();
    const model = modelBytes.buffer.slice(
      modelBytes.byteOffset,
      modelBytes.byteOffset + modelBytes.byteLength,
    );
    const result = this.beginOperation<{ backend: Backend; modelId: string }>(requestId);
    this.getWorker().postMessage({
      type: "load",
      requestId,
      modelId,
      model,
      forceWasm: options?.forceWasm === true,
    }, [model]);
    return result;
  }

  async run(input: RealCuganRunInput): Promise<RealCuganRunResult> {
    const expectedBytes = input.width * input.height * 4;
    if (input.pixels.byteLength !== expectedBytes) {
      throw new Error("UPSCALE_INPUT_UNSUPPORTED: RGBA 数据长度不匹配");
    }
    const requestId = this.nextRequestId();
    const pixels = input.pixels.buffer.slice(
      input.pixels.byteOffset,
      input.pixels.byteOffset + input.pixels.byteLength,
    );
    const result = this.beginOperation<RealCuganRunResult>(
      requestId,
      input.onProgress,
      input.onFallback,
    );
    this.getWorker().postMessage({
      type: "run",
      requestId,
      pixels,
      width: input.width,
      height: input.height,
      scale: input.scale,
    }, [pixels]);
    return result;
  }

  cancel(): boolean {
    const pending = this.pending;
    if (!pending && !this.worker) return false;
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    pending?.reject(new Error("UPSCALE_CANCELED: 超分任务已取消"));
    return Boolean(pending);
  }

  private beginOperation<T>(
    requestId: string,
    onProgress?: RealCuganRunInput["onProgress"],
    onFallback?: RealCuganRunInput["onFallback"],
  ): Promise<T> {
    if (this.pending) {
      throw new Error("UPSCALE_NATIVE_EXIT_FAILED: 同时只能运行一个 Real-CUGAN 操作");
    }
    return new Promise<T>((resolve, reject) => {
      this.pending = {
        requestId,
        resolve: (value) => resolve(value as T),
        reject,
        onProgress,
        onFallback,
      };
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./realCugan.worker.ts", import.meta.url), {
      type: "module",
      name: "suyan-real-cugan",
    });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const pending = this.pending;
      this.pending = null;
      pending?.reject(new Error(`UPSCALE_WASM_FAILED: ${event.message || "Real-CUGAN Worker 崩溃"}`));
      worker.terminate();
      if (this.worker === worker) this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: WorkerMessage): void {
    const pending = this.pending;
    if (!pending || message.requestId !== pending.requestId) return;
    if (message.type === "progress") {
      pending.onProgress?.({
        progress: message.progress ?? 0,
        backend: message.backend ?? "wasm",
      });
      return;
    }
    if (message.type === "fallback") {
      pending.onFallback?.(message.message ?? "已切换到 WASM");
      return;
    }
    if (message.type === "error") {
      this.pending = null;
      pending.reject(new Error(`${message.code ?? "UPSCALE_WASM_FAILED"}: ${message.message ?? "推理失败"}`));
      return;
    }
    if (message.type === "ready") {
      this.pending = null;
      pending.resolve({ backend: message.backend ?? "wasm", modelId: message.modelId ?? "" });
      return;
    }
    if (message.type === "result" && message.pixels && message.width && message.height) {
      this.pending = null;
      pending.resolve({
        pixels: new Uint8ClampedArray(message.pixels),
        width: message.width,
        height: message.height,
        backend: message.backend ?? "wasm",
      });
    }
  }

  private nextRequestId(): string {
    this.sequence += 1;
    return `cugan-${Date.now()}-${this.sequence}`;
  }
}

export const realCuganClient = new RealCuganClient();
