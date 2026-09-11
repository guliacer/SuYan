import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (filePath: string) => readFileSync(filePath, { encoding: "utf8" });

describe("renderer error recovery contract", () => {
  it("keeps a top-level recovery view around the entire app", () => {
    const entry = read("src/main.tsx");
    const boundary = read("src/components/ui/AppErrorBoundary.tsx");

    expect(entry).toContain("<AppErrorBoundary>");
    expect(entry).toContain("renderer:uncaught-error");
    expect(entry).toContain("renderer:unhandled-rejection");
    expect(boundary).toContain("componentDidCatch");
    expect(boundary).toContain("render:error-boundary");
    expect(boundary).toContain("window.location.reload()");
  });

  it("records renderer console failures and unresponsive states", () => {
    const main = read("electron/main/index.ts");

    expect(main).toContain("watchRendererDiagnostics(mainWindow)");
    expect(main).toContain('window.webContents.on("console-message"');
    expect(main).toContain('logger.error("renderer", "console-error"');
    expect(main).toContain('window.webContents.on("unresponsive"');
    expect(main).toContain('window.webContents.on("responsive"');
  });
});
