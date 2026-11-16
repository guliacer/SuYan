import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

async function resolvePlaywrightCore() {
  const explicitPath = argumentValue("--playwright-core");
  if (explicitPath) return explicitPath;
  const linksRoot = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "ms-playwright",
    ".links",
  );
  for (const linkName of await readdir(linksRoot).catch(() => [])) {
    const candidate = (await readFile(path.join(linksRoot, linkName), "utf8")).trim();
    if (!candidate) continue;
    const entry = path.join(candidate, "index.js");
    try {
      await access(entry);
      return entry;
    } catch {
      // Ignore stale links left by previous Playwright CLI versions.
    }
  }
  throw new Error("Playwright Core was not found. Pass its index.js path as the first argument.");
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function unwrap(result, operation) {
  if (result?.ok) return result.data;
  throw new Error(operation + ": " + (result?.error?.code ?? "UNKNOWN") + " " + (result?.error?.message ?? ""));
}

async function decodeDataUrl(dataUrl, targetPath) {
  const encoded = dataUrl.split(",", 2)[1];
  assert.ok(encoded, "result preview must contain base64 bytes");
  const bytes = Buffer.from(encoded, "base64");
  await writeFile(targetPath, bytes);
  return inspectImage(bytes);
}

async function inspectImage(bytes) {
  const image = sharp(bytes, { failOn: "error" });
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
  const variance = Math.max(...stats.channels.slice(0, 3).map((channel) => channel.stdev));
  assert.ok(variance > 0.01, "image must contain non-blank pixel variance, got " + variance);
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    byteSize: bytes.length,
    maxChannelStdev: variance,
  };
}

async function collectFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  await visit(root);
  return files;
}

async function inspectNewResult(cacheRoot, previousFiles, expectedWidth, expectedHeight) {
  const candidates = (await collectFiles(cacheRoot)).filter((filePath) => !previousFiles.has(filePath));
  for (const candidate of candidates.reverse()) {
    try {
      const inspected = await inspectImage(await readFile(candidate));
      if (inspected.width === expectedWidth && inspected.height === expectedHeight) {
        return { ...inspected, filePath: candidate };
      }
    } catch {
      // Ignore incomplete or non-image cache entries while finding the promoted result.
    }
  }
  throw new Error("No new result matched " + expectedWidth + "x" + expectedHeight);
}

const projectRoot = path.resolve(import.meta.dirname, "..");
const executablePath = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe");
await access(executablePath);
const runRoot = path.join(projectRoot, "output", "upscale-live", "run-" + Date.now());
const portableRoot = path.join(runRoot, "portable");
const dataRoot = path.join(portableRoot, "release", "win-unpacked", "data");
const exportRoot = path.join(runRoot, "exports");
const inputPath = path.join(runRoot, "fixture.png");
const requestedInputPath = argumentValue("--input");
const downloadCacheRoot = path.join(projectRoot, "output", "upscale-live", "download-cache");
await mkdir(portableRoot, { recursive: true });
await mkdir(exportRoot, { recursive: true });
await mkdir(path.join(dataRoot, "library", "images"), { recursive: true });
await writeFile(
  path.join(dataRoot, "library", "library.json"),
  JSON.stringify({ schemaVersion: 2, items: [], updatedAt: new Date().toISOString() }, null, 2),
  "utf8",
);

if (requestedInputPath) {
  await access(requestedInputPath);
  await sharp(requestedInputPath, { failOn: "error" }).rotate().png().toFile(inputPath);
} else {
  const fixturePixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const offset = (y * 32 + x) * 4;
      fixturePixels[offset] = (x * 8) % 256;
      fixturePixels[offset + 1] = (y * 8) % 256;
      fixturePixels[offset + 2] = ((x + y) * 4) % 256;
      fixturePixels[offset + 3] = 255;
    }
  }
  await sharp(fixturePixels, { raw: { width: 32, height: 32, channels: 4 } }).png().toFile(inputPath);
}
const inputMetadata = await sharp(inputPath).metadata();
assert.ok(inputMetadata.width && inputMetadata.height);
const inputWidth = inputMetadata.width;
const inputHeight = inputMetadata.height;
const cuganWidth = inputWidth * 2;
const cuganHeight = inputHeight * 2;
const esrganWidth = inputWidth * 4;
const esrganHeight = inputHeight * 4;
const resultCacheRoot = path.join(dataRoot, "cache", "upscale");

const installerImport = await import(pathToFileURL(
  path.join(projectRoot, "dist-electron", "electron", "main", "upscale", "upscaleInstaller.js"),
).href);
const pathsImport = await import(pathToFileURL(
  path.join(projectRoot, "dist-electron", "electron", "main", "upscale", "upscalePaths.js"),
).href);
const manifestImport = await import(pathToFileURL(
  path.join(projectRoot, "dist-electron", "electron", "main", "upscale", "upscaleManifest.js"),
).href);
const installer = installerImport.installRealCuganModelInPaths ? installerImport : installerImport.default;
const upscalePaths = pathsImport.resolveUpscalePaths ? pathsImport : pathsImport.default;
const manifest = manifestImport.REAL_CUGAN_ARTIFACTS ? manifestImport : manifestImport.default;
const managedPaths = upscalePaths.resolveUpscalePaths(dataRoot);
const cuganArtifact = manifest.REAL_CUGAN_ARTIFACTS.find((entry) => entry.modelId === "cugan-2x-no-denoise");
assert.ok(cuganArtifact);
process.stdout.write("Installing cached Real-CUGAN artifact through the product installer...\n");
await installer.installRealCuganModelInPaths(
  managedPaths,
  cuganArtifact,
  async () => readFile(path.join(downloadCacheRoot, cuganArtifact.fileName)),
);
process.stdout.write("Installing cached Real-ESRGAN artifact through the product installer...\n");
await installer.installRealEsrganInPaths(
  managedPaths,
  manifest.REAL_ESRGAN_ARTIFACT,
  async () => readFile(path.join(downloadCacheRoot, manifest.REAL_ESRGAN_ARTIFACT.fileName)),
);

const playwrightModule = await import(pathToFileURL(await resolvePlaywrightCore()).href);
const playwright = playwrightModule._electron ? playwrightModule : playwrightModule.default;
const electronApp = await playwright._electron.launch({
  executablePath,
  args: [projectRoot],
  cwd: portableRoot,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: "",
  },
});

const report = {
  runRoot,
  input: {
    source: requestedInputPath ?? "generated-gradient",
    width: inputWidth,
    height: inputHeight,
  },
  components: {},
  realCugan: {},
  realEsrgan: {},
  exports: {},
};

try {
  const page = await electronApp.firstWindow();
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
  });
  page.setDefaultTimeout(30_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const skipStartup = page.getByRole("button", { name: "跳过", exact: true });
  if (await skipStartup.isVisible().catch(() => false)) await skipStartup.click();
  const onboarding = page.getByRole("button", { name: "跳过本次引导", exact: true }).first();
  if (await onboarding.isVisible().catch(() => false)) await onboarding.click();

  process.stdout.write("Verifying installed components through the packaged preload API...\n");
  const cuganStatus = unwrap(
    await page.evaluate(() => window.suyanApi.getUpscaleComponentStatus("real-cugan")),
    "status Real-CUGAN",
  );
  assert.ok(cuganStatus.installedModelIds.includes("cugan-2x-no-denoise"));
  report.components.realCugan = cuganStatus;

  const esrganStatus = unwrap(
    await page.evaluate(() => window.suyanApi.getUpscaleComponentStatus("real-esrgan")),
    "status Real-ESRGAN",
  );
  assert.equal(esrganStatus.installed, true);
  report.components.realEsrgan = esrganStatus;

  await page.evaluate(() => {
    const originalWorker = window.Worker;
    window.__upscaleWorkerBackends = [];
    window.Worker = class TrackingWorker extends originalWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (event) => {
          if (event.data?.backend === "webgpu" || event.data?.backend === "wasm") {
            window.__upscaleWorkerBackends.push(event.data.backend);
          }
        });
      }
    };
  });

  await page.evaluate(() => {
    const element = document.createElement("input");
    element.id = "upscale-live-input";
    element.type = "file";
    element.style.display = "none";
    document.body.append(element);
  });
  const input = page.locator("#upscale-live-input");
  await input.setInputFiles(inputPath);
  const descriptors = unwrap(
    await page.evaluate(() => window.suyanApi.registerUpscaleFiles(
      Array.from(document.querySelector("#upscale-live-input").files),
    )),
    "register live input",
  );
  assert.equal(descriptors.length, 1);
  const descriptor = descriptors[0];

  process.stdout.write("Running Real-ESRGAN NCNN...\n");
  const nativeResult = unwrap(
    await page.evaluate((request) => window.suyanApi.runRealEsrgan(request), {
      jobId: "live-esrgan",
      inputToken: descriptor.token,
      modelId: "esrgan-x4plus",
      tileSize: 0,
      gpuId: -1,
      outputFormat: "png",
    }),
    "run Real-ESRGAN",
  );
  assert.deepEqual([nativeResult.width, nativeResult.height], [esrganWidth, esrganHeight]);
  const nativeBytes = unwrap(
    await page.evaluate((token) => window.suyanApi.readUpscaleResult(token), nativeResult.token),
    "read Real-ESRGAN result",
  );
  const nativeBuffer = Buffer.from(nativeBytes);
  await writeFile(path.join(runRoot, "real-esrgan.png"), nativeBuffer);
  report.realEsrgan = await inspectImage(nativeBuffer);

  process.stdout.write("Running Real-CUGAN with forced WASM...\n");
  const onboardingAfterNative = page.getByRole("button", { name: "跳过本次引导", exact: true }).first();
  if (await onboardingAfterNative.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await onboardingAfterNative.click();
  }
  await page.getByRole("button", { name: "图片超分", exact: true }).click();
  await page.locator("[data-upscale-workspace]").waitFor({ timeout: 30_000 });
  const lateOnboarding = page.getByRole("button", { name: "跳过本次引导", exact: true }).first();
  if (await lateOnboarding.isVisible({ timeout: 5_000 }).catch(() => false)) await lateOnboarding.click();
  const skipGuide = page.getByRole("button", { name: "跳过本页引导", exact: true });
  if (await skipGuide.isVisible({ timeout: 5_000 }).catch(() => false)) await skipGuide.click();
  const settings = page.getByRole("complementary", { name: "处理与导出" });
  await settings.locator("select").first().selectOption("cugan-2x-no-denoise");
  await page.getByText("Real-CUGAN · 2x 无降噪", { exact: true }).waitFor();
  await settings.locator("summary").click();
  await page.getByRole("checkbox", { name: "强制使用 WASM", exact: true }).check();

  async function dropFixture() {
    await page.evaluate(() => {
      const selected = document.querySelector("#upscale-live-input").files[0];
      const transfer = new DataTransfer();
      transfer.items.add(selected);
      document.querySelector("[data-upscale-queue]").dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }));
    });
  }

  const cacheBeforeWasm = new Set(await collectFiles(resultCacheRoot));
  await dropFixture();
  await page.getByText("fixture.png", { exact: true }).waitFor();
  await page.getByRole("button", { name: "开始处理 · 1", exact: true }).click();
  await page.getByRole("button", { name: "导出结果 · 1", exact: true }).waitFor({ timeout: 900_000 });
  await page.getByText(inputWidth + " x " + inputHeight + "  →  " + cuganWidth + " x " + cuganHeight, { exact: true }).waitFor();
  const wasmBackends = await page.evaluate(() => [...window.__upscaleWorkerBackends]);
  assert.ok(wasmBackends.includes("wasm"), "forced WASM run reported " + wasmBackends.join(", "));
  const wasmPreview = await page.getByRole("img", { name: "超分结果", exact: true }).getAttribute("src");
  const wasmImage = await decodeDataUrl(wasmPreview, path.join(runRoot, "real-cugan-wasm.webp"));
  assert.ok(wasmImage.width <= 640 && wasmImage.height <= 640);
  const wasmResult = await inspectNewResult(resultCacheRoot, cacheBeforeWasm, cuganWidth, cuganHeight);
  report.realCugan.wasm = { ...wasmResult, preview: wasmImage, backends: wasmBackends };

  process.stdout.write("Running Real-CUGAN with preferred WebGPU...\n");
  await page.evaluate(() => { window.__upscaleWorkerBackends = []; });
  await page.getByRole("checkbox", { name: "强制使用 WASM", exact: true }).uncheck();
  const cacheBeforeWebgpu = new Set(await collectFiles(resultCacheRoot));
  await dropFixture();
  await page.getByRole("button", { name: "开始处理 · 1", exact: true }).click();
  await page.getByRole("button", { name: "导出结果 · 2", exact: true }).waitFor({ timeout: 900_000 });
  await page.getByText(inputWidth + " x " + inputHeight + "  →  " + cuganWidth + " x " + cuganHeight, { exact: true }).waitFor();
  const preferredBackends = await page.evaluate(() => [...window.__upscaleWorkerBackends]);
  assert.ok(preferredBackends.includes("webgpu"), "preferred run did not reach WebGPU: " + preferredBackends.join(", "));
  const webgpuPreview = await page.getByRole("img", { name: "超分结果", exact: true }).getAttribute("src");
  const webgpuImage = await decodeDataUrl(webgpuPreview, path.join(runRoot, "real-cugan-webgpu.webp"));
  assert.ok(webgpuImage.width <= 640 && webgpuImage.height <= 640);
  const webgpuResult = await inspectNewResult(resultCacheRoot, cacheBeforeWebgpu, cuganWidth, cuganHeight);
  report.realCugan.webgpu = { ...webgpuResult, preview: webgpuImage, backends: preferredBackends };

  process.stdout.write("Verifying library-only, file-only, and dual exports...\n");
  const libraryPath = path.join(dataRoot, "library", "library.json");
  const libraryCountBeforeExport = JSON.parse(await readFile(libraryPath, "utf8")).items.length;
  await page.getByRole("checkbox", { name: "加入素材库", exact: true }).check();
  await page.getByRole("checkbox", { name: "保存到目录", exact: true }).uncheck();
  await page.getByRole("button", { name: "导出结果 · 2", exact: true }).click();
  await page.getByText("已导出 2 项", { exact: true }).waitFor({ timeout: 60_000 });
  report.exports.libraryOnly = 2;

  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, exportRoot);
  const outputDirectory = unwrap(
    await page.evaluate(() => window.suyanApi.pickUpscaleOutputDirectory()),
    "register output directory",
  );
  assert.ok(outputDirectory?.token);

  const defaultOptions = {
    outputDirectoryToken: outputDirectory.token,
    format: "png",
    quality: 92,
    conflictPolicy: "append-number",
    preserveMetadata: true,
    libraryMode: "new-group",
    title: "",
    categoryId: null,
    tags: [],
  };
  const fileOnly = unwrap(
    await page.evaluate(({ descriptor, nativeResult, defaultOptions }) => window.suyanApi.exportUpscaleResult({
      jobId: "live-export-file",
      inputToken: descriptor.token,
      resultToken: nativeResult.token,
      modelId: "esrgan-x4plus",
      options: {
        ...defaultOptions,
        saveToDirectory: true,
        addToLibrary: false,
        namingPattern: "file_only_{scale}x",
      },
    }), { descriptor, nativeResult, defaultOptions }),
    "file-only export",
  );
  assert.equal(fileOnly.savedFileName, "file_only_4x.png");
  report.exports.fileOnly = fileOnly;

  const dual = unwrap(
    await page.evaluate(({ descriptor, nativeResult, defaultOptions }) => window.suyanApi.exportUpscaleResult({
      jobId: "live-export-dual",
      inputToken: descriptor.token,
      resultToken: nativeResult.token,
      modelId: "esrgan-x4plus",
      options: {
        ...defaultOptions,
        saveToDirectory: true,
        addToLibrary: true,
        namingPattern: "dual_{scale}x",
        title: "双目标实机验收",
      },
    }), { descriptor, nativeResult, defaultOptions }),
    "dual export",
  );
  assert.equal(dual.savedFileName, "dual_4x.png");
  assert.equal(dual.importedItemIds.length, 1);
  report.exports.dual = dual;

  const exportedFiles = (await readdir(exportRoot)).sort();
  assert.deepEqual(exportedFiles, ["dual_4x.png", "file_only_4x.png"]);
  for (const fileName of exportedFiles) {
    const bytes = await readFile(path.join(exportRoot, fileName));
    const inspected = await inspectImage(bytes);
    assert.deepEqual([inspected.width, inspected.height], [esrganWidth, esrganHeight]);
  }
  const library = JSON.parse(await readFile(libraryPath, "utf8"));
  assert.equal(library.items.length, libraryCountBeforeExport + 3);
  report.exports.libraryItemCountBefore = libraryCountBeforeExport;
  report.exports.libraryItemCount = library.items.length;
  report.pageErrors = pageErrors;
  assert.deepEqual(pageErrors, []);

  await page.screenshot({ path: path.join(runRoot, "workspace-live.png") });
  await writeFile(path.join(runRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} finally {
  await electronApp.close();
}
