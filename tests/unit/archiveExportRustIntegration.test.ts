import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryItem } from "@/features/library/types/library";
import { exportLibraryZip } from "../../electron/main/library/archiveStore";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";
import * as rustFileOps from "../../electron/main/runtime/rustFileOps";
import { normalizeLibraryViewSettings, writeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";

const runtime = vi.hoisted(() => ({ userDataPath: "", savePath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, getVersion: () => "0.3.6", isPackaged: false },
  dialog: {
    showSaveDialog: async () =>
      runtime.savePath ? ({ canceled: false, filePath: runtime.savePath }) : ({ canceled: true, filePath: null }),
  },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../electron/main/library/libraryStore", () => {
  const { readFileSync } = require("node:fs");
  const path = require("node:path");
  return {
    readLibraryFile: async () => {
      const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "tests/fixtures/library-export-fixture.json"), "utf8"));
      fixture.items[0].tags = ["哈苏"];
      return fixture;
    },
    appendLibraryItems: async (items: unknown[]) => ({ items }),
  };
});

vi.mock("../../electron/main/library/mediaPathResolver", () => ({
  resolveMediaAbsolutePath: async (item: { imageFileName: string }) =>
    path.join(process.cwd(), "tests/fixtures/export-images", item.imageFileName),
}));

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env.SUYAN_USE_RUST_ARCHIVE;
  await rustCoreRuntime.stop().catch(() => undefined);
  vi.restoreAllMocks();
  runtime.userDataPath = "";
  runtime.savePath = "";
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("exportLibraryZip Rust integration", () => {
  it("exports via Rust when the feature flag is on", async () => {
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-export-integration-"));
    temporaryDirectories.push(outDir);
    const zipPath = path.join(outDir, "out.zip");
    runtime.savePath = zipPath;
    runtime.userDataPath = path.join(outDir, "data");
    await fs.mkdir(path.join(runtime.userDataPath, "library/images"), { recursive: true });
    await fs.copyFile(path.join(process.cwd(), "tests/fixtures/export-images/img1.png"), path.join(runtime.userDataPath, "library/images/cover.png"));
    await writeLibraryViewSettings(normalizeLibraryViewSettings({ promptLexicons: { categories: [], tags: [
      { id: "camera", label: "哈苏", group: "物品/数码设备/相机品牌", description: "已归纳", imageFileName: "cover.png" },
    ] } }));
    const rustExport = vi.spyOn(rustFileOps, "createZipViaRust");

    process.env.SUYAN_USE_RUST_ARCHIVE = "1";

    const result = await exportLibraryZip([]);
    expect(await rustExport.mock.results[0].value).not.toBeNull();

    expect(result.canceled).toBe(false);
    expect(result.exportedCount).toBeGreaterThan(0);
    expect(fs.stat(zipPath)).resolves.toBeTruthy();

    // 解包确认内容完整。
    const { execFileSync } = await import("node:child_process");
    const destDir = path.join(outDir, "unzipped");
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`,
    ]);

    const dataJson = JSON.parse(await fs.readFile(path.join(destDir, "data.json"), "utf8"));
    // v2 携带可选 author（方案 §十七）；未登录导出时 author 缺省。
    expect(dataJson.schemaVersion).toBe(2);
    expect(Array.isArray(dataJson.items)).toBe(true);
    expect(dataJson.items.length).toBe(result.exportedCount);
    expect(dataJson.analyzedLibraries.tags[0]).toMatchObject({ label: "哈苏", group: "物品/数码设备/相机品牌" });
    expect(await fs.readFile(path.join(destDir, "knowledge-images/cover.png"))).toEqual(await fs.readFile(path.join(process.cwd(), "tests/fixtures/export-images/img1.png")));

    const imageFiles = await fs.readdir(path.join(destDir, "images"));
    expect(imageFiles.length).toBe(result.exportedCount);
  }, 30_000);
});
