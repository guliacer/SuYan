const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const zlib = require("node:zlib");
const { build, Platform } = require("electron-builder");
const { obfuscateDirectory } = require("./scripts/obfuscate-electron.cjs");
const { resolveReleaseEdition, releaseArtifactName, stageSignedReleaseComponents,
  assertCleanReleaseData, walkFiles, checkBundledComponentRuntime } = require("./scripts/release-editions.cjs");
const {
  writeIntegrityManifest,
  resolveIntegrityAuthor,
  sha256File,
} = require("./scripts/write-integrity-manifest.cjs");

const projectRoot = __dirname;
const stageDir = path.join(projectRoot, "release-next", "package-win-app");
const requestedReleaseDir = path.join(projectRoot, process.env.PROMPT_PACKAGE_OUTPUT_DIR || "release");
const previewReleaseMirrorDir = path.join(projectRoot, "release-ui-preview");
const shouldPromoteDefaultRelease = !process.env.PROMPT_PACKAGE_OUTPUT_DIR;
const packageOutputDir = shouldPromoteDefaultRelease
  ? path.join(projectRoot, "release-next", "package-win-output")
  : requestedReleaseDir;
const packageLockPath = path.join(projectRoot, "release-next", ".package-win.lock");
const releaseProcessShutdownGraceMs = 2000;
const electronDist = path.join(projectRoot, "node_modules", "electron", "dist");
const appIconPath = path.join(stageDir, "build", "icon.ico");
const installerThemeSourcePath = path.join(projectRoot, "build", "installer.nsh");
const installerThemeStageDir = path.join(stageDir, "build");
const installerHeaderPath = path.join(installerThemeStageDir, "installerHeader.bmp");
const installerSidebarPath = path.join(installerThemeStageDir, "installerSidebar.bmp");
const uninstallerSidebarPath = path.join(installerThemeStageDir, "uninstallerSidebar.bmp");
const guliIdentityConfigFileName = "guli-identity.env";
const guliIdentityPublicConfigSourcePath = path.join(projectRoot, "config", "guli-identity.public.env");
const guliIdentityPrivateConfigSourcePath = path.join(projectRoot, "private", guliIdentityConfigFileName);
const guliIdentityPublicConfigKeys = [
  "GULI_IDENTITY_ISSUER",
  "GULI_IDENTITY_CLIENT_ID",
  "GULI_IDENTITY_REDIRECT_URI",
  "GULI_IDENTITY_SCOPES",
];
const guliIdentityExpectedRedirectUri = "suyan://oauth/callback";
// profile 用于读取绑定方式、昵称和头像；offline_access 是身份服务签发
// refresh_token 的前提，因此两者都纳入安装包配置的强制校验。
const guliIdentityExpectedScopes = "openid email profile offline_access";
const sensitiveConfigKeyPattern = /(?:^|_)(?:CLIENT_SECRET|SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY|AUTHORIZATION|CREDENTIALS?)(?:_|$)/iu;
const localBundledComponentIds = ["ffmpeg", "nsfw-runtime"];
const localBundledComponentSource = (componentId) => path.join(
  projectRoot,
  "release",
  "win-unpacked",
  "data",
  "components",
  componentId,
);
const localBundledComponentStageSource = (componentId) => path.join(
  stageDir,
  "data",
  "components",
  componentId,
);
const isPublishRelease = ["1", "true", "yes"].includes(
  String(process.env.SUYAN_PUBLISH_RELEASE || "").trim().toLowerCase(),
);
function resolveWindowsTargets(publishRelease = isPublishRelease) {
  return publishRelease ? ["nsis", "zip"] : ["dir"];
}

const windowsTargets = resolveWindowsTargets();
const releaseEdition = resolveReleaseEdition(process.env.SUYAN_RELEASE_EDITION);
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

function parseGuliIdentityConfigForPackage(contents) {
  const values = {};

  for (const rawLine of String(contents).split(/\r?\n/u)) {
    const line = rawLine.trim().replace(/^\uFEFF/u, "");
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (sensitiveConfigKeyPattern.test(key)) {
      throw new Error(`Guli Identity 配置包含禁止打包的敏感字段：${key}`);
    }

    if (!guliIdentityPublicConfigKeys.includes(key)) {
      continue;
    }

    const value = unquotePackageEnvValue(match[2].trim());
    if (value) {
      values[key] = value;
    }
  }

  return values;
}

function unquotePackageEnvValue(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function formatGuliIdentityConfigForPackage(values) {
  const lines = guliIdentityPublicConfigKeys
    .filter((key) => typeof values[key] === "string" && values[key].trim())
    .map((key) => `${key}=${values[key].trim()}`);

  return [
    "# Generated public Guli Identity PKCE configuration.",
    "# Only public client metadata is included.",
    ...lines,
    "",
  ].join("\n");
}

function prepareGuliIdentityConfigStage(options = {}) {
  const publishRelease = options.publishRelease ?? isPublishRelease;
  const destinationDir = options.destinationDir ?? stageDir;
  const explicitSourcePath = options.sourcePath;
  // Prefer the tracked public config for releases. The ignored private file is
  // also accepted as a local build source, but only its four public fields are
  // copied into the package.
  const sourcePaths = explicitSourcePath
    ? [explicitSourcePath]
    : publishRelease
      ? [guliIdentityPrivateConfigSourcePath, guliIdentityPublicConfigSourcePath]
      : [guliIdentityPublicConfigSourcePath, guliIdentityPrivateConfigSourcePath];
  const existingSources = sourcePaths.filter((sourcePath) => fs.existsSync(sourcePath));

  if (existingSources.length === 0) {
    if (publishRelease || options.requireConfig === true) {
      throw new Error(
        "正式 Guli Identity 安装包缺少公共配置。请提供 config/guli-identity.public.env（或本机 private/guli-identity.env），其中必须包含真实 GULI_IDENTITY_CLIENT_ID。",
      );
    }
    return null;
  }

  const values = {};
  for (const sourcePath of existingSources) {
    if (!fs.statSync(sourcePath).isFile()) {
      throw new Error(`Guli Identity 配置路径不是文件：${sourcePath}`);
    }
    Object.assign(values, parseGuliIdentityConfigForPackage(fs.readFileSync(sourcePath, "utf8")));
  }

  for (const key of guliIdentityPublicConfigKeys) {
    if (!values[key]?.trim()) {
      throw new Error(`Guli Identity 公共配置缺少 ${key}，下载安装包的用户将无法登录。`);
    }
  }
  if (/^(?:替换|你的|your[_ -]?|change[_ -]?me|<)/iu.test(values.GULI_IDENTITY_CLIENT_ID)) {
    throw new Error("Guli Identity 公共配置仍使用 client_id 占位符，下载安装包的用户将无法登录。");
  }
  if (!/^https:\/\//iu.test(values.GULI_IDENTITY_ISSUER)) {
    throw new Error("Guli Identity 公共配置的 issuer 必须使用 HTTPS。");
  }
  if (values.GULI_IDENTITY_REDIRECT_URI !== guliIdentityExpectedRedirectUri) {
    throw new Error(`Guli Identity 公共配置的回调地址必须固定为 ${guliIdentityExpectedRedirectUri}。`);
  }
  if (normalizePackageScopes(values.GULI_IDENTITY_SCOPES) !== guliIdentityExpectedScopes) {
    throw new Error(`Guli Identity 公共配置的 scopes 必须为 ${guliIdentityExpectedScopes}。`);
  }

  assertInsideProject(destinationDir);
  const destinationPath = path.join(destinationDir, guliIdentityConfigFileName);
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.writeFileSync(destinationPath, formatGuliIdentityConfigForPackage(values), "utf8");
  console.log(`Packaged public Guli Identity config: ${path.relative(projectRoot, destinationPath)}.`);
  return destinationPath;
}

function normalizePackageScopes(value) {
  return [...new Set(String(value).split(/\s+/u).map((scope) => scope.trim()).filter(Boolean))].join(" ");
}

function prepareDevelopmentInstalledComponents() {
  // Development packaging carries already-installed optional AI components
  // into the current portable directory. Published builds opt out explicitly
  // so a developer's local component cache cannot inflate the GitHub artifact.
  if (isPublishRelease) {
    console.log("Publishing release: skipped bundled local AI components.");
    return [];
  }

  const bundled = [];
  for (const componentId of localBundledComponentIds) {
    const source = localBundledComponentSource(componentId);
    if (!fs.existsSync(source)) {
      continue;
    }
    const stageSource = localBundledComponentStageSource(componentId);
    resetDirectory(stageSource);
    copyDirectory(source, stageSource);
    bundled.push(componentId);
    console.log(`Packaged installed local component: ${componentId}.`);
  }

  return bundled;
}

function promoteBundledLocalComponents(finalDir, componentIds, resolveStageSource = localBundledComponentStageSource) {
  for (const componentId of componentIds) {
    const stageSource = resolveStageSource(componentId);
    if (!fs.existsSync(stageSource)) {
      continue;
    }
    const target = path.join(finalDir, "win-unpacked", "data", "components", componentId);
    // 运行中的组件属于用户数据，不能用打包时的快照清空覆盖。
    // 仅为空安装目录播种；修复/升级必须走签名组件安装器。
    if (fs.existsSync(target)) {
      console.log(`Preserved existing local component: ${componentId}.`);
      continue;
    }
    copyDirectory(stageSource, target);
  }
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

function syncDirectoryContents(source, destination, options = {}) {
  assertInsideProject(source);
  assertInsideProject(destination);

  if (!fs.existsSync(source)) {
    throw new Error(`Source directory does not exist: ${source}`);
  }

  fs.mkdirSync(destination, { recursive: true });

  const sourceEntries = new Set(fs.readdirSync(source));
  const preserveNames = options.preserveNames instanceof Set ? options.preserveNames : new Set();
  // Nested preserve rules: e.g. win-unpacked -> { data, logs }
  const nestedPreserve = options.nestedPreserve && typeof options.nestedPreserve === "object"
    ? options.nestedPreserve
    : null;

  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (sourceEntries.has(entry.name) || preserveNames.has(entry.name)) {
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

    // Preserve an existing user-data directory as a whole during promotion.
    // A staged build may contain only newly bundled components; copying that
    // partial directory would silently remove an installed FFmpeg/NSFW module
    // or the user's library.
    if (preserveNames.has(entry.name) && fs.existsSync(destinationChild)) {
      continue;
    }

    if (entry.isDirectory()) {
      if (fs.existsSync(destinationChild) && !fs.lstatSync(destinationChild).isDirectory()) {
        removePathIfExists(destinationChild);
      }

      const childPreserve =
        nestedPreserve && nestedPreserve[entry.name] instanceof Set
          ? { preserveNames: nestedPreserve[entry.name] }
          : {};
      syncDirectoryContents(sourceChild, destinationChild, childPreserve);
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

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquirePackagingLock() {
  fs.mkdirSync(path.dirname(packageLockPath), { recursive: true });
  const contents = JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }) + "\n";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let lockFd = null;

    try {
      lockFd = fs.openSync(packageLockPath, "wx");
      fs.writeSync(lockFd, contents, 0, "utf8");

      let released = false;
      return () => {
        if (released) {
          return;
        }

        released = true;
        try {
          fs.closeSync(lockFd);
        } catch {
          // The descriptor may already be closed during process shutdown.
        }
        try {
          fs.unlinkSync(packageLockPath);
        } catch (error) {
          if (error?.code !== "ENOENT") {
            console.warn(`Packaging lock could not be removed: ${formatError(error)}`);
          }
        }
      };
    } catch (error) {
      if (lockFd !== null) {
        try {
          fs.closeSync(lockFd);
        } catch {
          // Preserve the original lock error.
        }
      }

      if (error?.code !== "EEXIST" || attempt > 0) {
        throw error;
      }

      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
      } catch {
        // A partially written or unreadable lock is treated as active.
      }

      const holderPid = Number(holder?.pid);
      if (!isProcessAlive(holderPid)) {
        try {
          fs.unlinkSync(packageLockPath);
          continue;
        } catch (removeError) {
          throw new Error(
            `发现已失效的打包锁，但无法安全移除：${packageLockPath}。${formatError(removeError)}`,
          );
        }
      }

      const startedAt = typeof holder?.startedAt === "string" ? `（开始于 ${holder.startedAt}）` : "";
      throw new Error(
        `Windows 打包已在另一个进程中运行，已拒绝并发打包：PID ${holderPid}${startedAt}。请等待当前打包结束。`,
      );
    }
  }

  throw new Error(`Unable to acquire packaging lock: ${packageLockPath}`);
}

function resolvePackageJsonPath(packageName, resolvePaths = [projectRoot], requestedVersion = null) {
  try {
    return require.resolve(`${packageName}/package.json`, { paths: resolvePaths });
  } catch (primaryError) {
    // pnpm may have downloaded a platform-specific optional package into its
    // content-addressed store without creating a symlink on the current host.
    // Resolve that package directly so Windows sharp binaries are still copied.
    const pnpmRoot = path.join(projectRoot, "node_modules", ".pnpm");
    if (!fs.existsSync(pnpmRoot)) {
      throw primaryError;
    }

    const encodedName = packageName.replace(/\//g, "+");
    const prefix = `${encodedName}@`;
    const versionHint = requestedVersion ? String(requestedVersion).replace(/^[^0-9]*/, "") : "";
    const candidates = fs
      .readdirSync(pnpmRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
      .sort((left, right) => {
        const leftPreferred = versionHint && left.name.startsWith(`${prefix}${versionHint}`) ? 0 : 1;
        const rightPreferred = versionHint && right.name.startsWith(`${prefix}${versionHint}`) ? 0 : 1;
        return leftPreferred - rightPreferred || left.name.localeCompare(right.name);
      });

    for (const candidate of candidates) {
      const candidatePath = path.join(
        pnpmRoot,
        candidate.name,
        "node_modules",
        ...packageName.split("/"),
        "package.json",
      );
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    throw primaryError;
  }
}

function resolveBundledDependencyVersion(packageName, requestedVersion) {
  if (packageName === "sharp") {
    return sourcePackage.dependencies[packageName] ?? requestedVersion;
  }
  return requestedVersion;
}

function copyPackage(
  packageName,
  copiedPackages = new Set(),
  resolvePaths = [projectRoot],
  requestedVersion = null,
) {
  if (copiedPackages.has(packageName)) {
    return;
  }

  const packageJsonPath = resolvePackageJsonPath(
    packageName,
    resolvePaths,
    resolveBundledDependencyVersion(packageName, requestedVersion),
  );
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
      copyPackage(dependencyName, copiedPackages, [packageRoot, projectRoot], dependencies[dependencyName]);
    } catch (error) {
      if (!packageJson.optionalDependencies?.[dependencyName]) {
        throw error;
      }
    }
  }
}

function createStagePackage() {
  const brandedAuthor = resolveIntegrityAuthor(sourcePackage.author);
  if (!String(brandedAuthor).includes("素言")) {
    throw new Error(`Stage package author must include 素言, got: ${JSON.stringify(brandedAuthor)}`);
  }

  const appPackage = {
    name: sourcePackage.name,
    productName: sourcePackage.build.productName,
    version: sourcePackage.version,
    private: true,
    author: brandedAuthor,
    description: sourcePackage.description,
    main: sourcePackage.main,
    packageManager: sourcePackage.packageManager,
    dependencies: {
      jszip: sourcePackage.dependencies.jszip,
      "openid-client": sourcePackage.dependencies["openid-client"],
      // externalLibraryWatcher.ts 顶部裸 import chokidar，运行期 require("chokidar")
      // 必须能从 app.asar/node_modules 解析到；和 jszip 一样声明进 staged
      // package.json 的 dependencies，electron-builder 才会把它打进 asar，
      // 否则打包后主进程一启动就抛 Cannot find module 'chokidar'。
      chokidar: sourcePackage.dependencies.chokidar,
    },
  };

  if (appPackage.productName !== "素言") {
    throw new Error(`Stage package productName must be 素言, got: ${JSON.stringify(appPackage.productName)}`);
  }

  if (appPackage.name !== "suyan") {
    throw new Error(`Stage package name must be suyan, got: ${JSON.stringify(appPackage.name)}`);
  }

  fs.writeFileSync(
    path.join(stageDir, "package.json"),
    `${JSON.stringify(appPackage, null, 2)}\n`,
    "utf8",
  );
}

function assertStagedRuntimeIdentity(targetDir) {
  const packagePath = path.join(targetDir, "package.json");
  const manifestPath = path.join(targetDir, "app-integrity.json");

  if (!fs.existsSync(packagePath)) {
    throw new Error(`Missing staged package.json: ${packagePath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing staged app-integrity.json: ${manifestPath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const packageAuthor = resolveIntegrityAuthor(packageJson.author);
  const manifestAuthor = resolveIntegrityAuthor(manifest.author);

  if (packageJson.name !== "suyan") {
    throw new Error(`Staged package name must be suyan, got: ${JSON.stringify(packageJson.name)}`);
  }
  if (packageJson.productName !== "素言") {
    throw new Error(
      `Staged package productName must be 素言, got: ${JSON.stringify(packageJson.productName)}`,
    );
  }
  if (!String(packageAuthor).includes("素言")) {
    throw new Error(`Staged package author must include 素言, got: ${JSON.stringify(packageJson.author)}`);
  }
  if (manifest.productName !== "素言") {
    throw new Error(`Integrity manifest productName must be 素言, got: ${JSON.stringify(manifest.productName)}`);
  }
  if (manifest.packageName !== "suyan") {
    throw new Error(`Integrity manifest packageName must be suyan, got: ${JSON.stringify(manifest.packageName)}`);
  }
  if (manifest.appId !== "local.suyan") {
    throw new Error(`Integrity manifest appId must be local.suyan, got: ${JSON.stringify(manifest.appId)}`);
  }
  if (!String(manifestAuthor).includes("素言")) {
    throw new Error(`Integrity manifest author must include 素言, got: ${JSON.stringify(manifest.author)}`);
  }

  for (const [relativePath, expectedHash] of Object.entries(manifest.files || {})) {
    const absolutePath = path.join(targetDir, ...String(relativePath).split("/"));
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Integrity target missing after stage: ${relativePath}`);
    }
    const actualHash = sha256File(absolutePath);
    if (actualHash !== expectedHash) {
      throw new Error(`Integrity hash mismatch after stage: ${relativePath}`);
    }
  }
}

function createVendorPackage() {
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.writeFileSync(path.join(vendorDir, "package.cjs"), "module.exports = {};\n", "utf8");
  fs.writeFileSync(
    path.join(vendorDir, "package.json"),
    `${JSON.stringify({ private: true, dependencies: {
        jszip: sourcePackage.dependencies.jszip,
        sharp: sourcePackage.dependencies.sharp,
      } }, null, 2)}\n`,
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

function createInstallerThemeSvg(width, height, accent, secondary) {
  const lineGap = Math.max(18, Math.round(width / 8));
  const cardWidth = Math.max(42, Math.round(width * 0.48));
  const cardHeight = Math.max(28, Math.round(height * 0.19));
  const cardX = Math.round(width * 0.31);
  const cardY = Math.round(height * 0.35);
  const lines = Array.from({ length: Math.ceil(width / lineGap) + 1 }, (_, index) => {
    const x = index * lineGap;
    return `<path d="M ${x} 0 V ${height}" stroke="#ffffff" stroke-opacity="0.58" stroke-width="1"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f7f7f5"/>
    <rect x="0" y="0" width="${Math.round(width * 0.18)}" height="${height}" fill="${accent}"/>
    <rect x="${Math.round(width * 0.18)}" y="0" width="${Math.round(width * 0.06)}" height="${height}" fill="${secondary}" opacity="0.74"/>
    <g opacity="0.5">${lines}</g>
    <path d="M ${Math.round(width * 0.24)} ${Math.round(height * 0.24)} H ${Math.round(width * 0.86)}" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.52"/>
    <path d="M ${Math.round(width * 0.24)} ${Math.round(height * 0.3)} H ${Math.round(width * 0.64)}" stroke="${secondary}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="5" fill="#ffffff" stroke="${accent}" stroke-opacity="0.36"/>
    <rect x="${cardX + 10}" y="${cardY + 9}" width="${Math.max(14, Math.round(cardWidth * 0.22))}" height="${Math.max(10, Math.round(cardHeight * 0.32))}" rx="3" fill="${accent}" opacity="0.72"/>
    <path d="M ${cardX + Math.round(cardWidth * 0.36)} ${cardY + 13} H ${cardX + Math.round(cardWidth * 0.82)}" stroke="${secondary}" stroke-width="3" stroke-linecap="round" opacity="0.72"/>
    <path d="M ${cardX + Math.round(cardWidth * 0.36)} ${cardY + 22} H ${cardX + Math.round(cardWidth * 0.7)}" stroke="#d8d7d2" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${Math.round(width * 0.86)}" cy="${Math.round(height * 0.76)}" r="${Math.max(8, Math.round(Math.min(width, height) * 0.09))}" fill="${secondary}" opacity="0.28"/>
    <circle cx="${Math.round(width * 0.86)}" cy="${Math.round(height * 0.76)}" r="${Math.max(4, Math.round(Math.min(width, height) * 0.045))}" fill="${accent}" opacity="0.82"/>
  </svg>`;
}

function encodeBmp24(width, height, rgb) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const output = Buffer.alloc(54 + pixelBytes);

  output.write("BM", 0, "ascii");
  output.writeUInt32LE(output.length, 2);
  output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(width, 18);
  output.writeInt32LE(height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(24, 28);
  output.writeUInt32LE(0, 30);
  output.writeUInt32LE(pixelBytes, 34);
  output.writeInt32LE(2835, 38);
  output.writeInt32LE(2835, 42);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = height - y - 1;
    const sourceOffset = sourceRow * width * 3;
    const destinationOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const sourcePixel = sourceOffset + x * 3;
      const destinationPixel = destinationOffset + x * 3;
      output[destinationPixel] = rgb[sourcePixel + 2];
      output[destinationPixel + 1] = rgb[sourcePixel + 1];
      output[destinationPixel + 2] = rgb[sourcePixel];
    }
  }

  return output;
}

async function prepareInstallerThemeStage(options = {}) {
  const sourcePath = options.sourcePath || installerThemeSourcePath;
  const destinationDir = options.destinationDir || installerThemeStageDir;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing installer theme source: ${sourcePath}`);
  }

  fs.mkdirSync(destinationDir, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(destinationDir, "installer.nsh"));

  const sharp = require("sharp");
  const resources = [
    { filePath: path.join(destinationDir, path.basename(installerHeaderPath)), width: 150, height: 57, accent: "#ff6363", secondary: "#8d82ff" },
    { filePath: path.join(destinationDir, path.basename(installerSidebarPath)), width: 164, height: 314, accent: "#ff6363", secondary: "#8d82ff" },
    { filePath: path.join(destinationDir, path.basename(uninstallerSidebarPath)), width: 164, height: 314, accent: "#8d82ff", secondary: "#ff9b8d" },
  ];

  for (const resource of resources) {
    const { data, info } = await sharp(Buffer.from(createInstallerThemeSvg(
      resource.width,
      resource.height,
      resource.accent,
      resource.secondary,
    )))
      .resize(resource.width, resource.height)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.width !== resource.width || info.height !== resource.height || info.channels !== 3) {
      throw new Error(`Installer theme rasterization returned an unexpected shape for ${path.basename(resource.filePath)}.`);
    }
    fs.writeFileSync(resource.filePath, encodeBmp24(resource.width, resource.height, data));
  }

  return resources.map((resource) => resource.filePath);
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

function isFileLockError(error) {
  return /(?:EBUSY|EPERM|EACCES|resource busy|locked)/iu.test(formatError(error));
}

/**
 * 解析 release/win-unpacked/data/components 下已安装的 ffmpeg 可执行文件路径。
 * 按需组件（视频运行时）装在 userData/components，打包同步时若被误删，
 * 用户重装版本后视频压缩会凭空消失，必须在 promote 前后校验。
 */
function resolveInstalledFfmpegExe(winUnpackedDir) {
  const componentsDir = path.join(winUnpackedDir, "data", "components");
  const currentPath = path.join(componentsDir, "ffmpeg", "current.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(currentPath, "utf8"));
    if (typeof parsed.version !== "string" || typeof parsed.platform !== "string") {
      return null;
    }
    const exePath = path.join(componentsDir, "ffmpeg", parsed.version, parsed.platform, "ffmpeg.exe");
    return fs.existsSync(exePath) ? exePath : null;
  } catch {
    return null;
  }
}

function promoteStagedRelease(stagedDir, finalDir, options = {}) {
  assertInsideProject(stagedDir);
  assertInsideProject(finalDir);

  if (!fs.existsSync(stagedDir)) {
    throw new Error(`Staged package output does not exist: ${stagedDir}`);
  }

  // 打包前快照已安装的视频运行时；同步后校验仍在，防止任何环节静默吞掉组件。
  const winUnpackedDir = path.join(finalDir, "win-unpacked");
  const ffmpegExeBeforePromote = resolveInstalledFfmpegExe(winUnpackedDir);
  const unpackedOnly = options.unpackedOnly === true;

  // Windows 下 release 目录常被“素言.exe”占用，rename 会 EPERM。
  // 先关闭完整进程树，再确认所有句柄释放后同步；同步阶段若遇到瞬时锁，最多再探测一次。
  let stoppedLockedProcesses = false;
  try {
    stoppedLockedProcesses = options.stopLockedProcesses !== false
      ? tryStopLockedReleaseProcesses(finalDir)
      : false;
  } catch (unlockError) {
    throw new Error(
      `无法在打包前释放发布目录占用：${formatError(unlockError)}。暂存产物保留在 ${path.relative(projectRoot, stagedDir)}。`,
    );
  }

  let syncAttempt = 0;
  while (true) {
    try {
      // 开发快速包只更新 win-unpacked，避免重新生成或清理 release 根目录
      // 下已有的安装包和 Portable ZIP。两种模式都保留运行时 data/logs。
      if (unpackedOnly) {
        syncDirectoryContents(path.join(stagedDir, "win-unpacked"), winUnpackedDir, {
          preserveNames: new Set(["data", "logs"]),
        });
      } else {
        syncDirectoryContents(stagedDir, finalDir, {
          nestedPreserve: {
            "win-unpacked": new Set(["data", "logs"]),
          },
        });
      }
      break;
    } catch (syncError) {
      if (!isFileLockError(syncError) || syncAttempt > 0) {
        if (stoppedLockedProcesses) {
          restartPackagedApplication(finalDir);
        }
        throw new Error(
          `Failed to promote staged release to ${path.relative(projectRoot, finalDir)}. The existing release may still be locked by another process. Staged output remains at ${path.relative(projectRoot, stagedDir)}. Sync error: ${formatError(syncError)}`,
        );
      }

      syncAttempt += 1;
      console.warn(`Release promotion hit a transient file lock; probing release processes again (attempt ${syncAttempt}/1).`);
      try {
        stoppedLockedProcesses = tryStopLockedReleaseProcesses(finalDir) || stoppedLockedProcesses;
      } catch (unlockError) {
        throw new Error(
          `重试释放发布目录占用失败：${formatError(unlockError)}。暂存产物保留在 ${path.relative(projectRoot, stagedDir)}。`,
        );
      }
    }
  }

  try {
    removeDirectoryIfExists(stagedDir);
  } catch (cleanupError) {
    console.warn(
      `Packaged release was updated, but staged output could not be removed: ${path.relative(projectRoot, stagedDir)}. ${formatError(cleanupError)}`,
    );
  }

  const ffmpegExeAfterPromote = resolveInstalledFfmpegExe(winUnpackedDir);
  if (ffmpegExeBeforePromote && !ffmpegExeAfterPromote) {
    if (stoppedLockedProcesses) {
      restartPackagedApplication(finalDir);
    }
    throw new Error(
      `已安装的视频运行时（FFmpeg）在打包同步后丢失：${path.relative(
        projectRoot,
        ffmpegExeBeforePromote,
      )}。已中止，请检查 data/components 是否被误删。`,
    );
  }

  console.log(`Promoted staged package to ${path.relative(projectRoot, finalDir)} by syncing files.`);
  return { stoppedLockedProcesses };
}

function queryLockedReleaseProcesses(releaseDir) {
  if (process.platform !== "win32" || !fs.existsSync(releaseDir)) {
    return [];
  }

  const releaseRoot = path.resolve(releaseDir).toLowerCase().replace(/[\\/]+$/u, "") + path.sep;
  const escapedRoot = releaseRoot.replace(/'/g, "''");
  const { execFileSync } = require("node:child_process");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$root = '" + escapedRoot + "'",
    "$names = @('素言.exe', 'suyan.exe', 'suyan-core.exe')",
    "$procs = Get-CimInstance Win32_Process | Where-Object {",
    "  $name = [string]$_.Name",
    "  $exePath = ([string]$_.ExecutablePath).ToLower()",
    "  $commandLine = ([string]$_.CommandLine).ToLower()",
    "  $pathMatches = $exePath -and $exePath.StartsWith($root)",
    "  $commandMatches = $commandLine -and $commandLine.Contains($root)",
    "  ($names -contains $name) -and ($pathMatches -or $commandMatches)",
    "}",
    "$procs | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine | ConvertTo-Json -Compress",
  ].join("\n");

  const raw = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 8000,
  }).trim();

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function waitForLockedReleaseProcessesToExit(releaseDir, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let remaining = queryLockedReleaseProcesses(releaseDir);

  while (remaining.length > 0 && Date.now() < deadline) {
    sleepSync(250);
    remaining = queryLockedReleaseProcesses(releaseDir);
  }

  return remaining;
}

function forceStopReleaseProcessTree(pid) {
  const { execFileSync } = require("node:child_process");
  execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tryStopLockedReleaseProcesses(releaseDir) {
  if (process.platform !== "win32" || !fs.existsSync(releaseDir)) {
    return false;
  }

  let targets;
  try {
    targets = queryLockedReleaseProcesses(releaseDir);
  } catch (error) {
    throw new Error(`无法检测占用发布文件的进程：${formatError(error)}`);
  }

  if (targets.length === 0) {
    return false;
  }

  const targetPids = new Set(
    targets
      .map((target) => Number(target.ProcessId))
      .filter((pid) => Number.isFinite(pid) && pid > 0),
  );
  const roots = targets.filter((target) => !targetPids.has(Number(target.ParentProcessId)));
  const orderedTargets = [
    ...roots,
    ...targets.filter((target) => !roots.includes(target)),
  ];
  let stoppedCount = 0;

  for (const target of orderedTargets) {
    const pid = Number(target.ProcessId);
    if (!Number.isFinite(pid) || pid <= 0) {
      continue;
    }

    try {
      forceStopReleaseProcessTree(pid);
      stoppedCount += 1;
      console.warn(
        `Stopped locked release process tree before packaging: pid=${pid} name=${target.Name || "unknown"}`,
      );
    } catch (error) {
      console.warn(
        `Could not stop locked release process tree pid=${pid}: ${formatError(error)}`,
      );
    }
  }

  let remaining;
  try {
    remaining = waitForLockedReleaseProcessesToExit(releaseDir);
  } catch (error) {
    const probeError = new Error(`关闭发布进程后无法确认文件句柄是否释放：${formatError(error)}`);
    probeError.stoppedLockedProcesses = stoppedCount > 0;
    throw probeError;
  }

  if (remaining.length > 0) {
    const names = remaining
      .map((target) => `${target.Name || "unknown"}(pid=${target.ProcessId})`)
      .join(", ");
    const stopError = new Error(`以下进程仍占用发布文件，已停止打包：${names}`);
    stopError.stoppedLockedProcesses = stoppedCount > 0;
    throw stopError;
  }

  if (stoppedCount > 0) {
    // Windows may release the executable handle and Electron's single-instance
    // lock shortly after the process disappears from WMI. Give both a small
    // grace period before syncing and relaunching the packaged application.
    sleepSync(releaseProcessShutdownGraceMs);
  }

  return stoppedCount > 0;
}

function restartPackagedApplication(releaseDir) {
  if (process.platform !== "win32") {
    return false;
  }

  const executablePath = path.join(releaseDir, "win-unpacked", "素言.exe");
  if (!fs.existsSync(executablePath)) {
    console.warn(`Cannot restart packaged application; executable is missing: ${path.relative(projectRoot, executablePath)}`);
    return false;
  }

  try {
    const { spawn } = require("node:child_process");
    const child = spawn(executablePath, [], {
      cwd: path.dirname(executablePath),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    console.log(`Restarted packaged application: ${path.relative(projectRoot, executablePath)}.`);
    return true;
  } catch (error) {
    console.warn(`Packaged application could not be restarted: ${formatError(error)}`);
    return false;
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

/**
 * 在打包执行前确认用户数据目录安全。
 * 若 release/win-unpacked/data 存在，说明用户有开发状态数据，
 * 必须显式获得用户确认后才继续打包流程，避免静默覆盖或删除。
 * 可通过环境变量 SUYAN_PACKAGE_CONFIRMED=1 跳过交互确认（用于 CI/自动化）。
 */
function confirmDataDirectorySafety(winUnpackedDir) {
  const dataDir = path.join(winUnpackedDir, "data");
  if (!fs.existsSync(dataDir)) {
    return;
  }

  if (["1", "true", "yes"].includes(String(process.env.SUYAN_PACKAGE_CONFIRMED || "").trim().toLowerCase())) {
    console.log("Data directory exists, proceeding (SUYAN_PACKAGE_CONFIRMED=1).");
    return;
  }

  const relativeData = path.relative(projectRoot, dataDir);
  console.warn(`\n⚠ WARNING: Development data detected at ${relativeData}`);
  console.warn("  Packaging will preserve this directory, but the process may");
  console.warn("  still affect running instances or temporary files.");
  console.warn("  To skip this prompt, set SUYAN_PACKAGE_CONFIRMED=1.\n");

  const readline = require("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(
      `Continue packaging? Existing data at "${relativeData}" will be preserved. [Y/n] `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "" || trimmed === "y" || trimmed === "yes") {
          console.log("Proceeding with packaging (data directory preserved).");
          resolve(true);
        } else {
          console.error("Packaging cancelled by user: data directory requires confirmation.");
          resolve(false);
        }
      },
    );
  });
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

const defaultStartupAssetFileNames = [
  "startup-default-1.png",
  "startup-default-2.png",
  "startup-default-3.png",
  "startup-default-4.png",
  "startup-default-5.png",
  "startup-default-6.png",
];

const forbiddenPackagePayloadNames = new Set([
  "library.json",
  "ai-settings.json",
  "proxy-settings.json",
  "view-settings.json",
  "window-state.json",
  "acceleration-settings.json",
  "file-dialog-settings.json",
  ".default-library-seeded",
  ".startup-gallery-seeded",
  "manifest.json",
]);

const emptyShellExcludeGlobs = [
  "!**/ai-settings.json",
  "!**/proxy-settings.json",
  "!**/view-settings.json",
  "!**/window-state.json",
  "!**/acceleration-settings.json",
  "!**/file-dialog-settings.json",
  "!**/library.json",
  "!**/.default-library-seeded",
  "!**/.startup-gallery-seeded",
  "!**/logs/**",
  "!**/*.log",
  "!**/manifest.json",
  "!**/secrets/**",
  "!**/private/**",
  "!**/*.pem",
  "!**/*.key",
  "!**/*.p12",
  "!**/*.pfx",
  "!**/*.env",
  "!**/.env*",
];

function assertEmptyShellStartupAssets(startupAssetsDir) {
  if (!fs.existsSync(startupAssetsDir)) {
    throw new Error(`Missing packaged startup assets: ${startupAssetsDir}`);
  }

  const entries = fs.readdirSync(startupAssetsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const unexpectedDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const expected = [...defaultStartupAssetFileNames].sort();

  if (unexpectedDirs.length > 0) {
    throw new Error(`startup-assets contains unexpected directories: ${unexpectedDirs.join(", ")}`);
  }

  if (files.length !== expected.length || files.some((name, index) => name !== expected[index])) {
    throw new Error(
      `startup-assets must contain only default gallery images. expected=${expected.join(", ")} actual=${files.join(", ")}`,
    );
  }
}

function assertNoPersonalLibraryPayload(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, "/");
      const lowerName = entry.name.toLowerCase();

      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      // 只拦截运行时用户数据文件，不拦截源码目录 features/library。
      if (lowerName.endsWith(".log") || lowerName.endsWith(".tmp")) {
        throw new Error(`Refusing to package local runtime residue: ${relativePath}`);
      }
      if (forbiddenPackagePayloadNames.has(lowerName) || forbiddenPackagePayloadNames.has(entry.name)) {
        throw new Error(`Refusing to package personal library file: ${relativePath}`);
      }
    }
  }
}
function assertPackagedEmptyShell(winUnpackedDir) {
  const resourcesDir = path.join(winUnpackedDir, "resources");
  assertEmptyShellStartupAssets(path.join(resourcesDir, "startup-assets"));
  assertNoPersonalLibraryPayload(resourcesDir);

  // 安装包旁不得附带用户运行时目录/日志到错误位置，保持开箱空壳。
  // 注意：win-unpacked/data 是正式运行时数据目录，开发打包后应被保留，不在此处删除/报错。
  for (const name of ["library", "userData"]) {
    const candidate = path.join(winUnpackedDir, name);
    if (fs.existsSync(candidate)) {
      throw new Error(`Refusing non-empty package shell residue: ${path.relative(projectRoot, candidate)}`);
    }
  }
}
function prepareStartupAssetsStage() {
  const sourceDir = path.join(projectRoot, "electron", "assets", "startup-gallery");
  const destinationDir = path.join(stageDir, "startup-assets");

  resetDirectory(destinationDir);

  for (const fileName of defaultStartupAssetFileNames) {
    const sourcePath = path.join(sourceDir, fileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing default startup asset: ${sourcePath}`);
    }
    fs.copyFileSync(sourcePath, path.join(destinationDir, fileName));
  }

  assertEmptyShellStartupAssets(destinationDir);
}

function prepareRustCoreStage() {
  const sourcePath = path.join(projectRoot, "native", "suyan-core", "bin", "suyan-core.exe");
  const destinationDir = path.join(stageDir, "bin");
  const destinationPath = path.join(destinationDir, "suyan-core.exe");

  if (!fs.existsSync(sourcePath)) {
    throw new Error(
      "Required Rust Core binary is missing. Run pnpm build:rust-core before packaging.",
    );
  }

  fs.mkdirSync(destinationDir, { recursive: true });
  const header = Buffer.alloc(2);
  const descriptor = fs.openSync(sourcePath, "r");
  try {
    fs.readSync(descriptor, header, 0, 2, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (header[0] !== 0x4d || header[1] !== 0x5a) {
    throw new Error(`Invalid Windows Rust Core binary: ${sourcePath}`);
  }
  fs.copyFileSync(sourcePath, destinationPath);
  console.log("Packaged Rust Core: bin/suyan-core.exe");
  return true;
}

function assertSharpNativeFiles(libDir, context) {
  const entries = fs.existsSync(libDir) ? fs.readdirSync(libDir) : [];
  const required = [
    { label: "sharp native module", pattern: /^sharp-win32-x64(?:-[0-9.]+)?\.node$/u },
    { label: "libvips", pattern: /^libvips-42\.dll$/u },
    { label: "libvips C++ runtime", pattern: /^libvips-cpp(?:-[0-9.]+)?\.dll$/u },
  ];
  for (const item of required) {
    if (!entries.some((entry) => item.pattern.test(entry))) {
      throw new Error(`Missing ${item.label} ${context}: ${path.join(libDir, item.label)}`);
    }
  }
}

function assertVendorRuntimeDependencies() {
  const expectedPaths = [
    path.join(vendorNodeModulesDir, "sharp", "package.json"),
  ];

  for (const expectedPath of expectedPaths) {
    if (!fs.existsSync(expectedPath)) {
      throw new Error(`Missing packaged runtime dependency before electron-builder: ${path.relative(projectRoot, expectedPath)}`);
    }
  }
  assertSharpNativeFiles(path.join(vendorNodeModulesDir, "@img", "sharp-win32-x64", "lib"), "before electron-builder");

  // FFmpeg 按需安装：vendor 不得再夹带 ffmpeg-static 或任何 ffmpeg 二进制。
  const forbiddenVendorPaths = [
    path.join(vendorNodeModulesDir, "ffmpeg-static"),
    path.join(vendorNodeModulesDir, "ffmpeg-static", "ffmpeg.exe"),
    path.join(vendorDir, "ffmpeg.exe"),
    path.join(vendorNodeModulesDir, "@huggingface", "transformers"),
    path.join(vendorNodeModulesDir, "ml-kmeans"),
    path.join(vendorNodeModulesDir, "onnxruntime-node"),
  ];
  for (const forbiddenPath of forbiddenVendorPaths) {
    if (fs.existsSync(forbiddenPath)) {
      throw new Error(
        `Vendor must not ship FFmpeg (on-demand component only): ${path.relative(projectRoot, forbiddenPath)}`,
      );
    }
  }

  const vendorRequire = createRequire(path.join(vendorDir, "package.cjs"));
  for (const packageName of ["jszip", "sharp"]) {
    try {
      vendorRequire.resolve(packageName);
    } catch (error) {
      throw new Error(`Vendor runtime dependency cannot be resolved: ${packageName}. ${formatError(error)}`);
    }
  }

  try {
    const sharp = vendorRequire("sharp");
    if (typeof sharp !== "function") {
      throw new Error("sharp did not export a callable image processor");
    }
  } catch (error) {
    throw new Error(`Packaged sharp runtime failed to load: ${formatError(error)}`);
  }
}

function assertPackagedRuntimeDependencies(winUnpackedDir) {
  const resourcesDir = path.join(winUnpackedDir, "resources");
  const expectedPaths = [
    path.join(resourcesDir, "bin", "suyan-core.exe"),
    path.join(resourcesDir, "vendor", "node_modules", "sharp", "package.json"),
  ];

  for (const expectedPath of expectedPaths) {
    if (!fs.existsSync(expectedPath)) {
      throw new Error(`Packaged runtime dependency missing: ${path.relative(projectRoot, expectedPath)}`);
    }
  }
  assertSharpNativeFiles(path.join(resourcesDir, "vendor", "node_modules", "@img", "sharp-win32-x64", "lib"), "in packaged runtime");

  const forbiddenPaths = [
    path.join(resourcesDir, "vendor", "node_modules", "ffmpeg-static"),
    path.join(resourcesDir, "vendor", "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.join(resourcesDir, "vendor", "ffmpeg.exe"),
    path.join(resourcesDir, "vendor", "node_modules", "@huggingface", "transformers"),
    path.join(resourcesDir, "vendor", "node_modules", "ml-kmeans"),
    path.join(resourcesDir, "vendor", "node_modules", "onnxruntime-node"),
  ];
  for (const forbiddenPath of forbiddenPaths) {
    if (fs.existsSync(forbiddenPath)) {
      throw new Error(
        `Packaged app must not ship FFmpeg (on-demand component only): ${path.relative(projectRoot, forbiddenPath)}`,
      );
    }
  }

  const vendorRequire = createRequire(path.join(resourcesDir, "vendor", "package.cjs"));
  try {
    vendorRequire("sharp");
  } catch (error) {
    throw new Error(`Packaged sharp runtime cannot be loaded: ${formatError(error)}`);
  }
}

async function main() {
  if (releaseEdition && (!isPublishRelease || shouldPromoteDefaultRelease)) {
    throw new Error("分版本发布必须开启发布模式并指定独立输出目录，避免混入现有用户数据。");
  }
  if (releaseEdition && fs.existsSync(packageOutputDir) && fs.readdirSync(packageOutputDir).length > 0) {
    throw new Error("分版本发布必须使用新的空输出目录。");
  }
  resetDirectory(stageDir);

  if (shouldPromoteDefaultRelease) {
    cleanupReleaseBackups();
    resetDirectory(packageOutputDir);
  }

  copyDirectory(path.join(projectRoot, "dist"), path.join(stageDir, "dist"));
  copyDirectory(path.join(projectRoot, "dist-electron"), path.join(stageDir, "dist-electron"));
  let bundledLocalComponents = prepareDevelopmentInstalledComponents();
  const bundledGuliIdentityConfig = prepareGuliIdentityConfigStage();
  prepareStartupAssetsStage();
  const rustCoreAvailable = prepareRustCoreStage();
  assertNoPersonalLibraryPayload(path.join(stageDir, "dist"));
  assertNoPersonalLibraryPayload(path.join(stageDir, "dist-electron"));
  createStagePackage();
  const obfuscationSummary = obfuscateDirectory(path.join(stageDir, "dist-electron"));
  const removedStageMaps = removeStageSourceMaps(stageDir);
  // Signed third-party component files must remain byte-identical to their manifests.
  if (releaseEdition === "full") {
    bundledLocalComponents = await stageSignedReleaseComponents(projectRoot, stageDir, process.env.SUYAN_COMPONENT_RELEASE_DIR);
    await checkBundledComponentRuntime(projectRoot, stageDir);
  }
  const releaseComponentFiles = releaseEdition ? walkFiles(path.join(stageDir, "data/components")) : [];
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
  assertStagedRuntimeIdentity(stageDir);
  console.log("Verified staged runtime identity and integrity hashes.");
  createVendorPackage();
  copyPackage("jszip");
  copyPackage("sharp");
  assertVendorRuntimeDependencies();
  await createAppIcon();
  await prepareInstallerThemeStage();

  await build({
    projectDir: stageDir,
    publish: "never",
    targets: Platform.WINDOWS.createTarget(windowsTargets),
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
        ...emptyShellExcludeGlobs,
      ],
      directories: {
        output: packageOutputDir,
      },
      electronDist,
      electronLanguages: ["zh-CN", "en-US", "ja"],
      extraResources: [
        {
          from: "vendor",
          to: "vendor",
        },
        {
          from: "startup-assets",
          to: "startup-assets",
        },
        ...(bundledGuliIdentityConfig
          ? [
              {
                from: guliIdentityConfigFileName,
                to: guliIdentityConfigFileName,
              },
            ]
          : []),
        ...(rustCoreAvailable
          ? [
              {
                from: "bin",
                to: "bin",
              },
            ]
          : []),
      ],
      // 开发/本地迭代若已安装本地 AI 组件，复制到安装包根目录的
      // data\components，让安装后的程序可以直接复用；发布包由上面的开关保持按需下载。
      extraFiles: [
        ...(Array.isArray(sourcePackage.build.extraFiles) ? sourcePackage.build.extraFiles : []),
        ...bundledLocalComponents.map((componentId) => ({
          from: `data/components/${componentId}`,
          to: `data/components/${componentId}`,
        })),
      ],
      afterPack: async (context) => {
        copyVendorRuntimeResources(context);
        if (releaseEdition) assertCleanReleaseData(context.appOutDir, releaseEdition, releaseComponentFiles);
      },
      win: {
        ...sourcePackage.build.win,
        // 开发阶段只构建目录；发布阶段才生成 NSIS 安装包和 Portable ZIP。
        target: windowsTargets,
        icon: appIconPath,
        legalTrademarks: "素言 SuYan",
      },
      // 全局命名仅命中未单独配置 artifactName 的目标（此处即 zip）；nsis 用下方自己的命名，不受影响。
      artifactName: releaseArtifactName(releaseEdition),
      nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        perMachine: false,
        shortcutName: "素言",
        uninstallDisplayName: "素言",
        include: "build/installer.nsh",
        installerHeader: "build/installerHeader.bmp",
        installerSidebar: "build/installerSidebar.bmp",
        uninstallerSidebar: "build/uninstallerSidebar.bmp",
        installerLanguages: ["zh_CN"],
        multiLanguageInstaller: false,
        artifactName: releaseArtifactName(releaseEdition, true),
      },
    },
  });

  if (shouldPromoteDefaultRelease) {
    const dataConfirmed = await confirmDataDirectorySafety(requestedReleaseDir);
    if (dataConfirmed === false) {
      throw new Error("Packaging cancelled by user: existing development data was not approved for promotion.");
    }
    let promotionResult = null;
    try {
      promotionResult = promoteStagedRelease(packageOutputDir, requestedReleaseDir, {
        unpackedOnly: !isPublishRelease,
      });
      promoteBundledLocalComponents(requestedReleaseDir, bundledLocalComponents);
      cleanupReleaseBackups();
      syncPreviewReleaseMirror();
      assertPackagedRuntimeDependencies(path.join(requestedReleaseDir, "win-unpacked"));
      assertPackagedEmptyShell(path.join(requestedReleaseDir, "win-unpacked"));
    } finally {
      if (promotionResult?.stoppedLockedProcesses) {
        restartPackagedApplication(requestedReleaseDir);
      }
    }
  } else {
    assertPackagedRuntimeDependencies(path.join(packageOutputDir, "win-unpacked"));
    assertPackagedEmptyShell(path.join(packageOutputDir, "win-unpacked"));
  }
}

if (require.main === module) {
  let releasePackagingLock = null;
  try {
    releasePackagingLock = acquirePackagingLock();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }

  if (releasePackagingLock) {
    main()
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      })
      .finally(() => {
        releasePackagingLock();
      });
  }
}

module.exports = {
  promoteBundledLocalComponents,
  formatGuliIdentityConfigForPackage,
  parseGuliIdentityConfigForPackage,
  prepareGuliIdentityConfigStage,
  acquirePackagingLock,
  promoteStagedRelease,
  restartPackagedApplication,
  resolveWindowsTargets,
  prepareInstallerThemeStage,
  syncPreviewReleaseMirror,
  syncDirectoryContents,
};
