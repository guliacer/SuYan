/// <reference lib="webworker" />

import * as ort from "onnxruntime-web/webgpu";
import wasmJsepMjsUrl from "onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url";
import wasmJsepUrl from "onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";
import {
  buildTileRegions,
  REAL_CUGAN_TILE_SIZE,
  validateUpscaleOutputSize,
  type RealCuganTileRegion,
} from "./realCuganTiling";

type LoadMessage = {
  type: "load";
  requestId: string;
  modelId: string;
  model: ArrayBuffer;
  forceWasm: boolean;
};

type RunMessage = {
  type: "run";
  requestId: string;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  scale: 2 | 3 | 4;
};

type IncomingMessage = LoadMessage | RunMessage;
type Backend = "webgpu" | "wasm";

const workerScope = self as DedicatedWorkerGlobalScope;
let session: ort.InferenceSession | null = null;
let backend: Backend | null = null;
let modelBytes: Uint8Array | null = null;
let loadedModelId: string | null = null;

ort.env.wasm.wasmPaths = { mjs: wasmJsepMjsUrl, wasm: wasmJsepUrl };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

workerScope.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === "load") {
    void loadModel(message);
    return;
  }
  void runImage(message);
};

async function loadModel(message: LoadMessage): Promise<void> {
  modelBytes = new Uint8Array(message.model);
  loadedModelId = message.modelId;
  try {
    let selected: Backend;
    if (message.forceWasm) {
      await createSession(modelBytes, "wasm");
      selected = "wasm";
    } else {
      selected = await createPreferredSession(modelBytes);
    }
    post({ type: "ready", requestId: message.requestId, backend: selected, modelId: message.modelId });
  } catch (error) {
    postError(message.requestId, "UPSCALE_WASM_FAILED", error);
  }
}

async function createPreferredSession(bytes: Uint8Array): Promise<Backend> {
  const gpuAvailable = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
  if (gpuAvailable) {
    try {
      await createSession(bytes, "webgpu");
      return "webgpu";
    } catch {
      // A failed WebGPU session is fully disposed before the one WASM retry.
    }
  }
  await createSession(bytes, "wasm");
  return "wasm";
}

async function createSession(bytes: Uint8Array, nextBackend: Backend): Promise<void> {
  await releaseSession();
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: [nextBackend],
    graphOptimizationLevel: "all",
  });
  backend = nextBackend;
}

async function runImage(message: RunMessage): Promise<void> {
  if (!session || !backend || !modelBytes || !loadedModelId) {
    postError(message.requestId, "UPSCALE_MODEL_NOT_INSTALLED", new Error("Real-CUGAN 模型尚未加载"));
    return;
  }
  try {
    const result = await inferTiled(message);
    postResult(message.requestId, result, backend);
  } catch (firstError) {
    if (backend !== "webgpu") {
      postError(message.requestId, "UPSCALE_WASM_FAILED", firstError);
      return;
    }
    try {
      await createSession(modelBytes, "wasm");
      post({
        type: "fallback",
        requestId: message.requestId,
        backend: "wasm",
        message: "WebGPU 推理失败，已切换到 WASM 重试",
      });
      const result = await inferTiled(message);
      postResult(message.requestId, result, "wasm");
    } catch (fallbackError) {
      postError(message.requestId, "UPSCALE_WASM_FAILED", fallbackError);
    }
  }
}

async function inferTiled(message: RunMessage): Promise<{
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const activeSession = session;
  if (!activeSession) throw new Error("推理会话不存在");
  const input = new Uint8ClampedArray(message.pixels);
  if (input.byteLength !== message.width * message.height * 4) {
    throw new Error("输入 RGBA 数据长度不匹配");
  }
  const outputSize = validateUpscaleOutputSize(message.width, message.height, message.scale);
  const output = new Uint8ClampedArray(outputSize.width * outputSize.height * 4);
  const regions = buildTileRegions(message.width, message.height, message.scale);

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const tile = extractClampedTile(input, message.width, message.height, region);
    const inferred = await inferTile(activeSession, tile, message.scale);
    stitchTile(output, outputSize.width, inferred, input, message.width, message.height, region);
    post({
      type: "progress",
      requestId: message.requestId,
      completed: index + 1,
      total: regions.length,
      progress: (index + 1) / regions.length,
      backend,
    });
  }
  return { pixels: output, width: outputSize.width, height: outputSize.height };
}

function extractClampedTile(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  region: RealCuganTileRegion,
): Uint8ClampedArray {
  const tile = new Uint8ClampedArray(REAL_CUGAN_TILE_SIZE * REAL_CUGAN_TILE_SIZE * 4);
  for (let y = 0; y < REAL_CUGAN_TILE_SIZE; y += 1) {
    const sourceY = Math.min(height - 1, region.sourceY + y);
    for (let x = 0; x < REAL_CUGAN_TILE_SIZE; x += 1) {
      const sourceX = Math.min(width - 1, region.sourceX + x);
      const sourceOffset = (sourceY * width + sourceX) * 4;
      const targetOffset = (y * REAL_CUGAN_TILE_SIZE + x) * 4;
      tile[targetOffset] = input[sourceOffset];
      tile[targetOffset + 1] = input[sourceOffset + 1];
      tile[targetOffset + 2] = input[sourceOffset + 2];
      tile[targetOffset + 3] = input[sourceOffset + 3];
    }
  }
  return tile;
}

async function inferTile(
  activeSession: ort.InferenceSession,
  rgba: Uint8ClampedArray,
  expectedScale: number,
): Promise<Uint8ClampedArray> {
  const pixelCount = REAL_CUGAN_TILE_SIZE * REAL_CUGAN_TILE_SIZE;
  const chw = new Float32Array(pixelCount * 3);
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaOffset = index * 4;
    chw[index] = rgba[rgbaOffset] / 255;
    chw[pixelCount + index] = rgba[rgbaOffset + 1] / 255;
    chw[pixelCount * 2 + index] = rgba[rgbaOffset + 2] / 255;
  }
  const inputTensor = new ort.Tensor("float32", chw, [1, 3, REAL_CUGAN_TILE_SIZE, REAL_CUGAN_TILE_SIZE]);
  let outputTensor: ort.Tensor | null = null;
  try {
    const result = await activeSession.run({ [activeSession.inputNames[0]]: inputTensor });
    const candidate = result[activeSession.outputNames[0]];
    if (!(candidate instanceof ort.Tensor) || candidate.dims.length !== 4) {
      throw new Error("Real-CUGAN 输出 tensor 结构无效");
    }
    outputTensor = candidate;
    const outputHeight = Number(candidate.dims[2]);
    const outputWidth = Number(candidate.dims[3]);
    if (outputWidth !== REAL_CUGAN_TILE_SIZE * expectedScale ||
        outputHeight !== REAL_CUGAN_TILE_SIZE * expectedScale ||
        !(candidate.data instanceof Float32Array)) {
      throw new Error("Real-CUGAN 模型倍率与选择不一致");
    }
    const outputPixels = outputWidth * outputHeight;
    const rgbaOutput = new Uint8ClampedArray(outputPixels * 4);
    for (let index = 0; index < outputPixels; index += 1) {
      const offset = index * 4;
      rgbaOutput[offset] = clampByte(candidate.data[index] * 255);
      rgbaOutput[offset + 1] = clampByte(candidate.data[outputPixels + index] * 255);
      rgbaOutput[offset + 2] = clampByte(candidate.data[outputPixels * 2 + index] * 255);
      rgbaOutput[offset + 3] = 255;
    }
    return rgbaOutput;
  } finally {
    inputTensor.dispose();
    outputTensor?.dispose();
  }
}

function stitchTile(
  output: Uint8ClampedArray,
  outputWidth: number,
  tile: Uint8ClampedArray,
  input: Uint8ClampedArray,
  inputWidth: number,
  inputHeight: number,
  region: RealCuganTileRegion,
): void {
  const tileOutputSize = REAL_CUGAN_TILE_SIZE * region.scale;
  const sourceStartX = region.cropLeft * region.scale;
  const sourceStartY = region.cropTop * region.scale;
  for (let y = 0; y < region.outputHeight; y += 1) {
    const tileRow = sourceStartY + y;
    const outputRow = region.outputY + y;
    for (let x = 0; x < region.outputWidth; x += 1) {
      const tileOffset = (tileRow * tileOutputSize + sourceStartX + x) * 4;
      const outputOffset = (outputRow * outputWidth + region.outputX + x) * 4;
      output[outputOffset] = tile[tileOffset];
      output[outputOffset + 1] = tile[tileOffset + 1];
      output[outputOffset + 2] = tile[tileOffset + 2];
      const sourceX = Math.min(inputWidth - 1, Math.floor((region.outputX + x) / region.scale));
      const sourceY = Math.min(inputHeight - 1, Math.floor((region.outputY + y) / region.scale));
      output[outputOffset + 3] = input[(sourceY * inputWidth + sourceX) * 4 + 3];
    }
  }
}

async function releaseSession(): Promise<void> {
  const current = session;
  session = null;
  backend = null;
  if (current) await current.release().catch(() => undefined);
}

function postResult(
  requestId: string,
  result: { pixels: Uint8ClampedArray; width: number; height: number },
  resultBackend: Backend,
): void {
  post({
    type: "result",
    requestId,
    pixels: result.pixels.buffer,
    width: result.width,
    height: result.height,
    backend: resultBackend,
  }, [result.pixels.buffer]);
}

function postError(requestId: string, code: string, error: unknown): void {
  post({
    type: "error",
    requestId,
    code,
    message: error instanceof Error ? error.message : String(error),
  });
}

function post(message: unknown, transfer: Transferable[] = []): void {
  workerScope.postMessage(message, transfer);
}

function clampByte(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0;
}

export {};
