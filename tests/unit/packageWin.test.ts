import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  acquirePackagingLock,
  formatGuliIdentityConfigForPackage,
  parseGuliIdentityConfigForPackage,
  prepareGuliIdentityConfigStage,
  promoteStagedRelease,
  promoteBundledLocalComponents,
  prepareInstallerThemeStage,
  resolveWindowsTargets,
} = require("../../package-win.cjs") as {
  acquirePackagingLock: () => () => void;
  promoteBundledLocalComponents: (finalDir: string, componentIds: string[], resolveStageSource: (id: string) => string) => void;
  formatGuliIdentityConfigForPackage: (values: Record<string, string>) => string;
  parseGuliIdentityConfigForPackage: (contents: string) => Record<string, string>;
  prepareGuliIdentityConfigStage: (options?: {
    sourcePath?: string;
    destinationDir?: string;
    publishRelease?: boolean;
    requireConfig?: boolean;
  }) => string | null;
  promoteStagedRelease: (
    stagedDir: string,
    finalDir: string,
    options?: { stopLockedProcesses?: boolean; unpackedOnly?: boolean },
  ) => void;
  prepareInstallerThemeStage: (options?: { sourcePath?: string; destinationDir?: string }) => Promise<string[]>;
  resolveWindowsTargets: (publishRelease: boolean) => string[];
};

const projectRoot = path.resolve(__dirname, "../..");
const testRoot = path.join(projectRoot, "release-next", `package-win-test-${process.pid}`);

describe("package-win", () => {
  it("preserves existing installed component files when promoting a bundled snapshot", () => {
    const destination = path.join(testRoot, "component-preservation");
    const component = path.join(destination, "win-unpacked/data/components/nsfw-runtime");
    fs.mkdirSync(component, { recursive: true });
    fs.writeFileSync(path.join(component, "user-installed-model.onnx"), "must-survive", "utf8");
    const snapshot = path.join(testRoot, "component-snapshot");
    fs.mkdirSync(snapshot, { recursive: true });
    fs.writeFileSync(path.join(snapshot, "old-file.txt"), "old", "utf8");
    promoteBundledLocalComponents(destination, ["nsfw-runtime"], () => snapshot);
    expect(fs.readFileSync(path.join(component, "user-installed-model.onnx"), "utf8")).toBe("must-survive");
    expect(fs.existsSync(path.join(component, "old-file.txt"))).toBe(false);
  });
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

    promoteStagedRelease(stagedDir, finalDir, { stopLockedProcesses: false });

    expect(fs.readFileSync(finalAsarPath, "utf8")).toBe("new app");
    expect(fs.readFileSync(setupPath, "utf8")).toBe("installer");
    expect(fs.existsSync(path.join(finalDir, "stale.txt"))).toBe(false);
    expect(fs.existsSync(stagedDir)).toBe(false);
  });

  it("preserves win-unpacked runtime data and logs when promoting a staged package", () => {
    const stagedDir = path.join(testRoot, "staged-preserve");
    const finalDir = path.join(testRoot, "release-preserve");
    const finalAsarPath = path.join(finalDir, "win-unpacked", "resources", "app.asar");
    const stagedAsarPath = path.join(stagedDir, "win-unpacked", "resources", "app.asar");
    const libraryPath = path.join(finalDir, "win-unpacked", "data", "library", "library.json");
    const aiSettingsPath = path.join(finalDir, "win-unpacked", "data", "library", "ai-settings.json");
    const logPath = path.join(finalDir, "win-unpacked", "logs", "app.log");
    const staleRuntimePath = path.join(finalDir, "win-unpacked", "stale-runtime.txt");

    fs.mkdirSync(path.dirname(finalAsarPath), { recursive: true });
    fs.writeFileSync(finalAsarPath, "old app", "utf8");
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    fs.writeFileSync(libraryPath, JSON.stringify({ items: [{ id: "keep-me" }] }), "utf8");
    fs.writeFileSync(
      aiSettingsPath,
      JSON.stringify({ schemaVersion: 3, recognitionSourcePreferences: { category: "image" } }),
      "utf8",
    );
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, "keep log", "utf8");
    fs.writeFileSync(staleRuntimePath, "should-remove", "utf8");

    fs.mkdirSync(path.dirname(stagedAsarPath), { recursive: true });
    fs.writeFileSync(stagedAsarPath, "new app", "utf8");
    fs.writeFileSync(path.join(stagedDir, "素言-Setup-0.1.0.exe"), "installer", "utf8");

    promoteStagedRelease(stagedDir, finalDir, { stopLockedProcesses: false });

    expect(fs.readFileSync(finalAsarPath, "utf8")).toBe("new app");
    expect(fs.existsSync(libraryPath)).toBe(true);
    expect(fs.readFileSync(libraryPath, "utf8")).toContain("keep-me");
    expect(fs.existsSync(aiSettingsPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(aiSettingsPath, "utf8")).recognitionSourcePreferences.category).toBe("image");
    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.readFileSync(logPath, "utf8")).toBe("keep log");
    expect(fs.existsSync(staleRuntimePath)).toBe(false);
  });

  it("updates only win-unpacked for the development fast package", () => {
    const stagedDir = path.join(testRoot, "staged-fast");
    const finalDir = path.join(testRoot, "release-fast");
    const finalAsarPath = path.join(finalDir, "win-unpacked", "resources", "app.asar");
    const stagedAsarPath = path.join(stagedDir, "win-unpacked", "resources", "app.asar");
    const setupPath = path.join(finalDir, "素言-Setup-0.3.6.exe");
    const portableZipPath = path.join(finalDir, "素言-Portable-0.3.6.zip");
    const libraryPath = path.join(finalDir, "win-unpacked", "data", "library", "library.json");

    fs.mkdirSync(path.dirname(finalAsarPath), { recursive: true });
    fs.writeFileSync(finalAsarPath, "old app", "utf8");
    fs.writeFileSync(setupPath, "keep installer", "utf8");
    fs.writeFileSync(portableZipPath, "keep zip", "utf8");
    fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
    fs.writeFileSync(libraryPath, JSON.stringify({ items: [{ id: "keep-me" }] }), "utf8");

    fs.mkdirSync(path.dirname(stagedAsarPath), { recursive: true });
    fs.writeFileSync(stagedAsarPath, "new app", "utf8");

    promoteStagedRelease(stagedDir, finalDir, {
      stopLockedProcesses: false,
      unpackedOnly: true,
    });

    expect(fs.readFileSync(finalAsarPath, "utf8")).toBe("new app");
    expect(fs.readFileSync(setupPath, "utf8")).toBe("keep installer");
    expect(fs.readFileSync(portableZipPath, "utf8")).toBe("keep zip");
    expect(fs.readFileSync(libraryPath, "utf8")).toContain("keep-me");
    expect(fs.existsSync(stagedDir)).toBe(false);
  });

  it("uses dir for development packaging and nsis plus zip only for releases", () => {
    expect(resolveWindowsTargets(false)).toEqual(["dir"]);
    expect(resolveWindowsTargets(true)).toEqual(["nsis", "zip"]);
  });

  it("stages the branded installer and uninstaller theme", async () => {
    const destinationDir = path.join(testRoot, "installer-theme");
    const resources = await prepareInstallerThemeStage({
      sourcePath: path.join(projectRoot, "build", "installer.nsh"),
      destinationDir,
    });

    expect(fs.readFileSync(path.join(destinationDir, "installer.nsh"), "utf8")).toContain("欢迎来到素言");
    expect(resources.map((resource) => path.basename(resource))).toEqual([
      "installerHeader.bmp",
      "installerSidebar.bmp",
      "uninstallerSidebar.bmp",
    ]);
    expect(readBmpHeader(resources[0])).toEqual({ width: 150, height: 57, bitsPerPixel: 24 });
    expect(readBmpHeader(resources[1])).toEqual({ width: 164, height: 314, bitsPerPixel: 24 });
    expect(readBmpHeader(resources[2])).toEqual({ width: 164, height: 314, bitsPerPixel: 24 });
  });

  it("keeps the custom NSIS resources wired to the release configuration", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain('include: "build/installer.nsh"');
    expect(script).toContain('installerHeader: "build/installerHeader.bmp"');
    expect(script).toContain('installerSidebar: "build/installerSidebar.bmp"');
    expect(script).toContain('uninstallerSidebar: "build/uninstallerSidebar.bmp"');
    expect(script).toContain('installerLanguages: ["zh_CN"]');
    expect(script).toContain("multiLanguageInstaller: false");
  });

  it("serializes Windows packaging and rejects a second process", () => {
    const releaseLock = acquirePackagingLock();

    try {
      expect(() => acquirePackagingLock()).toThrow(/并发打包/);
    } finally {
      releaseLock();
    }
  });

  it("keeps the public client id in the packaged config and emits no private fields", () => {
    const sourcePath = path.join(testRoot, "private", "guli-identity.env");
    const destinationDir = path.join(testRoot, "stage");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      [
        "GULI_IDENTITY_ISSUER=https://auth.example.test",
        "GULI_IDENTITY_CLIENT_ID=public-client-123",
        "GULI_IDENTITY_REDIRECT_URI=suyan://oauth/callback",
          "GULI_IDENTITY_SCOPES=openid email profile offline_access",
        "UNRELATED_VALUE=ignored",
      ].join("\n"),
      "utf8",
    );

    const outputPath = prepareGuliIdentityConfigStage({ sourcePath, destinationDir });
    expect(outputPath).toBe(path.join(destinationDir, "guli-identity.env"));
    const output = fs.readFileSync(outputPath!, "utf8");
    expect(output).toContain("GULI_IDENTITY_CLIENT_ID=public-client-123");
    expect(output).toContain("GULI_IDENTITY_REDIRECT_URI=suyan://oauth/callback");
    expect(output).not.toMatch(/^(?:GULI_IDENTITY_)?(?:CLIENT_SECRET|PASSWORD|TOKEN)=/imu);
    expect(parseGuliIdentityConfigForPackage(output)).toEqual({
      GULI_IDENTITY_ISSUER: "https://auth.example.test",
      GULI_IDENTITY_CLIENT_ID: "public-client-123",
      GULI_IDENTITY_REDIRECT_URI: "suyan://oauth/callback",
      GULI_IDENTITY_SCOPES: "openid email profile offline_access",
    });
    expect(formatGuliIdentityConfigForPackage({ GULI_IDENTITY_CLIENT_ID: "public-client-123" })).toContain(
      "GULI_IDENTITY_CLIENT_ID=public-client-123",
    );
  });

  it("refuses to package client secrets and requires config for a release", () => {
    const sourcePath = path.join(testRoot, "private", "unsafe.env");
    const destinationDir = path.join(testRoot, "unsafe-stage");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(
      sourcePath,
      "GULI_IDENTITY_CLIENT_ID=public-client\nGULI_IDENTITY_CLIENT_SECRET=must-not-ship\n",
      "utf8",
    );

    expect(() => prepareGuliIdentityConfigStage({ sourcePath, destinationDir })).toThrow(/敏感字段/);
    expect(() => prepareGuliIdentityConfigStage({
      sourcePath: path.join(testRoot, "missing-public.env"),
      destinationDir,
      publishRelease: true,
    })).toThrow(/缺少公共配置/);
  });

  it("ships startup gallery assets outside app.asar for packaged startup seeding", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain('path.join(projectRoot, "electron", "assets", "startup-gallery")');
    expect(script).toContain('path.join(stageDir, "startup-assets")');
    expect(script).toContain('from: "startup-assets"');
    expect(script).toContain('to: "startup-assets"');
    expect(script).toContain("tryStopLockedReleaseProcesses");
  });

  it("does not package a Go file helper binary", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).not.toContain("prepareGoFileHelperStage");
    expect(script).not.toContain("go-file-helper");
    expect(script).toContain('from: "bin"');
    expect(script).toContain('to: "bin"');
  });

  it("wipes dist-electron before compiling so deleted modules stop shipping", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    // tsc never removes stale .js for a deleted .ts, so a removed module would
    // keep riding along inside app.asar without this clean step.
    expect(packageJson.scripts?.["build:electron"]).toContain("clean-dist.cjs dist-electron");
    expect(packageJson.scripts?.["build:electron"]).toContain("tsc -p tsconfig.electron.json");
  });

  it("leaves no compiled output without a matching source file", () => {
    const outputRoot = path.join(projectRoot, "dist-electron", "electron");
    if (!fs.existsSync(outputRoot)) {
      return;
    }

    const orphans = listCompiledFiles(outputRoot).filter((compiledPath) => {
      const relativePath = path.relative(outputRoot, compiledPath);
      const sourcePath = path.join(projectRoot, "electron", relativePath).replace(/\.js$/, ".ts");
      return !fs.existsSync(sourcePath);
    });

    expect(orphans).toEqual([]);
  });

  it("packages sharp native runtime files without a Go helper build step", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["build:go-helper"]).toBeUndefined();
    expect(packageJson.scripts?.["package:win"]).toContain("build-rust-core.cjs");
    expect(packageJson.scripts?.["package:win"]).not.toContain("build:go-helper");
    expect(script).toContain("resolvePackageJsonPath");
    expect(script).toContain('copyPackage("sharp")');
    expect(script).toContain('path.join(vendorNodeModulesDir, "@img", "sharp-win32-x64", "lib")');
    expect(script).toContain('pattern: /^sharp-win32-x64(?:-[0-9.]+)?\\.node$/u');
    expect(script).toContain("assertVendorRuntimeDependencies");
    expect(script).toContain("assertPackagedRuntimeDependencies");
  });

  it("packages Rust Core sidecar and does not ship ffmpeg-static in vendor", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(script).toContain("prepareRustCoreStage");
    expect(script).toContain("Required Rust Core binary is missing");
    expect(script).toContain('electronLanguages: ["zh-CN", "en-US", "ja"]');
    expect(script).toContain("resolveWindowsTargets");
    expect(script).toContain('publishRelease ? ["nsis", "zip"] : ["dir"]');
    expect(script).toContain("unpackedOnly: !isPublishRelease");
    expect(script).toContain("releaseArtifactName(releaseEdition)");
    expect(script).toContain('copyPackage("jszip")');
    expect(script).toContain('copyPackage("sharp")');
    expect(script).toContain('"openid-client": sourcePackage.dependencies["openid-client"]');
    expect(script).not.toContain('copyPackage("ffmpeg-static")');
    expect(script).not.toMatch(/copyPackage\(\s*["']ffmpeg/);
    expect(packageJson.dependencies?.["ffmpeg-static"]).toBeUndefined();
    expect(packageJson.devDependencies?.["ffmpeg-static"]).toBe("5.2.0");
    expect(packageJson.scripts?.["package:win:release"]).toContain("package-win-release.cjs");
  });

  it("packages only default startup gallery assets and guards personal library payloads", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain("prepareStartupAssetsStage");
    expect(script).toContain("assertEmptyShellStartupAssets");
    expect(script).toContain("assertNoPersonalLibraryPayload");
    expect(script).toContain('from: "startup-assets"');
    expect(script).toContain('to: "startup-assets"');
    expect(script).toContain("startup-default-1.png");
    expect(script).toContain("!**/library.json");
    expect(script).toContain("!**/ai-settings.json");
    expect(script).toContain("acceleration-settings.json");
    expect(script).toContain("assertPackagedEmptyShell");
    expect(script).toContain("emptyShellExcludeGlobs");
  });

  it("requires explicit confirmation before packaging when dev data exists", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain("confirmDataDirectorySafety");
    expect(script).toContain("promoteStagedRelease(packageOutputDir, requestedReleaseDir, {");
    expect(script).toContain("SUYAN_PACKAGE_CONFIRMED");
    expect(script).toContain("restartPackagedApplication");
    expect(script).toContain("timeoutMs = 12000");
    expect(script).toContain("acquirePackagingLock");
    expect(script).toContain("taskkill.exe");
    expect(script).toContain("waitForLockedReleaseProcessesToExit");
    expect(script).toContain("releaseProcessShutdownGraceMs = 2000");
    expect(script).toContain("sleepSync(releaseProcessShutdownGraceMs)");
    expect(script).toContain('nestedPreserve:');
    expect(script).toContain('"win-unpacked": new Set(["data", "logs"])');
    expect(script).toContain("resolveInstalledFfmpegExe");
  });

  it("stages public Guli Identity configuration as an extra resource", () => {
    const script = fs.readFileSync(path.join(projectRoot, "package-win.cjs"), "utf8");

    expect(script).toContain("prepareGuliIdentityConfigStage");
    expect(script).toContain('from: guliIdentityConfigFileName');
    expect(script).toContain('to: guliIdentityConfigFileName');
    expect(script).toContain("GULI_IDENTITY_CLIENT_ID");
    expect(script).toContain("suyan://oauth/callback");
  });

  it("uses shell dispatch for the Windows pnpm release wrapper", () => {
    const script = fs.readFileSync(path.join(projectRoot, "scripts/package-win-release.cjs"), "utf8");

    expect(script).toContain('shell: process.platform === "win32"');
    expect(script).toContain("SUYAN_PUBLISH_RELEASE");
  });

});

function readBmpHeader(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  return {
    width: buffer.readInt32LE(18),
    height: buffer.readInt32LE(22),
    bitsPerPixel: buffer.readUInt16LE(28),
  };
}

function listCompiledFiles(rootDir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listCompiledFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

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
