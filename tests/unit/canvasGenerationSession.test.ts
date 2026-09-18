import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { orderCanvasResultsForDisplay } from "../../src/features/library/components/CanvasView";

const projectRoot = path.resolve(__dirname, "../..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("canvas generation preview session", () => {
  it("shows newer batches first while preserving each batch's image order", () => {
    const ordered = orderCanvasResultsForDisplay([
      { dataUrl: "batch-1-image-1", saved: false, generationBatchId: 1 },
      { dataUrl: "batch-1-image-2", saved: false, generationBatchId: 1 },
      { dataUrl: "batch-2-image-1", saved: false, generationBatchId: 2 },
      { dataUrl: "batch-2-image-2", saved: false, generationBatchId: 2 },
    ]);

    expect(ordered.map(({ result }) => result.dataUrl)).toEqual([
      "batch-2-image-1",
      "batch-2-image-2",
      "batch-1-image-1",
      "batch-1-image-2",
    ]);
    expect(ordered.map(({ index }) => index)).toEqual([2, 3, 0, 1]);
  });

  it("keeps preview images and model in the library store across CanvasView remounts", () => {
    const storeSource = readSource("src/features/library/store/useLibraryStore.ts");
    const libraryViewSource = readSource("src/features/library/components/LibraryView.tsx");
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");

    expect(storeSource).toContain("canvasGenerationResults: []");
    expect(storeSource).toContain('canvasLastModel: ""');
    expect(storeSource).toContain("canvasLastGenerationCount: 0");
    expect(storeSource).toContain("setCanvasGenerationResults: (results)");
    expect(storeSource).toContain("setCanvasLastGenerationCount: (count)");
    expect(libraryViewSource).toContain("generationResults={canvasGenerationResults}");
    expect(libraryViewSource).toContain("lastGenerationModel={canvasLastModel}");
    expect(canvasSource).toContain("<CanvasResultsPanel");
    expect(canvasSource).toContain("results={results}");
    expect(canvasSource).not.toMatch(/const \[results, setResults\]/);
    expect(canvasSource).not.toMatch(/useState<CanvasGenerationResult\[\]>/);
    expect(canvasSource).not.toContain("const [results, setResults]");
    expect(canvasSource).not.toContain("const [lastModel, setLastModel]");
  });

  it("shows a short parsing phase while the real request starts immediately", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");
    // 旧实现：setTimeout(() => runGeneration, thinkingPhaseMs) 串行延迟真实请求。
    // 新实现：请求与 thinking 并行，thinking 只由独立短计时器推进。
    expect(canvasSource).not.toContain("thinkingPhaseMs");
    expect(canvasSource).not.toContain("thinkingTimerRef");
    expect(canvasSource).not.toContain("setTimeout(() => {\n      void runGeneration");
    // 真实请求改为立即发起。
    expect(canvasSource).toContain("void runGeneration(cleanPrompt, generationRunId);");
    expect(canvasSource).toContain("const parsingTimer = window.setTimeout");
    expect(canvasSource).toContain("promptParsingPhaseMs");
    expect(canvasSource).toContain("waitForCanvasPhaseWindow(parsingStartedAt, promptParsingPhaseMs)");
    expect(canvasSource).toContain("state.canvasPhase === \"thinking\"");
  });

  it("preserves the previous batch when a new generation fails", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");
    // 旧实现：点击生成立即 onGenerationResultsChange([]) 清空旧预览，失败后清成空态。
    // 新实现：不再立即清空；失败时按是否有旧预览回退到 created/empty，而非无条件 empty。
    expect(canvasSource).not.toContain("onGenerationResultsChange([]);");
    expect(canvasSource).toContain("canvasGenerationResults.length > 0 ? \"created\" : \"empty\"");
  });

  it("appends every successful batch and only patches the current batch after archiving", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");

    expect(canvasSource).toContain("const existingResults = useLibraryStore.getState().canvasGenerationResults;");
    expect(canvasSource).toContain("onGenerationResultsChange([...existingResults, ...previewResults]);");
    expect(canvasSource).toContain("setCanvasLastGenerationCount(previewResults.length);");
    expect(canvasSource).toContain("currentGenerationCount={lastGenerationCount}");
    expect(canvasSource).toContain("const currentResults = useLibraryStore.getState().canvasGenerationResults;");
    expect(canvasSource).toContain("currentResults.map((existing) => {");
    expect(canvasSource).toContain("previewResults.findIndex((candidate) => candidate.dataUrl === existing.dataUrl)");
    expect(canvasSource).toContain("currentResults.map((existing, existingIndex) =>");
    expect(canvasSource).toContain("const pendingResultIndices = results.reduce<number[]>((indices, result, index) => {");
    expect(canvasSource).toContain("const pendingIndex = pendingResultIndices.indexOf(resultIndex);");
    expect(canvasSource).toContain("generationBatchId: generationRunId");
    expect(canvasSource).toContain("const orderedResults = orderCanvasResultsForDisplay(results);");
    expect(canvasSource).toContain("resultsListRef.current?.scrollTo({ top: 0, behavior: \"smooth\" });");
    expect(canvasSource).toContain("currentGenerationCount = results.length");
    expect(canvasSource).toContain("const latestBatchSize = Math.min(Math.max(1, currentGenerationCount), total);");
    expect(canvasSource).toContain("canvas-results-panel__list min-h-0 max-h-full flex-1");
    expect(canvasSource).toContain("overflow-y-auto overscroll-contain");
  });

  it("keeps the generated-work area inside the creation height and exposes a resizable scroll surface", () => {
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");
    expect(canvasSource).toContain("lockedHeight={isCreationPanelCollapsed ? null : creationPanelHeight}");
    expect(canvasSource).toContain("role=\"separator\"");
    expect(canvasSource).toContain("aria-label={t(\"调整生成作品区宽度\")}");
    expect(canvasSource).toContain("overflow-y-auto overscroll-contain");
    expect(canvasSource).toContain("resultsListRef.current?.scrollTo({ top: 0, behavior: \"smooth\" })");
  });

  it("guards phase completion against unmounts and stale generation runs", () => {
    const storeSource = readSource("src/features/library/store/useLibraryStore.ts");
    const canvasSource = readSource("src/features/library/components/CanvasView.tsx");

    expect(storeSource).toContain("canvasGenerationRunId: 0");
    expect(storeSource).toContain("setCanvasGenerationRunId: (runId)");
    expect(canvasSource).toContain("const generationRunId = useLibraryStore.getState().canvasGenerationRunId + 1;");
    expect(canvasSource).not.toContain("revealTimerRef");
    expect(canvasSource).toContain("state.canvasGenerationRunId === generationRunId && state.canvasPhase === \"reveal\"");
    expect(canvasSource).toContain("window.clearTimeout(parsingTimer)");
  });
});
