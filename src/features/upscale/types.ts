export type UpscaleEngine = "real-cugan" | "real-esrgan";
export type UpscalePreset = "anime" | "photo" | "manual";

export type UpscaleModelId =
  | "cugan-2x-no-denoise"
  | "cugan-2x-conservative"
  | "cugan-2x-denoise1"
  | "cugan-2x-denoise2"
  | "cugan-2x-denoise3"
  | "cugan-3x-no-denoise"
  | "cugan-3x-conservative"
  | "cugan-3x-denoise3"
  | "cugan-4x-no-denoise"
  | "cugan-4x-conservative"
  | "cugan-4x-denoise3"
  | "esrgan-x4plus"
  | "esrgan-x4plus-anime"
  | "esrgan-animevideov3-2x"
  | "esrgan-animevideov3-3x"
  | "esrgan-animevideov3-4x";

export type UpscaleJobStatus =
  | "queued"
  | "preparing"
  | "installing"
  | "loading-model"
  | "processing"
  | "result-ready"
  | "exporting"
  | "completed"
  | "canceling"
  | "canceled"
  | "failed";

export type UpscaleOutputFormat = "png" | "jpeg" | "webp";
export type UpscaleConflictPolicy = "append-number" | "overwrite" | "skip";
export type UpscaleLibraryMode = "new-group" | "append-source";

export type UpscaleInputDescriptor = {
  token: string;
  displayName: string;
  width: number;
  height: number;
  byteSize: number;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  sourceItemId: string | null;
  sourceImageFileName?: string | null;
  previewDataUrl: string;
};

export type UpscaleResultDescriptor = {
  token: string;
  previewDataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
};

export type UpscaleOutputDirectoryDescriptor = {
  token: string;
  displayName: string;
};

export type UpscaleExportOptions = {
  saveToDirectory: boolean;
  addToLibrary: boolean;
  outputDirectoryToken: string | null;
  /** 「另存为」时用户选定的完整文件路径，仅对该次导出的第一条生效。 */
  targetFilePath: string | null;
  format: UpscaleOutputFormat;
  quality: number;
  conflictPolicy: UpscaleConflictPolicy;
  namingPattern: string;
  preserveMetadata: boolean;
  libraryMode: UpscaleLibraryMode;
  title: string;
  categoryId: string | null;
  tags: string[];
};

export type UpscaleJob = {
  id: string;
  input: UpscaleInputDescriptor;
  modelId: UpscaleModelId;
  status: UpscaleJobStatus;
  progress: number;
  message: string;
  result: UpscaleResultDescriptor | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpscaleComponentPhase =
  | "not-installed"
  | "downloading"
  | "verifying"
  | "installing"
  | "ready"
  | "corrupted"
  | "failed";

export type UpscaleComponentStatus = {
  engine: UpscaleEngine;
  installed: boolean;
  phase: UpscaleComponentPhase;
  version: string | null;
  installedModelIds: UpscaleModelId[];
  bytesDownloaded: number;
  totalBytes: number;
  message: string;
};

export type UpscaleProgressEvent = {
  jobId: string | null;
  engine: UpscaleEngine;
  phase: UpscaleComponentPhase | UpscaleJobStatus;
  progress: number;
  message: string;
  bytesDownloaded?: number;
  totalBytes?: number;
};

export type RealEsrganRunRequest = {
  jobId: string;
  inputToken: string;
  modelId: UpscaleModelId;
  tileSize: number;
  gpuId: number;
  outputFormat: UpscaleOutputFormat;
};

export type UpscaleExportRequest = {
  jobId: string;
  inputToken: string;
  resultToken: string;
  modelId: UpscaleModelId;
  options: UpscaleExportOptions;
};

export type UpscaleExportResult = {
  savedFileName: string | null;
  importedItemIds: string[];
  skipped: boolean;
};

/**
 * 导出目标的选择结果，由系统对话框一次性选定，之后逐条提交导出。
 * - library：收录进素材库（画布底部「导出」按钮，零前置设置）
 * - directory：批量写入所选目录
 * - file：另存为指定文件路径（画布结果 hover 的单张导出）
 */
export type UpscaleExportTargetDescriptor = {
  mode: "library" | "directory" | "file";
  /** directory / file 模式下的目录令牌，供逐条导出定位落盘目录。 */
  directoryToken: string | null;
  /** file 模式下的完整目标路径。 */
  filePath: string | null;
};

export type UpscaleReplaceSourceRequest = {
  inputToken: string;
  resultToken: string;
};

export type UpscaleReplaceSourceResult = {
  sourceItemId: string;
  imageFileName: string;
};

/**
 * 模型收件目录的单个文件处理结果。
 * installed = 这次装好了；already = 之前就装过；rejected = 识别不出或校验不过。
 */
export type UpscaleDropboxEntry = {
  fileName: string;
  state: "installed" | "already" | "rejected";
  /** 中文说明，直接给用户看。 */
  detail: string;
  /** 落盘到哪了（installed / already 时有值）。 */
  targetPath?: string;
  /** 匹配到的模型 id（能对应上时才有）。 */
  modelId?: string;
};

export type UpscaleDropboxScanResult = {
  dropboxDir: string;
  scanned: number;
  installedCount: number;
  alreadyCount: number;
  rejectedCount: number;
  entries: UpscaleDropboxEntry[];
  /** 扫描后 Real-CUGAN 已就绪的模型，供 UI 直接展示。 */
  realCuganInstalledModelIds: string[];
  realEsrganInstalled: boolean;
};
