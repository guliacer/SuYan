import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hasLibraryUserData,
  prepareAppUserDataSync,
  probeDirectoryWritable,
  resolveAppUserDataPath,
  resolvePackagedSoftwareRoot,
} from "../../electron/main/app/appStoragePath";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `suyan-storage-${label}-`));
  tempRoots.push(root);
  return root;
}

function seedLibrary(userDataDir: string, title: string): void {
  const libraryDir = path.join(userDataDir, "library");
  const imagesDir = path.join(libraryDir, "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(
    path.join(libraryDir, "library.json"),
    JSON.stringify({ schemaVersion: 2, updatedAt: new Date().toISOString(), items: [{ id: "1", title }] }, null, 2),
    "utf8",
  );
  fs.writeFileSync(path.join(imagesDir, "1.png"), "fake-image");
}

describe("app storage path", () => {
  it("keeps development userData on the live portable profile", () => {
    expect(
      resolveAppUserDataPath({
        isPackaged: false,
        execPath: "D:\\workspace\\node_modules\\electron\\electron.exe",
        appDataPath: "C:\\Users\\Tester\\AppData\\Roaming",
        cwd: "W:\\提示词",
      }),
    ).toBe(path.join("W:\\提示词", "release", "win-unpacked", "data"));
  });

  it("stores installed build data under the install directory data folder", () => {
    expect(
      resolveAppUserDataPath({
        isPackaged: true,
        execPath: "D:\\Apps\\SuYan\\素言.exe",
        appDataPath: "C:\\Users\\Tester\\AppData\\Roaming",
      }),
    ).toBe(path.join("D:\\Apps\\SuYan", "data"));
  });

  it("keeps local win-unpacked rebuilds on the portable data directory", () => {
    expect(
      resolveAppUserDataPath({
        isPackaged: true,
        execPath: "W:\\提示词\\release\\win-unpacked\\素言.exe",
        appDataPath: "C:\\Users\\Tester\\AppData\\Roaming",
      }),
    ).toBe(path.join("W:\\提示词", "release", "win-unpacked", "data"));
  });

  it("makes electron . and the local packaged exe share the same portable data", () => {
    const workspace = "W:\\提示词";
    const appDataPath = "C:\\Users\\Tester\\AppData\\Roaming";
    expect(
      resolveAppUserDataPath({
        isPackaged: false,
        execPath: `${workspace}\\node_modules\\electron\\electron.exe`,
        appDataPath,
        cwd: workspace,
      }),
    ).toBe(
      resolveAppUserDataPath({
        isPackaged: true,
        execPath: `${workspace}\\release\\win-unpacked\\素言.exe`,
        appDataPath,
      }),
    );
  });

  it("does not migrate AppData into a local packaged rebuild", () => {
    const root = makeTempRoot("local-packaged");
    const appDataPath = path.join(root, "AppData");
    const unpackDir = path.join(root, "release", "win-unpacked");
    fs.mkdirSync(unpackDir, { recursive: true });
    seedLibrary(path.join(appDataPath, "SuYan"), "stale-appdata");
    seedLibrary(path.join(unpackDir, "data"), "portable-live");

    const result = prepareAppUserDataSync({
      isPackaged: true,
      execPath: path.join(unpackDir, "素言.exe"),
      appDataPath,
    });

    expect(result.reason).toBe("already-ready");
    expect(result.migrated).toBe(false);
    expect(result.userDataPath).toBe(path.join(unpackDir, "data"));
    const library = JSON.parse(
      fs.readFileSync(path.join(result.userDataPath, "library", "library.json"), "utf8"),
    ) as { items: Array<{ title: string }> };
    expect(library.items[0]?.title).toBe("portable-live");
  });

  it("uses portable executable directory instead of temp unpack path", () => {
    expect(
      resolvePackagedSoftwareRoot({
        isPackaged: true,
        execPath: "C:\\Users\\Tester\\AppData\\Local\\Temp\\portable\\素言.exe",
        appDataPath: "C:\\Users\\Tester\\AppData\\Roaming",
        portableExecutableDir: "E:\\便携软件\\素言",
      }),
    ).toBe(path.resolve("E:\\便携软件\\素言"));

    expect(
      resolveAppUserDataPath({
        isPackaged: true,
        execPath: "C:\\Users\\Tester\\AppData\\Local\\Temp\\portable\\素言.exe",
        appDataPath: "C:\\Users\\Tester\\AppData\\Roaming",
        portableExecutableDir: "E:\\便携软件\\素言",
      }),
    ).toBe(path.join(path.resolve("E:\\便携软件\\素言"), "data"));
  });

  it("migrates legacy AppData library into packaged local data on first launch", () => {
    const root = makeTempRoot("migrate");
    const appDataPath = path.join(root, "AppData");
    const installDir = path.join(root, "Install");
    const legacyDir = path.join(appDataPath, "SuYan");
    fs.mkdirSync(installDir, { recursive: true });
    seedLibrary(legacyDir, "legacy-item");

    const result = prepareAppUserDataSync({
      isPackaged: true,
      execPath: path.join(installDir, "素言.exe"),
      appDataPath,
    });

    expect(result.migrated).toBe(true);
    expect(result.reason).toBe("migrated");
    expect(result.from).toBe(legacyDir);
    expect(result.userDataPath).toBe(path.join(installDir, "data"));
    expect(hasLibraryUserData(result.userDataPath)).toBe(true);
    expect(fs.existsSync(path.join(result.userDataPath, "library", "library.json"))).toBe(true);
    expect(fs.existsSync(path.join(legacyDir, "migrated-to-local-data.json"))).toBe(true);

    const library = JSON.parse(
      fs.readFileSync(path.join(result.userDataPath, "library", "library.json"), "utf8"),
    ) as { items: Array<{ title: string }> };
    expect(library.items[0]?.title).toBe("legacy-item");
  });

  it("does not re-migrate when local data already exists", () => {
    const root = makeTempRoot("skip");
    const appDataPath = path.join(root, "AppData");
    const installDir = path.join(root, "Install");
    const localData = path.join(installDir, "data");
    seedLibrary(path.join(appDataPath, "SuYan"), "legacy");
    seedLibrary(localData, "local");

    const result = prepareAppUserDataSync({
      isPackaged: true,
      execPath: path.join(installDir, "素言.exe"),
      appDataPath,
    });

    expect(result.migrated).toBe(false);
    expect(result.reason).toBe("already-ready");
    const library = JSON.parse(
      fs.readFileSync(path.join(localData, "library", "library.json"), "utf8"),
    ) as { items: Array<{ title: string }> };
    expect(library.items[0]?.title).toBe("local");
  });
});

describe("data directory write probe", () => {
  it("reports a writable directory and leaves no probe file behind", () => {
    const root = makeTempRoot("probe-ok");
    const dataDir = path.join(root, "data");

    expect(probeDirectoryWritable(dataDir)).toEqual({ writable: true });
    expect(fs.existsSync(dataDir)).toBe(true);
    expect(fs.readdirSync(dataDir).filter((entry) => entry.startsWith(".suyan-write-probe"))).toEqual([]);
  });

  it("reports an unwritable target with an error code instead of throwing", () => {
    const root = makeTempRoot("probe-fail");
    // A file where a directory is expected makes mkdir fail deterministically on all platforms.
    const blocker = path.join(root, "data");
    fs.writeFileSync(blocker, "not-a-directory", "utf8");

    const result = probeDirectoryWritable(blocker);

    expect(result.writable).toBe(false);
    if (result.writable) {
      return;
    }
    expect(result.code).toBeTruthy();
    expect(result.message).toBeTruthy();
  });

  it("fails packaged startup with not-writable instead of crashing", () => {
    const root = makeTempRoot("startup-readonly");
    const appDataPath = path.join(root, "AppData");
    const installDir = path.join(root, "Install");
    fs.mkdirSync(installDir, { recursive: true });
    // Block the data directory so the probe cannot create it.
    fs.writeFileSync(path.join(installDir, "data"), "blocked", "utf8");

    const result = prepareAppUserDataSync({
      isPackaged: true,
      execPath: path.join(installDir, "素言.exe"),
      appDataPath,
    });

    expect(result.reason).toBe("not-writable");
    expect(result.migrated).toBe(false);
    expect(result.userDataPath).toBe(path.join(installDir, "data"));
    expect(result.writeErrorCode).toBeTruthy();
  });

  it("still prepares development userData without the packaged probe", () => {
    const root = makeTempRoot("dev-probe");
    const appDataPath = path.join(root, "AppData");

    const result = prepareAppUserDataSync({
      isPackaged: false,
      execPath: path.join(root, "node_modules", "electron", "electron.exe"),
      appDataPath,
      cwd: root,
    });

    expect(result.reason).toBe("dev");
    expect(result.userDataPath).toBe(path.join(root, "release", "win-unpacked", "data"));
    expect(fs.existsSync(result.userDataPath)).toBe(true);
    expect(fs.existsSync(path.join(appDataPath, "SuYan"))).toBe(false);
  });
});
