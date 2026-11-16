import fs from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LibraryItem, LibraryRoot } from "../../src/features/library/types/library";
import { createDefaultLibraryDirectorySettings, getLibraryFolderDirectoryNodeId, getLibraryRootDirectoryNodeId, UNFILED_LIBRARY_DIRECTORY_ID, type LibraryDirectorySettings } from "../../src/features/library/utils/libraryDirectory";
import { getImageSrc, getImageThumbnailSrc } from "../../src/features/library/utils/getImageSrc";
import { toPromptCardData } from "../../src/features/library/utils/promptFilters";
import { PromptDetailDialog } from "../../src/features/library/components/PromptDetailDialog";

vi.mock("@/components/LocaleProvider", () => ({
  useLocale: () => ({ t: (text: string, values: Record<string, unknown> = {}) => text.replace(/\{([^}]+)\}/g, (_, key: string) => String(values[key] ?? key)) }),
}));
vi.mock("../../src/features/library/store/useLibraryStore", () => ({
  useLibraryStore: (selector: (state: unknown) => unknown) => selector({ items: [], moduleState: undefined, categoryTaxonomy: null }),
}));
vi.mock("../../src/features/account/store/useAccountStore", () => ({
  useAccountStore: (selector: (state: unknown) => unknown) => selector({ user: null }),
}));
vi.mock("@/components/ui/AppDialog", () => ({
  AppDialog: ({ children }: { children: ReactNode }) => createElement("section", { role: "dialog", "data-app-dialog": "true" }, children),
}));

const projectRoot = path.resolve(__dirname, "../..");
const viewerFile = path.join(projectRoot, "src/features/library/components/LibraryMediaViewer.tsx");
const detailFile = path.join(projectRoot, "src/features/library/components/PromptDetailDialog.tsx");
let viewer: typeof import("../../src/features/library/components/LibraryMediaViewer");

const root: LibraryRoot = { id: "photos", label: "照片", absolutePath: "W:\\图库", recursive: true, lastScanAt: null };
function item(id: string, relativePath?: string, patch: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id, title: id, imageFileName: id + ".png", prompt: "自然光下的陶瓷杯", negativePrompt: "低清晰度", tags: [],
    createdAt: "2026-11-14T00:00:00.000Z", updatedAt: "2026-11-14T01:00:00.000Z",
    ...(relativePath ? { mediaStorage: { kind: "external" as const, rootId: root.id, relativePath, status: "available" as const } } : {}),
    ...patch,
  };
}
function settings(patch: Partial<LibraryDirectorySettings> = {}): LibraryDirectorySettings {
  return { ...createDefaultLibraryDirectorySettings(), sortMode: "name", sortDirection: "asc", ...patch };
}
const alpha = item("alpha", "旅行/alpha.png");
const beta = item("beta", "旅行/beta.png", { tags: ["风景"] });
const child = item("child", "旅行/子目录/child.png");
const other = item("other", "产品/other.png");
const managed = item("managed");
const assets = [beta, child, managed, other, alpha];
const travelId = getLibraryFolderDirectoryNodeId(root.id, "旅行");

function viewerProps(patch: Partial<ComponentProps<typeof viewer.LibraryMediaViewer>> = {}): ComponentProps<typeof viewer.LibraryMediaViewer> {
  return {
    items: assets, roots: [root], directorySettings: settings(), currentItemId: alpha.id, blurNsfwImages: false, 
    onSelectItem: vi.fn(), onClose: vi.fn(),
    renderInfo: (id, compact) => createElement("div", { "data-asset-info": id, "data-compact": String(compact) }, "素材信息"),
    renderPromptPanel: (_id, _onCollapse) => createElement("div", { "data-prompt-editor": "true" }, "完整提示词编辑"),
    ...patch,
  };
}

function detailProps(presentation?: "dialog" | "panel"): ComponentProps<typeof PromptDetailDialog> {
  return {
    item: toPromptCardData(alpha), presentation, isBusy: false, imageCount: 2, imageIndex: 0,
    generationModelOrder: [], hiddenGenerationModels: [], blurNsfwImages: false, isImageLiked: false, knownCategories: [],
    aiSettings: { activeProfileId: "", profiles: [], actionPreferences: {}, recognitionSourcePreferences: {}, enabled: false, baseUrl: "", hasApiKey: false, apiKeyPreview: "", model: "" },
    onAnalyzePrompt: vi.fn(), onClose: vi.fn(), onCopyImage: vi.fn(), onCopyText: vi.fn(), onDelete: vi.fn(), onExportImage: vi.fn(),
    onImportClipboardImage: vi.fn(), onImportImages: vi.fn(), onPushToCanvas: vi.fn(), onPushPromptToCanvas: vi.fn(),
    onNavigateNext: vi.fn(), onNavigatePrevious: vi.fn(), onShareGroup: vi.fn(), onSave: vi.fn(),
    onSaveGenerationModelPreferences: vi.fn(), onSaveAiActionModelPreference: vi.fn(), onSaveAiRecognitionSourcePreferences: vi.fn(),
    onOptimizePrompt: vi.fn(), onTranslatePrompt: vi.fn(), onReverseImagePrompt: vi.fn(), onToggleImageLike: vi.fn(),
    onGenerateVideoFrames: vi.fn(), onImportVideoReferenceImages: vi.fn(), onDeleteVideoReferenceImage: vi.fn(),
    onImportClipboardReferenceImage: vi.fn(), onImportReferenceImageFromUrl: vi.fn(),
  };
}

describe("LibraryMediaViewer directory model", () => {
  beforeAll(async () => {
    expect(fs.existsSync(viewerFile), "独立大图查看器应已实现").toBe(true);
    const modulePath = "../../src/features/library/components/LibraryMediaViewer.tsx";
    viewer = await import(/* @vite-ignore */ modulePath);
  });

  it("locates the current image in its owning physical directory, not the workspace selection", () => {
    const model = viewer.buildLibraryMediaViewerModel(assets, [root], settings({ selectedNodeId: getLibraryRootDirectoryNodeId(root.id) }));
    expect(viewer.resolveLibraryMediaViewerDirectory(alpha.id, model)).toBe(travelId);
    expect(model.itemsByDirectory.get(travelId)?.map(entry => entry.id)).toEqual(["alpha", "beta"]);
    expect(model.itemsByDirectory.get(getLibraryRootDirectoryNodeId(root.id)) ?? []).toEqual([]);
    expect(model.itemsByDirectory.get(UNFILED_LIBRARY_DIRECTORY_ID)?.map(entry => entry.id)).toEqual(["managed"]);
  });

  it("clears all browse constraints while retaining directory sort order and direct-only membership", () => {
    const model = viewer.buildLibraryMediaViewerModel(assets, [root], settings({
      includeDescendants: true, searchQuery: "不存在的词", mediaFilter: "video", favoriteOnly: true,
      formatFilter: "jpg", tagFilter: "不匹配", availabilityFilter: "missing", sortDirection: "desc",
    }));
    expect(model.itemsByDirectory.get(travelId)?.map(entry => entry.id)).toEqual(["beta", "alpha"]);
    expect(model.positionsByItemId.get("beta")).toBe(0);
    expect(model.positionsByItemId.get("alpha")).toBe(1);
    expect(assets.map(entry => entry.id)).toEqual(["beta", "child", "managed", "other", "alpha"]);
  });

  it("aggregates descendant materials for parent-directory viewer navigation", () => {
    const model = viewer.buildLibraryMediaViewerModel(assets, [root], settings());
    expect(model.itemsByDirectoryWithDescendants.get(travelId)?.map(entry => entry.id)).toEqual(["alpha", "beta", "child"]);
    expect(model.positionsByItemIdByDirectory.get(travelId)?.get("child")).toBe(2);
  });

  it("honors manual assignments and explicit unfiled overrides without falling back to the external path", () => {
    const virtualId = "viewer-collection";
    const model = viewer.buildLibraryMediaViewerModel(assets, [root], settings({
      nodes: [{ id: virtualId, name: "精选", rootId: "__library__", parentId: null, relativePath: "", kind: "virtual", order: 0 }],
      itemFolderIds: { alpha: virtualId, beta: UNFILED_LIBRARY_DIRECTORY_ID },
    }));
    expect(viewer.resolveLibraryMediaViewerDirectory("alpha", model)).toBe(virtualId);
    expect(viewer.resolveLibraryMediaViewerDirectory("beta", model)).toBe(UNFILED_LIBRARY_DIRECTORY_ID);
    expect(model.itemsByDirectory.get(virtualId)?.map(entry => entry.id)).toEqual(["alpha"]);
    expect(viewer.resolveLibraryMediaViewerDirectory("deleted", model)).toBe(UNFILED_LIBRARY_DIRECTORY_ID);
  });

  it("preserves the configured import-time ordering within a directory", () => {
    const newer = item("newer", "旅行/newer.png", { createdAt: "2026-11-14T02:00:00Z" });
    const model = viewer.buildLibraryMediaViewerModel([newer, alpha], [root], settings({ sortMode: "importedAt", sortDirection: "asc" }));
    expect(model.itemsByDirectory.get(travelId)?.map(entry => entry.id)).toEqual(["alpha", "newer"]);
  });

  it.each([ ["ArrowLeft", 0], ["ArrowUp", 0], ["PageUp", 0], ["ArrowRight", 2], ["ArrowDown", 2], ["PageDown", 2], ["Home", 0], ["End", 3] ])("navigates only the current directory with %s", (key, expected) => {
    expect(viewer.getLibraryMediaViewerNavigationIndex(4, 1, String(key))).toBe(expected);
  });

  it("clamps keyboard navigation at the ends and handles empty directories", () => {
    expect(viewer.getLibraryMediaViewerNavigationIndex(3, 0, "ArrowLeft")).toBe(0);
    expect(viewer.getLibraryMediaViewerNavigationIndex(3, 2, "ArrowRight")).toBe(2);
    expect(viewer.getLibraryMediaViewerNavigationIndex(3, -1, "ArrowRight")).toBe(0);
    expect(viewer.getLibraryMediaViewerNavigationIndex(0, 0, "PageDown")).toBeNull();
    expect(viewer.getLibraryMediaViewerNavigationIndex(3, 0, "Enter")).toBeNull();
  });

  it("leaves text inputs, contenteditable areas, sliders, menus and video controls alone", () => {
    const editable = { closest: vi.fn(() => ({})) } as unknown as EventTarget;
    const plain = { closest: vi.fn(() => null) } as unknown as EventTarget;
    expect(viewer.isLibraryMediaViewerEditableTarget(editable)).toBe(true);
    expect(viewer.isLibraryMediaViewerEditableTarget(plain)).toBe(false);
    expect(viewer.isLibraryMediaViewerEditableTarget(null)).toBe(false);
    const selector = (editable as unknown as { closest: ReturnType<typeof vi.fn> }).closest.mock.calls[0][0];
    for (const name of ["input", "textarea", "select", "contenteditable", "video", "slider", "listbox"]) expect(selector).toContain(name);
  });

  it("keeps arrow/page navigation available when a thumbnail has keyboard focus", () => {
    const focusedThumbnail = {
      closest: (selector: string) => selector.includes('[role="listbox"]') && !selector.includes('[role="listbox"]:not([data-media-viewer-filmstrip])') ? { role: "listbox" } : null,
    } as unknown as EventTarget;
    expect(viewer.isLibraryMediaViewerEditableTarget(focusedThumbnail)).toBe(false);
  });

  it("prefetches at most two adjacent originals and excludes videos, missing files and duplicates", () => {
    const ordered = [alpha, beta, other];
    expect(viewer.getLibraryMediaViewerNeighborSources(ordered, 1)).toEqual([getImageSrc(other.imageFileName, other.updatedAt), getImageSrc(alpha.imageFileName, alpha.updatedAt)]);
    const clip = item("clip", "旅行/clip.mp4", { imageFileName: "clip.mp4" });
    const missing = item("missing", "旅行/missing.png", { mediaStorage: { kind: "external", rootId: root.id, relativePath: "旅行/missing.png", status: "missing" } });
    expect(viewer.getLibraryMediaViewerNeighborSources([missing, beta, clip], 1)).toEqual([]);
    expect(viewer.getLibraryMediaViewerNeighborSources([alpha, beta, alpha], 1)).toHaveLength(1);
  });

  it("fits decoded dimensions into the actual viewport without clipping and allows small-image enlargement", () => {
    expect(viewer.getLibraryMediaViewerFitScale({ width: 4000, height: 2000 }, { width: 1000, height: 600 })).toBeCloseTo(0.244);
    expect(viewer.getLibraryMediaViewerFitScale({ width: 400, height: 200 }, { width: 1000, height: 600 })).toBeCloseTo(2.44);
    expect(viewer.getLibraryMediaViewerFitScale({ width: 0, height: 0 }, { width: 1000, height: 600 })).toBe(1);
    expect(viewer.clampLibraryMediaViewerPan({ x: 2000, y: -2000 }, { width: 4000, height: 2000 }, { width: 1000, height: 600 }, 1)).toEqual({ x: 1500, y: -700 });
    expect(viewer.clampLibraryMediaViewerPan({ x: 20, y: 30 }, { width: 400, height: 200 }, { width: 1000, height: 600 }, 1)).toEqual({ x: 0, y: 0 });
  });

  it("keeps large filmstrips bounded to the visible window plus two neighbors on each side", () => {
    expect(viewer.getLibraryMediaViewerFilmstripWindow(10_000, 8800, 440)).toEqual({ start: 98, end: 107 });
    expect(viewer.getLibraryMediaViewerFilmstripWindow(2, 0, 800)).toEqual({ start: 0, end: 2 });
    expect(viewer.getLibraryMediaViewerFilmstripWindow(0, 0, 800)).toEqual({ start: 0, end: 0 });
  });

  it("centers the selected thumbnail even at the first and last positions", () => {
    const getTarget = Reflect.get(viewer, "getLibraryMediaViewerFilmstripTargetScrollLeft");
    expect(getTarget).toBeTypeOf("function");
    if (typeof getTarget !== "function") return;
    expect(getTarget(0, 5, 500)).toBe(0);
    expect(getTarget(4, 5, 500)).toBe(4 * 88);
    expect(getTarget(2, 5, 500)).toBe(2 * 88);
  });

  it("renders a titlebar-safe image-first viewer with compact metadata and never evaluates the prompt slot by default", () => {
    const renderInfo = vi.fn((id: string, compact: boolean, _onExpandPrompt?: () => void) => createElement("div", { "data-asset-info": id, "data-compact": String(compact) }));
    const renderPromptPanel = vi.fn((_id: string, _onCollapse: () => void) => { throw new Error("默认不应加载完整编辑器"); });
    const html = renderToStaticMarkup(createElement(viewer.LibraryMediaViewer, viewerProps({ renderInfo, renderPromptPanel })));
    expect(html).toContain("app-window-overlay");
    expect(html).not.toContain("fixed inset-0");
    expect(html).toContain(getImageSrc(alpha.imageFileName, alpha.updatedAt));
    expect(html).toContain(getImageThumbnailSrc(beta.imageFileName, beta.updatedAt));
    expect(html).not.toContain(getImageThumbnailSrc(child.imageFileName, child.updatedAt));
    expect(html).not.toContain(getImageThumbnailSrc(other.imageFileName, other.updatedAt));
    expect(html).toContain('data-media-viewer-action="rotate"');
    expect(html).toContain('data-media-viewer-action="flip-horizontal"');
    expect(html).toContain('data-media-viewer-action="flip-vertical"');
    expect(html).toContain('data-media-viewer-immersive-toggle="true"');
    expect(html).toContain("展开提示词");
    expect(html).toContain("object-contain object-center");
    expect(html).toContain('aria-label="查看目录" class="app-chrome-surface relative flex shrink-0 flex-col overflow-hidden border-r"');
    expect(renderInfo).toHaveBeenCalledWith(alpha.id, true);
    expect(renderPromptPanel).not.toHaveBeenCalled();
    const source = fs.readFileSync(viewerFile, "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:PromptDetailDialog|useLibraryStore)["']/);
  });

  it("renders as an inline workspace region when embedded instead of a second full-screen overlay", () => {
    const html = renderToStaticMarkup(createElement(viewer.LibraryMediaViewer, viewerProps({ embedded: true })));
    expect(html).toContain('data-media-viewer-embedded="true"');
    expect(html).toContain('role="region"');
    expect(html).not.toContain("app-window-overlay");
    expect(html).toContain("relative h-full w-full");
    const source = fs.readFileSync(viewerFile, "utf8");
    expect(source).toContain('data-media-viewer-embedded="true"');
    expect(source).toContain("host !== viewerRef.current");
  });
  it("uses a frosted immersive surface and hides the titlebar without a flat white backdrop", () => {
    const source = fs.readFileSync(viewerFile, "utf8");
    expect(source).toContain("mediaImmersiveViewers");
    expect(source).toContain("media-viewer-immersive");
    expect(source).toContain("[-webkit-app-region:drag]");
    // 拖拽条必须让开右上角退出按钮，且退出按钮标记为 no-drag，否则鼠标移上去会被窗口拖拽区吞掉而消失。
    expect(source).toContain('left-0 right-20 top-0 z-10 h-11 [-webkit-app-region:drag]');
    expect(source).toContain('data-media-viewer-immersive-exit');
    expect(source).toContain('z-30 flex h-16 w-20 items-start justify-end p-3 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 [-webkit-app-region:no-drag]');
    // 沉浸层不再用纯白 bg-background 作底，改用毛玻璃表面类。
    expect(source).not.toContain('isImmersive ? "bg-background" : "bg-panel"');
    const tokensPath = path.join(projectRoot, "src/styles/tokens.css");
    const tokens = fs.readFileSync(tokensPath, "utf8");
    expect(source).toContain("if (count > 0) root.dataset.mediaImmersiveViewers = String(count);");
    expect(source).toContain("else delete root.dataset.mediaImmersiveViewers;");
    expect(tokens).toContain('html[data-media-immersive-viewers]:not([data-media-immersive-viewers="0"]) [data-app-titlebar="true"]');
    expect(tokens).toContain(".media-viewer-immersive");
    expect(tokens).toContain("backdrop-filter: blur(");
  });
  it("exposes a resizable prompt panel so its detail card can show more content", () => {
    const source = fs.readFileSync(viewerFile, "utf8");
    const modeSource = fs.readFileSync(path.join(projectRoot, "src/features/library/components/LibraryDirectoryMode.tsx"), "utf8");
    expect(source).toContain("clampPromptPanelWidth");
    expect(source).toContain("resizePromptPanel");
    expect(source).toContain('label={t("调整提示词面板宽度")}');
    expect(source).toContain('side="left"');
    expect(modeSource).toContain('side?: "left" | "right"');
    expect(modeSource).toContain('p.side === "left" ? "left-0" : "right-0"');
  });
  it("applies a remembered vertical mirror to the large preview", () => {
    const vertical = { rotation: 0 as const, flipHorizontal: false, flipVertical: true };
    const html = renderToStaticMarkup(createElement(viewer.LibraryMediaViewer, viewerProps({ imageViewTransforms: { [alpha.id]: vertical } })));
    expect(html).toContain('data-media-viewer-action="flip-vertical"');
    expect(html).toContain("scaleY(-1)");
  });

  it("plays a video through the existing image protocol with native controls", () => {
    const clip = item("clip", "旅行/clip.mp4", { imageFileName: "clip.mp4" });
    const html = renderToStaticMarkup(createElement(viewer.LibraryMediaViewer, viewerProps({ items: [clip], currentItemId: clip.id })));
    expect(html).toContain("<video");
    expect(html).toContain('controls=""');
    expect(html).toContain('preload="metadata"');
    expect(html).toContain(getImageSrc(clip.imageFileName, clip.updatedAt));
  });

  it("shows readable no-image and missing-file states instead of a broken big image", () => {
    const noImage = item("no-image", undefined, { imageFileName: "" });
    const missing = item("missing", "旅行/missing.png", { mediaStorage: { kind: "external", rootId: root.id, relativePath: "旅行/missing.png", status: "missing" } });
    const noImageHtml = renderToStaticMarkup(createElement(viewer.LibraryMediaViewer, viewerProps({ items: [noImage], currentItemId: noImage.id })));
    expect(noImageHtml).toContain("此素材没有可读取的图像");
    const missingHtml = renderToStaticMarkup(createElement(viewer.LibraryMediaViewer, viewerProps({ items: [missing], currentItemId: missing.id })));
    expect(missingHtml).toContain("源文件缺失");
    expect(missingHtml).not.toContain("<video");
    expect(missingHtml).not.toContain(getImageSrc(missing.imageFileName, missing.updatedAt));
  });
});

describe("PromptDetailDialog panel presentation", () => {
  it("offers an optional panel presentation without changing the default dialog", () => {
    expect(fs.readFileSync(detailFile, "utf8")).toContain('presentation?: "dialog" | "panel"');
    const html = renderToStaticMarkup(createElement(PromptDetailDialog, detailProps()));
    expect(html).toContain('data-app-dialog="true"');
    expect(html).toContain('data-feature-guide="prompt-detail-media"');
  });

  it("does not mount an AppDialog, portal, mask or left media in panel mode, and retains the complete prompt action area", () => {
    const html = renderToStaticMarkup(createElement(PromptDetailDialog, detailProps("panel")));
    expect(html).not.toContain('data-app-dialog="true"');
    expect(html).not.toContain('data-feature-guide="prompt-detail-media"');
    expect(html).not.toContain("app-window-overlay");
    for (const action of ["素材详情", "复制提示词", "分享", "传送到画布", "图像反推"]) expect(html).toContain(action);
    expect(html).toContain(alpha.prompt);
  });
});


describe("directory-only viewer", () => {
  it("omits unfiled filmstrip materials while preserving the normal viewer", () => {
    const at = "2026-11-14T00:00:00Z";
    const materials: LibraryItem[] = ["organized", "unfiled"].map(id => ({ id, title: id, imageFileName: id + ".webp", prompt: "", negativePrompt: "", tags: [], createdAt: at, updatedAt: at }));
    const root: LibraryRoot = { id: "scope-root", label: "Scope", absolutePath: "W:/Scope", recursive: true, lastScanAt: null };
    const settings = { ...createDefaultLibraryDirectorySettings(), legacyGroupingDone: true, itemFolderIds: { organized: getLibraryRootDirectoryNodeId(root.id) } };
    const normal = viewer.buildLibraryMediaViewerModel(materials, [root], settings);
    const scoped = viewer.buildLibraryMediaViewerModel(materials, [root], settings, true);
    expect(normal.itemsById.has("unfiled")).toBe(true);
    expect(scoped.itemsById.has("unfiled")).toBe(false);
    expect(scoped.itemsByDirectory.has(UNFILED_LIBRARY_DIRECTORY_ID)).toBe(false);
    expect(scoped.itemsById.has("organized")).toBe(true);
  });
});
