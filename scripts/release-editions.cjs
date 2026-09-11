// Clean release editions: only signed optional components may seed data/components.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

function resolveReleaseEdition(value) {
  const edition = String(value || "").trim().toLowerCase();
  if (!["", "lite", "full"].includes(edition)) throw new Error(`未知发布版本：${edition}`);
  return edition;
}

function releaseArtifactName(edition, installer = false) {
  edition = resolveReleaseEdition(edition);
  if (!edition) {
    return installer ? "${productName}-Setup-${version}.${ext}" : "${productName}-Portable-${version}.${ext}";
  }
  return `\${productName}-v\${version}-${installer ? "安装版" : "便携版"}-${edition === "full" ? "完整依赖" : "无依赖"}.\${ext}`;
}

function componentDefinitions(config) {
  return [
    { id: config.FFMPEG_COMPONENT_ID, version: config.FFMPEG_COMPONENT_VERSION,
      folder: config.FFMPEG_COMPONENT_VERSION, limits: config.DEFAULT_COMPONENT_LIMITS },
    { id: config.NSFW_COMPONENT_ID, version: config.NSFW_COMPONENT_VERSION,
      folder: `nsfw-${config.NSFW_COMPONENT_VERSION}-signed`, limits: config.NSFW_COMPONENT_LIMITS },
  ];
}

function loadComponentTools(projectRoot) {
  const moduleRoot = path.join(projectRoot, "dist-electron/electron/main/modules");
  return {
    config: require(path.join(moduleRoot, "componentConfig.js")),
    security: require(path.join(moduleRoot, "componentSecurity.js")),
  };
}

async function stageSignedReleaseComponents(projectRoot, stageDir, sourceDir) {
  if (!sourceDir) throw new Error("完整依赖版需要 SUYAN_COMPONENT_RELEASE_DIR 指向签名组件备份目录。");
  const { config, security } = loadComponentTools(projectRoot);
  const JSZip = require("jszip");
  const bundled = [];
  for (const definition of componentDefinitions(config)) {
    const source = path.resolve(sourceDir, definition.folder);
    const raw = fs.readFileSync(path.join(source, "manifest.json"));
    const signature = fs.readFileSync(path.join(source, "manifest.json.sig"));
    if (!security.verifyEd25519Signature(raw, signature, config.COMPONENT_SIGNING_PUBLIC_KEY_PEM)) {
      throw new Error(`组件签名验证失败：${definition.id}`);
    }
    const manifest = security.parseComponentManifest(raw);
    if (manifest.componentId !== definition.id || manifest.version !== definition.version ||
        manifest.platform !== config.CURRENT_COMPONENT_PLATFORM) {
      throw new Error(`组件版本或平台不匹配：${definition.id}`);
    }
    const archive = fs.readFileSync(path.join(source, security.assertSafeRelativePath(manifest.archive.name)));
    if (archive.length !== manifest.archive.size || !security.verifySha256(archive, manifest.archive.sha256)) {
      throw new Error(`组件压缩包校验失败：${definition.id}`);
    }
    const componentRoot = path.join(stageDir, "data/components", definition.id);
    const destination = path.join(componentRoot, definition.version, manifest.platform);
    if (fs.existsSync(componentRoot)) throw new Error(`组件暂存目录必须为空：${definition.id}`);
    const extracted = await security.safeExtractZip(archive, destination, definition.limits, (buffer) => JSZip.loadAsync(buffer));
    const expected = new Set(manifest.files.map((entry) => security.assertSafeRelativePath(entry.name)));
    if (extracted.files.length !== expected.size || extracted.files.some((entry) => !expected.has(entry))) {
      throw new Error(`组件含未签名文件或缺少文件：${definition.id}`);
    }
    await security.verifyExtractedFiles(destination, manifest.files);
    fs.writeFileSync(path.join(componentRoot, "current.json"), JSON.stringify({
      version: definition.version, platform: manifest.platform,
    }, null, 2) + "\n", "utf8");
    bundled.push(definition.id);
    console.log(`Verified signed release component: ${definition.id}@${definition.version} (${expected.size} files).`);
  }
  return bundled;
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`发布包不允许符号链接：${file}`);
      if (entry.isDirectory()) visit(file);
      else files.push(path.relative(root, file).replace(/\\/g, "/"));
    }
  }
  visit(root);
  return files.sort();
}

function assertCleanReleaseData(root, edition, allowedComponentFiles = []) {
  if (!["lite", "full"].includes(edition)) throw new Error("清洁包校验必须指定 lite 或 full。");
  const allowed = new Set(allowedComponentFiles.map((file) => `data/components/${file}`));
  const files = walkFiles(root);
  for (const file of files) {
    if (/^(?:logs|library|userData|private|secrets)\//iu.test(file) ||
        /(?:^|\/)(?:library|account|session|ai-settings|proxy-settings|view-settings|window-state|file-dialog-settings)\.json$/iu.test(file) ||
        /(?:^|\/)(?:Cookies|Login Data|Local State)$/iu.test(file)) {
      throw new Error(`发布包包含用户数据：${file}`);
    }
    if (/^data\//iu.test(file) && (edition !== "full" || !allowed.has(file))) {
      throw new Error(`发布包包含非白名单数据：${file}`);
    }
  }
  if (edition === "lite" && fs.existsSync(path.join(root, "data"))) throw new Error("无依赖版不应包含 data 目录。");
  if (edition === "full") {
    if (allowed.size === 0) throw new Error("完整依赖版缺少组件白名单。");
    const actual = new Set(files);
    for (const file of allowed) if (!actual.has(file)) throw new Error(`完整依赖版缺少组件：${file}`);
  }
}

async function checkBundledComponentRuntime(projectRoot, root) {
  const { config, security } = loadComponentTools(projectRoot);
  const components = path.join(root, "data/components");
  const ffmpeg = path.join(components, config.FFMPEG_COMPONENT_ID, config.FFMPEG_COMPONENT_VERSION,
    config.CURRENT_COMPONENT_PLATFORM, "ffmpeg.exe");
  if (!await security.selfCheckFfmpeg(ffmpeg)) throw new Error("完整依赖版 FFmpeg 自检失败。");
  const nsfw = path.join(components, config.NSFW_COMPONENT_ID, config.NSFW_COMPONENT_VERSION, config.CURRENT_COMPONENT_PLATFORM);
  const runtimeRequire = createRequire(path.join(nsfw, "package.json"));
  const ort = runtimeRequire("onnxruntime-node");
  const session = await ort.InferenceSession.create(path.join(nsfw, "model/nsfw.onnx"), { executionProviders: ["cpu"] });
  try {
    const result = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", new Float32Array(384 * 384 * 3), [1, 3, 384, 384]) });
    const values = result[session.outputNames[0]].data;
    if (values.length !== 2 || !Array.from(values).every(Number.isFinite)) throw new Error("NSFW 推理输出异常。");
  } finally {
    await session.release();
  }
  console.log("Offline component checks passed: FFmpeg execution + NSFW ONNX CPU inference.");
}

module.exports = { resolveReleaseEdition, releaseArtifactName, stageSignedReleaseComponents,
  assertCleanReleaseData, walkFiles, checkBundledComponentRuntime };
