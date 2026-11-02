import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

const channels = [
  ["UpscaleStatus", "upscale:status"],
  ["UpscaleInstall", "upscale:install"],
  ["UpscaleRemove", "upscale:remove"],
  ["UpscalePickInputs", "upscale:pick-inputs"],
  ["UpscaleRegisterPaths", "upscale:register-paths"],
  ["UpscaleReadInput", "upscale:read-input"],
  ["UpscaleReadModel", "upscale:read-model"],
  ["UpscaleRunNative", "upscale:run-native"],
  ["UpscaleCancelNative", "upscale:cancel-native"],
  ["UpscaleStoreResult", "upscale:store-result"],
  ["UpscaleReadResult", "upscale:read-result"],
  ["UpscalePickOutputDirectory", "upscale:pick-output-directory"],
  ["UpscaleExport", "upscale:export"],
  ["UpscaleProgress", "upscale:progress"],
] as const;

describe("image upscale desktop contract", () => {
  it("centralizes every upscale IPC channel", () => {
    const source = readSource("electron/shared/ipcChannels.ts");
    for (const [name, value] of channels) {
      expect(source).toContain(`${name} = "${value}"`);
      expect(source).toContain(`IpcChannelName.${name}`);
    }
  });

  it("lazy-loads the upscale workspace and exposes a dedicated sidebar route", () => {
    const source = readSource("src/features/library/components/LibraryView.tsx");
    expect(source).toContain('import("@/features/upscale")');
    expect(source).toContain("const UpscaleWorkspace = lazy");
    expect(source).toContain('openMainView("imageUpscale")');
    expect(source).toContain('mainView === "imageUpscale"');
    expect(source).toContain('isEntryVisible("imageUpscale")');
  });

  it("localizes workspace navigation, controls, statuses, and errors", () => {
    const locale = readSource("src/components/LocaleProvider.tsx");
    const status = readSource("src/components/uiStatusTranslations.ts");
    const translations = [
      ['"图片超分"', '"Image Upscale"'],
      ['"任务队列"', '"Task Queue"'],
      ['"前后对比"', '"Before / After"'],
      ['"处理与导出"', '"Process & Export"'],
      ['"开始处理"', '"Start Processing"'],
      ['"导出结果"', '"Export Results"'],
      ['"首次使用需下载组件"', '"Download required on first use"'],
    ];
    for (const [key, value] of translations) {
      expect(locale).toContain(`${key}: ${value}`);
    }
    expect(status).toContain('"UPSCALE_MODEL_DOWNLOAD_FAILED"');
    expect(status).toContain('"UPSCALE_WASM_FAILED"');
    expect(status).toContain('"UPSCALE_EXPORT_FAILED"');
  });

  it("preserves development components and ships third-party notices", () => {
    const packager = readSource("package-win.cjs");
    const notices = readSource("THIRD_PARTY_NOTICES.md");
    expect(packager).toContain('"upscale-cugan"');
    expect(packager).toContain('"upscale-realesrgan"');
    expect(notices).toContain("Real-CUGAN");
    expect(notices).toContain("Real-ESRGAN");
    expect(notices).toContain("ONNX Runtime");
    expect(notices).toContain("ncnn");
  });

  it("exposes named preload methods and converts dropped Files inside preload", () => {
    const source = readSource("electron/preload/index.ts");
    const methods = [
      "getUpscaleComponentStatus",
      "installUpscaleComponent",
      "removeUpscaleComponent",
      "pickUpscaleInputs",
      "registerUpscaleFiles",
      "readUpscaleInput",
      "readUpscaleModel",
      "runRealEsrgan",
      "cancelRealEsrgan",
      "storeUpscaleResult",
      "readUpscaleResult",
      "pickUpscaleOutputDirectory",
      "exportUpscaleResult",
      "onUpscaleProgress",
    ];
    for (const method of methods) {
      expect(source).toContain(`${method}:`);
    }
    expect(source).toContain("webUtils.getPathForFile(file)");
    expect(source).toContain("ipcRenderer.on(IpcChannelName.UpscaleProgress, handler)");
    expect(source).toContain("return () => ipcRenderer.removeListener(IpcChannelName.UpscaleProgress, handler)");
    expect(source).not.toContain('exposeInMainWorld("electron"');
    expect(source).not.toContain("invoke: (channel");
  });

  it("registers every handler through handleResult and validates requests in the main service", () => {
    const handlers = readSource("electron/main/ipc/registerIpcHandlers.ts");
    const service = readSource("electron/main/upscale/upscaleService.ts");
    for (const [name, value] of channels.filter(([name]) => name !== "UpscaleProgress")) {
      const property = name.charAt(0).toLowerCase() + name.slice(1);
      expect(handlers).toContain(`ipcChannels.${property}`);
      expect(handlers).toContain(`handleResult("${value}"`);
    }
    expect(service).toContain("isUpscaleModelId");
    expect(service).toContain("UPSCALE_INPUT_UNSUPPORTED");
    expect(service).toContain("UPSCALE_MODEL_NOT_INSTALLED");
  });

  it("keeps binary paths private and publishes typed renderer results", () => {
    const api = readSource("src/types/suyanApi.ts");
    expect(api).toContain("registerUpscaleFiles: (files: File[]");
    expect(api).toContain("readUpscaleInput: (token: string) => Promise<IpcResult<Uint8Array>>");
    expect(api).toContain("readUpscaleModel: (modelId: UpscaleModelId) => Promise<IpcResult<Uint8Array>>");
    expect(api).toContain("readUpscaleResult: (token: string) => Promise<IpcResult<Uint8Array>>");
    expect(api).toContain("UpscaleOutputDirectoryDescriptor");
    expect(api).toContain("UpscaleExportResult");
    expect(api).not.toContain("registerUpscalePaths: (paths: string[]");
  });

  it("creates a WASM inference session when the worker is forced to WASM", () => {
    const worker = readSource("src/features/upscale/worker/realCugan.worker.ts");
    expect(worker).toMatch(
      /if \(message\.forceWasm\) \{\s+await createSession\(modelBytes, "wasm"\);\s+selected = "wasm";/,
    );
  });

  it("cleans orphan cache on startup and invalidates sessions on exit", () => {
    const source = readSource("electron/main/index.ts");
    expect(source).toContain("cleanupUpscaleCache()");
    expect(source).toContain("cancelAllRealEsrganJobs()");
    expect(source).toContain("clearUpscaleSession()");
    expect(source).toContain("clearUpscaleOutputDirectories()");
  });
});
