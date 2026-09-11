// Build both clean editions in isolated directories; never promote release artifacts over user data.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { releaseArtifactName } = require("./release-editions.cjs");
const { verifyReleaseEdition } = require("./verify-release-editions.cjs");
const projectRoot = path.resolve(__dirname, "..");

async function fileHash(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("此脚本需要 Windows x64 构建环境。");
  const sourceDir = process.env.SUYAN_COMPONENT_RELEASE_DIR;
  if (!sourceDir || !fs.existsSync(sourceDir)) throw new Error("请通过 SUYAN_COMPONENT_RELEASE_DIR 指定签名组件备份目录。");
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  // Collect an explicitly selected completed build after re-verifying both editions.
  // This mode never rebuilds or mutates an existing build directory's app payload.
  const collectDir = process.argv[2] === "--collect" && process.argv[3] ? path.resolve(process.argv[3]) : null;
  if (collectDir && !collectDir.startsWith(path.join(projectRoot, "release-next") + path.sep)) {
    throw new Error("仅允许收集 release-next 内的构建目录。");
  }
  const buildDir = collectDir || fs.mkdtempSync(path.join(projectRoot, "release-next", `editions-${stamp}-`));
  const deliveryDir = path.join(projectRoot, "release", `素言-v${pkg.version}-四版本-${stamp}`);
  if (fs.existsSync(deliveryDir)) throw new Error("交付目录已存在，请勿覆盖已有发布产物。");
  const artifacts = [];
  const verification = [];
  for (const edition of ["lite", "full"]) {
    const outputDir = path.join(buildDir, edition);
    if (!collectDir) {
      console.log(`\nBuilding clean ${edition} edition: ${outputDir}`);
      const result = spawnSync("pnpm.cmd", ["package:win:release"], {
        cwd: projectRoot, shell: true, stdio: "inherit",
        env: { ...process.env, SUYAN_PACKAGE_CONFIRMED: "1", SUYAN_RELEASE_EDITION: edition,
          SUYAN_COMPONENT_RELEASE_DIR: path.resolve(sourceDir),
          PROMPT_PACKAGE_OUTPUT_DIR: path.relative(projectRoot, outputDir) },
      });
      if (result.error || result.status !== 0) throw result.error || new Error(`${edition} 版本打包失败：${result.status}`);
    }
    verification.push(...await verifyReleaseEdition(projectRoot, outputDir, edition));
    for (const installer of [false, true]) {
      const name = releaseArtifactName(edition, installer).replace("${productName}", pkg.build.productName)
        .replace("${version}", pkg.version).replace("${arch}", "x64").replace("${ext}", installer ? "exe" : "zip");
      const file = path.join(outputDir, name);
      if (!fs.existsSync(file)) throw new Error(`缺少产物：${name}`);
      artifacts.push({ name, file, bytes: fs.statSync(file).size, sha256: await fileHash(file) });
    }
  }
  fs.mkdirSync(deliveryDir);
  for (const artifact of artifacts) fs.copyFileSync(artifact.file, path.join(deliveryDir, artifact.name));
  fs.writeFileSync(path.join(deliveryDir, "SHA256SUMS.txt"), artifacts.map((a) => `${a.sha256}  ${a.name}`).join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(deliveryDir, "verification.json"), JSON.stringify(verification, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(deliveryDir, "版本说明.txt"), [
    `素言 v${pkg.version} / Windows x64 / ${new Date().toLocaleString("zh-CN")}`,
    "", "四个包均不携带作者的素材、账号、API 密钥、设置或日志。",
    "便携版：解压到可写目录后运行 素言.exe。安装版：运行 exe，按向导选择安装位置。",
    "无依赖版：保留 Electron、Sharp、Rust Core 等软件必需运行组件；不包含 FFmpeg 和 NSFW 可选组件，可在软件中按需安装。",
    "完整依赖版：包含已验签的 FFmpeg 6.0-suyan.1、NSFW 1.0.0 模型、ONNX Runtime 1.27.0，可离线使用本地媒体处理与 NSFW 识别。",
    "完整依赖位于 data/components；该目录是公共运行组件，并非个人数据。",
    "AI 在线生成及账号登录仍需联网，完整依赖版不包含在线生图模型或 API 额度。",
    "首次使用会创建本地 data 和 logs。升级到原软件目录会保留用户原有数据；无数据不表示清除旧安装数据。",
    "", ...artifacts.map((a) => `${a.name}  ${(a.bytes / 1024 / 1024).toFixed(1)} MiB`),
    "", "SHA256SUMS.txt 用于校验下载是否完整。", "",
  ].join("\r\n"), "utf8");
  console.log(JSON.stringify({ deliveryDir, buildDir, artifacts }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
