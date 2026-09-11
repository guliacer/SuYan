import { useEffect, useMemo, useState } from "react";
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
import { useLocale } from "@/components/LocaleProvider";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
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
import type { NsfwDetectionMode, NsfwGradingSpeed } from "../types/library";
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
import { useAutoSave } from "../hooks/useAutoSave";
import { useLibraryStore } from "../store/useLibraryStore";
import { hasBuiltinModuleCapability } from "../utils/moduleRegistry";
import { NsfwRuntimeInstallBanner } from "./NsfwRuntimeInstallBanner";

type NsfwSettingsDialogProps = {
  aiSettings: PublicAiProviderSettings;
  autoNsfwGrading: boolean;
  blurNsfwImages: boolean;
  isBusy: boolean;
  nsfwGradingSpeed: NsfwGradingSpeed;
  nsfwDetectionMode: NsfwDetectionMode;
  onClose: () => void;
  onGradeAllNsfw: (options?: { force?: boolean }) => void;
  onSaveAiSettings: (settings: SaveAiProviderSettingsPayload) => Promise<boolean | string>;
  onSave: (settings: {
    autoNsfwGrading: boolean;
    blurNsfwImages: boolean;
    nsfwGradingSpeed: NsfwGradingSpeed;
    nsfwDetectionMode: NsfwDetectionMode;
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
  nsfwDetectionMode,
  onClose,
  onGradeAllNsfw,
  onSaveAiSettings,
  onSave,
  onNotify,
}: NsfwSettingsDialogProps) {
  const { t } = useLocale();
  const [autoNsfwGradingDraft, setAutoNsfwGradingDraft] = useState(autoNsfwGrading);
  const [blurNsfwImagesDraft, setBlurNsfwImagesDraft] = useState(blurNsfwImages);
  const [nsfwGradingSpeedDraft, setNsfwGradingSpeedDraft] = useState(nsfwGradingSpeed);
  const [nsfwDetectionModeDraft, setNsfwDetectionModeDraft] = useState(nsfwDetectionMode);
  const [actionPreferencesDraft, setActionPreferencesDraft] = useState(() => aiSettings.actionPreferences);
  const [ruleEditor, setRuleEditor] = useState<RuleEditorState>({ editingRuleId: null, instructions: "", label: "" });
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [modelSearchDraft, setModelSearchDraft] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const moduleState = useLibraryStore((state) => state.moduleState);
  const checkNsfwRuntime = useLibraryStore((state) => state.checkNsfwRuntime);

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
  // API 列表保留全部服务商；没有图片理解模型时在右侧明确显示空状态。
  const nsfwActionProfiles = aiSettings.profiles;
  const nsfwActionProfile =
    aiSettings.profiles.find((profile) => profile.id === nsfwActionPreference.profileId) ??
    nsfwActionProfiles[0];
  const nsfwActionAllModels = nsfwActionProfile?.models ?? [];
  const nsfwActionModels = nsfwActionAllModels.filter((model) =>
    model.capabilities.includes(nsfwActionMeta.capability),
  );
  const nsfwActionModel =
    nsfwActionModels.find((model) => model.id === nsfwActionPreference.modelId) ?? nsfwActionModels[0];
  const normalizedModelSearch = modelSearchDraft.trim().toLowerCase();
  const visibleNsfwActionModels = normalizedModelSearch
    ? nsfwActionModels.filter((model) => normalizeModelSearchText(model).includes(normalizedModelSearch))
    : nsfwActionModels;
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

  const basicSettingsDraft = useMemo(
    () => ({
      autoNsfwGrading: autoNsfwGradingDraft,
      blurNsfwImages: blurNsfwImagesDraft,
      nsfwGradingSpeed: nsfwGradingSpeedDraft,
      nsfwDetectionMode: nsfwDetectionModeDraft,
    }),
    [autoNsfwGradingDraft, blurNsfwImagesDraft, nsfwGradingSpeedDraft, nsfwDetectionModeDraft],
  );
  const aiSettingsDraftPayload = useMemo(
    () => buildPublicAiSettingsPayload(aiSettings, actionPreferencesDraft),
    [actionPreferencesDraft, aiSettings],
  );

  useAutoSave({
    isBusy,
    onError: setFeedbackText,
    onSave,
    value: basicSettingsDraft,
  });
  useAutoSave({
    isBusy,
    onError: setFeedbackText,
    onSave: onSaveAiSettings,
    value: aiSettingsDraftPayload,
  });

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
    setFeedbackText(t("NSFW 模型配置已重置，正在自动保存。"));
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
    setFeedbackText(t("规则选择已更新，正在自动保存。"));
  }

  function clearNsfwRules() {
    patchNsfwActionPreference({
      customInstructions: "",
      rules: resolveActionRulesForDraft(nsfwAiAction, actionPreferencesDraft[nsfwAiAction]),
      rulePresetIds: [],
    });
    setFeedbackText(t("已取消全部规则选择，正在自动保存。"));
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
      setFeedbackText(t("请先填写规则名称和规则内容。"));
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
    setFeedbackText(editingRuleId ? t("规则已更新，正在自动保存。") : t("规则已新增，正在自动保存。"));
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

    setFeedbackText(t("规则已删除，正在自动保存。"));
  }

  return (
    <AppDialog
      panelClassName="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col"
      titleId="nsfw-settings-title"
      onClose={onClose}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-3 py-3 min-[640px]:items-center min-[640px]:px-5 min-[640px]:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="nsfw-settings-title">
              {t("内容分级")}
            </h2>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-3 py-3 scroll-pb-4 min-[640px]:px-4 min-[640px]:py-4 min-[960px]:px-6 min-[960px]:py-5">
        {nsfwDetectionModeDraft !== "remote-only" &&
        !hasBuiltinModuleCapability("nsfw-local-classification", moduleState) ? (
          <NsfwRuntimeInstallBanner
            message={t("本地 NSFW 识别模块尚未安装或已停用。需要本地分级时，可按需下载并安装模型；也可以继续使用已配置的远程视觉模型。")}
            onInstalled={() => {
              void checkNsfwRuntime();
            }}
          />
        ) : null}
        <div className="grid gap-4 min-[1120px]:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.22fr)] min-[1120px]:items-start">
          <div className="grid gap-2 rounded-md border border-border bg-background p-3 min-[640px]:p-4 min-[1120px]:col-start-1 min-[1120px]:row-start-1">
            <NsfwSettingRow
              checked={autoNsfwGradingDraft}
              description={t("新扫描图片自动分级")}
              flat
              icon={<Shield size={16} />}
              label={t("自动分级")}
              onChange={setAutoNsfwGradingDraft}
            />
            <div className="h-px bg-border" />
            <NsfwSettingRow
              checked={blurNsfwImagesDraft}
              description={t("NSFW 图片默认模糊")}
              flat
              icon={<Eye size={16} />}
              label={t("NSFW 自动模糊")}
              onChange={setBlurNsfwImagesDraft}
            />
            <div className="h-px bg-border" />
            <NsfwSpeedPicker
              disabled={isBusy}
              flat
              value={nsfwGradingSpeedDraft}
              onChange={setNsfwGradingSpeedDraft}
            />
            <div className="h-px bg-border" />
            <NsfwDetectionModePicker
              disabled={isBusy}
              flat
              value={nsfwDetectionModeDraft}
              onChange={setNsfwDetectionModeDraft}
            />
            <div className="h-px bg-border" />
            <section data-feature-guide="nsfw-batch-actions" className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("批量分级")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-8 px-2.5 py-1.5 text-xs"
                  disabled={isBusy}
                  icon={<Play size={14} />}
                  variant="secondary"
                  onClick={() => onGradeAllNsfw()}
                >
                  {t("补充分级")}
                </Button>
                <Button
                  className="min-h-8 px-2.5 py-1.5 text-xs"
                  disabled={isBusy}
                  icon={<RefreshCw size={14} />}
                  variant="ghost"
                  onClick={() => onGradeAllNsfw({ force: true })}
                >
                  {t("重新校正")}
                </Button>
              </div>
            </section>
          </div>

          {nsfwDetectionModeDraft !== "local-only" ? (
            <section className="overflow-hidden rounded-md border border-border bg-background min-[1120px]:col-start-1 min-[1120px]:row-start-2">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-3 min-[640px]:px-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t("AI 检测引擎")}</p>
              </div>
              <Button
                className="min-h-8 px-2.5 py-1.5 text-xs"
                icon={<X size={14} />}
                variant="ghost"
                onClick={resetNsfwActionPreference}
              >
                {t("重置")}
              </Button>
            </div>

            <div className="grid min-h-[18rem] min-[760px]:grid-cols-[minmax(248px,0.92fr)_minmax(0,1.08fr)]">
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 min-[640px]:p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("① 选择 AI 服务")}</p>
                </div>
                <div className="grid max-h-72 content-start gap-2 overflow-y-auto pr-1">
                  {nsfwActionProfiles.length > 0 ? (
                    nsfwActionProfiles.map((profile) => {
                      const selected = profile.id === nsfwActionProfile?.id;
                      const status = resolveNsfwApiStatus(profile);
                      const visionModelCount = profile.models.filter((model) =>
                        model.capabilities.includes(nsfwActionMeta.capability),
                      ).length;

                      return (
                        <button
                          aria-pressed={selected}
                          className={`grid min-h-16 gap-1.5 rounded-md border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
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
                            <span className="truncate text-sm font-semibold">{profile.name || t("未命名 API")}</span>
                            <span
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-panel"
                              }`}
                            >
                              {selected ? <Check size={12} /> : null}
                            </span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span>{t("{count} 个模型", { count: profile.models.length })}</span>
                            <span>{t("{count} 个 Vision", { count: visionModelCount })}</span>
                            <span className="flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5">
                              <span className={`size-1.5 rounded-full ${getNsfwStatusDotClass(status)}`} />
                              {t(status)}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <p className="rounded-md border border-border bg-background px-3 py-4 text-xs text-muted">
                      {t("暂无 API")}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3 border-t border-border p-3 min-[640px]:p-4 min-[760px]:border-l min-[760px]:border-t-0">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("② 选择图片理解模型")}</p>
                </div>
                <label className="relative block">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted"
                  />
                  <TextField
                    aria-label={t("搜索图片理解模型")}
                    className="h-10 rounded-md pl-10 pr-3"
                    placeholder={t("搜索模型...")}
                    value={modelSearchDraft}
                    onChange={(event) => setModelSearchDraft(event.target.value)}
                  />
                </label>
                <div
                  aria-label={t("选择图片理解模型")}
                  className="grid max-h-72 content-start gap-1 overflow-y-auto pr-1"
                  role="radiogroup"
                >
                  {visibleNsfwActionModels.length > 0 ? (
                    visibleNsfwActionModels.map((model) => {
                      const selected = model.id === nsfwActionModel?.id;

                      return (
                        <button
                          aria-checked={selected}
                          className={`grid min-h-10 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md border px-3 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                            selected
                              ? "border-primary bg-primary-soft text-foreground shadow-sm"
                              : "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground"
                          }`}
                          key={model.id}
                          role="radio"
                          type="button"
                          onClick={() =>
                            patchNsfwActionPreference({
                              profileId: nsfwActionProfile?.id,
                              modelId: model.id,
                            })
                          }
                        >
                          <span
                            className={`flex size-4 items-center justify-center rounded-full border ${
                              selected ? "border-primary" : "border-muted"
                            }`}
                          >
                            <span className={`size-2 rounded-full ${selected ? "bg-primary" : "bg-transparent"}`} />
                          </span>
                          <span className="truncate text-sm font-semibold">{model.label || model.id}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div
                      className={`rounded-md border px-3 py-4 text-xs leading-5 ${
                        nsfwActionModels.length > 0
                          ? "border-border bg-background text-muted"
                          : "border-warning/35 bg-warning/10 text-foreground"
                      }`}
                    >
                      {nsfwActionModels.length > 0 ? (
                        t("没有匹配的模型。")
                      ) : (
                        <>
                          <p className="font-medium">{t("当前服务商没有支持图片理解的模型。")}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </section>
          ) : null}

        <div className="grid gap-3 rounded-md border border-border bg-background px-3 py-3 min-[640px]:px-4 min-[640px]:py-4 min-[1120px]:col-start-2 min-[1120px]:row-start-1 min-[1120px]:row-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{t("检测规则")}</p>
              <p className="mt-1 text-xs text-muted">
                {nsfwActionHasCustomRules ? t("仅使用已勾选规则。") : t("未勾选时使用内置规则。")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-foreground">
                {selectedRuleCount > 0 ? t("已启用 {selected}/{total}", { selected: selectedRuleCount, total: nsfwActionRules.length }) : t("默认规则")}
              </span>
              <Button
                className="min-h-9 px-2.5 py-1.5 text-xs"
                disabled={!nsfwActionHasCustomRules}
                icon={<X size={14} />}
                variant="ghost"
                onClick={clearNsfwRules}
              >
                {t("取消全部选择")}
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-panel">
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="grid grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_112px] border-b border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">
                  <span>{t("规则")}</span>
                  <span>{t("摘要")}</span>
                  <span className="text-center">{t("操作")}</span>
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
                                aria-label={t("{action}规则 {label}", { action: selected ? t("停用") : t("启用"), label: rule.label })}
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
                                  {selected ? t("已启用") : t("未启用")}
                                </span>
                              </span>
                            </span>
                            <button
                              aria-label={t("{action}规则 {label}详情", { action: expanded ? t("收起") : t("展开"), label: rule.label })}
                              className="min-w-0 pr-3 text-left text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                              type="button"
                              onClick={() => setExpandedRuleId(expanded ? null : rule.id)}
                            >
                              <span className="block truncate">{summarizeRuleInstructions(rule.instructions)}</span>
                            </button>
                            <span className="flex items-center justify-center gap-1">
                              <button
                                aria-label={t("{action}规则 {label}详情", { action: expanded ? t("收起") : t("展开"), label: rule.label })}
                                className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                                type="button"
                                onClick={() => setExpandedRuleId(expanded ? null : rule.id)}
                              >
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <button
                                aria-label={t("编辑规则 {label}", { label: rule.label })}
                                className="flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                                type="button"
                                onClick={() => editRule(rule)}
                              >
                                <Pencil size={14} />
                              </button>
                              <IconTooltipButton
                                ariaLabel={t("删除规则 {label}", { label: rule.label })}
                                icon={<Trash2 size={14} />}
                                label={t("删除规则 {label}", { label: rule.label })}
                                size="sm"
                                variant="danger"
                                onClick={() => deleteRule(rule.id)}
                              />
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
                    <p className="px-3 py-6 text-center text-xs text-muted">{t("当前没有可用规则。")}</p>
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
                    {ruleEditor.editingRuleId ? t("编辑规则") : t("新建规则")}
                  </p>
                </div>
                <Button
                  className="min-h-8 px-2 py-1 text-xs"
                  icon={<X size={13} />}
                  variant="ghost"
                  onClick={closeRuleEditor}
                >
                  {ruleEditor.editingRuleId ? t("取消编辑") : t("收起")}
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
                  <span className="font-semibold">{t("新建规则")}</span>
                </span>
                <span className="text-xs text-muted">{t("默认收起，需要时再添加")}</span>
              </button>
            )}

            {isRuleEditorOpen ? (
              <div className="grid gap-3 border-t border-border p-3">
                <label className="grid gap-2 text-xs font-medium text-muted">
                  {t("规则名称")}
                  <TextField
                    placeholder={t("例如：严格安全分级")}
                    value={ruleEditor.label}
                    onChange={(event) => setRuleEditor((current) => ({ ...current, label: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2 text-xs font-medium text-muted">
                  {t("规则内容")}
                  <TextArea
                    aria-label={t("NSFW 分级规则内容")}
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
                    className="min-h-8 px-2.5 py-1.5 text-xs"
                    disabled={!ruleEditor.label.trim() || !ruleEditor.instructions.trim()}
                    icon={<Check size={14} />}
                    variant="primary"
                    onClick={saveRule}
                  >
                    {ruleEditor.editingRuleId ? t("保存规则") : t("添加规则")}
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>
        {feedbackText ? (
          <p className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-muted">{feedbackText}</p>
        ) : null}
      </div>

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
  flat?: boolean;
  value: NsfwGradingSpeed;
  onChange: (value: NsfwGradingSpeed) => void;
};

function NsfwSpeedPicker({ disabled, flat, value, onChange }: NsfwSpeedPickerProps) {
  const { t } = useLocale();
  return (
    <div className={flat ? "px-1 py-2.5" : "rounded-md border border-border bg-background px-3 py-3 min-[640px]:px-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("分级速度")}</p>
        </div>
        </div>
        <div aria-label={t("选择 NSFW 分级速度")} className="grid grid-cols-3 gap-1.5 min-[520px]:gap-2" role="radiogroup">
          {nsfwGradingSpeedOptions.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                aria-checked={isSelected}
                className={`min-w-0 rounded-lg border px-2 py-2 text-left text-xs transition-all hover:-translate-y-0.5 hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-50 min-[520px]:min-w-20 min-[520px]:px-3 ${
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
                <span className="mt-1 block leading-4">{option.concurrency} {t("路")}</span>
              </button>
            );
          })}
        </div>
    </div>
  );
}

type NsfwDetectionModePickerProps = {
  disabled: boolean;
  flat?: boolean;
  value: NsfwDetectionMode;
  onChange: (value: NsfwDetectionMode) => void;
};

function NsfwDetectionModePicker({ disabled, flat, value, onChange }: NsfwDetectionModePickerProps) {
  const { t } = useLocale();
  return (
    <label className={flat ? "grid gap-2 px-1 py-2.5" : "grid gap-2 rounded-md border border-border bg-background px-3 py-3"}>
      <span>
        <span className="block text-sm font-semibold text-foreground">{t("分级方式")}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {t("本地模块安装后优先使用；本地失败时可回退已配置的远程视觉模型。")}
        </span>
      </span>
      <select
        aria-label={t("选择 NSFW 分级方式")}
        className="min-h-9 rounded-md border border-border bg-panel px-2 text-sm text-foreground"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as NsfwDetectionMode)}
      >
        <option value="local-first">{t("本地优先，失败时回退远程")}</option>
        <option value="remote-only">{t("仅使用远程视觉模型")}</option>
        <option value="local-only">{t("仅使用本地模块")}</option>
      </select>
    </label>
  );
}

type NsfwSettingRowProps = {
  checked: boolean;
  description: string;
  flat?: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
};

function NsfwSettingRow({ checked, description, flat, icon, label, onChange }: NsfwSettingRowProps) {
  return (
    <label
      className={`flex min-h-14 items-center justify-between gap-3 min-[640px]:gap-4 ${
        flat ? "px-1 py-2.5" : "rounded-md border border-border bg-background px-3 py-3 min-[640px]:px-4"
      }`}
    >
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
