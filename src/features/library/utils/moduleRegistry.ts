export const builtinModuleIds = [
  "core-library",
  "image-prompt",
  "video-prompt",
  "image-runtime",
  "video-runtime",
  "image-compression",
  "video-compression",
  "deduplicate-scan",
] as const;

export type BuiltinModuleId = (typeof builtinModuleIds)[number];

export const builtinModuleCapabilities = [
  "library-core",
  "image-prompt-card",
  "image-import",
  "prompt-edit",
  "prompt-copy",
  "video-prompt-card",
  "video-frame-extraction",
  "video-reference-images",
  "image-runtime",
  "video-runtime",
  "image-compression",
  "video-compression",
  "deduplicate-scan",
] as const;

export type BuiltinModuleCapability = (typeof builtinModuleCapabilities)[number];

export type BuiltinModuleCategory = "core" | "prompt" | "runtime" | "batch";

export type BuiltinModuleDefinition = {
  id: BuiltinModuleId;
  label: string;
  description: string;
  category: BuiltinModuleCategory;
  required: boolean;
  defaultInstalled: boolean;
  defaultEnabled: boolean;
  dependencies: readonly BuiltinModuleId[];
  packageDependencies: readonly string[];
  capabilities: readonly BuiltinModuleCapability[];
};

export type BuiltinModuleStateEntry = {
  installed: boolean;
  enabled: boolean;
};

export type BuiltinModuleState = Record<BuiltinModuleId, BuiltinModuleStateEntry>;
export type BuiltinModuleStatePatch = Partial<Record<BuiltinModuleId, Partial<BuiltinModuleStateEntry>>>;

export const builtinModuleDefinitions: readonly BuiltinModuleDefinition[] = [
  {
    id: "core-library",
    label: "核心素材库",
    description: "本地 library.json、素材导入导出、搜索筛选与基础管理能力。",
    category: "core",
    required: true,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: [],
    packageDependencies: [],
    capabilities: ["library-core"],
  },
  {
    id: "image-prompt",
    label: "图片提示词卡片",
    description: "软件默认模块，提供图片提示词卡片、提示词编辑、复制与图片导入能力。",
    category: "prompt",
    required: true,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library"],
    packageDependencies: [],
    capabilities: ["image-prompt-card", "image-import", "prompt-edit", "prompt-copy"],
  },
  {
    id: "video-runtime",
    label: "视频运行时",
    description: "为视频提示词与视频压缩提供 ffmpeg 运行能力。",
    category: "runtime",
    required: false,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library"],
    packageDependencies: ["ffmpeg-static"],
    capabilities: ["video-runtime"],
  },
  {
    id: "video-prompt",
    label: "视频提示词卡片",
    description: "提供视频提示词卡片、关键帧抽取与视频参考图管理能力。",
    category: "prompt",
    required: false,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library", "video-runtime"],
    packageDependencies: [],
    capabilities: ["video-prompt-card", "video-frame-extraction", "video-reference-images"],
  },
  {
    id: "image-runtime",
    label: "图像运行时",
    description: "为图像压缩提供 sharp 图像处理能力。",
    category: "runtime",
    required: false,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library"],
    packageDependencies: ["sharp"],
    capabilities: ["image-runtime"],
  },
  {
    id: "image-compression",
    label: "图像压缩",
    description: "批量压缩本地图片素材，支持保留格式或转为 WebP。",
    category: "batch",
    required: false,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library", "image-runtime"],
    packageDependencies: [],
    capabilities: ["image-compression"],
  },
  {
    id: "video-compression",
    label: "视频压缩",
    description: "批量压缩本地视频素材，复用视频运行时中的 ffmpeg 能力。",
    category: "batch",
    required: false,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library", "video-runtime"],
    packageDependencies: [],
    capabilities: ["video-compression"],
  },
  {
    id: "deduplicate-scan",
    label: "去重检测",
    description: "扫描本地素材库中重复的图片文件，帮助清理冗余素材。",
    category: "batch",
    required: false,
    defaultInstalled: true,
    defaultEnabled: true,
    dependencies: ["core-library"],
    packageDependencies: [],
    capabilities: ["deduplicate-scan"],
  },
];

export const defaultBuiltinModuleState = createDefaultBuiltinModuleState();

export function createDefaultBuiltinModuleState(): BuiltinModuleState {
  return Object.fromEntries(
    builtinModuleDefinitions.map((definition) => [
      definition.id,
      {
        installed: definition.defaultInstalled || definition.required,
        enabled: definition.defaultEnabled || definition.required,
      },
    ]),
  ) as BuiltinModuleState;
}

export function resolveBuiltinModuleState(_patch: BuiltinModuleStatePatch = {}): BuiltinModuleState {
  return createDefaultBuiltinModuleState();
}

export function isBuiltinModuleState(input: unknown): input is BuiltinModuleState {
  if (!isRecord(input)) {
    return false;
  }

  return builtinModuleDefinitions.every((definition) => {
    const entry = input[definition.id];

    return isRecord(entry) && typeof entry.installed === "boolean" && typeof entry.enabled === "boolean";
  });
}

export function getBuiltinModuleDefinition(moduleId: BuiltinModuleId): BuiltinModuleDefinition {
  return builtinModuleDefinitions.find((definition) => definition.id === moduleId)!;
}

export function canDisableBuiltinModule(moduleId: BuiltinModuleId): boolean {
  return !getBuiltinModuleDefinition(moduleId).required;
}

export function isBuiltinModuleInstalled(
  moduleId: BuiltinModuleId,
  state: BuiltinModuleState = defaultBuiltinModuleState,
): boolean {
  const definition = getBuiltinModuleDefinition(moduleId);

  return definition.required || state[moduleId]?.installed === true;
}

export function isBuiltinModuleEnabled(
  moduleId: BuiltinModuleId,
  state: BuiltinModuleState = defaultBuiltinModuleState,
  visiting: ReadonlySet<BuiltinModuleId> = new Set(),
): boolean {
  const definition = getBuiltinModuleDefinition(moduleId);
  const entry = state[moduleId];

  if (!definition.required && (!entry?.installed || !entry.enabled)) {
    return false;
  }

  if (visiting.has(moduleId)) {
    return true;
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(moduleId);

  return definition.dependencies.every((dependencyId) =>
    isBuiltinModuleEnabled(dependencyId, state, nextVisiting),
  );
}

export function hasBuiltinModuleCapability(
  capability: BuiltinModuleCapability,
  state: BuiltinModuleState = defaultBuiltinModuleState,
): boolean {
  return builtinModuleDefinitions.some(
    (definition) =>
      definition.capabilities.includes(capability) &&
      isBuiltinModuleEnabled(definition.id, state),
  );
}

export function getBuiltinModulesByCapability(capability: BuiltinModuleCapability): BuiltinModuleDefinition[] {
  return builtinModuleDefinitions.filter((definition) => definition.capabilities.includes(capability));
}

export function getModuleRuntimeDependencies(moduleId: BuiltinModuleId): BuiltinModuleId[] {
  const definition = getBuiltinModuleDefinition(moduleId);
  const result = new Set<BuiltinModuleId>();

  function collect(id: BuiltinModuleId) {
    const def = getBuiltinModuleDefinition(id);
    for (const depId of def.dependencies) {
      if (depId === "core-library") continue;
      const depDef = getBuiltinModuleDefinition(depId);
      if (depDef.category === "runtime") {
        result.add(depId);
      }
      collect(depId);
    }
  }

  collect(definition.id);
  return [...result];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
