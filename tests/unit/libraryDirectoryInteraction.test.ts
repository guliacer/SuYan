import fs from "node:fs";
import { describe, expect, it } from "vitest";
const source = fs.readFileSync("src/features/library/components/LibraryDirectoryMode.tsx", "utf8");
const asset = source.slice(source.indexOf("const DirectoryAsset ="), source.indexOf("function Tool("));
describe("directory interaction contract", () => {
  it("updates the right-side asset info on click and opens the image preview on double click", () => {
    expect(asset).not.toContain("onActivate={() => p.onFocus");
    expect(asset).toContain("onDoubleClick");
    expect(asset).toContain("p.onOpenViewer(raw.id)");
    expect(asset).not.toContain("p.onOpenDetail(raw.id)");
    expect(asset).toContain("selectionMode");
    const selectBlock = source.slice(source.indexOf("const selectItem"), source.indexOf("const toggleItem"));
    expect(selectBlock).toContain("setDetailItemId(id)");
    expect(source).toContain("onOpenViewer={id => openFocusedViewer(id, false)}");
    const view = fs.readFileSync("src/features/library/components/LibraryView.tsx", "utf8");
    expect(view).toContain("<LibraryMediaViewer");
    expect(view).toContain("initialPromptExpanded={promptExpanded}");
    const viewer = fs.readFileSync("src/features/library/components/LibraryMediaViewer.tsx", "utf8");
    expect(viewer).toContain('aria-label={isPromptExpanded ? t("收起提示词") : t("展开提示词")}');
  });
  it("separates right-side selection from the left format badge", () => {
    expect(asset).toContain('data-directory-selection className="absolute right-11 top-2');
    expect(asset).toContain("data-directory-format");
  });
  it("places the selection action left of the favorite action on cards", () => {
    const selectionAt = asset.indexOf('data-directory-selection className="absolute right-11 top-2');
    const favoriteAt = asset.indexOf('aria-label={p.favorite ? t("取消收藏") : t("收藏素材")}');
    expect(selectionAt).toBeGreaterThan(-1);
    expect(favoriteAt).toBeGreaterThan(selectionAt);
    expect(asset).toContain('absolute right-2 top-2 z-10 flex size-7');
  });
  it("keeps exit exclusively in the left sidebar and removes its duplicate lower add button", () => {
    const sidebar = source.slice(source.indexOf('<aside data-directory-sidebar'), source.indexOf('<main data-feature-guide="directory-results"'));
    expect(sidebar).toContain('data-feature-guide="directory-exit"');
    expect(sidebar).not.toContain('label={t("添加素材目录")}');
    const footer = source.slice(source.indexOf('<footer'), source.indexOf('{operation ?'));
    expect(footer).not.toContain("退出目录模式");
  });
  it("renders directories as browsable album cards rather than flattening them into image rows", () => {
    expect(source).toContain("data-directory-folder");
    expect(source).toContain("isDirectoryOverview");
  });

  it("keeps the context-menu prompt action and leaves the full prompt editor lazy", () => {
    expect(source).toContain("const [detailItemId, setDetailItemId]");
    expect(source).toContain("settings.showDetails && detailItem");
    expect(source).toMatch(/openFocusedViewer\(item\.id,\s*true\)/);
    expect(source).not.toContain("props.onOpenDetail");
    expect(source).toContain('event.key === "Enter"');
    const assetInfo = fs.readFileSync("src/features/library/components/LibraryAssetInfo.tsx", "utf8");
    expect(assetInfo).not.toContain("data-asset-prompt-detail");
    const view = fs.readFileSync("src/features/library/components/LibraryView.tsx", "utf8");
    expect(view).toContain("initialPromptExpanded={promptExpanded}");
    expect(view).toContain("renderPromptPanel={renderPromptPanelForItem}");
    expect(view).toContain("embedded");
  });
  it("keeps the directory tree resizable and lets the title-bar toggle hide it", () => {
    expect(source).toContain("LibraryDirectoryResizeHandle");
    const viewer = fs.readFileSync("src/features/library/components/LibraryMediaViewer.tsx", "utf8");
    expect(viewer).toContain("showDirectoryTree");
    expect(viewer).toContain("onExitDirectory");
  });
});
