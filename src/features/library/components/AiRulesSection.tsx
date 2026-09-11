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
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import {
  aiFeatureActionMeta,
  normalizeAiRulePresetIds,
} from "../types/ai";
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
  const { t } = useLocale();
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

  const usableProfiles = profiles.filter((profile) =>
    profile.models.some((model) => model.capabilities.includes(selectedActionMeta.capability)),
  );
  const providerOptions: AiProviderOption[] = usableProfiles.map((profile) => ({
      detail: `${profile.models.filter((model) => model.capabilities.includes(selectedActionMeta.capability)).length} ${t("个适用模型")}`,
      label: profile.name || t("未命名 API"),
      value: profile.id,
    }));
  const selectedProviderValue = selectedActionProfile?.id ?? usableProfiles[0]?.id ?? "";

  return (
    <>
      <div data-feature-guide="ai-rules" className="grid gap-4 rounded-2xl border border-border bg-background p-3 shadow-sm min-[640px]:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{t("AI 规则设置")}</p>
          </div>
          <Button className="min-h-8 px-2.5 py-1.5 text-xs" icon={<X size={14} />} variant="ghost" onClick={() => resetActionPreference(selectedAction)}>
            {selectedActionEntryHasSources ? t("重置当前来源") : t("重置当前功能")}
          </Button>
        </div>

        <div className="grid gap-3 min-[860px]:grid-cols-[220px_minmax(0,1fr)]">
          <div data-feature-guide="ai-rules-actions" className="grid auto-rows-max gap-1.5">
            {orderedActionEntries.map((entry) => {
              const action = resolveAiSettingsEntryAction(entry, selectedAction, recognitionSourcePreferences);
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
              const entryLabel = t(getAiSettingsActionEntryLabel(entry));
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
                  title={t("拖动以调整规则入口顺序")}
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
                        {entry.actions.length > 1 ? t("文本/图片") : t(getAiActionCapabilityLabel(action))}
                      </span>
                      <span className="rounded-full border border-border bg-panel px-2 py-0.5 text-[11px]">
                        {rulePresetCount > 0 ? `${rulePresetCount} ${t("条")}` : hasCustomRules ? t("自定义") : t("未选")}
                      </span>
                    </span>
                  </span>
                  <span className="truncate text-[11px]">
                    {entry.actions.length > 1 ? `${t(getAiActionSourceLabel(action))} · ` : ""}
                    {`${profile?.name || t("默认 API")} / ${model?.label || model?.id || t("默认模型")}`}
                  </span>
                </button>
              );
            })}
          </div>

          <div data-feature-guide="ai-rules-configuration" className="grid gap-3 border-t border-border pt-3 min-[860px]:border-l min-[860px]:border-t-0 min-[860px]:pl-4 min-[860px]:pt-0">
            <div>
              <p className="text-sm font-semibold text-foreground">{t(selectedActionEntryLabel)}</p>
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
                          <span>{t(getAiActionSourceLabel(action))}</span>
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
                        {t(getAiActionCapabilityLabel(action))}
                          </span>
                        </button>
                        {recognitionKind !== null && recognitionSource !== null ? (
                          <button
                            aria-label={
                              isDefaultSource
                                ? t("{source}已是默认识别来源", { source: t(getAiActionSourceLabel(action)) })
                                : t("将{source}设为默认识别来源", { source: t(getAiActionSourceLabel(action)) })
                            }
                            aria-pressed={isDefaultSource}
                            className={`inline-flex min-h-9 shrink-0 items-center border-l px-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25 ${
                              selected ? "border-primary/40" : "border-border"
                            } ${isDefaultSource ? "text-primary" : "text-muted hover:text-foreground"}`}
                            title={isDefaultSource ? t("当前默认识别来源") : t("设为默认识别来源")}
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

            <div data-feature-guide="ai-rules-model" className="grid gap-3 min-[720px]:grid-cols-2">
              <label className="grid content-start gap-2 text-xs font-medium text-muted">
                <span className="flex items-center justify-between gap-2">
                  <span>{t("服务商 / 模型来源")}</span>
                  <span className="font-normal">{providerOptions.length} {t("个选项")}</span>
                </span>
                <BrandProviderSelect
                  options={providerOptions}
                  value={selectedProviderValue}
                  onChange={(value) => {
                    const nextProfile = profiles.find((profile) => profile.id === value) ?? usableProfiles[0];
                    if (!nextProfile || nextProfile.id === selectedActionProfile?.id) return;
                    const nextPreference = normalizeActionPreferenceDraft(undefined, [nextProfile], nextProfile.id, selectedAction);

                    patchActionPreference(selectedAction, {
                      source: "remote",
                      profileId: nextProfile?.id,
                      modelId: nextPreference.modelId,
                    });
                  }}
                />
              </label>

              <label className="grid content-start gap-2 text-xs font-medium text-muted">
                <span className="flex items-center justify-between gap-2">
                  <span>{t("使用模型")}</span>
                  <span className="font-normal">
                    {selectedActionModels.length > 0 ? `${selectedActionModels.length} ${t("个适用模型")}` : t("没有适用模型")}
                  </span>
                </span>
                <select
                  className="h-10 rounded-md border border-border bg-panel px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                  disabled={selectedActionModels.length === 0}
                  value={selectedActionModel?.id ?? ""}
                  onChange={(event) =>
                    patchActionPreference(selectedAction, {
                      source: "remote",
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
                    <option value="">{t("没有可用模型")}{t(selectedActionMeta.capability === "vision" ? "图片" : selectedActionMeta.capability === "image-generation" ? "生图" : "文本")}</option>
                  )}
                </select>
                {selectedActionModels.length === 0 ? (
                  <span className="text-[11px] leading-4 text-warning">
                    {t("当前服务商仍可保留配置；请在模型配置中为模型勾选")}
                    {selectedActionMeta.capability === "vision"
                      ? t("图像")
                      : selectedActionMeta.capability === "image-generation"
                        ? t("生图")
                        : t("文本")}
                    {t("能力。")}
                  </span>
                ) : null}
              </label>
            </div>

            <div data-feature-guide="ai-rules-content" className="grid gap-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{t("{label}规则", { label: t(selectedActionEntryLabel) })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-8 px-2.5 py-1.5 text-xs"
                    disabled={!selectedActionHasCustomRules}
                    icon={<X size={14} />}
                    variant="ghost"
                    onClick={() => clearActionRules(selectedAction)}
                  >
                    {t("清空选择")}
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border border-border bg-panel">
                <div className="min-w-[420px]">
                  <div className="grid grid-cols-[72px_150px_minmax(0,1fr)_96px] border-b border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">
                  <span>{t("状态")}</span>
                  <span>{t("规则名称")}</span>
                  <span>{t("规则内容")}</span>
                  <span className="text-center">{t("操作")}</span>
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
                            aria-label={`${selected ? t("停用") : t("启用")} ${t("规则")} ${rule.label}`}
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
                              aria-label={t("编辑规则 {label}", { label: rule.label })}
                              className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                              type="button"
                              onClick={() => editRule(rule)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              aria-label={t("删除规则 {label}", { label: rule.label })}
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
                    <p className="px-3 py-6 text-center text-xs text-muted">{t("当前功能还没有规则。")}</p>
                  )}
                  </div>
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
                  <span>{isEditingRule ? t("编辑规则") : t("新增规则")}</span>
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
                          className="min-h-8 px-2.5 py-1.5 text-xs"
                          icon={<X size={14} />}
                          variant="ghost"
                          onClick={() => {
                            setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
                            setRuleEditorOpen(false);
                          }}
                        >
                          {t("取消编辑")}
                        </Button>
                      </div>
                    ) : null}
                    <label className="grid gap-2 text-xs font-medium text-muted">
                      {t("规则名称")}
                      <TextField
                        placeholder={t("例如：中文细节反推")}
                        value={ruleEditor.label}
                        onChange={(event) => setRuleEditor((current) => ({ ...current, label: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-2 text-xs font-medium text-muted">
                      {t("规则内容")}
                      <TextArea
                        aria-label={t("{label}规则内容", { label: t(selectedActionMeta.label) })}
                        className="min-h-40"
                        placeholder={t(selectedActionMeta.rulePlaceholder)}
                        resizeMode="vertical"
                        value={ruleEditor.instructions}
                        onChange={(event) =>
                          setRuleEditor((current) => ({ ...current, instructions: event.target.value }))
                        }
                      />
                    </label>
                    <div className="flex justify-end">
                      <Button
                        className="min-h-8 px-2.5 py-1.5 text-xs"
                        disabled={!ruleEditor.label.trim() || !ruleEditor.instructions.trim()}
                        icon={<Check size={14} />}
                        variant="primary"
                        onClick={() => saveRule(selectedAction)}
                      >
                        {isEditingRule ? t("保存规则") : t("添加规则")}
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

type AiProviderOption = {
  value: string;
  label: string;
  detail?: string;
};

function BrandProviderSelect({
  options,
  value,
  onChange,
}: {
  options: readonly AiProviderOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 260 });
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      const width = Math.max(240, Math.min(360, rect.width));
      const menuHeight = Math.min(320, Math.max(64, options.length * 48 + 12));
      const top = rect.bottom + menuHeight <= window.innerHeight - 8
        ? rect.bottom + 4
        : Math.max(8, rect.top - menuHeight - 4);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
      setMenuPosition({ left, top, width });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    updatePosition();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  return (
    <>
      <button
        aria-controls={open ? "ai-provider-options" : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border bg-panel px-3 text-left text-sm text-foreground outline-none transition-colors hover:border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/20"
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selected?.label ?? t("暂无可用选项")}</span>
        <ChevronDown className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} size={15} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="grid max-h-80 gap-1 overflow-y-auto rounded-md border border-border bg-panel p-1.5 shadow-xl"
              id="ai-provider-options"
              ref={menuRef}
              role="listbox"
              style={{ left: menuPosition.left, top: menuPosition.top, width: menuPosition.width, position: "fixed", zIndex: 9999 }}
            >
              {options.length > 0 ? options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    aria-selected={isSelected}
                    className={`grid min-h-10 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                      isSelected ? "bg-primary text-primary-foreground" : "text-muted hover:bg-primary-soft hover:text-foreground"
                    }`}
                    key={option.value}
                    role="option"
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className={`flex size-4 items-center justify-center rounded-full border ${isSelected ? "border-primary-foreground" : "border-muted"}`}>
                      {isSelected ? <Check size={11} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{option.label}</span>
                      {option.detail ? <span className={`block truncate text-[11px] ${isSelected ? "text-primary-foreground/75" : "text-muted"}`}>{option.detail}</span> : null}
                    </span>
                  </button>
                );
              }) : <p className="px-2 py-3 text-xs text-muted">{t("没有可用服务商")}</p>}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
