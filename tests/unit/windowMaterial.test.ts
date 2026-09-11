import { describe, expect, it } from "vitest";
import { supportsWindowAcrylic } from "../../electron/main/window/windowMaterial";

describe("Windows Acrylic compatibility", () => {
  it.each([
    ["win32", "10.0.22621", true], ["win32", "10.0.26200", true],
    ["win32", "10.0.22000", false], ["win32", "10.0.19045", false],
    ["darwin", "24.0.0", false], ["linux", "6.8.0", false], ["win32", "unknown", false],
  ])("%s %s uses native Acrylic: %s", (platform, release, supported) => {
    expect(supportsWindowAcrylic(platform, release)).toBe(supported);
  });
});
