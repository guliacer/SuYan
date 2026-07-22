import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLogDirectory } from "../../electron/main/logStoragePath";

describe("log storage path", () => {
  it("keeps development logs under userData", () => {
    expect(
      resolveLogDirectory({
        isPackaged: false,
        execPath: "D:\\workspace\\node_modules\\electron\\electron.exe",
        userDataPath: "C:\\Users\\Tester\\AppData\\Roaming\\SuYan",
      }),
    ).toBe(path.join("C:\\Users\\Tester\\AppData\\Roaming\\SuYan", "logs"));
  });

  it("stores installed build logs next to the installed executable", () => {
    expect(
      resolveLogDirectory({
        isPackaged: true,
        execPath: "D:\\Apps\\SuYan\\素言.exe",
        userDataPath: "C:\\Users\\Tester\\AppData\\Roaming\\SuYan",
      }),
    ).toBe(path.join("D:\\Apps\\SuYan", "logs"));
  });

  it("uses the original portable directory instead of a temporary unpack directory", () => {
    expect(
      resolveLogDirectory({
        isPackaged: true,
        execPath: "C:\\Users\\Tester\\AppData\\Local\\Temp\\portable\\素言.exe",
        userDataPath: "C:\\Users\\Tester\\AppData\\Roaming\\SuYan",
        portableExecutableDir: "E:\\便携软件\\素言",
      }),
    ).toBe(path.join("E:\\便携软件\\素言", "logs"));
  });
});
