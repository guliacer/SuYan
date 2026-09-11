import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { logger } from "../appLogger";
import { getSharp } from "../runtime/imageRuntime";
import {
  getLocalNsfwCurrentPath,
  getLocalNsfwModelPath,
  getLocalNsfwRuntimePackageJsonPath,
  getLocalNsfwPlatformDir,
  LOCAL_NSFW_MODEL_SHA256,
  LOCAL_NSFW_MODEL_SIZE,
  LOCAL_NSFW_THRESHOLD,
  LOCAL_NSFW_PLATFORM,
  LOCAL_NSFW_MODULE_VERSION,
} from "./localNsfwPaths";

type OrtTensor = { data: ArrayLike<number>; dims: readonly number[] };
type OrtSession = {
  run(inputs: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};
type OrtRuntime = {
  InferenceSession: {
    create(modelPath: string, options?: { executionProviders?: string[] }): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: Float32Array, dims: readonly number[]) => unknown;
};

type NsfwSharpPipeline = {
  rotate(): NsfwSharpPipeline;
  toColourspace(space: string): NsfwSharpPipeline;
  resize(options: { width: number; height: number; fit: string; kernel: string }): NsfwSharpPipeline;
  removeAlpha(): NsfwSharpPipeline;
  raw(): { toBuffer(): Promise<Buffer> };
};

export type LocalNsfwRating = "safe" | "nsfw";
export type LocalNsfwResult = {
  rating: LocalNsfwRating;
  score: number;
  threshold: number;
};

/** Converts the two model logits to the SFW probability used by the classifier. */
export function resolveNsfwScore(logits: readonly number[]): number {
  if (logits.length < 2 || !logits.slice(0, 2).every(Number.isFinite)) {
    throw new Error("模型输出形状无效");
  }

  const firstTwo = logits.slice(0, 2);
  const maxLogit = Math.max(...firstTwo);
  const exp = firstTwo.map((value) => Math.exp(value - maxLogit));
  const sum = exp[0] + exp[1];
  if (!Number.isFinite(sum) || sum <= 0) {
    throw new Error("模型输出概率无效");
  }
  return exp[0] / sum;
}

/** Converts an RGB uint8 image buffer to the model's NCHW, [-1, 1] tensor. */
export function createNsfwInputTensor(raw: Buffer): Float32Array {
  const channelSize = 384 * 384;
  if (raw.length !== channelSize * 3) {
    throw new Error("NSFW 图片预处理通道数无效");
  }

  const output = new Float32Array(channelSize * 3);
  for (let index = 0; index < channelSize; index += 1) {
    output[index] = raw[index * 3] / 127.5 - 1;
    output[channelSize + index] = raw[index * 3 + 1] / 127.5 - 1;
    output[channelSize * 2 + index] = raw[index * 3 + 2] / 127.5 - 1;
  }
  return output;
}

type CurrentModule = { version: string; platform: string };

let sessionPromise: Promise<{ session: OrtSession; runtime: OrtRuntime; inputName: string }> | null = null;
let sessionKey = "";

export async function isLocalNsfwAvailable(): Promise<boolean> {
  try {
    await resolveInstalledModule();
    return true;
  } catch {
    return false;
  }
}

export async function classifyLocalNsfwImage(imagePath: string): Promise<LocalNsfwResult> {
  const startedAt = Date.now();
  const loaded = await getSession();

  try {
    const input = await preprocessNsfwImage(imagePath);
    const tensor = new loaded.runtime.Tensor("float32", input, [1, 3, 384, 384]);
    const outputs = await loaded.session.run({ [loaded.inputName]: tensor });
    const output = Object.values(outputs)[0];
    const score = resolveNsfwScore(Array.from(output.data).slice(0, 2).map(Number));
    const result = {
      rating: score >= LOCAL_NSFW_THRESHOLD ? "nsfw" : "safe",
      score,
      threshold: LOCAL_NSFW_THRESHOLD,
    } satisfies LocalNsfwResult;

    logger.info("ai", "nsfw-local:classified", {
      durationMs: Date.now() - startedAt,
      rating: result.rating,
      score: Math.round(score * 1000) / 1000,
    });
    return result;
  } catch (error) {
    logger.error("ai", "nsfw-local:classify-failed", {
      code: "NSFW_LOCAL_CLASSIFY_FAILED",
      durationMs: Date.now() - startedAt,
      file: path.basename(imagePath),
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function resetLocalNsfwSession(): Promise<void> {
  sessionPromise = null;
  sessionKey = "";
}

async function getSession(): Promise<{ session: OrtSession; runtime: OrtRuntime; inputName: string }> {
  const installed = await resolveInstalledModule();
  const nextKey = `${installed.version}/${installed.platform}`;
  if (!sessionPromise || sessionKey !== nextKey) {
    sessionKey = nextKey;
    sessionPromise = createSession(installed).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function createSession(module: CurrentModule): Promise<{ session: OrtSession; runtime: OrtRuntime; inputName: string }> {
  const moduleRoot = getLocalNsfwPlatformDir(module.version, module.platform);
  const packageJsonPath = getLocalNsfwRuntimePackageJsonPath(module.version, module.platform);
  const runtimeRequire = createRequire(packageJsonPath);
  const runtime = runtimeRequire("onnxruntime-node") as OrtRuntime;
  const modelPath = getLocalNsfwModelPath(module.version, module.platform);

  let session: OrtSession;
  try {
    session = await runtime.InferenceSession.create(modelPath, { executionProviders: ["cuda", "cpu"] });
  } catch {
    session = await runtime.InferenceSession.create(modelPath, { executionProviders: ["cpu"] });
  }

  const inputName = await readSessionInputName(session);
  logger.info("ai", "nsfw-local:ready", {
    moduleRoot: path.basename(moduleRoot),
    platform: module.platform,
    version: module.version,
  });
  return { session, runtime, inputName };
}

async function readSessionInputName(session: OrtSession): Promise<string> {
  const inputNames = (session as OrtSession & { inputNames?: string[] }).inputNames;
  const inputName = inputNames?.[0];
  if (!inputName) {
    throw new Error("模型缺少输入节点");
  }
  return inputName;
}

export async function preprocessNsfwImage(imagePath: string): Promise<Float32Array> {
  const sharp = getSharp();
  const raw = await (sharp as unknown as (input: string) => NsfwSharpPipeline)(imagePath)
    .rotate()
    .toColourspace("srgb")
    .resize({ width: 384, height: 384, fit: "fill", kernel: "cubic" })
    // Strip an optional alpha channel after converting to sRGB. Calling ensureAlpha first
    // makes sharp keep four channels, which violates the model's RGB input contract.
    .removeAlpha()
    .raw()
    .toBuffer();
  return createNsfwInputTensor(raw);
}

async function resolveInstalledModule(): Promise<CurrentModule> {
  const current = JSON.parse(await fs.readFile(getLocalNsfwCurrentPath(), "utf8")) as Partial<CurrentModule>;
  if (current.version !== LOCAL_NSFW_MODULE_VERSION || current.platform !== LOCAL_NSFW_PLATFORM) {
    throw new Error("本地 NSFW 模块版本或平台不匹配");
  }

  const modelPath = getLocalNsfwModelPath(current.version, current.platform);
  const stats = await fs.stat(modelPath);
  if (stats.size !== LOCAL_NSFW_MODEL_SIZE) {
    throw new Error("本地 NSFW 模型大小校验失败");
  }

  const packageJsonPath = getLocalNsfwRuntimePackageJsonPath(current.version, current.platform);
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { dependencies?: Record<string, string> };
  if (!packageJson.dependencies || !Object.prototype.hasOwnProperty.call(packageJson.dependencies, "onnxruntime-node")) {
    throw new Error("本地 NSFW 模块缺少 onnxruntime-node");
  }

  const crypto = await import("node:crypto");
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(modelPath));
  if (hash.digest("hex") !== LOCAL_NSFW_MODEL_SHA256) {
    throw new Error("本地 NSFW 模型 SHA-256 校验失败");
  }
  return { version: current.version, platform: current.platform };
}
