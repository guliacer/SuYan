import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useId,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  BellOff,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  Film,
  GripVertical,
  ImagePlus,
  Info,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from "lucide-react";
import { MarqueeText } from "@/components/ui/MarqueeText";
import { Button } from "@/components/ui/Button";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { IconTooltipButton } from "@/components/ui/IconTooltipButton";
import { useLocale } from "@/components/LocaleProvider";
import { CanvasArtworkReveal, CanvasMotionBackdrop, canvasRevealDurationMs } from "./CanvasBackdrop";
import type {
  AiImageGenerationData,
  AiImageGenerationFormat,
  AiImageGenerationPayload,
  AiImageGenerationQuality,
  AiOptimizePromptPayload,
  PublicAiProviderSettings,
} from "../types/ai";
import type {
  CanvasAspectRatio,
  CanvasBaseResolution,
  CanvasDraftSettings,
  CanvasGenerationResult,
  CanvasPhase,
  CanvasReferenceImage,
  CanvasSizeMode,
  DoubaoWebCanvasStatus,
} from "../types/canvas";
import type { LibraryItem } from "../types/library";
import { useLibraryStore } from "../store/useLibraryStore";
import { getCanvasWaitingDelay, pickCanvasWaitingMessage } from "../utils/canvasWaitingMessages";
import {
  canvasAspectRatioOptions,
  buildCanvasImageGenerationPayload,
  doubaoModelOptions,
  doubaoStyleOptions,
  extractPromptKeywords,
  getCanvasGenerationSizeLabel,
  limitCanvasPromptText,
  maxCanvasResultsPanelWidth,
  maxCanvasPromptLength,
  maxCanvasCreationPanelWidth,
  minCanvasResultsPanelWidth,
  minCanvasCreationPanelWidth,
  normalizeCanvasCreationPanelWidth,
  normalizeCanvasResultsPanelWidth,
  replaceCanvasPromptSelection,
  resolveCanvasAtmosphereTone,
  resolveCanvasGenerationSize,
  shouldInheritCanvasPromptOrigin,
} from "../utils/canvasGeneration";
import type { CanvasAtmosphereTone } from "../utils/canvasGeneration";
import type { StatusFeedbackMessage } from "../utils/statusFeedback";
import { compactAutomaticPromptTitle } from "../../prompts/utils/promptTitle";
import { splitNegativePromptFromPrompt } from "../utils/promptAnalysis";

type CanvasViewProps = {
  aiSettings: PublicAiProviderSettings;
  canvasDraft: CanvasDraftSettings;
  isBusy: boolean;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
  generationResults: CanvasGenerationResult[];
  lastGenerationModel: string;
  lastGenerationCount: number;
  onGenerationResultsChange: (results: CanvasGenerationResult[]) => void;
  onLastGenerationModelChange: (model: string) => void;
  onCopyImage: (imageFileName: string) => Promise<void>;
  onGenerate: (payload: AiImageGenerationPayload) => Promise<AiImageGenerationData | null>;
  onPrepareDoubaoWebCanvas: () => Promise<DoubaoWebCanvasStatus | null>;
  onRefreshDoubaoWebCanvasAuth: () => Promise<DoubaoWebCanvasStatus | null>;
  onImportGeneratedImages: (
    images: AiImageGenerationData["images"],
    metadata: {
      title: string;
      prompt: string;
      negativePrompt: string;
      generationMethod: string;
      /** 命中来源血缘时继承的组身份，使新图与原提示词组算出同一个分组键。 */
      tags?: string[];
      category?: string | null;
      categoryId?: string | null;
      genreIds?: string[];
      categoryConfidence?: number | null;
      categorySource?: "system" | "user" | "ai" | "local" | null;
    },
  ) => Promise<LibraryItem[]>;
  onOpenAiSettings: () => void;
  onOptimizePrompt: (payload: AiOptimizePromptPayload) => Promise<string | null>;
  onSaveAiActionModelPreference: (
    action: "image-generation",
    selection: { profileId: string; modelId: string },
  ) => Promise<boolean>;
  onFullscreenPreviewChange: (open: boolean) => void;
  onNotify: (message: StatusFeedbackMessage) => void;
};


type PromptField = "positive" | "negative";
type ChangeSource = "typing" | "action";

const qualityOptions: Array<{ value: AiImageGenerationQuality; label: string }> = [
  { value: "auto", label: "自动质量" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];
const formatOptions: Array<{ value: AiImageGenerationFormat; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WEBP" },
];
const sizeModeOptions: Array<{ value: CanvasSizeMode; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "ratio", label: "按比例" },
  { value: "custom", label: "自定义宽高" },
];
const baseResolutionOptions: Array<{ value: CanvasBaseResolution; label: string }> = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "3k", label: "3K" },
  { value: "4k", label: "4K" },
];
const maxPromptHistory = 40;
const typingHistoryWindowMs = 900;
/** REVEAL 文案阶段；实际作品动效另等媒体加载完成后播放。 */
const revealPhaseMs = canvasRevealDurationMs;
/** 请求立即发起，给用户留出一小段稳定的「提示词解析」视觉阶段。 */
const promptParsingPhaseMs = 700;

function waitForCanvasPhaseWindow(startedAt: number, minimumMs: number): Promise<void> {
  const remainingMs = Math.max(0, minimumMs - (performance.now() - startedAt));
  if (remainingMs === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => window.setTimeout(resolve, remainingMs));
}

function formatElapsedDuration(elapsedMs: number, t: (text: string) => string): string {
  const totalSeconds = Math.max(0, elapsedMs) / 1000;
  if (totalSeconds < 60) {
    const precision = totalSeconds < 10 ? 1 : 0;
    return `${totalSeconds.toFixed(precision)} ${t("秒")}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} ${t("分")} ${String(seconds).padStart(2, "0")} ${t("秒")}`;
}

export function CanvasView({
  aiSettings,
  canvasDraft,
  generationResults: results,
  lastGenerationModel: lastModel,
  lastGenerationCount,
  isBusy,
  onDraftChange,
  onGenerationResultsChange,
  onLastGenerationModelChange,
  onCopyImage,
  onGenerate,
  onPrepareDoubaoWebCanvas,
  onRefreshDoubaoWebCanvasAuth,
  onImportGeneratedImages,
  onOpenAiSettings,
  onOptimizePrompt,
  onSaveAiActionModelPreference,
  onFullscreenPreviewChange,
  onNotify,
}: CanvasViewProps) {
  const { t } = useLocale();
  const positivePromptRef = useRef<HTMLTextAreaElement>(null);
  const negativePromptRef = useRef<HTMLTextAreaElement>(null);
  const creationPanelRef = useRef<HTMLDivElement | null>(null);
  const creationResizeStartRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const creationResizeWidthRef = useRef(canvasDraft.creationPanelWidth);
  const promptHistoryRef = useRef<Record<PromptField, string[]>>({ positive: [], negative: [] });
  const lastTypingRef = useRef<{ field: PromptField; at: number } | null>(null);
  const configMenuRef = useRef<HTMLDivElement | null>(null);
  const configMenuScrollRef = useRef<HTMLDivElement | null>(null);
  const selectedConfigOptionRef = useRef<HTMLButtonElement | null>(null);
  const referenceImageFileRef = useRef<HTMLInputElement | null>(null);
  const referenceImagePopoverRef = useRef<HTMLDivElement | null>(null);
  const hydratedFilesRef = useRef<Set<string>>(new Set());
  const latestImagesRef = useRef(canvasDraft.referenceImages);
  latestImagesRef.current = canvasDraft.referenceImages;
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const doubaoWebCanvasHostRef = useRef<HTMLDivElement | null>(null);
  const generationStartedAtRef = useRef<number | null>(null);
  const [optimizingField, setOptimizingField] = useState<PromptField | null>(null);
  // 生成相关状态提到 store：切到素材库卸载本组件后，再切回时新实例若读取局部
  // state 会丢失「创作中」而回退成上一张图。store 让生成态跨视图保留
  // （生成请求本身在主进程后台继续）。
  const isGenerating = useLibraryStore((state) => state.canvasIsGenerating);
  const setIsGenerating = useLibraryStore((state) => state.setCanvasGenerating);
  const canvasPromptUndoSnapshot = useLibraryStore((state) => state.canvasPromptUndoSnapshot);
  const setCanvasPromptUndoSnapshot = useLibraryStore((state) => state.setCanvasPromptUndoSnapshot);
  const phase = useLibraryStore((state) => state.canvasPhase);
  const thinkingKeywords = useLibraryStore((state) => state.canvasThinkingKeywords);
  const atmosphereTone = useLibraryStore((state) => state.canvasAtmosphereTone);
  const setPhase = useLibraryStore((state) => state.setCanvasPhase);
  const setThinkingKeywords = useLibraryStore((state) => state.setCanvasThinkingKeywords);
  const setAtmosphereTone = useLibraryStore((state) => state.setCanvasAtmosphereTone);
  const setGenerationRunId = useLibraryStore((state) => state.setCanvasGenerationRunId);
  const setCanvasLastGenerationCount = useLibraryStore((state) => state.setCanvasLastGenerationCount);
  const [errorText, setErrorText] = useState("");
  const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
  const [isGenerationSettingsOpen, setIsGenerationSettingsOpen] = useState(false);
  const [isReferenceImagePopoverOpen, setIsReferenceImagePopoverOpen] = useState(false);
  const [isImportingReferenceImage, setIsImportingReferenceImage] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [generationElapsedMs, setGenerationElapsedMs] = useState<number | null>(null);
  const [creationPanelHeight, setCreationPanelHeight] = useState<number | null>(null);
  const [liveCreationPanelWidth, setLiveCreationPanelWidth] = useState(canvasDraft.creationPanelWidth);
  const [isCreationResizing, setIsCreationResizing] = useState(false);
  const [liveResultsPanelWidth, setLiveResultsPanelWidth] = useState(canvasDraft.resultsPanelWidth);
  /** 手动收录进行中的结果索引；同一时刻只收录一张，null 表示空闲。 */
  const [archivingIndex, setArchivingIndex] = useState<number | null>(null);
  /** 自动收录整批进行中：仅这段时间内未落盘的结果才显示「归档中」角标。
   *  自动收录默认关闭时此状态恒为 false，生成完只是预览，不再常驻「归档中」。 */
  const [isArchivingBatch, setIsArchivingBatch] = useState(false);
  /**
   * 豆包后台生成流程的阶段：
   * - idle：非豆包模式；
   * - loading：正在加载豆包页并判定登录态；
   * - login：需要登录，豆包登录弹窗覆盖在右侧画布宿主上；
   * - ready：已登录，豆包页转入后台，右侧恢复原生画布。
   */
  const [doubaoStage, setDoubaoStage] = useState<"idle" | "loading" | "login" | "ready">("idle");

  const imageGenerationPreference = aiSettings.actionPreferences["image-generation"];
  const activeProfile = useMemo(() => {
    const preferredProfile = imageGenerationPreference?.profileId
      ? aiSettings.profiles.find((profile) => profile.id === imageGenerationPreference.profileId)
      : null;
    const fallbackProfile =
      aiSettings.profiles.find((profile) => profile.id === aiSettings.activeProfileId) ?? aiSettings.profiles[0];

    return preferredProfile ?? fallbackProfile;
  }, [aiSettings.activeProfileId, aiSettings.profiles, imageGenerationPreference?.profileId]);
  const selectedModel =
    imageGenerationPreference?.modelId || activeProfile?.model || aiSettings.model;
  useLayoutEffect(() => {
    if (!isConfigMenuOpen) return;
    const menu = configMenuScrollRef.current;
    const selected = selectedConfigOptionRef.current;
    if (!menu || !selected) return;

    // Only scroll this menu; scrollIntoView can also move the canvas page.
    // Run before paint on every opening, using both provider and model identity.
    const menuBounds = menu.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    menu.scrollTop += selectedBounds.top - menuBounds.top - menu.clientTop
      - (menu.clientHeight - selectedBounds.height) / 2;
  }, [isConfigMenuOpen, activeProfile?.id, selectedModel, aiSettings.profiles]);
  const selectedGenerationModel = activeProfile?.models.find((model) => model.id === selectedModel);
  const isVideoModel = Boolean(
    selectedGenerationModel?.capabilities.includes("video-generation") ||
      /^(?:agnes-video-v2\.0|agnes-video-2\.5(?:-flash)?)$/i.test(selectedModel.trim()),
  );
  const hasUsableApi = Boolean(
    activeProfile?.enabled &&
      activeProfile.provider !== "ollama" &&
      activeProfile.baseUrl &&
      activeProfile.hasApiKey &&
      (selectedGenerationModel?.capabilities.includes("image-generation") || isVideoModel),
  );
  const hasPendingResults = results.some((result) => !result.saved);
  const isDoubaoWeb = canvasDraft.generationProvider === "doubao-web";
  // 仅在需要登录时，豆包登录弹窗才覆盖右侧画布宿主；登录后转入后台、恢复原生画布。
  const doubaoLoginVisible = isDoubaoWeb && doubaoStage === "login";
  const isCreationPanelCollapsed = canvasDraft.creationPanelCollapsed;
  const isResultsPanelHidden = canvasDraft.resultsPanelHidden;

  useEffect(() => {
    setLiveCreationPanelWidth(canvasDraft.creationPanelWidth);
  }, [canvasDraft.creationPanelWidth]);

  useEffect(() => {
    setLiveResultsPanelWidth(canvasDraft.resultsPanelWidth);
  }, [canvasDraft.resultsPanelWidth]);

  useEffect(() => {
    if (!canvasPromptUndoSnapshot) {
      return;
    }

    // 详情页推送发生在 CanvasView 挂载前：把推送前的两段文本注入现有撤销历史，
    // 让画布里的正向/负向撤销按钮都能回到推送前的内容。
    promptHistoryRef.current = {
      positive: [canvasPromptUndoSnapshot.prompt],
      negative: [canvasPromptUndoSnapshot.negativePrompt],
    };
    lastTypingRef.current = null;
    setCanvasPromptUndoSnapshot(null);
  }, [canvasPromptUndoSnapshot, setCanvasPromptUndoSnapshot]);

  function toggleCreationPanel() {
    setIsConfigMenuOpen(false);
    setIsReferenceImagePopoverOpen(false);
    setIsMoreMenuOpen(false);
    onDraftChange({ creationPanelCollapsed: !isCreationPanelCollapsed });
  }

  function clampCreationPanelWidth(value: number): number {
    return normalizeCanvasCreationPanelWidth(value);
  }

  function updateCreationWidthFromPointer(clientX: number): void {
    const start = creationResizeStartRef.current;
    if (!start) {
      return;
    }
    const nextWidth = clampCreationPanelWidth(start.startWidth + (clientX - start.startX));
    creationResizeWidthRef.current = nextWidth;
    setLiveCreationPanelWidth(nextWidth);
  }

  function finishCreationResize(event?: ReactPointerEvent<HTMLDivElement>): void {
    const start = creationResizeStartRef.current;
    if (!start) {
      return;
    }
    if (event && event.currentTarget.hasPointerCapture(start.pointerId)) {
      event.currentTarget.releasePointerCapture(start.pointerId);
    }
    creationResizeStartRef.current = null;
    setIsCreationResizing(false);
    const nextWidth = clampCreationPanelWidth(creationResizeWidthRef.current);
    setLiveCreationPanelWidth(nextWidth);
    onDraftChange({ creationPanelWidth: nextWidth });
  }

  function handleCreationResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    let delta = 0;
    if (event.key === "ArrowLeft") delta = -16;
    if (event.key === "ArrowRight") delta = 16;
    if (event.key === "Home") delta = minCanvasCreationPanelWidth - liveCreationPanelWidth;
    if (event.key === "End") delta = maxCanvasCreationPanelWidth - liveCreationPanelWidth;
    if (delta === 0) return;
    event.preventDefault();
    const nextWidth = clampCreationPanelWidth(liveCreationPanelWidth + delta);
    setLiveCreationPanelWidth(nextWidth);
    onDraftChange({ creationPanelWidth: nextWidth });
  }

  // 右侧结果区沿用创作面板的实际高度，避免竖图的固有高度把网格行向下撑开。
  useLayoutEffect(() => {
    // A hidden panel must not replace the last expanded measurement with zero.
    if (isCreationPanelCollapsed) return;
    const panel = creationPanelRef.current;
    if (!panel) {
      return;
    }
    const updateHeight = () => {
      const nextHeight = Math.round(panel.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setCreationPanelHeight(nextHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [isCreationPanelCollapsed]);

  useEffect(() => {
    const images = canvasDraft.referenceImages;
    const pending = images.filter((img) => img.fileName && !img.dataUrl && !hydratedFilesRef.current.has(img.fileName));
    if (pending.length === 0) {
      return;
    }

    for (const img of pending) {
      hydratedFilesRef.current.add(img.fileName);
    }

    let disposed = false;
    void Promise.allSettled(
      pending.map((img) =>
        window.suyanApi.readCanvasReferenceImage(img.fileName).then((result) => {
          if (disposed) {
            return null;
          }
          if (!result.ok) {
            onDraftChange({
              referenceImages: latestImagesRef.current.filter((r) => r.fileName !== img.fileName),
            });
            onNotify({ type: "error", text: t("参考图 \"{name}\" 加载失败：{error}", { name: img.title || img.fileName, error: result.error.message }) });
            return null;
          }
          return { fileName: img.fileName, dataUrl: result.data.dataUrl, title: img.title || result.data.title };
        }),
      ),
    ).then((settled) => {
      if (disposed) {
        return;
      }
      const patches: Array<{ fileName: string; dataUrl: string; title: string }> = [];
      for (const s of settled) {
        if (s.status === "fulfilled" && s.value) {
          patches.push(s.value);
        }
      }
      if (patches.length === 0) {
        return;
      }
      const next = latestImagesRef.current.map((r) => {
        const patch = patches.find((p) => p.fileName === r.fileName);
        return patch ? { ...r, dataUrl: patch.dataUrl, title: patch.title } : r;
      });
      onDraftChange({ referenceImages: next });
    });

    return () => {
      disposed = true;
    };
  }, [canvasDraft.referenceImages, onDraftChange, onNotify]);

  // 进入 / 离开豆包模式：加载豆包页并判定登录态，登录成功后转 ready（后台生成）。
  useEffect(() => {
    if (!isDoubaoWeb) {
      setDoubaoStage("idle");
      void window.suyanApi.hideDoubaoWebCanvas();
      return;
    }
    let disposed = false;
    setDoubaoStage("loading");
    void onPrepareDoubaoWebCanvas().then((status) => {
      if (disposed) {
        return;
      }
      // 准备失败时也退回原生画布视图，让用户能重试或改用 API。
      setDoubaoStage(!status || status.authenticated ? "ready" : "login");
    });
    return () => {
      disposed = true;
      void window.suyanApi.hideDoubaoWebCanvas();
    };
  }, [isDoubaoWeb, onPrepareDoubaoWebCanvas]);

  // 登录弹窗可见期间轮询登录态；一旦豆包完成登录，立即切回原生画布。
  useEffect(() => {
    if (!isDoubaoWeb || doubaoStage !== "login") {
      return;
    }
    let disposed = false;
    const timer = setInterval(() => {
      void onRefreshDoubaoWebCanvasAuth().then((status) => {
        if (!disposed && status?.authenticated) {
          setDoubaoStage("ready");
        }
      });
    }, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [isDoubaoWeb, doubaoStage, onRefreshDoubaoWebCanvasAuth]);

  // 豆包模式下始终保持画布宿主 bounds 同步，让后端在「生成期间可见」时能精确定位 view。
  // 登录弹窗可见时由后端 showDoubaoWebCanvas 显示；生成时由后端 restoreViewBounds 显示；
  // 其它时候 view 在屏外，右侧展示原生画布。这里只负责把宿主坐标同步给主进程，不主动显示。
  useLayoutEffect(() => {
    if (!isDoubaoWeb) {
      return;
    }
    const host = doubaoWebCanvasHostRef.current;
    if (!host) {
      return;
    }
    let disposed = false;
    const syncBounds = () => {
      if (disposed) {
        return;
      }
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        return;
      }
      void window.suyanApi.setDoubaoWebCanvasBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    const resizeObserver = new ResizeObserver(syncBounds);
    resizeObserver.observe(host);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);
    syncBounds();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);
    };
  }, [isDoubaoWeb]);

  // 仅登录弹窗可见时主动 showDoubaoWebCanvas（把 view 从屏外拉回画布宿主）。
  useLayoutEffect(() => {
    if (!doubaoLoginVisible) {
      return;
    }
    void window.suyanApi.showDoubaoWebCanvas();
  }, [doubaoLoginVisible]);

  useEffect(() => {
    if (!isConfigMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (configMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsConfigMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsConfigMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isConfigMenuOpen]);

  useEffect(() => {
    // 详情卡片把效果图传送到画布后，画布首次挂载时自动展开参考图弹窗。
    if (canvasDraft.referenceImages.length > 0) {
      setIsReferenceImagePopoverOpen(true);
    }
  }, [canvasDraft.referenceImages.length]);

  useEffect(() => {
    if (!isReferenceImagePopoverOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (referenceImagePopoverRef.current?.contains(event.target as Node) || target?.closest("[data-reference-image-toggle]")) {
        return;
      }
      setIsReferenceImagePopoverOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsReferenceImagePopoverOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isReferenceImagePopoverOpen]);

  useEffect(() => {
    if (previewIndex !== null && previewIndex >= results.length) {
      setPreviewIndex(null);
      onFullscreenPreviewChange(false);
    }
  }, [onFullscreenPreviewChange, previewIndex, results.length]);

  useEffect(() => {
    return () => onFullscreenPreviewChange(false);
  }, [onFullscreenPreviewChange]);

  useEffect(() => {
    if (!isMoreMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (moreMenuRef.current?.contains(event.target as Node) || target?.closest("[data-more-menu-toggle]")) {
        return;
      }
      setIsMoreMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMoreMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreMenuOpen]);

  // 空闲态（非 thinking/generating/reveal）时，让 phase 跟随结果数量：
  // 外部（如详情页推送、清空）改变 results 也能落到正确的静止态。
  useEffect(() => {
    if (phase === "thinking" || phase === "generating" || phase === "reveal") {
      return;
    }
    const next: CanvasPhase = results.length > 0 ? "created" : "empty";
    if (next !== phase) {
      setPhase(next);
    }
    // phase 取自 store，但这里只对 results 变化做校正，避免把 phase 加入触发循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length]);

  // 全屏预览键盘导航：← 上一张 / → 下一张 / Esc 关闭。
  useEffect(() => {
    if (previewIndex === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewIndex(null);
        onFullscreenPreviewChange(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        setPreviewIndex((index) => (index === null ? index : (index - 1 + results.length) % results.length));
      } else if (event.key === "ArrowRight") {
        setPreviewIndex((index) => (index === null ? index : (index + 1) % results.length));
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onFullscreenPreviewChange, previewIndex, results.length]);

  function getFieldText(field: PromptField): string {
    return field === "positive" ? canvasDraft.prompt : canvasDraft.negativePrompt;
  }

  function updateFieldText(field: PromptField, nextText: string, source: ChangeSource): boolean {
    const limitedText = limitCanvasPromptText(nextText);
    const currentText = getFieldText(field);
    if (limitedText === currentText) {
      return limitedText !== nextText;
    }

    const now = Date.now();
    const lastTyping = lastTypingRef.current;
    const shouldRecord = source === "action" || !lastTyping || lastTyping.field !== field || now - lastTyping.at > typingHistoryWindowMs;
    if (shouldRecord) {
      const history = promptHistoryRef.current[field];
      promptHistoryRef.current[field] = [...history, currentText].slice(-maxPromptHistory);
    }
    lastTypingRef.current = source === "typing" ? { field, at: now } : null;
    onDraftChange(field === "positive" ? { prompt: limitedText } : { negativePrompt: limitedText });
    return limitedText !== nextText;
  }

  function undoFieldChange(field: PromptField): void {
    const history = promptHistoryRef.current[field];
    const previousText = history.at(-1);
    if (previousText === undefined) {
      onNotify({ type: "info", text: field === "positive" ? t("正向提示词暂无可返回的上一步。") : t("负向提示词暂无可返回的上一步。") });
      return;
    }

    promptHistoryRef.current[field] = history.slice(0, -1);
    lastTypingRef.current = null;
    onDraftChange(field === "positive" ? { prompt: previousText } : { negativePrompt: previousText });
    onNotify({ type: "success", text: t("已返回上一步。") });
  }

  async function copyFieldText(field: PromptField): Promise<void> {
    const text = getFieldText(field);
    if (!text) {
      onNotify({ type: "info", text: t("文本框为空，没有可复制的内容。") });
      return;
    }

    const result = await window.suyanApi.writeClipboardText(text);
    if (result.ok) {
      onNotify({ type: "success", text: field === "positive" ? t("已复制正向提示词。") : t("已复制负向提示词。") });
      return;
    }
    onNotify({ type: "error", text: t("复制失败，请检查系统剪贴板权限。") });
  }

  async function pasteAllFieldText(field: PromptField): Promise<void> {
    const result = await window.suyanApi.readClipboardText();
    if (!result.ok) {
      onNotify({ type: "error", text: t("读取剪贴板失败，请检查系统剪贴板权限。") });
      return;
    }

    const pastedText = result.data.text;
    if (!pastedText) {
      onNotify({ type: "info", text: t("剪贴板中没有文本内容。") });
      return;
    }

    // 从正向提示词粘贴时，把带标签或内联的负向约束拆到负向提示词框。
    // 没有新的负向约束时也要清空旧内容，避免把上一段创作的规则误带过来。
    // 负向提示词自己的粘贴按钮保持原样粘贴，方便用户输入完整的负向规则。
    const splitPrompt = field === "positive"
      ? splitNegativePromptFromPrompt(pastedText, "")
      : null;
    const promptSourceText = splitPrompt?.prompt ?? pastedText;
    const nextText = limitCanvasPromptText(promptSourceText);
    const negativeSourceText = splitPrompt?.negativePrompt ?? null;
    const nextNegativeText = negativeSourceText === null ? null : limitCanvasPromptText(negativeSourceText);
    const wasTruncated = nextText !== promptSourceText || nextNegativeText !== negativeSourceText;

    // 粘贴前先清空当前文本框，避免叠在旧内容后面。
    const textareaRef = field === "positive" ? positivePromptRef : negativePromptRef;
    updateFieldText(field, nextText, "action");
    if (nextNegativeText !== null && nextNegativeText !== canvasDraft.negativePrompt) {
      updateFieldText("negative", nextNegativeText, "action");
    }
    // 负向提示词即使被自动拆出，也默认保持收起；用户可按需点击眼睛按钮查看。
    if (splitPrompt) {
      onDraftChange({ negativePromptHidden: true });
    }
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextText.length, nextText.length);
    });
    onNotify({
      type: wasTruncated ? "info" : "success",
      text: wasTruncated ? t("提示词最多支持 3000 字，超出部分未粘贴。") : t("已从剪贴板粘贴。"),
    });
  }

  async function pasteSelectedText(field: PromptField, event: ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    event.preventDefault();
    const textarea = event.currentTarget;
    const currentText = getFieldText(field);
    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const result = await window.suyanApi.readClipboardText();
    if (!result.ok) {
      onNotify({ type: "error", text: t("读取剪贴板失败，请检查系统剪贴板权限。") });
      return;
    }

    const pastedText = result.data.text;
    if (!pastedText) {
      onNotify({ type: "info", text: t("剪贴板中没有文本内容。") });
      return;
    }

    const replacement = replaceCanvasPromptSelection(currentText, pastedText, selectionStart, selectionEnd);
    updateFieldText(field, replacement.text, "action");
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(replacement.selectionStart, replacement.selectionEnd);
    });
    onNotify({
      type: replacement.truncated ? "info" : "success",
      text: replacement.truncated ? t("提示词最多支持 3000 字，超出部分未粘贴。") : t("已粘贴到选区。"),
    });
  }

  async function optimizeFieldText(field: PromptField): Promise<void> {
    const text = getFieldText(field).trim();
    if (!text) {
      onNotify({ type: "info", text: t("请先输入需要优化的提示词。") });
      return;
    }
    if (optimizingField) {
      return;
    }

    setOptimizingField(field);
    try {
      const optimizedPrompt = await onOptimizePrompt({
        prompt: text,
        promptKind: field,
      });
      if (optimizedPrompt?.trim()) {
        const wasTruncated = updateFieldText(field, optimizedPrompt.trim(), "action");
        if (wasTruncated) {
          onNotify({ type: "info", text: t("提示词最多支持 3000 字，超出部分已截断。") });
        }
      }
    } finally {
      setOptimizingField(null);
    }
  }

  function clearFieldText(field: PromptField): void {
    if (!getFieldText(field)) {
      onNotify({ type: "info", text: t("文本框已经是空的。") });
      return;
    }
    updateFieldText(field, "", "action");
    onNotify({ type: "success", text: field === "positive" ? t("已清空正向提示词。") : t("已清空负向提示词。") });
  }

  function handlePickReferenceImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    setIsImportingReferenceImage(true);
    let pending = 0;
    const onFinish = () => {
      pending -= 1;
      if (pending <= 0) {
        setIsImportingReferenceImage(false);
      }
    };
    for (const file of files) {
      pending += 1;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (dataUrl) {
          void persistReferenceImage(dataUrl, file.name, files.length > 1 ? t("已添加 {count} 张参考图。", { count: files.length }) : t("已添加参考图。"), false);
        }
        onFinish();
      };
      reader.onerror = () => {
        onNotify({ type: "error", text: t("读取图片“{name}”失败。", { name: file.name }) });
        onFinish();
      };
      reader.readAsDataURL(file);
    }
    event.target.value = "";
  }

  async function handlePasteReferenceImage(): Promise<void> {
    setIsImportingReferenceImage(true);
    try {
      const result = await window.suyanApi.readClipboardImage();
      if (!result.ok) {
        onNotify({ type: "error", text: t("剪贴板中没有可用图片。") });
        return;
      }
      await persistReferenceImage(
        result.data.dataUrl,
        "剪贴板图片.png",
        t("已从剪贴板添加参考图。"),
        false,
      );
    } finally {
      setIsImportingReferenceImage(false);
    }
  }

  function handleRemoveReferenceImage(fileName: string): void {
    onDraftChange({ referenceImages: canvasDraft.referenceImages.filter((r) => r.fileName !== fileName) });
    if (fileName) {
      void window.suyanApi.removeCanvasReferenceImage(fileName);
    }
    onNotify({ type: "info", text: t("已移除参考图。") });
  }

  async function persistReferenceImage(
    dataUrl: string,
    sourceFileName: string,
    successMessage: string,
    manageBusyState = true,
  ): Promise<void> {
    if (manageBusyState) {
      setIsImportingReferenceImage(true);
    }
    try {
      const result = await window.suyanApi.saveCanvasReferenceImage(dataUrl, sourceFileName);
      if (!result.ok) {
        onNotify({ type: "error", text: result.error.message });
        return;
      }
      const entry: CanvasReferenceImage = {
        dataUrl: result.data.dataUrl,
        fileName: result.data.fileName,
        title: result.data.title,
      };
      onDraftChange({ referenceImages: [...latestImagesRef.current, entry] });
      onNotify({ type: "success", text: successMessage });
    } finally {
      if (manageBusyState) {
        setIsImportingReferenceImage(false);
      }
    }
  }

  async function handleGenerate() {
    const cleanPrompt = canvasDraft.prompt.trim();
    if (!cleanPrompt) {
      setErrorText(t("请先写下你想生成的画面。"));
      return;
    }
    if (!isDoubaoWeb && !hasUsableApi) {
      const message = activeProfile?.provider === "ollama"
        ? t("Ollama 当前仅支持文本和图像分析，不能用于生图，请选择生图 API。")
        : t("请先在模型配置中启用一个配置，并填写 API Key。");
      setErrorText(message.trim());
      onNotify({ type: "error", text: activeProfile?.provider === "ollama" ? message : t("还没有可用的图像生成配置，请先打开模型配置。") });
      onOpenAiSettings();
      return;
    }
    if (isGenerating) {
      return;
    }

    if (isDoubaoWeb) {
      // 后台生成前先确认豆包登录态：会话过期时切回登录弹窗，而不是空跑一次失败。
      const status = await onRefreshDoubaoWebCanvasAuth();
      if (!status?.authenticated) {
        setDoubaoStage("login");
        setErrorText(t("请先在画布内完成豆包登录，登录后会自动切回原生画布。"));
        onNotify({ type: "info", text: t("请先在画布内完成豆包登录。") });
        return;
      }
    }

    // 阶段一：THINKING —— 立即开始真实请求，同时短播「理解你的想法」，二者并行，
    // 不再把 1600ms 延迟串行叠加到总耗时上。上一批会话预览保留到新结果成功就位；
    // 新请求失败时不会清空旧预览，避免一次失败就丢掉上一批可见的成果。
    setErrorText("");
    setThinkingKeywords(extractPromptKeywords(cleanPrompt));
    setAtmosphereTone(resolveCanvasAtmosphereTone(cleanPrompt));
    const generationRunId = useLibraryStore.getState().canvasGenerationRunId + 1;
    setGenerationRunId(generationRunId);
    generationStartedAtRef.current = performance.now();
    setGenerationElapsedMs(null);
    setPhase("thinking");
    setIsGenerating(true);
    void runGeneration(cleanPrompt, generationRunId);
  }

  async function runGeneration(cleanPrompt: string, generationRunId: number) {
    const isCurrentRun = () => useLibraryStore.getState().canvasGenerationRunId === generationRunId;
    const parsingStartedAt = performance.now();
    // 请求立即发起；短暂的 thinking 视觉阶段与真实网络请求并行。
    // 页面卸载不会取消这个计时器，返回画布时 store 仍能得到正确的生成阶段。
    const parsingTimer = window.setTimeout(() => {
      const state = useLibraryStore.getState();
      if (
        state.canvasGenerationRunId === generationRunId &&
        state.canvasIsGenerating &&
        state.canvasPhase === "thinking"
      ) {
        setPhase("generating");
      }
    }, promptParsingPhaseMs);
    // 反向提示词按用户填写原样发送并入库：不再追加去水印约束，
    // 否则库里存的反向提示词与用户所写不一致，回传画布重生成时后缀还会累加。
    const effectiveNegativePrompt = canvasDraft.negativePrompt.trim();
    // 「传送到画布」后提示词一字未改 → 继承来源组身份，新图归入原提示词组；
    // 改过（或本就是自由创作）→ 按当前提示词建立新的标题。
    const origin = canvasDraft.promptOrigin;
    const inheritsOrigin = shouldInheritCanvasPromptOrigin(origin, cleanPrompt, effectiveNegativePrompt);
    try {
      const data = await onGenerate(buildCanvasImageGenerationPayload(canvasDraft, {
        apiProfileId: activeProfile?.id,
        apiModelId: selectedModel,
        mediaType: isVideoModel ? "video" : "image",
        prompt: cleanPrompt,
        negativePrompt: effectiveNegativePrompt,
      }));
      // 快速接口也要完成一次可感知的「提示词进入画布」阶段；这里等待的是视觉窗口，
      // 真实请求早已在上面启动，不会把网络请求延迟到 thinking 结束后才发送。
      await waitForCanvasPhaseWindow(parsingStartedAt, promptParsingPhaseMs);
      if (!isCurrentRun()) {
        return;
      }
      if (!data) {
        // 用户主动取消或调用方提前返回空：保留旧预览，不强行清空成空态。
        setPhase(useLibraryStore.getState().canvasGenerationResults.length > 0 ? "created" : "empty");
        return;
      }
      if (data.images.length === 0) {
        setErrorText(t("接口没有返回可保存的{media}，请检查模型和接口地址。", { media: isVideoModel ? t("视频") : t("图片") }));
        // 接口返回但无图：这种是配置/接口问题，清成空态更明确；旧预览保留意义不大。
        setPhase(useLibraryStore.getState().canvasGenerationResults.length > 0 ? "created" : "empty");
        return;
      }

      // 快照本次真正提交的提示词：模型未返回 revised_prompt 时，预览卡片才有东西可显示；
      // 生成后用户继续编辑草稿也不会让已有结果显示成另一段提示词。
      const previewResults: CanvasGenerationResult[] = data.images.map((image) => ({
        ...image,
        saved: false,
        generationBatchId: generationRunId,
        requestPrompt: cleanPrompt,
        requestNegativePrompt: effectiveNegativePrompt,
      }));
      onLastGenerationModelChange(data.model);
      setCanvasLastGenerationCount(previewResults.length);
      // 生成结果是当前运行期间的累计作品流：新批次追加到末尾，不能替换已经展示的批次。
      const existingResults = useLibraryStore.getState().canvasGenerationResults;
      onGenerationResultsChange([...existingResults, ...previewResults]);
      // 阶段三：REVEAL —— 结果就位后播 ~500ms 揭示动画，随后进入 CREATED。
      setPhase("reveal");
      window.setTimeout(() => {
        const state = useLibraryStore.getState();
        if (state.canvasGenerationRunId === generationRunId && state.canvasPhase === "reveal") {
          setPhase("created");
        }
      }, revealPhaseMs);
      // 自动收录为素材：默认关闭，用户在画布顶部手动开启后才走入库链路。
      // 关闭时结果只在画布预览（导出/复制走 dataUrl 无需 imageFileName），不再自动落盘。
      if (!canvasDraft.autoArchiveEnabled) {
        return;
      }
      if (!isCurrentRun()) {
        return;
      }
      setIsArchivingBatch(true);
      const savedItems = await onImportGeneratedImages(data.images, {
        title: compactAutomaticPromptTitle(cleanPrompt),
        prompt: cleanPrompt,
        negativePrompt: effectiveNegativePrompt,
        generationMethod: data.model,
        // 身份字段：继承时原样带上，使新图与原提示词组的分组键完全一致。
        ...(inheritsOrigin && origin
          ? {
              tags: origin.tags,
              category: origin.category,
              categoryId: origin.categoryId,
              genreIds: origin.genreIds,
              categoryConfidence: origin.categoryConfidence,
              categorySource: origin.categorySource,
            }
          : {}),
      });
      if (isCurrentRun() && savedItems.length === data.images.length) {
        const currentResults = useLibraryStore.getState().canvasGenerationResults;
        onGenerationResultsChange(currentResults.map((existing) => {
          const identityIndex = previewResults.indexOf(existing);
          const previewIndex = identityIndex >= 0
            ? identityIndex
            : previewResults.findIndex((candidate) => candidate.dataUrl === existing.dataUrl);
          if (previewIndex < 0 || !savedItems[previewIndex]?.imageFileName) {
            return existing;
          }
          return {
            ...existing,
            imageFileName: savedItems[previewIndex].imageFileName,
            saved: true,
          };
        }));
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return;
      }
      const message = error instanceof Error ? error.message : t("生成图片失败，请稍后重试。");
      setErrorText(message);
      onNotify({ type: "error", text: message });
      // 新请求失败：保留上一批可见的预览结果，而不是清成空态；
      // 用户可基于上一批重新调整提示词后重试，不会一次失败就丢成果。
      setPhase(useLibraryStore.getState().canvasGenerationResults.length > 0 ? "created" : "empty");
    } finally {
      window.clearTimeout(parsingTimer);
      if (isCurrentRun()) {
        setIsGenerating(false);
        setIsArchivingBatch(false);
        const startedAt = generationStartedAtRef.current;
        if (startedAt !== null) {
          setGenerationElapsedMs(Math.max(0, performance.now() - startedAt));
          generationStartedAtRef.current = null;
        }
      }
    }
  }

  const exportingResultRef = useRef(false);
  async function handleDownloadResult(result: CanvasGenerationResult, _index: number): Promise<void> {
    if (exportingResultRef.current) return;
    exportingResultRef.current = true;
    onNotify({ type: "info", text: t("请选择作品保存位置。") });
    try {
      const response = await window.suyanApi.exportImage(result.saved && result.imageFileName ? result.imageFileName : {
        dataUrl: result.dataUrl, attributionId: result.attributionId, mediaType: result.mediaType,
        prompt: result.requestPrompt ?? result.revisedPrompt ?? "",
        negativePrompt: result.requestNegativePrompt ?? "",
        generationMethod: lastModel,
      });
      if (!response.ok) onNotify({ type: "error", text: response.error.message });
      else onNotify({ type: response.data.canceled ? "info" : "success", text: response.data.canceled ? t("已取消导出。") : t("作品已导出。") });
    } catch {
      onNotify({ type: "error", text: t("导出失败，请重试。生成结果仍保留在画布中。") });
    } finally { exportingResultRef.current = false; }
  }

  /**
   * 把单张生成结果手动收录到素材库。落盘完成后回填 imageFileName 并标记 saved，
   * 让导出/复制按钮可用。重复点击已收录的图按 idempotent 处理（直接提示已入库）。
   *
   * 收录用的元数据与自动收录链路完全一致：当前正负提示词、来源血缘继承、模型名。
   * 这样手动收录与「开启自动收录」之后的图会落进同一个分组逻辑。
   */
  async function handleArchiveResult(result: CanvasGenerationResult, index: number): Promise<void> {
    if (result.saved) {
      onNotify({ type: "info", text: t("这张图已收录到素材库。") });
      return;
    }
    if (archivingIndex === index) {
      return;
    }
    setArchivingIndex(index);
    try {
      // 收录用产出这张图时的提示词快照，而不是当前草稿：生成后改了草稿再点收录，
      // 落库的提示词必须仍是这张图真正用的那一段。
      const cleanPrompt = result.requestPrompt?.trim() || canvasDraft.prompt.trim();
      const effectiveNegativePrompt = result.requestNegativePrompt?.trim() ?? canvasDraft.negativePrompt.trim();
      const origin = canvasDraft.promptOrigin;
      const inheritsOrigin = shouldInheritCanvasPromptOrigin(origin, cleanPrompt, effectiveNegativePrompt);
      // 单张收录：只把这一张图交给入库链路，savedItems 期望返回 1 条。
      const savedItems = await onImportGeneratedImages(
        [{ dataUrl: result.dataUrl, revisedPrompt: result.revisedPrompt, attributionId: result.attributionId, mediaType: result.mediaType }],
        {
          title: compactAutomaticPromptTitle(cleanPrompt),
          prompt: cleanPrompt,
          negativePrompt: effectiveNegativePrompt,
          generationMethod: lastModel || canvasDraft.generationProvider,
          ...(inheritsOrigin && origin
            ? {
                tags: origin.tags,
                category: origin.category,
                categoryId: origin.categoryId,
                genreIds: origin.genreIds,
                categoryConfidence: origin.categoryConfidence,
                categorySource: origin.categorySource,
              }
            : {}),
        },
      );

      const savedItem = savedItems[0];
      if (savedItem?.imageFileName) {
        // 回填这一张：收录等待期间可能已经追加新批次，必须读取当前数组，不能使用
        // 旧渲染闭包里的 results 覆盖后来追加的作品。结果数组只追加不重排，原索引稳定。
        const currentResults = useLibraryStore.getState().canvasGenerationResults;
        const targetIndex = currentResults[index]?.dataUrl === result.dataUrl
          ? index
          : currentResults.findIndex((existing) => existing === result);
        if (targetIndex < 0) {
          onNotify({ type: "error", text: t("这张生成结果已不存在，请刷新后重试。") });
          return;
        }
        onGenerationResultsChange(
          currentResults.map((existing, existingIndex) =>
            existingIndex === targetIndex
              ? { ...existing, imageFileName: savedItem.imageFileName, saved: true }
              : existing,
          ),
        );
        onNotify({ type: "success", text: t("已收录到素材库。") });
      } else {
        onNotify({ type: "error", text: t("收录失败，请稍后重试。") });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("收录失败，请稍后重试。");
      onNotify({ type: "error", text: message });
    } finally {
      setArchivingIndex(null);
    }
  }

  /**
   * 将当前画布中尚未收录的生成结果一次性写入素材库，并回填每张结果的正式文件名。
   * 已收录结果会跳过，避免用户重复点击导出时产生重复素材。
   */
  async function handleArchiveAllResults(): Promise<void> {
    if (isArchivingBatch || archivingIndex !== null) {
      return;
    }

    // 记录这次点击时的原始位置。生成结果只追加到数组末尾，因此即使收录等待期间
    // 有新批次完成，原批次的位置仍稳定；回填时再读取 store 当前数组，不能写回旧闭包。
    const pendingResultIndices = results.reduce<number[]>((indices, result, index) => {
      if (!result.saved) {
        indices.push(index);
      }
      return indices;
    }, []);
    const pendingResults = pendingResultIndices.map((index) => results[index]);
    if (pendingResults.length === 0) {
      onNotify({
        type: "info",
        text: results.length === 0 ? t("当前没有可导出的生成结果。") : t("生成结果已全部收录到素材库。"),
      });
      return;
    }

    setIsArchivingBatch(true);
    try {
      // 整批共用这次点击时第一张待收录作品的提示词快照；生成结果会跨批次累计，
      // 缺快照时才回退到当前草稿。
      const snapshot = pendingResults[0];
      const cleanPrompt = snapshot?.requestPrompt?.trim() || canvasDraft.prompt.trim();
      const effectiveNegativePrompt = snapshot?.requestNegativePrompt?.trim() ?? canvasDraft.negativePrompt.trim();
      const origin = canvasDraft.promptOrigin;
      const inheritsOrigin = shouldInheritCanvasPromptOrigin(origin, cleanPrompt, effectiveNegativePrompt);
      const savedItems = await onImportGeneratedImages(
        pendingResults.map((result) => ({
          dataUrl: result.dataUrl,
          attributionId: result.attributionId,
          revisedPrompt: result.revisedPrompt,
          ...(result.mediaType ? { mediaType: result.mediaType } : {}),
        })),
        {
          title: compactAutomaticPromptTitle(cleanPrompt),
          prompt: cleanPrompt,
          negativePrompt: effectiveNegativePrompt,
          generationMethod: lastModel || selectedModel || canvasDraft.generationProvider,
          ...(inheritsOrigin && origin
            ? {
                tags: origin.tags,
                category: origin.category,
                categoryId: origin.categoryId,
                genreIds: origin.genreIds,
                categoryConfidence: origin.categoryConfidence,
                categorySource: origin.categorySource,
              }
            : {}),
        },
      );

      if (savedItems.length !== pendingResults.length || savedItems.some((item) => !item.imageFileName)) {
        throw new Error(`导出不完整：应保存 ${pendingResults.length} 个生成结果，实际保存 ${savedItems.length} 个。`);
      }

      const currentResults = useLibraryStore.getState().canvasGenerationResults;
      onGenerationResultsChange(
        currentResults.map((result, resultIndex) => {
          const pendingIndex = pendingResultIndices.indexOf(resultIndex);
          if (pendingIndex < 0 || result.saved) {
            return result;
          }
          const savedItem = savedItems[pendingIndex];
          return {
            ...result,
            imageFileName: savedItem.imageFileName,
            saved: true,
          };
        }),
      );
      onNotify({ type: "success", text: t("已导出 {count} 个生成结果到素材库。", { count: pendingResults.length }) });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("导出失败，请稍后重试。");
      onNotify({ type: "error", text: message });
    } finally {
      setIsArchivingBatch(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-none px-3 py-4 min-[640px]:px-5 min-[900px]:px-6 min-[1024px]:px-8 min-[1440px]:px-10 min-[1024px]:py-6">
      <div className="canvas-page-heading mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium tracking-wide text-muted">
            <Sparkles size={14} />
            {t("创意画布")}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("把灵感变成画面")}</h1>
        </div>
      </div>

      <div
        className="canvas-layout relative grid items-stretch gap-4"
        data-sidebar-collapsed={isCreationPanelCollapsed}
        data-results-hidden={isResultsPanelHidden}
        style={{
          "--canvas-creation-width": `${liveCreationPanelWidth}px`,
          "--canvas-results-width": `${liveResultsPanelWidth}px`,
        } as CSSProperties}
      >
        <div className="canvas-sidebar-toggle" aria-label={t("画布侧栏控制")}>
          <IconTooltipButton
            aria-controls="canvas-creation-panel"
            aria-expanded={!isCreationPanelCollapsed}
            data-feature-guide="canvas-creation-panel-toggle"
            icon={isCreationPanelCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            label={isCreationPanelCollapsed ? t("展开创作侧栏") : t("收起创作侧栏")}
            onClick={toggleCreationPanel}
            tooltipAlign={isCreationPanelCollapsed ? "start" : "end"}
            variant="ghost"
          />
          <IconTooltipButton
            aria-controls="canvas-results-panel"
            aria-expanded={!isResultsPanelHidden}
            data-feature-guide="canvas-results-panel-toggle"
            icon={isResultsPanelHidden ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
            label={isResultsPanelHidden ? t("显示作品展示区") : t("隐藏作品展示区")}
            onClick={() => onDraftChange({ resultsPanelHidden: !isResultsPanelHidden })}
            tooltipAlign={isCreationPanelCollapsed ? "start" : "end"}
            variant="ghost"
          />
        </div>
        <div
          id="canvas-creation-panel"
          aria-label={t("创作参数")}
          role="region"
          hidden={isCreationPanelCollapsed}
          inert={isCreationPanelCollapsed}
          className="relative self-start rounded-3xl border border-border bg-panel p-4 min-[640px]:p-5"
          ref={creationPanelRef}
        >
          <div
            aria-label={t("调整创作区宽度")}
            aria-orientation="vertical"
            aria-valuemax={maxCanvasCreationPanelWidth}
            aria-valuemin={minCanvasCreationPanelWidth}
            aria-valuenow={liveCreationPanelWidth}
            className={`canvas-creation-resize-handle absolute -right-2 top-0 z-10 hidden h-full w-4 cursor-col-resize items-center justify-center touch-none lg:flex ${isCreationResizing ? "is-resizing" : ""}`}
            onKeyDown={handleCreationResizeKeyDown}
            onPointerCancel={finishCreationResize}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              creationResizeStartRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: liveCreationPanelWidth,
              };
              creationResizeWidthRef.current = liveCreationPanelWidth;
              setIsCreationResizing(true);
            }}
            onPointerMove={(event) => updateCreationWidthFromPointer(event.clientX)}
            onPointerUp={finishCreationResize}
            role="separator"
            tabIndex={0}
            title={t("拖动调整创作区宽度")}
          >
            <GripVertical aria-hidden="true" className="text-muted/80" size={14} />
          </div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">{t("创作")}</h2>
            </div>
            <span className="size-9 shrink-0" aria-hidden="true" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-muted" htmlFor="canvas-prompt">{t("描述你想创作的画面")}</label>
          </div>

          <PromptTextField
              field="positive"
              label=""
              placeholder={t("描述主体、场景、光线、镜头和风格…")}
              textareaRef={positivePromptRef}
              value={canvasDraft.prompt}
              height={canvasDraft.positivePromptHeight}
              onHeightChange={(height) => onDraftChange({ positivePromptHeight: height })}
              canUndo={promptHistoryRef.current.positive.length > 0}
              isOptimizing={optimizingField === "positive"}
              disabled={isBusy || optimizingField !== null}
              onChange={(value) => updateFieldText("positive", value, "typing")}
              onClear={() => clearFieldText("positive")}
              onCopy={() => void copyFieldText("positive")}
              onOptimize={() => void optimizeFieldText("positive")}
              onPasteAll={() => void pasteAllFieldText("positive")}
              onKeyboardPaste={(event) => void pasteSelectedText("positive", event)}
              onUndo={() => undoFieldChange("positive")}
              actionRows={
                <div data-feature-guide="canvas-prompt-actions" className="mt-2 flex items-stretch gap-1.5" aria-label={t("提示词操作")}>
                  <button
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/40 bg-primary/10 px-2 text-xs font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={optimizingField !== null}
                    onClick={() => void optimizeFieldText("positive")}
                    type="button"
                  >
                    {optimizingField === "positive" ? <LoaderCircle className="animate-spin" size={14} /> : <WandSparkles size={14} />}
                    {optimizingField === "positive" ? t("优化中…") : t("优化")}
                  </button>
                  <button
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-medium text-foreground transition hover:border-primary/45 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={optimizingField !== null}
                    onClick={() => void pasteAllFieldText("positive")}
                    type="button"
                  >
                    <ClipboardPaste size={14} />
                    {t("粘贴")}
                  </button>
                  <button
                    aria-expanded={isReferenceImagePopoverOpen}
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-medium text-foreground transition hover:border-primary/45 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    onClick={() => setIsReferenceImagePopoverOpen((open) => !open)}
                    type="button"
                  >
                    <ImagePlus size={14} />
                    {t("参考图")}
                  </button>
                  <div className="relative" ref={moreMenuRef}>
                    <button
                      aria-expanded={isMoreMenuOpen}
                      aria-label={t("更多提示词操作")}
                      className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-muted transition hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      data-more-menu-toggle="true"
                      onClick={() => setIsMoreMenuOpen((open) => !open)}
                      type="button"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {isMoreMenuOpen ? (
                      <div className="absolute bottom-full right-0 z-30 mb-2 w-36 overflow-hidden rounded-xl border border-border bg-panel p-1 shadow-elevated">
                        <PromptMoreMenuItem icon={<Copy size={14} />} label={t("复制")} onClick={() => { setIsMoreMenuOpen(false); void copyFieldText("positive"); }} />
                        <PromptMoreMenuItem disabled={!promptHistoryRef.current.positive.length} icon={<Undo2 size={14} />} label={t("撤销")} onClick={() => { setIsMoreMenuOpen(false); undoFieldChange("positive"); }} />
                        <PromptMoreMenuItem icon={<Trash2 size={14} />} label={t("清空")} onClick={() => { setIsMoreMenuOpen(false); clearFieldText("positive"); }} tone="danger" />
                      </div>
                    ) : null}
                  </div>
                </div>
              }
              floatingOverlay={
                <>
                  {canvasDraft.referenceImages.length > 0 ? (
                    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-end">
                      <div className="pointer-events-auto relative flex max-w-[260px] flex-wrap gap-1 rounded-lg border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur-sm">
                        {canvasDraft.referenceImages.map((image) => (
                          <div key={image.fileName} className="relative overflow-hidden rounded-md">
                            <img
                              alt={image.title || t("参考图")}
                              className="max-h-14 w-auto max-w-[80px] object-contain"
                              src={image.dataUrl}
                            />
                            <button
                              aria-label={t("移除参考图")}
                              className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-full bg-background/90 text-muted shadow-sm transition hover:text-danger"
                              onClick={() => handleRemoveReferenceImage(image.fileName)}
                              type="button"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {isReferenceImagePopoverOpen ? (
                    <CanvasReferenceImagePopover
                      innerRef={referenceImagePopoverRef}
                      isImporting={isImportingReferenceImage}
                      referenceImages={canvasDraft.referenceImages}
                      onClose={() => setIsReferenceImagePopoverOpen(false)}
                      onImportFromClipboard={() => void handlePasteReferenceImage()}
                      onImportFromLocal={() => referenceImageFileRef.current?.click()}
                      onRemove={handleRemoveReferenceImage}
                    />
                  ) : null}
                </>
              }
            />
          <input
            accept="image/*"
            className="hidden"
            multiple
            onChange={handlePickReferenceImage}
            ref={referenceImageFileRef}
            type="file"
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-muted" htmlFor="canvas-negative-prompt">{t("负向提示词（可选）")}</label>
            <button
              aria-expanded={!canvasDraft.negativePromptHidden}
              aria-label={canvasDraft.negativePromptHidden ? t("显示负向提示词") : t("隐藏负向提示词")}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => onDraftChange({ negativePromptHidden: !canvasDraft.negativePromptHidden })}
              type="button"
            >
              {canvasDraft.negativePromptHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          {!canvasDraft.negativePromptHidden ? (
            <PromptTextField
              field="negative"
              iconOnlyActions
              label=""
              placeholder={t("不希望出现的内容…")}
              textareaRef={negativePromptRef}
              value={canvasDraft.negativePrompt}
              canUndo={promptHistoryRef.current.negative.length > 0}
                isOptimizing={optimizingField === "negative"}
              disabled={isBusy || optimizingField !== null}
              onChange={(value) => updateFieldText("negative", value, "typing")}
              onClear={() => clearFieldText("negative")}
              onCopy={() => void copyFieldText("negative")}
              onOptimize={() => void optimizeFieldText("negative")}
              onPasteAll={() => void pasteAllFieldText("negative")}
              onKeyboardPaste={(event) => void pasteSelectedText("negative", event)}
              onUndo={() => undoFieldChange("negative")}
            />
          ) : null}

          <CanvasGenerationSettingsButton
            canvasDraft={canvasDraft}
            isVideoModel={isVideoModel}
            onOpen={() => setIsGenerationSettingsOpen(true)}
          />

          {isDoubaoWeb ? (
            <DoubaoWebOptionsPanel
              model={canvasDraft.doubaoModel}
              style={canvasDraft.doubaoStyle}
              modelHidden={canvasDraft.doubaoModelHidden}
              styleHidden={canvasDraft.doubaoStyleHidden}
              onModelChange={(doubaoModel) => onDraftChange({ doubaoModel })}
              onStyleChange={(doubaoStyle) => onDraftChange({ doubaoStyle })}
              onToggleModelHidden={() => onDraftChange({ doubaoModelHidden: !canvasDraft.doubaoModelHidden })}
              onToggleStyleHidden={() => onDraftChange({ doubaoStyleHidden: !canvasDraft.doubaoStyleHidden })}
            />
          ) : null}

          <div data-feature-guide="canvas-model-config" className="relative mt-4" ref={configMenuRef}>
            <button
              aria-expanded={isConfigMenuOpen}
              className="w-full rounded-2xl border border-border/80 bg-background/70 p-3 text-left text-xs text-muted transition hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => setIsConfigMenuOpen((open) => !open)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span>{t("当前配置")}</span>
                <span className="flex items-center gap-1.5">
                  <span className={hasUsableApi ? "text-success" : "text-danger"}>
                    {hasUsableApi ? t("可用") : t("待配置")}
                  </span>
                  <ChevronDown className={`transition-transform ${isConfigMenuOpen ? "rotate-180" : ""}`} size={14} />
                </span>
              </div>
              <div className="mt-2 min-w-0 text-foreground">
                <MarqueeText text={`${activeProfile?.name ?? t("未选择配置")} · ${selectedModel || t("未选择模型")}`} />
              </div>
            </button>

            {isConfigMenuOpen ? (
              <div ref={configMenuScrollRef} className="absolute inset-x-0 bottom-full z-30 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-panel p-2 shadow-elevated">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-2 border-b border-border/70 px-2 pb-2 text-[11px] font-semibold text-muted">
                  <span>{t("服务商")}</span>
                  <span>{t("模型")}</span>
                </div>
                {(() => {
                  const imageGenerationProfiles = aiSettings.profiles
                    .filter((profile) => profile.enabled)
                    .map((profile) => ({
                      profile,
                      models: profile.models.filter((model) =>
                        model.capabilities.includes("image-generation") || model.capabilities.includes("video-generation"),
                      ),
                    }))
                    .filter((entry) => entry.models.length > 0);

                  if (imageGenerationProfiles.length === 0) {
                    return null;
                  }

                  return imageGenerationProfiles.flatMap(({ profile, models }) =>
                    models.map((model) => {
                      const isSelected = profile.id === activeProfile?.id && model.id === selectedModel;
                      return (
                        <button
                          className={`grid min-h-10 w-full grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-2 rounded-lg px-2.5 text-left text-xs transition hover:bg-primary/5 ${isSelected ? "bg-primary/10 text-primary" : "text-foreground"}`}
                          key={`${profile.id}:${model.id}`}
                          ref={isSelected ? selectedConfigOptionRef : undefined}
                          aria-current={isSelected ? "true" : undefined}
                          onClick={() => {
                            onDraftChange({ generationProvider: "api" });
                            void onSaveAiActionModelPreference("image-generation", { profileId: profile.id, modelId: model.id });
                            setIsConfigMenuOpen(false);
                          }}
                          type="button"
                        >
                          <span className="min-w-0 truncate font-medium">{profile.name || t("未命名 API")}</span>
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <MarqueeText className="min-w-0 flex-1" text={model.label || model.id} />
                            {isSelected ? <Check className="shrink-0" size={14} /> : null}
                          </span>
                        </button>
                      );
                    }),
                  );
                })()}
                <div className="mt-2 border-t border-border/70 pt-2">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-primary transition hover:bg-primary/5"
                    onClick={() => {
                      setIsConfigMenuOpen(false);
                      onOpenAiSettings();
                    }}
                    type="button"
                  >
                    <Settings2 size={14} />
                    {t("打开完整模型配置")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {errorText ? <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">{errorText}</p> : null}

          <div data-feature-guide="canvas-generation-actions" className="mt-4 flex items-center gap-2">
            <button
              aria-checked={canvasDraft.autoArchiveEnabled}
              aria-label={canvasDraft.autoArchiveEnabled ? t("关闭：生成后自动收录到素材库") : t("开启：生成后自动收录到素材库")}
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                canvasDraft.autoArchiveEnabled
                  ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-muted hover:border-primary/40 hover:text-foreground"
              }`}
              onClick={() => onDraftChange({ autoArchiveEnabled: !canvasDraft.autoArchiveEnabled })}
              role="switch"
              title={t("自动收录到素材库")}
              type="button"
            >
              {canvasDraft.autoArchiveEnabled ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
            <button
              aria-checked={canvasDraft.notificationEnabled}
              aria-label={canvasDraft.notificationEnabled ? t("关闭完成提醒") : t("开启完成提醒")}
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                canvasDraft.notificationEnabled
                  ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-muted hover:border-primary/40 hover:text-foreground"
              }`}
              onClick={() => onDraftChange({ notificationEnabled: !canvasDraft.notificationEnabled })}
              role="switch"
              title={t("生成完成后通知手机")}
              type="button"
            >
              {canvasDraft.notificationEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <Button
              aria-label={t("导出到素材库")}
              className="shrink-0"
              disabled={
                isGenerating ||
                isBusy ||
                optimizingField !== null ||
                isArchivingBatch ||
                archivingIndex !== null ||
                !hasPendingResults
              }
              icon={isArchivingBatch ? <LoaderCircle className="animate-spin" size={16} /> : <Inbox size={16} />}
              onClick={() => void handleArchiveAllResults()}
              title={t("导出到素材库")}
              variant="secondary"
            >
              {t("导出")}
            </Button>
            <Button
              aria-label={t("生成图像")}
              className="flex-1"
              disabled={isGenerating || isBusy || optimizingField !== null}
              icon={isGenerating ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />}
              onClick={() => void handleGenerate()}
              variant="primary"
            >
              {phase === "thinking" ? t("理解中…") : phase === "generating" ? t("创作中…") : results.length > 0 ? t("重新生成") : isVideoModel ? t("生成视频") : t("生成图像")}
            </Button>
          </div>
        </div>

        {isGenerationSettingsOpen ? (
          <CanvasGenerationSettingsDialog
            canvasDraft={canvasDraft}
            isVideoModel={isVideoModel}
            onClose={() => setIsGenerationSettingsOpen(false)}
            onDraftChange={onDraftChange}
          />
        ) : null}

        <CreativeCanvas
          webCanvasEnabled={isDoubaoWeb}
          webCanvasLoginVisible={doubaoLoginVisible}
          webCanvasLoading={isDoubaoWeb && doubaoStage === "loading"}
          webCanvasHostRef={doubaoWebCanvasHostRef}
          phase={phase}
          lastModel={lastModel}
          currentGenerationCount={lastGenerationCount}
          results={results}
          thinkingKeywords={thinkingKeywords}
          atmosphereTone={atmosphereTone}
          generationElapsedMs={generationElapsedMs}
          lockedHeight={isCreationPanelCollapsed ? null : creationPanelHeight}
          onOpenPreview={(index) => {
            setPreviewIndex(index);
            onFullscreenPreviewChange(true);
          }}
          onDownload={handleDownloadResult}
          onCopyImage={onCopyImage}
          onArchive={handleArchiveResult}
          archivingIndex={archivingIndex}
          archivingBatch={isArchivingBatch}
        />

        {!isResultsPanelHidden ? (
          <CanvasResultsPanel
            results={results}
            lockedHeight={isCreationPanelCollapsed ? null : creationPanelHeight}
            width={liveResultsPanelWidth}
            onWidthPreview={setLiveResultsPanelWidth}
            onWidthCommit={(width) => {
              const nextWidth = normalizeCanvasResultsPanelWidth(width);
              setLiveResultsPanelWidth(nextWidth);
              onDraftChange({ resultsPanelWidth: nextWidth });
            }}
            onOpenPreview={(index) => {
              setPreviewIndex(index);
              onFullscreenPreviewChange(true);
            }}
          />
        ) : null}
      </div>

      {previewIndex !== null && results[previewIndex] ? (
        <CanvasFullscreenPreview
          result={results[previewIndex]}
          index={previewIndex}
          total={results.length}
          lastModel={lastModel}
          onPrev={() => setPreviewIndex((i) => (i === null ? i : (i - 1 + results.length) % results.length))}
          onNext={() => setPreviewIndex((i) => (i === null ? i : (i + 1) % results.length))}
          onClose={() => {
            setPreviewIndex(null);
            onFullscreenPreviewChange(false);
          }}
          generationElapsedMs={generationElapsedMs}
          onDownload={() => handleDownloadResult(results[previewIndex], previewIndex)}
          onCopyImage={onCopyImage}
          onArchive={handleArchiveResult}
          archivingIndex={archivingIndex}
        />
      ) : null}
    </section>
  );
}

type CanvasReferenceImagePopoverProps = {
  innerRef: RefObject<HTMLDivElement | null>;
  isImporting: boolean;
  referenceImages: CanvasReferenceImage[];
  onClose: () => void;
  onImportFromClipboard: () => void;
  onImportFromLocal: () => void;
  onRemove: (fileName: string) => void;
};

function CanvasReferenceImagePopover({
  innerRef,
  isImporting,
  referenceImages,
  onClose,
  onImportFromClipboard,
  onImportFromLocal,
  onRemove,
}: CanvasReferenceImagePopoverProps) {
  const { t } = useLocale();
  return (
    <div
      ref={innerRef}
      className="absolute bottom-2 right-2 z-20 flex w-80 flex-col gap-3 rounded-xl border border-border bg-panel p-3 shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ImagePlus size={14} />
          {t("参考图")} ({referenceImages.length})
        </span>
        <button
          aria-label={t("关闭")}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      {referenceImages.length > 0 ? (
        <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border bg-background/60 p-2">
          {referenceImages.map((image) => (
            <div key={image.fileName} className="relative overflow-hidden rounded-md border border-border/60">
              <img
                alt={image.title || t("参考图")}
                className="aspect-square w-full rounded-md object-cover"
                decoding="async"
                src={image.dataUrl}
              />
              {image.title ? (
                <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
                  {image.title}
                </div>
              ) : null}
              <button
                aria-label={t("删除参考图")}
                className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-background/90 text-muted shadow-sm transition hover:text-danger"
                type="button"
                onClick={() => onRemove(image.fileName)}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-5 text-center text-xs text-muted">
          {/* 无参考图 */}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isImporting}
          type="button"
          onClick={onImportFromClipboard}
        >
          <ClipboardPaste size={13} />
          {t("粘贴剪贴板")}
        </button>
        <button
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isImporting}
          type="button"
          onClick={onImportFromLocal}
        >
          <ImagePlus size={13} />
          {t("本地上传")}
        </button>
      </div>
      {isImporting ? <p role="status" className="text-xs text-muted">{t("正在添加参考图，请稍候…")}</p> : null}
    </div>
  );
}

type PromptTextFieldProps = {
  canUndo: boolean;
  disabled: boolean;
  field: PromptField;
  isOptimizing: boolean;
  label: string;
  placeholder: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onCopy: () => void;
  onOptimize: () => void;
  onPasteAll: () => void;
  onKeyboardPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onUndo: () => void;
  actionRows?: ReactNode;
  floatingOverlay?: ReactNode;
  height?: number;
  iconOnlyActions?: boolean;
  onHeightChange?: (height: number) => void;
  extraActions?: ReactNode;
};

function PromptTextField({
  canUndo,
  disabled,
  field,
  isOptimizing,
  label,
  placeholder,
  textareaRef,
  value,
  onChange,
  onClear,
  onCopy,
  onOptimize,
  onPasteAll,
  onKeyboardPaste,
  onUndo,
  actionRows,
  floatingOverlay,
  extraActions,
  height,
  iconOnlyActions = false,
  onHeightChange,
}: PromptTextFieldProps) {
  const { t } = useLocale();
  const textareaId = field === "positive" ? "canvas-prompt" : "canvas-negative-prompt";
  const heightRef = useRef(height);
  const onHeightChangeRef = useRef(onHeightChange);
  heightRef.current = height;
  onHeightChangeRef.current = onHeightChange;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !onHeightChangeRef.current) {
      return;
    }

    const reportHeight = () => {
      const nextHeight = Math.round(textarea.getBoundingClientRect().height);
      // The inline height is the persisted value. Ignore the observer's initial
      // callback and any reflow that merely reflects that same value.
      if (nextHeight <= 0 || nextHeight === heightRef.current) {
        return;
      }
      onHeightChangeRef.current?.(nextHeight);
    };

    const observer = new ResizeObserver(reportHeight);
    observer.observe(textarea);
    reportHeight();
    return () => {
      // Flush a drag that ended immediately before the page switched and the
      // observer had a chance to deliver its notification.
      reportHeight();
      observer.disconnect();
    };
  }, [textareaRef]);

  return (
    <div className={label ? "" : "mt-2"}>
      <div data-feature-guide={field === "positive" ? "canvas-prompt-editor" : undefined}>
        {label ? <label className="mb-2 block text-xs font-medium text-muted" htmlFor={textareaId}>{label}</label> : null}
        <div className="relative">
          <textarea
            className={`${field === "positive" ? "min-h-48" : "min-h-20"} w-full resize-y rounded-2xl border border-border bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20`}
            data-feature-guide={field === "positive" ? "canvas-prompt-resize" : undefined}
            id={textareaId}
            maxLength={maxCanvasPromptLength}
            onChange={(event) => onChange(event.target.value)}
            onPaste={onKeyboardPaste}
            placeholder={placeholder}
            ref={textareaRef}
            value={value}
            style={height === undefined ? undefined : { height: `${height}px` }}
          />
          {floatingOverlay}
        </div>
      </div>
      <div
        className={`mt-1 flex justify-end px-1 text-[11px] tabular-nums ${value.length >= maxCanvasPromptLength ? "text-warning" : "text-muted"}`}
        title={t("提示词最多 3000 字")}
      >
        {t("提示词字数：{count}/{max}", { count: value.length, max: maxCanvasPromptLength })}
      </div>
      {actionRows ?? (
        <div className="mt-2 grid grid-cols-5 gap-1.5" aria-label={`${label || t("负向提示词")}${t("操作")}`}>
          <PromptActionButton icon={<Copy size={14} />} iconOnly={iconOnlyActions} label={t("复制")} onClick={onCopy} />
          <PromptActionButton icon={<ClipboardPaste size={14} />} iconOnly={iconOnlyActions} label={t("粘贴")} onClick={onPasteAll} />
          <PromptActionButton disabled={disabled} icon={isOptimizing ? <LoaderCircle className="animate-spin" size={14} /> : <WandSparkles size={14} />} iconOnly={iconOnlyActions} label={isOptimizing ? t("优化中") : t("优化")} onClick={onOptimize} />
          <PromptActionButton disabled={!canUndo} icon={<Undo2 size={14} />} iconOnly={iconOnlyActions} label={t("返回")} onClick={onUndo} />
          <PromptActionButton icon={<Trash2 size={14} />} iconOnly={iconOnlyActions} label={t("清空")} onClick={onClear} tone="danger" />
        </div>
      )}
      {extraActions}
    </div>
  );
}

type PromptActionButtonProps = {
  ariaExpanded?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  iconOnly?: boolean;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
};

function PromptActionButton({ ariaExpanded, disabled = false, icon, iconOnly = false, label, onClick, tone = "default" }: PromptActionButtonProps) {
  const { t } = useLocale();
  return (
    <button
      aria-label={label === t("返回") ? t("撤销最近一次更改") : label}
      className={`inline-flex min-h-8 min-w-0 items-center justify-center gap-1 rounded-lg border text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-45 ${
        iconOnly ? "size-8 px-0 py-0" : "px-1.5 py-1.5"
      } ${
        tone === "danger"
          ? "border-danger/25 bg-danger/5 text-danger hover:bg-danger/10"
          : "border-border bg-background text-muted hover:border-primary/45 hover:bg-primary/5 hover:text-foreground"
      }`}
      aria-expanded={ariaExpanded}
      data-reference-image-toggle={ariaExpanded === undefined ? undefined : "true"}
      disabled={disabled}
      onClick={onClick}
      title={label === t("返回") ? t("撤销最近一次更改") : label}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span className={iconOnly ? "sr-only" : "truncate"}>{label}</span>
    </button>
  );
}

type CanvasSizePanelProps = {
  canvasDraft: CanvasDraftSettings;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
};

type CanvasGenerationSettingsButtonProps = {
  canvasDraft: CanvasDraftSettings;
  isVideoModel: boolean;
  onOpen: () => void;
};

function CanvasGenerationSettingsButton({
  canvasDraft,
  isVideoModel,
  onOpen,
}: CanvasGenerationSettingsButtonProps) {
  const { t } = useLocale();
  const summary = formatCanvasGenerationSettingsSummary(canvasDraft, isVideoModel, t);

  return (
    <button
      aria-haspopup="dialog"
      data-feature-guide="canvas-generation-settings"
      className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-border/80 bg-background/70 px-3 py-2.5 text-left text-xs text-muted transition hover:border-primary/45 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      onClick={onOpen}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2">
        <SlidersHorizontal size={15} className="shrink-0 text-primary" />
        <span className="font-semibold text-foreground">{isVideoModel ? t("视频参数") : t("图像参数")}</span>
        <span className="min-w-0 truncate font-semibold text-foreground">{summary}</span>
      </span>
      <ChevronDown className="-rotate-90 shrink-0 text-muted" size={14} />
    </button>
  );
}

type CanvasGenerationSettingsDialogProps = {
  canvasDraft: CanvasDraftSettings;
  isVideoModel: boolean;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
  onClose: () => void;
};

function CanvasGenerationSettingsDialog({
  canvasDraft,
  isVideoModel,
  onDraftChange,
  onClose,
}: CanvasGenerationSettingsDialogProps) {
  const { t } = useLocale();
  const titleId = "canvas-generation-settings-title";
  const resolvedSizeLabel = getCanvasGenerationSizeLabel(resolveCanvasGenerationSize(canvasDraft));

  return (
    <AppDialog
      onClose={onClose}
      panelClassName="flex max-h-[min(720px,calc(100vh-72px))] w-full max-w-xl flex-col"
      titleId={titleId}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-medium text-primary">
            <SlidersHorizontal size={14} />
            {t("画布参数")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground" id={titleId}>
            {t("生成设置")}
          </h2>
        </div>
        <DialogCloseButton onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {isVideoModel ? (
          <CanvasVideoSettingsContent canvasDraft={canvasDraft} onDraftChange={onDraftChange} />
        ) : (
          <div className="space-y-5">
            <CanvasSizePanel canvasDraft={canvasDraft} onDraftChange={onDraftChange} />
            <CanvasAdvancedPanel canvasDraft={canvasDraft} onDraftChange={onDraftChange} />
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-muted">{t("实际分辨率")}</span>
            <span className="font-semibold tabular-nums text-foreground">{isVideoModel ? canvasDraft.videoSize : resolvedSizeLabel}</span>
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 justify-end border-t border-border/70 px-5 py-4">
        <Button onClick={onClose} variant="primary">{t("完成")}</Button>
      </footer>
    </AppDialog>
  );
}

function CanvasVideoSettingsContent({
  canvasDraft,
  onDraftChange,
}: {
  canvasDraft: CanvasDraftSettings;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <Film size={14} className="text-primary" />
        {t("视频参数")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted">
          {t("时长")}
          <select
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            value={canvasDraft.videoSeconds}
            onChange={(event) => onDraftChange({ videoSeconds: Number(event.target.value) })}
          >
            {[4, 5, 6, 8, 10, 12].map((seconds) => <option key={seconds} value={seconds}>{seconds} {t("秒")}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted">
          {t("分辨率")}
          <select
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            value={canvasDraft.videoSize}
            onChange={(event) => onDraftChange({ videoSize: event.target.value as CanvasDraftSettings["videoSize"] })}
          >
            <option value="720P">720P</option>
            <option value="960P">960P</option>
            <option value="2K">2K</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted">
          {t("画幅")}
          <select
            className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
            value={canvasDraft.aspectRatio}
            onChange={(event) => onDraftChange({ aspectRatio: event.target.value as CanvasAspectRatio })}
          >
            {canvasAspectRatioOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted">{t("参考图会自动按首尾帧模式发送；超过两张时使用参考图模式。")}</p>
    </section>
  );
}

function CanvasSizePanel({ canvasDraft, onDraftChange }: CanvasSizePanelProps) {
  const { t } = useLocale();
  const resolvedSizeLabel = getCanvasGenerationSizeLabel(resolveCanvasGenerationSize(canvasDraft));

  return (
    <section aria-labelledby="canvas-size-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-xs font-semibold text-foreground" id="canvas-size-heading">{t("比例")}</h3>
            <span className="text-[11px] font-medium tabular-nums text-primary">{resolvedSizeLabel}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
        {sizeModeOptions.map((option) => (
          <button
            className={`min-h-8 rounded-lg px-2 text-xs font-medium transition ${canvasDraft.sizeMode === option.value ? "bg-panel text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
            key={option.value}
            onClick={() => onDraftChange({ sizeMode: option.value })}
            type="button"
          >
            {t(option.label)}
          </button>
        ))}
      </div>

      {canvasDraft.sizeMode !== "auto" ? (
        <>
          {canvasDraft.sizeMode === "ratio" ? (
            <>
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted">{t("基准分辨率")}</p>
                <div className="grid grid-cols-4 gap-2">
                  {baseResolutionOptions.map((option) => (
                    <ResolutionButton
                      active={canvasDraft.baseResolution === option.value}
                      key={option.value}
                      label={t(option.label)}
                      onClick={() => onDraftChange({ baseResolution: option.value })}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted">{t("图像比例")}</p>
                <div className="grid grid-cols-4 gap-2">
                  {canvasAspectRatioOptions.map((option) => (
                    <button
                      aria-pressed={canvasDraft.aspectRatio === option.value}
                      className={`flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs transition ${canvasDraft.aspectRatio === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted hover:border-primary/45 hover:text-foreground"}`}
                      key={option.value}
                      onClick={() => onDraftChange({ aspectRatio: option.value })}
                      type="button"
                    >
                      <span className={`block border ${canvasDraft.aspectRatio === option.value ? "border-primary" : "border-muted"} ${getAspectIconClass(option.value)}`} aria-hidden="true" />
                      <span>{t(option.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted">{t("自定义宽高")}</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <DimensionInput label={t("宽度")} value={canvasDraft.customWidth} onChange={(customWidth) => onDraftChange({ customWidth })} />
                <span className="pb-2.5 text-xs text-muted">×</span>
                <DimensionInput label={t("高度")} value={canvasDraft.customHeight} onChange={(customHeight) => onDraftChange({ customHeight })} />
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

type CanvasAdvancedPanelProps = {
  canvasDraft: CanvasDraftSettings;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
};

function CanvasAdvancedPanel({ canvasDraft, onDraftChange }: CanvasAdvancedPanelProps) {
  const { t } = useLocale();
  return (
    <section className="border-t border-border/70 pt-4" aria-labelledby="canvas-advanced-heading">
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground" id="canvas-advanced-heading">
            <SlidersHorizontal size={13} />
            {t("高级设置")}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CanvasSelect
          label={t("透明背景")}
          onChange={(value) => onDraftChange({
            transparentBackground: value === "on",
            outputFormat: value === "on" && canvasDraft.outputFormat === "jpeg" ? "png" : canvasDraft.outputFormat,
          })}
          options={[
            { value: "off", label: t("不透明") },
            { value: "on", label: t("透明") },
          ]}
          value={canvasDraft.transparentBackground ? "on" : "off"}
        />
        <CanvasSelect label={t("质量")} onChange={(value) => onDraftChange({ quality: value as AiImageGenerationQuality })} options={qualityOptions} value={canvasDraft.quality} />
        <CanvasSelect
          label={t("格式")}
          onChange={(value) => onDraftChange({ outputFormat: value as AiImageGenerationFormat })}
          options={formatOptions.map((option) => ({ ...option, disabled: canvasDraft.transparentBackground && option.value === "jpeg" }))}
          value={canvasDraft.outputFormat}
        />
        <label className="grid gap-1.5 text-xs font-medium text-muted">
          {t("张数")}
          <select
            className="h-10 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(event) => onDraftChange({ count: Number(event.target.value) })}
            value={canvasDraft.count}
          >
            {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} {t("张")}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

function formatCanvasGenerationSettingsSummary(canvasDraft: CanvasDraftSettings, isVideoModel: boolean, t: (text: string) => string): string {
  if (isVideoModel) {
    return `${canvasDraft.videoSeconds}${t("秒")} · ${canvasDraft.videoSize} · ${canvasDraft.aspectRatio}`;
  }

  const qualityLabel = t(qualityOptions.find((option) => option.value === canvasDraft.quality)?.label ?? "自动");
  const sizeLabel = canvasDraft.sizeMode === "custom"
    ? `${canvasDraft.customWidth}×${canvasDraft.customHeight}`
    : canvasDraft.sizeMode === "auto"
      ? t("自动尺寸")
      : `${canvasDraft.baseResolution.toUpperCase()} · ${canvasDraft.aspectRatio}`;

  return `${qualityLabel.replace(t("质量"), "")} · ${sizeLabel} · ${canvasDraft.count}${t("张")}`;
}

function ResolutionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const { t } = useLocale();
  return (
    <button
      aria-pressed={active}
      className={`min-h-10 rounded-xl border text-sm font-medium transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted hover:border-primary/45 hover:text-foreground"}`}
      onClick={onClick}
      title={t("{label} 基准分辨率", { label: t(label) })}
      type="button"
    >
      {label}
    </button>
  );
}

function DimensionInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted">
      {label}
      <input
        className="h-10 min-w-0 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        max={4096}
        min={256}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        step={64}
        type="number"
        value={value}
      />
    </label>
  );
}

function getAspectIconClass(aspectRatio: CanvasAspectRatio): string {
  if (aspectRatio === "1:1") return "size-4 rounded-sm";
  if (aspectRatio === "2:3" || aspectRatio === "9:16" || aspectRatio === "3:4") return "h-5 w-3 rounded-sm";
  if (aspectRatio === "21:9") return "h-2.5 w-6 rounded-sm";
  return "h-3 w-5 rounded-sm";
}

type CanvasSelectProps = {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
};

function CanvasSelect({ label, value, options, onChange }: CanvasSelectProps) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted">
      {label}
      <select
        className="h-10 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => <option disabled={option.disabled} key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

type PromptMoreMenuItemProps = {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
};

function PromptMoreMenuItem({ disabled = false, icon, label, onClick, tone = "default" }: PromptMoreMenuItemProps) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "danger"
          ? "text-danger hover:bg-danger/10"
          : "text-foreground hover:bg-primary/5"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

type CreativeCanvasProps = {
  webCanvasEnabled: boolean;
  webCanvasLoginVisible: boolean;
  webCanvasLoading: boolean;
  webCanvasHostRef: RefObject<HTMLDivElement | null>;
  phase: CanvasPhase;
  lastModel: string;
  currentGenerationCount?: number;
  results: CanvasGenerationResult[];
  thinkingKeywords: string[];
  atmosphereTone?: CanvasAtmosphereTone;
  generationElapsedMs: number | null;
  lockedHeight: number | null;
  onOpenPreview: (index: number) => void;
  onDownload: (result: CanvasGenerationResult, index: number) => void;
  onCopyImage: (imageFileName: string) => Promise<void>;
  /** 把单张结果手动收录到素材库。 */
  onArchive: (result: CanvasGenerationResult, index: number) => void | Promise<void>;
  /** 正在手动收录的结果索引，用于按钮置灰/转圈。 */
  archivingIndex: number | null;
  /** 自动收录整批进行中：仅此期间未落盘的结果才显示「归档中」角标。 */
  archivingBatch: boolean;
};

type DoubaoWebOptionsPanelProps = {
  model: string;
  style: string;
  modelHidden: boolean;
  styleHidden: boolean;
  onModelChange: (model: string) => void;
  onStyleChange: (style: string) => void;
  onToggleModelHidden: () => void;
  onToggleStyleHidden: () => void;
};

/**
 * 豆包网页画布的模型 / 风格切换。仅 doubao-web 提供方显示。
 *
 * 与「比例」面板一致的交互：每个选项是一张可收起的卡片，收起时标题行只显示当前选中值，
 * 点 Eye/EyeOff 切换；展开才显示选项网格。默认收起（doubaoModelHidden/doubaoStyleHidden=true），
 * 避免一选豆包就把一长串选项平铺出来。
 *
 * 选择写入画布草稿（持久化），生成时由主进程在豆包页面上按可见文本匹配点击。
 * 空串表示「跟随网页默认」——不做自动切换，避免点不中时仍能正常生成。
 */
function DoubaoWebOptionsPanel({
  model,
  style,
  modelHidden,
  styleHidden,
  onModelChange,
  onStyleChange,
  onToggleModelHidden,
  onToggleStyleHidden,
}: DoubaoWebOptionsPanelProps) {
  const { t } = useLocale();
  const modelLabel = t(doubaoModelOptions.find((option) => option.value === model)?.label ?? "跟随网页默认");
  const styleLabel = t(doubaoStyleOptions.find((option) => option.value === style)?.label ?? "跟随网页默认");

  return (
    <section className="mt-5 space-y-4 border-t border-border/70 pt-4" aria-labelledby="canvas-doubao-heading">
      <h3 className="sr-only" id="canvas-doubao-heading">{t("豆包模型与风格")}</h3>

      <DoubaoOptionCard
        title={t("豆包模型")}
        currentValue={modelLabel}
        hidden={modelHidden}
        onToggleHidden={onToggleModelHidden}
        options={doubaoModelOptions}
        value={model}
        onChange={onModelChange}
        showEyeLabel={modelHidden ? t("显示模型选项") : t("隐藏模型选项")}
      />

      <DoubaoOptionCard
        title={t("豆包风格")}
        currentValue={styleLabel}
        hidden={styleHidden}
        onToggleHidden={onToggleStyleHidden}
        options={doubaoStyleOptions}
        value={style}
        onChange={onStyleChange}
        showEyeLabel={styleHidden ? t("显示风格选项") : t("隐藏风格选项")}
      />
    </section>
  );
}

type DoubaoOptionCardProps = {
  title: string;
  currentValue: string;
  hidden: boolean;
  onToggleHidden: () => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  showEyeLabel: string;
};

function DoubaoOptionCard({
  title,
  currentValue,
  hidden,
  onToggleHidden,
  options,
  value,
  onChange,
  showEyeLabel,
}: DoubaoOptionCardProps) {
  const { t } = useLocale();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{currentValue}</p>
        </div>
        <button
          aria-expanded={!hidden}
          aria-label={showEyeLabel}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onToggleHidden}
          type="button"
        >
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      {hidden ? null : (
        <div className="grid grid-cols-2 gap-1.5">
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                aria-pressed={selected}
                className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  selected
                    ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                    : "bg-background text-foreground hover:bg-primary/5"
                }`}
                key={option.value || "default"}
                onClick={() => onChange(option.value)}
                type="button"
              >
                {t(option.label)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function orderCanvasResultsForDisplay(results: CanvasGenerationResult[]): Array<{ result: CanvasGenerationResult; index: number }> {
  const groups = new Map<string, Array<{ result: CanvasGenerationResult; index: number }>>();

  results.forEach((result, index) => {
    // 新结果都有批次号；旧的内存结果没有批次号时按单张兼容，避免丢失展示。
    const key = result.generationBatchId === undefined
      ? `legacy-${index}`
      : `batch-${result.generationBatchId}`;
    const group = groups.get(key) ?? [];
    group.push({ result, index });
    groups.set(key, group);
  });

  return Array.from(groups.values()).reverse().reduce<Array<{ result: CanvasGenerationResult; index: number }>>(
    (ordered, group) => ordered.concat(group),
    [],
  );
}

const canvasPromptTooltipDelayMs = 5000;

type CanvasGeneratedResultTileProps = {
  result: CanvasGenerationResult;
  index: number;
  displayIndex: number;
  prompt: string;
  onOpenPreview: (index: number) => void;
};

function CanvasGeneratedResultTile({ result, index, displayIndex, prompt, onOpenPreview }: CanvasGeneratedResultTileProps) {
  const { t } = useLocale();
  const mediaRef = useRef<HTMLDivElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const tooltipId = useId();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);

  function clearTooltipTimer(): void {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }

  function hideTooltip(): void {
    clearTooltipTimer();
    setTooltipVisible(false);
    setTooltipPosition(null);
  }

  function scheduleTooltip(): void {
    clearTooltipTimer();
    setTooltipVisible(false);
    setTooltipPosition(null);
    tooltipTimerRef.current = window.setTimeout(() => {
      tooltipTimerRef.current = null;
      const media = mediaRef.current;
      if (!media) {
        return;
      }
      const rect = media.getBoundingClientRect();
      const tooltipWidth = Math.min(360, Math.max(240, window.innerWidth - 24));
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - tooltipWidth - 12),
      );
      const estimatedHeight = 120;
      const top = rect.bottom + 10 + estimatedHeight <= window.innerHeight
        ? rect.bottom + 10
        : Math.max(12, rect.top - estimatedHeight - 10);
      setTooltipPosition({ top, left });
      setTooltipVisible(true);
    }, canvasPromptTooltipDelayMs);
  }

  useEffect(() => {
    return () => clearTooltipTimer();
  }, []);

  useEffect(() => {
    if (!tooltipVisible) {
      return;
    }
    const hideOnViewportChange = () => hideTooltip();
    window.addEventListener("resize", hideOnViewportChange);
    window.addEventListener("scroll", hideOnViewportChange, true);
    return () => {
      window.removeEventListener("resize", hideOnViewportChange);
      window.removeEventListener("scroll", hideOnViewportChange, true);
    };
  }, [tooltipVisible]);

  return (
    <>
      <button
        aria-describedby={tooltipVisible ? tooltipId : undefined}
        aria-label={t("查看第 {index} 张生成作品", { index: displayIndex + 1 })}
        className="group block w-full overflow-hidden rounded-2xl border border-border/70 bg-background/55 text-left transition hover:border-primary/55 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onBlur={hideTooltip}
        onClick={() => onOpenPreview(index)}
        onFocus={scheduleTooltip}
        type="button"
      >
        <div
          className="relative aspect-[4/3] overflow-hidden bg-background/70"
          onPointerEnter={scheduleTooltip}
          onPointerLeave={hideTooltip}
          ref={mediaRef}
        >
          {result.mediaType === "video" ? (
            <video
              aria-hidden="true"
              className="h-full w-full object-contain"
              muted
              playsInline
              preload="metadata"
              src={result.dataUrl}
            />
          ) : (
            <img
              alt=""
              className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"
              src={result.dataUrl}
            />
          )}
          <span className="absolute left-2 top-2 inline-flex min-w-6 items-center justify-center rounded-full bg-background/85 px-1.5 py-1 text-[10px] font-semibold tabular-nums text-foreground shadow-sm backdrop-blur">
            {result.mediaType === "video" ? <Film size={11} /> : displayIndex + 1}
          </span>
          {result.saved ? (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-1 text-[10px] text-primary shadow-sm backdrop-blur">
              <Check size={10} /> {t("已收录")}
            </span>
          ) : null}
        </div>
      </button>
      {tooltipVisible && tooltipPosition
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[10001] max-w-[min(22.5rem,calc(100vw-1.5rem))] rounded-xl border border-border/80 bg-panel/95 px-3 py-2 text-xs leading-5 text-foreground shadow-2xl backdrop-blur"
              id={tooltipId}
              role="tooltip"
              style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
            >
              {prompt}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CanvasResultsPanel({
  results,
  lockedHeight,
  width,
  onWidthPreview,
  onWidthCommit,
  onOpenPreview,
}: {
  results: CanvasGenerationResult[];
  lockedHeight: number | null;
  width: number;
  onWidthPreview: (width: number) => void;
  onWidthCommit: (width: number) => void;
  onOpenPreview: (index: number) => void;
}) {
  const { t } = useLocale();
  const resultsListRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const resizeWidthRef = useRef(width);
  const [isResizing, setIsResizing] = useState(false);
  const orderedResults = orderCanvasResultsForDisplay(results);

  resizeWidthRef.current = width;

  function clampWidth(value: number): number {
    return Math.max(minCanvasResultsPanelWidth, Math.min(maxCanvasResultsPanelWidth, Math.round(value)));
  }

  function updateWidthFromPointer(clientX: number): void {
    const start = resizeStartRef.current;
    if (!start) {
      return;
    }
    const nextWidth = clampWidth(start.startWidth - (clientX - start.startX));
    resizeWidthRef.current = nextWidth;
    onWidthPreview(nextWidth);
  }

  function finishResize(event?: ReactPointerEvent<HTMLDivElement>): void {
    const start = resizeStartRef.current;
    if (!start) {
      return;
    }
    if (event && event.currentTarget.hasPointerCapture(start.pointerId)) {
      event.currentTarget.releasePointerCapture(start.pointerId);
    }
    resizeStartRef.current = null;
    setIsResizing(false);
    onWidthCommit(resizeWidthRef.current);
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    let delta = 0;
    if (event.key === "ArrowLeft") delta = 16;
    if (event.key === "ArrowRight") delta = -16;
    if (event.key === "Home") delta = minCanvasResultsPanelWidth - width;
    if (event.key === "End") delta = maxCanvasResultsPanelWidth - width;
    if (delta === 0) return;
    event.preventDefault();
    onWidthCommit(clampWidth(width + delta));
  }

  // 新批次置顶后回到列表顶部，让刚生成的作品立即进入可视区域。
  useEffect(() => {
    if (results.length > 0) {
      resultsListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [results.length]);

  return (
    <section
      id="canvas-results-panel"
      aria-labelledby="canvas-results-heading"
      className="canvas-results-panel relative flex min-h-0 self-stretch flex-col rounded-3xl border border-border/50 p-3"
      data-feature-guide="canvas-results-panel"
      role="region"
      style={lockedHeight !== null ? { height: `${lockedHeight}px` } : undefined}
    >
      <div
        aria-label={t("调整生成作品区宽度")}
        aria-orientation="vertical"
        aria-valuemax={maxCanvasResultsPanelWidth}
        aria-valuemin={minCanvasResultsPanelWidth}
        aria-valuenow={width}
        className={`canvas-results-resize-handle absolute -left-2 top-0 z-10 hidden h-full w-4 cursor-col-resize items-center justify-center touch-none lg:flex ${isResizing ? "is-resizing" : ""}`}
        onKeyDown={handleResizeKeyDown}
        onPointerCancel={finishResize}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeStartRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
          resizeWidthRef.current = width;
          setIsResizing(true);
        }}
        onPointerMove={(event) => updateWidthFromPointer(event.clientX)}
        onPointerUp={finishResize}
        role="separator"
        tabIndex={0}
        title={t("拖动调整生成作品区宽度")}
      >
        <GripVertical aria-hidden="true" className="text-muted/80" size={14} />
      </div>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground" id="canvas-results-heading">{t("生成作品")}</h2>
          <p className="mt-1 text-[11px] text-muted">{t("点击查看大图")}</p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium tabular-nums text-primary">
          {results.length}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="flex min-h-36 flex-1 items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/35 px-4 text-center text-xs leading-5 text-muted">
          {t("生成后的作品会显示在这里")}
        </div>
      ) : (
        <div ref={resultsListRef} className="canvas-results-panel__list min-h-0 max-h-full flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5" aria-label={t("生成作品列表")}>
          {orderedResults.map(({ result, index }, displayIndex) => {
            const prompt = result.requestPrompt?.trim() || result.revisedPrompt?.trim() || t("生成作品 {index}", { index: displayIndex + 1 });
            return (
              <CanvasGeneratedResultTile
                displayIndex={displayIndex}
                index={index}
                key={`${result.dataUrl.slice(0, 32)}-${index}`}
                onOpenPreview={onOpenPreview}
                prompt={prompt}
                result={result}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CreativeCanvas({
  webCanvasEnabled,
  webCanvasLoginVisible,
  webCanvasLoading,
  webCanvasHostRef,
  phase,
  lastModel,
  results,
  currentGenerationCount = results.length,
  thinkingKeywords,
  atmosphereTone = "neutral",
  generationElapsedMs,
  lockedHeight,
  onOpenPreview,
  onDownload,
  onCopyImage,
  onArchive,
  archivingIndex,
  archivingBatch,
}: CreativeCanvasProps) {
  const { t } = useLocale();
  const isBusyPhase = phase === "thinking" || phase === "generating";
  const subtitle = webCanvasLoginVisible
    ? t("请在下方完成豆包登录，登录后会自动切回画布")
    : webCanvasLoading
      ? t("正在连接豆包网页画布…")
      : phase === "thinking"
        ? t("创作核心正在唤醒…")
        : phase === "generating"
          ? webCanvasEnabled
            ? t("豆包正在后台生成…")
            : t("创作核心正在汇聚能量…")
          : results.length > 0
            ? lastModel
              ? t("模型：{model}", { model: lastModel })
              : t("已生成 {count} 张", { count: currentGenerationCount })
            : webCanvasEnabled
              ? t("豆包已就绪 · 作品会出现在这里")
              : t("创作核心已待命 · 作品会在这里诞生");

  return (
    <div
      data-feature-guide="canvas-output"
      className="canvas-workspace relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/50 p-4 min-[640px]:p-5"
      style={lockedHeight !== null ? { height: `${lockedHeight}px` } : undefined}
    >
      <div className="canvas-workspace-heading relative z-10 mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground">{t("创意画布")}</h2>
          <p className="mt-1 truncate text-xs text-muted" title={subtitle}>{subtitle}</p>
        </div>
        {results.length > 0 && !isBusyPhase ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 whitespace-nowrap text-[11px]">
            {generationElapsedMs !== null ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 tabular-nums text-primary">
                {t("用时 {duration}", { duration: formatElapsedDuration(generationElapsedMs, t) })}
              </span>
            ) : null}
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{t("已生成 {count} 张", { count: currentGenerationCount })}</span>
          </div>
        ) : null}
      </div>

      {/* flex 容器：让各状态分支的 flex-1 生效，避免生成中/空态只占 min-h 而在面板底部留白。 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {webCanvasLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border/70 bg-background/50 text-xs text-muted">
            {t("正在连接豆包网页画布…")}
          </div>
        ) : isBusyPhase ? (
          <CanvasGeneratingStage phase={phase} keywords={thinkingKeywords} tone={atmosphereTone} />
        ) : results.length === 0 ? (
          <CanvasEmptyStage />
        ) : (
          <CanvasResultStage
             results={results}
             currentGenerationCount={currentGenerationCount}
             lastModel={lastModel}
             reveal={phase === "reveal"}
             onOpenPreview={onOpenPreview}
             onDownload={onDownload}
             onCopyImage={onCopyImage}
             onArchive={onArchive}
             archivingIndex={archivingIndex}
             archivingBatch={archivingBatch}
           />
        )}

        {webCanvasEnabled ? (
          <div
            ref={webCanvasHostRef}
            aria-label={t("豆包网页画布")}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-2xl"
          >
            {webCanvasLoginVisible ? (
              <div className="flex h-full items-center justify-center text-xs text-muted pointer-events-none">
                {t("正在加载豆包登录…")}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CanvasEmptyStage() {
  const { t } = useLocale();
  return (
    <CanvasMotionBackdrop mode="empty" className="flex min-h-0 flex-1 px-6 py-8 text-center">
      <div className="canvas-empty-content flex flex-1 flex-col items-center justify-end gap-2">
        <h3 className="font-medium text-foreground">{t("等待灵感生成")}</h3>
        <p className="max-w-60 text-xs leading-6 text-muted">{t("从一个想法开始，创作核心会在这里苏醒。")}</p>
      </div>
    </CanvasMotionBackdrop>
  );
}

function CanvasGeneratingStage({
  phase,
  keywords,
  tone,
}: {
  phase: CanvasPhase;
  keywords: string[];
  tone: CanvasAtmosphereTone;
}) {
  const { t } = useLocale();
  const isThinking = phase === "thinking";
  const [message, setMessage] = useState(() => pickCanvasWaitingMessage(isThinking ? "thinking" : "generating"));
  const [isMessageLeaving, setIsMessageLeaving] = useState(false);

  useEffect(() => {
    const messagePhase = isThinking ? "thinking" : "generating";
    let timer: ReturnType<typeof setTimeout>;
    let fadeTimer: ReturnType<typeof setTimeout>;
    setMessage((previous) => pickCanvasWaitingMessage(messagePhase, previous));
    setIsMessageLeaving(false);
    const schedule = () => {
      timer = setTimeout(() => {
        setIsMessageLeaving(true);
        fadeTimer = setTimeout(() => {
          setMessage((previous) => pickCanvasWaitingMessage(messagePhase, previous));
          setIsMessageLeaving(false);
          schedule();
        }, 200);
      }, getCanvasWaitingDelay() - 200);
    };
    const onVisibilityChange = () => {
      clearTimeout(timer);
      clearTimeout(fadeTimer);
      setIsMessageLeaving(false);
      if (!document.hidden) schedule();
    };
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      clearTimeout(fadeTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isThinking]);

  return (
    <CanvasMotionBackdrop keywords={keywords} mode={isThinking ? "thinking" : "busy"} tone={tone} className="flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-6">
      <div className="canvas-generating-content relative flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="canvas-status-card canvas-status-card--below-core z-10 flex w-full max-w-sm flex-col items-center gap-2 px-2 py-4 text-center">
          <h3 className="text-lg font-medium tracking-wide text-foreground" role="status">{t("灵感汇集ing")}</h3>
          <p className={`canvas-waiting-message min-h-12 text-sm leading-6 text-muted ${isMessageLeaving ? "canvas-waiting-message--leaving" : ""}`}>{message}</p>
        </div>
      </div>
    </CanvasMotionBackdrop>
  );
}

/**
 * 结果态：始终以「一张主图」呈现，多图时用左右按钮循环切换。
 * 不做多宫格，避免竖图被 aspect-square 裁切、以及 2/3 张时网格填不满面板留白。
 */
function CanvasResultStage({
  results,
  currentGenerationCount,
  lastModel,
  reveal,
  onOpenPreview,
  onDownload,
  onCopyImage,
  onArchive,
  archivingIndex,
  archivingBatch,
}: {
  results: CanvasGenerationResult[];
  currentGenerationCount: number;
  lastModel: string;
  reveal: boolean;
  onOpenPreview: (index: number) => void;
  onDownload: (result: CanvasGenerationResult, index: number) => void;
  onCopyImage: (imageFileName: string) => Promise<void>;
  onArchive: (result: CanvasGenerationResult, index: number) => void | Promise<void>;
  archivingIndex: number | null;
  archivingBatch: boolean;
}) {
  const { t } = useLocale();
  const total = results.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [finishingMessage] = useState(() => pickCanvasWaitingMessage("finishing"));
  const [isRevealingArtwork, setIsRevealingArtwork] = useState(false);

  // 新一批结果就位后自动显示该批次的第一张；底层结果仍按旧到新累计保存。
  useEffect(() => {
    const latestBatchSize = Math.min(Math.max(1, currentGenerationCount), total);
    setActiveIndex(total > 0 ? total - latestBatchSize : 0);
  }, [currentGenerationCount, total]);

  const safeIndex = activeIndex < total ? activeIndex : 0;
  const active = results[safeIndex];
  if (!active) {
    return null;
  }

  const goPrev = () => setActiveIndex((index) => (index - 1 + total) % total);
  const goNext = () => setActiveIndex((index) => (index + 1) % total);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CanvasMotionBackdrop mode={reveal || isRevealingArtwork ? "reveal" : "result"} className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <CanvasResultCard
            key={`${active.dataUrl.slice(0, 32)}-${safeIndex}`}
            result={active}
            lastModel={lastModel}
            index={safeIndex}
            reveal={reveal}
            onRevealChange={setIsRevealingArtwork}
            onOpen={() => onOpenPreview(safeIndex)}
            onDownload={() => onDownload(active, safeIndex)}
            onCopy={() => {
              void onCopyImage(active.imageFileName || active.dataUrl);
            }}
            onArchive={() => void onArchive(active, safeIndex)}
            archiving={archivingIndex === safeIndex}
            archivingBatch={archivingBatch}
          />

          {total > 1 ? (
            <>
              <button
                aria-label={t("上一张")}
                className="absolute left-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={goPrev}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label={t("下一张")}
                className="absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={goNext}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
              <span className="pointer-events-none absolute bottom-2 right-3 z-10 px-2 py-1 text-[11px] font-medium tabular-nums text-muted">
                {safeIndex + 1} / {total}
              </span>
            </>
          ) : null}
        </div>
        {reveal ? <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 text-xs text-muted" role="status">{finishingMessage}</p> : null}
      </CanvasMotionBackdrop>

      {total > 1 ? (
        <div className="mt-3 flex shrink-0 items-center justify-center gap-2" aria-label={t("切换生成结果")}>
          {results.map((result, index) => (
            <button
              aria-current={index === safeIndex}
              aria-label={t("第 {index} 张", { index: index + 1 })}
              className={`h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                index === safeIndex ? "w-6 bg-primary" : "w-1.5 bg-border hover:bg-primary/40"
              }`}
              key={`${result.dataUrl.slice(0, 16)}-dot-${index}`}
              onClick={() => setActiveIndex(index)}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatCanvasAspectRatio(width: number, height: number): string {
  if (!width || !height) return "";
  let a = width;
  let b = height;
  while (b) [a, b] = [b, a % b];
  return `${width / a}:${height / a}`;
}

function CanvasResultCard({
  result,
  lastModel,
  index,
  reveal,
  onRevealChange,
  onOpen,
  onDownload,
  onCopy,
  onArchive,
  archiving,
  archivingBatch,
}: {
  result: CanvasGenerationResult;
  lastModel: string;
  index: number;
  reveal: boolean;
  onRevealChange: (active: boolean) => void;
  onOpen: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onArchive: () => void;
  archiving: boolean;
  /** 自动收录整批进行中：仅此期间未落盘的结果才显示「归档中」角标。 */
  archivingBatch: boolean;
}) {
  const { t } = useLocale();
  const archived = result.saved;
  const [mediaSize, setMediaSize] = useState<{ source: string; width: number; height: number } | null>(null);
  const [revealRequestedFor, setRevealRequestedFor] = useState(reveal ? result.dataUrl : null);
  useEffect(() => {
    if (reveal) setRevealRequestedFor(result.dataUrl);
  }, [reveal, result.dataUrl]);
  const title = (result.requestPrompt?.trim() || result.revisedPrompt?.trim() || t("生成作品 {index}", { index: index + 1 })).replace(/\s+/g, " ");
  const dimensions = mediaSize?.source === result.dataUrl ? mediaSize : null;
  const sizeLabel = dimensions ? `${dimensions.width} × ${dimensions.height} · ${formatCanvasAspectRatio(dimensions.width, dimensions.height)}` : "";
  // Image-only legacy condition: disabled={!result.saved || !result.imageFileName}; videos add a media guard.
  const imageCopyDisabled = !result.imageFileName && !result.dataUrl;
  // 判定「正在归档」的准确依据：手动收录这一张(archiving) 或 自动收录整批进行中(archivingBatch)。
  // 不能仅凭 !result.saved —— 自动收录关闭时 results 永远 saved=false，
  // 那样会错误地永久显示「归档中」角标。
  const showArchivingBadge = archiving || (archivingBatch && !archived);
  return (
    <article
      className="canvas-result-card group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-transparent"
      onDoubleClick={onOpen}
    >
      <div
        className="canvas-artwork relative flex min-h-0 flex-1 items-center justify-center bg-transparent p-3"
        style={dimensions ? { "--canvas-artwork-ratio": dimensions.width / dimensions.height } as CSSProperties : undefined}
      >
        {result.mediaType === "video" ? (
          <video
            aria-label={t("生成视频 {index}", { index: index + 1 })}
            className="canvas-artwork-media rounded-2xl object-contain"
            onLoadedMetadata={(event) => setMediaSize({ source: result.dataUrl, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
            controls
            loop
            muted
            playsInline
            src={result.dataUrl}
          />
        ) : (
          <img
            alt={t("生成结果 {index}", { index: index + 1 })}
            className="canvas-artwork-media rounded-2xl object-contain"
            onLoad={(event) => setMediaSize({ source: result.dataUrl, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            src={result.dataUrl}
          />
        )}
        {dimensions && revealRequestedFor === result.dataUrl ? (
          <CanvasArtworkReveal key={result.dataUrl} image={result.mediaType !== "video"} onActiveChange={onRevealChange} />
        ) : null}
        {showArchivingBadge ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[11px] text-muted shadow-sm backdrop-blur">
            <LoaderCircle className="animate-spin" size={11} /> {t("归档中")}
          </span>
        ) : null}
        <div className={`canvas-result-actions absolute ${result.mediaType === "video" ? "top-3" : "bottom-3"} left-1/2 flex -translate-x-1/2 items-center justify-center gap-1.5 rounded-2xl border border-border/50 bg-panel/75 p-1.5 opacity-0 backdrop-blur-md transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100`}>
          <ResultHoverButton icon={<Eye size={13} />} label={t("大图")} onClick={onOpen} />
          <ResultHoverButton icon={<Download size={13} />} label={t("导出")} onClick={onDownload} />
          <ResultHoverButton
            disabled={archived || archiving}
            icon={archiving ? <LoaderCircle className="animate-spin" size={13} /> : archived ? <Check size={13} /> : <Inbox size={13} />}
            label={archived ? t("已收录") : t("收录")}
            onClick={onArchive}
            title={archived ? t("已收录") : t("收录到素材库")}
          />
          <ResultHoverButton
            disabled={result.mediaType === "video" || imageCopyDisabled}
            icon={<Copy size={13} />}
            label={t("复制")}
            onClick={onCopy}
            title={result.mediaType === "video" ? t("视频暂不支持复制为图片") : t("复制图片到剪贴板")}
          />
        </div>
      </div>
      <div className="shrink-0 px-5 pb-3 pt-1 text-center">
        <p className="mx-auto max-w-md truncate text-sm font-medium text-foreground" title={title}>{title.length > 32 ? `${title.slice(0, 32)}…` : title}</p>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 text-[11px] leading-5 text-muted">
          {lastModel ? <span className="max-w-[min(100%,18rem)] truncate" title={lastModel}>{lastModel}</span> : null}
          {sizeLabel ? <span className="whitespace-nowrap">{sizeLabel}</span> : null}
        </p>
        {archived ? <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted"><Check size={12} /> {t("已收录")}</span> : null}
      </div>
    </article>
  );
}

function ResultHoverButton({
  icon,
  label,
  disabled = false,
  title,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-foreground transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title ?? label}
      type="button"
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

type CanvasFullscreenPreviewProps = {
  result: CanvasGenerationResult;
  index: number;
  total: number;
  lastModel: string;
  generationElapsedMs: number | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDownload: () => void;
  onCopyImage: (imageFileName: string) => Promise<void>;
  /** 把当前预览的这张结果手动收录到素材库。 */
  onArchive: (result: CanvasGenerationResult, index: number) => void | Promise<void>;
  archivingIndex: number | null;
};

function CanvasFullscreenPreview({
  result,
  index,
  total,
  lastModel,
  generationElapsedMs,
  onPrev,
  onNext,
  onClose,
  onDownload,
  onCopyImage,
  onArchive,
  archivingIndex,
}: CanvasFullscreenPreviewProps) {
  const { t } = useLocale();
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const imageCopyDisabled = !result.imageFileName && !result.dataUrl;
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  /**
   * 卡片先展示「本次生成实际使用的提示词」（生成时快照到结果上），模型改写版只作为
   * 附加信息。旧实现只读 revisedPrompt，而 gpt-image / 豆包网页 / 视频模型都不返回它，
   * 于是卡片长期只显示一句「模型没有改写」的占位，看不到自己真正用的提示词。
   */
  const submittedPrompt = result.requestPrompt?.trim() ?? "";
  const modelRevisedPrompt = result.revisedPrompt?.trim() ?? "";
  // 两者一致时不重复展示改写版。
  const showRevisedPrompt = modelRevisedPrompt.length > 0 && modelRevisedPrompt !== submittedPrompt;
  const displayPrompt = submittedPrompt || modelRevisedPrompt;

  useEffect(() => {
    if (!promptOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPromptOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [promptOpen]);

  useEffect(() => {
    if (!promptCopied) {
      return;
    }
    const timer = window.setTimeout(() => setPromptCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [promptCopied]);

  async function handleCopyPrompt(): Promise<void> {
    const text = displayPrompt;
    if (!text) {
      return;
    }
    const copyResult = await window.suyanApi.writeClipboardText(text);
    if (copyResult.ok) {
      setPromptCopied(true);
    }
  }

  return (
    <div
      className="app-window-overlay z-[9999] flex items-center justify-center bg-overlay/72 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        aria-label={t("关闭预览")}
        className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-panel/65 text-foreground shadow-lg backdrop-blur transition hover:bg-panel/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        data-feature-guide="canvas-fullscreen-close"
        onClick={(event) => { event.stopPropagation(); onClose(); }}
        type="button"
      >
        <X size={18} />
      </button>

      {/* 大图独立铺满视口并居中最大化：与提示词卡片/操作按钮解耦，展开详情时位置与尺寸不变。 */}
      <div
        className="absolute inset-0 z-0 flex items-center justify-center p-4"
        onClick={(event) => event.stopPropagation()}
      >
        {total > 1 ? (
          <>
            <button
              aria-label={t("上一张")}
              className="absolute left-3 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-panel/55 text-foreground shadow-lg backdrop-blur transition hover:bg-panel/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              data-feature-guide="canvas-fullscreen-navigation"
              onClick={onPrev}
              type="button"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              aria-label={t("下一张")}
              className="absolute right-16 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-panel/55 text-foreground shadow-lg backdrop-blur transition hover:bg-panel/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              data-feature-guide="canvas-fullscreen-navigation"
              onClick={onNext}
              type="button"
            >
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}
        {result.mediaType === "video" ? (
          <video
            aria-label={t("生成视频 {index}", { index: index + 1 })}
            className="block h-auto w-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            data-feature-guide="canvas-fullscreen-media"
            autoPlay
            controls
            loop
            muted
            playsInline
            src={result.dataUrl}
          />
        ) : (
          <img
            alt={t("生成结果 {index}", { index: index + 1 })}
            className="block h-auto w-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            data-feature-guide="canvas-fullscreen-media"
            onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            src={result.dataUrl}
          />
        )}
      </div>

      {/* 提示词卡片叠在大图之上，不影响大图布局。 */}
      {promptOpen ? (
        <aside
          className="absolute right-16 top-1/2 z-20 w-[min(23rem,calc(100%-5.5rem))] max-w-md -translate-y-1/2 text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="rounded-2xl border border-border/70 bg-panel/65 p-2.5 shadow-elevated backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted">
              <span>{t("生成结果")}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t("复制提示词")}
                  title={displayPrompt ? t("复制当前提示词") : t("暂无可复制的提示词")}
                  disabled={!displayPrompt}
                  onClick={() => void handleCopyPrompt()}
                  className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted opacity-40 transition hover:bg-background/40 hover:text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:opacity-90 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  {promptCopied ? <Check size={12} /> : <Copy size={12} />}
                  {promptCopied ? t("已复制") : t("复制")}
                </button>
                <span className="rounded-full bg-background/55 px-2 py-0.5 tabular-nums">{index + 1} / {total}</span>
              </div>
            </div>
            {showRevisedPrompt && submittedPrompt ? (
              <p className="mt-2 px-1 text-[11px] font-medium text-muted">{t("本次使用的提示词")}</p>
            ) : null}
            <div
              aria-label={t("展开的提示词")}
              className="mt-2 max-h-[min(52vh,560px)] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-background/45 px-3 py-2.5 text-xs leading-6 text-muted"
            >
              {displayPrompt || t("本次生成没有记录提示词。")}
            </div>
            {showRevisedPrompt && submittedPrompt ? (
              <>
                <p className="mt-2 px-1 text-[11px] font-medium text-muted">{t("模型改写后的提示词")}</p>
                <div
                  aria-label={t("模型改写后的提示词")}
                  className="mt-1 max-h-[min(26vh,280px)] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-background/38 px-3 py-2.5 text-xs leading-6 text-muted"
                >
                  {modelRevisedPrompt}
                </div>
              </>
            ) : null}
            <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-background/38 px-3 py-2.5 text-xs text-muted">
              <div className="inline-flex min-w-0 items-center gap-1">
                <dt>{t("模型：")}</dt>
                <dd className="max-w-40 truncate text-foreground">{lastModel || t("未知")}</dd>
              </div>
              {naturalSize ? (
                <div className="inline-flex items-center gap-1">
                  <dt>{t("尺寸：")}</dt>
                  <dd className="tabular-nums text-foreground">{naturalSize.width} × {naturalSize.height}</dd>
                </div>
              ) : null}
              {generationElapsedMs !== null ? (
                <div className="inline-flex items-center gap-1">
                  <dt>{t("用时：")}</dt>
                  <dd className="tabular-nums text-foreground">{formatElapsedDuration(generationElapsedMs, t)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>
      ) : null}

      {/* 操作按钮固定在右侧中部，不随提示词卡片展开而位移；默认半透明，悬停/聚焦时更清晰。 */}
      <div
        aria-label={t("生成结果操作")}
        className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 shrink-0 flex-col gap-1.5 rounded-2xl border border-border/70 bg-panel/40 p-1 shadow-elevated backdrop-blur opacity-45 transition-opacity hover:opacity-100 focus-within:opacity-100"
        data-feature-guide="canvas-fullscreen-actions"
        onClick={(event) => event.stopPropagation()}
      >
        <CanvasResultActionButton icon={<Download size={18} />} label={t("导出")} onClick={onDownload} />
        <CanvasResultActionButton
          disabled={result.saved || archivingIndex === index}
          icon={archivingIndex === index ? <LoaderCircle className="animate-spin" size={18} /> : result.saved ? <Check size={18} /> : <Inbox size={18} />}
          label={result.saved ? t("已收录") : t("收录")}
          onClick={() => void onArchive(result, index)}
          title={result.saved ? t("已收录") : archivingIndex === index ? t("收录中…") : t("收录到素材库")}
        />
        <CanvasResultActionButton
          disabled={result.mediaType === "video" || imageCopyDisabled}
          icon={<Copy size={18} />}
          label={t("复制")}
          onClick={() => {
            void onCopyImage(result.imageFileName || result.dataUrl);
          }}
          title={result.mediaType === "video" ? t("视频暂不支持复制为图片") : t("复制图片到剪贴板")}
        />
        <CanvasResultActionButton
          ariaExpanded={promptOpen}
          dataFeatureGuide="canvas-fullscreen-prompt"
          icon={<Info size={18} />}
          label={t("查看")}
          onClick={() => setPromptOpen((open) => !open)}
          title={promptOpen ? t("收起提示词") : t("查看提示词")}
        />
      </div>
    </div>
  );
}

function CanvasResultActionButton({
  ariaExpanded,
  dataFeatureGuide,
  disabled = false,
  icon,
  label,
  onClick,
  title,
}: {
  ariaExpanded?: boolean;
  dataFeatureGuide?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      aria-expanded={ariaExpanded}
      aria-label={title ?? label}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-panel/40 text-foreground shadow-lg backdrop-blur transition hover:border-primary/45 hover:bg-panel/75 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      data-feature-guide={dataFeatureGuide}
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {icon}
    </button>
  );
}
