import { describe, expect, it } from "vitest";
import {
  buildModuleManagementRows,
  groupModuleManagementRows,
  resolveVideoRuntimeStateAfterProbe,
} from "../../src/features/library/utils/moduleManagement";
import { resolveBuiltinModuleState } from "../../src/features/library/utils/moduleRegistry";

describe("moduleManagement", () => {
  it("builds rows with required modules locked and video-runtime uninstalled by default", () => {
    const rows = buildModuleManagementRows(resolveBuiltinModuleState());
    const byId = Object.fromEntries(rows.map((row) => [row.definition.id, row]));

    expect(byId["core-library"]?.canDisable).toBe(false);
    expect(byId["core-library"]?.canDelete).toBe(false);
    expect(byId["core-library"]?.canToggleEnabled).toBe(false);
    expect(byId["core-library"]?.effectivelyEnabled).toBe(true);

    expect(byId["video-runtime"]?.installed).toBe(false);
    expect(byId["video-runtime"]?.canDelete).toBe(true);
    expect(byId["video-runtime"]?.canRestore).toBe(false);
    expect(byId["video-runtime"]?.canToggleEnabled).toBe(false);
    expect(byId["video-runtime"]?.effectivelyEnabled).toBe(false);

    expect(byId["video-compression"]?.installed).toBe(true);
    expect(byId["video-compression"]?.rawEnabled).toBe(true);
    expect(byId["video-compression"]?.effectivelyEnabled).toBe(false);
    expect(byId["video-compression"]?.blockedByDependencies).toBe(true);
    expect(byId["video-compression"]?.dependencyLabels).toContain("视频依赖");
    expect(byId["video-runtime"]?.dependentLabels).toContain("视频压缩");
  });

  it("marks video-compression available after runtime is installed and enabled", () => {
    const state = resolveBuiltinModuleState({
      "video-runtime": { installed: true, enabled: true },
    });
    const rows = buildModuleManagementRows(state);
    const compression = rows.find((row) => row.definition.id === "video-compression");
    const runtime = rows.find((row) => row.definition.id === "video-runtime");

    expect(runtime?.canToggleEnabled).toBe(true);
    expect(runtime?.effectivelyEnabled).toBe(true);
    expect(compression?.effectivelyEnabled).toBe(true);
    expect(compression?.blockedByDependencies).toBe(false);
  });

  it("groups rows by category order", () => {
    const groups = groupModuleManagementRows(buildModuleManagementRows(resolveBuiltinModuleState()));

    expect(groups.map((group) => group.category)).toEqual(["core", "prompt", "runtime", "batch"]);
    expect(groups.find((group) => group.category === "runtime")?.rows.map((row) => row.definition.id)).toEqual(
      expect.arrayContaining(["video-runtime", "image-runtime", "nsfw-runtime"]),
    );
  });

  it("preserves user disable preference when probe still finds ffmpeg", () => {
    expect(
      resolveVideoRuntimeStateAfterProbe({ installed: true, enabled: false }, true),
    ).toEqual({ installed: true, enabled: false });

    expect(
      resolveVideoRuntimeStateAfterProbe({ installed: false, enabled: false }, true),
    ).toEqual({ installed: true, enabled: true });

    expect(
      resolveVideoRuntimeStateAfterProbe({ installed: true, enabled: true }, false),
    ).toEqual({ installed: false, enabled: false });
  });

  it("marks removed optional built-ins as restorable without cascading deletion", () => {
    const state = resolveBuiltinModuleState({
      "image-runtime": { installed: false, enabled: false },
      "image-compression": { installed: true, enabled: true },
    });
    const rows = buildModuleManagementRows(state);
    const imageRuntime = rows.find((row) => row.definition.id === "image-runtime");
    const imageCompression = rows.find((row) => row.definition.id === "image-compression");

    expect(imageRuntime?.canDelete).toBe(true);
    expect(imageRuntime?.canRestore).toBe(true);
    expect(imageRuntime?.dependentLabels).toContain("图像压缩");
    expect(imageCompression?.installed).toBe(true);
    expect(imageCompression?.effectivelyEnabled).toBe(false);
    expect(imageCompression?.blockedByDependencies).toBe(true);
  });
});
