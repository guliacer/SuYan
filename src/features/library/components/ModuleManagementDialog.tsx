import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Blocks, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { Capsule } from "@/components/ui/Capsule";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLibraryStore } from "../store/useLibraryStore";
import {
  buildModuleManagementRows,
  groupModuleManagementRows,
  isNsfwRuntimeModule,
  isVideoRuntimeModule,
  type ModuleManagementRow,
} from "../utils/moduleManagement";
import type { BuiltinModuleId } from "../utils/moduleRegistry";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";
import { VideoRuntimeInstallBanner } from "./VideoRuntimeInstallBanner";
import { NsfwRuntimeInstallBanner } from "./NsfwRuntimeInstallBanner";

type ModuleManagementDialogProps = {
  isBusy: boolean;
  /** 嵌入系统设置壳时不渲染 AppDialog 外框。 */
  embedded?: boolean;
  onClose?: () => void;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

type ModuleAction = {
  moduleId: BuiltinModuleId;
  kind: "toggle" | "delete" | "restore" | "install";
};

export function ModuleManagementDialog({
  isBusy,
  embedded = false,
  onClose,
  onNotify,
}: ModuleManagementDialogProps) {
  const { t } = useLocale();
  const moduleState = useLibraryStore((state) => state.moduleState);
  const setModuleState = useLibraryStore((state) => state.setModuleState);
  const removeModule = useLibraryStore((state) => state.removeModule);
  const restoreModule = useLibraryStore((state) => state.restoreModule);
  const checkVideoRuntime = useLibraryStore((state) => state.checkVideoRuntime);
  const checkNsfwRuntime = useLibraryStore((state) => state.checkNsfwRuntime);
  const [isProbing, setIsProbing] = useState(true);
  const [activeModuleAction, setActiveModuleAction] = useState<ModuleAction | null>(null);
  const [modulePendingDelete, setModulePendingDelete] = useState<BuiltinModuleId | null>(null);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    let disposed = false;

    void (async () => {
      setIsProbing(true);
      try {
        // 用户主动打开模块管理时强制真探测，不信任短缓存里的历史结果。
        await checkVideoRuntime({ force: true });
        await checkNsfwRuntime();
      } finally {
        if (!disposed) {
          setIsProbing(false);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [checkNsfwRuntime, checkVideoRuntime]);

  useEffect(() => {
    const text = feedbackText.trim();
    if (!text) {
      return;
    }

    onNotify?.({
      text,
      type: resolveStatusFeedbackTone(text),
    });
  }, [feedbackText, onNotify]);

  const rows = useMemo(() => buildModuleManagementRows(moduleState), [moduleState]);
  const groups = useMemo(() => groupModuleManagementRows(rows), [rows]);
  const pendingDeletionRow = useMemo(
    () => rows.find((row) => row.definition.id === modulePendingDelete) ?? null,
    [modulePendingDelete, rows],
  );

  const isActionBusy = isBusy || isProbing || activeModuleAction !== null;

  async function handleToggleEnabled(row: ModuleManagementRow, nextEnabled: boolean) {
    if (!row.canToggleEnabled || isActionBusy) {
      return;
    }

    const moduleId = row.definition.id;
    setActiveModuleAction({ moduleId, kind: "toggle" });
    try {
      const ok = await setModuleState({
        [moduleId]: {
          installed: row.installed,
          enabled: nextEnabled,
        },
      });
      setFeedbackText(
        ok
          ? nextEnabled
            ? t("已启用「{label}」。", { label: t(row.definition.label) })
            : t("已停用「{label}」。", { label: t(row.definition.label) })
          : t("更新「{label}」失败。", { label: t(row.definition.label) }),
      );
    } finally {
      setActiveModuleAction(null);
    }
  }

  function handleRequestDelete(row: ModuleManagementRow) {
    if (!row.canDelete || !row.installed || isActionBusy) {
      return;
    }
    setModulePendingDelete(row.definition.id);
  }

  async function handleConfirmDelete() {
    const row = pendingDeletionRow;
    if (!row || !row.canDelete || !row.installed) {
      setModulePendingDelete(null);
      return;
    }

    const moduleId = row.definition.id;
    setActiveModuleAction({ moduleId, kind: "delete" });
    try {
      const ok = await removeModule(moduleId);
      setFeedbackText(ok ? t("已删除「{label}」。", { label: t(row.definition.label) }) : t("删除「{label}」失败。", { label: t(row.definition.label) }));
    } finally {
      setActiveModuleAction(null);
      setModulePendingDelete(null);
    }
  }

  async function handleRestore(row: ModuleManagementRow) {
    if (!row.canRestore || isActionBusy) {
      return;
    }

    const moduleId = row.definition.id;
    setActiveModuleAction({ moduleId, kind: "restore" });
    try {
      const ok = await restoreModule(moduleId);
      setFeedbackText(ok ? t("已恢复「{label}」。", { label: t(row.definition.label) }) : t("恢复「{label}」失败。", { label: t(row.definition.label) }));
    } finally {
      setActiveModuleAction(null);
    }
  }

  const body = (
      <div data-feature-guide="system-preferences-panel-modules" className={`grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain ${embedded ? "px-1 py-1" : "px-5 py-5"}`}>
        {groups.map((group) => (
          <section key={group.category} className="grid gap-3 rounded-md border border-border bg-background p-4">
            <div>
               <p className="text-sm font-semibold text-foreground">{t(group.label)}</p>
              <p className="mt-1 text-xs leading-5 text-muted"></p>
            </div>

            <div className="grid gap-3">
              {group.rows.map((row) => (
                <ModuleRow
                  key={row.definition.id}
                  isBusy={isActionBusy}
                  actionKind={activeModuleAction?.moduleId === row.definition.id ? activeModuleAction.kind : null}
                  isToggling={
                    activeModuleAction?.moduleId === row.definition.id &&
                    activeModuleAction.kind === "toggle"
                  }
                  row={row}
                  onRequestDelete={() => handleRequestDelete(row)}
                  onRestore={() => void handleRestore(row)}
                  onToggleEnabled={(next) => void handleToggleEnabled(row, next)}
                  onVideoRuntimeInstalled={() => {
                    void checkVideoRuntime({ force: true });
                     setFeedbackText(t("视频依赖已安装并启用。"));
                  }}
                  onNsfwRuntimeInstalled={() => {
                    void checkNsfwRuntime();
                     setFeedbackText(t("本地 NSFW 识别模块已安装并启用。"));
                  }}
                />
              ))}
            </div>
          </section>
    ))}
      </div>
  );

  const deleteConfirmation = (
    <ConfirmDialog
      busyLabel={t("删除中…")}
      confirmLabel={t("删除模块")}
      description={
        pendingDeletionRow ? (
          <>
            <span>
              {isVideoRuntimeModule(pendingDeletionRow.definition.id)
                 ? t("将删除本应用下载的 FFmpeg 组件，并停用视频依赖。系统中自行安装的 FFmpeg 不会被修改。")
                : isNsfwRuntimeModule(pendingDeletionRow.definition.id)
                   ? t("将删除本地 NSFW 模型与 ONNX Runtime 文件，并停用本地分级；远程分级设置不会被修改。")
                : t("将从当前功能配置中移除「{label}」，对应入口会隐藏；之后可随时恢复。", { label: t(pendingDeletionRow.definition.label) })}
            </span>
               {pendingDeletionRow.dependentLabels.length > 0 ? (
              <span className="mt-2 block">
                 {t("删除后，")} {pendingDeletionRow.dependentLabels.join(", ")} {t("将暂不可用。")}
              </span>
            ) : null}
          </>
        ) : null
      }
      icon={<AlertTriangle size={18} />}
      isBusy={
        activeModuleAction?.kind === "delete" &&
        activeModuleAction.moduleId === pendingDeletionRow?.definition.id
      }
      open={pendingDeletionRow !== null}
       title={t("删除模块")}
      titleId="module-delete-confirmation-title"
      onCancel={() => {
        if (!activeModuleAction) {
          setModulePendingDelete(null);
        }
      }}
      onConfirm={() => void handleConfirmDelete()}
    />
  );

  if (embedded) {
    return (
      <>
        {body}
        {deleteConfirmation}
      </>
    );
  }

  return (
    <>
      <AppDialog
        panelClassName="flex max-h-full w-full max-w-3xl flex-col"
        titleId="module-management-title"
        onClose={onClose ?? (() => undefined)}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
              <Blocks size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold" id="module-management-title">
                 {t("模块管理")}
              </h2>
            </div>
          </div>
          <DialogCloseButton onClick={() => onClose?.()} />
        </header>
        {body}
      </AppDialog>
      {deleteConfirmation}
    </>
  );
}

function ModuleRow({
  row,
  isBusy,
  actionKind,
  isToggling,
  onRequestDelete,
  onRestore,
  onToggleEnabled,
  onVideoRuntimeInstalled,
  onNsfwRuntimeInstalled,
}: {
  row: ModuleManagementRow;
  isBusy: boolean;
  actionKind: ModuleAction["kind"] | null;
  isToggling: boolean;
  onRequestDelete: () => void;
  onRestore: () => void;
  onToggleEnabled: (nextEnabled: boolean) => void;
  onVideoRuntimeInstalled: () => void;
  onNsfwRuntimeInstalled: () => void;
}) {
  const { t } = useLocale();
  const { definition } = row;
  const isVideoRuntime = isVideoRuntimeModule(definition.id);
  const isNsfwRuntime = isNsfwRuntimeModule(definition.id);
  const showInstallBanner = isVideoRuntime && !row.installed;

  return (
    <div className="grid gap-3 rounded-md border border-border/80 bg-panel/40 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
             <p className="text-sm font-medium text-foreground">{t(definition.label)}</p>
            {!row.canDisable ? (
              <Capsule size="sm" tone="stone" variant="outline">
                {t("必需")}
              </Capsule>
            ) : null}
            {row.installed ? (
              <Capsule size="sm" tone="sage" variant="outline">
                {t("已安装")}
              </Capsule>
            ) : (
              <Capsule size="sm" tone="sand" variant="outline">
                {t("未安装")}
              </Capsule>
            )}
            {row.effectivelyEnabled ? (
              <Capsule size="sm" tone="mist" variant="outline">
                {t("可用")}
              </Capsule>
            ) : (
              <Capsule size="sm" tone="stone" variant="outline">
                {t("不可用")}
              </Capsule>
            )}
            {row.blockedByDependencies ? (
              <Capsule size="sm" tone="clay" variant="outline">
                {t("依赖未满足")}
              </Capsule>
            ) : null}
          </div>
           <p className="mt-1 text-xs leading-5 text-muted">{t(definition.description)}</p>
          {row.dependencyLabels.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted">{t("依赖：")}{row.dependencyLabels.join(", ")}</p>
          ) : null}
          {row.dependentLabels.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted">{t("被依赖：")}{row.dependentLabels.join(", ")}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-start">
          <label className="flex items-center gap-2 text-xs text-muted">
            <span>{row.rawEnabled ? t("已启用") : t("已停用")}</span>
            <input
              aria-label={t("{label}启用开关", { label: t(definition.label) })}
              checked={row.rawEnabled}
              className="size-4 accent-[var(--color-primary)]"
              disabled={!row.canToggleEnabled || isBusy}
              type="checkbox"
              onChange={(event) => onToggleEnabled(event.target.checked)}
            />
            {isToggling ? <LoaderCircle size={12} className="animate-spin" /> : null}
          </label>
          {row.canDelete && row.installed ? (
            <IconTooltipButton
              ariaLabel={t("删除「{label}」", { label: t(definition.label) })}
              disabled={isBusy}
              icon={actionKind === "delete" ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}
              label={actionKind === "delete" ? t("删除中…") : t("删除「{label}」", { label: t(definition.label) })}
              size="sm"
              tooltipPlacement="left"
              variant="danger"
              onClick={onRequestDelete}
            />
          ) : null}
        </div>
      </div>

      {row.canRestore ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/80 bg-background/70 px-3 py-2">
          {null}
          <Button
            size="sm"
            disabled={isBusy}
            icon={actionKind === "restore" ? <LoaderCircle size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            type="button"
            variant="secondary"
            onClick={onRestore}
          >
            {actionKind === "restore" ? t("恢复中…") : t("恢复并启用")}
          </Button>
        </div>
      ) : null}

      {showInstallBanner ? (
        <VideoRuntimeInstallBanner
          message={t("视频依赖未安装。可在线下载验签安装，或离线导入已签名的组件包。")}
          onInstalled={onVideoRuntimeInstalled}
        />
      ) : null}

      {isNsfwRuntime && !row.installed ? (
        <NsfwRuntimeInstallBanner
          message={t("本地 NSFW 模型不会随安装包分发。可在线下载固定版本，或导入已签名的三件套离线包后启用。")}
          onInstalled={onNsfwRuntimeInstalled}
        />
      ) : null}

    </div>
  );
}
