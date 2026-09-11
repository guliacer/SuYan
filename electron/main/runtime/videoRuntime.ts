import { execSync } from "node:child_process";
import { FFMPEG_COMPONENT_ID, FFMPEG_EXECUTABLE_NAME } from "../modules/componentConfig";
import { resolveInstalledComponentExeSync } from "../modules/componentLocator";

let ffmpegPathCache: string | null | undefined;

/** 安装/卸载按需组件后调用，令下次 getFfmpegPath 重新解析（否则命中模块级缓存）。 */
export function resetFfmpegPathCache(): void {
  ffmpegPathCache = undefined;
}

/**
 * 在系统 PATH 中查找 ffmpeg。
 * Windows 使用 where，其他平台使用 which。
 */
function findSystemFfmpeg(): string | null {
  try {
    const command = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const output = execSync(command, { encoding: "utf8", timeout: 5000 });
    const firstLine = output.split("\n").map((l) => l.trim()).find(Boolean);
    return firstLine ?? null;
  } catch {
    return null;
  }
}

export function getFfmpegPath(): string | null {
  // 命中的非空缓存直接返回；null 缓存不永久保留——
  // 早期调用（如 userData 重定向前）可能暂时探测不到，下次再解析，避免"未安装"被钉死。
  if (ffmpegPathCache !== undefined && ffmpegPathCache !== null) {
    return ffmpegPathCache;
  }

  // 1. 优先检查按需组件目录（已安装的受管组件）
  ffmpegPathCache = resolveInstalledComponentExeSync(FFMPEG_COMPONENT_ID, FFMPEG_EXECUTABLE_NAME);
  if (ffmpegPathCache) {
    return ffmpegPathCache;
  }

  // 2. 回退：在系统 PATH 中查找 ffmpeg（用户自行安装的场景）
  ffmpegPathCache = findSystemFfmpeg();

  return ffmpegPathCache;
}
