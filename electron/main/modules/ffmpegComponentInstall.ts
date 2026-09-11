// FFmpeg 按需组件安装的主进程编排：在线下载 / 离线导入 → 成功后刷新 ffmpeg 路径缓存。
// 供 IPC 层调用；对 Renderer 暴露统一的进度/结果形状，隐藏 componentInstaller 内部细节。
// 安全约束：下载 URL 与验签公钥固定内置于 componentConfig，Renderer 不得指定。
import { basename } from "node:path";
import { shell } from "electron";
import { dialog } from "../app/fileDialogs";
import { FFMPEG_COMPONENT_RELEASE_PAGE_URL } from "./componentConfig";
import {
  installFfmpegFromDownload,
  installFfmpegFromLocal,
  MANIFEST_FILE_NAME,
  removeInstalledFfmpegComponent,
  SIGNATURE_FILE_NAME,
  type InstallPhase,
} from "./componentInstaller";
import { resetFfmpegPathCache } from "../runtime/videoRuntime";

export type FfmpegInstallProgress = { phase: InstallPhase; message: string };
export type FfmpegInstallResult = { installed: boolean; version?: string; canceled?: boolean };
type ProgressCallback = (progress: FfmpegInstallProgress) => void;

/** 在线下载安装：从固定 Release 基址拉取并验签安装。成功后刷新路径缓存。 */
export async function installFfmpegComponentFromDownload(
  onProgress?: ProgressCallback,
): Promise<FfmpegInstallResult> {
  const result = await installFfmpegFromDownload((phase, message) => onProgress?.({ phase, message }));
  resetFfmpegPathCache();
  return { installed: true, version: result.version };
}

/** 离线导入：让用户同时选中 manifest.json + manifest.json.sig + ffmpeg-win32-x64.zip 三件，再验签安装。 */
export async function installFfmpegComponentFromLocal(
  onProgress?: ProgressCallback,
): Promise<FfmpegInstallResult> {
  onProgress?.({
    phase: "verifying",
    message: "请选择离线组件文件（manifest.json、manifest.json.sig、ffmpeg-win32-x64.zip）...",
  });
  const picked = await dialog.showOpenDialog({
    title: "选择 FFmpeg 组件离线包（需同时选中 manifest.json、manifest.json.sig、ffmpeg-win32-x64.zip 三件）",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "组件文件", extensions: ["json", "sig", "zip"] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { installed: false, canceled: true };
  }
  const paths = resolveLocalArtifactPaths(picked.filePaths);
  if (!paths) {
    throw new Error(
      "离线包不完整：需同时选择 manifest.json、manifest.json.sig 与 ffmpeg-win32-x64.zip 三个文件",
    );
  }
  const result = await installFfmpegFromLocal(paths, (phase, message) => onProgress?.({ phase, message }));
  resetFfmpegPathCache();
  return { installed: true, version: result.version };
}

/** 在系统浏览器打开内置版本对应的 Release 页面；不接受 Renderer 提供的 URL。 */
export async function openFfmpegComponentDownloadPage(): Promise<{ opened: true }> {
  await shell.openExternal(FFMPEG_COMPONENT_RELEASE_PAGE_URL);
  return { opened: true };
}

/** 删除应用下载的 FFmpeg 组件并清空路径缓存；系统安装的 FFmpeg 不受影响。 */
export async function removeFfmpegComponent(): Promise<{ removed: boolean }> {
  const result = await removeInstalledFfmpegComponent();
  resetFfmpegPathCache();
  return result;
}

/** 从用户所选文件中按固定文件名归类出三件套；缺任一件返回 null。 */
function resolveLocalArtifactPaths(
  files: string[],
): { manifestPath: string; signaturePath: string; zipPath: string } | null {
  const pick = (match: (base: string) => boolean) => files.find((file) => match(basename(file).toLowerCase()));
  const manifestPath = pick((base) => base === MANIFEST_FILE_NAME);
  const signaturePath = pick((base) => base === SIGNATURE_FILE_NAME);
  const zipPath = pick((base) => base.endsWith(".zip"));
  if (!manifestPath || !signaturePath || !zipPath) {
    return null;
  }
  return { manifestPath, signaturePath, zipPath };
}
