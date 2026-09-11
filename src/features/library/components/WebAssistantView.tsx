import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  AlertCircle,
  ChevronDown,
  Clipboard,
  Compass,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import { CAPSULE_TONES, type CapsuleTone } from "@/components/ui/capsuleTones";
import type { StatusFeedbackMessage } from "../utils/statusFeedback";
import { useLibraryStore } from "../store/useLibraryStore";
import {
  WEB_ASSISTANT_CUSTOM_ID,
  WEB_ASSISTANT_DEFAULT_SITE_ID,
  WEB_ASSISTANT_SITES,
  findWebAssistantSite,
  type WebAssistantBounds,
  type WebAssistantTargetId,
} from "../types/webAssistant";
import {
  getStoredWebAssistantCustomUrl,
  getStoredWebAssistantPlatform,
  storeWebAssistantCustomUrl,
  storeWebAssistantPlatform,
} from "../utils/webAssistantPrefs";

export type WebAssistantViewProps = {
  /** 左侧导入菜单打开时，先把原生网页截图垫在菜单下面。 */
  isImportMenuOpen: boolean;
  /** 首次功能引导显示时，原生网页视图必须暂时隐藏，DOM 引导才能位于最上层。 */
  isFeatureGuideOpen: boolean;
  onNotify: (message: StatusFeedbackMessage) => void;
};

const CUSTOM_PLATFORM: WebAssistantTargetId = WEB_ASSISTANT_CUSTOM_ID;
/** 与 useLibraryStore 的 addWebAssistantCustomUrl 上限保持一致。 */
const MAX_SAVED_URLS = 50;
type WebAssistantLoadState = "loading" | "ready" | "error";
type DirectoryPosition = { left: number; maxHeight: number; top: number; width: number };

function readBounds(host: HTMLDivElement): WebAssistantBounds | null {
  const rect = host.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function normalizeUrlInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return normalized;
  } catch {
    return null;
  }
}

function currentUrlFor(platform: WebAssistantTargetId, committedCustomUrl: string | null): string {
  if (platform === CUSTOM_PLATFORM) {
    return committedCustomUrl ?? "";
  }
  return findWebAssistantSite(platform)?.url ?? "";
}

function displayTitleFor(platform: WebAssistantTargetId, translate: (text: string) => string): string {
  if (platform === CUSTOM_PLATFORM) {
    return translate("自定义");
  }
  return findWebAssistantSite(platform)?.title ?? String(platform);
}

const SITE_TONES: CapsuleTone[] = ["sage", "mist", "clay", "lavender", "fog", "rose", "sand", "stone"];

function toneForKey(key: string): CapsuleTone {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return SITE_TONES[hash % SITE_TONES.length];
}

function siteMark(title: string): string {
  return title.trim().slice(0, 1).toUpperCase() || "#";
}

function displaySavedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function SiteChip({
  active,
  title,
  url,
  tone,
  onClick,
}: {
  active: boolean;
  title: string;
  url?: string;
  tone: CapsuleTone;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={url ?? title}
      className={`inline-flex h-8 max-w-[11.5rem] shrink-0 items-center gap-1.5 rounded-full border px-1.5 pr-2.5 text-left text-[11px] font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        active
          ? CAPSULE_TONES[tone].selected
          : `${CAPSULE_TONES[tone].solid} hover:border-primary/45 hover:bg-panel`
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          active ? "bg-primary text-primary-foreground" : "bg-panel/80"
        }`}
      >
        {siteMark(title)}
      </span>
      <span className="min-w-0 truncate">{title}</span>
    </button>
  );
}

function clampDirectoryPosition(anchor: DOMRect): DirectoryPosition {
  const viewportPadding = 12;
  const width = Math.min(520, Math.max(280, window.innerWidth - viewportPadding * 2));
  const left = Math.min(
    Math.max(viewportPadding, anchor.left),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
  );
  const preferredTop = anchor.bottom + 8;
  const top = Math.min(preferredTop, Math.max(viewportPadding, window.innerHeight - 260));
  const maxHeight = Math.max(220, window.innerHeight - top - viewportPadding);
  return { left, maxHeight, top, width };
}

export function WebAssistantView({ isFeatureGuideOpen, isImportMenuOpen, onNotify }: WebAssistantViewProps) {
  const { t } = useLocale();
  const savedUrls = useLibraryStore((state) => state.webAssistantCustomUrls);
  const addWebAssistantCustomUrl = useLibraryStore((state) => state.addWebAssistantCustomUrl);
  const removeWebAssistantCustomUrl = useLibraryStore((state) => state.removeWebAssistantCustomUrl);

  // 记住上次选择的站点：优先从 store（磁盘持久化）读取，回退到 localStorage。
  const [initialPrefs] = useState(() => {
    const storeState = useLibraryStore.getState();
    const storedPlatform =
      storeState.webAssistantLastPlatform ?? getStoredWebAssistantPlatform(WEB_ASSISTANT_DEFAULT_SITE_ID);
    const storedCustomUrl =
      storeState.webAssistantLastCustomUrl ?? getStoredWebAssistantCustomUrl();
    const customUrl = storedCustomUrl && normalizeUrlInput(storedCustomUrl) ? storedCustomUrl : null;
    const platform =
      storedPlatform === CUSTOM_PLATFORM && customUrl ? CUSTOM_PLATFORM : storedPlatform;
    return { platform, customUrl };
  });
  const [platform, setPlatform] = useState<WebAssistantTargetId>(initialPrefs.platform);
  const [customUrlDraft, setCustomUrlDraft] = useState("");
  const [committedCustomUrl, setCommittedCustomUrl] = useState<string | null>(initialPrefs.customUrl);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [loadState, setLoadState] = useState<WebAssistantLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [directoryPosition, setDirectoryPosition] = useState<DirectoryPosition | null>(null);
  /** 目录或导入浮层打开时，网页视图隐藏前的截图，用于在 DOM 里撑住网页块区域。 */
  const [webSnapshot, setWebSnapshot] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const directoryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const directoryPanelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    return () => {
      void window.suyanApi.hideWebAssistant();
    };
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    const syncBounds = () => {
      if (disposed) return;
      const bounds = readBounds(host);
      if (!bounds) return;
      void window.suyanApi.setWebAssistantBounds({
        platform,
        bounds,
        customUrl: platform === CUSTOM_PLATFORM ? committedCustomUrl : null,
      });
    };

    const openPlatform = async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        const result = await window.suyanApi.prepareWebAssistant({
          platform,
          customUrl: platform === CUSTOM_PLATFORM ? committedCustomUrl : null,
        });
        if (!result.ok) {
          throw new Error(result.error.message);
        }
        if (disposed) return;
        syncBounds();
        const visibleResult = await window.suyanApi.showWebAssistant(platform, customUrl);
        if (!visibleResult.ok) {
          throw new Error(visibleResult.error.message);
        }
        if (disposed) return;
        setLoadState("ready");
        onNotify({ type: "info", text: t("已加载网页助手：{title}", { title: displayTitleFor(platform, t) }) });
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : t("网页助手加载失败，请重试。");
        setLoadState("error");
        setLoadError(message);
        onNotify({ type: "error", text: message });
      }
    };

    const resizeObserver = new ResizeObserver(syncBounds);
    resizeObserver.observe(host);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);
    void openPlatform();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);
    };
  }, [committedCustomUrl, onNotify, platform]);

  useLayoutEffect(() => {
    if (!isDirectoryOpen) {
      setDirectoryPosition(null);
      return;
    }

    const updateDirectoryPosition = () => {
      const anchor = directoryTriggerRef.current;
      if (!anchor) return;
      setDirectoryPosition(clampDirectoryPosition(anchor.getBoundingClientRect()));
    };

    updateDirectoryPosition();
    window.addEventListener("resize", updateDirectoryPosition);
    window.addEventListener("scroll", updateDirectoryPosition, true);
    return () => {
      window.removeEventListener("resize", updateDirectoryPosition);
      window.removeEventListener("scroll", updateDirectoryPosition, true);
    };
  }, [isDirectoryOpen]);

  useLayoutEffect(() => {
    const hasForegroundOverlay = isDirectoryOpen || isImportMenuOpen || isFeatureGuideOpen;
    if (!hasForegroundOverlay) {
      setWebSnapshot(null);
      void window.suyanApi.setWebAssistantVisibility(true);
      return;
    }

    // 原生 WebContentsView 永远盖在 DOM 之上，目录、左侧导入菜单和功能引导都无法直接盖住网页。
    // 先截一帧网页画面，确认截图成功后再隐藏原生视图，确保前景内容下仍能看到原网页。
    let cancelled = false;
    let captured = false;
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    void window.suyanApi
      .captureWebAssistant(platform, customUrl)
      .then((result) => {
        if (cancelled || !result.ok) {
          return;
        }
        captured = true;
        setWebSnapshot(result.data.dataUrl);
      })
      .catch(() => undefined)
      .finally(() => {
        // 引导必须保证弹窗可见；即使极少数情况下截图失败，也不能让原生网页继续盖住引导。
        if (!cancelled && (captured || isFeatureGuideOpen)) {
          void window.suyanApi.setWebAssistantVisibility(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [committedCustomUrl, isDirectoryOpen, isFeatureGuideOpen, isImportMenuOpen, platform]);

  useLayoutEffect(() => {
    if (!isDirectoryOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!directoryTriggerRef.current?.contains(target) && !directoryPanelRef.current?.contains(target)) {
        setIsDirectoryOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDirectoryOpen(false);
        directoryTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDirectoryOpen]);

  const selectTarget = (next: WebAssistantTargetId) => {
    setIsDirectoryOpen(false);
    if (next === platform) return;
    setPlatform(next);
    storeWebAssistantPlatform(next);
    void useLibraryStore.getState().saveWebAssistantPrefs({ platform: next, customUrl: null });
  };

  const selectCustomUrl = (url: string) => {
    setIsDirectoryOpen(false);
    setCommittedCustomUrl(url);
    setPlatform(CUSTOM_PLATFORM);
    storeWebAssistantCustomUrl(url);
    storeWebAssistantPlatform(CUSTOM_PLATFORM);
    void useLibraryStore.getState().saveWebAssistantPrefs({ platform: CUSTOM_PLATFORM, customUrl: url });
  };

  const commitCustomUrl = () => {
    const normalized = normalizeUrlInput(customUrlDraft);
    if (!normalized) {
      onNotify({ type: "error", text: t("自定义网址无效，请填写完整的 http(s) 地址。") });
      return;
    }
    if (savedUrls.length >= MAX_SAVED_URLS && !savedUrls.includes(normalized)) {
      onNotify({ type: "info", text: t("“我的网址”最多保存 {count} 条，旧的将自动移除。", { count: MAX_SAVED_URLS }) });
    }
    void addWebAssistantCustomUrl(normalized);
    setCustomUrlDraft("");
    setCommittedCustomUrl(normalized);
    setIsDirectoryOpen(false);
    setPlatform(CUSTOM_PLATFORM);
    storeWebAssistantCustomUrl(normalized);
    storeWebAssistantPlatform(CUSTOM_PLATFORM);
    void useLibraryStore.getState().saveWebAssistantPrefs({ platform: CUSTOM_PLATFORM, customUrl: normalized });
  };

  const handleCustomUrlKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commitCustomUrl();
    }
  };

  const handleRefresh = async () => {
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    setLoadState("loading");
    setLoadError(null);
    try {
      const result = await window.suyanApi.prepareWebAssistant({ platform, customUrl, reload: true });
      if (!result.ok) throw new Error(result.error.message);
      setLoadState("ready");
      onNotify({ type: "info", text: t("正在刷新当前网页。") });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("网页助手刷新失败，请重试。");
      setLoadState("error");
      setLoadError(message);
      onNotify({ type: "error", text: message });
    }
  };

  const handleOpenExternal = () => {
    const currentUrl = currentUrlFor(platform, committedCustomUrl);
    if (!currentUrl) return;
    void window.suyanApi.openExternalUrl(currentUrl).then((result) => {
      if (!result.ok) {
        onNotify({ type: "error", text: result.error.message });
      }
    });
  };

  const handleCopy = async () => {
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    const result = await window.suyanApi.executeWebAssistantScript(
      platform,
      "document.getElementById('prompt')?.value || ''",
      customUrl,
    );
    if (!result.ok) {
      onNotify({ type: "error", text: result.error.message });
      return;
    }
    const text = String(result.data.value ?? "");
    if (!text) {
      onNotify({ type: "info", text: t("文本框为空。") });
      return;
    }
    const clipboardResult = await window.suyanApi.writeClipboardText(text);
    if (clipboardResult.ok) {
      onNotify({ type: "info", text: t("已复制到剪贴板。") });
    }
  };

  const handlePaste = async () => {
    const clipboardResult = await window.suyanApi.readClipboardText();
    if (!clipboardResult.ok) {
      onNotify({ type: "error", text: clipboardResult.error.message });
      return;
    }
    const text = clipboardResult.data.text;
    if (!text) {
      onNotify({ type: "info", text: t("剪贴板为空。") });
      return;
    }
    // String.fromCharCode 纯 ASCII，可过主进程脚本白名单
    const charCodes = Array.from(text).map((c) => c.charCodeAt(0));
    const script = `document.getElementById('prompt').value = String.fromCharCode(${charCodes.join(",")})`;
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    const result = await window.suyanApi.executeWebAssistantScript(platform, script, customUrl);
    if (result.ok) {
      onNotify({ type: "info", text: t("已粘贴到文本框。") });
    } else {
      onNotify({ type: "error", text: result.error.message });
    }
  };

  const handleClear = async () => {
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    const result = await window.suyanApi.executeWebAssistantScript(
      platform,
      "document.getElementById('prompt').value = ''",
      customUrl,
    );
    if (result.ok) {
      onNotify({ type: "info", text: t("文本框已清空。") });
    } else {
      onNotify({ type: "error", text: result.error.message });
    }
  };

  const handleSave = async () => {
    const customUrl = platform === CUSTOM_PLATFORM ? committedCustomUrl : null;
    // 先读取文本框提示词
    const promptResult = await window.suyanApi.executeWebAssistantScript(
      platform,
      "document.getElementById('prompt')?.value || ''",
      customUrl,
    );
    const prompt = promptResult.ok ? String(promptResult.data.value ?? "") : "";
    // 截图 + 导入素材库
    const result = await window.suyanApi.importWebAssistantCapture(platform, {
      prompt,
      title: displayTitleFor(platform, t),
      customUrl,
    });
    if (!result.ok) {
      onNotify({ type: "error", text: result.error.message });
      return;
    }
    // 刷新素材库
    await useLibraryStore.getState().load();
    onNotify({ type: "success", text: t("已保存截图到素材库。") });
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchQuery = (text: string) => !normalizedQuery || text.toLowerCase().includes(normalizedQuery);
  const siteEntries = WEB_ASSISTANT_SITES.filter(
    (entry) => matchQuery(entry.title) || matchQuery(entry.url),
  );
  const savedEntries = savedUrls.filter((url) => matchQuery(url));
  const currentUrl = currentUrlFor(platform, committedCustomUrl);
  const currentTitle =
    platform === CUSTOM_PLATFORM && committedCustomUrl
      ? displaySavedUrl(committedCustomUrl)
      : displayTitleFor(platform, t);

  const statusLabel = loadState === "loading" ? t("连接中") : loadState === "error" ? t("加载失败") : t("已连接");
  const statusTone =
    loadState === "loading"
      ? "text-muted"
      : loadState === "error"
        ? "text-danger"
        : "text-success";

  const directoryPanel =
    isDirectoryOpen && directoryPosition
      ? createPortal(
          <>
            <div
              aria-hidden="true"
              className="app-window-overlay z-[199] bg-overlay/10"
              onClick={() => setIsDirectoryOpen(false)}
            />
            <div
            ref={directoryPanelRef}
            aria-label={t("站点目录")}
            className="fixed z-[200] flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-elevated"
            role="dialog"
            style={
              {
                height: "auto",
                left: directoryPosition.left,
                maxHeight: directoryPosition.maxHeight,
                top: directoryPosition.top,
                width: directoryPosition.width,
              } as CSSProperties
            }
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Compass size={15} className="shrink-0 text-primary" />
                <span className="text-xs font-semibold text-foreground">{t("站点目录")}</span>
                <span className="text-[10px] text-muted">{t("{count} 个站点", { count: siteEntries.length + savedEntries.length })}</span>
              </div>
              <IconTooltipButton
                ariaLabel={t("关闭站点目录")}
                icon={<X size={14} />}
                label={t("关闭站点目录")}
                size="sm"
                tooltipFlip={false}
                tooltipPlacement="below"
                variant="ghost"
                onClick={() => setIsDirectoryOpen(false)}
              />
            </div>
            <div className="grid shrink-0 gap-2 border-b border-border px-3 py-2.5 min-[620px]:grid-cols-[minmax(0,1fr)_minmax(190px,0.7fr)]">
              <label className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2.5">
                <Search size={13} className="shrink-0 text-muted" />
                <input
                  aria-label={t("搜索站点")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("搜索站点…")}
                  className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted"
                />
              </label>
              <div className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-background pl-2.5 pr-1">
                <input
                  aria-label={t("添加网址")}
                  type="url"
                  value={customUrlDraft}
                  onChange={(event) => setCustomUrlDraft(event.target.value)}
                  onKeyDown={handleCustomUrlKeyDown}
                  placeholder={t("添加自定义网址")}
                  className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted"
                />
                <button
                  type="button"
                  aria-label={t("保存网址")}
                  title={t("保存网址")}
                  onClick={commitCustomUrl}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-primary-soft hover:text-foreground"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div
              className="min-h-0 overflow-y-auto p-3"
              style={{ maxHeight: Math.max(160, directoryPosition.maxHeight - 100) }}
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{t("官方站点")}</p>
              <div className="grid gap-2 min-[460px]:grid-cols-2 min-[720px]:grid-cols-3">
                {siteEntries.map((entry) => (
                  <div key={entry.id} className="min-w-0">
                    <SiteChip
                      active={platform === entry.id}
                      title={entry.title}
                      url={entry.url}
                      tone={toneForKey(entry.id)}
                      onClick={() => selectTarget(entry.id)}
                    />
                  </div>
                ))}
              </div>
              {savedEntries.length > 0 ? (
                <>
                  <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{t("我的网址")}</p>
                  <div className="grid gap-2 min-[460px]:grid-cols-2 min-[720px]:grid-cols-3">
                    {savedEntries.map((url) => (
                      <div key={url} className="group/url relative min-w-0">
                        <SiteChip
                          active={platform === CUSTOM_PLATFORM && committedCustomUrl === url}
                          title={displaySavedUrl(url)}
                          url={url}
                          tone={toneForKey(url)}
                          onClick={() => selectCustomUrl(url)}
                        />
                        <button
                          type="button"
                          aria-label={t("删除：{url}", { url })}
                          title={t("删除网址")}
                          onClick={() => void removeWebAssistantCustomUrl(url)}
                          className="absolute right-0 top-0 inline-flex size-5 items-center justify-center rounded-full border border-border bg-panel text-muted opacity-100 transition-colors hover:border-danger hover:text-danger sm:opacity-0 sm:group-hover/url:opacity-100"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {siteEntries.length === 0 && savedEntries.length === 0 ? (
                <div className="flex min-h-28 items-center justify-center text-xs text-muted">{t("无匹配站点")}</div>
              ) : null}
            </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2.5">
      <header className="relative z-50 flex min-h-24 shrink-0 items-start gap-2 overflow-visible border-b border-border/75 pb-12">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-md bg-primary-soft text-primary">
            <Compass size={16} />
          </span>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-semibold text-foreground">{t("网页助手")}</p>
            <p className={`truncate text-[10px] ${statusTone}`}>{statusLabel}</p>
          </div>
        </div>

        <button
          data-feature-guide="web-assistant-directory"
          ref={directoryTriggerRef}
          type="button"
          aria-expanded={isDirectoryOpen}
          aria-haspopup="dialog"
          onClick={() => setIsDirectoryOpen((open) => !open)}
          className="inline-flex min-w-0 max-w-[min(18rem,42vw)] shrink-0 items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-1.5 text-left transition-colors hover:border-primary/45 hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          title={t("打开站点目录")}
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {siteMark(currentTitle)}
          </span>
          <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">{currentTitle}</span>
          <ChevronDown size={13} className="shrink-0 text-muted" />
        </button>

        <div className="hidden min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/75 bg-panel/55 px-2.5 py-1.5 min-[720px]:flex">
          <Globe size={13} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate text-[11px] text-muted">{currentUrl || t("请选择站点")}</span>
        </div>

        <div data-feature-guide="web-assistant-actions" className="ml-auto flex shrink-0 items-center gap-1">
          <span className={`mr-1 hidden items-center gap-1 text-[10px] min-[560px]:inline-flex ${statusTone}`}>
            <span className={`size-1.5 rounded-full ${loadState === "error" ? "bg-danger" : loadState === "loading" ? "bg-muted" : "bg-success"}`} />
            {statusLabel}
          </span>
          {loadState === "ready" ? (
            <>
              <IconTooltipButton
              ariaLabel={t("复制文本框内容")}
                icon={<Copy size={14} />}
              label={t("复制")}
                size="sm"
                tooltipFlip={false}
                tooltipPlacement="below"
                variant="ghost"
                onClick={() => void handleCopy()}
              />
              <IconTooltipButton
              ariaLabel={t("粘贴到文本框")}
                icon={<Clipboard size={14} />}
              label={t("粘贴")}
                size="sm"
                tooltipFlip={false}
                tooltipPlacement="below"
                variant="ghost"
                onClick={() => void handlePaste()}
              />
              <IconTooltipButton
              ariaLabel={t("清空文本框")}
                icon={<Trash2 size={14} />}
              label={t("清空")}
                size="sm"
                tooltipFlip={false}
                tooltipPlacement="below"
                variant="ghost"
                onClick={() => void handleClear()}
              />
              <span className="mx-1 h-5 w-px bg-border/60" />
              <IconTooltipButton
              ariaLabel={t("保存截图与提示词到素材库")}
                icon={<Save size={14} />}
              label={t("保存")}
                size="sm"
                tooltipFlip={false}
                tooltipPlacement="below"
                variant="ghost"
                onClick={() => void handleSave()}
              />
              <span className="mx-1 h-5 w-px bg-border/60" />
            </>
          ) : null}
          <IconTooltipButton
            ariaLabel={t("刷新当前网页")}
            disabled={!currentUrl || loadState === "loading"}
            icon={<RefreshCw size={14} />}
            label={t("刷新当前网页")}
            size="sm"
            tooltipFlip={false}
            tooltipPlacement="below"
            variant="ghost"
            onClick={() => void handleRefresh()}
          />
          <IconTooltipButton
            ariaLabel={t("在浏览器中打开")}
            disabled={!currentUrl}
            icon={<ExternalLink size={14} />}
            label={t("在浏览器中打开")}
            size="sm"
            tooltipFlip={false}
            tooltipPlacement="below"
            variant="ghost"
            onClick={handleOpenExternal}
          />
          <IconTooltipButton
            ariaLabel={isFocusMode ? t("退出专注模式") : t("专注模式")}
            active={isFocusMode}
            icon={isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            label={isFocusMode ? t("退出专注模式") : t("专注模式")}
            pressed={isFocusMode}
            size="sm"
            tooltipFlip={false}
            tooltipPlacement="below"
            variant="ghost"
            onClick={() => setIsFocusMode((focused) => !focused)}
          />
        </div>
      </header>

      <div
        data-feature-guide="web-assistant-view"
        ref={hostRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/80 bg-background"
      >
        {webSnapshot ? (
          <img
            src={webSnapshot}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-fill"
          />
        ) : null}
        {loadState === "loading" ? (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center bg-background text-muted">
            <div className="flex items-center gap-2 text-xs">
              <Loader2 size={15} className="animate-spin" />
              {t("正在连接 {title}", { title: currentTitle })}
            </div>
          </div>
        ) : null}
        {loadState === "error" ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
                <AlertCircle size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{t("网页助手暂时无法打开")}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{loadError ?? t("请检查网络连接后重试。")}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleRefresh()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-panel px-3 text-xs font-semibold text-foreground transition-colors hover:bg-primary-soft"
              >
                <RefreshCw size={13} />
                {t("重试")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {directoryPanel}
    </div>
  );
}
