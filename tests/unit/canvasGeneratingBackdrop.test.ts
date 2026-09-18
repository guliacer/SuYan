import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/components/LocaleProvider";
import { CreativeCanvas } from "../../src/features/library/components/CanvasView";
import type { CanvasPhase } from "../../src/features/library/types/canvas";
import type { CanvasAtmosphereTone } from "../../src/features/library/utils/canvasGeneration";

const sample = { dataUrl: "data:image/png;base64,fixture", saved: false, requestPrompt: "春日山野" };
const canvasBackdropSource = readFileSync("src/features/library/components/CanvasBackdrop.tsx", "utf8");

function render(phase: CanvasPhase, result = sample, atmosphereTone: CanvasAtmosphereTone = "neutral") {
  return renderToStaticMarkup(createElement(LocaleProvider, null, createElement(CreativeCanvas, {
    phase, results: phase === "created" || phase === "reveal" ? [result] : [],
    lastModel: "test-image-model", thinkingKeywords: ["春日", "山野"],
    atmosphereTone,
    generationElapsedMs: null, lockedHeight: null,
    webCanvasEnabled: false, webCanvasLoginVisible: false, webCanvasLoading: false,
    webCanvasHostRef: { current: null }, archivingIndex: null, archivingBatch: false,
    onOpenPreview: vi.fn(), onDownload: vi.fn(), onCopyImage: vi.fn(), onArchive: vi.fn(),
  })));
}

describe("Canvas workspace states", () => {
  it("keeps one Creation Core anchor across idle, generation, reveal, and result", () => {
    const empty = render("empty");
    expect(empty).toContain('data-core-state="dormant"');
    expect(empty).toContain("canvas-core-logo");
    expect(empty).toContain("canvas-core-orbit");
    expect(empty).not.toContain("canvas-core-caption");

    const thinking = render("thinking");
    expect(thinking).toContain('data-core-state="awakening"');
    expect(thinking).toContain("canvas-core-particle-field");
    expect(thinking).toContain("灵感汇集ing");
    expect(thinking).not.toContain("[灵感汇集ing]");
    expect(thinking).toContain("canvas-status-card--below-core");

    const generating = render("generating");
    expect(generating).toContain('data-core-state="accumulating"');
    expect(generating.match(/canvas-core-energy-layer--(blue|violet|gold)/g)).toHaveLength(3);
    expect(generating).toContain("灵感汇集ing");
    expect(generating).not.toContain("[灵感汇集ing]");
    expect(generating).not.toContain("AI 正在显影");
    expect(generating).not.toContain("canvas-core-caption");

    expect(render("reveal")).toContain('data-core-state="reveal"');
    expect(render("created")).toContain('data-core-state="result"');
  });

  it("uses the signed-in user's avatar for the creation core and falls back safely", () => {
    expect(canvasBackdropSource).toContain("useAccountUser");
    expect(canvasBackdropSource).toContain("user?.avatarUrl");
    expect(canvasBackdropSource).toContain("avatarFailed");
    expect(canvasBackdropSource).toContain("onError={() => setAvatarFailed(true)}");
    expect(canvasBackdropSource).toContain("<AppLogoMark className=\"canvas-core-logo\" />");
  });

  it("announces the real phase and keeps result actions out of the waiting state", () => {
    expect(render("thinking")).toMatch(/role="status">灵感汇集ing<\/h3>/);
    expect(render("thinking")).toContain('data-canvas-phase="thinking"');
    const generating = render("generating");
    expect(generating).toMatch(/role="status">灵感汇集ing<\/h3>/);
    expect(generating).toContain('data-canvas-phase="busy"');
    expect(generating).toContain("canvas-formation-field");
    expect(generating).toContain("canvas-ai-scan");
    expect(generating).toContain("春日");
    expect(generating).toContain("山野");
    expect(render("generating", sample, "ocean")).toContain('data-canvas-tone="ocean"');
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
