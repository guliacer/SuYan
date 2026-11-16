import { normalizeLibraryDirectoryColor } from "./libraryDirectoryAppearance";
import { normalizeLibraryImportSource } from "./libraryImportSource";
import type { LibraryItem, LibraryRoot } from "../types/library";
import { getMediaFileExtension, isVideoMediaFile } from "./mediaFileTypes";

export const ALL_LIBRARY_DIRECTORY_ID = "library-directory:all";
export const UNFILED_LIBRARY_DIRECTORY_ID = "library-directory:unfiled";
export const LOGICAL_LIBRARY_ROOT_ID = "__library__";

export type LibraryDirectoryNodeKind = "root" | "folder" | "virtual";
export type LibraryDirectoryDropPosition = "before" | "inside" | "after";
export type LibraryDirectoryGalleryMode = "masonry" | "grid" | "list";
export type LibraryDirectoryMediaFilter = "all" | "image" | "video";
export type LibraryDirectorySortMode = "name" | "importedAt" | "updatedAt" | "modifiedAt" | "imageSize" | "format" | "rating" | "random";
export type LibraryDirectoryBrowseBy = "directories" | "tags" | "categories" | "formats";
export type LibraryDirectorySortDirection = "asc" | "desc";

export type LibraryDirectoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  rootId: string;
  relativePath: string;
  kind: LibraryDirectoryNodeKind;
  order: number;
  /** Missing means inherit parent color, or use the automatic root palette. */
  color?: string;
};

export type LibraryDirectorySettings = {
  nodes: LibraryDirectoryNode[];
  /** Explicit material-to-directory relations. Missing entries use the physical relative path. */
  itemFolderIds: Record<string, string>;
  sidebarWidth: number;
  directoryTreeOpen: boolean;
  selectedNodeId: string | null;
  includeDescendants: boolean;
  galleryMode: LibraryDirectoryGalleryMode;
  mediaFilter: LibraryDirectoryMediaFilter;
  sortMode: LibraryDirectorySortMode;
  sortDirection: LibraryDirectorySortDirection;
  tileSize: number;
  showDetails: boolean;
  showInfo: boolean;
  favoriteOnly: boolean;
  formatFilter: string;
  tagFilter: string;
  availabilityFilter: "all" | "available" | "missing";
  searchQuery: string;
  expandedNodeIds: string[] | null;
  legacyGroupingDone?: boolean;
  browseBy?: LibraryDirectoryBrowseBy;
  categoryFilter?: string;
  minimumRating?: number;
  randomSeed?: number;
};

type UnknownRecord = Record<string, unknown>;

type MergeDirectoryInput = {
  roots: readonly LibraryRoot[];
  items: readonly LibraryItem[];
  settings?: LibraryDirectorySettings | null;
};

export function createDefaultLibraryDirectorySettings(): LibraryDirectorySettings {
  return {
    nodes: [],
    itemFolderIds: {},
    sidebarWidth: 228,
    directoryTreeOpen: true,
    selectedNodeId: ALL_LIBRARY_DIRECTORY_ID,
    includeDescendants: false,
    galleryMode: "masonry",
    mediaFilter: "all",
    sortMode: "updatedAt",
    sortDirection: "desc",
    tileSize: 220,
    showDetails: true,
    showInfo: true,
    favoriteOnly: false,
    formatFilter: "",
    tagFilter: "",
    availabilityFilter: "all",
    searchQuery: "",
    expandedNodeIds: null,
    legacyGroupingDone: false,
    browseBy: "directories",
    categoryFilter: "",
    minimumRating: 0,
    randomSeed: 1,
  };
}

export function normalizeLibraryDirectorySettings(input: unknown): LibraryDirectorySettings {
  if (!isRecord(input)) {
    return createDefaultLibraryDirectorySettings();
  }

  const nodes: LibraryDirectoryNode[] = [];
  const seenNodeIds = new Set<string>();
  if (Array.isArray(input.nodes)) {
    for (const candidate of input.nodes) {
      if (!isRecord(candidate)) {
        continue;
      }

      const id = normalizeString(candidate.id);
      const name = normalizeString(candidate.name);
      const rootId = normalizeString(candidate.rootId);
      const relativePath = normalizeRelativePath(candidate.relativePath);
      const kind = candidate.kind === "root" ? "root" : candidate.kind === "folder" ? "folder" : candidate.kind === "virtual" ? "virtual" : null;
      if (!id || !name || !rootId || !kind || seenNodeIds.has(id)) {
        continue;
      }

      seenNodeIds.add(id);
      nodes.push({
        id,
        name,
        parentId: normalizeNullableString(candidate.parentId),
        rootId,
        relativePath,
        kind,
        order: normalizeOrder(candidate.order),
        ...(normalizeLibraryDirectoryColor(candidate.color) ? { color: normalizeLibraryDirectoryColor(candidate.color)! } : {}),
      });
    }
  }

  const itemFolderIds: Record<string, string> = {};
  if (isRecord(input.itemFolderIds)) {
    for (const [itemId, folderId] of Object.entries(input.itemFolderIds)) {
      if (typeof folderId === "string" && folderId.trim()) {
        itemFolderIds[itemId] = folderId.trim();
      }
    }
  }

  return {
    nodes,
    itemFolderIds,
    sidebarWidth: clampNumber(input.sidebarWidth, 180, 420, 228),
    directoryTreeOpen: input.directoryTreeOpen !== false,
    legacyGroupingDone: input.legacyGroupingDone === true,
    browseBy: input.browseBy === "tags" || input.browseBy === "categories" || input.browseBy === "formats" ? input.browseBy : "directories",
    categoryFilter: normalizeString(input.categoryFilter),
    minimumRating: clampNumber(input.minimumRating, 0, 5, 0),
    randomSeed: clampNumber(input.randomSeed, 1, 0x7fffffff, 1),
    selectedNodeId: normalizeNullableString(input.selectedNodeId),
    includeDescendants: input.includeDescendants === true,
    galleryMode: isGalleryMode(input.galleryMode) ? input.galleryMode : "masonry",
    mediaFilter: isMediaFilter(input.mediaFilter) ? input.mediaFilter : "all",
    sortMode: isSortMode(input.sortMode) ? input.sortMode : "updatedAt",
    sortDirection: input.sortDirection === "asc" ? "asc" : "desc",
    tileSize: clampNumber(input.tileSize, 160, 360, 220),
    showDetails: input.showDetails !== false,
    showInfo: input.showInfo !== false,
    favoriteOnly: input.favoriteOnly === true,
    formatFilter: normalizeString(input.formatFilter).replace(/^\./, "").toLowerCase(),
    tagFilter: normalizeString(input.tagFilter),
    availabilityFilter: input.availabilityFilter === "missing" ? "missing" : input.availabilityFilter === "available" ? "available" : "all",
    searchQuery: typeof input.searchQuery === "string" ? input.searchQuery : "",
    expandedNodeIds: Array.isArray(input.expandedNodeIds) ? Array.from(new Set(input.expandedNodeIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())))) : null,
  };
}

/**
 * Merge persisted presentation nodes with the currently mounted roots and scanned
 * external paths. Existing parent/order choices win; newly discovered folders are
 * placed beside their physical parent until the user rearranges them.
 */
export function mergeLibraryDirectoryNodes({ roots, items, settings }: MergeDirectoryInput): LibraryDirectorySettings {
  const base = normalizeLibraryDirectorySettings(settings ?? undefined);
  const validRootIds = new Set([...roots.map((root) => root.id), LOGICAL_LIBRARY_ROOT_ID]);
  const existingById = new Map<string, LibraryDirectoryNode>();

  for (const node of base.nodes) {
    if (!validRootIds.has(node.rootId) || existingById.has(node.id) || (node.kind === "root" && node.id !== getLibraryRootDirectoryNodeId(node.rootId))) {
      continue;
    }
    existingById.set(node.id, { ...node, parentId: node.kind === "root" ? null : node.parentId });
  }

  const physicalParentById = new Map<string, string | null>();
  const physicalNodeByKey = new Map<string, LibraryDirectoryNode>();
  const ensureRoot = (root: LibraryRoot): LibraryDirectoryNode => {
    const id = getLibraryRootDirectoryNodeId(root.id);
    const existing = existingById.get(id);
    const node = existing ?? {
      id,
      name: root.label || root.absolutePath,
      parentId: null,
      rootId: root.id,
      relativePath: "",
      kind: "root" as const,
      order: 0,
    };
    const normalized = {
      ...node,
      name: root.label || node.name || root.absolutePath,
      parentId: null,
      rootId: root.id,
      relativePath: "",
      kind: "root" as const,
    };
    existingById.set(id, normalized);
    physicalNodeByKey.set(makeDirectoryPathKey(root.id, ""), normalized);
    physicalParentById.set(id, null);
    return normalized;
  };

  for (const root of roots) {
    ensureRoot(root);
  }

  const externalItems = items.filter((item) => {
    const storage = item.mediaStorage;
    return storage !== undefined && storage !== "managed" && validRootIds.has(storage.rootId);
  });

  for (const item of externalItems) {
    const storage = item.mediaStorage;
    if (!storage || storage === "managed") {
      continue;
    }

    const directoryPath = getDirectoryPath(storage.relativePath);
    const segments = directoryPath ? directoryPath.split("/").filter(Boolean) : [];
    let parentId = getLibraryRootDirectoryNodeId(storage.rootId);
    let accumulatedPath = "";

    for (const segment of segments) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${segment}` : segment;
      const key = makeDirectoryPathKey(storage.rootId, accumulatedPath);
      const id = getLibraryFolderDirectoryNodeId(storage.rootId, accumulatedPath);
      const existing = existingById.get(id) ?? physicalNodeByKey.get(key);
      const node = existing ?? {
        id,
        name: segment,
        parentId,
        rootId: storage.rootId,
        relativePath: accumulatedPath,
        kind: "folder" as const,
        order: 0,
      };
      const normalized = {
        ...node,
        id,
        name: node.name || segment,
        rootId: storage.rootId,
        relativePath: accumulatedPath,
        kind: "folder" as const,
      };
      if (!existing) {
        normalized.parentId = parentId;
      }
      existingById.set(id, normalized);
      physicalNodeByKey.set(key, normalized);
      physicalParentById.set(id, parentId);
      parentId = id;
    }
  }

  // Copied media keeps its original relative hierarchy as metadata. Its physical
  // mediaStorage stays managed; these are display-only directories.
  for (const item of items) {
    if (item.mediaStorage && item.mediaStorage !== "managed") continue;
    const source = normalizeLibraryImportSource(item.importSource); if (!source) continue;
    let parentId: string | null = null;
    const directoryPath = getDirectoryPath(source.relativePath);
    const parts = ["", ...directoryPath.split("/").filter(Boolean)]; let relative = "";
    for (const [index, part] of parts.entries()) {
      if (index > 0) relative = relative ? relative + "/" + part : part;
      const id = getCopiedImportDirectoryNodeId(source.rootId, relative);
      const existing = existingById.get(id);
      const node: LibraryDirectoryNode = existing ?? { id, name: index === 0 ? source.rootName : part, parentId, rootId: LOGICAL_LIBRARY_ROOT_ID, relativePath: relative, kind: "virtual", order: existingById.size };
      existingById.set(id, node); physicalParentById.set(id, parentId); parentId = id;
    }
  }
  // Older copied imports did not keep folder provenance. Recover only explicit
  // numbered file series once; unknown single assets remain unfiled and manual
  // assignments always win. No source paths or prompt content are rewritten.
  if (!base.legacyGroupingDone) {
    const groups = new Map<string, LibraryItem[]>();
    for (const item of items) {
      if (item.mediaStorage && item.mediaStorage !== "managed" || item.importSource) continue;
      const match = item.title.trim().match(/^(\d{8}[-_].{2,}?)\s*[-_](\d{2,6})$/);
      if (!match) continue; const group = groups.get(match[1]) ?? []; group.push(item); groups.set(match[1], group);
    }
    const parentId = "library-legacy-imports";
    for (const [name, group] of groups) {
      const unassigned = group.filter(item => !base.itemFolderIds[item.id]); if (group.length < 2 || !unassigned.length) continue;
      if (!existingById.has(parentId)) existingById.set(parentId, { id: parentId, name: "已导入素材", parentId: null, rootId: LOGICAL_LIBRARY_ROOT_ID, relativePath: "", kind: "virtual", order: existingById.size });
      const id = "library-legacy-series:" + encodeURIComponent(name);
      if (!existingById.has(id)) existingById.set(id, { id, name, parentId, rootId: LOGICAL_LIBRARY_ROOT_ID, relativePath: "", kind: "virtual", order: existingById.size });
      for (const item of unassigned) base.itemFolderIds[item.id] = id;
    }
    base.legacyGroupingDone = true;
  }

  const nodes = Array.from(existingById.values()).map((node) => {
    if (node.kind === "root") {
      return { ...node, parentId: null };
    }

    const fallback = node.rootId === LOGICAL_LIBRARY_ROOT_ID ? null : getLibraryRootDirectoryNodeId(node.rootId);
    const parent = node.parentId === null ? null : existingById.has(node.parentId) ? node.parentId : physicalParentById.get(node.id) ?? fallback;
    return { ...node, parentId: parent };
  });

  // A damaged settings file must not hide whole branches behind a parent cycle.
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const visited = new Set<string>();
    let current: LibraryDirectoryNode | undefined = node;
    while (current) {
      if (visited.has(current.id)) {
        node.parentId = node.rootId === LOGICAL_LIBRARY_ROOT_ID ? null : getLibraryRootDirectoryNodeId(node.rootId);
        break;
      }
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  const orderedNodes = reindexLibraryDirectoryNodes(nodes);
  const validNodeIds = new Set(orderedNodes.map((node) => node.id));
  const validItemIds = new Set(items.map((item) => item.id));
  const itemFolderIds = Object.fromEntries(
    Object.entries(base.itemFolderIds).filter(([itemId, folderId]) => validItemIds.has(itemId) && (validNodeIds.has(folderId) || folderId === UNFILED_LIBRARY_DIRECTORY_ID)),
  );
  const selectedNodeId = base.selectedNodeId && (validNodeIds.has(base.selectedNodeId) || base.selectedNodeId === ALL_LIBRARY_DIRECTORY_ID || base.selectedNodeId === UNFILED_LIBRARY_DIRECTORY_ID)
    ? base.selectedNodeId
    : ALL_LIBRARY_DIRECTORY_ID;

  return {
    ...base,
    nodes: orderedNodes,
    itemFolderIds,
    selectedNodeId,
    expandedNodeIds: base.expandedNodeIds?.filter((id) => validNodeIds.has(id)) ?? null,
  };
}

export function getCopiedImportDirectoryNodeId(rootId: string, relativePath = ""): string {
  return "library-copied-source:" + encodeURIComponent(rootId) + ":" + encodeURIComponent(normalizeRelativePath(relativePath));
}

export function getLibraryRootDirectoryNodeId(rootId: string): string {
  return `library-root:${rootId}`;
}

export function getLibraryFolderDirectoryNodeId(rootId: string, relativePath: string): string {
  return `library-folder:${rootId}:${normalizeRelativePath(relativePath)}`;
}

export function getDirectoryPath(relativeFilePath: string): string {
  const normalized = normalizeRelativePath(relativeFilePath);
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex < 0 ? "" : normalized.slice(0, separatorIndex);
}

export function getDefaultLibraryItemDirectoryId(
  item: LibraryItem,
  nodes: readonly LibraryDirectoryNode[],
): string | null {
  const storage = item.mediaStorage;
  if (!storage || storage === "managed") {
    const source = normalizeLibraryImportSource(item.importSource);
    if (!source) return null;
    const expectedId = getCopiedImportDirectoryNodeId(source.rootId, getDirectoryPath(source.relativePath));
    return nodes.some(node => node.id === expectedId) ? expectedId : null;
  }

  const directoryPath = getDirectoryPath(storage.relativePath);
  const expectedId = directoryPath
    ? getLibraryFolderDirectoryNodeId(storage.rootId, directoryPath)
    : getLibraryRootDirectoryNodeId(storage.rootId);
  if (nodes.some((node) => node.id === expectedId)) {
    return expectedId;
  }

  return nodes.find((node) => node.rootId === storage.rootId && node.kind === "root")?.id ?? null;
}

export function getLibraryItemDirectoryId(
  item: LibraryItem,
  settings: Pick<LibraryDirectorySettings, "itemFolderIds">,
  nodes: readonly LibraryDirectoryNode[],
): string | null {
  const assignedId = settings.itemFolderIds[item.id];
  if (assignedId === UNFILED_LIBRARY_DIRECTORY_ID) return null;
  if (assignedId && nodes.some((node) => node.id === assignedId)) {
    return assignedId;
  }
  return getDefaultLibraryItemDirectoryId(item, nodes);
}

export function isLibraryDirectoryDescendant(
  nodes: readonly LibraryDirectoryNode[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = byId.get(candidateId);
  const visited = new Set<string>();

  while (current?.parentId && !visited.has(current.id)) {
    if (current.parentId === ancestorId) {
      return true;
    }
    visited.add(current.id);
    current = byId.get(current.parentId);
  }

  return false;
}

export function moveLibraryDirectoryNode(
  nodes: readonly LibraryDirectoryNode[],
  sourceId: string,
  targetId: string,
  position: LibraryDirectoryDropPosition,
): LibraryDirectoryNode[] {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target) {
    throw new Error("目录拖拽目标不存在。");
  }
  if (sourceId === targetId || isLibraryDirectoryDescendant(nodes, sourceId, targetId)) {
    throw new Error("不能把目录放入自身或子目录。");
  }
  if (source.kind === "root" && position === "inside") {
    throw new Error("根目录只能调整顺序，不能放入其他目录。");
  }

  const nextNodes = nodes.map((node) => ({ ...node }));
  const sourceNode = nextNodes.find((node) => node.id === sourceId);
  if (!sourceNode) {
    throw new Error("目录拖拽源不存在。");
  }

  const destinationParentId = position === "inside" ? target.id : target.parentId;
  if (sourceNode.kind === "root" && destinationParentId !== null) {
    throw new Error("根目录只能保持在顶层。");
  }
  sourceNode.parentId = destinationParentId;

  const siblings = nextNodes
    .filter((node) => node.parentId === destinationParentId && node.id !== sourceId)
    .sort(compareDirectoryNodes);
  const targetIndex = position === "inside"
    ? siblings.length
    : Math.max(0, siblings.findIndex((node) => node.id === targetId)) + (position === "after" ? 1 : 0);
  siblings.splice(targetIndex < 0 ? siblings.length : targetIndex, 0, sourceNode);

  for (const [index, node] of siblings.entries()) {
    node.order = index;
  }

  return reindexLibraryDirectoryNodes(nextNodes);
}

export function assignLibraryItemsToDirectory(
  itemIds: readonly string[],
  folderId: string,
  nodes: readonly LibraryDirectoryNode[],
  currentAssignments: Readonly<Record<string, string>> = {},
): Record<string, string> {
  if (folderId !== UNFILED_LIBRARY_DIRECTORY_ID && !nodes.some((node) => node.id === folderId)) {
    throw new Error("素材归类目标不存在。");
  }

  const nextAssignments = { ...currentAssignments };
  for (const itemId of itemIds) {
    if (typeof itemId === "string" && itemId.trim()) {
      nextAssignments[itemId] = folderId;
    }
  }
  return nextAssignments;
}

export function unassignLibraryItemsFromDirectory(
  itemIds: readonly string[],
  currentAssignments: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const nextAssignments = { ...currentAssignments };
  for (const itemId of itemIds) {
    if (typeof itemId === "string" && itemId.trim()) {
      delete nextAssignments[itemId];
    }
  }
  return nextAssignments;
}

export function getDirectoryNodeDescendantIds(
  nodes: readonly LibraryDirectoryNode[],
  nodeId: string,
): Set<string> {
  const descendants = new Set<string>([nodeId]);
  const children = new Map<string, string[]>();
  for (const node of nodes) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  const queue = [nodeId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const id of children.get(queue[index]) ?? []) if (!descendants.has(id)) { descendants.add(id); queue.push(id); }
  }
  return descendants;
}

export function reindexLibraryDirectoryNodes(nodes: readonly LibraryDirectoryNode[]): LibraryDirectoryNode[] {
  const groups = new Map<string | null, LibraryDirectoryNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.parentId) ?? [];
    group.push({ ...node });
    groups.set(node.parentId, group);
  }

  const result: LibraryDirectoryNode[] = [];
  for (const group of groups.values()) {
    group.sort(compareDirectoryNodes);
    group.forEach((node, index) => {
      result.push({ ...node, order: index });
    });
  }
  return result.sort((left, right) => {
    const parentCompare = (left.parentId ?? "").localeCompare(right.parentId ?? "");
    return parentCompare || left.order - right.order || left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
  });
}

export function compareDirectoryNodes(left: LibraryDirectoryNode, right: LibraryDirectoryNode): number {
  return left.order - right.order || left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
}

export function normalizeRelativePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function makeDirectoryPathKey(rootId: string, relativePath: string): string {
  return `${rootId}\u0000${normalizeRelativePath(relativePath)}`;
}

function isRecord(input: unknown): input is UnknownRecord {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeOrder(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.round(value)))
    : fallback;
}

function isGalleryMode(value: unknown): value is LibraryDirectoryGalleryMode {
  return value === "masonry" || value === "grid" || value === "list";
}

function isMediaFilter(value: unknown): value is LibraryDirectoryMediaFilter {
  return value === "all" || value === "image" || value === "video";
}

function isSortMode(value: unknown): value is LibraryDirectorySortMode {
  return value === "name" || value === "importedAt" || value === "updatedAt" || value === "modifiedAt" || value === "imageSize" || value === "format" || value === "rating" || value === "random";
}



/** Virtual folders are presentation data: no operation here touches a source file. */
export function createLibraryDirectoryFolder(settings: LibraryDirectorySettings, input: { id: string; name: string; parentId: string | null }): LibraryDirectorySettings {
  const parent = input.parentId ? settings.nodes.find(node => node.id === input.parentId) : null;
  if (input.parentId && !parent) throw new Error("新建目录的上级不存在。");
  if (!input.id.trim() || settings.nodes.some(node => node.id === input.id)) throw new Error("目录标识已存在。");
  const name = validateDirectoryName(input.name, settings.nodes, input.parentId);
  const siblings = settings.nodes.filter(node => node.parentId === input.parentId);
  const node: LibraryDirectoryNode = { id: input.id, name, parentId: input.parentId, rootId: parent?.rootId ?? LOGICAL_LIBRARY_ROOT_ID, relativePath: "", kind: "virtual", order: siblings.length };
  return { ...settings, nodes: reindexLibraryDirectoryNodes([...settings.nodes, node]), selectedNodeId: node.id };
}

export function renameLibraryDirectoryFolder(settings: LibraryDirectorySettings, nodeId: string, name: string): LibraryDirectorySettings {
  const node = settings.nodes.find(candidate => candidate.id === nodeId);
  if (!node || node.kind === "root") throw new Error("请在目录管理中修改素材根目录名称。");
  const normalizedName = validateDirectoryName(name, settings.nodes, node.parentId, nodeId);
  return { ...settings, nodes: settings.nodes.map(candidate => candidate.id === nodeId ? { ...candidate, name: normalizedName } : candidate) };
}

export function removeLibraryDirectoryFolder(settings: LibraryDirectorySettings, nodeId: string): LibraryDirectorySettings {
  const node = settings.nodes.find(candidate => candidate.id === nodeId);
  if (!node || node.kind !== "virtual") throw new Error("只允许移除软件内新建的归纳目录。");
  const descendantIds = getDirectoryNodeDescendantIds(settings.nodes, nodeId);
  const removed = new Set(settings.nodes.filter(candidate => descendantIds.has(candidate.id) && candidate.kind === "virtual").map(candidate => candidate.id));
  const remaining = settings.nodes.filter(candidate => !removed.has(candidate.id));
  const remainingIds = new Set(remaining.map(candidate => candidate.id));
  const nodes = remaining.map(candidate => {
    if (!candidate.parentId || !removed.has(candidate.parentId)) return candidate;
    const physicalParentPath = getDirectoryPath(candidate.relativePath);
    const originalParent = physicalParentPath ? getLibraryFolderDirectoryNodeId(candidate.rootId, physicalParentPath) : getLibraryRootDirectoryNodeId(candidate.rootId);
    return { ...candidate, parentId: remainingIds.has(originalParent) && originalParent !== candidate.id ? originalParent : null };
  });
  return { ...settings, nodes: reindexLibraryDirectoryNodes(nodes), itemFolderIds: Object.fromEntries(Object.entries(settings.itemFolderIds).filter(([, id]) => !removed.has(id))), selectedNodeId: settings.selectedNodeId && removed.has(settings.selectedNodeId) ? node.parentId ?? ALL_LIBRARY_DIRECTORY_ID : settings.selectedNodeId, expandedNodeIds: settings.expandedNodeIds?.filter(id => !removed.has(id)) ?? null };
}

function validateDirectoryName(value: string, nodes: readonly LibraryDirectoryNode[], parentId: string | null, excludeId?: string): string {
  const name = value.trim();
  if (!name || /[\\/\u0000-\u001f]/.test(name)) throw new Error("请输入有效的目录名称，名称中不能包含斜杠。");
  if (nodes.some(node => node.id !== excludeId && node.parentId === parentId && node.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("同级目录中已存在这个名称。");
  return name;
}

export function getDirectoryItemFileName(item: LibraryItem): string {
  const storage = item.mediaStorage;
  const original = storage && storage !== "managed" ? storage.relativePath : item.importSource?.relativePath;
  return original ? normalizeRelativePath(original).split("/").at(-1) || item.imageFileName : item.imageFileName;
}

/** O(items + nodes + actual ancestry), rather than searching every node for each card. */
export function buildLibraryDirectoryItemIndex(items: readonly LibraryItem[], settings: LibraryDirectorySettings): { itemDirectoryById: Map<string, string | null>; counts: Map<string, number> } {
  const nodesById = new Map(settings.nodes.map(node => [node.id, node]));
  const itemDirectoryById = new Map<string, string | null>();
  const counts = new Map<string, number>([[ALL_LIBRARY_DIRECTORY_ID, items.length], [UNFILED_LIBRARY_DIRECTORY_ID, 0]]);
  for (const item of items) {
    const assigned = settings.itemFolderIds[item.id];
    const storage = item.mediaStorage;
    let folderId: string | null = null;
    if (assigned !== UNFILED_LIBRARY_DIRECTORY_ID) {
      if (assigned && nodesById.has(assigned)) folderId = assigned;
      else if ((!storage || storage === "managed") && item.importSource) {
        const source = normalizeLibraryImportSource(item.importSource);
        const id = source ? getCopiedImportDirectoryNodeId(source.rootId, getDirectoryPath(source.relativePath)) : "";
        folderId = nodesById.has(id) ? id : null;
      }
      else if (storage && storage !== "managed") {
        const directoryPath = getDirectoryPath(storage.relativePath);
        const physicalId = directoryPath ? getLibraryFolderDirectoryNodeId(storage.rootId, directoryPath) : getLibraryRootDirectoryNodeId(storage.rootId);
        folderId = nodesById.has(physicalId) ? physicalId : nodesById.has(getLibraryRootDirectoryNodeId(storage.rootId)) ? getLibraryRootDirectoryNodeId(storage.rootId) : null;
      }
    }
    itemDirectoryById.set(item.id, folderId);
    if (!folderId) { counts.set(UNFILED_LIBRARY_DIRECTORY_ID, (counts.get(UNFILED_LIBRARY_DIRECTORY_ID) ?? 0) + 1); continue; }
    const visited = new Set<string>();
    let current = nodesById.get(folderId);
    while (current && !visited.has(current.id)) { counts.set(current.id, (counts.get(current.id) ?? 0) + 1); visited.add(current.id); current = current.parentId ? nodesById.get(current.parentId) : undefined; }
  }
  return { itemDirectoryById, counts };
}

/** Directory mode is a scoped workspace, not another entrance to the complete library. */
export function getLibraryDirectoryScopedItems(items: readonly LibraryItem[], itemDirectoryById: ReadonlyMap<string, string | null>): LibraryItem[] {
  return items.filter(item => Boolean(itemDirectoryById.get(item.id)));
}

/** Repair legacy non-directory entrances without deleting materials or manual assignments. */
export function getLibraryDirectoryWorkspaceSettings(settings: LibraryDirectorySettings): LibraryDirectorySettings {
  const wasUnfiled = settings.selectedNodeId === UNFILED_LIBRARY_DIRECTORY_ID;
  const wasAlternateBrowse = Boolean(settings.browseBy && settings.browseBy !== "directories");
  if (!wasUnfiled && !wasAlternateBrowse) return settings;
  return {
    ...settings,
    browseBy: "directories",
    selectedNodeId: ALL_LIBRARY_DIRECTORY_ID,
    includeDescendants: false,
    searchQuery: "",
    tagFilter: "",
    categoryFilter: "",
    formatFilter: "",
  };
}

const directoryNameCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
export function selectLibraryDirectoryItems(items: readonly LibraryItem[], settings: LibraryDirectorySettings, likedImageIds: readonly string[] = [], itemDirectoryById = buildLibraryDirectoryItemIndex(items, settings).itemDirectoryById): LibraryItem[] {
  const selectedId = settings.selectedNodeId ?? ALL_LIBRARY_DIRECTORY_ID;
  const directoryIds = settings.includeDescendants ? getDirectoryNodeDescendantIds(settings.nodes, selectedId) : new Set([selectedId]);
  const liked = new Set(likedImageIds);
  const queryTokens = Array.from(settings.searchQuery.toLocaleLowerCase().matchAll(/"([^"]+)"|(\S+)/g), match => match[1] || match[2]);
  const format = settings.formatFilter.toLowerCase().replace(/^\./, "");
  const filtered = items.filter(item => {
    const directoryId = itemDirectoryById.get(item.id);
    if (selectedId === UNFILED_LIBRARY_DIRECTORY_ID ? Boolean(directoryId) : selectedId !== ALL_LIBRARY_DIRECTORY_ID && (!directoryId || !directoryIds.has(directoryId))) return false;
    const fileName = getDirectoryItemFileName(item);
    const isVideo = isVideoMediaFile(fileName);
    if (settings.mediaFilter === "video" && !isVideo || settings.mediaFilter === "image" && isVideo) return false;
    if (settings.favoriteOnly && !liked.has(item.id)) return false;
    if (format && getMediaFileExtension(fileName).slice(1) !== format) return false;
    if (settings.tagFilter && !item.tags.some(tag => tag.toLocaleLowerCase() === settings.tagFilter.toLocaleLowerCase())) return false;
    if (settings.categoryFilter && !getLibraryDirectoryItemCategories(item).includes(settings.categoryFilter)) return false;
    if ((item.rating ?? 0) < (settings.minimumRating ?? 0)) return false;
    const missing = item.mediaStorage && item.mediaStorage !== "managed" && item.mediaStorage.status === "missing";
    if (settings.availabilityFilter === "missing" && !missing || settings.availabilityFilter === "available" && missing) return false;
    const storagePath = item.mediaStorage && item.mediaStorage !== "managed" ? item.mediaStorage.relativePath : "";
    const haystack = [item.title, fileName, storagePath, item.prompt, item.negativePrompt, item.sourceUrl ?? "", item.generationMethod ?? "", ...item.tags].join(" ").toLocaleLowerCase();
    return queryTokens.every(token => haystack.includes(token));
  });
  const direction = settings.sortDirection === "asc" ? 1 : -1;
  return filtered.sort((left, right) => {
    let comparison = 0;
    if (settings.sortMode === "name") comparison = directoryNameCollator.compare(left.title || getDirectoryItemFileName(left), right.title || getDirectoryItemFileName(right));
    else if (settings.sortMode === "imageSize") comparison = getLibraryDirectoryItemSize(left) - getLibraryDirectoryItemSize(right);
    else if (settings.sortMode === "modifiedAt") comparison = getLibraryDirectoryItemModifiedAt(left) - getLibraryDirectoryItemModifiedAt(right);
    else if (settings.sortMode === "rating") comparison = (left.rating ?? 0) - (right.rating ?? 0);
    else if (settings.sortMode === "format") comparison = getMediaFileExtension(getDirectoryItemFileName(left)).localeCompare(getMediaFileExtension(getDirectoryItemFileName(right)));
    else if (settings.sortMode === "random") comparison = directoryRandomRank(left.id, settings.randomSeed ?? 1) - directoryRandomRank(right.id, settings.randomSeed ?? 1);
    else comparison = (Date.parse(settings.sortMode === "importedAt" ? left.createdAt : left.updatedAt) || 0) - (Date.parse(settings.sortMode === "importedAt" ? right.createdAt : right.updatedAt) || 0);
    return comparison * direction || directoryNameCollator.compare(getDirectoryItemFileName(left), getDirectoryItemFileName(right)) || left.id.localeCompare(right.id);
  });
}

export function selectLibraryDirectoryRange(orderedIds: readonly string[], currentIds: readonly string[], clickedId: string, options: { additive?: boolean; range?: boolean; anchorId?: string | null } = {}): Set<string> {
  const validIds = new Set(orderedIds);
  if (!validIds.has(clickedId)) return new Set(currentIds.filter(id => validIds.has(id)));
  if (options.range && options.anchorId && validIds.has(options.anchorId)) {
    const start = orderedIds.indexOf(options.anchorId), end = orderedIds.indexOf(clickedId);
    const result = new Set(options.additive ? currentIds.filter(id => validIds.has(id)) : []);
    for (const id of orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1)) result.add(id);
    return result;
  }
  if (!options.additive) return new Set([clickedId]);
  const result = new Set(currentIds.filter(id => validIds.has(id)));
  if (result.has(clickedId)) result.delete(clickedId); else result.add(clickedId);
  return result;
}

/** Honor external locate/rollback changes without delaying an immediate local click. */
export function resolveLibraryDirectorySelection(currentId: string, previousSavedId: string | null, savedId: string | null, nodesById: ReadonlyMap<string, unknown>): string {
  const fallback = savedId && nodesById.has(savedId) ? savedId : ALL_LIBRARY_DIRECTORY_ID;
  return previousSavedId !== savedId || !nodesById.has(currentId) ? fallback : currentId;
}

export function getLibraryDirectoryAncestorIds(nodes: readonly LibraryDirectoryNode[], nodeId: string): string[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ancestors: string[] = [];
  const seen = new Set([nodeId]);
  let parentId = byId.get(nodeId)?.parentId;
  while (parentId && !seen.has(parentId) && byId.has(parentId)) {
    ancestors.unshift(parentId); seen.add(parentId); parentId = byId.get(parentId)?.parentId;
  }
  return ancestors;
}


export type LibraryDirectoryFacet = { value: string; count: number };
export function getLibraryDirectoryItemCategories(item: LibraryItem): string[] {
  const ids = [item.categoryId, ...(item.genreIds ?? [])].filter((id): id is string => Boolean(id) && id !== "system:uncategorized");
  if (!ids.length && item.category && item.category !== "未分类") ids.push(item.category);
  return ids.length ? [...new Set(ids)] : ["__uncategorized__"];
}

export function buildLibraryDirectoryFacets(items: readonly LibraryItem[]): { tags: LibraryDirectoryFacet[]; categories: LibraryDirectoryFacet[]; formats: LibraryDirectoryFacet[] } {
  const tags = new Map<string, number>(); const categories = new Map<string, number>(); const formats = new Map<string, number>();
  const increment = (map: Map<string, number>, value: string) => { if (value) map.set(value, (map.get(value) ?? 0) + 1); };
  for (const item of items) {
    for (const tag of new Set(item.tags)) increment(tags, tag);
    for (const category of getLibraryDirectoryItemCategories(item)) increment(categories, category);
    increment(formats, getMediaFileExtension(getDirectoryItemFileName(item)).slice(1).toLowerCase());
  }
  const list = (map: Map<string, number>) => [...map].sort((a, b) => directoryNameCollator.compare(a[0], b[0])).map(([value, count]) => ({ value, count }));
  return { tags: list(tags), categories: list(categories), formats: list(formats) };
}

export function getLibraryDirectoryItemSize(item: LibraryItem): number {
  return (item.mediaStorage && item.mediaStorage !== "managed" ? item.mediaStorage.size : item.importSource?.size) ?? 0;
}
function getLibraryDirectoryItemModifiedAt(item: LibraryItem): number {
  return (item.mediaStorage && item.mediaStorage !== "managed" ? item.mediaStorage.mtimeMs : item.importSource?.mtimeMs) ?? (Date.parse(item.updatedAt) || 0);
}
function directoryRandomRank(id: string, seed: number): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x45d9f3b); hash ^= hash >>> 16;
  return hash >>> 0;
}
