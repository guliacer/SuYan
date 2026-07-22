const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

function assertInsideProject(targetPath) {
  const relativePath = path.relative(projectRoot, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to remove path outside project: ${targetPath}`);
  }
}

assertInsideProject(distDir);
removePathIfExists(distDir);

if (fs.existsSync(distDir)) {
  throw new Error(`Directory still exists after removal: ${distDir}`);
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  removePathRecursive(targetPath);
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
