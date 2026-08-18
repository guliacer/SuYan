import {
  Check,
  ChevronDown,
  FileText,
  GripVertical,
  ImageIcon,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { aiFeatureActionMeta, normalizeAiRulePresetIds } from "../types/ai";
import { normalizeActionPreferenceDraft, resolveActionRulesForDraft } from "../utils/aiSettingsDraft";
import {
  getAiActionCapabilityLabel,
  getAiActionRecognitionKind,
  getAiActionRecognitionSource,
  getAiActionSourceLabel,
  getAiSettingsActionEntryLabel,
  isAiSettingsActionEntrySelected,
  resolveAiSettingsEntryAction,
} from "./aiSettingsDialogData";
import type { AiSettingsApi } from "./useAiSettings";

export function AiRulesSection({ api }: { api: AiSettingsApi }) {
  const {
    actionPreferences,
    activeProfileId,
    dragOverActionEntryId,
    draggedActionEntryId,
    feedbackText,
    isEditingRule,
    orderedActionEntries,
    profiles,
    recognitionSourcePreferences,
    ruleEditor,
    ruleEditorOpen,
    selectedAction,
    selectedActionEntry,
    selectedActionEntryDescription,
    selectedActionEntryHasSources,
    selectedActionEntryLabel,
    selectedActionHasCustomRules,
    selectedActionMeta,
    selectedActionModel,
    selectedActionModels,
    selectedActionProfile,
    selectedActionRulePresetIds,
    selectedActionRules,
    setDragOverActionEntryId,
    setDraggedActionEntryId,
    setRuleEditor,
    setRuleEditorOpen,
    setSelectedAction,
    clearActionRules,
    deleteRule,
    editRule,
    handleSelectDefaultRecognitionSource,
    patchActionPreference,
    reorderActionEntries,
    resetActionPreference,
    saveRule,
    toggleRuleSelection,
  } = api;

  return (
    <>
      <div className="grid gap-4 rounded-2xl border border-border bg-background p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">AI 规则设置</p>
            <p className="mt-1 text-xs text-muted">
              可单独配置 API、模型和规则；NSFW 在内容分级中管理。
            </p>
          </div>
          <Button icon={<X size={15} />} variant="ghost" onClick={() => resetActionPreference(selectedAction)}>
            {selectedActionEntryHasSources ? "重置当前来源" : "重置当前功能"}
          </Button>
        </div>

        <div className="grid gap-3 min-[860px]:grid-cols-[220px_minmax(0,1fr)]">
          <div className="grid auto-rows-max gap-1.5">
            {orderedActionEntries.map((entry) => {
              const action = resolveAiSettingsEntryAction(entry, selectedAction);
              const preference = normalizeActionPreferenceDraft(actionPreferences[action], profiles, activeProfileId, action);
              const profile = profiles.find((item) => item.id === preference.profileId);
              const model = profile?.models.find((item) => item.id === preference.modelId);
              const selected = isAiSettingsActionEntrySelected(entry, selectedAction);
              const rules = resolveActionRulesForDraft(action, actionPreferences[action]);
              const rulePresetCount = normalizeAiRulePresetIds(
                action,
                actionPreferences[action]?.rulePresetIds,
                rules,
              ).length;
              const hasCustomRules = rulePresetCount > 0 || Boolean(actionPreferences[action]?.customInstructions?.trim());
              const entryLabel = getAiSettingsActionEntryLabel(entry);
              const isDragging = draggedActionEntryId === entry.id;
              const isDragOver = dragOverActionEntryId === entry.id;

              return (
                <button
                  className={`grid gap-1 rounded-md border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                    selected
                      ? "border-primary bg-primary-soft text-foreground"
                      : isDragOver
                        ? "border-primary/50 bg-primary-soft/70 text-foreground ring-1 ring-primary/30"
                        : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground"
                  } ${isDragging ? "opacity-55" : ""}`}
                  data-ai-action-entry-id={entry.id}
                  draggable={orderedActionEntries.length > 1}
                  key={entry.id}
                  title="拖动以调整规则入口顺序"
                  type="button"
                  onClick={() => setSelectedAction(action)}
                  onDragStart={(event) => {
                    if (orderedActionEntries.length <= 1) {
                      event.preventDefault();
                      return;
                    }

                    setDraggedActionEntryId(entry.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", entry.id);
                  }}
                  onDragEnter={(event) => {
                    if (!draggedActionEntryId || draggedActionEntryId === entry.id) {
                      return;
                    }

                    event.preventDefault();
                    setDragOverActionEntryId(entry.id);
                  }}
                  onDragOver={(event) => {
                    if (!draggedActionEntryId || draggedActionEntryId === entry.id) {
                      return;
                    }

                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = draggedActionEntryId ?? event.dataTransfer.getData("text/plain");
                    setDraggedActionEntryId(null);
                    setDragOverActionEntryId(null);

                    if (sourceId && sourceId !== entry.id) {
                      reorderActionEntries(sourceId, entry.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedActionEntryId(null);
                    setDragOverActionEntryId(null);
                  }}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <GripVertical aria-hidden="true" className="shrink-0 text-muted/55" size={14} />
                      <span className="truncate text-sm font-semibold">{entryLabel}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px]">
                        {entry.actions.length > 1 ? "文本/图片" : getAiActionCapabilityLabel(action)}
                      </span>
                      <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px]">
                        {rulePresetCount > 0 ? `${rulePresetCount} 条` : hasCustomRules ? "自定义" : "未选"}
                      </span>
                    </span>
                  </span>
                  <span className="truncate text-[11px]">
                    {entry.actions.length > 1 ? `${getAiActionSourceLabel(action)} · ` : ""}
                    {profile?.name || "默认 API"} / {model?.label || model?.id || "默认模型"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-border pt-3 min-[860px]:border-l min-[860px]:border-t-0 min-[860px]:pl-4 min-[860px]:pt-0">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedActionEntryLabel}</p>
              <p className="mt-1 text-xs text-muted">{selectedActionEntryDescription}</p>
              {selectedActionEntryHasSources ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedActionEntry.actions.map((action) => {
                    const selected = action === selectedAction;
                    const recognitionKind = getAiActionRecognitionKind(action);
                    const recognitionSource = getAiActionRecognitionSource(action);
                    const isDefaultSource =
                      recognitionKind !== null &&
                      recognitionSource !== null &&
                      (recognitionSourcePreferences[recognitionKind] ?? "prompt") === recognitionSource;

                    return (
                      <div
                        className={`inline-flex min-h-9 items-center overflow-hidden rounded-md border text-xs font-medium transition-colors ${
                          selected
                            ? "border-primary bg-primary-soft text-foreground"
                            : "border-border bg-panel text-muted"
                        }`}
                        key={action}
                      >
                        <button
                          aria-pressed={selected}
                          className="inline-flex min-h-9 items-center gap-2 px-3 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25"
                          type="button"
                          onClick={() => setSelectedAction(action)}
                        >
                          {aiFeatureActionMeta[action].capability === "vision" ? (
                            <ImageIcon size={14} />
                          ) : aiFeatureActionMeta[action].capability === "image-generation" ? (
                            <Sparkles size={14} />
                          ) : (
                            <FileText size={14} />
                          )}
                          <span>{getAiActionSourceLabel(action)}</span>
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
                            {getAiActionCapabilityLabel(action)}
                          </span>
                        </button>
                        {recognitionKind !== null && recognitionSource !== null ? (
                          <button
                            aria-label={
                              isDefaultSource
                                ? `${getAiActionSourceLabel(action)}已是默认识别来源`
                                : `将${getAiActionSourceLabel(action)}设为默认识别来源`
                            }
                            aria-pressed={isDefaultSource}
                            className={`inline-flex min-h-9 shrink-0 items-center border-l px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25 ${
                              selected ? "border-primary/40" : "border-border"
                            } ${isDefaultSource ? "text-primary" : "text-muted hover:text-foreground"}`}
                            disabled={isDefaultSource}
                            title={isDefaultSource ? "当前默认识别来源" : "设为默认识别来源"}
                            type="button"
                            onClick={() =>
                              handleSelectDefaultRecognitionSource(recognitionKind, recognitionSource)
                            }
                          >
                            <Star className={isDefaultSource ? "fill-current" : ""} size={13} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 min-[720px]:grid-cols-2">
              <label className="grid gap-2 text-xs font-medium text-muted">
                使用 API
                <select
                  className="h-10 rounded-md border border-border bg-panel px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  value={selectedActionProfile?.id ?? ""}
                  onChange={(event) => {
                    const nextProfile = profiles.find((profile) => profile.id === event.target.value);
                    const nextModel = nextProfile?.models.find((model) =>
                      model.capabilities.includes(selectedActionMeta.capability),
                    );

                    patchActionPreference(selectedAction, {
                      profileId: nextProfile?.id,
                      modelId: nextModel?.id,
                    });
                  }}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name || "未命名 API"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-xs font-medium text-muted">
                使用模型
                <select
                  className="h-10 rounded-md border border-border bg-panel px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  disabled={selectedActionModels.length === 0}
                  value={selectedActionModel?.id ?? ""}
                  onChange={(event) =>
                    patchActionPreference(selectedAction, {
                      profileId: selectedActionProfile?.id,
                      modelId: event.target.value,
                    })
                  }
                >
                  {selectedActionModels.length > 0 ? (
                    selectedActionModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label || model.id}
                      </option>
                    ))
                  ) : (
                    <option value="">没有可用{selectedActionMeta.capability === "vision" ? "图片" : selectedActionMeta.capability === "image-generation" ? "生图" : "文本"}模型</option>
                  )}
                </select>
              </label>
            </div>

            <div className="grid gap-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{selectedActionEntryLabel}规则</p>
                  <p className="mt-1 text-xs text-muted">
                    {selectedActionHasCustomRules
                      ? selectedActionEntryHasSources
                        ? "当前来源已使用所选规则。"
                        : "已使用所选规则。"
                      : selectedActionEntryHasSources
                        ? "请选择当前来源规则。"
                        : "请选择规则。"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-9 px-2.5 py-1.5 text-xs"
                    disabled={!selectedActionHasCustomRules}
                    icon={<X size={14} />}
                    variant="ghost"
                    onClick={() => clearActionRules(selectedAction)}
                  >
                    清空选择
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border bg-panel">
                <div className="grid grid-cols-[72px_150px_minmax(0,1fr)_96px] border-b border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">
                  <span>状态</span>
                  <span>规则名称</span>
                  <span>规则内容</span>
                  <span className="text-center">操作</span>
                </div>
                <div className={`${isEditingRule ? "max-h-36" : "max-h-72"} overflow-y-auto`}>
                  {selectedActionRules.length > 0 ? (
                    selectedActionRules.map((rule) => {
                      const selected = selectedActionRulePresetIds.includes(rule.id);

                      return (
                        <div
                          className={`grid min-h-14 grid-cols-[72px_150px_minmax(0,1fr)_96px] items-center border-b border-border/60 px-3 py-2 text-sm last:border-b-0 ${
                            selected ? "bg-primary-soft/70" : "bg-panel"
                          }`}
                          key={rule.id}
                        >
                          <button
                            aria-label={`${selected ? "停用" : "启用"}规则 ${rule.label}`}
                            aria-pressed={selected}
                            className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                            type="button"
                            onClick={() => toggleRuleSelection(selectedAction, rule.id)}
                          >
                            <span
                              className={`flex size-4 items-center justify-center rounded-full border ${
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-muted bg-panel"
                              }`}
                            >
                              {selected ? <Check size={11} /> : null}
                            </span>
                          </button>
                          <span className="truncate pr-3 font-medium text-foreground">{rule.label}</span>
                          <span className="truncate pr-3 text-muted">{rule.instructions}</span>
                          <span className="flex items-center justify-center gap-1">
                            <button
                              aria-label={`编辑规则 ${rule.label}`}
                              className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                              type="button"
                              onClick={() => editRule(rule)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              aria-label={`删除规则 ${rule.label}`}
                              className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/25"
                              type="button"
                              onClick={() => deleteRule(selectedAction, rule.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-muted">当前功能还没有规则。</p>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-border bg-panel">
                <button
                  aria-expanded={ruleEditorOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-xs font-semibold text-foreground outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25"
                  type="button"
                  onClick={() => {
                    if (ruleEditorOpen && isEditingRule) {
                      setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
                    }
                    setRuleEditorOpen((open) => !open);
                  }}
                >
                  <span>{isEditingRule ? "编辑规则" : "新增规则"}</span>
                  <ChevronDown
                    className={`shrink-0 text-muted transition-transform ${ruleEditorOpen ? "rotate-180" : ""}`}
                    size={16}
                  />
                </button>

                {ruleEditorOpen ? (
                  <div className="grid gap-3 border-t border-border p-3">
                    {isEditingRule ? (
                      <div className="flex justify-end">
                        <Button
                          className="min-h-8 px-2 py-1 text-xs"
                          icon={<X size={13} />}
                          variant="ghost"
                          onClick={() => {
                            setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
                            setRuleEditorOpen(false);
                          }}
                        >
                          取消编辑
                        </Button>
                      </div>
                    ) : null}
                    <label className="grid gap-2 text-xs font-medium text-muted">
                      规则名称
                      <TextField
                        placeholder="例如：中文细节反推"
                        value={ruleEditor.label}
                        onChange={(event) => setRuleEditor((current) => ({ ...current, label: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-2 text-xs font-medium text-muted">
                      规则内容
                      <TextArea
                        aria-label={`${selectedActionMeta.label}规则内容`}
                        className="min-h-40"
                        placeholder={selectedActionMeta.rulePlaceholder}
                        resizeMode="vertical"
                        value={ruleEditor.instructions}
                        onChange={(event) =>
                          setRuleEditor((current) => ({ ...current, instructions: event.target.value }))
                        }
                      />
                    </label>
                    <div className="flex justify-end">
                      <Button
                        disabled={!ruleEditor.label.trim() || !ruleEditor.instructions.trim()}
                        icon={<Check size={14} />}
                        variant="primary"
                        onClick={() => saveRule(selectedAction)}
                      >
                        {isEditingRule ? "保存规则" : "添加规则"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {feedbackText ? (
        <div className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          {feedbackText}
        </div>
      ) : null}
    </>
  );
}