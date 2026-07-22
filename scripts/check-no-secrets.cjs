const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignoreDirNames = new Set([
  ".git",
  "node_modules",
  "dist",
  "dist-electron",
  "release",
  "release-next",
  "release-clean",
  ".pnpm-store",
  ".pnpm-cache",
  ".npm-cache",
]);
const ignoreFileNames = new Set(["pnpm-lock.yaml", "package-lock.json"]);
const patterns = [
  { name: "OpenAI-like key", re: new RegExp("sk-[A-Za-z0-9]{16,}", "g") },
  { name: "GitHub PAT", re: new RegExp("ghp_[A-Za-z0-9]{16,}", "g") },
  { name: "Google API key", re: new RegExp("AIza[0-9A-Za-z_-]{16,}", "g") },
  { name: "AWS access key", re: new RegExp("AKIA[0-9A-Z]{16}", "g") },
  { name: "Private key block", re: new RegExp("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "g") },
  { name: "Bearer token literal", re: new RegExp("Bearer\\s+[A-Za-z0-9._-]{24,}", "g") },
];
const textExt = new Set([".ts",".tsx",".js",".cjs",".mjs",".json",".md",".txt",".yml",".yaml",".toml",".css",".html",".env",".ps1",".sh"]);
const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (ignoreFileNames.has(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!textExt.has(ext) && !entry.name.startsWith(".env")) continue;
    let content = "";
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      let match;
      while ((match = pattern.re.exec(content))) {
        const value = match[0];
        if (/^sk-(main|test|secret|existing|legacy)$/i.test(value)) continue;
        if (value.includes("example") || value.includes("xxxx")) continue;
        const line = content.slice(0, match.index).split(/\r?\n/).length;
        findings.push({
          file: path.relative(root, full).replace(/\\/g, "/"),
          line,
          type: pattern.name,
          sample: value.slice(0, 12) + "...",
        });
      }
    }
  }
}

walk(root);
if (findings.length > 0) {
  console.error("Potential secrets detected:");
  for (const item of findings) {
    console.error("- " + item.file + ":" + item.line + " [" + item.type + "] " + item.sample);
  }
  process.exit(1);
}
console.log("Secret scan passed: no high-confidence API secrets found in tracked source tree.");
