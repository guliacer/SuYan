# Image Upscale Dual-Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent image-upscaling workspace to SuYan with Real-CUGAN WebGPU/WASM inference, Real-ESRGAN NCNN inference, batch queues, before/after comparison, and configurable file/library export.

**Architecture:** The renderer owns UI state and a module-scoped Real-CUGAN worker; Electron main owns file tokens, optional component installation, native Real-ESRGAN processes, temporary results, and export. Every desktop operation crosses a typed `window.suyanApi` method and a fixed IPC channel. Optional models and binaries live under the portable `data/components` directory and are verified before use.

**Tech Stack:** Electron 43.0.0, React 19.2.7, TypeScript 6.0.3, Vite 8.1.3, Zustand 5.0.14, Vitest 4.1.9, `onnxruntime-web@1.20.0`, Sharp 0.35.4, Real-ESRGAN NCNN Vulkan v0.2.5.0.

## Global Constraints

- Implement in the approved `Electron + React + TypeScript + Vite + pnpm` stack.
- Raise `package.json` from `0.4.0` to `0.4.1`; do not alter the published `v0.4.0` tag or release assets.
- Add exactly one runtime dependency: `onnxruntime-web@1.20.0`, saved without `^` or `~`.
- Renderer code may use only named `window.suyanApi` methods for desktop capabilities.
- Models and binaries must be installed under `<software-root>/data/components`; temporary tasks use `<software-root>/data/cache/upscale`.
- Model/runtime downloads are opt-in and first-use only; no model or NCNN binary is bundled in a published package.
- All user-facing strings must support simplified Chinese and English through the existing locale layer.
- Preserve the user's unrelated canvas changes and stage only files belonging to each task.
- Follow test-first red/green cycles and execute `pnpm package:win` after code verification.

## File Map

### New renderer files

- `src/features/upscale/types.ts`: renderer/main shared serializable domain contracts.
- `src/features/upscale/utils/upscaleModels.ts`: model presets and output-size policy.
- `src/features/upscale/utils/upscaleExport.ts`: file naming and export-option normalization.
- `src/features/upscale/worker/realCuganTiling.ts`: pure tile layout and stitch-region math.
- `src/features/upscale/worker/realCugan.worker.ts`: ONNX session lifecycle and inference.
- `src/features/upscale/worker/realCuganClient.ts`: singleton worker client and cancellation.
- `src/features/upscale/store/useUpscaleStore.ts`: queue and settings state that survives view switches.
- `src/features/upscale/components/UpscaleCompare.tsx`: before/after viewport.
- `src/features/upscale/components/UpscaleQueue.tsx`: file queue.
- `src/features/upscale/components/UpscaleSettings.tsx`: engine/model/export controls.
- `src/features/upscale/components/UpscaleWorkspace.tsx`: page composition and task orchestration.
- `src/features/upscale/index.ts`: public feature exports.

### New main-process files

- `electron/main/upscale/upscaleManifest.ts`: immutable artifact metadata and hashes.
- `electron/main/upscale/upscalePaths.ts`: portable component/cache path resolution.
- `electron/main/upscale/upscaleInstaller.ts`: atomic model/archive installation and verification.
- `electron/main/upscale/upscaleInputs.ts`: session-scoped source/output token registry.
- `electron/main/upscale/realEsrganRunner.ts`: native argument builder, process lifecycle, and cancellation.
- `electron/main/upscale/upscaleExport.ts`: output directory tokens, format conversion, file export, and library import.
- `electron/main/upscale/upscaleCache.ts`: orphan cache cleanup.
- `electron/main/upscale/upscaleService.ts`: IPC-facing orchestration facade.

### Existing files to modify

- `package.json`, `pnpm-lock.yaml`: version and ONNX Runtime dependency.
- `electron/shared/ipcChannels.ts`: fixed upscale channels.
- `electron/main/ipc/registerIpcHandlers.ts`: structured handlers and progress event.
- `electron/main/index.ts`: startup cache cleanup and quit cancellation.
- `electron/preload/index.ts`: named upscale API methods.
- `src/types/suyanApi.ts`: API and IPC result types.
- `src/features/library/utils/moduleRegistry.ts`: two runtime modules plus workspace capability.
- `src/features/library/utils/moduleManagement.ts`: runtime restore/install behavior.
- `src/features/library/utils/sidebarEntries.ts`: `imageUpscale` entry.
- `src/features/library/types/library.ts`: sidebar entry union.
- `src/features/library/components/LibraryView.tsx`: lazy page and sidebar navigation.
- `src/components/LocaleProvider.tsx`: Chinese/English copy.
- `src/components/uiStatusTranslations.ts`: status/error translations.
- `package-win.cjs`: preserve locally installed upscale components only for development quick packages.
- `THIRD_PARTY_NOTICES.md`: Real-CUGAN, Real-ESRGAN, ONNX Runtime, and NCNN notices.
- `scripts/check-upscale-workspace-ui.mjs`: desktop/narrow visual smoke.

### New tests

- `tests/unit/upscaleModels.test.ts`
- `tests/unit/upscaleExport.test.ts`
- `tests/unit/upscaleManifest.test.ts`
- `tests/unit/upscaleInstaller.test.ts`
- `tests/unit/upscaleInputs.test.ts`
- `tests/unit/upscaleRunner.test.ts`
- `tests/unit/upscaleTiling.test.ts`
- `tests/unit/upscaleStore.test.ts`
- `tests/unit/upscaleWorkspace.test.ts`
- Extend `tests/unit/moduleRegistry.test.ts`, `tests/unit/moduleManagement.test.ts`, and `tests/unit/sidebarEntries.test.ts`.

---

### Task 1: Version, Dependency, and Domain Contracts

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/upscale/types.ts`
- Create: `src/features/upscale/utils/upscaleModels.ts`
- Test: `tests/unit/upscaleModels.test.ts`

**Interfaces:**
- Produces `UpscaleEngine`, `UpscaleModelId`, `UpscaleInputDescriptor`, `UpscaleJob`, `UpscaleExportOptions`, and `UpscaleComponentStatus`.
- Produces `upscaleModelDefinitions`, `getUpscaleModelDefinition()`, `estimateUpscaleOutput()`, and `MAX_REAL_CUGAN_OUTPUT_PIXELS`.

- [ ] **Step 1: Write failing model-policy tests**

```ts
expect(getUpscaleModelDefinition("cugan-2x-no-denoise").scale).toBe(2);
expect(getUpscaleModelDefinition("esrgan-x4plus").engine).toBe("real-esrgan");
expect(estimateUpscaleOutput(6000, 5000, 4).allowed).toBe(false);
expect(estimateUpscaleOutput(1000, 1000, 4).outputPixels).toBe(16_000_000);
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `pnpm vitest run tests/unit/upscaleModels.test.ts`

Expected: FAIL because `src/features/upscale/utils/upscaleModels.ts` does not exist.

- [ ] **Step 3: Add the serializable contracts and immutable model catalog**

```ts
export type UpscaleEngine = "real-cugan" | "real-esrgan";
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

export const MAX_REAL_CUGAN_OUTPUT_PIXELS = 120_000_000;
```

Add exact `UpscaleJobStatus` transitions and export settings from the approved design. Add the 11 Real-CUGAN entries and five Real-ESRGAN UI entries with the actual NCNN model names.

- [ ] **Step 4: Update version and install the exact dependency**

Run: `pnpm add onnxruntime-web@1.20.0 --save-exact`

Then set `package.json` version to `0.4.1` and verify both `package.json` and `pnpm-lock.yaml` contain exact `1.20.0` resolution.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm vitest run tests/unit/upscaleModels.test.ts`

Expected: PASS.

Run: `pnpm typecheck:renderer`

Expected: exit 0.

- [ ] **Step 6: Commit the task**

```powershell
git add package.json pnpm-lock.yaml src/features/upscale/types.ts src/features/upscale/utils/upscaleModels.ts tests/unit/upscaleModels.test.ts
git commit -m "feat: define image upscale domain"
```

### Task 2: Module Registry and Sidebar Migration

**Files:**
- Modify: `src/features/library/utils/moduleRegistry.ts`
- Modify: `src/features/library/utils/moduleManagement.ts`
- Modify: `src/features/library/utils/sidebarEntries.ts`
- Modify: `src/features/library/types/library.ts`
- Modify: `tests/unit/moduleRegistry.test.ts`
- Modify: `tests/unit/moduleManagement.test.ts`
- Modify: `tests/unit/sidebarEntries.test.ts`

**Interfaces:**
- Produces module IDs `real-cugan-runtime`, `real-esrgan-runtime`, `image-upscale`.
- Produces capabilities `real-cugan-upscale-runtime`, `real-esrgan-upscale-runtime`, `image-upscale`.
- Produces sidebar entry `imageUpscale` with default visibility `true`.

- [ ] **Step 1: Add failing migration and capability tests**

```ts
const state = resolveBuiltinModuleState();
expect(isBuiltinModuleEnabled("image-upscale", state)).toBe(true);
expect(isBuiltinModuleEnabled("real-cugan-runtime", state)).toBe(false);
expect(isBuiltinModuleEnabled("real-esrgan-runtime", state)).toBe(false);
expect(normalizeSidebarEntryVisibility({ home: true }).imageUpscale).toBe(true);
```

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/moduleRegistry.test.ts tests/unit/moduleManagement.test.ts tests/unit/sidebarEntries.test.ts`

Expected: FAIL because the new IDs do not exist.

- [ ] **Step 3: Add registry definitions and migration defaults**

Add both runtime modules as optional and disabled by default. Add `image-upscale` as installed and enabled by default with only `core-library` as a dependency so the page remains reachable before engine installation.

- [ ] **Step 4: Add sidebar metadata**

```ts
imageUpscale: {
  label: "图片超分",
  description: "使用本地双引擎放大并修复图片",
},
```

Insert `imageUpscale` after `promptLibrary` in the `materials` group.

- [ ] **Step 5: Verify green**

Run: `pnpm vitest run tests/unit/moduleRegistry.test.ts tests/unit/moduleManagement.test.ts tests/unit/sidebarEntries.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the task**

```powershell
git add src/features/library/utils/moduleRegistry.ts src/features/library/utils/moduleManagement.ts src/features/library/utils/sidebarEntries.ts src/features/library/types/library.ts tests/unit/moduleRegistry.test.ts tests/unit/moduleManagement.test.ts tests/unit/sidebarEntries.test.ts
git commit -m "feat: register image upscale module"
```

### Task 3: Artifact Manifests and Portable Paths

**Files:**
- Create: `electron/main/upscale/upscaleManifest.ts`
- Create: `electron/main/upscale/upscalePaths.ts`
- Test: `tests/unit/upscaleManifest.test.ts`

**Interfaces:**
- Produces `REAL_CUGAN_ARTIFACTS`, `REAL_ESRGAN_ARTIFACT`, `getUpscaleComponentRoot()`, `getUpscaleCacheRoot()`.

- [ ] **Step 1: Write failing immutable-manifest tests**

Assert all artifact URLs use HTTPS, every SHA is 64 lowercase hex characters, file names contain no path separators, sizes are positive, and model IDs are unique.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleManifest.test.ts`

Expected: FAIL because the manifest does not exist.

- [ ] **Step 3: Add all verified Real-CUGAN artifacts**

Use these exact `(bytes, sha256)` pairs:

```text
up2x-latest-no-denoise-fixed512.onnx        5148509  bb553bc4e29c59916d0e87a97b4e211095ca7fbea3863b20a4f3b05a4e1721c2
up2x-latest-conservative-fixed512.onnx      5148509  68aa158c9322bf5c34ee2070c81818c707de7a7f0345885edf588a5f546eab91
up2x-latest-denoise1x-fixed512.onnx         5148509  d46f5cbe196c339918120805ef359644b1363f67a96ce0c9f710c6f4ebcaa0b7
up2x-latest-denoise2x-fixed512.onnx         5148509  9f8f36e24082e622cf2407075cfd0504c8e89e01ee9a610001075d1c734b00f2
up2x-latest-denoise3x-fixed512.onnx         5148509  db2c6fe241c3002d4c838eaca87ce9f2c7e21129c5dcdfaec8538dc965132ffd
up3x-latest-no-denoise-fixed512.onnx        5155423  29b7ff8308fa4e51bb0959501019960b5943cd9bd3c13171cc28f1e49ec5dc1b
up3x-latest-conservative-fixed512.onnx      5155423  b4f57df0c9add55c44478576be6731dc16bb1b7e1968f3c5639fb6e88d9ba185
up3x-latest-denoise3x-fixed512.onnx         5155423  c6788e2fd17069713f34aa7a07137e2d0e75c3d043245f92da186dbbdad78a6b
up4x-latest-no-denoise-fixed512.onnx        5637971  13696addef2b397e0aca4a43cd1bca2212232c95eaadfc52a9949335d2f3b2fe
up4x-latest-conservative-fixed512.onnx      5637971  bb58b399acbfaf8228e6f084bf1f82376882a3865dcd2f0ac71fa92dbbf183ee
up4x-latest-denoise3x-fixed512.onnx         5637971  0db3b74d3501a6a9dbca5b865215369c90906ec30cd0061def91da7ca766206c
```

Use `https://real-cugan.webgpu.me/models/` plus each fixed file name.

- [ ] **Step 4: Add the verified Real-ESRGAN artifact**

```ts
export const REAL_ESRGAN_ARTIFACT = {
  version: "0.2.5.0",
  fileName: "realesrgan-ncnn-vulkan-20220424-windows.zip",
  byteSize: 45_474_481,
  sha256: "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d",
  url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip",
} as const;
```

- [ ] **Step 5: Verify green and commit**

Run: `pnpm vitest run tests/unit/upscaleManifest.test.ts`

Expected: PASS.

```powershell
git add electron/main/upscale/upscaleManifest.ts electron/main/upscale/upscalePaths.ts tests/unit/upscaleManifest.test.ts
git commit -m "feat: pin upscale component artifacts"
```

### Task 4: Atomic Component Installer

**Files:**
- Create: `electron/main/upscale/upscaleInstaller.ts`
- Test: `tests/unit/upscaleInstaller.test.ts`

**Interfaces:**
- Produces `getUpscaleComponentStatus(engine, modelId?)`, `installRealCuganModel(modelId, onProgress)`, `installRealEsrgan(onProgress)`, `installUpscaleComponentFromLocal(engine)`, and `removeUpscaleComponent(engine)`.

- [ ] **Step 1: Write failing tests with injected download/ZIP providers**

Cover exact-size/hash acceptance, hash mismatch cleanup, ZIP path traversal rejection, required Real-ESRGAN files, preservation of an existing valid install, and `.partial` cleanup.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleInstaller.test.ts`

Expected: FAIL because installer exports are missing.

- [ ] **Step 3: Implement Real-CUGAN model installation**

Download to `<model>.partial`, stream SHA-256 while writing, compare byte size and digest, then rename atomically to the fixed model file. Write UTF-8 `manifest.json` only after the model is valid.

- [ ] **Step 4: Implement Real-ESRGAN ZIP installation**

Reuse the repository's JSZip path-safety patterns. Require:

```text
realesrgan-ncnn-vulkan.exe
vcomp140.dll
models/realesrgan-x4plus.bin
models/realesrgan-x4plus.param
models/realesrgan-x4plus-anime.bin
models/realesrgan-x4plus-anime.param
models/realesr-animevideov3-x2.bin
models/realesr-animevideov3-x2.param
models/realesr-animevideov3-x3.bin
models/realesr-animevideov3-x3.param
models/realesr-animevideov3-x4.bin
models/realesr-animevideov3-x4.param
```

Extract to a sibling staging directory, validate required files, write `manifest.json`, and atomically replace the managed component directory.

- [ ] **Step 5: Verify installer tests**

Run: `pnpm vitest run tests/unit/upscaleInstaller.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the task**

```powershell
git add electron/main/upscale/upscaleInstaller.ts tests/unit/upscaleInstaller.test.ts
git commit -m "feat: install upscale runtimes atomically"
```

### Task 5: Input Tokens and Cache Lifecycle

**Files:**
- Create: `electron/main/upscale/upscaleInputs.ts`
- Create: `electron/main/upscale/upscaleCache.ts`
- Test: `tests/unit/upscaleInputs.test.ts`

**Interfaces:**
- Produces `registerUpscalePaths(paths)`, `pickUpscaleInputs(kind)`, `readUpscaleInput(token)`, `createUpscaleResult(jobId, bytes, extension)`, `readUpscaleResult(token)`, `clearUpscaleSession()`, and `cleanupUpscaleCache(now)`.

- [ ] **Step 1: Write failing token/security tests**

Verify supported extensions, recursive directory expansion, duplicate-path removal, random opaque tokens, token invalidation, thumbnail generation, 24-hour cleanup, and rejection of unregistered paths.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleInputs.test.ts`

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement session-scoped tokens**

Use `randomUUID()` tokens and private maps. Return `displayName`, dimensions, byte size, MIME type, optional source item ID, and a bounded WebP thumbnail data URL. Never return an absolute path.

- [ ] **Step 4: Implement cache cleanup**

Only delete direct child job directories under the resolved upscale cache root whose last modification time is older than 24 hours. Resolve and validate every deletion target remains inside the cache root.

- [ ] **Step 5: Verify green and commit**

Run: `pnpm vitest run tests/unit/upscaleInputs.test.ts`

Expected: PASS.

```powershell
git add electron/main/upscale/upscaleInputs.ts electron/main/upscale/upscaleCache.ts tests/unit/upscaleInputs.test.ts
git commit -m "feat: register upscale inputs securely"
```

### Task 6: Real-ESRGAN Native Runner

**Files:**
- Create: `electron/main/upscale/realEsrganRunner.ts`
- Test: `tests/unit/upscaleRunner.test.ts`

**Interfaces:**
- Produces `buildRealEsrganArgs(request)`, `runRealEsrgan(request, hooks)`, and `cancelRealEsrganJob(jobId)`.

- [ ] **Step 1: Write failing argument and lifecycle tests**

Assert `shell: false`, fixed executable resolution, `-i/-o/-n/-s/-t/-g/-f` argument arrays, x4plus scale enforcement, progress parsing, timeout, output-missing error, and process-tree cancellation.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleRunner.test.ts`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement the argument builder**

```ts
spawn(executablePath, args, {
  cwd: componentRoot,
  shell: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
```

Map UI model IDs to the exact NCNN `-n` values. Set `-s 4` for both x4plus variants and 2/3/4 for animevideov3.

- [ ] **Step 4: Implement process lifecycle**

Store active children by job ID. On Windows cancellation invoke `taskkill /PID <pid> /T /F` with `windowsHide: true`; never pass a shell-composed string. Convert failures into the approved `UPSCALE_*` codes.

- [ ] **Step 5: Verify green and commit**

Run: `pnpm vitest run tests/unit/upscaleRunner.test.ts`

Expected: PASS.

```powershell
git add electron/main/upscale/realEsrganRunner.ts tests/unit/upscaleRunner.test.ts
git commit -m "feat: run Real-ESRGAN jobs"
```

### Task 7: Export Service and Library Return Flow

**Files:**
- Create: `src/features/upscale/utils/upscaleExport.ts`
- Create: `electron/main/upscale/upscaleExport.ts`
- Test: `tests/unit/upscaleExport.test.ts`

**Interfaces:**
- Produces `normalizeUpscaleExportOptions()`, `buildUpscaleOutputName()`, `pickUpscaleOutputDirectory()`, and `exportUpscaleResult(request)`.

- [ ] **Step 1: Write failing export-policy tests**

Cover PNG/JPEG/WebP settings, disabled quality for PNG, controlled naming variables, filename sanitization, append-number/overwrite/skip behavior, directory-token validation, file-only/library-only/both modes, and rollback when library import fails.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleExport.test.ts`

Expected: FAIL because export utilities do not exist.

- [ ] **Step 3: Implement pure normalization and naming**

```ts
export const defaultUpscaleExportOptions: UpscaleExportOptions = {
  saveToDirectory: true,
  addToLibrary: false,
  format: "png",
  quality: 92,
  conflictPolicy: "append-number",
  namingPattern: "{name}_{engine}_{scale}x",
  libraryMode: "new-group",
};
```

Allow only `{name}`, `{engine}`, `{model}`, and `{scale}` variables and strip Windows-invalid filename characters.

- [ ] **Step 4: Implement main-process export**

Use Sharp to encode selected formats and metadata. Save through a same-directory temporary file and rename. For library export, call the existing generated-image import path with inherited prompt/category/tag metadata when a source item exists. Keep the original image first and append the upscaled result.

- [ ] **Step 5: Verify green and commit**

Run: `pnpm vitest run tests/unit/upscaleExport.test.ts`

Expected: PASS.

```powershell
git add src/features/upscale/utils/upscaleExport.ts electron/main/upscale/upscaleExport.ts tests/unit/upscaleExport.test.ts
git commit -m "feat: export upscale results"
```

### Task 8: Typed IPC, Preload API, and Main Service

**Files:**
- Create: `electron/main/upscale/upscaleService.ts`
- Modify: `electron/shared/ipcChannels.ts`
- Modify: `electron/main/ipc/registerIpcHandlers.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Modify: `src/types/suyanApi.ts`
- Test: `tests/unit/upscaleWorkspace.test.ts`

**Interfaces:**
- Produces named `window.suyanApi` methods for status, install, remove, pick/register/read input, run/cancel native job, store/read result, select output directory, and export.
- Produces one subscribe/unsubscribe method for `UpscaleProgressEvent`.

- [ ] **Step 1: Add failing contract tests**

Parse source files and assert every new channel is centralized, every preload method uses `IpcChannelName`, no generic invoke is exposed, and progress listeners return cleanup functions.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleWorkspace.test.ts`

Expected: FAIL because APIs are absent.

- [ ] **Step 3: Add channels and typed API methods**

Add fixed names under the `upscale:` namespace. Every handler returns `IpcResult<T>` through the existing `handleResult` wrapper. Validate engine/model IDs before dispatch.

- [ ] **Step 4: Add lifecycle hooks**

On `app.whenReady`, run cache cleanup without blocking the first window. On `before-quit`, cancel native jobs and clear session token maps. Never make cleanup failure block application exit.

- [ ] **Step 5: Verify green and Electron typecheck**

Run: `pnpm vitest run tests/unit/upscaleWorkspace.test.ts`

Expected: PASS.

Run: `pnpm typecheck:electron`

Expected: exit 0.

- [ ] **Step 6: Commit the task**

```powershell
git add electron/main/upscale/upscaleService.ts electron/shared/ipcChannels.ts electron/main/ipc/registerIpcHandlers.ts electron/main/index.ts electron/preload/index.ts src/types/suyanApi.ts tests/unit/upscaleWorkspace.test.ts
git commit -m "feat: expose upscale desktop APIs"
```

### Task 9: Real-CUGAN Tiling and Worker

**Files:**
- Create: `src/features/upscale/worker/realCuganTiling.ts`
- Create: `src/features/upscale/worker/realCugan.worker.ts`
- Create: `src/features/upscale/worker/realCuganClient.ts`
- Test: `tests/unit/upscaleTiling.test.ts`

**Interfaces:**
- Produces `buildTilePositions()`, `buildTileRegions()`, singleton `realCuganClient.loadModel()`, `run()`, and `cancel()`.

- [ ] **Step 1: Write failing pure tiling tests**

```ts
expect(buildTilePositions(512)).toEqual([0]);
expect(buildTilePositions(960)).toEqual([0, 448]);
expect(buildTilePositions(1000)).toEqual([0, 448, 488]);
expect(buildTileRegions(1000, 700)).toHaveLength(6);
```

Also test overlap crop bounds, non-multiple dimensions, scale-aware output rectangles, and 120MP rejection.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleTiling.test.ts`

Expected: FAIL because tiling functions do not exist.

- [ ] **Step 3: Implement pure tiling math**

Use tile size 512, overlap 32, and stride 448. Right/bottom align the final tile and crop overlap on internal boundaries only.

- [ ] **Step 4: Implement the module Worker**

Import `onnxruntime-web/webgpu` locally. Resolve emitted WASM assets with Vite `?url` imports. Create WebGPU session first; on initialization or inference failure dispose it, create one WASM session, and retry the current image once. Transfer image buffers instead of cloning them.

- [ ] **Step 5: Implement singleton client and cancellation**

Track request IDs. Cancellation terminates the current Worker, rejects the active promise with `UPSCALE_CANCELED`, and lazily recreates the Worker for the next task. Ignore messages whose request ID no longer matches.

- [ ] **Step 6: Verify tests and renderer build**

Run: `pnpm vitest run tests/unit/upscaleTiling.test.ts`

Expected: PASS.

Run: `pnpm build:renderer`

Expected: Vite emits worker, ONNX JS, and WASM assets with exit 0.

- [ ] **Step 7: Commit the task**

```powershell
git add src/features/upscale/worker/realCuganTiling.ts src/features/upscale/worker/realCugan.worker.ts src/features/upscale/worker/realCuganClient.ts tests/unit/upscaleTiling.test.ts
git commit -m "feat: run Real-CUGAN in a worker"
```

### Task 10: Queue Store and Workspace UI

**Files:**
- Create: `src/features/upscale/store/useUpscaleStore.ts`
- Create: `src/features/upscale/components/UpscaleCompare.tsx`
- Create: `src/features/upscale/components/UpscaleQueue.tsx`
- Create: `src/features/upscale/components/UpscaleSettings.tsx`
- Create: `src/features/upscale/components/UpscaleWorkspace.tsx`
- Create: `src/features/upscale/index.ts`
- Test: `tests/unit/upscaleStore.test.ts`

**Interfaces:**
- Produces lazy-loadable `UpscaleWorkspace`.
- Store actions: `enqueue`, `remove`, `reorder`, `select`, `startQueue`, `cancelActive`, `retry`, `setPreset`, `setExportOptions`, `commitResults`.

- [ ] **Step 1: Write failing queue state-machine tests**

Cover ordered processing, one active job, single-item failure continuation, cancellation, retry, page-switch persistence, and partial export retry.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleStore.test.ts`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement queue orchestration**

Use a Zustand vanilla-compatible store. Real-CUGAN tasks call `realCuganClient`; Real-ESRGAN tasks call the typed main API. Persist settings in memory for the application session, not in `library.json`.

- [ ] **Step 4: Build the three-pane workspace**

Desktop grid: fixed queue rail, flexible comparison viewport, fixed settings rail. Narrow mode uses three tabs. Use existing Button, tooltip, dialog, theme tokens, and Lucide components. Do not add nested cards or hard-coded colors.

- [ ] **Step 5: Implement comparison controls**

Use a stable aspect-ratio viewport with two overlaid images and a range input controlling clipping. Add fit, 1:1, zoom, pan, and fullscreen actions with fixed-size icon buttons and accessible labels.

- [ ] **Step 6: Implement settings and export controls**

Use segmented controls for preset/engine/scale, menus for models/conflicts, sliders for JPEG/WebP quality and tile size, and checkboxes for the two export destinations. Disable processing until at least one valid input and installed selected engine are available.

- [ ] **Step 7: Verify store tests and typecheck**

Run: `pnpm vitest run tests/unit/upscaleStore.test.ts`

Expected: PASS.

Run: `pnpm typecheck:renderer`

Expected: exit 0.

- [ ] **Step 8: Commit the task**

```powershell
git add src/features/upscale tests/unit/upscaleStore.test.ts
git commit -m "feat: add image upscale workspace"
```

### Task 11: Application Integration, Localization, and Notices

**Files:**
- Modify: `src/features/library/components/LibraryView.tsx`
- Modify: `src/components/LocaleProvider.tsx`
- Modify: `src/components/uiStatusTranslations.ts`
- Modify: `package-win.cjs`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Makes the workspace reachable from the sidebar and localized in both languages.
- Preserves locally installed upscale components during development quick packages only.

- [ ] **Step 1: Extend contract tests to fail on missing integration**

Add assertions to `tests/unit/upscaleWorkspace.test.ts` that `LibraryView` lazy-loads the feature, sidebar renders `imageUpscale`, and locale maps all workspace navigation/status strings.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run tests/unit/upscaleWorkspace.test.ts`

Expected: FAIL because application integration is absent.

- [ ] **Step 3: Add lazy navigation**

Add `imageUpscale` to `LibraryMainView`, lazy import `@/features/upscale`, render it in its own full-height workspace, and wire a Lucide icon sidebar button. Follow the existing immediate selected-state behavior.

- [ ] **Step 4: Add locale and status mappings**

Add complete English strings for navigation, installation phases, queue statuses, controls, errors, and export outcomes. Keep filenames, tags, categories, and prompt content untranslated.

- [ ] **Step 5: Update package preservation and notices**

Add `upscale-cugan` and `upscale-realesrgan` to development-only installed component preservation. Published releases still skip local AI components. Append full license attributions without removing existing notices.

- [ ] **Step 6: Verify tests and typecheck**

Run: `pnpm vitest run tests/unit/upscaleWorkspace.test.ts tests/unit/sidebarEntries.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit the task**

```powershell
git add src/features/library/components/LibraryView.tsx src/components/LocaleProvider.tsx src/components/uiStatusTranslations.ts package-win.cjs THIRD_PARTY_NOTICES.md tests/unit/upscaleWorkspace.test.ts
git commit -m "feat: integrate image upscale workspace"
```

### Task 12: Visual, Inference, Regression, and Package Verification

**Files:**
- Create: `scripts/check-upscale-workspace-ui.mjs`
- Add: a small generated PNG fixture under the test script's temporary directory at runtime; do not commit a binary fixture.

**Interfaces:**
- Produces repeatable desktop and narrow screenshots under `output/playwright/upscale/`.

- [ ] **Step 1: Write the UI smoke script**

Start Vite with a mocked `window.suyanApi`, open the `imageUpscale` view, load deterministic queue/results, and capture 1440x900 and 760x900 screenshots. Assert key controls are visible, no horizontal overflow exists, and the comparison viewport has non-zero pixels.

- [ ] **Step 2: Run the UI smoke**

Run: `node scripts/check-upscale-workspace-ui.mjs`

Expected: two screenshots, zero overlap/overflow assertions, exit 0.

- [ ] **Step 3: Run focused and full automated verification**

Run: `pnpm vitest run tests/unit/upscaleModels.test.ts tests/unit/upscaleExport.test.ts tests/unit/upscaleManifest.test.ts tests/unit/upscaleInstaller.test.ts tests/unit/upscaleInputs.test.ts tests/unit/upscaleRunner.test.ts tests/unit/upscaleTiling.test.ts tests/unit/upscaleStore.test.ts tests/unit/upscaleWorkspace.test.ts`

Expected: all focused tests pass.

Run: `pnpm test`

Expected: all repository tests pass.

Run: `pnpm typecheck`

Expected: exit 0.

Run: `npx tsc --noEmit -p tsconfig.electron.json`

Expected: exit 0.

- [ ] **Step 4: Run real-engine smoke tests**

Install the pinned 2x no-denoise Real-CUGAN model through the product installer and verify one small image with WebGPU and forced WASM. Install the pinned Real-ESRGAN package and run the same input with `realesrgan-x4plus`. Verify expected dimensions, successful image decode, and non-blank pixel variance. Exercise file-only, library-only, and dual export.

- [ ] **Step 5: Run the mandatory Windows quick package**

Run: `pnpm package:win`

Expected: exit 0; `release\win-unpacked\素言.exe` and `release\win-unpacked\resources\app.asar` have fresh timestamps.

- [ ] **Step 6: Inspect final diff and commit verification assets**

Run: `git diff --check`

Expected: no whitespace errors.

```powershell
git add scripts/check-upscale-workspace-ui.mjs
git commit -m "test: verify image upscale workspace"
```

Do not stage or commit the user's pre-existing canvas files unless an implementation step explicitly modifies the same lines and the change has been manually separated.
