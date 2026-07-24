import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExternalMediaPath, validateExternalRemap } from "@/features/library/utils/externalMediaPath";

describe("resolveExternalMediaPath", () => {
  it("keeps Chinese relative paths under their registered root", () => {
    expect(resolveExternalMediaPath("/media/素材库", "角色/样例.png")).toBe(
      path.resolve("/media/素材库", "角色/样例.png"),
    );
  });

  it("rejects path traversal outside the registered root", () => {
    expect(() => resolveExternalMediaPath("/media/素材库", "../private/secret.png")).toThrow(
      "EXTERNAL_MEDIA_PATH_INVALID",
    );
  });

  it("rejects a remap when any stored relative path escapes the new root", () => {
    expect(() => validateExternalRemap("/media/new-root", ["角色/a.png", "../../secret.png"])).toThrow(
      "EXTERNAL_MEDIA_PATH_INVALID",
    );
  });

  it("accepts a remap when all entries remain beneath the new root", () => {
    expect(() => validateExternalRemap("/media/new-root", ["角色/a.png", "视频/b.mp4"])).not.toThrow();
  });
});
