import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resolveReleaseEdition, releaseArtifactName, assertCleanReleaseData } = require("../../scripts/release-editions.cjs");
const roots: string[] = [];
function fixture(files: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "suyan-editions-test-"));
  roots.push(root);
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "fixture", "utf8");
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe("clean Windows release editions", () => {
  it("retains legacy names by default and distinguishes all four artifacts", () => {
    expect(releaseArtifactName("")).toBe("${productName}-Portable-${version}.${ext}");
    const names = ["lite", "full"].flatMap((edition) => [false, true].map((installer) => releaseArtifactName(edition, installer)));
    expect(new Set(names).size).toBe(4);
    expect(names.every((name: string) =>
      name.includes("${version}") &&
      !name.includes("Windows-x64") &&
      !name.includes("无数据") &&
      /-(?:安装版|便携版)-(?:无依赖|完整依赖)\.\$\{ext\}$/.test(name),
    )).toBe(true);
    expect(() => resolveReleaseEdition("fulll")).toThrow();
  });
  it("accepts a data-free lite app but rejects optional components", () => {
    expect(() => assertCleanReleaseData(fixture(["resources/app.asar"]), "lite")).not.toThrow();
    expect(() => assertCleanReleaseData(fixture(["data/components/ffmpeg/current.json"]), "lite")).toThrow();
  });
  it("full edition requires exactly its component allowlist", () => {
    const files = ["ffmpeg/current.json", "ffmpeg/6.0-suyan.1/win32-x64/ffmpeg.exe"];
    const root = fixture(files.map((file) => `data/components/${file}`));
    expect(() => assertCleanReleaseData(root, "full", files)).not.toThrow();
    expect(() => assertCleanReleaseData(root, "full", files.slice(0, 1))).toThrow();
    expect(() => assertCleanReleaseData(root, "full", [...files, "nsfw-runtime/current.json"])).toThrow();
    expect(() => assertCleanReleaseData(root, "full", [])).toThrow();
  });
  it.each(["data/account.json", "data/library/library.json", "logs/app.log", "resources/Cookies", "resources/ai-settings.json"])(
    "rejects personal payload %s", (file) => {
      expect(() => assertCleanReleaseData(fixture([file]), "full", ["ffmpeg/current.json"])).toThrow();
    },
  );
});
