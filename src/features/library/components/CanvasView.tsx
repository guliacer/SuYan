import {
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Bell,
  BellOff,
  Bookmark,
  BookmarkCheck,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Info,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  AiImageGenerationData,
  AiImageGenerationFormat,
  AiImageGenerationPayload,
  AiImageGenerationQuality,
  AiOptimizePromptPayload,
  AiProviderModelCapability,
  PublicAiProviderSettings,
} from "../types/ai";
import type {
  CanvasAspectRatio,
  CanvasBaseResolution,
  CanvasDraftSettings,
  CanvasGenerationResult,
  CanvasPhase,
  CanvasSizeMode,
  DoubaoWebCanvasStatus,
} from "../types/canvas";
import type { LibraryItem } from "../types/library";
import { useLibraryStore } from "../store/useLibraryStore";
import {
  canvasAspectRatioOptions,
  buildCanvasImageGenerationPayload,
  doubaoModelOptions,
  doubaoStyleOptions,
  extractPromptKeywords,
  getCanvasGenerationSizeLabel,
  resolveCanvasGenerationSize,
  shouldInheritCanvasPromptOrigin,
} from "../utils/canvasGeneration";
import type { StatusFeedbackMessage } from "../utils/statusFeedback";

type CanvasViewProps = {
  aiSettings: PublicAiProviderSettings;
  canvasDraft: CanvasDraftSettings;
  isBusy: boolean;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
  generationResults: CanvasGenerationResult[];
  lastGenerationModel: string;
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
      categorySource?: "system" | "user" | "ai" | null;
    },
  ) => Promise<LibraryItem[]>;
  onOpenAiSettings: () => void;
  onOptimizePrompt: (payload: AiOptimizePromptPayload) => Promise<string | null>;
  onSaveAiActionModelPreference: (
    action: "image-generation",
    selection: { profileId: string; modelId: string },
  ) => Promise<boolean>;
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
  { value: "4k", label: "4K" },
];
const maxPromptHistory = 40;
const typingHistoryWindowMs = 900;
/** REVEAL 揭示动画时长，与 tokens.css 的 canvas-reveal 对齐。 */
const revealPhaseMs = 500;

function formatElapsedDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, elapsedMs) / 1000;
  if (totalSeconds < 60) {
    const precision = totalSeconds < 10 ? 1 : 0;
    return `${totalSeconds.toFixed(precision)} 秒`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

export function CanvasView({
  aiSettings,
  canvasDraft,
  generationResults: results,
  lastGenerationModel: lastModel,
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
  onNotify,
}: CanvasViewProps) {
  const positivePromptRef = useRef<HTMLTextAreaElement>(null);
  const negativePromptRef = useRef<HTMLTextAreaElement>(null);
  const creationPanelRef = useRef<HTMLDivElement | null>(null);
  const promptHistoryRef = useRef<Record<PromptField, string[]>>({ positive: [], negative: [] });
  const lastTypingRef = useRef<{ field: PromptField; at: number } | null>(null);
  const configMenuRef = useRef<HTMLDivElement | null>(null);
  const referenceImageFileRef = useRef<HTMLInputElement | null>(null);
  const referenceImagePopoverRef = useRef<HTMLDivElement | null>(null);
  const referenceImageHydrationRef = useRef("");
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const doubaoWebCanvasHostRef = useRef<HTMLDivElement | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationStartedAtRef = useRef<number | null>(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [optimizingField, setOptimizingField] = useState<PromptField | null>(null);
  // 生成相关状态提到 store：切到素材库卸载本组件后，再切回时新实例若读取局部
  // state 会丢失「创作中」而回退成上一张图。store 让生成态跨视图保留
  // （生成请求本身在主进程后台继续）。
  const isGenerating = useLibraryStore((state) => state.canvasIsGenerating);
  const setIsGenerating = useLibraryStore((state) => state.setCanvasGenerating);
  const phase = useLibraryStore((state) => state.canvasPhase);
  const thinkingKeywords = useLibraryStore((state) => state.canvasThinkingKeywords);
  const setPhase = useLibraryStore((state) => state.setCanvasPhase);
  const setThinkingKeywords = useLibraryStore((state) => state.setCanvasThinkingKeywords);
  const [errorText, setErrorText] = useState("");
  const [isConfigMenuOpen, setIsConfigMenuOpen] = useState(false);
  const [isReferenceImagePopoverOpen, setIsReferenceImagePopoverOpen] = useState(false);
  const [isImportingReferenceImage, setIsImportingReferenceImage] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [generationElapsedMs, setGenerationElapsedMs] = useState<number | null>(null);
  const [creationPanelHeight, setCreationPanelHeight] = useState<number | null>(null);
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
  const activeProfile = useMemo(
    () =>
      aiSettings.profiles.find((profile) => profile.id === imageGenerationPreference?.profileId && profile.enabled) ??
      aiSettings.profiles.find((profile) => profile.id === aiSettings.activeProfileId) ??
      aiSettings.profiles[0],
    [aiSettings.activeProfileId, aiSettings.profiles, imageGenerationPreference?.profileId],
  );
  const selectedModel = imageGenerationPreference?.modelId || activeProfile?.model || aiSettings.model;
  const hasUsableApi = Boolean(activeProfile?.enabled && activeProfile.hasApiKey && selectedModel);
  const isDoubaoWeb = canvasDraft.generationProvider === "doubao-web";
  // 仅在需要登录时，豆包登录弹窗才覆盖右侧画布宿主；登录后转入后台、恢复原生画布。
  const doubaoLoginVisible = isDoubaoWeb && doubaoStage === "login";

  // 右侧结果区沿用创作面板的实际高度，避免竖图的固有高度把网格行向下撑开。
  useLayoutEffect(() => {
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
  }, []);

  useEffect(() => {
    const fileName = canvasDraft.referenceImageFileName.trim();
    if (!fileName || canvasDraft.referenceImageDataUrl) {
      referenceImageHydrationRef.current = "";
      return;
    }
    if (referenceImageHydrationRef.current === fileName) {
      return;
    }

    referenceImageHydrationRef.current = fileName;
    let disposed = false;
    void window.suyanApi.readCanvasReferenceImage(fileName).then((result) => {
      if (disposed || canvasDraft.referenceImageFileName !== fileName) {
        return;
      }
      if (!result.ok) {
        onDraftChange({
          referenceImageDataUrl: "",
          referenceImageFileName: "",
          referenceImageTitle: "",
        });
        onNotify({ type: "error", text: result.error.message });
        return;
      }
      onDraftChange({
        referenceImageDataUrl: result.data.dataUrl,
        referenceImageFileName: result.data.fileName,
        referenceImageTitle: canvasDraft.referenceImageTitle || result.data.title,
      });
    });

    return () => {
      disposed = true;
    };
  }, [
    canvasDraft.referenceImageDataUrl,
    canvasDraft.referenceImageFileName,
    canvasDraft.referenceImageTitle,
    onDraftChange,
    onNotify,
  ]);

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
    if (canvasDraft.referenceImageDataUrl) {
      setIsReferenceImagePopoverOpen(true);
    }
  }, [canvasDraft.referenceImageDataUrl]);

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
    }
  }, [previewIndex, results.length]);

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

  // 卸载时清理 REVEAL 定时器，避免设置已卸载组件的状态。
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  // 全屏预览键盘导航：← 上一张 / → 下一张 / Esc 关闭。
  useEffect(() => {
    if (previewIndex === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewIndex(null);
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
  }, [previewIndex, results.length]);

  function getFieldText(field: PromptField): string {
    return field === "positive" ? canvasDraft.prompt : canvasDraft.negativePrompt;
  }

  function updateFieldText(field: PromptField, nextText: string, source: ChangeSource): void {
    const currentText = getFieldText(field);
    if (nextText === currentText) {
      return;
    }

    const now = Date.now();
    const lastTyping = lastTypingRef.current;
    const shouldRecord = source === "action" || !lastTyping || lastTyping.field !== field || now - lastTyping.at > typingHistoryWindowMs;
    if (shouldRecord) {
      const history = promptHistoryRef.current[field];
      promptHistoryRef.current[field] = [...history, currentText].slice(-maxPromptHistory);
      setHistoryRevision((revision) => revision + 1);
    }
    lastTypingRef.current = source === "typing" ? { field, at: now } : null;
    onDraftChange(field === "positive" ? { prompt: nextText } : { negativePrompt: nextText });
  }

  function undoFieldChange(field: PromptField): void {
    const history = promptHistoryRef.current[field];
    const previousText = history.at(-1);
    if (previousText === undefined) {
      onNotify({ type: "info", text: field === "positive" ? "正向提示词暂无可返回的上一步。" : "负向提示词暂无可返回的上一步。" });
      return;
    }

    promptHistoryRef.current[field] = history.slice(0, -1);
    lastTypingRef.current = null;
    onDraftChange(field === "positive" ? { prompt: previousText } : { negativePrompt: previousText });
    setHistoryRevision((revision) => revision + 1);
    onNotify({ type: "success", text: "已返回上一步。" });
  }

  async function copyFieldText(field: PromptField): Promise<void> {
    const text = getFieldText(field);
    if (!text) {
      onNotify({ type: "info", text: "文本框为空，没有可复制的内容。" });
      return;
    }

    const result = await window.suyanApi.writeClipboardText(text);
    if (result.ok) {
      onNotify({ type: "success", text: field === "positive" ? "已复制正向提示词。" : "已复制负向提示词。" });
      return;
    }
    onNotify({ type: "error", text: "复制失败，请检查系统剪贴板权限。" });
  }

  async function pasteFieldText(field: PromptField): Promise<void> {
    const result = await window.suyanApi.readClipboardText();
    if (!result.ok) {
      onNotify({ type: "error", text: "读取剪贴板失败，请检查系统剪贴板权限。" });
      return;
    }

    const pastedText = result.data.text;
    if (!pastedText) {
      onNotify({ type: "info", text: "剪贴板中没有文本内容。" });
      return;
    }

    // 粘贴前先清空当前文本框，避免叠在旧内容后面。
    const textareaRef = field === "positive" ? positivePromptRef : negativePromptRef;
    updateFieldText(field, pastedText, "action");
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pastedText.length, pastedText.length);
    });
    onNotify({ type: "success", text: "已从剪贴板粘贴。" });
  }

  async function optimizeFieldText(field: PromptField): Promise<void> {
    const text = getFieldText(field).trim();
    if (!text) {
      onNotify({ type: "info", text: "请先输入需要优化的提示词。" });
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
        updateFieldText(field, optimizedPrompt.trim(), "action");
      }
    } finally {
      setOptimizingField(null);
    }
  }

  function clearFieldText(field: PromptField): void {
    if (!getFieldText(field)) {
      onNotify({ type: "info", text: "文本框已经是空的。" });
      return;
    }
    updateFieldText(field, "", "action");
    onNotify({ type: "success", text: field === "positive" ? "已清空正向提示词。" : "已清空负向提示词。" });
  }

  function handlePickReferenceImage(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImportingReferenceImage(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      if (!dataUrl) {
        onNotify({ type: "error", text: "读取图片失败。" });
        setIsImportingReferenceImage(false);
        return;
      }
      void persistReferenceImage(dataUrl, file.name, "已添加参考图。");
    };
    reader.onerror = () => {
      setIsImportingReferenceImage(false);
      onNotify({ type: "error", text: "读取图片失败。" });
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function handlePasteReferenceImage(): Promise<void> {
    setIsImportingReferenceImage(true);
    try {
      const result = await window.suyanApi.readClipboardImage();
      if (!result.ok) {
        onNotify({ type: "error", text: "剪切板中没有可用图片。" });
        return;
      }
      await persistReferenceImage(
        result.data.dataUrl,
        "剪贴板图片.png",
        "已从剪贴板添加参考图。",
        false,
      );
    } finally {
      setIsImportingReferenceImage(false);
    }
  }

  function handleRemoveReferenceImage(): void {
    const fileName = canvasDraft.referenceImageFileName;
    onDraftChange({ referenceImageDataUrl: "", referenceImageFileName: "", referenceImageTitle: "" });
    setIsReferenceImagePopoverOpen(false);
    if (fileName) {
      void window.suyanApi.removeCanvasReferenceImage(fileName);
    }
    onNotify({ type: "info", text: "已移除参考图。" });
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
      const result = await window.suyanApi.saveCanvasReferenceImage(
        dataUrl,
        sourceFileName,
        canvasDraft.referenceImageFileName,
      );
      if (!result.ok) {
        onNotify({ type: "error", text: result.error.message });
        return;
      }
      onDraftChange({
        referenceImageDataUrl: result.data.dataUrl,
        referenceImageFileName: result.data.fileName,
        referenceImageTitle: result.data.title,
      });
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
      setErrorText("请先写下你想生成的画面。");
      return;
    }
    if (!isDoubaoWeb && !hasUsableApi) {
      setErrorText("请先在模型配置中启用一个配置，并填写 API Key。");
      onNotify({ type: "error", text: "还没有可用的图像生成配置，请先打开模型配置。" });
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
        setErrorText("请先在画布内完成豆包登录，登录后会自动切回原生画布。");
        onNotify({ type: "info", text: "请先在画布内完成豆包登录。" });
        return;
      }
    }

    // 阶段一：THINKING —— 立即开始真实请求，同时短播「理解你的想法」，二者并行，
    // 不再把 1600ms 延迟串行叠加到总耗时上。上一批会话预览保留到新结果成功就位；
    // 新请求失败时不会清空旧预览，避免一次失败就丢掉上一批可见的成果。
    setErrorText("");
    setThinkingKeywords(extractPromptKeywords(cleanPrompt));
    generationStartedAtRef.current = performance.now();
    setGenerationElapsedMs(null);
    setPhase("thinking");
    setIsGenerating(true);
    void runGeneration(cleanPrompt);
  }

  async function runGeneration(cleanPrompt: string) {
    // 阶段二：GENERATING —— 真实调用 onGenerate / onImportGeneratedImages。
    // 请求在最短 thinking 展示的同时发起；标题直接使用本次提示词，不再额外调用文本模型。
    setPhase("generating");
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
        prompt: cleanPrompt,
        negativePrompt: effectiveNegativePrompt,
      }));
      if (!data) {
        // 用户主动取消或调用方提前返回空：保留旧预览，不强行清空成空态。
        setPhase(results.length > 0 ? "created" : "empty");
        return;
      }
      if (data.images.length === 0) {
        setErrorText("接口没有返回可保存的图片，请检查模型和接口地址。");
        // 接口返回但无图：这种是配置/接口问题，清成空态更明确；旧预览保留意义不大。
        setPhase("empty");
        return;
      }

      const previewResults: CanvasGenerationResult[] = data.images.map((image) => ({ ...image, saved: false }));
      onLastGenerationModelChange(data.model);
      onGenerationResultsChange(previewResults);
      // 阶段三：REVEAL —— 结果就位后播 ~500ms 揭示动画，随后进入 CREATED。
      setPhase("reveal");
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
      revealTimerRef.current = setTimeout(() => setPhase("created"), revealPhaseMs);
      // 自动收录为素材：默认关闭，用户在画布顶部手动开启后才走入库链路。
      // 关闭时结果只在画布预览（导出/复制走 dataUrl 无需 imageFileName），不再自动落盘。
      if (!canvasDraft.autoArchiveEnabled) {
        return;
      }
      setIsArchivingBatch(true);
      const savedItems = await onImportGeneratedImages(data.images, {
        title: cleanPrompt,
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
      if (savedItems.length === data.images.length) {
        onGenerationResultsChange(
          previewResults.map((result, index) => ({
            ...result,
            imageFileName: savedItems[index]?.imageFileName,
            saved: true,
          })),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成图片失败，请稍后重试。";
      setErrorText(message);
      onNotify({ type: "error", text: message });
      // 新请求失败：保留上一批可见的预览结果，而不是清成空态；
      // 用户可基于上一批重新调整提示词后重试，不会一次失败就丢成果。
      setPhase(results.length > 0 ? "created" : "empty");
    } finally {
      setIsGenerating(false);
      setIsArchivingBatch(false);
      const startedAt = generationStartedAtRef.current;
      if (startedAt !== null) {
        setGenerationElapsedMs(Math.max(0, performance.now() - startedAt));
        generationStartedAtRef.current = null;
      }
    }
  }

  function handleDownloadResult(result: CanvasGenerationResult, index: number): void {
    try {
      const link = document.createElement("a");
      link.href = result.dataUrl;
      const ext = /^data:image\/(\w+)/.exec(result.dataUrl)?.[1] ?? "png";
      link.download = `suyan-canvas-${Date.now()}-${index + 1}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      onNotify({ type: "success", text: "已开始下载。" });
    } catch {
      onNotify({ type: "error", text: "下载失败，图片已自动保存到素材库。" });
    }
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
      onNotify({ type: "info", text: "这张图已收录到素材库。" });
      return;
    }
    if (archivingIndex === index) {
      return;
    }
    setArchivingIndex(index);
    try {
      const cleanPrompt = canvasDraft.prompt.trim();
      const effectiveNegativePrompt = canvasDraft.negativePrompt.trim();
      const origin = canvasDraft.promptOrigin;
      const inheritsOrigin = shouldInheritCanvasPromptOrigin(origin, cleanPrompt, effectiveNegativePrompt);
      // 单张收录：只把这一张图交给入库链路，savedItems 期望返回 1 条。
      const savedItems = await onImportGeneratedImages(
        [{ dataUrl: result.dataUrl, revisedPrompt: result.revisedPrompt }],
        {
          title: cleanPrompt,
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
        // 回填这一张：其它结果保持不变。
        onGenerationResultsChange(
          results.map((existing, existingIndex) =>
            existingIndex === index
              ? { ...existing, imageFileName: savedItem.imageFileName, saved: true }
              : existing,
          ),
        );
        onNotify({ type: "success", text: "已收录到素材库。" });
      } else {
        onNotify({ type: "error", text: "收录失败，请稍后重试。" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "收录失败，请稍后重试。";
      onNotify({ type: "error", text: message });
    } finally {
      setArchivingIndex(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-[min(100%,1400px)] px-3 py-4 min-[640px]:px-5 min-[900px]:px-6 min-[1024px]:px-8 min-[1440px]:px-10 min-[1024px]:py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles size={14} />
            AI 创意画布
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">把灵感变成画面</h1>
          <p className="mt-1 text-sm text-muted">
            {isDoubaoWeb
              ? canvasDraft.autoArchiveEnabled
                ? "在画布内使用豆包网页生成图片，结果会自动归档到素材库。"
                : "在画布内使用豆包网页生成图片；开启右侧「收录素材」后结果才归档入库。"
              : canvasDraft.autoArchiveEnabled
                ? "使用你自己的 OpenAI 兼容 API 生成图片，结果会自动归档到素材库。"
                : "使用你自己的 OpenAI 兼容 API 生成图片；开启右侧「收录素材」后结果才归档入库。"}
          </p>
        </div>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="self-start rounded-3xl border border-border bg-panel p-4 shadow-sm min-[640px]:p-5" ref={creationPanelRef}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">创作</h2>
              <p className="mt-1 text-xs text-muted">描述你想要的画面，内容会自动记忆。</p>
            </div>
            <WandSparkles className="text-primary" size={20} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-muted" htmlFor="canvas-prompt">提示词</label>
            <button
              aria-expanded={!canvasDraft.positivePromptHidden}
              aria-label={canvasDraft.positivePromptHidden ? "显示正向提示词" : "隐藏正向提示词"}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => onDraftChange({ positivePromptHidden: !canvasDraft.positivePromptHidden })}
              type="button"
            >
              {canvasDraft.positivePromptHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>

          {!canvasDraft.positivePromptHidden ? (
            <PromptTextField
              field="positive"
              label=""
              placeholder="描述主体、场景、光线、镜头和风格…"
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
              onPaste={() => void pasteFieldText("positive")}
              onUndo={() => undoFieldChange("positive")}
              actionRows={
                <div className="mt-2 flex items-stretch gap-1.5" aria-label="提示词操作">
                  <button
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2 text-xs font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={optimizingField !== null}
                    onClick={() => void optimizeFieldText("positive")}
                    type="button"
                  >
                    {optimizingField === "positive" ? <LoaderCircle className="animate-spin" size={14} /> : <WandSparkles size={14} />}
                    {optimizingField === "positive" ? "优化中…" : "优化提示词"}
                  </button>
                  <button
                    aria-expanded={isReferenceImagePopoverOpen}
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 text-xs font-medium text-foreground transition hover:border-primary/45 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    onClick={() => setIsReferenceImagePopoverOpen((open) => !open)}
                    type="button"
                  >
                    <ImagePlus size={14} />
                    添加参考图
                  </button>
                  <div className="relative" ref={moreMenuRef}>
                    <button
                      aria-expanded={isMoreMenuOpen}
                      aria-label="更多提示词操作"
                      className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-muted transition hover:border-primary/45 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      data-more-menu-toggle="true"
                      onClick={() => setIsMoreMenuOpen((open) => !open)}
                      type="button"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {isMoreMenuOpen ? (
                      <div className="absolute bottom-full right-0 z-30 mb-2 w-36 overflow-hidden rounded-xl border border-border bg-panel p-1 shadow-elevated">
                        <PromptMoreMenuItem icon={<Copy size={14} />} label="复制" onClick={() => { setIsMoreMenuOpen(false); void copyFieldText("positive"); }} />
                        <PromptMoreMenuItem icon={<ClipboardPaste size={14} />} label="粘贴" onClick={() => { setIsMoreMenuOpen(false); void pasteFieldText("positive"); }} />
                        <PromptMoreMenuItem disabled={!promptHistoryRef.current.positive.length} icon={<Undo2 size={14} />} label="撤销" onClick={() => { setIsMoreMenuOpen(false); undoFieldChange("positive"); }} />
                        <PromptMoreMenuItem icon={<Trash2 size={14} />} label="清空" onClick={() => { setIsMoreMenuOpen(false); clearFieldText("positive"); }} tone="danger" />
                      </div>
                    ) : null}
                  </div>
                </div>
              }
              floatingOverlay={
                <>
                  {canvasDraft.referenceImageDataUrl ? (
                    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-end">
                      <div className="pointer-events-auto relative overflow-hidden rounded-lg border border-border/80 bg-background/95 shadow-lg backdrop-blur-sm">
                        <img
                          alt={canvasDraft.referenceImageTitle || "参考图"}
                          className="max-h-20 w-auto max-w-[120px] object-contain"
                          src={canvasDraft.referenceImageDataUrl}
                        />
                        <button
                          aria-label="移除参考图"
                          className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-muted shadow-sm transition hover:text-danger"
                          onClick={handleRemoveReferenceImage}
                          type="button"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {isReferenceImagePopoverOpen ? (
                    <CanvasReferenceImagePopover
                      innerRef={referenceImagePopoverRef}
                      isImporting={isImportingReferenceImage}
                      referenceImageDataUrl={canvasDraft.referenceImageDataUrl}
                      referenceImageTitle={canvasDraft.referenceImageTitle}
                      onClose={() => setIsReferenceImagePopoverOpen(false)}
                      onImportFromClipboard={() => void handlePasteReferenceImage()}
                      onImportFromLocal={() => referenceImageFileRef.current?.click()}
                      onRemove={handleRemoveReferenceImage}
                    />
                  ) : null}
                </>
              }
            />
          ) : null}
          <input
            accept="image/*"
            className="hidden"
            onChange={handlePickReferenceImage}
            ref={referenceImageFileRef}
            type="file"
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-muted" htmlFor="canvas-negative-prompt">负向提示词（可选）</label>
            <button
              aria-expanded={!canvasDraft.negativePromptHidden}
              aria-label={canvasDraft.negativePromptHidden ? "显示负向提示词" : "隐藏负向提示词"}
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
              placeholder="不希望出现的内容…"
              textareaRef={negativePromptRef}
              value={canvasDraft.negativePrompt}
              canUndo={promptHistoryRef.current.negative.length > 0}
                isOptimizing={optimizingField === "negative"}
              disabled={isBusy || optimizingField !== null}
              onChange={(value) => updateFieldText("negative", value, "typing")}
              onClear={() => clearFieldText("negative")}
              onCopy={() => void copyFieldText("negative")}
              onOptimize={() => void optimizeFieldText("negative")}
              onPaste={() => void pasteFieldText("negative")}
              onUndo={() => undoFieldChange("negative")}
            />
          ) : null}

          <CanvasSizePanel
            canvasDraft={canvasDraft}
            onDraftChange={onDraftChange}
            hidden={canvasDraft.sizePanelHidden}
            onToggleHidden={() => onDraftChange({ sizePanelHidden: !canvasDraft.sizePanelHidden })}
          />

          <CanvasAdvancedPanel
            canvasDraft={canvasDraft}
            hidden={!canvasDraft.advancedSettingsOpen}
            onDraftChange={onDraftChange}
            onToggleHidden={() => onDraftChange({ advancedSettingsOpen: !canvasDraft.advancedSettingsOpen })}
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

          <div className="relative mt-4" ref={configMenuRef}>
            <button
              aria-expanded={isConfigMenuOpen}
              className="w-full rounded-2xl border border-border/80 bg-background/70 p-3 text-left text-xs text-muted transition hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              onClick={() => setIsConfigMenuOpen((open) => !open)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span>当前配置</span>
                <span className="flex items-center gap-1.5">
                  <span className={hasUsableApi ? "text-success" : "text-danger"}>
                    {hasUsableApi ? "可用" : "待配置"}
                  </span>
                  <ChevronDown className={`transition-transform ${isConfigMenuOpen ? "rotate-180" : ""}`} size={14} />
                </span>
              </div>
              <div className="mt-2 truncate text-foreground">
                {`${activeProfile?.name ?? "未选择配置"} · ${selectedModel || "未选择模型"}`}
              </div>
            </button>

            {isConfigMenuOpen ? (
              <div className="absolute inset-x-0 bottom-full z-30 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-panel p-2 shadow-elevated">
                <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted">画布默认模型</p>
                {(() => {
                  const imageGenerationProfiles = aiSettings.profiles
                    .filter((profile) => profile.enabled)
                    .map((profile) => ({
                      profile,
                      models: (profile.models.length > 0
                        ? profile.models
                        : [{ id: profile.model, label: profile.model, capabilities: [] as AiProviderModelCapability[] }]
                      ).filter((model) => model.capabilities.includes("image-generation")),
                    }))
                    .filter((entry) => entry.models.length > 0);

                  if (imageGenerationProfiles.length === 0) {
                    return (
                      <p className="px-2 py-3 text-xs text-muted">
                        暂无生图模型，请在模型配置中为模型勾选「生图模型」能力。
                      </p>
                    );
                  }

                  return imageGenerationProfiles.map(({ profile, models }) => (
                    <div key={profile.id}>
                      <p className="px-2 pb-1 pt-2 text-xs font-semibold text-foreground">{profile.name}</p>
                      {models.map((model) => {
                        const isSelected = profile.id === activeProfile?.id && model.id === selectedModel;
                        return (
                          <button
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-primary/5 ${isSelected ? "bg-primary/10 text-primary" : "text-foreground"}`}
                            key={model.id}
                            onClick={() => {
                              onDraftChange({ generationProvider: "api" });
                              void onSaveAiActionModelPreference("image-generation", { profileId: profile.id, modelId: model.id });
                              setIsConfigMenuOpen(false);
                            }}
                            type="button"
                          >
                            <span className="truncate">{model.label || model.id}</span>
                            {isSelected ? <Check size={14} /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ));
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
                    打开完整模型配置
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {errorText ? <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">{errorText}</p> : null}

          <div className="mt-4 flex items-center gap-2">
            <button
              aria-checked={canvasDraft.autoArchiveEnabled}
              aria-label={canvasDraft.autoArchiveEnabled ? "关闭：生成后自动收录到素材库" : "开启：生成后自动收录到素材库"}
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                canvasDraft.autoArchiveEnabled
                  ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-muted hover:border-primary/40 hover:text-foreground"
              }`}
              onClick={() => onDraftChange({ autoArchiveEnabled: !canvasDraft.autoArchiveEnabled })}
              role="switch"
              title={canvasDraft.autoArchiveEnabled ? "已开启：生成结果自动收录到素材库" : "点击开启：生成结果自动收录到素材库（关闭则仅预览，不落盘）"}
              type="button"
            >
              {canvasDraft.autoArchiveEnabled ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
            <button
              aria-checked={canvasDraft.notificationEnabled}
              aria-label={canvasDraft.notificationEnabled ? "关闭完成提醒" : "开启完成提醒"}
              className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                canvasDraft.notificationEnabled
                  ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-background text-muted hover:border-primary/40 hover:text-foreground"
              }`}
              onClick={() => onDraftChange({ notificationEnabled: !canvasDraft.notificationEnabled })}
              role="switch"
              title={canvasDraft.notificationEnabled ? "已开启：生成完成或失败后通知手机" : "点击开启：生成完成或失败后通知手机（需 TapRelay 服务在 1122 端口运行）"}
              type="button"
            >
              {canvasDraft.notificationEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <Button
              className="flex-1"
              disabled={isGenerating || isBusy || optimizingField !== null}
              icon={isGenerating ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />}
              onClick={() => void handleGenerate()}
              variant="primary"
            >
              {phase === "thinking" ? "理解中…" : phase === "generating" ? "创作中…" : results.length > 0 ? "重新生成" : "生成图像"}
            </Button>
          </div>
        </div>

        <CreativeCanvas
          webCanvasEnabled={isDoubaoWeb}
          webCanvasLoginVisible={doubaoLoginVisible}
          webCanvasLoading={isDoubaoWeb && doubaoStage === "loading"}
          webCanvasHostRef={doubaoWebCanvasHostRef}
          phase={phase}
          lastModel={lastModel}
          results={results}
          thinkingKeywords={thinkingKeywords}
          blurPreviewSrc={canvasDraft.referenceImageDataUrl}
          generationElapsedMs={generationElapsedMs}
          lockedHeight={creationPanelHeight}
          onOpenPreview={(index) => setPreviewIndex(index)}
          onDownload={handleDownloadResult}
          onCopyImage={onCopyImage}
          onArchive={handleArchiveResult}
          archivingIndex={archivingIndex}
          archivingBatch={isArchivingBatch}
        />
      </div>

      {previewIndex !== null && results[previewIndex] ? (
        <CanvasFullscreenPreview
          result={results[previewIndex]}
          index={previewIndex}
          total={results.length}
          lastModel={lastModel}
          onPrev={() => setPreviewIndex((i) => (i === null ? i : (i - 1 + results.length) % results.length))}
          onNext={() => setPreviewIndex((i) => (i === null ? i : (i + 1) % results.length))}
          onClose={() => setPreviewIndex(null)}
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
  referenceImageDataUrl: string;
  referenceImageTitle: string;
  onClose: () => void;
  onImportFromClipboard: () => void;
  onImportFromLocal: () => void;
  onRemove: () => void;
};

function CanvasReferenceImagePopover({
  innerRef,
  isImporting,
  referenceImageDataUrl,
  referenceImageTitle,
  onClose,
  onImportFromClipboard,
  onImportFromLocal,
  onRemove,
}: CanvasReferenceImagePopoverProps) {
  return (
    <div
      ref={innerRef}
      className="absolute bottom-2 right-2 z-20 flex w-80 flex-col gap-3 rounded-xl border border-border bg-panel p-3 shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ImagePlus size={14} />
          参考图
        </span>
        <button
          aria-label="关闭"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      {referenceImageDataUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-border bg-background/60 p-1">
          <img
            alt={referenceImageTitle || "参考图"}
            className="max-h-40 w-full rounded-md object-contain"
            decoding="async"
            src={referenceImageDataUrl}
          />
          <button
            aria-label="删除参考图"
            className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-background/90 text-muted shadow-sm transition hover:text-danger"
            type="button"
            onClick={onRemove}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-5 text-center text-xs text-muted">
          还没有参考图，可从剪贴板或本地文件添加。
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
          {isImporting ? "导入中..." : "粘贴剪贴板"}
        </button>
        <button
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-strong disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isImporting}
          type="button"
          onClick={onImportFromLocal}
        >
          <ImagePlus size={13} />
          {isImporting ? "导入中..." : "本地上传"}
        </button>
      </div>
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
  onPaste: () => void;
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
  onPaste,
  onUndo,
  actionRows,
  floatingOverlay,
  extraActions,
  height,
  iconOnlyActions = false,
  onHeightChange,
}: PromptTextFieldProps) {
  const textareaId = field === "positive" ? "canvas-prompt" : "canvas-negative-prompt";
  return (
    <div className={label ? "" : "mt-2"}>
      {label ? <label className="mb-2 block text-xs font-medium text-muted" htmlFor={textareaId}>{label}</label> : null}
      <div className="relative">
        <textarea
          className={`${field === "positive" ? "min-h-48" : "min-h-20"} w-full resize-y rounded-2xl border border-border bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20`}
          id={textareaId}
          onChange={(event) => onChange(event.target.value)}
           onPointerUp={(event) => onHeightChange?.(Math.round(event.currentTarget.getBoundingClientRect().height))}
          placeholder={placeholder}
          ref={textareaRef}
          value={value}
           style={height === undefined ? undefined : { height: `${height}px` }}
        />
        {floatingOverlay}
      </div>
      {actionRows ?? (
        <div className="mt-2 grid grid-cols-5 gap-1.5" aria-label={`${label || "负向提示词"}操作`}>
          <PromptActionButton icon={<Copy size={14} />} iconOnly={iconOnlyActions} label="复制" onClick={onCopy} />
          <PromptActionButton icon={<ClipboardPaste size={14} />} iconOnly={iconOnlyActions} label="粘贴" onClick={onPaste} />
          <PromptActionButton disabled={disabled} icon={isOptimizing ? <LoaderCircle className="animate-spin" size={14} /> : <WandSparkles size={14} />} iconOnly={iconOnlyActions} label={isOptimizing ? "优化中" : "优化"} onClick={onOptimize} />
          <PromptActionButton disabled={!canUndo} icon={<Undo2 size={14} />} iconOnly={iconOnlyActions} label="返回" onClick={onUndo} />
          <PromptActionButton icon={<Trash2 size={14} />} iconOnly={iconOnlyActions} label="清空" onClick={onClear} tone="danger" />
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
  return (
    <button
      aria-label={label === "返回" ? "撤销最近一次更改" : label}
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
      title={label === "返回" ? "撤销最近一次更改" : label}
      type="button"
    >
      <span className="shrink-0">{icon}</span>
      <span className={iconOnly ? "sr-only" : "truncate"}>{label}</span>
    </button>
  );
}

type CanvasSizePanelProps = {
  canvasDraft: CanvasDraftSettings;
  hidden: boolean;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
  onToggleHidden: () => void;
};

function CanvasSizePanel({ canvasDraft, hidden, onDraftChange, onToggleHidden }: CanvasSizePanelProps) {
  const resolvedSizeLabel = getCanvasGenerationSizeLabel(resolveCanvasGenerationSize(canvasDraft));

  return (
    <section className="mt-5 border-t border-border/70 pt-4" aria-labelledby="canvas-size-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-xs font-semibold text-foreground" id="canvas-size-heading">比例</h3>
            <span className="text-[11px] font-medium tabular-nums text-primary">{resolvedSizeLabel}</span>
          </div>
          <p className="mt-1 text-xs text-muted">所选比例会换算为上方显示的实际请求像素。</p>
        </div>
        <button
          aria-expanded={!hidden}
          aria-label={hidden ? "显示尺寸设置" : "隐藏尺寸设置"}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onToggleHidden}
          type="button"
        >
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      {hidden ? null : (
        <>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
            {sizeModeOptions.map((option) => (
              <button
                className={`min-h-8 rounded-lg px-2 text-xs font-medium transition ${canvasDraft.sizeMode === option.value ? "bg-panel text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                key={option.value}
                onClick={() => onDraftChange({ sizeMode: option.value })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          {canvasDraft.sizeMode !== "auto" ? (
            <>
              {canvasDraft.sizeMode === "ratio" ? (
                <>
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted">基准分辨率</p>
                    <div className="grid grid-cols-3 gap-2">
                      {baseResolutionOptions.map((option) => (
                        <ResolutionButton
                          active={canvasDraft.baseResolution === option.value}
                          key={option.value}
                          label={option.label}
                          onClick={() => onDraftChange({ baseResolution: option.value })}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-muted">图像比例</p>
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
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted">自定义宽高</p>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <DimensionInput label="宽度" value={canvasDraft.customWidth} onChange={(customWidth) => onDraftChange({ customWidth })} />
                    <span className="pb-2.5 text-xs text-muted">×</span>
                    <DimensionInput label="高度" value={canvasDraft.customHeight} onChange={(customHeight) => onDraftChange({ customHeight })} />
                  </div>
                </div>
              )}
            </>
          ) : null}

        </>
      )}
    </section>
  );
}

type CanvasAdvancedPanelProps = {
  canvasDraft: CanvasDraftSettings;
  hidden: boolean;
  onDraftChange: (patch: Partial<CanvasDraftSettings>) => void;
  onToggleHidden: () => void;
};

function CanvasAdvancedPanel({ canvasDraft, hidden, onDraftChange, onToggleHidden }: CanvasAdvancedPanelProps) {
  return (
    <section className="mt-4 border-t border-border/70 pt-4" aria-labelledby="canvas-advanced-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground" id="canvas-advanced-heading">
            <SlidersHorizontal size={13} />
            高级设置
          </h3>
          <p className="mt-1 text-xs text-muted">控制输出背景、质量、格式与张数。</p>
        </div>
        <button
          aria-expanded={!hidden}
          aria-label={hidden ? "显示高级设置" : "隐藏高级设置"}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          onClick={onToggleHidden}
          type="button"
        >
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>

      {hidden ? null : (
        <div className="grid grid-cols-2 gap-3">
          <CanvasSelect
            label="透明背景"
            onChange={(value) => onDraftChange({
              transparentBackground: value === "on",
              outputFormat: value === "on" && canvasDraft.outputFormat === "jpeg" ? "png" : canvasDraft.outputFormat,
            })}
            options={[
              { value: "off", label: "不透明" },
              { value: "on", label: "透明" },
            ]}
            value={canvasDraft.transparentBackground ? "on" : "off"}
          />
          <CanvasSelect label="质量" onChange={(value) => onDraftChange({ quality: value as AiImageGenerationQuality })} options={qualityOptions} value={canvasDraft.quality} />
          <CanvasSelect
            label="格式"
            onChange={(value) => onDraftChange({ outputFormat: value as AiImageGenerationFormat })}
            options={formatOptions.map((option) => ({ ...option, disabled: canvasDraft.transparentBackground && option.value === "jpeg" }))}
            value={canvasDraft.outputFormat}
          />
          <label className="grid gap-1.5 text-xs font-medium text-muted">
            张数
            <select
              className="h-10 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => onDraftChange({ count: Number(event.target.value) })}
              value={canvasDraft.count}
            >
              {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function ResolutionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-10 rounded-xl border text-sm font-medium transition ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted hover:border-primary/45 hover:text-foreground"}`}
      onClick={onClick}
      title={`${label} 基准分辨率`}
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
  results: CanvasGenerationResult[];
  thinkingKeywords: string[];
  blurPreviewSrc: string;
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
  const modelLabel = doubaoModelOptions.find((option) => option.value === model)?.label ?? "跟随网页默认";
  const styleLabel = doubaoStyleOptions.find((option) => option.value === style)?.label ?? "跟随网页默认";

  return (
    <section className="mt-5 space-y-4 border-t border-border/70 pt-4" aria-labelledby="canvas-doubao-heading">
      <h3 className="sr-only" id="canvas-doubao-heading">豆包模型与风格</h3>

      <DoubaoOptionCard
        title="豆包模型"
        currentValue={modelLabel}
        hidden={modelHidden}
        onToggleHidden={onToggleModelHidden}
        options={doubaoModelOptions}
        value={model}
        onChange={onModelChange}
        showEyeLabel={modelHidden ? "显示模型选项" : "隐藏模型选项"}
      />

      <DoubaoOptionCard
        title="豆包风格"
        currentValue={styleLabel}
        hidden={styleHidden}
        onToggleHidden={onToggleStyleHidden}
        options={doubaoStyleOptions}
        value={style}
        onChange={onStyleChange}
        showEyeLabel={styleHidden ? "显示风格选项" : "隐藏风格选项"}
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
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreativeCanvas({
  webCanvasEnabled,
  webCanvasLoginVisible,
  webCanvasLoading,
  webCanvasHostRef,
  phase,
  lastModel,
  results,
  thinkingKeywords,
  blurPreviewSrc,
  generationElapsedMs,
  lockedHeight,
  onOpenPreview,
  onDownload,
  onCopyImage,
  onArchive,
  archivingIndex,
  archivingBatch,
}: CreativeCanvasProps) {
  const isBusyPhase = phase === "thinking" || phase === "generating";
  const subtitle = webCanvasLoginVisible
    ? "请在下方完成豆包登录，登录后会自动切回画布"
    : webCanvasLoading
      ? "正在连接豆包网页画布…"
      : phase === "thinking"
        ? "正在理解你的想法…"
        : phase === "generating"
          ? webCanvasEnabled
            ? "豆包正在后台生成…"
            : "AI 正在创作中…"
          : results.length > 0
            ? lastModel
              ? `模型：${lastModel}`
              : `已生成 ${results.length} 张`
            : webCanvasEnabled
              ? "豆包已就绪 · 作品会出现在这里"
              : "作品会出现在这里";

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-panel/70 p-4 shadow-sm min-[640px]:p-5"
      style={lockedHeight !== null ? { height: `${lockedHeight}px` } : undefined}
    >
      <div className="relative z-10 mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">创意画布</h2>
          <p className="mt-1 text-xs text-muted">{subtitle}</p>
        </div>
        {results.length > 0 && !isBusyPhase ? (
          <div className="flex items-center gap-2 text-xs">
            {generationElapsedMs !== null ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 tabular-nums text-primary">
                用时 {formatElapsedDuration(generationElapsedMs)}
              </span>
            ) : null}
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">已生成 {results.length} 张</span>
          </div>
        ) : null}
      </div>

      {/* flex 容器：让各状态分支的 flex-1 生效，避免生成中/空态只占 min-h 而在面板底部留白。 */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {webCanvasLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-border/70 bg-background/50 text-xs text-muted">
            正在连接豆包网页画布…
          </div>
        ) : isBusyPhase ? (
          <CanvasGeneratingStage phase={phase} keywords={thinkingKeywords} blurPreviewSrc={blurPreviewSrc} />
        ) : results.length === 0 ? (
          <CanvasEmptyStage />
        ) : (
          <CanvasResultStage
             results={results}
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
            aria-label="豆包网页画布"
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-2xl"
          >
            {webCanvasLoginVisible ? (
              <div className="flex h-full items-center justify-center text-xs text-muted pointer-events-none">
                正在加载豆包登录…
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CanvasEmptyStage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-panel/60 to-background/40 px-6 py-8 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles size={28} />
      </div>
      <h3 className="font-medium text-foreground">想创作点什么？</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">写一句画面描述，或添加一张参考图，用你自己的 API 生成第一张作品。结果会保留原图顺序，并自动归档到素材库。</p>
    </div>
  );
}

const generatingSubsteps = ["解析画面结构…", "勾勒主体与光线…", "精修细节…", "合成中…"] as const;

type CanvasMotionStyle = CSSProperties & {
  "--canvas-ambient-delay": string;
  "--canvas-breathe-delay": string;
  "--canvas-dot-delay": string;
  "--canvas-prism-delay": string;
  "--canvas-aurora-delay": string;
  "--canvas-flare-delay": string;
};

function randomPhaseDelay(periodSeconds: number): string {
  return `-${(Math.random() * periodSeconds).toFixed(2)}s`;
}

function CanvasMotionBackdrop({
  blurPreviewSrc,
  className,
  children,
}: {
  blurPreviewSrc: string;
  className?: string;
  children: ReactNode;
}) {
  const [motionStyle] = useState<CanvasMotionStyle>(() => ({
    "--canvas-ambient-delay": randomPhaseDelay(28),
    "--canvas-breathe-delay": randomPhaseDelay(21),
    "--canvas-dot-delay": randomPhaseDelay(42),
    "--canvas-prism-delay": randomPhaseDelay(19),
    "--canvas-aurora-delay": randomPhaseDelay(37),
    "--canvas-flare-delay": randomPhaseDelay(29),
  }));

  return (
    <div className={`canvas-glass ${className ?? ""}`} style={motionStyle}>
      <div className="canvas-ambient-glow" aria-hidden="true" />
      {blurPreviewSrc ? <img className="canvas-blur-preview" src={blurPreviewSrc} alt="" aria-hidden="true" /> : null}
      <div className="canvas-dot-field" aria-hidden="true" />
      <div className="canvas-prism-sweep" aria-hidden="true" />
      <div className="canvas-glass-shine" aria-hidden="true" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function CanvasGeneratingStage({
  phase,
  keywords,
  blurPreviewSrc,
}: {
  phase: CanvasPhase;
  keywords: string[];
  blurPreviewSrc: string;
}) {
  const isThinking = phase === "thinking";
  const [substepIndex, setSubstepIndex] = useState(0);

  useEffect(() => {
    if (isThinking) {
      return;
    }
    const timer = setInterval(() => {
      setSubstepIndex((index) => (index + 1) % generatingSubsteps.length);
    }, 1400);
    return () => clearInterval(timer);
  }, [isThinking]);

  return (
    <CanvasMotionBackdrop blurPreviewSrc={blurPreviewSrc} className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="canvas-status-card relative z-10 flex w-full max-w-xs flex-col items-center gap-3 px-6 py-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            {isThinking ? <Brain size={24} /> : <Sparkles size={24} />}
          </div>
          <div>
            <h3 className="font-medium text-foreground">{isThinking ? "正在理解你的想法" : "正在创作"}</h3>
            <p className="mt-1 text-xs text-muted">{isThinking ? "整理你的描述，规划画面…" : generatingSubsteps[substepIndex]}</p>
          </div>
          <div className="relative h-1 w-40 overflow-hidden rounded-full bg-border/70">
            <span className="canvas-progress-indeterminate absolute inset-y-0 left-0 block bg-primary" />
          </div>
          {keywords.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              {keywords.map((keyword, index) => (
                <span
                  key={`${keyword}-${index}`}
                  className="canvas-prompt-tag px-2.5 py-1 text-[11px] leading-none"
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  {keyword}
                </span>
              ))}
            </div>
          ) : null}
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
  reveal,
  onOpenPreview,
  onDownload,
  onCopyImage,
  onArchive,
  archivingIndex,
  archivingBatch,
}: {
  results: CanvasGenerationResult[];
  reveal: boolean;
  onOpenPreview: (index: number) => void;
  onDownload: (result: CanvasGenerationResult, index: number) => void;
  onCopyImage: (imageFileName: string) => Promise<void>;
  onArchive: (result: CanvasGenerationResult, index: number) => void | Promise<void>;
  archivingIndex: number | null;
  archivingBatch: boolean;
}) {
  const total = results.length;
  const [activeIndex, setActiveIndex] = useState(0);

  // 新一批结果就位（数量变化）后回到第一张，并兜住越界索引。
  useEffect(() => {
    setActiveIndex((index) => (index < total ? index : 0));
  }, [total]);

  const safeIndex = activeIndex < total ? activeIndex : 0;
  const active = results[safeIndex];
  if (!active) {
    return null;
  }

  const goPrev = () => setActiveIndex((index) => (index - 1 + total) % total);
  const goNext = () => setActiveIndex((index) => (index + 1) % total);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CanvasMotionBackdrop blurPreviewSrc={active.dataUrl} className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="relative flex min-h-0 flex-1 flex-col">
          <CanvasResultCard
            key={`${active.dataUrl.slice(0, 32)}-${safeIndex}`}
            result={active}
            index={safeIndex}
            reveal={reveal}
            onOpen={() => onOpenPreview(safeIndex)}
            onDownload={() => onDownload(active, safeIndex)}
            onCopy={() => {
              if (active.imageFileName) {
                void onCopyImage(active.imageFileName);
              }
            }}
            onArchive={() => void onArchive(active, safeIndex)}
            archiving={archivingIndex === safeIndex}
            archivingBatch={archivingBatch}
          />

          {total > 1 ? (
            <>
              <button
                aria-label="上一张"
                className="absolute left-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={goPrev}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label="下一张"
                className="absolute right-3 top-1/2 z-10 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-panel/90 text-foreground shadow-sm backdrop-blur transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={goNext}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
              <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-overlay/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary-foreground backdrop-blur">
                {safeIndex + 1} / {total}
              </span>
            </>
          ) : null}
        </div>
      </CanvasMotionBackdrop>

      {total > 1 ? (
        <div className="mt-3 flex shrink-0 items-center justify-center gap-2" aria-label="切换生成结果">
          {results.map((result, index) => (
            <button
              aria-current={index === safeIndex}
              aria-label={`第 ${index + 1} 张`}
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

function CanvasResultCard({
  result,
  index,
  reveal,
  onOpen,
  onDownload,
  onCopy,
  onArchive,
  archiving,
  archivingBatch,
}: {
  result: CanvasGenerationResult;
  index: number;
  reveal: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onArchive: () => void;
  archiving: boolean;
  /** 自动收录整批进行中：仅此期间未落盘的结果才显示「归档中」角标。 */
  archivingBatch: boolean;
}) {
  const archived = result.saved;
  // 判定「正在归档」的准确依据：手动收录这一张(archiving) 或 自动收录整批进行中(archivingBatch)。
  // 不能仅凭 !result.saved —— 自动收录关闭时 results 永远 saved=false，
  // 那样会错误地永久显示「归档中」角标。
  const showArchivingBadge = archiving || (archivingBatch && !archived);
  return (
    <article
      className={`group relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-transparent transition duration-300 hover:shadow-image ${
        reveal ? "canvas-reveal" : ""
      }`}
      onDoubleClick={onOpen}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-transparent">
        <img
          alt={`生成结果 ${index + 1}`}
          className="max-h-full w-auto max-w-full object-contain"
          src={result.dataUrl}
        />
        {showArchivingBadge ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-1 text-[11px] text-muted shadow-sm backdrop-blur">
            <LoaderCircle className="animate-spin" size={11} /> 归档中
          </span>
        ) : null}
        <div className="absolute inset-0 flex items-end justify-center gap-1.5 bg-gradient-to-t from-overlay/75 via-overlay/10 to-transparent p-3 opacity-0 transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <ResultHoverButton icon={<Eye size={13} />} label="大图" onClick={onOpen} />
          <ResultHoverButton icon={<Download size={13} />} label="导出" onClick={onDownload} />
          <ResultHoverButton
            disabled={archived || archiving}
            icon={archiving ? <LoaderCircle className="animate-spin" size={13} /> : archived ? <Check size={13} /> : <Inbox size={13} />}
            label={archived ? "已收录" : "收录"}
            onClick={onArchive}
            title={archived ? "已收录到素材库" : archiving ? "正在收录到素材库…" : "收录到素材库"}
          />
          <ResultHoverButton
            disabled={!result.saved || !result.imageFileName}
            icon={<Copy size={13} />}
            label="复制"
            onClick={onCopy}
            title={result.saved ? "复制图片到系统剪贴板" : result.imageFileName ? "图片归档完成后可复制" : "未收录到素材库，点击「收录」后可复制"}
          />
        </div>
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
      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border bg-panel/70 px-2.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-primary/65 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title ?? label}
      type="button"
    >
      {icon}
      {label}
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
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

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
    const text = result.revisedPrompt?.trim() ?? "";
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-overlay/72 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        aria-label="关闭预览"
        className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-panel/65 text-foreground shadow-lg backdrop-blur transition hover:bg-panel/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
              aria-label="上一张"
              className="absolute left-3 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-panel/55 text-foreground shadow-lg backdrop-blur transition hover:bg-panel/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={onPrev}
              type="button"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              aria-label="下一张"
              className="absolute right-16 top-1/2 z-10 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-panel/55 text-foreground shadow-lg backdrop-blur transition hover:bg-panel/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={onNext}
              type="button"
            >
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}
        <img
          alt={`生成结果 ${index + 1}`}
          className="block h-auto w-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          onLoad={(event) => setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          src={result.dataUrl}
        />
      </div>

      {/* 提示词卡片叠在大图之上，不影响大图布局。 */}
      {promptOpen ? (
        <aside
          className="absolute right-16 top-1/2 z-20 w-[min(23rem,calc(100%-5.5rem))] max-w-md -translate-y-1/2 text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="rounded-2xl border border-border/70 bg-panel/65 p-2.5 shadow-elevated backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted">
              <span>生成结果</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="复制提示词"
                  title={result.revisedPrompt?.trim() ? "复制当前提示词" : "暂无可复制的提示词"}
                  disabled={!result.revisedPrompt?.trim()}
                  onClick={() => void handleCopyPrompt()}
                  className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted opacity-40 transition hover:bg-background/40 hover:text-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:opacity-90 disabled:cursor-not-allowed disabled:opacity-25"
                >
                  {promptCopied ? <Check size={12} /> : <Copy size={12} />}
                  {promptCopied ? "已复制" : "复制"}
                </button>
                <span className="rounded-full bg-background/55 px-2 py-0.5 tabular-nums">{index + 1} / {total}</span>
              </div>
            </div>
            <div
              aria-label="展开的提示词"
              className="mt-2 max-h-[min(52vh,560px)] w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-background/45 px-3 py-2.5 text-xs leading-6 text-muted"
            >
              {result.revisedPrompt?.trim() || "该模型未返回改写后的提示词。"}
            </div>
            <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-background/38 px-3 py-2.5 text-xs text-muted">
              <div className="inline-flex min-w-0 items-center gap-1">
                <dt>模型：</dt>
                <dd className="max-w-40 truncate text-foreground">{lastModel || "未知"}</dd>
              </div>
              {naturalSize ? (
                <div className="inline-flex items-center gap-1">
                  <dt>尺寸：</dt>
                  <dd className="tabular-nums text-foreground">{naturalSize.width} × {naturalSize.height}</dd>
                </div>
              ) : null}
              {generationElapsedMs !== null ? (
                <div className="inline-flex items-center gap-1">
                  <dt>用时：</dt>
                  <dd className="tabular-nums text-foreground">{formatElapsedDuration(generationElapsedMs)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </aside>
      ) : null}

      {/* 操作按钮固定在右侧中部，不随提示词卡片展开而位移；默认半透明，悬停/聚焦时更清晰。 */}
      <div
        aria-label="生成结果操作"
        className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 shrink-0 flex-col gap-1.5 rounded-2xl border border-border/70 bg-panel/40 p-1 shadow-elevated backdrop-blur opacity-45 transition-opacity hover:opacity-100 focus-within:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <CanvasResultActionButton icon={<Download size={18} />} label="导出" onClick={onDownload} />
        <CanvasResultActionButton
          disabled={result.saved || archivingIndex === index}
          icon={archivingIndex === index ? <LoaderCircle className="animate-spin" size={18} /> : result.saved ? <Check size={18} /> : <Inbox size={18} />}
          label={result.saved ? "已收录" : "收录"}
          onClick={() => void onArchive(result, index)}
          title={result.saved ? "已收录到素材库" : archivingIndex === index ? "正在收录到素材库…" : "收录到素材库"}
        />
        <CanvasResultActionButton
          disabled={!result.saved || !result.imageFileName}
          icon={<Copy size={18} />}
          label="复制"
          onClick={() => {
            if (result.imageFileName) {
              void onCopyImage(result.imageFileName);
            }
          }}
          title={result.saved ? "复制图片到系统剪贴板" : result.imageFileName ? "图片归档完成后可复制" : "未收录到素材库，点击「收录」后可复制"}
        />
        <CanvasResultActionButton
          ariaExpanded={promptOpen}
          icon={<Info size={18} />}
          label="查看"
          onClick={() => setPromptOpen((open) => !open)}
          title={promptOpen ? "收起提示词" : "查看提示词"}
        />
      </div>
    </div>
  );
}

function CanvasResultActionButton({
  ariaExpanded,
  disabled = false,
  icon,
  label,
  onClick,
  title,
}: {
  ariaExpanded?: boolean;
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
      onClick={onClick}
      title={title ?? label}
      type="button"
    >
      {icon}
    </button>
  );
}
