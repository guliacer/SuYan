const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(projectRoot, process.env.PROMPT_PACKAGE_OUTPUT_DIR || "release", "win-unpacked");
const resourcesDir = path.join(releaseRoot, "resources");
const startupAssetsDir = path.join(resourcesDir, "startup-assets");

const defaultStartupAssetFileNames = [
  "startup-default-1.png",
  "startup-default-2.png",
  "startup-default-3.png",
  "startup-default-4.png",
  "startup-default-5.png",
  "startup-default-6.png",
];

const forbiddenNames = new Set([
  "library.json",
  "ai-settings.json",
  "proxy-settings.json",
  "view-settings.json",
  "window-state.json",
  "acceleration-settings.json",
  ".default-library-seeded",
  ".startup-gallery-seeded",
  "manifest.json",
]);

function fail(message) {
  console.error("Empty-shell check failed:", message);
  process.exit(1);
}

if (!fs.existsSync(releaseRoot)) {
  fail("missing release win-unpacked: " + releaseRoot);
}

const startupEntries = fs.readdirSync(startupAssetsDir, { withFileTypes: true });
const startupFiles = startupEntries.filter((e) => e.isFile()).map((e) => e.name).sort();
const expected = [...defaultStartupAssetFileNames].sort();
if (startupEntries.some((e) => e.isDirectory())) {
  fail("startup-assets contains directories");
}
if (startupFiles.length !== expected.length || startupFiles.some((name, i) => name !== expected[i])) {
  fail("startup-assets mismatch: " + startupFiles.join(", "));
}

for (const name of ["library", "logs", "userData"]) {
  if (fs.existsSync(path.join(releaseRoot, name))) {
    fail("unexpected runtime residue folder: " + name);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (forbiddenNames.has(lower) || forbiddenNames.has(entry.name) || lower.endsWith(".log") || lower.endsWith(".tmp")) {
      fail("forbidden packaged file: " + path.relative(projectRoot, full));
    }
  }
}

walk(resourcesDir);
console.log("Empty-shell check passed:", path.relative(projectRoot, releaseRoot));
