import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LibraryDirectoryMode, type LibraryDirectoryModeProps } from "../../src/features/library/components/LibraryDirectoryMode";
import { LibraryAssetInfo } from "../../src/features/library/components/LibraryAssetInfo";
import { createDefaultLibraryDirectorySettings, getLibraryRootDirectoryNodeId, UNFILED_LIBRARY_DIRECTORY_ID } from "../../src/features/library/utils/libraryDirectory";
import { defaultVisualLifeSettings } from "../../src/features/library/utils/visualLife";

vi.mock("@/components/LocaleProvider", () => ({ useLocale: () => ({ language: "zh-CN", isEnglish: false, t: (text: string, values: Record<string, string | number> = {}) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? key)) }) }));
vi.mock("@/features/library/components/NsfwImage", () => ({ NsfwImage: ({ alt }: { alt: string }) => createElement("img", { alt }) }));
const noop = () => {};
const okay = async () => true;
function render(settingsPatch: Partial<LibraryDirectoryModeProps["settings"]> = {}, isSidebarOpen = true) {
  const at = "2026-11-14T00:00:00Z";
  const props: LibraryDirectoryModeProps = {
    blurNsfwImages: false, isBusy: false, isSidebarOpen, roots: [{ id: "r", label: "写真目录", absolutePath: "W:/目录", recursive: true, lastScanAt: null }],
    items: ["in-directory", "unfiled"].map(id => ({ id, title: id, imageFileName: id + ".webp", prompt: "", negativePrompt: "", tags: [], createdAt: at, updatedAt: at })),
    settings: { ...createDefaultLibraryDirectorySettings(), legacyGroupingDone: true, itemFolderIds: { "in-directory": getLibraryRootDirectoryNodeId("r") }, ...settingsPatch },
    likedImageIds: [], visualLifeSettings: defaultVisualLifeSettings,
    onAddDirectory: noop, onChangeSettings: okay, onExit: noop, onOpenManager: noop, onScanRoot: noop, onValidate: noop,
    onCopyImage: async () => {}, onCopyText: async () => {}, onToggleFavorite: async () => {}, onSaveTags: okay, onRenameItem: okay, onExportItems: async () => {}, onDeleteItems: okay, onSaveItem: okay, onExportImage: async () => {},
  };
  return renderToStaticMarkup(createElement(LibraryDirectoryMode, props));
}
describe("directory workspace layout", () => {
  it.each([false, true])("shows a single header prompt action when provided (compact: %s)", compact => {
    const at = "2026-11-16T00:00:00Z";
    const html = renderToStaticMarkup(createElement(LibraryAssetInfo, {
      item: { id: "selected", title: "单击选中素材", imageFileName: "selected.webp", prompt: "完整提示词", negativePrompt: "", tags: [], createdAt: at, updatedAt: at },
      compact, blur: false, favorite: false, onClose: noop, onExpandPrompt: noop, onSave: okay, onPreview: noop, onCopyImage: noop, onCopyText: noop, onFavorite: noop, onLocate: noop, onExport: noop,
    }));
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain('aria-label="展开提示词"');
    expect(header).toContain('aria-label="关闭信息"');
    expect(html.match(/aria-label="展开提示词"/g)).toHaveLength(1);
    expect(html).not.toContain("查看提示词");
  });
  it.each([false, true])("starts the asset editor collapsed without a duplicate prompt action (compact: %s)", compact => {
    const at = "2026-11-16T00:00:00Z";
    const html = renderToStaticMarkup(createElement(LibraryAssetInfo, {
      item: { id: "metadata", title: "测试素材", imageFileName: "metadata.webp", prompt: "保留提示词", negativePrompt: "", tags: ["已有标签"], notes: "已保存备注", sourceUrl: "https://example.com/asset", createdAt: at, updatedAt: at },
      compact, blur: false, favorite: false, onSave: okay, onPreview: noop, onCopyImage: noop, onCopyText: noop, onFavorite: noop, onLocate: noop, onExport: noop,
    }));
    expect(html).toContain("已有标签");
    expect(html).toContain('aria-label="编辑标签、备注和网址"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="添加标签"');
    expect(html).not.toContain('aria-label="素材备注"');
    expect(html).not.toContain('aria-label="来源链接"');
    expect(html).not.toContain("查看提示词");
    expect(html).not.toContain('aria-label="展开提示词"');
  });
  it.each([undefined, true, false])("keeps the copy-path action only when the containing view needs it (%s)", showCopyPath => {
    const at = "2026-11-16T00:00:00Z";
    const html = renderToStaticMarkup(createElement(LibraryAssetInfo, {
      item: { id: "path", title: "路径素材", imageFileName: "path.webp", prompt: "", negativePrompt: "", tags: [], createdAt: at, updatedAt: at },
      showCopyPath, blur: false, favorite: false, onSave: okay, onPreview: noop, onCopyImage: noop, onCopyText: noop, onFavorite: noop, onLocate: noop, onExport: noop,
    }));
    expect(html.includes("复制文件路径")).toBe(showCopyPath !== false);
    expect(html).toContain('aria-label="导出"');
  });
  it("groups export with the other icon actions in a single four-button row", () => {
    const at = "2026-11-16T00:00:00Z";
    const html = renderToStaticMarkup(createElement(LibraryAssetInfo, {
      item: { id: "actions", title: "操作素材", imageFileName: "actions.webp", prompt: "", negativePrompt: "", tags: [], createdAt: at, updatedAt: at },
      blur: false, favorite: false, onSave: okay, onPreview: noop, onCopyImage: noop, onCopyText: noop, onFavorite: noop, onLocate: noop, onExport: noop,
    }));
    const row = html.match(/<div[^>]*class="grid grid-cols-4[^"]*"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(row).toContain('aria-label="导出"');
    expect(row).toContain('aria-label="预览"');
    expect(row).toContain('aria-label="复制图片"');
    expect(html).not.toContain("grid-cols-3");
  });
  it("places a single icon-only copy action before search and disables it without a selected asset", () => {
    const html = render();
    const toolbar = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    const copyButton = toolbar.match(/<button[^>]*aria-label="复制文件路径"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(html.match(/aria-label="复制文件路径"/g)).toHaveLength(1);
    expect(copyButton).toContain('disabled=""');
    expect(copyButton).toContain("<svg");
    expect(copyButton.replace(/<[^>]*>/g, "")).toBe("");
    expect(toolbar.indexOf('aria-label="复制文件路径"')).toBeLessThan(toolbar.indexOf('aria-label="搜索当前目录"'));
  });
  it("leaves the footer status empty until there is an operation result", () => {
    const html = render({ selectedNodeId: getLibraryRootDirectoryNodeId("r") });
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).toMatch(/role="status"><\/span>/);
    expect(footer).not.toContain("写真目录");
  });
  it("has no unfiled navigation, card or alternate classification entrance", () => {
    const html = render();
    expect(html).not.toContain("未归类");
    expect(html).not.toContain('aria-label="分类方式"');
    expect(html).not.toContain('data-directory-folder="' + UNFILED_LIBRARY_DIRECTORY_ID + '"');
  });
  it("keeps the toolbar and footer inside the result column so the sidebar spans its full height", () => {
    const html = render();
    const main = html.slice(html.indexOf('<main data-feature-guide="directory-results"'), html.indexOf("</main>"));
    const toolbar = main.slice(main.indexOf("<header"), main.indexOf("</header>"));
    expect(toolbar).toContain('data-feature-guide="directory-toolbar"');
    expect(toolbar).toContain('aria-label="当前目录路径"');
    expect(toolbar).toContain('aria-label="搜索当前目录"');
    expect(html.slice(0, html.indexOf('<main data-feature-guide="directory-results"'))).not.toContain("<header");
    const footer = main.slice(main.indexOf("<footer"));
    expect(footer).toContain("data-directory-material-count");
    expect(footer).toContain("1 个素材");
    expect(footer.indexOf("data-directory-material-count")).toBeGreaterThan(footer.indexOf("data-directory-size-control"));
    expect(html.slice(html.indexOf("</main>"))).not.toContain("<footer");
  });
  it("floats the status bar over the gallery instead of reserving a full-width white strip", () => {
    const html = render();
    const footer = html.match(/<footer[^>]*data-directory-statusbar[^>]*>/)?.[0] ?? "";
    expect(footer).toContain("absolute");
    expect(footer).toContain("right-3");
    expect(footer).toContain("max-w-");
    expect(footer).not.toContain("border-t");
    expect(footer).not.toContain("min-h-11");
    const gallery = html.match(/<div[^>]*aria-label="素材展示区"[^>]*>/)?.[0] ?? "";
    expect(gallery).toContain("pb-12");
  });
  it("renders the material count inside the detail panel when provided", () => {
    const at = "2026-11-16T00:00:00Z";
    const html = renderToStaticMarkup(createElement(LibraryAssetInfo, {
      item: { id: "counted", title: "计数素材", imageFileName: "counted.webp", prompt: "", negativePrompt: "", tags: [], createdAt: at, updatedAt: at },
      materialCount: 6,
      blur: false, favorite: false, onClose: noop, onExpandPrompt: noop, onSave: okay, onPreview: noop, onCopyImage: noop, onCopyText: noop, onFavorite: noop, onLocate: noop, onExport: noop,
    }));
    expect(html).toContain("data-directory-material-count");
    expect(html).toContain("6 个素材");
  });
  it("puts the material count directly above the action row and workspace tools below it", () => {
    const at = "2026-11-16T00:00:00Z";
    const html = renderToStaticMarkup(createElement(LibraryAssetInfo, {
      item: { id: "wrapped", title: "计数素材", imageFileName: "wrapped.webp", prompt: "", negativePrompt: "", tags: [], createdAt: at, updatedAt: at },
      materialCount: 6,
      workspaceTools: createElement("span", { "data-workspace-tool": "size-control" }, "尺寸调节"),
      blur: false, favorite: false, onClose: noop, onExpandPrompt: noop, onSave: okay, onPreview: noop, onCopyImage: noop, onCopyText: noop, onFavorite: noop, onLocate: noop, onExport: noop,
    }));
    const countAt = html.indexOf("data-directory-material-count");
    const copyAt = html.indexOf('aria-label="复制图片"');
    const toolAt = html.indexOf("data-workspace-tool");
    expect(countAt).toBeLessThan(copyAt);
    expect(copyAt).toBeLessThan(toolAt);
    const countTag = html.slice(countAt, html.indexOf(">", countAt));
    expect(countTag).not.toContain("mb-2");
  });
  it("no longer reserves a toolbar row for the include-descendants checkbox", () => {
    const html = render();
    expect(html).not.toContain('aria-label="包含子目录"');
    expect(html).not.toContain("data-directory-material-tools");
  });
  it("pins exit to the sidebar bottom with no app-wide footer underneath", () => {
    const html = render();
    const sidebarStart = html.indexOf("data-directory-sidebar");
    const sidebar = html.slice(html.lastIndexOf("<aside", sidebarStart), html.indexOf("</aside>", sidebarStart));
    expect(sidebar).toContain("data-directory-exit-container");
    expect(sidebar).toContain("mt-auto shrink-0");
    expect(sidebar).toContain("退出目录模式");
  });
  it("hides the directory sidebar when the global sidebar is collapsed", () => {
    const html = render({}, false);
    expect(html).not.toContain("data-directory-sidebar");
    expect(html).toContain('data-feature-guide="directory-results"');
  });
  it("uses the same themed chrome surface as the application sidebar", () => {
    const html = render();
    const sidebarStart = html.indexOf("data-directory-sidebar");
    const sidebar = html.slice(html.lastIndexOf("<aside", sidebarStart), html.indexOf("</aside>", sidebarStart));
    expect(sidebar).toContain("app-chrome-surface");
    // The shared glass class only works when no opaque page sits behind it.
    const shell = html.match(/<section aria-label="素材目录模式"[^>]*>/)?.[0] ?? "";
    expect(shell).not.toContain("bg-background");
    expect(shell).not.toContain("bg-panel");
    expect(html).toContain('aria-hidden="true" class="library-atmosphere"');
    const results = html.match(/<main data-feature-guide="directory-results"[^>]*>/)?.[0] ?? "";
    expect(results).toContain("bg-background");
    expect(sidebar).not.toContain("bg-panel/70");
  });
  it("keeps the all-directory view as a directory overview when descendants are enabled", () => {
    const html = render({ includeDescendants: true });
    expect(html).toContain('data-directory-folder="' + getLibraryRootDirectoryNodeId("r") + '"');
    expect(html).not.toContain('data-directory-item="in-directory"');
    expect(html).not.toContain('data-directory-item="unfiled"');
  });
  it("shows every descendant of a selected root directory without flattening unfiled items", () => {
    const html = render({ selectedNodeId: getLibraryRootDirectoryNodeId("r"), includeDescendants: true });
    expect(html).toContain('data-directory-item="in-directory"');
    expect(html).not.toContain('data-directory-item="unfiled"');
  });
});
