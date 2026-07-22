import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Eye,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import type {
  AiActionPreference,
  AiProviderModelSettings,
  AiRulePreset,
  PublicAiProviderSettings,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import { aiFeatureActionMeta, normalizeAiRulePresetIds } from "../types/ai";
import type { NsfwGradingSpeed } from "../types/library";
import {
  buildPublicAiSettingsPayload,
  normalizeActionPreferenceDraft,
  nsfwAiAction,
  resolveActionRulesForDraft,
} from "../utils/aiSettingsDraft";
import { nsfwGradingSpeedOptions } from "../utils/nsfwGradingSpeed";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";

type NsfwSettingsDialogProps = {
  aiSettings: PublicAiProviderSettings;
  autoNsfwGrading: boolean;
  blurNsfwImages: boolean;
  isBusy: boolean;
  nsfwGradingSpeed: NsfwGradingSpeed;
  onClose: () => void;
  onGradeAllNsfw: (options?: { force?: boolean }) => void;
  onSaveAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<boolean>;
  onSave: (settings: {
    autoNsfwGrading: boolean;
    blurNsfwImages: boolean;
    nsfwGradingSpeed: NsfwGradingSpeed;
  }) => Promise<boolean>;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

type RuleEditorState = {
  editingRuleId: string | null;
  instructions: string;
  label: string;
};

export function NsfwSettingsDialog({
  aiSettings,
  autoNsfwGrading,
  blurNsfwImages,
  isBusy,
  nsfwGradingSpeed,
  onClose,
  onGradeAllNsfw,
  onSaveAiSettings,
  onSave,
  onNotify,
}: NsfwSettingsDialogProps) {
  const [autoNsfwGradingDraft, setAutoNsfwGradingDraft] = useState(autoNsfwGrading);
  const [blurNsfwImagesDraft, setBlurNsfwImagesDraft] = useState(blurNsfwImages);
  const [nsfwGradingSpeedDraft, setNsfwGradingSpeedDraft] = useState(nsfwGradingSpeed);
  const [actionPreferencesDraft, setActionPreferencesDraft] = useState(() => aiSettings.actionPreferences);
  const [ruleEditor, setRuleEditor] = useState<RuleEditorState>({ editingRuleId: null, instructions: "", label: "" });
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [modelSearchDraft, setModelSearchDraft] = useState("");
  const [feedbackText, setFeedbackText] = useState("");

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

  useEffect(() => {
    setAutoNsfwGradingDraft(autoNsfwGrading);
    setBlurNsfwImagesDraft(blurNsfwImages);
    setNsfwGradingSpeedDraft(nsfwGradingSpeed);
    setFeedbackText("");
  }, [autoNsfwGrading, blurNsfwImages, nsfwGradingSpeed]);

  useEffect(() => {
    setActionPreferencesDraft(aiSettings.actionPreferences);
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setIsRuleEditorOpen(false);
    setExpandedRuleId(null);
    setModelSearchDraft("");
  }, [aiSettings.actionPreferences, aiSettings.activeProfileId, aiSettings.profiles]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  const nsfwActionMeta = aiFeatureActionMeta[nsfwAiAction];
  const nsfwActionPreference = normalizeActionPreferenceDraft(
    actionPreferencesDraft[nsfwAiAction],
    aiSettings.profiles,
    aiSettings.activeProfileId,
    nsfwAiAction,
  );
  const nsfwActionProfile =
    aiSettings.profiles.find((profile) => profile.id === nsfwActionPreference.profileId) ?? aiSettings.profiles[0];
  const nsfwActionAllModels = nsfwActionProfile?.models ?? [];
  const nsfwActionModels = nsfwActionAllModels.filter((model) =>
    model.capabilities.includes(nsfwActionMeta.capability),
  );
  const nsfwActionModel =
    nsfwActionModels.find((model) => model.id === nsfwActionPreference.modelId) ?? nsfwActionModels[0];
  const normalizedModelSearch = modelSearchDraft.trim().toLowerCase();
  const visibleNsfwActionModels = normalizedModelSearch
    ? nsfwActionAllModels.filter((model) => normalizeModelSearchText(model).includes(normalizedModelSearch))
    : nsfwActionAllModels;
  const nsfwActionRules = resolveActionRulesForDraft(nsfwAiAction, actionPreferencesDraft[nsfwAiAction]);
  const nsfwActionRulePresetIds = normalizeAiRulePresetIds(
    nsfwAiAction,
    actionPreferencesDraft[nsfwAiAction]?.rulePresetIds,
    nsfwActionRules,
  );
  const nsfwActionHasCustomRules =
    nsfwActionRulePresetIds.length > 0 || Boolean(actionPreferencesDraft[nsfwAiAction]?.customInstructions?.trim());
  const nsfwApiStatus = resolveNsfwApiStatus(nsfwActionProfile);
  const selectedRuleCount = nsfwActionRulePresetIds.length;

  async function handleSave() {
    setFeedbackText("正在保存内容分级...");
    const isNsfwSettingsSaved = await onSave({
      autoNsfwGrading: autoNsfwGradingDraft,
      blurNsfwImages: blurNsfwImagesDraft,
      nsfwGradingSpeed: nsfwGradingSpeedDraft,
    });

    if (!isNsfwSettingsSaved) {
      setFeedbackText("内容分级保存失败。");
      return;
    }

    setFeedbackText("正在保存 NSFW 分级模型配置...");
    const isAiSettingsSaved = await onSaveAiSettings(buildPublicAiSettingsPayload(aiSettings, actionPreferencesDraft));

    setFeedbackText(
      isAiSettingsSaved ? "内容分级已保存。" : "基础分级已保存，NSFW 模型保存失败。",
    );
  }

  async function handleSaveAiSettingsOnly() {
    setFeedbackText("正在保存检测引擎和规则...");
    const isAiSettingsSaved = await onSaveAiSettings(buildPublicAiSettingsPayload(aiSettings, actionPreferencesDraft));

    setFeedbackText(isAiSettingsSaved ? "检测引擎和规则已保存。" : "检测引擎和规则保存失败。");
  }

  function patchNsfwActionPreference(patch: AiActionPreference) {
    setActionPreferencesDraft((currentPreferences) => ({
      ...currentPreferences,
      [nsfwAiAction]: normalizeActionPreferenceDraft(
        {
          ...currentPreferences[nsfwAiAction],
          ...patch,
        },
        aiSettings.profiles,
        aiSettings.activeProfileId,
        nsfwAiAction,
      ),
    }));
    setFeedbackText("");
  }

  function resetNsfwActionPreference() {
    setActionPreferencesDraft((currentPreferences) => {
      const nextPreferences = { ...currentPreferences };
      delete nextPreferences[nsfwAiAction];
      return nextPreferences;
    });
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setIsRuleEditorOpen(false);
    setExpandedRuleId(null);
    setFeedbackText("NSFW 模型配置已重置，保存后生效。");
  }

  function toggleRuleSelection(ruleId: string) {
    const rules = resolveActionRulesForDraft(nsfwAiAction, actionPreferencesDraft[nsfwAiAction]);
    const currentPresetIds = normalizeAiRulePresetIds(
      nsfwAiAction,
      actionPreferencesDraft[nsfwAiAction]?.rulePresetIds,
      rules,
    );
    const nextPresetIds = currentPresetIds.includes(ruleId)
      ? currentPresetIds.filter((id) => id !== ruleId)
      : [...currentPresetIds, ruleId];

    patchNsfwActionPreference({
      customInstructions: "",
      rules,
      rulePresetIds: nextPresetIds,
    });
    setFeedbackText("规则选择已更新，保存后生效。");
  }

  function clearNsfwRules() {
    patchNsfwActionPreference({
      customInstructions: "",
      rules: resolveActionRulesForDraft(nsfwAiAction, actionPreferencesDraft[nsfwAiAction]),
      rulePresetIds: [],
    });
    setFeedbackText("已取消全部规则选择，保存后生效。");
  }

  function editRule(rule: AiRulePreset) {
    setRuleEditor({
      editingRuleId: rule.id,
      instructions: rule.instructions,
      label: rule.label,
    });
    setIsRuleEditorOpen(true);
    setExpandedRuleId(rule.id);
    setFeedbackText("");
  }

  function openNewRuleEditor() {
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setIsRuleEditorOpen(true);
    setFeedbackText("");
  }

  function closeRuleEditor() {
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setIsRuleEditorOpen(false);
    setFeedbackText("");
  }

  function saveRule() {
    const label = ruleEditor.label.trim();
    const instructions = ruleEditor.instructions.trim();

    if (!label || !instructions) {
      setFeedbackText("请先填写规则名称和规则内容。");
      return;
    }

    const rules = resolveActionRulesForDraft(nsfwAiAction, actionPreferencesDraft[nsfwAiAction]);
    const editingRuleId = ruleEditor.editingRuleId;
    const ruleId = editingRuleId ?? `rule-${Date.now().toString(36)}`;
    const nextRule: AiRulePreset = {
      id: ruleId,
      label,
      instructions,
    };
    const nextRules = editingRuleId
      ? rules.map((rule) => (rule.id === editingRuleId ? nextRule : rule))
      : [...rules, nextRule];
    const currentPresetIds = normalizeAiRulePresetIds(
      nsfwAiAction,
      actionPreferencesDraft[nsfwAiAction]?.rulePresetIds,
      nextRules,
    );
    const nextPresetIds = currentPresetIds.includes(ruleId) ? currentPresetIds : [...currentPresetIds, ruleId];

    patchNsfwActionPreference({
      customInstructions: "",
      rules: nextRules,
      rulePresetIds: nextPresetIds,
    });
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setIsRuleEditorOpen(false);
    setExpandedRuleId(ruleId);
    setFeedbackText(editingRuleId ? "规则已更新，保存后生效。" : "规则已新增，保存后生效。");
  }

  function deleteRule(ruleId: string) {
    const rules = resolveActionRulesForDraft(nsfwAiAction, actionPreferencesDraft[nsfwAiAction]);
    const nextRules = rules.filter((rule) => rule.id !== ruleId);
    const nextPresetIds = normalizeAiRulePresetIds(
      nsfwAiAction,
      actionPreferencesDraft[nsfwAiAction]?.rulePresetIds,
      nextRules,
    );

    patchNsfwActionPreference({
      customInstructions: "",
      rules: nextRules,
      rulePresetIds: nextPresetIds.filter((id) => id !== ruleId),
    });

    if (ruleEditor.editingRuleId === ruleId) {
      setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
      setIsRuleEditorOpen(false);
    }

    if (expandedRuleId === ruleId) {
      setExpandedRuleId(null);
    }

    setFeedbackText("规则已删除，保存后生效。");
  }

  return (
    <AppDialog panelClassName="flex max-h-[92vh] w-full max-w-4xl flex-col" titleId="nsfw-settings-title" onClose={onClose}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="nsfw-settings-title">
              内容分级
            </h2>
            <p className="mt-1 text-sm text-muted">管理自动分级、模糊、规则和批量校正</p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-5 py-5">
        <NsfwSettingRow
          checked={autoNsfwGradingDraft}
          description="新扫描图片自动分级"
          icon={<Shield size={16} />}
          label="自动分级"
          onChange={setAutoNsfwGradingDraft}
        />
        <NsfwSettingRow
          checked={blurNsfwImagesDraft}
          description="NSFW 图片默认模糊"
          icon={<Eye size={16} />}
          label="NSFW 自动模糊"
          onChange={setBlurNsfwImagesDraft}
        />
        <NsfwSpeedPicker
          disabled={isBusy}
          value={nsfwGradingSpeedDraft}
          onChange={setNsfwGradingSpeedDraft}
        />
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">批量分级</p>
            <p className="mt-1 text-xs leading-5 text-muted">补充分级或重新校正结果。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={isBusy} icon={<Play size={15} />} variant="secondary" onClick={() => onGradeAllNsfw()}>
              补充分级
            </Button>
            <Button
              disabled={isBusy}
              icon={<RefreshCw size={15} />}
              variant="ghost"
              onClick={() => onGradeAllNsfw({ force: true })}
            >
              重新校正
            </Button>
          </div>
        </section>
        <section className="grid gap-4 rounded-md border border-border bg-background px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">AI 检测引擎</p>
              <p className="mt-1 text-xs leading-5 text-muted">指定图片 API、模型和判断策略。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-9 px-2.5 py-1.5 text-xs"
                disabled={isBusy}
                icon={<Check size={14} />}
                variant="secondary"
                onClick={() => void handleSaveAiSettingsOnly()}
              >
                保存引擎与规则
              </Button>
              <Button
                className="min-h-9 px-2.5 py-1.5 text-xs"
                icon={<X size={14} />}
                variant="ghost"
                onClick={resetNsfwActionPreference}
              >
                重置
              </Button>
            </div>
          </div>

          <div className="grid gap-4 rounded-md border border-border bg-panel p-4">
            <div className="grid gap-2">
              <p className="text-xs font-semibold text-muted">当前连接</p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">OpenAI Compatible</p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {nsfwActionProfile?.name || "未命名 API"} · {nsfwActionProfile?.baseUrl || "未填写接口地址"}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                  <span className={`size-2 rounded-full ${getNsfwStatusDotClass(nsfwApiStatus)}`} />
                  {nsfwApiStatus}
                </span>
              </div>
            </div>

            <div className="border-t border-border" />

            <div className="grid gap-4 min-[820px]:grid-cols-[minmax(260px,0.92fr)_minmax(0,1.08fr)]">
              <div className="grid min-h-0 gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">① 选择 AI 服务</p>
                  <p className="mt-1 text-xs text-muted">左侧切换 API，右侧选择模型。</p>
                </div>
                <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                  {aiSettings.profiles.length > 0 ? (
                    aiSettings.profiles.map((profile) => {
                      const selected = profile.id === nsfwActionProfile?.id;
                      const status = resolveNsfwApiStatus(profile);
                      const visionModelCount = profile.models.filter((model) =>
                        model.capabilities.includes(nsfwActionMeta.capability),
                      ).length;

                      return (
                        <button
                          aria-pressed={selected}
                          className={`grid min-h-20 gap-2 rounded-md border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                            selected
                              ? "border-primary bg-primary-soft text-foreground shadow-elevated"
                              : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground"
                          }`}
                          key={profile.id}
                          type="button"
                          onClick={() => {
                            const nextModel =
                              profile.models.find(
                                (model) =>
                                  model.id === nsfwActionPreference.modelId &&
                                  model.capabilities.includes(nsfwActionMeta.capability),
                              ) ??
                              profile.models.find((model) => model.capabilities.includes(nsfwActionMeta.capability));

                            setModelSearchDraft("");
                            patchNsfwActionPreference({
                              profileId: profile.id,
                              modelId: nextModel?.id,
                            });
                          }}
                        >
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{profile.name || "未命名 API"}</span>
                            <span
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-panel"
                              }`}
                            >
                              {selected ? <Check size={12} /> : null}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span>{profile.models.length} 个模型</span>
                            <span>{visionModelCount} 个 Vision</span>
                            <span className="flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5">
                              <span className={`size-1.5 rounded-full ${getNsfwStatusDotClass(status)}`} />
                              {status}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="rounded-md border border-border bg-background px-3 py-4 text-xs text-muted">
                      暂无 API，请先在模型配置中添加。
                    </p>
                  )}
                </div>
              </div>

              <div className="grid min-h-0 gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">② 选择图片理解模型</p>
                  <p className="mt-1 text-xs text-muted">仅图片理解模型可选。</p>
                </div>
                <label className="relative block">
                  <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-muted">
                    <Search size={15} />
                  </span>
                  <TextField
                    aria-label="搜索图片理解模型"
                    className="h-9 rounded-md pl-9"
                    placeholder="搜索模型..."
                    value={modelSearchDraft}
                    onChange={(event) => setModelSearchDraft(event.target.value)}
                  />
                </label>
                {nsfwActionAllModels.length > 0 && nsfwActionModels.length === 0 ? (
                  <p className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs text-warning">
                    当前 API 没有图片理解模型，无法分级。
                  </p>
                ) : null}
                <div aria-label="选择图片理解模型" className="grid max-h-72 gap-1 overflow-y-auto pr-1" role="radiogroup">
                  {visibleNsfwActionModels.length > 0 ? (
                    visibleNsfwActionModels.map((model) => {
                      const hasVision = model.capabilities.includes(nsfwActionMeta.capability);
                      const selected = hasVision && model.id === nsfwActionModel?.id;

                      return (
                        <button
                          aria-disabled={!hasVision}
                          aria-checked={selected}
                          className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed ${
                            selected
                              ? "border-primary bg-primary-soft text-foreground shadow-sm"
                              : hasVision
                                ? "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground"
                                : "border-border bg-background/70 text-muted opacity-65"
                          }`}
                          disabled={!hasVision}
                          key={model.id}
                          role="radio"
                          type="button"
                          onClick={() => {
                            if (!hasVision) {
                              return;
                            }

                            patchNsfwActionPreference({
                              profileId: nsfwActionProfile?.id,
                              modelId: model.id,
                            });
                          }}
                        >
                          <span
                            className={`mt-1 flex size-4 items-center justify-center rounded-full border ${
                              selected ? "border-primary" : hasVision ? "border-muted" : "border-border"
                            }`}
                          >
                            <span className={`size-2 rounded-full ${selected ? "bg-primary" : "bg-transparent"}`} />
                          </span>
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold">{model.label || model.id}</span>
                              <span
                                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                                  hasVision
                                    ? "border-primary bg-primary-soft text-primary"
                                    : "border-border bg-panel text-muted"
                                }`}
                              >
                                {hasVision ? "图片可选" : "仅文本"}
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs">{model.id}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                              <span>Context {resolveModelContextLabel(model)}</span>
                              {model.capabilities.includes("vision") ? (
                                <span className="rounded-full border border-border bg-background px-2 py-0.5">图片理解</span>
                              ) : null}
                              {model.capabilities.includes("text") ? (
                                <span className="rounded-full border border-border bg-background px-2 py-0.5">文本生成</span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="rounded-md border border-border bg-background px-3 py-4 text-xs text-muted">
                      {nsfwActionAllModels.length > 0 ? "没有匹配的模型。" : "当前 API 还没有模型。"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">检测规则</p>
                <p className="mt-1 text-xs text-muted">
                  {nsfwActionHasCustomRules ? "仅使用已勾选规则。" : "未勾选时使用内置规则。"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                  {selectedRuleCount > 0 ? `已启用 ${selectedRuleCount}/${nsfwActionRules.length}` : "默认规则"}
                </span>
                <Button
                  className="min-h-9 px-2.5 py-1.5 text-xs"
                  disabled={!nsfwActionHasCustomRules}
                  icon={<X size={14} />}
                  variant="ghost"
                  onClick={clearNsfwRules}
                >
                  取消全部选择
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-border bg-panel">
              <div className="overflow-x-auto">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_112px] border-b border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">
                    <span>规则</span>
                    <span>摘要</span>
                    <span className="text-center">操作</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {nsfwActionRules.length > 0 ? (
                      nsfwActionRules.map((rule) => {
                        const selected = nsfwActionRulePresetIds.includes(rule.id);
                        const expanded = expandedRuleId === rule.id;

                        return (
                          <div
                            className={`border-b border-border/60 text-sm last:border-b-0 ${
                              selected ? "bg-primary-soft/70" : "bg-panel"
                            }`}
                            key={rule.id}
                          >
                            <div className="grid min-h-14 grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_112px] items-center px-3 py-2">
                              <span className="flex min-w-0 items-center gap-3 pr-3">
                                <button
                                  aria-checked={selected}
                                  aria-label={`${selected ? "停用" : "启用"}规则 ${rule.label}`}
                                  className="flex size-8 items-center justify-center rounded-md text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                                  role="checkbox"
                                  type="button"
                                  onClick={() => toggleRuleSelection(rule.id)}
                                >
                                  <span
                                    className={`flex size-4 items-center justify-center rounded-[4px] border ${
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-muted bg-panel"
                                    }`}
                                  >
                                    {selected ? <Check size={11} /> : null}
                                  </span>
                                </button>
                                <span className="min-w-0">
                                  <span className="block truncate font-medium text-foreground">{rule.label}</span>
                                  <span className="mt-0.5 block text-[11px] text-muted">
                                    {selected ? "已启用" : "未启用"}
                                  </span>
                                </span>
                              </span>
                              <button
                                aria-label={`${expanded ? "收起" : "展开"}规则 ${rule.label} 详情`}
                                className="min-w-0 pr-3 text-left text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                                type="button"
                                onClick={() => setExpandedRuleId(expanded ? null : rule.id)}
                              >
                                <span className="block truncate">{summarizeRuleInstructions(rule.instructions)}</span>
                              </button>
                              <span className="flex items-center justify-center gap-1">
                                <button
                                  aria-label={`${expanded ? "收起" : "展开"}规则 ${rule.label} 详情`}
                                  className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                                  type="button"
                                  onClick={() => setExpandedRuleId(expanded ? null : rule.id)}
                                >
                                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
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
                                  onClick={() => deleteRule(rule.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </span>
                            </div>
                            {expanded ? (
                              <div className="border-t border-border/60 bg-background px-3 py-3">
                                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-panel p-3 text-xs leading-5 text-muted">
                                  {rule.instructions}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="px-3 py-6 text-center text-xs text-muted">当前没有可用规则。</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border bg-panel">
              {isRuleEditorOpen ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      {ruleEditor.editingRuleId ? "编辑规则" : "新建规则"}
                    </p>
                    <p className="mt-1 text-xs text-muted">保存后会自动加入已启用规则。</p>
                  </div>
                  <Button
                    className="min-h-8 px-2 py-1 text-xs"
                    icon={<X size={13} />}
                    variant="ghost"
                    onClick={closeRuleEditor}
                  >
                    {ruleEditor.editingRuleId ? "取消编辑" : "收起"}
                  </Button>
                </div>
              ) : (
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/25"
                  type="button"
                  onClick={openNewRuleEditor}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Plus size={15} />
                    <span className="font-semibold">新建规则</span>
                  </span>
                  <span className="text-xs text-muted">默认收起，需要时再添加</span>
                </button>
              )}

              {isRuleEditorOpen ? (
                <div className="grid gap-3 border-t border-border p-3">
                  <label className="grid gap-2 text-xs font-medium text-muted">
                    规则名称
                    <TextField
                      placeholder="例如：严格安全分级"
                      value={ruleEditor.label}
                      onChange={(event) => setRuleEditor((current) => ({ ...current, label: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-medium text-muted">
                    规则内容
                    <TextArea
                      aria-label="NSFW 分级规则内容"
                      className="min-h-32"
                      placeholder={nsfwActionMeta.rulePlaceholder}
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
                      onClick={saveRule}
                    >
                      {ruleEditor.editingRuleId ? "保存规则" : "添加规则"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
        {feedbackText ? (
          <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <Button icon={<X size={16} />} variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button disabled={isBusy} icon={<Check size={16} />} variant="primary" onClick={() => void handleSave()}>
          保存全部设置
        </Button>
      </footer>
    </AppDialog>
  );
}

function summarizeRuleInstructions(instructions: string): string {
  const summary = instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^=+\s*.*?\s*=+$/.test(line) &&
        !/^【.*】$/.test(line) &&
        !/^[一二三四五六七八九十]+、/.test(line),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!summary) {
    return "未填写规则摘要";
  }

  return summary.length > 72 ? `${summary.slice(0, 72)}...` : summary;
}

function normalizeModelSearchText(model: AiProviderModelSettings): string {
  return `${model.label} ${model.id} ${model.capabilities.join(" ")}`.toLowerCase();
}

function resolveModelContextLabel(model: AiProviderModelSettings | undefined): string {
  const modelName = getNormalizedModelName(model);

  if (!modelName) {
    return "--";
  }

  if (/mini|flash|lite|fast/i.test(modelName)) {
    return "128K";
  }

  if (/gemini.*(?:1\.5|2\.0|2\.5|3)|gpt-5|claude.*(?:sonnet|opus)/i.test(modelName)) {
    return "400K";
  }

  if (/gpt-4\.1|gpt-4o|o3|o4|qwen.*vl|internvl/i.test(modelName)) {
    return "200K";
  }

  return "128K";
}

function getNormalizedModelName(model: AiProviderModelSettings | undefined): string {
  return `${model?.label ?? ""} ${model?.id ?? ""}`.trim().toLowerCase();
}

function getNsfwStatusDotClass(status: string): string {
  if (status === "已启用") {
    return "bg-primary";
  }

  if (status === "缺少密钥") {
    return "bg-warning";
  }

  if (status === "未找到 API") {
    return "bg-danger";
  }

  return "bg-muted";
}

function resolveNsfwApiStatus(profile: PublicAiProviderSettings["profiles"][number] | undefined): string {
  if (!profile) {
    return "未找到 API";
  }

  if (!profile.enabled) {
    return "已停用";
  }

  return profile.hasApiKey ? "已启用" : "缺少密钥";
}

type NsfwSpeedPickerProps = {
  disabled: boolean;
  value: NsfwGradingSpeed;
  onChange: (value: NsfwGradingSpeed) => void;
};

function NsfwSpeedPicker({ disabled, value, onChange }: NsfwSpeedPickerProps) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">分级速度</p>
          <p className="mt-1 text-xs leading-5 text-muted">速度越高请求越密集，接口限速时切回稳定。</p>
        </div>
        <div aria-label="选择 NSFW 分级速度" className="grid grid-cols-3 gap-2" role="radiogroup">
          {nsfwGradingSpeedOptions.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-checked={isSelected}
                className={`min-w-20 rounded-lg border px-3 py-2 text-left text-xs transition-all hover:-translate-y-0.5 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-50 ${
                  isSelected
                    ? "border-primary bg-primary-soft text-foreground shadow-elevated"
                    : "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground"
                }`}
                disabled={disabled}
                key={option.value}
                role="radio"
                type="button"
                onClick={() => onChange(option.value)}
              >
                <span className="block font-semibold">{option.label}</span>
                <span className="mt-1 block leading-4">{option.concurrency} 路</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type NsfwSettingRowProps = {
  checked: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
};

function NsfwSettingRow({ checked, description, icon, label, onChange }: NsfwSettingRowProps) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-border bg-background px-4 py-3">
      <span className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{label}</span>
          <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
        </span>
      </span>
      <input
        aria-label={label}
        checked={checked}
        className="size-5 accent-current"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
