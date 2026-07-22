import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  normalizeAuthorText,
  resolveIntegrityAuthor,
  writeIntegrityManifest,
} = require("../../scripts/write-integrity-manifest.cjs") as {
  normalizeAuthorText: (author: unknown) => string;
  resolveIntegrityAuthor: (author: unknown) => string;
  writeIntegrityManifest: (
    stageDir: string,
    sourcePackage: Record<string, unknown>,
  ) => { author: string; fileCount: number };
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("write-integrity-manifest", () => {
  it("normalizes object authors and always brands with 素言", () => {
    expect(normalizeAuthorText({ name: "guliacer", url: "https://example.com" })).toBe(
      "guliacer https://example.com",
    );
    expect(resolveIntegrityAuthor({ name: "guliacer" })).toContain("素言");
    expect(resolveIntegrityAuthor("素言 SuYan")).toBe("素言 SuYan");
  });

  it("writes a branded author string into app-integrity.json", () => {
    const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "suyan-integrity-"));
    tempRoots.push(stageDir);

    const files = {
      "package.json": '{"name":"suyan"}\n',
      "dist-electron/electron/main/index.js": "console.log(1)\n",
      "dist-electron/electron/preload/index.js": "console.log(2)\n",
      "dist/index.html": "<html></html>\n",
      "dist/assets/index-test.js": "export default 1\n",
    };

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = path.join(stageDir, ...relativePath.split("/"));
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content, "utf8");
    }

    const summary = writeIntegrityManifest(stageDir, {
      name: "suyan",
      author: { name: "guliacer", url: "https://github.com/guliacer" },
      build: {
        productName: "素言",
        appId: "local.suyan",
      },
    });

    expect(summary.author).toContain("素言");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(stageDir, "app-integrity.json"), "utf8"),
    ) as { author: string; productName: string; files: Record<string, string> };
    expect(typeof manifest.author).toBe("string");
    expect(manifest.author).toContain("素言");
    expect(manifest.productName).toBe("素言");
    expect(Object.keys(manifest.files).length).toBeGreaterThanOrEqual(4);
  });
});

describe("package-win stage identity", () => {
  it("stages productName and branded author for runtime integrity", () => {
    const script = fs.readFileSync(
      path.resolve(__dirname, "../../package-win.cjs"),
      "utf8",
    );
    expect(script).toContain("productName: sourcePackage.build.productName");
    expect(script).toContain("resolveIntegrityAuthor(sourcePackage.author)");
    expect(script).toContain("assertStagedRuntimeIdentity(stageDir)");
  });
});
