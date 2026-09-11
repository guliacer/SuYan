import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openAppDataDirectory } from "../../electron/main/app/dataDirectory";
import { AppError } from "../../electron/main/ipc/errors";

const runtime = vi.hoisted(() => ({ userDataPath: "", openPathFailure: "", openedPaths: [] as string[] }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath },
  shell: {
    openPath: async (target: string) => {
      runtime.openedPaths.push(target);
      return runtime.openPathFailure;
    },
  },
}));

afterEach(() => {
  runtime.userDataPath = "";
  runtime.openPathFailure = "";
  runtime.openedPaths.length = 0;
});

describe("open data directory", () => {
  it("reveals the resolved userData directory so users can copy it before upgrading", async () => {
    runtime.userDataPath = "D:\\Apps\\SuYan\\data";

    await expect(openAppDataDirectory()).resolves.toEqual({
      opened: true,
      path: "D:\\Apps\\SuYan\\data",
    });
    expect(runtime.openedPaths).toEqual(["D:\\Apps\\SuYan\\data"]);
  });

  it("surfaces an AppError when the shell refuses to open the directory", async () => {
    runtime.userDataPath = "D:\\Apps\\SuYan\\data";
    runtime.openPathFailure = "Windows cannot find the path";

    await expect(openAppDataDirectory()).rejects.toMatchObject({
      code: "OPEN_DATA_DIRECTORY_FAILED",
    });
    await expect(openAppDataDirectory()).rejects.toBeInstanceOf(AppError);
  });
});

describe("upgrade backup reminder wiring", () => {
  const channelsSource = readFileSync("electron/shared/ipcChannels.ts", "utf8");
  const handlersSource = readFileSync("electron/main/ipc/registerIpcHandlers.ts", "utf8");
  const preloadSource = readFileSync("electron/preload/index.ts", "utf8");
  const apiTypeSource = readFileSync("src/types/suyanApi.ts", "utf8");
  const dialogSource = readFileSync("src/features/library/components/shell/AboutDialog.tsx", "utf8");

  it("exposes the open-data-directory channel through the whitelisted IPC bridge", () => {
    expect(channelsSource).toContain('AppOpenDataDirectory = "app:open-data-directory"');
    expect(channelsSource).toContain("appOpenDataDirectory: IpcChannelName.AppOpenDataDirectory");
    expect(handlersSource).toContain("ipcMain.handle(ipcChannels.appOpenDataDirectory");
    expect(handlersSource).toContain('handleResult("app:open-data-directory", () => openAppDataDirectory())');
    expect(preloadSource).toContain("openDataDirectory: () => invoke(IpcChannelName.AppOpenDataDirectory)");
    expect(apiTypeSource).toContain("openDataDirectory: () => Promise<IpcResult<{ opened: true; path: string }>>");
  });

  it("shows the backup reminder only when an update is available", () => {
    expect(dialogSource).toContain('const isUpdateAvailable = updateCheckResult?.status === "update_available"');
    expect(dialogSource).toContain("{isUpdateAvailable ? (");
    expect(dialogSource).toContain("升级前请先备份数据");
    expect(dialogSource).toContain("打开数据目录");
    expect(dialogSource).toContain("window.suyanApi.openDataDirectory()");
  });

  it("points the reminder at copying the data folder instead of the share archive", () => {
    expect(dialogSource).toContain("升级前请先备份数据");
    expect(dialogSource).toContain("打开数据目录");
  });
});

describe("upgrade backup decision is recorded in the rules", () => {
  const storageRuleSource = readFileSync(".codex/rules/08-数据库与状态管理规范.md", "utf8");
  const versioningSource = readFileSync("docs/VERSIONING.md", "utf8");

  it("documents that data\\ loss on upgrade is an accepted tradeoff, not a bug to re-fix", () => {
    expect(storageRuleSource).toContain("R3.2");
    expect(storageRuleSource).toContain("customRemoveFiles");
    expect(versioningSource).toContain("升级可直接覆盖，但 `data\\` 需用户自行备份");
    expect(versioningSource).toContain(".codex/rules/08` R3.2");
  });
});
