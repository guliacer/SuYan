import fs from "node:fs";
import { describe, expect, it } from "vitest";
const mode = fs.readFileSync("src/features/library/components/LibraryDirectoryMode.tsx", "utf8");
const controls = fs.readFileSync("src/features/library/components/LibraryDirectoryBrowseControls.tsx", "utf8");
const colors = fs.readFileSync("src/features/library/components/LibraryColorPalette.tsx", "utf8");
const info = fs.readFileSync("src/features/library/components/LibraryAssetInfo.tsx", "utf8");
const viewer = fs.readFileSync("src/features/library/components/LibraryMediaViewer.tsx", "utf8");
describe("quiet directory UI parity", () => {
  it("keeps repeated settings out of the default toolbar", () => {
    const header = mode.slice(mode.indexOf('<header data-feature-guide="directory-toolbar"'), mode.indexOf('</header>'));
    expect(header).toContain("<LibraryDirectoryBrowseControls");
    expect(header).not.toContain("<Segments"); expect(header).not.toContain("<Select"); expect(header).not.toContain('type="range"');
    expect(controls).toContain('role={menu ? "menu" : "dialog"}'); expect(controls).toContain("createPortal");
  });
  it("exposes dedicated view, sort, filter and size controls rather than one crowded settings dialog", () => {
    for (const label of ["瀑布流", "网格", "列表", "排序方式", "缩放素材卡片", "分类筛选", "标签筛选", "文件格式", "评分筛选", "信息面板", "卡片信息"]) expect(controls).toContain(label);
    expect(controls).not.toContain('t("浏览设置")');
    expect(controls).toContain('data-directory-view-controls');
    expect(controls).toContain('data-directory-sort-control');
    expect(controls).toContain('data-directory-filter-control');
    expect(mode).toContain('<LibraryDirectorySizeControl');
    expect(mode).not.toContain('value="tags"');
  });
  it("uses the same inherited directory palette in cards, the left tree and full-image viewer", () => {
    expect(mode).toContain("buildLibraryDirectoryColors(merged.nodes)");
    expect(mode).toContain("colors={colorsById}"); expect(mode).toContain("color: p.colors.get(node.id)");
    expect(viewer).toContain("buildLibraryDirectoryColors(model.settings.nodes)"); expect(viewer).toContain("color: directoryColors.get(node.id)");
    expect(mode).toContain("setLibraryDirectoryColor(settingsRef.current");
  });
  it("keeps quick color sampling in the detail rail instead of the gallery card title area", () => {
    expect(mode).not.toContain("LibraryAssetPaletteStrip");
    expect(info).toContain("<LibraryColorPalette colors={palette} />");
  });
  it("samples and caches a bounded palette without reaching into Node from the renderer", () => {
    expect(info).toContain("window.suyanApi.getImagePaletteSample(item.imageFileName)");
    expect(info).toContain("mediaInfoCache.get(key)");
    expect(info).not.toContain('document.createElement("canvas")');
    expect(info).not.toContain("Math.round(v/32)");
    expect(colors).toContain("window.suyanApi.writeClipboardText(code)");
    expect(colors).not.toContain("navigator.clipboard"); expect(colors).not.toContain('from "node:');
    expect(colors).toContain('value="rgb"'); expect(colors).toContain('value="css"'); expect(colors).toContain("result.ok");
    expect(colors).toContain("{code}</span>");
    expect(colors).toContain("data-palette-copy-feedback");
    expect(colors).toContain("bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground shadow-md");
    expect(colors).toContain("{t(\"已复制\")}: <span className=\"font-mono\">{copied}</span>");
  });
  it("shows a failed settings save rather than silently returning to another directory", () => {
    expect(mode).toContain('t("目录设置保存失败，已恢复上次保存的状态。")');
    expect(mode).toContain("setFeedback");
  });
  it("syncs mounted selection on locate instead of waiting until its previous folder is removed", () => {
    expect(mode).toContain("resolveLibraryDirectorySelection(selectedId, previousSavedSelectionRef.current, merged.selectedNodeId, nodesById)");
    expect(mode).toContain("setQuery(merged.searchQuery)");
    expect(viewer).toContain('categoryFilter: ""'); expect(viewer).toContain("minimumRating: 0");
  });

  it("hides selection affordances until the user enters selection mode", () => {
    expect(mode).toContain("selectionMode={selectionMode}");
    expect(mode).toContain('t("反选")');
    expect(mode).toContain('t("清空选择")');
    expect(mode).toContain("setSelectionMode(true)");
  });
});
