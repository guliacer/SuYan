const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EXPECTED_AUTHOR_FRAGMENT = "素言";
const DEFAULT_AUTHOR = "素言 SuYan";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizeAuthorText(author) {
  if (author == null) {
    return "";
  }

  if (typeof author === "string") {
    return author.trim();
  }

  if (typeof author === "object") {
    const parts = [author.name, author.email, author.url]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    return parts.join(" ");
  }

  return String(author).trim();
}

function resolveIntegrityAuthor(author) {
  const text = normalizeAuthorText(author);
  if (text.includes(EXPECTED_AUTHOR_FRAGMENT)) {
    return text;
  }
  if (!text) {
    return DEFAULT_AUTHOR;
  }
  return `${text} / ${DEFAULT_AUTHOR}`;
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

  const author = resolveIntegrityAuthor(sourcePackage.author);
  if (!String(author).includes(EXPECTED_AUTHOR_FRAGMENT)) {
    throw new Error("Integrity author must include " + EXPECTED_AUTHOR_FRAGMENT + ", got: " + JSON.stringify(author));
  }

  const manifest = {
    productName: (sourcePackage.build && sourcePackage.build.productName) || "素言",
    packageName: sourcePackage.name,
    appId: (sourcePackage.build && sourcePackage.build.appId) || "local.suyan",
    author,
    generatedAt: new Date().toISOString(),
    files,
  };

  if (manifest.productName !== "素言") {
    throw new Error("Integrity productName must be 素言, got: " + JSON.stringify(manifest.productName));
  }
  if (manifest.packageName !== "suyan") {
    throw new Error("Integrity packageName must be suyan, got: " + JSON.stringify(manifest.packageName));
  }
  if (manifest.appId !== "local.suyan") {
    throw new Error("Integrity appId must be local.suyan, got: " + JSON.stringify(manifest.appId));
  }

  const manifestPath = path.join(stageDir, "app-integrity.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { manifestPath, fileCount: Object.keys(files).length, author: manifest.author };
}

module.exports = {
  writeIntegrityManifest,
  sha256File,
  normalizeAuthorText,
  resolveIntegrityAuthor,
  EXPECTED_AUTHOR_FRAGMENT,
  DEFAULT_AUTHOR,
};
