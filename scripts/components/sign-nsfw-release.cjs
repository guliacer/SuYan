#!/usr/bin/env node
// 生成本地 NSFW 模块的 Release 资产。
// 产物与 electron/main/modules/nsfwModuleInstaller.ts 的在线安装流程对应：
//   manifest.json              被 Ed25519 签名的清单
//   manifest.json.sig          清单签名
//   nsfw-runtime-win32-x64.zip 模型 + onnxruntime-node 运行时
// 私钥只在发布机使用，禁止放入项目或正式安装包。
//
// 用法：
//   node scripts/components/sign-nsfw-release.cjs sign --root <module-root> --key <private.pem>
//     [--version 1.0.0] [--out release-components/nsfw-1.0.0]

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const COMPONENT_ID = "nsfw-runtime";
const PLATFORM = "win32-x64";
const DEFAULT_VERSION = "1.0.0";
const ARCHIVE_NAME = "nsfw-runtime-win32-x64.zip";
const MANIFEST_NAME = "manifest.json";
const SIGNATURE_NAME = "manifest.json.sig";
const MODEL_PATH = "model/nsfw.onnx";
const MODEL_SHA256 = "31814e03017dd076f7ca938bf7c190ce6ed86fc3b811d250d3aff076dc30efa4";
const MODEL_SIZE = 6_213_534;
const RUNTIME_PACKAGE = "onnxruntime-node";
const RUNTIME_VERSION = "1.27.0";

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function collectFiles(rootDir) {
  const files = [];
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`模块目录不允许包含符号链接：${fullPath}`);
      }
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, "/");
      if (!relativePath || relativePath === "module.json") continue;
      files.push({ name: relativePath, content: fs.readFileSync(fullPath) });
    }
  };
  visit(rootDir);
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

async function buildZip(entries) {
  const JSZip = require("jszip");
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.content);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function readAndValidatePackage(rootDir) {
  const packagePath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packagePath)) {
    throw new Error(`模块目录缺少 package.json：${packagePath}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (packageJson.dependencies?.[RUNTIME_PACKAGE] !== RUNTIME_VERSION) {
    throw new Error(`package.json 必须声明 ${RUNTIME_PACKAGE}@${RUNTIME_VERSION}`);
  }
}

async function signNsfw(options) {
  const rootDir = path.resolve(String(options.root || ""));
  const privateKeyPath = path.resolve(String(options.key || ""));
  const version = typeof options.version === "string" && options.version ? options.version : DEFAULT_VERSION;
  const outDir = path.resolve(
    typeof options.out === "string" && options.out ? options.out : path.join(process.cwd(), "release-components", `nsfw-${version}`),
  );

  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`--root 路径无效：${rootDir}`);
  }
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`--key 私钥路径无效：${privateKeyPath}`);
  }

  readAndValidatePackage(rootDir);
  const modelPath = path.join(rootDir, MODEL_PATH.replace(/\//g, path.sep));
  if (!fs.existsSync(modelPath)) {
    throw new Error(`模块目录缺少模型：${modelPath}`);
  }
  const model = fs.readFileSync(modelPath);
  if (model.length !== MODEL_SIZE || sha256Hex(model) !== MODEL_SHA256) {
    throw new Error("NSFW 模型大小或 SHA-256 与客户端内置值不匹配");
  }

  const descriptor = Buffer.from(
    JSON.stringify({
      moduleId: COMPONENT_ID,
      version,
      platform: PLATFORM,
      model: { path: MODEL_PATH, sha256: MODEL_SHA256, size: MODEL_SIZE },
      runtime: { package: RUNTIME_PACKAGE, version: RUNTIME_VERSION },
    }),
    "utf8",
  );
  const files = collectFiles(rootDir);
  files.push({ name: "module.json", content: descriptor });
  const zipBuffer = await buildZip(files);
  const manifest = {
    componentId: COMPONENT_ID,
    version,
    platform: PLATFORM,
    archive: { name: ARCHIVE_NAME, sha256: sha256Hex(zipBuffer), size: zipBuffer.length },
    files: files.map((file) => ({ name: file.name, sha256: sha256Hex(file.content), size: file.content.length })),
    createdAt: new Date().toISOString(),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath, "utf8"));
  const signature = crypto.sign(null, manifestBytes, privateKey);

  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, ARCHIVE_NAME);
  const manifestPath = path.join(outDir, MANIFEST_NAME);
  const signaturePath = path.join(outDir, SIGNATURE_NAME);
  fs.writeFileSync(zipPath, zipBuffer);
  fs.writeFileSync(manifestPath, manifestBytes);
  fs.writeFileSync(signaturePath, signature);
  return { zipPath, manifestPath, signaturePath, manifest };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "sign") {
    const result = await signNsfw(args);
    console.log("已产出并签名 NSFW 模块：");
    console.log(`  ${result.zipPath}`);
    console.log(`  ${result.manifestPath}`);
    console.log(`  ${result.signaturePath}`);
    console.log(`\n上传到固定 Release：https://github.com/<owner>/suyan-components/releases/download/nsfw-${result.manifest.version}/`);
    return;
  }
  console.error("用法：sign --root <module-root> --key <private.pem> [--version 1.0.0] [--out <dir>]");
  process.exitCode = 1;
}

module.exports = { signNsfw, sha256Hex, buildZip };

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
