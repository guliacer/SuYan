const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { assertCleanReleaseData, walkFiles, checkBundledComponentRuntime } = require("./release-editions.cjs");

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyReleaseEdition(projectRoot, outputDir, edition) {
  const builderRequire = createRequire(require.resolve("electron-builder"));
  const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib"));
  const asar = appBuilderRequire("@electron/asar");
  const { getPath7za } = appBuilderRequire("app-builder-lib/out/toolsets/7zip.js");
  const sevenZip = await getPath7za();
  const source = path.join(outputDir, "win-unpacked");
  const componentFiles = walkFiles(path.join(source, "data/components"));
  assertCleanReleaseData(source, edition, componentFiles);
  const hashes = new Map();
  for (const file of walkFiles(source)) hashes.set(file, await sha256(path.join(source, file)));
  const archives = fs.readdirSync(outputDir).filter((file) => /\.(exe|zip)$/i.test(file));
  if (archives.length !== 2) throw new Error("应有且只有两个发布产物：" + edition);
  const reports = [];
  for (const name of archives) {
    console.log("Verifying archive contents: " + name);
    const destination = fs.mkdtempSync(path.join(outputDir, "verify-"));
    const extract = (file, target) => execFileSync(sevenZip, ["x", "-y", "-sccUTF-8", "-o" + target, file],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    extract(path.join(outputDir, name), destination);
    let appRoot = destination;
    if (!fs.existsSync(path.join(appRoot, "resources/app.asar"))) {
      const inner = walkFiles(destination).find((file) => /(?:^|\/)app-64\.7z$/i.test(file));
      if (!inner) throw new Error("安装包中找不到应用：" + name);
      appRoot = fs.mkdtempSync(path.join(outputDir, "verify-app-"));
      extract(path.join(destination, inner), appRoot);
    }
    assertCleanReleaseData(appRoot, edition, componentFiles);
    let checkedFiles = 0;
    for (const [file, hash] of hashes) {
      // electron-builder adds the NSIS elevation helper after creating the ZIP.
      if (name.endsWith(".zip") && file === "resources/elevate.exe" && !fs.existsSync(path.join(appRoot, file))) continue;
      if (await sha256(path.join(appRoot, file)) !== hash) throw new Error("归档文件与构建不一致：" + name + " / " + file);
      checkedFiles += 1;
    }
    const asarPath = path.join(appRoot, "resources/app.asar");
    const entries = asar.listPackage(asarPath).map((file) => file.replace(/\\/g, "/"));
    const forbidden = /(?:^|\/)(?:library\.json|account\.json|session\.json|ai-settings\.json|proxy-settings\.json|view-settings\.json|window-state\.json|file-dialog-settings\.json|Cookies|Login Data|Local State|private|secrets|\.secrets)(?:\/|$)/iu;
    if (entries.some((file) => forbidden.test(file))) throw new Error("ASAR 含私人文件：" + name);
    if (entries.some((file) => /^\/(?:dist|dist-electron)\/.+\.map$/i.test(file))) throw new Error("ASAR 含应用 source map：" + name);
    const pkg = JSON.parse(asar.extractFile(asarPath, "package.json").toString("utf8"));
    const expectedVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version;
    if (pkg.version !== expectedVersion) throw new Error("归档版本不正确：" + name);
    const integrity = JSON.parse(asar.extractFile(asarPath, "app-integrity.json").toString("utf8"));
    for (const [file, expected] of Object.entries(integrity.files)) {
      const actual = crypto.createHash("sha256").update(asar.extractFile(asarPath, path.normalize(file))).digest("hex");
      if (actual !== expected) throw new Error("ASAR 完整性失败：" + file);
    }
    if (edition === "full") await checkBundledComponentRuntime(projectRoot, appRoot);
    const report = { name, edition, version: pkg.version, checkedFiles,
      componentFiles: componentFiles.length, sha256: await sha256(path.join(outputDir, name)),
      noPersonalData: true, archiveFilesMatchBuild: true, asarIntegrity: true,
      offlineComponentRuntime: edition === "full" ? "passed" : "not-bundled" };
    reports.push(report);
    console.log(JSON.stringify(report));
  }
  return reports;
}

module.exports = { verifyReleaseEdition };
if (require.main === module) {
  verifyReleaseEdition(path.resolve(__dirname, ".."), path.resolve(process.argv[2]), process.argv[3])
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
