import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeLibraryViewSettings } from "../../electron/main/library/viewSettingsStore";
import { featureGuideDefinitions } from "../../src/features/library/components/featureGuides";

const featureGuideSource = readFileSync("src/features/library/components/FeatureGuide.tsx", "utf8");
const titleBarSource = readFileSync("src/features/library/components/shell/AppTitleBar.tsx", "utf8");
const canvasViewSource = readFileSync("src/features/library/components/CanvasView.tsx", "utf8");
const libraryViewSource = readFileSync("src/features/library/components/LibraryView.tsx", "utf8");
const promptDetailSource = readFileSync("src/features/library/components/PromptDetailDialog.tsx", "utf8");
const connectionSource = readFileSync("src/features/library/components/AiConnectionSection.tsx", "utf8");
const rulesSource = readFileSync("src/features/library/components/AiRulesSection.tsx", "utf8");
const systemPreferencesSource = readFileSync("src/features/library/components/SystemPreferencesDialog.tsx", "utf8");
const releaseOnboardingSource = readFileSync("src/features/library/components/ReleaseOnboardingDialog.tsx", "utf8");

describe("feature guides", () => {
  it("keeps legacy settings compatible and starts every guide as incomplete", () => {
    expect(normalizeLibraryViewSettings({}).featureGuideCompleted).toEqual([]);
    expect(normalizeLibraryViewSettings({}).featureGuideVersion).toBeNull();
    expect(normalizeLibraryViewSettings({ featureGuideVersion: " 0.3.23 " }).featureGuideVersion).toBe("0.3.23");
    expect(normalizeLibraryViewSettings({ featureGuideVersion: 23 }).featureGuideVersion).toBeNull();
  });

  it("shows version onboarding for new installs and upgrades, then persists the acknowledged version", () => {
    expect(releaseOnboardingSource).toContain("本次更新引导");
    expect(releaseOnboardingSource).toContain("升级前提醒");
    expect(libraryViewSource).toContain("featureGuideVersion !== appVersion");
    expect(libraryViewSource).toContain("completeFeatureOnboarding(appVersion)");
    expect(libraryViewSource).toContain("!shouldShowReleaseOnboarding");
  });

  it("normalizes completed guide ids without duplicates or invalid values", () => {
    expect(
      normalizeLibraryViewSettings({ featureGuideCompleted: ["home", "home", 42, "canvas"] }).featureGuideCompleted,
    ).toEqual(["home", "canvas"]);
  });

  it("defines a complete guide with anchored steps for every sidebar feature", () => {
    expect(Object.keys(featureGuideDefinitions)).toHaveLength(23);
    for (const definition of Object.values(featureGuideDefinitions)) {
      expect(definition.steps.length).toBeGreaterThanOrEqual(3);
      expect(definition.steps.length).toBeLessThanOrEqual(10);
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.intro.length).toBeGreaterThan(0);
      expect(definition.steps.every((step) => step.target.trim().length > 0)).toBe(true);
      expect(definition.steps.every((step) => step.description.length > 0)).toBe(true);
      expect(definition.steps.every((step) => !step.target.includes("data-feature-guide-page"))).toBe(true);
    }
  });

  it("keeps batch-management steps bound to their exact controls", () => {
    expect(featureGuideDefinitions.promptLibrary.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="prompt-library-selection"]',
      "#prompt-library-manager-search",
      '[data-feature-guide="prompt-library-actions"]',
      '[data-feature-guide="prompt-library-actions"]',
      '[data-feature-guide="prompt-library-actions"]',
    ]);
  });

  it("explains home layout controls with exact title-bar and sidebar targets", () => {
    expect(featureGuideDefinitions.home.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="sidebar-toggle"]',
      '[data-feature-guide="sidebar-resize"], [data-feature-guide="sidebar-toggle"]',
      '[data-feature-guide="window-always-on-top"]',
      '[aria-label="搜索提示词"]',
      '[data-feature-guide="gallery-collection"]',
      '[data-feature-guide="gallery-display"]',
      '[data-feature-guide="gallery-sort"]',
      '[data-feature-guide="gallery-results"]',
    ]);
    expect(titleBarSource).toContain('data-feature-guide="sidebar-toggle"');
    expect(titleBarSource).toContain('dataFeatureGuide="window-always-on-top"');
    expect(libraryViewSource).toContain('data-feature-guide="sidebar-resize"');
  });

  it("keeps the canvas tour anchored to stable editor, resize, collapse, config, action, and output regions", () => {
    expect(featureGuideDefinitions.canvas.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="canvas-prompt-editor"]',
      '[data-feature-guide="canvas-prompt-resize"]',
      '[data-feature-guide="canvas-creation-panel-toggle"]',
      '[data-feature-guide="canvas-prompt-actions"]',
      '[data-feature-guide="canvas-generation-settings"]',
      '[data-feature-guide="canvas-model-config"]',
      '[data-feature-guide="canvas-generation-actions"]',
      '[data-feature-guide="canvas-output"]',
    ]);
    expect(canvasViewSource).toContain('data-feature-guide={field === "positive" ? "canvas-prompt-resize" : undefined}');
    expect(canvasViewSource).toContain('data-feature-guide="canvas-creation-panel-toggle"');
  });

  it("keeps fallback targets in their declared priority order", () => {
    expect(featureGuideSource).toContain('const selectors = selector\n        .split(",")');
    expect(featureGuideSource).toContain(".map((candidateSelector) =>");
    expect(featureGuideSource).toContain(".find((candidate): candidate is HTMLElement => Boolean(candidate))");
  });

  it("guides AI connection setup and rule configuration with exact controls", () => {
    expect(featureGuideDefinitions.aiSettings.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="ai-connection-list"]',
      '[data-feature-guide="ai-connection-credentials"]',
      '[data-feature-guide="ai-connection-actions"]',
      '[data-feature-guide="ai-model-list"]',
      '[data-feature-guide="ai-rules-actions"]',
      '[data-feature-guide="ai-rules-configuration"]',
    ]);
    for (const marker of [
      "ai-connection-list",
      "ai-connection-credentials",
      "ai-connection-actions",
      "ai-model-list",
    ]) {
      expect(connectionSource).toContain(`data-feature-guide="${marker}"`);
    }
    for (const marker of ["ai-rules-actions", "ai-rules-configuration", "ai-rules-model", "ai-rules-content"]) {
      expect(rulesSource).toContain(`data-feature-guide="${marker}"`);
    }
  });

  it("opens each system settings section while explaining its actual controls", () => {
    expect(featureGuideDefinitions.systemPreferences.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="system-preferences-panel-proxy"]',
      '[data-feature-guide="system-preferences-panel-canvasBackground"]',
      '[data-feature-guide="system-preferences-panel-layout"]',
      '[data-feature-guide="system-preferences-panel-sidebar"]',
      '[data-feature-guide="system-preferences-panel-modules"]',
      '[data-feature-guide="system-preferences-panel-startupGallery"]',
    ]);
    expect(systemPreferencesSource).toContain("data-feature-guide={`system-preferences-section-${entry}`} ".trim());
    expect(libraryViewSource).toContain("systemPreferenceGuideSections");
    expect(featureGuideSource).toContain("onStepChange?.(stepIndex)");
  });

  it("does not retain the removed startup acceleration entry", () => {
    expect(systemPreferencesSource).not.toContain("PerformanceSettingsDialog");
    expect(systemPreferencesSource).not.toContain('section === "performance"');
    expect(systemPreferencesSource).not.toContain("system-preferences-panel-performance");
    expect(featureGuideDefinitions.systemPreferences.steps.map((step) => step.title)).not.toContain("启动加速");
  });

  it("uses the home chrome treatment for the system settings shell", () => {
    expect(systemPreferencesSource).toContain("app-chrome-surface");
    expect(systemPreferencesSource).toContain("text-chrome-foreground");
    expect(systemPreferencesSource).toContain("max-w-[min(1180px,calc(100vw-2rem))]");
    expect(systemPreferencesSource).toContain('variant="chrome"');
  });

  it("keeps language and display mode in a responsive two-card row", () => {
    expect(systemPreferencesSource).toContain('className="grid gap-3 min-[720px]:grid-cols-2"');
    expect(systemPreferencesSource).toContain('<h4 className="text-sm font-semibold text-foreground">{t("界面语言")}</h4>');
    expect(systemPreferencesSource).toContain('<h4 className="text-sm font-semibold text-foreground">{t("显示模式")}</h4>');
    expect(systemPreferencesSource).toContain('{t("选择浅色或深色界面。")}');
  });

  it("keeps every system settings section on the same responsive height", () => {
    expect(systemPreferencesSource).toContain(
      'panelClassName="flex h-[min(820px,calc(100dvh-2rem))] min-h-0 w-full max-w-[min(1180px,calc(100vw-2rem))] flex-col"',
    );
  });

  it("guides the split visual life controls for new and upgraded users", () => {
    expect(featureGuideDefinitions.visualLife.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="visual-life-sheen-toggle"]',
      '[data-feature-guide="visual-life-outer-toggle"]',
      '[data-feature-guide="visual-life-effect-pool"]',
      '[data-feature-guide="visual-life-mode"], [data-feature-guide="visual-life-intensity"]',
    ]);
    for (const marker of ["visual-life-sheen-toggle", "visual-life-outer-toggle", "visual-life-effect-pool", "visual-life-intensity", "visual-life-mode"]) {
      expect(systemPreferencesSource).toContain("data-feature-guide=\"" + marker + "\"");
    }
    expect(libraryViewSource).toContain('activeFeatureGuideId === "visualLife"');
    expect(libraryViewSource).toContain('openSystemPreferences("visualLife")');
  });

  it("shows the guide overview only on the first step", () => {
    expect(featureGuideSource).toContain(
      "{stepIndex === 0 ? <p className=\"mt-1 text-xs leading-5 text-muted\">{localizedIntro}</p> : null}",
    );
  });

  it("keeps the canvas editor and action highlights separate and retries lazy targets", () => {
    expect(canvasViewSource).toContain('data-feature-guide={field === "positive" ? "canvas-prompt-editor" : undefined}');
    expect(canvasViewSource).toContain('<div data-feature-guide="canvas-prompt-actions"');
    expect(canvasViewSource.indexOf("{actionRows ?? (")).toBeGreaterThan(
      canvasViewSource.indexOf('data-feature-guide={field === "positive" ? "canvas-prompt-editor" : undefined}'),
    );
    expect(featureGuideSource).toContain("const targetLookupRetryMs = 2400;");
    expect(featureGuideSource).toContain("const scheduleTargetRetry = () => {");
    expect(featureGuideSource).toContain("targetLookupRetryDelayMs");
    expect(featureGuideSource).toContain("new ResizeObserver(() => scheduleUpdate())");
    expect(featureGuideSource).toContain("resizeObserver?.observe(target)");
  });

  it("guides the completed-generation fullscreen preview with exact regions", () => {
    expect(featureGuideDefinitions.canvasResult.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="canvas-fullscreen-media"]',
      '[data-feature-guide="canvas-fullscreen-navigation"], [data-feature-guide="canvas-fullscreen-media"]',
      '[data-feature-guide="canvas-fullscreen-actions"]',
      '[data-feature-guide="canvas-fullscreen-prompt"]',
      '[data-feature-guide="canvas-fullscreen-close"]',
    ]);
    for (const marker of [
      "canvas-fullscreen-media",
      "canvas-fullscreen-navigation",
      "canvas-fullscreen-actions",
      "canvas-fullscreen-close",
    ]) {
      expect(canvasViewSource).toContain(`data-feature-guide="${marker}"`);
    }
    expect(canvasViewSource).toContain('dataFeatureGuide="canvas-fullscreen-prompt"');
    expect(canvasViewSource).toContain("data-feature-guide={dataFeatureGuide}");
    expect(canvasViewSource).toContain("onFullscreenPreviewChange(true)");
    expect(canvasViewSource).toContain("onFullscreenPreviewChange(false)");
    expect(libraryViewSource).toContain("isCanvasResultPreviewOpen");
    expect(libraryViewSource).toContain('return "canvasResult"');
    expect(libraryViewSource).toContain("onFullscreenPreviewChange={handleCanvasResultPreviewChange}");
  });

  it("keeps the main content tours separated from the home search selector", () => {
    expect(featureGuideDefinitions.textPrompts.steps.some((step) => step.target.includes("prompt-ideas"))).toBe(true);
    expect(featureGuideDefinitions.textPrompts.steps.some((step) => step.target === '#prompt-library-search')).toBe(false);
  });

  it("explains the visible regions of a grid prompt card", () => {
    expect(featureGuideDefinitions.promptCard.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="prompt-card-title"]',
      '[data-feature-guide="prompt-card-media"]',
      '[data-feature-guide="prompt-card-content"]',
      '[data-feature-guide="prompt-card-tags"]',
      '[data-feature-guide="prompt-card-actions"]',
    ]);
    for (const marker of ["prompt-card-title", "prompt-card-media", "prompt-card-content", "prompt-card-tags", "prompt-card-actions"]) {
      expect(libraryViewSource).toContain(`data-feature-guide="${marker}"`);
    }
  });

  it("keeps the masonry prompt card guide honest about its available regions", () => {
    expect(featureGuideDefinitions.promptCardMasonry.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="prompt-card-masonry-media"]',
      '[data-feature-guide="prompt-card-masonry-status"], [data-feature-guide="prompt-card-masonry-media"]',
      '[data-feature-guide="prompt-card-masonry-card"]',
    ]);
    for (const marker of ["prompt-card-masonry-card", "prompt-card-masonry-media", "prompt-card-masonry-status"]) {
      expect(libraryViewSource).toContain(`data-feature-guide="${marker}"`);
    }
  });

  it("explains each visible region of the prompt detail dialog", () => {
    expect(featureGuideDefinitions.promptDetail.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="prompt-detail-media"]',
      '[data-feature-guide="prompt-detail-media-actions"]',
      '[data-feature-guide="prompt-detail-header"]',
      '[data-feature-guide="prompt-detail-category"]',
      '[data-feature-guide="prompt-detail-tags"]',
      '[data-feature-guide="prompt-detail-ai-quick-switch"]',
      '[data-feature-guide="prompt-detail-reference-image"], [data-feature-guide="prompt-detail-prompt-actions"]',
      '[data-feature-guide="prompt-detail-prompt-actions"]',
      '[data-feature-guide="prompt-detail-prompt"]',
      '[data-feature-guide="prompt-detail-actions"]',
    ]);
    for (const marker of [
      "prompt-detail-media",
      "prompt-detail-media-actions",
      "prompt-detail-header",
      "prompt-detail-category",
      "prompt-detail-tags",
      "prompt-detail-ai-quick-switch",
      "prompt-detail-reference-image",
      "prompt-detail-prompt-actions",
      "prompt-detail-prompt",
      "prompt-detail-actions",
    ]) {
      expect(promptDetailSource).toContain(`data-feature-guide="${marker}"`);
    }
    expect(libraryViewSource).toContain('detailItemId && !featureGuideCompleted.includes("promptDetail")');
    expect(libraryViewSource).toContain('(!detailItemId || activeFeatureGuideId === "promptDetail")');
  });

  it("explains every import menu option with its own highlight target", () => {
    expect(featureGuideDefinitions.importMaterial.steps.map((step) => step.target)).toEqual([
      '[data-feature-guide="import-menu"]',
      '[data-feature-guide="import-image"]',
      '[data-feature-guide="import-directory"]',
      '[data-feature-guide="import-clipboard"]',
      '[data-feature-guide="import-document"]',
      '[data-feature-guide="import-share"]',
    ]);
    for (const guideId of ["import-image", "import-directory", "import-clipboard", "import-document", "import-share"]) {
      expect(libraryViewSource).toContain(`guideId="${guideId}"`);
    }
  });

  it("keeps guide controls from triggering the import menu outside-click handler", () => {
    expect(featureGuideSource).toContain('data-feature-guide-overlay="true"');
    expect(libraryViewSource).toContain('target.closest(\'[data-feature-guide-overlay="true"]\')');
  });
});
