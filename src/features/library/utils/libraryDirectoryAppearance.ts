import type { LibraryDirectoryNode, LibraryDirectorySettings } from "./libraryDirectory";

export const LIBRARY_DIRECTORY_COLOR_PRESETS = [
  { name: "珊瑚红", color: "#ef8793" },
  { name: "天空蓝", color: "#60bcf4" },
  { name: "柔紫", color: "#af89e5" },
  { name: "薄荷绿", color: "#80cbb0" },
  { name: "琥珀黄", color: "#e8b961" },
  { name: "玫瑰粉", color: "#d592b8" },
] as const;

export function normalizeLibraryDirectoryColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return "#" + [...text.slice(1)].map(char => char + char).join("");
  return null;
}

/** Resolve once per tree edit, not once for each row or thumbnail. */
export function buildLibraryDirectoryColors(nodes: readonly LibraryDirectoryNode[]): Map<string, string> {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const orderedRoots = nodes.filter(node => !node.parentId || !byId.has(node.parentId))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const automatic = new Map(orderedRoots.map((node, index) => [node.id, LIBRARY_DIRECTORY_COLOR_PRESETS[index % LIBRARY_DIRECTORY_COLOR_PRESETS.length].color]));
  const result = new Map<string, string>();
  for (const start of nodes) {
    if (result.has(start.id)) continue;
    const chain: LibraryDirectoryNode[] = [];
    const seen = new Set<string>();
    let node: LibraryDirectoryNode | undefined = start;
    let color: string = LIBRARY_DIRECTORY_COLOR_PRESETS[0].color;
    while (node && !seen.has(node.id)) {
      if (result.has(node.id)) { color = result.get(node.id)!; break; }
      const explicit = normalizeLibraryDirectoryColor(node.color);
      if (explicit) { color = explicit; result.set(node.id, color); break; }
      chain.push(node); seen.add(node.id);
      if (!node.parentId || !byId.has(node.parentId)) { color = automatic.get(node.id) ?? color; break; }
      node = byId.get(node.parentId);
    }
    for (const member of chain) result.set(member.id, color);
  }
  return result;
}

export function setLibraryDirectoryColor(settings: LibraryDirectorySettings, nodeId: string, color: string | null): LibraryDirectorySettings {
  if (!settings.nodes.some(node => node.id === nodeId)) throw new Error("目录不存在。");
  const normalized = normalizeLibraryDirectoryColor(color);
  if (color !== null && !normalized) throw new Error("请选择有效的目录颜色。");
  return { ...settings, nodes: settings.nodes.map(node => {
    if (node.id !== nodeId) return node;
    const { color: _previous, ...rest } = node;
    return normalized ? { ...rest, color: normalized } : rest;
  }) };
}
