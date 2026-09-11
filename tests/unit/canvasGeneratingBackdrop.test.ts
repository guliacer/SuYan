import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/components/LocaleProvider";
import { CreativeCanvas } from "../../src/features/library/components/CanvasView";
import type { CanvasPhase } from "../../src/features/library/types/canvas";

const sample = { dataUrl: "data:image/png;base64,fixture", saved: false, requestPrompt: "春日山野" };
function render(phase: CanvasPhase, result = sample) {
  return renderToStaticMarkup(createElement(LocaleProvider, null, createElement(CreativeCanvas, {
    phase, results: phase === "created" || phase === "reveal" ? [result] : [],
    lastModel: "test-image-model", thinkingKeywords: ["春日", "山野"],
    blurPreviewSrc: "", generationElapsedMs: null, lockedHeight: null,
    webCanvasEnabled: false, webCanvasLoginVisible: false, webCanvasLoading: false,
    webCanvasHostRef: { current: null }, archivingIndex: null, archivingBatch: false,
    onOpenPreview: vi.fn(), onDownload: vi.fn(), onCopyImage: vi.fn(), onArchive: vi.fn(),
  })));
}

describe("Canvas workspace states", () => {
  it("announces the real phase and keeps result actions out of the waiting state", () => {
    expect(render("thinking")).toMatch(/role="status">正在理解你的想法/);
    const generating = render("generating");
    expect(generating).toMatch(/role="status">正在创作/);
    expect(generating).toContain("春日");
    expect(generating).toContain("山野");
    expect(generating).not.toContain('aria-label="复制"');
    expect(generating).not.toContain('data-canvas-mode="result"');
  });

  it("keeps a single artwork, model metadata, and all accessible result actions", () => {
    const result = render("created");
    expect(result.match(/alt="生成结果 \d+"/g)).toHaveLength(1);
    expect(result).toContain("test-image-model");
    expect(result).toContain("春日山野");
    for (const name of ["大图", "导出", "收录", "复制"]) {
      expect(result).toContain(`aria-label="${name}"`);
    }
    expect(result).not.toMatch(/aria-label="复制"[^>]* disabled=""/);
    expect(render("created", { ...sample, saved: true })).toMatch(/aria-label="已收录"[^>]* disabled=""/);
  });

  it("reserves the completion announcement for returned results", () => {
    expect(render("empty")).not.toContain('role="status"');
    expect(render("reveal")).toContain('role="status"');
    expect(render("created")).not.toContain('role="status"');
    expect(render("created")).toContain('data-canvas-mode="result"');
  });
});
