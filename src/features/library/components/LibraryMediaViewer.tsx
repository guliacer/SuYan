import { memo, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Expand, Eye, Film, FlipHorizontal2, FlipVertical2, Folder, FolderOpen, FolderTree, ImageOff, Inbox, Loader2, Maximize2, PanelRightClose, PanelRightOpen, RotateCw, Shrink, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import type { ImageViewTransform, LibraryDirectoryNode, LibraryDirectorySettings, LibraryItem, LibraryRoot } from "../types/library";
import { ALL_LIBRARY_DIRECTORY_ID, UNFILED_LIBRARY_DIRECTORY_ID, buildLibraryDirectoryItemIndex, getLibraryDirectoryScopedItems, compareDirectoryNodes, getDefaultLibraryItemDirectoryId, getDirectoryItemFileName, mergeLibraryDirectoryNodes, selectLibraryDirectoryItems } from "../utils/libraryDirectory";
import { buildLibraryDirectoryColors } from "../utils/libraryDirectoryAppearance";
import { getImageSrc } from "../utils/getImageSrc";
import { isAudioMediaFile, isVideoMediaFile } from "../utils/mediaFileTypes";
import { isNsfwItem } from "../utils/nsfwRating";
import { DEFAULT_IMAGE_VIEW_TRANSFORM, getImageViewOrientedSize, rotateImageViewTransform, toggleImageViewHorizontalFlip, toggleImageViewVerticalFlip } from "../utils/imageViewTransform";
import { NsfwImage } from "./NsfwImage";
import { LibraryDirectoryResizeHandle } from "./LibraryDirectoryMode";

export type LibraryMediaViewerProps = {
  items: readonly LibraryItem[];
  roots: readonly LibraryRoot[];
  directorySettings: LibraryDirectorySettings;
  currentItemId: string;
  blurNsfwImages: boolean;
  directoryOnly?: boolean;
  showDirectoryTree?: boolean;
  /** Render inside the directory workspace instead of a viewport-level overlay. */
  embedded?: boolean;
  /** Open the prompt rail immediately (used by the one-click prompt action). */
  initialPromptExpanded?: boolean;
  /** Bump to re-apply initialPromptExpanded without remounting the viewer. */
  promptRequestToken?: number;
  imageViewTransforms?: Readonly<Record<string, ImageViewTransform>>;
  onSelectItem: (id: string) => void;
  onClose: () => void;
  onSaveImageViewTransform?: (itemId: string, transform: ImageViewTransform) => Promise<boolean>;
  onExitDirectory?: () => void;
  onChangeDirectorySettings?: (settings: LibraryDirectorySettings) => void | Promise<unknown>;
  onImmersiveChange?: (immersive: boolean) => void;
  renderInfo: (itemId: string, compact: boolean) => ReactNode;
  renderPromptPanel: (itemId: string, onCollapse: () => void) => ReactNode;
};

type MediaSize = { width: number; height: number };
type MediaPan = { x: number; y: number };
const EMPTY_ITEMS: readonly LibraryItem[] = [];
const FILMSTRIP_ITEM_WIDTH = 88;
const FILMSTRIP_ITEM_HEIGHT = 72;
const FILMSTRIP_THUMBNAIL_WIDTH = FILMSTRIP_ITEM_WIDTH - 8;
const MIN_DIRECTORY_SIDEBAR_WIDTH = 180;
const MAX_DIRECTORY_SIDEBAR_WIDTH = 420;
const MIN_PROMPT_PANEL_WIDTH = 320;
const MAX_PROMPT_PANEL_WIDTH = 900;

function clampDirectorySidebarWidth(value: number): number {
  return Math.max(MIN_DIRECTORY_SIDEBAR_WIDTH, Math.min(MAX_DIRECTORY_SIDEBAR_WIDTH, Math.round(value)));
}

function clampPromptPanelWidth(value: number): number {
  return Math.max(MIN_PROMPT_PANEL_WIDTH, Math.min(MAX_PROMPT_PANEL_WIDTH, Math.round(value)));
}

/** Sort once per library/settings change and index both direct and descendant directory buckets. */
export function buildLibraryMediaViewerModel(items: readonly LibraryItem[], roots: readonly LibraryRoot[], directorySettings: LibraryDirectorySettings, directoryOnly = false) {
  const settings = mergeLibraryDirectoryNodes({ items, roots, settings: directorySettings });
  const fullIndex = buildLibraryDirectoryItemIndex(items, settings);
  const viewerItems = directoryOnly ? getLibraryDirectoryScopedItems(items, fullIndex.itemDirectoryById) : items;
  const index = directoryOnly ? buildLibraryDirectoryItemIndex(viewerItems, settings) : fullIndex;
  const nodesById = new Map(settings.nodes.map(node => [node.id, node]));
  const childrenByParent = new Map<string | null, LibraryDirectoryNode[]>();
  for (const node of settings.nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(compareDirectoryNodes);
  const sorted = selectLibraryDirectoryItems(viewerItems, {
    ...settings,
    selectedNodeId: ALL_LIBRARY_DIRECTORY_ID,
    includeDescendants: false,
    searchQuery: "",
    mediaFilter: "all",
    favoriteOnly: false,
    formatFilter: "",
    tagFilter: "",
    categoryFilter: "",
    minimumRating: 0,
    availabilityFilter: "all",
  }, [], index.itemDirectoryById);
  const itemsById = new Map(viewerItems.map(item => [item.id, item]));
  const itemsByDirectory = new Map<string, LibraryItem[]>();
  const positionsByItemId = new Map<string, number>();
  const itemsByDirectoryWithDescendants = new Map<string, LibraryItem[]>();
  const positionsByItemIdByDirectory = new Map<string, Map<string, number>>();
  for (const item of sorted) {
    const directoryId = index.itemDirectoryById.get(item.id) ?? UNFILED_LIBRARY_DIRECTORY_ID;
    const bucket = itemsByDirectory.get(directoryId) ?? [];
    positionsByItemId.set(item.id, bucket.length);
    bucket.push(item);
    itemsByDirectory.set(directoryId, bucket);

    const visited = new Set<string>();
    let node = nodesById.get(directoryId);
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      const directoryBucket = itemsByDirectoryWithDescendants.get(node.id) ?? [];
      const positions = positionsByItemIdByDirectory.get(node.id) ?? new Map<string, number>();
      positions.set(item.id, directoryBucket.length);
      directoryBucket.push(item);
      itemsByDirectoryWithDescendants.set(node.id, directoryBucket);
      positionsByItemIdByDirectory.set(node.id, positions);
      node = node.parentId ? nodesById.get(node.parentId) : undefined;
    }
  }
  for (const [directoryId, directItems] of itemsByDirectory) {
    if (!itemsByDirectoryWithDescendants.has(directoryId)) {
      itemsByDirectoryWithDescendants.set(directoryId, directItems);
      positionsByItemIdByDirectory.set(directoryId, new Map(directItems.map((item, index) => [item.id, index])));
    }
  }
  return { settings, index, itemsById, itemsByDirectory, positionsByItemId, itemsByDirectoryWithDescendants, positionsByItemIdByDirectory, nodesById, childrenByParent };
}

type ViewerModel = ReturnType<typeof buildLibraryMediaViewerModel>;

export function resolveLibraryMediaViewerDirectory(itemId: string, model: ViewerModel): string {
  // null in the shared index is an explicit unfiled assignment, not a missing lookup.
  if (model.index.itemDirectoryById.has(itemId)) return model.index.itemDirectoryById.get(itemId) ?? UNFILED_LIBRARY_DIRECTORY_ID;
  const item = model.itemsById.get(itemId);
  return (item ? getDefaultLibraryItemDirectoryId(item, model.settings.nodes) : null) ?? UNFILED_LIBRARY_DIRECTORY_ID;
}

export function getLibraryMediaViewerNavigationIndex(count: number, currentIndex: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const delta = ["ArrowLeft", "ArrowUp", "PageUp"].includes(key) ? -1 : ["ArrowRight", "ArrowDown", "PageDown"].includes(key) ? 1 : 0;
  if (!delta) return null;
  return Math.max(0, Math.min(count - 1, currentIndex < 0 ? 0 : currentIndex + delta));
}

export function isLibraryMediaViewerEditableTarget(target: EventTarget | null): boolean {
  if (!target || !("closest" in target) || typeof target.closest !== "function") return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"], [role="slider"], [role="menu"], [role="listbox"]:not([data-media-viewer-filmstrip]), video, audio, [data-media-viewer-keyboard-ignore]'));
}

export function getLibraryMediaViewerTabFocusTarget<T>(targets: readonly T[], active: T | null, reverse: boolean): T | null {
  if (!targets.length) return null;
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (active === null || !targets.includes(active)) return reverse ? last : first;
  if (reverse && active === first) return last;
  if (!reverse && active === last) return first;
  return null;
}

export function getLibraryMediaViewerNeighborSources(items: readonly LibraryItem[], currentIndex: number): string[] {
  if (currentIndex < 0 || currentIndex >= items.length) return [];
  const sources = new Set<string>();
  for (const index of [currentIndex + 1, currentIndex - 1]) {
    const item = items[index];
    if (!item?.imageFileName || isVideoMediaFile(getDirectoryItemFileName(item)) || isAudioMediaFile(getDirectoryItemFileName(item))) continue;
    if (item.mediaStorage && item.mediaStorage !== "managed" && item.mediaStorage.status === "missing") continue;
    const src = getImageSrc(item.imageFileName, item.updatedAt);
    if (src !== getImageSrc(items[currentIndex].imageFileName, items[currentIndex].updatedAt)) sources.add(src);
  }
  return [...sources];
}

export function getLibraryMediaViewerFitScale(image: MediaSize, viewport: MediaSize): number {
  if (![image.width, image.height, viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0)) return 1;
  return Math.min(Math.max(1, viewport.width - 24) / image.width, Math.max(1, viewport.height - 24) / image.height);
}

export function clampLibraryMediaViewerPan(pan: MediaPan, image: MediaSize, viewport: MediaSize, scale: number): MediaPan {
  const xLimit = Math.max(0, (image.width * scale - viewport.width) / 2);
  const yLimit = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { x: Math.max(-xLimit, Math.min(xLimit, pan.x)) || 0, y: Math.max(-yLimit, Math.min(yLimit, pan.y)) || 0 };
}

export function getLibraryMediaViewerFilmstripWindow(count: number, scrollLeft: number, viewportWidth: number, leadingInset = 0): { start: number; end: number } {
  const contentScrollLeft = Math.max(0, scrollLeft - Math.max(0, leadingInset));
  const start = Math.max(0, Math.min(count, Math.floor(contentScrollLeft / FILMSTRIP_ITEM_WIDTH) - 2));
  const end = Math.min(count, Math.ceil((contentScrollLeft + Math.max(1, viewportWidth)) / FILMSTRIP_ITEM_WIDTH) + 2);
  return { start, end };
}

export function getLibraryMediaViewerFilmstripTargetScrollLeft(selectedIndex: number, count: number, viewportWidth: number): number {
  if (count <= 0 || selectedIndex < 0 || selectedIndex >= count) return 0;
  const leadingInset = Math.max(0, (viewportWidth - FILMSTRIP_THUMBNAIL_WIDTH) / 2);
  return Math.max(0, Math.round(leadingInset + selectedIndex * FILMSTRIP_ITEM_WIDTH + FILMSTRIP_THUMBNAIL_WIDTH / 2 - viewportWidth / 2));
}

function directoryAncestors(directoryId: string, model: ViewerModel): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let node = model.nodesById.get(directoryId);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    ancestors.push(node.id);
    node = node.parentId ? model.nodesById.get(node.parentId) : undefined;
  }
  return ancestors;
}

export const LibraryMediaViewer = memo(function LibraryMediaViewer({ items, roots, directorySettings, currentItemId, blurNsfwImages, directoryOnly = false, showDirectoryTree = true, embedded = false, initialPromptExpanded = false, promptRequestToken = 0, imageViewTransforms = {}, onSelectItem, onClose, onSaveImageViewTransform, onExitDirectory, onChangeDirectorySettings, onImmersiveChange, renderInfo, renderPromptPanel }: LibraryMediaViewerProps) {
  const { t } = useLocale();
  const model = useMemo(() => buildLibraryMediaViewerModel(items, roots, directorySettings, directoryOnly), [items, roots, directorySettings, directoryOnly]);
  const itemDirectoryId = resolveLibraryMediaViewerDirectory(currentItemId, model);
  const [directorySelection, setDirectorySelection] = useState(() => ({ directoryId: itemDirectoryId, itemId: currentItemId, itemDirectoryId }));
  const directoryId = directorySelection.itemId !== currentItemId || directorySelection.itemDirectoryId !== itemDirectoryId ||
    (directorySelection.directoryId !== UNFILED_LIBRARY_DIRECTORY_ID && !model.nodesById.has(directorySelection.directoryId))
    ? itemDirectoryId : directorySelection.directoryId;
  const [expandedIds, setExpandedIds] = useState(() => new Set([
    ...(model.settings.expandedNodeIds ?? model.settings.nodes.filter(node => node.kind === "root").map(node => node.id)),
    ...directoryAncestors(itemDirectoryId, model),
  ]));
  const [directorySidebarWidth, setDirectorySidebarWidth] = useState(() => clampDirectorySidebarWidth(model.settings.sidebarWidth));
  const directorySidebarWidthRef = useRef(directorySidebarWidth);
  const isDirectorySidebarResizingRef = useRef(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(initialPromptExpanded);
  const [promptPanelWidth, setPromptPanelWidth] = useState(() => clampPromptPanelWidth(Math.min(512, Math.max(352, typeof window === "undefined" ? 420 : window.innerWidth * 0.34))));
  const promptPanelWidthRef = useRef(promptPanelWidth);
  promptPanelWidthRef.current = promptPanelWidth;
  const [isPromptPanelMounted, setIsPromptPanelMounted] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const promptToggleRef = useRef<HTMLButtonElement>(null);
  const selectItemRef = useRef(onSelectItem);
  selectItemRef.current = onSelectItem;
  const immersiveChangeRef = useRef(onImmersiveChange);
  immersiveChangeRef.current = onImmersiveChange;
  const directoryItems = useMemo(() => {
    const directItems = model.itemsByDirectory.get(directoryId) ?? EMPTY_ITEMS;
    const node = model.nodesById.get(directoryId);
    // Root folders are the album entry point: show their descendants automatically.
    // A leafless parent also falls back to descendants so an empty physical folder is useful.
    return node?.kind === "root" || directItems.length === 0
      ? model.itemsByDirectoryWithDescendants.get(directoryId) ?? directItems
      : directItems;
  }, [directoryId, model]);
  const currentIndex = model.positionsByItemIdByDirectory.get(directoryId)?.get(currentItemId) ?? -1;
  const currentItem = directoryItems[currentIndex] ?? null;
  const directoryName = model.nodesById.get(directoryId)?.name ?? t("未归类");

  useEffect(() => {
    setDirectorySelection(previous => previous.itemId === currentItemId && previous.itemDirectoryId === itemDirectoryId ? previous : { directoryId: itemDirectoryId, itemId: currentItemId, itemDirectoryId });
  }, [currentItemId, itemDirectoryId]);

  useEffect(() => {
    setExpandedIds(previous => {
      const next = new Set([...previous].filter(id => model.nodesById.has(id)));
      for (const id of directoryAncestors(itemDirectoryId, model)) next.add(id);
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
  }, [itemDirectoryId, model]);

  useEffect(() => {
    if (isDirectorySidebarResizingRef.current) return;
    const next = clampDirectorySidebarWidth(model.settings.sidebarWidth);
    directorySidebarWidthRef.current = next;
    setDirectorySidebarWidth(next);
  }, [model.settings.sidebarWidth]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    viewerRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    setIsPromptExpanded(initialPromptExpanded);
    setIsPromptPanelMounted(false);
  }, [initialPromptExpanded, promptRequestToken]);

  useEffect(() => {
    immersiveChangeRef.current?.(isImmersive);
    // 沉浸模式铺满整个窗口并隐藏自绘标题栏：用根元素标记让 CSS 全局响应，
    // 多个查看器实例同时存在时也能正确记数，避免一个退出误清另一个的标记。
    const root = document.documentElement;
    const applyCount = (count: number) => {
      // 计数为 0 时必须删除属性：CSS 只判断属性存在与否，写入 "0" 会误隐藏标题栏。
      if (count > 0) root.dataset.mediaImmersiveViewers = String(count);
      else delete root.dataset.mediaImmersiveViewers;
    };
    const activeViewers = Number(root.dataset.mediaImmersiveViewers || 0);
    applyCount(isImmersive ? activeViewers + 1 : Math.max(0, activeViewers - 1));
    return () => {
      if (isImmersive) {
        immersiveChangeRef.current?.(false);
        const remaining = Number(document.documentElement.dataset.mediaImmersiveViewers || 1) - 1;
        applyCount(remaining);
      }
    };
  }, [isImmersive]);

  useEffect(() => {
    if (!isPromptExpanded) return;
    let canceled = false;
    // Paint the expanded rail first. The heavy editor is never evaluated in the default view.
    const frame = window.requestAnimationFrame(() => {
      if (!canceled) startTransition(() => setIsPromptPanelMounted(true));
    });
    return () => { canceled = true; window.cancelAnimationFrame(frame); };
  }, [isPromptExpanded]);

  useEffect(() => {
    const probes = getLibraryMediaViewerNeighborSources(directoryItems, currentIndex).map(src => {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = src;
      return image;
    });
    return () => { for (const image of probes) image.removeAttribute("src"); };
  }, [directoryItems, currentIndex]);

  const selectItem = useCallback((id: string) => {
    const nextItemDirectoryId = model.index.itemDirectoryById.get(id) ?? UNFILED_LIBRARY_DIRECTORY_ID;
    setDirectorySelection(previous => ({ ...previous, directoryId, itemId: id, itemDirectoryId: nextItemDirectoryId }));
    selectItemRef.current(id);
    viewerRef.current?.focus({ preventScroll: true });
  }, [directoryId, model]);
  const selectDirectory = useCallback((id: string) => {
    if (id !== UNFILED_LIBRARY_DIRECTORY_ID && !model.nodesById.has(id)) return;
    const directItems = model.itemsByDirectory.get(id) ?? EMPTY_ITEMS;
    const node = model.nodesById.get(id);
    const firstItem = (node?.kind === "root" || directItems.length === 0
      ? model.itemsByDirectoryWithDescendants.get(id) ?? directItems
      : directItems)[0];
    if (firstItem) {
      const nextItemDirectoryId = model.index.itemDirectoryById.get(firstItem.id) ?? UNFILED_LIBRARY_DIRECTORY_ID;
      setDirectorySelection({ directoryId: id, itemId: firstItem.id, itemDirectoryId: nextItemDirectoryId });
      selectItemRef.current(firstItem.id);
      viewerRef.current?.focus({ preventScroll: true });
    } else {
      setDirectorySelection(previous => ({ ...previous, directoryId: id }));
    }
  }, [model]);
  const resizeDirectorySidebar = useCallback((delta: number, commit = false) => {
    const next = clampDirectorySidebarWidth(directorySidebarWidthRef.current + delta);
    directorySidebarWidthRef.current = next;
    setDirectorySidebarWidth(next);
    if (commit && onChangeDirectorySettings) {
      void onChangeDirectorySettings({ ...model.settings, sidebarWidth: next });
    }
  }, [model.settings, onChangeDirectorySettings]);
  const resizePromptPanel = useCallback((delta: number) => {
    const next = clampPromptPanelWidth(promptPanelWidthRef.current - delta);
    promptPanelWidthRef.current = next;
    setPromptPanelWidth(next);
  }, []);
  const toggleDirectory = useCallback((id: string) => {
    setExpandedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const collapsePrompt = useCallback(() => {
    setIsPromptExpanded(false);
    setIsPromptPanelMounted(false);
    promptToggleRef.current?.focus({ preventScroll: true });
  }, []);
  const navigate = useCallback((key: string) => {
    const index = getLibraryMediaViewerNavigationIndex(directoryItems.length, currentIndex, key);
    const next = index === null ? null : directoryItems[index];
    if (next && next.id !== currentItemId) selectItem(next.id);
  }, [currentIndex, currentItemId, directoryItems, selectItem]);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    // Auxiliary dialogs/popovers keep their own keyboard handling, including portals.
    // The embedded workspace renders this viewer as a region, so the host lookup must also
    // recognise its data marker; otherwise arrow keys and Escape die before navigation.
    const host = target instanceof Element ? target.closest('[role="dialog"], [data-media-viewer-embedded="true"]') : null;
    if (target instanceof Element && (!viewerRef.current?.contains(target) || host !== viewerRef.current)) return;
    if (event.key === "Tab") {
      const container = viewerRef.current;
      if (!container) return;
      const controls = [...container.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]') && window.getComputedStyle(element).visibility !== "hidden");
      const nextFocus = getLibraryMediaViewerTabFocusTarget(controls, document.activeElement instanceof HTMLElement ? document.activeElement : null, event.shiftKey);
      if (nextFocus || !controls.length) {
        event.preventDefault();
        (nextFocus ?? container).focus({ preventScroll: true });
      }
      return;
    }
    if (isLibraryMediaViewerEditableTarget(event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (isImmersive) setIsImmersive(false);
      else if (isPromptExpanded) collapsePrompt();
      else onClose();
    } else if (getLibraryMediaViewerNavigationIndex(directoryItems.length, currentIndex, event.key) !== null) {
      event.preventDefault();
      event.stopPropagation();
      navigate(event.key);
    }
  };

  const content = (
    <div aria-label={t("大图详情查看器")} aria-modal={embedded && !isImmersive ? undefined : true} className={(embedded ? (isImmersive ? "app-window-overlay z-50" : "relative h-full w-full") : "app-window-overlay z-50") + " flex min-h-0 flex-col overflow-hidden text-foreground outline-none " + (isImmersive ? "media-viewer-immersive" : "bg-panel")} data-media-viewer-embedded={embedded ? "true" : "false"} data-media-viewer-immersive={isImmersive ? "true" : "false"} ref={viewerRef} role={embedded && !isImmersive ? "region" : "dialog"} tabIndex={-1} onKeyDown={handleKeyDown}>
      {isImmersive ? <div aria-hidden="true" className="absolute left-0 right-20 top-0 z-10 h-11 [-webkit-app-region:drag]" onDoubleClick={() => void window.suyanApi.toggleMaximizeWindow()} /> : null}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isImmersive && showDirectoryTree ? <ViewerDirectoryTree directoryOnly={directoryOnly} model={model} selectedId={directoryId} expandedIds={expandedIds} sidebarWidth={directorySidebarWidth} onSelect={selectDirectory} onToggle={toggleDirectory} onExitDirectory={onExitDirectory} onResize={resizeDirectorySidebar} /> : null}
        <main className={"group/viewer relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden " + (isImmersive ? "bg-transparent" : "bg-background")}>
          {!isImmersive ? <div className="pointer-events-none absolute left-3 top-3 z-20 opacity-0 transition-opacity group-hover/viewer:pointer-events-auto group-hover/viewer:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
            <button aria-label={t("退出大图查看器")} className="inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-panel/90 text-foreground shadow-image outline-none backdrop-blur-sm hover:bg-panel focus-visible:ring-2 focus-visible:ring-primary/40" title={t("退出大图查看器")} type="button" onClick={onClose}><X size={16} /></button>
          </div> : null}
          <ViewerMediaStage key={currentItem ? currentItem.id + ":" + currentItem.imageFileName + ":" + currentItem.updatedAt : directoryId} item={currentItem} savedTransform={currentItem ? imageViewTransforms[currentItem.id] ?? DEFAULT_IMAGE_VIEW_TRANSFORM : DEFAULT_IMAGE_VIEW_TRANSFORM} onSaveTransform={onSaveImageViewTransform} immersive={isImmersive} onToggleImmersive={() => setIsImmersive(previous => !previous)} blurNsfwImages={blurNsfwImages} emptyMessage={directoryItems.length ? t("请选择下方缩略图查看素材") : t("此目录没有可展示素材")} canPrevious={currentIndex > 0} canNext={currentIndex >= 0 && currentIndex < directoryItems.length - 1} onPrevious={() => navigate("ArrowLeft")} onNext={() => navigate("ArrowRight")} />
          {!isImmersive ? <ViewerFilmstrip key={directoryId} items={directoryItems} selectedIndex={currentIndex} directoryName={directoryName} blurNsfwImages={blurNsfwImages} onSelect={selectItem} /> : null}
        </main>
        {!isImmersive ? <aside aria-label={isPromptExpanded ? t("完整提示词面板") : t("素材信息轨")} className={"relative flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-panel " + (isPromptExpanded ? "" : "w-[clamp(12rem,19vw,17rem)] max-w-[24vw]")} style={{ width: isPromptExpanded ? promptPanelWidth : undefined }} data-prompt-panel-width={isPromptExpanded ? promptPanelWidth : undefined}>
          {isPromptExpanded ? <LibraryDirectoryResizeHandle label={t("调整提示词面板宽度")} width={promptPanelWidth} min={MIN_PROMPT_PANEL_WIDTH} max={MAX_PROMPT_PANEL_WIDTH} side="left" onResize={resizePromptPanel} /> : null}
          <header className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="truncate text-xs font-semibold text-muted">{isPromptExpanded ? t("提示词") : t("素材信息")}</span>
            <button aria-expanded={isPromptExpanded} aria-label={isPromptExpanded ? t("收起提示词") : t("展开提示词")} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-primary outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/35" ref={promptToggleRef} type="button" onClick={() => isPromptExpanded ? collapsePrompt() : setIsPromptExpanded(true)}>
              {isPromptExpanded ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}{isPromptExpanded ? t("收起") : t("展开提示词")}
            </button>
          </header>
          {!currentItem ? <p className="p-4 text-xs leading-6 text-muted">{t("请先选择素材")}</p> : isPromptExpanded ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" key={currentItem.id}>
              <Suspense fallback={<PromptPanelLoading />}>
                {isPromptPanelMounted ? renderPromptPanel(currentItem.id, collapsePrompt) : <PromptPanelLoading />}
              </Suspense>
            </div>
          ) : <div className="min-h-0 flex-1 overflow-y-auto">{renderInfo(currentItem.id, true)}</div>}
        </aside> : null}
      </div>
    </div>
  );
  if (embedded) return content;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
});

function PromptPanelLoading() {
  const { t } = useLocale();
  return <div className="flex min-h-0 flex-1 items-center justify-center gap-2 p-5 text-xs text-muted" role="status"><Loader2 className="animate-spin" size={16} />{t("正在展开提示词")}</div>;
}

const ViewerDirectoryTree = memo(function ViewerDirectoryTree({ model, directoryOnly, selectedId, expandedIds, sidebarWidth, onSelect, onToggle, onExitDirectory, onResize }: { model: ViewerModel; directoryOnly: boolean; selectedId: string; expandedIds: ReadonlySet<string>; sidebarWidth: number; onSelect: (id: string) => void; onToggle: (id: string) => void; onExitDirectory?: () => void; onResize: (delta: number, commit?: boolean) => void }) {
  const { t } = useLocale();
  const directoryColors = useMemo(() => buildLibraryDirectoryColors(model.settings.nodes), [model.settings.nodes]);
  const renderNode = (node: LibraryDirectoryNode, depth: number): ReactNode => {
    const children = model.childrenByParent.get(node.id) ?? [];
    const expanded = expandedIds.has(node.id);
    const selected = selectedId === node.id;
    return <li key={node.id} role="none">
      <div className={"flex min-w-0 items-center rounded-md " + (selected ? "bg-primary-soft text-primary" : "text-muted hover:bg-background hover:text-foreground")} style={{ paddingLeft: depth * 12 }}>
        {children.length ? <button aria-label={(expanded ? t("收起目录") : t("展开目录")) + "：" + node.name} aria-expanded={expanded} className="flex size-6 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/35" type="button" onClick={() => onToggle(node.id)}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="size-6 shrink-0" />}
        <button aria-expanded={children.length ? expanded : undefined} aria-level={depth + 1} aria-selected={selected} className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-2 pr-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/35" data-media-viewer-directory={node.id} data-directory-color={directoryColors.get(node.id)} role="treeitem" title={node.name} type="button" onClick={() => onSelect(node.id)}>
          {selected || expanded ? <FolderOpen className="shrink-0" size={15} style={{ color: directoryColors.get(node.id) }} /> : <Folder className="shrink-0" size={15} style={{ color: directoryColors.get(node.id) }} />}<span className="min-w-0 flex-1 truncate">{node.name}</span><span className="shrink-0 text-[10px] tabular-nums opacity-70">{model.index.counts.get(node.id) ?? 0}</span>
        </button>
      </div>
      {expanded && children.length ? <ul role="group">{children.map(child => renderNode(child, depth + 1))}</ul> : null}
    </li>;
  };
  return <aside aria-label={t("查看目录")} className="app-chrome-surface relative flex shrink-0 flex-col overflow-hidden border-r" style={{ width: sidebarWidth }}>
    <header data-media-viewer-directory-toggle="open" className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <h2 className="flex min-w-0 items-center gap-2 truncate text-xs font-semibold text-muted"><FolderTree className="shrink-0" size={14} />{t("目录")}</h2>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-2" role="tree">
      {!directoryOnly ? <button aria-level={1} aria-selected={selectedId === UNFILED_LIBRARY_DIRECTORY_ID} className={"mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/35 " + (selectedId === UNFILED_LIBRARY_DIRECTORY_ID ? "bg-primary-soft text-primary" : "text-muted hover:bg-background hover:text-foreground")} data-media-viewer-directory={UNFILED_LIBRARY_DIRECTORY_ID} role="treeitem" type="button" onClick={() => onSelect(UNFILED_LIBRARY_DIRECTORY_ID)}><Inbox size={15} /><span className="min-w-0 flex-1 truncate">{t("未归类")}</span><span className="text-[10px] tabular-nums opacity-70">{model.itemsByDirectory.get(UNFILED_LIBRARY_DIRECTORY_ID)?.length ?? 0}</span></button> : null}
      <ul role="group">{(model.childrenByParent.get(null) ?? []).map(node => renderNode(node, 0))}</ul>
    </div>
    {onExitDirectory ? <footer className="shrink-0 border-t border-border p-2"><button aria-label={t("退出目录模式")} className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-2 text-xs text-muted outline-none hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/35" data-feature-guide="directory-exit" type="button" onClick={onExitDirectory}><ArrowLeft size={14} />{t("退出目录模式")}</button></footer> : null}
    <LibraryDirectoryResizeHandle label={t("调整目录栏宽度")} width={sidebarWidth} min={MIN_DIRECTORY_SIDEBAR_WIDTH} max={MAX_DIRECTORY_SIDEBAR_WIDTH} onResize={onResize} />
  </aside>;
});

const ViewerFilmstrip = memo(function ViewerFilmstrip({ items, selectedIndex, directoryName, blurNsfwImages, onSelect }: { items: readonly LibraryItem[]; selectedIndex: number; directoryName: string; blurNsfwImages: boolean; onSelect: (id: string) => void }) {
  const { t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || selectedIndex < 0) return;
    const target = getLibraryMediaViewerFilmstripTargetScrollLeft(selectedIndex, items.length, element.clientWidth);
    if (Math.abs(element.scrollLeft - target) <= 1) return;
    if (typeof element.scrollTo === "function") element.scrollTo({ left: target, behavior: "smooth" });
    else element.scrollLeft = target;
  }, [items.length, selectedIndex, viewportWidth]);
  const sideInset = Math.max(0, (viewportWidth - FILMSTRIP_THUMBNAIL_WIDTH) / 2);
  const filmstripWindow = getLibraryMediaViewerFilmstripWindow(items.length, scrollLeft, viewportWidth, sideInset);
  const visibleItems = useMemo(() => items.slice(filmstripWindow.start, filmstripWindow.end), [items, filmstripWindow.start, filmstripWindow.end]);
  const trackWidth = items.length ? sideInset * 2 + (items.length - 1) * FILMSTRIP_ITEM_WIDTH + FILMSTRIP_THUMBNAIL_WIDTH : 0;
  return <footer className="shrink-0 border-t border-border bg-panel px-3 pb-1 pt-2">
    <div className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted"><span className="truncate">{directoryName}</span><span className="shrink-0">{t("当前目录全部素材：{count}", { count: items.length })}</span></div>
    <div aria-label={t("当前目录缩略图")} aria-orientation="horizontal" data-media-viewer-filmstrip="true" className="overflow-x-auto overflow-y-hidden" ref={scrollRef} role="listbox" onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
      {items.length ? <div className="relative" style={{ width: trackWidth, height: FILMSTRIP_ITEM_HEIGHT }}>
        {visibleItems.map((item, offset) => <ViewerThumbnail key={item.id} item={item} index={filmstripWindow.start + offset} count={items.length} sideInset={sideInset} selected={filmstripWindow.start + offset === selectedIndex} blurNsfwImages={blurNsfwImages} onSelect={onSelect} />)}
      </div> : <p className="flex h-16 items-center justify-center text-xs text-muted">{t("选择左侧其他目录继续浏览")}</p>}
    </div>
  </footer>;
});

const ViewerThumbnail = memo(function ViewerThumbnail({ item, index, count, sideInset, selected, blurNsfwImages, onSelect }: { item: LibraryItem; index: number; count: number; sideInset: number; selected: boolean; blurNsfwImages: boolean; onSelect: (id: string) => void }) {
  const { t } = useLocale();
  const fileName = getDirectoryItemFileName(item);
  const title = item.title || fileName;
  const image = useMemo(() => ({ imageFileName: item.imageFileName, nsfwRating: item.nsfwRating, title, updatedAt: item.updatedAt, mediaStatus: item.mediaStorage && item.mediaStorage !== "managed" ? item.mediaStorage.status ?? "available" : null }), [item, title]);
  return <button aria-label={t("查看素材：{title}", { title })} aria-posinset={index + 1} aria-selected={selected} aria-setsize={count} className={"absolute top-0 flex items-center justify-center overflow-hidden rounded-lg border-2 p-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " + (selected ? "border-primary bg-primary-soft" : "border-transparent bg-background hover:border-border")} data-media-viewer-thumbnail={item.id} role="option" style={{ left: sideInset + index * FILMSTRIP_ITEM_WIDTH, width: FILMSTRIP_THUMBNAIL_WIDTH, height: FILMSTRIP_ITEM_HEIGHT - 8 }} tabIndex={selected ? 0 : -1} title={title} type="button" onClick={() => onSelect(item.id)}>
    <NsfwImage alt={title} blurNsfwImages={blurNsfwImages} className="grid h-full min-h-0! w-full place-items-center overflow-hidden rounded-md" image={image} imageClassName="relative block h-full w-full min-h-0 min-w-0 object-contain object-center" loading={selected ? "eager" : "lazy"} placeholderClassName="min-h-0! [&_svg]:size-5" showRevealControl={false} source="thumbnail" />
    {isVideoMediaFile(fileName) ? <span className="absolute bottom-1 right-1 rounded bg-panel/90 p-0.5 text-muted"><Film size={11} /></span> : null}
  </button>;
});

const ViewerMediaStage = memo(function ViewerMediaStage({ item, savedTransform, onSaveTransform, immersive, onToggleImmersive, blurNsfwImages, emptyMessage, canPrevious, canNext, onPrevious, onNext }: { item: LibraryItem | null; savedTransform: ImageViewTransform; onSaveTransform?: (itemId: string, transform: ImageViewTransform) => Promise<boolean>; immersive: boolean; onToggleImmersive: () => void; blurNsfwImages: boolean; emptyMessage: string; canPrevious: boolean; canNext: boolean; onPrevious: () => void; onNext: () => void }) {
  const { t } = useLocale();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<MediaSize>({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<MediaSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<{ mode: "fit" | "manual"; scale: number }>({ mode: "fit", scale: 1 });
  const [pan, setPan] = useState<MediaPan>({ x: 0, y: 0 });
  const [previewTransform, setPreviewTransform] = useState(savedTransform);
  const [transformStatus, setTransformStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; pan: MediaPan } | null>(null);
  const isMissing = Boolean(item?.mediaStorage && item.mediaStorage !== "managed" && item.mediaStorage.status === "missing");
  const fileName = item ? getDirectoryItemFileName(item) : "";
  const isVideo = isVideoMediaFile(fileName);
  const isAudio = isAudioMediaFile(fileName);
  const hasMedia = Boolean(item?.imageFileName) && !isMissing && !isAudio;
  const shouldBlur = Boolean(item && blurNsfwImages && isNsfwItem(item) && !isRevealed);
  const orientedSize = getImageViewOrientedSize(naturalSize, previewTransform.rotation);
  const fitScale = getLibraryMediaViewerFitScale(orientedSize, viewport);
  const scale = zoom.mode === "fit" ? fitScale : zoom.scale;
  const zoomPercent = Math.max(1, Math.round(scale * 100));
  const canZoom = hasMedia && !isVideo && !hasFailed && naturalSize.width > 0;
  const canPan = canZoom && (orientedSize.width * scale > viewport.width || orientedSize.height * scale > viewport.height);
  const originalSrc = item?.imageFileName ? getImageSrc(item.imageFileName, item.updatedAt) : "";
  const src = retry ? originalSrc + (originalSrc.includes("?") ? "&" : "?") + "retry=" + retry : originalSrc;

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => {
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPreviewTransform(savedTransform);
    setPan({ x: 0, y: 0 });
    setTransformStatus("");
  }, [item?.id, savedTransform.rotation, savedTransform.flipHorizontal, savedTransform.flipVertical]);
  useEffect(() => {
    setPan(previous => {
      const next = clampLibraryMediaViewerPan(previous, orientedSize, viewport, scale);
      return previous.x === next.x && previous.y === next.y ? previous : next;
    });
  }, [orientedSize, scale, viewport]);

  const setScale = (nextScale: number) => { setZoom({ mode: "manual", scale: nextScale }); setPan(previous => clampLibraryMediaViewerPan(previous, orientedSize, viewport, nextScale)); };
  const previewOrSaveTransform = (next: ImageViewTransform, save: boolean) => {
    setPreviewTransform(next);
    setPan({ x: 0, y: 0 });
    setTransformStatus("");
    if (!save || !item || !onSaveTransform) return;
    void onSaveTransform(item.id, next).then(saved => {
      setTransformStatus(saved ? t("视图变换已记住") : t("保存视图变换失败"));
    }).catch(() => setTransformStatus(t("保存视图变换失败")));
  };
  const handleTransformContextMenu = (event: MouseEvent<HTMLButtonElement>, next: ImageViewTransform) => {
    event.preventDefault();
    previewOrSaveTransform(next, true);
  };
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const friendlyMessage = !item ? emptyMessage : isMissing ? t("源文件缺失") : isAudio ? t("此素材为音频，请在素材详情中播放") : !item.imageFileName ? t("此素材没有可读取的图像") : isVideo ? t("此视频暂时无法读取") : t("此图像暂时无法读取");

  const rotation = previewTransform.rotation;
  const imageTransform = "translate(-50%, -50%) translate(" + pan.x + "px, " + pan.y + "px) rotate(" + rotation + "deg)" + (previewTransform.flipHorizontal ? " scaleX(-1)" : "") + (previewTransform.flipVertical ? " scaleY(-1)" : "");
  const rotateNext = rotateImageViewTransform(previewTransform);
  const flipNext = toggleImageViewHorizontalFlip(previewTransform);
  const flipVerticalNext = toggleImageViewVerticalFlip(previewTransform);

  return <section aria-label={t("大图预览")} className={"group relative flex min-h-0 flex-1 overflow-hidden " + (immersive ? "media-viewer-immersive" : "bg-background")} data-media-viewer-stage data-media-viewer-immersive={immersive ? "true" : "false"}>
    <div aria-busy={hasMedia && !hasFailed && isLoading} className={"absolute inset-0 overflow-hidden " + (immersive ? "" : "bg-background ") + (canPan ? isDragging ? "cursor-grabbing" : "cursor-grab" : "")} ref={surfaceRef} style={{ touchAction: isVideo ? "auto" : "none" }}
      onPointerDown={event => {
        if (event.button !== 0 || !canPan || (event.target instanceof Element && event.target.closest("button, input, select, textarea, video"))) return;
        event.preventDefault();
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setPan(clampLibraryMediaViewerPan({ x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y }, orientedSize, viewport, scale));
      }} onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
      {hasMedia && !hasFailed ? isVideo ? <video aria-label={item?.title || t("效果视频")} className={"h-full w-full object-contain " + (shouldBlur ? "blur-2xl" : "")} controls={!shouldBlur} key={src} playsInline poster={item?.videoPosterFileName ? getImageSrc(item.videoPosterFileName, item.updatedAt) : undefined} preload="metadata" src={src} onError={() => { setHasFailed(true); setIsLoading(false); }} onLoadedMetadata={event => { setNaturalSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight }); setIsLoading(false); }} /> : (
        <img alt={item?.title || t("效果图")} className={"absolute left-1/2 top-1/2 block max-w-none select-none object-contain " + (shouldBlur ? "blur-2xl" : "")} decoding="async" draggable={false} fetchPriority="high" key={src} src={src} style={{ width: naturalSize.width ? naturalSize.width * scale : "100%", height: naturalSize.height ? naturalSize.height * scale : "100%", transform: imageTransform }} onError={() => { setHasFailed(true); setIsLoading(false); }} onLoad={event => { setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setIsLoading(false); }} />
      ) : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-muted" role="status"><ImageOff size={34} /><p className="text-sm font-medium">{friendlyMessage}</p><p className="max-w-sm text-xs leading-6">{isMissing || hasFailed ? t("请确认源文件仍存在且可以读取，或选择其他素材继续浏览。") : t("选择左侧目录或下方缩略图继续浏览。")}</p>{hasFailed ? <button className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs text-foreground hover:bg-primary-soft" type="button" onClick={() => { setRetry(previous => previous + 1); setHasFailed(false); setIsLoading(true); }}>{t("重试")}</button> : null}</div>}
      {hasMedia && !hasFailed && isLoading ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted" role="status"><Loader2 className="animate-spin" size={22} /><span className="sr-only">{t("正在读取素材")}</span></div> : null}
      {shouldBlur && hasMedia && !hasFailed ? <button className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-panel px-4 py-2 text-xs text-foreground shadow-image outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/35" type="button" onClick={() => setIsRevealed(true)}><Eye size={15} />{isVideo ? t("显示视频") : t("显示图像")}</button> : null}
    </div>
    {canPrevious ? <button aria-label={t("上一张")} className="absolute left-2 top-1/2 z-10 flex h-28 w-14 -translate-y-1/2 items-center justify-start rounded-lg text-foreground opacity-0 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100" data-media-viewer-previous type="button" onClick={onPrevious}><span className="rounded-full border border-border/70 bg-panel/85 p-2 shadow-image hover:bg-panel"><ChevronLeft size={20} /></span></button> : null}
    {canNext ? <button aria-label={t("下一张")} className="absolute right-2 top-1/2 z-10 flex h-28 w-14 -translate-y-1/2 items-center justify-end rounded-lg text-foreground opacity-0 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100" data-media-viewer-next type="button" onClick={onNext}><span className="rounded-full border border-border/70 bg-panel/85 p-2 shadow-image hover:bg-panel"><ChevronRight size={20} /></span></button> : null}
    {immersive ? <div className="absolute right-0 top-0 z-30 flex h-16 w-20 items-start justify-end p-3 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100 [-webkit-app-region:no-drag]" data-media-viewer-immersive-exit><button aria-label={t("退出沉浸模式")} className="rounded-md border border-border/70 bg-panel/85 p-1.5 text-foreground shadow-image outline-none [-webkit-app-region:no-drag] hover:bg-panel focus-visible:ring-2 focus-visible:ring-primary/40" type="button" onClick={onToggleImmersive}><Shrink size={17} /></button></div> : null}
    {!immersive ? <div className="pointer-events-none absolute right-3 top-3 z-10 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
      <div className="flex max-w-[min(100%,360px)] items-center gap-1.5 rounded-lg border border-border/70 bg-panel/90 px-2 py-1.5 text-[10px] text-muted shadow-image backdrop-blur-sm">
        <span className="max-w-24 truncate tabular-nums">{naturalSize.width > 0 ? naturalSize.width + " × " + naturalSize.height : isVideo ? t("视频") : t("图像")}</span>
        <ViewerToolButton active={zoom.mode === "fit"} disabled={!canZoom} icon={<Maximize2 size={13} />} label={t("适应窗口")} onClick={() => { setZoom({ mode: "fit", scale: 1 }); setPan({ x: 0, y: 0 }); }} />
        <button aria-label={t("原始尺寸 100%")} aria-pressed={zoom.mode === "manual" && scale === 1} className={"rounded-md px-1.5 py-1 text-[10px] outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/35 disabled:opacity-40 " + (zoom.mode === "manual" && scale === 1 ? "bg-primary-soft text-primary" : "text-muted")} disabled={!canZoom} type="button" onClick={() => { setZoom({ mode: "manual", scale: 1 }); setPan({ x: 0, y: 0 }); }}>100%</button>
        <ViewerToolButton active={previewTransform.rotation !== savedTransform.rotation} dataAction="rotate" disabled={!canZoom} icon={<RotateCw size={13} />} label={t("旋转（左键预览，右键记住）")} onClick={() => previewOrSaveTransform(rotateNext, false)} onContextMenu={event => handleTransformContextMenu(event, rotateNext)} />
        <ViewerToolButton active={previewTransform.flipHorizontal !== savedTransform.flipHorizontal} dataAction="flip-horizontal" disabled={!canZoom} icon={<FlipHorizontal2 size={13} />} label={t("水平镜像（左键预览，右键记住）")} onClick={() => previewOrSaveTransform(flipNext, false)} onContextMenu={event => handleTransformContextMenu(event, flipNext)} />
        <ViewerToolButton active={previewTransform.flipVertical !== savedTransform.flipVertical} dataAction="flip-vertical" disabled={!canZoom} icon={<FlipVertical2 size={13} />} label={t("垂直镜像（左键预览，右键记住）")} onClick={() => previewOrSaveTransform(flipVerticalNext, false)} onContextMenu={event => handleTransformContextMenu(event, flipVerticalNext)} />
        <ViewerToolButton dataImmersiveToggle icon={<Expand size={13} />} label={t("进入沉浸模式")} onClick={onToggleImmersive} />
        <ZoomOut className="shrink-0 text-muted" size={11} />
        <input aria-label={t("图像缩放")} aria-valuetext={zoomPercent + "%"} className="w-16 accent-primary disabled:opacity-40" disabled={!canZoom} max={Math.max(400, Math.ceil(fitScale * 100), zoomPercent)} min={Math.max(1, Math.min(10, Math.floor(fitScale * 100)))} step={1} type="range" value={zoomPercent} onChange={event => setScale(Number(event.target.value) / 100)} />
        <ZoomIn className="shrink-0 text-muted" size={11} /><span className="w-8 text-right tabular-nums">{canZoom ? zoomPercent + "%" : "—"}</span>
        {transformStatus ? <span className="sr-only" role="status">{transformStatus}</span> : null}
      </div>
    </div> : null}
  </section>;
});

function ViewerToolButton({ icon, label, active = false, disabled = false, dataAction, dataImmersiveToggle = false, onClick, onContextMenu }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; dataAction?: string; dataImmersiveToggle?: boolean; onClick: () => void; onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return <button aria-label={label} aria-pressed={active || undefined} className={"inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-default disabled:opacity-35 " + (active ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground")} data-media-viewer-action={dataAction} data-media-viewer-immersive-toggle={dataImmersiveToggle ? "true" : undefined} disabled={disabled} title={label} type="button" onClick={onClick} onContextMenu={onContextMenu}>{icon}</button>;
}
