import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync("src/components/ui/ExportProgressPanel.tsx", "utf8");
const tokenSource = readFileSync("src/styles/tokens.css", "utf8");

describe("export progress panel placement", () => {
  it("uses the shared content-safe viewport instead of a screen corner", () => {
    expect(panelSource).toContain('className="export-progress-viewport"');
    expect(panelSource).not.toContain("fixed bottom-4 right-4");
    expect(panelSource).toContain("createPortal(");
    expect(panelSource).toContain("document.body");
  });

  it("centers the modeless panel inside the content area", () => {
    const viewportBlock = tokenSource.match(/\.export-progress-viewport\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(viewportBlock).toContain("inset: var(--app-window-content-top) var(--app-window-gutter) var(--app-window-gutter);");
    expect(viewportBlock).toContain("display: flex;");
    expect(viewportBlock).toContain("align-items: center;");
    expect(viewportBlock).toContain("justify-content: center;");
    expect(viewportBlock).toContain("pointer-events: none;");
    expect(viewportBlock).toContain("z-index: 2147483645;");
  });
});
