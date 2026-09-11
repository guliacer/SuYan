import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import type {
  AiActionPreference,
  AiFeatureAction,
  AiProviderModelCapability,
  AiProviderModelSettings,
  AiRecognitionKind,
  AiRecognitionSource,
  AiRecognitionSourcePreferences,
  AiRulePreset,
  PublicAiProviderSettings,
  SaveAiProviderSettingsPayload,
} from "../types/ai";
import {
  aiFeatureActionMeta,
  normalizeAiRecognitionSourcePreferences,
  normalizeAiRulePresetIds,
} from "../types/ai";
import {
  normalizeActionPreferenceDraft,
  resolveActionRulesForDraft,
} from "../utils/aiSettingsDraft";
import {
  resolveStatusFeedbackTone,
  type StatusFeedbackMessage,
} from "../utils/statusFeedback";
import { maskAiBaseUrl, normalizeAiBaseUrl } from "../utils/aiBaseUrl";
import { useAiSettingsAutoSave } from "../hooks/useAiSettingsAutoSave";
import {
  addUniqueModels,
  aiSettingsActionEntries,
  buildConnectionTestPayload,
  buildModelQueryPayload,
  buildPayload,
  canQueryModels,
  canTestProfile,
  createNewProfileDraft,
  createProfileDrafts,
  ensureProfileSelectedModel,
  getAiSettingsActionEntryLabel,
  isProfileComplete,
  moveItemBefore,
  normalizeAiSettingsActionOrder,
  resolveAiSettingsActionEntry,
  resolveAiSettingsEntryAction,
  getAiActionRecognitionKind,
  resolveDraftApiKeyState,
  resolveDraftApiKeyPreview,
  resolveSelectedProfileId,
  toggleCapability,
  toggleStringSelection,
  type AiProviderProfileDraft,
  type AiSettingsDialogProps,
  type ModelPickerState,
  type RuleEditorState,
} from "./aiSettingsDialogData";

export type AiSettingsApi = ReturnType<typeof useAiSettings>;

/** AI 设置对话框的全部状态、派生值与操作。抽成独立 hook 后，
 * `AiSettingsDialog.tsx` 只保留编排逻辑，行为与拆分前逐字一致。 */
export function useAiSettings({
  isBusy,
  settings,
  onClose,
  onSave,
  onSaveAiRecognitionSourcePreferences,
  onTest,
  onListModels,
  onCopyApiKey,
  onReadApiKey,
  onNotify,
}: AiSettingsDialogProps) {
  const { t } = useLocale();
  const [profiles, setProfiles] = useState<AiProviderProfileDraft[]>(() => createProfileDrafts(settings));
  const [actionEntryOrder, setActionEntryOrder] = useState<string[]>(() => normalizeAiSettingsActionOrder(settings.actionOrder));
  const [activeProfileId, setActiveProfileId] = useState(settings.activeProfileId);
  const [selectedProfileId, setSelectedProfileId] = useState(settings.activeProfileId);
  const [feedbackText, setFeedbackText] = useState("");
  const [actionPreferences, setActionPreferences] = useState<Partial<Record<AiFeatureAction, AiActionPreference>>>(
    () => settings.actionPreferences,
  );
  const [selectedAction, setSelectedAction] = useState<AiFeatureAction>("image-reverse");
  const [recognitionSourcePreferences, setRecognitionSourcePreferences] = useState<AiRecognitionSourcePreferences>(
    () => normalizeAiRecognitionSourcePreferences(settings.recognitionSourcePreferences),
  );
  const [ruleEditor, setRuleEditor] = useState<RuleEditorState>({ editingRuleId: null, instructions: "", label: "" });
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [manualModelDraft, setManualModelDraft] = useState("");
  const [modelPicker, setModelPicker] = useState<ModelPickerState | null>(null);
  const [isTestingAllProfiles, setIsTestingAllProfiles] = useState(false);
  const [deleteConfirmProfileId, setDeleteConfirmProfileId] = useState<string | null>(null);
  const [clearConfirmProfileId, setClearConfirmProfileId] = useState<string | null>(null);
  const [profileActionsMenuId, setProfileActionsMenuId] = useState<string | null>(null);
  const [editingProfileNameId, setEditingProfileNameId] = useState<string | null>(null);
  const [revealedBaseUrlProfileId, setRevealedBaseUrlProfileId] = useState<string | null>(null);
  const [revealedApiKeyProfileId, setRevealedApiKeyProfileId] = useState<string | null>(null);
  const [revealedApiKeys, setRevealedApiKeys] = useState<Record<string, string>>({});
  const [draggedProfileId, setDraggedProfileId] = useState<string | null>(null);
  const [dragOverProfileId, setDragOverProfileId] = useState<string | null>(null);
  const [draggedActionEntryId, setDraggedActionEntryId] = useState<string | null>(null);
  const [dragOverActionEntryId, setDragOverActionEntryId] = useState<string | null>(null);
  const deleteActionRef = useRef<HTMLDivElement | null>(null);
  const clearActionRef = useRef<HTMLDivElement | null>(null);
  const profileActionsRef = useRef<HTMLDivElement | null>(null);
  const profileListRef = useRef<HTMLDivElement | null>(null);
  const profileDetailScrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionSourceSaveRevisionRef = useRef(0);

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
    setEditingProfileNameId(null);
    setRevealedBaseUrlProfileId(null);
    setRevealedApiKeyProfileId(null);
  }, [selectedProfileId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0],
    [profiles, selectedProfileId],
  );
  const selectedApiKeyState = selectedProfile ? resolveDraftApiKeyState(selectedProfile) : null;
  const selectedApiKeyPreview = selectedProfile ? resolveDraftApiKeyPreview(selectedProfile) : "";
  const isBaseUrlRevealed = selectedProfile?.id === revealedBaseUrlProfileId;
  const isApiKeyRevealed = selectedProfile?.id === revealedApiKeyProfileId;
  const revealedApiKey = selectedProfile ? revealedApiKeys[selectedProfile.id] ?? "" : "";
  const canCopySelectedApiKey = selectedProfile
    ? Boolean(selectedProfile.apiKey.trim() || (!selectedProfile.clearApiKey && selectedProfile.hasApiKey))
    : false;
  const hasCompleteConnection = selectedProfile
    ? Boolean(selectedProfile.baseUrl.trim() && selectedProfile.model.trim() && selectedApiKeyState?.willHaveApiKey)
    : false;
  const canTestSelectedProfile = selectedProfile ? canTestProfile(selectedProfile) : false;
  const testableProfileCount = profiles.filter(canTestProfile).length;
  const incompleteEnabledProfiles = profiles.filter((profile) => profile.enabled && !isProfileComplete(profile));
  const normalizedProfiles = useMemo(
    () => profiles.map(ensureProfileSelectedModel).map((profile) => ({ ...profile, baseUrl: normalizeAiBaseUrl(profile.baseUrl) })),
    [profiles],
  );
  const canSaveSettings = profiles.length > 0 && incompleteEnabledProfiles.length === 0;
  const orderedActionEntries = useMemo(
    () => normalizeAiSettingsActionOrder(actionEntryOrder).map((id) => aiSettingsActionEntries.find((entry) => entry.id === id)!),
    [actionEntryOrder],
  );
  const selectedActionMeta = aiFeatureActionMeta[selectedAction];
  const selectedActionEntry = resolveAiSettingsActionEntry(selectedAction);
  const selectedActionEntryLabel = t(getAiSettingsActionEntryLabel(selectedActionEntry));
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

  const autoSavePayload = useMemo(
    () =>
      buildPayload({
        actionPreferences,
        activeProfileId,
        profiles: normalizedProfiles,
        actionOrder: actionEntryOrder,
      }),
    [actionEntryOrder, actionPreferences, activeProfileId, normalizedProfiles],
  );

  const autoSave = useAiSettingsAutoSave({
    enabled: canSaveSettings,
    isBusy,
    onError: setFeedbackText,
    onSave,
    value: autoSavePayload,
  });

  useEffect(() => {
    setRecognitionSourcePreferences(normalizeAiRecognitionSourcePreferences(settings.recognitionSourcePreferences));
  }, [settings.recognitionSourcePreferences.category, settings.recognitionSourcePreferences.tags]);

  function handleSelectDefaultRecognitionSource(kind: AiRecognitionKind, source: AiRecognitionSource) {
    const entry = aiSettingsActionEntries.find((candidate) => getAiActionRecognitionKind(candidate.actions[0]) === kind);
    if (entry) {
      setSelectedAction(resolveAiSettingsEntryAction(entry, null, { [kind]: source }));
    }
    if ((recognitionSourcePreferences[kind] ?? "prompt") === source) {
      return;
    }

    const nextPreferences: AiRecognitionSourcePreferences = {
      ...recognitionSourcePreferences,
      [kind]: source,
    };
    const revision = recognitionSourceSaveRevisionRef.current + 1;

    recognitionSourceSaveRevisionRef.current = revision;
    setRecognitionSourcePreferences(nextPreferences);
    setFeedbackText(t("默认识别来源已更新，正在自动保存。"));

    void onSaveAiRecognitionSourcePreferences(nextPreferences).then((saved) => {
      if (!saved && recognitionSourceSaveRevisionRef.current === revision) {
        setRecognitionSourcePreferences(normalizeAiRecognitionSourcePreferences(settings.recognitionSourcePreferences));
      }
    });
  }

  async function handleCopyApiKey() {
    if (!selectedProfile || !canCopySelectedApiKey) {
      return;
    }

    setFeedbackText(t("正在复制 API Key..."));
    const copied = await onCopyApiKey(selectedProfile.id, selectedProfile.apiKey);

    setFeedbackText(copied ? t("API Key 已复制。") : t("API Key 复制失败。"));
  }

  async function handleCopyBaseUrl() {
    if (!selectedProfile) {
      return;
    }

    const normalized = normalizeAiBaseUrl(selectedProfile.baseUrl);
    if (!normalized) {
      setFeedbackText(t("请先填写接口地址。"));
      return;
    }

    const result = await window.suyanApi.writeClipboardText(normalized);
    setFeedbackText(result.ok ? t("接口地址已复制。") : t("接口地址复制失败。"));
  }

  async function handlePasteBaseUrl() {
    if (!selectedProfile) {
      return;
    }

    const result = await window.suyanApi.readClipboardText();
    if (!result.ok) {
      setFeedbackText(t("读取剪贴板失败，请检查系统剪贴板权限。"));
      return;
    }

    const normalized = normalizeAiBaseUrl(result.data.text);
    if (!normalized) {
      setFeedbackText(t("剪贴板中没有可用的接口地址。"));
      return;
    }

    patchProfile(selectedProfile.id, { baseUrl: normalized });
    setRevealedBaseUrlProfileId(selectedProfile.id);
    setFeedbackText(t("接口地址已粘贴并自动适配。"));
  }

  function handleNormalizeBaseUrl() {
    if (!selectedProfile) {
      return;
    }

    patchProfile(selectedProfile.id, { baseUrl: normalizeAiBaseUrl(selectedProfile.baseUrl) });
  }

  function handleClearBaseUrl() {
    if (!selectedProfile) {
      return;
    }

    patchProfile(selectedProfile.id, { baseUrl: "" });
    setRevealedBaseUrlProfileId(selectedProfile.id);
    setFeedbackText(t("接口地址已清除。"));
  }

  async function handleToggleApiKeyVisibility() {
    if (!selectedProfile) {
      return;
    }

    if (isApiKeyRevealed) {
      setRevealedApiKeyProfileId(null);
      return;
    }

    if (selectedProfile.apiKey.trim()) {
      setRevealedApiKeys((current) => ({ ...current, [selectedProfile.id]: selectedProfile.apiKey }));
      setRevealedApiKeyProfileId(selectedProfile.id);
      return;
    }

    if (!selectedProfile.hasApiKey || selectedProfile.clearApiKey) {
      setFeedbackText(t("当前 API 尚未配置可展示的 API Key。"));
      return;
    }

    const apiKey = await onReadApiKey(selectedProfile.id);
    if (!apiKey) {
      setFeedbackText(t("API Key 展示失败。"));
      return;
    }

    setRevealedApiKeys((current) => ({ ...current, [selectedProfile.id]: apiKey }));
    setRevealedApiKeyProfileId(selectedProfile.id);
  }

  async function handlePasteApiKey() {
    if (!selectedProfile) {
      return;
    }

    const result = await window.suyanApi.readClipboardText();
    if (!result.ok) {
      setFeedbackText(t("读取剪贴板失败，请检查系统剪贴板权限。"));
      return;
    }

    const apiKey = result.data.text.trim();
    if (!apiKey) {
      setFeedbackText(t("剪贴板中没有可用的 API Key。"));
      return;
    }

    patchProfile(selectedProfile.id, { apiKey, clearApiKey: false });
    setRevealedApiKeys((current) => ({ ...current, [selectedProfile.id]: apiKey }));
    setRevealedApiKeyProfileId(selectedProfile.id);
    setFeedbackText(t("API Key 已粘贴。"));
  }

  async function importClipboardIntoSelectedProfile() {
    if (!selectedProfile) {
      return;
    }

    const result = await window.suyanApi.readClipboardText();
    if (!result.ok) {
      setFeedbackText(t("读取剪贴板失败，请检查系统剪贴板权限。"));
      return;
    }

    const { parseAiClipboardImport } = await import("../utils/aiClipboardImport");
    const parsed = parseAiClipboardImport(result.data.text);
    if (!parsed) {
      setFeedbackText(t("剪贴板中未识别到可用的 API 连接信息。"));
      return;
    }

    const patch: Partial<AiProviderProfileDraft> = {};
    let changed = false;

    if (parsed.baseUrl) {
      patch.baseUrl = normalizeAiBaseUrl(parsed.baseUrl);
      changed = true;
    }
    if (parsed.apiKey) {
      patch.apiKey = parsed.apiKey;
      patch.clearApiKey = false;
      changed = true;
    }
    if (parsed.model) {
      patch.model = parsed.model;
      changed = true;
    }

    if (!changed) {
      setFeedbackText(t("剪贴板中未识别到可用的 API 连接信息。"));
      return;
    }

    patchProfile(selectedProfile.id, patch);
    setRevealedBaseUrlProfileId(selectedProfile.id);
    setFeedbackText(t("已从剪贴板快速导入连接信息。"));
  }

  function commitProfileNameEdit(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    const name = profile.name.trim();
    patchProfile(profileId, { name });
    setEditingProfileNameId(null);
  }

  function handleProfileNameKeyDown(event: React.KeyboardEvent<HTMLInputElement>, profileId: string) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitProfileNameEdit(profileId);
    }

    if (event.key === "Escape") {
      setEditingProfileNameId(null);
    }
  }

  async function handleTest() {
    if (!selectedProfile) {
      return;
    }

    setFeedbackText(t("正在测试 {name}...", { name: selectedProfile.name || t("当前 API") }));
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
      setFeedbackText(t("连接成功，已自动启用该 API。"));
      return;
    }

    patchProfile(selectedProfile.id, { enabled: false });
    setFeedbackText(t("连接失败：{message} 已自动停用该 API。", { message: result.message }));
  }

  async function handleTestAllProfiles() {
    if (isTestingAllProfiles) {
      return;
    }

    const testTargets = profiles.filter(canTestProfile);

    if (testTargets.length === 0) {
      setFeedbackText(t("请先补全地址、模型和 API Key。"));
      return;
    }

    setIsTestingAllProfiles(true);
    autoSave.pause();
    setFeedbackText(t("正在测试全部 API（{current}/{total}）...", { current: 0, total: testTargets.length }));

    const failedIds = new Set<string>();
    const succeededIds = new Set<string>();
    const failureMessages: string[] = [];
    let successCount = 0;

    try {
      for (let index = 0; index < testTargets.length; index += 1) {
        const profile = testTargets[index];
        const profileName = profile.name || t("未命名 API");

        setFeedbackText(t("正在测试 {name}（{current}/{total}）...", {
          name: profileName,
          current: index + 1,
          total: testTargets.length,
        }));
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
      const skippedText = skippedCount > 0 ? t("，跳过 {count} 个未完善", { count: skippedCount }) : "";

      if (failedIds.size === 0) {
        setFeedbackText(t("可测 API 全部连接成功{skipped}，已启用。", { skipped: skippedText }));
        return;
      }

      const failureText = failureMessages.length > 0
        ? t("失败原因：{details}", { details: failureMessages.join("；") })
        : "";

      setFeedbackText(
        t("测试完成：成功 {success}，失败 {failed}{skipped}。成功已启用，失败已停用。{failure}", {
          success: successCount,
          failed: failedIds.size,
          skipped: skippedText,
          failure: failureText,
        }),
      );
    } finally {
      setIsTestingAllProfiles(false);
      autoSave.resume();
    }
  }

  async function handleListModels() {
    if (!selectedProfile) {
      return;
    }

    const queryPayload = buildModelQueryPayload({ profiles, selectedProfileId: selectedProfile.id });

    setFeedbackText(t("正在查询 {name} 的模型...", { name: selectedProfile.name || t("当前 API") }));
    const models = await onListModels(queryPayload);

    if (!models) {
      setFeedbackText(t("模型查询失败。"));
      return;
    }

    setModelPicker({
      profileId: selectedProfile.id,
      query: "",
      models,
      selectedModelIds: selectedProfile.models.map((model) => model.id),
    });
    setFeedbackText(t("已查询到 {count} 个模型。", { count: models.length }));
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

  function reorderProfiles(sourceId: string, targetId: string) {
    setProfiles((currentProfiles) => {
      const sourceIndex = currentProfiles.findIndex((profile) => profile.id === sourceId);
      const targetIndex = currentProfiles.findIndex((profile) => profile.id === targetId);
      return moveItemBefore(currentProfiles, sourceIndex, targetIndex);
    });
    setFeedbackText(t("API 顺序已调整，正在自动保存。"));
  }

  function reorderActionEntries(sourceId: string, targetId: string) {
    setActionEntryOrder((currentOrder) => {
      const sourceIndex = currentOrder.indexOf(sourceId);
      const targetIndex = currentOrder.indexOf(targetId);
      return moveItemBefore(currentOrder, sourceIndex, targetIndex);
    });
    setFeedbackText(t("规则列表顺序已调整，正在自动保存。"));
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
    setFeedbackText(t("规则选择已更新，正在自动保存。"));
  }

  function clearActionRules(action: AiFeatureAction) {
    patchActionPreference(action, {
      customInstructions: "",
      rules: resolveActionRulesForDraft(action, actionPreferences[action]),
      rulePresetIds: [],
    });
    setFeedbackText(t("当前功能规则选择已清空，正在自动保存。"));
  }

  function editRule(rule: AiRulePreset) {
    setRuleEditor({
      editingRuleId: rule.id,
      instructions: rule.instructions,
      label: rule.label,
    });
    setRuleEditorOpen(true);
  }

  function saveRule(action: AiFeatureAction) {
    const label = ruleEditor.label.trim();
    const instructions = ruleEditor.instructions.trim();

    if (!label || !instructions) {
      setFeedbackText(t("请先填写规则名称和规则内容。"));
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
    setRuleEditorOpen(false);
    setFeedbackText(t(editingRuleId ? "规则已更新，正在自动保存。" : "规则已新增，正在自动保存。"));
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
      setRuleEditorOpen(false);
    }

    setFeedbackText(t("规则已删除，正在自动保存。"));
  }

  function resetDrafts(nextSettings: PublicAiProviderSettings) {
    setProfiles(createProfileDrafts(nextSettings));
    setActionEntryOrder(normalizeAiSettingsActionOrder(nextSettings.actionOrder));
    setActiveProfileId(nextSettings.activeProfileId);
    setSelectedProfileId(nextSettings.activeProfileId);
    setActionPreferences(nextSettings.actionPreferences);
    setRecognitionSourcePreferences(normalizeAiRecognitionSourcePreferences(nextSettings.recognitionSourcePreferences));
    setRuleEditor({ editingRuleId: null, instructions: "", label: "" });
    setRuleEditorOpen(false);
    setManualModelDraft("");
    setModelPicker(null);
    setDeleteConfirmProfileId(null);
    setClearConfirmProfileId(null);
    setProfileActionsMenuId(null);
    setEditingProfileNameId(null);
    setRevealedBaseUrlProfileId(null);
    setRevealedApiKeyProfileId(null);
    setRevealedApiKeys({});
    setDraggedProfileId(null);
    setDragOverProfileId(null);
    setDraggedActionEntryId(null);
    setDragOverActionEntryId(null);
    setFeedbackText("");
  }

  return {
    // 外部直接传入的 props
    isBusy,
    onClose,
    // state 值
    actionEntryOrder,
    actionPreferences,
    activeProfileId,
    clearConfirmProfileId,
    deleteConfirmProfileId,
    dragOverActionEntryId,
    dragOverProfileId,
    draggedActionEntryId,
    draggedProfileId,
    editingProfileNameId,
    feedbackText,
    isTestingAllProfiles,
    manualModelDraft,
    modelPicker,
    profileActionsMenuId,
    profiles,
    recognitionSourcePreferences,
    revealedApiKeyProfileId,
    revealedApiKeys,
    revealedBaseUrlProfileId,
    ruleEditor,
    ruleEditorOpen,
    selectedAction,
    selectedProfileId,
    // refs
    clearActionRef,
    deleteActionRef,
    profileActionsRef,
    profileDetailScrollRef,
    profileListRef,
    // 派生值
    canCopySelectedApiKey,
    canSaveSettings,
    canTestSelectedProfile,
    hasCompleteConnection,
    incompleteEnabledProfiles,
    isBaseUrlRevealed,
    isApiKeyRevealed,
    isEditingRule,
    normalizedProfiles,
    orderedActionEntries,
    revealedApiKey,
    selectedActionCustomInstructions,
    selectedActionEntry,
    selectedActionEntryHasSources,
    selectedActionEntryLabel,
    selectedActionHasCustomRules,
    selectedActionMeta,
    selectedActionModel,
    selectedActionModels,
    selectedActionPreference,
    selectedActionProfile,
    selectedActionRulePresetIds,
    selectedActionRules,
    selectedApiKeyPreview,
    selectedApiKeyState,
    selectedProfile,
    testableProfileCount,
    // setters（供 JSX 直接调用）
    setActionPreferences,
    setActiveProfileId,
    setClearConfirmProfileId,
    setDeleteConfirmProfileId,
    setDragOverActionEntryId,
    setDragOverProfileId,
    setDraggedActionEntryId,
    setDraggedProfileId,
    setEditingProfileNameId,
    setManualModelDraft,
    setModelPicker,
    setProfileActionsMenuId,
    setRevealedApiKeyProfileId,
    setRevealedApiKeys,
    setRevealedBaseUrlProfileId,
    setRuleEditor,
    setRuleEditorOpen,
    setSelectedAction,
    setSelectedProfileId,
    // 操作 handlers
    addManualModel,
    addProfile,
    clearActionRules,
    commitProfileNameEdit,
    confirmModelPicker,
    deleteProfile,
    deleteRule,
    editRule,
    handleClearBaseUrl,
    handleCopyApiKey,
    handleCopyBaseUrl,
    handleListModels,
    handleNormalizeBaseUrl,
    handlePasteApiKey,
    handlePasteBaseUrl,
    handleProfileNameKeyDown,
    handleSelectDefaultRecognitionSource,
    handleTest,
    handleTestAllProfiles,
    handleToggleApiKeyVisibility,
    importClipboardIntoSelectedProfile,
    patchActionPreference,
    patchProfile,
    removeModel,
    reorderActionEntries,
    reorderProfiles,
    resetActionPreference,
    saveRule,
    toggleModelCapability,
    toggleRuleSelection,
    autoSave,
    resetDrafts,
  };
}
