import { createRequire } from "node:module";
import path from "node:path";

export type UpscalePaths = {
  userDataRoot: string;
  componentsRoot: string;
  realCuganRoot: string;
  realCuganModelsRoot: string;
  realEsrganRoot: string;
  cacheRoot: string;
};

export function resolveUpscalePaths(userDataRoot: string): UpscalePaths {
  const resolvedUserDataRoot = path.resolve(userDataRoot);
  const componentsRoot = path.join(resolvedUserDataRoot, "components");
  const realCuganRoot = path.join(componentsRoot, "upscale-cugan");

  return {
    userDataRoot: resolvedUserDataRoot,
    componentsRoot,
    realCuganRoot,
    realCuganModelsRoot: path.join(realCuganRoot, "models"),
    realEsrganRoot: path.join(componentsRoot, "upscale-realesrgan"),
    cacheRoot: path.join(resolvedUserDataRoot, "cache", "upscale"),
  };
}

export function getUpscalePaths(): UpscalePaths {
  const runtimeRequire = createRequire(__filename);
  const electron = runtimeRequire("electron") as { app?: { getPath?: (name: string) => string } };
  const userDataRoot = electron.app?.getPath?.("userData");
  if (!userDataRoot) {
    throw new Error("Electron userData path is unavailable");
  }
  return resolveUpscalePaths(userDataRoot);
}
