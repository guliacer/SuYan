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

export type UpscaleExportOptions = {
  saveToDirectory: boolean;
  addToLibrary: boolean;
  outputDirectoryToken: string | null;
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
  savedFilePath: string | null;
  importedItemIds: string[];
  skipped: boolean;
};
