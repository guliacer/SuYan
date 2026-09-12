const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(projectRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const args = process.argv.slice(2);
const remoteCheck = args.includes("--remote");
const versionIndex = args.indexOf("--version");
const requestedVersion = versionIndex >= 0 ? args[versionIndex + 1] : packageJson.version;

if (!requestedVersion || requestedVersion.startsWith("-")) {
  throw new Error("Usage: node scripts/check-release-notes.cjs [--remote] [--version 0.3.6]");
}

const tagName = requestedVersion.startsWith("v") ? requestedVersion : `v${requestedVersion}`;
const notesPath = path.join(projectRoot, "docs", "releases", `${tagName}.md`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function validateNotes(text, label) {
  const source = normalize(text);
  const escapedTag = escapeRegExp(tagName);
  const checks = [
    [`## 素言 ${tagName}`, new RegExp(`^##\\s+素言\\s+${escapedTag}\\s*$`, "m")],
    [`## SuYan ${tagName}`, new RegExp(`^##\\s+SuYan\\s+${escapedTag}\\s*$`, "mi")],
    ["### 主要更新", /^###\s+主要更新\s*$/m],
    ["### 下载说明", /^###\s+下载说明\s*$/m],
    ["### 升级提醒", /^###\s+升级提醒\s*$/m],
    ["English description toggle", /<summary>\s*<strong>English description<\/strong>\s*<\/summary>/i],
    ["### Highlights", /^###\s+Highlights\s*$/m],
    ["### Downloads", /^###\s+Downloads\s*$/m],
    ["### Upgrade notes", /^###\s+Upgrade notes\s*$/m],
    ["closing details tag", /<\/details>/i],
  ];
  const errors = checks.filter(([, pattern]) => !pattern.test(source)).map(([name]) => `${label}: missing ${name}`);

  if (!/^\s*<details>\s*/i.test(source)) errors.push(`${label}: English description must be the first visible release section`);
  if (/^\s*\[/.test(source)) errors.push(`${label}: release notes look like a serialized JSON array`);
  if (/\\`/.test(source)) errors.push(`${label}: release notes contain escaped Markdown backticks`);
  if (/(?:TODO|TBD|待补充|待填写)/i.test(source)) errors.push(`${label}: release notes contain a placeholder`);

  const detailsStart = source.indexOf("<details>");
  const detailsEnd = source.toLowerCase().lastIndexOf("</details>");
  if (detailsStart < 0 || detailsEnd <= detailsStart) {
    errors.push(`${label}: English description details block is incomplete`);
  } else if (source.slice(detailsStart, detailsEnd).trim().length < 200) {
    errors.push(`${label}: English description is unexpectedly short`);
  }

  return errors;
}

function readReleaseNotes() {
  if (!fs.existsSync(notesPath)) {
    throw new Error(`Missing release notes source: ${path.relative(projectRoot, notesPath)}`);
  }
  return fs.readFileSync(notesPath, "utf8");
}

function resolveGitHubRepository() {
  const repositoryUrl = typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url;
  const match = String(repositoryUrl || "").match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (!match) throw new Error("Cannot resolve GitHub repository from package.json.repository");
  return `${match[1]}/${match[2]}`;
}

function readRemoteReleaseBody() {
  const executable = process.platform === "win32" ? "gh.exe" : "gh";
  const result = spawnSync(executable, ["api", `repos/${resolveGitHubRepository()}/releases/tags/${tagName}`], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Cannot read GitHub Release ${tagName}. Ensure gh is installed, authenticated, and the Release exists.\n${result.stderr.trim()}`);
  }
  const payload = JSON.parse(result.stdout);
  if (typeof payload.body !== "string") throw new Error(`GitHub Release ${tagName} has no text body`);
  return payload.body;
}

const localNotes = readReleaseNotes();
const errors = validateNotes(localNotes, path.relative(projectRoot, notesPath));

if (remoteCheck) {
  const remoteNotes = readRemoteReleaseBody();
  errors.push(...validateNotes(remoteNotes, `GitHub Release ${tagName}`));
  if (normalize(remoteNotes) !== normalize(localNotes)) {
    errors.push(`GitHub Release ${tagName}: body differs from ${path.relative(projectRoot, notesPath)}`);
  }
}

if (errors.length > 0) {
  console.error("Release notes check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const sourceLabel = path.relative(projectRoot, notesPath);
  console.log(`Release notes check passed: ${sourceLabel}${remoteCheck ? ` + GitHub Release ${tagName}` : ""}`);
}
