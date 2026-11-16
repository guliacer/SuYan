import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync("src/features/library/components/LibraryView.tsx", "utf8");
const has = (text: string, part = source) => expect(part.includes(text), text).toBe(true);
function between(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("large-image detail integration", () => {
  it("opens the stable viewer instead of remounting it for every selected image", () => {
    has("<LibraryMediaViewer");
    has("currentItemId={itemId}");
    has("currentItemId={detailItem.id}");
    expect(source).not.toMatch(/key=\{detailItem(?:Id|\.id)\}/);
  });

  it("keeps the editor lazy and opens its complete functions only in the expanded panel", () => {
    has('lazy(() => import("./PromptDetailDialog")');
    expect(source.includes("detail-dialog:prefetched")).toBe(false);
    const panel = between("function renderPromptPanelForItem", "const handleCopyPromptItem");
    for (const token of ['presentation="panel"', "onClose={onCollapse}", "onAnalyzePrompt={analyzePromptWithAi}",
      "onSaveAiRecognitionSourcePreferences={saveAiRecognitionSourcePreferences}", "onPushPromptToCanvas=", "onShareGroup="]) has(token, panel);
  });

  it("shares editable metadata saving between the selection rail and the viewer", () => {
    for (const token of ["renderInfo={renderMediaViewerInfo}", "<LibraryAssetInfo", "onSave={handleSaveLibraryAssetInfo}", "onSaveItem={handleSaveLibraryAssetInfo}"]) has(token);
  });

  it("opens indexed assets before progressive prompt-card generation finishes", () => {
    has("const rawItem = libraryItemById.get(detailItemId)");
    has("rawItem ? toPromptCardData(rawItem) : null");
  });

  it("locates the selected direct directory without flattening its descendants", () => {
    has("const locateMediaViewerItem");
    has("includeDescendants: false");
    has("setIsLibraryRootsOpen(true)");
  });

  it("keeps viewer navigation controls inside the image stage and removes the fixed navigation row", () => {
    const mediaViewer = fs.readFileSync("src/features/library/components/LibraryMediaViewer.tsx", "utf8");
    expect(mediaViewer).toContain("data-media-viewer-stage");
    expect(mediaViewer).toContain("上一张");
    expect(mediaViewer).toContain("下一张");
    expect(mediaViewer).not.toContain("方向键 / PageUp / PageDown 切换素材");
  });

  it("renders the directory viewer inside the directory workspace instead of a second full-screen page", () => {
    const directoryProps = between("<LibraryDirectoryMode", "onExportImage=");
    has("renderFocusedViewer={", directoryProps);
    has("embedded", directoryProps);
    has("directoryOnly", directoryProps);
    has("showDirectoryTree={false}", directoryProps);
    has("initialPromptExpanded={promptExpanded}", directoryProps);
    has("promptRequestToken={promptRequestToken}", directoryProps);
    has("onImmersiveChange={callbacks.onImmersiveChange}", directoryProps);
    has("detailItem && !isLibraryRootsOpen", source);
    expect(source).not.toContain("showDirectoryTree={isLibraryRootsOpen && isDirectoryTreeOpen}");
  });

  it("routes the shared title-bar toggle to the directory sidebar in every mode", () => {
    has("function toggleActiveSidebar()");
    has("toggleSidebar();");
    has("isSidebarOpen={isSidebarOpen} onToggleSidebar={toggleActiveSidebar}");
    expect(source).not.toContain("toggleViewerDirectoryTree");
    const mediaViewer = fs.readFileSync("src/features/library/components/LibraryMediaViewer.tsx", "utf8");
    expect(mediaViewer).toContain("data-media-viewer-directory-toggle");
    expect(mediaViewer).toContain("!isImmersive && showDirectoryTree ? <ViewerDirectoryTree");
    expect(mediaViewer).toContain("style={{ width: sidebarWidth }}");
    expect(mediaViewer).not.toContain("treeOpen ? sidebarWidth : 44");
    expect(mediaViewer).not.toContain("data-media-viewer-directory-toggle-button");
    expect(mediaViewer).not.toContain("PanelLeftClose");
    expect(mediaViewer).not.toContain("aria-label={isDirectoryTreeOpen");
  });
});
