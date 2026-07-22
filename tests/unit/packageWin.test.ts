import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { promoteStagedRelease } = require("../../package-win.cjs") as {
  promoteStagedRelease: (stagedDir: string, finalDir: string) => void;
};

const projectRoot = path.resolve(__dirname, "../..");
const testRoot = path.join(projectRoot, "release-next", `package-win-test-${process.pid}`);

describe("package-win", () => {
  afterEach(() => {
    removePathIfExists(testRoot);
  });

  it("promotes staged package by syncing into the final release directory", () => {
    const stagedDir = path.join(testRoot, "staged");
    const finalDir = path.join(testRoot, "release");
    const finalAsarPath = path.join(finalDir, "win-unpacked", "resources", "app.asar");
    const stagedAsarPath = path.join(stagedDir, "win-unpacked", "resources", "app.asar");
    const setupPath = path.join(finalDir, "素言-Setup-0.1.0.exe");

    fs.mkdirSync(path.dirname(finalAsarPath), { recursive: true });
    fs.writeFileSync(finalAsarPath, "old app", "utf8");
    fs.writeFileSync(path.join(finalDir, "stale.txt"), "stale", "utf8");
    fs.mkdirSync(path.dirname(stagedAsarPath), { recursive: true });
    fs.writeFileSync(stagedAsarPath, "new app", "utf8");
    fs.writeFileSync(path.join(stagedDir, "素言-Setup-0.1.0.exe"), "installer", "utf8");

    promoteStagedRelease(stagedDir, finalDir);

    expect(fs.readFileSync(finalAsarPath, "utf8")).toBe("new app");
    expect(fs.readFileSync(setupPath, "utf8")).toBe("installer");
    expect(fs.existsSync(path.join(finalDir, "stale.txt"))).toBe(false);
    expect(fs.existsSync(stagedDir)).toBe(false);
  });

  it("ships startup gallery assets outside app.asar for packaged startup seeding", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain('path.join(projectRoot, "electron", "assets", "startup-gallery")');
    expect(script).toContain('path.join(stageDir, "startup-assets")');
    expect(script).toContain('from: "startup-assets"');
    expect(script).toContain('to: "startup-assets"');
    expect(script).toContain("tryStopLockedReleaseProcesses");
  });
});

function removePathIfExists(targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stat = fs.lstatSync(targetPath);

  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath)) {
      removePathIfExists(path.join(targetPath, entry));
    }

    fs.rmdirSync(targetPath);
    return;
  }

  fs.unlinkSync(targetPath);
}
