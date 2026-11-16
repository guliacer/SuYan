import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Copy, Download, FileImage, FileText, Film, Folder, FolderOpen, FolderPlus, FolderTree, GripVertical, Grid2X2, Heart, Inbox, Info, List, MoreHorizontal, PanelRight, Pencil, RefreshCw, Search, SlidersHorizontal, Square, Tag, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import type { LibraryDirectoryNode, LibraryDirectorySettings, LibraryItem, LibraryRoot } from "../types/library";
import { ALL_LIBRARY_DIRECTORY_ID, UNFILED_LIBRARY_DIRECTORY_ID, assignLibraryItemsToDirectory, buildLibraryDirectoryItemIndex, buildLibraryDirectoryFacets, getLibraryDirectoryScopedItems, getLibraryDirectoryWorkspaceSettings, getLibraryDirectoryAncestorIds, resolveLibraryDirectorySelection, compareDirectoryNodes, createLibraryDirectoryFolder, getDefaultLibraryItemDirectoryId, getDirectoryItemFileName, getDirectoryNodeDescendantIds, mergeLibraryDirectoryNodes, moveLibraryDirectoryNode, removeLibraryDirectoryFolder, renameLibraryDirectoryFolder, selectLibraryDirectoryItems, selectLibraryDirectoryRange, type LibraryDirectoryDropPosition } from "../utils/libraryDirectory";
import { getMediaFileExtension, isVideoMediaFile } from "../utils/mediaFileTypes";
import { getLibraryItemSourcePath } from "../utils/libraryImportSource";
import { distributeItemsByTopEdge } from "../utils/masonryLayout";
import { toPromptCardData, type PromptCardData } from "../utils/promptFilters";
import { NsfwImage } from "./NsfwImage";
import { LibraryAssetInfo } from "./LibraryAssetInfo";
import type { VisualLifeSettings } from "../utils/visualLife";
import type { CategoryTaxonomy } from "../types/category";
import { LibraryDirectoryBrowseControls, LibraryDirectorySizeControl } from "./LibraryDirectoryBrowseControls";
import { LIBRARY_DIRECTORY_COLOR_PRESETS, buildLibraryDirectoryColors, setLibraryDirectoryColor } from "../utils/libraryDirectoryAppearance";

const DIRECTORY_DRAG_MIME = "application/x-suyan-directory";
const ITEM_DRAG_MIME = "application/x-suyan-library-items";
const PAGE_SIZE = 160;
const MIN_DIRECTORY_SIDEBAR_WIDTH = 180;
const MAX_DIRECTORY_SIDEBAR_WIDTH = 420;
function clampDirectorySidebarWidth(value: number): number { return Math.max(MIN_DIRECTORY_SIDEBAR_WIDTH, Math.min(MAX_DIRECTORY_SIDEBAR_WIDTH, Math.round(value))); }
type TreeNode = LibraryDirectoryNode & { smart?: "all" | "unfiled" };
type DropTarget = { id: string; position: LibraryDirectoryDropPosition } | null;
type ContextTarget = { kind: "item" | "folder"; id: string; x: number; y: number } | null;
type Operation = { kind: "create-folder"; parentId: string | null } | { kind: "rename-folder" | "remove-folder"; nodeId: string } | { kind: "rename-item"; itemId: string } | { kind: "move" | "tags" | "remove-items"; itemIds: string[] };
export type LibraryDirectoryModeProps = {
  blurNsfwImages: boolean; isBusy: boolean; isSidebarOpen: boolean; items: readonly LibraryItem[]; roots: readonly LibraryRoot[];
  categoryTaxonomy?: CategoryTaxonomy | null;
  settings: LibraryDirectorySettings; likedImageIds: readonly string[]; visualLifeSettings: VisualLifeSettings;
  onAddDirectory: () => void; onChangeSettings: (settings: LibraryDirectorySettings) => Promise<boolean>;
  onExit: () => void; onOpenManager: () => void;
  onPrepareItem?: (itemId: string) => void;
  renderFocusedViewer?: (
    request: { itemId: string; promptExpanded: boolean; promptRequestToken: number },
    callbacks: {
      onClose: () => void;
      onSelectItem: (itemId: string) => void;
      onImmersiveChange: (immersive: boolean) => void;
    },
  ) => ReactNode;
  onScanRoot: (rootId: string) => void; onValidate: () => void;
  onCopyImage: (imageFileName: string) => Promise<void>; onCopyText: (text: string, successText: string) => Promise<void>;
  onToggleFavorite: (itemId: string) => Promise<void>; onSaveTags: (ids: string[], tags: string[]) => Promise<boolean>;
  onRenameItem: (itemId: string, title: string) => Promise<boolean>; onExportItems: (ids: string[]) => Promise<unknown>;
  onDeleteItems: (ids: string[]) => Promise<boolean>;
  onSaveItem: (itemId: string, patch: Partial<LibraryItem>) => Promise<boolean>;
  onExportImage: (imageFileName: string) => Promise<void>;
};

export function LibraryDirectoryMode(props: LibraryDirectoryModeProps) {
  const { t } = useLocale();
  const { items, roots, settings, likedImageIds, isBusy, onChangeSettings } = props;
  const merged = useMemo(() => getLibraryDirectoryWorkspaceSettings(mergeLibraryDirectoryNodes({ roots, items, settings })), [roots, items, settings]);
  const settingsRef = useRef(merged);
  settingsRef.current = merged;
  useEffect(() => { if (JSON.stringify(settings) !== JSON.stringify(merged)) void onChangeSettings(merged); }, [merged, onChangeSettings, settings]);
  const [selectedId, setSelectedId] = useState(merged.selectedNodeId ?? ALL_LIBRARY_DIRECTORY_ID);
  const previousSavedSelectionRef = useRef(merged.selectedNodeId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(merged.expandedNodeIds ?? merged.nodes.filter(n => n.kind === "root").map(n => n.id)));
  const [query, setQuery] = useState(merged.searchQuery);
  const deferredQuery = useDeferredValue(query);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [focusedViewer, setFocusedViewer] = useState<{ itemId: string; promptExpanded: boolean; promptRequestToken: number } | null>(null);
  const focusedViewerRequestRef = useRef(0);
  const [isFocusedViewerImmersive, setIsFocusedViewerImmersive] = useState(false);
  const anchorRef = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [context, setContext] = useState<ContextTarget>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [galleryWidth, setGalleryWidth] = useState(1000);
  const [sidebarWidth, setSidebarWidth] = useState(() => clampDirectorySidebarWidth(merged.sidebarWidth));
  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => { const next = clampDirectorySidebarWidth(merged.sidebarWidth); sidebarWidthRef.current = next; setSidebarWidth(next); }, [merged.sidebarWidth]);
  const [aspectById, setAspectById] = useState<Map<string, number>>(() => new Map());
  const galleryRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const smartNodes = useMemo<TreeNode[]>(() => [
    { id: ALL_LIBRARY_DIRECTORY_ID, name: t("全部目录"), parentId: null, rootId: "__system__", relativePath: "", kind: "virtual", order: -1, smart: "all" },
  ], [t]);
  const nodesById = useMemo(() => new Map([...merged.nodes, ...smartNodes].map(n => [n.id, n as TreeNode])), [merged.nodes, smartNodes]);
  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, TreeNode[]>();
    for (const node of merged.nodes) { const siblings = result.get(node.parentId) ?? []; siblings.push(node); result.set(node.parentId, siblings); }
    for (const group of result.values()) group.sort(compareDirectoryNodes);
    return result;
  }, [merged.nodes]);
  const fullIndex = useMemo(() => buildLibraryDirectoryItemIndex(items, merged), [items, merged]);
  const directoryItems = useMemo(() => getLibraryDirectoryScopedItems(items, fullIndex.itemDirectoryById), [items, fullIndex]);
  const index = useMemo(() => buildLibraryDirectoryItemIndex(directoryItems, merged), [directoryItems, merged]);
  const colorsById = useMemo(() => buildLibraryDirectoryColors(merged.nodes), [merged.nodes]);
  const facets = useMemo(() => buildLibraryDirectoryFacets(directoryItems), [directoryItems]);
  const categoryNames = useMemo(() => new Map(props.categoryTaxonomy?.nodes.map(node => [node.id, node.name]) ?? []), [props.categoryTaxonomy]);
  const categoryOptions = useMemo(() => facets.categories.map(facet => ({ value: facet.value, label: facet.value === "__uncategorized__" ? t("未分类") : categoryNames.get(facet.value) ?? facet.value })), [facets.categories, categoryNames, t]);
  const currentNode = nodesById.get(selectedId) ?? smartNodes[0];
  const breadcrumb = useMemo(() => {
    const result: TreeNode[] = []; const visited = new Set<string>(); let node: TreeNode | undefined = currentNode;
    while (node && !visited.has(node.id)) { result.unshift(node); visited.add(node.id); node = node.parentId ? nodesById.get(node.parentId) : undefined; }
    if (result[0]?.id !== ALL_LIBRARY_DIRECTORY_ID) result.unshift(smartNodes[0]); return result;
  }, [currentNode, nodesById, smartNodes]);
  const hasActiveFilter = Boolean(deferredQuery.trim() || merged.favoriteOnly || merged.formatFilter || merged.tagFilter || merged.availabilityFilter !== "all" || merged.mediaFilter !== "all" || merged.categoryFilter || merged.minimumRating);
  const effectiveIncludeDescendants = merged.includeDescendants || currentNode.kind === "root";
  const isDirectoryOverview = selectedId === ALL_LIBRARY_DIRECTORY_ID && !hasActiveFilter;
  const filteredItems = useMemo(() => isDirectoryOverview ? [] : selectLibraryDirectoryItems(directoryItems, { ...merged, includeDescendants: effectiveIncludeDescendants, selectedNodeId: selectedId, searchQuery: deferredQuery }, likedImageIds, index.itemDirectoryById), [directoryItems, merged, effectiveIncludeDescendants, selectedId, deferredQuery, likedImageIds, index, isDirectoryOverview]);
  const orderedIds = useMemo(() => filteredItems.map(item => item.id), [filteredItems]);
  const visibleItems = useMemo(() => filteredItems.slice(0, visibleLimit).map(raw => ({ raw, card: toPromptCardData(raw) })), [filteredItems, visibleLimit]);
  const focusedItem = directoryItems.find(item => item.id === focusedId) ?? null;
  const detailItem = detailItemId ? directoryItems.find(item => item.id === detailItemId) ?? null : null;
  const pathItem = focusedItem ?? detailItem;
  const selectedFilePath = pathItem ? getLibraryItemSourcePath(pathItem, roots.find(root => pathItem.mediaStorage && pathItem.mediaStorage !== "managed" && root.id === pathItem.mediaStorage.rootId), t("软件素材库")) : null;
  const likedSet = useMemo(() => new Set(likedImageIds), [likedImageIds]);
  const formats = useMemo(() => Array.from(new Set(directoryItems.map(item => getMediaFileExtension(getDirectoryItemFileName(item)).slice(1)).filter(Boolean))).sort(), [directoryItems]);
  const tags = useMemo(() => Array.from(new Set(directoryItems.flatMap(item => item.tags))).sort((a, b) => a.localeCompare(b, "zh-CN")), [directoryItems]);
  const columnCount = Math.max(1, Math.min(8, Math.floor((galleryWidth + 12) / (settings.tileSize + 12))));
  const columns = useMemo(() => distributeItemsByTopEdge(visibleItems, columnCount, entry => 1 / (aspectById.get(entry.raw.id) ?? (isVideoMediaFile(entry.raw.imageFileName) ? 16 / 9 : 1))), [visibleItems, columnCount, aspectById]);
  const currentChildren = currentNode.smart === "all" ? childrenByParent.get(null) ?? [] : currentNode.smart ? [] : childrenByParent.get(currentNode.id) ?? [];
  const displayedCount = !hasActiveFilter && currentChildren.length && (isDirectoryOverview || !effectiveIncludeDescendants) ? index.counts.get(selectedId) ?? filteredItems.length : filteredItems.length;
  const coverByNodeId = useMemo(() => {
    const result = new Map<string, PromptCardData>();
    for (const item of directoryItems) {
      let node = nodesById.get(index.itemDirectoryById.get(item.id) ?? ""); const seen = new Set<string>();
      while (node && !seen.has(node.id)) { if (!result.has(node.id)) result.set(node.id, toPromptCardData(item)); seen.add(node.id); node = node.parentId ? nodesById.get(node.parentId) : undefined; }
    } return result;
  }, [directoryItems, nodesById, index]);
  const commit = useCallback(async (patch: Partial<LibraryDirectorySettings>, message?: string) => {
    const next = { ...settingsRef.current, ...patch }; settingsRef.current = next;
    try {
      const saved = await onChangeSettings(next);
      if (!saved) setFeedback(t("目录设置保存失败，已恢复上次保存的状态。"));
      else if (message) setFeedback(message);
      return saved;
    } catch { setFeedback(t("目录设置保存失败，已恢复上次保存的状态。")); return false; }
  }, [onChangeSettings, t]);
  const resizeSidebar = useCallback((delta: number, shouldCommit = false) => {
    const next = clampDirectorySidebarWidth(sidebarWidthRef.current + delta);
    sidebarWidthRef.current = next; setSidebarWidth(next);
    if (shouldCommit) void commit({ sidebarWidth: next });
  }, [commit]);
  const selectDirectory = useCallback((id: string) => { setSelectedId(id); setSelectedItems(new Set()); setFocusedId(null); setDetailItemId(null); setFocusedViewer(null); setIsFocusedViewerImmersive(false); anchorRef.current = null; setVisibleLimit(PAGE_SIZE); void commit({ selectedNodeId: id }); }, [commit]);
  useEffect(() => {
    const nextSelectedId = resolveLibraryDirectorySelection(selectedId, previousSavedSelectionRef.current, merged.selectedNodeId, nodesById);
    previousSavedSelectionRef.current = merged.selectedNodeId;
    if (nextSelectedId !== selectedId) { setSelectedId(nextSelectedId); setSelectedItems(new Set()); setFocusedId(null); setDetailItemId(null); setFocusedViewer(null); setIsFocusedViewerImmersive(false); anchorRef.current = null; }
    setExpandedIds(current => {
      const next = new Set((merged.expandedNodeIds ?? [...current]).filter(id => nodesById.has(id)));
      if (nextSelectedId !== selectedId) for (const id of getLibraryDirectoryAncestorIds(merged.nodes, nextSelectedId)) next.add(id);
      if (merged.expandedNodeIds === null) for (const node of merged.nodes) if (node.kind === "root") next.add(node.id);
      return next.size === current.size && [...next].every(id => current.has(id)) ? current : next;
    });
  }, [merged.nodes, merged.expandedNodeIds, merged.selectedNodeId, nodesById, selectedId]);
  useEffect(() => { setVisibleLimit(PAGE_SIZE); const valid = new Set(orderedIds); setSelectedItems(current => { const next = new Set([...current].filter(id => valid.has(id))); return next.size === current.size ? current : next; }); setFocusedId(current => current && valid.has(current) ? current : null); setDetailItemId(current => current && valid.has(current) ? current : null); setFocusedViewer(current => current && valid.has(current.itemId) ? current : null); }, [orderedIds]);
  useEffect(() => { if (!focusedViewer) return; if (!directoryItems.some(item => item.id === focusedViewer.itemId)) { setFocusedViewer(null); setIsFocusedViewerImmersive(false); } }, [directoryItems, focusedViewer]);
  useEffect(() => { if (!feedback) return; const timer = window.setTimeout(() => setFeedback(null), 5000); return () => window.clearTimeout(timer); }, [feedback]);
  useEffect(() => {
    const node = galleryRef.current; if (!node) return;
    const measure = () => setGalleryWidth(node.getBoundingClientRect().width);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node); return () => observer.disconnect();
  }, [settings.showDetails, detailItemId]);
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); void commit({ expandedNodeIds: [...next] }); return next; });
  }, [commit]);
  const selectItem = useCallback((event: MouseEvent<HTMLElement>, id: string) => {
    setSelectedItems(current => selectLibraryDirectoryRange(orderedIds, [...current], id, { additive: event.ctrlKey || event.metaKey, range: event.shiftKey, anchorId: anchorRef.current }));
    if (!event.shiftKey) anchorRef.current = id;
    setFocusedId(id);
    setDetailItemId(id);
  }, [orderedIds]);
  const toggleItem = useCallback((id: string) => { setSelectedItems(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); anchorRef.current = id; setFocusedId(id); }, []);
  const openFocusedViewer = useCallback((id: string, promptExpanded: boolean) => {
    props.onPrepareItem?.(id);
    focusedViewerRequestRef.current += 1;
    setFocusedId(id);
    setDetailItemId(id);
    setIsFocusedViewerImmersive(false);
    setFocusedViewer({ itemId: id, promptExpanded, promptRequestToken: focusedViewerRequestRef.current });
  }, [props.onPrepareItem]);
  const closeFocusedViewer = useCallback(() => { setFocusedViewer(null); setIsFocusedViewerImmersive(false); }, []);
  const selectFocusedViewerItem = useCallback((id: string) => {
    setFocusedId(id);
    setDetailItemId(id);
    setFocusedViewer(current => current ? { ...current, itemId: id } : current);
  }, []);
  const openContext = useCallback((event: MouseEvent<HTMLElement>, kind: "item" | "folder", id: string) => {
    event.preventDefault(); event.stopPropagation();
    if (kind === "item") { setSelectionMode(true); if (!selectedItems.has(id)) setSelectedItems(new Set([id])); setFocusedId(id); }
    else selectDirectory(id);
    setContext({ kind, id, x: event.clientX, y: event.clientY });
  }, [selectedItems, selectDirectory]);
  const itemDragStart = useCallback((event: DragEvent<HTMLElement>, id: string) => {
    event.stopPropagation(); const ids = selectedItems.has(id) ? [...selectedItems] : [id];
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(ITEM_DRAG_MIME, JSON.stringify(ids));
  }, [selectedItems]);
  const directoryDragStart = useCallback((event: DragEvent<HTMLElement>, id: string) => { event.stopPropagation(); setDraggedId(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(DIRECTORY_DRAG_MIME, id); }, []);
  const dragOver = useCallback((event: DragEvent<HTMLElement>, node: TreeNode) => {
    event.stopPropagation(); const itemPayload = event.dataTransfer.types.includes(ITEM_DRAG_MIME);
    if (node.smart === "all" || node.smart === "unfiled" && !itemPayload) return;
    const position = itemPayload ? "inside" : dropPosition(event);
    if (!itemPayload) { if (!draggedId) return; try { moveLibraryDirectoryNode(merged.nodes, draggedId, node.id, position); } catch { event.dataTransfer.dropEffect = "none"; setDropTarget(null); return; } }
    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget({ id: node.id, position });
  }, [draggedId, merged.nodes]);
  const drop = useCallback((event: DragEvent<HTMLElement>, node: TreeNode) => {
    event.preventDefault(); event.stopPropagation(); setDropTarget(null); setDraggedId(null);
    try {
      const payload = event.dataTransfer.getData(ITEM_DRAG_MIME);
      if (payload) {
        const ids = parseItemIds(payload).filter(id => items.some(item => item.id === id));
        if (!ids.length || node.smart === "all") return;
        void commit({ itemFolderIds: assignLibraryItemsToDirectory(ids, node.id, merged.nodes, merged.itemFolderIds) }, t("已归纳 {count} 个素材", { count: ids.length })); setSelectedItems(new Set()); return;
      }
      const sourceId = event.dataTransfer.getData(DIRECTORY_DRAG_MIME) || draggedId;
      if (!sourceId || node.smart) return;
      const position = dropPosition(event); const nodes = moveLibraryDirectoryNode(merged.nodes, sourceId, node.id, position);
      if (position === "inside") setExpandedIds(current => new Set([...current, node.id]));
      void commit({ nodes, expandedNodeIds: position === "inside" ? [...new Set([...expandedIds, node.id])] : [...expandedIds] }, t("目录层级与顺序已保存"));
    } catch (error) { setFeedback(error instanceof Error ? error.message : t("目录拖拽未完成")); }
  }, [items, merged, draggedId, expandedIds, commit, t]);
  const captureAspect = useCallback((id: string, target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement) || !target.naturalWidth || !target.naturalHeight) return;
    const aspect = target.naturalWidth / target.naturalHeight;
    setAspectById(current => { if (current.get(id) === aspect) return current; const next = new Map(current); next.set(id, aspect); return next; });
  }, []);
  const locateOriginal = useCallback((item: LibraryItem) => {
    const id = getDefaultLibraryItemDirectoryId(item, merged.nodes) ?? index.itemDirectoryById.get(item.id) ?? ALL_LIBRARY_DIRECTORY_ID;
    setQuery(""); selectDirectory(id);
    void commit({ browseBy: "directories", selectedNodeId: id, searchQuery: "", tagFilter: "", categoryFilter: "", formatFilter: "", mediaFilter: "all", favoriteOnly: false, minimumRating: 0, availabilityFilter: "all", includeDescendants: false, expandedNodeIds: [...new Set([...(merged.expandedNodeIds ?? []), ...getLibraryDirectoryAncestorIds(merged.nodes, id)])] });
    setFeedback(t("已定位到原始素材目录"));
  }, [merged.nodes, merged.expandedNodeIds, index, selectDirectory, commit, t]);
  const runAction = (action: () => Promise<unknown>) => { setContext(null); void action().catch(() => setFeedback(t("操作未完成，请查看错误提示"))); };
  const newFolder = () => setOperation({ kind: "create-folder", parentId: currentNode.smart ? null : currentNode.id });
  const activeIds = selectedItems.size ? [...selectedItems] : focusedId ? [focusedId] : [];
  const submitOperation = async (value: string): Promise<boolean> => {
    if (!operation) return false;
    if (operation.kind === "create-folder") {
      const next = createLibraryDirectoryFolder(settingsRef.current, { id: "library-virtual:" + crypto.randomUUID(), name: value, parentId: operation.parentId });
      const expanded = new Set(expandedIds); if (operation.parentId) expanded.add(operation.parentId); next.expandedNodeIds = [...expanded];
      const saved = await commit(next, t("归纳目录已创建")); if (saved) { setSelectedId(next.selectedNodeId!); setExpandedIds(expanded); setSelectedItems(new Set()); setFocusedId(null); } return saved;
    }
    if (operation.kind === "rename-folder") return commit(renameLibraryDirectoryFolder(settingsRef.current, operation.nodeId, value), t("目录名称已保存"));
    if (operation.kind === "remove-folder") { const next = removeLibraryDirectoryFolder(settingsRef.current, operation.nodeId); const saved = await commit(next, t("归纳目录已移除，原文件保留")); if (saved) selectDirectory(next.selectedNodeId ?? ALL_LIBRARY_DIRECTORY_ID); return saved; }
    if (operation.kind === "rename-item") return props.onRenameItem(operation.itemId, value.trim());
    if (operation.kind === "move") return commit({ itemFolderIds: assignLibraryItemsToDirectory(operation.itemIds, value, merged.nodes, merged.itemFolderIds) }, t("已归纳 {count} 个素材", { count: operation.itemIds.length }));
    if (operation.kind === "tags") { const newTags = value.split(/[,，;；\n]/).map(tag => tag.trim()).filter(Boolean); if (!newTags.length) throw new Error(t("请输入至少一个标签")); return props.onSaveTags(operation.itemIds, [...new Set(newTags)]); }
    if (operation.kind === "remove-items") { const saved = await props.onDeleteItems(operation.itemIds); if (saved) { setSelectedItems(new Set()); setFocusedId(null); } return saved; }
    return false;
  };
  const handleKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || operation || context || !(event.target instanceof HTMLElement) || !event.currentTarget.contains(event.target) || event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (focusedViewer) { if (event.key === "Escape") { event.preventDefault(); closeFocusedViewer(); } return; }
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "a") { event.preventDefault(); setSelectionMode(true); setSelectedItems(new Set(orderedIds)); return; }
    if (modifier && event.key.toLowerCase() === "f") { event.preventDefault(); searchRef.current?.focus(); return; }
    if (modifier && event.shiftKey && event.key.toLowerCase() === "n") { event.preventDefault(); newFolder(); return; }
    if (event.key === "Escape") { event.preventDefault(); if (detailItemId) { setDetailItemId(null); return; } if (selectionMode || selectedItems.size || focusedId) { setSelectionMode(false); setSelectedItems(new Set()); setFocusedId(null); } else props.onExit(); return; }
    if (event.key === "F2") { event.preventDefault(); if (event.target.closest("[data-directory-node]") && !currentNode.smart && currentNode.kind !== "root") setOperation({ kind: "rename-folder", nodeId: currentNode.id }); else if (focusedItem) setOperation({ kind: "rename-item", itemId: focusedItem.id }); return; }
    if (event.key === "Delete" && activeIds.length) { event.preventDefault(); setOperation({ kind: "remove-items", itemIds: activeIds }); return; }
    if (focusedItem && event.key === " ") { event.preventDefault(); openFocusedViewer(focusedItem.id, false); return; }
    if (focusedItem && event.key === "Enter") { event.preventDefault(); openFocusedViewer(focusedItem.id, false); return; }
    if (focusedItem && modifier && event.key.toLowerCase() === "c") { event.preventDefault(); runAction(() => event.shiftKey ? props.onCopyText(focusedItem.prompt, t("提示词已复制")) : props.onCopyImage(focusedItem.imageFileName)); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && !event.target.closest("[data-directory-node]")) {
      event.preventDefault(); const current = orderedIds.indexOf(focusedId ?? ""); const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -columnCount : columnCount;
      const nextId = orderedIds[Math.max(0, Math.min(orderedIds.length - 1, current < 0 ? 0 : current + delta))];
      if (nextId) { setFocusedId(nextId); setSelectedItems(currentIds => selectLibraryDirectoryRange(orderedIds, [...currentIds], nextId, { range: event.shiftKey, anchorId: anchorRef.current ?? focusedId })); if (!event.shiftKey) anchorRef.current = nextId; setVisibleLimit(currentLimit => Math.max(currentLimit, orderedIds.indexOf(nextId) + PAGE_SIZE)); }
    }
  };
  useEffect(() => { setQuery(merged.searchQuery); }, [merged.searchQuery]);
  const clearFilters = () => { setQuery(""); void commit({ searchQuery: "", mediaFilter: "all", formatFilter: "", tagFilter: "", categoryFilter: "", minimumRating: 0, favoriteOnly: false, availabilityFilter: "all" }); };

  const renderCard = (entry: { raw: LibraryItem; card: PromptCardData }, indexInView: number) => <DirectoryAsset key={entry.raw.id} entry={entry} tileSize={settings.tileSize} mode={settings.galleryMode} selectionMode={selectionMode} selected={selectedItems.has(entry.raw.id)} favorite={likedSet.has(entry.raw.id)} priority={indexInView < 8} showInfo={settings.showInfo} blur={props.blurNsfwImages} visualLifeSettings={props.visualLifeSettings} onSelect={selectItem} onToggle={toggleItem} onOpenViewer={id => openFocusedViewer(id, false)} onContext={openContext} onDragStart={itemDragStart} onAspect={captureAspect} onFavorite={id => runAction(() => props.onToggleFavorite(id))} />;
  return <section aria-label={t("素材目录模式")} className="directory-mode-shell library-content-frame relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden outline-none" onKeyDown={handleKeys} tabIndex={-1}>
    <div aria-hidden="true" className="library-atmosphere" />
    <div className="relative z-10 flex min-h-0 flex-1">
      {props.isSidebarOpen && !isFocusedViewerImmersive ? <aside data-directory-sidebar className="app-chrome-surface relative z-20 flex min-h-0 shrink-0 flex-col border-r" style={{ width: sidebarWidth }}>
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-chrome-border px-3 py-2"><span className="flex items-center gap-2 text-xs font-medium"><FolderTree size={14} className="text-chrome-muted" />{t("文件夹")}</span><button aria-label={t("新建归纳目录")} title={t("新建归纳目录")} type="button" className="rounded-md p-1.5 text-chrome-muted hover:bg-chrome-control/55 hover:text-chrome-foreground" onClick={newFolder}><FolderPlus size={15} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="tree" data-feature-guide="directory-tree" aria-label={t("目录树")}>
          {smartNodes.map(node => <TreeRow key={node.id} node={node} depth={0} childrenMap={childrenByParent} counts={index.counts} colors={colorsById} selectedId={selectedId} expandedIds={expandedIds} dropTarget={dropTarget} onSelect={selectDirectory} onExpand={toggleExpanded} onContext={openContext} onDragStart={directoryDragStart} onDragOver={dragOver} onDrop={drop} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }} />)}
          <div className="my-2 border-t border-chrome-border" />
          {(childrenByParent.get(null) ?? []).map(node => <TreeRow key={node.id} node={node} depth={0} childrenMap={childrenByParent} counts={index.counts} colors={colorsById} selectedId={selectedId} expandedIds={expandedIds} dropTarget={dropTarget} onSelect={selectDirectory} onExpand={toggleExpanded} onContext={openContext} onDragStart={directoryDragStart} onDragOver={dragOver} onDrop={drop} onDragEnd={() => { setDraggedId(null); setDropTarget(null); }} />)}
          {merged.nodes.length === 0 ? <p className="px-3 py-5 text-xs leading-6 text-chrome-muted">{t("添加素材目录按原路径浏览，或新建归纳目录整理库内素材。")}</p> : null}
        </div>
        <div data-directory-exit-container className="mt-auto shrink-0 border-t border-chrome-border p-2"><button className="flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-chrome-border bg-chrome-control/55 px-3 text-xs text-chrome-muted outline-none hover:bg-chrome-control hover:text-chrome-foreground focus-visible:ring-2 focus-visible:ring-primary/35" type="button" data-feature-guide="directory-exit" onClick={props.onExit}><ArrowLeft size={14} />{t("退出目录模式")}</button></div>
        <LibraryDirectoryResizeHandle label={t("调整目录栏宽度")} width={sidebarWidth} min={MIN_DIRECTORY_SIDEBAR_WIDTH} max={MAX_DIRECTORY_SIDEBAR_WIDTH} onResize={resizeSidebar} />
      </aside> : null}
      <main data-feature-guide="directory-results" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {!focusedViewer ? <header data-feature-guide="directory-toolbar" className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-panel px-3 py-2">
          <nav aria-label={t("当前目录路径")} className="flex min-w-[120px] flex-1 items-center gap-1 overflow-hidden text-xs">
            <FolderTree className="mr-1 shrink-0 text-muted" size={16} />
            {breadcrumb.map((node, i) => <span className={"flex min-w-0 items-center gap-1 " + (i === breadcrumb.length - 1 ? "flex-auto" : "shrink")} key={node.id}>{i > 0 ? <ChevronRight className="shrink-0 text-muted" size={12} /> : null}<button aria-current={i === breadcrumb.length - 1 ? "page" : undefined} className={"min-w-0 truncate rounded-md px-1 py-1 text-left text-muted hover:bg-primary-soft hover:text-foreground " + (i === breadcrumb.length - 1 ? "max-w-full" : "max-w-28")} title={node.name} type="button" onClick={() => selectDirectory(node.id)}>{node.name}</button></span>)}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <IconTooltipButton label={t("复制文件路径")} icon={<Copy size={14} />} size="sm" variant="ghost" disabled={!selectedFilePath || isBusy} onClick={() => { if (selectedFilePath) runAction(async () => { await props.onCopyText(selectedFilePath, t("原文件路径已复制")); setFeedback(t("原文件路径已复制")); }); }} />
            <label className="flex h-8 w-[clamp(10rem,23vw,22rem)] items-center gap-2 rounded-lg border border-border/70 bg-background px-3 text-xs text-muted focus-within:border-primary/50">
              <Search size={14} /><input ref={searchRef} aria-label={t("搜索当前目录")} className="min-w-0 flex-1 bg-transparent text-foreground outline-none" placeholder={t("搜索素材")} value={query} onChange={event => { setQuery(event.target.value); void commit({ searchQuery: event.target.value }); }} />{query ? <button aria-label={t("清空搜索")} type="button" onClick={() => { setQuery(""); void commit({ searchQuery: "" }); }}><X size={12} /></button> : null}
            </label>
          </div>
          <LibraryDirectoryBrowseControls settings={merged} formats={formats} tags={tags} categories={categoryOptions} isBusy={isBusy} canScan={roots.some(root => root.id === currentNode.rootId)} onChange={patch => void commit(patch)} onReset={clearFilters} onAdd={props.onAddDirectory} onScan={() => props.onScanRoot(currentNode.rootId)} onManage={props.onOpenManager} onValidate={props.onValidate} />
        </header> : null}
        {focusedViewer && props.renderFocusedViewer ? props.renderFocusedViewer(focusedViewer, { onClose: closeFocusedViewer, onSelectItem: selectFocusedViewerItem, onImmersiveChange: setIsFocusedViewerImmersive }) : <>

        {selectionMode ? <div data-directory-material-tools className="flex min-h-10 shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-panel/40 px-3 py-1.5">
          {filteredItems.length > 0 ? <button aria-pressed={selectedItems.size === orderedIds.length} className="flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted hover:text-foreground" type="button" onClick={() => setSelectedItems(selectedItems.size === orderedIds.length ? new Set() : new Set(orderedIds))}>{selectedItems.size === orderedIds.length ? <Check size={13} /> : <Square size={13} />}{t("全选")}</button> : null}
          <Tool icon={<RefreshCw size={13} />} label={t("反选")} disabled={!filteredItems.length} onClick={() => setSelectedItems(new Set(orderedIds.filter(id => !selectedItems.has(id))))} />
          <Tool icon={<X size={13} />} label={t("清空选择")} disabled={!selectedItems.size} onClick={() => { setSelectedItems(new Set()); setFocusedId(null); anchorRef.current = null; }} />
          <Tool icon={<X size={13} />} label={t("退出选择模式")} onClick={() => { setSelectionMode(false); setSelectedItems(new Set()); setFocusedId(null); anchorRef.current = null; }} />
          {activeIds.length > 0 ? <><span className="rounded-full bg-primary-soft px-2 py-1 text-[11px] text-primary">{t("已选 {count}", { count: activeIds.length })}</span><Tool icon={<FolderOpen size={13} />} label={t("移动到目录")} onClick={() => setOperation({ kind: "move", itemIds: activeIds })} /><Tool icon={<Tag size={13} />} label={t("添加标签")} disabled={isBusy} onClick={() => setOperation({ kind: "tags", itemIds: activeIds })} /><Tool icon={<Download size={13} />} label={t("导出分享包")} disabled={isBusy} onClick={() => runAction(() => props.onExportItems(activeIds))} /><Tool icon={<Trash2 size={13} />} label={t("移除索引")} disabled={isBusy} onClick={() => setOperation({ kind: "remove-items", itemIds: activeIds })} /></> : null}
        </div> : null}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto p-3 pb-12" tabIndex={0} aria-label={t("素材展示区")} onClick={event => { if (event.target === event.currentTarget) { setSelectedItems(new Set()); setFocusedId(null); setDetailItemId(null); } }}>
            {currentChildren.length > 0 && !hasActiveFilter ? <div className="mb-4 grid gap-3" style={{gridTemplateColumns:"repeat(" + Math.max(1,Math.min(5,columnCount)) + ",minmax(0,1fr))"}} aria-label={t("子目录")}>
              {currentChildren.map(node => { const cover = coverByNodeId.get(node.id); return <button data-directory-folder={node.id} key={node.id} className="group grid min-w-0 overflow-hidden rounded-xl border border-border bg-panel text-left hover:border-primary/50 hover:bg-primary-soft" type="button" draggable onDragStart={event=>directoryDragStart(event,node.id)} onDragOver={event=>dragOver(event,node)} onDrop={event=>drop(event,node)} onClick={()=>selectDirectory(node.id)} onContextMenu={event=>openContext(event,"folder",node.id)}><div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-background">{cover ? <NsfwImage alt={node.name} blurNsfwImages={props.blurNsfwImages} className="h-full w-full" image={cover} imageClassName="h-full w-full object-cover" placeholderClassName="min-h-0 h-full" showRevealControl={false} source="thumbnail"/> : <Folder style={{color:colorsById.get(node.id)}} size={40}/>}<span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-panel/90 px-2 py-1 text-[10px] font-medium text-primary"><Folder style={{color:colorsById.get(node.id)}} size={12}/>{t("目录")}</span></div><div className="grid gap-1 px-3 py-2.5"><strong className="line-clamp-2 text-xs font-medium">{node.name}</strong><span className="text-[10px] text-muted">{t("{count} 个素材",{count:index.counts.get(node.id)??0})}</span></div></button>; })}
            </div> : null}
            <div ref={galleryRef} className="min-w-0">
              {visibleItems.length === 0 && currentChildren.length > 0 && !hasActiveFilter ? null : visibleItems.length === 0 ? <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-muted"><FileImage size={32} /><h2 className="mt-4 text-sm font-medium">{t("没有匹配的素材")}</h2><p className="mt-2 text-xs">{t("调整筛选，或把素材拖入左侧目录完成归纳。")}</p><Button className="mt-4 text-xs" variant="secondary" onClick={clearFilters}>{t("重置筛选")}</Button></div>
              : settings.galleryMode === "masonry" ? <div className="flex items-start gap-3">{columns.map((column, col) => <div key={col} className="grid min-w-0 flex-1 content-start gap-3">{column.map((entry, i) => renderCard(entry, col + i * columnCount))}</div>)}</div>
              : settings.galleryMode === "grid" ? <div className="grid items-start gap-3" style={{ gridTemplateColumns: "repeat(" + columnCount + ", minmax(0,1fr))" }}>{visibleItems.map(renderCard)}</div>
              : <div className="overflow-hidden rounded-xl border border-border bg-panel"><div className="grid grid-cols-[38px_minmax(0,1fr)_70px_85px_100px] gap-2 border-b border-border bg-background px-3 py-2 text-xs text-muted"><span /><span>{t("名称")}</span><span>{t("格式")}</span><span>{t("大小")}</span><span>{t("更新时间")}</span></div>{visibleItems.map(renderCard)}</div>}
            </div>
            {filteredItems.length > visibleLimit ? <div className="py-5 text-center"><Button variant="secondary" onClick={() => setVisibleLimit(limit => limit + PAGE_SIZE)}>{t("加载更多素材")}</Button><p className="mt-2 text-xs text-muted">{t("已显示 {current} / {total}", { current: visibleItems.length, total: filteredItems.length })}</p></div> : null}
          </div>
          {settings.showDetails && detailItem ? <aside aria-label={t("素材详情")} className="w-[260px] shrink-0 overflow-y-auto border-l border-border bg-panel"><LibraryAssetInfo key={detailItem.id} item={detailItem} showCopyPath={false} materialCount={displayedCount} workspaceTools={<LibraryDirectorySizeControl tileSize={merged.tileSize} onChange={tileSize => void commit({ tileSize })} />} directoryName={nodesById.get(index.itemDirectoryById.get(detailItem.id)??"")?.name} directoryColor={colorsById.get(index.itemDirectoryById.get(detailItem.id)??"")} root={roots.find(root=>detailItem.mediaStorage&&detailItem.mediaStorage!=="managed"&&root.id===detailItem.mediaStorage.rootId)} blur={props.blurNsfwImages} favorite={likedSet.has(detailItem.id)} onClose={()=>setDetailItemId(null)} onExpandPrompt={()=>openFocusedViewer(detailItem.id,true)} onSave={props.onSaveItem} onPreview={card=>openFocusedViewer(card.id,false)} onCopyImage={file=>runAction(()=>props.onCopyImage(file))} onCopyText={(text,label)=>runAction(()=>props.onCopyText(text,label))} onFavorite={id=>runAction(()=>props.onToggleFavorite(id))} onLocate={locateOriginal} onExport={file=>runAction(()=>props.onExportImage(file))} onFilterTag={tag=>void commit({tagFilter:tag})}/></aside> : null}
        </div>
        {settings.showDetails && detailItem
          ? feedback ? <footer data-directory-statusbar role="status" className="pointer-events-none absolute bottom-3 right-3 z-20 max-w-[calc(100%-1.5rem)] truncate rounded-xl border border-border/70 bg-panel/95 px-3 py-1.5 text-[11px] text-muted shadow-image backdrop-blur">{feedback}</footer> : null
          : <footer data-directory-statusbar className="pointer-events-none absolute bottom-3 right-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-xl border border-border/70 bg-panel/95 px-2 py-1 text-[11px] text-muted shadow-image backdrop-blur">
            <span className="pointer-events-auto max-w-40 truncate" role="status">{feedback}</span>
            <div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
              <LibraryDirectorySizeControl tileSize={merged.tileSize} onChange={tileSize => void commit({ tileSize })} />
              <span data-directory-material-count className="shrink-0 border-l border-border pl-2 tabular-nums">{t("{count} 个素材", { count: displayedCount })}</span>
            </div>
          </footer>}
        </>}
      </main>
    </div>
    {operation ? <DirectoryOperationDialog key={JSON.stringify(operation)} operation={operation} nodes={merged.nodes} items={items} onCancel={() => setOperation(null)} onSubmit={submitOperation} /> : null}
    {context ? <DirectoryContextMenu target={context} onClose={() => setContext(null)}>{context.kind === "folder" ? <>
      <MenuButton onClick={() => { setOperation({ kind: "create-folder", parentId: nodesById.get(context.id)?.smart ? null : context.id }); setContext(null); }}><FolderPlus size={14} />{t("新建归纳目录")}</MenuButton>
      {!nodesById.get(context.id)?.smart && nodesById.get(context.id)?.kind !== "root" ? <MenuButton onClick={() => { setOperation({ kind: "rename-folder", nodeId: context.id }); setContext(null); }}><Pencil size={14} />{t("重命名目录")}</MenuButton> : null}
      {nodesById.get(context.id)?.kind === "virtual" && !nodesById.get(context.id)?.smart ? <MenuButton onClick={() => { setOperation({ kind: "remove-folder", nodeId: context.id }); setContext(null); }}><Trash2 size={14} />{t("移除归纳目录")}</MenuButton> : null}
      {!nodesById.get(context.id)?.smart ? <div className="my-1 border-y border-border px-2 py-2"><p className="mb-2 text-[10px] text-muted">{t("目录颜色")}</p><div className="flex items-center gap-1.5">{LIBRARY_DIRECTORY_COLOR_PRESETS.map(preset => <button aria-label={t("目录颜色") + " " + t(preset.name)} aria-pressed={nodesById.get(context.id)?.color === preset.color} className="flex size-5 items-center justify-center rounded-full border-2 border-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary/40" key={preset.color} style={{ backgroundColor: preset.color }} title={t(preset.name)} type="button" onClick={() => { void commit(setLibraryDirectoryColor(settingsRef.current, context.id, preset.color), t("目录颜色已保存")); setContext(null); }}>{nodesById.get(context.id)?.color === preset.color ? <Check size={11} className="text-white" /> : null}</button>)}</div><button className="mt-2 text-[10px] text-muted hover:text-primary" type="button" onClick={() => { void commit(setLibraryDirectoryColor(settingsRef.current, context.id, null), t("目录颜色已恢复继承")); setContext(null); }}>{t("自动 / 继承上级")}</button></div> : null}
      <MenuButton onClick={() => { props.onOpenManager(); setContext(null); }}><SlidersHorizontal size={14} />{t("目录管理")}</MenuButton>
    </> : (() => { const item = items.find(candidate => candidate.id === context.id); if (!item) return null; return <>
      <MenuButton onClick={() => { openFocusedViewer(item.id, false); setContext(null); }}><Info size={14} />{t("查看详情")}</MenuButton><MenuButton onClick={() => { openFocusedViewer(item.id, true); setContext(null); }}><FileText size={14} />{t("查看提示词")}</MenuButton>
      <MenuButton onClick={() => runAction(() => props.onToggleFavorite(item.id))}><Heart size={14} />{likedSet.has(item.id) ? t("取消收藏") : t("收藏素材")}</MenuButton>
      <MenuButton disabled={isVideoMediaFile(item.imageFileName)} onClick={() => runAction(() => props.onCopyImage(item.imageFileName))}><Copy size={14} />{t("复制图片")}</MenuButton>
      <MenuButton disabled={!item.prompt.trim()} onClick={() => runAction(() => props.onCopyText(item.prompt, t("提示词已复制")))}><Copy size={14} />{t("复制提示词")}</MenuButton>
      <MenuButton onClick={() => { setOperation({ kind: "rename-item", itemId: item.id }); setContext(null); }}><Pencil size={14} />{t("重命名标题")}</MenuButton><MenuButton onClick={() => { locateOriginal(item); setContext(null); }}><FolderOpen size={14} />{t("定位原始目录")}</MenuButton>
      <div className="my-1 border-t border-border" /><MenuButton onClick={() => { setOperation({ kind: "move", itemIds: selectedItems.has(item.id) ? [...selectedItems] : [item.id] }); setContext(null); }}><Folder size={14} />{t("移动到目录")}</MenuButton><MenuButton onClick={() => { setOperation({ kind: "tags", itemIds: selectedItems.has(item.id) ? [...selectedItems] : [item.id] }); setContext(null); }}><Tag size={14} />{t("添加标签")}</MenuButton><MenuButton onClick={() => runAction(() => props.onExportItems(selectedItems.has(item.id) ? [...selectedItems] : [item.id]))}><Download size={14} />{t("导出分享包")}</MenuButton><MenuButton onClick={() => { setOperation({ kind: "remove-items", itemIds: selectedItems.has(item.id) ? [...selectedItems] : [item.id] }); setContext(null); }}><Trash2 size={14} />{t("移除索引")}</MenuButton>
    </>; })()}</DirectoryContextMenu> : null}
  </section>;
}

const TreeRow = memo(function TreeRow(p: { node: TreeNode; depth: number; childrenMap: ReadonlyMap<string | null, TreeNode[]>; counts: ReadonlyMap<string, number>; colors: ReadonlyMap<string, string>; selectedId: string; expandedIds: ReadonlySet<string>; dropTarget: DropTarget; onSelect: (id: string) => void; onExpand: (id: string) => void; onContext: (event: MouseEvent<HTMLElement>, kind: "item" | "folder", id: string) => void; onDragStart: (event: DragEvent<HTMLElement>, id: string) => void; onDragOver: (event: DragEvent<HTMLElement>, node: TreeNode) => void; onDrop: (event: DragEvent<HTMLElement>, node: TreeNode) => void; onDragEnd: () => void }) {
  const { t } = useLocale(); const { node } = p; const children = p.childrenMap.get(node.id) ?? []; const expanded = p.expandedIds.has(node.id); const target = p.dropTarget?.id === node.id ? p.dropTarget.position : null;
  return <div role="group"><div data-directory-node={node.id} data-directory-color={p.colors.get(node.id)} role="treeitem" aria-selected={p.selectedId === node.id} aria-expanded={children.length ? expanded : undefined} className={"group relative flex min-h-9 items-center gap-1 rounded-xl border pr-2 text-xs transition-colors " + (p.selectedId === node.id ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-transparent text-chrome-muted hover:border-chrome-border hover:bg-chrome-control/55 hover:text-chrome-foreground") + (target ? " ring-1 ring-primary" : "")} style={{ paddingLeft: 6 + p.depth * 14 }} draggable={!node.smart} onDragStart={event => !node.smart && p.onDragStart(event, node.id)} onDragOver={event => p.onDragOver(event, node)} onDrop={event => p.onDrop(event, node)} onDragEnd={p.onDragEnd} onContextMenu={event => p.onContext(event, "folder", node.id)}>
    {target === "before" || target === "after" ? <span className={"pointer-events-none absolute inset-x-1 h-0.5 bg-primary " + (target === "before" ? "top-0" : "bottom-0")} /> : null}
    <button aria-label={expanded ? t("折叠目录") : t("展开目录")} className={"flex size-5 shrink-0 items-center justify-center rounded-md outline-none hover:bg-chrome-control/55 focus-visible:ring-2 focus-visible:ring-primary/35 " + (!children.length ? "invisible" : "")} type="button" tabIndex={children.length ? 0 : -1} onClick={() => p.onExpand(node.id)}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
    <button className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" type="button" onClick={() => p.onSelect(node.id)}>{node.smart === "all" ? <Grid2X2 className="shrink-0" size={15} /> : node.smart ? <Inbox className="shrink-0" size={15} /> : expanded ? <FolderOpen className="shrink-0" size={15} style={{ color: p.colors.get(node.id) }} /> : <Folder className="shrink-0" size={15} style={{ color: p.colors.get(node.id) }} />}<span className="min-w-0 flex-1 truncate">{node.name}</span><span className="text-[10px] tabular-nums opacity-70">{p.counts.get(node.id) ?? 0}</span></button>
    {!node.smart ? <GripVertical className="shrink-0 opacity-0 group-hover:opacity-50" size={13} /> : null}{target === "inside" ? <span className="pointer-events-none absolute right-2 rounded bg-primary-soft px-1 text-[10px] text-primary">{t("放入")}</span> : null}
  </div>{expanded ? children.map(child => <TreeRow {...p} key={child.id} node={child} depth={p.depth + 1} />) : null}</div>;
});

export function LibraryDirectoryResizeHandle(p: { label: string; width: number; min: number; max: number; side?: "left" | "right"; onResize: (delta: number, commit?: boolean) => void }) {
  const dragRef = useRef<{ pointerId: number; lastX: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    p.onResize(0, true);
  };
  return <div aria-label={p.label} aria-orientation="vertical" aria-valuemax={p.max} aria-valuemin={p.min} aria-valuenow={p.width} className={"absolute inset-y-0 z-20 flex w-2 cursor-col-resize touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 " + (p.side === "left" ? "left-0" : "right-0") + " " + (dragging ? "bg-primary/10" : "hover:bg-primary/10")} role="separator" tabIndex={0}
    onKeyDown={event => {
      const delta = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : event.key === "Home" ? p.min - p.width : event.key === "End" ? p.max - p.width : 0;
      if (!delta) return;
      event.preventDefault();
      p.onResize(delta);
      p.onResize(0, true);
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { pointerId: event.pointerId, lastX: event.clientX };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }}
    onPointerMove={event => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const delta = event.clientX - drag.lastX;
      if (!delta) return;
      drag.lastX = event.clientX;
      p.onResize(delta);
    }}
    onPointerUp={finish}
    onPointerCancel={finish}
  />;
}

type AssetProps = { tileSize: number; entry: { raw: LibraryItem; card: PromptCardData }; mode: LibraryDirectorySettings["galleryMode"]; selectionMode: boolean; selected: boolean; favorite: boolean; priority: boolean; showInfo: boolean; blur: boolean; visualLifeSettings: VisualLifeSettings; onSelect: (event: MouseEvent<HTMLElement>, id: string) => void; onToggle: (id: string) => void; onOpenViewer: (id: string) => void; onContext: (event: MouseEvent<HTMLElement>, kind: "item" | "folder", id: string) => void; onDragStart: (event: DragEvent<HTMLElement>, id: string) => void; onAspect: (id: string, target: EventTarget | null) => void; onFavorite: (id: string) => void };
const DirectoryAsset = memo(function DirectoryAsset(p: AssetProps) {
  const { t } = useLocale(); const { raw, card } = p.entry; const video = isVideoMediaFile(raw.imageFileName); const fileName = getDirectoryItemFileName(raw);
  const select = (event: MouseEvent<HTMLElement>) => { if (event.target instanceof Element && !event.target.closest("[data-directory-action]")) p.onSelect(event, raw.id); };
  const checkbox = <button data-directory-action aria-label={p.selected ? t("取消选择素材") : t("选择素材")} type="button" className={"inline-flex size-7 shrink-0 items-center justify-center rounded-lg border " + (p.selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-panel/90 text-muted")} onClick={event => { event.stopPropagation(); p.onToggle(raw.id); }}>{p.selected ? <Check size={14} /> : <Square size={14} />}</button>;
  if (p.mode === "list") return <article data-directory-item={raw.id} className={"grid cursor-pointer grid-cols-[38px_minmax(0,1fr)_70px_85px_100px] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-0 " + (p.selected ? "bg-primary-soft" : "hover:bg-background")} draggable onDragStart={event => p.onDragStart(event, raw.id)} onClick={select} onDoubleClick={event => { if (!(event.target instanceof Element) || !event.target.closest("[data-directory-action]")) p.onOpenViewer(raw.id); }} onContextMenu={event => p.onContext(event, "item", raw.id)}>
    {p.selectionMode ? checkbox : <span aria-hidden="true" />}<span className="flex min-w-0 items-center gap-2"><NsfwImage alt={raw.title} blurNsfwImages={p.blur} image={card} className="shrink-0 overflow-hidden rounded-lg" style={{ width: Math.round(p.tileSize / 5.5), height: Math.round(p.tileSize / 5.5) }} imageClassName="h-full w-full object-cover" placeholderClassName="min-h-0" source="thumbnail" showRevealControl={false} /><span className="min-w-0"><strong className="block truncate font-medium">{raw.title || fileName}</strong><span className="mt-1 block truncate text-[10px] text-muted">{fileName}</span></span>{p.favorite ? <Heart className="shrink-0 text-primary" size={12} fill="currentColor" /> : null}</span><span className="text-muted">{getMediaFileExtension(fileName).slice(1).toUpperCase()}</span><span className="text-muted">{formatBytes(raw.mediaStorage && raw.mediaStorage !== "managed" ? raw.mediaStorage.size : raw.importSource?.size)}</span><span className="truncate text-[10px] text-muted">{new Date(raw.updatedAt).toLocaleDateString()}</span>
  </article>;
  return <article data-directory-item={raw.id} className={"group relative min-w-0 overflow-hidden rounded-xl border bg-panel shadow-sm " + (p.selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40")} draggable onDragStart={event => p.onDragStart(event, raw.id)} onClick={select} onDoubleClick={event => { if (!(event.target instanceof Element) || !event.target.closest("[data-directory-action]")) p.onOpenViewer(raw.id); }} onContextMenu={event => p.onContext(event, "item", raw.id)} onLoadCapture={event => p.onAspect(raw.id, event.target)}>
    <div aria-hidden={!p.selectionMode} data-directory-selection className="absolute right-11 top-2 z-10 transition-opacity" style={{ opacity: p.selectionMode ? 1 : 0, pointerEvents: p.selectionMode ? "auto" : "none" }}>{p.selectionMode ? checkbox : null}</div><span data-directory-format className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-foreground/65 px-1.5 py-1 text-[10px] text-panel">{getMediaFileExtension(fileName).slice(1).toUpperCase()}</span><button data-directory-action aria-label={p.favorite ? t("取消收藏") : t("收藏素材")} className={"absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-lg border border-border bg-panel/90 " + (p.favorite ? "text-primary" : "text-muted opacity-0 group-hover:opacity-100")} type="button" onClick={event => { event.stopPropagation(); p.onFavorite(raw.id); }}><Heart size={14} fill={p.favorite ? "currentColor" : "none"} /></button>
    <NsfwImage alt={raw.title || fileName} blurNsfwImages={p.blur} image={card} className="w-full" imageClassName={"block w-full object-contain " + (p.mode === "grid" ? "aspect-[4/3]" : "")} loading={p.priority ? "eager" : "lazy"} fetchPriority={p.priority ? "high" : "auto"} placeholderClassName="min-h-40" showRevealControl={false} source="thumbnail" />
    {video ? <span className="pointer-events-none absolute bottom-12 left-2 flex items-center gap-1 rounded bg-foreground/65 px-1.5 py-1 text-[10px] text-panel"><Film size={12}/>{raw.videoDurationSec != null ? Math.floor(raw.videoDurationSec/60) + ":" + String(Math.floor(raw.videoDurationSec%60)).padStart(2,"0") : t("视频")}</span> : null}
    {p.showInfo ? <div className="grid gap-1 border-t border-border px-2.5 py-2"><div className="flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate text-xs font-medium">{raw.title || fileName}</h3><button data-directory-action aria-label={t("素材操作")} className="rounded p-1 text-muted hover:bg-primary-soft" type="button" onClick={event => p.onContext(event, "item", raw.id)}><MoreHorizontal size={14} /></button></div><div className="flex justify-between gap-2 text-[10px] text-muted"><span className="truncate">{fileName}</span><span className="shrink-0">{getMediaFileExtension(fileName).slice(1).toUpperCase()}</span></div></div> : null}
  </article>;
});

function Tool(p: { label: string; icon: ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) { return <button aria-label={p.label} aria-pressed={p.active === undefined ? undefined : p.active} className={"inline-flex min-h-8 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 " + (p.active ? "border-primary/40 bg-primary-soft text-primary" : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground")} type="button" disabled={p.disabled} onClick={p.onClick}>{p.icon}{p.label}</button>; }
function Select(p: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { return <select aria-label={p.label} title={p.label} className="h-8 max-w-44 rounded-xl border border-border bg-background px-2 text-xs outline-none focus:border-primary" value={p.value} onChange={event => p.onChange(event.target.value)}>{p.options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>; }
function Segments(p: { label: string; value: string; options: Array<[string, string, ReactNode?]>; onChange: (value: string) => void }) { return <div aria-label={p.label} role="group" className="inline-flex h-8 items-center rounded-xl border border-border bg-background p-0.5">{p.options.map(([value, label, icon]) => <button aria-pressed={p.value === value} className={"inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] " + (p.value === value ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground")} key={value} type="button" onClick={() => p.onChange(value)}>{icon}{label}</button>)}</div>; }
function MenuButton(p: { children: ReactNode; disabled?: boolean; onClick: () => void }) { return <button role="menuitem" className="flex min-h-8 w-full items-center gap-2 rounded-lg px-3 text-left text-xs hover:bg-primary-soft disabled:opacity-40" type="button" disabled={p.disabled} onClick={p.onClick}>{p.children}</button>; }
function DirectoryContextMenu(p: { target: NonNullable<ContextTarget>; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const [position, setPosition] = useState({ left: p.target.x, top: p.target.y });
  useEffect(() => {
    const menu = ref.current; if (!menu) return; const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-titlebar-height")) || 44;
    setPosition({ left: Math.max(8, Math.min(p.target.x, window.innerWidth - menu.offsetWidth - 8)), top: Math.max(safeTop + 8, Math.min(p.target.y, window.innerHeight - menu.offsetHeight - 8)) });
    const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) p.onClose(); }; const key = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); p.onClose(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key); return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [p.target, p.onClose]);
  return createPortal(<div ref={ref} role="menu" className="fixed z-[220] max-h-[calc(100vh-64px)] w-48 overflow-y-auto rounded-xl border border-border bg-panel p-1 shadow-image" style={position}>{p.children}</div>, document.body);
}
function DirectoryOperationDialog(p: { operation: Operation; nodes: readonly LibraryDirectoryNode[]; items: readonly LibraryItem[]; onCancel: () => void; onSubmit: (value: string) => Promise<boolean> }) {
  const { t } = useLocale(); const op = p.operation; const node = "nodeId" in op ? p.nodes.find(n => n.id === op.nodeId) : null; const item = "itemId" in op ? p.items.find(i => i.id === op.itemId) : null;
  const [value, setValue] = useState(node?.name ?? item?.title ?? (op.kind === "move" ? UNFILED_LIBRARY_DIRECTORY_ID : "")); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const title = op.kind === "create-folder" ? t("新建归纳目录") : op.kind === "rename-folder" ? t("重命名目录") : op.kind === "rename-item" ? t("重命名标题") : op.kind === "move" ? t("移动到目录") : op.kind === "tags" ? t("添加标签") : op.kind === "remove-folder" ? t("移除归纳目录") : t("移除素材索引");
  const destructive = op.kind === "remove-folder" || op.kind === "remove-items";
  const submit = async () => { if (busy) return; setBusy(true); setError(null); try { if (await p.onSubmit(value)) p.onCancel(); else setError(t("操作未完成，请查看错误提示")); } catch (e) { setError(e instanceof Error ? e.message : t("操作未完成")); } finally { setBusy(false); } };
  const pathFor = (n: LibraryDirectoryNode): string => { const chain = [n.name], visited = new Set([n.id]); let parent = n.parentId ? p.nodes.find(candidate => candidate.id === n.parentId) : null; while (parent && !visited.has(parent.id)) { visited.add(parent.id); chain.unshift(parent.name); parent = parent.parentId ? p.nodes.find(candidate => candidate.id === parent!.parentId) : null; } return chain.join(" / "); };
  return <AppDialog titleId="directory-operation-title" overlayClassName="z-[230]" panelClassName="w-full max-w-md" onClose={() => { if (!busy) p.onCancel(); }}><form onSubmit={event => { event.preventDefault(); void submit(); }}><header className="flex items-center justify-between border-b border-border px-4 py-3"><h2 id="directory-operation-title" className="text-sm font-semibold">{title}</h2><DialogCloseButton onClick={() => { if (!busy) p.onCancel(); }} /></header><div className="grid gap-3 p-4">
    {destructive ? <p className="text-sm leading-6 text-muted">{op.kind === "remove-folder" ? t("只移除软件内的归纳目录，素材回到原有目录或未归类，磁盘原文件保持不变。") : t("只移除软件内的素材索引，磁盘原文件保持不变。")}</p> : op.kind === "move" ? <select autoFocus aria-label={t("目标目录")} className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" value={value} onChange={event => setValue(event.target.value)}><option value={UNFILED_LIBRARY_DIRECTORY_ID}>{t("未归类")}</option>{p.nodes.map(n => <option value={n.id} key={n.id}>{pathFor(n)}</option>)}</select> : <label className="grid gap-2 text-xs text-muted">{op.kind === "tags" ? t("多个标签用逗号或换行分隔") : t("名称")}<input aria-label={op.kind === "tags" ? t("标签内容") : t("名称")} autoFocus className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" value={value} onChange={event => setValue(event.target.value)} /></label>}
    {"itemIds" in op ? <p className="text-xs text-muted">{t("已选 {count}", { count: op.itemIds.length })}</p> : null}{error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
  </div><footer className="flex justify-end gap-2 border-t border-border px-4 py-3"><Button type="button" variant="secondary" disabled={busy} onClick={p.onCancel}>{t("取消")}</Button><Button type="submit" variant={destructive ? "danger" : "primary"} disabled={busy || !destructive && !value.trim()}>{busy ? t("保存中…") : destructive ? t("确认移除") : t("保存")}</Button></footer></form></AppDialog>;
}
function dropPosition(event: DragEvent<HTMLElement>): LibraryDirectoryDropPosition { const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientY - rect.top) / Math.max(1, rect.height); return ratio < 0.27 ? "before" : ratio > 0.73 ? "after" : "inside"; }
function parseItemIds(payload: string): string[] { try { const value: unknown = JSON.parse(payload); return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && Boolean(id)) : []; } catch { return []; } }
function formatBytes(value?: number | null): string { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—"; if (value < 1024) return value + " B"; if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB"; if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + " MB"; return (value / 1024 / 1024 / 1024).toFixed(1) + " GB"; }
