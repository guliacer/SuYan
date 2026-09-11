import { describe, expect, it, vi } from "vitest";
vi.mock("../../electron/main/appLogger", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
import { toModuleInstallationStatus } from "../../electron/main/modules/moduleInstaller";
import { resolveLocalNsfwArtifactPaths } from "../../electron/main/modules/nsfwModuleInstaller";

describe("module installer IPC status", () => {
  it("keeps module detection data structured across the IPC boundary", () => {
    expect(toModuleInstallationStatus(true)).toEqual({ installed: true });
    expect(toModuleInstallationStatus(false)).toEqual({ installed: false });
  });

  it("requires the signed NSFW offline artifact triplet", () => {
    const files = [
      "C:\\offline\\nsfw-runtime-win32-x64.zip",
      "C:\\offline\\manifest.json.sig",
      "C:\\offline\\manifest.json",
    ];

    expect(resolveLocalNsfwArtifactPaths(files)).toEqual({
      manifestPath: files[2],
      signaturePath: files[1],
      zipPath: files[0],
    });
    expect(resolveLocalNsfwArtifactPaths(files.slice(0, 2))).toBeNull();
    expect(
      resolveLocalNsfwArtifactPaths([
        "C:\\offline\\manifest.json",
        "C:\\offline\\manifest.json.sig",
        "C:\\offline\\other-module.zip",
      ]),
    ).toBeNull();
  });
});
