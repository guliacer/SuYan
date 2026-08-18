import {
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmBubble } from "@/components/ui/ConfirmBubble";
import { TextField } from "@/components/ui/TextField";
import { maskAiBaseUrl } from "../utils/aiBaseUrl";
import { ModelPickerPanel, ModelRow } from "./AiSettingsModelControls";
import {
  canQueryModels,
  isProfileComplete,
  resolveDraftApiKeyState,
  toggleStringSelection,
} from "./aiSettingsDialogData";
import type { AiSettingsApi } from "./useAiSettings";

export function AiConnectionSection({ api }: { api: AiSettingsApi }) {
  const {
    activeProfileId,
    canCopySelectedApiKey,
    canTestSelectedProfile,
    clearConfirmProfileId,
    deleteConfirmProfileId,
    dragOverProfileId,
    draggedProfileId,
    editingProfileNameId,
    hasCompleteConnection,
    isBaseUrlRevealed,
    isApiKeyRevealed,
    isBusy,
    isTestingAllProfiles,
    manualModelDraft,
    modelPicker,
    profileActionsMenuId,
    profiles,
    revealedApiKey,
    revealedApiKeyProfileId,
    revealedBaseUrlProfileId,
    selectedApiKeyPreview,
    selectedApiKeyState,
    selectedProfile,
    testableProfileCount,
    clearActionRef,
    deleteActionRef,
    profileActionsRef,
    profileListRef,
    setActiveProfileId,
    setClearConfirmProfileId,
    setDeleteConfirmProfileId,
    setDragOverProfileId,
    setDraggedProfileId,
    setEditingProfileNameId,
    setManualModelDraft,
    setModelPicker,
    setProfileActionsMenuId,
    setRevealedApiKeyProfileId,
    setRevealedApiKeys,
    setRevealedBaseUrlProfileId,
    setSelectedProfileId,
    addManualModel,
    addProfile,
    commitProfileNameEdit,
    confirmModelPicker,
    deleteProfile,
    handleClearBaseUrl,
    handleCopyApiKey,
    handleCopyBaseUrl,
    handleListModels,
    handleNormalizeBaseUrl,
    handlePasteApiKey,
    handlePasteBaseUrl,
    handleProfileNameKeyDown,
    handleTest,
    handleTestAllProfiles,
    handleToggleApiKeyVisibility,
    patchProfile,
    removeModel,
    reorderProfiles,
    toggleModelCapability,
  } = api;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-sm">
      <div className="grid gap-0 min-[960px]:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border bg-background px-4 py-5 min-[960px]:border-b-0 min-[960px]:border-r">
          <div className="flex items-center justify-between gap-2 pb-4">
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
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>OpenAI 兼容</span>
              <span>{profiles.length}</span>
            </div>
            <div className="grid auto-rows-max gap-1">
            {profiles.map((profile) => {
              const isSelected = profile.id === selectedProfile?.id;
              const keyState = resolveDraftApiKeyState(profile);
              const isReady = profile.enabled && isProfileComplete(profile);
              const isDragging = draggedProfileId === profile.id;
              const isDragOver = dragOverProfileId === profile.id;

              return (
                <button
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25 ${
                    isSelected
                      ? "border-primary bg-primary-soft text-foreground"
                      : isDragOver
                        ? "border-primary/50 bg-primary-soft/70 text-foreground ring-1 ring-primary/30"
                        : "border-transparent bg-transparent text-muted hover:bg-panel hover:text-foreground"
                  } ${isDragging ? "opacity-55" : ""}`}
                  data-ai-profile-active={isSelected ? "true" : undefined}
                  draggable={profiles.length > 1}
                  key={profile.id}
                  title="拖动以调整 API 顺序"
                  type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  onDragStart={(event) => {
                    if (profiles.length <= 1) {
                      event.preventDefault();
                      return;
                    }

                    setDraggedProfileId(profile.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", profile.id);
                  }}
                  onDragEnter={(event) => {
                    if (!draggedProfileId || draggedProfileId === profile.id) {
                      return;
                    }

                    event.preventDefault();
                    setDragOverProfileId(profile.id);
                  }}
                  onDragOver={(event) => {
                    if (!draggedProfileId || draggedProfileId === profile.id) {
                      return;
                    }

                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = draggedProfileId ?? event.dataTransfer.getData("text/plain");
                    setDraggedProfileId(null);
                    setDragOverProfileId(null);

                    if (sourceId && sourceId !== profile.id) {
                      reorderProfiles(sourceId, profile.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggedProfileId(null);
                    setDragOverProfileId(null);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <GripVertical aria-hidden="true" className="shrink-0 text-muted/55" size={14} />
                    <span className="truncate text-sm font-medium">{profile.name || "未命名 API"}</span>
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        isReady ? "bg-progress" : profile.enabled ? "bg-warning" : "bg-border"
                      }`}
                    />
                    <span className="truncate text-[11px] text-muted">{keyState.willHaveApiKey ? profile.model : "未配置密钥"}</span>
                    {profile.id === activeProfileId ? <Star className="shrink-0 text-primary" size={12} /> : null}
                  </span>
                </button>
              );
            })}
              </div>
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
          <div className="flex min-w-0 flex-col bg-panel">
            <section className="grid gap-2 border-b border-border bg-panel px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted">当前连接</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {editingProfileNameId === selectedProfile.id ? (
                      <TextField
                        aria-label="编辑 API 名称"
                        autoFocus
                        className="h-9 w-56 bg-background text-base font-semibold"
                        value={selectedProfile.name}
                        onBlur={() => commitProfileNameEdit(selectedProfile.id)}
                        onChange={(event) => patchProfile(selectedProfile.id, { name: event.target.value })}
                        onKeyDown={(event) => handleProfileNameKeyDown(event, selectedProfile.id)}
                      />
                    ) : (
                      <button
                        aria-label="编辑 API 名称"
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-1 text-left text-lg font-semibold text-foreground outline-none transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary/25"
                        type="button"
                        onClick={() => setEditingProfileNameId(selectedProfile.id)}
                      >
                        <span className="max-w-[min(42vw,280px)] truncate">{selectedProfile.name || "未命名 API"}</span>
                        <Pencil className="size-4 shrink-0 text-muted" />
                      </button>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
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
                    测试API
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

            <section className="grid gap-4 bg-panel px-6 py-5">
              <div className="grid gap-4 min-[820px]:grid-cols-2 min-[820px]:items-start">
                <label className="grid gap-2 text-sm font-medium text-muted">
                  接口地址
                  <div className="grid gap-2 min-[680px]:grid-cols-[minmax(0,1fr)_auto]">
                    <TextField
                      aria-label="接口地址"
                      placeholder="https://api.openai.com/v1"
                      readOnly={!isBaseUrlRevealed}
                      value={isBaseUrlRevealed ? selectedProfile.baseUrl : maskAiBaseUrl(selectedProfile.baseUrl)}
                      onBlur={handleNormalizeBaseUrl}
                      onChange={(event) => patchProfile(selectedProfile.id, { baseUrl: event.target.value })}
                    />
                    <div className="flex shrink-0 flex-wrap gap-2 min-[680px]:items-start">
                      <Button
                        aria-label="复制接口地址"
                        disabled={!selectedProfile.baseUrl.trim() || isBusy}
                        icon={<Copy size={15} />}
                        title="复制接口地址"
                        variant="secondary"
                        onClick={() => void handleCopyBaseUrl()}
                      >
                        复制
                      </Button>
                      <Button
                        aria-label="粘贴接口地址"
                        disabled={isBusy}
                        icon={<Clipboard size={15} />}
                        title="从剪贴板粘贴接口地址"
                        variant="secondary"
                        onClick={() => void handlePasteBaseUrl()}
                      >
                        粘贴
                      </Button>
                      <Button
                        aria-label={isBaseUrlRevealed ? "隐藏接口地址" : "展示接口地址"}
                        disabled={!selectedProfile.baseUrl.trim() || isBusy}
                        icon={isBaseUrlRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                        title={isBaseUrlRevealed ? "隐藏接口地址" : "展示接口地址"}
                        variant="ghost"
                        onClick={() =>
                          setRevealedBaseUrlProfileId((currentId) =>
                            currentId === selectedProfile.id ? null : selectedProfile.id,
                          )
                        }
                      >
                        {isBaseUrlRevealed ? "隐藏" : "展示"}
                      </Button>
                      <Button
                        aria-label="删除接口地址"
                        disabled={!selectedProfile.baseUrl.trim() || isBusy}
                        icon={<Trash2 size={15} />}
                        title="删除接口地址"
                        variant="ghost"
                        onClick={handleClearBaseUrl}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </label>

                <label className="grid gap-2 text-sm font-medium text-muted">
                  API Key
                  <div className="grid gap-2 min-[680px]:grid-cols-[minmax(0,1fr)_auto]">
                    <TextField
                      aria-label="API Key"
                      className="font-mono"
                      placeholder={selectedApiKeyState?.willHaveApiKey ? "已配置 API Key" : "未配置 API Key"}
                      readOnly={!isApiKeyRevealed}
                      type={isApiKeyRevealed ? "text" : "password"}
                      value={
                        isApiKeyRevealed
                          ? selectedProfile.apiKey || revealedApiKey
                          : selectedApiKeyPreview || (selectedProfile.clearApiKey ? "保存后清除密钥" : "未配置密钥")
                      }
                      onChange={(event) => {
                        patchProfile(selectedProfile.id, {
                          apiKey: event.target.value,
                          clearApiKey: event.target.value.trim() ? false : selectedProfile.clearApiKey,
                        });
                      }}
                    />
                    <div className="flex shrink-0 flex-wrap gap-2 min-[680px]:items-start">
                      <Button
                        disabled={!canCopySelectedApiKey || isBusy}
                        icon={<Copy size={15} />}
                        title="复制 API Key"
                        variant="secondary"
                        onClick={() => void handleCopyApiKey()}
                      >
                        复制
                      </Button>
                      <Button
                        aria-label="粘贴 API Key"
                        disabled={isBusy}
                        icon={<Clipboard size={15} />}
                        title="从剪贴板粘贴 API Key"
                        variant="secondary"
                        onClick={() => void handlePasteApiKey()}
                      >
                        粘贴
                      </Button>
                      <Button
                        aria-label={isApiKeyRevealed ? "隐藏 API Key" : "展示 API Key"}
                        disabled={!canCopySelectedApiKey || isBusy}
                        icon={isApiKeyRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                        title={isApiKeyRevealed ? "隐藏 API Key" : "展示 API Key"}
                        variant="ghost"
                        onClick={() => void handleToggleApiKeyVisibility()}
                      >
                        {isApiKeyRevealed ? "隐藏" : "展示"}
                      </Button>
                      <div className="relative" ref={clearActionRef}>
                        <Button
                          disabled={(!selectedProfile.hasApiKey && !selectedProfile.apiKey.trim()) || isBusy}
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
                              setRevealedApiKeyProfileId(null);
                              setRevealedApiKeys((current) => {
                                const next = { ...current };
                                delete next[selectedProfile.id];
                                return next;
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

            <section className="grid gap-4 rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">模型列表</p>
                  <p className="mt-1 text-xs text-muted">为当前供应商选择可用模型，并配置模型能力。</p>
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
  );
}