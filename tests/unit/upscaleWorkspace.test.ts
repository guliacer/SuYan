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

  it("exposes named preload methods and converts dropped Files inside preload", () => {
    const source = readSource("electron/preload/index.ts");
    const methods = [
      "getUpscaleComponentStatus",
      "installUpscaleComponent",
      "removeUpscaleComponent",
      "pickUpscaleInputs",
      "registerUpscaleFiles",
      "readUpscaleInput",
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
    expect(api).toContain("readUpscaleResult: (token: string) => Promise<IpcResult<Uint8Array>>");
    expect(api).toContain("UpscaleOutputDirectoryDescriptor");
    expect(api).toContain("UpscaleExportResult");
    expect(api).not.toContain("registerUpscalePaths: (paths: string[]");
  });

  it("cleans orphan cache on startup and invalidates sessions on exit", () => {
    const source = readSource("electron/main/index.ts");
    expect(source).toContain("cleanupUpscaleCache()");
    expect(source).toContain("cancelAllRealEsrganJobs()");
    expect(source).toContain("clearUpscaleSession()");
    expect(source).toContain("clearUpscaleOutputDirectories()");
  });
});
