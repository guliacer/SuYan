import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

describe("content security policy", () => {
  it("allows the local startup gallery image protocol", () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const imgSrcDirective = indexHtml.match(/img-src\s+([^;]+);/);

    expect(imgSrcDirective?.[1]).toContain("app-startup:");
    expect(imgSrcDirective?.[1]).toContain("app-theme:");
    expect(imgSrcDirective?.[1]).toContain("app-account-avatar:");
  });

  it("allows fetch from custom image protocols in connect-src", () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const connectSrcDirective = indexHtml.match(/connect-src\s+([^;]+);/);

    expect(connectSrcDirective?.[1]).toContain("app-image:");
    expect(connectSrcDirective?.[1]).toContain("app-thumbnail:");
    expect(connectSrcDirective?.[1]).toContain("app-theme:");
  });

  it("allows remote README video media", () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
    const mediaSrcDirective = indexHtml.match(/media-src\s+([^;]+);/);

    expect(mediaSrcDirective?.[1]).toContain("https:");
  });

  it("keeps the Vite source entry instead of generated build assets", () => {
    const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

    expect(indexHtml).toContain('src="/src/main.tsx"');
    expect(indexHtml).not.toMatch(/(?:src|href)="\.\/assets\/[^"]+\.(?:js|css)"/);
  });
});
