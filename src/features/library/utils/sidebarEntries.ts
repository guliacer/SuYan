import type { SidebarEntryId, SidebarEntryVisibility } from "../types/library";

export const sidebarEntryIds = [
  "home",
  "categoryLexicon",
  "tagLexicon",
  "importMaterial",
  "libraryRoots",
  "promptLibrary",
  "textPrompts",
  "todo",
  "canvas",
  "webAssistant",
  "promptSites",
  "aiSettings",
  "nsfwSettings",
  "systemPreferences",
  "logExport",
  "account",
  "appearance",
  "about",
] as const satisfies readonly SidebarEntryId[];

export const requiredSidebarEntryIds = ["home", "systemPreferences"] as const satisfies readonly SidebarEntryId[];

export const defaultSidebarEntryVisibility: SidebarEntryVisibility = {
  home: true,
  categoryLexicon: true,
  tagLexicon: true,
  importMaterial: true,
  libraryRoots: true,
  promptLibrary: true,
  textPrompts: true,
  todo: true,
  canvas: true,
  webAssistant: true,
  promptSites: true,
  aiSettings: true,
  nsfwSettings: true,
  systemPreferences: true,
  logExport: true,
  account: true,
  appearance: true,
  about: true,
};

export type SidebarEntryGroup = {
  id: "materials" | "inspiration" | "resources" | "system";
  label: string;
  entries: readonly SidebarEntryId[];
};

export const sidebarEntryGroups: readonly SidebarEntryGroup[] = [
  {
    id: "materials",
    label: "素材",
    entries: ["home", "categoryLexicon", "tagLexicon", "importMaterial", "libraryRoots", "promptLibrary"],
  },
  {
    id: "inspiration",
    label: "灵感",
    entries: ["textPrompts", "todo", "canvas", "webAssistant"],
  },
  {
    id: "resources",
    label: "资源",
    entries: ["promptSites"],
  },
  {
    id: "system",
    label: "系统",
    entries: ["aiSettings", "nsfwSettings", "systemPreferences", "logExport"],
  },
];

export const sidebarFooterEntryIds = ["account", "appearance", "about"] as const satisfies readonly SidebarEntryId[];

export const sidebarEntryMeta: Record<SidebarEntryId, { label: string; description: string }> = {
  home: { label: "素材浏览", description: "浏览和搜索本地素材，始终显示" },
  categoryLexicon: { label: "分类浏览", description: "按分类查看已整理的素材" },
  tagLexicon: { label: "标签浏览", description: "按标签查看已整理的素材" },
  importMaterial: { label: "导入素材", description: "导入图片、目录、文档或分享包" },
  libraryRoots: { label: "素材目录", description: "管理外部素材目录" },
  promptLibrary: { label: "批量管理", description: "批量整理、导出和处理素材" },
  textPrompts: { label: "灵感创作", description: "管理独立的提示词卡片" },
  todo: { label: "待办事项", description: "管理项目与任务进度" },
  canvas: { label: "创作画布", description: "编辑提示词并生成图像" },
  webAssistant: { label: "网页助手", description: "使用网页工具辅助创作" },
  promptSites: { label: "资源推荐", description: "查看提示词与创作资源" },
  aiSettings: { label: "模型配置", description: "配置 AI 服务与模型" },
  nsfwSettings: { label: "内容分级", description: "配置素材内容分级" },
  systemPreferences: { label: "系统设置", description: "管理应用偏好，始终显示" },
  logExport: { label: "日志导出", description: "导出诊断日志" },
  account: { label: "账户", description: "登录和管理账户" },
  appearance: { label: "主题", description: "选择主题与浅色或深色模式" },
  about: { label: "关于", description: "查看版本和应用信息" },
};

export function isSidebarEntryId(value: string): value is SidebarEntryId {
  return (sidebarEntryIds as readonly string[]).includes(value);
}

export function normalizeSidebarEntryVisibility(input: unknown): SidebarEntryVisibility {
  const source = isRecord(input) ? input : {};
  const normalized = { ...defaultSidebarEntryVisibility };

  for (const entryId of sidebarEntryIds) {
    if (typeof source[entryId] === "boolean") {
      normalized[entryId] = source[entryId] as boolean;
    }
  }

  for (const entryId of requiredSidebarEntryIds) {
    normalized[entryId] = true;
  }

  return normalized;
}

export function isSidebarEntryVisibility(input: unknown): input is SidebarEntryVisibility {
  if (!isRecord(input)) {
    return false;
  }

  return sidebarEntryIds.every((entryId) => typeof input[entryId] === "boolean");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
