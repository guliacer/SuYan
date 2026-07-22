const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeIntegrityManifest(stageDir, sourcePackage) {
  const filesToHash = [
    "package.json",
    "dist-electron/electron/main/index.js",
    "dist-electron/electron/preload/index.js",
    "dist/index.html",
  ];

  const assetsDir = path.join(stageDir, "dist", "assets");
  if (fs.existsSync(assetsDir)) {
    const indexBundle = fs
      .readdirSync(assetsDir)
      .filter((name) => /^index-.*\.js$/i.test(name))
      .sort()[0];
    if (indexBundle) {
      filesToHash.push("dist/assets/" + indexBundle);
    }
  }

  const files = {};
  for (const relativePath of filesToHash) {
    const absolutePath = path.join(stageDir, ...relativePath.split("/"));
    if (!fs.existsSync(absolutePath)) {
      throw new Error("Integrity target missing: " + relativePath);
    }
    files[relativePath.replace(/\\/g, "/")] = sha256File(absolutePath);
  }

  const manifest = {
    productName: (sourcePackage.build && sourcePackage.build.productName) || "素言",
    packageName: sourcePackage.name,
    appId: (sourcePackage.build && sourcePackage.build.appId) || "local.suyan",
    author: sourcePackage.author || "素言 SuYan",
    generatedAt: new Date().toISOString(),
    files,
  };

  const manifestPath = path.join(stageDir, "app-integrity.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { manifestPath, fileCount: Object.keys(files).length };
}

module.exports = {
  writeIntegrityManifest,
  sha256File,
};
