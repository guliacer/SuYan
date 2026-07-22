const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { build, Platform } = require("electron-builder");
const { obfuscateDirectory } = require("./scripts/obfuscate-electron.cjs");
const { writeIntegrityManifest } = require("./scripts/write-integrity-manifest.cjs");

const projectRoot = __dirname;
const stageDir = path.join(projectRoot, "release-next", "package-win-app");
const requestedReleaseDir = path.join(projectRoot, process.env.PROMPT_PACKAGE_OUTPUT_DIR || "release");
const previewReleaseMirrorDir = path.join(projectRoot, "release-ui-preview");
const shouldPromoteDefaultRelease = !process.env.PROMPT_PACKAGE_OUTPUT_DIR;
const packageOutputDir = shouldPromoteDefaultRelease
  ? path.join(projectRoot, "release-next", "package-win-output")
  : requestedReleaseDir;
const electronDist = path.join(projectRoot, "node_modules", "electron", "dist");
const appIconPath = path.join(stageDir, "build", "icon.ico");
const vendorDir = path.join(stageDir, "vendor");
const vendorNodeModulesDir = path.join(vendorDir, "node_modules");
const sourcePackagePath = path.join(projectRoot, "package.json");
const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));

function assertInsideProject(targetPath) {
  const relativePath = path.relative(projectRoot, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to operate outside project: ${targetPath}`);
  }
}

function resetDirectory(directoryPath) {
  assertInsideProject(directoryPath);
  removePathIfExists(directoryPath);
  fs.mkdirSync(directoryPath, { recursive: true });
}

function removeDirectoryIfExists(directoryPath) {
  assertInsideProject(directoryPath);
  removePathIfExists(directoryPath);

  if (fs.existsSync(directoryPath)) {
    throw new Error(`Directory still exists after removal: ${directoryPath}`);
  }
}

function copyDirectory(source, destination, options = {}) {
  const stat = fs.lstatSync(source);

  if (stat.isSymbolicLink()) {
    copyDirectory(fs.realpathSync(source), destination, options);
    return;
  }

  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const sourceChild = path.join(source, entry.name);
      if (options.filter && !options.filter(sourceChild)) {
        continue;
      }
      copyDirectory(sourceChild, path.join(destination, entry.name), options);
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyFileWithRetry(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.copyFileSync(source, destination);
      return;
    } catch (error) {
      lastError = error;
      sleepSync(250);
    }
  }

  throw lastError;
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      removePathRecursive(targetPath);

      if (!fs.existsSync(targetPath)) {
        return;
      }

      lastError = new Error(`Path still exists after removal: ${targetPath}`);
    } catch (error) {
      if (!fs.existsSync(targetPath)) {
        return;
      }

      lastError = error;
    }

    sleepSync(250);
  }

  throw lastError;
}

function removePathRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath)) {
      removePathRecursive(path.join(targetPath, entry));
    }

    fs.rmdirSync(targetPath);
    return;
  }

  fs.unlinkSync(targetPath);
}

function syncDirectoryContents(source, destination) {
  assertInsideProject(source);
  assertInsideProject(destination);

  if (!fs.existsSync(source)) {
    throw new Error(`Source directory does not exist: ${source}`);
  }

  fs.mkdirSync(destination, { recursive: true });

  const sourceEntries = new Set(fs.readdirSync(source));

  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (sourceEntries.has(entry.name)) {
      continue;
    }

    const stalePath = path.join(destination, entry.name);

    try {
      removePathIfExists(stalePath);
    } catch (error) {
      console.warn(
        `Stale release entry could not be removed: ${path.relative(projectRoot, stalePath)}. ${formatError(error)}`,
      );
    }
  }

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourceChild = path.join(source, entry.name);
    const destinationChild = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      if (fs.existsSync(destinationChild) && !fs.lstatSync(destinationChild).isDirectory()) {
        removePathIfExists(destinationChild);
      }

      syncDirectoryContents(sourceChild, destinationChild);
      continue;
    }

    if (entry.isSymbolicLink()) {
      copyDirectory(fs.realpathSync(sourceChild), destinationChild);
      continue;
    }

    if (fs.existsSync(destinationChild) && fs.lstatSync(destinationChild).isDirectory()) {
      removePathIfExists(destinationChild);
    }

    copyFileWithRetry(sourceChild, destinationChild);
  }
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function copyPackage(packageName, copiedPackages = new Set(), resolvePaths = [projectRoot]) {
  if (copiedPackages.has(packageName)) {
    return;
  }

  const packageJsonPath = require.resolve(`${packageName}/package.json`, {
    paths: resolvePaths,
  });
  const packageRoot = path.dirname(fs.realpathSync(packageJsonPath));
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const destination = path.join(vendorNodeModulesDir, ...packageName.split("/"));

  copyDirectory(packageRoot, destination, {
    filter: (source) => !path.relative(packageRoot, source).split(path.sep).includes("node_modules"),
  });
  copiedPackages.add(packageName);

  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  };

  for (const dependencyName of Object.keys(dependencies)) {
    try {
      copyPackage(dependencyName, copiedPackages, [packageRoot, projectRoot]);
    } catch (error) {
      if (!packageJson.optionalDependencies?.[dependencyName]) {
        throw error;
      }
    }
  }
}

function createStagePackage() {
  const appPackage = {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    author: sourcePackage.author,
    description: sourcePackage.description,
    main: sourcePackage.main,
    packageManager: sourcePackage.packageManager,
    dependencies: {
      jszip: sourcePackage.dependencies.jszip,
    },
  };

  fs.writeFileSync(
    path.join(stageDir, "package.json"),
    `${JSON.stringify(appPackage, null, 2)}\n`,
    "utf8",
  );
}

function createVendorPackage() {
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.writeFileSync(path.join(vendorDir, "package.cjs"), "module.exports = {};\n", "utf8");
  fs.writeFileSync(
    path.join(vendorDir, "package.json"),
    `${JSON.stringify({ private: true, dependencies: { jszip: sourcePackage.dependencies.jszip } }, null, 2)}\n`,
    "utf8",
  );
}

async function createAppIcon() {
  fs.mkdirSync(path.dirname(appIconPath), { recursive: true });

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const logoSourcePath = path.join(projectRoot, "build", "logo-source.png");

  if (fs.existsSync(logoSourcePath)) {
    const sharp = require("sharp");
    const images = [];

    for (const size of sizes) {
      const png = await sharp(logoSourcePath)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer();
      images.push({ size, png });
    }

    fs.writeFileSync(appIconPath, createIco(images));
    return;
  }

  const images = sizes.map((size) => ({
    size,
    png: createIconPng(size),
  }));

  fs.writeFileSync(appIconPath, createIco(images));
}

function copyVendorRuntimeResources(context) {
  const destination = path.join(context.appOutDir, "resources", "vendor");

  resetDirectory(destination);
  copyDirectory(vendorDir, destination);
}

function createIco(images) {
  const header = Buffer.alloc(6);
  const entries = Buffer.alloc(images.length * 16);
  let imageOffset = header.length + entries.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entryOffset = index * 16;
    const widthByte = image.size >= 256 ? 0 : image.size;

    entries[entryOffset] = widthByte;
    entries[entryOffset + 1] = widthByte;
    entries[entryOffset + 2] = 0;
    entries[entryOffset + 3] = 0;
    entries.writeUInt16LE(1, entryOffset + 4);
    entries.writeUInt16LE(32, entryOffset + 6);
    entries.writeUInt32LE(image.png.length, entryOffset + 8);
    entries.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.png.length;
  });

  return Buffer.concat([header, entries, ...images.map((image) => image.png)]);
}

function createIconPng(size) {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * size);
  const radius = size * 0.22;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0;

    for (let x = 0; x < size; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel;
      const alpha = roundedRectCoverage(x + 0.5, y + 0.5, 0, 0, size, size, radius);

      if (alpha <= 0) {
        continue;
      }

      const mixRatio = (x / Math.max(1, size - 1)) * 0.58 + (y / Math.max(1, size - 1)) * 0.42;
      let color = blendColor([49, 89, 81], [221, 98, 76], mixRatio);

      if (positiveModulo(x - y + size, Math.max(8, Math.round(size * 0.24))) < Math.max(2, size * 0.045)) {
        color = blendColor(color, [251, 214, 119], 0.18);
      }

      color = applyCardLayer(color, x, y, size);
      color = applyPromptLineLayer(color, x, y, size);
      color = applySparkLayer(color, x, y, size);

      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = Math.round(255 * alpha);
    }
  }

  return encodePng(size, size, raw);
}

function applyCardLayer(color, x, y, size) {
  const left = size * 0.22;
  const top = size * 0.26;
  const right = size * 0.78;
  const bottom = size * 0.76;
  const cardCoverage = roundedRectCoverage(x + 0.5, y + 0.5, left, top, right, bottom, size * 0.055);

  if (cardCoverage <= 0) {
    return color;
  }

  return blendColor(color, [255, 252, 241], 0.9 * cardCoverage);
}

function applyPromptLineLayer(color, x, y, size) {
  const lineColor = [49, 89, 81];
  const lineHeight = Math.max(1, size * 0.035);
  const left = size * 0.32;
  const widths = [0.35, 0.42, 0.28];
  const yPositions = [0.43, 0.54, 0.65];

  for (let index = 0; index < yPositions.length; index += 1) {
    const top = size * yPositions[index];
    const right = size * (0.32 + widths[index]);

    if (
      x >= left &&
      x <= right &&
      y >= top &&
      y <= top + lineHeight
    ) {
      return blendColor(color, lineColor, 0.82);
    }
  }

  const chipCoverage = roundedRectCoverage(
    x + 0.5,
    y + 0.5,
    size * 0.32,
    size * 0.32,
    size * 0.48,
    size * 0.37,
    size * 0.018,
  );

  return chipCoverage > 0 ? blendColor(color, [221, 98, 76], 0.82 * chipCoverage) : color;
}

function applySparkLayer(color, x, y, size) {
  const centerX = size * 0.66;
  const centerY = size * 0.34;
  const arm = Math.max(1.5, size * 0.07);
  const thickness = Math.max(1, size * 0.014);
  const dx = Math.abs(x - centerX);
  const dy = Math.abs(y - centerY);
  const inVertical = dx < thickness && dy < arm;
  const inHorizontal = dy < thickness && dx < arm;
  const inCore = Math.hypot(dx, dy) < Math.max(1.4, size * 0.025);

  return inVertical || inHorizontal || inCore ? blendColor(color, [251, 214, 119], 0.9) : color;
}

function roundedRectCoverage(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) {
    return 0;
  }

  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const distance = Math.hypot(x - cornerX, y - cornerY);

  if (distance <= radius - 1) {
    return 1;
  }

  if (distance >= radius) {
    return 0;
  }

  return radius - distance;
}

function encodePng(width, height, rawRgbaRows) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", zlib.deflateSync(rawRgbaRows)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_value, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function blendColor(base, overlay, amount) {
  return [
    clampColor(base[0] + (overlay[0] - base[0]) * amount),
    clampColor(base[1] + (overlay[1] - base[1]) * amount),
    clampColor(base[2] + (overlay[2] - base[2]) * amount),
  ];
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function promoteStagedRelease(stagedDir, finalDir) {
  assertInsideProject(stagedDir);
  assertInsideProject(finalDir);

  if (!fs.existsSync(stagedDir)) {
    throw new Error(`Staged package output does not exist: ${stagedDir}`);
  }

  // Windows 下 release 目录常被“素言.exe”占用，rename 会 EPERM。
  // 默认直接同步覆盖，避免打包流程被目录锁打断。
  tryStopLockedReleaseProcesses(finalDir);

  try {
    syncDirectoryContents(stagedDir, finalDir);
  } catch (syncError) {
    throw new Error(
      `Failed to promote staged release to ${path.relative(projectRoot, finalDir)}. The existing release may still be locked by another process. Staged output remains at ${path.relative(projectRoot, stagedDir)}. Sync error: ${formatError(syncError)}`,
    );
  }

  try {
    removeDirectoryIfExists(stagedDir);
  } catch (cleanupError) {
    console.warn(
      `Packaged release was updated, but staged output could not be removed: ${path.relative(projectRoot, stagedDir)}. ${formatError(cleanupError)}`,
    );
  }

  console.log(`Promoted staged package to ${path.relative(projectRoot, finalDir)} by syncing files.`);
}

function tryStopLockedReleaseProcesses(releaseDir) {
  if (process.platform !== "win32" || !fs.existsSync(releaseDir)) {
    return;
  }

  const releaseRoot = path.resolve(releaseDir).toLowerCase();
  const lockedExeNames = new Set(["素言.exe", "suyan.exe"]);

  try {
    const { execFileSync } = require("node:child_process");
    // 用单行脚本，避免 join('; ') 把管道拆坏。
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "$names = @('素言','suyan')",
      "$procs = Get-CimInstance Win32_Process | Where-Object {",
      "  $base = $_.Name",
      "  if ($null -eq $base) { return $false }",
      "  $base = $base.ToLower()",
      "  $path = if ($_.ExecutablePath) { $_.ExecutablePath.ToLower() } else { '' }",
      "  ($names | ForEach-Object { $base -eq ($_ + '.exe') -or $base -eq $_ }) -contains $true -or ($path -and $path.StartsWith('" +
        releaseRoot.replace(/'/g, "''") +
        "'))",
      "}",
      "$procs | Select-Object ProcessId, Name, ExecutablePath | ConvertTo-Json -Compress",
    ].join("\n");

    const raw = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 8000,
    }).trim();

    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    const processes = Array.isArray(parsed) ? parsed : [parsed];
    const targets = processes.filter((item) => {
      const exePath = typeof item.ExecutablePath === "string" ? item.ExecutablePath.toLowerCase() : "";
      const name = typeof item.Name === "string" ? item.Name.toLowerCase() : "";

      if (!exePath) {
        return lockedExeNames.has(name);
      }

      return exePath.startsWith(releaseRoot) || lockedExeNames.has(name);
    });

    for (const target of targets) {
      const pid = Number(target.ProcessId);

      if (!Number.isFinite(pid) || pid <= 0) {
        continue;
      }

      try {
        process.kill(pid);
        console.warn(
          `Stopped locked release process before packaging: pid=${pid} name=${target.Name || "unknown"}`,
        );
      } catch (error) {
        console.warn(
          `Could not stop locked release process pid=${pid}: ${formatError(error)}`,
        );
      }
    }

    if (targets.length > 0) {
      sleepSync(400);
    }
  } catch (error) {
    console.warn(`Release process unlock probe failed: ${formatError(error)}`);
  }
}

function cleanupReleaseBackups() {
  const releaseNextDir = path.join(projectRoot, "release-next");

  if (!fs.existsSync(releaseNextDir)) {
    return;
  }

  for (const entry of fs.readdirSync(releaseNextDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("release-backup-")) {
      continue;
    }

    const backupDir = path.join(releaseNextDir, entry.name);

    try {
      removeDirectoryIfExists(backupDir);
    } catch (error) {
      console.warn(
        `Previous release backup could not be removed: ${path.relative(projectRoot, backupDir)}. ${formatError(error)}`,
      );
    }
  }
}

function syncPreviewReleaseMirror() {
  if (!fs.existsSync(previewReleaseMirrorDir) || path.resolve(previewReleaseMirrorDir) === path.resolve(requestedReleaseDir)) {
    return;
  }

  syncDirectoryContents(requestedReleaseDir, previewReleaseMirrorDir);
  console.log(
    `Synced release mirror ${path.relative(projectRoot, previewReleaseMirrorDir)} from ${path.relative(projectRoot, requestedReleaseDir)}.`,
  );
}

function formatTimestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function removeStageSourceMaps(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return 0;
  }

  let removed = 0;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      removed += removeStageSourceMaps(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".map")) {
      fs.unlinkSync(fullPath);
      removed += 1;
    }
  }
  return removed;
}
async function main() {
  resetDirectory(stageDir);

  if (shouldPromoteDefaultRelease) {
    cleanupReleaseBackups();
    resetDirectory(packageOutputDir);
  }

  copyDirectory(path.join(projectRoot, "dist"), path.join(stageDir, "dist"));
  copyDirectory(path.join(projectRoot, "dist-electron"), path.join(stageDir, "dist-electron"));
  copyDirectory(
    path.join(projectRoot, "electron", "assets", "startup-gallery"),
    path.join(stageDir, "startup-assets"),
  );
  createStagePackage();
  const obfuscationSummary = obfuscateDirectory(path.join(stageDir, "dist-electron"));
  const removedStageMaps = removeStageSourceMaps(stageDir);
  if (removedStageMaps > 0) {
    console.log("Removed " + removedStageMaps + " source map files from package stage.");
  }
  console.log(
    `Protected electron runtime: obfuscated ${obfuscationSummary.obfuscatedCount}/${obfuscationSummary.totalJsFiles} files` +
      (typeof obfuscationSummary.sensitiveCount === "number" ? ` (sensitive ${obfuscationSummary.sensitiveCount})` : "") +
      (obfuscationSummary.removedMaps > 0 ? `, removed ${obfuscationSummary.removedMaps} maps` : ""),
  );
  const integritySummary = writeIntegrityManifest(stageDir, sourcePackage);
  console.log("Wrote integrity manifest with " + integritySummary.fileCount + " hashed files.");
  createVendorPackage();
  copyPackage("jszip");
  copyPackage("ffmpeg-static");
  await createAppIcon();

  await build({
    projectDir: stageDir,
    targets: Platform.WINDOWS.createTarget(),
    config: {
      appId: sourcePackage.build.appId,
      productName: sourcePackage.build.productName,
      copyright: `Copyright © ${new Date().getFullYear()} 素言 SuYan. All rights reserved.`,
      npmRebuild: false,
      beforeBuild: async () => false,
      asar: true,
      electronFuses: {
        runAsNode: false,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: false,
        enableNodeCliInspectArguments: false,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
      },
      files: [
        ...(Array.isArray(sourcePackage.build.files) ? sourcePackage.build.files : []),
        "app-integrity.json",
        "!**/*.map",
        "!**/*.md",
        "!**/LICENSE*",
        "!**/license*",
        "!**/*.env",
        "!**/.env*",
        "!**/ai-settings.json",
        "!**/proxy-settings.json",
        "!**/view-settings.json",
        "!**/window-state.json",
        "!**/library.json",
        "!**/secrets/**",
        "!**/private/**",
        "!**/*.pem",
        "!**/*.key",
        "!**/*.p12",
        "!**/*.pfx",
      ],
      directories: {
        output: packageOutputDir,
      },
      electronDist,
      extraResources: [
        {
          from: "vendor",
          to: "vendor",
        },
        {
          from: "startup-assets",
          to: "startup-assets",
        },
      ],
      afterPack: async (context) => {
        copyVendorRuntimeResources(context);
      },
      win: {
        ...sourcePackage.build.win,
        icon: appIconPath,
        legalTrademarks: "素言 SuYan",
      },
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        perMachine: false,
        shortcutName: "素言",
        uninstallDisplayName: "素言",
        artifactName: "${productName}-Setup-${version}.${ext}",
      },
    },
  });

  if (shouldPromoteDefaultRelease) {
    promoteStagedRelease(packageOutputDir, requestedReleaseDir);
    cleanupReleaseBackups();
    syncPreviewReleaseMirror();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  promoteStagedRelease,
  syncPreviewReleaseMirror,
  syncDirectoryContents,
};
