import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

describe("content security policy", () => {
  it("allows the local startup gallery image protocol", () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const imgSrcDirective = indexHtml.match(/img-src\s+([^;]+);/);

    expect(imgSrcDirective?.[1]).toContain("app-startup:");
  });

  it("keeps the Vite source entry instead of generated build assets", () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

    expect(indexHtml).toContain('src="/src/main.tsx"');
    expect(indexHtml).not.toMatch(/(?:src|href)="\.\/assets\/[^"]+\.(?:js|css)"/);
  });
});
