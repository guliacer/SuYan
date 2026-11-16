/** Dedicated Vitest config AND real Electron main-process runner for this test only. */
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { createHash, randomUUID } = require("node:crypto");
const { createRequire, Module } = require("node:module");
const workspace = path.resolve(__dirname, "../..");
const outputDir = "C:\\Users\\Admin\\.frago\\data\\suyan\\20261114-billfish-parity";
module.exports = {
  root: workspace,
  cacheDir: path.join(os.tmpdir(), "suyan-billfish-real-vitest-cache"),
  test: { include: ["tests/integration/billfishDirectoryImport.real.test.ts"], environment: "node",
    fileParallelism: false, testTimeout: 290000, hookTimeout: 290000 },
};

function within(root, candidate) {
  const relative = path.relative(path.resolve(root).toLowerCase(), path.resolve(candidate).toLowerCase());
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
}
function realTarget(candidate) {
  let ancestor = path.resolve(candidate); const tail = [];
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("路径没有可解析的父目录: " + candidate);
    tail.unshift(path.basename(ancestor)); ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...tail);
}
function ensure(condition, message) { if (!condition) throw new Error(message); }
function message(error) { return error instanceof Error ? error.stack || error.message : String(error); }
function check(errors, condition, label) { if (!condition) errors.push(label); }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function atomicJson(file, value) {
  const temporary = file + ".tmp-" + randomUUID();
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  await fsp.rename(temporary, file);
}

/** Guard filesystem mutation boundaries, not scanner/media behavior. No cleanup of retained fixtures. */
function installWriteGuard(request, result) {
  const isolatedReal = realTarget(request.isolationRoot), approvedReal = realTarget(outputDir);
  function allow(candidate, deletion = false) {
    if (typeof candidate !== "string" && !Buffer.isBuffer(candidate) && !(candidate instanceof URL)) {
      throw new Error("未经路径校验的文件描述符写入");
    }
    const absolute = candidate instanceof URL ? require("node:url").fileURLToPath(candidate) : path.resolve(String(candidate));
    const resolved = realTarget(absolute);
    const isolated = within(request.isolationRoot, absolute) && within(isolatedReal, resolved);
    const log = within(outputDir, absolute) && within(approvedReal, resolved) && path.basename(absolute).startsWith("real-import-");
    if (!isolated && (deletion || !log)) {
      result.deniedWrites.push(absolute);
      throw new Error("REAL_IMPORT_WRITE_OUTSIDE_ISOLATION: " + absolute);
    }
  }
  for (const api of [fsp, fs]) {
    const wrap = (name, argumentsToCheck, deletion = false) => {
      const original = api[name]; if (typeof original !== "function") return;
      api[name] = function (...args) { for (const index of argumentsToCheck) allow(args[index], deletion); return original.apply(this, args); };
    };
    for (const name of ["writeFile", "appendFile", "mkdir", "truncate", "chmod", "chown", "utimes",
      "writeFileSync", "appendFileSync", "mkdirSync", "truncateSync", "chmodSync", "chownSync", "utimesSync"]) wrap(name, [0]);
    for (const name of ["rm", "unlink", "rmdir", "rmSync", "unlinkSync", "rmdirSync"]) wrap(name, [0], true);
    for (const name of ["rename", "renameSync"]) wrap(name, [0, 1]);
    for (const name of ["copyFile", "copyFileSync", "cp", "cpSync"]) wrap(name, [1]);
    for (const name of ["open", "openSync"]) {
      const original = api[name]; if (typeof original !== "function") continue;
      api[name] = function (file, flags, ...rest) {
        const writes = typeof flags === "number"
          ? Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND))
          : /[wa+]/.test(flags || "r");
        if (writes) allow(file);
        return original.call(this, file, flags, ...rest);
      };
    }
  }
  const createWriteStream = fs.createWriteStream;
  fs.createWriteStream = function (file, ...rest) { allow(file); return createWriteStream.call(this, file, ...rest); };
  return allow;
}

function installProductionLoader(request, result) {
  const projectRequire = createRequire(path.join(request.workspace, "package.json"));
  const ts = projectRequire("typescript");
  require.extensions[".ts"] = function (mod, filename) {
    const source = fs.readFileSync(filename, { encoding: "utf8" });
    mod._compile(ts.transpileModule(source, { fileName: filename, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } }).outputText, filename);
  };
  // Only the logging sink is replaced. All four owning scanner/media modules,
  // root/index stores, directory utility, sharp and Electron nativeImage stay real.
  const loggerFile = path.join(request.workspace, "electron/main/appLogger.ts");
  const sink = new Module(loggerFile);
  const capture = (level, module, event, details = {}) => {
    const sanitized = Object.fromEntries(Object.entries(details).map(([key, value]) =>
      [/token|password|secret|authorization|api.?key/i.test(key) ? key : key,
        /token|password|secret|authorization|api.?key/i.test(key) ? "[redacted]" : value]));
    result.logs.push({ at: new Date().toISOString(), elapsedMs: Date.now() - result.startedAtMs, level, module, event, ...sanitized });
  };
  sink.exports = { logger: Object.fromEntries(["debug", "info", "warn", "error"].map(level =>
    [level, (module, event, details) => capture(level.toUpperCase(), module, event, details)])),
    log: capture, logStartupEvent: (event, details) => capture("INFO", "main", event, details) };
  sink.loaded = true; require.cache[loggerFile] = sink;
  return relative => projectRequire(path.join(request.workspace, relative));
}

async function pool(values, callback) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(3, values.length) }, async () => {
    while (index < values.length) { const current = index++; await callback(values[current], current); }
  }));
}
async function stamp(file) {
  const bytes = await fsp.readFile(file), stats = await fsp.stat(file);
  return { bytes, size: stats.size, sha256: hash(bytes), mtimeMs: stats.mtimeMs };
}

async function scan(request, result, load) {
  const scanner = load("electron/main/library/externalLibraryScanner.ts");
  const rootsStore = load("electron/main/library/libraryRoots.ts");
  const store = load("electron/main/library/libraryStore.ts");
  const resolver = load("electron/main/library/mediaPathResolver.ts");
  const photoshop = load("electron/main/library/photoshopImage.ts");
  const directories = load("src/features/library/utils/libraryDirectory.ts");
  const root = { id: randomUUID(), label: "2026-09", absolutePath: request.sourceRoot,
    recursive: true, watchEnabled: false, lastScanAt: null };
  await rootsStore.writeLibraryRoots([root]);
  await store.writeLibraryFile(store.createEmptyLibrary());
  const firstErrors = [], secondErrors = [];
  let first, second;
  try { first = await scanner.scanExternalLibraryRoot(root.id); } catch (error) { firstErrors.push(message(error)); }
  result.roots = await rootsStore.readLibraryRoots();
  result.library = await store.readLibraryFile(); result.items = result.library.items;
  const firstIds = result.items.map(item => item.id).sort();
  const firstPaths = result.items.map(item => item.mediaStorage?.relativePath?.replace(/\\/g, "/")).sort();
  check(firstErrors, first?.importedCount === 135, "first importedCount: " + first?.importedCount + " (expected 135)");
  check(firstErrors, first?.skippedCount === 0, "first skippedCount: " + first?.skippedCount + " (expected 0)");
  check(firstErrors, result.items.length === 135 && new Set(firstIds).size === 135, "first index must have 135 unique IDs");
  check(firstErrors, JSON.stringify(firstPaths) === JSON.stringify(request.manifest.files.map(file => file.relativePath).sort()), "scan paths differ from complete unfiltered source inventory");
  check(firstErrors, request.manifest.files.length === 135 && request.manifest.directories.length === 16, "source fixture must contain exactly 135 files / 16 subdirectories");
  result.directorySettings = directories.mergeLibraryDirectoryNodes({ roots: result.roots, items: result.items });
  const folderPaths = result.directorySettings.nodes.filter(node => node.kind === "folder").map(node => node.relativePath).sort();
  result.folderCount = folderPaths.length;
  check(firstErrors, JSON.stringify(folderPaths) === JSON.stringify(request.manifest.directories.slice().sort()), "real directory model differs from source folder inventory");
  result.media = []; result.formatCounts = {};
  for (const file of request.manifest.files) {
    const item = result.items.find(candidate => candidate.mediaStorage?.relativePath?.replace(/\\/g, "/") === file.relativePath);
    const entry = { itemId: item?.id, relativePath: file.relativePath,
      originalAbsolutePath: path.join(request.sourceRoot, file.relativePath), extension: path.extname(file.relativePath).slice(1).toLowerCase() };
    try {
      ensure(item && item.mediaStorage?.kind === "external" && item.mediaStorage.rootId === root.id, "missing external indexed item: " + file.relativePath);
      const resolved = await resolver.resolveMediaAbsolutePath(item);
      ensure(path.resolve(resolved) === path.resolve(entry.originalAbsolutePath), "real resolver did not resolve source: " + file.relativePath);
      ensure(item.mediaStorage.size === file.size && item.mediaStorage.mtimeMs === file.mtimeMs, "indexed size/mtime does not match source: " + file.relativePath);
      ensure(path.extname(item.imageFileName).slice(1).toLowerCase() === entry.extension, "indexed filename extension changed: " + file.relativePath);
      const bytes = await fsp.readFile(resolved);
      const psd = photoshop.isPhotoshopImageBuffer(bytes);
      const metadata = await photoshop.createSharpImageFromBuffer(bytes).metadata();
      entry.contentFormat = psd ? "psd" : metadata.format;
      entry.width = metadata.width; entry.height = metadata.height;
      ensure(entry.width > 0 && entry.height > 0, "content decoder returned no dimensions: " + file.relativePath);
      ensure(entry.contentFormat === entry.extension, "extension/content mismatch: " + file.relativePath + " -> " + entry.contentFormat);
      entry.directoryId = directories.getLibraryItemDirectoryId(item, result.directorySettings, result.directorySettings.nodes);
      const node = result.directorySettings.nodes.find(candidate => candidate.id === entry.directoryId);
      const expectedDirectory = path.posix.dirname(file.relativePath) === "." ? "" : path.posix.dirname(file.relativePath);
      ensure(node?.rootId === root.id && node.relativePath === expectedDirectory, "wrong physical item-directory mapping: " + file.relativePath);
      if (psd) {
        const composite = photoshop.decodePhotoshopComposite(bytes);
        ensure(composite.width === 1080 && composite.height === 1800, "real PSD composite must be 1080x1800");
        ensure(file.relativePath === "20260901-全屏图-时上凌霄百尺英/ps-session-backup.psd", "unexpected real PSD path");
      }
      result.formatCounts[entry.contentFormat] = (result.formatCounts[entry.contentFormat] || 0) + 1;
    } catch (error) { entry.error = message(error); firstErrors.push(file.relativePath + ": " + entry.error); }
    result.media.push(entry);
  }
  check(firstErrors, result.formatCounts.webp === 134 && result.formatCounts.psd === 1 && Object.keys(result.formatCounts).length === 2,
    "actual content counts: " + JSON.stringify(result.formatCounts) + " (expected 134 WebP + 1 PSD)");
  try { second = await scanner.scanExternalLibraryRoot(root.id); } catch (error) { secondErrors.push(message(error)); }
  const persisted = await store.readLibraryFile();
  check(secondErrors, second?.importedCount === 0 && second?.skippedCount === 135, "rescan must import 0 / skip 135: " + JSON.stringify({ imported: second?.importedCount, skipped: second?.skippedCount }));
  check(secondErrors, persisted.items.length === 135 && JSON.stringify(persisted.items.map(item => item.id).sort()) === JSON.stringify(firstIds), "rescan changed IDs/count");
  check(secondErrors, new Set(persisted.items.map(item => item.mediaStorage?.relativePath)).size === 135, "rescan contains duplicate external relative paths");
  result.roots = await rootsStore.readLibraryRoots(); result.library = persisted; result.items = persisted.items;
  result.firstScan = { status: firstErrors.length ? "failed" : "passed", errors: firstErrors,
    importedCount: first?.importedCount ?? 0, skippedCount: first?.skippedCount ?? 0, itemCount: firstIds.length };
  result.secondScan = { status: secondErrors.length ? "failed" : "passed", errors: secondErrors,
    importedCount: second?.importedCount ?? 0, skippedCount: second?.skippedCount ?? 0, itemCount: persisted.items.length };
  result.errors.push(...firstErrors, ...secondErrors);
}

async function media(request, result, load, nativeImage, allow) {
  const cold = request.stage === "cold-media";
  const rootsStore = load("electron/main/library/libraryRoots.ts");
  const store = load("electron/main/library/libraryStore.ts");
  const paths = load("electron/main/library/libraryPaths.ts");
  const resolver = load("electron/main/library/mediaPathResolver.ts");
  const thumbnails = load("electron/main/library/imageThumbnails.ts");
  const photoshop = load("electron/main/library/photoshopImage.ts");
  if (cold) { await rootsStore.writeLibraryRoots(request.scan.roots); await store.writeLibraryFile(request.scan.library); }
  const library = await store.readLibraryFile(), roots = await rootsStore.readLibraryRoots();
  ensure(library.items.length === 135 && roots.length === 1, "media process did not read the real 135-item isolated index");
  const cacheDir = paths.getImageThumbnailsDir(); allow(cacheDir);
  result.cacheDirectories = [cacheDir];
  if (cold) ensure((await fsp.readdir(cacheDir).catch(error => { if (error.code === "ENOENT") return []; throw error; })).length === 0, "cold media process unexpectedly has thumbnail cache");
  result.media = []; result.verifiedThumbnailCount = 0; result.verifiedPreviewCount = 0;
  await pool(library.items, async item => {
    const entry = { ...request.scan.media.find(candidate => candidate.itemId === item.id) };
    try {
      ensure(entry.itemId === item.id, "source content metadata absent: " + item.imageFileName);
      const original = await resolver.resolveMediaAbsolutePath(item);
      ensure(path.resolve(original) === path.resolve(entry.originalAbsolutePath), "media resolver source changed");
      const expected = paths.getImageThumbnailPath(item.imageFileName); allow(expected);
      const freshBefore = await thumbnails.getFreshImageThumbnailPathForItem(item);
      ensure(cold ? freshBefore === null : freshBefore === expected, "incorrect cold/fresh cache state: " + item.imageFileName);
      const [thumbnail, simultaneous] = await Promise.all([
        thumbnails.getOrCreateImageThumbnailPathForItem(item), thumbnails.getOrCreateImageThumbnailPathForItem(item),
      ]);
      ensure(thumbnail === expected && simultaneous === expected, "thumbnail fell back to source or concurrent paths differ: " + item.imageFileName);
      const first = await stamp(thumbnail);
      const decoded = nativeImage.createFromBuffer(first.bytes);
      ensure(!decoded.isEmpty(), "real Electron could not decode thumbnail: " + item.imageFileName);
      const size = decoded.getSize();
      ensure(size.width > 0 && size.height > 0 && Math.max(size.width, size.height) <= 640, "thumbnail dimensions invalid: " + item.imageFileName);
      const metadata = await photoshop.createSharpImageFromBuffer(first.bytes).metadata();
      ensure(metadata.format === "jpeg" && metadata.width === size.width && metadata.height === size.height, "thumbnail content is not a valid JPEG: " + item.imageFileName);
      ensure(await thumbnails.getFreshImageThumbnailPathForItem(item) === expected, "generated thumbnail is not fresh");
      const rereadPath = await thumbnails.getOrCreateImageThumbnailPathForItem(item), reread = await stamp(rereadPath);
      ensure(rereadPath === expected && reread.sha256 === first.sha256 && reread.size === first.size && reread.mtimeMs === first.mtimeMs, "same-process cache was regenerated or changed");
      if (!cold) {
        const prior = request.cold.media.find(candidate => candidate.itemId === item.id);
        ensure(prior?.thumbnailAbsolutePath === expected && prior.thumbnailSha256 === first.sha256 && prior.thumbnailMtimeMs === first.mtimeMs,
          "fresh Electron process did not reuse the same disk thumbnail: " + item.imageFileName);
      }
      Object.assign(entry, { thumbnailAbsolutePath: thumbnail, thumbnailSize: first.size, thumbnailSha256: first.sha256,
        thumbnailMtimeMs: first.mtimeMs, thumbnailWidth: size.width, thumbnailHeight: size.height });
      result.verifiedThumbnailCount++;
    } catch (error) { entry.error = message(error); result.errors.push(entry.relativePath + ": " + entry.error); }
    result.media.push(entry);
  });
  for (const entry of result.media.filter(candidate => candidate.contentFormat === "psd")) {
    try {
      const preview = await photoshop.getDisplayableImagePath(entry.originalAbsolutePath); allow(preview);
      ensure(preview !== entry.originalAbsolutePath && path.extname(preview) === ".png", "PSD preview returned undecodable original");
      const first = await stamp(preview), decoded = nativeImage.createFromBuffer(first.bytes);
      ensure(!decoded.isEmpty(), "real Electron could not decode PSD composite PNG");
      const size = decoded.getSize(), metadata = await photoshop.createSharpImageFromBuffer(first.bytes).metadata();
      ensure(size.width === 1080 && size.height === 1800 && metadata.format === "png" && metadata.width === 1080 && metadata.height === 1800, "PSD PNG preview dimensions/content incorrect");
      const again = await photoshop.getDisplayableImagePath(entry.originalAbsolutePath), second = await stamp(again);
      ensure(again === preview && first.sha256 === second.sha256 && first.mtimeMs === second.mtimeMs, "PSD preview was regenerated on reread");
      if (!cold) {
        const prior = request.cold.media.find(candidate => candidate.itemId === entry.itemId);
        ensure(prior?.previewAbsolutePath === preview && prior.previewSha256 === first.sha256 && prior.previewMtimeMs === first.mtimeMs, "fresh process did not reuse PSD preview");
      }
      Object.assign(entry, { previewAbsolutePath: preview, previewSize: first.size, previewSha256: first.sha256, previewMtimeMs: first.mtimeMs });
      result.psdPreview = size; result.verifiedPreviewCount++;
    } catch (error) { entry.error = message(error); result.errors.push(entry.relativePath + " PSD preview: " + entry.error); }
  }
  check(result.errors, result.verifiedThumbnailCount === 135, "verified thumbnails: " + result.verifiedThumbnailCount + "/135");
  check(result.errors, result.verifiedPreviewCount === 1, "verified PSD previews: " + result.verifiedPreviewCount + "/1");
  ensure((await fsp.readdir(paths.getImagesDir())).length === 0, "external import unexpectedly copied pixels into managed images directory");
}

async function run() {
  const requestFile = process.env.SUYAN_REAL_IMPORT_REQUEST;
  ensure(requestFile && within(outputDir, requestFile) && path.basename(requestFile).startsWith("real-import-"), "invalid request path");
  const request = JSON.parse(fs.readFileSync(requestFile, { encoding: "utf8" }));
  ensure(path.resolve(request.workspace) === workspace && path.resolve(request.outputDir) === outputDir, "wrong workspace/output boundary");
  ensure(within(os.tmpdir(), request.isolationRoot) && path.basename(request.isolationRoot).startsWith("suyan-billfish-real-") && within(request.isolationRoot, request.userData), "userData is not a uniquely isolated temp directory");
  ensure(within(outputDir, request.outputPath) && path.basename(request.outputPath).startsWith("real-import-"), "invalid result path");
  const result = { runId: request.runId, stage: request.stage, userData: request.userData, startedAtMs: Date.now(),
    status: "failed", errors: [], deniedWrites: [], logs: [], mockedBoundaries: ["logger sink only"],
    runtime: { electron: process.versions.electron, node: process.versions.node, nativeImageMocked: false, rustFileOps: false } };
  const { app, nativeImage } = require("electron");
  try {
    const allow = installWriteGuard(request, result);
    app.disableHardwareAcceleration(); app.setPath("userData", request.userData);
    const session = path.join(request.userData, "session-data"), temporary = path.join(request.userData, "process-temp");
    fs.mkdirSync(session, { recursive: true }); fs.mkdirSync(temporary, { recursive: true });
    app.setPath("sessionData", session); app.setPath("temp", temporary);
    process.env.TEMP = temporary; process.env.TMP = temporary;
    await app.whenReady();
    const load = installProductionLoader(request, result);
    ensure(load("electron/main/library/libraryPaths.ts").getLibraryDataDir() === path.join(request.userData, "library"), "real library paths escaped isolated userData");
    if (request.stage === "scan") await scan(request, result, load);
    else await media(request, result, load, nativeImage, allow);
  } catch (error) { result.errors.push(message(error)); }
  result.loadedProductionModules = Object.keys(require.cache).filter(file => within(workspace, file) && /[\\/]((electron[\\/]main)|(src[\\/]features))[\\/]/.test(file));
  result.productionSourceHashes = Object.fromEntries(await Promise.all([
    "externalLibraryScanner", "mediaPathResolver", "photoshopImage", "imageThumbnails",
  ].map(async name => { const file = path.join(workspace, "electron/main/library", name + ".ts"); return [file, hash(await fsp.readFile(file, { encoding: "utf8" }))]; })));
  result.status = result.errors.length || result.deniedWrites.length ? "failed" : "passed";
  result.durationMs = Date.now() - result.startedAtMs;
  await atomicJson(request.outputPath, result);
  app.exit(0); // A completed diagnostic report can contain failing checks; Vitest asserts them.
}

if (process.versions.electron && process.env.SUYAN_REAL_IMPORT_WORKER === "1") {
  run().catch(error => { process.stderr.write(message(error) + "\n"); require("electron").app.exit(1); });
}
