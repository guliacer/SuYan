import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  RealEsrganRunRequest,
  UpscaleResultDescriptor,
} from "../../src/features/upscale/types";
import {
  buildRealEsrganArgs,
  cancelAllRealEsrganJobs,
  cancelRealEsrganJob,
  runRealEsrganWithDependencies,
  type RealEsrganRunnerDependencies,
  type SpawnedProcess,
} from "../../electron/main/upscale/realEsrganRunner";
import { resolveUpscalePaths } from "../../electron/main/upscale/upscalePaths";

const request: RealEsrganRunRequest = {
  jobId: "job-1",
  inputToken: "input-token",
  modelId: "esrgan-x4plus",
  tileSize: 256,
  gpuId: 0,
  outputFormat: "png",
};

const resultDescriptor: UpscaleResultDescriptor = {
  token: "result-token",
  previewDataUrl: "data:image/webp;base64,AAAA",
  width: 64,
  height: 64,
  byteSize: 4,
  mediaType: "image/png",
};

class FakeProcess extends EventEmitter implements SpawnedProcess {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();

  constructor(readonly pid = 4123) {
    super();
  }

  kill = vi.fn(() => true);
}

afterEach(async () => {
  vi.useRealTimers();
  await cancelAllRealEsrganJobs();
});

function makeDependencies(
  spawn: RealEsrganRunnerDependencies["spawn"],
  overrides: Partial<RealEsrganRunnerDependencies> = {},
): RealEsrganRunnerDependencies {
  const paths = resolveUpscalePaths(path.join("C:\\", "Portable", "SuYan", "data"));
  return {
    paths,
    platform: "win32",
    spawn,
    resolveInputPath: () => path.join(paths.cacheRoot, "registered-input.png"),
    mkdir: async () => undefined,
    readFile: async () => Buffer.from("png!"),
    removeFile: async () => undefined,
    createResult: async () => resultDescriptor,
    ...overrides,
  };
}

describe("Real-ESRGAN command builder", () => {
  it("builds a fixed x4plus argument array without shell interpolation", () => {
    const args = buildRealEsrganArgs({
      inputPath: "C:\\input image.png",
      outputPath: "C:\\result image.png",
      modelId: "esrgan-x4plus",
      tileSize: 256,
      gpuId: 1,
      outputFormat: "png",
    });

    expect(args).toEqual([
      "-i", "C:\\input image.png",
      "-o", "C:\\result image.png",
      "-n", "realesrgan-x4plus",
      "-s", "4",
      "-t", "256",
      "-g", "1",
      "-f", "png",
    ]);
  });

  it("maps animevideov3 scale and JPEG format to native values", () => {
    const args = buildRealEsrganArgs({
      inputPath: "C:\\input.webp",
      outputPath: "C:\\output.jpg",
      modelId: "esrgan-animevideov3-3x",
      tileSize: 0,
      gpuId: 0,
      outputFormat: "jpeg",
    });

    expect(args).toContain("realesr-animevideov3");
    expect(args.slice(args.indexOf("-s"), args.indexOf("-s") + 2)).toEqual(["-s", "3"]);
    expect(args.at(-1)).toBe("jpg");
    expect(() => buildRealEsrganArgs({
      inputPath: "C:\\input.png",
      outputPath: "C:\\output.png",
      modelId: "cugan-2x-no-denoise",
      tileSize: 0,
      gpuId: 0,
      outputFormat: "png",
    })).toThrow("UPSCALE_MODEL_NOT_INSTALLED");
  });

  it("lets the native runtime auto-select a GPU by omitting the invalid -g -1 pair", () => {
    const args = buildRealEsrganArgs({
      inputPath: "C:\\input.png",
      outputPath: "C:\\output.png",
      modelId: "esrgan-x4plus",
      tileSize: 0,
      gpuId: -1,
      outputFormat: "png",
    });

    expect(args).not.toContain("-g");
    expect(args).not.toContain("-1");
    expect(args.slice(-2)).toEqual(["-f", "png"]);
  });
});

describe("Real-ESRGAN process lifecycle", () => {
  it("uses the installed executable, parses progress, and stores a verified result", async () => {
    const child = new FakeProcess();
    const spawn = vi.fn(() => child);
    const createResult = vi.fn(async () => resultDescriptor);
    const onProgress = vi.fn();
    const dependencies = makeDependencies(spawn, { createResult });

    const running = runRealEsrganWithDependencies(request, { onProgress }, dependencies);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    child.stderr.emit("data", Buffer.from("processing 42.50%\n"));
    child.emit("close", 0, null);
    const result = await running;

    expect(result).toEqual(resultDescriptor);
    expect(spawn).toHaveBeenCalledWith(
      path.join(dependencies.paths.realEsrganRoot, "realesrgan-ncnn-vulkan.exe"),
      expect.arrayContaining(["-i", expect.any(String), "-o", expect.any(String)]),
      {
        cwd: dependencies.paths.realEsrganRoot,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    expect(onProgress).toHaveBeenCalledWith({ progress: 0.425, message: "Real-ESRGAN 处理中 43%" });
    expect(createResult).toHaveBeenCalledWith("job-1", Buffer.from("png!"), "png", dependencies.paths);
  });

  it("reports non-zero exits and a missing output with stable error codes", async () => {
    const failedChild = new FakeProcess();
    const failedSpawn = vi.fn(() => failedChild);
    const failedRun = runRealEsrganWithDependencies(request, {}, makeDependencies(failedSpawn));
    await vi.waitFor(() => expect(failedSpawn).toHaveBeenCalledTimes(1));
    failedChild.stderr.emit("data", Buffer.from("vkCreateInstance failed"));
    failedChild.emit("close", 3, null);
    await expect(failedRun).rejects.toThrow("UPSCALE_NATIVE_EXIT_FAILED");

    const missingChild = new FakeProcess();
    const missingSpawn = vi.fn(() => missingChild);
    const missingRun = runRealEsrganWithDependencies(
      request,
      {},
      makeDependencies(missingSpawn, {
        readFile: async () => {
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      }),
    );
    await vi.waitFor(() => expect(missingSpawn).toHaveBeenCalledTimes(1));
    missingChild.emit("close", 0, null);
    await expect(missingRun).rejects.toThrow("UPSCALE_RESULT_MISSING");
  });

  it("times out and terminates the entire Windows process tree", async () => {
    vi.useFakeTimers();
    const child = new FakeProcess(7788);
    const taskkill = new FakeProcess(9911);
    const spawn = vi.fn((executable: string) => executable === "taskkill.exe" ? taskkill : child);
    const running = runRealEsrganWithDependencies(request, { timeoutMs: 50 }, makeDependencies(spawn));
    const assertion = expect(running).rejects.toThrow("UPSCALE_NATIVE_TIMEOUT");

    await vi.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;

    expect(spawn).toHaveBeenCalledWith(
      "taskkill.exe",
      ["/PID", "7788", "/T", "/F"],
      { shell: false, windowsHide: true, stdio: "ignore" },
    );
  });

  it("cancels an active job once and rejects it as canceled", async () => {
    const child = new FakeProcess(5566);
    const taskkill = new FakeProcess(9911);
    const spawn = vi.fn((executable: string) => executable === "taskkill.exe" ? taskkill : child);
    const running = runRealEsrganWithDependencies(request, {}, makeDependencies(spawn));
    const assertion = expect(running).rejects.toThrow("UPSCALE_CANCELED");

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));
    await expect(cancelRealEsrganJob("job-1")).resolves.toBe(true);
    await assertion;
    await expect(cancelRealEsrganJob("job-1")).resolves.toBe(false);
    expect(spawn).toHaveBeenCalledWith(
      "taskkill.exe",
      ["/PID", "5566", "/T", "/F"],
      { shell: false, windowsHide: true, stdio: "ignore" },
    );
  });
});
