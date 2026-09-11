import {
  builtinModuleDefinitions,
  canDeleteBuiltinModule,
  canDisableBuiltinModule,
  isBuiltinModuleEnabled,
  isBuiltinModuleInstalled,
  type BuiltinModuleCategory,
  type BuiltinModuleDefinition,
  type BuiltinModuleId,
  type BuiltinModuleState,
} from "./moduleRegistry";

export const moduleCategoryOrder: readonly BuiltinModuleCategory[] = [
  "core",
  "prompt",
  "runtime",
  "batch",
] as const;

export const moduleCategoryLabels: Record<BuiltinModuleCategory, string> = {
  core: "核心",
  prompt: "提示词",
  runtime: "依赖",
  batch: "批量工具",
};

export type ModuleManagementRow = {
  definition: BuiltinModuleDefinition;
  /** 持久化 installed 标志（required 恒为 true）。 */
  installed: boolean;
  /** 原始 enabled 标志（未考虑依赖）。 */
  rawEnabled: boolean;
  /** 依赖级联后的有效可用状态。 */
  effectivelyEnabled: boolean;
  canDisable: boolean;
  /** 仅必需模块不可删除。 */
  canDelete: boolean;
  /** 内置非视频模块移除后可直接恢复；视频依赖需重新安装组件。 */
  canRestore: boolean;
  /** 可切换启用：已安装且非必需。 */
  canToggleEnabled: boolean;
  /** 依赖未满足导致自身 enabled 无效。 */
  blockedByDependencies: boolean;
  dependencyLabels: string[];
  /** 直接依赖当前模块的功能，供删除确认明确告知影响。 */
  dependentLabels: string[];
};

/**
 * 将注册表 + 当前 moduleState 展开为面板行，供 UI 与单测共用。
 */
export function buildModuleManagementRows(state: BuiltinModuleState): ModuleManagementRow[] {
  return builtinModuleDefinitions.map((definition) => {
    const installed = isBuiltinModuleInstalled(definition.id, state);
    const rawEnabled = definition.required ? true : state[definition.id]?.enabled === true;
    const effectivelyEnabled = isBuiltinModuleEnabled(definition.id, state);
    const canDisable = canDisableBuiltinModule(definition.id);
    const canDelete = canDeleteBuiltinModule(definition.id);
    const dependencyLabels = definition.dependencies
      .map((dependencyId) => builtinModuleDefinitions.find((entry) => entry.id === dependencyId)?.label)
      .filter((label): label is string => Boolean(label));
    const dependentLabels = builtinModuleDefinitions
      .filter((entry) => entry.dependencies.includes(definition.id))
      .map((entry) => entry.label);

    return {
      definition,
      installed,
      rawEnabled,
      effectivelyEnabled,
      canDisable,
      canDelete,
      canRestore:
        canDelete &&
        !installed &&
        definition.id !== "video-runtime" &&
        definition.id !== "nsfw-runtime",
      canToggleEnabled: canDisable && installed,
      blockedByDependencies: installed && rawEnabled && !effectivelyEnabled,
      dependencyLabels,
      dependentLabels,
    };
  });
}

export function groupModuleManagementRows(
  rows: readonly ModuleManagementRow[],
): Array<{ category: BuiltinModuleCategory; label: string; rows: ModuleManagementRow[] }> {
  return moduleCategoryOrder
    .map((category) => ({
      category,
      label: moduleCategoryLabels[category],
      rows: rows.filter((row) => row.definition.category === category),
    }))
    .filter((group) => group.rows.length > 0);
}

/** video-runtime 探测结果如何写回 moduleState：保留用户在已安装时的 enabled 偏好。 */
export function resolveVideoRuntimeStateAfterProbe(
  current: { installed: boolean; enabled: boolean },
  installed: boolean,
): { installed: boolean; enabled: boolean } {
  if (!installed) {
    return { installed: false, enabled: false };
  }

  // 新检测到二进制（此前未装）→ 默认启用；已装则保留用户开关。
  if (!current.installed) {
    return { installed: true, enabled: true };
  }

  return { installed: true, enabled: current.enabled };
}

export function isVideoRuntimeModule(moduleId: BuiltinModuleId): boolean {
  return moduleId === "video-runtime";
}

export function isNsfwRuntimeModule(moduleId: BuiltinModuleId): boolean {
  return moduleId === "nsfw-runtime";
}
