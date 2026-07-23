import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveExternalMediaPath } from "@/features/library/utils/externalMediaPath";

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
});
