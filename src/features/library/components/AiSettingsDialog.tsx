import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  ImageIcon,
  Key,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import type {
  AiActionPreference,
  AiFeatureAction,
  AiProviderModelCapability,
  AiProviderModelSettings,
  AiRulePreset,
  PublicAiProviderProfile,
  PublicAiProviderSettings,
  SaveAiProviderProfilePayload,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import {
  aiFeatureActionMeta,
  normalizeAiRulePresetIds,
} from "../types/ai";
import {
  normalizeActionPreferenceDraft,
  normalizeActionPreferencesDraft,
  resolveActionRulesForDraft,
} from "../utils/aiSettingsDraft";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";

type AiSettingsDialogProps = {
  isBusy: boolean;
  settings: PublicAiProviderSettings;
  onClose: () => void;
  onSave: (settings: SaveAiProviderSettingsPayload) => Promise<boolean>;
  onTest: (settings: SaveAiProviderSettingsPayload) => Promise<{ message: string; ok: boolean }>;
  onListModels: (settings: SaveAiProviderSettingsPayload) => Promise<AiProviderModelSettings[] | null>;
  onCopyApiKey: (profileId: string, draftApiKey?: string) => Promise<boolean>;
  onNotify?: (message: StatusFeedbackMessage) => void;
};

type AiProviderProfileDraft = {
  id: string;
  name: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  models: AiProviderModelSettings[];
  hasApiKey: boolean;
  apiKeyPreview: string;
  apiKey: string;
  clearApiKey: boolean;
};

type ModelPickerState = {
  profileId: string;
  query: string;
  models: AiProviderModelSettings[];
  selectedModelIds: string[];
};

type RuleEditorState = {
  editingRuleId: string | null;
  instructions: string;
  label: string;
};

type AiSettingsActionEntry = {
  actions: readonly [AiFeatureAction, ...AiFeatureAction[]];
  description?: string;
  id: string;
  label?: string;
};

const aiSettingsActionEntries: readonly AiSettingsActionEntry[] = [
  { id: "prompt", actions: ["prompt"] },
  {
    id: "category-recognition",
    label: "分类识别",
    description: "分类识别可分别配置文本/图片来源。",
    actions: ["prompt-category", "image-category"],
  },
  {
    id: "tag-recognition",
    label: "标签识别",
    description: "标签识别可分别配置文本/图片来源。",
    actions: ["prompt-tags", "image-tags"],
  },
  { id: "prompt-options", actions: ["prompt-options"] },
  { id: "prompt-optimization", actions: ["prompt-optimization"] },
  { id: "prompt-translation", actions: ["prompt-translation"] },
  { id: "image-reverse", actions: ["image-reverse"] },
];

export function AiSettingsDialog({
  isBusy,
  settings,
  onClose,
  onSave,
  onTest,
  onListModels,
  onCopyApiKey,
  onNotify,
}: AiSettingsDialogProps) {
  const [profiles, setProfiles] = useState<AiProviderProfileDraft[]>(() => createProfileDrafts(settings));
  const [activeProfileId, setActiveProfileId] = useState(settings.activeProfileId);
  const [selectedProfileId, setSelectedProfileId] = useState(settings.activeProfileId);
  const [feedbackText, setFeedbackText] = useState("");
  const [actionPreferences, setActionPreferences] = useState<Partial<Record<AiFeatureAction, AiActionPreference>>>(
    () => settings.actionPreferences,
  );
  const [selectedAction, setSelectedAction] = useState<AiFeatureAction>("image-reverse");
  const [ruleEditor, setRuleEditor] = useState<RuleEditorState>({ editingRuleId: null, instructions: "", label: "" });
  const [manualModelDraft, setManualModelDraft] = useState("");
  const [modelPicker, setModelPicker] = useState<ModelPickerState | null>(null);
  const [isTestingAllProfiles, setIsTestingAllProfiles] = useState(false);
  const [deleteConfirmProfileId, setDeleteConfirmProfileId] = useState<string | null>(null);
  const [clearConfirmProfileId, setClearConfirmProfileId] = useState<string | null>(null);
  const [profileActionsMenuId, setProfileActionsMenuId] = useState<string | null>(null);
  const deleteActionRef = useRef<HTMLDivElement | null>(null);
  const clearActionRef = useRef<HTMLDivElement | null>(null);
  const profileActionsRef = useRef<HTMLDivElement | null>(null);
  const profileListRef = useRef<HTMLDivElement | null>(null);
  const profileDetailScrollRef = useRef<HTMLDivElement | null>(null);

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
    const nextProfiles = createProfileDrafts(settings);

    setProfiles(nextProfiles);
    setActiveProfileId(settings.activeProfileId);
    setActionPreferences(settings.actionPreferences);
    setSelectedProfileId(resolveSelectedProfileId(settings.activeProfileId, nextProfiles));
    setFeedbackText("");
    setManualModelDraft("");
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setModelPicker(null);
    setIsTestingAllProfiles(false);
    setDeleteConfirmProfileId(null);
    setClearConfirmProfileId(null);
    setProfileActionsMenuId(null);
  }, [
    settings.activeProfileId,
    settings.baseUrl,
    settings.enabled,
    settings.hasApiKey,
    settings.apiKeyPreview,
    settings.model,
    settings.profiles,
    settings.actionPreferences,
  ]);

  useEffect(() => {
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
  }, [selectedAction]);

  useEffect(() => {
    if (!deleteConfirmProfileId && !clearConfirmProfileId && !profileActionsMenuId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        deleteActionRef.current?.contains(target) ||
        clearActionRef.current?.contains(target) ||
        profileActionsRef.current?.contains(target)
      ) {
        return;
      }

      setDeleteConfirmProfileId(null);
      setClearConfirmProfileId(null);
      setProfileActionsMenuId(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeleteConfirmProfileId(null);
        setClearConfirmProfileId(null);
        setProfileActionsMenuId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearConfirmProfileId, deleteConfirmProfileId, profileActionsMenuId]);

  useEffect(() => {
    const selectedProfileButton = profileListRef.current?.querySelector('[data-ai-profile-active="true"]');
    selectedProfileButton?.scrollIntoView({ block: "center" });
    profileDetailScrollRef.current?.scrollTo({ top: 0 });
    setProfileActionsMenuId(null);
    setDeleteConfirmProfileId(null);
    setClearConfirmProfileId(null);
  }, [selectedProfileId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0],
    [profiles, selectedProfileId],
  );
  const selectedApiKeyState = selectedProfile ? resolveDraftApiKeyState(selectedProfile) : null;
  const selectedApiKeyPreview = selectedProfile ? resolveDraftApiKeyPreview(selectedProfile) : "";
  const canCopySelectedApiKey = selectedProfile
    ? Boolean(selectedProfile.apiKey.trim() || (!selectedProfile.clearApiKey && selectedProfile.hasApiKey))
    : false;
  const hasCompleteConnection = selectedProfile
    ? Boolean(selectedProfile.baseUrl.trim() && selectedProfile.model.trim() && selectedApiKeyState?.willHaveApiKey)
    : false;
  const canTestSelectedProfile = selectedProfile ? canTestProfile(selectedProfile) : false;
  const testableProfileCount = profiles.filter(canTestProfile).length;
  const canSaveSettings = profiles.length > 0 && profiles.every((profile) => !profile.enabled || isProfileComplete(profile));
  const payload = buildPayload({ actionPreferences, activeProfileId, profiles });
  const selectedActionMeta = aiFeatureActionMeta[selectedAction];
  const selectedActionEntry = resolveAiSettingsActionEntry(selectedAction);
  const selectedActionEntryLabel = getAiSettingsActionEntryLabel(selectedActionEntry);
  const selectedActionEntryDescription = getAiSettingsActionEntryDescription(selectedActionEntry);
  const selectedActionEntryHasSources = selectedActionEntry.actions.length > 1;
  const selectedActionPreference = normalizeActionPreferenceDraft(
    actionPreferences[selectedAction],
    profiles,
    activeProfileId,
    selectedAction,
  );
  const selectedActionProfile =
    profiles.find((profile) => profile.id === selectedActionPreference.profileId) ?? selectedProfile ?? profiles[0];
  const selectedActionModels = selectedActionProfile
    ? selectedActionProfile.models.filter((model) => model.capabilities.includes(selectedActionMeta.capability))
    : [];
  const selectedActionModel =
    selectedActionModels.find((model) => model.id === selectedActionPreference.modelId) ?? selectedActionModels[0];
  const selectedActionCustomInstructions = actionPreferences[selectedAction]?.customInstructions ?? "";
  const selectedActionRules = resolveActionRulesForDraft(selectedAction, actionPreferences[selectedAction]);
  const selectedActionRulePresetIds = normalizeAiRulePresetIds(
    selectedAction,
    actionPreferences[selectedAction]?.rulePresetIds,
    selectedActionRules,
  );
  const selectedActionHasCustomRules =
    selectedActionRulePresetIds.length > 0 || Boolean(selectedActionCustomInstructions.trim());
  const isEditingRule = Boolean(ruleEditor.editingRuleId);

  async function handleSave() {
    setFeedbackText("正在保存设置...");
    const isSaved = await onSave(payload);

    setFeedbackText(isSaved ? "API 设置已保存。" : "API 设置保存失败。");

    if (isSaved) {
      setProfiles((currentProfiles) =>
        currentProfiles.map((profile) => ({
          ...profile,
          hasApiKey: Boolean(profile.apiKey.trim()) || (!profile.clearApiKey && profile.hasApiKey),
          apiKeyPreview: resolveSavedApiKeyPreviewAfterSave(profile),
          apiKey: "",
          clearApiKey: false,
        })),
      );
    }
  }

  async function handleCopyApiKey() {
    if (!selectedProfile || !canCopySelectedApiKey) {
      return;
    }

    setFeedbackText("正在复制 API Key...");
    const copied = await onCopyApiKey(selectedProfile.id, selectedProfile.apiKey);

    setFeedbackText(copied ? "API Key 已复制。" : "API Key 复制失败。");
  }

  async function handleTest() {
    if (!selectedProfile) {
      return;
    }

    setFeedbackText(`正在测试 ${selectedProfile.name || "当前 API"}...`);
    const result = await onTest(
      buildConnectionTestPayload({
        actionPreferences,
        activeProfileId,
        profileId: selectedProfile.id,
        profiles,
      }),
    );

    if (result.ok) {
      patchProfile(selectedProfile.id, { enabled: true });
      setFeedbackText("连接成功，已自动启用该 API。");
      return;
    }

    patchProfile(selectedProfile.id, { enabled: false });
    setFeedbackText(`连接失败：${result.message} 已自动停用该 API。`);
  }

  async function handleTestAllProfiles() {
    if (isTestingAllProfiles) {
      return;
    }

    const testTargets = profiles.filter(canTestProfile);

    if (testTargets.length === 0) {
      setFeedbackText("请先补全地址、模型和 API Key。");
      return;
    }

    setIsTestingAllProfiles(true);
    setFeedbackText(`正在测试全部 API（0/${testTargets.length}）...`);

    const failedIds = new Set<string>();
    const succeededIds = new Set<string>();
    const failureMessages: string[] = [];
    let successCount = 0;

    try {
      for (let index = 0; index < testTargets.length; index += 1) {
        const profile = testTargets[index];
        const profileName = profile.name || "未命名 API";

        setFeedbackText(`正在测试 ${profileName}（${index + 1}/${testTargets.length}）...`);
        const result = await onTest(
          buildConnectionTestPayload({
            actionPreferences,
            activeProfileId,
            profileId: profile.id,
            profiles,
          }),
        );

        if (result.ok) {
          succeededIds.add(profile.id);
          successCount += 1;
        } else {
          failedIds.add(profile.id);
          failureMessages.push(`${profileName}：${result.message}`);
        }
      }

      if (succeededIds.size > 0 || failedIds.size > 0) {
        setProfiles((currentProfiles) =>
          currentProfiles.map((profile) => {
            if (succeededIds.has(profile.id)) {
              return { ...profile, enabled: true };
            }

            if (failedIds.has(profile.id)) {
              return { ...profile, enabled: false };
            }

            return profile;
          }),
        );
      }

      const skippedCount = profiles.length - testTargets.length;
      const skippedText = skippedCount > 0 ? `，跳过 ${skippedCount} 个未完善` : "";

      if (failedIds.size === 0) {
        setFeedbackText(`可测 API 全部连接成功${skippedText}，已启用。`);
        return;
      }

      const failureText = failureMessages.length > 0 ? `失败原因：${failureMessages.join("；")}` : "";

      setFeedbackText(
        `测试完成：成功 ${successCount}，失败 ${failedIds.size}${skippedText}。成功已启用，失败已停用。${failureText}`,
      );
    } finally {
      setIsTestingAllProfiles(false);
    }
  }

  async function handleListModels() {
    if (!selectedProfile) {
      return;
    }

    const queryPayload = buildModelQueryPayload({ profiles, selectedProfileId: selectedProfile.id });

    setFeedbackText(`正在查询 ${selectedProfile.name || "当前 API"} 的模型...`);
    const models = await onListModels(queryPayload);

    if (!models) {
      setFeedbackText("模型查询失败。");
      return;
    }

    setModelPicker({
      profileId: selectedProfile.id,
      query: "",
      models,
      selectedModelIds: selectedProfile.models.map((model) => model.id),
    });
    setFeedbackText(`已查询到 ${models.length} 个模型。`);
  }

  function addManualModel() {
    if (!selectedProfile) {
      return;
    }

    const modelId = manualModelDraft.trim();

    if (!modelId) {
      return;
    }

    const nextModels = addUniqueModels(selectedProfile.models, [
      {
        id: modelId,
        label: modelId,
        capabilities: ["text"],
      },
    ]);

    patchProfile(selectedProfile.id, {
      model: selectedProfile.model || modelId,
      models: nextModels,
    });
    setManualModelDraft("");
  }

  function removeModel(profileId: string, modelId: string) {
    const profile = profiles.find((item) => item.id === profileId);

    if (!profile || profile.models.length <= 1) {
      return;
    }

    const nextModels = profile.models.filter((model) => model.id !== modelId);

    patchProfile(profileId, {
      model: profile.model === modelId ? nextModels[0].id : profile.model,
      models: nextModels,
    });
  }

  function toggleModelCapability(profileId: string, modelId: string, capability: AiProviderModelCapability) {
    const profile = profiles.find((item) => item.id === profileId);

    if (!profile) {
      return;
    }

    patchProfile(profileId, {
      models: profile.models.map((model) =>
        model.id === modelId
          ? {
              ...model,
              capabilities: toggleCapability(model.capabilities, capability),
            }
          : model,
      ),
    });
  }

  function confirmModelPicker() {
    if (!modelPicker) {
      return;
    }

    const profile = profiles.find((item) => item.id === modelPicker.profileId);

    if (!profile) {
      setModelPicker(null);
      return;
    }

    const selectedModels = modelPicker.models.filter((model) => modelPicker.selectedModelIds.includes(model.id));
    const nextModels = addUniqueModels(profile.models, selectedModels);

    patchProfile(profile.id, {
      model: nextModels.some((model) => model.id === profile.model) ? profile.model : nextModels[0]?.id || profile.model,
      models: nextModels,
    });
    setModelPicker(null);
  }

  function addProfile() {
    const nextProfile = createNewProfileDraft(profiles.length);

    setProfiles((currentProfiles) => [...currentProfiles, nextProfile]);
    setSelectedProfileId(nextProfile.id);
    setActiveProfileId((currentActiveProfileId) => currentActiveProfileId || nextProfile.id);
    setFeedbackText("");
  }

  function deleteProfile(profileId: string) {
    if (profiles.length <= 1) {
      return;
    }

    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    const nextSelectedProfileId = resolveSelectedProfileId(selectedProfileId, nextProfiles);

    setProfiles(nextProfiles);
    setSelectedProfileId(nextSelectedProfileId);
    setActiveProfileId((currentActiveProfileId) =>
      currentActiveProfileId === profileId ? nextProfiles[0].id : currentActiveProfileId,
    );
    setProfileActionsMenuId(null);
    setDeleteConfirmProfileId(null);
    setFeedbackText("");
  }

  function patchProfile(profileId: string, patch: Partial<AiProviderProfileDraft>) {
    setProfiles((currentProfiles) =>
      currentProfiles.map((profile) => (profile.id === profileId ? { ...profile, ...patch } : profile)),
    );
    setFeedbackText("");
  }

  function patchActionPreference(action: AiFeatureAction, patch: AiActionPreference) {
    setActionPreferences((currentPreferences) => ({
      ...currentPreferences,
      [action]: normalizeActionPreferenceDraft(
        {
          ...currentPreferences[action],
          ...patch,
        },
        profiles,
        activeProfileId,
        action,
      ),
    }));
    setFeedbackText("");
  }

  function resetActionPreference(action: AiFeatureAction) {
    setActionPreferences((currentPreferences) => {
      const nextPreferences = { ...currentPreferences };
      delete nextPreferences[action];
      return nextPreferences;
    });
    setFeedbackText("");
  }

  function toggleRuleSelection(action: AiFeatureAction, ruleId: string) {
    const rules = resolveActionRulesForDraft(action, actionPreferences[action]);
    const currentPresetIds = normalizeAiRulePresetIds(action, actionPreferences[action]?.rulePresetIds, rules);
    const nextPresetIds = currentPresetIds.includes(ruleId)
      ? currentPresetIds.filter((id) => id !== ruleId)
      : [...currentPresetIds, ruleId];

    patchActionPreference(action, {
      customInstructions: "",
      rules,
      rulePresetIds: nextPresetIds,
    });
    setFeedbackText("规则选择已更新，保存后生效。");
  }

  function clearActionRules(action: AiFeatureAction) {
    patchActionPreference(action, {
      customInstructions: "",
      rules: resolveActionRulesForDraft(action, actionPreferences[action]),
      rulePresetIds: [],
    });
    setFeedbackText("当前功能规则选择已清空，保存后生效。");
  }

  function editRule(rule: AiRulePreset) {
    setRuleEditor({
      editingRuleId: rule.id,
      instructions: rule.instructions,
      label: rule.label,
    });
  }

  function saveRule(action: AiFeatureAction) {
    const label = ruleEditor.label.trim();
    const instructions = ruleEditor.instructions.trim();

    if (!label || !instructions) {
      setFeedbackText("请先填写规则名称和规则内容。");
      return;
    }

    const rules = resolveActionRulesForDraft(action, actionPreferences[action]);
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
    const currentPresetIds = normalizeAiRulePresetIds(action, actionPreferences[action]?.rulePresetIds, nextRules);
    const nextPresetIds = currentPresetIds.includes(ruleId) ? currentPresetIds : [...currentPresetIds, ruleId];

    patchActionPreference(action, {
      customInstructions: "",
      rules: nextRules,
      rulePresetIds: nextPresetIds,
    });
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setFeedbackText(editingRuleId ? "规则已更新，保存后生效。" : "规则已新增，保存后生效。");
  }

  function deleteRule(action: AiFeatureAction, ruleId: string) {
    const rules = resolveActionRulesForDraft(action, actionPreferences[action]);
    const nextRules = rules.filter((rule) => rule.id !== ruleId);
    const nextPresetIds = normalizeAiRulePresetIds(action, actionPreferences[action]?.rulePresetIds, nextRules);

    patchActionPreference(action, {
      customInstructions: "",
      rules: nextRules,
      rulePresetIds: nextPresetIds.filter((id) => id !== ruleId),
    });

    if (ruleEditor.editingRuleId === ruleId) {
      setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    }

    setFeedbackText("规则已删除，保存后生效。");
  }

  return (
    <AppDialog panelClassName="flex max-h-[92vh] w-full max-w-6xl flex-col" titleId="ai-settings-title" onClose={onClose}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-foreground">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id="ai-settings-title">
              模型配置
            </h2>
            <p className="mt-1 text-sm text-muted">管理接口与 AI 操作配置</p>
          </div>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div
        ref={profileDetailScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 scroll-pb-6"
      >
        <section className="grid gap-4 pb-4">
          <div className="rounded-md border border-border bg-background p-4">
            <div className="grid gap-4 min-[960px]:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="flex min-h-0 flex-col border-b border-border pb-4 min-[960px]:border-b-0 min-[960px]:border-r min-[960px]:pb-0 min-[960px]:pr-4">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">AI 连接</p>
                    <p className="mt-0.5 text-xs text-muted">服务商与兼容接口</p>
                  </div>
                  <button
                    aria-label="新增 AI 连接"
                    className="flex size-8 items-center justify-center rounded-full border border-border bg-panel text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                    disabled={isBusy}
                    type="button"
                    onClick={addProfile}
                  >
                    <Plus size={15} />
                  </button>
                </div>
                <div
                  ref={profileListRef}
                  className="grid min-h-0 flex-1 auto-rows-max gap-1.5 overflow-y-auto overscroll-contain pr-1"
                >
                  {profiles.map((profile) => {
                    const isSelected = profile.id === selectedProfile?.id;
                    const keyState = resolveDraftApiKeyState(profile);
                    const isReady = profile.enabled && isProfileComplete(profile);

                    return (
                      <button
                        className={`grid min-h-16 gap-1 rounded-md border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                          isSelected
                            ? "border-primary bg-primary-soft text-foreground"
                            : "border-transparent bg-transparent text-muted hover:bg-panel hover:text-foreground"
                        }`}
                        data-ai-profile-active={isSelected ? "true" : undefined}
                        key={profile.id}
                        type="button"
                        onClick={() => setSelectedProfileId(profile.id)}
                      >
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{profile.name || "未命名 API"}</span>
                          {profile.id === activeProfileId ? <Star className="shrink-0 text-primary" size={13} /> : null}
                        </span>
                        <span className="flex min-w-0 items-center gap-2 text-[11px]">
                          <span
                            className={`size-2 shrink-0 rounded-full ${
                              isReady ? "bg-progress" : profile.enabled ? "bg-warning" : "bg-border"
                            }`}
                          />
                          <span className={isReady ? "text-progress" : "text-muted"}>
                            {isReady ? "可用" : profile.enabled ? "待完善" : "已停用"}
                          </span>
                          <span className="truncate">{keyState.willHaveApiKey ? profile.model : "未配置密钥"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <Button
                    className="w-full"
                    disabled={isBusy || isTestingAllProfiles || testableProfileCount === 0}
                    icon={<Wifi size={16} />}
                    title={testableProfileCount === 0 ? "请先补全接口地址、模型和 API Key" : undefined}
                    onClick={() => void handleTestAllProfiles()}
                  >
                    {isTestingAllProfiles ? "正在测试全部 API" : "测试全部 API"}
                  </Button>
                </div>
              </aside>

              {selectedProfile ? (
                <div className="grid min-w-0 gap-4">
                  <section className="grid gap-3 rounded-md border border-border bg-panel p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">当前连接</p>
                        <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
                          {selectedProfile.name || "未命名 API"}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span className="rounded-full border border-border bg-background px-2.5 py-1">OpenAI 兼容 API</span>
                          <span className="rounded-full border border-border bg-background px-2.5 py-1">
                            {selectedProfile.model || "未选择模型"}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
                            <span
                              className={`size-2 rounded-full ${
                                selectedProfile.enabled && hasCompleteConnection
                                  ? "bg-progress"
                                  : selectedProfile.enabled
                                    ? "bg-warning"
                                    : "bg-border"
                              }`}
                            />
                            {selectedProfile.enabled && hasCompleteConnection
                              ? "运行正常"
                              : selectedProfile.enabled
                                ? "需要补全"
                                : "已停用"}
                          </span>
                          {selectedProfile.id === activeProfileId ? (
                            <span className="rounded-full border border-primary bg-primary-soft px-2.5 py-1 text-foreground">
                              默认连接
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className="flex shrink-0 items-center gap-2"
                        ref={(node) => {
                          profileActionsRef.current = node;
                          deleteActionRef.current = node;
                        }}
                      >
                        <Button
                          className="shrink-0"
                          disabled={isBusy || isTestingAllProfiles || !selectedProfile || !canTestSelectedProfile}
                          icon={<Wifi size={16} />}
                          onClick={() => void handleTest()}
                        >
                          测试当前 API
                        </Button>
                        <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground">
                          <span>{selectedProfile.enabled ? "已启用" : "已停用"}</span>
                          <span className="relative inline-flex h-6 w-11 items-center">
                            <input
                              aria-label="启用这个 API"
                              checked={selectedProfile.enabled}
                              className="peer sr-only"
                              type="checkbox"
                              onChange={(event) => patchProfile(selectedProfile.id, { enabled: event.target.checked })}
                            />
                            <span className="h-6 w-11 rounded-full border border-border bg-border transition-colors peer-checked:border-primary peer-checked:bg-primary" />
                            <span className="absolute left-1 size-4 rounded-full bg-panel shadow-sm transition-transform peer-checked:translate-x-5" />
                          </span>
                        </label>

                        <div className="relative">
                          <button
                            aria-expanded={profileActionsMenuId === selectedProfile.id}
                            aria-label="更多 API 操作"
                            className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted outline-none transition-colors hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                            disabled={isBusy}
                            type="button"
                            onClick={() =>
                              setProfileActionsMenuId((currentId) =>
                                currentId === selectedProfile.id ? null : selectedProfile.id,
                              )
                            }
                          >
                            <MoreHorizontal size={17} />
                          </button>

                          {profileActionsMenuId === selectedProfile.id ? (
                            <div className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-panel py-1 text-sm shadow-elevated">
                              <button
                                className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-foreground outline-none transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={selectedProfile.id === activeProfileId}
                                type="button"
                                onClick={() => {
                                  setActiveProfileId(selectedProfile.id);
                                  setProfileActionsMenuId(null);
                                }}
                              >
                                <Star size={14} />
                                设为默认
                              </button>
                              <button
                                className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-danger outline-none transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={profiles.length <= 1}
                                type="button"
                                onClick={() => {
                                  setProfileActionsMenuId(null);
                                  setDeleteConfirmProfileId(selectedProfile.id);
                                }}
                              >
                                <Trash2 size={14} />
                                删除连接
                              </button>
                            </div>
                          ) : null}

                          {deleteConfirmProfileId === selectedProfile.id ? (
                            <ConfirmBubble
                              className="right-0 top-full mt-3"
                              confirmLabel="确认删除"
                                  description="删除后不再出现在快速切换中。"
                              icon={<Trash2 size={15} />}
                              isBusy={isBusy}
                              placement="below"
                              title="删除这个 API？"
                              onCancel={() => setDeleteConfirmProfileId(null)}
                              onConfirm={() => deleteProfile(selectedProfile.id)}
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="grid gap-4">
                    <div className="grid gap-3 min-[760px]:grid-cols-2">
                      <label className="grid gap-2 text-sm font-medium text-muted">
                        API 名称
                        <TextField
                          placeholder="例如：OpenAI 主接口"
                          value={selectedProfile.name}
                          onChange={(event) => patchProfile(selectedProfile.id, { name: event.target.value })}
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-medium text-muted">
                        接口地址
                        <TextField
                          placeholder="https://api.openai.com/v1"
                          value={selectedProfile.baseUrl}
                          onChange={(event) => patchProfile(selectedProfile.id, { baseUrl: event.target.value })}
                        />
                      </label>

                      <label className="grid gap-2 text-sm font-medium text-muted min-[760px]:col-span-2">
                        API Key
                        <div className="grid gap-2 min-[680px]:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="grid min-w-0 gap-2 rounded-xl border border-border bg-panel p-2">
                            <div className="flex min-h-9 min-w-0 items-center gap-2 px-2 text-sm">
                              <Key className="size-4 shrink-0 text-muted" />
                              <span className="min-w-0 truncate font-mono text-foreground">
                                {selectedApiKeyPreview || (selectedProfile.clearApiKey ? "保存后清除密钥" : "未配置密钥")}
                              </span>
                              <span className="ml-auto shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-normal text-muted">
                                {selectedApiKeyState?.willHaveApiKey ? "已配置" : "未配置"}
                              </span>
                            </div>
                            <TextField
                              className="h-9 bg-background"
                              placeholder={
                                selectedApiKeyState?.willHaveApiKey ? "输入新 API Key 以替换当前密钥" : "输入 API Key"
                              }
                              type="password"
                              value={selectedProfile.apiKey}
                              onChange={(event) => {
                                patchProfile(selectedProfile.id, {
                                  apiKey: event.target.value,
                                  clearApiKey: event.target.value.trim() ? false : selectedProfile.clearApiKey,
                                });
                              }}
                            />
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 min-[680px]:items-start">
                            <Button
                              disabled={!canCopySelectedApiKey || isBusy}
                              icon={<Copy size={15} />}
                              variant="secondary"
                              onClick={() => void handleCopyApiKey()}
                            >
                              复制
                            </Button>
                            <div className="relative" ref={clearActionRef}>
                              <Button
                                disabled={!selectedProfile.hasApiKey || isBusy}
                                icon={<Trash2 size={15} />}
                                variant="ghost"
                                onClick={() => setClearConfirmProfileId(selectedProfile.id)}
                              >
                                清除
                              </Button>
                              {clearConfirmProfileId === selectedProfile.id ? (
                                <ConfirmBubble
                                  className="right-0 top-full mt-3"
                                  confirmLabel="确认清除"
                                  description="保存后移除已保存密钥。"
                                  icon={<Trash2 size={15} />}
                                  isBusy={isBusy}
                                  placement="below"
                                  title="清除 API Key？"
                                  onCancel={() => setClearConfirmProfileId(null)}
                                  onConfirm={() => {
                                    patchProfile(selectedProfile.id, {
                                      apiKey: "",
                                      apiKeyPreview: "",
                                      clearApiKey: true,
                                      enabled: false,
                                    });
                                    setClearConfirmProfileId(null);
                                  }}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </label>
                    </div>
                  </section>

                  <section className="grid gap-3 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">模型选项</p>
                        <p className="mt-1 text-xs text-muted">文本处理提示词，图片理解用于反推与识别。</p>
                      </div>
                      <Button
                        disabled={isBusy || !canQueryModels(selectedProfile)}
                        icon={<Search size={15} />}
                        variant="secondary"
                        onClick={() => void handleListModels()}
                      >
                        查询模型
                      </Button>
                    </div>

                    <div className="overflow-hidden rounded-md border border-border bg-panel">
                      <div className="overflow-x-auto">
                        <div className="min-w-[620px]">
                          <div className="grid grid-cols-[minmax(220px,1fr)_190px_96px] border-b border-border bg-background px-3 py-2 text-xs font-semibold text-foreground">
                            <span>模型</span>
                            <span>能力</span>
                            <span className="text-center">状态</span>
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {selectedProfile.models.map((model) => (
                              <ModelRow
                                active={model.id === selectedProfile.model}
                                canDelete={selectedProfile.models.length > 1}
                                key={model.id}
                                model={model}
                                onDelete={() => removeModel(selectedProfile.id, model.id)}
                                onSelect={() => patchProfile(selectedProfile.id, { model: model.id })}
                                onToggleCapability={(capability) =>
                                  toggleModelCapability(selectedProfile.id, model.id, capability)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <TextField
                        aria-label="手动添加模型"
                        placeholder="手动输入模型 ID"
                        value={manualModelDraft}
                        onChange={(event) => setManualModelDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addManualModel();
                          }
                        }}
                      />
                      <Button disabled={isBusy || !manualModelDraft.trim()} icon={<Plus size={15} />} onClick={addManualModel}>
                        添加
                      </Button>
                    </div>

                    {modelPicker && modelPicker.profileId === selectedProfile.id ? (
                      <ModelPickerPanel
                        picker={modelPicker}
                        onCancel={() => setModelPicker(null)}
                        onConfirm={confirmModelPicker}
                        onQueryChange={(query) => setModelPicker((current) => (current ? { ...current, query } : current))}
                        onToggleModel={(modelId) =>
                          setModelPicker((current) =>
                            current
                              ? {
                                  ...current,
                                  selectedModelIds: toggleStringSelection(current.selectedModelIds, modelId),
                                }
                              : current,
                          )
                        }
                      />
                    ) : null}
                  </section>
                </div>
              ) : null}
              </div>
          </div>

          {selectedProfile ? (
            <>
              <div className="grid gap-4 rounded-md border border-border bg-background p-4">
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
                  <div className="grid auto-rows-max gap-1">
                    {aiSettingsActionEntries.map((entry) => {
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

                      return (
                        <button
                          className={`grid gap-1 rounded-md border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                            selected
                              ? "border-primary bg-primary-soft text-foreground"
                              : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground"
                          }`}
                          key={entry.id}
                          type="button"
                          onClick={() => setSelectedAction(action)}
                        >
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{entryLabel}</span>
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

                            return (
                              <button
                                aria-pressed={selected}
                                className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                                  selected
                                    ? "border-primary bg-primary-soft text-foreground"
                                    : "border-border bg-panel text-muted hover:bg-primary-soft hover:text-foreground"
                                }`}
                                key={action}
                                type="button"
                                onClick={() => setSelectedAction(action)}
                              >
                                {aiFeatureActionMeta[action].capability === "vision" ? (
                                  <ImageIcon size={14} />
                                ) : (
                                  <FileText size={14} />
                                )}
                                <span>{getAiActionSourceLabel(action)}</span>
                                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
                                  {getAiActionCapabilityLabel(action)}
                                </span>
                              </button>
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
                            <option value="">没有可用{selectedActionMeta.capability === "vision" ? "图片" : "文本"}模型</option>
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

                      <div className="grid gap-3 rounded-md border border-border bg-panel p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground">
                            {isEditingRule ? "编辑规则" : "新增规则"}
                          </p>
                          {isEditingRule ? (
                            <Button
                              className="min-h-8 px-2 py-1 text-xs"
                              icon={<X size={13} />}
                              variant="ghost"
                              onClick={() => setRuleEditor({ editingRuleId: null, instructions: "", label: "" })}
                            >
                              取消编辑
                            </Button>
                          ) : null}
                        </div>
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
                            className={isEditingRule ? "min-h-[560px]" : "min-h-32"}
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
          ) : null}
        </section>
      </div>

      <footer className="shrink-0 border-t border-border bg-panel px-5 py-4">
        <div className="flex flex-wrap justify-end gap-2">
          <Button icon={<X size={16} />} variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={isBusy || !canSaveSettings}
            icon={<Check size={16} />}
            variant="primary"
            onClick={() => void handleSave()}
          >
            保存设置
          </Button>
        </div>
      </footer>
    </AppDialog>
  );
}

type ModelRowProps = {
  active: boolean;
  canDelete: boolean;
  model: AiProviderModelSettings;
  onDelete: () => void;
  onSelect: () => void;
  onToggleCapability: (capability: AiProviderModelCapability) => void;
};

function ModelRow({ active, canDelete, model, onDelete, onSelect, onToggleCapability }: ModelRowProps) {
  const modelLabel = model.label || model.id;

  return (
    <div
      className={`grid min-h-12 grid-cols-[minmax(220px,1fr)_190px_96px] items-center border-b border-border/60 px-3 py-1.5 text-sm last:border-b-0 ${
        active ? "bg-primary-soft/70" : "bg-panel"
      }`}
    >
      <button
        className="grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        type="button"
        onClick={onSelect}
      >
        <span
          className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
            active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
          }`}
        >
          {active ? <Check size={11} /> : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">{modelLabel}</span>
          <span className="block truncate text-[11px] text-muted">{model.id}</span>
        </span>
      </button>
      <div className="flex items-center gap-1.5">
        <CapabilityButton
          active={model.capabilities.includes("text")}
          icon={<FileText size={13} />}
          label="文本生成"
          onClick={() => onToggleCapability("text")}
        />
        <CapabilityButton
          active={model.capabilities.includes("vision")}
          icon={<ImageIcon size={13} />}
          label="图片理解"
          onClick={() => onToggleCapability("vision")}
        />
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          aria-label={`设为当前模型 ${modelLabel}`}
          aria-pressed={active}
          className={`icon-tooltip-button flex size-8 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
            active ? "bg-primary text-primary-foreground" : "text-muted hover:bg-primary-soft hover:text-foreground"
          }`}
          data-tooltip-align="end"
          data-tooltip-placement="above"
          type="button"
          onClick={onSelect}
        >
          {active ? <Check size={13} /> : <span className="size-3 rounded-full border border-border bg-background" />}
          <span className="icon-tooltip-button__bubble" role="tooltip">
            {active ? "当前模型" : "设为当前模型"}
          </span>
        </button>
        <button
          aria-label={`删除模型 ${modelLabel}`}
          className="icon-tooltip-button flex size-8 items-center justify-center rounded-full text-muted outline-none transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/25 disabled:cursor-not-allowed disabled:opacity-40"
          data-tooltip-align="end"
          data-tooltip-placement="above"
          disabled={!canDelete}
          type="button"
          onClick={onDelete}
        >
          <X size={13} />
          <span className="icon-tooltip-button__bubble" role="tooltip">
            删除模型
          </span>
        </button>
      </div>
    </div>
  );
}

type CapabilityButtonProps = {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

function CapabilityButton({ active, icon, label, onClick }: CapabilityButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted hover:bg-primary-soft hover:text-foreground"
      }`}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

type ModelPickerPanelProps = {
  picker: ModelPickerState;
  onCancel: () => void;
  onConfirm: () => void;
  onQueryChange: (query: string) => void;
  onToggleModel: (modelId: string) => void;
};

function ModelPickerPanel({
  picker,
  onCancel,
  onConfirm,
  onQueryChange,
  onToggleModel,
}: ModelPickerPanelProps) {
  const query = normalizeModelSearch(picker.query);
  const visibleModels = picker.models.filter((model) => {
    if (!query) {
      return true;
    }

    return normalizeModelSearch(`${model.label} ${model.id}`).includes(query);
  });

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background shadow-elevated">
      <div className="relative border-b border-border bg-panel">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          aria-label="搜索模型"
          className="h-11 w-full bg-transparent px-4 pr-10 text-sm text-foreground outline-none placeholder:text-muted"
          placeholder="搜索 LLM 模型..."
          value={picker.query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="grid max-h-56 overflow-y-auto p-2">
        {visibleModels.length > 0 ? (
          visibleModels.map((model) => {
            const selected = picker.selectedModelIds.includes(model.id);

            return (
              <button
                className={`grid min-h-10 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                  selected ? "bg-primary-soft text-foreground" : "text-muted hover:bg-panel hover:text-foreground"
                }`}
                key={model.id}
                type="button"
                onClick={() => onToggleModel(model.id)}
              >
                <span
                  className={`flex size-4 items-center justify-center rounded border ${
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-panel"
                  }`}
                >
                  {selected ? <Check size={11} /> : null}
                </span>
                <span className="min-w-0 truncate">{model.label || model.id}</span>
                <ModelCapabilityIcons capabilities={model.capabilities} />
              </button>
            );
          })
        ) : (
          <p className="rounded-md border border-border bg-panel px-3 py-6 text-center text-xs text-muted">
            没有匹配的模型
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-panel px-3 py-3">
        <span className="text-xs text-muted">已选 {picker.selectedModelIds.length} 项</span>
        <div className="flex gap-2">
          <Button icon={<X size={15} />} variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button disabled={picker.selectedModelIds.length === 0} icon={<Check size={15} />} variant="primary" onClick={onConfirm}>
            确定
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModelCapabilityIcons({ capabilities }: { capabilities: readonly AiProviderModelCapability[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted">
      {capabilities.includes("text") ? <FileText size={13} /> : null}
      {capabilities.includes("vision") ? <ImageIcon size={13} /> : null}
    </span>
  );
}

function resolveAiSettingsActionEntry(action: AiFeatureAction): AiSettingsActionEntry {
  return aiSettingsActionEntries.find((entry) => isAiSettingsActionEntrySelected(entry, action)) ?? aiSettingsActionEntries[0]!;
}

function resolveAiSettingsEntryAction(entry: AiSettingsActionEntry, selectedAction: AiFeatureAction): AiFeatureAction {
  return isAiSettingsActionEntrySelected(entry, selectedAction) ? selectedAction : entry.actions[0];
}

function isAiSettingsActionEntrySelected(entry: AiSettingsActionEntry, action: AiFeatureAction): boolean {
  return entry.actions.some((entryAction) => entryAction === action);
}

function getAiSettingsActionEntryLabel(entry: AiSettingsActionEntry): string {
  return entry.label ?? aiFeatureActionMeta[entry.actions[0]].label;
}

function getAiSettingsActionEntryDescription(entry: AiSettingsActionEntry): string {
  return entry.description ?? aiFeatureActionMeta[entry.actions[0]].description;
}

function getAiActionCapabilityLabel(action: AiFeatureAction): string {
  return aiFeatureActionMeta[action].capability === "vision" ? "图片" : "文本";
}

function getAiActionSourceLabel(action: AiFeatureAction): string {
  if (action === "prompt-category" || action === "prompt-tags") {
    return "从提示词分析";
  }

  if (action === "image-category" || action === "image-tags") {
    return "从效果图分析";
  }

  return getAiActionCapabilityLabel(action);
}

function buildPayload({
  actionPreferences,
  activeProfileId,
  profiles,
}: {
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>;
  activeProfileId: string;
  profiles: readonly AiProviderProfileDraft[];
}): SaveAiProviderSettingsPayload {
  return {
    actionPreferences: normalizeActionPreferencesDraft(actionPreferences, profiles, activeProfileId),
    activeProfileId,
    profiles: profiles.map(toSaveProfilePayload),
  };
}

function buildConnectionTestPayload({
  actionPreferences,
  activeProfileId,
  profileId,
  profiles,
}: {
  actionPreferences: Partial<Record<AiFeatureAction, AiActionPreference>>;
  activeProfileId: string;
  profileId: string;
  profiles: readonly AiProviderProfileDraft[];
}): SaveAiProviderSettingsPayload {
  return {
    activeProfileId: profileId,
    actionPreferences: normalizeActionPreferencesDraft(actionPreferences, profiles, profileId),
    profiles: buildPayload({ actionPreferences, activeProfileId, profiles }).profiles.map((profile) =>
      profile.id === profileId ? { ...profile, enabled: true } : profile,
    ),
  };
}

function toSaveProfilePayload(profile: AiProviderProfileDraft): SaveAiProviderProfilePayload {
  const trimmedApiKey = profile.apiKey.trim();

  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    baseUrl: profile.baseUrl,
    model: profile.model,
    models: profile.models,
    ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
    ...(profile.clearApiKey ? { clearApiKey: true } : {}),
  };
}

function createProfileDrafts(settings: PublicAiProviderSettings): AiProviderProfileDraft[] {
  const profiles = settings.profiles.length > 0 ? settings.profiles : [toFallbackProfile(settings)];

  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    baseUrl: profile.baseUrl,
    model: profile.model,
    models: normalizeProfileModels(profile.models, profile.model),
    hasApiKey: profile.hasApiKey,
    apiKeyPreview: profile.apiKeyPreview,
    apiKey: "",
    clearApiKey: false,
  }));
}

function toFallbackProfile(settings: PublicAiProviderSettings): PublicAiProviderProfile {
  return {
    id: settings.activeProfileId || "default",
    name: "默认 API",
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    hasApiKey: settings.hasApiKey,
    apiKeyPreview: settings.apiKeyPreview,
    model: settings.model,
    models: normalizeProfileModels(settings.profiles[0]?.models, settings.model),
  };
}

function createNewProfileDraft(index: number): AiProviderProfileDraft {
  const id = `api-${Date.now().toString(36)}-${index + 1}`;

  return {
    id,
    name: `API ${index + 1}`,
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    models: [
      {
        id: "gpt-4.1-mini",
        label: "gpt-4.1-mini",
        capabilities: ["text", "vision"],
      },
    ],
    hasApiKey: false,
    apiKeyPreview: "",
    apiKey: "",
    clearApiKey: false,
  };
}

function resolveSelectedProfileId(
  preferredProfileId: string,
  profiles: readonly AiProviderProfileDraft[],
): string {
  return profiles.find((profile) => profile.id === preferredProfileId)?.id ?? profiles[0]?.id ?? "default";
}

function resolveDraftApiKeyState(profile: AiProviderProfileDraft): { willHaveApiKey: boolean } {
  return {
    willHaveApiKey: Boolean(profile.apiKey.trim()) || (!profile.clearApiKey && profile.hasApiKey),
  };
}

function resolveDraftApiKeyPreview(profile: AiProviderProfileDraft): string {
  if (profile.apiKey.trim()) {
    return maskApiKeyPreview(profile.apiKey);
  }

  if (profile.clearApiKey) {
    return "";
  }

  return profile.apiKeyPreview;
}

function resolveSavedApiKeyPreviewAfterSave(profile: AiProviderProfileDraft): string {
  if (profile.clearApiKey) {
    return "";
  }

  if (profile.apiKey.trim()) {
    return maskApiKeyPreview(profile.apiKey);
  }

  return profile.apiKeyPreview;
}

function maskApiKeyPreview(apiKey: string): string {
  const value = apiKey.trim();

  if (!value) {
    return "";
  }

  if (value.length <= 4) {
    return `${value.slice(0, 1)}****${value.slice(-1)}`;
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }

  return `${value.slice(0, 6)}****${value.slice(-4)}`;
}

function isProfileComplete(profile: AiProviderProfileDraft): boolean {
  return Boolean(
    profile.baseUrl.trim() &&
      profile.model.trim() &&
      profile.models.some((model) => model.id === profile.model) &&
      resolveDraftApiKeyState(profile).willHaveApiKey,
  );
}

function canTestProfile(profile: AiProviderProfileDraft): boolean {
  return Boolean(profile.baseUrl.trim() && profile.model.trim() && resolveDraftApiKeyState(profile).willHaveApiKey);
}

function buildModelQueryPayload({
  profiles,
  selectedProfileId,
}: {
  profiles: readonly AiProviderProfileDraft[];
  selectedProfileId: string;
}): SaveAiProviderSettingsPayload {
  return {
    activeProfileId: selectedProfileId,
    profiles: profiles.map((profile) => ({
      ...toSaveProfilePayload(profile),
      enabled: profile.id === selectedProfileId,
      model: profile.model || profile.models[0]?.id || "gpt-4.1-mini",
    })),
  };
}

function canQueryModels(profile: AiProviderProfileDraft): boolean {
  return Boolean(profile.baseUrl.trim() && resolveDraftApiKeyState(profile).willHaveApiKey);
}

function addUniqueModels(
  currentModels: readonly AiProviderModelSettings[],
  nextModels: readonly AiProviderModelSettings[],
): AiProviderModelSettings[] {
  const models: AiProviderModelSettings[] = [];

  for (const model of [...currentModels, ...nextModels]) {
    const normalizedModel = normalizeModelDraft(model);

    if (!normalizedModel || models.some((item) => item.id === normalizedModel.id)) {
      continue;
    }

    models.push(normalizedModel);
  }

  return models.length > 0 ? models : normalizeProfileModels([], "gpt-4.1-mini");
}

function normalizeProfileModels(input: unknown, fallbackModelId: string): AiProviderModelSettings[] {
  const values = Array.isArray(input) ? input : [];
  const models = values
    .map(normalizeModelDraft)
    .filter((model): model is AiProviderModelSettings => model !== null);
  const fallbackModel = fallbackModelId.trim() || "gpt-4.1-mini";

  if (!models.some((model) => model.id === fallbackModel)) {
    models.unshift({
      id: fallbackModel,
      label: fallbackModel,
      capabilities: ["text", "vision"],
    });
  }

  return addUniqueModels([], models).slice(0, 80);
}

function normalizeModelDraft(input: unknown): AiProviderModelSettings | null {
  if (typeof input === "string") {
    const id = input.trim();

    return id ? { id, label: id, capabilities: ["text"] } : null;
  }

  if (!isRecord(input)) {
    return null;
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";

  if (!id) {
    return null;
  }

  return {
    id,
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : id,
    capabilities: normalizeCapabilities(input.capabilities),
  };
}

function normalizeCapabilities(input: unknown): AiProviderModelCapability[] {
  const capabilities = Array.isArray(input)
    ? input.filter((capability): capability is AiProviderModelCapability =>
        capability === "text" || capability === "vision",
      )
    : [];

  return capabilities.length > 0 ? [...new Set(capabilities)] : ["text"];
}

function toggleCapability(
  capabilities: readonly AiProviderModelCapability[],
  capability: AiProviderModelCapability,
): AiProviderModelCapability[] {
  const capabilitySet = new Set(capabilities);

  if (capabilitySet.has(capability)) {
    capabilitySet.delete(capability);
  } else {
    capabilitySet.add(capability);
  }

  return capabilitySet.size > 0 ? [...capabilitySet] : [capability];
}

function toggleStringSelection(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function normalizeModelSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff._/-]+/g, "");
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
