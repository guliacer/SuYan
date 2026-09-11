import { app } from "electron";
import path from "node:path";
import {
  NSFW_COMPONENT_ID,
  NSFW_COMPONENT_PLATFORM,
  NSFW_COMPONENT_VERSION,
} from "../modules/componentConfig";

export const LOCAL_NSFW_MODULE_ID = NSFW_COMPONENT_ID;
export const LOCAL_NSFW_MODULE_VERSION = NSFW_COMPONENT_VERSION;
export const LOCAL_NSFW_PLATFORM = NSFW_COMPONENT_PLATFORM;
export const LOCAL_NSFW_RUNTIME_PACKAGE = "onnxruntime-node";
export const LOCAL_NSFW_RUNTIME_VERSION = "1.27.0";
export const LOCAL_NSFW_MODEL_RELATIVE_PATH = "model/nsfw.onnx";
export const LOCAL_NSFW_MODEL_SHA256 = "31814e03017dd076f7ca938bf7c190ce6ed86fc3b811d250d3aff076dc30efa4";
export const LOCAL_NSFW_MODEL_SIZE = 6_213_534;
export const LOCAL_NSFW_THRESHOLD = 0.6;

export function getComponentsBaseDir(): string {
  return path.join(app.getPath("userData"), "components");
}

export function getLocalNsfwModuleRoot(): string {
  return path.join(getComponentsBaseDir(), LOCAL_NSFW_MODULE_ID);
}

export function getLocalNsfwCurrentPath(): string {
  return path.join(getLocalNsfwModuleRoot(), "current.json");
}

export function getLocalNsfwPlatformDir(version = LOCAL_NSFW_MODULE_VERSION, platform = LOCAL_NSFW_PLATFORM): string {
  return path.join(getLocalNsfwModuleRoot(), version, platform);
}

export function getLocalNsfwModelPath(version = LOCAL_NSFW_MODULE_VERSION, platform = LOCAL_NSFW_PLATFORM): string {
  return path.join(getLocalNsfwPlatformDir(version, platform), LOCAL_NSFW_MODEL_RELATIVE_PATH);
}

export function getLocalNsfwRuntimePackageJsonPath(
  version = LOCAL_NSFW_MODULE_VERSION,
  platform = LOCAL_NSFW_PLATFORM,
): string {
  return path.join(getLocalNsfwPlatformDir(version, platform), "package.json");
}
